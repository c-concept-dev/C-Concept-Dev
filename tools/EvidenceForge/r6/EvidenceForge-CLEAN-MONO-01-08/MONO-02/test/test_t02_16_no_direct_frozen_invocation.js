"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T02-16 — Aucune invocation directe des modules gelés hors MONO-01. Le
// cœur de MONO-02 (lib/) ne doit JAMAIS require() un fichier sous
// dependencies/MONO-01/dependencies/ (le code gelé interne de MONO-01) —
// seulement dependencies/MONO-01/index.js ou dependencies/MONO-01/ports/*.js.
//
// test/ est explicitement HORS PÉRIMÈTRE de ce contrôle : le rôle du
// harnais de test est justement de fabriquer des objets gelés VALIDES pour
// simuler ce qu'un opérateur fournirait à l'entrée du graphe (ex :
// construire un MissionDimensionSet de test) — jamais d'orchestrer quoi que
// ce soit. C'est une distinction déjà appliquée par MONO-01 lui-même
// (dependencies/ y sont utilisées par les ports, jamais par les tests
// directement pour simuler la logique métier d'un autre port).

const root = path.join(__dirname, "..");
const CORE_DIRS = ["lib"];

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = CORE_DIRS.flatMap((d) => listJsFiles(path.join(root, d)));
check("0. au moins 4 fichiers examinés dans lib/", files.length >= 4, String(files.length));

const FORBIDDEN_REQUIRE = /require\(\s*["'`][^"'`]*dependencies\/MONO-01\/dependencies\//;
const ALLOWED_REQUIRE = /require\(\s*["'`](\.\.\/)*dependencies\/MONO-01\/(index\.js|ports\/)/;

const violations = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (FORBIDDEN_REQUIRE.test(line)) {
      violations.push({ file: path.relative(root, file), line: i + 1, text: line.trim() });
    }
  });
}

check("1. aucun fichier de lib/ ne require() directement dependencies/MONO-01/dependencies/ (code gelé interne à MONO-01)", violations.length === 0, JSON.stringify(violations));

// Confirmation positive : lib/node-runners.js require() bien MONO-01 via
// son point d'entrée légitime (index.js n'est pas requis directement par
// node-runners.js — il reçoit `mono01` déjà construit en paramètre — mais
// on vérifie qu'aucun require() vers dependencies/MONO-01/dependencies/
// n'existe nulle part, et que les seuls require() de node-runners.js sont
// internes à MONO-02 lui-même).
const nodeRunnersSrc = fs.readFileSync(path.join(root, "lib", "node-runners.js"), "utf8");
const requireLines = [...nodeRunnersSrc.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);
check(
  "2. lib/node-runners.js n'importe rien depuis dependencies/MONO-01/dependencies/ (seulement des méthodes reçues via mono01.<port>.*)",
  requireLines.every((r) => !r.includes("dependencies/MONO-01/dependencies")),
  JSON.stringify(requireLines)
);

// lib/orchestration-engine.js ne doit importer que node-runners.js, state-machine.js, orchestration-errors.js, fs.
const engineSrc = fs.readFileSync(path.join(root, "lib", "orchestration-engine.js"), "utf8");
const engineRequires = [...engineSrc.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);
check(
  "3. lib/orchestration-engine.js n'importe que des modules internes à MONO-02 (fs, ./state-machine, ./orchestration-errors, ./node-runners)",
  engineRequires.every((r) => r === "fs" || r.startsWith("./")),
  JSON.stringify(engineRequires)
);

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
