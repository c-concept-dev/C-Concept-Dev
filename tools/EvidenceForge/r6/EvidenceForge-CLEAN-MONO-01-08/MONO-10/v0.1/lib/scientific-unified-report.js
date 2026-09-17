"use strict";
/**
 * MONO-10 v0.1 — lib/scientific-unified-report.js
 *
 * Rapport scientifique ADDITIF. Il ne reecrit JAMAIS le rapport legacy EF-04A :
 * il le reference et reproduit ses drapeaux a l'identique. Les deux coexistent.
 *
 * legacyScientificValidity reste false si le legacy dit false.
 */

const { artifactRef, assertBound, fail } = require("./lineage.js");
const { QUALIFICATION, applyLegacyVerdictPolicy, ACTIONABLE_NONE } = require("./scientific-qualification.js");

const VERDICTS = ["GO", "GO_WITH_RESERVATIONS", "NO_GO", "IMPOSSIBLE_TO_CONCLUDE"];

/**
 * buildScientificUnifiedReport({ legacyReport, legacyVerdict, candidateAssessment,
 *   panelValidation, llmCapability, readinessPre, readinessFull, qualification,
 *   reservations, unknowns })
 *
 * Le rapport legacy est passe en LECTURE SEULE : une copie profonde est
 * referencee, jamais mutee.
 */
function buildScientificUnifiedReport(input) {
  input = input || {};
  const legacy = input.legacyReport;
  if (!legacy || typeof legacy !== "object") throw fail("LEGACY_REPORT_MISSING", "rapport legacy requis pour etre reference.");
  const qualification = input.qualification;
  if (!qualification || qualification.schema !== "EvidenceForge.ScientificQualification") {
    throw fail("QUALIFICATION_MISSING", "ScientificQualification requise.");
  }
  if (input.legacyVerdict !== undefined && input.legacyVerdict !== null && VERDICTS.indexOf(input.legacyVerdict) === -1) {
    throw fail("LEGACY_VERDICT_INVALID", "verdict legacy inattendu : " + input.legacyVerdict);
  }

  // Empreinte prise AVANT toute lecture de champ, pour pouvoir prouver l'absence
  // de mutation (voir assertLegacyUntouched).
  const legacyRef = artifactRef(legacy, legacy.artifactId || "legacy-unified-report");

  const legacyFlags = legacy.testStatus || {};
  const policy = applyLegacyVerdictPolicy(qualification, input.legacyVerdict === undefined ? null : input.legacyVerdict);

  const report = {
    schema: "EvidenceForge.ScientificUnifiedReport", schemaVersion: "MONO-10-v1",
    missionId: (legacy.mission && legacy.mission.missionId) || input.missionId || null,

    legacyReportReference: legacyRef,
    legacyScientificValidity: legacyFlags.scientificValidity === undefined ? null : legacyFlags.scientificValidity,
    legacyTestMode: legacyFlags.testMode === undefined ? null : legacyFlags.testMode,
    legacyHumanProfessionalValidation: legacyFlags.humanProfessionalValidation === undefined ? null : legacyFlags.humanProfessionalValidation,

    candidateAssessmentReference: input.candidateAssessment ? artifactRef(input.candidateAssessment, "candidate-assessment") : null,
    professionalPanelValidationReference: input.panelValidation ? artifactRef(input.panelValidation, "panel-validation") : null,
    llmCapabilityReference: input.llmCapability ? artifactRef(input.llmCapability, "llm-capability") : null,
    readinessPreReference: input.readinessPre ? artifactRef(input.readinessPre, "readiness-pre") : null,
    readinessFullReference: input.readinessFull ? artifactRef(input.readinessFull, "readiness-full") : null,
    scientificQualificationReference: artifactRef(qualification, "scientific-qualification"),

    legacyVerdict: policy.legacyVerdict,
    legacyVerdictPreserved: true,
    scientificallyActionableVerdict: policy.scientificallyActionableVerdict,
    verdictPermitted: qualification.verdictPermitted === true,
    p0_2Allowed: false,   // jamais autorise ici : voir FinalReportAcceptance

    reservations: (input.reservations || []).concat(qualification.reservations || []),
    unknowns: (input.unknowns || []).concat(qualification.unknowns || []),
    lineage: [
      legacyRef,
      input.candidateAssessment ? artifactRef(input.candidateAssessment, "candidate-assessment") : null,
      input.panelValidation ? artifactRef(input.panelValidation, "panel-validation") : null,
      input.llmCapability ? artifactRef(input.llmCapability, "llm-capability") : null,
      input.readinessPre ? artifactRef(input.readinessPre, "readiness-pre") : null,
      input.readinessFull ? artifactRef(input.readinessFull, "readiness-full") : null,
      artifactRef(qualification, "scientific-qualification"),
    ].filter(Boolean),

    invariants: [
      "ne reecrit jamais le rapport legacy",
      "reproduit les drapeaux legacy a l'identique",
      "un verdict legacy NOT_QUALIFIED reste enregistre ; seul son usage scientifique est bloque",
    ],
  };
  report.lineage.forEach((r, i) => assertBound(r, "lineage[" + i + "]"));
  return report;
}

/** Preuve d'absence de mutation : l'empreinte du legacy doit etre inchangee. */
function assertLegacyUntouched(report, legacyNow) {
  const now = artifactRef(legacyNow, legacyNow.artifactId || "legacy-unified-report");
  if (now.sha256 !== report.legacyReportReference.sha256) {
    throw fail("LEGACY_REPORT_MUTATED", "le rapport legacy a ete modifie apres referencement — interdit.");
  }
  return true;
}

module.exports = { buildScientificUnifiedReport, assertLegacyUntouched, VERDICTS };
