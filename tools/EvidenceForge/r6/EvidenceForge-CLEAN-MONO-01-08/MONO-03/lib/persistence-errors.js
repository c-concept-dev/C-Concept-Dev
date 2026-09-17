"use strict";

// Taxonomie technique minimale — CDC MONO-03 section 20. Aucune catégorie
// métier n'est ajoutée : ces codes qualifient un échec de PERSISTANCE ou de
// COHÉRENCE d'état, jamais un jugement sur le contenu documentaire.
const ERROR_CODES = Object.freeze([
  "RUN_NOT_FOUND",
  "ARTIFACT_NOT_FOUND",
  "PERSISTENCE_BACKEND_UNAVAILABLE",
  "PERSISTENCE_WRITE_FAILED",
  "PERSISTENCE_READ_FAILED",
  "PERSISTED_ARTIFACT_MISMATCH",
  "RUN_STATE_CONFLICT",
  "RUN_LOCKED",
  "RESUME_NOT_ALLOWED",
  "RESUME_PLAN_INVALID",
  "SUCCESS_WITHOUT_ARTIFACT",
  "ARTIFACT_CONFLICT",
]);

function createPersistenceError(code, message, details) {
  if (!ERROR_CODES.includes(code)) {
    throw new Error(`persistence-errors.js: code inconnu "${code}" — aucune nouvelle taxonomie métier ne doit être introduite hors de ces ${ERROR_CODES.length} codes.`);
  }
  return {
    schema: "EvidenceForge.PersistenceError",
    schemaVersion: "MONO-03-v1",
    code,
    message,
    details: details || {},
  };
}

module.exports = { ERROR_CODES, createPersistenceError };
