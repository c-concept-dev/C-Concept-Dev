"use strict";
/**
 * MONO-10 v0.2 — core/candidate-assessment.js
 *
 * Reduit le vivier brut aux candidats disposant d'une base documentaire
 * suffisante pour qu'une revue HUMAINE ait un sens.
 *
 * CE N'EST PAS UNE DECISION D'ADMISSION. Aucun etat ne vaut approbation, et
 * aucun etat ne porte de jugement sur la competence reelle d'une personne.
 *
 * Fermetures v0.2 :
 *   F-02 : identite via le modele generique IdentityEvidence (ORCID n'est plus
 *          privilegie) ; pertinence via relevance.js (plus d'egalite de libelles).
 *   F-06 : chaque ecart produit un UNKNOWN trace, jamais un silence.
 */

const { isNonEmptyStr, fail, stamp, CLASS } = require("./execution-evidence.js");
const { artifactRef, assertLineageNonEmpty } = require("./lineage.js");
const { deriveIdentityConfidence, CONFIDENCE } = require("./identity-evidence.js");
const { assessRelevance, RELEVANCE } = require("./relevance.js");
const { makeUnknown, propagate, BLOCKING } = require("./unknowns.js");

const STATUS = {
  PRESENT: "PRESENT_FOR_HUMAN_REVIEW",
  INSUFFICIENT: "INSUFFICIENT_DOCUMENTARY_BASIS",
  AMBIGUOUS: "IDENTITY_AMBIGUOUS",
  OUT_OF_SCOPE: "OUT_OF_SCOPE_DOCUMENTARILY",
};
const APPROVAL_LIKE = ["APPROVE", "APPROVED", "APPROVE_FOR_DOCUMENTARY_PANEL", "ADMITTED", "PANEL_MEMBER", "EXPERT"];

const NOT_A_JUDGEMENT =
  "Evaluation documentaire seule. Aucun etat ne vaut admission au panel, et aucun ne porte de jugement sur la competence reelle d'une personne. "
  + "INSUFFICIENT_DOCUMENTARY_BASIS signifie exclusivement : preuves insuffisantes pour une presentation humaine DANS CE RUN. "
  + "OUT_OF_SCOPE_DOCUMENTARILY signifie exclusivement : relation documentaire hors champ pour CETTE mission.";

/**
 * assessCandidates({ discovery, verification, missionLabels, identityExtractor,
 *                    semanticOracle, policy, upstreamUnknowns, executionEvidenceClass })
 *
 * identityExtractor(candidate) -> IdentityEvidence[]   INJECTE par l'adaptateur
 *   de domaine. Le noyau ne connait aucun registre. Absent, il retombe sur un
 *   extracteur STRUCTUREL qui ne privilegie aucun type.
 */
function assessCandidates(input) {
  input = input || {};
  const discovery = input.discovery, verification = input.verification;
  if (!discovery || discovery.schema !== "EvidenceForge.ProfessionalDiscovery") throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalDiscovery requis.");
  if (!verification || verification.schema !== "EvidenceForge.ProfessionalVerification") throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalVerification requis.");
  const evidenceClass = input.executionEvidenceClass || CLASS.REAL_RUNTIME;
  const missionLabels = (input.missionLabels || []).slice();
  const policy = Object.assign({ minMissionEvidenceRefs: 1, minIdentityConfidence: CONFIDENCE.MODERATE }, input.policy || {});
  const extract = typeof input.identityExtractor === "function" ? input.identityExtractor : defaultIdentityExtractor;

  const verByKey = new Map();
  (verification.verified || []).forEach((v) => verByKey.set(String(v.candidateRef) + "|" + v.displayName, v));

  let unknowns = (input.upstreamUnknowns || []).slice();
  const assessments = (discovery.candidates || []).map(function (c) {
    const v = verByKey.get(String(c.candidateRef) + "|" + c.displayName) || {};
    const identityEvidence = extract(c, v) || [];
    const idc = deriveIdentityConfidence(identityEvidence, policy.identity);
    const missionEvidenceRefs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs.slice() : [];
    const candidateLabels = Array.isArray(c.disciplines) ? c.disciplines.slice() : (isNonEmptyStr(c.dimensionRef) ? [c.dimensionRef] : []);
    const rel = assessRelevance({ candidateLabels: candidateLabels, missionLabels: missionLabels, semanticOracle: input.semanticOracle, policy: policy.relevance });

    const reasons = [];
    let status;
    if (idc.confidence === CONFIDENCE.AMBIGUOUS) {
      status = STATUS.AMBIGUOUS;
      reasons.push("identite non resolue : " + idc.reasons.join(" ; ") + ". Une revue humaine ne peut porter sur une identite incertaine.");
      unknowns = propagate(unknowns, [makeUnknown({ originArtifact: "ProfessionalCandidateAssessment", reason: "identite ambigue pour \"" + c.displayName + "\"", blockingStatus: BLOCKING.BLOCKING, evidenceRefs: missionEvidenceRefs })]);
    } else if (rel.relevance === RELEVANCE.OUT_OF_SCOPE) {
      status = STATUS.OUT_OF_SCOPE;
      reasons.push("relation documentaire hors champ, etablie explicitement : " + rel.reasons.join(" ; "));
    } else if (missionEvidenceRefs.length < policy.minMissionEvidenceRefs) {
      status = STATUS.INSUFFICIENT;
      reasons.push(missionEvidenceRefs.length + " oeuvre(s) rattachee(s), minimum " + policy.minMissionEvidenceRefs + ".");
      unknowns = propagate(unknowns, [makeUnknown({ originArtifact: "ProfessionalCandidateAssessment", reason: "base documentaire insuffisante pour \"" + c.displayName + "\" dans ce run", blockingStatus: BLOCKING.NON_BLOCKING, evidenceRefs: missionEvidenceRefs })]);
    } else if (rankConfidence(idc.confidence) < rankConfidence(policy.minIdentityConfidence)) {
      status = STATUS.INSUFFICIENT;
      reasons.push("confiance d'identite " + idc.confidence + " inferieure au minimum " + policy.minIdentityConfidence + " : " + idc.reasons.join(" ; "));
      unknowns = propagate(unknowns, [makeUnknown({ originArtifact: "ProfessionalCandidateAssessment", reason: "identite insuffisamment corroboree pour \"" + c.displayName + "\"", blockingStatus: BLOCKING.NON_BLOCKING, evidenceRefs: missionEvidenceRefs })]);
    } else {
      status = STATUS.PRESENT;
      reasons.push("identite " + idc.confidence + " (" + idc.independentProviders + " source(s) independante(s)) et " + missionEvidenceRefs.length + " oeuvre(s) rattachee(s) : une revue humaine peut porter sur des elements verifiables.");
      if (rel.relevance === RELEVANCE.UNKNOWN) {
        unknowns = propagate(unknowns, [makeUnknown({ originArtifact: "ProfessionalCandidateAssessment", reason: "relation a la mission INCONNUE pour \"" + c.displayName + "\" : ni etablie, ni ecartee", blockingStatus: BLOCKING.NON_BLOCKING, evidenceRefs: missionEvidenceRefs })]);
      }
    }

    return {
      candidateId: isNonEmptyStr(c.candidateRef) ? c.candidateRef : ("unresolved:" + c.displayName),
      professionalIdentity: { displayName: c.displayName, affiliations: Array.isArray(c.affiliations) ? c.affiliations : (isNonEmptyStr(c.affiliation) ? [c.affiliation] : []) },
      identityEvidence: identityEvidence,
      identityConfidence: idc.confidence,
      identityConfidenceReasons: idc.reasons,
      missionEvidenceRefs: missionEvidenceRefs,
      relevance: rel.relevance, relevanceReasons: rel.reasons,
      discoveryOrigin: c.candidateStatus || null,
      documentaryVerificationStatus: v.verificationStatus || null,
      assessmentStatus: status, assessmentReasons: reasons,
      lineageRefs: Array.isArray(c.provenance) && c.provenance.length ? c.provenance : [{ origin: "DISCOVERY", candidateRef: c.candidateRef || null }],
      notAJudgement: NOT_A_JUDGEMENT,
    };
  });

  assessments.forEach(function (a) {
    if (APPROVAL_LIKE.indexOf(a.assessmentStatus) !== -1) throw fail("ASSESSMENT_IMPLIES_APPROVAL", "statut \"" + a.assessmentStatus + "\" evoque une admission — seul un humain approuve.");
    if (!Array.isArray(a.lineageRefs) || a.lineageRefs.length === 0) throw fail("ASSESSMENT_LINEAGE_MISSING", "lineageRefs obligatoires pour \"" + a.candidateId + "\".");
  });

  const counts = {};
  Object.keys(STATUS).forEach((k) => { counts[STATUS[k]] = assessments.filter((a) => a.assessmentStatus === STATUS[k]).length; });

  return Object.assign({
    schema: "EvidenceForge.ProfessionalCandidateAssessment", schemaVersion: "MONO-10-v2",
    missionId: discovery.missionId || null,
    missionLabels: missionLabels,
    assessesDiscoveryRef: artifactRef(discovery, "professional-discovery"),
    assessesVerificationRef: artifactRef(verification, "professional-verification"),
    policy: { minMissionEvidenceRefs: policy.minMissionEvidenceRefs, minIdentityConfidence: policy.minIdentityConfidence },
    assessments: assessments,
    unknowns: unknowns,
    summary: {
      total: assessments.length,
      presentedForHumanReview: counts[STATUS.PRESENT], insufficientDocumentaryBasis: counts[STATUS.INSUFFICIENT],
      identityAmbiguous: counts[STATUS.AMBIGUOUS], outOfScopeDocumentarily: counts[STATUS.OUT_OF_SCOPE],
      humanReviewBurden: counts[STATUS.PRESENT], openUnknowns: unknowns.length,
    },
    disclaimer: NOT_A_JUDGEMENT,
  }, stamp(evidenceClass));
}

function rankConfidence(c) { return { WEAK: 0, AMBIGUOUS: 0, MODERATE: 1, STRONG: 2 }[c] || 0; }

/**
 * Extracteur STRUCTUREL par defaut : traite tout identifiant comme une preuve
 * opaque du meme rang. Il ne connait ni ORCID, ni OpenAlex, ni aucun registre.
 */
function defaultIdentityExtractor(c, v) {
  const out = [];
  const push = (type, provider, id, binding, verif, contrib) => {
    if (!isNonEmptyStr(id)) return;
    out.push({ evidenceType: type, provider: provider, identifier: id, assertedValue: null,
      subjectBinding: binding, provenance: { origin: "DISCOVERY" }, verificationStatus: verif, confidenceContribution: contrib });
  };
  push("provider-native-id", providerOf(c.candidateRef), c.candidateRef, "CONFIRMED", v && v.verificationStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED", 0.6);
  (Array.isArray(c.identifiers) ? c.identifiers : []).forEach(function (x) {
    push(x.type || "external-id", x.provider || providerOf(x.value), x.value, x.subjectBinding || "CONFIRMED", x.verificationStatus || "UNVERIFIED", typeof x.confidenceContribution === "number" ? x.confidenceContribution : 0.5);
  });
  if (isNonEmptyStr(c.displayName)) {
    out.push({ evidenceType: "display-name", provider: null, identifier: null, assertedValue: c.displayName,
      subjectBinding: c.identityAmbiguity ? "AMBIGUOUS" : "ASSERTED", provenance: { origin: "DISCOVERY" },
      verificationStatus: "UNKNOWN", confidenceContribution: 0 });
  }
  return out;
}
function providerOf(id) {
  if (!isNonEmptyStr(id)) return null;
  const m = String(id).match(/^([a-z0-9+.-]+):\/\//i);
  return m ? m[1] : null;
}

module.exports = { assessCandidates, defaultIdentityExtractor, STATUS, NOT_A_JUDGEMENT };
