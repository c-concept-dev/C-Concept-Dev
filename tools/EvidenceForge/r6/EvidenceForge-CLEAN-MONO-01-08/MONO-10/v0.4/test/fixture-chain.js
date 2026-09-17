"use strict";
/**
 * MONO-10 v0.4 — test/fixture-chain.js
 *
 * Constructeur de chaine complet, utilise par les tests. Il traverse le VRAI
 * chemin d'execution : l'adaptateur a porte LIVRE, les validateurs livres,
 * aucun substitut local.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval.
 */
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const TRA = require(C + "trusted-runtime-authority.js");
const RM = require(C + "run-evidence-manifest.js");
const LIN = require(C + "lineage.js");
const IDE = require(C + "identity-evidence.js");
const CA = require(C + "candidate-assessment.js");
const PG = require(C + "panel-gate.js");
const PGA = require(C + "panel-gated-adapter.js");
const LC = require(C + "llm-capability.js");
const SR = require(C + "scientific-readiness.js");
const SQ = require(C + "scientific-qualification.js");
const SUR = require(C + "scientific-unified-report.js");
const FRA = require(C + "final-report-acceptance.js");
const DA = require(C + "downstream-authorization.js");
const HA = require(C + "human-act.js");
const { createEphemeralAuthority } = require("../tools/ephemeral-authority.js");

const R = LIN.RELATION;
const now = () => new Date().toISOString();

/** Registre d'autorites EXTERIEUR : configure par l'exploitant, hors artefacts. */
function defaultAuthorityRegistry() {
  return IDE.createAuthorityRegistry([
    { authorityId: "LIB-A", canonicalAuthorityId: "AUT-1", familyId: "FAM-1" },
    { authorityId: "LIB-A-ALIAS", canonicalAuthorityId: "AUT-1", familyId: "FAM-1" },
    { authorityId: "LIB-B", canonicalAuthorityId: "AUT-2", familyId: "FAM-2" },
    { authorityId: "LIB-C", canonicalAuthorityId: "AUT-3", familyId: "FAM-1" },
  ]);
}

const candidate = (ref, labels) => ({
  candidateRef: ref, displayName: "Personne " + ref, disciplines: labels, dimensionRef: labels[0],
  identifiers: [{ type: "seconde-source", value: "src2:" + ref, sourceAuthorityId: "LIB-B", sourceFamilyId: "FAM-2",
    provenanceRecordHash: sha256Of({ src: "B", ref: ref }), subjectBinding: "CONFIRMED", verificationStatus: "VERIFIED", confidenceContribution: 0.6 }],
  affiliations: [], candidateStatus: "SEED_CANDIDATE",
  sourceAuthorityId: "LIB-A", sourceFamilyId: "FAM-1", provenanceRecordHash: sha256Of({ src: "A", ref: ref }),
  evidenceRefs: ["oeuvre-1", "oeuvre-2"], provenance: [{ origin: "SEED" }],
});

/** Mecanisme d'authentification d'acte humain INJECTE (double de test). */
function testHumanActVerifier(accepted) {
  const set = new Set(accepted || []);
  return function (act) {
    if (!set.has(act.actorIdentity)) return { authenticated: false, reason: "acteur inconnu du mecanisme configure" };
    return { authenticated: true, mechanismId: "mecanisme-de-test-injecte" };
  };
}

/**
 * buildChain(o)
 *  o.mode                 TEST | PRODUCTION
 *  o.authority            autorite emettrice (defaut : ephemere du bon mode)
 *  o.anchorSet            ancrages configures (defaut : celui de l'autorite)
 *  o.decisions            { candidateId: DECISION }
 *  o.humanActVerifier     mecanisme de production (absent => fail-closed)
 *  o.authorityRegistry    registre d'autorites exterieur
 */
function buildChain(o) {
  o = o || {};
  const mode = o.mode || TRA.MODE.TEST;
  const authority = o.authority || createEphemeralAuthority("AUT-" + mode, mode);
  const anchorSet = o.anchorSet || TRA.createTrustAnchorSet([authority.anchor()]);
  const missionId = o.missionId || "mission-integration";
  const missionBinding = { missionId: missionId };
  const missionHash = sha256Of(missionBinding);
  const runId = o.runId || ("run-" + mode.toLowerCase() + "-fixture");

  const attestation = authority.attest({ runId: runId, missionHash: missionHash,
    producerId: "MONO-10", producerVersion: "v0.4" });
  const manifest = RM.createRunEvidenceManifest({ attestation: attestation, anchorSet: anchorSet,
    missionBinding: missionBinding, missionHash: missionHash });

  const authenticationMode = mode === TRA.MODE.TEST ? HA.AUTHENTICATION.TEST_FIXTURE : undefined;
  const ctx = { manifest: manifest, anchorSet: anchorSet, attestation: attestation,
    humanActVerifier: o.humanActVerifier, allowTestFixtureActs: o.allowTestFixtureActs };

  const B = {};
  const bind = (id, rel, art) => { B[id] = RM.bindArtifact(manifest, art, id, art.schema || rel); B[id + "__rel"] = rel; return B[id]; };

  const mission = bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId: missionId, missionHash: missionHash });
  const discovery = bind("professional-discovery", R.DISCOVERY, {
    schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A", missionId: missionId,
    candidates: (o.candidates || [candidate("c-1", ["libelle-alpha"]), candidate("c-2", ["libelle-alpha"]), candidate("c-3", ["libelle-alpha"])]) });
  const verification = bind("professional-verification", R.VERIFICATION, {
    schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B", missionId: missionId,
    verified: discovery.candidates.map((c, i) => ({ candidateRef: c.candidateRef, displayName: c.displayName,
      verificationStatus: i === 0 ? "UNVERIFIED" : "VERIFIED" })) });

  const assessmentRaw = CA.assessCandidates({ discovery: discovery, verification: verification,
    missionLabels: o.missionLabels || ["libelle-alpha"], runId: runId, missionHash: missionHash,
    authorityRegistry: o.authorityRegistry || defaultAuthorityRegistry(),
    discoveryArtifactId: "professional-discovery", verificationArtifactId: "professional-verification" });
  const assessment = bind("candidate-assessment", R.ASSESSMENT, assessmentRaw);

  const tpl = PG.buildPanelValidationTemplate(assessment);
  const decisions = o.decisions || { "c-1": PG.DECISION.APPROVE, "c-2": PG.DECISION.APPROVE, "c-3": PG.DECISION.DEFER };
  const validationRaw = Object.assign({}, tpl, { decisions: tpl.decisions.map((d) => Object.assign({}, d, {
    decision: decisions[d.candidateId], decisionReason: "motif consigne pour " + d.candidateId,
    actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel", decidedAt: now(),
    authenticationMode: authenticationMode })) });
  const validation = bind("panel-validation", R.PANEL_DECISION, validationRaw);

  const baseAdapter = {
    async discoverProfessionals() { return discovery; },
    async verifyProfessionals() { return Object.assign({}, verification, { summary: { total: verification.verified.length } }); },
    async buildProfessionalCorpus(inputs) {
      return { schema: "EvidenceForge.ProfessionalCorpusSet", missionId: missionId,
        professionalCorpora: inputs.professionalVerification.verified.map((v) => ({ professionalRef: v.candidateRef, works: ["oeuvre-1"] })) };
    },
  };
  const gated = PGA.createPanelGatedAdapter(baseAdapter, { panelValidation: validation, candidateAssessment: assessment, runContext: ctx });

  return {
    mode, authority, anchorSet, attestation, manifest, ctx, runId, missionId, missionHash,
    discovery, verification, assessment, validation, gated, B,
    async complete() {
      const verified = await gated.verifyProfessionals({}, {});
      const eligibility = bind("effective-eligibility", R.EFFECTIVE_ELIGIBILITY, {
        schema: "EvidenceForge.EffectiveCorpusEligibilitySet", missionId: missionId,
        entries: verified.verified.map((v) => ({ candidateId: v.candidateRef, effectiveCorpusEligibility: v.effectiveCorpusEligibility,
          legacyVerificationStatus: v.legacyVerificationStatus, humanPanelDecision: v.humanPanelDecision })) });
      const corpusRaw = await gated.buildProfessionalCorpus({ professionalVerification: verified }, {});
      const corpus = bind("professional-corpus", R.CORPUS, corpusRaw);
      const twinSet = bind("twin-set", R.TWINS, { schema: "EvidenceForge.DocumentaryTwinSet",
        twins: corpus.professionalCorpora.map((p) => ({ twinRef: "twin-" + p.professionalRef, professionalRef: p.professionalRef })) });
      const reviewSet = bind("review-set", R.REVIEWS, { schema: "EvidenceForge.ReviewSet",
        reviews: twinSet.twins.map((t) => ({ reviewRef: "review-" + t.twinRef, twinRef: t.twinRef, reviewStatus: "complete" })),
        summary: { targets: 1 } });
      const aggregation = bind("aggregation", R.AGGREGATION, { schema: "EvidenceForge.Aggregation",
        aggregates: [{ aggregateRef: "agg-1", reviews: reviewSet.reviews.length }] });

      const llmConfig = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true };
      const transport = o.transport || (async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}',
        requestId: "req-fixture", credentialProbeSkipped: false, costUsd: 0 }));
      const capability = bind("llm-capability", R.CAPABILITY, await LC.runActiveProbe(llmConfig, transport, ctx));

      const entries = [["mission", R.MISSION, mission], ["professional-discovery", R.DISCOVERY, discovery],
        ["professional-verification", R.VERIFICATION, verification], ["candidate-assessment", R.ASSESSMENT, assessment],
        ["panel-validation", R.PANEL_DECISION, validation], ["effective-eligibility", R.EFFECTIVE_ELIGIBILITY, eligibility],
        ["professional-corpus", R.CORPUS, corpus], ["twin-set", R.TWINS, twinSet], ["review-set", R.REVIEWS, reviewSet],
        ["aggregation", R.AGGREGATION, aggregation], ["llm-capability", R.CAPABILITY, capability]];
      let registry = LIN.createArtifactRegistry(entries.map((e) => ({ artifactId: e[0], relation: e[1], artifact: e[2] })));
      let lineageRefs = entries.map((e) => LIN.artifactRef(e[2], e[0], e[1]));

      const sources = { runContext: ctx, candidateAssessment: assessment, panelValidation: validation,
        llmCapability: capability, llmConfig: llmConfig, professionalCorpus: corpus, twinSet: twinSet,
        reviewSet: reviewSet, aggregation: aggregation, lineageRefs: lineageRefs, artifactRegistry: registry };

      const pre = bind("readiness-pre", R.READINESS_PRE, SR.evaluateReadiness(Object.assign({ phase: "PRE" }, sources)));
      const full = bind("readiness-full", R.READINESS_FULL, SR.evaluateReadiness(Object.assign({ phase: "FULL" }, sources)));
      const entries2 = entries.concat([["readiness-pre", R.READINESS_PRE, pre], ["readiness-full", R.READINESS_FULL, full]]);
      registry = LIN.createArtifactRegistry(entries2.map((e) => ({ artifactId: e[0], relation: e[1], artifact: e[2] })));
      lineageRefs = entries2.map((e) => LIN.artifactRef(e[2], e[0], e[1]));
      const sources2 = Object.assign({}, sources, { lineageRefs: lineageRefs, artifactRegistry: registry,
        readinessLineageRefs: sources.lineageRefs, readinessArtifactRegistry: sources.artifactRegistry,
        readinessPre: pre, readinessFull: full });

      const qualification = bind("scientific-qualification", R.QUALIFICATION, SQ.qualifyProcess(sources2));
      const priorReport = { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId: missionId },
        testStatus: { scientificValidity: false, testMode: true, humanProfessionalValidation: false } };
      const entries3 = entries2.concat([["scientific-qualification", R.QUALIFICATION, qualification]]);
      let registry3 = LIN.createArtifactRegistry(entries3.map((e) => ({ artifactId: e[0], relation: e[1], artifact: e[2] })));
      const report = bind("scientific-unified-report", R.REPORT, SUR.buildScientificUnifiedReport(Object.assign({}, sources2,
        { runContext: ctx, priorReport: priorReport, qualification: qualification,
          priorVerdict: { verdictRef: "verdict-anterieur-1" }, artifactRegistry: registry3 })));

      const accTpl = FRA.buildAcceptanceTemplate(report);
      const acceptance = bind("final-report-acceptance", R.ACCEPTANCE, Object.assign({}, accTpl, {
        decision: FRA.DECISION.ACCEPT, actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel",
        decidedAt: now(), authenticationMode: authenticationMode,
        reservationsAcknowledged: accTpl.reservationsPresented.slice() }));

      const entries4 = entries3.concat([["scientific-unified-report", R.REPORT, report], ["final-report-acceptance", R.ACCEPTANCE, acceptance]]);
      const registry4 = LIN.createArtifactRegistry(entries4.map((e) => ({ artifactId: e[0], relation: e[1], artifact: e[2] })));
      const authRefs = [LIN.artifactRef(qualification, "scientific-qualification", R.QUALIFICATION),
        LIN.artifactRef(report, "scientific-unified-report", R.REPORT),
        LIN.artifactRef(acceptance, "final-report-acceptance", R.ACCEPTANCE)];

      const authorization = DA.resolveDownstreamUseAuthorization({ runContext: ctx, qualification: qualification,
        qualificationSources: sources2, report: report, acceptance: acceptance,
        acceptanceValidator: FRA.validateAcceptance, lineageRefs: authRefs, artifactRegistry: registry4, policy: o.policy });

      return { mission, discovery, verification, assessment, validation,
        verified, eligibility, corpus, twinSet, reviewSet, aggregation, capability, llmConfig,
        registry: registry4, lineageRefs, authRefs, sources: sources2, pre, full, qualification,
        priorReport, report, acceptance, authorization, ctx: ctx, manifest: manifest, attestation: attestation,
        anchorSet: anchorSet, bind: bind };
    },
  };
}

module.exports = { buildChain, candidate, defaultAuthorityRegistry, testHumanActVerifier, now };
