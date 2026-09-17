"use strict";
/**
 * MONO-10 v0.3 — core/scientific-readiness.js
 *
 * Fermetures v0.3 :
 *   §9  — PRE ET FULL SONT DES ARTEFACTS DISTINCTS. En v0.2, rien n'empechait
 *         qu'une evaluation PRE soit consommee la ou une FULL est exigee : la
 *         phase n'etait qu'une etiquette. Desormais chaque phase declare son
 *         jeu de dimensions OBLIGATOIRES, et la verification compare le jeu
 *         REELLEMENT evalue a celui que la phase annonce. Reetiqueter une PRE
 *         en FULL est detecte, parce que les dimensions FULL manquent.
 *   §10 — la lignee est RESOLUE contre un registre d'artefacts disponibles,
 *         jamais seulement "non vide".
 *   §13 — l'evaluation expose `inputsBindingHash` : l'aval peut verifier que
 *         cette evaluation porte bien sur les artefacts qu'il detient.
 */

const { fail, sha256Of, isNonEmptyStr } = require("./run-evidence-manifest.js");
const { assertLineageResolved, resolveLineage, artifactRef } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { propagate, assertNoSilentLoss, openOnes, blockingOpen } = require("./unknowns.js");

const READINESS = { READY: "READY", PARTIAL: "PARTIAL", NOT_READY: "NOT_READY" };
const DIM = { SATISFIED: "SATISFIED", PARTIAL: "PARTIAL", UNSATISFIED: "UNSATISFIED", NOT_ASSESSED: "NOT_ASSESSED" };
const PHASE = { PRE: "PRE", FULL: "FULL" };

/** §9 — le jeu de dimensions d'une phase EST sa definition, pas son etiquette. */
const PRE_DIMENSIONS = ["candidateAssessment", "professionalPanelGate", "blockingAmbiguities", "llmCapability", "lineage", "unknowns"];
const FULL_ONLY_DIMENSIONS = ["professionalCorpus", "documentaryTwins", "reviewCoverage", "aggregation"];
const PHASE_DIMENSIONS = {
  PRE: PRE_DIMENSIONS.slice(),
  FULL: PRE_DIMENSIONS.concat(FULL_ONLY_DIMENSIONS),
};

const d = (name, status, reasons, refs, reservations) => ({ name, status, evidenceRefs: refs || [], reasons: reasons || [], reservations: reservations || [] });

function inputsBinding(input) {
  const h = (a) => (a && typeof a === "object") ? sha256Of(Object.assign({}, a, { runBinding: undefined })) : null;
  return {
    candidateAssessment: h(input.candidateAssessment),
    panelValidation: h(input.panelValidation),
    llmCapability: h(input.llmCapability),
    professionalCorpus: h(input.professionalCorpus),
    twinSet: h(input.twinSet),
    reviewSet: h(input.reviewSet),
    aggregation: h(input.aggregation),
  };
}

function evaluateReadiness(input) {
  input = input || {};
  const phase = input.phase === PHASE.FULL ? PHASE.FULL : PHASE.PRE;
  const mode = { production: input.production === true, runManifest: input.runManifest };
  const dims = [];
  const ca = input.candidateAssessment;

  let unknowns = propagate(input.upstreamUnknowns || [], (ca && ca.unknowns) || []);

  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    dims.push(d("candidateAssessment", DIM.UNSATISFIED, ["ProfessionalCandidateAssessment absente"]));
  } else {
    const p = (ca.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).length;
    dims.push(d("candidateAssessment", p > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      [p + " candidat(s) presentable(s) sur " + (ca.assessments || []).length],
      [ca.assessesDiscoveryRef && ca.assessesDiscoveryRef.sha256].filter(Boolean),
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

  // §10 : resolution reelle, pas un simple controle de non-vacuite.
  const lin = resolveLineage(input.lineageRefs, input.artifactRegistry, { requiredRelations: input.requiredLineageRelations || [] });
  dims.push(d("lineage", lin.resolved ? DIM.SATISFIED : DIM.UNSATISFIED,
    lin.resolved ? [lin.resolvedRefs.length + " reference(s) resolue(s) contre des artefacts disponibles"] : lin.problems,
    lin.resolvedRefs.map((r) => r.sha256)));

  if (phase === PHASE.FULL) {
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

  const out = {
    schema: "EvidenceForge.ScientificReadiness", schemaVersion: "MONO-10-v3",
    readinessId: "readiness-" + phase + "-" + sha256Of({ phase: phase, dims: dims.map((x) => x.name + ":" + x.status) }).slice(0, 16),
    phase: phase,
    requiredDimensions: PHASE_DIMENSIONS[phase].slice(),
    assessedDimensions: dims.map((x) => x.name),
    status: status, dimensions: dims,
    blockingDimensions: unsat.map((x) => x.name),
    reservations: dims.reduce((a, x) => a.concat(x.reservations || []), []),
    unknowns: unknowns, blockingUnknownCount: blocking.length,
    noDisciplineQuotaApplied: true, approvedPanelSize: approvedCount,
    validatedInProductionMode: mode.production === true,
    lineageResolved: lin.resolved,
    resolvedLineageRefs: lin.resolvedRefs,
    inputsBinding: inputsBinding(input),
  };
  out.inputsBindingHash = sha256Of(out.inputsBinding);
  return out;
}

/**
 * §9 — assertReadinessPhase(readiness, expectedPhase, label)
 * Deux controles independants : l'etiquette DOIT correspondre, et le jeu de
 * dimensions reellement evalue DOIT couvrir ce que la phase exige. Le second
 * survit au maquillage du premier.
 */
function assertReadinessPhase(readiness, expectedPhase, label) {
  label = label || "readiness";
  if (!readiness || readiness.schema !== "EvidenceForge.ScientificReadiness") {
    throw fail("READINESS_MISSING", label + " : artefact ScientificReadiness absent.");
  }
  if (!PHASE_DIMENSIONS[expectedPhase]) throw fail("READINESS_PHASE_UNKNOWN", label + " : phase attendue inconnue \"" + expectedPhase + "\".");
  if (readiness.phase !== expectedPhase) {
    throw fail("READINESS_PHASE_MISMATCH", label + " : evaluation de phase " + readiness.phase + " presentee la ou " + expectedPhase + " est exigee.");
  }
  // La source d'autorite est le CONTENU reellement evalue (`dimensions`), pas la
  // liste declaree : forger `assessedDimensions` ne cree aucune dimension.
  const evaluated = (readiness.dimensions || []).map((x) => x && x.name);
  const assessed = new Set(evaluated);
  const declared = Array.isArray(readiness.assessedDimensions) ? readiness.assessedDimensions : evaluated;
  const overDeclared = declared.filter((n) => !assessed.has(n));
  if (overDeclared.length) {
    throw fail("READINESS_DIMENSIONS_FORGED",
      label + " : dimension(s) declaree(s) mais jamais evaluee(s) : " + overDeclared.join(", ") + ".");
  }
  const missing = PHASE_DIMENSIONS[expectedPhase].filter((n) => !assessed.has(n));
  if (missing.length) {
    throw fail("READINESS_PHASE_FORGED",
      label + " : l'evaluation se declare " + expectedPhase + " mais n'a pas evalue " + missing.join(", ")
      + ". Une evaluation PRE reetiquetee FULL ne devient pas une evaluation FULL.");
  }
  return true;
}

/** §13 — l'aval verifie que l'evaluation porte sur SES artefacts. */
function assertReadinessInputsMatch(readiness, input, label) {
  label = label || "readiness";
  const expected = sha256Of(inputsBinding(input || {}));
  if (readiness.inputsBindingHash !== expected) {
    throw fail("READINESS_INPUTS_MISMATCH",
      label + " : l'evaluation de preparation ne porte pas sur les artefacts fournis (empreinte des entrees differente).");
  }
  return true;
}

module.exports = { evaluateReadiness, assertReadinessPhase, assertReadinessInputsMatch, inputsBinding, READINESS, DIM, PHASE, PHASE_DIMENSIONS, PRE_DIMENSIONS, FULL_ONLY_DIMENSIONS };
