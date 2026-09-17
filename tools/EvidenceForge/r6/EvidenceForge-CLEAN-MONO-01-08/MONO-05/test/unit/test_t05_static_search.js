"use strict";
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const root = path.join(__dirname, "..", "..");
function listFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}
const appFiles = listFiles(path.join(root, "app"), [".js", ".html"]);

{
  const findings = [];
  for (const f of appFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/\bJMJS\b/.test(src) || /je marche comme je suis/i.test(src) || /\bS0[12]\b/.test(src) || /\bDIMS\b/.test(src) || /\bd[45]\b/.test(src)) findings.push(path.relative(root, f));
  }
  check("T05-36. aucune référence à un pilote/mission nommé en dur (JMJS, S01/S02, DIMS, d4/d5)", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of appFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/truthScore|\bvote\b|\bmajority\b|\bprestige\b|\bconsensus\b|expertScore|scientificValidity\s*=\s*true|Experts validate|Expert consensus|Scientific proof|Truth score|Approved by experts/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T05-37. aucun vocabulaire épistémique erroné", findings.length === 0, JSON.stringify(findings));
}

{
  const findings = [];
  for (const f of appFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/fuzzy|smartRepair|autoRepair/i.test(src)) findings.push(path.relative(root, f));
  }
  check("T05-35. aucune notion de smart repair/fuzzy matching", findings.length === 0, JSON.stringify(findings));
}

{
  const clientFiles = listFiles(path.join(root, "app", "client"), [".js", ".html"]);
  const findings = [];
  for (const f of clientFiles) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      const codeOnly = line.split("//")[0]; // ignore le texte après un commentaire ligne — jamais confondre une mention documentaire avec du code réel
      if (/\.innerHTML\s*=/.test(codeOnly)) findings.push({ file: path.relative(root, f), line: i + 1, text: line.trim() });
    });
  }
  check("T05-28s. aucune affectation innerHTML= dans le CODE de app/client (les mentions en commentaire, comme la règle XSS elle-même, sont ignorées)", findings.length === 0, JSON.stringify(findings));
}

{
  const clientFiles = listFiles(path.join(root, "app", "client"), [".js", ".html"]);
  const findings = [];
  for (const f of clientFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/localStorage|sessionStorage/.test(src)) findings.push(path.relative(root, f));
  }
  check("T05-19s/20s. aucune référence à localStorage/sessionStorage dans app/client", findings.length === 0, JSON.stringify(findings));
}

{
  const serverFiles = listFiles(path.join(root, "app", "server"), [".js"]);
  const findings = [];
  for (const f of serverFiles) {
    const src = fs.readFileSync(f, "utf8");
    if (/Authorization|Bearer|sk-[A-Za-z0-9]|apiKey|\bpassword\b/i.test(src)) findings.push({ file: path.relative(root, f) });
  }
  check("T05-17s/18s. aucune référence à Authorization/Bearer/sk-.../apiKey/password dans app/server", findings.length === 0, JSON.stringify(findings));
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
