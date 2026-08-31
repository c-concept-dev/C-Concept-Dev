"use strict";
/**
 * evidenceforge-llm-proxy — Worker Cloudflare dédié, mode delegated de
 * MONO-08 v0.6 (CDC MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md, section 7).
 *
 * Rôle : relais minimal entre EvidenceForge (mode delegated) et l'API
 * réelle Anthropic. Détient ANTHROPIC_API_KEY côté Cloudflare uniquement ;
 * ne l'expose jamais au client. Le client s'authentifie auprès de CE
 * Worker avec WORKER_API_KEY (jamais avec la clé Anthropic).
 *
 * Découplé de toute autre application : ne dépend d'aucun autre Worker
 * existant (clone-proxy, ocr-universel-proxy, etc. — CDC section 3, 7.1).
 *
 * Ce fichier exporte `handleRequest(request, env)`, la logique pure et
 * testable sans déploiement Cloudflare réel (voir test/worker.test.js), et
 * un export par défaut `{ fetch: handleRequest }` compatible avec le
 * format Worker ES module standard pour un déploiement réel futur (hors
 * périmètre de ce lot — aucun déploiement n'est effectué ici).
 */

const ROUTE_PATH = "/v1/messages";
const DEFAULT_UPSTREAM_BASE = "https://api.anthropic.com";
const DEFAULT_TIMEOUT_MS = 8000;
const ANTHROPIC_VERSION = "2023-06-01";

const CORRELATION_HEADER_PROXY = "X-EvidenceForge-Proxy";
const CORRELATION_HEADER_UPSTREAM = "X-EvidenceForge-Upstream";
const CORRELATION_HEADER_UPSTREAM_STATUS = "X-EvidenceForge-Upstream-Status";
const CORRELATION_HEADER_REQUEST_ID = "X-EvidenceForge-Request-Id";
const CLIENT_REQUEST_ID_HEADER = "x-evidenceforge-request-id";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Repli portable (jamais utilisé dans un vrai runtime Workers, ou Node
  // >=19) — jamais un secret, purement un identifiant de corrélation.
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Log minimal, jamais de secret ni de prompt complet (CDC section 7.9).
 * Champs : timestamp, request-id, status, latency, taille payload.
 */
function logMinimal(env, entry) {
  const logger = typeof env.logger === "function" ? env.logger : console.log;
  try {
    logger(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: entry.requestId,
      event: entry.event,
      status: entry.status != null ? entry.status : null,
      latencyMs: entry.latencyMs != null ? entry.latencyMs : null,
      payloadBytes: entry.payloadBytes != null ? entry.payloadBytes : null,
    }));
  } catch (e) {
    // Le logging ne doit jamais faire échouer la requête.
  }
}

function jsonResponse(status, bodyObj, extraHeaders) {
  const headers = Object.assign({ "content-type": "application/json" }, extraHeaders || {});
  return new Response(JSON.stringify(bodyObj), { status: status, headers: headers });
}

function extractBearerToken(request) {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1] : null;
}

function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isValidMessagesPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (typeof payload.model !== "string" || payload.model.length === 0) return false;
  if (typeof payload.max_tokens !== "number" || !(payload.max_tokens > 0)) return false;
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) return false;
  for (const m of payload.messages) {
    if (!m || typeof m !== "object") return false;
    if (typeof m.role !== "string") return false;
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return false;
  }
  return true;
}

/**
 * Rate limiting côté Worker (CDC section 7.11). `env.RATE_LIMITER` est le
 * binding Cloudflare Rate Limiting réel en production (non déployé par ce
 * lot) ; en test, un objet injecté avec la même forme `{ limit(opts) ->
 * Promise<{success: boolean}> }` est utilisé (voir test/worker.test.js).
 * Clé de limitation : le credential Worker lui-même (haché, jamais en
 * clair dans les logs) — protège spécifiquement contre l'exploitation
 * d'un EVIDENCEFORGE_WORKER_API_KEY compromis (objectif CDC section 7.11).
 */
async function checkRateLimit(env, workerKey) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") {
    // Aucun binding de rate limiting configuré : ne bloque jamais une
    // requête faute de binding (ce serait un déni de service involontaire
    // en environnement de test), mais ce n'est PAS un état de production
    // valide — voir README.md "Déploiement" : le binding est obligatoire
    // avant tout déploiement réel (CDC section 7.11, non optionnel).
    return { limited: false, skippedNoBinding: true };
  }
  const key = "worker-key:" + (await sha256Hex(workerKey || "anonymous"));
  const result = await env.RATE_LIMITER.limit({ key: key });
  return { limited: !result || result.success !== true, skippedNoBinding: false };
}

async function sha256Hex(value) {
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const data = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  // Repli non cryptographique (tests uniquement, jamais en production réelle
  // sans crypto.subtle) — ne sert qu'à répartir des clés de rate limit, pas
  // à protéger un secret.
  let hash = 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) { hash = (hash * 31 + s.charCodeAt(i)) | 0; }
  return "fallback-" + Math.abs(hash).toString(16);
}

/**
 * handleRequest — logique pure, testable sans Cloudflare réel.
 * @param {Request} request
 * @param {object} env - { WORKER_API_KEY, ANTHROPIC_API_KEY, RATE_LIMITER?,
 *   ANTHROPIC_BASE_URL?, TIMEOUT_MS?, fetchImpl?, logger? }
 */
async function handleRequest(request, env) {
  env = env || {};
  const startedAt = Date.now();
  const fetchImpl = typeof env.fetchImpl === "function" ? env.fetchImpl : fetch;
  const upstreamBase = env.ANTHROPIC_BASE_URL || DEFAULT_UPSTREAM_BASE;
  const timeoutMs = typeof env.TIMEOUT_MS === "number" ? env.TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const url = new URL(request.url);
  const clientRequestId = request.headers.get(CLIENT_REQUEST_ID_HEADER);
  const requestId = clientRequestId || newRequestId();

  const baseCorrelationHeaders = {};
  baseCorrelationHeaders[CORRELATION_HEADER_PROXY] = "evidenceforge-llm-proxy";
  baseCorrelationHeaders[CORRELATION_HEADER_REQUEST_ID] = requestId;

  // 1) Route/methode hors contrat -> refus explicite (CDC section 7.2, 7.4.1)
  if (request.method !== "POST" || url.pathname !== ROUTE_PATH) {
    logMinimal(env, { requestId: requestId, event: "route_rejected", status: 404, latencyMs: Date.now() - startedAt });
    return jsonResponse(404, { error: "not_found", message: "Seule la route POST " + ROUTE_PATH + " est supportee." }, baseCorrelationHeaders);
  }

  // 2) Credential Worker (CDC section 7.3, 7.4.1) — jamais ANTHROPIC_API_KEY
  // accepte depuis le client (section 7.4.6).
  const token = extractBearerToken(request);
  const expectedWorkerKey = env.WORKER_API_KEY;
  if (!expectedWorkerKey || !token || !constantTimeEquals(token, expectedWorkerKey)) {
    logMinimal(env, { requestId: requestId, event: "auth_rejected", status: 401, latencyMs: Date.now() - startedAt });
    return jsonResponse(401, { error: "unauthorized", message: "Credential Worker absent ou invalide." }, baseCorrelationHeaders);
  }

  // 3) Rate limiting (CDC section 7.11) — AVANT tout appel upstream.
  const rl = await checkRateLimit(env, token);
  if (rl.limited) {
    logMinimal(env, { requestId: requestId, event: "rate_limited", status: 429, latencyMs: Date.now() - startedAt });
    return jsonResponse(429, { error: "rate_limited", message: "Limite de requetes depassee — reessayer plus tard." }, baseCorrelationHeaders);
  }

  // 4) Validation stricte du payload (CDC section 7.4.2) — AVANT tout appel
  // upstream.
  let payload;
  let rawBody;
  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch (e) {
    logMinimal(env, { requestId: requestId, event: "invalid_json", status: 400, latencyMs: Date.now() - startedAt, payloadBytes: rawBody ? rawBody.length : 0 });
    return jsonResponse(400, { error: "invalid_request", message: "Corps JSON malforme." }, baseCorrelationHeaders);
  }
  if (!isValidMessagesPayload(payload)) {
    logMinimal(env, { requestId: requestId, event: "invalid_payload", status: 400, latencyMs: Date.now() - startedAt, payloadBytes: rawBody.length });
    return jsonResponse(400, { error: "invalid_request", message: "Payload non conforme au contrat Anthropic Messages API (model, max_tokens, messages requis)." }, baseCorrelationHeaders);
  }

  // 5) ANTHROPIC_API_KEY injectee UNIQUEMENT ici, cote Cloudflare (CDC 7.4.3)
  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    // Configuration serveur incomplete (secret Cloudflare manquant) — ne
    // doit jamais se produire en deploiement reel valide ; jamais un faux
    // succes.
    logMinimal(env, { requestId: requestId, event: "upstream_misconfigured", status: 500, latencyMs: Date.now() - startedAt });
    return jsonResponse(500, { error: "server_misconfigured", message: "ANTHROPIC_API_KEY absente cote Worker." }, baseCorrelationHeaders);
  }

  // 6) Appel upstream reel (CDC section 7.4.4)
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
  let upstreamResponse;
  const upstreamStartedAt = Date.now();
  try {
    upstreamResponse = await fetchImpl(upstreamBase + "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: rawBody,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    const isAbort = e && (e.name === "AbortError");
    const status = isAbort ? 504 : 502;
    logMinimal(env, { requestId: requestId, event: isAbort ? "upstream_timeout" : "upstream_network_error", status: status, latencyMs: Date.now() - startedAt });
    const headers = Object.assign({}, baseCorrelationHeaders);
    headers[CORRELATION_HEADER_UPSTREAM] = "anthropic";
    headers[CORRELATION_HEADER_UPSTREAM_STATUS] = String(status);
    return jsonResponse(status, { error: isAbort ? "upstream_timeout" : "upstream_network_error", message: isAbort ? "Timeout upstream Anthropic." : "Erreur reseau vers l'upstream Anthropic." }, headers);
  }
  if (timer) clearTimeout(timer);

  const upstreamBodyText = await upstreamResponse.text();
  const latencyMs = Date.now() - startedAt;
  logMinimal(env, { requestId: requestId, event: "upstream_relayed", status: upstreamResponse.status, latencyMs: latencyMs, payloadBytes: rawBody.length });

  // 7) Relai fidele du statut + corps upstream (CDC section 7.4.5, 7.6) —
  // jamais de conversion d'une erreur upstream en faux succes.
  const relayHeaders = Object.assign({}, baseCorrelationHeaders);
  relayHeaders[CORRELATION_HEADER_UPSTREAM] = "anthropic";
  relayHeaders[CORRELATION_HEADER_UPSTREAM_STATUS] = String(upstreamResponse.status);
  return new Response(upstreamBodyText, {
    status: upstreamResponse.status,
    headers: Object.assign({ "content-type": upstreamResponse.headers.get("content-type") || "application/json" }, relayHeaders),
  });
}

module.exports = {
  handleRequest: handleRequest,
  isValidMessagesPayload: isValidMessagesPayload,
  extractBearerToken: extractBearerToken,
  constantTimeEquals: constantTimeEquals,
  ROUTE_PATH: ROUTE_PATH,
  fetch: handleRequest,
};
