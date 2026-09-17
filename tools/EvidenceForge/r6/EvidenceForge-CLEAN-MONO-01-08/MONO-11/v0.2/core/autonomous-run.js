"use strict";
/**
 * MONO-11 v0.2 — core/autonomous-run.js (successeur de v0.1 : normalisation cible, enforcement EF-02D3/EF-03B, reprise informee)
 *
 * ORCHESTRATION du chemin nominal autonome, ENTIEREMENT par injection :
 *
 *   candidats evalues (MONO-10 assessCandidates, gele)
 *   -> corpus attribuable par candidat (oeuvres reelles injectees, politique d'identifiants MONO-09 gelee)
 *   -> CorpusSufficiencyEvidence (MONO-11)            [deterministe, sans LLM]
 *   -> RelevanceEvidence (MONO-11 + EF-02D2 gele)      [LLM reel, seulement si corpus SUFFICIENT]
 *   -> MachineEvidenceGate (MONO-11)                   [deterministe]
 *   -> panel autonome -> corpus admis -> couverture (EF-02D3) -> jumeaux (EF-02E)
 *   -> revues (EF-03B) -> agregation (EF-03C)          [LLM reel]
 *
 * Ordonnancement voulu : la sonde de corpus (gratuite) PRECEDE l'oracle (couteux) ;
 * un candidat au corpus insuffisant ou non attribuable n'est jamais soumis au LLM.
 * Le gate ne recoit jamais un artefact aval (G-7) : les etapes aval s'executent
 * APRES la decision et ne la relisent pas.
 *
 * Rien ici ne connait un metier, un fournisseur, un secret ou un cas d'usage.
 */
const CSP = require("./corpus-sufficiency-probe.js");
const SRO = require("./semantic-relevance-oracle.js");
const MEG = require("./machine-evidence-gate.js");
const APA = require("./autonomous-panel-adapter.js");
const TN = require("./target-normalizer.js");
const CE = require("./coverage-enforcer.js");
const RE = require("./review-enforcer.js");
const arr = (v) => (Array.isArray(v) ? v : []);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/** Corpus d'EVALUATION (forme EF-02C-v2) : oeuvres reelles normalisees par MONO-09, jamais completees. */
async function buildEvaluationCorpus(F, fetchAuthorWorks, candidateRef, candidate, log) {
  let raw = [];
  try { raw = arr(await fetchAuthorWorks(candidateRef, candidate)); }
  catch (e) {
    log({ event: "corpus_fetch_error", candidateId: candidateRef, message: String(e.message) });
    return { professionalRef: candidateRef, status: "error", error: String(e.message), identityRef: { displayName: candidate.displayName, openAlexAuthorId: candidateRef, orcid: candidate.orcid || null }, corpus: { works: [] }, summary: { workCount: 0 } };
  }
  const norm = raw.map(F.M09.identifierPolicy.normalizeWork);
  const usable = norm.filter((w) => w.usable);
  const corpus = { professionalRef: candidateRef, status: "complete",
    identityRef: { displayName: candidate.displayName, openAlexAuthorId: candidateRef, orcid: candidate.orcid || null },
    corpus: { works: usable.map((w) => ({ workRef: w.workRef, providerNativeId: w.providerNativeId, title: w.title, doi: w.doi, doiStatus: w.doiStatus, publicationYear: w.publicationYear, topics: w.topics, identifierProvenance: w.identifierProvenance })) },
    summary: { workCount: usable.length, discardedWithoutIdentity: norm.length - usable.length, worksWithoutDoi: usable.filter((w) => w.doi === null).length } };
  F.M09.identifierPolicy.assertNoFabricatedIdentifiers([corpus]);
  return corpus;
}

/**
 * runAutonomousPanel(input)
 * input : { frozen, ledger, registry, assessment, discovery, verification, fetchAuthorWorks(candidateRef, candidate) -> oeuvres brutes, attributionFor(candidateRef, corpus)
 *           -> attribution, llmCall, missionQuestion, dimensionSet, ctx {runId, missionHash, operatorTrustBoundaryId, attestationHash},
 *           assessmentRef, sufficiencyPolicyOverride, log }
 */
async function runAutonomousPanel(input) {
  input = input || {};
  const F = input.frozen, L = input.ledger, log = typeof input.log === "function" ? input.log : function () {};
  if (!F || !L) throw Object.assign(new Error("RUN_INPUT_INVALID: frozen et ledger requis"), { code: "RUN_INPUT_INVALID" });
  if (!input.assessment || input.assessment.schema !== "EvidenceForge.ProfessionalCandidateAssessment") throw Object.assign(new Error("RUN_INPUT_INVALID: assessment MONO-10 requis"), { code: "RUN_INPUT_INVALID" });
  if (typeof input.fetchAuthorWorks !== "function") throw Object.assign(new Error("RUN_INPUT_INVALID: fetchAuthorWorks requis (dependance reelle injectee)"), { code: "RUN_INPUT_INVALID" });
  if (typeof input.attributionFor !== "function") throw Object.assign(new Error("RUN_INPUT_INVALID: attributionFor requis (preuve d'attribution de l'adaptateur)"), { code: "RUN_INPUT_INVALID" });
  const ctx = input.ctx || {};
  const candById = new Map(); arr(input.discovery && input.discovery.candidates).forEach((c) => { if (isStr(c.candidateRef)) candById.set(c.candidateRef, c); });
  const verById = new Map(); arr(input.verification && input.verification.verified).forEach((v) => { if (isStr(v.candidateRef)) verById.set(v.candidateRef, v); });
  const gateInputs = [], corpora = [], stats = { evaluated: 0, corpusFetched: 0, corpusSufficient: 0, oracleCalls: 0, oracleSkipped: 0, unresolvedSkipped: 0 };

  for (const a of arr(input.assessment.assessments)) {
    const c = candById.get(a.candidateId);
    if (!c) { stats.unresolvedSkipped++; log({ event: "candidate_skipped", candidateId: a.candidateId, reason: "identite non resolue (aucun candidateRef)" }); continue; }
    stats.evaluated++;
    /* 1. corpus attribuable — oeuvres RECUPEREES par la dependance injectee (reelle), normalisees par la
       politique d'identifiants de MONO-09 (gelee) : un identifiant absent reste absent, un identifiant
       fabrique fait echouer. Le statut de verification amont n'est ni lu comme admission ni reecrit. */
    const corpus = await buildEvaluationCorpus(F, input.fetchAuthorWorks, a.candidateId, c, log);
    stats.corpusFetched++;
    const attribution = await input.attributionFor(a.candidateId, corpus);
    const corpusEvidence = CSP.probeCorpusSufficiency({ frozen: F, corpus: corpus, candidateRef: a.candidateId, attribution: attribution, policyOverride: input.sufficiencyPolicyOverride });
    const ceBound = L.record("mono11:corpus-sufficiency:" + a.candidateId, "corpus-sufficiency", corpusEvidence, [input.assessmentRef].filter(Boolean));
    if (corpusEvidence.status === "SUFFICIENT") stats.corpusSufficient++;
    corpora.push(corpus);
    /* 2. pertinence reelle — seulement si le corpus est suffisant ET attribue */
    let relevanceEvidence;
    if (corpusEvidence.status === "SUFFICIENT") {
      relevanceEvidence = await SRO.evaluateRelevanceEvidence({ frozen: F, corpus: corpus, attributedWorkRefs: corpusEvidence.attribution.attributedWorkRefs,
        missionQuestion: input.missionQuestion, dimensionSet: input.dimensionSet, llmCall: input.llmCall, runId: ctx.runId, missionHash: ctx.missionHash,
        onValidation: input.onValidation, opts: input.oracleOpts /* ex. { maxWorks } : nombre d'oeuvres soumises a EF-02D2 (defaut gele : 10, dans l'ordre du corpus) */ });
      stats.oracleCalls += relevanceEvidence.oracle.calls.length;
    } else {
      stats.oracleSkipped++;
      relevanceEvidence = { schema: "EvidenceForge.RelevanceEvidence", schemaVersion: "MONO-11-v1", candidateRef: a.candidateId, runId: ctx.runId || null, missionHash: ctx.missionHash || null,
        relevanceClass: "UNKNOWN", reasonCodes: ["RELEVANCE_UNKNOWN"], supportingDimensions: [], partialDimensions: [], supportingWorks: [], judgments: null,
        oracle: { component: "non consulte", calls: [], realCall: false, error: "corpus " + corpusEvidence.status + " : l'oracle n'est pas consulte" }, limitations: ["oracle non consulte"], unknowns: [] };
    }
    const reBound = L.record("mono11:relevance:" + a.candidateId, "relevance-evidence", relevanceEvidence, [L.ref("mono11:corpus-sufficiency:" + a.candidateId)]);
    gateInputs.push({ assessment: a, candidate: c, corpusEvidence: corpusEvidence, relevanceEvidence: relevanceEvidence,
      seedWorkRefs: arr(c.seedReferences).map((r) => r.providerWorkId).filter(isStr),
      candidateUnknowns: arr(input.assessment.unknowns).filter((u) => u && typeof u.reason === "string" && u.reason.indexOf('"' + c.displayName + '"') !== -1),
      evidenceArtifactRefs: { assessment: input.assessmentRef || null, corpus: L.ref("mono11:corpus-sufficiency:" + a.candidateId), relevance: L.ref("mono11:relevance:" + a.candidateId) } });
    log({ event: "candidate_evidence", candidateId: a.candidateId, corpus: corpusEvidence.status, relevance: relevanceEvidence.relevanceClass, oracleCalls: relevanceEvidence.oracle.calls.length });
  }

  /* 3. le gate — deterministe, sans aucun artefact aval */
  const panel = MEG.gatePanel({ candidates: gateInputs, dimensionSet: input.dimensionSet, ctx: ctx });
  const panelBound = L.record("mono11:gate-panel", "machine-gate-panel", panel, gateInputs.flatMap((g) => [g.evidenceArtifactRefs.corpus, g.evidenceArtifactRefs.relevance]));
  log({ event: "machine_evidence_gate", counts: panel.counts, admitted: panel.approvedCandidateIds.length, reservations: panel.reservations.map((r) => r.code) });
  const corpusSetAll = { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2", missionId: input.assessment.missionId, professionalCorpora: corpora };
  return { panel: panelBound, gateInputs: gateInputs, corpusSetAll: corpusSetAll, stats: stats };
}

/**
 * runDownstream(input) — APRES le gate : corpus admis -> couverture -> jumeaux -> revues -> agregation.
 * input : { frozen, ledger, panel, corpusSetAll, dimensionSet, missionQuestion, missionId, targetDocuments [{targetId, label, content, role}],
 *           llmCall, exclusionRegistry?, panelValidation? (override humain), assessment, runContext, log }
 */
async function runDownstream(input) {
  input = input || {};
  const F = input.frozen, L = input.ledger, log = typeof input.log === "function" ? input.log : function () {};
  let panel = input.panel;
  if (input.panelValidation) panel = APA.applyHumanOverride({ frozen: F, panel: panel, panelValidation: input.panelValidation, assessment: input.assessment, ctx: input.runContext });
  const admittedIds = APA.admittedCandidateIds(panel);
  if (admittedIds.length === 0) {
    const e = new Error("FAIL_CLOSED_NO_ADMITTED_PROFESSIONAL: 0 professionnel admis — aucun corpus, aucun jumeau, aucune revue ne sera produit."); e.code = "FAIL_CLOSED_NO_ADMITTED_PROFESSIONAL"; throw e;
  }
  const corpusSet = APA.filterCorpusSetToPanel(input.corpusSetAll, panel);
  const corpusByRef = new Map(corpusSet.professionalCorpora.map((c) => [c.professionalRef, c]));
  const calls = [];
  const llm = SRO.recordedLlmCall(input.llmCall, calls, { purpose: "downstream", runId: (panel && panel.runId) || null });
  /* Couverture EF-02D3 (gele) : records "usables" = les admis, avec leurs jugements D2 reels */
  const relByRef = new Map(input.gateInputs ? input.gateInputs.map((g) => [g.assessment.candidateId, g.relevanceEvidence]) : []);
  const usable = admittedIds.map((id) => ({ professionalRef: id, displayName: (corpusByRef.get(id) && corpusByRef.get(id).identityRef.displayName) || null,
    dimensionRelevance: (relByRef.get(id) && relByRef.get(id).judgments) || [] }));
  /* v0.2 — couverture EF-02D3 avec ENFORCEMENT local des references (un theme n'est pas une oeuvre) et reprise informee ;
     prompt et validateur EF-02D3 geles inchanges. */
  const cov = await CE.buildEnforcedCoverageMatrix({ frozen: F, usableRecords: usable, corpusByRef: corpusByRef, dimensionSet: input.dimensionSet, missionQuestion: input.missionQuestion,
    llmCall: input.llmCall, maxPasses: input.coverageMaxPasses, onValidation: input.onValidation, runId: panel.runId || null });
  const coverageMatrix = cov.coverageMatrix;
  L.record("mono11:coverage-enforcement-trace", "enforcement-trace", { schema: "EvidenceForge.CoverageEnforcementTrace", schemaVersion: "MONO-11-v2", traces: cov.traces }, [L.ref("mono11:gate-panel")]);
  const coverageBound = L.record("mono11:coverage-matrix", "coverage-matrix", coverageMatrix, [L.ref("mono11:gate-panel")]);
  const panelSelection = APA.buildPanelSelection({ panel: panel, dimensionSet: input.dimensionSet, missionQuestion: input.missionQuestion, coverageMatrix: coverageMatrix });
  /* Eligibilite/pertinence EF-02D-v2 attendue par EF-02E : derivee des preuves MONO-11 (jamais recalculee par quota) */
  const eligibilityRelevanceSet = { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2", missionId: input.missionId, missionQuestion: input.missionQuestion,
    dimensionSetRef: { missionId: input.dimensionSet.missionId, dimensionSetHash: input.dimensionSet.dimensionSetHash, dimensionCount: input.dimensionSet.dimensions.length },
    records: admittedIds.map(function (id) {
      const g = (input.gateInputs || []).find((x) => x.assessment.candidateId === id);
      return { schema: "EvidenceForge.DocumentaryEligibilityRelevance", schemaVersion: "EF-02D-v2", professionalRef: id,
        /* v0.2 (F10) : jamais fabriquee — l'eligibilite vient de la sonde de suffisance ; absente => insuffisante (le jumeau sera bloque, honnetement) */
        eligibility: g && g.corpusEvidence && g.corpusEvidence.eligibility ? g.corpusEvidence.eligibility : { schema: "EvidenceForge.DocumentaryEligibility", schemaVersion: "EF-02D-v2", professionalRef: id, status: "insufficient_documentary", reason: "aucune sonde de suffisance pour ce candidat" },
        dimensionRelevance: (relByRef.get(id) && relByRef.get(id).judgments) || [] };
    }) };
  const exclusionRegistry = input.exclusionRegistry || F.M01.EXCL.buildExclusionRegistry([], new Date().toISOString());
  const twinSet = await F.M01.E.buildDocumentaryTwinSet({ corpusSet: corpusSet, eligibilityRelevanceSet: eligibilityRelevanceSet, coverageMatrix: coverageMatrix, panelSelection: panelSelection,
    dimensionSet: input.dimensionSet, exclusionRegistry: exclusionRegistry, missionId: input.missionId, missionQuestion: input.missionQuestion, builtAt: new Date().toISOString() });
  const twinsBound = L.record("mono11:twin-set", "twin-set", twinSet, [L.ref("mono11:coverage-matrix")]);
  log({ event: "twins_built", built: twinSet.twins.length, blocked: twinSet.blocked.map((b) => b.reason) });
  if (twinSet.twins.length === 0) { const e = new Error("FAIL_CLOSED_NO_TWIN: 0 jumeau construit — aucune revue ne sera produite."); e.code = "FAIL_CLOSED_NO_TWIN"; throw e; }
  /* v0.2 — NORMALISATION CANONIQUE A L'INGESTION (original conserve, hache, journal de transformation), avant EF-03 gele */
  const normalization = arr(input.targetDocuments).map((t) => TN.normalizeTargetDocument(t));
  const normalizationRecords = normalization.map((n) => n.record);
  L.record("mono11:target-normalization", "target-normalization", { schema: "EvidenceForge.TargetNormalizationSet", schemaVersion: "MONO-11-v2", ruleSetId: TN.RULE_SET_ID,
    records: normalizationRecords.map((r) => Object.assign({}, r, { original: undefined, normalized: undefined })), originals: normalizationRecords.map((r) => ({ targetId: r.targetId, originalSha256: r.originalSha256, normalizedSha256: r.normalizedSha256 })) }, [L.ref("mono11:twin-set")]);
  const targetDocumentSet = await F.M01.TDS.buildTargetDocumentSet(input.missionId, normalization.map((n) => n.document));
  /* cibles de revue : construites par EF-03A depuis les libelles ; leurs targetId (target-NN, par position) doivent
     correspondre aux targetId du TargetDocumentSet — l'appelant fournit les documents dans le meme ordre. */
  const reviewTargets = F.M01.RS.buildReviewTargets(arr(input.targetDocuments).map((t) => t.label));
  reviewTargets.forEach((t, i) => { if (arr(input.targetDocuments)[i].targetId !== t.targetId) { const e = new Error("TARGET_ID_MISMATCH: " + t.targetId + " vs " + arr(input.targetDocuments)[i].targetId); e.code = "TARGET_ID_MISMATCH"; throw e; } });
  const reviewSchema = await F.M01.RS.buildReviewSchema({ twinSet: twinSet, dimensionSet: input.dimensionSet, reviewTargets: reviewTargets, missionQuestion: input.missionQuestion });
  /* v0.2 — revues avec ENFORCEMENT local a schema ferme et REPRISE INFORMEE (aucun retry aveugle) ; prompt et
     validateur EF-03B geles inchanges ; le nombre de passes est un parametre d'exploitation (defaut 3). */
  const rv = await RE.buildEnforcedReviewSet({ frozen: F, reviewSchema: reviewSchema, twinSet: twinSet, targetDocumentSet: targetDocumentSet, llmCall: input.llmCall,
    maxPasses: input.reviewMaxPasses, onValidation: input.onValidation, runId: panel.runId || null });
  const reviewSet = Object.assign({}, rv.reviewSet, { normalizationRuleSetId: TN.RULE_SET_ID });
  L.record("mono11:review-enforcement-trace", "enforcement-trace", { schema: "EvidenceForge.ReviewEnforcementTrace", schemaVersion: "MONO-11-v2", traces: rv.traces }, [L.ref("mono11:twin-set")]);
  log({ event: "reviews_enforced", expected: reviewSet.summary.reviewsExpected, complete: reviewSet.summary.reviewsComplete, error: reviewSet.summary.reviewsError, passesUsed: rv.traces.map((t) => t.acceptedPass) });
  const reviewsBound = L.record("mono11:review-set", "review-set", reviewSet, [L.ref("mono11:twin-set")]);
  log({ event: "reviews_done", complete: reviewSet.summary.reviewsComplete, error: reviewSet.summary.reviewsError });
  const aggregation = await F.M01.AGG.buildAggregatedDocumentaryReview(reviewSet, { workerCallFn: llm, missionQuestion: input.missionQuestion });
  const aggBound = L.record("mono11:aggregation", "aggregation", aggregation, [L.ref("mono11:review-set")]);
  return { panel: panel, corpusSet: corpusSet, coverageMatrix: coverageBound, panelSelection: panelSelection, twinSet: twinsBound, reviewSchema: reviewSchema,
    targetDocumentSet: targetDocumentSet, normalizationRecords: normalizationRecords, reviewSet: reviewsBound, aggregation: aggBound, llmCalls: calls, enforcementTraces: { coverage: cov.traces, reviews: rv.traces } };
}

module.exports = { runAutonomousPanel, runDownstream };
