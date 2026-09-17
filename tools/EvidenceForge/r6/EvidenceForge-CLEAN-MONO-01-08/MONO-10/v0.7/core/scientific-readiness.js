"use strict";
/**
 * MONO-10 v0.7 — core/scientific-readiness.js  (§17, §18)
 *
 * FERMETURE v0.3 B-6.
 *
 * v0.3 tirait la verite de phase de `readiness.dimensions[].name`. Injecter des
 * objets de dimension FABRIQUES portant les noms FULL suffisait donc a faire
 * passer une PRE pour une FULL : la troisieme couche croyait un contenu qui
 * etait lui aussi dans l'artefact forgeable.
 *
 * v0.4 : chaque dimension porte `derivedFromRefs` — les artefacts SOURCES dont
 * elle est tiree. Une dimension sans source resolvable ne promeut aucune phase.
 * Et `assertReadinessPhase` peut RECALCULER l'evaluation depuis les sources et
 * comparer `dimensionsHash` : une dimension synthetique ne survit pas.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage, artifactRef, RELATION } = require("./lineage.js");
const { STATUS: ASSESS } = require("./candidate-assessment.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { propagate, assertNoSilentLoss, openOnes, blockingOpen } = require("./unknowns.js");
const RM = require("./run-evidence-manifest.js");
const AAR = require("./authenticated-artifact-registry.js");

const READINESS = { READY: "READY", PARTIAL: "PARTIAL", NOT_READY: "NOT_READY" };
const DIM = { SATISFIED: "SATISFIED", PARTIAL: "PARTIAL", UNSATISFIED: "UNSATISFIED", NOT_ASSESSED: "NOT_ASSESSED" };
const PHASE = { PRE: "PRE", FULL: "FULL" };

const PRE_DIMENSIONS = ["candidateAssessment", "professionalPanelGate", "blockingAmbiguities", "llmCapability", "lineage", "unknowns"];
const FULL_ONLY_DIMENSIONS = ["professionalCorpus", "documentaryTwins", "reviewCoverage", "aggregation"];
const PHASE_DIMENSIONS = { PRE: PRE_DIMENSIONS.slice(), FULL: PRE_DIMENSIONS.concat(FULL_ONLY_DIMENSIONS) };

/**
 * §13/§14 — FERMETURE B4.
 *
 * En v0.6, une dimension etait « sourcee » des lors qu'elle portait des
 * `derivedFromRefs` RESOLVABLES. L'audit a donc fabrique une phase FULL depuis
 * un PRE : ajouter les dimensions FULL_ONLY en `SATISFIED`, leur EMPRUNTER les
 * references d'une dimension reellement sourcee, recalculer `dimensionsHash` —
 * et l'artefact etait accepte.
 *
 * Une reference resolue n'est pas une preuve de la dimension qu'elle pretend
 * soutenir. v0.7 exige une LIAISON SEMANTIQUE : chaque dimension ne peut etre
 * etablie que par un artefact du TYPE attendu, et le type est lu SUR LE
 * REGISTRE, jamais sur l'etiquette de la reference.
 *
 * `ANY_RESOLVED` est reserve a la dimension « lineage », dont l'objet est
 * precisement la resolvabilite des aretes, quelles qu'elles soient.
 */
const ANY_RESOLVED = "ANY_RESOLVED";
const DIMENSION_EXPECTED_RELATIONS = Object.freeze({
  candidateAssessment: [RELATION.ASSESSMENT],
  professionalPanelGate: [RELATION.PANEL_DECISION],
  blockingAmbiguities: [RELATION.PANEL_DECISION],
  llmCapability: [RELATION.CAPABILITY],
  lineage: ANY_RESOLVED,
  unknowns: [RELATION.ASSESSMENT],
  professionalCorpus: [RELATION.CORPUS],
  documentaryTwins: [RELATION.TWINS],
  reviewCoverage: [RELATION.REVIEWS],
  aggregation: [RELATION.AGGREGATION],
});

/** §14 — la liaison consignee entre une dimension et la preuve qui l'etablit. */
function makeDimensionEvidenceBinding(input) {
  input = input || {};
  const b = {
    schema: "EvidenceForge.ReadinessDimensionEvidenceBinding", schemaVersion: "MONO-10-v7",
    dimensionId: input.dimensionId, dimensionStatus: input.dimensionStatus || null,
    evidenceArtifactId: input.evidenceArtifactId, evidenceHash: input.evidenceHash,
    relation: input.relation, artifactType: input.artifactType || null,
    runId: input.runId || null, missionHash: input.missionHash || null,
    producer: input.producer || null,
  };
  b.dimensionHash = sha256Of({ dimensionId: b.dimensionId, status: b.dimensionStatus });
  b.bindingHash = sha256Of(b);
  return b;
}
function dimensionBindingsHashOf(bindings) {
  return sha256Of((bindings || []).map((b) => b && b.bindingHash).slice().sort());
}

/**
 * §15 — deriveDimensionBindings : construit les liaisons depuis les dimensions
 * et le REGISTRE. Le type et la relation sont lus sur l'entree enregistree ;
 * une reference empruntee a une autre dimension porte donc la mauvaise
 * relation et ne peut rien etablir.
 */
function deriveDimensionBindings(dims, registry) {
  const bindings = [];
  const problems = [];
  (dims || []).forEach(function (dim) {
    if (!dim || !isNonEmptyStr(dim.name)) return;
    const expected = DIMENSION_EXPECTED_RELATIONS[dim.name];
    const refs = Array.isArray(dim.derivedFromRefs) ? dim.derivedFromRefs.filter((r) => r && r.artifactId) : [];
    refs.forEach(function (r) {
      const entry = registry && typeof registry.get === "function" ? registry.get(r.artifactId) : null;
      if (!entry) { problems.push(dim.name + " : reference \"" + r.artifactId + "\" absente du registre authentifie"); return; }
      if (r.sha256 && entry.hash !== r.sha256) {
        problems.push(dim.name + " : reference \"" + r.artifactId + "\" ne correspond plus au contenu enregistre"); return;
      }
      // LA fermeture : la relation VRAIE, lue sur le registre.
      if (expected !== ANY_RESOLVED && Array.isArray(expected) && expected.indexOf(entry.relation) === -1) {
        problems.push(dim.name + " : la dimension exige une preuve de relation " + expected.join("|")
          + " mais \"" + r.artifactId + "\" est enregistre comme \"" + entry.relation
          + "\" — une preuve empruntee a une autre dimension n'etablit rien");
        return;
      }
      bindings.push(makeDimensionEvidenceBinding({ dimensionId: dim.name, dimensionStatus: dim.status,
        evidenceArtifactId: r.artifactId, evidenceHash: entry.hash, relation: entry.relation,
        artifactType: entry.artifactType, runId: entry.runId, missionHash: entry.missionHash,
        // Le producteur est lu SUR L'ENTREE ENREGISTREE : stable a la creation
        // comme a la revalidation, donc l'empreinte des liaisons est reproductible.
        producer: entry.producerRef || null }));
    });
  });
  return { bindings: bindings, problems: problems };
}

/**
 * §15 — deriveReadinessPhase : la phase n'est PAS lue sur l'artefact. Elle est
 * DERIVEE de l'ensemble des dimensions reellement etablies par une liaison
 * valide. Une etiquette « FULL » sans liaison FULL ne rend jamais FULL.
 */
function deriveReadinessPhase(dims, registry) {
  const derived = deriveDimensionBindings(dims, registry);
  const establishedBy = new Map();
  derived.bindings.forEach(function (b) {
    if (!establishedBy.has(b.dimensionId)) establishedBy.set(b.dimensionId, []);
    establishedBy.get(b.dimensionId).push(b);
  });
  const satisfies = (phaseName) => PHASE_DIMENSIONS[phaseName].every(function (n) {
    const dim = (dims || []).filter((x) => x && x.name === n)[0];
    if (!dim) return false;
    return (establishedBy.get(n) || []).length > 0;
  });
  const phase = satisfies(PHASE.FULL) ? PHASE.FULL : (satisfies(PHASE.PRE) ? PHASE.PRE : null);
  return { phase: phase, bindings: derived.bindings, problems: derived.problems,
    establishedDimensions: Array.from(establishedBy.keys()),
    bindingsHash: dimensionBindingsHashOf(derived.bindings) };
}

/** §17 — une dimension declare toujours DE QUOI elle est tiree. */
const d = (name, status, reasons, derivedFromRefs, reservations) => ({
  name: name, status: status, reasons: reasons || [],
  derivedFromRefs: derivedFromRefs || [], reservations: reservations || [],
});

function sourcesBinding(input) {
  const h = (a) => (a && typeof a === "object") ? RM.artifactHash(a) : null;
  return { candidateAssessment: h(input.candidateAssessment), panelValidation: h(input.panelValidation),
    llmCapability: h(input.llmCapability), professionalCorpus: h(input.professionalCorpus),
    twinSet: h(input.twinSet), reviewSet: h(input.reviewSet), aggregation: h(input.aggregation) };
}
function dimensionsHashOf(dims) {
  return sha256Of(dims.map((x) => ({ name: x.name, status: x.status,
    derivedFrom: (x.derivedFromRefs || []).map((r) => r && r.sha256).filter(Boolean).slice().sort() })));
}
const refOf = (a, id, rel) => { try { return a ? artifactRef(a, id, rel) : null; } catch (e) { return null; } };

function evaluateReadiness(input) {
  input = input || {};
  const phase = input.phase === PHASE.FULL ? PHASE.FULL : PHASE.PRE;
  const ctx = input.runContext || {};
  const dims = [];
  const ca = input.candidateAssessment;
  let unknowns = propagate(input.upstreamUnknowns || [], (ca && ca.unknowns) || [], { requireResolvableEvidence: false });

  const caRef = refOf(ca, "candidate-assessment", RELATION.ASSESSMENT);
  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    dims.push(d("candidateAssessment", DIM.UNSATISFIED, ["ProfessionalCandidateAssessment absente"], []));
  } else {
    const p = (ca.assessments || []).filter((a) => a.assessmentStatus === ASSESS.PRESENT).length;
    dims.push(d("candidateAssessment", p > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      [p + " candidat(s) presentable(s) sur " + (ca.assessments || []).length], [caRef].filter(Boolean),
      p === 0 ? ["aucun candidat ne dispose d'une base documentaire suffisante"] : []));
  }

  let approvedCount = 0;
  const pvRef = refOf(input.panelValidation, "panel-validation", RELATION.PANEL_DECISION);
  if (!input.panelValidation) {
    dims.push(d("professionalPanelGate", DIM.UNSATISFIED, ["aucune ProfessionalPanelValidation fournie"], []));
  } else {
    const pv = validatePanelValidation(input.panelValidation, ca, ctx);
    approvedCount = pv.valid ? pv.approved.length : 0;
    dims.push(d("professionalPanelGate", pv.valid && approvedCount > 0 ? DIM.SATISFIED : DIM.UNSATISFIED,
      pv.valid ? [approvedCount + " approuve(s) par un acte humain authentifie", "decisions " + JSON.stringify(pv.counts)] : pv.problems.slice(0, 6),
      [pvRef].filter(Boolean), pv.valid && approvedCount === 0 ? ["aucun candidat approuve : le panel serait vide"] : []));
  }

  const ambiguousApproved = ((input.panelValidation && input.panelValidation.decisions) || [])
    .filter((x) => x.decision === "APPROVE_FOR_DOCUMENTARY_PANEL" && x.identityConfidence === "AMBIGUOUS").map((x) => x.candidateId);
  dims.push(d("blockingAmbiguities", ambiguousApproved.length ? DIM.UNSATISFIED : DIM.SATISFIED,
    ambiguousApproved.length ? ["identite(s) AMBIGUOUS approuvee(s) : " + ambiguousApproved.join(", ")] : ["aucune identite ambigue approuvee"],
    [pvRef].filter(Boolean)));

  const capRef = refOf(input.llmCapability, "llm-capability", RELATION.CAPABILITY);
  if (input.llmNodesWillRun === false) {
    dims.push(d("llmCapability", DIM.NOT_ASSESSED, ["aucun noeud LLM ne sera execute pour ce run"], []));
  } else {
    const u = assertCapabilityUsable(input.llmCapability, input.llmConfig, ctx);
    dims.push(d("llmCapability", u.usable ? DIM.SATISFIED : DIM.UNSATISFIED,
      u.usable ? ["sonde active complete, concordante et liee au run atteste"] : u.problems, [capRef].filter(Boolean)));
  }

  // §29 — un registre non authentifie ne resout rien.
  const regOk = AAR.isAuthenticatedRegistry(input.artifactRegistry);
  const lin = regOk ? resolveLineage(input.lineageRefs, input.artifactRegistry, {
    relation: phase === PHASE.FULL ? RELATION.READINESS_FULL : RELATION.READINESS_PRE,
    expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
    expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
    expectedAttestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : undefined,
    crossRunAllowedRelations: input.crossRunAllowedRelations,
  }) : { resolved: false, problems: ["registre d'artefacts non rattache a un run authentifie"], resolvedRefs: [] };
  dims.push(d("lineage", lin.resolved ? DIM.SATISFIED : DIM.UNSATISFIED,
    lin.resolved ? [lin.resolvedRefs.length + " arete(s) de lignee resolue(s) et typee(s)"] : lin.problems,
    lin.resolvedRefs.map((r) => ({ artifactId: r.artifactId, relation: r.relation, sha256: r.sha256 }))));

  if (phase === PHASE.FULL) {
    const corpora = (input.professionalCorpus && input.professionalCorpus.professionalCorpora) || [];
    dims.push(d("professionalCorpus", corpora.length ? DIM.SATISFIED : DIM.UNSATISFIED, [corpora.length + " corpus professionnel(s)"],
      [refOf(input.professionalCorpus, "professional-corpus", RELATION.CORPUS)].filter(Boolean)));
    const twins = (input.twinSet && input.twinSet.twins) || [];
    dims.push(d("documentaryTwins", twins.length ? DIM.SATISFIED : DIM.UNSATISFIED, [twins.length + " jumeau(x)"],
      [refOf(input.twinSet, "twin-set", RELATION.TWINS)].filter(Boolean), twins.length === 0 ? ["aucun jumeau : aucune revue ne peut exister"] : []));
    const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
    const targets = (input.reviewSet && input.reviewSet.summary && input.reviewSet.summary.targets) || 0;
    const expected = twins.length * targets;
    const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
    const rs = reviews.length === 0 ? DIM.UNSATISFIED : (expected > 0 && complete < expected ? DIM.PARTIAL : DIM.SATISFIED);
    dims.push(d("reviewCoverage", rs, [complete + " revue(s) complete(s)" + (expected ? " sur " + expected : "")],
      [refOf(input.reviewSet, "review-set", RELATION.REVIEWS)].filter(Boolean), rs === DIM.PARTIAL ? ["couverture de revue incomplete"] : []));
    const aggs = (input.aggregation && input.aggregation.aggregates) || [];
    dims.push(d("aggregation", aggs.length ? DIM.SATISFIED : DIM.PARTIAL, [aggs.length + " agregat(s)"],
      [refOf(input.aggregation, "aggregation", RELATION.AGGREGATION)].filter(Boolean)));
  }

  unknowns = propagate(unknowns, input.addedUnknowns || [], { requireResolvableEvidence: false });
  const blocking = blockingOpen(unknowns);
  dims.push(d("unknowns", blocking.length ? DIM.UNSATISFIED : (openOnes(unknowns).length ? DIM.PARTIAL : DIM.SATISFIED),
    [openOnes(unknowns).length + " inconnu(s) ouvert(s), dont " + blocking.length + " bloquant(s)"],
    [caRef].filter(Boolean), openOnes(unknowns).map((u) => u.reason)));
  assertNoSilentLoss(propagate(input.upstreamUnknowns || [], (ca && ca.unknowns) || [], { requireResolvableEvidence: false }), unknowns, "readiness " + phase);

  const unsat = dims.filter((x) => x.status === DIM.UNSATISFIED);
  const part = dims.filter((x) => x.status === DIM.PARTIAL);
  const status = unsat.length ? READINESS.NOT_READY : (part.length ? READINESS.PARTIAL : READINESS.READY);

  const out = {
    schema: "EvidenceForge.ScientificReadiness", schemaVersion: "MONO-10-v7",
    phase: phase, requiredDimensions: PHASE_DIMENSIONS[phase].slice(),
    assessedDimensions: dims.map((x) => x.name),
    status: status, dimensions: dims,
    blockingDimensions: unsat.map((x) => x.name),
    reservations: dims.reduce((a, x) => a.concat(x.reservations || []), []),
    unknowns: unknowns, blockingUnknownCount: blocking.length,
    noDisciplineQuotaApplied: true, approvedPanelSize: approvedCount,
    executionMode: RM.effectiveMode(ctx), runId: ctx.manifest ? ctx.manifest.runId : null,
    attestationHash: ctx.manifest ? ctx.manifest.runtimeAttestationHash : null,
    lineageResolved: lin.resolved, resolvedLineageRefs: lin.resolvedRefs,
    sourcesBinding: sourcesBinding(input),
  };
  out.sourcesBindingHash = sha256Of(out.sourcesBinding);
  out.dimensionsHash = dimensionsHashOf(dims);
  // §14 — les liaisons dimension <-> preuve sont CONSIGNEES dans l'artefact.
  const derivedPhase = regOk ? deriveReadinessPhase(dims, input.artifactRegistry)
    : { phase: null, bindings: [], problems: ["registre non authentifie"], establishedDimensions: [], bindingsHash: dimensionBindingsHashOf([]) };
  out.dimensionBindings = derivedPhase.bindings;
  out.dimensionBindingsHash = derivedPhase.bindingsHash;
  out.derivedPhase = derivedPhase.phase;
  out.dimensionBindingProblems = derivedPhase.problems;
  out.readinessId = "readiness-" + phase + "-" + sha256Of({ dimensionsHash: out.dimensionsHash, sources: out.sourcesBindingHash }).slice(0, 16);
  return out;
}

/**
 * assertReadinessPhase(readiness, expectedPhase, opts, label)
 * opts.registry   §17 — chaque dimension exigee par la phase doit etre tiree
 *                 d'au moins une source RESOLVABLE. Une dimension fabriquee
 *                 n'a aucune source : elle ne promeut rien.
 * opts.recompute  fonction () -> readiness recalculee depuis les sources.
 */
function assertReadinessPhase(readiness, expectedPhase, opts, label) {
  opts = opts || {}; label = label || "readiness";
  if (!readiness || readiness.schema !== "EvidenceForge.ScientificReadiness") throw fail("READINESS_MISSING", label + " : artefact ScientificReadiness absent.");
  if (!PHASE_DIMENSIONS[expectedPhase]) throw fail("READINESS_PHASE_UNKNOWN", label + " : phase attendue inconnue \"" + expectedPhase + "\".");
  if (readiness.phase !== expectedPhase) throw fail("READINESS_PHASE_MISMATCH", label + " : evaluation de phase " + readiness.phase + " presentee la ou " + expectedPhase + " est exigee.");

  const dims = Array.isArray(readiness.dimensions) ? readiness.dimensions : [];
  // §35 — le digest PRESENTE n'est jamais cru : il est RECALCULE depuis les
  // dimensions reellement presentes, puis compare.
  const recomputedDigest = dimensionsHashOf(dims);
  if (readiness.dimensionsHash !== recomputedDigest) {
    throw fail("READINESS_DIGEST_MISMATCH", label + " : dimensionsHash presente ne correspond pas au recalcul sur les dimensions "
      + "reellement presentes — un digest copie ne prouve rien.");
  }
  const evaluated = dims.map((x) => x && x.name);
  const declared = Array.isArray(readiness.assessedDimensions) ? readiness.assessedDimensions : evaluated;
  const over = declared.filter((n) => evaluated.indexOf(n) === -1);
  if (over.length) throw fail("READINESS_DIMENSIONS_FORGED", label + " : dimension(s) declaree(s) mais jamais evaluee(s) : " + over.join(", ") + ".");
  const missing = PHASE_DIMENSIONS[expectedPhase].filter((n) => evaluated.indexOf(n) === -1);
  if (missing.length) throw fail("READINESS_PHASE_FORGED", label + " : l'evaluation se declare " + expectedPhase + " mais n'a pas evalue " + missing.join(", ") + ".");

  // §15/§16 — LA FERMETURE : la phase est DERIVEE des liaisons semantiques.
  // Une dimension dont la preuve appartient a une autre dimension n'etablit
  // rien, quel que soit son statut declare et quel que soit le digest.
  if (opts.registry) {
    const derived = deriveReadinessPhase(dims, opts.registry);
    if (derived.problems.length) {
      throw fail("READINESS_DIMENSION_EVIDENCE_UNBOUND",
        label + " : liaison dimension/preuve invalide — " + derived.problems.slice(0, 3).join(" ; ")
        + ". Une preuve empruntee ne soutient pas une dimension.");
    }
    if (derived.phase !== expectedPhase) {
      throw fail("READINESS_PHASE_NOT_DERIVED",
        label + " : la phase DERIVEE des liaisons est " + JSON.stringify(derived.phase) + " alors que "
        + expectedPhase + " est exigee. Une phase ne se declare pas : elle se derive des preuves qui l'etablissent.");
    }
    if (isNonEmptyStr(readiness.dimensionBindingsHash) && readiness.dimensionBindingsHash !== derived.bindingsHash) {
      throw fail("READINESS_BINDINGS_MISMATCH",
        label + " : les liaisons consignees ne correspondent pas au recalcul sur le registre.");
    }
  }

  // §17 — une dimension doit etre TIREE d'une source resolvable.
  if (opts.registry) {
    const unsourced = [];
    PHASE_DIMENSIONS[expectedPhase].forEach(function (n) {
      const dim = dims.filter((x) => x && x.name === n)[0];
      if (!dim) return;
      // §36 — NOT_ASSESSED n'est PAS une exemption de provenance : la dimension
      // doit porter la source qui etablit qu'elle n'avait pas a etre evaluee.
      if (dim.status === DIM.NOT_ASSESSED && !(Array.isArray(dim.derivedFromRefs) && dim.derivedFromRefs.length)) {
        unsourced.push(n + " (NOT_ASSESSED sans source justifiant la non-evaluation)"); return;
      }
      const refs = Array.isArray(dim.derivedFromRefs) ? dim.derivedFromRefs.filter((r) => r && r.sha256) : [];
      if (refs.length === 0) { unsourced.push(n + " (aucune source declaree)"); return; }
      const res = resolveLineage(refs, opts.registry, {
        expectedRunId: opts.expectedRunId, expectedMissionHash: opts.expectedMissionHash,
        expectedAttestationHash: opts.expectedAttestationHash, crossRunAllowedRelations: opts.crossRunAllowedRelations });
      if (!res.resolved) unsourced.push(n + " (source non resolvable : " + res.problems[0] + ")");
    });
    if (unsourced.length) {
      throw fail("READINESS_DIMENSIONS_UNSOURCED",
        label + " : dimension(s) sans source resolvable — une dimension fabriquee ne promeut aucune phase : " + unsourced.join(" ; ") + ".");
    }
  }

  // §18 — recalcul depuis les sources, si l'appelant peut le fournir.
  if (typeof opts.recompute === "function") {
    const re = opts.recompute();
    if (re.dimensionsHash !== readiness.dimensionsHash) {
      throw fail("READINESS_RECOMPUTE_DIVERGENCE", label + " : les dimensions presentees ne correspondent pas au recalcul sur les artefacts sources.");
    }
  }
  return true;
}

function assertReadinessSourcesMatch(readiness, input, label) {
  const expected = sha256Of(sourcesBinding(input || {}));
  if (readiness.sourcesBindingHash !== expected) {
    throw fail("READINESS_SOURCES_MISMATCH", (label || "readiness") + " : l'evaluation ne porte pas sur les artefacts fournis.");
  }
  return true;
}

module.exports = { evaluateReadiness, assertReadinessPhase, assertReadinessSourcesMatch, sourcesBinding, dimensionsHashOf,
  READINESS, DIM, PHASE, PHASE_DIMENSIONS, PRE_DIMENSIONS, FULL_ONLY_DIMENSIONS,
  DIMENSION_EXPECTED_RELATIONS, ANY_RESOLVED, makeDimensionEvidenceBinding, dimensionBindingsHashOf,
  deriveDimensionBindings, deriveReadinessPhase };
