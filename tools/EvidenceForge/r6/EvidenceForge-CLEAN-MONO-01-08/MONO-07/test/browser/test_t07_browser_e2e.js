"use strict";
// test/browser/test_t07_browser_e2e.js — T07-37 (a-h)
//
// Scenario navigateur reel exercant l'integration MONO-07 + MONO-05-R3 :
// vraie UI, vrai OperatorApi, vrai serveur HTTP, jamais un fake payload UI.
// createRun() natif ne permettant pas de piloter EF-02A/B/C (limite deja
// documentee de MONO-05), les runs sont prepares cote serveur par la voie
// E2E deja validee (recordNodeSuccess + adapter synthetique + engine
// enregistre), puis ouverts dans la vraie UI - frontiere documentee ici,
// jamais un contournement cache.

const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const { resolveKitRoot } = require("../../lib/kit-root");
const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

async function startServerWithSeededRun(mono05Root, opts) {
  opts = opts || {};
  const { runId, missionId, breakTargetDocSet, providerConfigs, secrets } = opts;
  const { createHttpServer } = require(path.join(mono05Root, "app/server/http-server.js"));
  const { server, mono01, mono03, mono04, runRegistry } = createHttpServer({ secrets: { providerConfigs: providerConfigs || {}, secrets: secrets || {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = "http://127.0.0.1:" + port;

  const cfg = require(path.join(mono05Root, "app/server/config.js"));
  const GRAPH_PATH = cfg.GRAPH_PATH;
  const efFxPath = path.join(cfg.MONO01_PATH, "test", "fixtures.js");
  const { buildValidChain } = require(efFxPath);
  const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));

  const chain = await buildValidChain(mono01, { missionId: missionId });
  const targetDocumentSetToUse = breakTargetDocSet ? Object.assign({}, chain.targetDocumentSet, { documents: [] }) : chain.targetDocumentSet;
  const nodeDefs = require(GRAPH_PATH).nodes.map(function (n) { return { nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }; });
  await mono03.runStore.createRun({ runId: runId, missionId: missionId, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs: nodeDefs });
  async function put(nodeId, contract, schemaVersion, payload) {
    await mono03.runStore.markNodeRunning(runId, nodeId);
    return mono03.runStore.recordNodeSuccess({ runId: runId, nodeId: nodeId, contract: contract, schemaVersion: schemaVersion, missionId: missionId, payload: payload });
  }
  function dummy(label) { return { schema: "EvidenceForge.TestPlaceholder", label: label, testOnly: true }; }
  const preNodes = ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D"];
  for (let i = 0; i < preNodes.length; i++) {
    await put(preNodes[i], "EvidenceForge.TestPlaceholder", "test-v1", dummy(preNodes[i]));
  }
  await put("EF-03A", "EvidenceForge.ReviewSchema", "EF-03A-v1", chain.reviewSchema);
  await put("TARGET_DOCUMENT_SET", "EvidenceForge.TargetDocumentSet", "EF-03-v1", targetDocumentSetToUse);
  await put("EF-02E", "EvidenceForge.DocumentaryTwinSet", "EF-02E-v2", chain.twinSet);
  await put("EF-03B", "EvidenceForge.DocumentaryReviewSet", "EF-03B-v1", chain.reviewSet);
  await put("EF-03C", "EvidenceForge.AggregatedDocumentaryReview", "EF-03C-v1", chain.aggregatedReview);
  await put("EF-03D", "EvidenceForge.StabilityContradictionAnalysis", "EF-03D-v1", chain.stabilityAnalysis);

  const externalInputsSerializable = { runContract: { testOnly: true }, missionDimensionSet: { testOnly: true }, missionDocumentMapping: { testOnly: true }, heuristicPolicy: { testOnly: true }, exclusionRegistry: { testOnly: true }, documents: [], reviewTargets: [] };
  await runRegistry.saveRunInputs(runId, { missionQuestion: "Question browser E2E MONO-07 ?", externalInputs: externalInputsSerializable, builtAt: new Date().toISOString() });

  const ctx = {
    missionId: missionId, missionQuestion: "Question browser E2E MONO-07 ?", externalInputs: externalInputsSerializable,
    adapter: { discoverProfessionals: function () { return Promise.resolve({}); }, verifyProfessionals: function () { return Promise.resolve({}); }, buildProfessionalCorpus: function () { return Promise.resolve({}); } },
    dependenciesAvailable: { llm: true }, workerCallFn: function () { return Promise.resolve("{}"); }, builtAt: new Date().toISOString(),
    nodeOutputs: {}, nodeResults: {}
  };
  const runState = await mono03.runStore.loadRun(runId);
  const nodeIds = Object.keys(runState.nodeStates);
  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const rec = runState.nodeStates[nodeId];
    if (rec.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
      ctx.nodeOutputs[nodeId] = (await mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId])).payload;
    }
  }
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);
  let progressed = true, passes = 0;
  while (progressed && passes < nodeIds.length + 1) {
    progressed = false; passes++;
    engine.computeReadyNodes();
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED" || engine.getNodeState(nodeId) === target) continue;
      if (engine.getNodeState(nodeId) === "READY" && engine.transition(nodeId, "RUNNING").ok) progressed = true;
      if (engine.getNodeState(nodeId) === "RUNNING" && engine.transition(nodeId, target).ok) progressed = true;
    }
    engine.computeReadyNodes();
  }
  runRegistry.registerFreshEngine(runId, engine);

  return { server: server, baseUrl: baseUrl, mono01: mono01, mono03: mono03, mono04: mono04, runRegistry: runRegistry, close: function () { return new Promise(function (r) { server.close(r); }); } };
}

function post(url) {
  return new Promise(function (resolve, reject) {
    const req = http.request(url, { method: "POST" }, function (res) {
      let b = "";
      res.on("data", function (c) { b += c; });
      res.on("end", function () { resolve({ status: res.statusCode, body: JSON.parse(b || "{}") }); });
    });
    req.on("error", reject);
    req.end();
  });
}

function getJson(url) {
  return new Promise(function (resolve) {
    http.get(url, function (res) {
      let b = "";
      res.on("data", function (c) { b += c; });
      res.on("end", function () { resolve({ status: res.statusCode, body: JSON.parse(b || "{}") }); });
    });
  });
}

(async function () {
  const kitRoot = resolveKitRoot();
  const probeEnv = buildEnv(kitRoot, "/tmp/t07-browser-probe-" + Date.now(), { providerConfigs: {}, secrets: {} });
  const mono05Root = probeEnv.mono05Root;

  // === T07-37a : HAPPY BROWSER ===
  {
    const upstream = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(upstream.baseUrl);
    const runId = "t07-browser-happy";
    const missionId = "mission-t07-browser-happy";
    const op = await startServerWithSeededRun(mono05Root, { runId: runId, missionId: missionId, providerConfigs: providerConfigs });

    await post(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04-LINEAGE/run");
    await post(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04A/run");

    const browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    page.on("console", function (msg) { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", function (e) { pageErrors.push(e.message); });
    page.on("requestfailed", function (req) { requestFailures.push(req.url()); });

    await page.goto(op.baseUrl + "/");
    await page.click("text=" + runId);
    await page.waitForSelector(".node-box");
    const nodeStates = await page.locator(".node-box").allTextContents();
    check("T07-37a-1. graphe visible avec les 14 noeuds", nodeStates.length === 14, String(nodeStates.length));
    const allSuccessVisible = nodeStates.every(function (t) { return t.indexOf("SUCCESS") !== -1; });
    check("T07-37a-2. 14/14 SUCCESS visible et coherent dans la vraie UI", allSuccessVisible, JSON.stringify(nodeStates.filter(function (t) { return t.indexOf("SUCCESS") === -1; })));

    const artifactsText = await page.textContent("section[aria-label='Artefacts']");
    check("T07-37a-3. section artefacts consultable, non vide", artifactsText.indexOf("EF-ORCH-SUBSYSTEM") !== -1);

    await page.waitForSelector("text=Lineage Gate");
    const lineageText = await page.textContent("section[aria-label='Lineage']");
    check("T07-37a-4. lineage visible, SUCCESS/PASS coherent", lineageText.indexOf("SUCCESS") !== -1);

    // Selecteur precis (bouton, pas un texte ambigu) + attente sur le
    // contenu reel de l'assurance (pas seulement le titre de section) -
    // corrige une instabilite reelle trouvee dans CE script de test
    // (double declenchement du clic avec "text=", cause probable d'un
    // rendu partiel occasionnellement observe au moment de la lecture).
    await page.locator("button", { hasText: "Ouvrir le rapport" }).click();
    await page.waitForSelector("text=reference_revalidated_not_source_hash_bound");
    const bodyText = await page.textContent("body");
    const reportZone = bodyText.slice(bodyText.indexOf("Rapport final"));
    check("T07-37a-5. rapport ouvert, assuranceLevel reel visible", reportZone.indexOf("reference_revalidated_not_source_hash_bound") !== -1, reportZone.slice(0, 150));
    check("T07-37a-6. targetDocumentsHashBoundFromEF03=false visible", reportZone.indexOf("targetDocumentsHashBoundFromEF03=false") !== -1);
    check("T07-37a-7. documentaryTwinsHashBoundFromEF03=false visible", reportZone.indexOf("documentaryTwinsHashBoundFromEF03=false") !== -1);
    check("T07-37a-8. aucun \"undefined\" dans la zone rapport", reportZone.indexOf("undefined") === -1);
    check("T07-37h-1 (happy). aucune erreur console/page/requete inattendue", consoleErrors.length === 0 && pageErrors.length === 0 && requestFailures.length === 0, JSON.stringify({ consoleErrors: consoleErrors, pageErrors: pageErrors, requestFailures: requestFailures }));

    await browser.close();
    await op.close();
    await upstream.close();
  }

  // === T07-37b : LINEAGE FAIL BROWSER ===
  {
    const upstream = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(upstream.baseUrl);
    const runId = "t07-browser-fail";
    const missionId = "mission-t07-browser-fail";
    const op = await startServerWithSeededRun(mono05Root, { runId: runId, missionId: missionId, providerConfigs: providerConfigs, breakTargetDocSet: true });
    await post(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04-LINEAGE/run");

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.click("text=" + runId);
    await page.waitForSelector("text=Lineage Gate");
    const lineageText = await page.textContent("section[aria-label='Lineage']");
    check("T07-37b-1. lineage FAILED visible et coherent dans la vraie UI", lineageText.indexOf("FAILED") !== -1, lineageText);
    check("T07-37b-2. le bouton Ouvrir le rapport n'est jamais propose (lineage non-PASS)", lineageText.indexOf("Ouvrir le rapport") === -1);

    const httpReport = await getJson(op.baseUrl + "/api/runs/" + runId + "/report");
    check("T07-37b-3. OperatorApi.getReport() = LINEAGE_BLOCKED", httpReport.status >= 400 && httpReport.body.errorCode === "LINEAGE_BLOCKED", JSON.stringify(httpReport.body));

    await browser.close();
    await op.close();
    await upstream.close();
  }

  // === T07-37c : LINEAGE STALE BROWSER ===
  {
    const upstream = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(upstream.baseUrl);
    const runIdA = "t07-browser-stale-a";
    const runIdB = "t07-browser-stale-b";
    const missionId = "mission-t07-browser-stale";
    const op = await startServerWithSeededRun(mono05Root, { runId: runIdA, missionId: missionId, providerConfigs: providerConfigs });
    await post(op.baseUrl + "/api/runs/" + runIdA + "/nodes/EF-04-LINEAGE/run");
    const stateA = await op.mono03.runStore.loadRun(runIdA);

    const cfg = require(path.join(mono05Root, "app/server/config.js"));
    const { buildValidChain } = require(path.join(cfg.MONO01_PATH, "test", "fixtures.js"));
    const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));
    const missionIdB = "mission-t07-browser-stale-b";
    const chain = await buildValidChain(op.mono01, { missionId: missionIdB });
    const nodeDefs = require(cfg.GRAPH_PATH).nodes.map(function (n) { return { nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }; });
    await op.mono03.runStore.createRun({ runId: runIdB, missionId: missionIdB, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs: nodeDefs });
    async function put(nodeId, contract, schemaVersion, payload) {
      await op.mono03.runStore.markNodeRunning(runIdB, nodeId);
      return op.mono03.runStore.recordNodeSuccess({ runId: runIdB, nodeId: nodeId, contract: contract, schemaVersion: schemaVersion, missionId: missionIdB, payload: payload });
    }
    function dummy(label) { return { schema: "EvidenceForge.TestPlaceholder", label: label, testOnly: true }; }
    const preNodes = ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D"];
    for (let i = 0; i < preNodes.length; i++) await put(preNodes[i], "EvidenceForge.TestPlaceholder", "test-v1", dummy(preNodes[i]));
    await put("EF-03A", "EvidenceForge.ReviewSchema", "EF-03A-v1", chain.reviewSchema);
    await put("TARGET_DOCUMENT_SET", "EvidenceForge.TargetDocumentSet", "EF-03-v1", chain.targetDocumentSet);
    await put("EF-02E", "EvidenceForge.DocumentaryTwinSet", "EF-02E-v2", chain.twinSet);
    await put("EF-03B", "EvidenceForge.DocumentaryReviewSet", "EF-03B-v1", chain.reviewSet);
    await put("EF-03C", "EvidenceForge.AggregatedDocumentaryReview", "EF-03C-v1", chain.aggregatedReview);
    await put("EF-03D", "EvidenceForge.StabilityContradictionAnalysis", "EF-03D-v1", chain.stabilityAnalysis);
    const externalInputsSerializable = { runContract: { testOnly: true }, missionDimensionSet: { testOnly: true }, missionDocumentMapping: { testOnly: true }, heuristicPolicy: { testOnly: true }, exclusionRegistry: { testOnly: true }, documents: [], reviewTargets: [] };
    await op.runRegistry.saveRunInputs(runIdB, { missionQuestion: "Q?", externalInputs: externalInputsSerializable, builtAt: new Date().toISOString() });
    const ctxB = {
      missionId: missionIdB, missionQuestion: "Q?", externalInputs: externalInputsSerializable,
      adapter: { discoverProfessionals: function () { return Promise.resolve({}); }, verifyProfessionals: function () { return Promise.resolve({}); }, buildProfessionalCorpus: function () { return Promise.resolve({}); } },
      dependenciesAvailable: { llm: true }, workerCallFn: function () { return Promise.resolve("{}"); }, builtAt: new Date().toISOString(),
      nodeOutputs: {}, nodeResults: {}
    };
    const runStateB = await op.mono03.runStore.loadRun(runIdB);
    const nodeIdsB = Object.keys(runStateB.nodeStates);
    for (let i = 0; i < nodeIdsB.length; i++) {
      const nodeId = nodeIdsB[i];
      const rec = runStateB.nodeStates[nodeId];
      if (rec.state === "SUCCESS" && runStateB.artifactRefs[nodeId]) ctxB.nodeOutputs[nodeId] = (await op.mono03.artifactStore.getArtifact(runStateB.artifactRefs[nodeId])).payload;
    }
    const engineB = createOrchestrationEngine(cfg.GRAPH_PATH, op.mono01, ctxB);
    let progressedB = true, passesB = 0;
    while (progressedB && passesB < nodeIdsB.length + 1) {
      progressedB = false; passesB++;
      engineB.computeReadyNodes();
      for (let i = 0; i < nodeIdsB.length; i++) {
        const nodeId = nodeIdsB[i];
        const target = runStateB.nodeStates[nodeId].state;
        if (target === "NOT_STARTED" || engineB.getNodeState(nodeId) === target) continue;
        if (engineB.getNodeState(nodeId) === "READY" && engineB.transition(nodeId, "RUNNING").ok) progressedB = true;
        if (engineB.getNodeState(nodeId) === "RUNNING" && engineB.transition(nodeId, target).ok) progressedB = true;
      }
      engineB.computeReadyNodes();
    }
    op.runRegistry.registerFreshEngine(runIdB, engineB);
    await post(op.baseUrl + "/api/runs/" + runIdB + "/nodes/EF-04-LINEAGE/run");

    await op.mono03.coordinator.recordLineagePass(runIdB, { reviewSchemaHash: "perime", lineageAssurance: {} }, { "EF-03A": stateA.artifactRefs["EF-03A"] });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.click("text=" + runIdB);
    await page.waitForSelector("text=Lineage Gate");
    const lineageText = await page.textContent("section[aria-label='Lineage']");
    check("T07-37c-1. lineage STALE jamais presente comme un PASS courant valide dans la vraie UI", lineageText.indexOf("Ouvrir le rapport") === -1, lineageText);

    const httpReport = await getJson(op.baseUrl + "/api/runs/" + runIdB + "/report");
    check("T07-37c-2. OperatorApi.getReport() = LINEAGE_BLOCKED sur le PASS stale", httpReport.status >= 400 && httpReport.body.errorCode === "LINEAGE_BLOCKED", JSON.stringify(httpReport.body));

    await browser.close();
    await op.close();
    await upstream.close();
  }

  // === T07-37d : DOUBLE CLIC / CONCURRENCY UI ===
  {
    const upstream = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(upstream.baseUrl);
    const runId = "t07-browser-dblclick";
    const missionId = "mission-t07-browser-dblclick";
    const op = await startServerWithSeededRun(mono05Root, { runId: runId, missionId: missionId, providerConfigs: providerConfigs });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.click("text=" + runId);
    await page.waitForSelector(".node-box");
    const runButton = page.locator(".node-box", { hasText: "EF-04-LINEAGE" }).locator("button", { hasText: "Run" });
    await Promise.all([runButton.click(), runButton.click()]);
    await page.waitForTimeout(800);

    const artifacts = await getJson(op.baseUrl + "/api/runs/" + runId + "/artifacts");
    const lineageArtifacts = (artifacts.body || []).filter(function (a) { return a.nodeId === "EF-04-LINEAGE"; });
    check("T07-37d-1. double-clic reel -> aucun double artefact (exactement 1 ArtifactRecord)", lineageArtifacts.length === 1, JSON.stringify(lineageArtifacts.length));

    const nodeState = await getJson(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04-LINEAGE");
    check("T07-37d-2. attemptCount coherent (pas de double comptage metier)", nodeState.body.attemptCount === 1, nodeState.body.attemptCount);
    check("T07-37d-3. le noeud atteint SUCCESS malgre le double-clic (collision geree, jamais un echec metier)", nodeState.body.state === "SUCCESS", nodeState.body.state);

    await browser.close();
    await op.close();
    await upstream.close();
  }

  // === T07-37e/f/g : SECRETS BROWSER ===
  {
    const SECRET_NAME = "SYNTHETIC_MONO07_SECRET_NAME";
    const SECRET_VALUE = "SYNTHETIC_MONO07_SECRET_VALUE_9f8e7d6c5b4a";
    const upstream = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(upstream.baseUrl);
    const runId = "t07-browser-secrets";
    const missionId = "mission-t07-browser-secrets";
    const secrets = {};
    secrets[SECRET_NAME] = SECRET_VALUE;
    const op = await startServerWithSeededRun(mono05Root, { runId: runId, missionId: missionId, providerConfigs: providerConfigs, secrets: secrets });
    await post(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04-LINEAGE/run");
    await post(op.baseUrl + "/api/runs/" + runId + "/nodes/EF-04A/run");

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(op.baseUrl + "/");
    await page.click("text=" + runId);
    await page.waitForSelector("text=Lineage Gate");
    await page.locator("button", { hasText: "Ouvrir le rapport" }).click();
    await page.waitForSelector("text=reference_revalidated_not_source_hash_bound");

    const domText = await page.content();
    check("T07-37e. le secret n'apparait jamais dans le DOM", domText.indexOf(SECRET_VALUE) === -1);
    const localStorageDump = await page.evaluate(function () { return JSON.stringify(localStorage); });
    check("T07-37f. le secret n'apparait jamais dans localStorage", localStorageDump.indexOf(SECRET_VALUE) === -1, localStorageDump);
    const sessionStorageDump = await page.evaluate(function () { return JSON.stringify(sessionStorage); });
    check("T07-37g. le secret n'apparait jamais dans sessionStorage", sessionStorageDump.indexOf(SECRET_VALUE) === -1, sessionStorageDump);

    await browser.close();
    await op.close();
    await upstream.close();
  }

  const failed = results.filter(function (r) { return !r.pass; });
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log((r.pass ? "PASS" : "FAIL") + " - " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  }
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
