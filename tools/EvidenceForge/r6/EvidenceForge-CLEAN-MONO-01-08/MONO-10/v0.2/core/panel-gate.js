"use strict";
/**
 * MONO-10 v0.2 — core/panel-gate.js
 *
 * Porte humaine d'admissibilite documentaire.
 *
 * FERMETURE F-03 : le binding n'est plus seulement syntaxique. Chaque decision
 * porte les empreintes de l'evaluation, de la mission et des preuves qu'elle
 * valide ; a la consommation, elles sont RECALCULEES et COMPAREES. Une
 * approbation ne survit jamais a un changement d'evaluation, de mission, de
 * preuves ou de candidat.
 *
 * FERMETURE F-08 : en mode production, toute fixture est refusee.
 */

const { isNonEmptyStr, fail, stamp, CLASS, assertProductionEvidence } = require("./execution-evidence.js");
const { artifactRef, assertHumanAct, assertBound, assertRefMatches, sha256Of } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");

const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };
const ALLOWED = [DECISION.APPROVE, DECISION.REJECT, DECISION.DEFER];

/** Empreinte semantique d'un candidat : identite + preuves + mission. */
function candidateBinding(assessment, a) {
  return sha256Of({ missionId: assessment.missionId, missionLabels: assessment.missionLabels || [],
    candidateId: a.candidateId, evidenceRefs: (a.missionEvidenceRefs || []).slice().sort(),
    identityConfidence: a.identityConfidence });
}

function buildPanelValidationTemplate(assessment, opts) {
  opts = opts || {};
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    throw fail("PANEL_TEMPLATE_INPUT_INVALID", "ProfessionalCandidateAssessment requis.");
  }
  const assessmentRef = artifactRef(assessment, "candidate-assessment");
  const presentable = (assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT);
  return Object.assign({
    _readme: "Porte humaine. Completer decision/decisionReason/actorIdentity/decidedAt pour CHAQUE entree. Aucune valeur par defaut. DEFER est un etat legitime et definitif tant qu'un humain ne le reprend pas.",
    schema: "EvidenceForge.ProfessionalPanelValidation", schemaVersion: "MONO-10-v2",
    missionId: assessment.missionId,
    missionBindingHash: sha256Of({ missionId: assessment.missionId, missionLabels: assessment.missionLabels || [] }),
    validatesAssessmentRef: assessmentRef,
    validatesDiscoveryRef: assessment.assessesDiscoveryRef,
    validatesVerificationRef: assessment.assessesVerificationRef,
    decisions: presentable.map(function (a) {
      return { candidateId: a.candidateId, professionalIdentity: a.professionalIdentity,
        evidenceRefs: (a.missionEvidenceRefs || []).slice(), identityConfidence: a.identityConfidence,
        relevance: a.relevance, discoveryOrigin: a.discoveryOrigin,
        candidateBindingHash: candidateBinding(assessment, a),
        decision: null, decisionReason: null, actorType: null, actorIdentity: null, decidedAt: null };
    }),
  }, stamp(opts.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

/**
 * validatePanelValidation(validation, assessment, mode)
 * mode.production === true : fixtures refusees, bindings recalcules.
 */
function validatePanelValidation(validation, assessment, mode) {
  mode = mode || {};
  const problems = [];
  if (!validation || validation.schema !== "EvidenceForge.ProfessionalPanelValidation") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], approved: [], counts: {} };
  }
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    return { valid: false, problems: ["ProfessionalCandidateAssessment requise pour verifier le binding"], approved: [], counts: {} };
  }
  if (mode.production === true) {
    try { assertProductionEvidence(validation, "ProfessionalPanelValidation", mode); } catch (e) { problems.push(e.message); }
  }
  // F-03 : comparaison REELLE des bindings.
  try { assertRefMatches(validation.validatesAssessmentRef, assessment, "validatesAssessmentRef"); }
  catch (e) { problems.push(e.message); }
  const missionHashNow = sha256Of({ missionId: assessment.missionId, missionLabels: assessment.missionLabels || [] });
  if (validation.missionBindingHash !== missionHashNow) {
    problems.push("missionBindingHash : la mission a change depuis l'approbation — approbation invalide.");
  }

  const byId = new Map();
  (assessment.assessments || []).forEach((a) => byId.set(a.candidateId, a));
  const presentableIds = new Set((assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).map((a) => a.candidateId));
  const seen = new Set(), approved = [];

  (validation.decisions || []).forEach(function (d, i) {
    const tag = "decisions[" + i + "] (" + (d && d.candidateId) + ")";
    if (!d || !isNonEmptyStr(d.candidateId)) { problems.push(tag + " : candidateId manquant"); return; }
    if (!presentableIds.has(d.candidateId)) { problems.push(tag + " : candidat non presentable a la porte humaine — jamais accepte"); return; }
    if (seen.has(d.candidateId)) { problems.push(tag + " : doublon de decision"); return; }
    seen.add(d.candidateId);
    if (ALLOWED.indexOf(d.decision) === -1) { problems.push(tag + " : decision invalide " + JSON.stringify(d.decision)); return; }
    if (!isNonEmptyStr(d.decisionReason)) { problems.push(tag + " : decisionReason non vide requise"); return; }
    try { assertHumanAct(d, tag, mode); } catch (e) { problems.push(e.message); return; }

    const expected = candidateBinding(assessment, byId.get(d.candidateId));
    if (d.candidateBindingHash !== expected) {
      problems.push(tag + " : candidateBindingHash obsolete — identite, preuves ou mission ont change depuis l'approbation.");
      return;
    }
    if (d.decision === DECISION.APPROVE) {
      if (!Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0) { problems.push(tag + " : APPROVE exige evidenceRefs non vides"); return; }
      if (d.identityConfidence === "AMBIGUOUS") { problems.push(tag + " : APPROVE impossible sur une identite AMBIGUOUS"); return; }
      approved.push(d.candidateId);
    }
  });

  presentableIds.forEach(function (id) {
    if (!seen.has(id)) problems.push("aucune decision fournie pour le candidat \"" + id + "\" presente a la revue humaine (exhaustivite requise).");
  });

  if (problems.length) return { valid: false, problems: problems, approved: [], counts: {} };
  const counts = {}; ALLOWED.forEach((k) => { counts[k] = (validation.decisions || []).filter((d) => d.decision === k).length; });
  return { valid: true, problems: [], approved: approved, counts: counts };
}

function approvedPanelMembers(validation, assessment, mode) {
  const r = validatePanelValidation(validation, assessment, mode);
  if (!r.valid) throw fail("PANEL_VALIDATION_INVALID", r.problems.join(" ; "));
  return new Set(r.approved);
}

module.exports = { buildPanelValidationTemplate, validatePanelValidation, approvedPanelMembers, candidateBinding, DECISION, ALLOWED };
