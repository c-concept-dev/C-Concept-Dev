"use strict";
/**
 * MONO-10 v0.3 — core/scientific-qualification.js
 *
 * Qualifie le PROCESSUS, jamais le contenu du verdict.
 *
 * Fermetures v0.3 :
 *   §9  — LA PREPARATION EST RECALCULEE, PAS CRUE. En v0.2 la qualification
 *         lisait `readinessPre.status` et `readinessFull.status` : un artefact
 *         fourni par l'appelant decidait de sa propre conformite. Desormais la
 *         qualification RECALCULE les deux evaluations a partir des artefacts
 *         SOURCES, et toute divergence avec l'evaluation presentee est un echec
 *         dur — jamais une reconciliation silencieuse.
 *   §13 — LES INCONNUS VIENNENT DES SOURCES. v0.2 prenait `readiness.unknowns`
 *         tel quel : effacer ce tableau effacait les inconnus. v0.3 les reprend
 *         des artefacts d'origine via le recalcul, puis verifie l'absence de
 *         perte contre ce que l'artefact presente declarait.
 *   §10 — la lignee est RESOLUE contre le registre d'artefacts disponibles.
 */

const { fail, sha256Of, isNonEmptyStr, assertProductionEvidence, assertArtifactBoundToRun } = require("./run-evidence-manifest.js");
const { resolveLineage } = require("./lineage.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { evaluateReadiness, assertReadinessPhase, READINESS, PHASE } = require("./scientific-readiness.js");
const { propagate, assertNoSilentLoss, openOnes, blockingOpen } = require("./unknowns.js");

const QUALIFICATION = { QUALIFIED: "QUALIFIED", WITH_RESERVATIONS: "QUALIFIED_WITH_RESERVATIONS", NOT_QUALIFIED: "NOT_QUALIFIED", IMPOSSIBLE: "IMPOSSIBLE_TO_ASSESS" };
const ACTIONABLE_NONE = "NONE";
const crit = (id, satisfied, reason, refs) => ({ id, satisfied: !!satisfied, reason, evidenceRefs: refs || [] });

/** Les entrees communes aux deux recalculs de preparation. */
function readinessInputs(input, phase) {
  return {
    phase: phase,
    production: input.production === true,
    runManifest: input.runManifest,
    candidateAssessment: input.candidateAssessment,
    panelValidation: input.panelValidation,
    llmCapability: input.llmCapability,
    llmConfig: input.llmConfig,
    llmNodesWillRun: input.llmNodesWillRun,
    professionalCorpus: input.professionalCorpus,
    twinSet: input.twinSet,
    reviewSet: input.reviewSet,
    aggregation: input.aggregation,
    lineageRefs: input.lineageRefs,
    artifactRegistry: input.artifactRegistry,
    requiredLineageRelations: input.requiredLineageRelations,
    upstreamUnknowns: input.upstreamUnknowns,
    addedUnknowns: phase === PHASE.FULL ? (input.addedUnknowns || []) : [],
  };
}

/** Compare l'evaluation presentee au recalcul. Divergence = echec dur. */
function compareReadiness(presented, recomputed, label) {
  if (!presented) return { diverged: false, problems: [], note: label + " : aucune evaluation presentee, le recalcul fait foi." };
  const problems = [];
  try { assertReadinessPhase(presented, recomputed.phase, label); } catch (e) { problems.push(e.message); }
  if (presented.status !== recomputed.status) {
    problems.push(label + " : status presente " + presented.status + ", recalcule " + recomputed.status + ".");
  }
  const pb = new Set(presented.blockingDimensions || []);
  const rb = recomputed.blockingDimensions || [];
  const hidden = rb.filter((n) => !pb.has(n));
  if (hidden.length) problems.push(label + " : dimension(s) bloquante(s) absente(s) de l'evaluation presentee : " + hidden.join(", ") + ".");
  const pu = (presented.unknowns || []).length, ru = (recomputed.unknowns || []).length;
  if (pu < ru) problems.push(label + " : " + (ru - pu) + " inconnu(s) manquant(s) dans l'evaluation presentee.");
  return { diverged: problems.length > 0, problems: problems, note: problems.length ? "divergence" : "concordance" };
}

function qualifyProcess(input) {
  input = input || {};
  const mode = { production: input.production === true, runManifest: input.runManifest };
  const criteria = [];
  const reservations = (input.reservations || []).slice();
  const limitations = (input.limitations || []).slice();

  const ca = input.candidateAssessment;
  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    criteria.push(crit("source_artifacts_present", false, "ProfessionalCandidateAssessment absente : sans artefact source, la preparation ne peut etre recalculee et rien ne peut etre qualifie."));
    return build(QUALIFICATION.IMPOSSIBLE, criteria, reservations, [], limitations, input, ACTIONABLE_NONE, mode, null, null);
  }

  // §9/§13 : recalcul a partir des SOURCES. L'appelant ne decide pas de sa conformite.
  const pre = evaluateReadiness(readinessInputs(input, PHASE.PRE));
  const full = evaluateReadiness(readinessInputs(input, PHASE.FULL));

  const cmpPre = compareReadiness(input.readinessPre, pre, "readiness PRE");
  const cmpFull = compareReadiness(input.readinessFull, full, "readiness FULL");
  const divergences = cmpPre.problems.concat(cmpFull.problems);
  criteria.push(crit("readiness_recomputed_matches_presented", divergences.length === 0,
    divergences.length ? divergences.slice(0, 6).join(" ; ") : "les evaluations presentees concordent avec le recalcul sur les artefacts sources"));

  // §13 : les inconnus proviennent du recalcul sur les sources, jamais du tableau presente.
  const fromSources = propagate(propagate(input.upstreamUnknowns || [], ca.unknowns || []), pre.unknowns || []);
  let unknowns = propagate(fromSources, full.unknowns || []);
  unknowns = propagate(unknowns, input.addedUnknowns || []);
  assertNoSilentLoss(fromSources, unknowns, "qualification");

  const problems = divergences.slice();
  if (mode.production) {
    if (!mode.runManifest) problems.push("aucun manifeste de run : aucune qualification de production sans run identifie.");
    else {
      [[ca, "ProfessionalCandidateAssessment"], [input.panelValidation, "ProfessionalPanelValidation"]].forEach(function (p) {
        if (!p[0]) return;
        try { assertArtifactBoundToRun(p[0], mode.runManifest, p[1]); } catch (e) { problems.push(e.message); }
        try { assertProductionEvidence(p[0], mode.runManifest, p[1]); } catch (e) { problems.push(e.message); }
      });
    }
  }

  const pv = validatePanelValidation(input.panelValidation, ca, mode);
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
  criteria.push(crit("readiness_pre", pre.status !== READINESS.NOT_READY, "readiness PRE recalculee = " + pre.status + (pre.blockingDimensions.length ? " (" + pre.blockingDimensions.join(", ") + ")" : "")));
  criteria.push(crit("readiness_full", full.status !== READINESS.NOT_READY, "readiness FULL recalculee = " + full.status + (full.blockingDimensions.length ? " (" + full.blockingDimensions.join(", ") + ")" : "")));
  criteria.push(crit("reviews_present", reviews.length > 0, reviews.length + " revue(s)"));
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  criteria.push(crit("reviews_complete", reviews.length > 0 && complete === reviews.length, complete + "/" + reviews.length + " revue(s) complete(s)"));

  const lin = resolveLineage(input.lineageRefs, input.artifactRegistry, { requiredRelations: input.requiredLineageRelations || [] });
  criteria.push(crit("lineage_resolved", lin.resolved,
    lin.resolved ? lin.resolvedRefs.length + " reference(s) resolue(s) contre des artefacts disponibles" : lin.problems.slice(0, 4).join(" ; "),
    lin.resolvedRefs.map((r) => r.sha256)));

  const blocking = blockingOpen(unknowns);
  criteria.push(crit("no_blocking_unknown", blocking.length === 0,
    blocking.length ? blocking.length + " inconnu(s) BLOQUANT(s) : " + blocking.map((u) => u.reason).join(" ; ") : "aucun inconnu bloquant"));

  let status;
  const hardFail = problems.length > 0 || !lin.resolved || !pv.valid || approved === 0 || !capOk
    || pre.status === READINESS.NOT_READY || full.status === READINESS.NOT_READY || blocking.length > 0;
  if (hardFail) {
    status = QUALIFICATION.NOT_QUALIFIED;
    problems.forEach((p) => { if (reservations.indexOf(p) === -1) reservations.push(p); });
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
  return build(status, criteria, reservations, unknowns, limitations, input, actionable, mode, pre, full);
}

function build(status, criteria, reservations, unknowns, limitations, input, actionable, mode, pre, full) {
  const out = {
    schema: "EvidenceForge.ScientificQualification", schemaVersion: "MONO-10-v3",
    qualificationId: null,
    qualificationStatus: status, scope: "PROCESS_ONLY", doesNotDecideVerdict: true,
    verdictPermitted: actionable !== ACTIONABLE_NONE,
    scientificallyActionableVerdict: actionable,
    qualifies: input.qualifies || [],
    readinessRecomputed: !!(pre && full),
    recomputedReadinessPre: pre ? { readinessId: pre.readinessId, phase: pre.phase, status: pre.status, blockingDimensions: pre.blockingDimensions, inputsBindingHash: pre.inputsBindingHash } : null,
    recomputedReadinessFull: full ? { readinessId: full.readinessId, phase: full.phase, status: full.status, blockingDimensions: full.blockingDimensions, inputsBindingHash: full.inputsBindingHash } : null,
    readinessPreRef: input.readinessPreRef || null, readinessFullRef: input.readinessFullRef || null,
    panelValidationRef: input.panelValidationRef || null, llmCapabilityRef: input.llmCapabilityRef || null,
    criteria: criteria, reservations: reservations, unknowns: unknowns, limitations: limitations,
    openUnknownCount: openOnes(unknowns).length, blockingUnknownCount: blockingOpen(unknowns).length,
    expertCountUsedAsCriterion: false, validatedInProductionMode: mode.production === true,
    note: "Qualifie la qualite du PROCESSUS. Ne choisit jamais le verdict de mission. NOT_QUALIFIED n'efface ni ne modifie aucun verdict anterieur : il en bloque l'usage aval.",
  };
  out.qualificationId = "qualification-" + sha256Of({
    status: status, criteria: criteria.map((c) => c.id + ":" + c.satisfied),
    pre: pre && pre.readinessId, full: full && full.readinessId,
  }).slice(0, 24);
  return out;
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

module.exports = { qualifyProcess, applyPriorVerdictPolicy, compareReadiness, readinessInputs, QUALIFICATION, ACTIONABLE_NONE };
