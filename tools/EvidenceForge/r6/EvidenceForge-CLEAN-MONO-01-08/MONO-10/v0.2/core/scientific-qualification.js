"use strict";
/**
 * MONO-10 v0.2 — core/scientific-qualification.js
 *
 * Qualifie le PROCESSUS, jamais le contenu du verdict.
 *
 * FERMETURE F-04 : les artefacts ne sont plus crus sur parole. La qualification
 * APPELLE les validateurs de production (panel, capacite, readiness, lignee).
 * Une fixture est rejetee AVANT qualification quand le mode production est demande.
 * FERMETURE F-06 : les unknowns amont sont propages sans perte ; un unknown
 * BLOCKING interdit QUALIFIED.
 * FERMETURE F-01 : aucun nom de phase metier. Le verdict aval est un concept
 * generique (voir downstream-authorization.js).
 */

const { fail, stamp, CLASS, assertProductionEvidence } = require("./execution-evidence.js");
const { assertLineageNonEmpty } = require("./lineage.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { READINESS } = require("./scientific-readiness.js");
const { propagate, assertNoSilentLoss, openOnes, blockingOpen } = require("./unknowns.js");

const QUALIFICATION = { QUALIFIED: "QUALIFIED", WITH_RESERVATIONS: "QUALIFIED_WITH_RESERVATIONS", NOT_QUALIFIED: "NOT_QUALIFIED", IMPOSSIBLE: "IMPOSSIBLE_TO_ASSESS" };
const ACTIONABLE_NONE = "NONE";
const crit = (id, satisfied, reason, refs) => ({ id, satisfied: !!satisfied, reason, evidenceRefs: refs || [] });

function qualifyProcess(input) {
  input = input || {};
  const mode = { production: input.production === true };
  const criteria = [];
  const reservations = (input.reservations || []).slice();
  const limitations = (input.limitations || []).slice();

  const upstream = propagate(propagate(input.upstreamUnknowns || [],
    (input.readinessPre && input.readinessPre.unknowns) || []),
    (input.readinessFull && input.readinessFull.unknowns) || []);
  let unknowns = propagate(upstream, input.addedUnknowns || []);

  const pre = input.readinessPre, full = input.readinessFull;
  if (!pre || !full || pre.schema !== "EvidenceForge.ScientificReadiness" || full.schema !== "EvidenceForge.ScientificReadiness") {
    criteria.push(crit("readiness_artifacts_present", false, "readiness PRE et FULL requis ; en leur absence rien ne peut etre qualifie."));
    return build(QUALIFICATION.IMPOSSIBLE, criteria, reservations, unknowns, limitations, input, ACTIONABLE_NONE, mode);
  }

  // --- validations REELLES, jamais des lectures de surface ---
  const problems = [];
  if (mode.production) {
    [[pre, "ScientificReadiness/PRE"], [full, "ScientificReadiness/FULL"]].forEach(([a, l]) => {
      try { assertProductionEvidence(a, l, mode); } catch (e) { problems.push(e.message); }
    });
  }
  const pv = validatePanelValidation(input.panelValidation, input.candidateAssessment, mode);
  criteria.push(crit("panel_gate_validated", pv.valid, pv.valid ? "porte humaine validee par le validateur de production" : pv.problems.slice(0, 4).join(" ; ")));
  const approved = pv.valid ? pv.approved.length : 0;
  criteria.push(crit("human_panel_gate_passed", approved > 0, approved > 0 ? approved + " professionnel(s) approuve(s) par un acte humain" : "aucun professionnel approuve"));

  const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
  let capOk = true;
  if (reviews.length > 0) {
    const cu = assertCapabilityUsable(input.llmCapability, input.llmConfig, mode);
    capOk = cu.usable;
    criteria.push(crit("llm_capability_validated", cu.usable, cu.usable ? "capacite LLM constatee par sonde active complete" : cu.problems.slice(0, 4).join(" ; ")));
  } else {
    criteria.push(crit("llm_capability_validated", true, "aucune revue : capacite LLM sans objet"));
  }
  criteria.push(crit("readiness_pre", pre.status !== READINESS.NOT_READY, "readiness PRE = " + pre.status));
  criteria.push(crit("readiness_full", full.status !== READINESS.NOT_READY, "readiness FULL = " + full.status));
  criteria.push(crit("reviews_present", reviews.length > 0, reviews.length + " revue(s)"));
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  criteria.push(crit("reviews_complete", reviews.length > 0 && complete === reviews.length, complete + "/" + reviews.length + " revue(s) complete(s)"));

  let lineageOk = true, lineageMsg;
  try { assertLineageNonEmpty(input.lineageRefs, "lineage"); lineageMsg = input.lineageRefs.length + " reference(s) liee(s)"; }
  catch (e) { lineageOk = false; lineageMsg = e.message; }
  criteria.push(crit("lineage_complete", lineageOk, lineageMsg));

  const blocking = blockingOpen(unknowns);
  criteria.push(crit("no_blocking_unknown", blocking.length === 0,
    blocking.length ? blocking.length + " inconnu(s) BLOQUANT(s) : " + blocking.map((u) => u.reason).join(" ; ") : "aucun inconnu bloquant"));

  assertNoSilentLoss(upstream, unknowns, "qualification");

  let status;
  const hardFail = problems.length > 0 || !lineageOk || !pv.valid || approved === 0 || !capOk
    || pre.status === READINESS.NOT_READY || full.status === READINESS.NOT_READY || blocking.length > 0;
  if (hardFail) {
    status = QUALIFICATION.NOT_QUALIFIED;
    problems.forEach((p) => reservations.push(p));
  } else if (reviews.length === 0) {
    status = QUALIFICATION.NOT_QUALIFIED;
    reservations.push("aucune revue produite : le processus ne peut etre qualifie.");
  } else {
    const open = openOnes(unknowns);
    const allSat = criteria.every((c) => c.satisfied);
    if (allSat && open.length === 0 && reservations.length === 0 && pre.status === READINESS.READY && full.status === READINESS.READY) {
      status = QUALIFICATION.QUALIFIED;
    } else {
      status = QUALIFICATION.WITH_RESERVATIONS;
      if (full.status === READINESS.PARTIAL) reservations.push("readiness FULL = PARTIAL");
      if (complete < reviews.length) reservations.push("couverture de revue incomplete : " + complete + "/" + reviews.length);
      open.forEach((u) => { const r = "inconnu non bloquant conserve : " + u.reason; if (reservations.indexOf(r) === -1) reservations.push(r); });
      (full.reservations || []).forEach((r) => { if (reservations.indexOf(r) === -1) reservations.push(r); });
    }
  }
  const actionable = (status === QUALIFICATION.NOT_QUALIFIED || status === QUALIFICATION.IMPOSSIBLE) ? ACTIONABLE_NONE : "PERMITTED";
  return build(status, criteria, reservations, unknowns, limitations, input, actionable, mode);
}

function build(status, criteria, reservations, unknowns, limitations, input, actionable, mode) {
  return Object.assign({
    schema: "EvidenceForge.ScientificQualification", schemaVersion: "MONO-10-v2",
    qualificationStatus: status, scope: "PROCESS_ONLY", doesNotDecideVerdict: true,
    verdictPermitted: actionable !== ACTIONABLE_NONE,
    scientificallyActionableVerdict: actionable,
    qualifies: input.qualifies || [],
    readinessPreRef: input.readinessPreRef || null, readinessFullRef: input.readinessFullRef || null,
    panelValidationRef: input.panelValidationRef || null, llmCapabilityRef: input.llmCapabilityRef || null,
    criteria: criteria, reservations: reservations, unknowns: unknowns, limitations: limitations,
    openUnknownCount: openOnes(unknowns).length, blockingUnknownCount: blockingOpen(unknowns).length,
    expertCountUsedAsCriterion: false, validatedInProductionMode: mode.production,
    note: "Qualifie la qualite du PROCESSUS. Ne choisit jamais le verdict de mission. NOT_QUALIFIED n'efface ni ne modifie aucun verdict anterieur : il en bloque l'usage aval.",
  }, stamp(input.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

/** Le verdict anterieur est TOUJOURS conserve tel quel, quelle que soit sa valeur. */
function applyPriorVerdictPolicy(qualification, priorVerdict) {
  const blocked = qualification.qualificationStatus === QUALIFICATION.NOT_QUALIFIED
    || qualification.qualificationStatus === QUALIFICATION.IMPOSSIBLE;
  return {
    priorVerdict: priorVerdict === undefined ? null : priorVerdict,
    priorVerdictPreserved: true,
    scientificallyActionableVerdict: blocked ? ACTIONABLE_NONE : priorVerdict,
    reason: blocked
      ? "qualificationStatus = " + qualification.qualificationStatus + " : le verdict anterieur reste enregistre tel quel ; seul son usage aval est bloque."
      : "qualification compatible avec un usage aval du verdict.",
  };
}

module.exports = { qualifyProcess, applyPriorVerdictPolicy, QUALIFICATION, ACTIONABLE_NONE };
