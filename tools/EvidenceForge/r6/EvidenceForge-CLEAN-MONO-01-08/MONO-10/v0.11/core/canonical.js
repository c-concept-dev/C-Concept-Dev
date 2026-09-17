"use strict";
/**
 * MONO-10 v0.5 — core/canonical.js
 *
 * Primitives partagees. Un seul endroit definit la forme canonique et
 * l'empreinte : deux definitions concurrentes produiraient deux verites.
 */
const crypto = require("crypto");

function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function fail(code, message, details) { const e = new Error(code + ": " + message); e.code = code; e.details = details || null; return e; }

/** JSON canonique : cles triees, undefined elimine, ordre des tableaux conserve. */
function canonical(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v) === undefined ? "null" : JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
function sha256Of(obj) { return crypto.createHash("sha256").update(canonical(obj)).digest("hex"); }
function sha256Hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
const isHash = (h) => /^[0-9a-f]{64}$/.test(String(h || ""));

/** Empreinte d'un artefact : toujours calculee HORS de ses enveloppes de liaison. */
const ENVELOPE_FIELDS = ["runBinding", "trustEnvelope"];
function bareArtifact(a) {
  const b = Object.assign({}, a);
  ENVELOPE_FIELDS.forEach((f) => { delete b[f]; });
  return b;
}
function artifactHash(a) { return sha256Of(bareArtifact(a)); }

module.exports = { canonical, sha256Of, sha256Hex, artifactHash, bareArtifact, isNonEmptyStr, isHash, fail, ENVELOPE_FIELDS };
