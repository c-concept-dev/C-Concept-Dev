"use strict";

const { createPersistenceError } = require("./persistence-errors.js");
const { createArtifactStore } = require("./artifact-store.js");
const { sha256Hex } = require("./canonical-hash.js");

// RunStore — CDC MONO-03 sections 2, 3, 5, 13, 14. Persiste le RunState
// global et les NodeStateRecord — jamais une deuxième state machine : les
// valeurs de `state` restent EXACTEMENT celles de MONO-02
// (NOT_STARTED/READY/RUNNING/SUCCESS/FAILED/BLOCKED/PAUSED), fournies par
// l'appelant, jamais recalculées ici.
const NAMESPACE = "runs";
const NODE_STATES = Object.freeze(["NOT_STARTED", "READY", "RUNNING", "SUCCESS", "FAILED", "BLOCKED", "PAUSED"]);

function nowIso() {
  return new Date().toISOString();
}

function createRunStore(backend) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function") {
    throw new Error("createRunStore: backend invalide (attendu {get, put, has, delete, keys}) — jamais construit implicitement.");
  }
  const artifactStore = createArtifactStore(backend);

  async function persist(state) {
    const next = { ...state, updatedAt: nowIso() };
    try {
      await backend.put(NAMESPACE, state.runId, next);
    } catch (e) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", `RunStore: échec d'écriture durable du RunState "${state.runId}".`, { runId: state.runId, cause: String(e && e.message) });
    }
    let verify;
    try {
      verify = await backend.get(NAMESPACE, state.runId);
    } catch (e) {
      verify = undefined;
    }
    if (!verify || verify.updatedAt !== next.updatedAt) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", `RunStore: vérification immédiate après écriture a échoué pour le run "${state.runId}".`, { runId: state.runId });
    }
    return verify;
  }

  async function createRun({ runId, missionId, graphVersion, baselineVersion, integrationVersion, nodeDefs }) {
    if (!runId || !missionId) {
      throw createPersistenceError("PERSISTENCE_WRITE_FAILED", "createRun: runId et missionId sont obligatoires.", {});
    }
    const existing = await backend.has(NAMESPACE, runId).catch(() => false);
    if (existing) {
      throw createPersistenceError("RUN_STATE_CONFLICT", `createRun: un RunState existe déjà pour "${runId}" — createRun n'écrase jamais un run existant.`, { runId });
    }
    const nodeStates = {};
    for (const def of nodeDefs || []) {
      nodeStates[def.nodeId] = {
        schema: "EvidenceForge.NodeStateRecord",
        schemaVersion: "MONO-03-v1",
        nodeId: def.nodeId,
        state: "NOT_STARTED",
        attemptCount: 0,
        startedAt: null,
        completedAt: null,
        lastError: null,
        inputArtifactRefs: [],
        outputArtifactRefs: [],
        resumePolicy: def.resumePolicy,
        retryPolicy: def.retryPolicy,
      };
    }
    const state = {
      schema: "EvidenceForge.RunState",
      schemaVersion: "MONO-03-v1",
      runId,
      missionId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      graphVersion: graphVersion || null,
      baselineVersion: baselineVersion || null,
      integrationVersion: integrationVersion || null,
      status: "running",
      currentReadyNodes: [],
      nodeStates,
      artifactRefs: {},
      efOrchRunIdentity: null,
      efOrchNativeStatus: null,
      lineageStatus: null,
      lastError: null,
    };
    return persist(state);
  }

  function assertRunStateConsistent(state) {
    // Correction post-audit (protocole de commit SUCCESS) : un RunState où
    // un nœud est SUCCESS mais dont outputArtifactRefs/artifactRefs sont
    // incohérents ne doit JAMAIS être traité comme un SUCCESS réutilisable —
    // fail-closed systématique à la lecture, jamais une réparation
    // silencieuse. Avec le protocole atomique actuel (un seul persist() pour
    // nodeStates+artifactRefs), cette incohérence ne peut plus être produite
    // par recordNodeSuccess() lui-même ; ce garde-fou couvre un RunState
    // historique (produit avant cette correction) ou toute corruption
    // externe directe du backend.
    for (const [nodeId, node] of Object.entries(state.nodeStates)) {
      if (node.state !== "SUCCESS") continue;
      if (!Array.isArray(node.outputArtifactRefs) || node.outputArtifactRefs.length !== 1) {
        throw createPersistenceError(
          "RUN_STATE_CONFLICT",
          `RunState "${state.runId}" incohérent : le nœud "${nodeId}" est SUCCESS mais outputArtifactRefs ne contient pas exactement une référence.`,
          { runId: state.runId, nodeId, outputArtifactRefs: node.outputArtifactRefs }
        );
      }
      const artifactId = node.outputArtifactRefs[0];
      if (state.artifactRefs[nodeId] !== artifactId) {
        throw createPersistenceError(
          "RUN_STATE_CONFLICT",
          `RunState "${state.runId}" incohérent : le nœud "${nodeId}" est SUCCESS avec outputArtifactRefs[0]="${artifactId}" mais artifactRefs["${nodeId}"]="${state.artifactRefs[nodeId]}" — jamais réutilisé comme un SUCCESS valide.`,
          { runId: state.runId, nodeId, outputArtifactRef: artifactId, artifactRefsEntry: state.artifactRefs[nodeId] }
        );
      }
    }
  }

  async function loadRun(runId) {
    let state;
    try {
      state = await backend.get(NAMESPACE, runId);
    } catch (e) {
      throw createPersistenceError("PERSISTENCE_READ_FAILED", `loadRun: échec de lecture durable pour "${runId}".`, { runId, cause: String(e && e.message) });
    }
    if (state === undefined) {
      throw createPersistenceError("RUN_NOT_FOUND", `loadRun: aucun RunState pour "${runId}".`, { runId });
    }
    assertRunStateConsistent(state);
    return state;
  }

  function assertKnownNodeState(nodeId, s) {
    if (!NODE_STATES.includes(s)) {
      throw createPersistenceError("RUN_STATE_CONFLICT", `RunStore: état "${s}" inconnu pour le nœud "${nodeId}" — MONO-03 n'invente jamais un état hors des 7 états MONO-02.`, { nodeId, state: s });
    }
  }

  async function updateNodeState(runId, nodeId, patch) {
    const state = await loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord) {
      throw createPersistenceError("RUN_STATE_CONFLICT", `RunStore: nœud "${nodeId}" absent du RunState "${runId}" (jamais déclaré à createRun).`, { runId, nodeId });
    }
    if (patch.state) assertKnownNodeState(nodeId, patch.state);

    if (nodeRecord.state === "SUCCESS" && patch.state && patch.state !== "SUCCESS") {
      throw createPersistenceError("RUN_STATE_CONFLICT", `RunStore: le nœud "${nodeId}" est déjà SUCCESS — un output réussi n'est jamais rejoué ni réécrasé (${patch.state} refusé).`, { runId, nodeId, attemptedState: patch.state });
    }

    const updatedNode = { ...nodeRecord, ...patch };
    const nextNodeStates = { ...state.nodeStates, [nodeId]: updatedNode };
    return persist({ ...state, nodeStates: nextNodeStates });
  }

  async function markNodeRunning(runId, nodeId) {
    const state = await loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord) throw createPersistenceError("RUN_STATE_CONFLICT", `markNodeRunning: nœud "${nodeId}" inconnu.`, { runId, nodeId });
    if (nodeRecord.state === "SUCCESS") {
      throw createPersistenceError("RUN_STATE_CONFLICT", `markNodeRunning: le nœud "${nodeId}" est déjà SUCCESS — jamais rejoué.`, { runId, nodeId });
    }
    return updateNodeState(runId, nodeId, {
      state: "RUNNING",
      attemptCount: nodeRecord.attemptCount + 1,
      startedAt: nowIso(),
      lastError: null,
    });
  }

  async function recordNodeSuccess({ runId, nodeId, contract, schemaVersion, missionId, payload }) {
    const state = await loadRun(runId);
    const nodeRecord = state.nodeStates[nodeId];
    if (!nodeRecord) throw createPersistenceError("RUN_STATE_CONFLICT", `recordNodeSuccess: nœud "${nodeId}" inconnu.`, { runId, nodeId });

    if (payload === undefined) {
      throw createPersistenceError("SUCCESS_WITHOUT_ARTIFACT", `recordNodeSuccess: aucun payload fourni pour "${nodeId}" — un nœud ne peut jamais passer SUCCESS sans artefact persisté.`, { runId, nodeId });
    }

    if (nodeRecord.state === "SUCCESS") {
      const existingArtifactId = nodeRecord.outputArtifactRefs[0];
      const candidateHash = sha256Hex(payload);
      const existingRecord = existingArtifactId ? await artifactStore.getArtifact(existingArtifactId).catch(() => null) : null;
      if (!existingRecord || existingRecord.contentHash !== candidateHash) {
        throw createPersistenceError("RUN_STATE_CONFLICT", `recordNodeSuccess: le nœud "${nodeId}" est déjà SUCCESS avec un artefact différent — jamais un écrasement silencieux.`, { runId, nodeId });
      }
      // loadRun() a déjà rejeté fail-closed tout RunState où un nœud SUCCESS
      // porterait un artifactRefs[nodeId] incohérent avec outputArtifactRefs[0]
      // (voir assertRunStateConsistent ci-dessous) — si l'exécution atteint ce
      // point, state.artifactRefs[nodeId] === existingArtifactId est déjà
      // garanti. Vérifié quand même explicitement, en défense, jamais une
      // réparation silencieuse d'une incohérence : une divergence ici
      // signalerait un bug de assertRunStateConsistent lui-même.
      if (state.artifactRefs[nodeId] !== existingArtifactId) {
        throw createPersistenceError("RUN_STATE_CONFLICT", `recordNodeSuccess: incohérence inattendue pour "${nodeId}" (artifactRefs ne correspond pas à outputArtifactRefs) — jamais une réutilisation silencieuse.`, { runId, nodeId });
      }
      return state; // pleinement cohérent, rien à faire — idempotence stricte.
    }

    // Étape 1 : écriture de l'artefact AVANT tout changement d'état — si
    // elle échoue, l'exception se propage et le nœud reste dans son état
    // courant (jamais SUCCESS).
    const artifactRecord = await artifactStore.putArtifact({ runId, nodeId, contract, schemaVersion, missionId, payload });

    // Étape 2 : commit ATOMIQUE — nodeStates[nodeId] ET artifactRefs[nodeId]
    // sont construits en mémoire puis persistés en UNE SEULE écriture
    // (correction post-audit : l'ancienne version faisait deux persist()
    // successifs via updateNodeState() puis un second persist(), laissant une
    // fenêtre où state=SUCCESS pouvait être durablement écrit sans que
    // artifactRefs[nodeId] ne le soit jamais si la seconde écriture échouait).
    const updatedNode = {
      ...nodeRecord,
      state: "SUCCESS",
      completedAt: nowIso(),
      outputArtifactRefs: [artifactRecord.artifactId],
      lastError: null,
    };
    const nextNodeStates = { ...state.nodeStates, [nodeId]: updatedNode };
    const nextArtifactRefs = { ...state.artifactRefs, [nodeId]: artifactRecord.artifactId };

    return persist({ ...state, nodeStates: nextNodeStates, artifactRefs: nextArtifactRefs });
  }

  async function recordNodeFailure(runId, nodeId, error) {
    return updateNodeState(runId, nodeId, { state: "FAILED", completedAt: nowIso(), lastError: error || null });
  }

  async function recordNodeBlocked(runId, nodeId, error) {
    return updateNodeState(runId, nodeId, { state: "BLOCKED", lastError: error || null });
  }

  async function recordNodePaused(runId, nodeId, reason) {
    return updateNodeState(runId, nodeId, { state: "PAUSED", lastError: reason || null });
  }

  async function setEFOrchRunIdentity(runId, efOrchRunIdentity, efOrchNativeStatus) {
    const state = await loadRun(runId);
    return persist({ ...state, efOrchRunIdentity, efOrchNativeStatus: efOrchNativeStatus || state.efOrchNativeStatus });
  }

  async function setLineageStatus(runId, lineageStatus) {
    const state = await loadRun(runId);
    return persist({ ...state, lineageStatus });
  }

  async function setLastError(runId, error) {
    const state = await loadRun(runId);
    return persist({ ...state, lastError: error || null });
  }

  return {
    createRun,
    loadRun,
    updateNodeState,
    markNodeRunning,
    recordNodeSuccess,
    recordNodeFailure,
    recordNodeBlocked,
    recordNodePaused,
    setEFOrchRunIdentity,
    setLineageStatus,
    setLastError,
    artifactStore,
  };
}

module.exports = { createRunStore, NODE_STATES };
