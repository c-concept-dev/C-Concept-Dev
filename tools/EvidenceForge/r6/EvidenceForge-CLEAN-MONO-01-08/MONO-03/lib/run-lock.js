"use strict";

const { createPersistenceError } = require("./persistence-errors.js");

// RunLock — CDC MONO-03 section 18. Empêche deux orchestrateurs d'exécuter
// simultanément le même run. Verrou persisté dans le backend injecté —
// jamais en mémoire seule, pour être visible entre deux instances.
//
// LIMITE CONNUE, documentée honnêtement : ce module n'implémente pas une
// primitive "compare-and-swap" atomique au niveau du backend (le contrat
// PersistenceBackend ne l'exige pas). Le couple get()+put() ci-dessous
// comporte donc une fenêtre de compétition théorique sur un backend
// réellement distribué et concurrent. Dans cet environnement (Node
// mono-thread, tests séquentiels), cette fenêtre n'est jamais observable ;
// une implémentation de production sur un backend distribué devrait
// s'appuyer sur une primitive atomique de ce backend — hors périmètre de ce
// module.
const NAMESPACE = "locks";

function nowIso() {
  return new Date().toISOString();
}

function createRunLock(backend) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function") {
    throw new Error("createRunLock: backend invalide (attendu {get, put, has, delete, keys}) — jamais construit implicitement.");
  }

  async function acquireRunLock(runId, ownerId) {
    const existing = await backend.get(NAMESPACE, runId).catch(() => undefined);
    if (existing) {
      throw createPersistenceError("RUN_LOCKED", `acquireRunLock: le run "${runId}" est déjà verrouillé par "${existing.ownerId}" depuis ${existing.acquiredAt}.`, { runId, ownerId: existing.ownerId, acquiredAt: existing.acquiredAt });
    }
    const record = { runId, ownerId: ownerId || "unknown", acquiredAt: nowIso() };
    await backend.put(NAMESPACE, runId, record);
    const verify = await backend.get(NAMESPACE, runId);
    if (!verify || verify.ownerId !== record.ownerId || verify.acquiredAt !== record.acquiredAt) {
      throw createPersistenceError("RUN_LOCKED", `acquireRunLock: conflit détecté à l'acquisition du verrou pour "${runId}" (fenêtre de compétition, voir limite connue documentée).`, { runId });
    }
    return record;
  }

  async function releaseRunLock(runId, ownerId) {
    const existing = await backend.get(NAMESPACE, runId).catch(() => undefined);
    if (!existing) return true;
    if (existing.ownerId !== ownerId) {
      throw createPersistenceError("RUN_LOCKED", `releaseRunLock: "${runId}" est verrouillé par "${existing.ownerId}", pas par "${ownerId}" — jamais une libération par un tiers.`, { runId, actualOwner: existing.ownerId, attemptedBy: ownerId });
    }
    await backend.delete(NAMESPACE, runId);
    return true;
  }

  async function isLocked(runId) {
    const existing = await backend.get(NAMESPACE, runId).catch(() => undefined);
    return !!existing;
  }

  return { acquireRunLock, releaseRunLock, isLocked };
}

module.exports = { createRunLock };
