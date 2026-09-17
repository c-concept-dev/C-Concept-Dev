"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-16 — Recherche statique : JMJS / "Je marche comme je suis" / S01 / S02 /
// DIMS / d4 / d5 dans le cœur MONO-01 (lib/ + ports/ + index.js). Toute
// occurrence FONCTIONNELLE (hors commentaire expliquant explicitement une
// absence/généralisation) doit être bloquante.
//
// PROVENANCE.md et registry/mono-00-frozen-baseline-registry-v1.json sont
// exclus : ce sont des documents de traçabilité qui CITENT légitimement ces
// termes en tant qu'historique gelé (ex : "REJECTED_FOR_CORE ... JMJS"),
// jamais du code fonctionnel de MONO-01.

const CORE_DIRS = ["lib", "ports"];
const CORE_FILES = ["index.js"];
const FORBIDDEN_PATTERNS = [
  { name: "JMJS", re: /JMJS/i },
  { name: "Je marche comme je suis", re: /je marche comme je suis/i },
  { name: "S01", re: /\bS01\b/ },
  { name: "S02", re: /\bS02\b/ },
  { name: "DIMS (constante)", re: /\bconst\s+DIMS\b|\bDIMS\s*=\s*\[/ },
  { name: "d4 (dimension pilote)", re: /["'`]d4["'`]/ },
  { name: "d5 (dimension pilote)", re: /["'`]d5["'`]/ },
];

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const root = path.join(__dirname, "..");
const files = [
  ...CORE_DIRS.flatMap((d) => listJsFiles(path.join(root, d))),
  ...CORE_FILES.map((f) => path.join(root, f)),
];

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    const m = src.match(pattern.re);
    if (m) findings.push({ file: path.relative(root, file), pattern: pattern.name, match: m[0] });
  }
}

check(
  "1. aucun fichier du cœur MONO-01 (lib/, ports/, index.js) ne contient JMJS/S01/S02/DIMS/d4/d5",
  findings.length === 0,
  JSON.stringify(findings)
);
check("2. " + files.length + " fichiers examinés (au moins 15 attendus : 14 ports + lib + index)", files.length >= 15, String(files.length));

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
if (failed.length) {
  console.log("\nECHECS : " + failed.length);
  process.exit(1);
} else {
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
}
