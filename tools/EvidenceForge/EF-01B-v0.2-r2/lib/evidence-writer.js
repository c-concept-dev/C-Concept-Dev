"use strict";
// EF-01B-v0.2-r1 — lib/evidence-writer.js
// F-01/F-02 : un SEUL repertoire d'evidence par mission (pas par
// discipline) — le resolver v0.2-r1 fait UN appel LLM au niveau mission,
// qui propose plusieurs disciplines en une fois (contrairement a l'ancien
// v0.2, qui appelait une fois par discipline deja connue).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * writeResolverEvidence(evidenceRoot, evidence) — evidence : { inputObject,
 * promptText, rawResponseText, provenance, parsedOutput }. Ecrit sous
 * <evidenceRoot>/resolver/{input.json,prompt.txt,raw-response.txt,
 * provenance.json,parsed-output.json,SHA256SUMS.txt}.
 */
function writeResolverEvidence(evidenceRoot, evidence) {
  const dir = path.join(evidenceRoot, "resolver");
  fs.mkdirSync(dir, { recursive: true });

  const files = {
    "input.json": JSON.stringify(evidence.inputObject, null, 2),
    "prompt.txt": evidence.promptText,
    "raw-response.txt": evidence.rawResponseText,
    "provenance.json": JSON.stringify(evidence.provenance, null, 2),
    "parsed-output.json": JSON.stringify(evidence.parsedOutput, null, 2),
    "resolver-output.json": JSON.stringify(evidence.resolverOutput, null, 2),
  };

  const sums = [];
  Object.keys(files).forEach(function (name) {
    const full = path.join(dir, name);
    fs.writeFileSync(full, files[name]);
    sums.push(sha256Hex(files[name]) + "  " + name);
  });
  fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), sums.join("\n") + "\n");

  return dir;
}

module.exports = { writeResolverEvidence: writeResolverEvidence };
