#!/usr/bin/env node
"use strict";
/**
 * bin/run-real-smoke.js — orchestrateur complet MONO-08 (v0.4).
 *
 * Sequence complete, REELLEMENT enchainee (aucune branche NOT_RUN par
 * construction sur le happy path READY) :
 *   baseline gate -> frozen-zip-integrity (avant) -> preflight ->
 *   mission gate -> connectivity -> construction EF-ORCH complete
 *   (RunContract, SearchProtocol, ScreeningArtifact, etc. via les
 *   builders geles identifies par inspection contractuelle) -> driveRun
 *   (14-node, reutilise tel quel depuis MONO-07) -> persistence restart
 *   (nouvelle instance + readback, lib/real-e2e-driver.js) -> UI smoke
 *   (vrai createHttpServer + Playwright) -> secret scan -> frozen ZIP
 *   integrity (apres) -> reports.
 *
 * Dans CET environnement, preflight reste BLOCKED — tout le code
 * ci-dessous jusqu'a l'UI smoke inclus est CODE READY (verifie
 * exhaustivement en LOCAL_CONTROLLED, voir test/test_t08_eforch.js,
 * 23/23) mais jamais execute ICI contre de vraies dependances externes
 * (evidenceStatus = NOT_RUN_ENVIRONMENT_BLOCKED), jamais presente comme
 * une preuve Real Smoke.
 *
 * OPENALEX FETCHIMPL REEL : EF-01C2 (MONO-01/dependencies/
 * ef-orch-ef01c2-runner-openalex-v0.1.js) est un sous-systeme HTTP gele
 * autonome, concu par son propre commentaire d'en-tete pour recevoir un
 * `fetch` reel en production ("la production utilise fetch réel") —
 * DECOUPLE de MONO-04 par conception (retry/pagination/backoff propres a
 * ce module, jamais recomposes via le Gateway generique). Utiliser le
 * `fetch` global de Node ici respecte donc le contrat gele tel qu'ecrit,
 * ce n'est jamais un contournement de MONO-04.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { runPreflight } = require("../lib/preflight");
const { resolveKitRoot } = require("../lib/kit-root");
const { hashKit, compareHashes } = require("../lib/frozen-zip-integrity");
const { scanForSecretValues } = require("../lib/secret-scan");
const { buildRealProviderConfigs } = require("../lib/real-provider-configs");
const { buildRealExternalStageAdapter, buildRealLlmWorkerCallFn } = require("../lib/real-external-adapter");
const { createRealMissionRun, rehydrateRealMissionRun } = require("../lib/real-e2e-driver");

function loadMission() {
  const missionPath = path.join(__dirname, "..", "fixtures", "mission-real-smoke-v1.json");
  return JSON.parse(fs.readFileSync(missionPath, "utf8"));
}

/**
 * REMEDIATION F-02/F-03/F-04 : ce binaire execute une mission REELLE — il ne
 * doit donc JAMAIS laisser lib/eforch-artifacts.js fabriquer un acteur=
 * "human" ou un provider/model/hash LLM synthetique. La provenance REELLE
 * (appel LLM EF-01B/EF-01C1 reellement effectue, decision humaine EF-01D
 * reellement prise par l'operateur) doit etre fournie explicitement par
 * l'operateur via mission.eForchProvenance dans fixtures/mission-real-
 * smoke-v1.json ({ resolverRuns:[...], plannerRun:{...}, auditDecisions:{
 * [sourceId]: {...} } }). Si ce champ est absent (cas de ce depot
 * aujourd'hui — jamais invente ici), createRealMissionRun leve
 * OPERATOR_INPUT_REQUIRED : c'est le comportement correct fail-closed, pas
 * un bug a contourner.
 */
function loadRealProvenance(mission) {
  return mission.eForchProvenance || {};
}

/**
 * REMEDIATION F-14 (audit MONO-08, test_t08_runner_orchestration.js
 * BUG_TEST) : extrait le predicat mission-gate en une fonction pure et
 * exportee, testable independamment du contenu MUTABLE de fixtures/
 * mission-real-smoke-v1.json (qui a legitimement atteint readyForExecution
 * =true en v0.6 — l'ancien test asserait a tort que la mission fournie
 * resterait TOUJOURS incomplete).
 */
function missionGateStatus(mission) {
  return mission.readyForExecution ? "PASS" : "MISSION_NOT_READY";
}

/**
 * Construit documentBytesByUrl/documentContentByUrl a partir des champs
 * operateur du fichier mission (contentBase64/content) — jamais un fetch
 * automatique des documents cibles : EF-01A est par conception une
 * interface de saisie humaine (voir CDC-TRACE.md), les documents sont
 * fournis, jamais recuperes automatiquement par le pipeline.
 */
function extractDocumentPayloads(mission) {
  const documentBytesByUrl = {};
  const documentContentByUrl = {};
  for (const doc of mission.targetDocuments) {
    if (doc.status !== "VERIFIED") continue; // les entrees OPERATOR_INPUT_REQUIRED sont ignorees, jamais fabriquees
    if (!doc.contentBase64 || !doc.content) {
      throw new Error("extractDocumentPayloads: document \"" + doc.documentId + "\" (" + doc.url + ") marque VERIFIED mais content/contentBase64 absent - l'operateur doit fournir le contenu reel du document dans fixtures/mission-real-smoke-v1.json avant un run reel (jamais un fetch automatique).");
    }
    documentBytesByUrl[doc.url] = Buffer.from(doc.contentBase64, "base64");
    documentContentByUrl[doc.url] = doc.content;
  }
  return { documentBytesByUrl, documentContentByUrl };
}

function realOpenAlexFetchImpl(timeoutMs) {
  return async function (url) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { ok: res.ok, status: res.status, json: async function () { return res.json(); } };
    } finally {
      clearTimeout(timer);
    }
  };
}

const trace = { schema: "MONO-08.RealSmokeTrace", version: "v1", steps: [], startedAt: new Date().toISOString() };
function record(step, status, detail, evidenceType) {
  const entry = { step: step, status: status, detail: detail || null, evidenceType: evidenceType || "REAL", at: new Date().toISOString() };
  trace.steps.push(entry);
  console.log("[" + status + "] " + step + " (" + entry.evidenceType + ")" + (detail ? " - " + detail : ""));
}

function writeReports() {
  const outDir = path.join(__dirname, "..", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "mono-08-real-smoke-trace-v1.json"), JSON.stringify(trace, null, 2));
}

async function main() {
  let kitRoot;
  try {
    kitRoot = resolveKitRoot();
  } catch (e) {
    record("baseline-gate", "BLOCKED", "KIT_ROOT_REQUIRED: " + e.message);
    return finish(2);
  }

  const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
  // Le ZIP gele de MONO-07 (livrable frere, jamais dans le kit R3) est
  // resolu depuis EVIDENCEFORGE_MONO07_ZIP_PATH si fourni, ou par defaut
  // relatif a mono07LibPath (../package/EvidenceForge-MONO-07-v1.zip,
  // structure standard des livrables MONO-07) — optionnel, jamais bloquant
  // si absent (l'integrite couvre alors les 7 ZIP du kit uniquement).
  const mono07ZipPath = process.env.EVIDENCEFORGE_MONO07_ZIP_PATH || (mono07LibPath ? path.join(mono07LibPath, "..", "package", "EvidenceForge-MONO-07-v1.zip") : null);
  if (!mono07LibPath) {
    record("baseline-gate", "BLOCKED", "EVIDENCEFORGE_MONO07_LIB_PATH non fourni.");
    return finish(2);
  }

  let gateReport;
  try {
    const { assertMono06GatePasses } = require(path.join(mono07LibPath, "mono06-gate.js"));
    const workDir = path.join(process.env.EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir(), "mono08-gate-work");
    gateReport = await assertMono06GatePasses(kitRoot, workDir);
    record("baseline-gate", "PASS", "MONO=" + gateReport.globalTotals.monoObserved + "/" + gateReport.globalTotals.monoExpected + ", historique=" + gateReport.globalTotals.historiqueObserved + "/" + gateReport.globalTotals.historiqueExpected);
  } catch (e) {
    record("baseline-gate", "FAIL", e.message);
    return finish(1);
  }

  let hashBefore;
  try {
    hashBefore = hashKit(kitRoot, mono07ZipPath);
    record("frozen-zip-integrity-before", "PASS", "hash calcule pour " + Object.keys(hashBefore).length + " ZIP canoniques.");
  } catch (e) {
    record("frozen-zip-integrity-before", "FAIL", e.message);
    return finish(1);
  }

  const preflight = await runPreflight();
  fs.mkdirSync(path.join(__dirname, "..", "reports"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "reports", "mono-08-preflight-v1.json"), JSON.stringify(preflight, null, 2));
  record("preflight", preflight.overallStatus === "READY" ? "PASS" : "BLOCKED", preflight.overallStatus);

  if (preflight.overallStatus !== "READY") {
    record("mission-gate", "NOT_RUN_ENVIRONMENT_BLOCKED", "preflight non READY.", "NOT_RUN");
    record("connectivity", "NOT_RUN_ENVIRONMENT_BLOCKED", "preflight non READY - aucun appel externe reel tente.", "NOT_RUN");
    record("full-pipeline", "NOT_RUN_ENVIRONMENT_BLOCKED", "depend de connectivity.", "NOT_RUN");
    record("persistence-restart", "NOT_RUN_ENVIRONMENT_BLOCKED", "depend du full pipeline.", "NOT_RUN");
    record("ui-smoke", "NOT_RUN_ENVIRONMENT_BLOCKED", "depend du full pipeline.", "NOT_RUN");
    record("secret-scan", "NOT_RUN_ENVIRONMENT_BLOCKED", "aucun run reel a scanner.", "NOT_RUN");
  } else {
    const mission = loadMission();
    if (missionGateStatus(mission) === "MISSION_NOT_READY") {
      record("mission-gate", "MISSION_NOT_READY", "readyForExecution=false - au moins une reference reste OPERATOR_INPUT_REQUIRED (voir MISSION.md). Aucun appel externe couteux tente.");
      const hashAfterEarly = hashKit(kitRoot, mono07ZipPath);
      record("frozen-zip-integrity-after", compareHashes(hashBefore, hashAfterEarly).identical ? "PASS" : "FAIL", "verifie malgre l'arret anticipe.");
      return finish(2);
    }
    record("mission-gate", "PASS", "mission complete, readyForExecution=true.");
    await runFullPipeline(kitRoot, mono07LibPath, mission);
  }

  try {
    const hashAfter = hashKit(kitRoot, mono07ZipPath);
    const cmp = compareHashes(hashBefore, hashAfter);
    record("frozen-zip-integrity-after", cmp.identical ? "PASS" : "FAIL", cmp.identical ? "bit-a-bit identique." : JSON.stringify(cmp.diffs));
  } catch (e) {
    record("frozen-zip-integrity-after", "FAIL", e.message);
  }

  const anyFail = trace.steps.some(function (s) { return s.status === "FAIL"; });
  const anyOperatorInputRequired = trace.steps.some(function (s) { return s.status === "OPERATOR_INPUT_REQUIRED"; });
  // OPERATOR_INPUT_REQUIRED (F-02/F-03/F-04) : jamais confondu avec un PASS
  // (exit 0) ni avec une panne technique (exit 1) — code dedie, jamais
  // presente comme un Real Smoke reussi.
  return finish(anyFail ? 1 : (anyOperatorInputRequired ? 4 : (preflight.overallStatus === "READY" ? 0 : 2)));
}

async function runFullPipeline(kitRoot, mono07LibPath, mission) {
  const { buildEnv } = require(path.join(mono07LibPath, "harness-env.js"));
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  const providerConfigs = buildRealProviderConfigs();
  const runId = "mono08-real-smoke-" + Date.now().toString(36);
  const missionId = mission.missionId;
  const workRoot = process.env.EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir();

  let payloads;
  try {
    payloads = extractDocumentPayloads(mission);
  } catch (e) {
    record("mission-gate", "MISSION_NOT_READY", e.message);
    return;
  }

  let env;
  try {
    env = buildEnv(kitRoot, path.join(workRoot, "mono08-real-work-" + Date.now()), { providerConfigs: providerConfigs, secrets: process.env });
    record("connectivity", "PASS", "environnement MONO-01->05 assemble avec des providers reels configures.");
  } catch (e) {
    record("connectivity", "FAIL", e.message);
    return;
  }

  const adapter = buildRealExternalStageAdapter(env.mono04, { runId: runId, missionId: missionId });
  const realWorkerCallFn = buildRealLlmWorkerCallFn(env.mono04, { runId: runId, missionId: missionId });
  const timeoutMs = parseInt(process.env.EVIDENCEFORGE_HTTP_TIMEOUT_MS || "8000", 10);
  const openAlexFetchImpl = realOpenAlexFetchImpl(timeoutMs);

  const missionInput = {
    dimensions: mission.dimensions,
    targetDocuments: mission.targetDocuments.filter(function (d) { return d.status === "VERIFIED"; }).map(function (d) { return { documentId: d.documentId, title: d.title, url: d.url }; }),
  };

  try {
    await createRealMissionRun(env, adapter, realWorkerCallFn, {
      runId: runId, missionId: missionId, mission: missionInput, missionQuestion: mission.missionQuestion,
      documentBytesByUrl: payloads.documentBytesByUrl, documentContentByUrl: payloads.documentContentByUrl, openAlexFetchImpl: openAlexFetchImpl,
      mode: "REAL", realProvenance: loadRealProvenance(mission),
    });
  } catch (e) {
    // OPERATOR_INPUT_REQUIRED (F-02/F-03/F-04) : fail-closed explicite —
    // aucune provenance LLM/humaine reelle disponible, jamais fabriquee ici.
    // Statut distinct de FAIL pour ne jamais confondre ce refus honnete avec
    // une panne technique du pipeline.
    record("full-pipeline", e.code === "OPERATOR_INPUT_REQUIRED" ? "OPERATOR_INPUT_REQUIRED" : "FAIL", "construction du run: " + e.message);
    return;
  }

  let nodeTrace;
  try {
    const result = await driveRun(env.operatorApi, runId, { maxIterations: 20 });
    nodeTrace = result.trace;
    const graph = await env.operatorApi.getGraph(runId);
    const allSuccess = graph.nodes.every(function (n) { return n.state === "SUCCESS"; });
    record("full-pipeline", allSuccess ? "PASS" : "FAIL", "traversal: " + nodeTrace.map(function (t) { return t.nodeId + ":" + t.state; }).join(",") + " (14/14 SUCCESS: " + allSuccess + ")");
    if (!allSuccess) {
      record("persistence-restart", "NOT_RUN", "full-pipeline non SUCCESS - aucune etape downstream consideree valide.");
      record("ui-smoke", "NOT_RUN", "full-pipeline non SUCCESS.");
      record("secret-scan", "NOT_RUN", "full-pipeline non SUCCESS.");
      return;
    }
  } catch (e) {
    record("full-pipeline", "FAIL", e.message);
    record("persistence-restart", "NOT_RUN", "full-pipeline a leve une exception - aucune etape downstream consideree valide.");
    record("ui-smoke", "NOT_RUN", "full-pipeline a leve une exception.");
    record("secret-scan", "NOT_RUN", "full-pipeline a leve une exception.");
    return;
  }

  let restartOk = false;
  try {
    const runRegistry2 = require(path.join(env.mono05Root, "app/server/run-registry.js")).createRunRegistry(env.mono01, env.mono03);
    const operatorApi2 = require(path.join(env.mono05Root, "app/server/operator-api.js")).createOperatorApi({ mono01: env.mono01, mono03: env.mono03, mono04: env.mono04, runRegistry: runRegistry2 });
    const env2 = Object.assign({}, env, { runRegistry: runRegistry2, operatorApi: operatorApi2 });
    await rehydrateRealMissionRun(env2, adapter, realWorkerCallFn, openAlexFetchImpl, runId);
    const graph2 = await operatorApi2.getGraph(runId);
    restartOk = graph2.nodes.every(function (n) { return n.state === "SUCCESS"; });
    record("persistence-restart", restartOk ? "PASS" : "FAIL", "readback depuis une nouvelle instance : 14/14 SUCCESS = " + restartOk + ".");
    env.operatorApi = operatorApi2;
  } catch (e) {
    record("persistence-restart", "FAIL", e.message);
  }

  if (!restartOk) {
    record("ui-smoke", "NOT_RUN", "persistence-restart non PASS - UI smoke non tente sur un etat non confirme.");
    record("secret-scan", "NOT_RUN", "persistence-restart non PASS.");
    return;
  }

  try {
    const { createHttpServer } = require(path.join(env.mono05Root, "app/server/http-server.js"));
    const { chromium } = require(path.join(env.mono05Root, "node_modules", "playwright"));
    const httpServerBundle = createHttpServer({ secrets: { providerConfigs: providerConfigs, secrets: process.env } });
    await new Promise(function (resolve) { httpServerBundle.server.listen(0, "127.0.0.1", resolve); });
    const baseUrl = "http://127.0.0.1:" + httpServerBundle.server.address().port;

    const uiAdapter = buildRealExternalStageAdapter(httpServerBundle.mono04, { runId: runId, missionId: missionId });
    const uiWorkerCallFn = buildRealLlmWorkerCallFn(httpServerBundle.mono04, { runId: runId, missionId: missionId });
    await createRealMissionRun(
      { mono01: httpServerBundle.mono01, mono03: httpServerBundle.mono03, mono04: httpServerBundle.mono04, runRegistry: httpServerBundle.runRegistry, cfg: env.cfg },
      uiAdapter, uiWorkerCallFn,
      { runId: runId, missionId: missionId, mission: missionInput, missionQuestion: mission.missionQuestion, documentBytesByUrl: payloads.documentBytesByUrl, documentContentByUrl: payloads.documentContentByUrl, openAlexFetchImpl: openAlexFetchImpl,
        mode: "REAL", realProvenance: loadRealProvenance(mission) }
    );
    await driveRun(httpServerBundle.api, runId, { maxIterations: 20 });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(baseUrl + "/");
    await page.click("text=" + runId);
    await page.waitForSelector(".node-box");
    const nodeCount = (await page.locator(".node-box").allTextContents()).length;
    await page.waitForSelector("text=Lineage Gate");
    await page.locator("button", { hasText: "Ouvrir le rapport" }).click();
    await page.waitForSelector("text=reference_revalidated_not_source_hash_bound");
    const bodyText = await page.textContent("body");
    const uiSmokeOk = nodeCount === 14 && bodyText.includes("assuranceLevel");
    record("ui-smoke", uiSmokeOk ? "PASS" : "FAIL", "graphe (" + nodeCount + " noeuds), rapport ouvert, assuranceLevel visible: " + bodyText.includes("assuranceLevel") + ".");
    await browser.close();
    await new Promise(function (resolve) { httpServerBundle.server.close(resolve); });
  } catch (e) {
    record("ui-smoke", "FAIL", e.message);
  }

  const secretValues = [process.env.ANTHROPIC_API_KEY].filter(Boolean);
  if (secretValues.length > 0) {
    const scan = scanForSecretValues({ trace: JSON.stringify(trace) }, secretValues);
    record("secret-scan", scan.clean ? "PASS" : "FAIL", scan.clean ? "aucune fuite dans la trace produite jusqu'ici." : JSON.stringify(scan.occurrences));
  } else {
    record("secret-scan", "NOT_RUN", "aucun secret configure a scanner dans cet environnement.");
  }
}

function finish(exitCode) {
  writeReports();
  process.exit(exitCode);
}

// Exporte pour test/test_t08_runner_orchestration.js (fail-closed reel,
// jamais une reimplementation du predicat dans le test) — n'invoque JAMAIS
// main() sur un simple require() : seule l'execution directe (node bin/
// run-real-smoke.js) declenche le pipeline reel.
module.exports = { missionGateStatus: missionGateStatus, extractDocumentPayloads: extractDocumentPayloads, loadRealProvenance: loadRealProvenance };

if (require.main === module) {
  main().catch(function (e) {
    console.error("PRODUCT_CONFIG_ERROR:", e.stack);
    writeReports();
    process.exit(3);
  });
}
