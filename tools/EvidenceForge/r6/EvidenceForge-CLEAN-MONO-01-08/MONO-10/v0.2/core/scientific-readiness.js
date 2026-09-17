"use strict";
/**
 * MONO-10 v0.2 — core/scientific-readiness.js
 *
 * FERMETURE F-06 / F-17 : lignee vide => NOT_READY ; unknowns propages sans
 * perte ; unknown BLOCKING empeche READY.
 * FERMETURE F-04 : les artefacts sont VALIDES, jamais lus en surface.
 */

const { fail, stamp, CLASS } = require("./execution-evidence.js");
const { assertLineageNonEmpty } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { propagate, assertNoSilentLoss, openOnes, blockingOpen, BLOCKING } = require("./unknowns.js");

const READINESS = { READY: "READY", PARTIAL: "PARTIAL", NOT_READY: "NOT_READY" };
const DIM = { SATISFIED: "SATISFIED", PARTIAL: "PARTIAL", UNSATISFIED: "UNSATISFIED", NOT_ASSESSED: "NOT_ASSESSED" };
const d = (name, status, reasons, refs, reservations) => ({ name, status, evidenceRefs: refs || [], reasons: reasons || [], reservations: reservations || [] });

function evaluateReadiness(input) {
  input = input || {};
  const phase = input.phase === "FULL" ? "FULL" : "PRE";
  const mode = { production: input.production === true };
  const dims = [];
  const ca = input.candidateAssessment;

  let unknowns = propagate(input.upstreamUnknowns || [], (ca && ca.unknowns) || []);

  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    dims.push(d("candidateAssessment", DIM.UNSATISFIED, ["ProfessionalCandidateAssessment absente"]));
  } else {
    const p = (ca.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).length;
    dims.push(d("candidateAssessment", p > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      [p + " candidat(s) presentable(s) sur " + (ca.assessments || []).length], [ca.assessesDiscoveryRef && ca.assessesDiscoveryRef.sha256].filter(Boolean),
      p === 0 ? ["aucun candidat ne dispose d'une base documentaire suffisante"] : []));
  }

  let approvedCount = 0;
  if (!input.panelValidation) {
    dims.push(d("professionalPanelGate", DIM.UNSATISFIED, ["aucune ProfessionalPanelValidation fournie"]));
  } else {
    const pv = validatePanelValidation(input.panelValidation, ca, mode);
    approvedCount = pv.valid ? pv.approved.length : 0;
    dims.push(d("professionalPanelGate", pv.valid && approvedCount > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      pv.valid ? [approvedCount + " approuve(s) par un humain", "decisions " + JSON.stringify(pv.counts)] : pv.problems.slice(0, 6),
      [], pv.valid && approvedCount === 0 ? ["aucun candidat approuve : le panel serait vide"] : []));
  }

  const ambiguousApproved = ((input.panelValidation && input.panelValidation.decisions) || [])
    .filter((x) => x.decision === "APPROVE_FOR_DOCUMENTARY_PANEL" && x.identityConfidence === "AMBIGUOUS").map((x) => x.candidateId);
  dims.push(d("blockingAmbiguities", ambiguousApproved.length ? DIM.UNSATISFIED : DIM.SATISFIED,
    ambiguousApproved.length ? ["identite(s) AMBIGUOUS approuvee(s) : " + ambiguousApproved.join(", ")] : ["aucune identite ambigue approuvee"]));

  if (input.llmNodesWillRun === false) {
    dims.push(d("llmCapability", DIM.NOT_ASSESSED, ["aucun noeud LLM ne sera execute pour ce run"]));
  } else {
    const u = assertCapabilityUsable(input.llmCapability, input.llmConfig, mode);
    dims.push(d("llmCapability", u.usable ? DIM.SATISFIED : DIM.UNSATISFIED,
      u.usable ? ["sonde active complete et concordante"] : u.problems,
      [input.llmCapability && input.llmCapability.requestId].filter(Boolean)));
  }

  let lineageOk = true, lineageMsg;
  try { assertLineageNonEmpty(input.lineageRefs, "lineage"); lineageMsg = (input.lineageRefs || []).length + " reference(s) liee(s) par empreinte"; }
  catch (e) { lineageOk = false; lineageMsg = e.message; }
  dims.push(d("lineage", lineageOk ? DIM.SATISFIED : DIM.UNSATISFIED, [lineageMsg]));

  if (phase === "FULL") {
    const corpora = (input.professionalCorpus && input.professionalCorpus.professionalCorpora) || [];
    dims.push(d("professionalCorpus", corpora.length ? DIM.SATISFIED : DIM.UNSATISFIED, [corpora.length + " corpus professionnel(s)"]));
    const twins = (input.twinSet && input.twinSet.twins) || [];
    dims.push(d("documentaryTwins", twins.length ? DIM.SATISFIED : DIM.UNSATISFIED, [twins.length + " jumeau(x)"], [], twins.length === 0 ? ["aucun jumeau : aucune revue ne peut exister"] : []));
    const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
    const targets = (input.reviewSet && input.reviewSet.summary && input.reviewSet.summary.targets) || 0;
    const expected = twins.length * targets;
    const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
    const rs = reviews.length === 0 ? DIM.UNSATISFIED : (expected > 0 && complete < expected ? DIM.PARTIAL : DIM.SATISFIED);
    dims.push(d("reviewCoverage", rs, [complete + " revue(s) complete(s)" + (expected ? " sur " + expected : "")], [], rs === DIM.PARTIAL ? ["couverture de revue incomplete"] : []));
    const aggs = (input.aggregation && input.aggregation.aggregates) || [];
    dims.push(d("aggregation", aggs.length ? DIM.SATISFIED : DIM.PARTIAL, [aggs.length + " agregat(s)"]));
  }

  unknowns = propagate(unknowns, input.addedUnknowns || []);
  const blocking = blockingOpen(unknowns);
  dims.push(d("unknowns", blocking.length ? DIM.UNSATISFIED : (openOnes(unknowns).length ? DIM.PARTIAL : DIM.SATISFIED),
    [openOnes(unknowns).length + " inconnu(s) ouvert(s), dont " + blocking.length + " bloquant(s)"],
    [], openOnes(unknowns).map((u) => u.reason)));
  assertNoSilentLoss(propagate(input.upstreamUnknowns || [], (ca && ca.unknowns) || []), unknowns, "readiness " + phase);

  const unsat = dims.filter((x) => x.status === DIM.UNSATISFIED);
  const part = dims.filter((x) => x.status === DIM.PARTIAL);
  const status = unsat.length ? READINESS.NOT_READY : (part.length ? READINESS.PARTIAL : READINESS.READY);

  return Object.assign({
    schema: "EvidenceForge.ScientificReadiness", schemaVersion: "MONO-10-v2",
    phase: phase, status: status, dimensions: dims,
    blockingDimensions: unsat.map((x) => x.name),
    reservations: dims.reduce((a, x) => a.concat(x.reservations || []), []),
    unknowns: unknowns, blockingUnknownCount: blocking.length,
    noDisciplineQuotaApplied: true, approvedPanelSize: approvedCount,
    validatedInProductionMode: mode.production,
  }, stamp(input.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

module.exports = { evaluateReadiness, READINESS, DIM };
