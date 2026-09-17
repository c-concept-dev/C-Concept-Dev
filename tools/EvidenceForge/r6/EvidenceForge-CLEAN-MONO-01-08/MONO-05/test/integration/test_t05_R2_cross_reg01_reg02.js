"use strict";
// test_t05_R2_cross_reg01_reg02.js — TEST CROISÉ des deux correctifs R2
// (MONO05-R2-REG-01 lineage + MONO05-R2-REG-02 réhydratation multi-nœuds).

const path = require("path");
const { startOperatorServer, MONO01_PATH, GRAPH_PATH } = require("../helpers.js");
const { buildValidChain } = require(path.join(MONO01_PATH, "test", "fixtures.js"));

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

async function seedAdvancedRun(op1, runId, missionId) {
  const chain = await buildValidChain(op1.mono01, { missionId });
  const nodeDefs = require(GRAPH_PATH).nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
  await op1.mono03.runStore.createRun({ runId, missionId, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs });
  const put = async (nodeId, contract, schemaVersion, payload) => {
    await op1.mono03.runStore.markNodeRunning(runId, nodeId);
    return op1.mono03.runStore.recordNodeSuccess({ runId, nodeId, contract, schemaVersion, missionId, payload });
  };
  const dummy = (label) => ({ schema: "EvidenceForge.TestPlaceholder", label, testOnly: true });
  for (const id of ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D"]) {
    await put(id, "EvidenceForge.TestPlaceholder", "test-v1", dummy(id));
  }
  await put("EF-03A", "EvidenceForge.ReviewSchema", "EF-03A-v1", chain.reviewSchema);
  await put("TARGET_DOCUMENT_SET", "EvidenceForge.TargetDocumentSet", "EF-03-v1", chain.targetDocumentSet);
  await put("EF-02E", "EvidenceForge.DocumentaryTwinSet", "EF-02E-v2", chain.twinSet);
  await put("EF-03B", "EvidenceForge.DocumentaryReviewSet", "EF-03B-v1", chain.reviewSet);
  await put("EF-03C", "EvidenceForge.AggregatedDocumentaryReview", "EF-03C-v1", chain.aggregatedReview);
  await put("EF-03D", "EvidenceForge.StabilityContradictionAnalysis", "EF-03D-v1", chain.stabilityAnalysis);

  const externalInputsSerializable = {
    runContract: { testOnly: true }, missionDimensionSet: { testOnly: true }, missionDocumentMapping: { testOnly: true },
    heuristicPolicy: { testOnly: true }, exclusionRegistry: { testOnly: true }, documents: [], reviewTargets: [],
  };
  await op1.runRegistry.saveRunInputs(runId, { missionQuestion: "Question croisée R2 ?", externalInputs: externalInputsSerializable, builtAt: new Date().toISOString() });
  return { chain, externalInputsSerializable };
}

async function newInstanceRehydrated(op1, runId, missionId, externalInputsSerializable) {
  const cfg = require("../../app/server/config.js");
  const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");
  const { createRunRegistry } = require("../../app/server/run-registry.js");
  const { createOperatorApi } = require("../../app/server/operator-api.js");
  const runRegistry = createRunRegistry(op1.mono01, op1.mono03);
  const operatorApi = createOperatorApi({ mono01: op1.mono01, mono03: op1.mono03, mono04: op1.mono04, runRegistry });

  const runState = await op1.mono03.runStore.loadRun(runId);
  const ctx = {
    missionId, missionQuestion: "Question croisée R2 ?", externalInputs: externalInputsSerializable,
    adapter: { discoverProfessionals: async () => ({}), verifyProfessionals: async () => ({}), buildProfessionalCorpus: async () => ({}) },
    dependenciesAvailable: { llm: true }, workerCallFn: async () => "{}", builtAt: new Date().toISOString(),
    nodeOutputs: {}, nodeResults: {},
  };
  for (const [nodeId, rec] of Object.entries(runState.nodeStates)) {
    if (rec.state === "SUCCESS" && runState.artifactRefs[nodeId]) ctx.nodeOutputs[nodeId] = (await op1.mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId])).payload;
  }
  const engine = createOrchestrationEngine(GRAPH_PATH, op1.mono01, ctx);
  const nodeIds = Object.keys(runState.nodeStates);
  let progressed = true, passes = 0;
  while (progressed && passes < nodeIds.length + 1) {
    progressed = false; passes++;
    engine.computeReadyNodes();
    for (const nodeId of nodeIds) {
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED" || engine.getNodeState(nodeId) === target) continue;
      if (engine.getNodeState(nodeId) === "READY" && engine.transition(nodeId, "RUNNING").ok) progressed = true;
      if (engine.getNodeState(nodeId) === "RUNNING" && engine.transition(nodeId, target).ok) progressed = true;
    }
    engine.computeReadyNodes();
  }
  runRegistry.registerFreshEngine(runId, engine);
  return operatorApi;
}

(async () => {
  const op1 = await startOperatorServer({ providerConfigs: {} });
  const runId = "run-t05-r2-cross";
  const missionId = "mission-t05-r2-cross";
  const { externalInputsSerializable } = await seedAdvancedRun(op1, runId, missionId);

  const api2 = await newInstanceRehydrated(op1, runId, missionId, externalInputsSerializable);
  const nodeBefore = await api2.getNode(runId, "EF-04-LINEAGE");
  check("CROSS-1. après redémarrage, EF-04-LINEAGE est réellement READY (REG-02 : chaîne de 12 nœuds correctement réhydratée)", nodeBefore.state === "READY", nodeBefore.state);

  const lineageRun = await api2.runNode(runId, "EF-04-LINEAGE");
  check("CROSS-2. EF-04-LINEAGE s'exécute réellement -> SUCCESS", lineageRun.state === "SUCCESS", JSON.stringify(lineageRun));
  const stateAfterLineage = await op1.mono03.runStore.loadRun(runId);
  check("CROSS-3. lineageStatus synchronisé automatiquement à PASS (REG-01)", stateAfterLineage.lineageStatus && stateAfterLineage.lineageStatus.status === "PASS", JSON.stringify(stateAfterLineage.lineageStatus));

  const reportRun = await api2.runNode(runId, "EF-04A");
  check("CROSS-4. EF-04A s'exécute réellement -> SUCCESS", reportRun.state === "SUCCESS", JSON.stringify(reportRun));
  const report1 = await api2.getReport(runId);
  check("CROSS-5. getReport() accessible immédiatement après (REG-01)", report1 && report1.schema === "EvidenceForge.UnifiedReportSummary", JSON.stringify(report1));

  const api3 = await newInstanceRehydrated(op1, runId, missionId, externalInputsSerializable);
  const report2 = await api3.getReport(runId);
  check("CROSS-6. après un second redémarrage, le lineage PASS reste valide et getReport() reste accessible", report2 && report2.schema === "EvidenceForge.UnifiedReportSummary", JSON.stringify(report2));

  await op1.close();

  const op4 = await startOperatorServer({ providerConfigs: {} });
  const runIdA = "run-t05-r2-cross-stale-a";
  const runIdB = "run-t05-r2-cross-stale-b";
  const missionIdStale = "mission-t05-r2-cross-stale";
  const seedA = await seedAdvancedRun(op4, runIdA, missionIdStale);
  const apiA = await newInstanceRehydrated(op4, runIdA, missionIdStale, seedA.externalInputsSerializable);
  await apiA.runNode(runIdA, "EF-04-LINEAGE");
  const stateA = await op4.mono03.runStore.loadRun(runIdA);

  const seedB = await seedAdvancedRun(op4, runIdB, missionIdStale);
  const apiB = await newInstanceRehydrated(op4, runIdB, missionIdStale, seedB.externalInputsSerializable);
  await apiB.runNode(runIdB, "EF-04-LINEAGE");
  await op4.mono03.coordinator.recordLineagePass(runIdB, { reviewSchemaHash: "perime", lineageAssurance: {} }, { "EF-03A": stateA.artifactRefs["EF-03A"] });

  let reportBlocked = null;
  try {
    await apiB.getReport(runIdB);
  } catch (e) {
    reportBlocked = e;
  }
  check("CROSS-7. variante stale : getReport() reste LINEAGE_BLOCKED après redémarrage/relecture, jamais accepté silencieusement", !!reportBlocked && reportBlocked.code === "LINEAGE_BLOCKED", reportBlocked && reportBlocked.message);
  await op4.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
