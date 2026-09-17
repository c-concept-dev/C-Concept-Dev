"use strict";
/**
 * MONO-10 v0.4 — core/scientific-qualification.js  (§0, §20)
 *
 * Qualifie le PROCESSUS, jamais le contenu du verdict.
 *
 * DECISION ARCHITECTURALE §0 — deux notions sont produites separement et ne
 * sont JAMAIS confondues :
 *
 *   internalChainConsistency        la chaine est coherente avec elle-meme
 *   authenticatedProductionExecution un runtime EXTERIEUR atteste le run
 *
 * Une chaine coherente n'est pas une preuve de production. C'est precisement
 * l'amalgame qui rendait v0.3 NON_GELABLE : une chaine entierement fabriquee
 * atteignait QUALIFIED puis AUTHORIZED.
 *
 * En mode PRODUCTION, `QUALIFIED` exige les deux. Sans attestation exterieure
 * verifiee, le resultat est NOT_QUALIFIED — jamais un QUALIFIED assorti d'une
 * reserve qu'un lecteur pourrait ignorer.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage, RELATION } = require("./lineage.js");
const { validatePanelValidation } = require("./panel-gate.js");
const { assertCapabilityUsable } = require("./llm-capability.js");
const { evaluateReadiness, assertReadinessPhase, dimensionsHashOf, READINESS, PHASE } = require("./scientific-readiness.js");
const { propagate, assertNoSilentLoss, assertChainValid, openOnes, blockingOpen } = require("./unknowns.js");
const RM = require("./run-evidence-manifest.js");

const QUALIFICATION = { QUALIFIED: "QUALIFIED", WITH_RESERVATIONS: "QUALIFIED_WITH_RESERVATIONS", NOT_QUALIFIED: "NOT_QUALIFIED", IMPOSSIBLE: "IMPOSSIBLE_TO_ASSESS" };
const ACTIONABLE_NONE = "NONE";
const crit = (id, satisfied, reason, refs) => ({ id: id, satisfied: !!satisfied, reason: reason, evidenceRefs: refs || [] });

/**
 * Les entrees de RECALCUL de la preparation. La lignee de readiness est celle
 * du graphe AMONT : elle ne peut pas contenir les noeuds readiness eux-memes,
 * qui n'existent pas encore au moment ou la preparation est evaluee. La lignee
 * de qualification, elle, les inclut.
 */
function readinessInputs(input, phase) {
  return { phase: phase, runContext: input.runContext,
    candidateAssessment: input.candidateAssessment, panelValidation: input.panelValidation,
    llmCapability: input.llmCapability, llmConfig: input.llmConfig, llmNodesWillRun: input.llmNodesWillRun,
    professionalCorpus: input.professionalCorpus, twinSet: input.twinSet, reviewSet: input.reviewSet, aggregation: input.aggregation,
    lineageRefs: input.readinessLineageRefs || input.lineageRefs,
    artifactRegistry: input.readinessArtifactRegistry || input.artifactRegistry,
    crossRunAllowedRelations: input.crossRunAllowedRelations,
    upstreamUnknowns: input.upstreamUnknowns, addedUnknowns: phase === PHASE.FULL ? (input.addedUnknowns || []) : [] };
}

function compareReadiness(presented, recomputed, label) {
  if (!presented) return { problems: [] };
  const problems = [];
  if (presented.phase !== recomputed.phase) problems.push(label + " : phase presentee " + presented.phase + ", recalculee " + recomputed.phase + ".");
  if (presented.status !== recomputed.status) problems.push(label + " : status presente " + presented.status + ", recalcule " + recomputed.status + ".");
  if (presented.dimensionsHash !== recomputed.dimensionsHash) problems.push(label + " : les dimensions presentees ne correspondent pas au recalcul sur les sources.");
  const pb = new Set(presented.blockingDimensions || []);
  const hidden = (recomputed.blockingDimensions || []).filter((n) => !pb.has(n));
  if (hidden.length) problems.push(label + " : dimension(s) bloquante(s) masquee(s) : " + hidden.join(", ") + ".");
  if ((presented.unknowns || []).length < (recomputed.unknowns || []).length) {
    problems.push(label + " : " + ((recomputed.unknowns || []).length - (presented.unknowns || []).length) + " inconnu(s) manquant(s) dans l'evaluation presentee.");
  }
  return { problems: problems };
}

function qualifyProcess(input) {
  input = input || {};
  const ctx = input.runContext || {};
  const production = RM.isProductionContext(ctx);
  const criteria = [];
  const reservations = (input.reservations || []).slice();
  const limitations = (input.limitations || []).slice();
  const trust = { attestationVerified: false, executionMode: RM.effectiveMode(ctx), authorityId: null, runId: null, problems: [] };

  const ca = input.candidateAssessment;
  if (!ca || ca.schema !== "EvidenceForge.ProfessionalCandidateAssessment") {
    criteria.push(crit("source_artifacts_present", false, "ProfessionalCandidateAssessment absente : sans artefact source, la preparation ne peut etre recalculee et rien ne peut etre qualifie."));
    return build(QUALIFICATION.IMPOSSIBLE, criteria, reservations, [], limitations, input, ACTIONABLE_NONE, ctx, null, null, trust, false);
  }

  // ---- Racine de confiance : la premiere question, pas la derniere.
  if (ctx.manifest) {
    try {
      RM.assertManifestAuthentic(ctx.manifest, ctx.anchorSet, ctx.attestation, { now: ctx.now, seenNonces: ctx.seenNonces });
      trust.attestationVerified = true; trust.authorityId = ctx.manifest.authorityId; trust.runId = ctx.manifest.runId;
    } catch (e) { trust.problems.push(e.message); }
  } else {
    trust.problems.push("aucun contexte de run atteste : la chaine ne peut etre que COHERENTE, jamais authentifiee.");
  }
  criteria.push(crit("trusted_runtime_attestation", trust.attestationVerified,
    trust.attestationVerified ? "run atteste par l'autorite \"" + trust.authorityId + "\" en mode " + trust.executionMode
      : trust.problems.join(" ; ")));

  // ---- Recalcul de la preparation depuis les SOURCES.
  const pre = evaluateReadiness(readinessInputs(input, PHASE.PRE));
  const full = evaluateReadiness(readinessInputs(input, PHASE.FULL));
  const divergences = compareReadiness(input.readinessPre, pre, "readiness PRE").problems
    .concat(compareReadiness(input.readinessFull, full, "readiness FULL").problems);
  // §17 — les phases presentees doivent aussi resister au controle de source.
  [[input.readinessPre, PHASE.PRE], [input.readinessFull, PHASE.FULL]].forEach(function (p) {
    if (!p[0]) return;
    try {
      assertReadinessPhase(p[0], p[1], { registry: input.artifactRegistry,
        expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
        expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
        expectedAttestationHash: ctx.manifest ? ctx.manifest.trustedRuntimeAttestationHash : undefined,
        crossRunAllowedRelations: input.crossRunAllowedRelations }, "readiness " + p[1]);
    } catch (e) { divergences.push(e.message); }
  });
  criteria.push(crit("readiness_recomputed_matches_presented", divergences.length === 0,
    divergences.length ? divergences.slice(0, 6).join(" ; ") : "les evaluations presentees concordent avec le recalcul sur les artefacts sources"));

  // ---- Inconnus repris aux SOURCES, avec chaines verifiees (§14).
  const unkCtx = { registry: input.artifactRegistry, requireResolvableEvidence: input.artifactRegistry ? true : false,
    expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
    expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
    expectedAttestationHash: ctx.manifest ? ctx.manifest.trustedRuntimeAttestationHash : undefined,
    crossRunAllowedRelations: input.crossRunAllowedRelations };
  const chainProblems = [];
  (ca.unknowns || []).forEach(function (u, i) {
    try { assertChainValid(u, "candidateAssessment.unknowns[" + i + "]", unkCtx); } catch (e) { chainProblems.push(e.message); }
  });
  criteria.push(crit("unknown_history_validated", chainProblems.length === 0,
    chainProblems.length ? chainProblems.slice(0, 4).join(" ; ") : "chaque histoire d'inconnu est verifiee, et chaque preuve invoquee resout"));

  const fromSources = propagate(propagate(input.upstreamUnknowns || [], ca.unknowns || [], { requireResolvableEvidence: false }), pre.unknowns || [], { requireResolvableEvidence: false });
  let unknowns = propagate(fromSources, full.unknowns || [], { requireResolvableEvidence: false });
  unknowns = propagate(unknowns, input.addedUnknowns || [], { requireResolvableEvidence: false });
  assertNoSilentLoss(fromSources, unknowns, "qualification");

  const pv = validatePanelValidation(input.panelValidation, ca, ctx);
  criteria.push(crit("panel_gate_validated", pv.valid, pv.valid ? "porte humaine validee, liaisons recalculees, actes humains authentifies" : pv.problems.slice(0, 4).join(" ; ")));
  const approved = pv.valid ? pv.approved.length : 0;
  criteria.push(crit("human_panel_gate_passed", approved > 0, approved > 0 ? approved + " professionnel(s) approuve(s) par un acte humain authentifie" : "aucun professionnel approuve par un acte authentifie"));

  const reviews = (input.reviewSet && input.reviewSet.reviews) || [];
  let capOk = true;
  if (reviews.length > 0) {
    const cu = assertCapabilityUsable(input.llmCapability, input.llmConfig, ctx);
    capOk = cu.usable;
    criteria.push(crit("llm_capability_validated", cu.usable, cu.usable ? "capacite LLM constatee par sonde active, liee au run atteste" : cu.problems.slice(0, 4).join(" ; ")));
  } else {
    criteria.push(crit("llm_capability_validated", true, "aucune revue : capacite LLM sans objet"));
  }
  criteria.push(crit("readiness_pre", pre.status !== READINESS.NOT_READY, "readiness PRE recalculee = " + pre.status + (pre.blockingDimensions.length ? " (" + pre.blockingDimensions.join(", ") + ")" : "")));
  criteria.push(crit("readiness_full", full.status !== READINESS.NOT_READY, "readiness FULL recalculee = " + full.status + (full.blockingDimensions.length ? " (" + full.blockingDimensions.join(", ") + ")" : "")));
  criteria.push(crit("reviews_present", reviews.length > 0, reviews.length + " revue(s)"));
  const complete = reviews.filter((r) => r.reviewStatus === "complete").length;
  criteria.push(crit("reviews_complete", reviews.length > 0 && complete === reviews.length, complete + "/" + reviews.length + " revue(s) complete(s)"));

  const lin = resolveLineage(input.lineageRefs, input.artifactRegistry, {
    relation: RELATION.QUALIFICATION,
    expectedRunId: ctx.manifest ? ctx.manifest.runId : undefined,
    expectedMissionHash: ctx.manifest ? ctx.manifest.missionHash : undefined,
    expectedAttestationHash: ctx.manifest ? ctx.manifest.trustedRuntimeAttestationHash : undefined,
    crossRunAllowedRelations: input.crossRunAllowedRelations });
  criteria.push(crit("lineage_typed_and_resolved", lin.resolved,
    lin.resolved ? lin.resolvedRefs.length + " arete(s) de lignee resolue(s), typee(s) et liee(s) au run" : lin.problems.slice(0, 4).join(" ; "),
    lin.resolvedRefs.map((r) => r.sha256)));

  const blocking = blockingOpen(unknowns);
  criteria.push(crit("no_blocking_unknown", blocking.length === 0,
    blocking.length ? blocking.length + " inconnu(s) BLOQUANT(s) : " + blocking.map((u) => u.reason).join(" ; ") : "aucun inconnu bloquant"));

  const internalOk = divergences.length === 0 && chainProblems.length === 0 && lin.resolved && pv.valid
    && approved > 0 && capOk && pre.status !== READINESS.NOT_READY && full.status !== READINESS.NOT_READY
    && blocking.length === 0 && reviews.length > 0;

  let status;
  if (!internalOk) {
    status = QUALIFICATION.NOT_QUALIFIED;
    criteria.filter((c) => !c.satisfied && c.id !== "trusted_runtime_attestation")
      .forEach((c) => { const r = c.id + " : " + c.reason; if (reservations.indexOf(r) === -1) reservations.push(r); });
    if (reviews.length === 0) reservations.push("aucune revue produite : le processus ne peut etre qualifie.");
  } else if (production && !trust.attestationVerified) {
    // §0/§20 — la coherence sans authentification n'est PAS une qualification de production.
    status = QUALIFICATION.NOT_QUALIFIED;
    reservations.push("chaine interne coherente, mais AUCUNE execution de production authentifiee : "
      + trust.problems.join(" ; ") + ". Une chaine coherente n'est pas une preuve de production.");
  } else {
    const open = openOnes(unknowns);
    const allSat = criteria.every((c) => c.satisfied);
    if (allSat && open.length === 0 && reservations.length === 0 && pre.status === READINESS.READY && full.status === READINESS.READY) {
      status = QUALIFICATION.QUALIFIED;
    } else {
      status = QUALIFICATION.WITH_RESERVATIONS;
      if (!trust.attestationVerified) reservations.push("run non atteste : la qualification porte sur la COHERENCE de la chaine, pas sur une execution authentifiee.");
      if (full.status === READINESS.PARTIAL) reservations.push("readiness FULL = PARTIAL");
      if (complete < reviews.length) reservations.push("couverture de revue incomplete : " + complete + "/" + reviews.length);
      open.forEach((u) => { const r = "inconnu non bloquant conserve : " + u.reason; if (reservations.indexOf(r) === -1) reservations.push(r); });
      (full.reservations || []).forEach((r) => { if (reservations.indexOf(r) === -1) reservations.push(r); });
    }
  }
  const actionable = (status === QUALIFICATION.NOT_QUALIFIED || status === QUALIFICATION.IMPOSSIBLE) ? ACTIONABLE_NONE : "PERMITTED";
  return build(status, criteria, reservations, unknowns, limitations, input, actionable, ctx, pre, full, trust, internalOk);
}

function build(status, criteria, reservations, unknowns, limitations, input, actionable, ctx, pre, full, trust, internalOk) {
  const production = RM.isProductionContext(ctx);
  const out = {
    schema: "EvidenceForge.ScientificQualification", schemaVersion: "MONO-10-v4",
    qualificationId: null,
    qualificationStatus: status, scope: "PROCESS_ONLY", doesNotDecideVerdict: true,
    // §0 — les deux notions, cote a cote, jamais fusionnees.
    internalChainConsistency: internalOk === true,
    authenticatedProductionExecution: production && trust.attestationVerified === true,
    evidenceClass: (production && trust.attestationVerified) ? "AUTHENTICATED_PRODUCTION_EXECUTION"
      : (trust.attestationVerified ? "AUTHENTICATED_TEST_EXECUTION" : "INTERNAL_CHAIN_CONSISTENCY_ONLY"),
    trustedRuntime: { attestationVerified: trust.attestationVerified, executionMode: trust.executionMode,
      authorityId: trust.authorityId, runId: trust.runId, problems: trust.problems },
    verdictPermitted: actionable !== ACTIONABLE_NONE,
    scientificallyActionableVerdict: actionable,
    qualifies: input.qualifies || [],
    readinessRecomputed: !!(pre && full),
    recomputedReadinessPre: pre ? { readinessId: pre.readinessId, phase: pre.phase, status: pre.status, dimensionsHash: pre.dimensionsHash, blockingDimensions: pre.blockingDimensions } : null,
    recomputedReadinessFull: full ? { readinessId: full.readinessId, phase: full.phase, status: full.status, dimensionsHash: full.dimensionsHash, blockingDimensions: full.blockingDimensions } : null,
    missionHash: ctx.manifest ? ctx.manifest.missionHash : null,
    runId: ctx.manifest ? ctx.manifest.runId : null,
    attestationHash: ctx.manifest ? ctx.manifest.trustedRuntimeAttestationHash : null,
    criteria: criteria, reservations: reservations, unknowns: unknowns, limitations: limitations,
    openUnknownCount: openOnes(unknowns).length, blockingUnknownCount: blockingOpen(unknowns).length,
    expertCountUsedAsCriterion: false,
    note: "Qualifie la qualite du PROCESSUS. Ne choisit jamais le verdict de mission. "
      + "NOT_QUALIFIED n'efface ni ne modifie aucun verdict anterieur : il en bloque l'usage aval. "
      + "Une chaine interne coherente n'est jamais, a elle seule, une preuve d'execution de production.",
  };
  out.qualificationId = "qualification-" + sha256Of({ status: status, criteria: criteria.map((c) => c.id + ":" + c.satisfied),
    pre: pre && pre.readinessId, full: full && full.readinessId, evidenceClass: out.evidenceClass, runId: out.runId }).slice(0, 24);
  return out;
}

function applyPriorVerdictPolicy(qualification, priorVerdict) {
  const blocked = qualification.qualificationStatus === QUALIFICATION.NOT_QUALIFIED
    || qualification.qualificationStatus === QUALIFICATION.IMPOSSIBLE;
  return { priorVerdict: priorVerdict === undefined ? null : priorVerdict, priorVerdictPreserved: true,
    scientificallyActionableVerdict: blocked ? ACTIONABLE_NONE : priorVerdict,
    reason: blocked ? "qualificationStatus = " + qualification.qualificationStatus + " : le verdict anterieur reste enregistre tel quel ; seul son usage aval est bloque."
      : "qualification compatible avec un usage aval du verdict." };
}

module.exports = { qualifyProcess, applyPriorVerdictPolicy, compareReadiness, readinessInputs, QUALIFICATION, ACTIONABLE_NONE };
