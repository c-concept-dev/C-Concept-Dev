// EvidenceForge — EF-ORCH-03F — Exécuteur EF-01C1 — v0.1
// Vérifie un SearchProtocol DÉJÀ FIGÉ (produit par la planification LLM +
// édition/validation humaine, en dehors de ce stage orchestré) et l'attache
// à la sortie EF-01B confirmée. Ne reconstruit JAMAIS le protocole : le
// RunContract donne une stratégie macro, le SearchProtocol est l'artefact
// méthodologique opérationnel autonome qui la précise — les deux peuvent
// légitimement diverger en détail (RunContract "PubMed attendu" + protocole
// "PubMed + requêtes exactes + policy" est normal), mais jamais sur les
// points que le RunContract exprime réellement de façon structurée
// (disciplines retenues) : pas d'inférence au-delà de ce que le RunContract
// sait exprimer aujourd'hui.
"use strict";

const { validateEF01BOutput } = require("./ef-orch-ef01-output-contracts-v0.1.js");
const { assertSearchProtocolFrozenAndValid } = require("./ef-orch-ef01c1-planner-trace-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

function sameSet(a, b) {
  const sa = [...new Set(a.map(str))].sort();
  const sb = [...new Set(b.map(str))].sort();
  return JSON.stringify(sa) === JSON.stringify(sb);
}

// ---------------------------------------------------------------------------
// buildEF01C1OutputFromFrozenProtocol(ef01bOutput, runContract, searchProtocol)
// ---------------------------------------------------------------------------
async function buildEF01C1OutputFromFrozenProtocol(ef01bOutput, runContract, searchProtocol) {
  if (!validateEF01BOutput(ef01bOutput)) {
    throw new Error("buildEF01C1OutputFromFrozenProtocol: ef01bOutput fourni n'est pas une sortie EF-01B valide.");
  }
  if (!runContract || !str(runContract.runContractHash)) {
    throw new Error("buildEF01C1OutputFromFrozenProtocol: RunContract manquant ou non confirmé.");
  }

  // Intégrité intrinsèque du protocole — jamais reconstruit, seulement vérifié.
  await assertSearchProtocolFrozenAndValid(searchProtocol);

  // Cohérence avec le RunContract, limitée à ce qu'il exprime RÉELLEMENT :
  // les disciplines finalement retenues (structuré, testé, gelé) — pas la
  // fenêtre temporelle/langues/types de documents, que le RunContract ne
  // porte pas correctement aujourd'hui (limitation déjà documentée pour
  // EF-01A), et pas d'interdiction de connecteur, qu'aucun champ du
  // RunContract n'exprime actuellement. Pas d'inférence au-delà du schéma réel.
  const runContractRetenues = (runContract.disciplinesProposees || [])
    .filter((d) => d.statut === "retenue")
    .map((d) => d.discipline);
  const protocolRetenues = Array.isArray(searchProtocol.disciplinesRetenues) ? searchProtocol.disciplinesRetenues : [];
  if (!sameSet(runContractRetenues, protocolRetenues)) {
    throw new Error(
      "buildEF01C1OutputFromFrozenProtocol: incohérence de disciplines — RunContract retient [" + runContractRetenues.join(", ") +
      "], SearchProtocol porte [" + protocolRetenues.join(", ") + "]. Aucune discipline ne doit être ajoutée ou retirée silencieusement entre le RunContract confirmé et le protocole figé."
    );
  }

  // Cohérence d'identité mission, quand le protocole la porte (toujours le
  // cas dans le format réel : missionId est un champ obligatoire de baseProtocol()).
  if (str(searchProtocol.missionId) && str(ef01bOutput.id) && str(searchProtocol.missionId) !== str(ef01bOutput.id)) {
    throw new Error(
      "buildEF01C1OutputFromFrozenProtocol: le SearchProtocol référence une autre mission (missionId=" + str(searchProtocol.missionId) +
      ") que la sortie EF-01B fournie (id=" + str(ef01bOutput.id) + ")."
    );
  }

  return {
    ...ef01bOutput,
    stage: "EF-01C1",
    stageVersion: "EF-01C1-v1",
    searchProtocol: { ...searchProtocol } // copie défensive, jamais la référence de l'appelant
  };
}

// ---------------------------------------------------------------------------
// createEF01C1Executor(runContract, searchProtocol) -> executor(input)
// `input` attendu = sortie EF-01B (dépendance amont, inputFrom:["EF-01B"]).
// `runContract` et `searchProtocol` (déjà figé ailleurs, hors de ce stage)
// sont fournis à la construction — aucun réseau, aucune reconstruction ici.
// ---------------------------------------------------------------------------
function createEF01C1Executor(runContract, searchProtocol) {
  return async function ef01c1Executor(input) {
    const output = await buildEF01C1OutputFromFrozenProtocol(input, runContract, searchProtocol);
    return { status: "ok", output };
  };
}

const EFOrchEF01C1Executor = { buildEF01C1OutputFromFrozenProtocol, createEF01C1Executor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01C1Executor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01C1Executor = EFOrchEF01C1Executor;
}
