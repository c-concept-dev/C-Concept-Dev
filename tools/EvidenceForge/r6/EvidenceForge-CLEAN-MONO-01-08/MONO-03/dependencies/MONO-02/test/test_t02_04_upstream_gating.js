"use strict";
const { buildFullEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const engine = await buildFullEngine("mission-t0204");

  // EF-02A requiert EF-ORCH et EF-PR-GEN-01 SUCCESS. Au départ, aucun n'a tourné.
  engine.computeReadyNodes();
  check("1. EF-02A n'est PAS READY tant qu'EF-ORCH/EF-PR-GEN-01 ne sont pas SUCCESS", engine.getNodeState("EF-02A") === "NOT_STARTED");

  const runBeforeReady = await engine.runNode("EF-02A");
  check("2. runNode('EF-02A') avant que ses upstream soient SUCCESS -> NODE_NOT_READY", runBeforeReady.ok === false && runBeforeReady.error.code === "NODE_NOT_READY");

  // Faire avancer EF-ORCH seulement.
  engine.computeReadyNodes();
  await engine.runNode("EF-ORCH-SUBSYSTEM");
  check("3. EF-ORCH SUCCESS", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "SUCCESS");

  engine.computeReadyNodes();
  check("4. EF-02A toujours pas READY (EF-PR-GEN-01 encore NOT_STARTED)", engine.getNodeState("EF-02A") !== "READY");

  await engine.runNode("EF-PR-GEN-01");
  check("5. EF-PR-GEN-01 SUCCESS", engine.getNodeState("EF-PR-GEN-01") === "SUCCESS");

  engine.computeReadyNodes();
  check("6. EF-02A devient READY une fois SES DEUX upstream SUCCESS", engine.getNodeState("EF-02A") === "READY");

  // Vérifier aussi UPSTREAM_NOT_SUCCESS explicitement via canRun sur un nœud plus loin.
  const canRunTargetDoc = engine.canRun("EF-03A"); // requiert EF-02E + EF-PR-GEN-01, EF-02E jamais lancé
  check("7. canRun('EF-03A') avant EF-02E SUCCESS -> UPSTREAM_NOT_SUCCESS", canRunTargetDoc.ok === false && canRunTargetDoc.error.code === "UPSTREAM_NOT_SUCCESS", JSON.stringify(canRunTargetDoc));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
