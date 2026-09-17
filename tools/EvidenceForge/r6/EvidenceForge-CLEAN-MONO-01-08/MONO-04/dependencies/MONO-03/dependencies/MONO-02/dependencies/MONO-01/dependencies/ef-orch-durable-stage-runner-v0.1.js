// EvidenceForge — EF-ORCH-04C — Verrou transversal état/checkpoint — v0.1
//
// N'ouvre AUCUN fichier gelé : réutilise executeStage() TEL QUEL.
//
// Invariant central, généralisé à tout le contrat EF-ORCH :
//   un RunStateSnapshot durable ne doit JAMAIS être écrit s'il présuppose un
//   checkpoint durable qui n'existe pas encore, qui est corrompu, ou dont
//   l'identité complète (stageId + protocolHash + outputHash) ne correspond
//   plus exactement à ce que le CheckpointIdentityRecord a enregistré au
//   moment où ce checkpoint a été réellement établi.
//
// Découverte structurelle : state.checkpoints ({stageId, index, outputHash,
// note, completedAt}, gelé) ne contient JAMAIS protocolHash. Reconstruire
// l'identité complète du dernier checkpoint réel à partir du seul state est
// donc impossible sans un enregistrement séparé, écrit au moment exact où
// ce checkpoint a été établi/retrouvé — jamais reconstruit après coup à
// partir du protocolHash de l'appel COURANT (qui peut concerner un tout
// autre stage).
"use strict";

const { executeStage } = require("./ef-orch-execute-stage-v0.1.js");
const { currentStageId } = require("./ef-orch-state-machine-v0.1.js");

// ---------------------------------------------------------------------------
// assertCheckpointDurablyVerified(runOutputStore, identity)
// ---------------------------------------------------------------------------
async function assertCheckpointDurablyVerified(runOutputStore, identity) {
  const verify = await runOutputStore.verifySuccessfulOutput(identity);
  if (verify.reason === "checkpoint_absent") {
    throw new Error(
      "assertCheckpointDurablyVerified: aucun checkpoint durable pour stageId=\"" + identity.stageId +
      "\" (runId=\"" + identity.runId + "\") — snapshot d'état refusé, jamais en avance sur son checkpoint."
    );
  }
  if (!verify.valid) {
    throw new Error(
      "assertCheckpointDurablyVerified: checkpoint durable CORROMPU pour stageId=\"" + identity.stageId +
      "\" (storedHash=" + verify.storedHash + ", computedHash=" + verify.computedHash + ") — snapshot d'état refusé."
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// lastRealCheckpointEntry(state) — le checkpoint RÉEL le plus récent
// (outputHash non nul), en remontant au-delà d'éventuelles entrées
// checkpointPolicy:"none" en fin de chaîne.
// ---------------------------------------------------------------------------
function lastRealCheckpointEntry(state) {
  if (!state || !Array.isArray(state.checkpoints)) return null;
  for (let i = state.checkpoints.length - 1; i >= 0; i--) {
    const entry = state.checkpoints[i];
    if (entry && entry.outputHash !== null) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// assertRunStateCheckpointsConsistent({ runOutputStore, checkpointIdentityStore, state })
// runContractHash n'est plus un paramètre séparé : il est dérivé de
// state.runContractHash (deuxième source de vérité inutile, éliminée).
// protocolHash n'est JAMAIS reçu de l'appelant courant ici — retrouvé
// exclusivement via le CheckpointIdentityRecord enregistré au moment où CE
// checkpoint a été établi.
// ---------------------------------------------------------------------------
async function assertRunStateCheckpointsConsistent({ runOutputStore, checkpointIdentityStore, state }) {
  const last = lastRealCheckpointEntry(state);
  if (!last) return true; // aucun checkpoint réel dans toute la chaîne — rien à présupposer

  const record = await checkpointIdentityStore.getCheckpointIdentity({ runId: state.runId, stageId: last.stageId });
  if (!record) {
    throw new Error(
      "assertRunStateCheckpointsConsistent: aucun CheckpointIdentityRecord pour stageId=\"" + last.stageId +
      "\" (runId=\"" + state.runId + "\") — impossible de retrouver le protocolHash réel de ce checkpoint, snapshot refusé."
    );
  }
  if (record.runContractHash !== state.runContractHash) {
    throw new Error(
      "assertRunStateCheckpointsConsistent: CheckpointIdentityRecord pour stageId=\"" + last.stageId +
      "\" porte runContractHash=\"" + record.runContractHash + "\", incohérent avec state.runContractHash=\"" + state.runContractHash + "\"."
    );
  }
  if (record.outputHash !== last.outputHash) {
    throw new Error(
      "assertRunStateCheckpointsConsistent: state.checkpoints affirme outputHash=\"" + last.outputHash +
      "\" pour stageId=\"" + last.stageId + "\", mais le CheckpointIdentityRecord durable porte outputHash=\"" + record.outputHash +
      "\" — incohérence entre l'état et son enregistrement d'identité, snapshot refusé."
    );
  }

  const identity = { runId: state.runId, runContractHash: state.runContractHash, stageId: last.stageId, protocolHash: record.protocolHash };
  await assertCheckpointDurablyVerified(runOutputStore, identity);
  return true;
}

// ---------------------------------------------------------------------------
// putRunStateAfterVerifiedCheckpoint({ stateSnapshotStore, runOutputStore, checkpointIdentityStore, state })
// ---------------------------------------------------------------------------
async function putRunStateAfterVerifiedCheckpoint({ stateSnapshotStore, runOutputStore, checkpointIdentityStore, state }) {
  await assertRunStateCheckpointsConsistent({ runOutputStore, checkpointIdentityStore, state });
  return stateSnapshotStore.putRunState(state);
}

// ---------------------------------------------------------------------------
// runAndPersistStage(...) — compose executeStage() (gelé) + enregistrement
// de l'identité complète du checkpoint qui vient d'être établi/retrouvé
// POUR CE STAGE PRÉCIS (on la connaît avec certitude à cet instant précis,
// puisque c'est exactement l'appel qui vient de la produire ou de la
// retrouver) + le garde-fou généralisé avant tout snapshot.
// ---------------------------------------------------------------------------
async function runAndPersistStage({ state, registry, runOutputStore, stateSnapshotStore, checkpointIdentityStore, executor, input, runContractHash, protocolHash, auditDecisions, validateOutput }) {
  const stageIdBeforeCall = currentStageId(state);
  const result = await executeStage({ state, registry, store: runOutputStore, executor, input, runContractHash, protocolHash, auditDecisions, validateOutput });

  if (result.kind === "advanced" || result.kind === "checkpoint_reused") {
    const justProcessedEntry = (result.state.checkpoints || []).find((c) => c.stageId === stageIdBeforeCall);
    if (justProcessedEntry && justProcessedEntry.outputHash !== null) {
      // Identité connue avec certitude ICI — jamais reconstruite plus tard.
      await checkpointIdentityStore.putCheckpointIdentity({
        runId: state.runId, runContractHash, stageId: stageIdBeforeCall,
        protocolHash: protocolHash != null ? protocolHash : null, outputHash: justProcessedEntry.outputHash
      });
    }
  }

  await putRunStateAfterVerifiedCheckpoint({ stateSnapshotStore, runOutputStore, checkpointIdentityStore, state: result.state });
  return result;
}

const EFOrchDurableStageRunner = {
  assertCheckpointDurablyVerified, assertRunStateCheckpointsConsistent, lastRealCheckpointEntry,
  putRunStateAfterVerifiedCheckpoint, runAndPersistStage
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchDurableStageRunner;
}
if (typeof window !== "undefined") {
  window.EFOrchDurableStageRunner = EFOrchDurableStageRunner;
}
