// EvidenceForge — EF-ORCH-03E — Exécuteur EF-01B — v0.1
// Matérialise la sortie EF-01B à partir du RunContract confirmé + une
// EF01BResolverTrace figée. N'appelle JAMAIS le Worker/Anthropic pendant
// l'exécution — la résolution LLM appartient à la pré-analyse antérieure à
// la confirmation du RunContract (décision architecturale actée).
//
// Garantie de conception, pas seulement de vérification : les disciplines et
// leur statut proviennent EXCLUSIVEMENT du RunContract (jamais de la trace),
// donc aucune réconciliation n'est jamais nécessaire — il n'existe
// structurellement rien à réconcilier. La trace ne fournit que la preuve
// d'audit de l'appel LLM qui a produit ces disciplines, jamais les
// disciplines elles-mêmes une seconde fois.
"use strict";

const { validateEF01AOutput } = require("./ef-orch-ef01-output-contracts-v0.1.js");
const { assertResolverTraceConsistent } = require("./ef-orch-ef01b-resolver-trace-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

// Décision de mapping, documentée : le vocabulaire de statut du RunContract
// ("retenue" / "conflit" / "rejetee_justification_vide" / "rejetee_doublon_saisie")
// est plus riche que celui du vrai schéma EF-01B ("proposee" / "retenue" /
// "rejetee"). Au moment où le RunContract est confirmé, toute ambiguïté a
// déjà reçu une résolution humaine (cf. confirmRunContract) ; ce qui n'a pas
// été explicitement retenu est donc considéré rejeté — jamais laissé
// "proposee", ce que le vrai EF-01B interdit à l'export.
function mapStatutToEF01B(runContractStatut) {
  return runContractStatut === "retenue" ? "retenue" : "rejetee";
}

// ---------------------------------------------------------------------------
// buildEF01BOutputFromRunContract(ef01aOutput, runContract, trace)
// ef01aOutput : sortie EF-01A déjà validée (dépendance amont, cf. pipeline).
// ---------------------------------------------------------------------------
function buildEF01BOutputFromRunContract(ef01aOutput, runContract, trace) {
  if (!validateEF01AOutput(ef01aOutput)) {
    throw new Error("buildEF01BOutputFromRunContract: ef01aOutput fourni n'est pas un EvidenceForge.MissionDraft valide.");
  }
  if (!runContract || !str(runContract.runContractHash)) {
    throw new Error("buildEF01BOutputFromRunContract: RunContract manquant ou non confirmé.");
  }
  assertResolverTraceConsistent(trace, runContract); // lève explicitement en cas d'incohérence — jamais de réconciliation silencieuse

  const rcDisciplines = Array.isArray(runContract.disciplinesProposees) ? runContract.disciplinesProposees : [];
  if (rcDisciplines.length === 0) {
    throw new Error("buildEF01BOutputFromRunContract: RunContract.disciplinesProposees est vide — rien à matérialiser pour EF-01B.");
  }

  const disciplinesProposees = rcDisciplines.map((d) => ({
    id: str(d.id),
    discipline: str(d.discipline),
    justification: str(d.justification),
    sourcesIndicatives: Array.isArray(d.sourcesIndicatives) ? [...d.sourcesIndicatives] : [],
    // Le RunContract ne modélise aujourd'hui que les disciplines issues de la
    // pré-analyse LLM — aucun canal d'ajout manuel humain n'existe encore
    // dans son schéma d'entrée. origine:"ia" est donc systématique ici ;
    // limitation documentée, pas une invention silencieuse.
    origine: "ia",
    statut: mapStatutToEF01B(d.statut)
  }));

  const disciplinesRetenues = disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => d.discipline);

  let zeroRetainedMotif = null;
  if (disciplinesRetenues.length === 0) {
    const ambiguites = (runContract.perimetre && runContract.perimetre.ambiguitesSignalees) || [];
    const zeroAmbig = ambiguites.find((a) => a.type === "aucune_discipline_retenue");
    const motif = zeroAmbig && zeroAmbig.resolution && str(zeroAmbig.resolution.justification);
    if (!motif) {
      throw new Error(
        "buildEF01BOutputFromRunContract: zéro discipline retenue mais aucun motif documenté trouvé dans " +
        "RunContract.perimetre.ambiguitesSignalees (résolution 'aucune_discipline_retenue' attendue, jamais inventée ici)."
      );
    }
    zeroRetainedMotif = motif;
  }

  const resolvedAt = str(runContract.humanConfirmation && runContract.humanConfirmation.confirmedAt);
  if (!resolvedAt) {
    throw new Error("buildEF01BOutputFromRunContract: RunContract.humanConfirmation.confirmedAt manquant — impossible de dater la résolution sans métadonnée volatile fabriquée ici.");
  }

  return {
    ...ef01aOutput,
    stage: "EF-01B",
    stageVersion: "EF-01B-v2",
    disciplinesProposees,
    disciplinesRetenues,
    resolverRuns: trace.resolverRuns.map((r) => ({ ...r })), // copie défensive, jamais la référence de l'appelant
    disciplineResolution: {
      validationComplete: true,
      resolvedAt,
      retainedCount: disciplinesRetenues.length,
      zeroRetainedMotif
    }
  };
}

// ---------------------------------------------------------------------------
// createEF01BExecutor(runContract, trace) -> executor(input) compatible
// Stage Adapter. `input` attendu = sortie EF-01A (pipeline inputFrom:["EF-01A"]).
// `runContract` et `trace` sont fournis à la construction : ce sont des
// faits déjà figés avant que ce stage ne s'exécute, pas une donnée qui
// transite par `input`.
// ---------------------------------------------------------------------------
function createEF01BExecutor(runContract, trace) {
  return async function ef01bExecutor(input) {
    const output = buildEF01BOutputFromRunContract(input, runContract, trace);
    return { status: "ok", output };
  };
}

const EFOrchEF01BExecutor = { buildEF01BOutputFromRunContract, createEF01BExecutor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01BExecutor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01BExecutor = EFOrchEF01BExecutor;
}
