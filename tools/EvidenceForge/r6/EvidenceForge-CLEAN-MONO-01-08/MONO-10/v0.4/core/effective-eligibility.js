"use strict";
/**
 * MONO-10 v0.4 — core/effective-eligibility.js  (§7)
 *
 * Trois notions, jamais confondues, jamais l'une reecrivant l'autre :
 *   legacyVerificationStatus     ce qu'un lot amont a constate  — COPIE immuable
 *   humanPanelDecision           ce qu'un humain a decide       — acte propre
 *   effectiveCorpusEligibility   ce qui en est derive           — explicite, motive
 *
 * DEFER et REJECT ne produisent JAMAIS d'eligibilite. Une porte absente ou
 * invalide non plus. Seul un APPROVE humain — ou une politique de run qui
 * l'assume explicitement — ouvre le corpus.
 */

const { isNonEmptyStr, fail } = require("./canonical.js");

const ELIGIBILITY = {
  ELIGIBLE_BY_HUMAN_PANEL_APPROVAL: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL",
  ELIGIBLE_BY_LEGACY_VERIFICATION: "ELIGIBLE_BY_LEGACY_VERIFICATION",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  DEFERRED: "DEFERRED",
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
  // §7 — l'authenticite de l'acte conditionne son effet.
  const actAuthenticated = input.humanActAuthenticated === true;

  let eligibility, source, reason;
  if (human === DECISION.APPROVE && actAuthenticated) {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL;
    source = SOURCE.HUMAN_PANEL_APPROVAL;
    reason = "approbation humaine explicite ET authentifiee au panel documentaire. Le statut amont (" + legacy + ") est conserve tel quel et n'a pas ete reinterprete.";
  } else if (human === DECISION.APPROVE && !actAuthenticated) {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE;
    source = SOURCE.NONE;
    reason = "approbation humaine declaree mais NON AUTHENTIFIEE : une declaration d'acte n'est pas un acte. Statut amont (" + legacy + ") inchange.";
  } else if (human === DECISION.DEFER) {
    eligibility = ELIGIBILITY.DEFERRED;
    source = SOURCE.NONE;
    reason = "decision humaine differee : le candidat n'est ni admis ni ecarte. DEFER n'ouvre jamais le corpus. Statut amont (" + legacy + ") inchange.";
  } else if (human === DECISION.REJECT) {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE;
    source = SOURCE.NONE;
    reason = "rejet humain explicite. Statut amont (" + legacy + ") inchange.";
  } else if (policy.legacyVerificationGrantsEligibility === true && legacy === "VERIFIED") {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION;
    source = SOURCE.LEGACY_VERIFICATION;
    reason = "politique du run assumee explicitement : la verification amont suffit. Aucune decision humaine n'est intervenue.";
  } else {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE;
    source = SOURCE.NONE;
    reason = "aucune decision humaine d'admission" + (human ? " reconnue (valeur presentee : " + human + ")" : "")
      + ". Le statut amont (" + legacy + ") ne confere pas l'eligibilite sous la politique de ce run.";
  }

  return {
    schema: "EvidenceForge.EffectiveCorpusEligibility", schemaVersion: "MONO-10-v4",
    candidateId: input.candidateId,
    legacyVerificationStatus: legacy,
    humanPanelDecision: human,
    humanActAuthenticated: actAuthenticated,
    effectiveCorpusEligibility: eligibility,
    eligibilitySource: source, eligibilityReason: reason,
    evidenceRefs: refs, policy: policy,
    invariant: "le statut amont n'est jamais reecrit ; DEFER et REJECT n'ouvrent jamais le corpus ; une approbation non authentifiee n'ouvre rien.",
  };
}

function isEligible(e) {
  return !!e && (e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
    || e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION);
}

module.exports = { deriveEffectiveEligibility, isEligible, ELIGIBILITY, SOURCE, DECISION };
