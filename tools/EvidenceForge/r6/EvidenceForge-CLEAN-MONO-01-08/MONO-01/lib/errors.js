"use strict";

// Taxonomie technique d'intégration — CDC MONO-01 section 7.
// Aucune catégorie métier n'est ajoutée ici : ces codes qualifient un échec
// d'intégration (frontière, contrat, dépendance), jamais un jugement sur le
// contenu documentaire ou l'analyse produite par un lot gelé.
const ERROR_CODES = Object.freeze([
  "INTEGRATION_CONTRACT_ERROR",
  "SCHEMA_VERSION_MISMATCH",
  "MISSING_REQUIRED_INPUT",
  "MISSION_ID_MISMATCH",
  "DEPENDENCY_UNAVAILABLE",
  "MODULE_NOT_IN_BASELINE",
  "MODULE_VERSION_MISMATCH",
  "INVALID_MODULE_OUTPUT",
  "LINEAGE_BLOCKED",
]);

// Codes qui doivent aboutir à un statut d'exécution BLOCKED plutôt que FAILED :
// la frontière n'a jamais été franchie, le module gelé n'a jamais été appelé.
const BLOCKING_CODES = new Set([
  "MODULE_NOT_IN_BASELINE",
  "MODULE_VERSION_MISMATCH",
  "MISSING_REQUIRED_INPUT",
  "SCHEMA_VERSION_MISMATCH",
  "MISSION_ID_MISMATCH",
  "DEPENDENCY_UNAVAILABLE",
  "LINEAGE_BLOCKED",
]);

function createIntegrationError(code, message, details) {
  if (!ERROR_CODES.includes(code)) {
    throw new Error(
      `errors.js: code d'erreur d'intégration inconnu "${code}" — ` +
        `aucune nouvelle catégorie métier ne doit être introduite hors de la taxonomie CDC section 7.`
    );
  }
  return {
    schema: "EvidenceForge.IntegrationError",
    schemaVersion: "MONO-01-v1",
    code,
    message,
    details: details || {},
  };
}

function statusForCode(code) {
  return BLOCKING_CODES.has(code) ? "BLOCKED" : "FAILED";
}

module.exports = { ERROR_CODES, BLOCKING_CODES, createIntegrationError, statusForCode };
