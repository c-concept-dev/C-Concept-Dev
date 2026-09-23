"use strict";
/**
 * EvidenceForge MONOLITH v1.0.15 — lib/target-identity.js : IDENTITE CIBLE <-> DOCUMENT (R1), SOURCE UNIQUE.
 *
 * MOTIF (reserve R1 de l'audit independant v1.0.14) : en v1.0.14 l'identifiant de cible etait fabrique DEUX fois par une expression
 * litterale dupliquee (lib/pipeline.js pour la table d'autorite documentaire, lib/stage-professionals.js pour les cibles remises au lot
 * gele) et l'autorite etait fournie a l'adaptateur par une lambda opaque : un cablage rendant l'autorite de target-01 pour TOUTES les
 * cibles (mutant X1) passait 313/313. Ici, l'attribution des identifiants et la carte canonique des documents normalises ont UNE SEULE
 * derivation, partagee par le pipeline, l'etage professionnel et le rapport ; l'adaptateur EF-03B construit lui-meme sa carte a partir
 * des documents cibles (jamais d'une lambda). La normalisation reste celle du LOT GELE MONO-11 (core/target-normalizer.js).
 *
 * FAIL CLOSED, jamais de repli : jeu de cibles vide, identifiant duplique, contenu manquant ou vide, contenu non normalise apres
 * normalisation (point fixe viole) => erreur fatale. Aucune correction silencieuse, aucune renumerotation implicite.
 */
const path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const TN = require(path.join(P.MONO11, "core", "target-normalizer.js"));   /* module GELE du lot : seule autorite de normalisation */
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const fail = (code, message, extra) => { throw Object.assign(new Error(code + ": " + message), Object.assign({ code: code, fatal: true }, extra || {})); };

/** SCHEMA D'IDENTIFICATION, unique et explicite : la position dans le jeu de cibles du run (1-based, deux chiffres). */
const TARGET_ID_SCHEME = "target-NN (position 1-based dans le jeu de cibles de revue du run)";
const TARGET_ID_RE = /^target-\d{2,}$/;
/** targetIdAt(index0) -> "target-NN" (unique fabrique d'identifiant de cible du monolithe). */
function targetIdAt(i) { if (!Number.isInteger(i) || i < 0) fail("TARGET_INDEX_INVALID", "index de cible invalide " + JSON.stringify(i)); return "target-" + String(i + 1).padStart(2, "0"); }
/** targetIdOf(doc, index0) -> identifiant porte par le document s'il en a un, sinon celui de sa position. */
function targetIdOf(doc, i) { const t = doc && doc.targetId; if (typeof t === "string" && t.length) { if (!TARGET_ID_RE.test(t)) fail("TARGET_ID_MALFORMED", "identifiant de cible non conforme au schema " + TARGET_ID_SCHEME + " : " + JSON.stringify(t)); return t; } return targetIdAt(i); }

/**
 * assignTargetIds(docs) -> [{ targetId, label, content, hashSha256, documentId, sourceDocumentRef }]
 * Attribution UNIQUE des identifiants de cible : conserve un identifiant deja porte par le document, sinon l'attribue par position.
 * Fail closed sur jeu vide, contenu absent / vide, identifiant duplique.
 */
function assignTargetIds(docs) {
  if (!Array.isArray(docs) || !docs.length) fail("TARGET_DOCUMENT_SET_EMPTY", "aucun document cible : l'autorite documentaire ne peut etre etablie");
  const seen = {}; return docs.map((d, i) => {
    const targetId = targetIdOf(d, i);
    if (seen[targetId]) fail("TARGET_ID_DUPLICATE", "identifiant de cible duplique " + JSON.stringify(targetId) + " (positions " + seen[targetId] + " et " + (i + 1) + ")", { targetId: targetId });
    seen[targetId] = i + 1;
    const content = d && typeof d.content === "string" ? d.content : null;
    if (!content || !content.length) fail("TARGET_DOCUMENT_CONTENT_MISSING", "contenu absent ou vide pour la cible " + JSON.stringify(targetId), { targetId: targetId });
    return { targetId: targetId, label: (d.title || d.label || null), content: content, hashSha256: d.hashSha256 || sha(content), documentId: d.documentId || null, sourceDocumentRef: d.sourceDocumentRef || d.hashSha256 || sha(content) };
  });
}

/**
 * buildCanonicalAuthorityMap(docs) -> { byTarget: { targetId: { targetId, label, content, sha256, rawSha256 } }, targetIds, ruleSetId, records }
 * CARTE CANONIQUE DES DOCUMENTS NORMALISES : chaque cible est normalisee par le module GELE du lot, exactement comme le fait
 * core/autonomous-run.js avant buildTargetDocumentSet. C'est l'unique autorite de litteralite de la chaine EF-03B.
 * Post-condition verifiee (assertion secondaire, jamais la preuve d'identite) : le contenu normalise est un point fixe des regles gelees.
 */
function buildCanonicalAuthorityMap(docs) {
  const targets = assignTargetIds(docs); const byTarget = {}; const records = [];
  targets.forEach((t) => {
    const n = TN.normalizeTargetDocument({ targetId: t.targetId, label: t.label, content: t.content });
    const content = n.document.content;
    if (!content || !content.length) fail("DOCUMENT_AUTHORITY_EMPTY", "document normalise vide pour la cible " + JSON.stringify(t.targetId), { targetId: t.targetId });
    if (TN.normalizeText(content).normalized !== content) fail("DOCUMENT_AUTHORITY_NOT_NORMALIZED", "le document normalise de la cible " + JSON.stringify(t.targetId) + " n'est pas un point fixe des regles " + TN.RULE_SET_ID, { targetId: t.targetId, ruleSetId: TN.RULE_SET_ID });
    byTarget[t.targetId] = { targetId: t.targetId, label: t.label, content: content, sha256: sha(content), rawSha256: sha(t.content) };
    records.push(n.record);
  });
  return { byTarget: byTarget, targetIds: targets.map((t) => t.targetId), ruleSetId: TN.RULE_SET_ID, records: records, targets: targets };
}

module.exports = { TARGET_ID_SCHEME, TARGET_ID_RE, targetIdAt, targetIdOf, assignTargetIds, buildCanonicalAuthorityMap, sha };
