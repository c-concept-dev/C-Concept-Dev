"use strict";
/**
 * MONO-07 — e2e-driver.js
 *
 * Pilote un run réel de bout en bout à travers les 14 nœuds MONO-02, en
 * composant les briques réelles de MONO-01->05 (jamais une réimplémentation).
 *
 * DÉCOUVERTE D'ARCHITECTURE #1 (documentée, jamais un STOP — aucun lot gelé
 * modifié) : `OperatorApi.createRun()` de MONO-05 ne câble jamais
 * `ctx.adapter` — limite déjà documentée par MONO-05 lui-même
 * (KNOWN-LIMITATIONS : "EF-02A/B/C non pilotables depuis le formulaire
 * générique"). Piloter un run qui traverse réellement EF-02A/B/C (section 9
 * du CDC) exige donc de construire le contexte à un niveau équivalent à
 * celui qu'`operator-api.js::createRun` utilise en interne — jamais un
 * fichier gelé modifié, uniquement une composition différente des mêmes
 * fonctions déjà exposées (mono03.runStore.createRun + runRegistry.saveRunInputs
 * + createOrchestrationEngine + runRegistry.registerFreshEngine).
 *
 * DÉCOUVERTE D'ARCHITECTURE #2 (bug réel trouvé PENDANT la construction de
 * MONO-07, corrigé ici, jamais dans un lot gelé) : une première version
 * persistait directement des FONCTIONS vivantes (adapter, workerCallFn,
 * connectorRunners) dans `runRegistry.saveRunInputs()`. Le backend MONO-03
 * (gelé) utilise `structuredClone()` pour garantir une isolation réelle des
 * données persistées — structuredClone ne peut jamais cloner une fonction
 * (DataCloneError immédiat). Corrigé en persistant UNIQUEMENT des
 * identifiants sérialisables (workerProviderId, openAlexProviderId,
 * useSyntheticAdapter) et en reconstruisant les fonctions vivantes à la
 * demande via `materializeContext()`, appelée aussi bien à la création
 * qu'à toute réhydratation dans un nouveau processus simulé.
 */

const path = require("path");
const fx = require("./synthetic-fixtures");

function loadOrchestrationEngine(cfg) {
  return require(path.join(cfg.MONO02_PATH, "lib", "orchestration-engine.js")).createOrchestrationEngine;
}

function loadOpenAlexRunnerFactory(mono05Root) {
  return require(path.join(mono05Root, "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01", "dependencies", "ef-orch-ef01c2-runner-openalex-v0.1.js")).createOpenAlexRunner;
}

function materializeContext(env, persistedRunInputs, nodeOutputsSeed) {
  const { mono04, mono05Root } = env;
  const createOpenAlexRunner = loadOpenAlexRunnerFactory(mono05Root);

  const connectorRunners = {};
  if (persistedRunInputs.openAlexProviderId) {
    connectorRunners.openalex = createOpenAlexRunner({
      fetchImpl: mono04.createGatewayFetchImpl(persistedRunInputs.openAlexProviderId),
      // ID DÉTERMINISTE, jamais aléatoire : le screeningArtifact fourni à
      // EF-01D référence ce même identifiant fixe (fx.OPENALEX_SOURCE_ID).
      // Bug réel trouvé pendant la construction : un genId() aléatoire
      // produisait un sourceId différent à chaque exécution, ne
      // correspondant jamais au screeningArtifact statique préparé à
      // l'avance -> EF-01D rejetait systématiquement
      // (assertScreeningArtifactComplete: sources manquantes/en trop).
      genId: () => fx.OPENALEX_SOURCE_ID,
      nowIso: () => new Date().toISOString()
    });
  }

  const externalInputs = {
    ...persistedRunInputs.externalInputs,
    efOrchExecutionDependencies: {
      ...(persistedRunInputs.externalInputs.efOrchExecutionDependencies || {}),
      connectorRunners
    }
  };

  const workerCallFn = persistedRunInputs.workerProviderId
    ? mono04.createGatewayWorkerCallFn({ provider: persistedRunInputs.workerProviderId, requestId: "e2e-worker", responseTextField: "text" })
    : undefined;

  const adapter = persistedRunInputs.useSyntheticAdapter ? fx.buildSyntheticAdapter(mono04) : undefined;

  return {
    missionId: fx.MISSION_ID,
    missionQuestion: persistedRunInputs.missionQuestion,
    externalInputs,
    adapter,
    dependenciesAvailable: { llm: true },
    workerCallFn,
    builtAt: persistedRunInputs.builtAt,
    nodeOutputs: nodeOutputsSeed || {},
    nodeResults: {}
  };
}

async function buildSerializableRunInputs(env, opts) {
  const missionArtifacts = await fx.buildMissionArtifacts(env.mono05Root);
  const efOrch = await fx.buildEFOrchExecutionDependencies(env.mono05Root);
  const reviewTargets = fx.buildReviewTargets(env.mono05Root);
  const exclusionRegistry = fx.buildExclusionRegistry();

  const externalInputs = {
    runContract: efOrch.confirmedRunContract,
    efOrchExecutionDependencies: { ...efOrch.executionDependencies },
    missionDimensionSet: missionArtifacts.missionDimensionSet,
    missionDocumentMapping: missionArtifacts.missionDocumentMapping,
    heuristicPolicy: missionArtifacts.heuristicPolicy,
    exclusionRegistry,
    documents: fx.TARGET_DOCUMENTS.map((d) => ({ targetId: d.targetId, role: d.role, content: d.content })),
    reviewTargets
  };

  return {
    missionQuestion: fx.MISSION_QUESTION,
    externalInputs,
    workerProviderId: opts.workerProviderId || "worker-success",
    openAlexProviderId: opts.openAlexProviderId || "openalex-success",
    useSyntheticAdapter: true,
    builtAt: new Date().toISOString()
  };
}

async function createRealE2ERun(env, opts) {
  opts = opts || {};
  const runId = opts.runId;
  const { mono03, mono01, runRegistry, cfg } = env;
  const createOrchestrationEngine = loadOrchestrationEngine(cfg);

  const runInputsBundle = await buildSerializableRunInputs(env, opts);

  const NODE_DEFS = require(cfg.GRAPH_PATH).nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
  await mono03.runStore.createRun({
    runId,
    missionId: fx.MISSION_ID,
    graphVersion: "MONO-02-v1",
    baselineVersion: "MONO-00-v1",
    integrationVersion: "MONO-01-v1",
    nodeDefs: NODE_DEFS
  });

  await runRegistry.saveRunInputs(runId, runInputsBundle);

  const ctx = materializeContext(env, runInputsBundle);
  const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);
  engine.computeReadyNodes();
  runRegistry.registerFreshEngine(runId, engine);

  return { runId };
}

async function rehydrateForNewProcess(env2, runId) {
  const { mono03, mono01, runRegistry, cfg } = env2;
  const createOrchestrationEngine = loadOrchestrationEngine(cfg);

  const runState = await mono03.runStore.loadRun(runId);
  const runInputsBundle = await runRegistry.getRunInputs(runId);
  if (!runInputsBundle) {
    throw new Error(`rehydrateForNewProcess: aucun bundle runInputs persisté pour "${runId}".`);
  }

  const nodeOutputsSeed = {};
  for (const [nodeId, nodeRecord] of Object.entries(runState.nodeStates)) {
    if (nodeRecord.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
      const artifact = await mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId]);
      nodeOutputsSeed[nodeId] = artifact.payload;
    }
  }

  const ctx = materializeContext(env2, runInputsBundle, nodeOutputsSeed);
  const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);

  // CORRECTIF (bug reel trouve dans MON PROPRE code MONO-07, jamais un lot
  // gele) : reutilise exactement l'algorithme en point fixe valide et teste
  // dans MONO-05-R2 (regressionId: MONO05-R2-REG-02) — computeReadyNodes()
  // etait appele une seule fois avant et apres la boucle, jamais entre
  // chaque transition, cassant toute reconstruction de chaine de plus d'un
  // nœud. Meme correction, memes transitions publiques legales du moteur.
  const nodeIds = Object.keys(runState.nodeStates);
  let progressed = true;
  let passes = 0;
  while (progressed && passes < nodeIds.length + 1) {
    progressed = false;
    passes++;
    engine.computeReadyNodes();
    for (const nodeId of nodeIds) {
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED" || engine.getNodeState(nodeId) === target) continue;
      if (engine.getNodeState(nodeId) === "READY" && engine.transition(nodeId, "RUNNING").ok) progressed = true;
      const current = engine.getNodeState(nodeId);
      if (current === "RUNNING") {
        const result = target === "RUNNING"
          ? engine.markFailed(nodeId, { code: "INTERRUPTED_BY_RESTART", message: `Nœud "${nodeId}" était RUNNING lors d'une interruption de processus — restauré FAILED.` })
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
      throw new Error(`REHYDRATION_STATE_MISMATCH: le nœud "${nodeId}" est persisté "${target}" mais reconstruit à "${finalState}" après ${passes} passe(s).`);
    }
  }

  runRegistry.registerFreshEngine(runId, engine);
  return { runId };
}

async function driveRun(operatorApi, runId, opts) {
  opts = opts || {};
  const maxIterations = opts.maxIterations || 40;
  const stopBeforeNode = opts.stopBeforeNode || null;
  const trace = [];
  let iterations = 0;
  while (iterations++ < maxIterations) {
    const graph = await operatorApi.getGraph(runId);
    const ready = graph.nodes.filter((n) => n.state === "READY").map((n) => n.nodeId);
    if (ready.length === 0) break;
    let progressed = false;
    for (const nodeId of ready) {
      if (stopBeforeNode && nodeId === stopBeforeNode) {
        return { trace, stoppedBefore: nodeId };
      }
      try {
        const result = await operatorApi.runNode(runId, nodeId);
        trace.push({ nodeId, state: result.state, attemptCount: result.attemptCount });
        progressed = true;
      } catch (e) {
        trace.push({ nodeId, error: e.message, code: e.code });
      }
    }
    if (!progressed) break;
  }
  return { trace, stoppedBefore: null };
}

module.exports = { createRealE2ERun, rehydrateForNewProcess, driveRun, materializeContext, buildSerializableRunInputs };
