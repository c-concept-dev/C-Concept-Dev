"use strict";
/**
 * MONO-06 — package-presence-checker.js  (T06-01, T06-02)
 *
 * Verifie la presence physique de chaque ZIP canonique attendu dans
 * 04-ARTEFACTS-CANONIQUES/. Si un artefact attendu est absent : STOP,
 * rapporter, jamais fabriquer un ZIP de substitution (principe
 * anti-derive du CDC MONO-06).
 */

const fs = require("fs");
const path = require("path");

function checkPresence(kitRoot, artifacts) {
  const results = artifacts.map((a) => {
    const abs = path.join(kitRoot, a.zipPath);
    const exists = fs.existsSync(abs);
    return {
      id: a.id,
      group: a.group,
      zipPath: a.zipPath,
      status: exists ? "PRESENT" : "MISSING",
      sizeBytes: exists ? fs.statSync(abs).size : null
    };
  });
  const missing = results.filter((r) => r.status === "MISSING");
  return { status: missing.length === 0 ? "PASS" : "FAIL", results, missing };
}

module.exports = { checkPresence };
