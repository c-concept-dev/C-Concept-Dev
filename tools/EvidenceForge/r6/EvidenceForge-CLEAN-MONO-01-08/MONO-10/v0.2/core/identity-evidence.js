"use strict";
/**
 * MONO-10 v0.2 — core/identity-evidence.js
 *
 * FERMETURE F-02 / F-04 (identite). Modele GENERIQUE de preuve d'identite.
 *
 * v0.1 traitait l'ORCID comme signal privilegie : STRONG etait inatteignable
 * sans lui, ce qui excluait structurellement tout domaine dont les
 * professionnels sont identifies par un registre non academique (barreau,
 * ordre professionnel, registre d'ingenieurs...).
 *
 * Ici, ORCID n'est qu'un `evidenceType` parmi d'autres. Le noyau ne connait
 * AUCUN registre particulier : il raisonne sur la STRUCTURE de la preuve
 * (independance des sources, liaison au sujet, verification), jamais sur
 * l'identite du fournisseur.
 */

const { isNonEmptyStr, fail } = require("./execution-evidence.js");

const CONFIDENCE = { STRONG: "STRONG", MODERATE: "MODERATE", WEAK: "WEAK", AMBIGUOUS: "AMBIGUOUS" };
const SUBJECT_BINDING = { CONFIRMED: "CONFIRMED", ASSERTED: "ASSERTED", AMBIGUOUS: "AMBIGUOUS", UNKNOWN: "UNKNOWN" };
const VERIFICATION = { VERIFIED: "VERIFIED", UNVERIFIED: "UNVERIFIED", CONFLICTING: "CONFLICTING", UNKNOWN: "UNKNOWN" };

/**
 * makeIdentityEvidence({ evidenceType, provider, identifier, subjectBinding,
 *                        provenance, verificationStatus, confidenceContribution })
 * `evidenceType` et `provider` sont des chaines OPAQUES : le noyau ne les
 * interprete jamais. `confidenceContribution` est fourni par l'appelant
 * (adaptateur de domaine), borne ici, jamais devine.
 */
function makeIdentityEvidence(e) {
  e = e || {};
  if (!isNonEmptyStr(e.evidenceType)) throw fail("IDENTITY_EVIDENCE_INVALID", "evidenceType requis (chaine opaque).");
  if (!isNonEmptyStr(e.identifier) && !isNonEmptyStr(e.assertedValue)) {
    throw fail("IDENTITY_EVIDENCE_INVALID", "identifier ou assertedValue requis — jamais une preuve vide.");
  }
  const contrib = typeof e.confidenceContribution === "number" && isFinite(e.confidenceContribution)
    ? Math.max(0, Math.min(1, e.confidenceContribution)) : 0;
  return {
    evidenceType: e.evidenceType,
    provider: isNonEmptyStr(e.provider) ? e.provider : null,
    identifier: isNonEmptyStr(e.identifier) ? e.identifier : null,
    assertedValue: isNonEmptyStr(e.assertedValue) ? e.assertedValue : null,
    subjectBinding: SUBJECT_BINDING[e.subjectBinding] ? e.subjectBinding : SUBJECT_BINDING.UNKNOWN,
    provenance: e.provenance || null,
    verificationStatus: VERIFICATION[e.verificationStatus] ? e.verificationStatus : VERIFICATION.UNKNOWN,
    confidenceContribution: contrib,
  };
}

/**
 * deriveIdentityConfidence(evidences, opts) — regles STRUCTURELLES.
 *
 * AMBIGUOUS si : une preuve est CONFLICTING, ou une liaison au sujet est
 *   AMBIGUOUS, ou deux preuves de meme type portent des identifiants differents.
 * STRONG si : au moins deux preuves INDEPENDANTES (fournisseurs distincts),
 *   toutes CONFIRMED, dont au moins une VERIFIED, et contribution cumulee
 *   atteignant le seuil de politique.
 * MODERATE si : une seule preuve confirmee et verifiee, ou plusieurs asserted.
 * WEAK sinon (nom seul, aucune liaison).
 *
 * Aucun type de preuve n'est privilegie. Le seuil est une POLITIQUE injectable,
 * jamais une constante metier.
 */
function deriveIdentityConfidence(evidences, opts) {
  opts = opts || {};
  const minIndependentForStrong = typeof opts.minIndependentForStrong === "number" ? opts.minIndependentForStrong : 2;
  const strongThreshold = typeof opts.strongThreshold === "number" ? opts.strongThreshold : 1.0;
  const list = Array.isArray(evidences) ? evidences : [];
  const reasons = [];

  if (list.length === 0) return { confidence: CONFIDENCE.WEAK, reasons: ["aucune preuve d'identite"], independentProviders: 0 };

  if (list.some((e) => e.verificationStatus === VERIFICATION.CONFLICTING)) {
    return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["au moins une preuve est CONFLICTING"], independentProviders: 0 };
  }
  if (list.some((e) => e.subjectBinding === SUBJECT_BINDING.AMBIGUOUS)) {
    return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["au moins une liaison au sujet est AMBIGUOUS"], independentProviders: 0 };
  }
  // Deux preuves du MEME type portant des identifiants differents = conflit.
  const byType = new Map();
  for (const e of list) {
    if (!e.identifier) continue;
    const prev = byType.get(e.evidenceType);
    if (prev && prev !== e.identifier) {
      return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["deux identifiants differents pour le type \"" + e.evidenceType + "\""], independentProviders: 0 };
    }
    byType.set(e.evidenceType, e.identifier);
  }

  const confirmed = list.filter((e) => e.subjectBinding === SUBJECT_BINDING.CONFIRMED);
  const providers = new Set(confirmed.map((e) => e.provider || e.evidenceType));
  const anyVerified = confirmed.some((e) => e.verificationStatus === VERIFICATION.VERIFIED);
  const total = confirmed.reduce((a, e) => a + e.confidenceContribution, 0);

  if (providers.size >= minIndependentForStrong && anyVerified && total >= strongThreshold) {
    reasons.push(providers.size + " source(s) independante(s) confirmee(s), dont au moins une verifiee, contribution cumulee " + total.toFixed(2));
    return { confidence: CONFIDENCE.STRONG, reasons: reasons, independentProviders: providers.size };
  }
  if (confirmed.length >= 1 && anyVerified) {
    reasons.push("une seule source confirmee et verifiee : corroboration independante insuffisante pour STRONG");
    return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: providers.size };
  }
  if (confirmed.length >= 1 || list.some((e) => e.subjectBinding === SUBJECT_BINDING.ASSERTED)) {
    reasons.push("preuves presentes mais non verifiees");
    return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: providers.size };
  }
  reasons.push("aucune liaison au sujet etablie");
  return { confidence: CONFIDENCE.WEAK, reasons: reasons, independentProviders: providers.size };
}

module.exports = { makeIdentityEvidence, deriveIdentityConfidence, CONFIDENCE, SUBJECT_BINDING, VERIFICATION };
