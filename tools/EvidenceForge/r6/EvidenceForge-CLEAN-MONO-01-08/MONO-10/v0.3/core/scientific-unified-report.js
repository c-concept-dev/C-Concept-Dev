"use strict";
/**
 * MONO-10 v0.3 — core/scientific-unified-report.js
 *
 * Rapport ADDITIF. Ne reecrit jamais le rapport anterieur : il le reference et
 * reproduit ses drapeaux a l'identique.
 *
 * Fermeture v0.3 :
 *   §18 — LIAISON EXPLICITE. En v0.2 le rapport referencait une qualification
 *         par empreinte, mais rien n'interdisait de marier une qualification
 *         issue d'un run a un rapport anterieur issu d'une autre mission : les
 *         deux artefacts etaient valides SEPAREMENT, jamais l'un CONTRE l'autre.
 *         v0.3 porte `qualificationId`, `qualificationHash`, `runId` et
 *         `missionId`, et refuse une composition dont ces quatre liens ne
 *         concordent pas.
 *   §10 — la lignee est RESOLUE, pas seulement non vide.
 */

const { fail, sha256Of, isNonEmptyStr } = require("./run-evidence-manifest.js");
const { artifactRef, assertLineageResolved, assertRefMatches, createArtifactRegistry } = require("./lineage.js");
const { applyPriorVerdictPolicy } = require("./scientific-qualification.js");
const { propagate, assertNoSilentLoss, assertChainValid, openOnes } = require("./unknowns.js");

function runIdOf(a) { return (a && a.runBinding && a.runBinding.runId) || null; }

function buildScientificUnifiedReport(input) {
  input = input || {};
  const prior = input.priorReport;
  if (!prior || typeof prior !== "object") throw fail("PRIOR_REPORT_MISSING", "rapport anterieur requis pour etre reference.");
  const q = input.qualification;
  if (!q || q.schema !== "EvidenceForge.ScientificQualification") throw fail("QUALIFICATION_MISSING", "ScientificQualification requise.");
  if (!isNonEmptyStr(q.qualificationId)) throw fail("QUALIFICATION_UNIDENTIFIED", "la qualification ne porte pas de qualificationId : elle ne peut etre liee a ce rapport.");

  const missionId = (prior.mission && prior.mission.missionId) || input.missionId || null;

  // §18 — la mission du rapport anterieur et celle des artefacts qualifies
  // doivent etre la MEME. Deux artefacts valides separement ne forment pas un
  // ensemble valide.
  const caMission = input.candidateAssessment ? input.candidateAssessment.missionId : null;
  if (isNonEmptyStr(missionId) && isNonEmptyStr(caMission) && missionId !== caMission) {
    throw fail("REPORT_MISSION_MISMATCH",
      "le rapport anterieur porte la mission \"" + missionId + "\" et les artefacts qualifies la mission \"" + caMission + "\" : aucune composition possible.");
  }

  // §18 — un seul run. Les artefacts lies a un run ne se melangent pas.
  const runIds = [q, input.candidateAssessment, input.panelValidation, input.llmCapability, input.readinessPre, input.readinessFull]
    .filter(Boolean).map(runIdOf).filter(isNonEmptyStr);
  const distinct = Array.from(new Set(runIds));
  if (distinct.length > 1) {
    throw fail("REPORT_RUN_MISMATCH", "artefacts issus de runs differents : " + distinct.join(", ") + ". Un rapport unifie porte sur un seul run.");
  }
  const runId = distinct.length === 1 ? distinct[0] : null;
  if (input.production === true && !isNonEmptyStr(runId)) {
    throw fail("REPORT_RUN_UNBOUND", "aucun runId : un rapport de production doit etre rattache a un run identifie.");
  }

  const priorRef = artifactRef(prior, "prior-unified-report");
  const flags = prior.testStatus || {};
  const policy = applyPriorVerdictPolicy(q, input.priorVerdict === undefined ? null : input.priorVerdict);

  // §11/§12 — la chaine de chaque inconnu est verifiee avant d'etre reportee.
  (q.unknowns || []).forEach(function (u, i) { assertChainValid(u, "qualification.unknowns[" + i + "]"); });
  const upstream = propagate(q.unknowns || [], input.upstreamUnknowns || []);
  const unknowns = propagate(upstream, input.addedUnknowns || []);
  assertNoSilentLoss(upstream, unknowns, "ScientificUnifiedReport");

  const named = [
    ["prior-unified-report", prior],
    ["candidate-assessment", input.candidateAssessment],
    ["panel-validation", input.panelValidation],
    ["llm-capability", input.llmCapability],
    ["readiness-pre", input.readinessPre],
    ["readiness-full", input.readinessFull],
    ["scientific-qualification", q],
  ].filter((p) => !!p[1]);
  const refs = named.map((p) => artifactRef(p[1], p[0]));
  // Le registre du rapport contient ses propres artefacts ; un registre amont
  // fourni par l'appelant vient s'y AJOUTER, sans jamais recouvrir les siens.
  const registry = createArtifactRegistry(named.map((p) => ({ artifactId: p[0], artifact: p[1] })));
  if (input.artifactRegistry && typeof input.artifactRegistry.forEach === "function") {
    input.artifactRegistry.forEach(function (entry, id) { if (!registry.has(id)) registry.set(id, entry); });
  }
  assertLineageResolved(refs, registry, { requiredRelations: ["EvidenceForge.ScientificQualification"] }, "lineage du rapport unifie");

  const qHash = sha256Of(Object.assign({}, q, { runBinding: undefined }));
  const byId = (id) => { const p = named.filter((x) => x[0] === id)[0]; return p ? artifactRef(p[1], id) : null; };

  return {
    schema: "EvidenceForge.ScientificUnifiedReport", schemaVersion: "MONO-10-v3",
    missionId: missionId,
    runId: runId,
    priorReportReference: priorRef,
    priorScientificValidity: flags.scientificValidity === undefined ? null : flags.scientificValidity,
    priorTestMode: flags.testMode === undefined ? null : flags.testMode,
    priorHumanProfessionalValidation: flags.humanProfessionalValidation === undefined ? null : flags.humanProfessionalValidation,
    candidateAssessmentReference: byId("candidate-assessment"),
    professionalPanelValidationReference: byId("panel-validation"),
    llmCapabilityReference: byId("llm-capability"),
    readinessPreReference: byId("readiness-pre"),
    readinessFullReference: byId("readiness-full"),
    scientificQualificationReference: byId("scientific-qualification"),
    qualificationId: q.qualificationId,
    qualificationHash: qHash,
    qualificationStatusReported: q.qualificationStatus,
    priorVerdict: policy.priorVerdict, priorVerdictPreserved: true,
    scientificallyActionableVerdict: policy.scientificallyActionableVerdict,
    verdictPermitted: q.verdictPermitted === true,
    reservations: (input.reservations || []).concat(q.reservations || []),
    unknowns: unknowns, openUnknownCount: openOnes(unknowns).length,
    lineage: refs,
    invariants: ["ne reecrit jamais le rapport anterieur",
      "reproduit les drapeaux anterieurs a l'identique",
      "un verdict anterieur reste enregistre meme si son usage aval est bloque",
      "aucun inconnu ouvert n'est efface",
      "un seul run et une seule mission par rapport unifie"],
  };
}

function assertPriorUntouched(report, priorNow) {
  assertRefMatches(report.priorReportReference, priorNow, "priorReportReference");
  return true;
}

/** §18 — le rapport porte-t-il bien SUR cette qualification ? */
function assertReportBoundToQualification(report, qualification, label) {
  label = label || "ScientificUnifiedReport";
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") throw fail("REPORT_MISSING", label + " : rapport absent.");
  if (!qualification || qualification.schema !== "EvidenceForge.ScientificQualification") throw fail("QUALIFICATION_MISSING", label + " : qualification absente.");
  if (report.qualificationId !== qualification.qualificationId) {
    throw fail("REPORT_QUALIFICATION_MISMATCH", label + " : qualificationId du rapport (" + report.qualificationId + ") different de celui de la qualification fournie (" + qualification.qualificationId + ").");
  }
  const h = sha256Of(Object.assign({}, qualification, { runBinding: undefined }));
  if (report.qualificationHash !== h) {
    throw fail("REPORT_QUALIFICATION_ALTERED", label + " : la qualification a change depuis la redaction du rapport.");
  }
  const qRun = runIdOf(qualification);
  if (isNonEmptyStr(qRun) && isNonEmptyStr(report.runId) && qRun !== report.runId) {
    throw fail("REPORT_RUN_MISMATCH", label + " : runId du rapport (" + report.runId + ") different de celui de la qualification (" + qRun + ").");
  }
  return true;
}

module.exports = { buildScientificUnifiedReport, assertPriorUntouched, assertReportBoundToQualification };
