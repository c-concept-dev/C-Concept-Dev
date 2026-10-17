"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/screening-normalization.js
 * REGLE SCREENING-EVIDENCE-NORMALIZATION-v1 (classe FORMAT_NORMALIZATION_ONLY) : une evidence citee par le modele est acceptee si et
 * seulement si elle correspond a une SEQUENCE REELLEMENT PRESENTE dans un champ autorise de la source (titre, resume, lieu), soit
 * litteralement, soit apres normalisation de FORME uniquement : Unicode NFD/NFC, accents, casse, apostrophes et guillemets typographiques,
 * tirets typographiques, ponctuation, espaces multiples — sur des mots entiers (frontieres de jetons). Quand la correspondance est canonique, le FRAGMENT LITTERAL REEL du champ est
 * recupere (projection des positions canoniques vers l'original) et c'est lui qui est rendu : l'evidence conservee est toujours un extrait
 * exact du texte reel. INTERDIT et absent de ce module : synonymes, paraphrase, correspondance floue ou semantique, expansion lexicale,
 * LLM, correction de sens. Aucun appel, aucun etat. Trace complete : original, canonique, litteral, champ, hashes.
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const RULE_ID = "SCREENING-EVIDENCE-NORMALIZATION-v1";
const DEFAULT_FIELDS = Object.freeze(["titre", "resume", "lieu"]);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const ALNUM = /[a-z0-9]/;

/** Canonisation de forme avec projection : pour chaque caractere canonique, l'index du caractere original dont il provient. */
function canonMap(str) {
  str = String(str || ""); const out = [], map = []; let prevSpace = true;
  for (let i = 0; i < str.length; i++) {
    const n = str[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (let k = 0; k < n.length; k++) { const c = n[k]; if (ALNUM.test(c)) { out.push(c); map.push(i); prevSpace = false; } else if (!prevSpace) { out.push(" "); map.push(i); prevSpace = true; } }
  }
  while (out.length && out[out.length - 1] === " ") { out.pop(); map.pop(); }
  return { canon: out.join(""), map };
}
const canonicalize = (s) => canonMap(s).canon;

/** Recherche de la sequence canonique de `evidence` dans `field` ; rend le fragment LITTERAL original correspondant, ou null. */
function findLiteral(field, evidence) {
  field = String(field || ""); const H = canonMap(field), E = canonicalize(evidence); if (!E) return null;
  /* correspondance sur frontieres de jetons uniquement (jamais a l'interieur d'un mot) : un fragment canonique doit couvrir des mots entiers */
  let idx = -1, from = 0; while ((idx = H.canon.indexOf(E, from)) >= 0) { const before = idx === 0 || H.canon[idx - 1] === " ", after = idx + E.length === H.canon.length || H.canon[idx + E.length] === " "; if (before && after) break; from = idx + 1; } if (idx < 0) return null;
  const start = H.map[idx]; let end = H.map[idx + E.length - 1] + 1; while (end < field.length && /[̀-ͯ]/.test(field[end])) end++;   /* marques combinantes (forme NFD) rattachees au dernier caractere */
  return { literal: field.slice(start, end), start, end, canonical: E };
}

/**
 * verifyEvidence(source, evidence, fields?) -> { ok, field, literal, normalized, original, canonical, originalSha256, literalSha256, rule }
 * Ordre : correspondance litterale dans un champ autorise (aucune normalisation), sinon correspondance canonique (fragment litteral recupere).
 */
function verifyEvidence(source, evidence, fields) {
  fields = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS; const original = typeof evidence === "string" ? evidence : null;
  if (!isStr(original)) return { ok: false, reason: "evidence vide ou non textuelle", original, rule: RULE_ID };
  for (const f of fields) { const v = source && source[f]; if (isStr(v) && v.indexOf(original) !== -1) return { ok: true, field: f, literal: original, normalized: false, original, canonical: canonicalize(original), originalSha256: sha(original), literalSha256: sha(original), rule: RULE_ID }; }
  for (const f of fields) { const v = source && source[f]; if (!isStr(v)) continue; const r = findLiteral(v, original); if (r) return { ok: true, field: f, literal: r.literal, normalized: true, original, canonical: r.canonical, originalSha256: sha(original), literalSha256: sha(r.literal), rule: RULE_ID }; }
  return { ok: false, reason: "evidence absente des champs " + fields.join("/") + " (litteralement et sous forme canonique)", original, canonical: canonicalize(original), originalSha256: sha(original), rule: RULE_ID };
}

module.exports = { verifyEvidence, findLiteral, canonicalize, canonMap, RULE_ID, DEFAULT_FIELDS };
