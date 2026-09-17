"use strict";
/**
 * MONO-10 v0.3 — core/panel-gate.js
 *
 * FERMETURE B-03 / §6. La decision humaine est liee a TOUS les elements qu'elle
 * valide : candidat, evaluation, mission, artefacts de decouverte et de
 * verification, preuves exactes. Chacun est RECALCULE et COMPARE aux artefacts
 * fournis a la consommation.
 *
 * FERMETURE A-03 / §7. La production exige un RunEvidenceManifest en mode
 * PRODUCTION et une liaison d'artefact verifiable — jamais un champ auto-declare.
 */

const { isNonEmptyStr, fail, sha256Of } = require("./run-evidence-manifest.js");
const RM = require("./run-evidence-manifest.js");
const { artifactRef, assertHumanAct, assertRefMatches } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");

const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };
const ALLOWED = [DECISION.APPROVE, DECISION.REJECT, DECISION.DEFER];

function missionBinding(assessment) {
  return sha256Of({ missionId: assessment.missionId, missionLabels: (assessment.missionLabels || []).slice().sort() });
}
function evidenceRefsHash(refs) { return sha256Of((refs || []).slice().sort()); }
function candidateBinding(assessment, a) {
  return sha256Of({
    missionBindingHash: missionBinding(assessment),
    candidateAssessmentHash: assessmentHash(assessment),
    candidateId: a.candidateId,
    evidenceRefsHash: evidenceRefsHash(a.missionEvidenceRefs),
    identityConfidence: a.identityConfidence,
    discoveryRef: assessment.assessesDiscoveryRef && assessment.assessesDiscoveryRef.sha256,
    verificationRef: assessment.assessesVerificationRef && assessment.assessesVerificationRef.sha256,
  });
}
function assessmentHash(assessment) { const b = Object.assign({}, assessment); delete b.runBinding; return sha256Of(b); }

function buildPanelValidationTemplate(assessment) {
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    throw fail("PANEL_TEMPLATE_INPUT_INVALID", "ProfessionalCandidateAssessment requise.");
  }
  const presentable = (assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT);
  return {
    _readme: "Porte humaine. Completer decision/decisionReason/actorIdentity/decidedAt pour CHAQUE entree. Aucune valeur par defaut. DEFER est un etat legitime tant qu'un humain ne le reprend pas.",
    schema: "EvidenceForge.ProfessionalPanelValidation", schemaVersion: "MONO-10-v3",
    missionId: assessment.missionId,
    missionHash: missionBinding(assessment),
    candidateAssessmentId: assessment.assessmentId || "candidate-assessment",
    candidateAssessmentHash: assessmentHash(assessment),
    validatesAssessmentRef: artifactRef(assessment, assessment.assessmentId || "candidate-assessment", assessment.schema),
    validatesDiscoveryRef: assessment.assessesDiscoveryRef,
    validatesVerificationRef: assessment.assessesVerificationRef,
    decisions: presentable.map(function (a) {
      return { candidateId: a.candidateId, professionalIdentity: a.professionalIdentity,
        evidenceRefs: (a.missionEvidenceRefs || []).slice(), evidenceRefsHash: evidenceRefsHash(a.missionEvidenceRefs),
        identityConfidence: a.identityConfidence, relevance: a.relevance, discoveryOrigin: a.discoveryOrigin,
        candidateBindingHash: candidateBinding(assessment, a),
        decision: null, decisionReason: null, actorType: null, actorIdentity: null, decidedAt: null };
    }),
  };
}

/**
 * validatePanelValidation(validation, assessment, ctx)
 * ctx.runManifest  : requis en production
 * ctx.production   : true => manifeste PRODUCTION + liaison d'artefact exigee
 */
function validatePanelValidation(validation, assessment, ctx) {
  ctx = ctx || {};
  const problems = [];
  if (!validation || validation.schema !== "EvidenceForge.ProfessionalPanelValidation") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], approved: [], counts: {} };
  }
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    return { valid: false, problems: ["ProfessionalCandidateAssessment requise pour verifier le binding"], approved: [], counts: {} };
  }
  if (ctx.production === true) {
    if (!ctx.runManifest) problems.push("mode production sans RunEvidenceManifest : aucune provenance verifiable.");
    else {
      try { RM.assertProductionEvidence(validation, ctx.runManifest, "ProfessionalPanelValidation"); } catch (e) { problems.push(e.message); }
      try { RM.assertProductionEvidence(assessment, ctx.runManifest, "ProfessionalCandidateAssessment"); } catch (e) { problems.push(e.message); }
    }
  }
  // §6 — comparaison REELLE de tous les bindings
  try { assertRefMatches(validation.validatesAssessmentRef, assessment, "validatesAssessmentRef"); } catch (e) { problems.push(e.message); }
  if (validation.candidateAssessmentHash !== assessmentHash(assessment)) problems.push("candidateAssessmentHash obsolete — l'evaluation a change.");
  if (validation.missionHash !== missionBinding(assessment)) problems.push("missionHash obsolete — la mission a change.");
  if (validation.missionId !== assessment.missionId) problems.push("missionId different de celui de l'evaluation.");
  const dRef = assessment.assessesDiscoveryRef, vRef = assessment.assessesVerificationRef;
  if (!validation.validatesDiscoveryRef || !dRef || validation.validatesDiscoveryRef.sha256 !== dRef.sha256) problems.push("validatesDiscoveryRef obsolete — l'artefact de decouverte a change.");
  if (!validation.validatesVerificationRef || !vRef || validation.validatesVerificationRef.sha256 !== vRef.sha256) problems.push("validatesVerificationRef obsolete — l'artefact de verification a change.");

  const byId = new Map();
  (assessment.assessments || []).forEach((a) => byId.set(a.candidateId, a));
  const presentableIds = new Set((assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).map((a) => a.candidateId));
  const seen = new Set(), approved = [];

  (validation.decisions || []).forEach(function (d, i) {
    const tag = "decisions[" + i + "] (" + (d && d.candidateId) + ")";
    if (!d || !isNonEmptyStr(d.candidateId)) { problems.push(tag + " : candidateId manquant"); return; }
    if (!presentableIds.has(d.candidateId)) { problems.push(tag + " : candidat non presentable a la porte humaine"); return; }
    if (seen.has(d.candidateId)) { problems.push(tag + " : doublon de decision"); return; }
    seen.add(d.candidateId);
    if (ALLOWED.indexOf(d.decision) === -1) { problems.push(tag + " : decision invalide " + JSON.stringify(d.decision)); return; }
    if (!isNonEmptyStr(d.decisionReason)) { problems.push(tag + " : decisionReason non vide requise"); return; }
    try { assertHumanAct(d, tag); } catch (e) { problems.push(e.message); return; }
    const a = byId.get(d.candidateId);
    if (d.evidenceRefsHash !== evidenceRefsHash(a.missionEvidenceRefs)) { problems.push(tag + " : evidenceRefsHash obsolete — les preuves ont change."); return; }
    if (d.candidateBindingHash !== candidateBinding(assessment, a)) { problems.push(tag + " : candidateBindingHash obsolete — identite, preuves, mission ou artefacts amont ont change."); return; }
    if (d.decision === DECISION.APPROVE) {
      if (!Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0) { problems.push(tag + " : APPROVE exige evidenceRefs non vides"); return; }
      if (d.identityConfidence === "AMBIGUOUS") { problems.push(tag + " : APPROVE impossible sur une identite AMBIGUOUS"); return; }
      approved.push(d.candidateId);
    }
  });
  presentableIds.forEach(function (id) {
    if (!seen.has(id)) problems.push("aucune decision fournie pour \"" + id + "\" (exhaustivite requise).");
  });
  if (problems.length) return { valid: false, problems: problems, approved: [], counts: {} };
  const counts = {}; ALLOWED.forEach((k) => { counts[k] = (validation.decisions || []).filter((d) => d.decision === k).length; });
  return { valid: true, problems: [], approved: approved, counts: counts };
}

function decisionsById(validation) {
  const m = new Map();
  (validation && validation.decisions || []).forEach((d) => m.set(d.candidateId, d.decision));
  return m;
}

module.exports = { buildPanelValidationTemplate, validatePanelValidation, decisionsById, candidateBinding, missionBinding, evidenceRefsHash, assessmentHash, DECISION, ALLOWED };
