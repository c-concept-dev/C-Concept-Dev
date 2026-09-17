"use strict";

const cfg = require("./config.js");
const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");

// createRunRegistry(mono01, mono03) — tient une carte EN MÉMOIRE
// runId -> moteur MONO-02 vivant. Ce n'est jamais une source de vérité :
// MONO-03 (runStore) reste l'autorité pour l'état persistant de chaque
// nœud ; ce registre ne fait que porter l'instance d'orchestration ACTIVE
// nécessaire pour exécuter une action (runNode/resumeNode/retryNode).
//
// Après un redémarrage conceptuel du serveur (aucun moteur en mémoire),
// getOrRehydrateEngine() reconstruit un moteur FRAIS à partir : (1) du
// bundle d'entrées externes conservé au namespace "runInputs" du backend
// MONO-03 injecté (RunContract + executionDependencies fournis par
// l'opérateur à la création du run — jamais devinés), et (2) des payloads
// déjà persistés dans ArtifactStore pour chaque nœud SUCCESS (jamais
// recalculés). Ceci prouve que l'UI ne "possède" jamais l'état : tout est
// retrouvable depuis MONO-03 (section 27, test de redémarrage).
function createRunRegistry(mono01, mono03) {
  const engines = new Map(); // runId -> engine

  async function getRunInputs(runId) {
    const raw = await mono03.backend.get("runInputs", runId);
    return raw || null;
  }

  async function saveRunInputs(runId, runInputs) {
    await mono03.backend.put("runInputs", runId, runInputs);
  }

  async function buildContextFromState(runId, runInputs, runState) {
    const ctx = {
      missionId: runState.missionId,
      missionQuestion: runInputs.missionQuestion || null,
      externalInputs: { ...runInputs.externalInputs },
      adapter: runInputs.adapter || undefined,
      dependenciesAvailable: runInputs.dependenciesAvailable || {},
      workerCallFn: runInputs.workerCallFn || undefined,
      builtAt: runInputs.builtAt || new Date().toISOString(),
      nodeOutputs: {},
      nodeResults: {},
    };
    for (const [nodeId, nodeRecord] of Object.entries(runState.nodeStates)) {
      if (nodeRecord.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
        const artifact = await mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId]);
        ctx.nodeOutputs[nodeId] = artifact.payload;
      }
    }
    return ctx;
  }

  // CORRECTIF REG-02 (regressionId: MONO05-R2-REG-02, MULTI_NODE_REHYDRATION_CHAIN)
  // — l'ancienne boucle n'appelait computeReadyNodes() qu'une fois avant et
  // une fois après l'itération, jamais ENTRE chaque transition : un nœud B
  // dépendant d'un nœud A transitionné DANS LA MÊME PASSE restait bloqué à
  // NOT_STARTED (son éligibilité n'était jamais réévaluée après la
  // transition de A), puis le computeReadyNodes() final ne pouvait le
  // promouvoir qu'à READY (jamais SUCCESS). Reproduit au minimum avec 2
  // nœuds chaînés déjà SUCCESS dans RunState. Corrigé par une réhydratation
  // en POINT FIXE, répétant (computeReadyNodes + tentative de transition sur
  // chaque nœud) jusqu'à absence de progression — jamais dépendante de
  // l'ordre d'énumération de runState.nodeStates (non garanti topologique,
  // voir CDC-TRACE.md section "vérification de portée REG-02").
  //
  // RUNNING persisté (nœud interrompu par un crash mi-exécution) : restauré
  // comme FAILED, jamais laissé RUNNING (un nœud RUNNING dans le moteur
  // réhydraté serait définitivement bloqué — ni runNode() (exige READY), ni
  // resumeNode() (exige PAUSED/FAILED), ni retryNode() (exige FAILED/BLOCKED)
  // ne pourraient plus jamais agir dessus). Ce choix s'appuie sur des preuves
  // déjà gelées, jamais une nouvelle politique inventée ici : (1)
  // MONO-03/lib/resume-planner.js::classifyNode() classe déjà RUNNING dans
  // le MÊME bucket retryPolicy que FAILED/PAUSED (aucun cas RUNNING séparé) ;
  // (2) engine.markFailed() est la transition RUNNING->FAILED déjà publique
  // et légale du moteur (jamais une nouvelle transition ajoutée ici) ; (3)
  // PAUSED reste réservé à une pause déprogrammée explicite (ex:
  // EFOrchExecutionPort.resume()), jamais à une interruption involontaire de
  // processus.
  async function getOrRehydrateEngine(runId) {
    if (engines.has(runId)) return engines.get(runId);
    const runState = await mono03.runStore.loadRun(runId);
    const runInputs = await getRunInputs(runId);
    if (!runInputs) {
      throw new Error(`getOrRehydrateEngine: aucun bundle d'entrées externes conservé pour "${runId}" — impossible de reconstruire un moteur d'orchestration.`);
    }
    const ctx = await buildContextFromState(runId, runInputs, runState);
    const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);

    const nodeIds = Object.keys(runState.nodeStates); // ordre non garanti topologique — jamais supposé
    const maxPasses = nodeIds.length + 1; // borne déterministe (garde-fou anti-boucle-infinie)
    let progressed = true;
    let passes = 0;
    while (progressed && passes < maxPasses) {
      progressed = false;
      passes++;
      engine.computeReadyNodes();
      for (const nodeId of nodeIds) {
        const target = runState.nodeStates[nodeId].state;
        if (target === "NOT_STARTED") continue;
        if (engine.getNodeState(nodeId) === target) continue; // déjà reconstruit

        if (engine.getNodeState(nodeId) === "READY") {
          if (engine.transition(nodeId, "RUNNING").ok) progressed = true;
        }

        const current = engine.getNodeState(nodeId);
        if (current === "RUNNING") {
          let result;
          if (target === "RUNNING") {
            result = engine.markFailed(nodeId, {
              code: "INTERRUPTED_BY_RESTART",
              message: `Nœud "${nodeId}" était RUNNING lors d'une interruption de processus — restauré FAILED pour rester actionnable (resume/retry selon sa politique), jamais laissé RUNNING.`,
            });
          } else {
            result = engine.transition(nodeId, target);
          }
          if (result.ok) progressed = true;
        }
      }
      engine.computeReadyNodes();
    }

    // Vérification FAIL-CLOSED (jamais une reconstruction silencieuse
    // partielle) : tout état persisté non-NOT_STARTED doit avoir été
    // reconstruit à l'identique, à la seule exception documentée RUNNING->FAILED.
    for (const nodeId of nodeIds) {
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED") continue;
      const finalState = engine.getNodeState(nodeId);
      const acceptable = finalState === target || (target === "RUNNING" && finalState === "FAILED");
      if (!acceptable) {
        throw new Error(
          `REHYDRATION_STATE_MISMATCH: le nœud "${nodeId}" est persisté "${target}" mais n'a pas pu être reconstruit légalement dans le moteur (état final: "${finalState}") après ${passes} passe(s) — jamais une reconstruction silencieuse partielle.`
        );
      }
    }

    engines.set(runId, engine);
    return engine;
  }

  function registerFreshEngine(runId, engine) {
    engines.set(runId, engine);
  }

  return { getOrRehydrateEngine, registerFreshEngine, saveRunInputs, getRunInputs, engines };
}

module.exports = { createRunRegistry };
