"use strict";

// Taxonomie technique minimale — CDC MONO-04 section 18. Aucune catégorie
// métier n'est ajoutée.
const ERROR_CODES = Object.freeze([
  "EXTERNAL_DEPENDENCY_UNAVAILABLE",
  "SECRET_UNAVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "EXTERNAL_TIMEOUT",
  "EXTERNAL_NETWORK_ERROR",
  "EXTERNAL_HTTP_ERROR",
  "INVALID_EXTERNAL_RESPONSE",
  "EXTERNAL_RETRY_EXHAUSTED",
  "EXTERNAL_REQUEST_CONFLICT",
]);

function createExternalExecutionError(code, message, details) {
  if (!ERROR_CODES.includes(code)) {
    throw new Error(`external-execution-errors.js: code inconnu "${code}" — aucune nouvelle taxonomie métier ne doit être introduite hors de ces ${ERROR_CODES.length} codes.`);
  }
  return {
    schema: "EvidenceForge.ExternalExecutionError",
    schemaVersion: "MONO-04-v1",
    code,
    message,
    details: details || {},
  };
}

module.exports = { ERROR_CODES, createExternalExecutionError };
