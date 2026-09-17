"use strict";
/**
 * MONO-10 v0.5 — core/identity-evidence.js   (§25, §26)
 *
 * L'independance de deux preuves d'identite est DERIVEE d'une provenance
 * RESOLUE contre le registre authentifie du run — jamais d'un libelle porte par
 * la preuve, jamais d'un registre d'autorites fourni par l'appelant.
 *
 * Ne comptent JAMAIS comme deux sources :
 *   le meme identifiant, quels que soient les libelles ;
 *   la meme racine de source ;
 *   la meme racine d'autorite ;
 *   la meme famille d'autorites ;
 *   une provenance non resolue (INDEPENDENCE_UNKNOWN).
 */

const { isNonEmptyStr, fail } = require("./canonical.js");
const { resolveEvidenceSourceProvenance, PROVENANCE_STATUS } = require("./evidence-source-provenance.js");

const CONFIDENCE = { STRONG: "STRONG", MODERATE: "MODERATE", WEAK: "WEAK", AMBIGUOUS: "AMBIGUOUS" };
const SUBJECT_BINDING = { CONFIRMED: "CONFIRMED", ASSERTED: "ASSERTED", AMBIGUOUS: "AMBIGUOUS", UNKNOWN: "UNKNOWN" };
const VERIFICATION = { VERIFIED: "VERIFIED", UNVERIFIED: "UNVERIFIED", CONFLICTING: "CONFLICTING", UNKNOWN: "UNKNOWN" };
const INDEPENDENCE = {
  INDEPENDENT: "INDEPENDENT", SAME_SUBJECT_RECORD: "SAME_SUBJECT_RECORD", SAME_SOURCE_ROOT: "SAME_SOURCE_ROOT",
  SAME_AUTHORITY_ROOT: "SAME_AUTHORITY_ROOT", SAME_FAMILY_ROOT: "SAME_FAMILY_ROOT", UNKNOWN: "INDEPENDENCE_UNKNOWN",
};
const DISPLAY_NAME_TYPE = "display-name";

function makeIdentityEvidence(e) {
  e = e || {};
  if (!isNonEmptyStr(e.evidenceType)) throw fail("IDENTITY_EVIDENCE_INVALID", "evidenceType requis.");
  if (!isNonEmptyStr(e.identifier) && !isNonEmptyStr(e.assertedValue)) {
    throw fail("IDENTITY_EVIDENCE_INVALID", "identifier ou assertedValue requis — jamais une preuve vide.");
  }
  const contrib = typeof e.confidenceContribution === "number" && isFinite(e.confidenceContribution)
    ? Math.max(0, Math.min(1, e.confidenceContribution)) : 0;
  return {
    evidenceType: e.evidenceType,
    identifier: isNonEmptyStr(e.identifier) ? e.identifier : null,
    assertedValue: isNonEmptyStr(e.assertedValue) ? e.assertedValue : null,
    /** SEULE voie d'etablissement de l'origine : une reference resolvable. */
    provenanceRef: e.provenanceRef || null,
    subjectBinding: SUBJECT_BINDING[e.subjectBinding] ? e.subjectBinding : SUBJECT_BINDING.UNKNOWN,
    verificationStatus: VERIFICATION[e.verificationStatus] ? e.verificationStatus : VERIFICATION.UNKNOWN,
    confidenceContribution: contrib,
  };
}

/** Attache a chaque preuve sa provenance RESOLUE (ou son absence). */
function resolveAll(evidences, ctx) {
  return (evidences || []).map(function (e) {
    const p = resolveEvidenceSourceProvenance(e, ctx.registry, ctx);
    return { evidence: e, provenance: p };
  });
}

function independenceBetween(a, b) {
  const ea = a.evidence, eb = b.evidence, pa = a.provenance, pb = b.provenance;
  if (isNonEmptyStr(ea.identifier) && ea.identifier === eb.identifier) return INDEPENDENCE.SAME_SUBJECT_RECORD;
  if (pa.status !== PROVENANCE_STATUS.RESOLVED || pb.status !== PROVENANCE_STATUS.RESOLVED) return INDEPENDENCE.UNKNOWN;
  if (pa.sourceRootId === pb.sourceRootId) return INDEPENDENCE.SAME_SOURCE_ROOT;
  if (!isNonEmptyStr(pa.authorityRootId) || !isNonEmptyStr(pb.authorityRootId)) return INDEPENDENCE.UNKNOWN;
  if (pa.authorityRootId === pb.authorityRootId) return INDEPENDENCE.SAME_AUTHORITY_ROOT;
  if (!isNonEmptyStr(pa.familyRootId) || !isNonEmptyStr(pb.familyRootId)) return INDEPENDENCE.UNKNOWN;
  if (pa.familyRootId === pb.familyRootId) return INDEPENDENCE.SAME_FAMILY_ROOT;
  return INDEPENDENCE.INDEPENDENT;
}

function independentSet(items) {
  const best = { size: 0, members: [], relations: [] };
  const list = items.slice(0, 16);
  const n = list.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sel = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sel.push(list[i]);
    let ok = true; const rel = [];
    for (let i = 0; i < sel.length && ok; i++) {
      for (let j = i + 1; j < sel.length && ok; j++) {
        const r = independenceBetween(sel[i], sel[j]);
        rel.push({ a: sel[i].evidence.evidenceType, b: sel[j].evidence.evidenceType, relation: r });
        if (r !== INDEPENDENCE.INDEPENDENT) ok = false;
      }
    }
    if (ok && sel.length > best.size) { best.size = sel.length; best.members = sel; best.relations = rel; }
  }
  return best;
}

/** deriveIdentityConfidence(evidences, ctx) — ctx.registry est OBLIGATOIRE. */
function deriveIdentityConfidence(evidences, ctx) {
  ctx = ctx || {};
  const minIndep = typeof ctx.minIndependentForStrong === "number" ? ctx.minIndependentForStrong : 2;
  const strongThreshold = typeof ctx.strongThreshold === "number" ? ctx.strongThreshold : 1.0;
  const list = Array.isArray(evidences) ? evidences : [];
  const none = (c, why) => ({ confidence: c, reasons: [why], independentProviders: 0, independenceRelations: [] });

  if (list.length === 0) return none(CONFIDENCE.WEAK, "aucune preuve d'identite");
  if (list.some((e) => e.verificationStatus === VERIFICATION.CONFLICTING)) return none(CONFIDENCE.AMBIGUOUS, "au moins une preuve est CONFLICTING");
  if (list.some((e) => e.subjectBinding === SUBJECT_BINDING.AMBIGUOUS)) return none(CONFIDENCE.AMBIGUOUS, "au moins une liaison au sujet est AMBIGUOUS");

  const byType = new Map();
  for (const e of list) {
    if (!e.identifier) continue;
    const prev = byType.get(e.evidenceType);
    if (prev && prev !== e.identifier) return none(CONFIDENCE.AMBIGUOUS, "deux identifiants differents pour le type \"" + e.evidenceType + "\"");
    byType.set(e.evidenceType, e.identifier);
  }
  const substantive = list.filter((e) => e.evidenceType !== DISPLAY_NAME_TYPE && isNonEmptyStr(e.identifier));
  if (substantive.length === 0) return none(CONFIDENCE.WEAK, "aucune preuve autre qu'un nom affiche : un nom n'est pas une identite resolue");

  const confirmed = substantive.filter((e) => e.subjectBinding === SUBJECT_BINDING.CONFIRMED);
  const resolved = resolveAll(confirmed, ctx);
  const anyVerified = confirmed.some((e) => e.verificationStatus === VERIFICATION.VERIFIED);
  const indep = independentSet(resolved);
  const total = indep.members.reduce((a, x) => a + x.evidence.confidenceContribution, 0);

  const allRel = [];
  for (let i = 0; i < resolved.length; i++) for (let j = i + 1; j < resolved.length; j++) {
    allRel.push({ a: resolved[i].evidence.evidenceType, b: resolved[j].evidence.evidenceType, relation: independenceBetween(resolved[i], resolved[j]) });
  }
  const reasons = [];
  if (indep.size >= minIndep && anyVerified && total >= strongThreshold) {
    reasons.push(indep.size + " preuve(s) dont l'independance est DERIVEE d'une provenance resolue contre le registre authentifie du run (racines de source, d'autorite et de famille distinctes, identifiants distincts), contribution " + total.toFixed(2));
    return { confidence: CONFIDENCE.STRONG, reasons: reasons, independentProviders: indep.size, independenceRelations: indep.relations };
  }
  const say = (rel, txt) => { if (allRel.some((r) => r.relation === rel)) reasons.push(txt); };
  say(INDEPENDENCE.UNKNOWN, "independance INCONNUE : provenance non resolue contre le registre authentifie — elle ne peut pas etre presumee");
  say(INDEPENDENCE.SAME_SUBJECT_RECORD, "au moins deux preuves portent le MEME identifiant : une source dupliquee n'est pas deux sources");
  say(INDEPENDENCE.SAME_SOURCE_ROOT, "au moins deux preuves remontent a la meme racine de source");
  say(INDEPENDENCE.SAME_AUTHORITY_ROOT, "au moins deux preuves remontent a la meme autorite, sous des libelles differents");
  say(INDEPENDENCE.SAME_FAMILY_ROOT, "au moins deux preuves appartiennent a la meme famille d'autorites");

  if (confirmed.length >= 1 && anyVerified) { reasons.push("corroboration independante insuffisante pour STRONG"); return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: indep.size, independenceRelations: allRel }; }
  if (confirmed.length >= 1 || substantive.some((e) => e.subjectBinding === SUBJECT_BINDING.ASSERTED)) { reasons.push("preuves presentes mais non verifiees"); return { confidence: CONFIDENCE.MODERATE, reasons: reasons, independentProviders: indep.size, independenceRelations: allRel }; }
  reasons.push("aucune liaison au sujet etablie");
  return { confidence: CONFIDENCE.WEAK, reasons: reasons, independentProviders: 0, independenceRelations: allRel };
}

module.exports = { makeIdentityEvidence, deriveIdentityConfidence, independenceBetween, independentSet,
  CONFIDENCE, SUBJECT_BINDING, VERIFICATION, INDEPENDENCE, DISPLAY_NAME_TYPE };
