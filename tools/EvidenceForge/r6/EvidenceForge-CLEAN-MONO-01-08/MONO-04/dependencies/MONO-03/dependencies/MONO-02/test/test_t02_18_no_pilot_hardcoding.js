"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const root = path.join(__dirname, "..");
const CORE_DIRS = ["lib"];
const CORE_FILES = ["graph/mono-02-orchestration-graph-v1.json"];

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

const files = [...CORE_DIRS.flatMap((d) => listJsFiles(path.join(root, d))), ...CORE_FILES.map((f) => path.join(root, f))];

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    const m = src.match(pattern.re);
    if (m) findings.push({ file: path.relative(root, file), pattern: pattern.name, match: m[0] });
  }
}

check("1. aucun fichier du cœur MONO-02 (lib/, graphe) ne contient JMJS/S01/S02/DIMS/d4/d5", findings.length === 0, JSON.stringify(findings));
check("2. " + files.length + " fichiers examinés", files.length >= 5, String(files.length));

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
