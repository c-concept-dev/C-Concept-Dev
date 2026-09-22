/**
 * evidenceforge-llm-proxy v0.8 (MONOLITH-v1.0.9) — CORRECTIF DU 504 « upstream_timeout » À 8 s (ROOT-CAUSE-504-8S-AUTOPSY-v1.md) :
 * les trois délais sont désormais SÉPARÉS et NOMMÉS :
 *   - HEADER_TIMEOUT_MS            : SEUL minuteur appliqué par ce Worker — attente des EN-TÊTES de la réponse amont
 *                                    (pré-flux). Défaut 60 000 ms (justification : PROXY-v0.8-TIMEOUT-DESIGN-v1.md — max mesuré
 *                                    7,0 s sur 56 appels réels, fenêtre edge Cloudflare ≈ 100 s, délai client premier octet 180 s).
 *                                    Effacé dès les en-têtes reçus : JAMAIS appliqué au flux SSE ni au corps bufferisé.
 *   - STREAM_INACTIVITY_TIMEOUT_MS : garde CLIENT (MONOLITH lib/llm.js › llm.streaming.inactivityMs, 90 s). Le Worker ne l'applique
 *                                    pas ; s'il est fourni en variable, il est seulement normalisé et annoncé (en-tête X-EvidenceForge-Timeouts).
 *   - STREAM_MAX_DURATION_MS       : garde CLIENT (llm.streaming.maxTotalMs, 15 min). Idem : annoncé, jamais appliqué ici.
 * Lecture STRICTE des variables Cloudflare (fournies en chaîne) : Number(...), fini, entier, bornes min/max explicites ; valeur absente
 * => défaut ; valeur invalide / hors bornes => défaut SÛR + trace non sensible (`config_invalid`) ; jamais NaN, 0 ni négatif.
 * `TIMEOUT_MS` (v0.6/v0.7) reste accepté comme alias hérité de HEADER_TIMEOUT_MS (même normalisation, trace `config_legacy_alias`).
 * Le relais SSE v0.7, l'authentification, le rate limiting fail-closed, la validation du payload et le mode non streaming sont inchangés.
 *
 * evidenceforge-llm-proxy v0.7 (MONOLITH-v1.0.8) — VERSION ADDITIVE du Worker gelé MONO-08 v0.6 :
 * STREAMING DE TRANSPORT. Quand le payload client porte `stream: true`, le Worker relaie la réponse SSE
 * Anthropic AU FIL DE L'EAU (`new Response(upstreamResponse.body, …)`) au lieu de la bufferiser
 * (`await upstreamResponse.text()`) : les en-têtes et les premiers événements atteignent le client en
 * quelques secondes, ce qui supprime le timeout edge Cloudflare 524 observé sur les générations longues
 * (> ~120 s sans premier octet — voir ROOT-CAUSE-524-AUTOPSY-v1.md). Le mode non streaming historique
 * (payload sans `stream`) est conservé byte-pour-byte dans sa logique. Le délai amont (TIMEOUT_MS) ne
 * couvre, en streaming, que l'attente des en-têtes amont ; le flux n'est jamais coupé par le Worker.
 * Sécurité inchangée : ANTHROPIC_API_KEY côté Cloudflare uniquement, credential Worker en Bearer,
 * rate limiting fail-closed, validation stricte du payload, aucun prompt ni secret journalisé.
 * Déploiement : voir README.md (section « v0.7 — streaming ») ; le lot gelé MONO-08 v0.6 n'est pas modifié.
 *
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
 * un export par défaut `{ fetch(request, env, ctx) }` au format ES Module
 * Worker réellement requis par Cloudflare (correctif d'audit : la version
 * précédente n'exposait qu'un `module.exports` CommonJS, invalide comme
 * point d'entrée Worker — voir README.md section « Format ES Module »
 * pour la preuve `wrangler deploy --dry-run`). Fichier ESM natif
 * (`worker/evidenceforge-llm-proxy/package.json` déclare `"type":
 * "module"`) ; les tests Node (`test/worker.test.js`) l'importent via
 * `import`, jamais `require`.
 */

const ROUTE_PATH = "/v1/messages";
const DEFAULT_UPSTREAM_BASE = "https://api.anthropic.com";
/* v0.8 — DÉLAIS SÉPARÉS. Seul HEADER_TIMEOUT_MS est appliqué par le Worker (attente des en-têtes amont). Les bornes empêchent une
   configuration absurde : < 1 s (impossible pour un prefill réel) ou > 90 s (au-delà, l'edge Cloudflare répondrait 524 avant nous —
   fenêtre ≈ 100–125 s — et le 504 explicite perdrait son sens). Les deux gardes de flux sont CLIENT : annoncées, jamais appliquées ici. */
const DEFAULT_HEADER_TIMEOUT_MS = 60000;
const HEADER_TIMEOUT_BOUNDS = { min: 1000, max: 90000 };
const STREAM_INACTIVITY_BOUNDS = { min: 1000, max: 600000 };
const STREAM_MAX_DURATION_BOUNDS = { min: 1000, max: 3600000 };
const DEFAULT_TIMEOUT_MS = DEFAULT_HEADER_TIMEOUT_MS;   /* nom v0.6/v0.7 conservé pour lisibilité des diffs ; même valeur que le défaut v0.8 */
const ANTHROPIC_VERSION = "2023-06-01";
const PROXY_VERSION = "evidenceforge-llm-proxy/0.8-stream-timeouts";
const CORRELATION_HEADER_TRANSPORT = "X-EvidenceForge-Transport";
const CORRELATION_HEADER_TIMEOUTS = "X-EvidenceForge-Timeouts";
const CORRELATION_HEADER_PROXY_VERSION = "X-EvidenceForge-Proxy-Version";   /* v0.8 : version du proxy annoncee (doctor : « v0.8 deploye ? ») */

/**
 * v0.8 — parseBoundedMs(value, { name, def, min, max, trace })
 * Normalisation STRICTE d'une variable de délai (Cloudflare fournit `vars` en chaîne ; les tests peuvent fournir un nombre) :
 *   absente / vide            -> défaut (aucune trace)
 *   non numérique / non finie -> défaut + trace config_invalid
 *   hors [min, max]           -> défaut + trace config_out_of_range (jamais un clamp silencieux : une borne franchie signale une erreur d'exploitation)
 *   sinon                     -> entier (arrondi) dans les bornes ; jamais NaN, 0 ni négatif.
 * La trace ne contient que le nom de la variable et la nature du défaut — jamais la valeur brute (elle pourrait être un secret collé au mauvais endroit).
 */
function parseBoundedMs(value, opts) {
  const def = opts.def; const min = opts.min; const max = opts.max; const name = opts.name; const trace = typeof opts.trace === "function" ? opts.trace : function () {};
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return { value: def, source: "default" };
  const n = typeof value === "number" ? value : (typeof value === "string" ? Number(value.trim()) : NaN);
  if (!Number.isFinite(n)) { trace({ event: "config_invalid", name: name, applied: def }); return { value: def, source: "default_after_invalid" }; }
  const r = Math.round(n);
  if (r < min || r > max) { trace({ event: "config_out_of_range", name: name, applied: def, min: min, max: max }); return { value: def, source: "default_after_out_of_range" }; }
  return { value: r, source: "env" };
}

/**
 * v0.8 — readTimeoutConfig(env, trace) -> { headerTimeoutMs, headerSource, streamInactivityTimeoutMs|null, streamMaxDurationMs|null, announce }
 * HEADER_TIMEOUT_MS (ou alias hérité TIMEOUT_MS) est le seul délai APPLIQUÉ ; les deux autres sont annoncés pour l'exploitation (doctor).
 */
function readTimeoutConfig(env, trace) {
  env = env || {}; trace = typeof trace === "function" ? trace : function () {};
  let header;
  if (env.HEADER_TIMEOUT_MS !== undefined && env.HEADER_TIMEOUT_MS !== null && String(env.HEADER_TIMEOUT_MS).trim() !== "") header = parseBoundedMs(env.HEADER_TIMEOUT_MS, { name: "HEADER_TIMEOUT_MS", def: DEFAULT_HEADER_TIMEOUT_MS, min: HEADER_TIMEOUT_BOUNDS.min, max: HEADER_TIMEOUT_BOUNDS.max, trace: trace });
  else if (env.TIMEOUT_MS !== undefined && env.TIMEOUT_MS !== null && String(env.TIMEOUT_MS).trim() !== "") { trace({ event: "config_legacy_alias", name: "TIMEOUT_MS", alias_of: "HEADER_TIMEOUT_MS" }); header = parseBoundedMs(env.TIMEOUT_MS, { name: "TIMEOUT_MS", def: DEFAULT_HEADER_TIMEOUT_MS, min: HEADER_TIMEOUT_BOUNDS.min, max: HEADER_TIMEOUT_BOUNDS.max, trace: trace }); }
  else header = { value: DEFAULT_HEADER_TIMEOUT_MS, source: "default" };
  const inact = parseBoundedMs(env.STREAM_INACTIVITY_TIMEOUT_MS, { name: "STREAM_INACTIVITY_TIMEOUT_MS", def: null, min: STREAM_INACTIVITY_BOUNDS.min, max: STREAM_INACTIVITY_BOUNDS.max, trace: trace });
  const maxd = parseBoundedMs(env.STREAM_MAX_DURATION_MS, { name: "STREAM_MAX_DURATION_MS", def: null, min: STREAM_MAX_DURATION_BOUNDS.min, max: STREAM_MAX_DURATION_BOUNDS.max, trace: trace });
  const announce = "header=" + header.value + ";stream-inactivity=" + (inact.value === null ? "client" : inact.value + "(client-enforced)") + ";stream-max=" + (maxd.value === null ? "client" : maxd.value + "(client-enforced)");
  return { headerTimeoutMs: header.value, headerSource: header.source, streamInactivityTimeoutMs: inact.value, streamMaxDurationMs: maxd.value, announce: announce };
}

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
 *
 * FAIL-CLOSED (correctif d'audit — Défaut Bloquant 1) : le rate limiting
 * est un contrôle de sécurité obligatoire, jamais un confort optionnel.
 * Toute situation où ce contrôle ne peut pas être exécuté de façon fiable
 * (binding absent, binding mal formé, `.limit()` qui lève, résultat de
 * forme inattendue) doit REFUSER la requête — jamais la laisser continuer
 * vers l'upstream Anthropic sous prétexte que le limiteur est
 * indisponible. La version précédente retournait `{limited: false}` dans
 * ce cas (fail-OPEN), ce qui aurait permis un relais Anthropic illimité si
 * le binding de production était mal configuré ou absent — violation
 * directe du contrat CDC section 7.11 (« jamais de relais Anthropic
 * illimité »). Trois issues possibles, disjointes :
 *
 *   - status "OK"          : quota disponible, poursuivre (cas K négatif).
 *   - status "LIMITED"      : quota réellement dépassé -> 429 (cas K).
 *   - status "UNAVAILABLE"  : binding absent/mal formé/résultat invalide,
 *                             ou "RUNTIME_ERROR" si `.limit()` a levé une
 *                             exception -> 503, AUCUN appel upstream
 *                             (cas L/M/N).
 */
async function checkRateLimit(env, workerKey) {
  if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") {
    // Binding absent (cas L) ou présent mais interface invalide, ex.
    // `.limit` n'est pas une fonction (cas M) : fail-closed, jamais un
    // passage silencieux.
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_UNAVAILABLE" };
  }
  const key = "worker-key:" + (await sha256Hex(workerKey || "anonymous"));
  let result;
  try {
    result = await env.RATE_LIMITER.limit({ key: key });
  } catch (e) {
    // `.limit()` a levé une exception (cas N) : fail-closed.
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_RUNTIME_ERROR" };
  }
  if (!result || typeof result.success !== "boolean") {
    // Réponse de forme inattendue (ni succès ni échec exploitable) :
    // traité comme indisponible, jamais interprété par défaut comme
    // "autorisé" — fail-closed.
    return { status: "UNAVAILABLE", reason: "RATE_LIMITER_UNAVAILABLE" };
  }
  return result.success ? { status: "OK" } : { status: "LIMITED", reason: "RATE_LIMITED" };
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
 *   ANTHROPIC_BASE_URL?, HEADER_TIMEOUT_MS? (alias hérité TIMEOUT_MS), STREAM_INACTIVITY_TIMEOUT_MS?, STREAM_MAX_DURATION_MS?, fetchImpl?, logger? }
 */
async function handleRequest(request, env) {
  env = env || {};
  const startedAt = Date.now();
  const fetchImpl = typeof env.fetchImpl === "function" ? env.fetchImpl : fetch;
  const upstreamBase = env.ANTHROPIC_BASE_URL || DEFAULT_UPSTREAM_BASE;
  /* v0.8 — délais séparés, lecture stricte (chaîne ou nombre, bornes, défaut sûr + trace non sensible) ; seul headerTimeoutMs est appliqué */
  const timeouts = readTimeoutConfig(env, function (t) { logMinimal(env, { requestId: null, event: t.event + ":" + t.name, status: null, latencyMs: null }); });
  const timeoutMs = timeouts.headerTimeoutMs;

  const url = new URL(request.url);
  const clientRequestId = request.headers.get(CLIENT_REQUEST_ID_HEADER);
  const requestId = clientRequestId || newRequestId();

  const baseCorrelationHeaders = {};
  baseCorrelationHeaders[CORRELATION_HEADER_PROXY] = "evidenceforge-llm-proxy";
  baseCorrelationHeaders[CORRELATION_HEADER_REQUEST_ID] = requestId;
  baseCorrelationHeaders[CORRELATION_HEADER_TIMEOUTS] = timeouts.announce;   /* v0.8 : configuration effective annoncée (jamais un secret) */
  baseCorrelationHeaders[CORRELATION_HEADER_PROXY_VERSION] = PROXY_VERSION;

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
  // FAIL-CLOSED (correctif d'audit) : "UNAVAILABLE" (binding absent/mal
  // formé/résultat invalide/exception) -> 503, jamais un 429 (429 signifie
  // que le limiteur fonctionne et que le seuil a réellement été dépassé —
  // jamais mélanger les deux causes) et jamais un passage silencieux vers
  // l'upstream.
  const rl = await checkRateLimit(env, token);
  if (rl.status === "UNAVAILABLE") {
    logMinimal(env, { requestId: requestId, event: "rate_limiter_unavailable", status: 503, latencyMs: Date.now() - startedAt });
    return jsonResponse(503, { error: "rate_limiter_unavailable", reason: rl.reason, message: "Rate limiter indisponible ou mal configure — requete refusee (fail-closed), aucun appel upstream tente." }, baseCorrelationHeaders);
  }
  if (rl.status === "LIMITED") {
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
  // v0.8 — HEADER_TIMEOUT_MS : minuteur armé AVANT le fetch amont, effacé DÈS que `fetchImpl` résout (= en-têtes reçus). Il ne couvre
  // donc que l'attente des en-têtes ; le flux SSE (6 bis) et le corps bufferisé (7) ne sont JAMAIS soumis à ce minuteur (gardes client).
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
    /* v0.8 — le 504 dit explicitement QUELLE phase et QUEL délai (autopsie sans deviner) ; jamais un secret, jamais le prompt */
    return jsonResponse(status, isAbort ? { error: "upstream_timeout", message: "Timeout upstream Anthropic (attente des en-tetes).", phase: "upstream_headers", headerTimeoutMs: timeoutMs, headerTimeoutSource: timeouts.headerSource, upstreamWaitMs: Date.now() - upstreamStartedAt } : { error: "upstream_network_error", message: "Erreur reseau vers l'upstream Anthropic." }, headers);
  }
  if (timer) clearTimeout(timer);

  // 6 bis) v0.7 — STREAMING : relais du corps amont AU FIL DE L'EAU (jamais bufferisé). Uniquement si le client
  // a demandé `stream: true` ET que l'amont répond 200 en text/event-stream. Toute autre réponse (erreur amont,
  // JSON) suit le chemin historique (corps lu puis relayé fidèlement).
  const wantsStream = payload.stream === true;
  const upstreamCt = upstreamResponse.headers.get("content-type") || "";
  if (wantsStream && upstreamResponse.status === 200 && /text\/event-stream/i.test(upstreamCt) && upstreamResponse.body) {
    const streamHeaders = Object.assign({}, baseCorrelationHeaders);
    streamHeaders[CORRELATION_HEADER_UPSTREAM] = "anthropic";
    streamHeaders[CORRELATION_HEADER_UPSTREAM_STATUS] = "200";
    streamHeaders[CORRELATION_HEADER_TRANSPORT] = "sse-stream";
    streamHeaders["content-type"] = "text/event-stream; charset=utf-8";
    streamHeaders["cache-control"] = "no-cache, no-store";
    streamHeaders["x-accel-buffering"] = "no";
    logMinimal(env, { requestId: requestId, event: "upstream_stream_relayed", status: 200, latencyMs: Date.now() - startedAt, payloadBytes: rawBody.length });
    return new Response(upstreamResponse.body, { status: 200, headers: streamHeaders });
  }

  const upstreamBodyText = await upstreamResponse.text();
  const latencyMs = Date.now() - startedAt;
  logMinimal(env, { requestId: requestId, event: "upstream_relayed", status: upstreamResponse.status, latencyMs: latencyMs, payloadBytes: rawBody.length });

  // 7) Relai fidele du statut + corps upstream (CDC section 7.4.5, 7.6) —
  // jamais de conversion d'une erreur upstream en faux succes.
  const relayHeaders = Object.assign({}, baseCorrelationHeaders);
  relayHeaders[CORRELATION_HEADER_UPSTREAM] = "anthropic";
  relayHeaders[CORRELATION_HEADER_UPSTREAM_STATUS] = String(upstreamResponse.status);
  relayHeaders[CORRELATION_HEADER_TRANSPORT] = "buffered";
  return new Response(upstreamBodyText, {
    status: upstreamResponse.status,
    headers: Object.assign({ "content-type": upstreamResponse.headers.get("content-type") || "application/json" }, relayHeaders),
  });
}

export { handleRequest, isValidMessagesPayload, extractBearerToken, constantTimeEquals, ROUTE_PATH, PROXY_VERSION, parseBoundedMs, readTimeoutConfig, DEFAULT_HEADER_TIMEOUT_MS, HEADER_TIMEOUT_BOUNDS };

// Point d'entrée réel du Worker ES Module (Cloudflare exige littéralement
// `export default { fetch(request, env, ctx) { ... } }` — voir preuve
// wrangler dry-run dans README.md). ctx (ExecutionContext) n'est pas
// utilisé par handleRequest ci-dessus (pas de waitUntil/passThroughOnException
// nécessaire pour ce relais synchrone), mais reste accepté pour respecter
// la signature standard `fetch(request, env, ctx)`.
export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
