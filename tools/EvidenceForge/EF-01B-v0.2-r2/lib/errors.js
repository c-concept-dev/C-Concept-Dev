"use strict";
// EF-01B-v0.2-r1 — lib/errors.js
// Ajoute, par rapport a v0.2 : TRANSPORT_PROVENANCE_MISMATCH (F-04) et
// MODEL_PROVENANCE_MISMATCH (F-03) — jamais un code invente en dehors de
// cette liste explicite.

const CODES = [
  "LLM_PROVIDER_UNAVAILABLE",
  "LLM_AUTH_FAILED",
  "LLM_HTTP_ERROR",
  "LLM_RESPONSE_INVALID",
  "LLM_OUTPUT_SCHEMA_INVALID",
  "RESOLVER_OUTPUT_INVALID",
  "PROMPT_VERSION_MISMATCH",
  "MODEL_PROVENANCE_MISMATCH",
  "TRANSPORT_PROVENANCE_MISMATCH",
];

function ef01bError(code, message, details) {
  if (CODES.indexOf(code) === -1) {
    throw new Error("ef01bError: code inconnu \"" + code + "\" — jamais un code invente en dehors de la liste.");
  }
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  err.details = details || {};
  return err;
}

module.exports = { CODES: CODES, ef01bError: ef01bError };
