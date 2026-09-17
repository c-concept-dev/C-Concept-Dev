// EvidenceForge — EF-ORCH-03B — executeStage — v0.1
// Intégration State Machine <-> Stage Adapter <-> RunOutputStore, sans
// modifier aucun des trois modules déjà gelés et sans brancher de vrai
// module EF-01 — les exécuteurs restent injectés (context/mock).
//
// Ordre transactionnel imposé (jamais d'exception à cet ordre) :
//   executor -> validateOutput (dans runStage) -> putSuccessfulOutput
//   -> verifySuccessfulOutput -> transition d'état (advanceStage)
// Un stage n'est JAMAIS marqué avancé si la persistance de son checkpoint a
// échoué ou n'a pas pu être revérifiée immédiatement après écriture.
"use strict";

const { runStage } = require("./ef-orch-stage-adapter-v0.1.js");
const { advanceStage, pauseRun, failRun, currentStageId } = require("./ef-orch-state-machine-v0.1.js");

// ---------------------------------------------------------------------------
// executeStage({ state, registry, store, executor, input, runContractHash,
//                protocolHash, auditDecisions, validateOutput })
// -> { kind, state: <nouvel état, jamais muté>, output?, envelope?, verify? }
//
// kind possibles :
//   "checkpoint_reused"          — resume_checkpoint, checkpoint valide trouvé, executor jamais appelé
//   "checkpoint_corrupted"       — resume_checkpoint, checkpoint trouvé mais invalide -> failRun, jamais de replay silencieux
//   "gate_required"              — runStage a renvoyé gate_required -> pauseRun
//   "failed"                     — runStage a renvoyé failed -> failRun
//   "persist_conflict"           — putSuccessfulOutput a rejeté (conflit) -> failRun
//   "persist_verification_failed"— verifySuccessfulOutput après put a échoué -> failRun (défensif)
//   "advanced"                   — succès complet -> advanceStage
// ---------------------------------------------------------------------------
async function executeStage({ state, registry, store, executor, input, runContractHash, protocolHash, auditDecisions, validateOutput }) {
  if (!state) throw new Error("executeStage: state manquant.");
  if (state.runContractHash !== runContractHash) {
    throw new Error("executeStage: runContractHash fourni (" + runContractHash + ") incohérent avec celui de l'état du run (" + state.runContractHash + ").");
  }
  if (state.status !== "running") {
    throw new Error("executeStage: le run doit être \"running\" pour exécuter un stage (état actuel : " + state.status + ").");
  }
  const stageId = currentStageId(state);
  if (!stageId) throw new Error("executeStage: aucun stage courant pour ce run.");

  const adapter = registry.getStageAdapter(stageId); // lève si stage non classifié — jamais d'exécution silencieuse
  const identity = { runId: state.runId, runContractHash, stageId, protocolHash: protocolHash != null ? protocolHash : null };

  // -------------------------------------------------------------------------
  // resume_checkpoint : le seul cas où, dans notre State Machine, un stage
  // peut être réentré est quand CE MÊME stage a été mis en pause puis repris
  // (resumeRun ne change jamais currentStageIndex). Un stage déjà dépassé
  // n'est jamais réexécuté par construction : advanceStage ne revient jamais
  // en arrière. Donc vérifier le store ici suffit à garantir qu'aucun stage
  // externe non déterministe n'est rejoué silencieusement.
  // -------------------------------------------------------------------------
  if (adapter.resumePolicy === "resume_checkpoint") {
    const exists = await store.hasSuccessfulOutput(identity);
    if (exists) {
      const verify = await store.verifySuccessfulOutput(identity);
      if (verify.valid) {
        const cached = await store.getSuccessfulOutput(identity);
        return {
          kind: "checkpoint_reused",
          state: advanceStage(state, { stageId, outputHash: cached.outputHash, note: "reused_from_checkpoint" }),
          output: cached.output
        };
      }
      // Checkpoint présent mais corrompu : jamais de replay silencieux d'un
      // stage read_only_external non déterministe. Décision explicite requise
      // en dehors de cette brique (opérateur / mode Expert), jamais ici.
      return {
        kind: "checkpoint_corrupted",
        state: failRun(state, { message: "Checkpoint corrompu pour \"" + stageId + "\" — reprise refusée sans décision explicite (storedHash=" + verify.storedHash + ", computedHash=" + verify.computedHash + ")." }),
        verify
      };
    }
    // Aucun checkpoint : première exécution réelle de ce stage pour ce run,
    // on continue normalement ci-dessous.
  }

  const envelope = await runStage({ stageId, input, runContractHash, protocolHash, context: { registry, executor, auditDecisions, validateOutput } });

  if (envelope.status === "gate_required") {
    return {
      kind: "gate_required",
      state: pauseRun(state, { gateId: envelope.gateFingerprint, reason: envelope.reason }),
      envelope
    };
  }

  if (envelope.status === "failed") {
    return { kind: "failed", state: failRun(state, { message: envelope.error.message }), envelope };
  }

  // envelope.status === "ok" à ce stade
  if (adapter.checkpointPolicy === "none") {
    // Rien à persister ni à revérifier — l'ordre transactionnel ne s'applique
    // qu'aux stages qui figent effectivement leur sortie.
    return { kind: "advanced", state: advanceStage(state, { stageId }), output: envelope.output };
  }

  // checkpointPolicy === "freeze_successful_output" : ordre transactionnel
  // strict, jamais d'avancement avant persistance ET revérification.
  let putResult;
  try {
    putResult = await store.putSuccessfulOutput({ ...identity, output: envelope.output });
  } catch (e) {
    // Conflit (ou toute autre erreur du store) : le run échoue explicitement,
    // il n'avance jamais sur une sortie qui n'a pas pu être figée proprement.
    // Un conflit sur un stage classé "pure"/deterministic:true est en outre
    // le signal d'un bug de non-déterminisme caché à investiguer.
    return { kind: "persist_conflict", state: failRun(state, { message: e.message }) };
  }

  const verify2 = await store.verifySuccessfulOutput(identity);
  if (!verify2.valid) {
    return {
      kind: "persist_verification_failed",
      state: failRun(state, { message: "Vérification immédiate après persistance du checkpoint a échoué pour \"" + stageId + "\"." })
    };
  }

  return { kind: "advanced", state: advanceStage(state, { stageId, outputHash: putResult.outputHash }), output: envelope.output };
}

const EFOrchExecuteStage = { executeStage };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchExecuteStage;
}
if (typeof window !== "undefined") {
  window.EFOrchExecuteStage = EFOrchExecuteStage;
}
