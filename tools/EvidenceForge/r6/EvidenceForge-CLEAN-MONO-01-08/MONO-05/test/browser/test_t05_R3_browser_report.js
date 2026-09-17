"use strict";
// test_t05_R3_browser_report.js — scénario Playwright réel (regressionId: MONO05-R3-REG-01)

const { chromium } = require("playwright");
const path = require("path");
const http = require("http");
const { startOperatorServer, MONO01_PATH, GRAPH_PATH } = require("../helpers.js");
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

  const externalInputsSerializable = { runContract: { testOnly: true }, missionDimensionSet: { testOnly: true }, missionDocumentMapping: { testOnly: true }, heuristicPolicy: { testOnly: true }, exclusionRegistry: { testOnly: true }, documents: [], reviewTargets: [] };
  await op.runRegistry.saveRunInputs(runId, { missionQuestion: "Question R3 navigateur ?", externalInputs: externalInputsSerializable, builtAt: new Date().toISOString() });

  const cfg = require("../../app/server/config.js");
  const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));
  const ctx = {
    missionId, missionQuestion: "Question R3 navigateur ?", externalInputs: externalInputsSerializable,
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

function post(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "POST" }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(JSON.parse(b))); });
    req.on("error", reject); req.end();
  });
}

(async () => {
  const op = await startOperatorServer({ providerConfigs: {} });
  const runId = "run-t05-r3-browser-report";
  const missionId = "mission-t05-r3-browser-report";
  await seedRealReportRun(op, runId, missionId);

  await post(op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);
  await post(op.baseUrl + `/api/runs/${runId}/nodes/EF-04A/run`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  await page.goto(op.baseUrl + "/");
  await page.click(`text=${runId}`);
  await page.waitForSelector("text=Lineage Gate");
  await page.click("text=Ouvrir le rapport");
  // MONO05-R3-TESTFIX-01 : attendre le texte structurel "Rapport final" (le
  // <h2> de la section) est un point de synchronisation trop faible — cet
  // élément est présent dès le début de la construction du bloc, avant que
  // les données finales d'assurance de lignée n'aient été injectées.
  // Attendre une valeur réellement issue des données finales du rapport
  // (assuranceLevel="reference_revalidated_not_source_hash_bound", CDC
  // EF-04A) garantit que le rendu est complet avant toute assertion.
  // Correctif de synchronisation Playwright uniquement — aucune modification
  // d'app/, d'EF-04A, du lineage, ou d'un contrat gelé.
  await page.waitForSelector("text=reference_revalidated_not_source_hash_bound", { timeout: 5000 });

  const bodyText = await page.textContent("body");
  const reportZone = bodyText.slice(bodyText.indexOf("Rapport final"));
  check("T05-R3-browser-1. le vrai assuranceLevel est visible dans un vrai navigateur", reportZone.includes("reference_revalidated_not_source_hash_bound"), reportZone.slice(0, 200));
  check("T05-R3-browser-2. targetDocumentsHashBoundFromEF03=false visible", reportZone.includes("targetDocumentsHashBoundFromEF03=false"));
  check("T05-R3-browser-3. documentaryTwinsHashBoundFromEF03=false visible", reportZone.includes("documentaryTwinsHashBoundFromEF03=false"));
  check("T05-R3-browser-4. aucune occurrence de \"undefined\" dans la zone rapport", !reportZone.includes("undefined"));
  check("T05-R3-browser-5. aucune erreur console inattendue", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  await browser.close();
  await op.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
