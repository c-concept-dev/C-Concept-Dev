"use strict";

// Taxonomie d'erreurs d'orchestration — CDC MONO-02 section ERREURS.
// Ajoutée UNIQUEMENT par-dessus la taxonomie MONO-01, jamais une refonte.
const ORCHESTRATION_ERROR_CODES = Object.freeze([
  "INVALID_STATE_TRANSITION",
  "NODE_NOT_READY",
  "UPSTREAM_NOT_SUCCESS",
  "ORCHESTRATION_BLOCKED",
]);

function createOrchestrationError(code, message, details) {
  if (!ORCHESTRATION_ERROR_CODES.includes(code)) {
    throw new Error(
      `orchestration-errors.js: code inconnu "${code}" — aucune nouvelle taxonomie métier ne doit être introduite hors de ces 4 codes.`
    );
  }
  return {
    schema: "EvidenceForge.OrchestrationError",
    schemaVersion: "MONO-02-v1",
    code,
    message,
    details: details || {},
  };
}

module.exports = { ORCHESTRATION_ERROR_CODES, createOrchestrationError };
