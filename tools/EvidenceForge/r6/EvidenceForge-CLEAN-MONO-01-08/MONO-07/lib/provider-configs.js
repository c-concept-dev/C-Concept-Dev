"use strict";
/**
 * MONO-07 — provider-configs.js
 *
 * Construit les providerConfigs MONO-04 (ProviderRegistry) pointant vers le
 * serveur HTTP synthétique local, un provider distinct par scénario — pas
 * de secret requis (réseau localhost uniquement, section 2 : aucun accès
 * externe non contrôlé).
 */

function buildProviderConfigs(baseUrl, { timeoutMs = 3000, shortTimeoutMs = 300 } = {}) {
  const configs = {};
  for (const kind of ["worker", "openalex"]) {
    for (const scenario of ["success", "error", "invalid"]) {
      configs[`${kind}-${scenario}`] = {
        endpoint: `${baseUrl}/${kind}/${scenario}`,
        timeoutMs,
        method: "POST",
        retryPolicy: { maxAttempts: 1, backoffMs: 0 }
      };
    }
    // Timeout : timeoutMs volontairement court pour ne pas ralentir la
    // suite (le serveur ne répond jamais sur cette route — voir
    // synthetic-external-server.js) ; jamais un délai artificiel côté
    // serveur, c'est le vrai AbortController du Gateway qui se déclenche.
    configs[`${kind}-timeout`] = {
      endpoint: `${baseUrl}/${kind}/timeout`,
      timeoutMs: shortTimeoutMs,
      method: "POST",
      retryPolicy: { maxAttempts: 1, backoffMs: 0 }
    };
  }
  configs["worker-with-secret"] = {
    endpoint: `${baseUrl}/worker/success`,
    timeoutMs,
    method: "POST",
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    requiredSecret: "SYNTHETIC_MONO07_SECRET_NAME"
  };
  return configs;
}

module.exports = { buildProviderConfigs };
