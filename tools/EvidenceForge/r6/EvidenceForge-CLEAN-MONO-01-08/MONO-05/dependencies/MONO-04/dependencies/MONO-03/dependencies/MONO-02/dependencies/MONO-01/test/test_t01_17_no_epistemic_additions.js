"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-17 — Recherche : truthScore / majority / prestige / vote / consensus /
// expertScore / scientificValidity=true dans la nouvelle couche (lib/, ports/,
// index.js). Aucune logique de ce type ne doit apparaître.
//
// Note : "scientificValidity" en tant que TERME apparaît légitimement dans
// les commentaires de ports.js qui EXPLIQUENT l'invariant ("jamais
// scientificValidity=true") — ce test cible spécifiquement une AFFECTATION
// scientificValidity=true / scientificValidity: true, jamais la simple
// mention du nom du champ dans une phrase de commentaire interdisant sa
// falsification.

const CORE_DIRS = ["lib", "ports"];
const CORE_FILES = ["index.js"];

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

const SIMPLE_PATTERNS = [
  { name: "truthScore", re: /\btruthScore\b/i },
  { name: "majority (logique de vote)", re: /\bmajority\b/i },
  { name: "prestige", re: /\bprestige\b/i },
  { name: "vote", re: /\bvote[sd]?\b/i },
  { name: "consensus (comme mécanisme numérique)", re: /\bconsensus\b/i },
  { name: "expertScore", re: /\bexpertScore\b/i },
];
const SCIENTIFIC_VALIDITY_TRUE = /scientificValidity["']?\s*[:=]\s*true/;

// Chaque occurrence est CLASSÉE (CDC section 14), pas seulement comptée :
// une occurrence dans une ligne de commentaire qui INTERDIT explicitement la
// notion ("N'ajoute jamais vote/prestige...") est une classification
// "comment_prohibition", légitime et attendue. Une occurrence dans du code
// exécutable (affectation, littéral d'objet, nom de variable, chaîne
// utilisée comme valeur) est une classification "functional_violation",
// bloquante.
const PROHIBITION_HINTS = /jamais|n'ajoute|interdit|ne doit pas|aucune logique|\baucun[e]?\b/i;

function classifyLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//")) {
    return PROHIBITION_HINTS.test(line) ? "comment_prohibition" : "comment_other";
  }
  return "functional_code";
}

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const pattern of SIMPLE_PATTERNS) {
    lines.forEach((line, i) => {
      if (pattern.re.test(line)) {
        findings.push({ file: path.relative(root, file), line: i + 1, pattern: pattern.name, classification: classifyLine(line), text: line.trim() });
      }
    });
  }
  lines.forEach((line, i) => {
    if (SCIENTIFIC_VALIDITY_TRUE.test(line)) {
      findings.push({ file: path.relative(root, file), line: i + 1, pattern: "scientificValidity=true", classification: classifyLine(line), text: line.trim() });
    }
  });
}

const functionalViolations = findings.filter((f) => f.classification === "functional_code");

check(
  "1. toute occurrence de truthScore/majority/prestige/vote/consensus/expertScore/scientificValidity=true est classée « comment_prohibition », jamais du code fonctionnel",
  functionalViolations.length === 0,
  JSON.stringify(functionalViolations)
);
check(
  "1b. " + findings.length + " occurrence(s) au total trouvée(s) et classée(s) (attendu : commentaires d'interdiction uniquement)",
  findings.every((f) => f.classification === "comment_prohibition"),
  JSON.stringify(findings.filter((f) => f.classification !== "comment_prohibition"))
);

// Vérification complémentaire : les commentaires qui INTERDISENT ce genre de
// logique (ex: aggregation-port.js) sont légitimes et attendus — ce test
// confirme leur présence plutôt que de les interdire.
const aggregationSrc = fs.readFileSync(path.join(root, "ports", "aggregation-port.js"), "utf8");
check(
  "2. AggregationPort documente explicitement l'interdiction (vote/majorité/prestige/truth score), en commentaire seulement",
  /vote\/majorit|majorit.*vote|N'ajoute jamais/i.test(aggregationSrc)
);

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
if (failed.length) {
  console.log("\nECHECS : " + failed.length);
  process.exit(1);
} else {
  console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
}
