"use strict";
/**
 * MONO-11 v0.2 — core/target-normalizer.js   (audit v0.1 §9 : cause amont des 3 revues rejetees)
 *
 * NORMALISATION CANONIQUE DU DOCUMENT CIBLE A L'INGESTION, avant `buildTargetDocumentSet`
 * (EF-03, gele) et donc avant EF-03B (gele, inchange) : le modele voit et cite le texte
 * normalise ; le validateur gele reste octet-exact.
 *
 * Preuve qui fonde la regle : dans le run final v0.1, 3/3 rejets portaient sur le seul
 * document a encodage mixte (84 x U+2019 et 19 x U+0027) et les 3 reponses de premiere
 * passe etaient acceptees par le parseur gele des lors que U+2019 -> U+0027.
 *
 * AUCUNE MODIFICATION SEMANTIQUE : les regles ne touchent que des variantes typographiques
 * d'un meme signe. Deterministe, idempotent. L'original est conserve, hache, et chaque
 * transformation est journalisee (regle, nombre d'occurrences).
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

const RULE_SET_ID = "MONO11-TARGET-NORMALIZATION-v1";
/** Regles fermees : variantes typographiques -> forme ASCII du MEME signe. Aucun mot, aucun sens. */
const RULES = Object.freeze([
  { id: "NFC", description: "forme normale Unicode NFC (composition canonique)", apply: (s) => s.normalize("NFC") },
  { id: "APOSTROPHE", description: "U+2018 U+2019 U+2032 U+02BC -> U+0027", re: /[‘’′ʼ]/g, to: "'" },
  { id: "DOUBLE_QUOTE", description: "U+201C U+201D U+201E U+2033 -> U+0022", re: /[“”„″]/g, to: "\"" },
  { id: "NBSP", description: "U+00A0 U+202F U+2007 -> U+0020", re: /[   ]/g, to: " " },
  { id: "LINE_ENDINGS", description: "CRLF / CR -> LF", re: /\r\n?/g, to: "\n" },
]);

function normalizeText(text) {
  let s = String(text == null ? "" : text);
  const transformations = [];
  RULES.forEach(function (r) {
    if (r.apply) { const before = s; s = r.apply(s); transformations.push({ rule: r.id, description: r.description, changed: before !== s }); return; }
    const m = s.match(r.re); const n = m ? m.length : 0;
    if (n) s = s.replace(r.re, r.to);
    transformations.push({ rule: r.id, description: r.description, occurrences: n });
  });
  return { normalized: s, transformations: transformations };
}

/**
 * normalizeTargetDocument({ targetId, label, role, content, sourceDocumentRef })
 * -> { document (pour buildTargetDocumentSet, contenu NORMALISE), record (TargetNormalizationRecord) }
 */
function normalizeTargetDocument(input) {
  input = input || {};
  const original = String(input.content == null ? "" : input.content);
  const { normalized, transformations } = normalizeText(original);
  const again = normalizeText(normalized).normalized;
  if (again !== normalized) throw Object.assign(new Error("NORMALIZATION_NOT_IDEMPOTENT: " + input.targetId), { code: "NORMALIZATION_NOT_IDEMPOTENT" });
  const record = {
    schema: "EvidenceForge.TargetNormalizationRecord", schemaVersion: "MONO-11-v2",
    targetId: input.targetId, label: input.label || null, ruleSetId: RULE_SET_ID,
    originalSha256: sha(original), originalChars: original.length,
    normalizedSha256: sha(normalized), normalizedChars: normalized.length,
    changed: original !== normalized, transformations: transformations,
    semanticChange: "NONE (variantes typographiques d'un meme signe uniquement)",
    original: original, normalized: normalized,
  };
  const document = { targetId: input.targetId, role: input.role || "review_target_not_evidence", content: normalized,
    sourceDocumentRef: input.sourceDocumentRef || record.originalSha256,
    provenance: "normalized:" + RULE_SET_ID + ":original=" + record.originalSha256 + ":normalized=" + record.normalizedSha256,
    version: input.version || null };
  return { document: document, record: record };
}

/** Verifie qu'un TargetNormalizationRecord est coherent (hashes recalcules, idempotence, regles connues). */
function verifyNormalizationRecord(record) {
  const problems = [];
  if (!record || record.schema !== "EvidenceForge.TargetNormalizationRecord") return { valid: false, problems: ["schema inattendu"] };
  if (sha(record.original) !== record.originalSha256) problems.push("originalSha256 ne correspond pas a original");
  if (sha(record.normalized) !== record.normalizedSha256) problems.push("normalizedSha256 ne correspond pas a normalized");
  const re = normalizeText(record.original).normalized;
  if (re !== record.normalized) problems.push("la normalisation n'est pas reproductible");
  if (record.ruleSetId !== RULE_SET_ID) problems.push("ruleSetId inconnu : " + record.ruleSetId);
  return { valid: problems.length === 0, problems: problems };
}

module.exports = { normalizeText, normalizeTargetDocument, verifyNormalizationRecord, RULES, RULE_SET_ID };
