"use strict";
// EF-01C1-v0.2-r1 — lib/errors.js — voir EF-01B-v0.2-r1/lib/errors.js.
// Ajoute MODEL_PROVENANCE_MISMATCH (F-03) et TRANSPORT_PROVENANCE_MISMATCH
// (F-04) par rapport a v0.2.

const CODES = [
  "LLM_PROVIDER_UNAVAILABLE",
  "LLM_AUTH_FAILED",
  "LLM_HTTP_ERROR",
  "LLM_RESPONSE_INVALID",
  "LLM_OUTPUT_SCHEMA_INVALID",
  "PROMPT_VERSION_MISMATCH",
  "PLANNER_OUTPUT_INVALID",
  "MODEL_PROVENANCE_MISMATCH",
  "TRANSPORT_PROVENANCE_MISMATCH",
  // EF-01C1-v0.2-r2 / F-C1-R2-04 : un appel REEL ne peut jamais retomber
  // silencieusement sur un modele par defaut. Ajout ADDITIF a la liste r1.
  "REAL_MODEL_NOT_EXPLICIT",
];

function ef01c1Error(code, message, details) {
  if (CODES.indexOf(code) === -1) {
    throw new Error("ef01c1Error: code inconnu \"" + code + "\" — jamais un code invente en dehors de la liste.");
  }
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  err.details = details || {};
  return err;
}

module.exports = { CODES: CODES, ef01c1Error: ef01c1Error };
