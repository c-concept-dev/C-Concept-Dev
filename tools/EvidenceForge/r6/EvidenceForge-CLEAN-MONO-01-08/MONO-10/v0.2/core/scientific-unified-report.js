"use strict";
/**
 * MONO-10 v0.2 — core/scientific-unified-report.js
 * Rapport ADDITIF. Ne reecrit jamais le rapport anterieur : il le reference et
 * reproduit ses drapeaux a l'identique. F-06 : les unknowns survivent ici.
 */

const { fail, stamp, CLASS } = require("./execution-evidence.js");
const { artifactRef, assertLineageNonEmpty, assertRefMatches } = require("./lineage.js");
const { applyPriorVerdictPolicy } = require("./scientific-qualification.js");
const { propagate, assertNoSilentLoss, openOnes } = require("./unknowns.js");

function buildScientificUnifiedReport(input) {
  input = input || {};
  const prior = input.priorReport;
  if (!prior || typeof prior !== "object") throw fail("PRIOR_REPORT_MISSING", "rapport anterieur requis pour etre reference.");
  const q = input.qualification;
  if (!q || q.schema !== "EvidenceForge.ScientificQualification") throw fail("QUALIFICATION_MISSING", "ScientificQualification requise.");

  const priorRef = artifactRef(prior, "prior-unified-report");
  const flags = prior.testStatus || {};
  const policy = applyPriorVerdictPolicy(q, input.priorVerdict === undefined ? null : input.priorVerdict);

  const upstream = propagate(q.unknowns || [], input.upstreamUnknowns || []);
  const unknowns = propagate(upstream, input.addedUnknowns || []);
  assertNoSilentLoss(upstream, unknowns, "ScientificUnifiedReport");

  const refs = [priorRef,
    input.candidateAssessment ? artifactRef(input.candidateAssessment, "candidate-assessment") : null,
    input.panelValidation ? artifactRef(input.panelValidation, "panel-validation") : null,
    input.llmCapability ? artifactRef(input.llmCapability, "llm-capability") : null,
    input.readinessPre ? artifactRef(input.readinessPre, "readiness-pre") : null,
    input.readinessFull ? artifactRef(input.readinessFull, "readiness-full") : null,
    artifactRef(q, "scientific-qualification"),
  ].filter(Boolean);
  assertLineageNonEmpty(refs, "lineage");

  return Object.assign({
    schema: "EvidenceForge.ScientificUnifiedReport", schemaVersion: "MONO-10-v2",
    missionId: (prior.mission && prior.mission.missionId) || input.missionId || null,
    priorReportReference: priorRef,
    priorScientificValidity: flags.scientificValidity === undefined ? null : flags.scientificValidity,
    priorTestMode: flags.testMode === undefined ? null : flags.testMode,
    priorHumanProfessionalValidation: flags.humanProfessionalValidation === undefined ? null : flags.humanProfessionalValidation,
    candidateAssessmentReference: input.candidateAssessment ? artifactRef(input.candidateAssessment, "candidate-assessment") : null,
    professionalPanelValidationReference: input.panelValidation ? artifactRef(input.panelValidation, "panel-validation") : null,
    llmCapabilityReference: input.llmCapability ? artifactRef(input.llmCapability, "llm-capability") : null,
    readinessPreReference: input.readinessPre ? artifactRef(input.readinessPre, "readiness-pre") : null,
    readinessFullReference: input.readinessFull ? artifactRef(input.readinessFull, "readiness-full") : null,
    scientificQualificationReference: artifactRef(q, "scientific-qualification"),
    priorVerdict: policy.priorVerdict, priorVerdictPreserved: true,
    scientificallyActionableVerdict: policy.scientificallyActionableVerdict,
    verdictPermitted: q.verdictPermitted === true,
    reservations: (input.reservations || []).concat(q.reservations || []),
    unknowns: unknowns, openUnknownCount: openOnes(unknowns).length,
    lineage: refs,
    invariants: ["ne reecrit jamais le rapport anterieur",
      "reproduit les drapeaux anterieurs a l'identique",
      "un verdict anterieur reste enregistre meme si son usage aval est bloque",
      "aucun inconnu ouvert n'est efface"],
  }, stamp(input.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

function assertPriorUntouched(report, priorNow) {
  assertRefMatches(report.priorReportReference, priorNow, "priorReportReference");
  return true;
}

module.exports = { buildScientificUnifiedReport, assertPriorUntouched };
