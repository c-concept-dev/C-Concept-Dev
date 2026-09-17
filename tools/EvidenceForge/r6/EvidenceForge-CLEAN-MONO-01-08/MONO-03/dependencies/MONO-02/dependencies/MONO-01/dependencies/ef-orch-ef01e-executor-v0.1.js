// EvidenceForge — EF-ORCH-03J — Exécuteur EF-01E — v0.1
//
// EF-01E production n'existe pas dans le baseline. Cet exécuteur ne fait
// AUCUNE prétention de méthodologie scientifique — il vérifie un
// QualificationTestArtifact déjà produit hors de ce stage orchestré (par le
// vrai outil TEST avec un humain, ou par un utilitaire de génération TEST
// séparé) et ne génère jamais lui-même de qualification ni d'AuditDecision.
"use strict";

const { validateEF01DOutput } = require("./ef-orch-ef01-output-contracts-v0.1.js");
const { assertQualificationTestArtifactValid, computeQualificationSummary } = require("./ef-orch-ef01e-qualification-test-artifact-v0.1.js");

// ---------------------------------------------------------------------------
// buildEF01EOutputFromQualificationTestArtifact(ef01dOutput, qualificationTestArtifact)
// qualificationTestArtifact = { sourcesQualified, auditDecisions, completedAt? }
// ---------------------------------------------------------------------------
async function buildEF01EOutputFromQualificationTestArtifact(ef01dOutput, qualificationTestArtifact) {
  if (!validateEF01DOutput(ef01dOutput)) {
    throw new Error("buildEF01EOutputFromQualificationTestArtifact: ef01dOutput fourni n'est pas une sortie EF-01D valide.");
  }
  const artifact = qualificationTestArtifact || {};
  const protocolHash = ef01dOutput.searchProtocol && ef01dOutput.searchProtocol.protocolHash;
  const expectedSourceIds = (ef01dOutput.sourcesScreening || []).map((s) => s.id);
  const existingDecisionIds = (ef01dOutput.auditDecisions || []).map((d) => d.decisionId);

  assertQualificationTestArtifactValid({
    sourcesQualified: artifact.sourcesQualified,
    auditDecisions: artifact.auditDecisions,
    protocolHash,
    expectedSourceIds,
    existingDecisionIds
  });

  const qualificationSummary = computeQualificationSummary(artifact.sourcesQualified, artifact.completedAt);

  // Audit cumulatif, jamais un remplacement : le vrai module charge
  // audit=data.auditDecisions (screening D) puis EMPILE les décisions de
  // qualification sur ce même tableau (audit.push(d) dans addTestDecision()) —
  // l'export final porte l'historique complet, jamais seulement les
  // dernières décisions.
  const output = {
    ...ef01dOutput,
    stage: "EF-01E",
    stageVersion: "EF-01E-v1",
    sourcesQualified: artifact.sourcesQualified.map((s) => ({ ...s })),
    auditDecisions: [
      ...(ef01dOutput.auditDecisions || []).map((d) => ({ ...d })),
      ...artifact.auditDecisions.map((d) => ({ ...d }))
    ],
    qualificationSummary
  };
  delete output.sourcesScreening; // conforme au vrai export ($("#export").onclick : delete out.sourcesScreening)
  return output;
}

// ---------------------------------------------------------------------------
// createEF01EExecutor(qualificationTestArtifact) -> executor(input)
// `input` attendu = sortie EF-01D (pipeline inputFrom:["EF-01D"]).
// ---------------------------------------------------------------------------
function createEF01EExecutor(qualificationTestArtifact) {
  return async function ef01eExecutor(input) {
    const output = await buildEF01EOutputFromQualificationTestArtifact(input, qualificationTestArtifact);
    return { status: "ok", output };
  };
}

const EFOrchEF01EExecutor = { buildEF01EOutputFromQualificationTestArtifact, createEF01EExecutor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01EExecutor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01EExecutor = EFOrchEF01EExecutor;
}
