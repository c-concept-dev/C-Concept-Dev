"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/provider-diagnostic.js
 * DIAGNOSTIC DU FOURNISSEUR (Worker delegue) sans aucun appel payant et sans jamais exposer un secret :
 *   - credentialsStatus(env)  : presence des variables, detection des PLACEHOLDERS (TON_URL_WORKER, TA_CLE, example, changeme…),
 *                                validite syntaxique de l'URL — "present" ne veut plus dire "configure" ;
 *   - classifyFetchError(e)   : DNS / connexion refusee / TLS / URL invalide / delai / reseau, depuis la cause Node (undici) ;
 *   - classifyStatus(status)  : 401/403 auth, 404 route, 429 debit, 400 credit, 503/529 capacite, 5xx indisponible, 200 ok ;
 *   - probeWorker(env)        : sonde GRATUITE = POST /v1/messages avec un corps `{}` : le Worker verifie l'authentification AVANT
 *                                le payload et repond 400 "invalid_request" sans appeler l'amont ; 401 = clef refusee ; erreurs
 *                                reseau classees. Rend { ready, reachable, authOk, code, userMessage, httpStatus, ms } — jamais la clef.
 * Codes : PROVIDER_URL_INVALID, PROVIDER_PLACEHOLDER, PROVIDER_DNS_ERROR, PROVIDER_CONNECTION_REFUSED, PROVIDER_TLS_ERROR,
 *         PROVIDER_TIMEOUT, NETWORK_UNAVAILABLE, PROVIDER_AUTH_ERROR, PROVIDER_ROUTE_NOT_FOUND, PROVIDER_RATE_LIMITED,
 *         PROVIDER_CREDIT_EXHAUSTED, PROVIDER_CAPACITY, PROVIDER_UNAVAILABLE, PROVIDER_BAD_RESPONSE, PROVIDER_NOT_CONFIGURED, OK.
 */
const PLACEHOLDER_PATTERNS = [/^TON_URL_WORKER$/i, /^TA_CLE$/i, /TON_URL/i, /TA_CL[EÉ]/i, /\bexample\b/i, /changeme/i, /placeholder/i, /^xxx+$/i, /^\.\.\.$/, /<[^>]+>/, /^\$\{?[A-Z_]+\}?$/, /^(secret|clef|cle|key|url)$/i, /YOUR[_-]?(KEY|URL|API)/i, /REPLACE[_-]?ME/i];
const USER = Object.freeze({
  PROVIDER_NOT_CONFIGURED: "Le service d'analyse n'est pas configuré sur cette machine (identifiants absents). Lancez ./tools/EvidenceForge/setup.sh.",
  PROVIDER_PLACEHOLDER: "La configuration contient une valeur factice (ex. TON_URL_WORKER / TA_CLE) : ce n'est pas un identifiant réel. Lancez ./tools/EvidenceForge/setup.sh.",
  PROVIDER_URL_INVALID: "L'adresse du worker configurée n'est pas une URL valide (elle doit commencer par https://).",
  PROVIDER_DNS_ERROR: "Le worker configuré n'existe pas ou son nom est introuvable (résolution DNS impossible). Vérifiez l'adresse du worker.",
  PROVIDER_CONNECTION_REFUSED: "Le worker est introuvable à cette adresse : la connexion est refusée.",
  PROVIDER_TLS_ERROR: "La connexion sécurisée (TLS) avec le worker a échoué : certificat ou protocole invalide.",
  PROVIDER_TIMEOUT: "Le fournisseur est joignable mais le délai a expiré. Le run est arrêté proprement ; il pourra reprendre (les réponses déjà validées sont conservées).",
  NETWORK_UNAVAILABLE: "Réseau indisponible : impossible de joindre le fournisseur d'analyse. Aucun résultat n'est inventé.",
  PROVIDER_AUTH_ERROR: "Le worker répond mais refuse l'authentification : la clé configurée n'est pas acceptée. Lancez ./tools/EvidenceForge/setup.sh pour la corriger.",
  PROVIDER_ROUTE_NOT_FOUND: "L'adresse répond mais ce n'est pas un worker EvidenceForge (route /v1/messages introuvable). Vérifiez l'adresse du worker.",
  PROVIDER_RATE_LIMITED: "Le fournisseur d'analyse limite le débit. EvidenceForge attend et réessaie automatiquement (attente bornée).",
  PROVIDER_CREDIT_EXHAUSTED: "Le crédit du fournisseur d'analyse est épuisé. Le run est arrêté proprement ; il pourra reprendre sans perdre les résultats déjà validés une fois le crédit rétabli.",
  PROVIDER_CAPACITY: "Le fournisseur d'analyse est saturé (capacité). EvidenceForge attend et réessaie automatiquement (attente bornée).",
  PROVIDER_UNAVAILABLE: "Le fournisseur d'analyse a répondu par une erreur. Le run est arrêté proprement.",
  PROVIDER_BAD_RESPONSE: "Le fournisseur d'analyse a répondu dans un format inattendu. Aucun résultat n'est inventé.",
  OK: "Fournisseur d'analyse disponible.",
});
const isPlaceholder = (v) => { const s = String(v == null ? "" : v).trim(); if (!s) return false; return PLACEHOLDER_PATTERNS.some((re) => re.test(s)); };

/** Etat des identifiants depuis un environnement (jamais les valeurs). */
function credentialsStatus(env) {
  env = env || process.env; const url = env.LLM_WORKER_BASE_URL || "", key = env.EVIDENCEFORGE_WORKER_API_KEY || "", mode = env.LLM_AUTH_MODE || "";
  const present = !!(url && key); const placeholders = [];
  if (url && isPlaceholder(url)) placeholders.push("LLM_WORKER_BASE_URL"); if (key && isPlaceholder(key)) placeholders.push("EVIDENCEFORGE_WORKER_API_KEY");
  let urlValid = false; try { const u = new URL(url); urlValid = (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname; } catch (e) { urlValid = false; }
  const missing = []; if (!url) missing.push("LLM_WORKER_BASE_URL"); if (!key) missing.push("EVIDENCEFORGE_WORKER_API_KEY"); if (mode && mode !== "delegated") missing.push("LLM_AUTH_MODE(=delegated attendu)");
  let code = "OK"; if (!present) code = "PROVIDER_NOT_CONFIGURED"; else if (placeholders.length) code = "PROVIDER_PLACEHOLDER"; else if (!urlValid) code = "PROVIDER_URL_INVALID";
  return { credentialsPresent: present, placeholders, placeholderDetected: placeholders.length > 0, urlValid, missing, keyLength: key ? key.length : 0, host: urlValid ? new URL(url).host : null, code, userMessage: code === "OK" ? null : USER[code], usable: code === "OK" };
}

function classifyFetchError(e, timedOut) {
  if (timedOut) return "PROVIDER_TIMEOUT";
  const c = (e && e.cause && (e.cause.code || e.cause.name)) || (e && e.code) || ""; const msg = String((e && e.message) || "") + " " + String((e && e.cause && e.cause.message) || "");
  if (/ERR_INVALID_URL|Invalid URL|Failed to parse URL/i.test(c + " " + msg)) return "PROVIDER_URL_INVALID";
  if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME|getaddrinfo/i.test(c + " " + msg)) return "PROVIDER_DNS_ERROR";
  if (/ECONNREFUSED/i.test(c + " " + msg)) return "PROVIDER_CONNECTION_REFUSED";
  if (/CERT|TLS|SSL|ERR_TLS|UNABLE_TO_VERIFY|self.signed|HANDSHAKE/i.test(c + " " + msg)) return "PROVIDER_TLS_ERROR";
  if (/AbortError|aborted|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|HeadersTimeout|BodyTimeout/i.test(c + " " + msg)) return "PROVIDER_TIMEOUT";
  return "NETWORK_UNAVAILABLE";
}
function classifyStatus(status, raw) {
  if (status === 200) return "OK"; if (status === 401 || status === 403) return "PROVIDER_AUTH_ERROR"; if (status === 404) return "PROVIDER_ROUTE_NOT_FOUND";
  if (status === 400 && /credit balance/i.test(raw || "")) return "PROVIDER_CREDIT_EXHAUSTED"; if (status === 429) return "PROVIDER_RATE_LIMITED"; if (status === 503 || status === 529) return "PROVIDER_CAPACITY";
  if (status >= 500) return "PROVIDER_UNAVAILABLE"; return "PROVIDER_UNAVAILABLE";
}
const errorFor = (code, detail) => { const e = new Error(code + (detail ? ": " + detail : "")); e.code = code; e.userMessage = USER[code] || USER.PROVIDER_UNAVAILABLE; return e; };

/**
 * probeWorker({ env?, timeoutMs?, fetchImpl? }) — sonde GRATUITE (aucun appel amont) : corps `{}` refuse par le Worker APRES l'authentification.
 * ready = reachable && authOk. Ne journalise ni ne rend jamais la clef.
 */
async function probeWorker(opts) {
  opts = opts || {}; const env = opts.env || process.env; const f = opts.fetchImpl || fetch; const t0 = Date.now();
  const cs = credentialsStatus(env); if (!cs.usable) return { ready: false, reachable: false, authOk: false, code: cs.code, userMessage: cs.userMessage, httpStatus: null, ms: 0, credentials: cs, checkedAt: new Date().toISOString() };
  const base = env.LLM_WORKER_BASE_URL.replace(/\/$/, ""); const ac = new AbortController(); let to = false; const timer = setTimeout(() => { to = true; ac.abort(); }, Number(opts.timeoutMs || 15000));
  let res, raw; try { res = await f(base + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.EVIDENCEFORGE_WORKER_API_KEY, "x-evidenceforge-request-id": "efm-diag-" + Date.now().toString(36) }, body: "{}", signal: ac.signal }); raw = await res.text(); }
  catch (e) { clearTimeout(timer); const code = classifyFetchError(e, to); return { ready: false, reachable: false, authOk: false, code, userMessage: USER[code], httpStatus: null, ms: Date.now() - t0, credentials: cs, detail: String(e && (e.cause && e.cause.code || e.message)).slice(0, 120), checkedAt: new Date().toISOString() }; }
  clearTimeout(timer); const ms = Date.now() - t0; let j = null; try { j = JSON.parse(raw); } catch (e) { j = null; }
  const isWorker = !!(res.headers.get("x-evidenceforge-proxy") || (j && (j.error === "invalid_request" || j.error === "unauthorized" || j.error === "rate_limiter_unavailable" || j.error === "rate_limited")));
  if (res.status === 400 && j && j.error === "invalid_request") return { ready: true, reachable: true, authOk: true, code: "OK", userMessage: "Worker joignable, clé acceptée (sonde gratuite : aucun appel amont).", httpStatus: 400, ms, credentials: cs, checkedAt: new Date().toISOString() };
  if (res.status === 401 || res.status === 403) return { ready: false, reachable: true, authOk: false, code: "PROVIDER_AUTH_ERROR", userMessage: USER.PROVIDER_AUTH_ERROR, httpStatus: res.status, ms, credentials: cs, checkedAt: new Date().toISOString() };
  if (res.status === 404 || !isWorker && res.status !== 429 && res.status !== 503) return { ready: false, reachable: true, authOk: false, code: "PROVIDER_ROUTE_NOT_FOUND", userMessage: USER.PROVIDER_ROUTE_NOT_FOUND, httpStatus: res.status, ms, credentials: cs, checkedAt: new Date().toISOString() };
  const code = res.status === 429 ? "PROVIDER_RATE_LIMITED" : (res.status === 503 ? "PROVIDER_CAPACITY" : "PROVIDER_UNAVAILABLE");
  return { ready: false, reachable: true, authOk: null, code, userMessage: USER[code] + (res.status === 503 ? " (limiteur de débit du worker indisponible : fail-closed côté worker)" : ""), httpStatus: res.status, ms, credentials: cs, checkedAt: new Date().toISOString() };
}

module.exports = { credentialsStatus, isPlaceholder, classifyFetchError, classifyStatus, probeWorker, errorFor, USER, PLACEHOLDER_PATTERNS };
