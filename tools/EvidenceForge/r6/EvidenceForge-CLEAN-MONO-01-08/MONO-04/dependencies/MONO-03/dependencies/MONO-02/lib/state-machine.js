"use strict";

const { createOrchestrationError } = require("./orchestration-errors");

// State machine — CDC MONO-02 section STATE MACHINE. Aucune transition
// implicite : seules les 9 paires (from, to) ci-dessous sont autorisées.
const STATES = Object.freeze(["NOT_STARTED", "READY", "RUNNING", "SUCCESS", "FAILED", "BLOCKED", "PAUSED"]);

const ALLOWED_TRANSITIONS = new Set([
  "NOT_STARTED->READY",
  "READY->RUNNING",
  "RUNNING->SUCCESS",
  "RUNNING->FAILED",
  "RUNNING->BLOCKED",
  "FAILED->READY",
  "BLOCKED->READY",
  "RUNNING->PAUSED",
  "PAUSED->READY",
]);

function isValidState(state) {
  return STATES.includes(state);
}

// transition(fromState, toState) -> { ok: true } | { ok: false, error }
// Fonction pure — ne connaît rien du graphe ni des noeuds, uniquement la
// mécanique d'état. Utilisée par OrchestrationEngine pour chaque changement
// d'état, jamais contournée par une affectation directe.
function transition(fromState, toState) {
  if (!isValidState(fromState) || !isValidState(toState)) {
    return {
      ok: false,
      error: createOrchestrationError(
        "INVALID_STATE_TRANSITION",
        `État inconnu dans la transition demandée: ${fromState} -> ${toState}.`,
        { from: fromState, to: toState }
      ),
    };
  }
  const key = `${fromState}->${toState}`;
  if (!ALLOWED_TRANSITIONS.has(key)) {
    return {
      ok: false,
      error: createOrchestrationError(
        "INVALID_STATE_TRANSITION",
        `Transition non autorisée: ${fromState} -> ${toState}. Aucune transition implicite n'est permise (CDC MONO-02).`,
        { from: fromState, to: toState }
      ),
    };
  }
  return { ok: true, from: fromState, to: toState };
}

module.exports = { STATES, ALLOWED_TRANSITIONS, isValidState, transition };
