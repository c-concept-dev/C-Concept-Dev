"use strict";
const fs = require("fs");
const path = require("path");
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// Recherche statique : aucune notion de fuzzy/similarity/repair dans lib/.
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
const files = listJsFiles(path.join(root, "lib"));
const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (/fuzzy|similarity|smartRepair|autoRepair/i.test(src)) findings.push(path.relative(root, file));
}
check("1. aucun fichier de lib/ ne contient fuzzy/similarity/smartRepair/autoRepair", findings.length === 0, JSON.stringify(findings));

(async () => {
  // Comportement réel : un objet mal formé transmis à un nœud n'est jamais
  // "réparé" — il produit un échec explicite, jamais un rapprochement.
  const mono01 = buildMono01();
  const ctx = await buildFullContext("mission-t0217");
  ctx.externalInputs.runContract = { schema: "PasUnRunContract", stage: "x" }; // schema volontairement incorrect
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
  engine.computeReadyNodes();
  const run = await engine.runNode("EF-ORCH-SUBSYSTEM");
  check("2. un RunContract de mauvais schema n'est jamais 'réparé' silencieusement — le port MONO-01 le rejette", run.ok === false, JSON.stringify(run));
  check("3. le nœud EF-ORCH-SUBSYSTEM n'est jamais SUCCESS avec un objet malformé", engine.getNodeState("EF-ORCH-SUBSYSTEM") !== "SUCCESS");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
