"use strict";

const { createPersistenceError } = require("./persistence-errors.js");

// ResumePlanner — CDC MONO-03 section 6/7. Classifie CHAQUE nœud dans un
// seau (reuse/resume/replay/recompute/blocked) à partir de son état persisté
// et de sa politique déjà connue (resumePolicy/retryPolicy, fournie par
// MONO-02 à la création du run — jamais recalculée ni devinée ici). Aucun
// raisonnement métier.
//
// Ne recalcule JAMAIS l'éligibilité d'un nœud (QUAND appeler reste MONO-02) —
// resumeFromNode n'est qu'une INDICATION du premier nœud non-SUCCESS dans
// l'ordre du graphe, jamais une décision de dépendances.

const POLICIES = Object.freeze(["RESTART_STAGE", "RESUME_CHECKPOINT", "REPLAY_MISSING_ONLY", "RECOMPUTE_DETERMINISTIC", "EXPLICIT_REBUILD_REQUIRED", "NO_RETRY"]);

function classifyNode(nodeId, nodeRecord) {
  const state = nodeRecord.state;

  if (state === "SUCCESS") {
    return { bucket: "nodesToReuse", code: "SUCCESS_REUSED", note: `"${nodeId}" est SUCCESS — output réutilisé tel quel, jamais rejoué.` };
  }
  if (state === "NOT_STARTED") {
    return { bucket: "nodesNotStarted", code: "NOT_STARTED", note: `"${nodeId}" n'a jamais été exécuté.` };
  }
  if (state === "BLOCKED") {
    return { bucket: "nodesBlocked", code: "ALREADY_BLOCKED", note: `"${nodeId}" est déjà BLOCKED — préconditions à corriger avant toute reprise (MONO-02).` };
  }

  const policy = nodeRecord.retryPolicy;
  if (!POLICIES.includes(policy)) {
    throw createPersistenceError("RESUME_PLAN_INVALID", `computeResumePlan: retryPolicy "${policy}" inconnue pour le nœud "${nodeId}" (attendu l'une de ${POLICIES.join("|")}).`, { nodeId, policy });
  }

  switch (policy) {
    case "RESUME_CHECKPOINT":
      return { bucket: "nodesToResume", code: "RESUME_CHECKPOINT", note: `"${nodeId}" (${state}) -> reprise via son propre mécanisme natif (ex: EFOrchExecutionPort.resume() pour EF-ORCH-SUBSYSTEM) ; MONO-03 ne reconstruit jamais ses checkpoints internes.` };
    case "REPLAY_MISSING_ONLY":
      return { bucket: "nodesToResume", code: "REPLAY_MISSING_ONLY", note: `"${nodeId}" (${state}) -> rejouer uniquement les éléments manquants/invalides (ex: reviews EF-03B), jamais les éléments déjà valides.` };
    case "RESTART_STAGE":
      return { bucket: "nodesToReplay", code: "RESTART_STAGE", note: `"${nodeId}" (${state}) -> aucune reprise partielle possible, l'étape entière doit être rejouée.` };
    case "RECOMPUTE_DETERMINISTIC":
      return { bucket: "nodesToRecompute", code: "RECOMPUTE_DETERMINISTIC", note: `"${nodeId}" (${state}) -> recalcul déterministe autorisé UNIQUEMENT si les inputs ont changé ou si l'output est absent/invalide.` };
    case "EXPLICIT_REBUILD_REQUIRED":
      return { bucket: "nodesBlocked", code: "EXPLICIT_REBUILD_REQUIRED", note: `"${nodeId}" (${state}) -> reconstruction JAMAIS automatique ; une action explicite de l'opérateur est requise.` };
    case "NO_RETRY":
      return { bucket: "nodesBlocked", code: "NO_RETRY", note: `"${nodeId}" (${state}) -> aucune politique de nouvelle tentative définie ; la correction se fait en amont, jamais par une relance de ce nœud.` };
    default:
      throw createPersistenceError("RESUME_PLAN_INVALID", `computeResumePlan: politique non gérée pour "${nodeId}".`, { nodeId, policy });
  }
}

function computeResumePlan(runState, orderedNodeIds) {
  if (!runState || !runState.runId) {
    throw createPersistenceError("RESUME_PLAN_INVALID", "computeResumePlan: RunState invalide ou manquant.", {});
  }
  const order = Array.isArray(orderedNodeIds) && orderedNodeIds.length ? orderedNodeIds : Object.keys(runState.nodeStates).sort();

  const plan = {
    schema: "EvidenceForge.ResumePlan",
    schemaVersion: "MONO-03-v1",
    runId: runState.runId,
    resumeFromNode: null,
    nodesToReuse: [],
    nodesToResume: [],
    nodesToReplay: [],
    nodesToRecompute: [],
    nodesNotStarted: [],
    nodesBlocked: [],
    reasoningCodes: [],
  };

  for (const nodeId of order) {
    const nodeRecord = runState.nodeStates[nodeId];
    if (!nodeRecord) continue;
    const { bucket, code, note } = classifyNode(nodeId, nodeRecord);
    plan[bucket].push(nodeId);
    plan.reasoningCodes.push({ nodeId, code, policy: nodeRecord.retryPolicy || null, state: nodeRecord.state, note });
    if (plan.resumeFromNode === null && bucket !== "nodesToReuse") {
      plan.resumeFromNode = nodeId;
    }
  }

  if (runState.efOrchRunIdentity && plan.nodesToResume.includes("EF-ORCH-SUBSYSTEM")) {
    const entry = plan.reasoningCodes.find((r) => r.nodeId === "EF-ORCH-SUBSYSTEM");
    if (entry) entry.efOrchRunIdentity = runState.efOrchRunIdentity;
  }

  return plan;
}

module.exports = { computeResumePlan, POLICIES };
