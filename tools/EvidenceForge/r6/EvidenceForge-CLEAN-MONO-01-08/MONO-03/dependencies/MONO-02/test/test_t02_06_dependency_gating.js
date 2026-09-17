"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const missionId = "mission-t0206";
  const mono01 = buildMono01();
  const context = await buildFullContext(missionId);
  context.dependenciesAvailable = { llm: false }; // dépendance déclarée mais explicitement indisponible

  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, context);
  await driveEngine(engine, { maxIterations: 6 });

  check("1. EF-ORCH/EF-PR-GEN-01/EF-02A/EF-02B/EF-02C/TARGET_DOCUMENT_SET progressent normalement (aucune dépendance llm requise)", ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "TARGET_DOCUMENT_SET"].every((id) => engine.getNodeState(id) === "SUCCESS"));

  const canRunEF02D = engine.canRun("EF-02D");
  check("2. EF-02D (requiert llm) jamais READY quand llm=false", engine.getNodeState("EF-02D") !== "READY");
  check("2b. canRun('EF-02D') -> ORCHESTRATION_BLOCKED (dépendance llm non confirmée)", canRunEF02D.ok === false && canRunEF02D.error.code === "ORCHESTRATION_BLOCKED", JSON.stringify(canRunEF02D));

  // Dépendance absente du tout (jamais déclarée) — même fail-closed.
  const context2 = await buildFullContext("mission-t0206b");
  delete context2.dependenciesAvailable.llm;
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, context2);
  await driveEngine(engine2, { maxIterations: 6 });
  check("3. dependenciesAvailable={} (llm absent) bloque EF-02D exactement comme llm:false (fail-closed strict)", engine2.getNodeState("EF-02D") !== "READY" && engine2.getNodeState("EF-02D") !== "SUCCESS");

  // Dépendance ExternalStageAdapter manquante pour EF-02A.
  const context3 = await buildFullContext("mission-t0206c");
  delete context3.adapter;
  const engine3 = createOrchestrationEngine(GRAPH_PATH, mono01, context3);
  await driveEngine(engine3, { maxIterations: 6 });
  check("4. EF-02A jamais READY sans ExternalStageAdapter (dependency='externalStageAdapter.discoverProfessionals')", engine3.getNodeState("EF-02A") !== "SUCCESS");
  const canRunEF02A = engine3.canRun("EF-02A");
  check("4b. canRun('EF-02A') sans adapter -> ORCHESTRATION_BLOCKED (externalStageAdapter non disponible)", canRunEF02A.ok === false && canRunEF02A.error.code === "ORCHESTRATION_BLOCKED", JSON.stringify(canRunEF02A));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
