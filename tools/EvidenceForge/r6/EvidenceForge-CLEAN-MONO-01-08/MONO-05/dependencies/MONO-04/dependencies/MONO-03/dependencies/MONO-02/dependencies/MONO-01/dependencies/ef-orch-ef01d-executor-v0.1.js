// EvidenceForge — EF-ORCH-03I — Exécuteur EF-01D — v0.1
// Reçoit un ScreeningArtifact déjà produit par le screening humain (interface
// EF-01D, hors de ce stage orchestré) et le vérifie — ne décide jamais quelle
// source inclure/exclure/dupliquer. Recalcule uniquement ce qui est
// authentiquement déterministe : disciplineStats.
"use strict";

const { validateEF01C2Output } = require("./ef-orch-ef01-output-contracts-v0.1.js");
const { assertScreeningArtifactComplete, computeDisciplineStats } = require("./ef-orch-ef01d-screening-artifact-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

// ---------------------------------------------------------------------------
// buildEF01DOutputFromScreeningArtifact(ef01c2Output, screeningArtifact)
// screeningArtifact = { sourcesScreening, auditDecisions }
// ---------------------------------------------------------------------------
async function buildEF01DOutputFromScreeningArtifact(ef01c2Output, screeningArtifact) {
  if (!(await validateEF01C2Output(ef01c2Output))) {
    throw new Error("buildEF01DOutputFromScreeningArtifact: ef01c2Output fourni n'est pas une sortie EF-01C2 valide.");
  }
  const artifact = screeningArtifact || {};
  const protocolHash = ef01c2Output.searchProtocol && ef01c2Output.searchProtocol.protocolHash;

  // Sources attendues = celles trouvées par EF-01C2 ET les suppliedEvidence,
  // qui entrent elles aussi dans le pool de screening (vérifié dans
  // importFile() du vrai module : "suppliedEvidence enters the screening
  // pool, but targetDocuments never does"). L'id réel de ces sources suit la
  // convention "source-supplied-"+doc.id — fiable ici puisque notre
  // exécuteur EF-01A garantit toujours un id explicite par occurrence
  // (jamais le genId() de secours du vrai module, qui serait imprévisible).
  const expectedSourceIds = [
    ...(ef01c2Output.sourcesTrouvees || []).map((s) => s.id),
    ...(ef01c2Output.suppliedEvidence || []).map((d) => "source-supplied-" + str(d.id))
  ];

  assertScreeningArtifactComplete({
    sourcesScreening: artifact.sourcesScreening,
    auditDecisions: artifact.auditDecisions,
    protocolHash,
    expectedSourceIds
  });

  const disciplinesRetenues = (ef01c2Output.searchProtocol && ef01c2Output.searchProtocol.disciplinesRetenues) || [];
  const sourcesScreening = artifact.sourcesScreening;
  const disciplineStats = computeDisciplineStats(disciplinesRetenues, sourcesScreening);

  const screeningSummary = {
    total: sourcesScreening.length,
    incluses: sourcesScreening.filter((s) => s.statutScreening === "inclus").length,
    exclues: sourcesScreening.filter((s) => s.statutScreening === "exclu").length,
    doublons: sourcesScreening.filter((s) => s.statutScreening === "doublon").length,
    suppliedEvidenceCount: sourcesScreening.filter((s) => s.provenance && s.provenance.connectorId === "user_supplied").length,
    disciplineStats,
    completedAt: (() => {
      const c = str(artifact.completedAt);
      if (!c) {
        throw new Error(
          "buildEF01DOutputFromScreeningArtifact: ScreeningArtifact.completedAt manquant — métadonnée volatile, jamais générée ici (Date.now() interdit, même règle que pour EF-01F). " +
          "Sans cette valeur fixée par l'appelant, deux appels identiques produiraient deux completedAt différents et donc deux outputHash différents pour le même checkpoint, violant le contrat deterministic:true/restart_stage d'EF-01D."
        );
      }
      return c;
    })()
  };

  return {
    ...ef01c2Output,
    stage: "EF-01D",
    stageVersion: "EF-01D-v1",
    sourcesScreening: sourcesScreening.map((s) => ({ ...s })), // copie défensive
    auditDecisions: artifact.auditDecisions.map((d) => ({ ...d })),
    screeningSummary
  };
}

// ---------------------------------------------------------------------------
// createEF01DExecutor(screeningArtifact) -> executor(input) compatible Stage
// Adapter. `input` attendu = sortie EF-01C2 (pipeline inputFrom:["EF-01C2"]).
// ---------------------------------------------------------------------------
function createEF01DExecutor(screeningArtifact) {
  return async function ef01dExecutor(input) {
    const output = await buildEF01DOutputFromScreeningArtifact(input, screeningArtifact);
    return { status: "ok", output };
  };
}

const EFOrchEF01DExecutor = { buildEF01DOutputFromScreeningArtifact, createEF01DExecutor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01DExecutor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01DExecutor = EFOrchEF01DExecutor;
}
