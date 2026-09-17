"use strict";
/**
 * MONO-10 v0.1 — lib/scientific-qualification.js
 *
 * Qualifie le PROCESSUS, jamais le contenu du verdict.
 *
 * AMENDEMENT PROPRIETAIRE 3. NOT_QUALIFIED n'efface ni ne modifie JAMAIS un
 * verdict legacy. Il bloque son USAGE SCIENTIFIQUE et bloque P0.2. Le verdict
 * legacy reste enregistre tel quel, consultable, attribue a son producteur.
 *
 * Le nombre d'experts n'est JAMAIS un critere.
 */

const { assertBound, isNonEmptyStr } = require("./lineage.js");
const { READINESS } = require("./scientific-readiness.js");

const QUALIFICATION = {
  QUALIFIED: "QUALIFIED",
  WITH_RESERVATIONS: "QUALIFIED_WITH_RESERVATIONS",
  NOT_QUALIFIED: "NOT_QUALIFIED",
  IMPOSSIBLE: "IMPOSSIBLE_TO_ASSESS",
};
const ACTIONABLE_NONE = "NONE";

function crit(id, satisfied, reason, evidenceRefs) {
  return { id: id, satisfied: !!satisfied, reason: reason, evidenceRefs: evidenceRefs || [] };
}

/**
 * qualifyProcess({ readinessPre, readinessFull, panelValidation, llmCapability,
 *                  reviewSet, lineageRefs, qualifies, reservations, unknowns,
 *                  limitations })
 * Defaut : IMPOSSIBLE_TO_ASSESS. Tant que rien n'est etabli, rien n'est qualifie.
 */
function qualifyProcess(input) {
  input = input || {};
  const criteria = [];
  const reservations = (input.reservations || []).slice();
  const unknowns = (input.unknowns || []).slice();
  const limitations = (input.limitations || []).slice();

  const pre = input.readinessPre, full = input.readinessFull;
  if (!pre || !full || pre.schema !== "EvidenceForge.ScientificReadiness" || full.schema !== "EvidenceForge.ScientificReadiness") {
    return build(QUALIFICATION.IMPOSSIBLE, criteria.concat([
      crit("readiness_artifacts_present", false, "readiness PRE et FULL requis ; en leur absence rien ne peut etre qualifie."),
    ]), reservations, unknowns, limitations, input, ACTIONABLE_NONE);
  }

  criteria.push(crit("readiness_pre", pre.status !== READINESS.NOT_READY, "readiness PRE = " + pre.status));
  criteria.push(crit("readiness_full", full.status !== READINESS.NOT_READY, "readiness FULL = " + full.status));

  // Porte humaine reellement franchie
  const approved = (input.panelValidation && (input.panelValidation.decisions || [])
    .filter((d) => d.decision === "APPROVE_FOR_DOCUMENTARY_PANEL").length) || 0;
  criteria.push(crit("human_panel_gate_passed", approved > 0,
    approved > 0 ? approved + " professionnel(s) approuve(s) par un acte humain" : "aucun professionnel approuve par un humain"));

  // Provenance LLM pour chaque revue, si des revues existent
  const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
  const llmOk = !!(input.llmCapability && input.llmCapability.status === "AVAILABLE");
  criteria.push(crit("llm_provenance_recorded", reviews.length === 0 ? true : llmOk,
    reviews.length === 0 ? "aucune revue : provenance LLM sans objet"
      : (llmOk ? "capacite LLM constatee par sonde active" : "revues presentes sans capacite LLM constatee")));
  criteria.push(crit("reviews_present", reviews.length > 0,
    reviews.length + " revue(s)"));
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  criteria.push(crit("reviews_complete", reviews.length > 0 && complete === reviews.length,
    complete + " revue(s) complete(s) sur " + reviews.length));

  // Lignee
  const lineageProblems = [];
  (input.lineageRefs || []).forEach(function (r, i) {
    try { assertBound(r, "lineageRefs[" + i + "]"); } catch (e) { lineageProblems.push(e.message); }
  });
  const lineageOk = (input.lineageRefs || []).length > 0 && lineageProblems.length === 0;
  criteria.push(crit("lineage_complete", lineageOk,
    lineageOk ? (input.lineageRefs.length + " reference(s) liee(s) par empreinte") : (lineageProblems[0] || "aucune reference de lignee")));

  // --- statut ---
  let status;
  const hardFail = !criteria.find((c) => c.id === "lineage_complete").satisfied
    || pre.status === READINESS.NOT_READY || full.status === READINESS.NOT_READY
    || approved === 0;

  if (hardFail) {
    status = QUALIFICATION.NOT_QUALIFIED;
  } else if (reviews.length === 0) {
    status = QUALIFICATION.NOT_QUALIFIED;
    reservations.push("aucune revue produite : le processus ne peut etre qualifie.");
  } else if (criteria.every((c) => c.satisfied) && reservations.length === 0
    && pre.status === READINESS.READY && full.status === READINESS.READY) {
    status = QUALIFICATION.QUALIFIED;
  } else {
    status = QUALIFICATION.WITH_RESERVATIONS;
    if (full.status === READINESS.PARTIAL) reservations.push("readiness FULL = PARTIAL");
    if (complete < reviews.length) reservations.push("couverture de revue incomplete : " + complete + "/" + reviews.length);
    (full.reservations || []).forEach((r) => { if (reservations.indexOf(r) === -1) reservations.push(r); });
  }

  const actionable = (status === QUALIFICATION.NOT_QUALIFIED || status === QUALIFICATION.IMPOSSIBLE)
    ? ACTIONABLE_NONE : "PERMITTED";
  return build(status, criteria, reservations, unknowns, limitations, input, actionable);
}

function build(status, criteria, reservations, unknowns, limitations, input, actionable) {
  return {
    schema: "EvidenceForge.ScientificQualification", schemaVersion: "MONO-10-v1",
    qualificationStatus: status,
    scope: "PROCESS_ONLY",
    doesNotDecideVerdict: true,
    verdictPermitted: actionable !== ACTIONABLE_NONE,
    scientificallyActionableVerdict: actionable,
    qualifies: input.qualifies || [],
    readinessPreRef: input.readinessPreRef || null,
    readinessFullRef: input.readinessFullRef || null,
    panelValidationRef: input.panelValidationRef || null,
    llmCapabilityRef: input.llmCapabilityRef || null,
    criteria: criteria, reservations: reservations, unknowns: unknowns, limitations: limitations,
    expertCountUsedAsCriterion: false,
    note: "Qualifie la qualite du PROCESSUS. Ne choisit jamais le verdict JMJS. NOT_QUALIFIED n'efface ni ne modifie aucun verdict legacy : il en bloque l'usage scientifique.",
  };
}

/**
 * applyLegacyVerdictPolicy(qualification, legacyVerdict)
 * Le verdict legacy est TOUJOURS conserve tel quel. Seul son usage change.
 */
function applyLegacyVerdictPolicy(qualification, legacyVerdict) {
  const blocked = qualification.qualificationStatus === QUALIFICATION.NOT_QUALIFIED
    || qualification.qualificationStatus === QUALIFICATION.IMPOSSIBLE;
  return {
    legacyVerdict: legacyVerdict === undefined ? null : legacyVerdict,   // jamais efface, jamais reecrit
    legacyVerdictPreserved: true,
    scientificallyActionableVerdict: blocked ? ACTIONABLE_NONE : legacyVerdict,
    p0_2Allowed: !blocked,
    reason: blocked
      ? "qualificationStatus = " + qualification.qualificationStatus + " : le verdict legacy reste enregistre tel quel, mais son usage scientifique et P0.2 sont bloques."
      : "qualification compatible avec un usage scientifique du verdict.",
  };
}

module.exports = { qualifyProcess, applyLegacyVerdictPolicy, QUALIFICATION, ACTIONABLE_NONE };
