"use strict";
/**
 * MONO-10 v0.7 — core/caller-assertion-guard.js   (§6, §39, §40, §41)
 *
 * FERMETURE de la classe entiere mise au jour par l'audit de v0.6 :
 *
 *   « je fournis une valeur qui dit qu'une condition est vraie,
 *     et le systeme la croit »
 *
 * En v0.6, la defense reposait sur une LISTE NOIRE et une expression
 * reguliere. Elle a laisse passer `trusted` (le motif exigeait une majuscule
 * apres « trust »), `legacyVerificationGrantsEligibility` (absent de la liste)
 * et `operatorAuthenticated` (hors du perimetre de la fonction).
 *
 * v0.7 inverse la charge : LISTE BLANCHE. Une cle qui n'est pas explicitement
 * declaree sans effet de securite est retiree et consignee. Une liste blanche
 * ne peut pas « oublier » un nom d'attaque, parce qu'elle n'enumere pas les
 * attaques.
 *
 * Invariant : POLICY MAY NARROW. POLICY MAY NOT WIDEN.
 */

const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");

const REFUSAL = {
  NOT_ALLOWLISTED: "CLE_NON_AUTORISEE",
  AUTHORITY_ASSERTION: "ASSERTION_D_AUTORITE",
  WIDENING: "ELARGISSEMENT_INTERDIT",
  WRONG_TYPE: "TYPE_INVALIDE",
};

/**
 * Noms qui, fournis par un appelant, pretendent a une AUTORITE (§6).
 * Cette liste ne sert PAS de defense — la liste blanche s'en charge — mais a
 * qualifier le refus dans le rapport, pour que l'appelant sache pourquoi.
 */
const AUTHORITY_ASSERTION_NAMES = ["authenticated", "operatorauthenticated", "trusted", "trust",
  "verified", "confirmed", "authorized", "authorised", "certified", "validated", "approved", "proven"];

function looksLikeAuthorityAssertion(key) {
  const k = String(key).toLowerCase().replace(/[^a-z]/g, "");
  return AUTHORITY_ASSERTION_NAMES.some((n) => k === n || k.indexOf(n) === 0 || k.endsWith(n));
}

/**
 * sanitizeByAllowlist(raw, spec)
 *
 * spec.allow : { cle: { type, narrowOnly?, secureDefault?, narrower? } }
 *   type         "boolean" | "string" | "number" | "array" | "object"
 *   narrowOnly   true  => la valeur n'est retenue que si elle RESTREINT
 *   secureDefault valeur de reference du contrat
 *   narrower(candidate, secureDefault) -> bool ; par defaut :
 *                  booleen  : seul `true` restreint quand secureDefault vaut false
 *                  nombre   : seule une valeur >= secureDefault restreint
 *
 * Rend { policy, refused[], refusalMotives{}, narrowedOnly:true }
 */
function sanitizeByAllowlist(raw, spec) {
  spec = spec || {};
  const allow = spec.allow || {};
  const policy = {};
  Object.keys(allow).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(allow[k], "secureDefault")) policy[k] = allow[k].secureDefault;
  });
  const refused = [];
  const motives = {};
  const drop = (k, why) => { if (refused.indexOf(k) === -1) { refused.push(k); motives[k] = why; } };

  Object.keys(raw || {}).forEach(function (k) {
    const rule = allow[k];
    if (!rule) {
      drop(k, looksLikeAuthorityAssertion(k) ? REFUSAL.AUTHORITY_ASSERTION : REFUSAL.NOT_ALLOWLISTED);
      return;
    }
    const v = raw[k];
    const t = rule.type;
    const typeOk = t === "array" ? Array.isArray(v)
      : t === "object" ? (v !== null && typeof v === "object" && !Array.isArray(v))
      : typeof v === t;
    if (!typeOk) { drop(k, REFUSAL.WRONG_TYPE); return; }
    if (rule.narrowOnly === true) {
      const secure = rule.secureDefault;
      const narrower = typeof rule.narrower === "function" ? rule.narrower
        : (t === "boolean" ? (c, s) => c === true && s !== true
          : t === "number" ? (c, s) => typeof s !== "number" || c >= s
          : () => false);
      if (!narrower(v, secure)) { drop(k, REFUSAL.WIDENING); return; }
    }
    policy[k] = v;
  });

  return Object.freeze({ policy: Object.freeze(policy), refused: Object.freeze(refused),
    refusalMotives: Object.freeze(motives), allowlisted: Object.freeze(Object.keys(allow)),
    policyHash: sha256Of(policy) });
}

/**
 * assertNoAuthorityAssertion(obj, label) — §6. Refuse explicitement qu'un
 * objet d'ENTREE porte une propriete d'autorite. Utilise la ou un contrat
 * accepte un objet libre (contrats historiques, descripteurs de preuve).
 */
function assertNoAuthorityAssertion(obj, label) {
  if (!obj || typeof obj !== "object") return true;
  const offending = Object.keys(obj).filter(looksLikeAuthorityAssertion);
  if (offending.length) {
    throw fail("CALLER_AUTHORITY_ASSERTION_REFUSED",
      (label || "entree") + " : propriete(s) d'autorite fournie(s) par l'appelant — " + offending.join(", ")
      + ". Une propriete declaree n'est jamais une preuve ; ces valeurs sont des SORTIES derivees, jamais des entrees autoritaires.");
  }
  return true;
}

module.exports = { sanitizeByAllowlist, assertNoAuthorityAssertion, looksLikeAuthorityAssertion, REFUSAL };
