"use strict";
// scripts/lib/build-searchprotocol-core.js
//
// Construit le SearchProtocol via buildSearchProtocolForMission() (R6,
// gelee, MONO-08/v0.6/lib/eforch-artifacts.js) — jamais une seconde
// construction parallele. Exige une validation humaine du plannerOutput
// DEJA approuvee (voir lib/validate-human-searchprotocol-validation.js) —
// n'est JAMAIS appelee ici si decision != "approved" (verifie par
// l'appelant, scripts/08b-build-searchprotocol.js).

const path = require("path");
const { assertRunContractConfirmed } = require("./assert-runcontract-confirmed.js");

/**
 * buildSearchProtocolCore(opts) :
 *   bundleRoot, missionId, runContract (confirme), plannerRun,
 *   plannerOutput, plannerProvenance ({inputHash, rawResponseHash}),
 *   validation (deja verifiee approved=true par l'appelant, avec
 *   plannerInputHash/plannerRawResponseHash/validatedAt/commentaire)
 *
 * Retourne le SearchProtocol complet (protocolHash inclus).
 */
async function buildSearchProtocolCore(opts) {
  const disciplinesRetenues = assertRunContractConfirmed(opts.runContract);
  const disciplineIds = disciplinesRetenues.map(function (d) { return d.discipline; });

  if (opts.plannerProvenance.inputHash !== opts.validation.plannerInputHash || opts.plannerProvenance.rawResponseHash !== opts.validation.plannerRawResponseHash) {
    throw new Error("buildSearchProtocolCore: la validation humaine reference un plannerRun different de l'evidence planner fournie — jamais reconcilie silencieusement.");
  }

  const humanValidation = { validatedAt: opts.validation.validatedAt, commentaire: opts.validation.commentaire };

  const eforchArtifacts = require(path.join(opts.bundleRoot, "MONO-08", "v0.6", "lib", "eforch-artifacts.js"));
  const deps = eforchArtifacts.loadEForchDeps(path.join(opts.bundleRoot, "MONO-01"));
  return eforchArtifacts.buildSearchProtocolForMission(
    deps, opts.missionId, opts.missionId + "-s1", disciplineIds,
    { mode: "REAL", plannerRun: opts.plannerRun, plannerOutput: opts.plannerOutput, humanValidation: humanValidation }
  );
}

module.exports = { buildSearchProtocolCore: buildSearchProtocolCore };
