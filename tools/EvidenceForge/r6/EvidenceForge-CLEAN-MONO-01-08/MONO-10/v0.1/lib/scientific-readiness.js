"use strict";
/**
 * MONO-10 v0.1 — lib/scientific-readiness.js
 *
 * Deux phases distinctes, parce qu'elles n'evaluent pas les memes objets.
 *
 * PRE  : avant la partie couteuse et LLM du pipeline. Evalue l'evaluation des
 *        candidats, la porte humaine, le panel approuve, l'absence d'identite
 *        ambigue approuvee, la capacite LLM si des noeuds LLM vont s'executer,
 *        et l'integrite de la lignee.
 * FULL : apres. Ajoute corpus, eligibilite, jumeaux, revues, agregation,
 *        provenance LLM, inconnus, ambiguites bloquantes.
 *
 * AUCUN QUOTA DISCIPLINAIRE. Une couverture etroite produit une reserve, jamais
 * un blocage : imposer un seuil fabriquerait une representativite que le corpus
 * ne porte pas.
 */

const { assertBound, isNonEmptyStr } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable, STATUS: LLM } = require("./llm-capability.js");

const READINESS = { READY: "READY", PARTIAL: "PARTIAL", NOT_READY: "NOT_READY" };
const DIM = { SATISFIED: "SATISFIED", PARTIAL: "PARTIAL", UNSATISFIED: "UNSATISFIED", NOT_ASSESSED: "NOT_ASSESSED" };

function dim(name, status, reasons, evidenceRefs, reservations) {
  return { name: name, status: status, evidenceRefs: evidenceRefs || [], reasons: reasons || [], reservations: reservations || [] };
}

/**
 * evaluateReadiness({ phase, candidateAssessment, panelValidation, llmCapability,
 *                     llmConfig, llmNodesWillRun, professionalCorpus,
 *                     eligibility, twinSet, reviewSet, aggregation, lineageRefs,
 *                     allowFixture })
 */
function evaluateReadiness(input) {
  input = input || {};
  const phase = input.phase === "FULL" ? "FULL" : "PRE";
  const dims = [];

  // --- evaluation des candidats ---
  const ca = input.candidateAssessment;
  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    dims.push(dim("candidateAssessment", DIM.UNSATISFIED, ["ProfessionalCandidateAssessment absente"]));
  } else {
    const presentable = (ca.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).length;
    dims.push(dim("candidateAssessment", presentable > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      [presentable + " candidat(s) presentable(s) sur " + (ca.assessments || []).length],
      [ca.assessesDiscoveryRef && ca.assessesDiscoveryRef.sha256].filter(Boolean),
      presentable === 0 ? ["aucun candidat ne dispose d'une base documentaire suffisante pour une revue humaine"] : []));
  }

  // --- porte humaine ---
  let approvedCount = 0;
  if (!input.panelValidation) {
    dims.push(dim("professionalPanelGate", DIM.UNSATISFIED, ["aucune ProfessionalPanelValidation fournie — fermeture A-07"]));
  } else {
    const pv = validatePanelValidation(input.panelValidation, ca, { allowFixture: input.allowFixture === true });
    approvedCount = pv.valid ? pv.approved.length : 0;
    dims.push(dim("professionalPanelGate",
      pv.valid ? (approvedCount > 0 ? DIM.SATISFIED : DIM.UNSATISFIED) : DIM.UNSATISFIED,
      pv.valid ? [approvedCount + " professionnel(s) approuve(s) par un humain", "decisions " + JSON.stringify(pv.counts)] : pv.problems.slice(0, 6),
      [input.panelValidation.validatesAssessmentRef && input.panelValidation.validatesAssessmentRef.sha256].filter(Boolean),
      pv.valid && approvedCount === 0 ? ["aucun candidat approuve : le panel serait vide"] : []));
  }

  // --- ambiguites bloquantes ---
  const ambiguousApproved = [];
  if (input.panelValidation) {
    (input.panelValidation.decisions || []).forEach(function (d) {
      if (d.decision === "APPROVE_FOR_DOCUMENTARY_PANEL" && d.identityConfidence === "AMBIGUOUS") ambiguousApproved.push(d.candidateId);
    });
  }
  dims.push(dim("blockingAmbiguities", ambiguousApproved.length ? DIM.UNSATISFIED : DIM.SATISFIED,
    ambiguousApproved.length ? ["identite(s) AMBIGUOUS approuvee(s) : " + ambiguousApproved.join(", ")] : ["aucune identite ambigue approuvee"]));

  // --- capacite LLM ---
  if (input.llmNodesWillRun === false) {
    dims.push(dim("llmCapability", DIM.NOT_ASSESSED, ["aucun noeud LLM ne sera execute pour ce run"]));
  } else {
    const u = assertCapabilityUsable(input.llmCapability, input.llmConfig, { allowFixture: input.allowFixture === true });
    dims.push(dim("llmCapability", u.usable ? DIM.SATISFIED : DIM.UNSATISFIED,
      u.usable ? ["sonde active reussie, schema de reponse valide, identifiants attestes"] : u.problems,
      [input.llmCapability && input.llmCapability.requestId].filter(Boolean)));
  }

  // --- lignee ---
  const lineageProblems = [];
  (input.lineageRefs || []).forEach(function (r, i) {
    try { assertBound(r, "lineageRefs[" + i + "]"); } catch (e) { lineageProblems.push(e.message); }
  });
  dims.push(dim("lineage", lineageProblems.length ? DIM.UNSATISFIED : DIM.SATISFIED,
    lineageProblems.length ? lineageProblems : [(input.lineageRefs || []).length + " reference(s) liee(s) par empreinte"]));

  // --- dimensions propres a FULL ---
  if (phase === "FULL") {
    const corpora = (input.professionalCorpus && input.professionalCorpus.professionalCorpora) || [];
    dims.push(dim("professionalCorpus", corpora.length ? DIM.SATISFIED : DIM.UNSATISFIED,
      [corpora.length + " corpus professionnel(s)"]));
    const twins = (input.twinSet && input.twinSet.twins) || [];
    dims.push(dim("documentaryTwins", twins.length ? DIM.SATISFIED : DIM.UNSATISFIED,
      [twins.length + " jumeau(x) documentaire(s)"],
      [], twins.length === 0 ? ["aucun jumeau : aucune revue ne peut exister"] : []));
    const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
    const expected = twins.length * (((input.reviewSet && input.reviewSet.summary && input.reviewSet.summary.targets) || 0));
    const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
    let revStatus;
    if (reviews.length === 0) revStatus = DIM.UNSATISFIED;
    else if (expected > 0 && complete < expected) revStatus = DIM.PARTIAL;
    else revStatus = DIM.SATISFIED;
    dims.push(dim("reviewCoverage", revStatus,
      [complete + " revue(s) complete(s)" + (expected ? " sur " + expected + " attendue(s)" : "")],
      [], revStatus === DIM.PARTIAL ? ["couverture de revue incomplete"] : []));
    const aggs = (input.aggregation && input.aggregation.aggregates) || [];
    dims.push(dim("aggregation", aggs.length ? DIM.SATISFIED : DIM.PARTIAL, [aggs.length + " agregat(s)"]));
    const unknowns = input.unknowns || [];
    dims.push(dim("unknowns", DIM.NOT_ASSESSED, [unknowns.length + " inconnu(s) declare(s)"], [], unknowns));
  }

  const unsatisfied = dims.filter((d) => d.status === DIM.UNSATISFIED);
  const partial = dims.filter((d) => d.status === DIM.PARTIAL);
  let status;
  if (unsatisfied.length) status = READINESS.NOT_READY;
  else if (partial.length) status = READINESS.PARTIAL;
  else status = READINESS.READY;

  return {
    schema: "EvidenceForge.ScientificReadiness", schemaVersion: "MONO-10-v1",
    phase: phase, status: status, dimensions: dims,
    blockingDimensions: unsatisfied.map((d) => d.name),
    reservations: dims.reduce((acc, d) => acc.concat(d.reservations || []), []),
    noDisciplineQuotaApplied: true,
    approvedPanelSize: approvedCount,
  };
}

module.exports = { evaluateReadiness, READINESS, DIM };
