"use strict";
/**
 * MONO-10 v0.1 — lib/panel-gate.js
 *
 * FERMETURE DE A-07. Porte humaine d'admissibilite au panel documentaire.
 *
 * Elle ne valide PAS que le professionnel a raison, que sa conclusion est vraie,
 * que sa discipline prime, ni que la mission est resolue. Elle valide
 * l'admissibilite documentaire, et rien d'autre.
 *
 * ORCID est une preuve d'IDENTITE. ORCID_PRESENT n'implique JAMAIS APPROVE.
 */

const { isNonEmptyStr, fail, assertHumanAct, artifactRef, assertBound } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");

const DECISION = {
  APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL",
  REJECT: "REJECT",
  DEFER: "DEFER",
};
const ALLOWED = [DECISION.APPROVE, DECISION.REJECT, DECISION.DEFER];
const CONFIDENCE = ["STRONG", "PROVIDER_ID_ONLY", "NAME_ONLY", "AMBIGUOUS"];

/**
 * buildPanelValidationTemplate(assessment) — gabarit VIDE.
 * Ne pre-remplit jamais decision / actorIdentity / decidedAt / decisionReason.
 * Seuls les candidats PRESENT_FOR_HUMAN_REVIEW y figurent (amendement 1).
 */
function buildPanelValidationTemplate(assessment) {
  if (!assessment || assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    throw fail("PANEL_TEMPLATE_INPUT_INVALID", "ProfessionalCandidateAssessment requis.");
  }
  const presentable = (assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT);
  return {
    _readme: "Gabarit de porte humaine. Completer decision/decisionReason/actorIdentity/decidedAt pour CHAQUE entree. Aucune valeur par defaut n'existe. DEFER est un etat legitime et definitif tant qu'il n'est pas repris par un humain.",
    schema: "EvidenceForge.ProfessionalPanelValidation", schemaVersion: "MONO-10-v1",
    missionId: assessment.missionId,
    validatesAssessmentRef: artifactRef(assessment, assessment.artifactId || "candidate-assessment"),
    validatesDiscoveryRef: assessment.assessesDiscoveryRef,
    validatesVerificationRef: assessment.assessesVerificationRef,
    decisions: presentable.map(function (a) {
      return {
        candidateId: a.candidateId,
        professionalIdentity: a.professionalIdentity,
        evidenceRefs: a.missionEvidenceRefs,
        disciplineBindings: a.disciplineBindings,
        discoveryOrigin: a.discoveryOrigin,
        identityConfidence: deriveIdentityConfidence(a),
        ambiguities: a.ambiguities,
        decision: null, decisionReason: null,
        actorType: null, actorIdentity: null, decidedAt: null,
      };
    }),
  };
}

function deriveIdentityConfidence(a) {
  if (a.ambiguities && a.ambiguities.length) return "AMBIGUOUS";
  const hasOrcid = !!(a.professionalIdentity && a.professionalIdentity.orcid);
  const hasProviderId = !!(a.professionalIdentity && a.professionalIdentity.providerAuthorId);
  if (hasOrcid && hasProviderId) return "STRONG";
  if (hasProviderId) return "PROVIDER_ID_ONLY";
  return "NAME_ONLY";
}

/**
 * validatePanelValidation(validation, assessment, opts)
 * opts.allowFixture : uniquement pour les tests ; jamais en production.
 * Fail-closed sur toute anomalie. Aucune decision par defaut n'est jamais deduite.
 */
function validatePanelValidation(validation, assessment, opts) {
  opts = opts || {};
  const problems = [];
  if (!validation || validation.schema !== "EvidenceForge.ProfessionalPanelValidation") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], approved: [] };
  }
  try {
    assertBound(validation.validatesAssessmentRef, "validatesAssessmentRef");
    assertBound(validation.validatesVerificationRef, "validatesVerificationRef");
  } catch (e) { problems.push(e.message); }

  const presentable = (assessment && assessment.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT);
  const presentableIds = new Set(presentable.map((a) => a.candidateId));
  const seen = new Set();
  const approved = [];

  (validation.decisions || []).forEach(function (d, i) {
    const tag = "decisions[" + i + "] (" + (d && d.candidateId) + ")";
    if (!d || !isNonEmptyStr(d.candidateId)) { problems.push(tag + " : candidateId manquant"); return; }
    if (!presentableIds.has(d.candidateId)) {
      problems.push(tag + " : candidat non presentable a la porte humaine (statut d'evaluation different de " + ASSESS.PRESENT + ") — jamais accepte");
      return;
    }
    if (seen.has(d.candidateId)) { problems.push(tag + " : doublon de decision"); return; }
    seen.add(d.candidateId);

    if (ALLOWED.indexOf(d.decision) === -1) { problems.push(tag + " : decision invalide (" + JSON.stringify(d.decision) + "), attendu " + ALLOWED.join(" | ")); return; }
    if (!isNonEmptyStr(d.decisionReason)) { problems.push(tag + " : decisionReason non vide requise"); return; }
    if (CONFIDENCE.indexOf(d.identityConfidence) === -1) { problems.push(tag + " : identityConfidence invalide"); return; }
    try { assertHumanAct(d, tag, { allowFixture: opts.allowFixture === true }); }
    catch (e) { problems.push(e.message); return; }

    if (d.decision === DECISION.APPROVE) {
      if (!Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0) {
        problems.push(tag + " : APPROVE exige evidenceRefs non vides — jamais une approbation sans preuve"); return;
      }
      if (d.identityConfidence === "AMBIGUOUS") {
        problems.push(tag + " : APPROVE impossible sur une identite AMBIGUOUS"); return;
      }
      approved.push(d.candidateId);
    }
  });

  presentable.forEach(function (a) {
    if (!seen.has(a.candidateId)) {
      problems.push("aucune decision fournie pour le candidat \"" + a.candidateId + "\" presente a la revue humaine (exhaustivite requise, jamais un candidat ignore silencieusement)");
    }
  });

  if (problems.length) return { valid: false, problems: problems, approved: [] };
  const byDecision = {};
  ALLOWED.forEach((k) => { byDecision[k] = (validation.decisions || []).filter((d) => d.decision === k).length; });
  return { valid: true, problems: [], approved: approved, counts: byDecision };
}

/** Ensemble des candidats REELLEMENT approuves par un humain. */
function approvedPanelMembers(validation, assessment, opts) {
  const r = validatePanelValidation(validation, assessment, opts);
  if (!r.valid) {
    throw fail("PANEL_VALIDATION_INVALID", r.problems.join(" ; "));
  }
  return new Set(r.approved);
}

module.exports = { buildPanelValidationTemplate, validatePanelValidation, approvedPanelMembers, deriveIdentityConfidence, DECISION, ALLOWED };
