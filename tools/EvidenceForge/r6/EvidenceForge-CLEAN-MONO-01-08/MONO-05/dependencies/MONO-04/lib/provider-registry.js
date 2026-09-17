"use strict";

const { createExternalExecutionError } = require("./external-execution-errors.js");

// ProviderRegistry — CDC MONO-04 sections 5, 7, 35. Contient uniquement de
// la CONFIGURATION technique (endpoint, timeoutMs, retryPolicy, nom du
// secret requis) — jamais un secret lui-même, jamais une logique métier.
// Chaque config est gelée (Object.freeze) dès l'enregistrement : "provider
// config immutable during request" (T04-35).

function validateProviderConfig(providerId, cfg) {
  if (!cfg || typeof cfg.endpoint !== "string" || !cfg.endpoint) {
    throw new Error(`createProviderRegistry: config invalide pour "${providerId}" — endpoint (string) requis.`);
  }
  if (typeof cfg.timeoutMs !== "number" || !Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0) {
    throw new Error(`createProviderRegistry: config invalide pour "${providerId}" — timeoutMs doit être un nombre fini positif (pas d'attente infinie, section 11).`);
  }
  if (cfg.retryPolicy) {
    const maxAttempts = cfg.retryPolicy.maxAttempts;
    if (typeof maxAttempts !== "number" || !Number.isFinite(maxAttempts) || maxAttempts < 1) {
      throw new Error(`createProviderRegistry: retryPolicy.maxAttempts invalide pour "${providerId}" — doit être un entier fini >= 1, jamais un retry illimité (section 12).`);
    }
  }
}

function createProviderRegistry(providerConfigs) {
  const configs = new Map();
  for (const [id, cfg] of Object.entries(providerConfigs || {})) {
    validateProviderConfig(id, cfg);
    configs.set(id, Object.freeze({ ...cfg, retryPolicy: cfg.retryPolicy ? Object.freeze({ ...cfg.retryPolicy }) : undefined }));
  }

  return {
    schema: "EvidenceForge.ProviderRegistry",

    getProviderConfig(providerId) {
      const cfg = configs.get(providerId);
      if (!cfg) {
        throw createExternalExecutionError("PROVIDER_NOT_CONFIGURED", `getProviderConfig: aucun provider configuré sous "${providerId}" — jamais un provider par défaut deviné.`, { providerId });
      }
      return cfg;
    },

    hasProvider(providerId) {
      return configs.has(providerId);
    },

    listProviders() {
      return [...configs.keys()];
    },
  };
}

module.exports = { createProviderRegistry };
