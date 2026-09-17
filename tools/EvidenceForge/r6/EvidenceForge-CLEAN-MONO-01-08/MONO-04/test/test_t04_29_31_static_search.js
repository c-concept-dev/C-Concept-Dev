"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

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
const allProdFiles = [...libFiles, path.join(root, "index.js")];

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/fuzzy|similarity|smartRepair|autoRepair/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T04-29. aucun fichier de lib/ ou index.js ne contient fuzzy/similarity/smartRepair/autoRepair", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/\bJMJS\b/.test(src) || /je marche comme je suis/i.test(src) || /\bS0[12]\b/.test(src) || /\bDIMS\b/.test(src)) findings.push(path.relative(root, f));
  }
  check("T04-30. aucune référence à un pilote/mission nommé en dur (JMJS, S01/S02, DIMS)", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/truthScore|\bmajority\b|\bprestige\b|\bvote\b|\bconsensus\b|expertScore|scientificValidity\s*=\s*true/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T04-31. aucune notion épistémique inventée (truthScore/majority/prestige/vote/consensus/expertScore/scientificValidity=true)", findings.length === 0, JSON.stringify(findings));
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
