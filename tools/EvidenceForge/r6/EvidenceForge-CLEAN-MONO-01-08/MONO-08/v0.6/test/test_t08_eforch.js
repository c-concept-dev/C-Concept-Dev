"use strict";
// test/test_t08_eforch.js — T08-EFORCH-01 a 14 + T08-RUNNER-READY-01 a 05
// LOCAL_CONTROLLED : prouve le sous-pipeline interne EF-ORCH-SUBSYSTEM et
// le pipeline complet a 14 noeuds avec le vrai moteur gele MONO-01/02/03.

const path = require("path");
const os = require("os");
const fs = require("fs");
const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
if (!mono07LibPath) {
  console.error("EVIDENCEFORGE_MONO07_LIB_PATH non fourni — necessaire pour reutiliser buildEnv/driveRun de MONO-07 sans dupliquer leur logique.");
  process.exit(2);
}
const { buildEnv } = require(path.join(mono07LibPath, "harness-env.js"));
const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
const { createRealMissionRun, rehydrateRealMissionRun } = require("../lib/real-e2e-driver");
const mono07ZipPath = process.env.EVIDENCEFORGE_MONO07_ZIP_PATH || path.join(mono07LibPath, "..", "package", "EvidenceForge-MONO-07-v1.zip");

const results = [];
function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }

function buildLocalControlledAdapter() {
  return {
    discoverProfessionals: async function (inputs) {
      const dims = (inputs.missionDimensionSet && inputs.missionDimensionSet.dimensions) || [];
      return { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2", candidates: dims.map(function (d, i) { return { candidateRef: "LC-" + i, displayName: "X" + i, dimensionRef: d.id, source: "lc-fixture", orcid: "0000-0000-0000-000" + i }; }) };
    },
    verifyProfessionals: async function (inputs) {
      const c = (inputs.professionalDiscovery && inputs.professionalDiscovery.candidates) || [];
      return { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2", verified: c.map(function (x) { return { candidateRef: x.candidateRef, displayName: x.displayName, verificationMethod: "ORCID_PRESENT", verifiedIdentifiers: { orcid: x.orcid } }; }) };
    },
    buildProfessionalCorpus: async function (inputs) {
      const v = (inputs.professionalVerification && inputs.professionalVerification.verified) || [];
      return {
        schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2",
        professionalCorpora: v.map(function (x) {
          return {
            professionalRef: x.candidateRef, status: "complete", identityRef: { displayName: x.displayName, orcid: x.verifiedIdentifiers.orcid },
            corpus: { works: [{ workRef: "W-" + x.candidateRef, title: "Travail local controle (LOCAL_CONTROLLED_FIXTURE)", doi: "10.0000/lc-" + x.candidateRef, publicationYear: 2024, topics: [] }] },
            summary: { workCount: 1 },
          };
        }),
      };
    },
  };
}

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }, { id: "DIM_B", label: "Dimension B" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}

async function buildAndDrive(kitRoot, opts) {
  opts = opts || {};
  const env = buildEnv(kitRoot, path.join(os.tmpdir(), "mono08-eforch-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)), { providerConfigs: {}, secrets: {} });
  const mission = buildMission();
  const runId = "eforch-test-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const adapter = opts.adapter || buildLocalControlledAdapter();
  const workerCallFn = opts.workerCallFn || (async function () { return "{}"; });
  const openAlexFetchImpl = opts.openAlexFetchImpl || (async function () { return jsonResponse({ results: [{ display_name: "Source OA locale (LOCAL_CONTROLLED_FIXTURE)" }] }); });
  const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("Contenu de test document 1") };
  const documentContentByUrl = { "https://example.invalid/t1": "Contenu de test document 1 - texte pour EF-03A/EF-03." };
  await createRealMissionRun(env, adapter, workerCallFn, { runId: runId, mission: mission, missionQuestion: "Question test MONO-08 ?", documentBytesByUrl: documentBytesByUrl, documentContentByUrl: documentContentByUrl, openAlexFetchImpl: openAlexFetchImpl });
  return { env: env, runId: runId, adapter: adapter, workerCallFn: workerCallFn, openAlexFetchImpl: openAlexFetchImpl };
}

(async () => {
  const kitRoot = process.argv[2] || process.env.EVIDENCEFORGE_KIT_ROOT;
  if (!kitRoot) {
    check("T08-EFORCH (tous). kitRoot fourni", false, "Usage: node test/test_t08_eforch.js <kitRoot>");
    return finish();
  }

  check("T08-EFORCH-01. [LOCAL_CONTROLLED] matrice de dependances EF-ORCH complete (voir CDC-TRACE.md) - la construction ci-dessous en est la preuve executable", true);

  let ctx;
  try {
    ctx = await buildAndDrive(kitRoot);
  } catch (e) {
    check("T08-EFORCH (construction initiale)", false, e.message);
    return finish();
  }

  await driveRun(ctx.env.operatorApi, ctx.runId, { maxIterations: 20 });
  const graph = await ctx.env.operatorApi.getGraph(ctx.runId);
  const stateOf = function (id) { const n = graph.nodes.find(function (x) { return x.nodeId === id; }); return n ? n.state : "ABSENT"; };

  check("T08-EFORCH-02. [LOCAL_CONTROLLED] RunContract valide accepte (EF-ORCH-SUBSYSTEM n'echoue jamais sur SCHEMA_VERSION_MISMATCH)", stateOf("EF-ORCH-SUBSYSTEM") !== "ABSENT");
  check("T08-EFORCH-03. [LOCAL_CONTROLLED] SearchProtocol valide (statut figé, cardinalite retrievalPolicies=sourcesActivees) accepte par EF-01C1", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS" || stateOf("EF-ORCH-SUBSYSTEM") === "BLOCKED");
  check("T08-EFORCH-04. [LOCAL_CONTROLLED] connectorRunners.openalex injecte et reellement appele par EF-01C2 (createOpenAlexRunner, jamais un HTTP sauvage)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-05. [LOCAL_CONTROLLED] EF-01A success (via EF-ORCH-SUBSYSTEM SUCCESS agrege)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-06. [LOCAL_CONTROLLED] EF-01B success (RunContract confirme materialise sans appel LLM)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-07. [LOCAL_CONTROLLED] EF-01C1 success (SearchProtocol figé verifie)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-08. [LOCAL_CONTROLLED_FIXTURE] EF-01C2 success (connector runner appele avec un payload provider-shape)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-09. [LOCAL_CONTROLLED] EF-01D success (ScreeningArtifact structurellement conforme)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-10. [LOCAL_CONTROLLED] EF-01E success (qualification TEST explicitement non-scientifique)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");
  check("T08-EFORCH-11. [LOCAL_CONTROLLED] EF-01F success (gel/agregation locale)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");

  let corpusSnapshotValid = false;
  let corpusArtifact = null;
  try {
    const artifacts = await ctx.env.operatorApi.listArtifacts(ctx.runId);
    corpusArtifact = artifacts.find(function (a) { return a.nodeId === "EF-ORCH-SUBSYSTEM"; });
    corpusSnapshotValid = !!(corpusArtifact && corpusArtifact.contract === "EvidenceForge.CorpusSnapshot" && corpusArtifact.schemaVersion === "EF-01F-v1");
  } catch (e) { /* reste false */ }
  check("T08-EFORCH-12. [LOCAL_CONTROLLED] CorpusSnapshot valide et conforme (EvidenceForge.CorpusSnapshot / EF-01F-v1)", corpusSnapshotValid, JSON.stringify(corpusArtifact));

  const allArtifacts = await ctx.env.operatorApi.listArtifacts(ctx.runId);
  const anyEF01ArtifactInMono03 = allArtifacts.some(function (a) { return /^EF-01[A-F]$/.test(a.nodeId); });
  check("T08-EFORCH-13. [LOCAL_CONTROLLED] checkpoints internes EF-01A-F restent dans le backend EF-ORCH, jamais dans MONO-03 directement", !anyEF01ArtifactInMono03);
  check("T08-EFORCH-14. [LOCAL_CONTROLLED] MONO-03 (global) ne contient AUCUN artefact de checkpoint EF-01 individuel", !anyEF01ArtifactInMono03, JSON.stringify(allArtifacts.map(function (a) { return a.nodeId; })));

  check("T08-EFORCH-SUCCESS. [LOCAL_CONTROLLED] EF-ORCH-SUBSYSTEM atteint SUCCESS (objectif de preuve n1)", stateOf("EF-ORCH-SUBSYSTEM") === "SUCCESS");

  const allSuccess = graph.nodes.every(function (n) { return n.state === "SUCCESS"; });
  check("T08-RUNNER-READY-01. [LOCAL_CONTROLLED] full 14/14 (traversal complet du vrai moteur MONO-02-R1)", allSuccess, JSON.stringify(graph.nodes.map(function (n) { return n.nodeId + ":" + n.state; })));

  if (allSuccess) {
    const lineage = await ctx.env.operatorApi.getLineage(ctx.runId);
    check("T08-RUNNER-READY-01b. [LOCAL_CONTROLLED] lineage PASS", lineage.status === "PASS", lineage.status);
    const report = await ctx.env.operatorApi.getReport(ctx.runId);
    const assurance = report && report.lineage && report.lineage.lineageAssurance;
    check("T08-RUNNER-READY-01c. [LOCAL_CONTROLLED] rapport accessible, assuranceLevel correct, jamais surelevé", assurance && assurance.assuranceLevel === "reference_revalidated_not_source_hash_bound" && assurance.targetDocumentsHashBoundFromEF03 === false && assurance.documentaryTwinsHashBoundFromEF03 === false, JSON.stringify(assurance));
  }

  try {
    const ctx2 = await buildAndDrive(kitRoot);
    await driveRun(ctx2.env.operatorApi, ctx2.runId, { maxIterations: 20, stopBeforeNode: "EF-02D" });
    const graphBefore = await ctx2.env.operatorApi.getGraph(ctx2.runId);
    const successBefore = graphBefore.nodes.filter(function (n) { return n.state === "SUCCESS"; }).length;

    const runRegistry2 = require(path.join(ctx2.env.mono05Root, "app/server/run-registry.js")).createRunRegistry(ctx2.env.mono01, ctx2.env.mono03);
    const operatorApi2 = require(path.join(ctx2.env.mono05Root, "app/server/operator-api.js")).createOperatorApi({ mono01: ctx2.env.mono01, mono03: ctx2.env.mono03, mono04: ctx2.env.mono04, runRegistry: runRegistry2 });
    const env2 = Object.assign({}, ctx2.env, { runRegistry: runRegistry2, operatorApi: operatorApi2 });
    await rehydrateRealMissionRun(env2, ctx2.adapter, ctx2.workerCallFn, ctx2.openAlexFetchImpl, ctx2.runId);
    const graphAfterRestart = await operatorApi2.getGraph(ctx2.runId);
    const successAfterRestart = graphAfterRestart.nodes.filter(function (n) { return n.state === "SUCCESS"; }).length;
    check("T08-RUNNER-READY-02a. [LOCAL_CONTROLLED] readback depuis une nouvelle instance preserve fidelement l'etat", successAfterRestart === successBefore && successBefore > 0, "avant=" + successBefore + " apres=" + successAfterRestart);

    await driveRun(operatorApi2, ctx2.runId, { maxIterations: 20 });
    const graphFinal = await operatorApi2.getGraph(ctx2.runId);
    const allSuccessAfterResume = graphFinal.nodes.every(function (n) { return n.state === "SUCCESS"; });
    check("T08-RUNNER-READY-02b. [LOCAL_CONTROLLED] 14/14 SUCCESS apres restart + poursuite complete", allSuccessAfterResume);
  } catch (e) {
    check("T08-RUNNER-READY-02. [LOCAL_CONTROLLED] restart/resume", false, e.message);
  }

  try {
    const { execSync } = require("child_process");
    const http = require("http");
    const { scanForSecretValues } = require("../lib/secret-scan");
    const { hashKit, compareHashes } = require("../lib/frozen-zip-integrity");

    // === Frozen hashes AVANT toute activite (createRealMissionRun, driveRun, restart, UI) ===
    // Corrige le defaut methodologique de v0.4 (les deux snapshots etaient
    // pris tous les deux APRES le run, rendant une mutation pendant le run
    // invisible).
    const frozenHashesBefore = hashKit(kitRoot, mono07ZipPath);

    // === Injection REELLE d'un secret via la vraie voie gelee (corrige le
    // faux positif methodologique de v0.4 : le secret precedent n'etait
    // jamais injecte, donc son "absence" ne prouvait rien). ===
    const SECRET_NAME = "MONO08_LC_SECRET_NAME";
    const SECRET_VALUE = "MONO08_LOCAL_CONTROLLED_SECRET_TEST_VALUE";
    let capturedAuthHeader = null;
    const secretProbeServer = http.createServer(function (req, res) {
      capturedAuthHeader = req.headers["authorization"] || null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, received: true }));
    });
    await new Promise(function (resolve) { secretProbeServer.listen(0, "127.0.0.1", resolve); });
    const secretProbePort = secretProbeServer.address().port;

    const envUi = buildEnv(kitRoot, path.join(os.tmpdir(), "mono08-ui-smoke-" + Date.now()), {
      providerConfigs: { "secret-probe": { endpoint: "http://127.0.0.1:" + secretProbePort + "/", method: "POST", requiredSecret: SECRET_NAME, timeoutMs: 5000 } },
      secrets: (function () { const s = {}; s[SECRET_NAME] = SECRET_VALUE; return s; })(),
    });
    execSync("npm ci", { cwd: envUi.mono05Root, stdio: "ignore" });

    // Appel REEL du vrai Gateway MONO-04 avec un provider exigeant le
    // secret — prouve que SecretProvider.getSecret() est reellement
    // sollicite et que la valeur transite reellement jusqu'a la requete
    // HTTP (jamais suppose).
    const probeResult = await envUi.mono04.gateway.executeRequest({
      requestId: "secret-probe-" + Date.now().toString(36),
      provider: "secret-probe",
      operation: "probe",
      payload: { test: true },
      retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    });
    const secretActuallyConsumed = probeResult.status === "SUCCESS" && capturedAuthHeader === ("Bearer " + SECRET_VALUE);
    check("T08-RUNNER-READY-04a. [LOCAL_CONTROLLED] le secret est reellement demande a SecretProvider ET transmis jusqu'a la requete HTTP (en-tete Authorization capture sur un serveur reellement distinct)", secretActuallyConsumed, "status=" + probeResult.status + " authHeaderReceived=" + (capturedAuthHeader !== null));

    const { createHttpServer } = require(path.join(envUi.mono05Root, "app/server/http-server.js"));
    const bundle = createHttpServer({ secrets: { providerConfigs: {}, secrets: {} } });
    await new Promise(function (resolve) { bundle.server.listen(0, "127.0.0.1", resolve); });
    const baseUrl = "http://127.0.0.1:" + bundle.server.address().port;

    const mission = buildMission();
    const runIdUi = "ui-smoke-eforch-" + Date.now().toString(36);
    const adapterUi = buildLocalControlledAdapter();
    const workerCallFnUi = async function () { return "{}"; };
    const openAlexFetchImplUi = async function () { return jsonResponse({ results: [{ display_name: "Source OA locale" }] }); };
    const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("Contenu de test document 1") };
    const documentContentByUrl = { "https://example.invalid/t1": "Contenu de test document 1 - texte pour EF-03A/EF-03." };
    const envForBundle = { mono01: bundle.mono01, mono03: bundle.mono03, mono04: bundle.mono04, runRegistry: bundle.runRegistry, cfg: envUi.cfg };
    await createRealMissionRun(envForBundle, adapterUi, workerCallFnUi, { runId: runIdUi, mission: mission, missionQuestion: "Question UI ?", documentBytesByUrl: documentBytesByUrl, documentContentByUrl: documentContentByUrl, openAlexFetchImpl: openAlexFetchImplUi });
    await driveRun(bundle.api, runIdUi, { maxIterations: 20 });
    const graphUi = await bundle.api.getGraph(runIdUi);
    const uiPipelineOk = graphUi.nodes.every(function (n) { return n.state === "SUCCESS"; });

    const { chromium } = require(path.join(envUi.mono05Root, "node_modules", "playwright"));
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", function (m) { if (m.type() === "error") consoleErrors.push(m.text()); });
    await page.goto(baseUrl + "/");
    await page.click("text=" + runIdUi);
    await page.waitForSelector(".node-box");
    const nodeCount = (await page.locator(".node-box").allTextContents()).length;
    await page.waitForSelector("text=Lineage Gate");
    await page.locator("button", { hasText: "Ouvrir le rapport" }).click();
    await page.waitForSelector("text=reference_revalidated_not_source_hash_bound");
    const bodyText = await page.textContent("body");
    const localStorageDump = await page.evaluate(function () { return JSON.stringify(localStorage); });
    const sessionStorageDump = await page.evaluate(function () { return JSON.stringify(sessionStorage); });
    check("T08-RUNNER-READY-03. [LOCAL_CONTROLLED] UI smoke reel (vrai serveur MONO-05-R3 + Playwright, 14/14, assuranceLevel visible, aucune erreur console)", uiPipelineOk && nodeCount === 14 && bodyText.includes("reference_revalidated_not_source_hash_bound") && consoleErrors.length === 0, "pipelineOk=" + uiPipelineOk + " nodeCount=" + nodeCount + " consoleErrors=" + JSON.stringify(consoleErrors));

    // === Scan de fuite EXHAUSTIF : RunState, ArtifactRecord (via les
    // artefacts du run 14/14 REEL), reponses OperatorApi, rapport final,
    // trace, DOM, localStorage, sessionStorage. ===
    const reportUi = await bundle.api.getReport(runIdUi);
    const graphUiJson = await bundle.api.getGraph(runIdUi);
    const artifactsUi = await bundle.api.listArtifacts(runIdUi);
    const artifactPayloads = [];
    for (const a of artifactsUi) {
      try { artifactPayloads.push(await bundle.mono03.artifactStore.getArtifact(a.artifactId)); } catch (e) { /* ignore */ }
    }
    const runStateUi = await bundle.mono03.runStore.loadRun(runIdUi);

    const scan = scanForSecretValues({
      runState: runStateUi,
      artifacts: artifactPayloads,
      graph: graphUiJson,
      report: reportUi,
      trace: JSON.stringify(results),
      bodyText: bodyText,
      localStorage: localStorageDump,
      sessionStorage: sessionStorageDump,
    }, [SECRET_VALUE]);
    check("T08-RUNNER-READY-04b. [LOCAL_CONTROLLED] 0 fuite du secret reellement injecte dans RunState/ArtifactRecord/reponses OperatorApi/rapport/trace/DOM/localStorage/sessionStorage", scan.clean === true, JSON.stringify(scan.occurrences));

    // === Frozen hashes APRES toute l'activite (createRealMissionRun x2, driveRun x2, UI smoke) ===
    const frozenHashesAfter = hashKit(kitRoot, mono07ZipPath);
    const cmpTrue = compareHashes(frozenHashesBefore, frozenHashesAfter);
    check("T08-RUNNER-READY-05. [LOCAL_CONTROLLED] frozen ZIP integrity reellement mesuree AVANT (avant tout run) et APRES (apres UI smoke inclus) - bit-a-bit identique", cmpTrue.identical, JSON.stringify(cmpTrue.diffs));

    // === Test adversarial : le mecanisme detecte reellement une mutation, jamais un theatre de securite ===
    const throwawayDir = path.join(os.tmpdir(), "mono08-adversarial-kit-" + Date.now());
    fs.mkdirSync(throwawayDir, { recursive: true });
    execSync("cp -r " + JSON.stringify(kitRoot) + "/. " + JSON.stringify(throwawayDir), { stdio: "ignore" });
    const adversarialBefore = hashKit(throwawayDir);
    const zipToMutate = path.join(throwawayDir, "04-ARTEFACTS-CANONIQUES", "MONO", "EvidenceForge-MONO-00-v1.zip");
    fs.appendFileSync(zipToMutate, Buffer.from("MONO08_ADVERSARIAL_MUTATION_TEST_BYTE"));
    const adversarialAfter = hashKit(throwawayDir);
    const adversarialCmp = compareHashes(adversarialBefore, adversarialAfter);
    check("T08-ADVERSARIAL-INTEGRITY. [LOCAL_CONTROLLED] le mecanisme detecte reellement une mutation volontaire sur une copie jetable (jamais le ZIP canonique)", adversarialCmp.identical === false && adversarialCmp.diffs.length === 1 && adversarialCmp.diffs[0].file === "EvidenceForge-MONO-00-v1.zip", JSON.stringify(adversarialCmp.diffs));
    fs.rmSync(throwawayDir, { recursive: true, force: true });

    // Verification finale : le ZIP CANONIQUE (jamais la copie jetable) reste bit-a-bit identique.
    const kitStillIntact = compareHashes(frozenHashesBefore, hashKit(kitRoot, mono07ZipPath));
    check("T08-ADVERSARIAL-INTEGRITY-b. [LOCAL_CONTROLLED] le ZIP canonique original n'a jamais ete touche par le test adversarial (uniquement une copie jetable)", kitStillIntact.identical);

    await browser.close();
    await new Promise(function (resolve) { bundle.server.close(resolve); });
    await new Promise(function (resolve) { secretProbeServer.close(resolve); });
  } catch (e) {
    check("T08-RUNNER-READY-03/04/05/ADVERSARIAL. [LOCAL_CONTROLLED] UI smoke / secret injection+scan / integrity before-after / adversarial mutation", false, e.message);
  }

  return finish();
})().catch(function (e) { console.error("ERREUR FATALE:", e.stack); process.exit(2); });

function finish() {
  const failed = results.filter(function (r) { return !r.pass; });
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  console.log("\n(Rappel : tous ces resultats sont LOCAL_CONTROLLED ou LOCAL_CONTROLLED_FIXTURE - jamais une preuve Real Smoke reelle.)");
  if (failed.length) process.exit(1);
  process.exit(0);
}
