"use strict";
/**
 * MONO-08 — lib/real-provider-configs.js
 *
 * Configurations REELLES pour le vrai Gateway MONO-04, jamais un endpoint
 * synthetique/localhost. Fail-closed explicite (section 10 du CDC).
 *
 * MONO-08 v0.6 (CDC MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md, section 6) :
 * la configuration "llm-worker" varie selon LLM_AUTH_MODE. Le Gateway
 * MONO-04 (lib/external-execution-gateway.js, INCHANGE) reste totalement
 * agnostique du nom du secret : il lit `providerConfig.requiredSecret`
 * comme une simple clé, appelle `secretProvider.getSecret(requiredSecret)`,
 * et construit lui-meme le header sortant `Authorization: Bearer
 * <secretValue>` (voir performHttpCall() dans MONO-04, lu en lecture seule,
 * jamais modifie). C'est pourquoi le mode "delegated" ci-dessous ne fait
 * que changer la VALEUR de `requiredSecret` (EVIDENCEFORGE_WORKER_API_KEY
 * au lieu de ANTHROPIC_API_KEY) et laisse la forme de configuration
 * consommee par MONO-04 strictement identique : { endpoint, timeoutMs,
 * method, requiredSecret, retryPolicy, headers }. Aucune modification de
 * MONO-04 n'est necessaire ni effectuee.
 */

const VALID_AUTH_MODES = ["direct", "delegated"];

function resolveAuthMode(env) {
  const raw = env.LLM_AUTH_MODE;
  if (raw === undefined || raw === null || raw === "") {
    return { mode: "direct", valid: true };
  }
  if (VALID_AUTH_MODES.indexOf(raw) !== -1) {
    return { mode: raw, valid: true };
  }
  return { mode: null, valid: false, rawValue: raw };
}

function assertNotLocalOrSynthetic(name, url) {
  if (/localhost|127\.0\.0\.1|synthetic|mock|fixture/i.test(url)) {
    throw new Error(
      "MONO-08 REAL_SMOKE fail-closed: le provider \"" + name + "\" pointe vers \"" + url + "\" - " +
      "une configuration synthetique/locale ne peut jamais etre utilisee pour un Real Smoke " +
      "(section 10 du CDC : aucun mock/fixture/localhost autorise en mode REAL_SMOKE)."
    );
  }
}

function buildLlmWorkerConfigDirect(llmUrl, timeoutMs) {
  return {
    endpoint: llmUrl + "/v1/messages",
    timeoutMs: timeoutMs,
    method: "POST",
    requiredSecret: "ANTHROPIC_API_KEY",
    retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    headers: { "anthropic-version": "2023-06-01" },
  };
}

function buildLlmWorkerConfigDelegated(llmUrl, timeoutMs) {
  // MONO-08 v0.6 — mode delegated (CDC section 4.3.1.A) : ANTHROPIC_API_KEY
  // n'apparait JAMAIS dans cette fonction — ni lue, ni referencee, ni
  // construite dans un header. Seul le NOM "EVIDENCEFORGE_WORKER_API_KEY"
  // est utilise, et uniquement comme cle de secret transmise au Gateway
  // MONO-04 (inchange) qui la resout lui-meme via son propre
  // secretProvider.getSecret(). MONO-08 ne detient ni ne manipule la valeur
  // ici.
  return {
    endpoint: llmUrl + "/v1/messages",
    timeoutMs: timeoutMs,
    method: "POST",
    requiredSecret: "EVIDENCEFORGE_WORKER_API_KEY",
    retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
    headers: {},
  };
}

function buildRealProviderConfigs(env) {
  env = env || process.env;
  const timeoutMs = parseInt(env.EVIDENCEFORGE_HTTP_TIMEOUT_MS || "8000", 10);

  const openalexUrl = env.OPENALEX_BASE_URL || "https://api.openalex.org";
  const crossrefUrl = env.CROSSREF_BASE_URL || "https://api.crossref.org";
  const llmUrl = env.LLM_WORKER_BASE_URL || "https://api.anthropic.com";

  const authModeResolution = resolveAuthMode(env);
  if (!authModeResolution.valid) {
    // CDC section 4.1, applique ici de la meme facon qu'au preflight :
    // une valeur LLM_AUTH_MODE explicite non reconnue ne construit AUCUNE
    // configuration provider et ne retombe JAMAIS silencieusement sur
    // "direct". Leve avant assertNotLocalOrSynthetic() et avant toute
    // construction d'objet de configuration — donc avant toute possibilite
    // d'appel reseau par un appelant de cette fonction.
    throw new Error(
      "LLM_AUTH_MODE invalide: \"" + authModeResolution.rawValue + "\" " +
      "(valeurs autorisees : absente -> direct, \"direct\", \"delegated\") — " +
      "PRODUCT_CONFIG_ERROR, aucune configuration provider construite, aucune requete reseau."
    );
  }

  assertNotLocalOrSynthetic("openalex", openalexUrl);
  assertNotLocalOrSynthetic("crossref", crossrefUrl);
  assertNotLocalOrSynthetic("llm-worker", llmUrl);

  return {
    openalex: { endpoint: openalexUrl, timeoutMs: timeoutMs, method: "GET", retryPolicy: { maxAttempts: 3, backoffMs: 1000 } },
    crossref: { endpoint: crossrefUrl, timeoutMs: timeoutMs, method: "GET", retryPolicy: { maxAttempts: 3, backoffMs: 1000 } },
    "llm-worker": authModeResolution.mode === "delegated"
      ? buildLlmWorkerConfigDelegated(llmUrl, timeoutMs)
      : buildLlmWorkerConfigDirect(llmUrl, timeoutMs),
  };
}

module.exports = { buildRealProviderConfigs: buildRealProviderConfigs, assertNotLocalOrSynthetic: assertNotLocalOrSynthetic };
