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
const indexFile = path.join(root, "index.js");
const allProdFiles = [...libFiles, indexFile];

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/fuzzy|similarity|smartRepair|autoRepair|heuristiqueDeReparation/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T03-35. aucun fichier de lib/ ou index.js ne contient fuzzy/similarity/smartRepair/autoRepair", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/\bJMJS\b/.test(src) || /je marche comme je suis/i.test(src) || /\bS0[12]\b/.test(src) || /\bDIMS\b/.test(src) || /\bd[45]\b/.test(src)) findings.push(path.relative(root, f));
  }
  check("T03-36. aucune référence à un pilote/mission nommé en dur (JMJS, S01/S02, DIMS, d4/d5)", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of allProdFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/truthScore|\bmajority\b|\bprestige\b|\bvote\b|\bconsensus\b|expertScore|scientificValidity\s*[:=]\s*true/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T03-37. aucune notion épistémique inventée (truthScore/majority/prestige/vote/consensus/expertScore/scientificValidity=true)", findings.length === 0, JSON.stringify(findings));
}

{
  const manifestPath = path.join(root, "dependencies", "MONO-02", "manifest", "SHA256SUMS");
  const crypto = require("crypto");
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  const lines = manifestContent.trim().split("\n").filter(Boolean);
  const mismatches = [];
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!m) continue;
    const [, expectedHash, relPath] = m;
    const fullPath = path.join(root, "dependencies", "MONO-02", relPath);
    if (!fs.existsSync(fullPath)) {
      mismatches.push({ relPath, reason: "fichier manquant" });
      continue;
    }
    const actualHash = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
    if (actualHash !== expectedHash) mismatches.push({ relPath, expectedHash, actualHash });
  }
  check(`T03-38. les ${lines.length} fichiers du manifeste MONO-02 imbriqué sont bytewise identiques à leur hash déclaré (aucune mutation de fichier gelé)`, mismatches.length === 0, JSON.stringify(mismatches.slice(0, 5)));
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
