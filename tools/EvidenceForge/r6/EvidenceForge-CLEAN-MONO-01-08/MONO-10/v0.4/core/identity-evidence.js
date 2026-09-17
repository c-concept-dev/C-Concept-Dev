"use strict";
/**
 * MONO-10 v0.4 — core/identity-evidence.js
 *
 * FERMETURE v0.3 B-3 (§8, §9).
 *
 * v0.1/v0.2 deduisaient l'independance d'un prefixe d'URL. v0.3 l'a remplacee
 * par `sourceAuthorityId` — mais ce champ etait ECRIT PAR L'APPELANT et rien ne
 * le corroborait. Trois attaques passaient :
 *   - meme autorite reelle sous deux libelles  -> STRONG
 *   - meme famille reelle sous deux libelles   -> STRONG
 *   - MEME IDENTIFIANT sous deux autorites reetiquetees -> indep=2, STRONG
 * L'auto-declaration avait simplement change de nom.
 *
 * v0.4 : un libelle d'autorite ne vaut rien seul. L'independance exige que
 * l'autorite soit RESOLUE dans un registre d'autorites EXTERIEUR — configure
 * par l'exploitant, au meme titre que les ancrages de confiance — et que la
 * preuve porte une provenance resolvable. Le meme identifiant, la meme autorite
 * canonique, la meme famille ou la meme source ne comptent JAMAIS deux fois.
 *
 * Non resolue, l'independance vaut INDEPENDENCE_UNKNOWN et ne compte pas.
 * Le noyau ne connait aucun registre en dur : tout est injecte.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");

const CONFIDENCE = { STRONG: "STRONG", MODERATE: "MODERATE", WEAK: "WEAK", AMBIGUOUS: "AMBIGUOUS" };
const SUBJECT_BINDING = { CONFIRMED: "CONFIRMED", ASSERTED: "ASSERTED", AMBIGUOUS: "AMBIGUOUS", UNKNOWN: "UNKNOWN" };
const VERIFICATION = { VERIFIED: "VERIFIED", UNVERIFIED: "UNVERIFIED", CONFLICTING: "CONFLICTING", UNKNOWN: "UNKNOWN" };
const INDEPENDENCE = {
  INDEPENDENT: "INDEPENDENT",
  SAME_AUTHORITY: "SAME_AUTHORITY", SAME_FAMILY: "SAME_FAMILY",
  SAME_SUBJECT_RECORD: "SAME_SUBJECT_RECORD", SAME_SOURCE_RECORD: "SAME_SOURCE_RECORD",
  UNKNOWN: "INDEPENDENCE_UNKNOWN",
};
const DISPLAY_NAME_TYPE = "display-name";

/**
 * createAuthorityRegistry(entries) — registre EXTERIEUR des autorites.
 * entries : [{ authorityId, canonicalAuthorityId, familyId }]
 * Plusieurs libelles peuvent pointer vers la MEME autorite canonique : c'est
 * exactement ce qui neutralise le reetiquetage.
 */
function createAuthorityRegistry(entries) {
  const m = new Map();
  (entries || []).forEach(function (e, i) {
    if (!e || !isNonEmptyStr(e.authorityId)) throw fail("AUTHORITY_REGISTRY_INVALID", "entree[" + i + "] : authorityId requis.");
    if (!isNonEmptyStr(e.canonicalAuthorityId)) throw fail("AUTHORITY_REGISTRY_INVALID", "entree[" + i + "] : canonicalAuthorityId requis.");
    m.set(e.authorityId, { canonicalAuthorityId: e.canonicalAuthorityId,
      familyId: isNonEmptyStr(e.familyId) ? e.familyId : null,
      registryEntryHash: sha256Of({ a: e.authorityId, c: e.canonicalAuthorityId, f: e.familyId || null }) });
  });
  return m;
}

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
    sourceAuthorityId: isNonEmptyStr(e.sourceAuthorityId) ? e.sourceAuthorityId : null,
    sourceFamilyId: isNonEmptyStr(e.sourceFamilyId) ? e.sourceFamilyId : null,
    /** §8 — la provenance REELLE de la preuve : reference resolvable, pas un libelle. */
    provenanceRef: e.provenanceRef || null,
    provenanceRecordHash: isNonEmptyStr(e.provenanceRecordHash) ? e.provenanceRecordHash : null,
    identifier: isNonEmptyStr(e.identifier) ? e.identifier : null,
    assertedValue: isNonEmptyStr(e.assertedValue) ? e.assertedValue : null,
    subjectBinding: SUBJECT_BINDING[e.subjectBinding] ? e.subjectBinding : SUBJECT_BINDING.UNKNOWN,
    verificationStatus: VERIFICATION[e.verificationStatus] ? e.verificationStatus : VERIFICATION.UNKNOWN,
    confidenceContribution: contrib,
  };
}

/** Resout une preuve contre le registre exterieur. Non resolue => rien n'est su. */
function resolveAuthority(e, authorityRegistry) {
  if (!authorityRegistry || typeof authorityRegistry.get !== "function") return null;
  if (!isNonEmptyStr(e.sourceAuthorityId)) return null;
  const hit = authorityRegistry.get(e.sourceAuthorityId);
  if (!hit) return null;
  return hit;
}

/**
 * independenceBetween(a, b, ctx) — l'independance se DEMONTRE.
 * ctx.authorityRegistry  registre exterieur des autorites
 */
function independenceBetween(a, b, ctx) {
  ctx = ctx || {};
  // §9 — un meme identifiant n'est jamais deux sources, quels que soient les libelles.
  if (isNonEmptyStr(a.identifier) && a.identifier === b.identifier) return INDEPENDENCE.SAME_SUBJECT_RECORD;
  if (isNonEmptyStr(a.provenanceRecordHash) && a.provenanceRecordHash === b.provenanceRecordHash) return INDEPENDENCE.SAME_SOURCE_RECORD;

  const ra = resolveAuthority(a, ctx.authorityRegistry), rb = resolveAuthority(b, ctx.authorityRegistry);
  // §8 — un libelle non resolu ne demontre rien.
  if (!ra || !rb) return INDEPENDENCE.UNKNOWN;
  if (ra.canonicalAuthorityId === rb.canonicalAuthorityId) return INDEPENDENCE.SAME_AUTHORITY;
  if (ra.familyId && rb.familyId && ra.familyId === rb.familyId) return INDEPENDENCE.SAME_FAMILY;
  if (!ra.familyId || !rb.familyId) return INDEPENDENCE.UNKNOWN;
  // §8 — la provenance doit exister de part et d'autre, sans quoi l'origine reelle est inconnue.
  if (!a.provenanceRecordHash || !b.provenanceRecordHash) return INDEPENDENCE.UNKNOWN;
  return INDEPENDENCE.INDEPENDENT;
}

/** Plus grand sous-ensemble MUTUELLEMENT independant et DEMONTRE tel. */
function independentSet(evidences, ctx) {
  const best = { size: 0, members: [], relations: [] };
  const n = evidences.length;
  if (n === 0 || n > 16) { if (n > 16) evidences = evidences.slice(0, 16); }
  const m = evidences.length;
  for (let mask = 1; mask < (1 << m); mask++) {
    const sel = [];
    for (let i = 0; i < m; i++) if (mask & (1 << i)) sel.push(evidences[i]);
    let ok = true; const rel = [];
    for (let i = 0; i < sel.length && ok; i++) {
      for (let j = i + 1; j < sel.length && ok; j++) {
        const r = independenceBetween(sel[i], sel[j], ctx);
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
  const ctx = { authorityRegistry: opts.authorityRegistry };
  const minIndependentForStrong = typeof opts.minIndependentForStrong === "number" ? opts.minIndependentForStrong : 2;
  const strongThreshold = typeof opts.strongThreshold === "number" ? opts.strongThreshold : 1.0;
  const list = Array.isArray(evidences) ? evidences : [];
  const reasons = [];
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
  const anyVerified = confirmed.some((e) => e.verificationStatus === VERIFICATION.VERIFIED);
  const indep = independentSet(confirmed, ctx);
  const total = indep.members.reduce((a, e) => a + e.confidenceContribution, 0);

  const allRel = [];
  for (let i = 0; i < confirmed.length; i++) for (let j = i + 1; j < confirmed.length; j++) {
    allRel.push({ a: confirmed[i].evidenceType, b: confirmed[j].evidenceType, relation: independenceBetween(confirmed[i], confirmed[j], ctx) });
  }

  if (indep.size >= minIndependentForStrong && anyVerified && total >= strongThreshold) {
    reasons.push(indep.size + " preuve(s) dont l'independance est DEMONTREE : autorites canoniques distinctes resolues au registre, familles distinctes, identifiants et sources distincts (contribution " + total.toFixed(2) + ")");
    return { confidence: CONFIDENCE.STRONG, reasons: reasons, independentProviders: indep.size, independenceRelations: indep.relations };
  }
  const say = (rel, txt) => { if (allRel.some((r) => r.relation === rel)) reasons.push(txt); };
  say(INDEPENDENCE.UNKNOWN, "independance INCONNUE entre au moins deux preuves (autorite non resolue au registre exterieur, ou provenance absente) : elle ne peut pas etre presumee");
  say(INDEPENDENCE.SAME_AUTHORITY, "au moins deux preuves remontent a la MEME autorite canonique, sous des libelles differents");
  say(INDEPENDENCE.SAME_FAMILY, "au moins deux preuves appartiennent a la meme famille d'autorites");
  say(INDEPENDENCE.SAME_SUBJECT_RECORD, "au moins deux preuves portent le MEME identifiant : une source dupliquee n'est pas deux sources");
  say(INDEPENDENCE.SAME_SOURCE_RECORD, "au moins deux preuves proviennent du meme enregistrement source");

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

module.exports = { makeIdentityEvidence, deriveIdentityConfidence, independenceBetween, independentSet,
  createAuthorityRegistry, CONFIDENCE, SUBJECT_BINDING, VERIFICATION, INDEPENDENCE, DISPLAY_NAME_TYPE };
