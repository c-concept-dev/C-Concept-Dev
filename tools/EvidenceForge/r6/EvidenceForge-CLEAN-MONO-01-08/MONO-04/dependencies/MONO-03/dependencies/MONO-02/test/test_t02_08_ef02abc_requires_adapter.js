"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Sans adapter du tout : EF-02A/B/C ne dépassent jamais BLOCKED/NOT_STARTED.
  const ctxNoAdapter = await buildFullContext("mission-t0208a");
  delete ctxNoAdapter.adapter;
  const engineNoAdapter = createOrchestrationEngine(GRAPH_PATH, mono01, ctxNoAdapter);
  await driveEngine(engineNoAdapter, { maxIterations: 6 });
  check("1. sans adapter, EF-02A/B/C ne progressent jamais jusqu'à SUCCESS", ["EF-02A", "EF-02B", "EF-02C"].every((id) => engineNoAdapter.getNodeState(id) !== "SUCCESS"));
  check("2. EF-ORCH/EF-PR-GEN-01/TARGET_DOCUMENT_SET progressent quand même (indépendants de l'adapter)", ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "TARGET_DOCUMENT_SET"].every((id) => engineNoAdapter.getNodeState(id) === "SUCCESS"));

  // Adapter partiel : seule discoverProfessionals implémentée -> EF-02A passe, EF-02B jamais.
  const ctxPartial = await buildFullContext("mission-t0208b");
  ctxPartial.adapter = { discoverProfessionals: ctxPartial.adapter.discoverProfessionals };
  const enginePartial = createOrchestrationEngine(GRAPH_PATH, mono01, ctxPartial);
  await driveEngine(enginePartial, { maxIterations: 6 });
  check("3. adapter partiel (discoverProfessionals seul) -> EF-02A SUCCESS", enginePartial.getNodeState("EF-02A") === "SUCCESS", enginePartial.getNodeState("EF-02A"));
  check("4. adapter partiel -> EF-02B jamais SUCCESS (verifyProfessionals non implémentée)", enginePartial.getNodeState("EF-02B") !== "SUCCESS");

  // Adapter complet : les 3 étapes réussissent.
  const ctxFull = await buildFullContext("mission-t0208c");
  const engineFull = createOrchestrationEngine(GRAPH_PATH, mono01, ctxFull);
  await driveEngine(engineFull, { maxIterations: 6 });
  check("5. adapter complet -> EF-02A/B/C tous SUCCESS", ["EF-02A", "EF-02B", "EF-02C"].every((id) => engineFull.getNodeState(id) === "SUCCESS"));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
