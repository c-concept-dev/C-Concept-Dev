"use strict";
/**
 * MONO-10 v0.6 — core/scientific-unified-report.js  (§21)
 *
 * Rapport ADDITIF : il ne reecrit jamais le rapport anterieur, il le reference
 * et reproduit ses drapeaux a l'identique.
 *
 * FERMETURE v0.3 B-7 (partielle) : `assertReportBoundToQualification` sautait
 * le controle de run des que l'un des deux runId etait absent. Un rapport sans
 * runId acceptait donc une qualification issue de n'importe quel run.
 * v0.4 : le runId et l'attestation sont OBLIGATOIRES des qu'un run est atteste,
 * et l'absence n'exonere plus de rien.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { artifactRef, assertLineageResolved, assertRefMatches, RELATION } = require("./lineage.js");
const AAR = require("./authenticated-artifact-registry.js");
const { applyPriorVerdictPolicy } = require("./scientific-qualification.js");
const { propagate, assertNoSilentLoss, assertChainValid, openOnes } = require("./unknowns.js");
const RM = require("./run-evidence-manifest.js");

function buildScientificUnifiedReport(input) {
  input = input || {};
  const ctx = input.runContext || {};
  const prior = input.priorReport;
  if (!prior || typeof prior !== "object") throw fail("PRIOR_REPORT_MISSING", "rapport anterieur requis pour etre reference.");
  const q = input.qualification;
  if (!q || q.schema !== "EvidenceForge.ScientificQualification") throw fail("QUALIFICATION_MISSING", "ScientificQualification requise.");
  if (!isNonEmptyStr(q.qualificationId)) throw fail("QUALIFICATION_UNIDENTIFIED", "la qualification ne porte pas de qualificationId.");

  const missionId = (prior.mission && prior.mission.missionId) || input.missionId || null;
  const missionHash = ctx.manifest ? ctx.manifest.missionHash : (q.missionHash || null);

  // §21 — une seule mission.
  const caMission = input.candidateAssessment ? input.candidateAssessment.missionId : null;
  if (isNonEmptyStr(missionId) && isNonEmptyStr(caMission) && missionId !== caMission) {
    throw fail("REPORT_MISSION_MISMATCH", "le rapport anterieur porte la mission \"" + missionId + "\" et les artefacts qualifies la mission \"" + caMission + "\".");
  }
  if (isNonEmptyStr(missionHash) && isNonEmptyStr(q.missionHash) && missionHash !== q.missionHash) {
    throw fail("REPORT_MISSION_MISMATCH", "missionHash du run different de celui de la qualification.");
  }

  // §21 — un seul run, et il doit etre celui du contexte atteste.
  const runIds = [q, input.candidateAssessment, input.panelValidation, input.llmCapability, input.readinessPre, input.readinessFull]
    .filter(Boolean).map((a) => (a.runBinding && a.runBinding.runId) || a.runId || null).filter(isNonEmptyStr);
  const distinct = Array.from(new Set(runIds));
  if (distinct.length > 1) throw fail("REPORT_RUN_MISMATCH", "artefacts issus de runs differents : " + distinct.join(", ") + ".");
  const runId = ctx.manifest ? ctx.manifest.runId : (distinct.length === 1 ? distinct[0] : null);
  if (ctx.manifest && distinct.length === 1 && distinct[0] !== runId) {
    throw fail("REPORT_RUN_MISMATCH", "les artefacts appartiennent au run \"" + distinct[0] + "\", le contexte atteste au run \"" + runId + "\".");
  }
  if (RM.isProductionContext(ctx) && !isNonEmptyStr(runId)) throw fail("REPORT_RUN_UNBOUND", "aucun runId : un rapport de production doit etre rattache a un run atteste.");

  const priorRef = artifactRef(prior, "prior-unified-report", RELATION.PRIOR_REPORT);
  const flags = prior.testStatus || {};
  const policy = applyPriorVerdictPolicy(q, input.priorVerdict === undefined ? null : input.priorVerdict);

  (q.unknowns || []).forEach(function (u, i) { assertChainValid(u, "qualification.unknowns[" + i + "]", { requireResolvableEvidence: false }); });
  const upstream = propagate(q.unknowns || [], input.upstreamUnknowns || [], { requireResolvableEvidence: false });
  const unknowns = propagate(upstream, input.addedUnknowns || [], { requireResolvableEvidence: false });
  assertNoSilentLoss(upstream, unknowns, "ScientificUnifiedReport");

  // §41 — la lignee du rapport resout contre le registre AUTHENTIFIE du run.
  // Le rapport ne fabrique plus son propre registre : il ne declare pas sa realite.
  const registry = input.artifactRegistry;
  if (!AAR.isAuthenticatedRegistry(registry)) {
    throw fail("ARTIFACT_REGISTRY_FORGED", "registre d'artefacts non rattache a un run authentifie.");
  }
  const named = [
    ["scientific-qualification", q, RELATION.QUALIFICATION],
    ["readiness-pre", input.readinessPre, RELATION.READINESS_PRE],
    ["readiness-full", input.readinessFull, RELATION.READINESS_FULL],
  ].filter((p) => !!p[1]);
  const refs = named.map((p) => artifactRef(p[1], p[0], p[2]));
  assertLineageResolved(refs, registry, { relation: RELATION.REPORT,
    expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
    expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
    expectedAttestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : undefined },
    "lineage du rapport unifie");

  return {
    schema: "EvidenceForge.ScientificUnifiedReport", schemaVersion: "MONO-10-v6",
    missionId: missionId, missionHash: missionHash, runId: runId,
    /** §49 — l'etat du registre au moment de la redaction. */
    /** La racine telle qu'elle etait quand le rapport a ete redige. */
    registryRootHash: registry.registryRootHash || null,
    operatorTrustBoundaryId: ctx.manifest ? ctx.manifest.operatorTrustBoundaryId : null,
    attestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : null,
    executionMode: RM.effectiveMode(ctx),
    priorReportReference: priorRef,
    priorScientificValidity: flags.scientificValidity === undefined ? null : flags.scientificValidity,
    priorTestMode: flags.testMode === undefined ? null : flags.testMode,
    priorHumanProfessionalValidation: flags.humanProfessionalValidation === undefined ? null : flags.humanProfessionalValidation,
    scientificQualificationReference: artifactRef(q, "scientific-qualification", RELATION.QUALIFICATION),
    qualificationId: q.qualificationId,
    qualificationHash: RM.artifactHash(q),
    qualificationStatusReported: q.qualificationStatus,
    evidenceClassReported: q.evidenceClass,
    authenticatedProductionExecution: q.authenticatedProductionExecution === true,
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
      "un seul run, une seule mission, une seule attestation"],
  };
}

function assertPriorUntouched(report, priorNow) { assertRefMatches(report.priorReportReference, priorNow, "priorReportReference"); return true; }

/** §21 — la liaison est EXIGEE, jamais conditionnelle a la presence des champs. */
function assertReportBoundToQualification(report, qualification, ctx, label) {
  ctx = ctx || {}; label = label || "ScientificUnifiedReport";
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") throw fail("REPORT_MISSING", label + " : rapport absent.");
  if (!qualification || qualification.schema !== "EvidenceForge.ScientificQualification") throw fail("QUALIFICATION_MISSING", label + " : qualification absente.");
  if (report.qualificationId !== qualification.qualificationId) {
    throw fail("REPORT_QUALIFICATION_MISMATCH", label + " : qualificationId du rapport (" + report.qualificationId + ") different de celui de la qualification fournie (" + qualification.qualificationId + ").");
  }
  if (report.qualificationHash !== RM.artifactHash(qualification)) throw fail("REPORT_QUALIFICATION_ALTERED", label + " : la qualification a change depuis la redaction du rapport.");
  // §49 — la racine de registre doit correspondre a l'etat courant.
  // §49 — la racine du rapport doit etre celle qui precedait SON PROPRE
  // enregistrement. Les artefacts enregistres APRES (acceptation, autorisation)
  // font avancer la racine : c'est attendu, et ce n'est pas une divergence.
  if (ctx.artifactRegistry && isNonEmptyStr(report.registryRootHash)
      && typeof ctx.artifactRegistry.sequenceOf === "function") {
    const seq = ctx.artifactRegistry.sequenceOf("scientific-unified-report");
    const expectedRoot = seq ? ctx.artifactRegistry.rootBeforeSequence(seq) : null;
    if (expectedRoot && expectedRoot !== report.registryRootHash) {
      throw fail("REPORT_REGISTRY_ROOT_MISMATCH", label + " : la racine de registre du rapport ne correspond pas a l'etat du registre au moment de sa redaction.");
    }
  }
  if (ctx.manifest && isNonEmptyStr(report.operatorTrustBoundaryId)
      && report.operatorTrustBoundaryId !== ctx.manifest.operatorTrustBoundaryId) {
    throw fail("REPORT_BOUNDARY_MISMATCH", label + " : rapport rattache a une autre frontiere operateur.");
  }

  const qRun = (qualification.runBinding && qualification.runBinding.runId) || qualification.runId || null;
  const qAtt = (qualification.runBinding && qualification.runBinding.attestationHash) || qualification.attestationHash || null;
  const attested = !!(ctx.manifest);
  if (attested || isNonEmptyStr(qRun) || isNonEmptyStr(report.runId)) {
    if (!isNonEmptyStr(report.runId)) throw fail("REPORT_RUN_UNBOUND", label + " : rapport sans runId alors qu'un run est en jeu — l'absence n'exonere de rien.");
    if (!isNonEmptyStr(qRun)) throw fail("REPORT_RUN_UNBOUND", label + " : qualification sans runId alors qu'un run est en jeu.");
    if (qRun !== report.runId) throw fail("REPORT_RUN_MISMATCH", label + " : runId du rapport (" + report.runId + ") different de celui de la qualification (" + qRun + ").");
    if (attested && report.runId !== ctx.manifest.runId) throw fail("REPORT_RUN_MISMATCH", label + " : rapport hors du run atteste.");
  }
  if (isNonEmptyStr(qAtt) || isNonEmptyStr(report.attestationHash)) {
    if (report.attestationHash !== qAtt) throw fail("REPORT_ATTESTATION_MISMATCH", label + " : attestation du rapport differente de celle de la qualification.");
  }
  if (isNonEmptyStr(qualification.missionHash) || isNonEmptyStr(report.missionHash)) {
    if (report.missionHash !== qualification.missionHash) throw fail("REPORT_MISSION_MISMATCH", label + " : missionHash du rapport different de celui de la qualification.");
  }
  return true;
}

module.exports = { buildScientificUnifiedReport, assertPriorUntouched, assertReportBoundToQualification };
