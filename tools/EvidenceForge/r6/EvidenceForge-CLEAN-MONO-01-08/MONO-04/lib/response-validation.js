"use strict";

const { createExternalExecutionError } = require("./external-execution-errors.js");

// response-validation.js — CDC MONO-04 section 15. Une réponse HTTP 200
// n'est jamais automatiquement un succès valide — statut, content-type,
// structure minimale et taille sont vérifiés AVANT que le résultat ne soit
// retourné au port appelant.

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 Mo — garde-fou générique

function validateHttpResponse({ httpStatus, headers, bodyText, expectedContentType, maxBytes }) {
  if (typeof httpStatus !== "number") {
    throw createExternalExecutionError("INVALID_EXTERNAL_RESPONSE", "validateHttpResponse: httpStatus manquant ou invalide.", {});
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    throw createExternalExecutionError("EXTERNAL_HTTP_ERROR", `validateHttpResponse: statut HTTP ${httpStatus} — jamais traité comme un succès.`, { httpStatus });
  }

  const limit = typeof maxBytes === "number" ? maxBytes : DEFAULT_MAX_RESPONSE_BYTES;
  const byteLength = Buffer.byteLength(bodyText || "", "utf8");
  if (byteLength > limit) {
    throw createExternalExecutionError("INVALID_EXTERNAL_RESPONSE", `validateHttpResponse: réponse de ${byteLength} octets dépasse la limite de ${limit} — rejetée avant tout traitement.`, { byteLength, limit });
  }

  const contentType = (headers && (headers["content-type"] || headers["Content-Type"])) || "";
  const expected = expectedContentType || "application/json";
  if (!contentType.toLowerCase().includes(expected.toLowerCase())) {
    throw createExternalExecutionError(
      "INVALID_EXTERNAL_RESPONSE",
      `validateHttpResponse: content-type "${contentType}" ne correspond pas à "${expected}" attendu — une page d'erreur HTML en 200 n'est jamais acceptée comme JSON.`,
      { contentType, expected }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (e) {
    throw createExternalExecutionError("INVALID_EXTERNAL_RESPONSE", `validateHttpResponse: JSON malformé ou tronqué — ${String(e && e.message)}`, { parseError: String(e && e.message) });
  }

  return parsed;
}

function validateJsonShape(parsed, requiredKeys) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createExternalExecutionError("INVALID_EXTERNAL_RESPONSE", "validateJsonShape: la réponse JSON n'est pas un objet.", { received: typeof parsed });
  }
  const missing = (requiredKeys || []).filter((k) => !Object.prototype.hasOwnProperty.call(parsed, k));
  if (missing.length) {
    throw createExternalExecutionError("INVALID_EXTERNAL_RESPONSE", `validateJsonShape: champ(s) attendu(s) manquant(s) : ${missing.join(", ")}.`, { missing });
  }
  return parsed;
}

module.exports = { validateHttpResponse, validateJsonShape, DEFAULT_MAX_RESPONSE_BYTES };
