"use strict";
/**
 * MONO-10 v0.3 — core/relevance.js (inchange depuis v0.2 : audite conforme)
 *
 * FERMETURE F-02 (pertinence). v0.1 comparait litteralement les libelles :
 * "civil engineering" contre "engineering" produisait OUT_OF_SCOPE alors que
 * les deux sont documentairement lies. Une egalite de chaines n'est pas une
 * verite semantique.
 *
 * Ce module n'embarque AUCUNE taxonomie metier, AUCUNE liste de disciplines,
 * AUCUN dictionnaire de synonymes. Il raisonne sur la STRUCTURE lexicale
 * (jetons partages, inclusion de syntagme) et delegue tout jugement
 * semantique reel a un `semanticOracle` INJECTE — absent, il ne conclut
 * jamais OUT_OF_SCOPE par defaut : il conclut UNKNOWN.
 */

const RELEVANCE = {
  SUPPORTED: "SUPPORTED", PLAUSIBLE: "PLAUSIBLE", AMBIGUOUS: "AMBIGUOUS",
  OUT_OF_SCOPE: "OUT_OF_SCOPE", UNKNOWN: "UNKNOWN",
};

function tokens(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((t) => t.length > 1);
}

/** Recouvrement structurel : Jaccard + inclusion de l'un dans l'autre. */
function lexicalOverlap(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return { jaccard: 0, contained: false, shared: 0 };
  let shared = 0; A.forEach((t) => { if (B.has(t)) shared++; });
  const union = A.size + B.size - shared;
  const contained = shared === Math.min(A.size, B.size);
  return { jaccard: union ? shared / union : 0, contained: contained, shared: shared };
}

/**
 * assessRelevance({ candidateLabels, missionLabels, semanticOracle, policy })
 *
 * semanticOracle(candidateLabel, missionLabel) -> { related: bool, confidence: number, reason }
 *   INJECTE. Le noyau ne devine jamais a sa place.
 *
 * Sans oracle :
 *   recouvrement fort ou inclusion   -> PLAUSIBLE
 *   aucun jeton partage              -> UNKNOWN   (jamais OUT_OF_SCOPE)
 * OUT_OF_SCOPE n'est prononce QUE sur avis explicite de l'oracle.
 */
function assessRelevance(input) {
  input = input || {};
  const cand = (input.candidateLabels || []).filter((x) => x != null && String(x).trim());
  const mission = (input.missionLabels || []).filter((x) => x != null && String(x).trim());
  const oracle = typeof input.semanticOracle === "function" ? input.semanticOracle : null;
  const policy = Object.assign({ plausibleJaccard: 0.25, supportedJaccard: 0.6 }, input.policy || {});
  const reasons = [];

  if (cand.length === 0 || mission.length === 0) {
    return { relevance: RELEVANCE.UNKNOWN, reasons: ["libelles candidat ou mission absents : aucune relation ne peut etre etablie"], bestMatch: null, oracleUsed: false };
  }

  let best = { score: 0, c: null, m: null, contained: false };
  for (const c of cand) for (const m of mission) {
    const o = lexicalOverlap(c, m);
    const score = o.contained ? Math.max(o.jaccard, policy.plausibleJaccard) : o.jaccard;
    if (score > best.score) best = { score: score, c: c, m: m, contained: o.contained };
  }

  if (oracle) {
    let anyRelated = false, anyExplicitOut = false;
    for (const c of cand) for (const m of mission) {
      let r = null;
      try { r = oracle(c, m); } catch (e) { r = null; }
      if (r && r.related === true) { anyRelated = true; reasons.push("oracle : \"" + c + "\" lie a \"" + m + "\"" + (r.reason ? " (" + r.reason + ")" : "")); }
      if (r && r.related === false && r.explicit === true) { anyExplicitOut = true; reasons.push("oracle : \"" + c + "\" explicitement hors champ de \"" + m + "\""); }
    }
    if (anyRelated) return { relevance: RELEVANCE.SUPPORTED, reasons: reasons, bestMatch: best, oracleUsed: true };
    if (anyExplicitOut && best.score === 0) return { relevance: RELEVANCE.OUT_OF_SCOPE, reasons: reasons, bestMatch: best, oracleUsed: true };
  }

  if (best.score >= policy.supportedJaccard) {
    reasons.push("recouvrement lexical fort (" + best.score.toFixed(2) + ") entre \"" + best.c + "\" et \"" + best.m + "\"");
    return { relevance: RELEVANCE.PLAUSIBLE, reasons: reasons, bestMatch: best, oracleUsed: !!oracle };
  }
  if (best.contained || best.score >= policy.plausibleJaccard) {
    reasons.push("inclusion ou recouvrement partiel entre \"" + best.c + "\" et \"" + best.m + "\" — relation plausible, non etablie");
    return { relevance: RELEVANCE.PLAUSIBLE, reasons: reasons, bestMatch: best, oracleUsed: !!oracle };
  }
  reasons.push("aucun recouvrement structurel et aucun oracle semantique : la relation reste INCONNUE, jamais presumee hors champ");
  return { relevance: RELEVANCE.UNKNOWN, reasons: reasons, bestMatch: best, oracleUsed: !!oracle };
}

module.exports = { assessRelevance, lexicalOverlap, tokens, RELEVANCE };
