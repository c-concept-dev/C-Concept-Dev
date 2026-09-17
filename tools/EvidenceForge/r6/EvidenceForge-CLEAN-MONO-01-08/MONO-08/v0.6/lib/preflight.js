"use strict";
/**
 * MONO-08 — lib/preflight.js
 *
 * CORRECTIF (audit independant) : un simple "HTTP < 500 reachable" a ete
 * juge trop permissif. READY exige desormais une preuve explicite a 4
 * etapes :
 *   HOST_REACHABLE  - connexion TCP/TLS + reponse HTTP recue
 *   AUTH_VALID      - identifiant requis, present ET accepte reellement
 *   OPERATION_VALID - l'operation reelle du contrat est utilisee (jamais
 *                     une methode/route arbitraire)
 *   RESPONSE_VALID  - corps de reponse structurellement conforme au
 *                     fournisseur reel (jamais un 200 HTML de proxy pris
 *                     pour une reponse JSON valide)
 *
 * READY seulement si toutes les etapes necessaires sont vraies.
 *
 * MONO-08 v0.6 (CDC MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md, section 4-5) :
 * ajout de LLM_AUTH_MODE ("direct" par defaut / "delegated"). Le mode
 * "direct" est strictement inchange (meme provider llm-worker, meme
 * ANTHROPIC_API_KEY, meme header x-api-key). Le mode "delegated" ajoute un
 * provider llm-worker distinct qui exige EVIDENCEFORGE_WORKER_API_KEY
 * (jamais ANTHROPIC_API_KEY, jamais lue dans cette branche) et envoie ce
 * credential en "Authorization: Bearer <token>" — voir CDC-TRACE.md pour la
 * raison de ce choix de header (alignement avec le comportement reel,
 * inchange, du Gateway MONO-04). Toute valeur explicite de LLM_AUTH_MODE
 * autre que "direct"/"delegated" fait echouer runPreflight() AVANT tout
 * appel provider (CDC section 4.1, cas de test J) — bin/run-preflight.js
 * (inchange) traduit deja cette exception en PRODUCT_CONFIG_ERROR / exit 3.
 */

const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");

const VALID_AUTH_MODES = ["direct", "delegated"];

// MICRO-LOT PRE-REAL (audit reel post-deploiement, 2026-08-31) — Defaut
// Bloquant 1 : l'ancienne troncature destructive de httpRequest()
// (`if (body.length > 4000) res.destroy()`) coupait des reponses JSON
// reelles legitimes (ex. OpenAlex GET /works?per_page=1, couramment
// > 4 Ko) avant JSON.parse(), provoquant un faux INVALID_RESPONSE sur un
// provider en realite parfaitement fonctionnel. Remplacee par une limite
// de securite exprimee en OCTETS (pas en caracteres/longueur de string),
// largement superieure a la taille reelle des reponses des providers
// probes ici (quelques dizaines de Ko au plus), qui abandonne PROPREMENT
// (fail-closed, cf. checkProvider() -> RESPONSE_TOO_LARGE) et ne parse
// JAMAIS un corps tronque comme s'il s'agissait d'une reponse provider
// complete.
const MAX_PREFLIGHT_RESPONSE_BYTES = 1048576; // 1 MiB

// MICRO-LOT PRE-REAL — Defaut Bloquant 2 : le modele Anthropic
// "claude-3-5-haiku-latest", hardcode en dur dans les deux probes LLM
// (direct et delegated), est devenu indisponible (HTTP 404 not_found_error
// reel, constate lors du PREFLIGHT reel post-deploiement du 2026-08-31).
// Le modele de sonde est desormais configurable via la variable
// LLM_PREFLIGHT_MODEL (voir .env.example) ; a defaut, le modele documente
// ci-dessous est utilise.
//
// Source de verite pour ce defaut (verifiee au moment de ce correctif,
// aucun identifiant devine) : skill de reference "claude-api" disponible
// dans cet environnement Claude, section "Current Models" (table de
// modeles Anthropic actuels, cache au 2026-06-24). claude-haiku-4-5 y est
// le modele le plus leger du catalogue courant, non deprecie, adapte a
// une sonde technique minimale (payload court, max_tokens=1). Voir
// LLM-PREFLIGHT-MODEL-SOURCE.md (dossier de preuve du micro-lot) pour le
// detail complet de cette verification, y compris l'anciennete de ce
// cache documentaire et la recommandation de reverification par
// l'operateur avant tout usage REAL prolonge.
const DEFAULT_LLM_PREFLIGHT_MODEL = "claude-haiku-4-5";

function resolveLlmPreflightModel(env) {
  const raw = env.LLM_PREFLIGHT_MODEL;
  if (raw === undefined || raw === null || raw === "") return DEFAULT_LLM_PREFLIGHT_MODEL;
  return raw;
}

function resolveAuthMode(env) {
  const raw = env.LLM_AUTH_MODE;
  if (raw === undefined || raw === null || raw === "") {
    return { mode: "direct", explicit: false, valid: true };
  }
  if (VALID_AUTH_MODES.indexOf(raw) !== -1) {
    return { mode: raw, explicit: true, valid: true };
  }
  return { mode: null, explicit: true, valid: false, rawValue: raw };
}

function httpRequest(urlStr, options) {
  options = options || {};
  return new Promise(function (resolve) {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      resolve({ reached: false, error: "URL invalide: " + e.message });
      return;
    }
    const startedAt = Date.now();
    const req = https.request(
      {
        host: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeoutMs || 8000,
      },
      function (res) {
        const chunks = [];
        let totalBytes = 0;
        let truncated = false;
        let settled = false;
        res.on("data", function (c) {
          if (truncated) return;
          const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
          totalBytes += chunk.length;
          if (totalBytes > MAX_PREFLIGHT_RESPONSE_BYTES) {
            // Limite de securite depassee : abandon PROPRE, jamais de
            // JSON.parse sur un corps tronque (voir checkProvider() ->
            // RESPONSE_TOO_LARGE). Le dernier morceau qui fait depasser la
            // limite n'est pas conserve.
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        function finish() {
          if (settled) return;
          settled = true;
          resolve({
            reached: true,
            statusCode: res.statusCode,
            headers: res.headers,
            latencyMs: Date.now() - startedAt,
            body: truncated ? null : Buffer.concat(chunks).toString("utf8"),
            bodyTruncated: truncated,
            bodyBytes: totalBytes,
          });
        }
        res.on("end", finish);
        res.on("close", finish);
      }
    );
    req.on("timeout", function () { req.destroy(); resolve({ reached: false, error: "TIMEOUT", latencyMs: Date.now() - startedAt }); });
    req.on("error", function (e) { resolve({ reached: false, error: e.message, latencyMs: Date.now() - startedAt }); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function isEgressProxyBlock(probe) {
  return !!(probe.headers && probe.headers["x-deny-reason"]);
}

function tryParseJson(body) {
  try { return { ok: true, value: JSON.parse(body) }; } catch (e) { return { ok: false, error: e.message }; }
}

function buildLlmWorkerProviderDirect(llmBase, timeoutMs, env) {
  return {
    providerId: "llm-worker",
    dependencyType: "worker",
    baseUrl: llmBase,
    credentialRequired: true,
    credentialEnvVar: "ANTHROPIC_API_KEY",
    realSmokeRequired: true,
    authMode: "direct",
    operationDescription: "POST /v1/messages (operation reelle du contrat, max_tokens=1 — jamais GET, qui donnerait un faux 405)",
    probe: function () {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) {
        return httpRequest(llmBase + "/v1/messages", { method: "POST", timeoutMs: timeoutMs, headers: { "content-type": "application/json" }, body: "{}" }).then(function (probe) {
          probe.credentialProbeSkipped = true;
          return probe;
        });
      }
      const body = JSON.stringify({ model: resolveLlmPreflightModel(env), max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
      return httpRequest(llmBase + "/v1/messages", {
        method: "POST",
        timeoutMs: timeoutMs,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: body,
      });
    },
    validateResponse: function (probe) {
      const parsed = tryParseJson(probe.body);
      if (!parsed.ok) return { valid: false, reason: "corps non JSON: " + parsed.error };
      if (probe.statusCode !== 200) return { valid: false, reason: "HTTP " + probe.statusCode + " (attendu 200)" };
      if (!Array.isArray(parsed.value.content)) return { valid: false, reason: "champ content (tableau) absent" };
      return { valid: true };
    },
  };
}

function buildLlmWorkerProviderDelegated(llmBase, timeoutMs, env) {
  // MONO-08 v0.6 — mode delegated (CDC section 4.3, 4.3.1.A) :
  // ANTHROPIC_API_KEY n'est JAMAIS lue, JAMAIS demandee a un SecretProvider,
  // JAMAIS transmise et JAMAIS utilisee pour construire un header dans
  // cette fonction. Seule EVIDENCEFORGE_WORKER_API_KEY est lue ici.
  return {
    providerId: "llm-worker",
    dependencyType: "worker",
    baseUrl: llmBase,
    credentialRequired: true,
    credentialEnvVar: "EVIDENCEFORGE_WORKER_API_KEY",
    realSmokeRequired: true,
    authMode: "delegated",
    operationDescription: "POST /v1/messages via Worker delegue evidenceforge-llm-proxy (CDC section 7) — jamais GET",
    probe: function () {
      const key = env.EVIDENCEFORGE_WORKER_API_KEY;
      const requestId = "preflight-" + crypto.randomBytes(8).toString("hex");
      if (!key) {
        return httpRequest(llmBase + "/v1/messages", {
          method: "POST",
          timeoutMs: timeoutMs,
          headers: { "content-type": "application/json", "x-evidenceforge-request-id": requestId },
          body: "{}",
        }).then(function (probe) {
          probe.credentialProbeSkipped = true;
          probe.requestId = requestId;
          return probe;
        });
      }
      const body = JSON.stringify({ model: resolveLlmPreflightModel(env), max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
      return httpRequest(llmBase + "/v1/messages", {
        method: "POST",
        timeoutMs: timeoutMs,
        headers: {
          "content-type": "application/json",
          // CDC section 4.3.2 / CDC-TRACE.md : le credential Worker est
          // envoye en "Authorization: Bearer <token>", jamais en
          // "x-api-key" — ce header aligne exactement le probe de
          // preflight sur ce que fait deja, sans modification, le Gateway
          // MONO-04 (external-execution-gateway.js::performHttpCall) pour
          // le vrai run : Authorization: Bearer <secretValue> a partir de
          // providerConfig.requiredSecret, quel que soit le nom du secret.
          authorization: "Bearer " + key,
          "x-evidenceforge-request-id": requestId,
        },
        body: body,
      }).then(function (probe) {
        probe.requestId = requestId;
        return probe;
      });
    },
    validateResponse: function (probe) {
      const parsed = tryParseJson(probe.body);
      if (!parsed.ok) return { valid: false, reason: "corps non JSON: " + parsed.error };
      if (probe.statusCode !== 200) return { valid: false, reason: "HTTP " + probe.statusCode + " (attendu 200)" };
      if (!Array.isArray(parsed.value.content)) return { valid: false, reason: "champ content (tableau) absent" };
      return { valid: true };
    },
  };
}

function buildProviders(env) {
  env = env || process.env;
  const timeoutMs = parseInt(env.EVIDENCEFORGE_HTTP_TIMEOUT_MS || "8000", 10);
  const openalexBase = env.OPENALEX_BASE_URL || "https://api.openalex.org";
  const crossrefBase = env.CROSSREF_BASE_URL || "https://api.crossref.org";
  const pubmedBase = env.PUBMED_BASE_URL || "https://eutils.ncbi.nlm.nih.gov";
  const llmBase = env.LLM_WORKER_BASE_URL || "https://api.anthropic.com";
  const authModeResolution = resolveAuthMode(env);
  if (!authModeResolution.valid) {
    // CDC section 4.1 : une valeur LLM_AUTH_MODE explicite non reconnue
    // n'est JAMAIS silencieusement reinterpretee comme "direct". On leve
    // ici, avant la construction de la moindre entree provider/probe — donc
    // avant toute possibilite d'appel reseau, quel que soit l'appelant
    // (runPreflight() ou un appel direct de buildProviders()).
    throw new Error(
      "LLM_AUTH_MODE invalide: \"" + authModeResolution.rawValue + "\" " +
      "(valeurs autorisees : absente -> direct, \"direct\", \"delegated\") — " +
      "PRODUCT_CONFIG_ERROR, aucun appel provider, aucune requete reseau."
    );
  }
  const llmAuthMode = authModeResolution.mode;

  return [
    {
      providerId: "openalex",
      dependencyType: "corpus-search",
      baseUrl: openalexBase,
      credentialRequired: false,
      credentialEnvVar: null,
      realSmokeRequired: true,
      operationDescription: "GET /works?per_page=1 (operation reelle de recherche)",
      probe: function () { return httpRequest(openalexBase + "/works?per_page=1", { method: "GET", timeoutMs: timeoutMs }); },
      validateResponse: function (probe) {
        if (!probe.headers || !/json/i.test(probe.headers["content-type"] || "")) return { valid: false, reason: "content-type non JSON" };
        const parsed = tryParseJson(probe.body);
        if (!parsed.ok) return { valid: false, reason: "corps non JSON: " + parsed.error };
        if (!Array.isArray(parsed.value.results)) return { valid: false, reason: "champ results (tableau) absent" };
        return { valid: true };
      },
    },
    {
      providerId: "crossref",
      dependencyType: "corpus-search",
      baseUrl: crossrefBase,
      credentialRequired: false,
      credentialEnvVar: null,
      realSmokeRequired: true,
      operationDescription: "GET /works?rows=1 (operation reelle de recherche)",
      probe: function () { return httpRequest(crossrefBase + "/works?rows=1", { method: "GET", timeoutMs: timeoutMs }); },
      validateResponse: function (probe) {
        if (!probe.headers || !/json/i.test(probe.headers["content-type"] || "")) return { valid: false, reason: "content-type non JSON" };
        const parsed = tryParseJson(probe.body);
        if (!parsed.ok) return { valid: false, reason: "corps non JSON: " + parsed.error };
        if (!parsed.value.message || parsed.value["message-type"] !== "work-list") return { valid: false, reason: "champ message/message-type=work-list absent" };
        return { valid: true };
      },
    },
    {
      providerId: "pubmed",
      dependencyType: "corpus-search",
      baseUrl: pubmedBase,
      credentialRequired: false,
      credentialEnvVar: null,
      realSmokeRequired: false,
      operationDescription: "GET /entrez/eutils/esearch.fcgi?db=pubmed&term=accessibility&retmax=1&retmode=json",
      probe: function () { return httpRequest(pubmedBase + "/entrez/eutils/esearch.fcgi?db=pubmed&term=accessibility&retmax=1&retmode=json", { method: "GET", timeoutMs: timeoutMs }); },
      validateResponse: function (probe) {
        const parsed = tryParseJson(probe.body);
        if (!parsed.ok) return { valid: false, reason: "corps non JSON: " + parsed.error };
        if (!parsed.value.esearchresult) return { valid: false, reason: "champ esearchresult absent" };
        return { valid: true };
      },
    },
    llmAuthMode === "delegated"
      ? buildLlmWorkerProviderDelegated(llmBase, timeoutMs, env)
      : buildLlmWorkerProviderDirect(llmBase, timeoutMs, env),
  ];
}

async function checkProvider(provider) {
  const probe = await provider.probe();
  const hasCredential = provider.credentialRequired ? !probe.credentialProbeSkipped : true;
  const stages = { hostReachable: false, authValid: null, operationValid: false, responseValid: false };
  let status, reason, rawClassification;

  if (!probe.reached) {
    status = "PROVIDER_UNAVAILABLE";
    rawClassification = "NETWORK_ERROR";
    reason = "Tentative reseau reelle echouee (" + (probe.error || "raison inconnue") + ").";
  } else {
    stages.hostReachable = true;
    if (isEgressProxyBlock(probe)) {
      status = "NETWORK_BLOCKED";
      rawClassification = "EGRESS_PROXY_BLOCK";
      reason = "Egress reseau explicitement refuse par le proxy de l'environnement d'execution (x-deny-reason: " + probe.headers["x-deny-reason"] + ").";
    } else if (probe.bodyTruncated) {
      status = "INVALID_RESPONSE";
      rawClassification = "RESPONSE_TOO_LARGE";
      reason = "Corps de reponse reel tronque : depasse la limite de securite MAX_PREFLIGHT_RESPONSE_BYTES (" + MAX_PREFLIGHT_RESPONSE_BYTES + " octets ; " + (probe.bodyBytes || 0) + " octets recus avant abandon) - jamais parse comme JSON tronque, jamais interprete comme READY.";
    } else if (probe.credentialProbeSkipped) {
      status = "AUTHENTICATION_BLOCKED";
      rawClassification = "NO_CREDENTIAL";
      stages.authValid = false;
      reason = "Hote reellement atteint, mais aucun identifiant exploitable (" + provider.credentialEnvVar + " absent) - aucun appel authentifie couteux tente.";
    } else if (probe.statusCode === 429) {
      status = "RATE_LIMITED";
      rawClassification = "PROVIDER_HTTP_ERROR";
      reason = "HTTP 429 recu reellement du fournisseur.";
    } else if (provider.credentialRequired && (probe.statusCode === 401 || probe.statusCode === 403)) {
      status = "AUTHENTICATION_BLOCKED";
      rawClassification = "PROVIDER_HTTP_ERROR";
      stages.authValid = false;
      reason = "Identifiant present mais rejete par le fournisseur (HTTP " + probe.statusCode + ").";
    } else if (probe.statusCode === 405 || probe.statusCode === 404 || probe.statusCode === 400) {
      status = "INVALID_RESPONSE";
      rawClassification = "PROVIDER_HTTP_ERROR";
      reason = "HTTP " + probe.statusCode + " sur l'operation reelle utilisee - jamais interprete comme READY.";
    } else if (probe.statusCode >= 500) {
      status = "PROVIDER_UNAVAILABLE";
      rawClassification = "PROVIDER_HTTP_ERROR";
      reason = "Erreur serveur reelle du fournisseur (HTTP " + probe.statusCode + ").";
    } else if (probe.statusCode >= 200 && probe.statusCode < 300) {
      stages.operationValid = true;
      if (provider.credentialRequired) stages.authValid = true;
      const validation = provider.validateResponse(probe);
      if (!validation.valid) {
        status = "INVALID_RESPONSE";
        rawClassification = "PROVIDER_HTTP_ERROR";
        reason = "Reponse HTTP " + probe.statusCode + " non conforme au contrat reel attendu : " + validation.reason + ".";
      } else {
        stages.responseValid = true;
        status = "READY";
        rawClassification = "PROVIDER_HTTP_ERROR";
        reason = "Hote atteint, operation reelle acceptee (HTTP " + probe.statusCode + "), reponse conforme (" + provider.operationDescription + ").";
      }
    } else {
      status = "INVALID_RESPONSE";
      rawClassification = "PROVIDER_HTTP_ERROR";
      reason = "HTTP " + probe.statusCode + " non classifie explicitement.";
    }
  }

  return {
    providerId: provider.providerId,
    dependencyType: provider.dependencyType,
    baseUrl: provider.baseUrl,
    operationDescription: provider.operationDescription,
    // authMode : ajout additif MONO-08 v0.6 (CDC section 5). Absent (undefined
    // -> null) pour openalex/crossref/pubmed, qui ne sont pas concernes par
    // LLM_AUTH_MODE ; "direct" ou "delegated" pour llm-worker.
    authMode: provider.authMode || null,
    credentialRequired: provider.credentialRequired,
    credentialEnvVar: provider.credentialRequired ? provider.credentialEnvVar : null,
    credentialPresent: provider.credentialRequired ? hasCredential : null,
    stages: stages,
    probe: {
      reached: probe.reached,
      statusCode: probe.statusCode || null,
      latencyMs: probe.latencyMs,
      error: probe.error || null,
      denyReason: (probe.headers && probe.headers["x-deny-reason"]) || null,
      // requestId : identifiant de correlation non secret (CDC section 5.3,
      // NIVEAU 2). Prepare la correlation REAL future ; n'a aucun effet sur
      // la classification LOCAL_CONTROLLED/preflight actuelle.
      requestId: probe.requestId || null,
    },
    rawClassification: rawClassification,
    status: status,
    reason: reason,
    realSmokeRequired: provider.realSmokeRequired,
  };
}

async function runPreflight(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  // resolveAuthMode() est appelee ici uniquement pour exposer le mode
  // resolu dans le rapport (authMode top-level, CDC section 5) ; la garde
  // stricte "valeur explicite invalide -> exception avant tout appel
  // provider" vit dans buildProviders() lui-meme (seule source de verite),
  // qui est le tout premier appel effectue ci-dessous — donc si
  // LLM_AUTH_MODE porte une valeur explicite invalide, l'exception est levee
  // avant la construction de la moindre entree provider/probe, avant tout
  // appel a checkProvider(), avant toute requete reseau.
  const authModeResolution = resolveAuthMode(env);
  const providers = buildProviders(env);
  const results = [];
  for (const provider of providers) {
    results.push(await checkProvider(provider));
  }

  const requiredResults = results.filter(function (r) { return r.realSmokeRequired; });
  const allRequiredReady = requiredResults.length > 0 && requiredResults.every(function (r) { return r.status === "READY"; });
  const anyRequiredReady = requiredResults.some(function (r) { return r.status === "READY"; });

  let overallStatus;
  if (allRequiredReady) overallStatus = "READY";
  else if (anyRequiredReady) overallStatus = "PARTIALLY_READY";
  else overallStatus = "BLOCKED";

  return {
    overallStatus: overallStatus,
    allRequiredReady: allRequiredReady,
    authMode: authModeResolution.mode,
    results: results,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  runPreflight: runPreflight,
  buildProviders: buildProviders,
  checkProvider: checkProvider,
  MAX_PREFLIGHT_RESPONSE_BYTES: MAX_PREFLIGHT_RESPONSE_BYTES,
  DEFAULT_LLM_PREFLIGHT_MODEL: DEFAULT_LLM_PREFLIGHT_MODEL,
};
