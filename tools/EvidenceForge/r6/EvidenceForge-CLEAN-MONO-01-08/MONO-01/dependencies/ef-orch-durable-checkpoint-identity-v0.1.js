// EvidenceForge — EF-ORCH-04C — CheckpointIdentityRecord durable — v0.1
//
// Découverte factuelle qui motive cette brique : ni la State Machine gelée
// (state.checkpoints = {stageId, index, outputHash, note, completedAt},
// jamais protocolHash), ni executeStage() (protocolHash reçu comme simple
// paramètre d'appel, jamais conservé), ni StageInputResolver (protocolHash
// déclaré STATIQUEMENT par l'appelant dans la définition du pipeline) ne
// persistent l'identité complète {stageId, protocolHash, outputHash} d'un
// checkpoint quelque part où on pourrait la retrouver plus tard à partir du
// seul state.checkpoints. Ce n'est pas une réouverture de la State Machine —
// c'est une extension de la couche de persistance, exactement analogue à
// RunStateSnapshot : un pointeur, jamais un artefact de preuve en soi (sa
// véracité vient du RunOutputStore associé, vérifié séparément).
//
// Enregistré au moment EXACT où un checkpoint réel est établi/retrouvé pour
// un stage — jamais reconstruit après coup à partir du stage courant.
"use strict";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

const STORE_NAME = "checkpointIdentities";

function recordKey(runId, stageId) {
  return str(runId) + "::" + str(stageId);
}

function publicView(record) {
  return { runId: record.runId, runContractHash: record.runContractHash, stageId: record.stageId, protocolHash: record.protocolHash, outputHash: record.outputHash, recordedAt: record.recordedAt };
}

// ---------------------------------------------------------------------------
// verifyPersistedCheckpointIdentity(key, record) — frontière de vérification
// unique, appelée AVANT toute utilisation d'un record lu depuis le backend
// (lecture froide ET détection d'idempotence/conflit dans putCheckpointIdentity).
// Jamais une désérialisation aveugle : un record structurellement incohérent
// ou rangé sous la mauvaise clé physique doit produire une corruption
// explicite, jamais une idempotence, un conflit "normal", ou un cache
// silencieux.
// ---------------------------------------------------------------------------
function verifyPersistedCheckpointIdentity(key, record) {
  if (!record || !str(record.runId) || !str(record.stageId) || !str(record.runContractHash) || !str(record.outputHash)) {
    return { valid: false, reason: "champs obligatoires manquants ou vides (runId/stageId/runContractHash/outputHash)" };
  }
  const recomputedKey = recordKey(record.runId, record.stageId);
  if (recomputedKey !== key) {
    return { valid: false, reason: "identité recalculée (\"" + recomputedKey + "\") ne correspond pas à la clé de stockage (\"" + key + "\")" };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// createDurableCheckpointIdentityStore({ backend }) — cache strictement
// interne, même discipline que les autres stores durables 04A/04C.
// ---------------------------------------------------------------------------
function createDurableCheckpointIdentityStore({ backend }) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function") {
    throw new Error("createDurableCheckpointIdentityStore: backend invalide (attendu {get, put, has}).");
  }
  const localCache = new Map();

  async function putCheckpointIdentity({ runId, runContractHash, stageId, protocolHash, outputHash }) {
    if (!str(runId) || !str(runContractHash) || !str(stageId) || !str(outputHash)) {
      throw new Error("putCheckpointIdentity: runId/runContractHash/stageId/outputHash requis et non vides.");
    }
    const key = recordKey(runId, stageId);
    const normalizedProtocolHash = protocolHash != null ? str(protocolHash) : null;

    let existing = localCache.get(key);
    if (!existing) {
      const fromBackend = await backend.get(STORE_NAME, key);
      if (fromBackend) {
        const check = verifyPersistedCheckpointIdentity(key, fromBackend);
        if (!check.valid) {
          throw new Error("putCheckpointIdentity: record existant CORROMPU pour \"" + key + "\" (" + check.reason + ") — jamais réparé ni remplacé silencieusement, décision explicite requise.");
        }
        existing = fromBackend;
      }
    }
    if (existing) {
      const sameRecord = existing.runContractHash === str(runContractHash) && existing.protocolHash === normalizedProtocolHash && existing.outputHash === str(outputHash);
      if (sameRecord) {
        localCache.set(key, clone(existing));
        return publicView(existing); // idempotent
      }
      throw new Error(
        "putCheckpointIdentity: conflit pour runId=\"" + runId + "\" stageId=\"" + stageId +
        "\" — un enregistrement différent existe déjà (protocolHash=" + existing.protocolHash + ", outputHash=" + existing.outputHash +
        "), nouveau (protocolHash=" + normalizedProtocolHash + ", outputHash=" + outputHash + "). Jamais d'écrasement silencieux."
      );
    }

    const record = { runId: str(runId), runContractHash: str(runContractHash), stageId: str(stageId), protocolHash: normalizedProtocolHash, outputHash: str(outputHash), recordedAt: new Date().toISOString() };
    await backend.put(STORE_NAME, key, record); // durable D'ABORD
    localCache.set(key, clone(record));
    return publicView(record);
  }

  async function getCheckpointIdentity({ runId, stageId }) {
    const key = recordKey(runId, stageId);
    const cached = localCache.get(key);
    if (cached) return publicView(cached);
    const fromBackend = await backend.get(STORE_NAME, key);
    if (!fromBackend) return null;
    const check = verifyPersistedCheckpointIdentity(key, fromBackend);
    if (!check.valid) {
      throw new Error("getCheckpointIdentity: record CORROMPU pour \"" + key + "\" (" + check.reason + ") — jamais retourné comme fiable.");
    }
    localCache.set(key, clone(fromBackend));
    return publicView(fromBackend);
  }

  return { putCheckpointIdentity, getCheckpointIdentity };
}

const EFOrchDurableCheckpointIdentity = { createDurableCheckpointIdentityStore, verifyPersistedCheckpointIdentity, recordKey };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchDurableCheckpointIdentity;
}
if (typeof window !== "undefined") {
  window.EFOrchDurableCheckpointIdentity = EFOrchDurableCheckpointIdentity;
}
