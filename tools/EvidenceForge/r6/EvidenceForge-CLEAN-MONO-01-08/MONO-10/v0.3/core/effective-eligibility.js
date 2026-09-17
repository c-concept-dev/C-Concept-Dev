"use strict";
/**
 * MONO-10 v0.3 — core/effective-eligibility.js
 *
 * FERMETURE A-02 / §2 / §3. Le statut produit par un lot amont est HISTORIQUE :
 * il n'est jamais reecrit. L'eligibilite au corpus est une valeur DERIVEE,
 * explicite, portant sa source et sa raison.
 *
 *   legacyVerificationStatus     ce que le lot amont a constate  — immuable
 *   humanPanelDecision           ce que l'humain a decide        — acte propre
 *   effectiveCorpusEligibility   ce qui en est derive            — explicite
 */

const { isNonEmptyStr, fail } = require("./run-evidence-manifest.js");

const ELIGIBILITY = {
  ELIGIBLE_BY_HUMAN_PANEL_APPROVAL: "ELIGIBLE_BY_HUMAN_PANEL_APPROVAL",
  ELIGIBLE_BY_LEGACY_VERIFICATION: "ELIGIBLE_BY_LEGACY_VERIFICATION",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  DEFERRED: "DEFERRED",
};
const SOURCE = { LEGACY_VERIFICATION: "LEGACY_VERIFICATION", HUMAN_PANEL_APPROVAL: "HUMAN_PANEL_APPROVAL", NONE: "NONE" };

/**
 * deriveEffectiveEligibility({ candidateId, legacyVerificationStatus,
 *   humanPanelDecision, evidenceRefs, policy })
 * policy.legacyVerificationGrantsEligibility  defaut FALSE — par defaut, seule
 *   une approbation humaine rend eligible. Le lot amont ne decide jamais seul.
 */
function deriveEffectiveEligibility(input) {
  input = input || {};
  if (!isNonEmptyStr(input.candidateId)) throw fail("ELIGIBILITY_INPUT_INVALID", "candidateId requis.");
  const policy = Object.assign({ legacyVerificationGrantsEligibility: false }, input.policy || {});
  const legacy = isNonEmptyStr(input.legacyVerificationStatus) ? input.legacyVerificationStatus : "UNKNOWN";
  const human = isNonEmptyStr(input.humanPanelDecision) ? input.humanPanelDecision : null;
  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.slice() : [];

  let eligibility, source, reason;
  if (human === "APPROVE_FOR_DOCUMENTARY_PANEL") {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL;
    source = SOURCE.HUMAN_PANEL_APPROVAL;
    reason = "approbation humaine explicite au panel documentaire. Le statut amont (" + legacy + ") est conserve tel quel et n'a pas ete reinterprete.";
  } else if (human === "DEFER") {
    eligibility = ELIGIBILITY.DEFERRED;
    source = SOURCE.NONE;
    reason = "decision humaine differee : le candidat n'est ni admis ni ecarte. Le statut amont (" + legacy + ") est inchange.";
  } else if (human === "REJECT") {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE;
    source = SOURCE.NONE;
    reason = "rejet humain explicite. Le statut amont (" + legacy + ") est inchange.";
  } else if (policy.legacyVerificationGrantsEligibility && legacy === "VERIFIED") {
    eligibility = ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION;
    source = SOURCE.LEGACY_VERIFICATION;
    reason = "politique du run : la verification amont suffit. Aucune decision humaine n'est intervenue.";
  } else {
    eligibility = ELIGIBILITY.NOT_ELIGIBLE;
    source = SOURCE.NONE;
    reason = "aucune decision humaine d'admission. Le statut amont (" + legacy + ") ne confere pas l'eligibilite sous la politique de ce run.";
  }

  return {
    schema: "EvidenceForge.EffectiveCorpusEligibility", schemaVersion: "MONO-10-v3",
    candidateId: input.candidateId,
    legacyVerificationStatus: legacy,          // IMMUABLE — copie, jamais reecriture
    humanPanelDecision: human,
    effectiveCorpusEligibility: eligibility,
    eligibilitySource: source, eligibilityReason: reason,
    evidenceRefs: refs, policy: policy,
    invariant: "le statut amont n'est jamais reecrit ; l'eligibilite est derivee et explicite.",
  };
}

function isEligible(e) { return e && (e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL || e.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION); }

module.exports = { deriveEffectiveEligibility, isEligible, ELIGIBILITY, SOURCE };
