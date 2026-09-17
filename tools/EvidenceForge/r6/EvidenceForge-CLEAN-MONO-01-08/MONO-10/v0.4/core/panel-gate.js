"use strict";
/**
 * MONO-10 v0.4 — core/panel-gate.js  (§10, §11)
 *
 * FERMETURE v0.3 B-4.
 *
 * v0.3 liait 17 elements sur 18. Le trou : muter `decision.evidenceRefs` — la
 * liste d'oeuvres SUR LAQUELLE L'HUMAIN A APPROUVE — n'invalidait rien, parce
 * que la validation comparait `evidenceRefsHash` a l'EVALUATION AMONT et jamais
 * au tableau porte par la decision elle-meme. Ce que l'humain avait vu etait
 * donc reinscriptible apres coup.
 *
 * v0.4 : `evidenceRefsHash` est recalcule DES DEUX COTES et les deux doivent
 * concorder. La liaison inclut en outre le run et l'attestation runtime, et
 * l'acte humain doit etre AUTHENTIFIE (§11), pas seulement declare.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { artifactRef, assertRefMatches, RELATION } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { verifyHumanActAuthenticity, assertHumanActDeclaration } = require("./human-act.js");
const RM = require("./run-evidence-manifest.js");

const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };
const ALLOWED = [DECISION.APPROVE, DECISION.REJECT, DECISION.DEFER];

function missionBinding(a) { return sha256Of({ missionId: a.missionId, missionHash: a.missionHash || null, missionLabels: (a.missionLabels || []).slice().sort() }); }
function evidenceRefsHash(refs) { return sha256Of((refs || []).slice().sort()); }
function assessmentHash(a) { return RM.artifactHash(a); }
function runBindingOf(a) { return (a && a.runBinding) || null; }

function candidateBinding(assessment, a) {
  const rb = runBindingOf(assessment);
  return sha256Of({
    missionBindingHash: missionBinding(assessment),
    candidateAssessmentId: assessment.assessmentId || null,
    candidateAssessmentHash: assessmentHash(assessment),
    candidateId: a.candidateId,
    evidenceRefsHash: evidenceRefsHash(a.missionEvidenceRefs),
    identityConfidence: a.identityConfidence,
    discoveryRef: assessment.assessesDiscoveryRef && assessment.assessesDiscoveryRef.sha256,
    verificationRef: assessment.assessesVerificationRef && assessment.assessesVerificationRef.sha256,
    // §10 — le run et l'attestation font partie de ce que l'humain valide.
    runId: rb ? rb.runId : (assessment.runId || null),
    attestationHash: rb ? rb.attestationHash : null,
  });
}

function buildPanelValidationTemplate(assessment) {
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    throw fail("PANEL_TEMPLATE_INPUT_INVALID", "ProfessionalCandidateAssessment requise.");
  }
  const rb = runBindingOf(assessment);
  const presentable = (assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT);
  return {
    _readme: "Porte humaine. Completer decision/decisionReason/actorIdentity/decidedAt pour CHAQUE entree. "
      + "Aucune valeur par defaut. DEFER est un etat legitime tant qu'un humain ne le reprend pas. "
      + "En mode TEST, authenticationMode doit valoir TEST_FIXTURE_DECLARED ; en PRODUCTION, un mecanisme d'authentification est exige.",
    schema: "EvidenceForge.ProfessionalPanelValidation", schemaVersion: "MONO-10-v4",
    missionId: assessment.missionId, missionHash: missionBinding(assessment),
    runId: rb ? rb.runId : (assessment.runId || null),
    attestationHash: rb ? rb.attestationHash : null,
    candidateAssessmentId: assessment.assessmentId || "candidate-assessment",
    candidateAssessmentHash: assessmentHash(assessment),
    validatesAssessmentRef: artifactRef(assessment, assessment.assessmentId || "candidate-assessment", RELATION.ASSESSMENT),
    validatesDiscoveryRef: assessment.assessesDiscoveryRef,
    validatesVerificationRef: assessment.assessesVerificationRef,
    decisions: presentable.map(function (a) {
      return { candidateId: a.candidateId, professionalIdentity: a.professionalIdentity,
        evidenceRefs: (a.missionEvidenceRefs || []).slice(), evidenceRefsHash: evidenceRefsHash(a.missionEvidenceRefs),
        identityConfidence: a.identityConfidence, relevance: a.relevance, discoveryOrigin: a.discoveryOrigin,
        candidateBindingHash: candidateBinding(assessment, a),
        decision: null, decisionReason: null, actorType: null, actorIdentity: null, decidedAt: null, authenticationMode: null };
    }),
  };
}

/**
 * validatePanelValidation(validation, assessment, ctx)
 * ctx.manifest / ctx.anchorSet / ctx.attestation : contexte de run atteste
 * ctx.humanActVerifier : mecanisme d'authentification d'acte humain (production)
 */
function validatePanelValidation(validation, assessment, ctx) {
  ctx = ctx || {};
  const problems = [];
  if (!validation || validation.schema !== "EvidenceForge.ProfessionalPanelValidation") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], approved: [], counts: {}, authenticatedActs: 0 };
  }
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    return { valid: false, problems: ["ProfessionalCandidateAssessment requise pour verifier le binding"], approved: [], counts: {}, authenticatedActs: 0 };
  }
  const mode = RM.effectiveMode(ctx);
  if (ctx.manifest) {
    if (RM.isProductionContext(ctx)) {
      try { RM.assertProductionEvidence(validation, ctx, "ProfessionalPanelValidation"); } catch (e) { problems.push(e.message); }
      try { RM.assertProductionEvidence(assessment, ctx, "ProfessionalCandidateAssessment"); } catch (e) { problems.push(e.message); }
    } else {
      try { RM.assertArtifactBoundToRun(validation, ctx.manifest, "ProfessionalPanelValidation"); } catch (e) { problems.push(e.message); }
      try { RM.assertArtifactBoundToRun(assessment, ctx.manifest, "ProfessionalCandidateAssessment"); } catch (e) { problems.push(e.message); }
    }
  } else if (ctx.requireAttestedRun === true) {
    problems.push("aucun contexte de run atteste fourni alors qu'il est exige.");
  }

  try { assertRefMatches(validation.validatesAssessmentRef, assessment, "validatesAssessmentRef"); } catch (e) { problems.push(e.message); }
  if (validation.candidateAssessmentHash !== assessmentHash(assessment)) problems.push("candidateAssessmentHash obsolete — l'evaluation a change.");
  if (validation.candidateAssessmentId !== (assessment.assessmentId || "candidate-assessment")) problems.push("candidateAssessmentId different.");
  if (validation.missionHash !== missionBinding(assessment)) problems.push("missionHash obsolete — la mission a change.");
  if (validation.missionId !== assessment.missionId) problems.push("missionId different de celui de l'evaluation.");
  const rb = runBindingOf(assessment);
  if (rb) {
    if (validation.runId !== rb.runId) problems.push("runId de la porte different de celui de l'evaluation.");
    if (validation.attestationHash !== rb.attestationHash) problems.push("attestation differente de celle de l'evaluation.");
  }
  const dRef = assessment.assessesDiscoveryRef, vRef = assessment.assessesVerificationRef;
  if (!validation.validatesDiscoveryRef || !dRef || validation.validatesDiscoveryRef.sha256 !== dRef.sha256) problems.push("validatesDiscoveryRef obsolete — l'artefact de decouverte a change.");
  if (!validation.validatesVerificationRef || !vRef || validation.validatesVerificationRef.sha256 !== vRef.sha256) problems.push("validatesVerificationRef obsolete — l'artefact de verification a change.");

  const byId = new Map();
  (assessment.assessments || []).forEach((a) => byId.set(a.candidateId, a));
  const presentableIds = new Set((assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).map((a) => a.candidateId));
  const seen = new Set(), approved = [], authAct = new Map();
  let authenticatedActs = 0;

  (validation.decisions || []).forEach(function (d, i) {
    const tag = "decisions[" + i + "] (" + (d && d.candidateId) + ")";
    if (!d || !isNonEmptyStr(d.candidateId)) { problems.push(tag + " : candidateId manquant"); return; }
    if (!presentableIds.has(d.candidateId)) { problems.push(tag + " : candidat non presentable a la porte humaine"); return; }
    if (seen.has(d.candidateId)) { problems.push(tag + " : doublon de decision"); return; }
    seen.add(d.candidateId);
    if (ALLOWED.indexOf(d.decision) === -1) { problems.push(tag + " : decision invalide " + JSON.stringify(d.decision)); return; }
    if (!isNonEmptyStr(d.decisionReason)) { problems.push(tag + " : decisionReason non vide requise"); return; }
    try { assertHumanActDeclaration(d, tag); } catch (e) { problems.push(e.message); return; }

    // §11 — declaration ≠ authenticite.
    const auth = verifyHumanActAuthenticity(d, { executionMode: mode, humanActVerifier: ctx.humanActVerifier,
      allowTestFixtureActs: ctx.allowTestFixtureActs, manifest: ctx.manifest }, tag);
    authAct.set(d.candidateId, auth.authenticated);
    if (auth.authenticated) authenticatedActs++;
    else problems.push(auth.problems.join(" ; "));

    const a = byId.get(d.candidateId);
    // §10 — LA FERMETURE : les preuves PORTEES PAR LA DECISION sont hachees ici meme.
    const declaredHash = evidenceRefsHash(d.evidenceRefs);
    const upstreamHash = evidenceRefsHash(a.missionEvidenceRefs);
    if (declaredHash !== upstreamHash) {
      problems.push(tag + " : les preuves portees par la decision ne sont plus celles de l'evaluation — "
        + "ce que l'humain a vu a ete reecrit."); return;
    }
    if (d.evidenceRefsHash !== upstreamHash) { problems.push(tag + " : evidenceRefsHash obsolete — les preuves ont change."); return; }
    if (d.candidateBindingHash !== candidateBinding(assessment, a)) { problems.push(tag + " : candidateBindingHash obsolete — identite, preuves, mission, run ou artefacts amont ont change."); return; }
    if (d.decision === DECISION.APPROVE) {
      if (!Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0) { problems.push(tag + " : APPROVE exige evidenceRefs non vides"); return; }
      if (d.identityConfidence === "AMBIGUOUS") { problems.push(tag + " : APPROVE impossible sur une identite AMBIGUOUS"); return; }
      if (auth.authenticated) approved.push(d.candidateId);
    }
  });
  presentableIds.forEach(function (id) { if (!seen.has(id)) problems.push("aucune decision fournie pour \"" + id + "\" (exhaustivite requise)."); });

  if (problems.length) return { valid: false, problems: problems, approved: [], counts: {}, authenticatedActs: authenticatedActs, authenticatedByCandidate: authAct };
  const counts = {}; ALLOWED.forEach((k) => { counts[k] = (validation.decisions || []).filter((d) => d.decision === k).length; });
  return { valid: true, problems: [], approved: approved, counts: counts, authenticatedActs: authenticatedActs, authenticatedByCandidate: authAct };
}

function decisionsById(validation) {
  const m = new Map();
  (validation && validation.decisions || []).forEach((d) => m.set(d.candidateId, d.decision));
  return m;
}

module.exports = { buildPanelValidationTemplate, validatePanelValidation, decisionsById,
  candidateBinding, missionBinding, evidenceRefsHash, assessmentHash, DECISION, ALLOWED };
