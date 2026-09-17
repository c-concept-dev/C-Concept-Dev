// EvidenceForge — EF-ORCH-01 — State Machine — v0.1
// Périmètre : transitions d'état pures, aucun appel réseau, aucun module EF-01/EF-02
// invoqué ici. Le Stage Adapter (EF-ORCH-02) et le chaînage réel (EF-ORCH-03)
// viendront s'appuyer dessus, pas l'inverse.
"use strict";

const SCHEMA = "EvidenceForge.OrchestrationRunState";
const SCHEMA_VERSION = "EF-ORCH-SM-v1";

const VALID_STATUSES = Object.freeze(["idle", "running", "paused", "failed", "completed"]);

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function appendHistory(state, entry) {
  return [...state.history, { ...entry, at: nowIso() }];
}

// ---------------------------------------------------------------------------
// createRunState({ runId, runContractHash, stages }) -> état initial "idle"
// ---------------------------------------------------------------------------
function createRunState({ runId, runContractHash, stages }) {
  if (!str(runId)) throw new Error("createRunState: runId manquant.");
  if (!str(runContractHash)) throw new Error("createRunState: runContractHash manquant — la state machine ne doit jamais piloter un run dont le contrat n'est pas confirmé et hashé.");
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("createRunState: stages doit être une liste non vide.");
  const stagesOut = stages.map(str).filter(Boolean);
  if (stagesOut.length !== stages.length) throw new Error("createRunState: un ou plusieurs stageId sont vides.");
  if (new Set(stagesOut).size !== stagesOut.length) throw new Error("createRunState: stages contient des doublons.");

  const at = nowIso();
  const state = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    runId: str(runId),
    runContractHash: str(runContractHash),
    stages: stagesOut,
    status: "idle",
    currentStageIndex: -1,
    checkpoints: [],
    gate: null,
    error: null,
    history: [{ from: null, to: "idle", event: "created", at }],
    createdAt: at,
    updatedAt: at
  };
  return deepFreeze(state);
}

function assertStatus(state, expected, action) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(state.status)) {
    throw new Error(
      "EF-ORCH-01: transition impossible — " + action + " requiert le statut " + allowed.join("|") +
      ", statut actuel : " + state.status + " (run " + state.runId + ")."
    );
  }
}

function currentStageId(state) {
  if (state.currentStageIndex < 0 || state.currentStageIndex >= state.stages.length) return null;
  return state.stages[state.currentStageIndex];
}

// ---------------------------------------------------------------------------
// startRun(state) : idle -> running, se place sur le premier stage
// ---------------------------------------------------------------------------
function startRun(state) {
  assertStatus(state, "idle", "startRun");
  const next = {
    ...state,
    status: "running",
    currentStageIndex: 0,
    updatedAt: nowIso(),
    history: appendHistory(state, { from: "idle", to: "running", event: "start", stageId: state.stages[0] })
  };
  return deepFreeze(next);
}

// ---------------------------------------------------------------------------
// advanceStage(state, checkpoint) : running -> running (stage suivant) ou completed
// checkpoint = { stageId, outputHash?, note? } — stageId doit être exactement
// le stage courant : aucun saut de stage n'est autorisé.
// ---------------------------------------------------------------------------
function advanceStage(state, checkpoint) {
  assertStatus(state, "running", "advanceStage");
  const expected = currentStageId(state);
  const given = str(checkpoint && checkpoint.stageId);
  if (given !== expected) {
    throw new Error(
      "EF-ORCH-01: stage ne peut pas être sauté — attendu \"" + expected + "\", reçu \"" + given + "\" (run " + state.runId + ")."
    );
  }

  const at = nowIso();
  const newCheckpoint = {
    stageId: expected,
    index: state.currentStageIndex,
    outputHash: str(checkpoint && checkpoint.outputHash) || null,
    note: str(checkpoint && checkpoint.note) || null,
    completedAt: at
  };
  const checkpoints = [...state.checkpoints, newCheckpoint];

  const isLast = state.currentStageIndex === state.stages.length - 1;
  if (isLast) {
    const next = {
      ...state,
      status: "completed",
      checkpoints,
      updatedAt: at,
      history: appendHistory(state, { from: "running", to: "completed", event: "advance", stageId: expected })
    };
    return deepFreeze(next);
  }

  const nextIndex = state.currentStageIndex + 1;
  const next = {
    ...state,
    status: "running",
    currentStageIndex: nextIndex,
    checkpoints,
    updatedAt: at,
    history: appendHistory(state, { from: "running", to: "running", event: "advance", stageId: expected, nextStageId: state.stages[nextIndex] })
  };
  return deepFreeze(next);
}

// ---------------------------------------------------------------------------
// failRun(state, error) : running|paused -> failed
// ---------------------------------------------------------------------------
function failRun(state, error) {
  assertStatus(state, ["running", "paused"], "failRun");
  const at = nowIso();
  const next = {
    ...state,
    status: "failed",
    error: { stageId: currentStageId(state), message: str(error && error.message) || "erreur non documentée", at },
    updatedAt: at,
    history: appendHistory(state, { from: state.status, to: "failed", event: "fail", stageId: currentStageId(state) })
  };
  return deepFreeze(next);
}

// ---------------------------------------------------------------------------
// pauseRun(state, gate) : running -> paused
// gate = référence à un RuntimeDecisionGate (gateId obligatoire) — cette brique
// ne construit pas le gate lui-même, elle se contente de porter sa référence.
// ---------------------------------------------------------------------------
function pauseRun(state, gate) {
  assertStatus(state, "running", "pauseRun");
  if (!gate || !str(gate.gateId)) throw new Error("EF-ORCH-01: pauseRun requiert une référence de gate valide (gateId).");
  const at = nowIso();
  const next = {
    ...state,
    status: "paused",
    gate: { gateId: str(gate.gateId), reason: str(gate.reason) || null, stageId: currentStageId(state) },
    updatedAt: at,
    history: appendHistory(state, { from: "running", to: "paused", event: "pause", stageId: currentStageId(state), gateId: gate.gateId })
  };
  return deepFreeze(next);
}

// ---------------------------------------------------------------------------
// resumeRun(state, decision) : paused -> running (même stage, à charge de
// l'orchestrateur EF-ORCH-03 de réellement reprendre l'exécution à cet endroit)
// decision = { gateId, decision, justification? } — doit référencer le gate en cours.
// ---------------------------------------------------------------------------
function resumeRun(state, decision) {
  assertStatus(state, "paused", "resumeRun");
  const gateId = str(decision && decision.gateId);
  if (!gateId) throw new Error("EF-ORCH-01: resumeRun requiert decision.gateId.");
  if (!state.gate || gateId !== state.gate.gateId) {
    throw new Error(
      "EF-ORCH-01: la décision fournie (gate \"" + gateId + "\") ne correspond pas au gate en attente (\"" + (state.gate && state.gate.gateId) + "\")."
    );
  }
  const at = nowIso();
  const next = {
    ...state,
    status: "running",
    gate: null,
    updatedAt: at,
    history: appendHistory(state, {
      from: "paused",
      to: "running",
      event: "resume",
      stageId: currentStageId(state),
      gateId,
      decision: str(decision.decision) || null
    })
  };
  return deepFreeze(next);
}

const EFOrchStateMachine = {
  SCHEMA,
  SCHEMA_VERSION,
  VALID_STATUSES,
  createRunState,
  startRun,
  advanceStage,
  failRun,
  pauseRun,
  resumeRun,
  currentStageId
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchStateMachine;
}
if (typeof window !== "undefined") {
  window.EFOrchStateMachine = EFOrchStateMachine;
}
