"use strict";
/**
 * MONO-10 v0.5 — core/candidate-assessment.js
 *
 * Reduit le vivier brut aux candidats disposant d'une base documentaire
 * suffisante pour qu'une revue HUMAINE ait un sens.
 *
 * CE N'EST PAS UNE DECISION D'ADMISSION. Aucun etat ne vaut approbation, et
 * aucun etat ne porte de jugement sur la competence reelle d'une personne.
 *
 * v0.4 : la confiance d'identite passe par le registre d'autorites EXTERIEUR
 * (§8/§9) ; les inconnus portent leur run ; aucune autorite n'est deduite d'un
 * identifiant. Le noyau ne connait ni registre, ni discipline, ni fournisseur.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { artifactRef, RELATION } = require("./lineage.js");
const { deriveIdentityConfidence, CONFIDENCE, DISPLAY_NAME_TYPE } = require("./identity-evidence.js");
const AC = require("./artifact-capabilities.js");
const OTV = require("./operator-trust-verifier.js");
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

function assessCandidates(input) {
  input = input || {};
  const discovery = input.discovery, verification = input.verification;
  if (!discovery || discovery.schema !== "EvidenceForge.ProfessionalDiscovery") throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalDiscovery requis.");
  if (!verification || verification.schema !== "EvidenceForge.ProfessionalVerification") throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalVerification requis.");
  const missionLabels = (input.missionLabels || []).slice();
  const runId = isNonEmptyStr(input.runId) ? input.runId : null;
  /**
   * §11/§12 (v0.9) — FERMETURE R3. La politique d'identite de l'appelant peut
   * RESTREINDRE, jamais elargir. En v0.8, `policy.identity` etait fusionnee
   * telle quelle dans le contexte d'identite : un `policy.identity.verifier`
   * devenait l'autorite, et `minMissionEvidenceRefs: 0` abaissait l'exigence.
   */
  const SECURE = { minMissionEvidenceRefs: 1, minIdentityConfidence: CONFIDENCE.MODERATE };
  const raw = input.policy || {};
  const policyRefused = [];
  const policy = Object.assign({}, SECURE);
  if (typeof raw.minMissionEvidenceRefs === "number") {
    if (raw.minMissionEvidenceRefs >= SECURE.minMissionEvidenceRefs) policy.minMissionEvidenceRefs = raw.minMissionEvidenceRefs;
    else policyRefused.push("minMissionEvidenceRefs");
  }
  if (isNonEmptyStr(raw.minIdentityConfidence)) {
    if (rankConfidence(raw.minIdentityConfidence) >= rankConfidence(SECURE.minIdentityConfidence)) {
      policy.minIdentityConfidence = raw.minIdentityConfidence;
    } else policyRefused.push("minIdentityConfidence");
  }
  if (raw.relevance) policy.relevance = raw.relevance;
  if (raw.identity) {
    // §9 — aucune autorite, aucun verificateur, aucun callback ne passe par la politique.
    Object.keys(raw.identity).forEach(function (k) {
      if (/verifier|authority|provenance|callback|resolver/i.test(k) || typeof raw.identity[k] === "function") {
        policyRefused.push("identity." + k);
      }
    });
  }
  const extract = typeof input.identityExtractor === "function" ? input.identityExtractor : defaultIdentityExtractor;
  // §24/§25 — la confiance d'identite se derive d'une provenance RESOLUE
  // contre le registre authentifie du run, jamais d'un libelle inline.
  // §9 — le contexte d'identite est construit ICI, jamais fusionne depuis la
  // politique de l'appelant. Le verificateur n'est retenu que s'il est marque.
  const idOpts = { registry: input.artifactRegistry,
    expectedRunId: runId, expectedMissionHash: input.missionHash,
    expectedAttestationHash: input.attestationHash,
    verifier: OTV.isOperatorTrustVerifier(input.verifier) ? input.verifier : null };

  const verByKey = new Map();
  (verification.verified || []).forEach((v) => verByKey.set(String(v.candidateRef) + "|" + v.displayName, v));

  let unknowns = (input.upstreamUnknowns || []).slice();
  const mkUnk = (reason, blocking, refs) => makeUnknown({ originArtifact: "ProfessionalCandidateAssessment", reason: reason, blockingStatus: blocking, evidenceRefs: refs, runId: runId });

  const assessments = (discovery.candidates || []).map(function (c) {
    const v = verByKey.get(String(c.candidateRef) + "|" + c.displayName) || {};
    const identityEvidence = extract(c, v) || [];
    const idc = deriveIdentityConfidence(identityEvidence, idOpts);
    /**
     * §21/§30 — une preuve dont la provenance n'est pas AUTHENTIFIEE ne peut
     * pas etre presentee a un humain. On ne demande pas a un panel de statuer
     * sur une preuve que l'autorite de provenance de l'exploitant ne reconnait
     * pas. Les references ecartees sont CONSIGNEES, jamais effacees.
     */
    const declaredEvidenceRefs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs.slice() : [];
    const reg = input.artifactRegistry;
    const unauthenticatedEvidenceRefs = [];
    const missionEvidenceRefs = (reg && typeof reg.get === "function")
      ? declaredEvidenceRefs.filter(function (r) {
          let e = null;
          try { e = r && r.artifactId ? reg.get(r.artifactId) : null; } catch (err) { e = null; }
          const ok = AC.hasCapability(e, AC.CAPABILITY.AUTHENTICATED_PROVENANCE);
          if (!ok) unauthenticatedEvidenceRefs.push({ artifactId: (r && r.artifactId) || null,
            reason: "provenance non authentifiee par l'autorite de l'exploitant" });
          return ok;
        })
      : declaredEvidenceRefs;
    const candidateLabels = Array.isArray(c.disciplines) ? c.disciplines.slice() : (isNonEmptyStr(c.dimensionRef) ? [c.dimensionRef] : []);
    const rel = assessRelevance({ candidateLabels: candidateLabels, missionLabels: missionLabels, semanticOracle: input.semanticOracle, policy: policy.relevance });

    const reasons = [];
    let status;
    if (idc.confidence === CONFIDENCE.AMBIGUOUS) {
      status = STATUS.AMBIGUOUS;
      reasons.push("identite non resolue : " + idc.reasons.join(" ; ") + ". Une revue humaine ne peut porter sur une identite incertaine.");
      unknowns = propagate(unknowns, [mkUnk("identite ambigue pour \"" + c.displayName + "\"", BLOCKING.BLOCKING, [])], { requireResolvableEvidence: false });
    } else if (rel.relevance === RELEVANCE.OUT_OF_SCOPE) {
      status = STATUS.OUT_OF_SCOPE;
      reasons.push("relation documentaire hors champ, etablie explicitement : " + rel.reasons.join(" ; "));
    } else if (missionEvidenceRefs.length < policy.minMissionEvidenceRefs) {
      status = STATUS.INSUFFICIENT;
      reasons.push(missionEvidenceRefs.length + " oeuvre(s) rattachee(s) a provenance AUTHENTIFIEE, minimum "
        + policy.minMissionEvidenceRefs + (unauthenticatedEvidenceRefs.length
          ? " (" + unauthenticatedEvidenceRefs.length + " reference(s) ecartee(s) : provenance non authentifiee)" : "") + ".");
      unknowns = propagate(unknowns, [mkUnk("base documentaire insuffisante pour \"" + c.displayName + "\" dans ce run", BLOCKING.NON_BLOCKING, [])], { requireResolvableEvidence: false });
    } else if (rankConfidence(idc.confidence) < rankConfidence(policy.minIdentityConfidence)) {
      status = STATUS.INSUFFICIENT;
      reasons.push("confiance d'identite " + idc.confidence + " inferieure au minimum " + policy.minIdentityConfidence + " : " + idc.reasons.join(" ; "));
      unknowns = propagate(unknowns, [mkUnk("identite insuffisamment corroboree pour \"" + c.displayName + "\"", BLOCKING.NON_BLOCKING, [])], { requireResolvableEvidence: false });
    } else {
      status = STATUS.PRESENT;
      reasons.push("identite " + idc.confidence + " (" + idc.independentProviders + " source(s) dont l'independance est demontree) et "
        + missionEvidenceRefs.length + " oeuvre(s) rattachee(s) : une revue humaine peut porter sur des elements verifiables.");
      if (rel.relevance === RELEVANCE.UNKNOWN) {
        unknowns = propagate(unknowns, [mkUnk("relation a la mission INCONNUE pour \"" + c.displayName + "\" : ni etablie, ni ecartee", BLOCKING.NON_BLOCKING, [])], { requireResolvableEvidence: false });
      }
    }

    return {
      candidateId: isNonEmptyStr(c.candidateRef) ? c.candidateRef : ("unresolved:" + c.displayName),
      professionalIdentity: { displayName: c.displayName, affiliations: Array.isArray(c.affiliations) ? c.affiliations : (isNonEmptyStr(c.affiliation) ? [c.affiliation] : []) },
      identityEvidence: identityEvidence,
      identityConfidence: idc.confidence,
      identityConfidenceReasons: idc.reasons,
      identityIndependenceRelations: idc.independenceRelations,
      missionEvidenceRefs: missionEvidenceRefs,
      policyKeysRefused: policyRefused.slice(),
      declaredEvidenceRefs: declaredEvidenceRefs,
      unauthenticatedEvidenceRefs: unauthenticatedEvidenceRefs,
      relevance: rel.relevance, relevanceReasons: rel.reasons,
      discoveryOrigin: c.candidateStatus || null,
      documentaryVerificationStatus: v.verificationStatus || null,
      assessmentStatus: status, assessmentReasons: reasons,
      notAJudgement: NOT_A_JUDGEMENT,
    };
  });

  assessments.forEach(function (a) {
    if (APPROVAL_LIKE.indexOf(a.assessmentStatus) !== -1) throw fail("ASSESSMENT_IMPLIES_APPROVAL", "statut \"" + a.assessmentStatus + "\" evoque une admission — seul un humain approuve.");
  });

  const counts = {};
  Object.keys(STATUS).forEach((k) => { counts[STATUS[k]] = assessments.filter((a) => a.assessmentStatus === STATUS[k]).length; });

  const out = {
    schema: "EvidenceForge.ProfessionalCandidateAssessment", schemaVersion: "MONO-10-v5",
    assessmentId: isNonEmptyStr(input.assessmentId) ? input.assessmentId : "candidate-assessment",
    missionId: discovery.missionId || null,
    missionHash: isNonEmptyStr(input.missionHash) ? input.missionHash : null,
    runId: runId,
    missionLabels: missionLabels,
    assessesDiscoveryRef: artifactRef(discovery, input.discoveryArtifactId || "professional-discovery", RELATION.DISCOVERY),
    assessesVerificationRef: artifactRef(verification, input.verificationArtifactId || "professional-verification", RELATION.VERIFICATION),
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
  };
  return out;
}

function rankConfidence(c) { return { WEAK: 0, AMBIGUOUS: 0, MODERATE: 1, STRONG: 2 }[c] || 0; }

/**
 * Extracteur STRUCTUREL par defaut. Il ne DEDUIT aucune autorite et n'en accepte
 * aucune en libelle : chaque preuve porte une `provenanceRef`, reference de
 * lignee vers un enregistrement documentaire du registre AUTHENTIFIE. Sans
 * cette reference, l'independance restera INCONNUE — jamais presumee.
 */
function defaultIdentityExtractor(c, v) {
  const out = [];
  const push = (type, id, provenanceRef, binding, verif, contrib) => {
    if (!isNonEmptyStr(id)) return;
    out.push({ evidenceType: type, identifier: id, assertedValue: null,
      provenanceRef: provenanceRef || null,
      subjectBinding: binding, verificationStatus: verif, confidenceContribution: contrib });
  };
  push("provider-native-id", c.candidateRef, c.provenanceRef,
    "CONFIRMED", v && v.verificationStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED", 0.6);
  (Array.isArray(c.identifiers) ? c.identifiers : []).forEach(function (x) {
    push(x.type || "external-id", x.value, x.provenanceRef,
      x.subjectBinding || "CONFIRMED", x.verificationStatus || "UNVERIFIED",
      typeof x.confidenceContribution === "number" ? x.confidenceContribution : 0.5);
  });
  if (isNonEmptyStr(c.displayName)) {
    out.push({ evidenceType: DISPLAY_NAME_TYPE, identifier: null, assertedValue: c.displayName, provenanceRef: null,
      subjectBinding: c.identityAmbiguity ? "AMBIGUOUS" : "ASSERTED", verificationStatus: "UNKNOWN", confidenceContribution: 0 });
  }
  return out;
}

module.exports = { assessCandidates, defaultIdentityExtractor, STATUS, NOT_A_JUDGEMENT };
