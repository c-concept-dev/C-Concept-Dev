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
 *   (14-node, reutilise tel quel depuis MONO-07) ->
 *   persistence-restart-cross-process (REMEDIATION R2/B-01 : backends
 *   FILE_DURABLE, processus B reellement spawn via child_process, jamais
 *   une simple nouvelle instance dans le meme processus - voir
 *   lib/durable-real-env.js, lib/cross-process-restart-worker.js) -> UI
 *   smoke (vrai createHttpServer + Playwright) -> secret scan -> frozen
 *   ZIP integrity (apres) -> reports.
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
const { realOpenAlexFetchImpl } = require("../lib/real-openalex-fetch");
const { buildDurableComponents } = require("../lib/durable-real-env");
const { validatePreRetrievalProvenance } = require("../lib/eforch-artifacts");

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
 *
 * REMEDIATION R2 (B-03) : avant ce correctif, missionGateStatus() ne
 * verifiait QUE readyForExecution — une mission pouvait donc obtenir
 * mission-gate=PASS alors que mission.eForchProvenance etait absent, pour
 * echouer immediatement ensuite en OPERATOR_INPUT_REQUIRED (F-02/F-03)
 * une fois la construction du run deja entamee.
 *
 * REMEDIATION R5 (A-01, correction d'un defaut BLOQUANT de l'audit
 * independant round 4) : ce gate utilisait jusqu'ici
 * validateRealEForchProvenance() — qui exigeait `auditDecisions` non
 * vide AVANT tout retrieval EF-01C2. Or `auditDecisions` est indexee
 * par des `sourceId` qui n'existent structurellement QU'APRES ce
 * retrieval (generes dynamiquement par le connecteur reel) — une
 * dependance cyclique temporelle impossible a satisfaire honnetement
 * sans inventer a l'avance des decisions sur des sources encore
 * inconnues. Ce gate PRE-retrieval utilise desormais
 * validatePreRetrievalProvenance() (lib/eforch-artifacts.js — LA MEME
 * fonction que prepareRealScreening(), jamais une seconde logique de
 * validation), qui ne verifie QUE les preconditions reellement
 * disponibles avant tout retrieval (resolverRuns/plannerRun/
 * plannerOutput/humanValidation) — jamais auditDecisions. La validation
 * d'auditDecisions appartient desormais exclusivement au
 * POST_RETRIEVAL_GATE (validatePostRetrievalAuditDecisions(),
 * lib/real-screening-workflow.js), execute uniquement apres qu'un
 * RetrievalSnapshot reel existe — voir AUDIT-REMEDIATION/
 * 24-REAL-SCREENING-TWO-PHASE-WORKFLOW.md.
 *
 * describeMissionGateStatus() porte la raison explicite ; missionGateStatus()
 * reste un predicat simple (string), inchange pour la compatibilite des
 * appelants/tests existants.
 */
function describeMissionGateStatus(mission) {
  if (!mission.readyForExecution) {
    return { status: "MISSION_NOT_READY", reason: "readyForExecution=false - au moins une reference reste OPERATOR_INPUT_REQUIRED (voir MISSION.md)." };
  }
  const provenanceCheck = validatePreRetrievalProvenance(mission);
  if (!provenanceCheck.valid) {
    return { status: "MISSION_NOT_READY", reason: "eForchProvenance missing or invalid: " + provenanceCheck.problems.join("; ") };
  }
  return { status: "PASS", reason: "mission complete, readyForExecution=true, eForchProvenance structurellement valide (preconditions PRE-retrieval — voir PRE_RETRIEVAL_GATE, R5)." };
}
function missionGateStatus(mission) {
  return describeMissionGateStatus(mission).status;
}

/**
 * REMEDIATION R6 (F-02, audit independant round 5) : le rapport R5
 * confondait encore, pour une mission precise, l'etat du RUNTIME (capable
 * d'executer les deux phases) et l'etat de CETTE MISSION (dispose-t-elle
 * reellement, aujourd'hui, des attestations pre-retrieval requises ?).
 * Ces cinq fonctions PURES calculent chaque niveau de readiness
 * SEPAREMENT, jamais un seul champ ambigu — voir AUDIT-REMEDIATION/
 * 26-READINESS-SEMANTICS.md pour la semantique complete. Jamais de
 * transformation implicite de "code pret" en "mission prete".
 */
function computeRealSmokeCodeReadiness() {
  // Propriete du RUNTIME lui-meme : PRE_RETRIEVAL_GATE/POST_RETRIEVAL_GATE/
  // durabilite+integrite du snapshot/no-refetch/cross-process sont chacun
  // prouves par test_t08_r5_closure.js et test_t08_r6_closure.js (non
  // recalcules dynamiquement ici — une valeur fixe et documentee, jamais
  // une mesure devinee a l'execution).
  return "READY";
}
function computeReadinessPreparation(mission) {
  return describeMissionGateStatus(mission).status === "PASS" ? "READY" : "NOT_READY";
}
function computePrepareNext(codeReadiness, preparationReadiness) {
  return (codeReadiness === "READY" && preparationReadiness === "READY") ? "READY_FOR_INDEPENDENT_REAL_RUN" : "NOT_READY";
}
function computeResumeReadiness(snapshot, auditDecisionsInput) {
  if (!snapshot) return "NOT_READY";
  if (!auditDecisionsInput) return "WAITING_FOR_OPERATOR_INPUT";
  const { validatePostRetrievalAuditDecisions } = require("../lib/eforch-artifacts");
  const gate = validatePostRetrievalAuditDecisions(snapshot, auditDecisionsInput);
  return gate.valid ? "READY" : "WAITING_FOR_OPERATOR_INPUT";
}
function computeResumeNext(codeReadiness, resumeReadiness) {
  if (codeReadiness !== "READY") return "NOT_READY";
  if (resumeReadiness === "READY") return "READY";
  if (resumeReadiness === "WAITING_FOR_OPERATOR_INPUT") return "WAITING_FOR_OPERATOR_INPUT";
  return "NOT_READY";
}
/**
 * computeReadinessReport(mission, opts) — assemble les cinq champs
 * ci-dessus en un seul rapport coherent, jamais une combinaison
 * contradictoire (R6-10) : REAL_SMOKE_PREPARE_NEXT ne peut valoir
 * READY_FOR_INDEPENDENT_REAL_RUN que si REAL_SMOKE_PREPARATION_READINESS
 * = READY (verifie par construction, jamais par un champ recopie a la
 * main). opts.snapshot/opts.auditDecisionsInput sont optionnels (absents
 * => RESUME_READINESS = NOT_READY, l'etat normal avant tout PREPARE reel).
 */
function computeReadinessReport(mission, opts) {
  opts = opts || {};
  const codeReadiness = computeRealSmokeCodeReadiness();
  const preparationReadiness = computeReadinessPreparation(mission);
  const resumeReadiness = computeResumeReadiness(opts.snapshot || null, opts.auditDecisionsInput || null);
  return {
    REAL_SMOKE_CODE_READINESS: codeReadiness,
    REAL_SMOKE_PREPARATION_READINESS: preparationReadiness,
    REAL_SMOKE_RESUME_READINESS: resumeReadiness,
    REAL_SMOKE_PREPARE_NEXT: computePrepareNext(codeReadiness, preparationReadiness),
    REAL_SMOKE_RESUME_NEXT: computeResumeNext(codeReadiness, resumeReadiness),
  };
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

/**
 * REMEDIATION F-01 (observabilite) : avant ce correctif, un noeud non-
 * SUCCESS n'etait rapporte que par "nodeId:state" (traversal du trace) —
 * aucun lastError/errorCode n'etait jamais consulte ni conserve, rendant le
 * diagnostic d'un run reel bloque illisible sans acces manuel a MONO-03.
 * Interroge operatorApi.getNode() (deja expose par MONO-05, jamais
 * reimplemente ici) et n'expose QUE les champs reellement retournes —
 * jamais une valeur devinee pour nativeStatus/currentStage/completedStages/
 * awaitingStage/gate/lastResult quand MONO-02 ne les propage pas dans
 * lastError.details pour ce type d'echec.
 */
async function describeNodeFailure(operatorApi, runId, nodeId) {
  const node = await operatorApi.getNode(runId, nodeId);
  const lastError = node.lastError || null;
  const details = (lastError && lastError.details) || {};
  const out = {
    nodeId: node.nodeId, state: node.state, attemptCount: node.attemptCount,
    lastError: lastError, errorCode: lastError ? lastError.code : null,
  };
  if (typeof details.efOrchNativeStatus !== "undefined") out.nativeStatus = details.efOrchNativeStatus;
  if (typeof details.stageId !== "undefined") out.currentStage = details.stageId;
  else if (typeof details.currentStage !== "undefined") out.currentStage = details.currentStage;
  if (typeof details.completedStages !== "undefined") out.completedStages = details.completedStages;
  if (typeof details.awaitingStage !== "undefined") out.awaitingStage = details.awaitingStage;
  if (typeof details.gate !== "undefined") out.gate = details.gate;
  if (details.lastResult && typeof details.lastResult.kind !== "undefined") out.lastResultKind = details.lastResult.kind;
  return out;
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
    record("persistence-restart-cross-process", "NOT_RUN_ENVIRONMENT_BLOCKED", "depend du full pipeline.", "NOT_RUN");
    record("ui-smoke", "NOT_RUN_ENVIRONMENT_BLOCKED", "depend du full pipeline.", "NOT_RUN");
    record("secret-scan", "NOT_RUN_ENVIRONMENT_BLOCKED", "aucun run reel a scanner.", "NOT_RUN");
  } else {
    const mission = loadMission();
    const gateStatus = describeMissionGateStatus(mission);
    if (gateStatus.status === "MISSION_NOT_READY") {
      // REMEDIATION R2 (B-03) : la raison distingue desormais explicitement
      // readyForExecution=false d'un eForchProvenance absent/invalide —
      // jamais un mission-gate=PASS suivi d'un echec tardif en pleine
      // construction du run.
      record("mission-gate", "MISSION_NOT_READY", gateStatus.reason + " Aucun appel externe couteux tente.");
      const hashAfterEarly = hashKit(kitRoot, mono07ZipPath);
      record("frozen-zip-integrity-after", compareHashes(hashBefore, hashAfterEarly).identical ? "PASS" : "FAIL", "verifie malgre l'arret anticipe.");
      return finish(2);
    }
    record("mission-gate", "PASS", gateStatus.reason);
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
  // REMEDIATION R2 (B-01) : extractFrozenMono05() reste reutilise tel
  // quel depuis MONO-07 (extraction fraiche du ZIP MONO-05 canonique),
  // mais buildEnv() (qui appelait cfg.createOperatorBackends(), backends
  // EN MEMOIRE) n'est PLUS utilise pour le chemin REEL — remplace par
  // lib/durable-real-env.js::buildDurableComponents() (backends
  // FILE_DURABLE), condition necessaire pour que persistence-restart
  // puisse etre reellement CROSS_PROCESS ci-dessous (le processus B ne
  // peut rouvrir que du contenu ecrit sur disque, jamais une Map en
  // memoire du processus A).
  const { extractFrozenMono05 } = require(path.join(mono07LibPath, "harness-env.js"));
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  const providerConfigs = buildRealProviderConfigs();
  const runId = "mono08-real-smoke-" + Date.now().toString(36);
  const missionId = mission.missionId;
  const workRoot = process.env.EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir();
  const runWorkDir = path.join(workRoot, "mono08-real-work-" + Date.now());
  const eforchBackendDir = path.join(runWorkDir, "durable-eforch");
  const mono03BackendDir = path.join(runWorkDir, "durable-mono03");

  let payloads;
  try {
    payloads = extractDocumentPayloads(mission);
  } catch (e) {
    record("mission-gate", "MISSION_NOT_READY", e.message);
    return;
  }

  let env;
  try {
    const mono05Root = extractFrozenMono05(kitRoot, runWorkDir);
    env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: providerConfigs, secrets: process.env });
    record("connectivity", "PASS", "environnement MONO-01->05 assemble avec des providers reels configures et des backends durables FILE_DURABLE (" + eforchBackendDir + ", " + mono03BackendDir + ").");
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
    if (!allSuccess) {
      // REMEDIATION F-01 : le premier noeud non-SUCCESS (ordre du graphe,
      // jamais devine) est interroge via operatorApi.getNode() pour que
      // lastError/errorCode restent visibles dans le rapport, jamais perdus
      // derriere un simple "nodeId:state".
      const firstNonSuccess = graph.nodes.find(function (n) { return n.state !== "SUCCESS"; });
      let nodeDiagnostic = null;
      try {
        nodeDiagnostic = firstNonSuccess ? await describeNodeFailure(env.operatorApi, runId, firstNonSuccess.nodeId) : null;
      } catch (diagErr) {
        nodeDiagnostic = { nodeId: firstNonSuccess && firstNonSuccess.nodeId, getNodeError: diagErr.message };
      }
      record("full-pipeline", "FAIL", "traversal: " + nodeTrace.map(function (t) { return t.nodeId + ":" + t.state; }).join(",") + " (14/14 SUCCESS: false) - premier noeud non-SUCCESS: " + JSON.stringify(nodeDiagnostic));
      record("persistence-restart-cross-process", "NOT_RUN", "full-pipeline non SUCCESS - aucune etape downstream consideree valide.");
      record("ui-smoke", "NOT_RUN", "full-pipeline non SUCCESS.");
      record("secret-scan", "NOT_RUN", "full-pipeline non SUCCESS.");
      return;
    }
    record("full-pipeline", "PASS", "traversal: " + nodeTrace.map(function (t) { return t.nodeId + ":" + t.state; }).join(",") + " (14/14 SUCCESS: true)");
  } catch (e) {
    record("full-pipeline", "FAIL", e.message);
    record("persistence-restart-cross-process", "NOT_RUN", "full-pipeline a leve une exception - aucune etape downstream consideree valide.");
    record("ui-smoke", "NOT_RUN", "full-pipeline a leve une exception.");
    record("secret-scan", "NOT_RUN", "full-pipeline a leve une exception.");
    return;
  }

  // REMEDIATION R2 (B-01) : le persistence-restart du chemin REEL doit
  // prouver CROSS_PROCESS, jamais CROSS_INSTANCE (un simple nouvel
  // objet JS wrapper dans le MEME processus, comme c'etait le cas
  // avant ce correctif). Processus B reellement spawn (child_process),
  // qui ne recoit RIEN du processus A hormis des chaines (chemins,
  // runId, missionId) via argv - jamais un objet mono01/mono03/mono04
  // partage. Reutilise lib/durable-real-env.js::buildDurableComponents()
  // A L'IDENTIQUE de ce que le processus A a utilise ci-dessus (meme
  // mecanique, jamais reimplementee dans le worker).
  let restartOk = false;
  let restartPid = null;
  let restartWorkerStdout = "", restartWorkerStderr = "";
  try {
    const { spawn } = require("child_process");
    const workerPath = path.join(__dirname, "..", "lib", "cross-process-restart-worker.js");
    const child = spawn(process.execPath, [workerPath, env.mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId, missionId], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", function (d) { restartWorkerStdout += d; });
    child.stderr.on("data", function (d) { restartWorkerStderr += d; });
    const exitCode = await new Promise(function (resolve) { child.on("close", resolve); });
    restartPid = child.pid;
    const stdout = restartWorkerStdout;
    const stderr = restartWorkerStderr;
    const resultLine = stdout.split("\n").find(function (l) { return l.indexOf("RESTART_WORKER_RESULT:") === 0; });
    const result = resultLine ? JSON.parse(resultLine.slice("RESTART_WORKER_RESULT:".length)) : null;
    restartOk = exitCode === 0 && !!result && result.allSuccess === true;
    record(
      "persistence-restart-cross-process", restartOk ? "PASS" : "FAIL",
      "processus A pid=" + process.pid + ", processus B pid=" + restartPid + " (exit " + exitCode + "), backend FILE_DURABLE (" + mono03BackendDir + ") - " +
        (result ? "14/14 SUCCESS = " + result.allSuccess + ", graph=" + JSON.stringify(result.graph) : "aucun resultat parseable - stderr: " + stderr.slice(0, 800))
    );
  } catch (e) {
    record("persistence-restart-cross-process", "FAIL", e.message);
  }

  if (!restartOk) {
    record("ui-smoke", "NOT_RUN", "persistence-restart-cross-process non PASS - UI smoke non tente sur un etat non confirme.");
    record("secret-scan", "NOT_RUN", "persistence-restart-cross-process non PASS.");
    return;
  }

  // REMEDIATION R2 (B-02) : bodyText/localStorage/sessionStorage captures
  // ici (pendant que la page Playwright est encore ouverte) pour etre
  // scannes plus bas avec le reste des surfaces - jamais "NOT_APPLICABLE"
  // alors qu'ils sont reellement produits a cette etape.
  let uiScanSurfaces = { bodyText: null, localStorage: null, sessionStorage: null };
  let uiHttpServerBundle = null;
  try {
    const { createHttpServer } = require(path.join(env.mono05Root, "app/server/http-server.js"));
    const { chromium } = require(path.join(env.mono05Root, "node_modules", "playwright"));
    const httpServerBundle = createHttpServer({ secrets: { providerConfigs: providerConfigs, secrets: process.env } });
    uiHttpServerBundle = httpServerBundle;
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
    uiScanSurfaces.bodyText = bodyText;
    uiScanSurfaces.localStorage = await page.evaluate(function () { return JSON.stringify(localStorage); });
    uiScanSurfaces.sessionStorage = await page.evaluate(function () { return JSON.stringify(sessionStorage); });
    const uiSmokeOk = nodeCount === 14 && bodyText.includes("assuranceLevel");
    record("ui-smoke", uiSmokeOk ? "PASS" : "FAIL", "graphe (" + nodeCount + " noeuds), rapport ouvert, assuranceLevel visible: " + bodyText.includes("assuranceLevel") + ".");
    await browser.close();
    await new Promise(function (resolve) { httpServerBundle.server.close(resolve); });
  } catch (e) {
    record("ui-smoke", "FAIL", e.message);
  }

  // REMEDIATION R2 (B-02) : secret(s) resolu(s) selon le SEUL mode
  // LLM_AUTH_MODE reellement actif (jamais les deux modes melanges - voir
  // lib/secret-scan-surfaces.js) et scan sur un ensemble EXHAUSTIF de
  // surfaces : trace, RunState/ArtifactRecord/graph/report REELS (via
  // operatorApi, backend FILE_DURABLE), contenu REELLEMENT persiste sur
  // disque (les deux dossiers de backend durable), sortie stdout/stderr
  // du processus B de persistence-restart, DOM/localStorage/sessionStorage
  // (captures ci-dessus pendant que la page etait ouverte), et RunState/
  // ArtifactRecord/graph du bundle UI (instance separee, backends en
  // memoire de MONO-05 - hors perimetre FILE_DURABLE par construction).
  try {
    const { resolveActiveSecretNames, resolveActiveSecretValues, collectDurableBackendFileSurfaces } = require("../lib/secret-scan-surfaces");
    const activeSecrets = resolveActiveSecretNames(process.env);
    const secretValues = resolveActiveSecretValues(process.env);

    const surfaces = { trace: JSON.stringify(trace) };
    surfaces["restart-worker:stdout"] = restartWorkerStdout || "";
    surfaces["restart-worker:stderr"] = restartWorkerStderr || "";
    Object.assign(surfaces, collectDurableBackendFileSurfaces(eforchBackendDir, "durable-eforch"));
    Object.assign(surfaces, collectDurableBackendFileSurfaces(mono03BackendDir, "durable-mono03"));

    try {
      surfaces["graph"] = await env.operatorApi.getGraph(runId);
      surfaces["report"] = await env.operatorApi.getReport(runId);
      surfaces["run-state"] = await env.mono03.runStore.loadRun(runId);
      const artifactRefs = await env.operatorApi.listArtifacts(runId);
      const artifactPayloads = [];
      for (const a of artifactRefs) {
        try { artifactPayloads.push(await env.mono03.artifactStore.getArtifact(a.artifactId)); } catch (e) { /* artefact individuel illisible, jamais bloquant pour le reste du scan */ }
      }
      surfaces["artifacts"] = artifactPayloads;
    } catch (e) {
      surfaces["operator-api-surfaces-error"] = "NOT_APPLICABLE_AT_THIS_STAGE: " + e.message;
    }

    if (uiHttpServerBundle) {
      try {
        surfaces["ui-graph"] = await uiHttpServerBundle.api.getGraph(runId);
        surfaces["ui-report"] = await uiHttpServerBundle.api.getReport(runId);
        surfaces["ui-run-state"] = await uiHttpServerBundle.mono03.runStore.loadRun(runId);
      } catch (e) {
        surfaces["ui-operator-api-surfaces-error"] = "NOT_APPLICABLE_AT_THIS_STAGE: " + e.message;
      }
    } else {
      surfaces["ui-graph"] = surfaces["ui-report"] = surfaces["ui-run-state"] = "NOT_APPLICABLE_AT_THIS_STAGE: ui-smoke non atteint.";
    }

    surfaces["dom-bodyText"] = uiScanSurfaces.bodyText === null ? "NOT_APPLICABLE_AT_THIS_STAGE: ui-smoke non atteint." : uiScanSurfaces.bodyText;
    surfaces["dom-localStorage"] = uiScanSurfaces.localStorage === null ? "NOT_APPLICABLE_AT_THIS_STAGE: ui-smoke non atteint." : uiScanSurfaces.localStorage;
    surfaces["dom-sessionStorage"] = uiScanSurfaces.sessionStorage === null ? "NOT_APPLICABLE_AT_THIS_STAGE: ui-smoke non atteint." : uiScanSurfaces.sessionStorage;

    if (secretValues.length > 0) {
      const scan = scanForSecretValues(surfaces, secretValues);
      record(
        "secret-scan", scan.clean ? "PASS" : "FAIL",
        "mode=" + activeSecrets.mode + ", secret(s) scanne(s)=" + JSON.stringify(activeSecrets.secretNames) + ", surfaces=" + Object.keys(surfaces).join(",") + " - " +
          (scan.clean ? "aucune fuite." : JSON.stringify(scan.occurrences))
      );
    } else {
      record("secret-scan", "NOT_RUN", "mode=" + activeSecrets.mode + " - aucune valeur de secret configuree dans cet environnement pour " + JSON.stringify(activeSecrets.secretNames) + " (surfaces qui auraient ete scannees : " + Object.keys(surfaces).join(",") + ").");
    }
  } catch (e) {
    record("secret-scan", "FAIL", e.message);
  }
}

function finish(exitCode) {
  writeReports();
  process.exit(exitCode);
}

/**
 * REMEDIATION R6 (F-01, audit independant round 5) : avant ce correctif,
 * les primitives R5 (prepareRealScreening()/resumeRealScreening(),
 * lib/real-screening-workflow.js) etaient valides et testees
 * (test_t08_r5_closure.js) mais N'ETAIENT BRANCHEES DERRIERE AUCUN point
 * d'entree operateur reel — NOMINAL_REAL_SMOKE_TWO_PHASE_INTEGRATION =
 * NOT_IMPLEMENTED. Ajoute deux nouveaux points d'entree CLI EXPLICITES,
 * `--phase prepare` et `--phase resume`, qui appellent DIRECTEMENT
 * prepareRealScreening()/resumeRealScreening() — AUCUNE logique dupliquee,
 * AUCUN nouveau moteur de workflow (voir AUDIT-REMEDIATION/
 * 28-NOMINAL-PREPARE-RESUME-CLI.md pour le detail complet). Le chemin
 * historique single-shot (aucun `--phase` fourni) reste 100% inchange —
 * `main()` ci-dessus n'est jamais modifiee par R6.
 */
function cliError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * parseCliArgs(argv) — jamais un flag devine : `--phase` absent => mode
 * legacy single-shot (comportement historique inchange, jamais un
 * comportement implicite different). `--phase` present mais invalide, ou
 * `--phase resume` sans TOUS ses arguments obligatoires => erreur
 * fail-closed explicite (R6, mandat section 4 : "Ne jamais deviner un
 * chemin ou une phase").
 */
function parseCliArgs(argv) {
  const args = (argv || []).slice(2);
  const phaseIdx = args.indexOf("--phase");
  if (phaseIdx === -1) return { phase: null };
  const phaseValue = args[phaseIdx + 1];
  if (phaseValue !== "prepare" && phaseValue !== "resume") {
    throw cliError("ARGS_INVALID_PHASE", "--phase doit valoir \"prepare\" ou \"resume\" (recu " + JSON.stringify(phaseValue) + ") — jamais devine.");
  }
  function readOpt(name) {
    const i = args.indexOf(name);
    return i === -1 ? null : (args[i + 1] || null);
  }
  const out = { phase: phaseValue, runId: readOpt("--run-id"), snapshotId: readOpt("--snapshot-id"), auditDecisionsPath: readOpt("--audit-decisions"), kitRoot: readOpt("--kit-root") };
  if (phaseValue === "resume") {
    if (!out.runId) throw cliError("ARGS_MISSING_RUN_ID", "--phase resume necessite --run-id <id> (identifiant du nouveau run a demarrer) — jamais devine.");
    if (!out.snapshotId) throw cliError("ARGS_MISSING_SNAPSHOT_ID", "--phase resume necessite --snapshot-id <id> (produit par --phase prepare) — jamais devine.");
    if (!out.auditDecisionsPath) throw cliError("ARGS_MISSING_AUDIT_DECISIONS", "--phase resume necessite --audit-decisions <chemin> (fichier JSON des decisions operateur) — jamais devine.");
  }
  return out;
}

/**
 * Repertoire durable du RetrievalSnapshot — DELIBEREMENT STABLE (jamais
 * horodate comme eforchBackendDir/mono03BackendDir ci-dessus) : PREPARE et
 * RESUME sont deux invocations CLI SEPAREES (potentiellement heures/jours
 * d'ecart, la pause operateur etant le point central du workflow R5) —
 * RESUME doit pouvoir retrouver EXACTEMENT le meme dossier que celui ou
 * PREPARE a persiste, sans qu'aucun etat en memoire ne survive entre les
 * deux invocations. Voir 28-NOMINAL-PREPARE-RESUME-CLI.md.
 */
function resolveSnapshotBackendDir(workRoot) {
  return process.env.EVIDENCEFORGE_SNAPSHOT_DIR || path.join(workRoot, "mono08-real-screening-snapshots");
}

/**
 * runPreparePhase/runResumePhase(..., deps) — le cinquieme parametre
 * `deps` est OPTIONNEL et UNIQUEMENT destine aux appelants programmatiques
 * (test_t08_r6_closure.js) : il permet d'injecter un openAlexFetchImpl/
 * adapter/workerCallFn LOCAL_CONTROLLED pour prouver l'integration
 * nominale sans reseau reel — jamais expose par aucun flag CLI, jamais
 * utilise par mainCli() (qui appelle ces fonctions SANS `deps`, donc avec
 * exactement le comportement REEL par defaut ci-dessous). Ne duplique
 * rien : le corps de la fonction reste identique, seule la source du
 * fetchImpl/adapter change.
 */
async function runPreparePhase(kitRoot, mono07LibPath, mission, cliArgs, deps) {
  deps = deps || {};
  const { prepareRealScreening, buildAuditDecisionsTemplate } = require("../lib/real-screening-workflow");
  const { extractFrozenMono05 } = require(path.join(mono07LibPath, "harness-env.js"));
  const { createFileDurableBackend } = require("../lib/file-durable-backend");

  const gateStatus = describeMissionGateStatus(mission);
  if (gateStatus.status !== "PASS") {
    // R6-F02 : cette branche EST precisement REAL_SMOKE_PREPARATION_
    // READINESS = NOT_READY pour la mission canonique — jamais transformee
    // en READY, quel que soit REAL_SMOKE_CODE_READINESS par ailleurs.
    record("phase-prepare-gate", "MISSION_NOT_READY", gateStatus.reason + " (REAL_SMOKE_PREPARATION_READINESS=NOT_READY pour cette mission — voir 26-READINESS-SEMANTICS.md)");
    return finish(2);
  }
  record("phase-prepare-gate", "PASS", gateStatus.reason);

  let payloads;
  try {
    payloads = extractDocumentPayloads(mission);
  } catch (e) {
    record("phase-prepare-gate", "MISSION_NOT_READY", e.message);
    return finish(2);
  }

  const providerConfigs = buildRealProviderConfigs();
  const workRoot = process.env.EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir();
  const runWorkDir = path.join(workRoot, "mono08-real-work-" + Date.now());
  const eforchBackendDir = path.join(runWorkDir, "durable-eforch");
  const mono03BackendDir = path.join(runWorkDir, "durable-mono03");
  const snapshotBackendDir = resolveSnapshotBackendDir(workRoot);
  const snapshotBackend = createFileDurableBackend(snapshotBackendDir);

  let env;
  try {
    const mono05Root = extractFrozenMono05(kitRoot, runWorkDir);
    env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: providerConfigs, secrets: process.env });
  } catch (e) {
    record("phase-prepare-connectivity", "FAIL", e.message);
    return finish(1);
  }
  record("phase-prepare-connectivity", "PASS", "environnement assemble ; RetrievalSnapshot persiste sous " + snapshotBackendDir);

  const timeoutMs = parseInt(process.env.EVIDENCEFORGE_HTTP_TIMEOUT_MS || "8000", 10);
  const openAlexFetchImpl = deps.openAlexFetchImpl || realOpenAlexFetchImpl(timeoutMs);
  const missionInput = {
    dimensions: mission.dimensions,
    targetDocuments: mission.targetDocuments.filter(function (d) { return d.status === "VERIFIED"; }).map(function (d) { return { documentId: d.documentId, title: d.title, url: d.url }; }),
  };

  let prepResult;
  try {
    prepResult = await prepareRealScreening(env, {
      mission: missionInput, missionQuestion: mission.missionQuestion,
      documentBytesByUrl: payloads.documentBytesByUrl, openAlexFetchImpl: openAlexFetchImpl,
      realProvenance: loadRealProvenance(mission), snapshotBackend: snapshotBackend,
    });
  } catch (e) {
    record("phase-prepare-retrieval", e.code === "OPERATOR_INPUT_REQUIRED" ? "OPERATOR_INPUT_REQUIRED" : "FAIL", "prepareRealScreening(): " + e.message);
    return finish(e.code === "OPERATOR_INPUT_REQUIRED" ? 2 : 1);
  }

  const snapshot = await snapshotBackend.get("retrieval-snapshots", prepResult.snapshotId);
  const template = buildAuditDecisionsTemplate(snapshot);
  fs.mkdirSync(runWorkDir, { recursive: true });
  const templatePath = path.join(runWorkDir, "audit-decisions-input.template.json");
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));

  const summary = {
    state: "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS",
    snapshotId: prepResult.snapshotId, snapshotHash: prepResult.snapshotHash, missionId: prepResult.missionId,
    sourceCount: prepResult.sourceCount, sourceIds: prepResult.sourceIds,
    snapshotBackendDir: snapshotBackendDir, auditDecisionsTemplatePath: templatePath,
    nextStep: "node bin/run-real-smoke.js --phase resume --run-id <id> --snapshot-id " + prepResult.snapshotId + " --audit-decisions <chemin-vers-decisions-completees.json>",
    readiness: computeReadinessReport(mission, { snapshot: snapshot, auditDecisionsInput: null }),
  };
  record("phase-prepare-result", "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS", JSON.stringify(summary), "OPERATOR_INPUT_REQUIRED");
  console.log("CLI_PREPARE_RESULT:" + JSON.stringify(summary));
  console.log("\n" + JSON.stringify(summary, null, 2));
  return finish(4);
}

async function runResumePhase(kitRoot, mono07LibPath, mission, cliArgs, deps) {
  deps = deps || {};
  const { resumeRealScreening } = require("../lib/real-screening-workflow");
  const { extractFrozenMono05 } = require(path.join(mono07LibPath, "harness-env.js"));
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  const { createFileDurableBackend } = require("../lib/file-durable-backend");

  let auditDecisionsInput;
  try {
    auditDecisionsInput = JSON.parse(fs.readFileSync(cliArgs.auditDecisionsPath, "utf8"));
  } catch (e) {
    record("phase-resume-load-decisions", "FAIL", "--audit-decisions \"" + cliArgs.auditDecisionsPath + "\" illisible ou JSON invalide : " + e.message);
    return finish(2);
  }
  record("phase-resume-load-decisions", "PASS", cliArgs.auditDecisionsPath);

  let payloads;
  try {
    payloads = extractDocumentPayloads(mission);
  } catch (e) {
    record("phase-resume-gate", "MISSION_NOT_READY", e.message);
    return finish(2);
  }

  const providerConfigs = buildRealProviderConfigs();
  const workRoot = process.env.EVIDENCEFORGE_PERSISTENCE_DIR || os.tmpdir();
  const runWorkDir = path.join(workRoot, "mono08-real-work-" + Date.now());
  const eforchBackendDir = path.join(runWorkDir, "durable-eforch");
  const mono03BackendDir = path.join(runWorkDir, "durable-mono03");
  const snapshotBackendDir = resolveSnapshotBackendDir(workRoot);
  const snapshotBackend = createFileDurableBackend(snapshotBackendDir);

  let env;
  try {
    const mono05Root = extractFrozenMono05(kitRoot, runWorkDir);
    env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: providerConfigs, secrets: process.env });
  } catch (e) {
    record("phase-resume-connectivity", "FAIL", e.message);
    return finish(1);
  }
  record("phase-resume-connectivity", "PASS", "environnement assemble ; RetrievalSnapshot recherche sous " + snapshotBackendDir);

  const adapter = deps.adapter || buildRealExternalStageAdapter(env.mono04, { runId: cliArgs.runId, missionId: mission.missionId });
  const realWorkerCallFn = deps.workerCallFn || buildRealLlmWorkerCallFn(env.mono04, { runId: cliArgs.runId, missionId: mission.missionId });
  const missionInput = {
    dimensions: mission.dimensions,
    targetDocuments: mission.targetDocuments.filter(function (d) { return d.status === "VERIFIED"; }).map(function (d) { return { documentId: d.documentId, title: d.title, url: d.url }; }),
  };

  let resumeResult;
  try {
    resumeResult = await resumeRealScreening(env, adapter, realWorkerCallFn, {
      runId: cliArgs.runId, snapshotBackend: snapshotBackend, snapshotId: cliArgs.snapshotId, auditDecisionsInput: auditDecisionsInput,
      mission: missionInput, documentContentByUrl: payloads.documentContentByUrl,
    });
  } catch (e) {
    // R6-F01, mandat section 4 : fail-close explicite et distinct par
    // cause reelle — jamais un seul statut FAIL generique qui masquerait
    // la difference entre "snapshot introuvable" (erreur operateur),
    // "snapshot corrompu" (integrite compromise) et "decisions manquantes/
    // invalides" (OPERATOR_INPUT_REQUIRED, meme convention que le reste du
    // binaire).
    let status = "FAIL", code = 1;
    if (e.code === "SNAPSHOT_NOT_FOUND") { status = "FAIL"; code = 2; }
    else if (e.code === "SNAPSHOT_INTEGRITY_ERROR") { status = "FAIL"; code = 1; }
    else if (e.code === "OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS") { status = "OPERATOR_INPUT_REQUIRED"; code = 4; }
    record("phase-resume-gate", status, "resumeRealScreening(): " + e.message + (e.code ? " [" + e.code + "]" : ""));
    return finish(code);
  }
  record("phase-resume-gate", "PASS", "snapshot verifie (integrite intacte), POST_RETRIEVAL_GATE PASS, run demarre missionId=" + resumeResult.missionId);

  const snapshotForReadiness = await snapshotBackend.get("retrieval-snapshots", cliArgs.snapshotId);
  const readiness = computeReadinessReport(mission, { snapshot: snapshotForReadiness, auditDecisionsInput: auditDecisionsInput });

  try {
    const result = await driveRun(env.operatorApi, cliArgs.runId, deps.driveRunOpts || { maxIterations: 20 });
    const graph = await env.operatorApi.getGraph(cliArgs.runId);
    const efOrch = graph.nodes.find(function (n) { return n.nodeId === "EF-ORCH-SUBSYSTEM"; });
    const ok = !!efOrch && efOrch.state === "SUCCESS";
    record("phase-resume-result", ok ? "PASS" : "FAIL", "EF-ORCH-SUBSYSTEM=" + (efOrch && efOrch.state) + " traversal=" + result.trace.map(function (t) { return t.nodeId + ":" + t.state; }).join(",") + " readiness=" + JSON.stringify(readiness));
    const resumeSummary = { state: ok ? "RESUME_COMPLETE" : "RESUME_FAILED", missionId: resumeResult.missionId, readiness: readiness };
    console.log("CLI_RESUME_RESULT:" + JSON.stringify(resumeSummary));
    console.log("\n" + JSON.stringify(resumeSummary, null, 2));
    return finish(ok ? 0 : 1);
  } catch (e) {
    record("phase-resume-result", "FAIL", e.message);
    return finish(1);
  }
}

async function mainCli() {
  let cliArgs;
  try {
    cliArgs = parseCliArgs(process.argv);
  } catch (e) {
    record("phase-args", "FAIL", e.message + (e.code ? " [" + e.code + "]" : ""));
    return finish(2);
  }
  if (!cliArgs.phase) {
    return main(); // Chemin legacy single-shot — inchange par R6.
  }

  // REMEDIATION R6 : resolveKitRoot() lit historiquement argv[2] comme
  // chemin positionnel du KIT_ROOT (convention MONO-07 heritee) — en mode
  // deux-phases, argv[2] vaut "--phase" (jamais un chemin), donc JAMAIS
  // transmis tel quel ici (ce qui eviterait de traiter "--phase" lui-meme
  // comme un KIT_ROOT). `--kit-root <chemin>` explicite est prioritaire ; sinon
  // repli sur EVIDENCEFORGE_KIT_ROOT (meme convention que le chemin
  // legacy) — jamais un troisieme comportement implicite.
  let kitRoot;
  try {
    kitRoot = resolveKitRoot(["_", "_", cliArgs.kitRoot || undefined]);
  } catch (e) {
    record("baseline-gate", "BLOCKED", "KIT_ROOT_REQUIRED: " + e.message);
    return finish(2);
  }
  const mono07LibPath = process.env.EVIDENCEFORGE_MONO07_LIB_PATH;
  if (!mono07LibPath) {
    record("baseline-gate", "BLOCKED", "EVIDENCEFORGE_MONO07_LIB_PATH non fourni.");
    return finish(2);
  }
  const mission = loadMission();

  if (cliArgs.phase === "prepare") return runPreparePhase(kitRoot, mono07LibPath, mission, cliArgs);
  return runResumePhase(kitRoot, mono07LibPath, mission, cliArgs);
}

// Exporte pour test/test_t08_runner_orchestration.js (fail-closed reel,
// jamais une reimplementation du predicat dans le test) — n'invoque JAMAIS
// main() sur un simple require() : seule l'execution directe (node bin/
// run-real-smoke.js) declenche le pipeline reel.
module.exports = {
  missionGateStatus: missionGateStatus, describeMissionGateStatus: describeMissionGateStatus,
  extractDocumentPayloads: extractDocumentPayloads, loadRealProvenance: loadRealProvenance, describeNodeFailure: describeNodeFailure,
  parseCliArgs: parseCliArgs, runPreparePhase: runPreparePhase, runResumePhase: runResumePhase, resolveSnapshotBackendDir: resolveSnapshotBackendDir,
  computeRealSmokeCodeReadiness: computeRealSmokeCodeReadiness, computeReadinessPreparation: computeReadinessPreparation,
  computePrepareNext: computePrepareNext, computeResumeReadiness: computeResumeReadiness, computeResumeNext: computeResumeNext,
  computeReadinessReport: computeReadinessReport,
};

if (require.main === module) {
  mainCli().catch(function (e) {
    console.error("PRODUCT_CONFIG_ERROR:", e.stack);
    writeReports();
    process.exit(3);
  });
}
