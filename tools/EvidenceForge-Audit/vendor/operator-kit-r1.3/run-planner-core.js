"use strict";
// scripts/lib/run-planner-core.js — orchestre UNIQUEMENT l'appel a
// EF-01C1-v0.2-r1::acquirePlannerRun (lot r1, JAMAIS reimplemente ni
// modifie).

const path = require("path");

function requireEf01c1(ef01c1Root) {
  return require(path.join(ef01c1Root, "lib", "executor.js"));
}

/**
 * runPlannerCore(opts) :
 *   bundleRoot, ef01c1Root, mono04, missionContext, missionQuestion,
 *   runContractHash, resolvedDisciplines, resolverOutputHash,
 *   classification, evidenceRoot, env, declaredModel/declaredTransport
 *
 * Retourne EXACTEMENT ce que acquirePlannerRun() (EF-01C1-v0.2-r1) retourne.
 */
async function runPlannerCore(opts) {
  const { acquirePlannerRun } = requireEf01c1(opts.ef01c1Root);
  return acquirePlannerRun({
    bundleRoot: opts.bundleRoot,
    mono04: opts.mono04,
    missionContext: opts.missionContext,
    missionQuestion: opts.missionQuestion,
    runContractHash: opts.runContractHash,
    resolvedDisciplines: opts.resolvedDisciplines,
    resolverOutputHash: opts.resolverOutputHash,
    classification: opts.classification,
    evidenceRoot: opts.evidenceRoot,
    env: opts.env,
    declaredModel: opts.declaredModel,
    declaredTransport: opts.declaredTransport,
  });
}

module.exports = { runPlannerCore: runPlannerCore };
