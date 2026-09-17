"use strict";
/**
 * MONO-10 v0.3 — core/identity-evidence.js
 *
 * FERMETURE B-02 / A-04 / §4 / §5.
 *
 * v0.2 deduisait l'independance de `provider || evidenceType`. Deux preuves sans
 * provider declare comptaient donc comme deux sources independantes. Ici,
 * l'independance doit etre DEMONTREE : elle repose sur `sourceAuthorityId`
 * (l'autorite qui emet la preuve) et `sourceFamilyId` (le groupe auquel elle
 * appartient). Inconnue, elle vaut INDEPENDENCE_UNKNOWN et ne compte pas.
 *
 * §5 : un displayName seul plafonne a WEAK. Un nom n'est pas une identite resolue.
 *
 * Le noyau ne connait AUCUN registre : `evidenceType`, `sourceAuthorityId` et
 * `sourceFamilyId` sont des chaines opaques fournies par l'appelant.
 */

const { isNonEmptyStr, fail } = require("./run-evidence-manifest.js");

const CONFIDENCE = { STRONG: "STRONG", MODERATE: "MODERATE", WEAK: "WEAK", AMBIGUOUS: "AMBIGUOUS" };
const SUBJECT_BINDING = { CONFIRMED: "CONFIRMED", ASSERTED: "ASSERTED", AMBIGUOUS: "AMBIGUOUS", UNKNOWN: "UNKNOWN" };
const VERIFICATION = { VERIFIED: "VERIFIED", UNVERIFIED: "UNVERIFIED", CONFLICTING: "CONFLICTING", UNKNOWN: "UNKNOWN" };
const INDEPENDENCE = { INDEPENDENT: "INDEPENDENT", SAME_AUTHORITY: "SAME_AUTHORITY", SAME_FAMILY: "SAME_FAMILY", UNKNOWN: "INDEPENDENCE_UNKNOWN" };
const DISPLAY_NAME_TYPE = "display-name";

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
    // Autorite emettrice REELLE. Absente => independance inconnaissable.
    sourceAuthorityId: isNonEmptyStr(e.sourceAuthorityId) ? e.sourceAuthorityId : null,
    sourceFamilyId: isNonEmptyStr(e.sourceFamilyId) ? e.sourceFamilyId : null,
    provenanceRoot: isNonEmptyStr(e.provenanceRoot) ? e.provenanceRoot : null,
    identifier: isNonEmptyStr(e.identifier) ? e.identifier : null,
    assertedValue: isNonEmptyStr(e.assertedValue) ? e.assertedValue : null,
    subjectBinding: SUBJECT_BINDING[e.subjectBinding] ? e.subjectBinding : SUBJECT_BINDING.UNKNOWN,
    provenance: e.provenance || null,
    verificationStatus: VERIFICATION[e.verificationStatus] ? e.verificationStatus : VERIFICATION.UNKNOWN,
    confidenceContribution: contrib,
  };
}

/** Relation d'independance entre deux preuves — jamais presumee. */
function independenceBetween(a, b) {
  if (!a.sourceAuthorityId || !b.sourceAuthorityId) return INDEPENDENCE.UNKNOWN;
  if (a.sourceAuthorityId === b.sourceAuthorityId) return INDEPENDENCE.SAME_AUTHORITY;
  if (a.sourceFamilyId && b.sourceFamilyId && a.sourceFamilyId === b.sourceFamilyId) return INDEPENDENCE.SAME_FAMILY;
  if (a.provenanceRoot && b.provenanceRoot && a.provenanceRoot === b.provenanceRoot) return INDEPENDENCE.SAME_FAMILY;
  if (!a.sourceFamilyId || !b.sourceFamilyId) return INDEPENDENCE.UNKNOWN;   // familles non declarees : inconnaissable
  return INDEPENDENCE.INDEPENDENT;
}

/**
 * Nombre maximal de preuves MUTUELLEMENT independantes et demontrees telles.
 * Toute paire UNKNOWN, SAME_AUTHORITY ou SAME_FAMILY casse l'independance.
 */
function independentSet(evidences) {
  const best = { size: 0, members: [], relations: [] };
  const n = evidences.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sel = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sel.push(evidences[i]);
    let ok = true; const rel = [];
    for (let i = 0; i < sel.length && ok; i++) {
      for (let j = i + 1; j < sel.length && ok; j++) {
        const r = independenceBetween(sel[i], sel[j]);
        rel.push({ a: sel[i].evidenceType, b: sel[j].evidenceType, relation: r });
        if (r !== INDEPENDENCE.INDEPENDENT) ok = false;
      }
    }
    if (ok && sel.length > best.size) { best.size = sel.length; best.members = sel; best.relations = rel; }
  }
  return best;
}

function deriveIdentityConfidence(evidences, opts) {
  opts = opts || {};
  const minIndependentForStrong = typeof opts.minIndependentForStrong === "number" ? opts.minIndependentForStrong : 2;
  const strongThreshold = typeof opts.strongThreshold === "number" ? opts.strongThreshold : 1.0;
  const list = Array.isArray(evidences) ? evidences : [];
  const reasons = [];

  if (list.length === 0) return { confidence: CONFIDENCE.WEAK, reasons: ["aucune preuve d'identite"], independentProviders: 0, independenceRelations: [] };

  if (list.some((e) => e.verificationStatus === VERIFICATION.CONFLICTING)) {
    return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["au moins une preuve est CONFLICTING"], independentProviders: 0, independenceRelations: [] };
  }
  if (list.some((e) => e.subjectBinding === SUBJECT_BINDING.AMBIGUOUS)) {
    return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["au moins une liaison au sujet est AMBIGUOUS"], independentProviders: 0, independenceRelations: [] };
  }
  const byType = new Map();
  for (const e of list) {
    if (!e.identifier) continue;
    const prev = byType.get(e.evidenceType);
    if (prev && prev !== e.identifier) {
      return { confidence: CONFIDENCE.AMBIGUOUS, reasons: ["deux identifiants differents pour le type \"" + e.evidenceType + "\""], independentProviders: 0, independenceRelations: [] };
    }
    byType.set(e.evidenceType, e.identifier);
  }

  // §5 : un nom seul ne resout aucune identite.
  const substantive = list.filter((e) => e.evidenceType !== DISPLAY_NAME_TYPE && isNonEmptyStr(e.identifier));
  if (substantive.length === 0) {
    return { confidence: CONFIDENCE.WEAK, reasons: ["aucune preuve autre qu'un nom affiche : un nom n'est pas une identite resolue"], independentProviders: 0, independenceRelations: [] };
  }

  const confirmed = substantive.filter((e) => e.subjectBinding === SUBJECT_BINDING.CONFIRMED);
  const anyVerified = confirmed.some((e) => e.verificationStatus === VERIFICATION.VERIFIED);
  const indep = independentSet(confirmed);
  const total = indep.members.reduce((a, e) => a + e.confidenceContribution, 0);
  const unknownPairs = indep.relations.filter((r) => r.relation === INDEPENDENCE.UNKNOWN).length;

  if (indep.size >= minIndependentForStrong && anyVerified && total >= strongThreshold) {
    reasons.push(indep.size + " preuve(s) dont l'independance est DEMONTREE (autorites distinctes, familles distinctes), contribution " + total.toFixed(2));
    return { confidence: CONFIDENCE.STRONG, reasons: reasons, independentProviders: indep.size, independenceRelations: indep.relations };
  }
  // Diagnostic honnete de ce qui manque.
  const allRel = [];
  for (let i = 0; i < confirmed.length; i++) for (let j = i + 1; j < confirmed.length; j++) allRel.push({ a: confirmed[i].evidenceType, b: confirmed[j].evidenceType, relation: independenceBetween(confirmed[i], confirmed[j]) });
  if (allRel.some((r) => r.relation === INDEPENDENCE.UNKNOWN)) {
    reasons.push("independance INCONNUE entre au moins deux preuves (autorite emettrice ou famille non declaree) : elle ne peut pas etre presumee");
  }
  if (allRel.some((r) => r.relation === INDEPENDENCE.SAME_AUTHORITY || r.relation === INDEPENDENCE.SAME_FAMILY)) {
    reasons.push("au moins deux preuves proviennent de la meme autorite ou de la meme famille");
  }
  if (confirmed.length >= 1 && anyVerified) {
    reasons.push("corroboration independante insuffisante pour STRONG");
    return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: indep.size, independenceRelations: allRel };
  }
  if (confirmed.length >= 1 || substantive.some((e) => e.subjectBinding === SUBJECT_BINDING.ASSERTED)) {
    reasons.push("preuves presentes mais non verifiees");
    return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: indep.size, independenceRelations: allRel };
  }
  reasons.push("aucune liaison au sujet etablie");
  return { confidence: CONFIDENCE.WEAK, reasons: reasons, independentProviders: 0, independenceRelations: allRel };
}

module.exports = { makeIdentityEvidence, deriveIdentityConfidence, independenceBetween, independentSet, CONFIDENCE, SUBJECT_BINDING, VERIFICATION, INDEPENDENCE, DISPLAY_NAME_TYPE };
