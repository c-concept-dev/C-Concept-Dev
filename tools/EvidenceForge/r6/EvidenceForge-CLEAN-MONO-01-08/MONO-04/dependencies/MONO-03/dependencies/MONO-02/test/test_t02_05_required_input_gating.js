"use strict";
const { buildFullEngine, buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const missionId = "mission-t0205";
  const mono01 = buildMono01();
  const context = await buildFullContext(missionId);
  delete context.externalInputs.runContract; // input externe requis par EF-ORCH-SUBSYSTEM, retiré délibérément

  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, context);
  engine.computeReadyNodes();
  check("1. EF-ORCH-SUBSYSTEM ne devient jamais READY sans runContract", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "NOT_STARTED");

  const canRunResult = engine.canRun("EF-ORCH-SUBSYSTEM");
  check("2. canRun('EF-ORCH-SUBSYSTEM') sans runContract -> ORCHESTRATION_BLOCKED (entrée externe manquante)", canRunResult.ok === false && canRunResult.error.code === "ORCHESTRATION_BLOCKED", JSON.stringify(canRunResult));

  // Fournir runContract après coup -> devient résoluble.
  const restored = await buildFullContext(missionId + "-restored");
  context.externalInputs.runContract = restored.externalInputs.runContract;
  context.externalInputs.efOrchExecutionDependencies = restored.externalInputs.efOrchExecutionDependencies;
  engine.computeReadyNodes();
  check("3. une fois runContract fourni, EF-ORCH-SUBSYSTEM devient READY", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "READY");

  // TARGET_DOCUMENT_SET requiert "documents" (externe) — vérifions le même mécanisme ailleurs dans le graphe.
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, await buildFullContext("mission-t0205b"));
  delete engine2.context.externalInputs.documents;
  engine2.computeReadyNodes();
  await engine2.runNode("EF-ORCH-SUBSYSTEM");
  engine2.computeReadyNodes();
  await engine2.runNode("EF-PR-GEN-01");
  engine2.computeReadyNodes();
  check("4. TARGET_DOCUMENT_SET (upstream EF-PR-GEN-01 SUCCESS) reste bloqué sans 'documents'", engine2.getNodeState("TARGET_DOCUMENT_SET") !== "READY");
  const canRunTds = engine2.canRun("TARGET_DOCUMENT_SET");
  check("5. canRun('TARGET_DOCUMENT_SET') sans documents -> ORCHESTRATION_BLOCKED (entrée externe manquante)", canRunTds.ok === false && canRunTds.error.code === "ORCHESTRATION_BLOCKED", JSON.stringify(canRunTds));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
