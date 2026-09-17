"use strict";
// test_t05_R3_report_ui.js — CORRECTIF MONO-05-R3 (regressionId: MONO05-R3-REG-01)

const path = require("path");
const { startOperatorServer, httpJson, MONO01_PATH, GRAPH_PATH } = require("../helpers.js");
const { buildValidChain } = require(path.join(MONO01_PATH, "test", "fixtures.js"));

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

async function seedRealReportRun(op, runId, missionId) {
  const chain = await buildValidChain(op.mono01, { missionId });
  const nodeDefs = require(GRAPH_PATH).nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
  await op.mono03.runStore.createRun({ runId, missionId, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs });

  const put = async (nodeId, contract, schemaVersion, payload) => {
    await op.mono03.runStore.markNodeRunning(runId, nodeId);
    return op.mono03.runStore.recordNodeSuccess({ runId, nodeId, contract, schemaVersion, missionId, payload });
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
  await op.runRegistry.saveRunInputs(runId, { missionQuestion: "Question R3 ?", externalInputs: externalInputsSerializable, builtAt: new Date().toISOString() });

  const cfg = require("../../app/server/config.js");
  const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));
  const ctx = {
    missionId, missionQuestion: "Question R3 ?", externalInputs: externalInputsSerializable,
    adapter: { discoverProfessionals: async () => ({}), verifyProfessionals: async () => ({}), buildProfessionalCorpus: async () => ({}) },
    dependenciesAvailable: { llm: true }, workerCallFn: async () => "{}", builtAt: new Date().toISOString(),
    nodeOutputs: {}, nodeResults: {},
  };
  const runState = await op.mono03.runStore.loadRun(runId);
  for (const [nodeId, rec] of Object.entries(runState.nodeStates)) {
    if (rec.state === "SUCCESS" && runState.artifactRefs[nodeId]) ctx.nodeOutputs[nodeId] = (await op.mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId])).payload;
  }
  const engine = createOrchestrationEngine(GRAPH_PATH, op.mono01, ctx);
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
  op.runRegistry.registerFreshEngine(runId, engine);
}

(async () => {
  const op = await startOperatorServer({ providerConfigs: {} });
  const runId = "run-t05-r3-report";
  const missionId = "mission-t05-r3-report";
  await seedRealReportRun(op, runId, missionId);

  const lineageRun = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);
  check("T05-R3-precond. EF-04-LINEAGE réel -> SUCCESS", lineageRun.body.state === "SUCCESS", JSON.stringify(lineageRun.body));
  const reportNodeRun = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04A/run`);
  check("T05-R3-precond2. EF-04A réel -> SUCCESS (buildUnifiedReportSummary() exécuté)", reportNodeRun.body.state === "SUCCESS", JSON.stringify(reportNodeRun.body));

  const reportHttp = await httpJson("GET", op.baseUrl + `/api/runs/${runId}/report`);
  const report = reportHttp.body;
  check("T05-R3-01a. le vrai rapport EF-04A a bien assuranceLevel imbriqué sous report.lineage.lineageAssurance (jamais à la racine)", report.assuranceLevel === undefined && report.lineage.lineageAssurance.assuranceLevel === "reference_revalidated_not_source_hash_bound", JSON.stringify({ racine: report.assuranceLevel, imbrique: report.lineage && report.lineage.lineageAssurance && report.lineage.lineageAssurance.assuranceLevel }));

  const assurance = report && report.lineage && report.lineage.lineageAssurance;
  const displayedAssuranceLevel = assurance && typeof assurance.assuranceLevel === "string" ? assurance.assuranceLevel : undefined;
  check("T05-R3-01b. la logique d'affichage (identique à renderReport()) retrouve l'assuranceLevel réel, jamais undefined", displayedAssuranceLevel === "reference_revalidated_not_source_hash_bound", displayedAssuranceLevel);
  check("T05-R3-02. targetDocumentsHashBoundFromEF03 = false (valeur réelle du contrat)", assurance.targetDocumentsHashBoundFromEF03 === false);
  check("T05-R3-03. documentaryTwinsHashBoundFromEF03 = false (valeur réelle du contrat)", assurance.documentaryTwinsHashBoundFromEF03 === false);
  check("T05-R3-04. aucun \"undefined\" dans les valeurs affichées", !String(displayedAssuranceLevel).includes("undefined") && !String(assurance.targetDocumentsHashBoundFromEF03).includes("undefined"));
  check("T05-R3-05. aucune surélévation d'assurance (jamais full/verified/scientific/high)", !/\b(full|verified|scientific|high)\b/i.test(displayedAssuranceLevel));

  await op.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
