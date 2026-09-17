"use strict";
/**
 * MONO-06 — contract-presence-checker.js  (T06-12)
 *
 * Verifie que chaque artefact possede des fichiers de contrat JSON
 * exploitables (presents, non vides, JSON valide), a l'exclusion des
 * copies imbriquees dependencies/... deja verifiees comme appartenant au
 * lot precedent (evite un double-compte artificiel).
 *
 * Approche generique : ne code en dur AUCUN nom de contrat specifique a
 * un lot (les noms different reellement d'un lot a l'autre — voir
 * inspection manuelle prealable), afin de ne jamais introduire de
 * nouvelle connaissance metier dans MONO-06. Un artefact sans aucun
 * fichier .json hors dependencies/ (ex: EF-ORCH, dont les contrats sont
 * des modules .js, pas des schemas JSON separes) est signale
 * NO_JSON_CONTRACTS_FOUND — statut informatif, jamais un FAIL automatique,
 * car MONO-06 ne doit pas inventer une exigence de forme que le lot gele
 * n'a jamais eue.
 */

const fs = require("fs");
const path = require("path");

function listJsonFilesExcludingDependencies(rootAbs) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dependencies" || entry.name === "node_modules") continue;
        walk(abs);
        continue;
      }
      if (path.extname(entry.name).toLowerCase() === ".json") out.push(abs);
    }
  })(rootAbs);
  return out;
}

function checkContracts(baselineDir, artifact) {
  const jsonFiles = listJsonFilesExcludingDependencies(baselineDir);
  const expected = artifact.expectedJsonContractCount;

  if (jsonFiles.length === 0) {
    // Absence totale de contrat JSON est un fait deja constate et attendu
    // pour certains lots (ex: EF-ORCH, dont les contrats sont des modules
    // .js) UNIQUEMENT si expected === 0 ; sinon c'est une vraie disparition.
    if (expected === 0) return { status: "NO_JSON_CONTRACTS_FOUND", filesChecked: 0, parseFailures: [], expected };
    return { status: "FAIL", filesChecked: 0, expected, reason: `0 contrat JSON trouve, ${expected} attendu(s) — disparition detectee` };
  }

  const parseFailures = [];
  for (const abs of jsonFiles) {
    const rel = path.relative(baselineDir, abs);
    try {
      const content = fs.readFileSync(abs, "utf8");
      if (content.trim().length === 0) {
        parseFailures.push({ file: rel, error: "fichier vide" });
        continue;
      }
      JSON.parse(content);
    } catch (e) {
      parseFailures.push({ file: rel, error: e.message });
    }
  }

  const countMismatch = typeof expected === "number" && jsonFiles.length < expected;
  const status = parseFailures.length === 0 && !countMismatch ? "PASS" : "FAIL";
  return {
    status,
    filesChecked: jsonFiles.length,
    expected,
    countMismatch,
    parseFailures
  };
}

module.exports = { checkContracts, listJsonFilesExcludingDependencies };
