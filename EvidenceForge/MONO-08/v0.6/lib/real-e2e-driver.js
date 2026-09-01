"use strict";
/**
 * MONO-08 — lib/real-e2e-driver.js
 *
 * Construit un run reel/local-controlled complet, y compris le
 * sous-pipeline interne EF-ORCH-SUBSYSTEM (EF-01A a EF-01F), en
 * reutilisant EXCLUSIVEMENT les builders/factories geles identifies par
 * inspection contractuelle directe (voir CDC-TRACE.md, section EF-ORCH).
 * driveRun() (moteur MONO-02-R1 externe, 14 noeuds) est reutilise tel
 * quel depuis MONO-07 — jamais recopie.
 *
 * connectorRunners contient des FONCTIONS (createOpenAlexRunner) — jamais
 * persiste via runRegistry.saveRunInputs (le backend MONO-03 applique
 * structuredClone(), decouverte deja documentee) : reconstruit fraichement
 * a chaque appel (creation ET reprise), exactement comme adapter/
 * workerCallFn.
 */

const path = require("path");
const { loadEForchDeps, buildConfirmedRunContractForMission, buildResolverTraceForMission, buildSearchProtocolForMission, buildOpenAlexConnectorRunner, buildScreeningArtifactForMission, buildQualificationArtifactForMission, buildEF01AInjectedForMission, buildEF01FInjectedForMission, executeActiveConnectorsRetrieval } = require("./eforch-artifacts");

function buildRealNodeDefs(graphPath) {
  return require(graphPath).nodes.map(function (n) { return { nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }; });
}

/**
 * DECOUVERTE DE CONTRAT (test reel effectue) : missionDimensionSet n'est
 * PAS un objet plat {dimensions:[...]} — EF-PR-GEN-01 rejette silencieusement
 * ("MissionDimensionSet invalide") toute forme qui n'a pas ete produite par
 * le builder gele EFPrGenMissionDimensionSet.buildMissionDimensionSet(),
 * qui exige en particulier "definition" et "weight" par dimension (jamais
 * de valeurs par defaut inventees ici — fournies explicitement).
 */
async function buildRealMissionDimensionSet(cfg, missionId, dimensions) {
  const EFPrGenMissionDimensionSet = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-pr-gen-mission-dimension-set-v1.js"));
  return EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId: missionId,
    dimensions: dimensions.map(function (d) { return { id: d.id, label: d.label || d.id, definition: d.definition || d.label || d.id, weight: typeof d.weight === "number" ? d.weight : 1 }; }),
    createdAt: new Date().toISOString(),
  });
}

/**
 * DECOUVERTE DE CONTRAT (test reel effectue) : missionDocumentMapping
 * n'est pas non plus un objet plat — meme regle, meme builder gele
 * (EFPrGenMissionDocumentMapping.buildMissionDocumentMapping), qui exige
 * "slots" avec targetId/role/matchers et un ambiguityFloor explicite.
 */
function buildRealMissionDocumentMapping(cfg, missionId, targetDocuments) {
  const EFPrGenMissionDocumentMapping = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-pr-gen-mission-document-mapping-v1.js"));
  return EFPrGenMissionDocumentMapping.buildMissionDocumentMapping({
    missionId: missionId,
    slots: targetDocuments.map(function (d) { return { targetId: d.documentId, role: "cahier", matchers: { aliases: [d.title || d.documentId] } }; }),
    ambiguityFloor: 0.2,
  });
}

/**
 * DECOUVERTE DE CONTRAT (test reel effectue) : heuristicPolicy suit la
 * meme regle — construit via EFPrGenHeuristicPolicy.buildHeuristicPolicy(),
 * jamais un objet vide.
 */
function buildRealHeuristicPolicy(cfg) {
  const EFPrGenHeuristicPolicy = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-pr-gen-heuristic-policy-v1.js"));
  return EFPrGenHeuristicPolicy.buildHeuristicPolicy({
    policyId: "policy-mono08",
    status: "test_unvalidated",
    values: { minWorks: 1, minDoi: 1, minYears: 1, minTopics: 0, coverageThreshold: "moderate", maxPanel: 5, minMarginalGain: 0.1, redundancyPenalty: 0.2 },
    justification: "Real Smoke MONO-08 (LOCAL_CONTROLLED ou reel).",
  });
}

/**
 * DECOUVERTE DE CONTRAT (test reel effectue) : ctx.externalInputs.documents
 * (consomme directement par buildTargetDocumentSet) exige {targetId, role,
 * content} — jamais {documentId, title, url}. targetId doit correspondre
 * EXACTEMENT a celui produit par le builder gele
 * ef-03a-review-schema-v1.js::buildReviewTargets(labels) (utilise aussi
 * pour ctx.externalInputs.reviewTargets, consomme par EF-03A) — les deux
 * doivent partager le meme targetId pour la meme cible, jamais invente
 * independamment de part et d'autre.
 */
function buildRealReviewTargetsAndDocuments(cfg, targetDocuments, documentContentByUrl) {
  const buildReviewTargets = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-03a-review-schema-v1.js")).buildReviewTargets;
  const reviewTargets = buildReviewTargets(targetDocuments.map(function (d) { return d.title || d.documentId; }));
  const documents = targetDocuments.map(function (d, i) {
    const content = documentContentByUrl[d.url];
    if (!content) throw new Error("buildRealReviewTargetsAndDocuments: contenu manquant pour \"" + d.url + "\" (documentContentByUrl).");
    return { targetId: reviewTargets[i].targetId, role: "cahier", content: content };
  });
  return { reviewTargets: reviewTargets, documents: documents };
}

/**
 * Construit TOUS les artefacts prerequis du sous-pipeline EF-ORCH
 * (RunContract confirme, ResolverTrace, SearchProtocol, ScreeningArtifact,
 * QualificationTestArtifact, ef01aInjected/ef01fInjected) et retourne
 * { runContract, efOrchExecutionDependenciesSerializable, connectorRunnersFactory }.
 *
 * openAlexFetchImpl : fonction fetch-shaped (LOCAL_CONTROLLED ou REELLE
 * via le vrai Gateway MONO-04) — jamais un HTTP sauvage a cote de MONO-04.
 *
 * provenanceOpts (REMEDIATION F-02/F-03, humanValidation ajoute en R2/M-02,
 * plannerOutput ajoute en R3/M-02) :
 * { mode: "REAL"|"LOCAL_CONTROLLED", resolverRuns, plannerRun, plannerOutput,
 * auditDecisions, humanValidation } — voir eforch-artifacts.js pour le
 * detail. Absent ou mode omis => LOCAL_CONTROLLED (comportement fixture
 * synthetique inchange, seulement etiquete). mode "REAL" sans donnees
 * reelles completes (plannerOutput inclus — le CONTENU causal du
 * planificateur, distinct de plannerRun qui n'est que sa provenance)
 * => echec ferme OPERATOR_INPUT_REQUIRED, jamais une fabrication.
 */
async function buildEForchArtifacts(cfg, mission, missionQuestion, documentBytesByUrl, openAlexFetchImpl, provenanceOpts) {
  provenanceOpts = provenanceOpts || {};
  const deps = loadEForchDeps(cfg.MONO01_PATH);
  const runContract = await buildConfirmedRunContractForMission(deps, mission, missionQuestion, documentBytesByUrl);
  const missionId = runContract.runContractHash; // meme convention que fixtures-eforch.js / EFOrchExecutionPort (runId par defaut = runContractHash)
  const resolverTrace = buildResolverTraceForMission(deps, missionId, runContract, { mode: provenanceOpts.mode, resolverRuns: provenanceOpts.resolverRuns });
  const disciplines = mission.dimensions.map(function (d) { return d.id; });
  const searchProtocol = await buildSearchProtocolForMission(deps, missionId, runContract.runContractHash.slice(0, 8), disciplines, { mode: provenanceOpts.mode, plannerRun: provenanceOpts.plannerRun, plannerOutput: provenanceOpts.plannerOutput, humanValidation: provenanceOpts.humanValidation });

  // Construit la map hash->octets attendue par l'executeur EF-01A, a partir
  // des memes octets (et donc memes hashs) que ceux utilises pour le RunContract.
  const documentBytesByHash = {};
  for (const doc of mission.targetDocuments) {
    const bytes = documentBytesByUrl[doc.url];
    const hash = await deps.sha256Bytes(bytes);
    documentBytesByHash[hash] = bytes;
  }
  const ef01aInjected = buildEF01AInjectedForMission(missionId, documentBytesByHash, mission);
  const ef01fInjected = buildEF01FInjectedForMission(runContract.runContractHash.slice(0, 8));

  // REMEDIATION R4 (F-03) : connectorRunners construit ICI, UNE SEULE FOIS
  // (memoise — voir buildOpenAlexConnectorRunner), et REELLEMENT invoque
  // AVANT la construction de ScreeningArtifact (executeActiveConnectorsRetrieval)
  // — jamais un placeholder documentaire ("Source "+id) construit sans
  // resultat retrieval reel derriere. La MEME instance (memoisee) est
  // retournee a l'appelant pour que le noeud EF-01C2 du graphe (execute
  // plus tard, MEME processus) reutilise EXACTEMENT ce resultat deja
  // obtenu, jamais un second appel reseau reel.
  const sourceId = "source-" + runContract.runContractHash.slice(0, 12);
  const connectorRunners = { openalex: buildOpenAlexConnectorRunner(deps, sourceId, openAlexFetchImpl) };
  const retrievalResult = await executeActiveConnectorsRetrieval(connectorRunners, searchProtocol);
  const retrievalResultHash = await deps.sha256CanonicalJson(retrievalResult);

  const screeningArtifact = await buildScreeningArtifactForMission(deps, retrievalResult.sourcesTrouvees, searchProtocol.protocolHash, { mode: provenanceOpts.mode, auditDecisions: provenanceOpts.auditDecisions, retrievalResultHash: retrievalResultHash });
  const screeningArtifactHash = await deps.sha256CanonicalJson(screeningArtifact);
  const qualificationTestArtifact = buildQualificationArtifactForMission(deps, screeningArtifact, searchProtocol);
  const qualificationArtifactHash = await deps.sha256CanonicalJson(qualificationTestArtifact);

  const efOrchExecutionDependenciesSerializable = {
    ef01aInjected: ef01aInjected,
    resolverTrace: resolverTrace,
    searchProtocol: searchProtocol,
    screeningArtifact: screeningArtifact,
    qualificationTestArtifact: qualificationTestArtifact,
    ef01fInjected: ef01fInjected,
    protocolHash: searchProtocol.protocolHash,
    auditDecisions: screeningArtifact.auditDecisions,
    // REMEDIATION R4 (F-03, mandat section 13) : lineage explicite
    // retrieval -> screening -> qualification, verifiable sans inference.
    retrievalLineage: { retrievalResultHash: retrievalResultHash, screeningArtifactHash: screeningArtifactHash, qualificationArtifactHash: qualificationArtifactHash },
  };

  return { runContract: runContract, missionId: missionId, efOrchExecutionDependenciesSerializable: efOrchExecutionDependenciesSerializable, connectorRunners: connectorRunners };
}

async function createRealMissionRun(env, adapter, workerCallFn, opts) {
  opts = opts || {};
  const runId = opts.runId;
  const mono03 = env.mono03;
  const mono01 = env.mono01;
  const runRegistry = env.runRegistry;
  const cfg = env.cfg;
  const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));

  const missionQuestion = opts.missionQuestion || "Real Smoke MONO-08";
  const documentBytesByUrl = opts.documentBytesByUrl || {};
  const documentContentByUrl = opts.documentContentByUrl || {};
  const openAlexFetchImpl = opts.openAlexFetchImpl;
  if (typeof openAlexFetchImpl !== "function") throw new Error("createRealMissionRun: opts.openAlexFetchImpl requis (LOCAL_CONTROLLED ou REEL — jamais un HTTP sauvage a cote de MONO-04).");

  const realProvenance = opts.realProvenance || {};
  const built = await buildEForchArtifacts(cfg, opts.mission, missionQuestion, documentBytesByUrl, openAlexFetchImpl, {
    mode: opts.mode, resolverRuns: realProvenance.resolverRuns, plannerRun: realProvenance.plannerRun, plannerOutput: realProvenance.plannerOutput, auditDecisions: realProvenance.auditDecisions,
    humanValidation: realProvenance.humanValidation,
  });
  const missionId = opts.missionId || built.missionId;
  const reviewMapping = buildRealReviewTargetsAndDocuments(cfg, opts.mission.targetDocuments, documentContentByUrl);

  const nodeDefs = buildRealNodeDefs(cfg.GRAPH_PATH);
  await mono03.runStore.createRun({
    runId: runId, missionId: missionId, graphVersion: "MONO-02-R1", baselineVersion: "MONO-00-v1", integrationVersion: "MONO-01-v1", nodeDefs: nodeDefs,
  });

  const externalInputs = {
    runContract: built.runContract,
    missionDimensionSet: await buildRealMissionDimensionSet(cfg, missionId, opts.mission.dimensions),
    missionDocumentMapping: buildRealMissionDocumentMapping(cfg, missionId, opts.mission.targetDocuments),
    heuristicPolicy: opts.heuristicPolicy || buildRealHeuristicPolicy(cfg),
    exclusionRegistry: opts.exclusionRegistry || { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [] },
    documents: reviewMapping.documents,
    reviewTargets: reviewMapping.reviewTargets,
    // connectorRunners (fonctions) volontairement EXCLU de la persistance —
    // reconstruit fraichement ci-dessous et a la reprise.
    efOrchExecutionDependencies: built.efOrchExecutionDependenciesSerializable,
  };

  const runInputsBundle = { missionQuestion: missionQuestion, externalInputs: externalInputs, builtAt: new Date().toISOString() };
  await runRegistry.saveRunInputs(runId, runInputsBundle);

  const ctx = {
    missionId: missionId,
    missionQuestion: missionQuestion,
    externalInputs: Object.assign({}, externalInputs, {
      // REMEDIATION R4 (F-03) : reutilise la MEME instance memoisee de
      // connectorRunners deja invoquee par buildEForchArtifacts pour
      // construire ScreeningArtifact — jamais une nouvelle instance qui
      // relancerait un appel reseau reel distinct.
      efOrchExecutionDependencies: Object.assign({}, built.efOrchExecutionDependenciesSerializable, { connectorRunners: built.connectorRunners }),
    }),
    adapter: adapter,
    dependenciesAvailable: { llm: true },
    workerCallFn: workerCallFn,
    builtAt: runInputsBundle.builtAt,
    nodeOutputs: {},
    nodeResults: {},
  };
  const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);
  runRegistry.registerFreshEngine(runId, engine);
  return { runId: runId, missionId: missionId };
}

/**
 * Reprise apres redemarrage — reconstruit connectorRunners fraichement
 * (jamais persiste), exactement comme adapter/workerCallFn. Reutilise le
 * MEME algorithme de reconstruction en point fixe deja valide.
 */
async function rehydrateRealMissionRun(env, adapter, workerCallFn, openAlexFetchImpl, runId) {
  const mono03 = env.mono03;
  const mono01 = env.mono01;
  const runRegistry = env.runRegistry;
  const cfg = env.cfg;
  const { createOrchestrationEngine } = require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js"));

  const runState = await mono03.runStore.loadRun(runId);
  const runInputs = await runRegistry.getRunInputs(runId);
  if (!runInputs) throw new Error("rehydrateRealMissionRun: aucun bundle runInputs persiste pour \"" + runId + "\".");

  const deps = loadEForchDeps(cfg.MONO01_PATH);
  const savedDeps = runInputs.externalInputs.efOrchExecutionDependencies || {};
  const sourceId = "source-" + runState.missionId.toString().slice(0, 12);
  const connectorRunners = openAlexFetchImpl ? { openalex: buildOpenAlexConnectorRunner(deps, sourceId, openAlexFetchImpl) } : undefined;

  const ctx = {
    missionId: runState.missionId,
    missionQuestion: runInputs.missionQuestion,
    externalInputs: Object.assign({}, runInputs.externalInputs, {
      efOrchExecutionDependencies: connectorRunners ? Object.assign({}, savedDeps, { connectorRunners: connectorRunners }) : savedDeps,
    }),
    adapter: adapter,
    dependenciesAvailable: { llm: true },
    workerCallFn: workerCallFn,
    builtAt: runInputs.builtAt,
    nodeOutputs: {},
    nodeResults: {},
  };
  const nodeIds = Object.keys(runState.nodeStates);
  for (const nodeId of nodeIds) {
    const rec = runState.nodeStates[nodeId];
    if (rec.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
      ctx.nodeOutputs[nodeId] = (await mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId])).payload;
    }
  }
  const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);
  let progressed = true, passes = 0;
  while (progressed && passes < nodeIds.length + 1) {
    progressed = false; passes++;
    engine.computeReadyNodes();
    for (const nodeId of nodeIds) {
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED" || engine.getNodeState(nodeId) === target) continue;
      if (engine.getNodeState(nodeId) === "READY" && engine.transition(nodeId, "RUNNING").ok) progressed = true;
      const current = engine.getNodeState(nodeId);
      if (current === "RUNNING") {
        const result = target === "RUNNING"
          ? engine.markFailed(nodeId, { code: "INTERRUPTED_BY_RESTART", message: "Noeud \"" + nodeId + "\" etait RUNNING lors d'une interruption de processus - restaure FAILED." })
          : engine.transition(nodeId, target);
        if (result.ok) progressed = true;
      }
    }
    engine.computeReadyNodes();
  }
  for (const nodeId of nodeIds) {
    const target = runState.nodeStates[nodeId].state;
    if (target === "NOT_STARTED") continue;
    const finalState = engine.getNodeState(nodeId);
    if (finalState !== target && !(target === "RUNNING" && finalState === "FAILED")) {
      throw new Error("REHYDRATION_STATE_MISMATCH: le noeud \"" + nodeId + "\" est persiste \"" + target + "\" mais reconstruit a \"" + finalState + "\" apres " + passes + " passe(s).");
    }
  }
  runRegistry.registerFreshEngine(runId, engine);
  return { runId: runId };
}

module.exports = { createRealMissionRun: createRealMissionRun, rehydrateRealMissionRun: rehydrateRealMissionRun, buildEForchArtifacts: buildEForchArtifacts };
