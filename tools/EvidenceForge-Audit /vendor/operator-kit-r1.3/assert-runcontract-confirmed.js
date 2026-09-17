"use strict";
// scripts/lib/assert-runcontract-confirmed.js
//
// Garde-fou explicite, extrait pour etre teste isolement (F-02 cote
// planner : le planner ne doit JAMAIS s'executer avant confirmation
// reelle du RunContract). Le lot r1 lui-meme (EF-01C1-v0.2-r1::
// acquirePlannerRun) exige deja runContractHash comme parametre requis —
// ce garde-fou est une seconde couche, cote kit, jamais une duplication
// de la logique du lot (aucun hash, aucun prompt, seulement une
// verification de presence de champ).

function assertRunContractConfirmed(runContract) {
  if (!runContract || typeof runContract.runContractHash !== "string" || !runContract.runContractHash.trim()) {
    throw new Error("assertRunContractConfirmed: RunContract non confirme (runContractHash absent) — le planner ne peut jamais s'executer avant confirmation reelle du RunContract (F-02).");
  }
  const retenues = (runContract.disciplinesProposees || []).filter(function (d) { return d.statut === "retenue"; });
  if (retenues.length === 0) {
    throw new Error("assertRunContractConfirmed: aucune discipline retenue dans le RunContract confirme.");
  }
  return retenues;
}

module.exports = { assertRunContractConfirmed: assertRunContractConfirmed };
