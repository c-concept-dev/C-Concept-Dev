"use strict";
/**
 * MONO-10 v0.5 — core/panel-gate.js   (§19, §20)
 *
 * FERMETURE v0.4 B04 — le defaut le plus grave apres la racine de confiance.
 *
 * En v0.4, `missionEvidenceRefs` et `decision.evidenceRefs` etaient des CHAINES
 * OPAQUES. Elles etaient hachees des deux cotes — donc non reinscriptibles —
 * mais jamais RESOLUES. Un candidat dont toute la base documentaire etait
 * inventee (« oeuvre-totalement-inventee-1 ») entrait au corpus et la chaine
 * atteignait QUALIFIED puis AUTHORIZED, revetue du tampon d'authentification.
 *
 * v0.5 : les preuves sur lesquelles un humain approuve doivent RESOUDRE contre
 * le registre AUTHENTIFIE du run — existence, empreinte, type, relation, run,
 * mission, attestation. Une reference inventee est rejetee ; une preuve d'un
 * autre run ou d'une autre mission aussi.
 *
 * §20 — la decision humaine est liee a TOUT ce qu'elle valide, y compris
 * l'identite authentifiee de l'acteur.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { artifactRef, assertRefMatches, resolveLineage, RELATION } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { verifyHumanActAuthenticity, assertHumanActDeclaration } = require("./human-act.js");
const AAR = require("./authenticated-artifact-registry.js");
const RM = require("./run-evidence-manifest.js");

const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };
const ALLOWED = [DECISION.APPROVE, DECISION.REJECT, DECISION.DEFER];

function missionBinding(a) { return sha256Of({ missionId: a.missionId, missionHash: a.missionHash || null, missionLabels: (a.missionLabels || []).slice().sort() }); }
/** Les references sont des objets de lignee : l'empreinte couvre leur identite complete. */
function evidenceRefsHash(refs) {
  return sha256Of((refs || []).map((r) => (r && typeof r === "object")
    ? { artifactId: r.artifactId, relation: r.relation, sha256: r.sha256 } : { opaque: String(r) })
    .slice().sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)));
}
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
    runId: rb ? rb.runId : (assessment.runId || null),
    attestationHash: rb ? rb.attestationHash : null,
    operatorTrustBoundaryId: rb ? rb.operatorTrustBoundaryId : null,
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
      + "Aucune valeur par defaut. DEFER est un etat legitime. L'authenticite de l'acte est etablie par la "
      + "frontiere operateur, jamais par une declaration d'identite.",
    schema: "EvidenceForge.ProfessionalPanelValidation", schemaVersion: "MONO-10-v5",
    missionId: assessment.missionId, missionHash: missionBinding(assessment),
    runId: rb ? rb.runId : (assessment.runId || null),
    attestationHash: rb ? rb.attestationHash : null,
    operatorTrustBoundaryId: rb ? rb.operatorTrustBoundaryId : null,
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
 * ctx : { manifest, verifier, artifactRegistry }
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
  if (ctx.manifest) {
    if (RM.isProductionContext(ctx)) {
      try { RM.assertProductionEvidence(validation, ctx, "ProfessionalPanelValidation"); } catch (e) { problems.push(e.message); }
      try { RM.assertProductionEvidence(assessment, ctx, "ProfessionalCandidateAssessment"); } catch (e) { problems.push(e.message); }
    } else {
      try { RM.assertArtifactBoundToRun(validation, ctx.manifest, "ProfessionalPanelValidation"); } catch (e) { problems.push(e.message); }
      try { RM.assertArtifactBoundToRun(assessment, ctx.manifest, "ProfessionalCandidateAssessment"); } catch (e) { problems.push(e.message); }
    }
  }
  // §19 — le registre doit etre celui du run authentifie.
  const registry = ctx.artifactRegistry;
  if (!AAR.isAuthenticatedRegistry(registry)) {
    problems.push("aucun registre d'artefacts authentifie : les preuves vues par l'humain ne peuvent pas etre resolues.");
  } else if (ctx.manifest) {
    try { AAR.assertAuthenticatedRegistry(registry, ctx.manifest, "registre de la porte humaine"); } catch (e) { problems.push(e.message); }
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
    if (validation.operatorTrustBoundaryId !== rb.operatorTrustBoundaryId) problems.push("frontiere operateur differente de celle de l'evaluation.");
  }
  const dRef = assessment.assessesDiscoveryRef, vRef = assessment.assessesVerificationRef;
  if (!validation.validatesDiscoveryRef || !dRef || validation.validatesDiscoveryRef.sha256 !== dRef.sha256) problems.push("validatesDiscoveryRef obsolete.");
  if (!validation.validatesVerificationRef || !vRef || validation.validatesVerificationRef.sha256 !== vRef.sha256) problems.push("validatesVerificationRef obsolete.");

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

    const auth = verifyHumanActAuthenticity(d, ctx, tag);
    authAct.set(d.candidateId, auth.authenticated);
    if (auth.authenticated) authenticatedActs++;
    else problems.push(auth.problems.join(" ; "));

    const a = byId.get(d.candidateId);
    const declaredHash = evidenceRefsHash(d.evidenceRefs);
    const upstreamHash = evidenceRefsHash(a.missionEvidenceRefs);
    if (declaredHash !== upstreamHash) { problems.push(tag + " : les preuves portees par la decision ne sont plus celles de l'evaluation — ce que l'humain a vu a ete reecrit."); return; }
    if (d.evidenceRefsHash !== upstreamHash) { problems.push(tag + " : evidenceRefsHash obsolete."); return; }
    if (d.candidateBindingHash !== candidateBinding(assessment, a)) { problems.push(tag + " : candidateBindingHash obsolete — identite, preuves, mission, run, frontiere ou artefacts amont ont change."); return; }

    // §19 — LA FERMETURE : les preuves doivent RESOUDRE, pas seulement concorder.
    if (AAR.isAuthenticatedRegistry(registry)) {
      const refs = Array.isArray(d.evidenceRefs) ? d.evidenceRefs : [];
      if (refs.length === 0 && d.decision === DECISION.APPROVE) { problems.push(tag + " : APPROVE exige des preuves non vides"); return; }
      if (refs.length) {
        const res = resolveLineage(refs, registry, {
          expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
          expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
          expectedAttestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : undefined,
          requireRunBinding: true });
        if (!res.resolved) {
          problems.push(tag + " : les preuves presentees a l'humain ne resolvent pas contre le registre authentifie — "
            + res.problems.slice(0, 2).join(" ; ") + ". Une preuve inventee n'est pas une preuve."); return;
        }
        const wrongRelation = res.resolvedRefs.filter((r) => r.relation !== RELATION.DOCUMENTARY_EVIDENCE);
        if (wrongRelation.length) {
          problems.push(tag + " : preuve(s) de relation inattendue (" + wrongRelation.map((r) => r.relation).join(", ")
            + ") — une approbation documentaire porte sur des preuves documentaires."); return;
        }
      }
    }
    if (d.decision === DECISION.APPROVE) {
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
