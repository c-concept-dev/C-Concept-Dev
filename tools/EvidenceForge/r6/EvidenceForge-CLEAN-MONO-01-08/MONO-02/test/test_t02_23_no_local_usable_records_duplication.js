"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T02-23 — Garde de non-régression statique (correction post-audit,
// section 12) : MONO-02 ne doit JAMAIS reconstruire localement le prédicat
// "usableRecords" d'EF-02D1D2 (éligible ET pertinent sur au moins une
// dimension). Depuis la révision MONO-01.x, EligibilityPanelPort expose
// selectUsableRecords(eligibilityRelevanceSet), qui appelle directement le
// module gelé — MONO-02 doit l'utiliser exclusivement.

const root = path.join(__dirname, "..");
function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const libFiles = listJsFiles(path.join(root, "lib"));

// 1. Aucune DÉFINITION de fonction nommée selectUsableRecords/usableRecords
//    dans lib/ — seul un APPEL à mono01.eligibilityPanelPort.selectUsableRecords(...)
//    est autorisé.
const functionDefPattern = /function\s+(selectUsableRecords|usableRecords)\s*\(/;
const violations = [];
for (const file of libFiles) {
  const src = fs.readFileSync(file, "utf8");
  if (functionDefPattern.test(src)) violations.push(path.relative(root, file));
}
check("1. aucune fonction locale selectUsableRecords()/usableRecords() définie dans lib/ (jamais une réimplémentation du prédicat gelé)", violations.length === 0, JSON.stringify(violations));

// 2. Aucun filtre manuel reproduisant le prédicat (eligibility.status ===
//    "eligible_documentary" combiné à dimensionRelevance/relevanceStatus)
//    ne doit apparaître ailleurs dans lib/ en dehors d'un commentaire.
const predicatePattern = /eligible_documentary["'`]\s*&&[\s\S]{0,120}?dimensionRelevance/;
const predicateLeaks = [];
for (const file of libFiles) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (predicatePattern.test(line) && !line.trim().startsWith("//")) {
      predicateLeaks.push({ file: path.relative(root, file), line: i + 1, text: line.trim() });
    }
  });
}
check("2. aucune ligne de code fonctionnel ne reproduit le prédicat éligible+pertinent inline (recherche multi-lignes ciblée)", predicateLeaks.length === 0, JSON.stringify(predicateLeaks));

// 3. Confirmation positive : node-runners.js appelle bien le port MONO-01
//    pour cette opération, exactement une fois, dans le nœud EF-02D.
const nodeRunnersSrc = fs.readFileSync(path.join(root, "lib", "node-runners.js"), "utf8");
const portCallMatches = nodeRunnersSrc.match(/mono01\.eligibilityPanelPort\.selectUsableRecords\(/g) || [];
check("3. lib/node-runners.js appelle mono01.eligibilityPanelPort.selectUsableRecords() (exactement une fois, dans le nœud EF-02D)", portCallMatches.length === 1, String(portCallMatches.length));

// 4. Confirmation que le port existe bien côté MONO-01 (copie gelée) et
//    qu'il appelle directement le module gelé, jamais une réimplémentation
//    (double vérification indépendante de MONO-01 T01-19).
const eligibilityPortSrc = fs.readFileSync(path.join(root, "dependencies", "MONO-01", "ports", "eligibility-panel-port.js"), "utf8");
check(
  "4. MONO-01/ports/eligibility-panel-port.js expose bien selectUsableRecords() et appelle directement EF02D1D2Orchestrator.usableRecords() (jamais une nouvelle logique)",
  /selectUsableRecords/.test(eligibilityPortSrc) && /EF02D1D2Orchestrator\.usableRecords\(/.test(eligibilityPortSrc)
);

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
