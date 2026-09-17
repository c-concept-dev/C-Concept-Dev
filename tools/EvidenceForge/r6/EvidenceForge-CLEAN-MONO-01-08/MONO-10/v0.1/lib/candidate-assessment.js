"use strict";
/**
 * MONO-10 v0.1 — lib/candidate-assessment.js
 *
 * AMENDEMENT PROPRIETAIRE 1. Sans cette etape, les 51 auteurs-graines issus des
 * 22 sources incluses deviendraient 51 formulaires humains obligatoires. Cette
 * evaluation reduit le vivier aux candidats disposant d'une base documentaire
 * suffisante pour qu'une revue humaine ait un sens.
 *
 * CE N'EST PAS UNE DECISION D'ADMISSION AU PANEL.
 * Aucun statut produit ici ne signifie ni n'implique
 * APPROVE_FOR_DOCUMENTARY_PANEL. Seul un humain approuve (lib/panel-gate.js).
 *
 * INSUFFICIENT_DOCUMENTARY_BASIS n'est PAS un rejet scientifique : c'est le
 * constat que les elements disponibles ne suffisent pas a fonder une revue
 * humaine utile. La personne n'est jamais jugee.
 */

const { isNonEmptyStr, fail, artifactRef } = require("./lineage.js");

const STATUS = {
  PRESENT: "PRESENT_FOR_HUMAN_REVIEW",
  INSUFFICIENT: "INSUFFICIENT_DOCUMENTARY_BASIS",
  AMBIGUOUS: "IDENTITY_AMBIGUOUS",
  OUT_OF_SCOPE: "OUT_OF_SCOPE_DOCUMENTARILY",
};

// Aucun de ces statuts ne doit jamais etre lu comme une approbation.
const APPROVAL_LIKE = ["APPROVE", "APPROVED", "APPROVE_FOR_DOCUMENTARY_PANEL", "ADMITTED", "PANEL_MEMBER"];

/**
 * assessCandidates({ discovery, verification, missionDimensionSet, policy })
 * policy.minMissionEvidenceRefs  defaut 1 — nombre minimal d'oeuvres RETENUES
 *                                reliant le candidat a la mission
 * policy.requireStrongIdentity   defaut true — un identifiant fournisseur ou un
 *                                ORCID est requis pour presenter a un humain
 */
function assessCandidates(input) {
  input = input || {};
  const discovery = input.discovery;
  const verification = input.verification;
  const dims = (input.missionDimensionSet && Array.isArray(input.missionDimensionSet.dimensions))
    ? input.missionDimensionSet.dimensions.map((d) => d.id || d) : [];
  if (!discovery || discovery.schema !== "EvidenceForge.ProfessionalDiscovery") {
    throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalDiscovery requis.");
  }
  if (!verification || verification.schema !== "EvidenceForge.ProfessionalVerification") {
    throw fail("ASSESSMENT_INPUT_INVALID", "ProfessionalVerification requis.");
  }
  const policy = Object.assign({ minMissionEvidenceRefs: 1, requireStrongIdentity: true }, input.policy || {});

  const verByRef = new Map();
  (verification.verified || []).forEach((v) => { verByRef.set(v.candidateRef + "|" + v.displayName, v); });

  const assessments = (discovery.candidates || []).map(function (c) {
    const v = verByRef.get(c.candidateRef + "|" + c.displayName) || {};
    const identityEvidenceRefs = [];
    if (isNonEmptyStr(c.candidateRef)) identityEvidenceRefs.push(c.candidateRef);
    if (isNonEmptyStr(c.orcid)) identityEvidenceRefs.push("orcid:" + c.orcid);
    const missionEvidenceRefs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs.slice() : [];
    const disciplineBindings = Array.isArray(c.disciplines) ? c.disciplines.slice()
      : (isNonEmptyStr(c.dimensionRef) ? [c.dimensionRef] : []);
    const ambiguities = [];
    if (isNonEmptyStr(c.identityAmbiguity)) ambiguities.push(c.identityAmbiguity);
    if (v.verificationStatus === "AMBIGUOUS") ambiguities.push("EF-02B: verificationStatus=AMBIGUOUS");

    const reasons = [];
    let status;
    if (ambiguities.length) {
      status = STATUS.AMBIGUOUS;
      reasons.push("identite non resolue : " + ambiguities.join(" ; ") + ". Une revue humaine ne peut porter sur une identite incertaine.");
    } else if (dims.length && disciplineBindings.length && !disciplineBindings.some((d) => dims.indexOf(d) !== -1)) {
      status = STATUS.OUT_OF_SCOPE;
      reasons.push("aucune discipline du candidat (" + disciplineBindings.join(", ") + ") ne recoupe les dimensions de mission.");
    } else if (policy.requireStrongIdentity && identityEvidenceRefs.length === 0) {
      status = STATUS.INSUFFICIENT;
      reasons.push("aucun identifiant fort (identifiant fournisseur ou ORCID). Ce n'est pas un rejet de la personne : les elements disponibles ne permettent pas de fonder une revue humaine.");
    } else if (missionEvidenceRefs.length < policy.minMissionEvidenceRefs) {
      status = STATUS.INSUFFICIENT;
      reasons.push("seulement " + missionEvidenceRefs.length + " oeuvre(s) retenue(s) rattachee(s), minimum " + policy.minMissionEvidenceRefs + ". Ce n'est pas un rejet de la personne.");
    } else {
      status = STATUS.PRESENT;
      reasons.push("identite etablie et " + missionEvidenceRefs.length + " oeuvre(s) retenue(s) rattachee(s) : une revue humaine peut porter sur des elements verifiables.");
    }

    return {
      candidateId: c.candidateRef || ("unresolved:" + c.displayName),
      professionalIdentity: {
        providerAuthorId: c.candidateRef || null,
        orcid: c.orcid || null,
        displayName: c.displayName,
        affiliations: isNonEmptyStr(c.affiliation) ? [c.affiliation] : [],
      },
      disciplineBindings: disciplineBindings,
      discoveryOrigin: c.candidateStatus || null,
      identityEvidenceRefs: identityEvidenceRefs,
      missionEvidenceRefs: missionEvidenceRefs,
      ambiguities: ambiguities,
      assessmentStatus: status,
      assessmentReasons: reasons,
      lineageRefs: Array.isArray(c.provenance) ? c.provenance : [],
    };
  });

  // Invariant dur : aucun statut ne peut ressembler a une approbation.
  assessments.forEach(function (a) {
    if (APPROVAL_LIKE.indexOf(a.assessmentStatus) !== -1) {
      throw fail("ASSESSMENT_IMPLIES_APPROVAL", "assessmentStatus \"" + a.assessmentStatus + "\" evoque une admission au panel — seul un humain approuve.");
    }
  });

  const counts = {};
  Object.keys(STATUS).forEach((k) => { counts[STATUS[k]] = assessments.filter((a) => a.assessmentStatus === STATUS[k]).length; });

  return {
    schema: "EvidenceForge.ProfessionalCandidateAssessment", schemaVersion: "MONO-10-v1",
    missionId: discovery.missionId || null,
    assessesDiscoveryRef: artifactRef(discovery, discovery.artifactId || "professional-discovery"),
    assessesVerificationRef: artifactRef(verification, verification.artifactId || "professional-verification"),
    policy: policy,
    assessments: assessments,
    summary: {
      total: assessments.length,
      presentedForHumanReview: counts[STATUS.PRESENT],
      insufficientDocumentaryBasis: counts[STATUS.INSUFFICIENT],
      identityAmbiguous: counts[STATUS.AMBIGUOUS],
      outOfScopeDocumentarily: counts[STATUS.OUT_OF_SCOPE],
      humanReviewBurden: counts[STATUS.PRESENT],
    },
    disclaimer: "Evaluation documentaire seule. Aucun statut ne vaut admission au panel. INSUFFICIENT_DOCUMENTARY_BASIS et OUT_OF_SCOPE_DOCUMENTARILY ne sont pas des rejets scientifiques : ils constatent que les elements disponibles ne fondent pas une revue humaine utile.",
  };
}

/** Candidats presentables a la porte humaine — et eux seuls. */
function candidatesForHumanGate(assessment) {
  return (assessment.assessments || []).filter((a) => a.assessmentStatus === STATUS.PRESENT);
}

module.exports = { assessCandidates, candidatesForHumanGate, STATUS };
