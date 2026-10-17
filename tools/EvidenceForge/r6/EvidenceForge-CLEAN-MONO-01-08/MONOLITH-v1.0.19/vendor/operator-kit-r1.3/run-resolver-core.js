"use strict";
// scripts/lib/run-resolver-core.js — orchestre UNIQUEMENT l'appel a
// EF-01B-v0.2-r1::acquireResolverRun (lot r1, JAMAIS reimplemente ni
// modifie). Fonction pure/testable, separee du CLI (04-run-resolver.js)
// pour permettre l'injection d'un mono04 LOCAL_CONTROLLED en test — la
// CLI reelle, elle, construit toujours un mono04 REEL (voir
// 04-run-resolver.js::main).

const path = require("path");

function requireEf01b(ef01bRoot) {
  return require(path.join(ef01bRoot, "lib", "executor.js"));
}

/**
 * runResolverCore(opts) :
 *   bundleRoot, ef01bRoot, mono04, missionContext, missionQuestion,
 *   targetDocuments, suppliedEvidence, technicalProposalLimit,
 *   classification, evidenceRoot, env (optionnel), declaredModel/
 *   declaredTransport (optionnels)
 *
 * Retourne EXACTEMENT ce que acquireResolverRun() (EF-01B-v0.2-r1) retourne
 * — aucune transformation, aucun champ ajoute ou retire.
 */
async function runResolverCore(opts) {
  const { acquireResolverRun } = requireEf01b(opts.ef01bRoot);
  return acquireResolverRun({
    bundleRoot: opts.bundleRoot,
    mono04: opts.mono04,
    missionContext: opts.missionContext,
    missionQuestion: opts.missionQuestion,
    targetDocuments: opts.targetDocuments || [],
    suppliedEvidence: opts.suppliedEvidence || [],
    technicalProposalLimit: opts.technicalProposalLimit,
    classification: opts.classification,
    evidenceRoot: opts.evidenceRoot,
    env: opts.env,
    declaredModel: opts.declaredModel,
    declaredTransport: opts.declaredTransport,
  });
}

module.exports = { runResolverCore: runResolverCore };
