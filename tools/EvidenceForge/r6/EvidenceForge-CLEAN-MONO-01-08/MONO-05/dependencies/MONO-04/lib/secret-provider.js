"use strict";

const { createExternalExecutionError } = require("./external-execution-errors.js");

// SecretProvider — CDC MONO-04 section 6. Aucune clé API, aucun token,
// aucun secret codé en dur nulle part dans ce dépôt. Les secrets sont
// injectés côté runtime — cette abstraction ne fait que les résoudre, elle
// ne les stocke ni ne les construit jamais elle-même.
function createEnvSecretProvider(options) {
  const opts = options || {};
  const env = opts.env || process.env; // injectable pour les tests, jamais un accès global caché ailleurs

  return {
    schema: "EvidenceForge.SecretProvider",
    bindingType: "ENV_VAR",

    getSecret(secretName) {
      if (!secretName) {
        throw createExternalExecutionError("SECRET_UNAVAILABLE", "getSecret: secretName manquant — jamais une résolution silencieuse d'un secret non nommé.", {});
      }
      const value = env[secretName];
      if (value === undefined || value === null || value === "") {
        throw createExternalExecutionError("SECRET_UNAVAILABLE", `getSecret: le secret "${secretName}" est absent de l'environnement — jamais un fallback vers une valeur codée en dur.`, { secretName });
      }
      return value;
    },

    hasSecret(secretName) {
      const value = env[secretName];
      return value !== undefined && value !== null && value !== "";
    },
  };
}

// createStaticSecretProvider(secrets) — RÉSERVÉ AUX TESTS. Les valeurs
// doivent être des fixtures explicitement synthétiques (jamais un vrai
// secret). Jamais utilisé comme secours implicite par le Gateway lui-même.
function createStaticSecretProvider(secrets) {
  const map = { ...(secrets || {}) };
  return {
    schema: "EvidenceForge.SecretProvider",
    bindingType: "STATIC_TEST_ONLY",
    getSecret(secretName) {
      if (!Object.prototype.hasOwnProperty.call(map, secretName) || map[secretName] === undefined || map[secretName] === null || map[secretName] === "") {
        throw createExternalExecutionError("SECRET_UNAVAILABLE", `getSecret: le secret "${secretName}" est absent (provider de test).`, { secretName });
      }
      return map[secretName];
    },
    hasSecret(secretName) {
      return Object.prototype.hasOwnProperty.call(map, secretName) && !!map[secretName];
    },
  };
}

module.exports = { createEnvSecretProvider, createStaticSecretProvider };
