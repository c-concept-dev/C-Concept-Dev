"use strict";

const cfg = require("./config.js");
const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");
const graphJson = require(cfg.GRAPH_PATH);
const path = require("path");
// CORRECTIF R2 (regressionId: MONO05-LINEAGE-STATUS-UNSYNCED) — isLineagePass
// est le prédicat CANONIQUE deja gele (MONO-01, CDC section 4.13) : jamais
// reimplemente localement ici (status===... / output.ok===...).
const { isLineagePass } = require(path.join(cfg.MONO01_PATH, "ports", "lineage-port.js"));

// operator-api.js — CDC MONO-05 section 16. La SEULE frontière entre le
// navigateur et MONO-01→04. Aucune logique métier ici : chaque opération
// délègue la décision réelle à MONO-02 (canRun/transition), MONO-01 (ports),
// MONO-03 (persistance), MONO-04 (exécution externe). Cette couche : (1)
// revalide systématiquement côté serveur (section 17 — jamais une
// confiance dans un bouton activé côté client), (2) traduit entre JSON HTTP
// et les objets internes, (3) n'expose jamais un secret ou le contenu
// interne des checkpoints EF-ORCH.
const NODE_DEFS = graphJson.nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
const NODE_ORDER = graphJson.nodes.map((n) => n.nodeId);

function createOperatorApi({ mono01, mono03, mono04, runRegistry }) {
  async function listRuns() {
    const runIds = await mono03.backend.keys("runs");
    const runs = [];
    for (const runId of runIds) {
      const state = await mono03.runStore.loadRun(runId);
      runs.push(summarizeRun(state));
    }
    return runs;
  }

  function summarizeRun(state) {
    return {
      runId: state.runId,
      missionId: state.missionId,
      status: state.status,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      currentReadyNodes: state.currentReadyNodes,
      lastError: state.lastError,
      lineageStatus: state.lineageStatus ? { status: state.lineageStatus.status } : null,
    };
  }

  async function getRun(runId) {
    const state = await mono03.runStore.loadRun(runId);
    return summarizeRun(state);
  }

  async function createRun(input) {
    if (!input || typeof input !== "object") throw apiError("INVALID_REQUEST", "createRun: corps de requête manquant.");
    const { runId, missionId, missionQuestion, externalInputs, workerCallFnTemplate, efOrchConnectorProviders } = input;
    if (!runId || !missionId) throw apiError("INVALID_REQUEST", "createRun: runId et missionId sont requis.");
    if (!externalInputs || typeof externalInputs !== "object") throw apiError("INVALID_REQUEST", "createRun: externalInputs manquant.");
    const runContract = externalInputs.runContract;
    if (!runContract || runContract.schema !== "EvidenceForge.RunContract" || !runContract.runContractHash) {
      throw apiError("INVALID_REQUEST", "createRun: externalInputs.runContract invalide (schema/runContractHash requis) — MONO-05 ne reconstruit jamais un RunContract lui-même.");
    }

    await mono03.runStore.createRun({
      runId,
      missionId,
      graphVersion: "MONO-02-v1",
      baselineVersion: "MONO-00-v1",
      integrationVersion: "MONO-01-v1",
      nodeDefs: NODE_DEFS,
    });

    await runRegistry.saveRunInputs(runId, { missionQuestion, externalInputs, workerCallFnTemplate, efOrchConnectorProviders, builtAt: new Date().toISOString() });

    const ctx = await buildLiveContext(missionId, missionQuestion, externalInputs, workerCallFnTemplate, efOrchConnectorProviders);
    const engine = createOrchestrationEngine(cfg.GRAPH_PATH, mono01, ctx);
    engine.computeReadyNodes();
    runRegistry.registerFreshEngine(runId, engine);

    return getRun(runId);
  }

  async function buildLiveContext(missionId, missionQuestion, externalInputs, workerCallFnTemplate, efOrchConnectorProviders) {
    const ctx = {
      missionId,
      missionQuestion: missionQuestion || null,
      externalInputs: { ...externalInputs },
      dependenciesAvailable: { llm: !!workerCallFnTemplate },
      builtAt: new Date().toISOString(),
    };
    if (workerCallFnTemplate) {
      ctx.workerCallFn = mono04.createGatewayWorkerCallFn(workerCallFnTemplate);
    }
    if (efOrchConnectorProviders && externalInputs.efOrchExecutionDependencies) {
      const connectorRunners = {};
      for (const [connectorId, providerId] of Object.entries(efOrchConnectorProviders)) {
        if (connectorId === "openalex") {
          const { createOpenAlexRunner } = require(cfg.MONO01_PATH + "/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js");
          connectorRunners[connectorId] = createOpenAlexRunner({ fetchImpl: mono04.createGatewayFetchImpl(providerId), genId: () => connectorId + "-" + Date.now().toString(36), nowIso: () => new Date().toISOString() });
        }
      }
      ctx.externalInputs.efOrchExecutionDependencies = { ...ctx.externalInputs.efOrchExecutionDependencies, connectorRunners };
    }
    return ctx;
  }

  async function getGraph(runId) {
    const state = await mono03.runStore.loadRun(runId);
    const engine = await runRegistry.getOrRehydrateEngine(runId).catch(() => null);
    if (engine) engine.computeReadyNodes();
    return {
      runId,
      // L'état READY est un calcul transitoire (upstream SUCCESS + graphe),
      // jamais persisté tel quel dans MONO-03 — c'est le moteur MONO-02
      // vivant (rehydraté si besoin depuis MONO-03) qui en est l'autorité.
      // Les états terminaux (SUCCESS/FAILED/BLOCKED/PAUSED) restent ceux
      // persistés par MONO-03, que le moteur reproduit exactement à la
      // réhydratation (run-registry.js).
      nodes: NODE_ORDER.map((nodeId) => ({ nodeId, state: engine ? engine.getNodeState(nodeId) : state.nodeStates[nodeId] ? state.nodeStates[nodeId].state : "NOT_STARTED" })),
    };
  }

  async function getNode(runId, nodeId) {
    const state = await mono03.runStore.loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord) throw apiError("NODE_NOT_FOUND", `Nœud "${nodeId}" inconnu pour ce run.`);
    const def = graphJson.nodes.find((n) => n.nodeId === nodeId);
    const engine = await runRegistry.getOrRehydrateEngine(runId).catch(() => null);
    if (engine) engine.computeReadyNodes();
    const liveState = engine ? engine.getNodeState(nodeId) : nodeRecord.state;
    return {
      nodeId,
      moduleId: def ? def.moduleId : null,
      portId: def ? def.portId : null,
      state: liveState,
      attemptCount: nodeRecord.attemptCount,
      requiredInputs: def ? def.requiredInputs || [] : [],
      requiredDependencies: def ? def.requiredDependencies || [] : [],
      upstreamNodes: def ? def.requiredUpstreamNodes || [] : [],
      retryPolicy: nodeRecord.retryPolicy,
      resumePolicy: nodeRecord.resumePolicy,
      lastError: nodeRecord.lastError,
      inputArtifactRefs: nodeRecord.inputArtifactRefs,
      outputArtifactRefs: nodeRecord.outputArtifactRefs,
    };
  }

  async function runNode(runId, nodeId) {
    const engine = await runRegistry.getOrRehydrateEngine(runId);
    // Un seul point de vérité pour la précondition : engine.runNode()
    // refait lui-même canRun()+transition("RUNNING") de façon synchrone à
    // son entrée (avant tout await) — c'est CE contrôle interne qui protège
    // réellement contre une course entre deux requêtes concurrentes
    // (T05-39). Un appel canRun() séparé ici serait redondant et laisserait
    // une fenêtre de course inutile entre les deux appels.
    await mono03.runStore.markNodeRunning(runId, nodeId).catch(() => {}); // idempotent si déjà RUNNING côté MONO-03 ; ne bloque jamais la revalidation réelle ci-dessous
    const outcome = await engine.runNode(nodeId);

    // outcome.result === undefined signifie que engine.runNode() a rejeté
    // la demande AVANT même de l'exécuter (nœud inconnu, pas READY,
    // précondition MONO-02 non satisfaite, aucun exécuteur) — jamais un
    // véritable résultat d'exécution du module métier. Persister ceci
    // comme un FAILED de nœud serait un FAUX ÉCHEC métier créé par une
    // simple collision de requêtes (bug réel trouvé par T05-39/audit
    // adversarial) — on ne persiste JAMAIS dans ce cas, on renvoie
    // uniquement l'erreur technique de la requête elle-même.
    if (!outcome.ok && !outcome.result) {
      throw apiError(outcome.error.code, outcome.error.message, outcome.error.details);
    }

    await persistOutcome(runId, nodeId, outcome);
    return getNode(runId, nodeId);
  }

  async function resumeNode(runId, nodeId) {
    const state = await mono03.runStore.loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord || (nodeRecord.state !== "PAUSED" && nodeRecord.state !== "FAILED")) {
      throw apiError("RESUME_NOT_ALLOWED", `resumeNode: le nœud "${nodeId}" n'est pas dans un état permettant une reprise (état actuel: ${nodeRecord ? nodeRecord.state : "inconnu"}).`);
    }
    if (nodeRecord.retryPolicy !== "RESUME_CHECKPOINT" && nodeRecord.retryPolicy !== "REPLAY_MISSING_ONLY") {
      throw apiError("RESUME_NOT_ALLOWED", `resumeNode: le nœud "${nodeId}" (retryPolicy=${nodeRecord.retryPolicy}) n'autorise pas une reprise.`);
    }
    const engine = await runRegistry.getOrRehydrateEngine(runId);
    if (engine.getNodeState(nodeId) !== "READY") engine.transition(nodeId, "READY");
    return runNode(runId, nodeId);
  }

  async function retryNode(runId, nodeId) {
    const state = await mono03.runStore.loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord) throw apiError("NODE_NOT_FOUND", `Nœud "${nodeId}" inconnu.`);
    if (nodeRecord.retryPolicy === "NO_RETRY") {
      throw apiError("RESUME_NOT_ALLOWED", `retryNode: le nœud "${nodeId}" porte la politique NO_RETRY.`);
    }
    if (nodeRecord.retryPolicy === "EXPLICIT_REBUILD_REQUIRED") {
      throw apiError("RESUME_NOT_ALLOWED", `retryNode: le nœud "${nodeId}" exige une reconstruction explicite (EXPLICIT_REBUILD_REQUIRED).`);
    }
    const engine = await runRegistry.getOrRehydrateEngine(runId);
    if (engine.getNodeState(nodeId) === "FAILED" || engine.getNodeState(nodeId) === "BLOCKED") {
      engine.transition(nodeId, "READY");
    }
    return runNode(runId, nodeId);
  }

  async function persistOutcome(runId, nodeId, outcome) {
    if (outcome.ok && outcome.result && outcome.result.status === "SUCCESS") {
      const missionId = (await mono03.runStore.loadRun(runId)).missionId;
      await mono03.runStore.recordNodeSuccess({
        runId,
        nodeId,
        contract: (outcome.result.output && outcome.result.output.schema) || "unknown",
        schemaVersion: (outcome.result.output && outcome.result.output.schemaVersion) || "unknown",
        missionId,
        payload: outcome.result.output,
      });
    } else if (outcome.error) {
      const status = outcome.result && outcome.result.status === "BLOCKED" ? "BLOCKED" : "FAILED";
      if (status === "BLOCKED") await mono03.runStore.recordNodeBlocked(runId, nodeId, outcome.error);
      else await mono03.runStore.recordNodeFailure(runId, nodeId, outcome.error);
    }

    // CORRECTIF R2 — Node execution state (ci-dessus) et Lineage validity
    // state (ci-dessous) restent deux dimensions distinctes (section 4 de la
    // decision de gouvernance) : le NodeState garde son diagnostic technique
    // complet (FAILED/BLOCKED/erreur) tel quel, jamais remplace. La
    // synchronisation lineage est une operation ADDITIONNELLE, jamais un
    // substitut.
    if (nodeId === "EF-04-LINEAGE") {
      await syncLineageStatus(runId, outcome);
    }
  }

  // CORRECTIF R2 (regressionId: MONO05-LINEAGE-STATUS-UNSYNCED, Option A1
  // validee par gouvernance) — persistOutcome() est le seul point de jonction
  // reel entre l'issue du moteur MONO-02 et la persistance MONO-03 pour les
  // trois chemins officiellement supportes (runNode/resumeNode/retryNode,
  // ces deux derniers delegant a runNode). MONO-02 n'acquiert aucune
  // dependance vers MONO-03 (verifie : README MONO-02 documente explicitement
  // que MONO-02 "ne construit toujours aucune persistance finale"). MONO-03
  // n'acquiert aucun hardcoding de nodeId specifique (son coordinateur reste
  // generique et n'est pas modifie ici).
  //
  // Aiguillage via le predicat CANONIQUE deja gele isLineagePass() (MONO-01) —
  // jamais une reimplementation locale. Semantique FAIL-CLOSED (decision de
  // gouvernance section 4) : toute issue ne satisfaisant pas isLineagePass()
  // (echec technique, precondition manquante, ou lignee reellement rompue)
  // est traitee de facon indifferenciee comme "aucun lineage PASS valide".
  async function syncLineageStatus(runId, outcome) {
    if (!isLineagePass(outcome.result)) {
      const reason = (outcome.error && outcome.error.message) || "EF-04-LINEAGE : aucun lineage PASS valide (isLineagePass() = false).";
      await mono03.coordinator.recordLineageFail(runId, reason);
      return;
    }

    // Ordre transactionnel (section 6 de la decision de gouvernance) : le
    // NodeState/artefact d'EF-04-LINEAGE vient deja d'etre persiste
    // ci-dessus (recordNodeSuccess, avant cet appel) — jamais un PASS
    // lineage marque durable avant que sa propre preuve ne le soit.
    const state = await mono03.runStore.loadRun(runId);

    // basedOnArtifactRefs derive de la source structuree deja gelee (le
    // graphe MONO-02 lui-meme), jamais une liste recopiee a la main —
    // section 5 de la decision de gouvernance.
    const nodeDef = graphJson.nodes.find((n) => n.nodeId === "EF-04-LINEAGE");
    const upstreamNodeIds = (nodeDef && nodeDef.requiredUpstreamNodes) || [];
    const basedOnArtifactRefs = {};
    let allPresent = upstreamNodeIds.length > 0;
    for (const upstreamNodeId of upstreamNodeIds) {
      const ref = state.artifactRefs[upstreamNodeId];
      if (!ref) { allPresent = false; break; }
      basedOnArtifactRefs[upstreamNodeId] = ref;
    }

    if (!allPresent) {
      // Fail-closed : jamais un PASS enregistre sur une preuve amont
      // partielle (section 5 de la decision de gouvernance).
      await mono03.coordinator.recordLineageFail(
        runId,
        "EF-04-LINEAGE : isLineagePass()=true mais references amont incompletes dans RunState.artifactRefs — jamais enregistre comme preuve partielle."
      );
      return;
    }

    await mono03.coordinator.recordLineagePass(runId, outcome.result.output, basedOnArtifactRefs);
  }

  async function listArtifacts(runId) {
    const state = await mono03.runStore.loadRun(runId);
    const out = [];
    for (const [nodeId, artifactId] of Object.entries(state.artifactRefs)) {
      const record = await mono03.artifactStore.getArtifact(artifactId);
      out.push({ artifactId: record.artifactId, nodeId, contract: record.contract, schemaVersion: record.contractSchemaVersion, missionId: record.missionId, contentHash: record.contentHash, createdAt: record.createdAt });
    }
    return out;
  }

  async function getArtifact(runId, artifactId) {
    const state = await mono03.runStore.loadRun(runId);
    const belongsToRun = Object.values(state.artifactRefs).includes(artifactId);
    if (!belongsToRun) throw apiError("ARTIFACT_NOT_FOUND", `Artefact "${artifactId}" introuvable pour ce run.`);
    const record = await mono03.artifactStore.getArtifact(artifactId);
    return { artifactId: record.artifactId, nodeId: record.nodeId, contract: record.contract, schemaVersion: record.contractSchemaVersion, missionId: record.missionId, contentHash: record.contentHash, createdAt: record.createdAt, payload: record.payload };
  }

  async function getDependencies(runId) {
    const state = await mono03.runStore.loadRun(runId);
    const entries = [
      { provider: "clone-proxy", dependencyType: "DIRECT_RUNTIME", label: "LLM (Worker)" },
      { provider: "openalex-proxy", dependencyType: "DIRECT_RUNTIME", label: "OpenAlex / Crossref / PubMed (Worker)" },
    ];
    return entries.map((e) => ({
      provider: e.provider,
      dependencyType: e.dependencyType,
      configured: mono04.providerRegistry.hasProvider(e.provider),
      available: mono04.providerRegistry.hasProvider(e.provider),
      lastError: state.lastError,
    }));
  }

  // CORRECTIF R2 — le gate ne lit plus jamais state.lineageStatus.status
  // directement : il passe systematiquement par coordinator.isLineageStillValid()
  // (section 7 de la decision de gouvernance), seule autorite qui applique la
  // regle de staleness deja contractuelle de MONO-03 (un PASS historique
  // devient invalide si un artefact amont qu'il referencait a ete remplace).
  async function getLineage(runId) {
    const state = await mono03.runStore.loadRun(runId);
    if (!state.lineageStatus) return { status: "NOT_RUN" };
    if (state.lineageStatus.status === "PASS") {
      const stillValid = await mono03.coordinator.isLineageStillValid(runId);
      if (!stillValid) {
        // Ne presente JAMAIS un PASS historique comme un PASS courant
        // (section 8 de la decision de gouvernance) — statut distinct,
        // avec le diagnostic historique conserve pour information.
        return { status: "STALE", historicalStatus: state.lineageStatus, reason: "Un artefact amont référencé par ce PASS a été remplacé depuis son enregistrement." };
      }
    }
    return state.lineageStatus;
  }

  async function getReport(runId) {
    const stillValid = await mono03.coordinator.isLineageStillValid(runId);
    if (!stillValid) {
      throw apiError("LINEAGE_BLOCKED", "getReport: le rapport n'est accessible que si EF-04-LINEAGE = PASS et reste valide (aucun artefact amont remplacé depuis).");
    }
    const state = await mono03.runStore.loadRun(runId);
    const reportArtifactId = state.artifactRefs["EF-04A"];
    if (!reportArtifactId) throw apiError("ARTIFACT_NOT_FOUND", "getReport: aucun UnifiedReportSummary persisté pour ce run.");
    const record = await mono03.artifactStore.getArtifact(reportArtifactId);
    return record.payload;
  }

  return { listRuns, getRun, createRun, getGraph, getNode, runNode, resumeNode, retryNode, listArtifacts, getArtifact, getDependencies, getLineage, getReport, NODE_ORDER };
}

function apiError(code, message, details) {
  const err = new Error(message);
  err.code = code;
  err.details = details || {};
  return err;
}

module.exports = { createOperatorApi, NODE_ORDER, apiError };
