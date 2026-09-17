"use strict";

const { computeResumePlan } = require("./resume-planner.js");

// PersistenceCoordinator — CDC MONO-03 sections 6, 16, 17. Couche de
// convenance au-dessus de RunStore + ResumePlanner : ne stocke rien de
// nouveau elle-même (aucun namespace propre), ne fait qu'appliquer deux
// règles explicites du CDC :
//   - section 17 (lignée) : un PASS de lignée n'est jamais réinterprété
//     comme valide après reprise si un artefact amont a été remplacé ;
//   - section 16 (registre d'exclusion) : un ancien run conserve son
//     snapshot, jamais muté par un run plus récent — déjà garanti
//     structurellement par ArtifactStore (artifactId inclut runId), cette
//     section documente seulement pourquoi aucun code supplémentaire n'est
//     nécessaire (voir README/rapport).
function createPersistenceCoordinator(runStore) {
  async function recordLineagePass(runId, lineageResult, basedOnArtifactRefs) {
    return runStore.setLineageStatus(runId, {
      status: "PASS",
      reviewSchemaHash: lineageResult && lineageResult.reviewSchemaHash,
      lineageAssurance: lineageResult && lineageResult.lineageAssurance,
      basedOnArtifactRefs: { ...basedOnArtifactRefs },
      computedAt: new Date().toISOString(),
    });
  }

  async function recordLineageFail(runId, reason) {
    return runStore.setLineageStatus(runId, { status: "FAIL", reason: reason || null, computedAt: new Date().toISOString() });
  }

  // isLineageStillValid(runId) -> true SEULEMENT si un PASS est enregistré
  // ET que chacun des artefacts amont qu'il référence est EXACTEMENT celui
  // encore présent dans runState.artifactRefs (même artifactId). Le moindre
  // remplacement d'un artefact amont invalide silencieusement toute
  // confiance dans l'ancien PASS — jamais une autorisation automatique
  // reconduite (section 17).
  async function isLineageStillValid(runId) {
    const state = await runStore.loadRun(runId);
    const lineage = state.lineageStatus;
    if (!lineage || lineage.status !== "PASS") return false;
    const based = lineage.basedOnArtifactRefs || {};
    for (const [nodeId, artifactId] of Object.entries(based)) {
      if (state.artifactRefs[nodeId] !== artifactId) {
        return false;
      }
    }
    return true;
  }

  async function getResumePlan(runId, orderedNodeIds) {
    const state = await runStore.loadRun(runId);
    return computeResumePlan(state, orderedNodeIds);
  }

  return { recordLineagePass, recordLineageFail, isLineageStillValid, getResumePlan };
}

module.exports = { createPersistenceCoordinator };
