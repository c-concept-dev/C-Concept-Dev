"use strict";
/**
 * MONO-10 v0.6 — core/effective-eligibility.js   (§21, §22, §23)
 *
 * §21 — l'eligibilite est TOUJOURS CALCULEE, jamais acceptee en entree. Un objet
 * qui arriverait en portant `effectiveCorpusEligibility: "ELIGIBLE..."` est
 * ignore : le champ est recalcule et, s'il divergeait, la divergence est signalee.
 *
 * §22 — regles absolues, qu'aucun objet fourni ne peut contourner :
 *   DEFER          -> DEFERRED        (jamais au corpus)
 *   REJECT         -> NOT_ELIGIBLE
 *   porte absente  -> NOT_ELIGIBLE
 *   porte invalide -> NOT_ELIGIBLE
 *   approbation non authentifiee -> NOT_ELIGIBLE
 *
 * §23 — `legacyVerificationStatus` est une COPIE immuable du constat amont.
 */

const { isNonEmptyStr, fail } = require("./canonical.js");

const ELIGIBILITY = {
  ELIGIBLE_BY_HUMAN_PANEL_APPROVAL: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL",
  ELIGIBLE_BY_LEGACY_VERIFICATION: "ELIGIBLE_BY_LEGACY_VERIFICATION",
  NOT_ELIGIBLE: "NOT_ELIGIBLE", DEFERRED: "DEFERRED",
};
const SOURCE = { LEGACY_VERIFICATION: "LEGACY_VERIFICATION", HUMAN_PANEL_APPROVAL: "HUMAN_PANEL_APPROVAL", NONE: "NONE" };
const DECISION = { APPROVE: "APPROVE_FOR_DOCUMENTARY_PANEL", REJECT: "REJECT", DEFER: "DEFER" };

function deriveEffectiveEligibility(input) {
  input = input || {};
  if (!isNonEmptyStr(input.candidateId)) throw fail("ELIGIBILITY_INPUT_INVALID", "candidateId requis.");
  const policy = Object.assign({ legacyVerificationGrantsEligibility: false }, input.policy || {});
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
  } else if (policy.legacyVerificationGrantsEligibility === true && legacy === "VERIFIED") {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION; source = SOURCE.LEGACY_VERIFICATION;
    reason = "politique du run assumee explicitement : la verification amont suffit. Aucune decision humaine n'est intervenue.";
  } else {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE; source = SOURCE.NONE;
    reason = "aucune decision humaine d'admission" + (human ? " reconnue (valeur presentee : " + human + ")" : "")
      + ". Le statut amont (" + legacy + ") ne confere pas l'eligibilite sous la politique de ce run.";
  }

  const out = {
    schema: "EvidenceForge.EffectiveCorpusEligibility", schemaVersion: "MONO-10-v6",
    candidateId: input.candidateId,
    legacyVerificationStatus: legacy, humanPanelDecision: human,
    humanActAuthenticated: actAuthenticated, panelGateValid: gateValid,
    effectiveCorpusEligibility: eligibility, eligibilitySource: source, eligibilityReason: reason,
    evidenceRefs: refs, policy: policy,
    decisionHash: null,
    invariant: "le statut amont n'est jamais reecrit ; DEFER et REJECT n'ouvrent jamais le corpus ; "
      + "aucune eligibilite fournie en entree n'est acceptee — elle est toujours recalculee.",
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
  return e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
    || e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION;
}
/** Conservee pour la lisibilite des rapports ; n'accorde jamais rien seule. */
function isEligible(e) { return isEligibleDecision(e); }

module.exports = { deriveEffectiveEligibility, isEligible, isEligibleDecision, ELIGIBILITY, SOURCE, DECISION };
