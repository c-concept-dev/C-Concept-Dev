"use strict";
const { execSync } = require("child_process");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const MONO01_DIR = path.join(__dirname, "..", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01");
const MONO02_DIR = path.join(__dirname, "..", "dependencies", "MONO-03", "dependencies", "MONO-02");
const MONO03_DIR = path.join(__dirname, "..", "dependencies", "MONO-03");

function runSuite(dir) {
  const out = execSync("npm test", { cwd: dir, encoding: "utf8" });
  const m = out.match(/TOTAL CUMULE : (\d+) tests/);
  const noRegression = /AUCUNE REGRESSION/.test(out);
  return { count: m ? parseInt(m[1], 10) : 0, noRegression, out };
}

{
  const r = runSuite(MONO01_DIR);
  check(`T04-39. suite MONO-01.x imbriquée rejouée depuis MONO-04 : ${r.count} tests, "AUCUNE REGRESSION" confirmé`, r.count === 172 && r.noRegression, r.out.slice(-300));
}

{
  const r = runSuite(MONO02_DIR);
  // Mis a jour mecaniquement lors de la rebase R1 (regressionId:
  // MONO02-CORPUS-BY-REF-MAP) : 324 (historique) + 10 (regression R1) = 334.
  check(`T04-40. suite MONO-02 imbriquée rejouée depuis MONO-04 : ${r.count} tests, "AUCUNE REGRESSION" confirmé`, r.count === 334 && r.noRegression, r.out.slice(-300));
}

{
  const r = runSuite(MONO03_DIR);
  check(`T04-41. suite MONO-03 imbriquée rejouée depuis MONO-04 : ${r.count} tests, "AUCUNE REGRESSION" confirmé`, r.count === 64 && r.noRegression, r.out.slice(-300));
}

let failed = results.filter((r) => !r.pass);
for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
if (failed.length) process.exit(1);
