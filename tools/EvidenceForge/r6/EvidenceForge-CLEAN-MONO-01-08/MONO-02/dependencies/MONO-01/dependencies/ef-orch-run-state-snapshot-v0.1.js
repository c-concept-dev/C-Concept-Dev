// EvidenceForge — EF-ORCH-04A — RunStateSnapshot + store durable — v0.1
// Frontière de migration explicite entre le format interne de la State
// Machine (gelée, jamais modifiée ici) et sa représentation persistée.
// Même si v0.1 est structurellement proche de l'état interne, l'enveloppe
// schema/schemaVersion permet de faire évoluer la persistance sans jamais
// rendre le format interne de la State Machine publiquement contractuel.
"use strict";

const SCHEMA = "EvidenceForge.RunStateSnapshot";
const SCHEMA_VERSION = "0.1";
const STORE_NAME = "stateMachineSnapshots";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

// ---------------------------------------------------------------------------
// wrapRunStateSnapshot(state) -> enveloppe versionnée
// ---------------------------------------------------------------------------
function wrapRunStateSnapshot(state) {
  if (!state || !str(state.runId) || !str(state.runContractHash)) {
    throw new Error("wrapRunStateSnapshot: state invalide (runId/runContractHash requis).");
  }
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    runId: state.runId,
    runContractHash: state.runContractHash,
    state: clone(state)
  };
}

// ---------------------------------------------------------------------------
// unwrapRunStateSnapshot(snapshot) -> state interne de la State Machine
// Vérifie l'enveloppe avant de rendre le state — jamais une désérialisation
// aveugle d'un format qu'on ne reconnaît pas.
// ---------------------------------------------------------------------------
function unwrapRunStateSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== SCHEMA || snapshot.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("unwrapRunStateSnapshot: enveloppe non reconnue (attendu " + SCHEMA + "/" + SCHEMA_VERSION + ").");
  }
  if (!snapshot.state || snapshot.state.runId !== snapshot.runId) {
    throw new Error("unwrapRunStateSnapshot: incohérence runId entre l'enveloppe et le state qu'elle porte.");
  }
  if (snapshot.state.runContractHash !== snapshot.runContractHash) {
    throw new Error("unwrapRunStateSnapshot: incohérence runContractHash entre l'enveloppe et le state qu'elle porte.");
  }
  return clone(snapshot.state);
}

// ---------------------------------------------------------------------------
// createDurableStateSnapshotStore({ backend })
// Clé = runId. Pas de hash cryptographique ici : le state de la State
// Machine n'est pas un artefact de preuve, seulement un pointeur de reprise —
// sa véracité est garantie par les checkpoints RunOutputStore associés,
// jamais par lui-même. Cache strictement interne, comme pour les deux autres
// stores durables — même raison : un cache injectable de l'extérieur
// contournerait la frontière de vérification et resterait mutable par
// l'appelant après coup.
// ---------------------------------------------------------------------------
function createDurableStateSnapshotStore({ backend }) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function") {
    throw new Error("createDurableStateSnapshotStore: backend invalide (attendu {get, put, has}).");
  }
  const localCache = new Map();

  async function putRunState(state) {
    const snapshot = wrapRunStateSnapshot(state);
    await backend.put(STORE_NAME, state.runId, snapshot); // durable D'ABORD, comme les autres stores durables
    localCache.set(state.runId, clone(snapshot));
    return clone(snapshot);
  }

  async function getRunState(runId) {
    const cached = localCache.get(runId);
    if (cached) {
      if (cached.runId !== runId) {
        throw new Error("getRunState: corruption de clé — l'entrée en cache pour \"" + runId + "\" porte en réalité runId=\"" + cached.runId + "\".");
      }
      return unwrapRunStateSnapshot(cached);
    }
    const fromBackend = await backend.get(STORE_NAME, runId);
    if (!fromBackend) return null;
    if (fromBackend.runId !== runId) {
      throw new Error("getRunState: corruption de clé — l'entrée récupérée sous \"" + runId + "\" porte en réalité runId=\"" + fromBackend.runId + "\" ; jamais restituée comme si elle correspondait au run demandé.");
    }
    localCache.set(runId, clone(fromBackend));
    return unwrapRunStateSnapshot(fromBackend);
  }

  async function hasRunState(runId) {
    if (localCache.has(runId)) return true;
    return backend.has(STORE_NAME, runId);
  }

  return { putRunState, getRunState, hasRunState };
}

const EFOrchRunStateSnapshot = { SCHEMA, SCHEMA_VERSION, wrapRunStateSnapshot, unwrapRunStateSnapshot, createDurableStateSnapshotStore };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchRunStateSnapshot;
}
if (typeof window !== "undefined") {
  window.EFOrchRunStateSnapshot = EFOrchRunStateSnapshot;
}
