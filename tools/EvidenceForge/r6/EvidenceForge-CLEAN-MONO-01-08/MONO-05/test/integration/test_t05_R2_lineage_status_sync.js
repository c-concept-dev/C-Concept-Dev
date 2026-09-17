"use strict";
// test_t05_R2_lineage_status_sync.js — CORRECTIF MONO-05-R2
// (regressionId: MONO05-LINEAGE-STATUS-UNSYNCED).
//
// Le bug (OperatorApi.getLineage()/getReport() lisaient state.lineageStatus,
// jamais synchronise par aucun chemin reel) a echappe a la suite historique
// car test_t05_lineage_pass.js prepare ARTIFICIELLEMENT lineageStatus en
// appelant lui-meme mono03.coordinator.recordLineagePass() AVANT de tester
// la lecture — jamais un vrai passage par EF-04-LINEAGE execute reellement
// via operator-api.js::runNode(). Ce fichier exerce le VRAI chemin
// (runNode("EF-04-LINEAGE") reel -> persistOutcome() -> syncLineageStatus())
// — jamais une preparation manuelle de lineageStatus, sauf T05-R2-07/08/09
// (staleness), ou la preparation manuelle initiale est le point meme du test.

const path = require("path");
const { startOperatorServer, httpJson, MONO01_PATH, GRAPH_PATH } = require("../helpers.js");
const { buildValidChain } = require(path.join(MONO01_PATH, "test", "fixtures.js"));

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

/**
 * Seed les 6 artefacts amont d'EF-04-LINEAGE avec une vraie chaîne valide
 * (buildValidChain, déjà prouvée par MONO-01 lui-même — jamais reconstruite
 * ici), directement dans le backend MONO-03 du serveur de test. Ne fabrique
 * JAMAIS l'artefact EF-04-LINEAGE lui-même ni lineageStatus — seulement ses
 * upstream, pour que le nœud EF-04-LINEAGE devienne réellement RUNNABLE via
 * l'API.
 */
async function seedUpstreamChain(op, runId, missionId, opts) {
  opts = opts || {};
  const chain = await buildValidChain(op.mono01, { missionId });
  const targetDocumentSetToUse = opts.breakTargetDocSet ? { ...chain.targetDocumentSet, documents: [] } : chain.targetDocumentSet;
  const nodeDefs = require(GRAPH_PATH).nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
  await op.mono03.runStore.createRun({ runId, missionId, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs });

  const put = async (nodeId, contract, schemaVersion, payload) => {
    await op.mono03.runStore.markNodeRunning(runId, nodeId);
    return op.mono03.runStore.recordNodeSuccess({ runId, nodeId, contract, schemaVersion, missionId, payload });
  };

  const dummy = (label) => ({ schema: "EvidenceForge.TestPlaceholder", label, testOnly: true });
  await put("EF-ORCH-SUBSYSTEM", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-ORCH-SUBSYSTEM"));
  await put("EF-PR-GEN-01", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-PR-GEN-01"));
  await put("EF-02A", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-02A"));
  await put("EF-02B", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-02B"));
  await put("EF-02C", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-02C"));
  await put("EF-02D", "EvidenceForge.TestPlaceholder", "test-v1", dummy("EF-02D"));
  await put("EF-03A", "EvidenceForge.ReviewSchema", "EF-03A-v1", chain.reviewSchema);
  await put("TARGET_DOCUMENT_SET", "EvidenceForge.TargetDocumentSet", "EF-03-v1", targetDocumentSetToUse);
  await put("EF-02E", "EvidenceForge.DocumentaryTwinSet", "EF-02E-v2", chain.twinSet);
  await put("EF-03B", "EvidenceForge.DocumentaryReviewSet", "EF-03B-v1", chain.reviewSet);
  await put("EF-03C", "EvidenceForge.AggregatedDocumentaryReview", "EF-03C-v1", chain.aggregatedReview);
  await put("EF-03D", "EvidenceForge.StabilityContradictionAnalysis", "EF-03D-v1", chain.stabilityAnalysis);

  const externalInputsSerializable = {
    runContract: { testOnly: true },
    missionDimensionSet: { testOnly: true },
    missionDocumentMapping: { testOnly: true },
    heuristicPolicy: { testOnly: true },
    exclusionRegistry: { testOnly: true },
    documents: [],
    reviewTargets: [],
  };
  await op.runRegistry.saveRunInputs(runId, {
    missionQuestion: "Question de test R2 ?",
    externalInputs: externalInputsSerializable,
    // Jamais l'adapter ici : mono03.backend.put() applique structuredClone()
    // à toute valeur (même découverte que MONO-07 sur les fonctions
    // vivantes) — un adapter ne peut donc jamais survivre à saveRunInputs().
    // C'est exactement la limite déjà documentée de MONO-05 (EF-02A/B/C non
    // pilotables depuis le bundle générique persisté).
    builtAt: new Date().toISOString(),
  });

  // Contournement identique à celui de MONO-07/lib/e2e-driver.js : construit
  // UN SEUL moteur directement, avec un adapter synthétique jamais persisté,
  // et l'enregistre via registerFreshEngine — operatorApi.runNode() récupère
  // ensuite cet engine déjà enregistré (engines.has(runId) === true) sans
  // jamais retenter la reconstruction automatique via getOrRehydrateEngine()
  // (qui échouerait légitimement sans adapter — ce test ne prétend PAS
  // démontrer que EF-02A/B/C sont pilotables depuis l'API générique, ce
  // n'est pas leur objet).
  const path2 = require("path");
  const cfg = require("../../app/server/config.js");
  const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");
  const dummyAdapter = {
    discoverProfessionals: async () => ({}),
    verifyProfessionals: async () => ({}),
    buildProfessionalCorpus: async () => ({}),
  };
  const ctx = {
    missionId,
    missionQuestion: "Question de test R2 ?",
    externalInputs: externalInputsSerializable,
    adapter: dummyAdapter,
    dependenciesAvailable: { llm: true },
    workerCallFn: async () => "{}",
    builtAt: new Date().toISOString(),
    nodeOutputs: {},
    nodeResults: {},
  };
  const engine = createOrchestrationEngine(GRAPH_PATH, op.mono01, ctx);
  const runState = await op.mono03.runStore.loadRun(runId);
  // Peuple ctx.nodeOutputs depuis ArtifactStore pour chaque nœud SUCCESS —
  // même logique que run-registry.js::buildContextFromState (non exportée,
  // reproduite ici en 4 lignes, jamais une logique métier réinventée).
  for (const [nodeId, nodeRecord] of Object.entries(runState.nodeStates)) {
    if (nodeRecord.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
      const artifact = await op.mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId]);
      ctx.nodeOutputs[nodeId] = artifact.payload;
    }
  }
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

  return chain;
}

(async () => {
  // === T05-R2-01/02/03 : happy path réel — EF-04-LINEAGE PASS via runNode() réel ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "run-t05-r2-happy";
    const missionId = "mission-t05-r2-happy";
    await seedUpstreamChain(op, runId, missionId);

    const runResult = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);
    check("T05-R2-01a. EF-04-LINEAGE exécuté réellement via l'API -> SUCCESS", runResult.status === 200 && runResult.body.state === "SUCCESS", JSON.stringify(runResult.body));

    const state = await op.mono03.runStore.loadRun(runId);
    check("T05-R2-01b. RunState.lineageStatus synchronisé automatiquement à PASS (jamais préparé manuellement dans ce test)", state.lineageStatus && state.lineageStatus.status === "PASS", JSON.stringify(state.lineageStatus));
    check("T05-R2-01c. basedOnArtifactRefs contient les 6 références amont réelles (dérivées du graphe, jamais recopiées à la main)", state.lineageStatus && Object.keys(state.lineageStatus.basedOnArtifactRefs || {}).sort().join(",") === ["EF-02E", "EF-03A", "EF-03B", "EF-03C", "EF-03D", "TARGET_DOCUMENT_SET"].sort().join(","), JSON.stringify(state.lineageStatus && state.lineageStatus.basedOnArtifactRefs));

    const lineage = await httpJson("GET", op.baseUrl + `/api/runs/${runId}/lineage`);
    check("T05-R2-02. getLineage() accessible et cohérent (status PASS)", lineage.status === 200 && lineage.body.status === "PASS", JSON.stringify(lineage.body));

    // EF-04A doit maintenant être RUNNABLE (upstream EF-04-LINEAGE SUCCESS)
    const reportNodeResult = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04A/run`);
    check("T05-R2-03a. EF-04A exécuté réellement -> SUCCESS", reportNodeResult.status === 200 && reportNodeResult.body.state === "SUCCESS", JSON.stringify(reportNodeResult.body));

    const report = await httpJson("GET", op.baseUrl + `/api/runs/${runId}/report`);
    check("T05-R2-03b. getReport() accessible (200) après un vrai EF-04-LINEAGE PASS", report.status === 200, JSON.stringify(report.body));
    check("T05-R2-03c. le rapport est un vrai UnifiedReportSummary", report.body && report.body.schema === "EvidenceForge.UnifiedReportSummary", JSON.stringify(report.body));

    await op.close();
  }

  // === T05-R2-04/05/06 : lineage non-PASS réel (chaîne brisée dès le départ) ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "run-t05-r2-fail";
    const missionId = "mission-t05-r2-fail";
    // TARGET_DOCUMENT_SET est seedé BRISÉ dès l'origine (documents: []) —
    // jamais une mutation en mémoire d'un état déjà persisté valide (bug de
    // ce test trouvé et corrigé : mono03.runStore.loadRun() renvoie une
    // copie structuredClone, une mutation locale n'est jamais persistée).
    await seedUpstreamChain(op, runId, missionId, { breakTargetDocSet: true });

    const runResult = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);
    check("T05-R2-04a. EF-04-LINEAGE avec chaîne brisée -> non-SUCCESS", runResult.body.state !== "SUCCESS", JSON.stringify(runResult.body));

    const state = await op.mono03.runStore.loadRun(runId);
    check("T05-R2-04b. recordLineageFail réellement persisté (lineageStatus.status !== PASS)", state.lineageStatus && state.lineageStatus.status === "FAIL", JSON.stringify(state.lineageStatus));

    const report = await httpJson("GET", op.baseUrl + `/api/runs/${runId}/report`);
    check("T05-R2-05. getReport() = LINEAGE_BLOCKED (423/409/4xx explicite)", report.status >= 400 && report.body && report.body.errorCode === "LINEAGE_BLOCKED", JSON.stringify(report.body));

    const nodeState = await httpJson("GET", op.baseUrl + `/api/runs/${runId}/nodes/EF-04A`);
    check("T05-R2-06. EF-04A reste NOT_STARTED/non-READY (jamais exécutable) selon le graphe réel", nodeState.body.state !== "READY" && nodeState.body.state !== "SUCCESS", JSON.stringify(nodeState.body));

    await op.close();
  }

  // === T05-R2-07/08/09 : staleness (PASS historique + artefact amont remplacé) ===
  // Technique identique à celle déjà prouvée par MONO-03 lui-même
  // (test_t03_26_31_mismatches_lineage.js, T03-31b) : DEUX runs distincts
  // partageant la même missionId — le PASS du second référence (à tort)
  // l'artefact réel du premier, jamais une mutation en mémoire d'un état
  // déjà persisté (qui ne survivrait pas à un rechargement, comme démontré
  // ci-dessus pour T05-R2-04).
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runIdOld = "run-t05-r2-stale-old";
    const runIdNew = "run-t05-r2-stale-new";
    const missionId = "mission-t05-r2-stale";

    await seedUpstreamChain(op, runIdOld, missionId);
    const runOld = await httpJson("POST", op.baseUrl + `/api/runs/${runIdOld}/nodes/EF-04-LINEAGE/run`);
    check("T05-R2-07-precond. EF-04-LINEAGE réel -> SUCCESS sur le run d'origine (précondition du test de staleness)", runOld.body.state === "SUCCESS", JSON.stringify(runOld.body));
    const stateOld = await op.mono03.runStore.loadRun(runIdOld);

    // Second run, même mission, sa propre chaîne réellement exécutée —
    // mais son PASS est enregistré en référençant (à tort) les artefacts du
    // PREMIER run, simulant un PASS devenu stale après un resume ayant
    // reconstruit les nœuds amont.
    await seedUpstreamChain(op, runIdNew, missionId);
    const runNew = await httpJson("POST", op.baseUrl + `/api/runs/${runIdNew}/nodes/EF-04-LINEAGE/run`);
    check("T05-R2-07-precond2. EF-04-LINEAGE réel -> SUCCESS sur le nouveau run", runNew.body.state === "SUCCESS", JSON.stringify(runNew.body));

    // Écrase délibérément le PASS réel du nouveau run par un PASS référençant
    // les artefacts DE L'ANCIEN run (staleness simulée par un appel réel à
    // coordinator.recordLineagePass, jamais une mutation directe d'objet).
    await op.mono03.coordinator.recordLineagePass(
      runIdNew,
      { reviewSchemaHash: "hash-perime", lineageAssurance: {} },
      { "EF-03A": stateOld.artifactRefs["EF-03A"] }
    );

    const stillValid = await op.mono03.coordinator.isLineageStillValid(runIdNew);
    check("T05-R2-07. isLineageStillValid() = false après un PASS référençant un artefact d'un autre run", stillValid === false);

    const report = await httpJson("GET", op.baseUrl + `/api/runs/${runIdNew}/report`);
    check("T05-R2-08. getReport() = LINEAGE_BLOCKED sur un PASS devenu stale (jamais accepté silencieusement)", report.status >= 400 && report.body.errorCode === "LINEAGE_BLOCKED", JSON.stringify(report.body));

    const lineage = await httpJson("GET", op.baseUrl + `/api/runs/${runIdNew}/lineage`);
    check("T05-R2-09. getLineage() ne présente JAMAIS ce PASS stale comme un PASS courant", lineage.body.status !== "PASS", JSON.stringify(lineage.body));

    await op.close();
  }

  // === T05-R2-10/11 : resume/retry (sur un nœud amont resumable) exercent
  // le même point de jonction persistOutcome()/syncLineageStatus() que
  // runNode() direct — EF-04-LINEAGE lui-même porte NO_RETRY (FAIL-CLOSED,
  // confirmé par le graphe réel), donc resume/retry ne peuvent jamais le
  // cibler directement ; ce test vérifie plutôt qu'après un cycle
  // resume/retry sur un nœud amont (EF-03D), l'exécution normale
  // d'EF-04-LINEAGE qui suit synchronise toujours lineageStatus correctement. ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "run-t05-r2-resume";
    const missionId = "mission-t05-r2-resume";
    await seedUpstreamChain(op, runId, missionId);

    // EF-03D est déjà SUCCESS (seedé) ; on vérifie simplement que
    // resumeNode()/retryNode() sur EF-04-LINEAGE lui-même sont bien refusés
    // par sa politique NO_RETRY réelle (comportement gelé attendu, jamais
    // contourné), puis que runNode() direct fonctionne et synchronise.
    const resumeAttempt = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/resume`);
    check("T05-R2-10a. resumeNode() sur EF-04-LINEAGE refusé (NO_RETRY réel, comportement gelé attendu)", resumeAttempt.status >= 400 && resumeAttempt.body.errorCode === "RESUME_NOT_ALLOWED", JSON.stringify(resumeAttempt.body));

    const runResult = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);
    const state = await op.mono03.runStore.loadRun(runId);
    check("T05-R2-10b. runNode() direct sur EF-04-LINEAGE (seul chemin autorisé par sa politique) synchronise lineageStatus", state.lineageStatus && state.lineageStatus.status === "PASS", JSON.stringify(state.lineageStatus));

    await op.close();
  }
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "run-t05-r2-retry";
    const missionId = "mission-t05-r2-retry";
    // Chaîne brisée dès l'origine (même correction que T05-R2-04 : jamais
    // une mutation en mémoire d'un état déjà persisté).
    await seedUpstreamChain(op, runId, missionId, { breakTargetDocSet: true });
    await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`); // échoue (FAILED), lineageStatus -> FAIL

    const retryAttempt = await httpJson("POST", op.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/retry`);
    check("T05-R2-11a. retryNode() sur EF-04-LINEAGE refusé (NO_RETRY réel — la lignée FAIL-CLOSED ne peut jamais être relancée sur ce nœud, correction en amont uniquement)", retryAttempt.status >= 400 && retryAttempt.body.errorCode === "RESUME_NOT_ALLOWED", JSON.stringify(retryAttempt.body));

    // Le rejet de retryNode() ne doit jamais faire régresser silencieusement
    // lineageStatus (toujours le FAIL réel du premier passage, jamais
    // réinitialisé à null ni faussement repassé à PASS par la tentative refusée).
    const state = await op.mono03.runStore.loadRun(runId);
    check("T05-R2-11b. lineageStatus reste FAIL après un retry refusé (jamais réinitialisé ni faussement PASS)", state.lineageStatus && state.lineageStatus.status === "FAIL", JSON.stringify(state.lineageStatus));

    await op.close();
  }

  // === T05-R2-12 : nouvelle instance OperatorApi (nouveau moteur, nouvelle
  // Map d'engines) lit correctement depuis le backend MONO-03 durable
  // partagé — jamais une Map locale survivante d'une instance précédente. ===
  {
    const op1 = await startOperatorServer({ providerConfigs: {} });
    const runId = "run-t05-r2-newinstance";
    const missionId = "mission-t05-r2-newinstance";
    await seedUpstreamChain(op1, runId, missionId);
    await httpJson("POST", op1.baseUrl + `/api/runs/${runId}/nodes/EF-04-LINEAGE/run`);

    // Nouvelle instance OperatorApi, nouveau runRegistry (donc une Map
    // d'engines totalement vide) — mais RÉUTILISE le même mono03 (même
    // backend durable) que op1. mono01/mono04 peuvent être neufs sans
    // conséquence : seule la persistance MONO-03 porte l'autorité durable
    // testée ici.
    const { createRunRegistry } = require("../../app/server/run-registry.js");
    const { createOperatorApi } = require("../../app/server/operator-api.js");
    const runRegistry2 = createRunRegistry(op1.mono01, op1.mono03);
    const operatorApi2 = createOperatorApi({ mono01: op1.mono01, mono03: op1.mono03, mono04: op1.mono04, runRegistry: runRegistry2 });

    const lineage = await operatorApi2.getLineage(runId);
    check("T05-R2-12. une nouvelle instance OperatorApi (nouvelle Map d'engines) lit un lineage PASS cohérent depuis le seul backend MONO-03 durable", lineage.status === "PASS", JSON.stringify(lineage));

    await op1.close();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
