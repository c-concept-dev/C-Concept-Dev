"use strict";
/**
 * MONO-10 v0.7 — core/effective-eligibility.js   (§3, §4, §5)
 *
 * §21 — l'eligibilite est TOUJOURS CALCULEE, jamais acceptee en entree. Un objet
 * qui arriverait en portant `effectiveCorpusEligibility: "ELIGIBLE..."` est
 * ignore : le champ est recalcule et, s'il divergeait, la divergence est signalee.
 *
 * FERMETURE B1 (v0.7). En v0.6, la politique portait encore une option
 * `legacyVerificationGrantsEligibility`. Fournie par l'appelant via
 * `createPanelGatedAdapter({ eligibilityPolicy })`, elle admettait au corpus un
 * candidat que le panel n'avait JAMAIS vu — l'audit a montre un corpus ne
 * contenant que ce candidat, alors que le refus humain sur le seul candidat
 * reellement examine etait respecte. Cette option est SUPPRIMEE, et avec elle
 * l'etat `ELIGIBLE_BY_LEGACY_VERIFICATION`.
 *
 * §4 — regles absolues, qu'aucun objet et aucune politique ne contourne :
 *   decision absente -> NOT_ELIGIBLE
 *   DEFER            -> DEFERRED        (jamais au corpus)
 *   REJECT           -> NOT_ELIGIBLE
 *   porte invalide   -> NOT_ELIGIBLE
 *   approbation non authentifiee -> NOT_ELIGIBLE
 *   APPROVE authentifiee -> PEUT devenir eligible, sous reserve des autres portes
 *
 * §5 — une politique d'appelant peut RESTREINDRE. Elle ne peut jamais elargir :
 * aucun statut amont (`VERIFIED`, identite resolue, pertinence documentaire) ne
 * remplace la porte humaine.
 *
 * §23 — `legacyVerificationStatus` est une COPIE immuable du constat amont.
 */

const { isNonEmptyStr, fail } = require("./canonical.js");

const CC = require("./canonical-contracts.js");
const { sanitizeByAllowlist } = require("./caller-assertion-guard.js");

/** Etats importes de la source canonique — jamais recopies. */
const ELIGIBILITY = CC.ELIGIBILITY_STATE;
const SOURCE = { HUMAN_PANEL_APPROVAL: "HUMAN_PANEL_APPROVAL", NONE: "NONE" };
const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };

/**
 * §5/§40 — LISTE BLANCHE de la politique d'eligibilite. Ces cles ne peuvent que
 * RESTREINDRE. Aucune cle n'ouvre une admission : il n'existe pas de valeur de
 * politique qui rende un candidat eligible.
 */
const ELIGIBILITY_POLICY_ALLOWLIST = Object.freeze({
  requireAuthenticatedHumanAct: { type: "boolean", narrowOnly: true, secureDefault: true },
  requireLegacyVerified: { type: "boolean", narrowOnly: true, secureDefault: false },
  minMissionEvidenceRefs: { type: "number", narrowOnly: true, secureDefault: 0 },
});

/** Rend { policy, refused, refusalMotives } : le refus est consigne, jamais tu. */
function sanitizeEligibilityPolicy(raw) {
  return sanitizeByAllowlist(raw, { allow: ELIGIBILITY_POLICY_ALLOWLIST });
}

function deriveEffectiveEligibility(input) {
  input = input || {};
  if (!isNonEmptyStr(input.candidateId)) throw fail("ELIGIBILITY_INPUT_INVALID", "candidateId requis.");
  // La politique est TOUJOURS assainie ici : meme si un appelant atteint ce
  // module directement, aucune cle hors liste blanche n'a d'effet.
  const sanitized = sanitizeEligibilityPolicy(input.policy);
  const policy = sanitized.policy;
  const legacy = isNonEmptyStr(input.legacyVerificationStatus) ? input.legacyVerificationStatus : "UNKNOWN";
  const human = isNonEmptyStr(input.humanPanelDecision) ? input.humanPanelDecision : null;
  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.slice() : [];
  const actAuthenticated = input.humanActAuthenticated === true;
  const gateValid = input.panelGateValid !== false;
  /** §21 — toute eligibilite PRESENTEE est enregistree puis ignoree. */
  const supplied = isNonEmptyStr(input.suppliedEffectiveCorpusEligibility) ? input.suppliedEffectiveCorpusEligibility : null;

  let eligibility, source, reason;
  if (!gateValid) {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
    reason = "porte humaine invalide : aucune eligibilite ne peut en decouler. Statut amont (" + legacy + ") inchange.";
  } else if (human === DECISION.APPROVE && actAuthenticated) {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL; source = SOURCE.HUMAN_PANEL_APPROVAL;
    reason = "approbation humaine explicite ET authentifiee par la frontiere operateur. Le statut amont (" + legacy + ") est conserve tel quel.";
  } else if (human === DECISION.APPROVE) {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
    reason = "approbation declaree mais NON AUTHENTIFIEE : une declaration d'acte n'est pas un acte. Statut amont (" + legacy + ") inchange.";
  } else if (human === DECISION.DEFER) {
    eligibility = ELIGIBILITY.DEFERRED; source = SOURCE.NONE;
    reason = "decision humaine differee : ni admis, ni ecarte. DEFER n'ouvre jamais le corpus. Statut amont (" + legacy + ") inchange.";
  } else if (human === DECISION.REJECT) {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
    reason = "rejet humain explicite. Statut amont (" + legacy + ") inchange.";
  } else {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
    reason = "aucune decision humaine d'admission" + (human ? " reconnue (valeur presentee : " + human + ")" : "")
      + ". §4 : en l'absence de decision du panel, le candidat n'est PAS eligible. Le statut amont ("
      + legacy + ") ne remplace jamais la porte humaine, et aucune politique ne peut le lui substituer.";
  }

  // §5 — application des RESTRICTIONS. Elles ne peuvent que retirer.
  if (eligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL) {
    if (policy.requireLegacyVerified === true && legacy !== "VERIFIED") {
      eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
      reason = "approbation humaine presente, mais la politique du run EXIGE en plus une verification amont (statut : " + legacy + ").";
    } else if (typeof policy.minMissionEvidenceRefs === "number" && refs.length < policy.minMissionEvidenceRefs) {
      eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
      reason = "approbation humaine presente, mais la politique du run EXIGE au moins "
        + policy.minMissionEvidenceRefs + " preuve(s) rattachee(s) (" + refs.length + " presente(s)).";
    }
  }

  const out = {
    schema: "EvidenceForge.EffectiveCorpusEligibility", schemaVersion: "MONO-10-v7",
    candidateId: input.candidateId,
    legacyVerificationStatus: legacy, humanPanelDecision: human,
    humanActAuthenticated: actAuthenticated, panelGateValid: gateValid,
    effectiveCorpusEligibility: eligibility, eligibilitySource: source, eligibilityReason: reason,
    evidenceRefs: refs, policy: policy,
    policyKeysRefused: sanitized.refused.slice(), policyRefusalMotives: Object.assign({}, sanitized.refusalMotives),
    decisionHash: null,
    invariant: "le statut amont n'est jamais reecrit ; une decision de panel absente, DEFER ou REJECT n'ouvre jamais "
      + "le corpus ; aucune eligibilite fournie en entree n'est acceptee ; aucune politique d'appelant ne cree une admission.",
  };
  if (supplied && supplied !== eligibility) {
    out.suppliedEligibilityIgnored = supplied;
    out.eligibilityReason += " Une eligibilite \"" + supplied + "\" avait ete fournie en entree : elle est IGNOREE.";
  }
  out.decisionHash = require("./canonical.js").sha256Of({
    candidateId: out.candidateId, legacy: out.legacyVerificationStatus, human: out.humanPanelDecision,
    authenticated: out.humanActAuthenticated, gate: out.panelGateValid, eligibility: out.effectiveCorpusEligibility });
  DECISION_BRAND.add(out);
  return Object.freeze(out);
}

/**
 * §11 — la semantique de preuve de `recomputed = true` est SUPPRIMEE : un
 * booleen declaratif n'a jamais valu preuve, et v0.5 le lisait encore.
 *
 * `isEligibleDecision` ne s'applique qu'a un objet PRODUIT PAR CE MODULE dans
 * la portee courante : il porte une marque d'origine non forgeable. Un objet
 * venu de l'appelant, meme identique en forme, est refuse.
 */
const DECISION_BRAND = new WeakSet();
function isEligibleDecision(e) {
  if (!e || !DECISION_BRAND.has(e)) return false;
  // Un seul etat ouvre le corpus, et il exige une approbation humaine AUTHENTIFIEE.
  return e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL;
}
/** Conservee pour la lisibilite des rapports ; n'accorde jamais rien seule. */
function isEligible(e) { return isEligibleDecision(e); }

module.exports = { deriveEffectiveEligibility, isEligible, isEligibleDecision, sanitizeEligibilityPolicy,
  ELIGIBILITY_POLICY_ALLOWLIST, ELIGIBILITY, SOURCE, DECISION };
