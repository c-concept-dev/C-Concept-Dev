"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

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

const SIMPLE_PATTERNS = [
  { name: "truthScore", re: /\btruthScore\b/i },
  { name: "majority", re: /\bmajority\b/i },
  { name: "prestige", re: /\bprestige\b/i },
  { name: "vote", re: /\bvote[sd]?\b/i },
  { name: "consensus", re: /\bconsensus\b/i },
  { name: "expertScore", re: /\bexpertScore\b/i },
];
const SCIENTIFIC_VALIDITY_TRUE = /scientificValidity["']?\s*[:=]\s*true/;
const PROHIBITION_HINTS = /jamais|n'ajoute|interdit|ne doit pas|aucune logique|\baucun[e]?\b/i;

function classifyLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//")) return PROHIBITION_HINTS.test(line) ? "comment_prohibition" : "comment_other";
  return "functional_code";
}

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const pattern of SIMPLE_PATTERNS) {
    lines.forEach((line, i) => {
      if (pattern.re.test(line)) findings.push({ file: path.relative(root, file), line: i + 1, pattern: pattern.name, classification: classifyLine(line) });
    });
  }
  lines.forEach((line, i) => {
    if (SCIENTIFIC_VALIDITY_TRUE.test(line)) findings.push({ file: path.relative(root, file), line: i + 1, pattern: "scientificValidity=true", classification: classifyLine(line) });
  });
}

const functionalViolations = findings.filter((f) => f.classification === "functional_code");
check("1. aucune occurrence fonctionnelle de truthScore/majority/prestige/vote/consensus/expertScore/scientificValidity=true dans lib/", functionalViolations.length === 0, JSON.stringify(functionalViolations));
check("2. les occurrences restantes (s'il y en a) sont toutes des commentaires d'interdiction explicite", findings.every((f) => f.classification === "comment_prohibition"), JSON.stringify(findings.filter((f) => f.classification !== "comment_prohibition")));

// Vérification complémentaire : les 6 statuts techniques du CDC section 6
// n'incluent explicitement aucun de ces termes métier.
const stateMachineSrc = fs.readFileSync(path.join(root, "lib", "state-machine.js"), "utf8");
check("3. les 7 états déclarés dans state-machine.js sont strictement techniques (aucun état métier)", ["NOT_STARTED", "READY", "RUNNING", "SUCCESS", "FAILED", "BLOCKED", "PAUSED"].every((s) => stateMachineSrc.includes(s)) && !/scientifically_valid|expert_validated|trusted\b/i.test(stateMachineSrc));

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
