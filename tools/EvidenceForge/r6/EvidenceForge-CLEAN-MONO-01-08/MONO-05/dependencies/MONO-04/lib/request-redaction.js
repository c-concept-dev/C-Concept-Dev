"use strict";

// request-redaction.js — CDC MONO-04 section 14. Retire systématiquement
// toute valeur sensible avant qu'un objet ne soit journalisé — jamais une
// liste blanche implicite (on masque, on n'autorise pas explicitement).
const SENSITIVE_HEADER_NAMES = ["authorization", "x-api-key", "api-key", "apikey", "x-secret", "cookie", "set-cookie"];
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|secret|token|password|bearer)/i;
const REDACTED = "[REDACTED]";

function redactHeaders(headers) {
  if (!headers || typeof headers !== "object") return headers;
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.includes(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

function redactValue(value, depth) {
  depth = depth || 0;
  if (depth > 20) return "[TROP_PROFOND]";
  if (typeof value === "string") {
    if (/^Bearer\s+\S+/i.test(value)) return "Bearer " + REDACTED;
    if (/^sk-[A-Za-z0-9]/.test(value)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function buildTechnicalLogEntry({ requestId, provider, operation, status, durationMs, httpStatus, errorCode }) {
  return {
    requestId: requestId || null,
    provider: provider || null,
    operation: operation || null,
    status: status || null,
    durationMs: typeof durationMs === "number" ? durationMs : null,
    httpStatus: httpStatus != null ? httpStatus : null,
    errorCode: errorCode || null,
  };
}

module.exports = { redactHeaders, redactValue, buildTechnicalLogEntry, SENSITIVE_HEADER_NAMES, SENSITIVE_KEY_PATTERN };
