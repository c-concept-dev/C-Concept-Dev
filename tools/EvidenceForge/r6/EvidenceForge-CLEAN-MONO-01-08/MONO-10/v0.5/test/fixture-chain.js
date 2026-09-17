"use strict";
/**
 * MONO-10 v0.5 — test/fixture-chain.js
 *
 * Traverse le VRAI chemin : frontiere operateur, verificateur livre, registre
 * authentifie, adaptateur a porte livre. Aucun substitut local.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucune execution aval,
 * aucun acte humain reel.
 */
const os = require("os"), fs = require("fs"), path = require("path");
const C = "../core/";
const { sha256Of } = require(C + "canonical.js");
const OTB = require(C + "operator-trust-boundary.js");
const OTV = require(C + "operator-trust-verifier.js");
const RA = require(C + "runtime-attestation.js");
const RM = require(C + "run-evidence-manifest.js");
const AAR = require(C + "authenticated-artifact-registry.js");
const LIN = require(C + "lineage.js");
const ESP = require(C + "evidence-source-provenance.js");
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
const OP = require("../tools/operator-provisioning.js");

const R = LIN.RELATION;
const now = () => new Date().toISOString();

/** Simule le geste d'EXPLOITATION : ecrire la configuration hors du processus appelant. */
function provisionOperator(o) {
  o = o || {};
  const dir = o.dir || fs.mkdtempSync(path.join(os.tmpdir(), "ef-operator-"));
  const ns = o.namespace || "PRODUCTION";
  const auth = o.authority || OP.mintOperatorAuthority({ authorityId: o.authorityId || ("AUT-" + ns), namespace: ns });
  const registryPath = path.join(dir, "actors.json");
  OP.writeHumanActorRegistry(registryPath, o.actors || [{ actorIdentity: "auditeur-panel", status: "ACTIVE" }]);
  const cfg = {
    operatorTrustBoundaryId: o.boundaryId || ("otb-" + ns.toLowerCase()),
    namespace: ns,
    authorities: [{ authorityId: auth.authorityId, keys: o.keys || [auth.keyRecord()] }].concat(o.extraAuthorities || []),
    replayProtection: o.replayProtection || (ns === "PRODUCTION" ? { kind: "FILE", directory: path.join(dir, "nonces") } : { kind: "MEMORY" }),
    humanAuth: o.humanAuth || (ns === "PRODUCTION" ? { kind: "OPERATOR_REGISTRY", registryPath: registryPath } : { kind: "TEST_FIXTURE" }),
  };
  const cfgPath = path.join(dir, "trust.json");
  OP.writeOperatorTrustConfig(cfgPath, cfg);
  return { dir, cfgPath, authority: auth, namespace: ns, registryPath, cfg };
}

/** Obtenir la frontiere : PRODUCTION par l'environnement, TEST en processus. */
function boundaryFor(op) {
  if (op.namespace === "PRODUCTION") {
    const prev = process.env[OTB.ENV_VAR];
    process.env[OTB.ENV_VAR] = op.cfgPath;
    try { return OTB.provisionProductionTrustBoundary(); }
    finally { if (prev === undefined) delete process.env[OTB.ENV_VAR]; else process.env[OTB.ENV_VAR] = prev; }
  }
  return OTB.provisionTestTrustBoundary(op.cfg);
}

const docRecord = (id, root, authRoot, famRoot) => ESP.makeDocumentaryEvidenceRecord({
  evidenceId: id, sourceRootId: root, authorityRootId: authRoot, familyRootId: famRoot,
  retrievedAt: now(), locator: "opaque:" + id, contentHash: sha256Of({ id }) });

const candidate = (ref, labels) => ({
  candidateRef: ref, displayName: "Personne " + ref, disciplines: labels, dimensionRef: labels[0],
  identifiers: [{ type: "seconde-source", value: "src2:" + ref, subjectBinding: "CONFIRMED",
    verificationStatus: "VERIFIED", confidenceContribution: 0.6, provenanceRefKey: "doc-b:" + ref }],
  affiliations: [], candidateStatus: "SEED_CANDIDATE", provenanceRefKey: "doc-a:" + ref,
  evidenceRefKeys: ["doc-a:" + ref, "doc-b:" + ref], provenance: [{ origin: "SEED" }],
});

async function buildChain(o) {
  o = o || {};
  const op = o.operator || provisionOperator({ namespace: o.mode || "PRODUCTION" });
  const boundary = o.boundary || boundaryFor(op);
  const verifier = o.verifier || OTV.createOperatorTrustVerifier(boundary);
  const mode = boundary.namespace;
  const missionId = o.missionId || "mission-integration";
  const missionBinding = { missionId: missionId };
  const missionHash = sha256Of(missionBinding);
  const runId = o.runId || ("run-" + mode.toLowerCase() + "-" + sha256Of({ missionId, n: o.runSalt || 0 }).slice(0, 8));
  const intent = { runId, missionHash, producerId: "MONO-10", producerVersion: "v0.5",
    executionMode: mode, openedAt: now() };
  const attestation = o.attestation || op.authority.attest(intent);
  const manifest = RM.openRunEvidenceManifest({ verifier, attestation, runIntent: intent, missionBinding, missionHash });
  const ctxBase = { manifest, verifier, attestation };

  const B = [];
  const bind = (id, rel, art) => { const b = RM.bindArtifact(manifest, art, id, art.schema || rel); B.push([id, rel, b]); return b; };
  const reg = () => AAR.createAuthenticatedArtifactRegistry(manifest, B.map(([id, rel, a]) => ({ artifactId: id, relation: rel, artifact: a })));

  const mission = bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
  const cands = o.candidates || [candidate("c-1", ["libelle-alpha"]), candidate("c-2", ["libelle-alpha"]), candidate("c-3", ["libelle-alpha"])];
  // Enregistrements documentaires : deux racines de source distinctes par candidat.
  const docRefs = new Map();
  cands.forEach(function (c, i) {
    const a = bind("doc-a:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE, docRecord("doc-a:" + c.candidateRef, "SRC-ROOT-A-" + i, "AUTH-ROOT-A-" + i, "FAM-ROOT-A"));
    const b = bind("doc-b:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE, docRecord("doc-b:" + c.candidateRef, "SRC-ROOT-B-" + i, "AUTH-ROOT-B-" + i, "FAM-ROOT-B"));
    docRefs.set("doc-a:" + c.candidateRef, LIN.artifactRef(a, "doc-a:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE));
    docRefs.set("doc-b:" + c.candidateRef, LIN.artifactRef(b, "doc-b:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE));
  });
  const resolveKeys = (c) => Object.assign({}, c, {
    provenanceRef: docRefs.get(c.provenanceRefKey) || null,
    identifiers: (c.identifiers || []).map((x) => Object.assign({}, x, { provenanceRef: docRefs.get(x.provenanceRefKey) || null })),
    evidenceRefs: (c.evidenceRefKeys || []).map((k) => docRefs.get(k)).filter(Boolean),
  });
  const resolved = cands.map(resolveKeys);

  const discovery = bind("professional-discovery", R.DISCOVERY, {
    schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A", missionId, candidates: resolved });
  const verification = bind("professional-verification", R.VERIFICATION, {
    schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B", missionId,
    verified: resolved.map((c, i) => ({ candidateRef: c.candidateRef, displayName: c.displayName,
      verificationStatus: i === 0 ? "UNVERIFIED" : "VERIFIED" })) });

  const reg0 = reg();
  const assessmentRaw = CA.assessCandidates({ discovery, verification,
    missionLabels: o.missionLabels || ["libelle-alpha"], runId, missionHash,
    attestationHash: manifest.runtimeAttestationHash, artifactRegistry: reg0,
    discoveryArtifactId: "professional-discovery", verificationArtifactId: "professional-verification" });
  const assessment = bind("candidate-assessment", R.ASSESSMENT, assessmentRaw);

  const tpl = PG.buildPanelValidationTemplate(assessment);
  const decisions = o.decisions || { "c-1": PG.DECISION.APPROVE, "c-2": PG.DECISION.APPROVE, "c-3": PG.DECISION.DEFER };
  const authMode = mode === "TEST" ? HA.AUTHENTICATION.TEST_FIXTURE : undefined;
  const validationRaw = Object.assign({}, tpl, { decisions: tpl.decisions.map((d) => Object.assign({}, d, {
    decision: decisions[d.candidateId], decisionReason: "motif consigne pour " + d.candidateId,
    actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel", decidedAt: now(),
    authenticationMode: authMode })) });
  const validation = bind("panel-validation", R.PANEL_DECISION, validationRaw);

  const ctx = Object.assign({}, ctxBase, { artifactRegistry: reg() });
  const baseAdapter = {
    async discoverProfessionals() { return discovery; },
    async verifyProfessionals() { return Object.assign({}, verification, { summary: { total: verification.verified.length } }); },
    async buildProfessionalCorpus(inputs) {
      return { schema: "EvidenceForge.ProfessionalCorpusSet", missionId,
        professionalCorpora: inputs.professionalVerification.verified.map((v) => ({ professionalRef: v.candidateRef, works: ["oeuvre-1"] })) };
    },
  };
  const gated = PGA.createPanelGatedAdapter(baseAdapter, { panelValidation: validation, candidateAssessment: assessment, runContext: ctx });

  return {
    op, boundary, verifier, attestation, manifest, ctx, intent, runId, missionId, missionHash, mode,
    mission, discovery, verification, assessment, validation, gated, docRefs, bind, reg,
    async complete() {
      const verified = await gated.verifyProfessionals({}, {});
      const eligibility = bind("effective-eligibility", R.EFFECTIVE_ELIGIBILITY, {
        schema: "EvidenceForge.EffectiveCorpusEligibilitySet", missionId,
        entries: verified.verified.map((v) => ({ candidateId: v.candidateRef, effectiveCorpusEligibility: v.effectiveCorpusEligibility,
          legacyVerificationStatus: v.legacyVerificationStatus, humanPanelDecision: v.humanPanelDecision })) });
      const corpus = bind("professional-corpus", R.CORPUS, await gated.buildProfessionalCorpus({ professionalVerification: verified }, {}));
      const twinSet = bind("twin-set", R.TWINS, { schema: "EvidenceForge.DocumentaryTwinSet",
        twins: corpus.professionalCorpora.map((p) => ({ twinRef: "twin-" + p.professionalRef, professionalRef: p.professionalRef })) });
      const reviewSet = bind("review-set", R.REVIEWS, { schema: "EvidenceForge.ReviewSet",
        reviews: twinSet.twins.map((t) => ({ reviewRef: "review-" + t.twinRef, twinRef: t.twinRef, reviewStatus: "complete" })), summary: { targets: 1 } });
      const aggregation = bind("aggregation", R.AGGREGATION, { schema: "EvidenceForge.Aggregation", aggregates: [{ aggregateRef: "agg-1" }] });
      const llmConfig = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true };
      const transport = o.transport || (async () => ({ httpStatus: 200, text: '{"ok":true,"probe":"evidenceforge"}',
        requestId: "req-fixture", credentialProbeSkipped: false, costUsd: 0 }));
      const capability = bind("llm-capability", R.CAPABILITY, await LC.runActiveProbe(llmConfig, transport, ctx));

      let registry = reg();
      let lineageRefs = B.map(([id, rel, a]) => LIN.artifactRef(a, id, rel));
      const ctxA = Object.assign({}, ctxBase, { artifactRegistry: registry });
      const sources = { runContext: ctxA, candidateAssessment: assessment, panelValidation: validation,
        llmCapability: capability, llmConfig, professionalCorpus: corpus, twinSet, reviewSet, aggregation,
        lineageRefs, artifactRegistry: registry };

      const pre = bind("readiness-pre", R.READINESS_PRE, SR.evaluateReadiness(Object.assign({ phase: "PRE" }, sources)));
      const full = bind("readiness-full", R.READINESS_FULL, SR.evaluateReadiness(Object.assign({ phase: "FULL" }, sources)));
      const registry2 = reg();
      const lineageRefs2 = B.map(([id, rel, a]) => LIN.artifactRef(a, id, rel));
      const ctxB = Object.assign({}, ctxBase, { artifactRegistry: registry2 });
      const sources2 = Object.assign({}, sources, { runContext: ctxB, lineageRefs: lineageRefs2, artifactRegistry: registry2,
        readinessLineageRefs: lineageRefs, readinessArtifactRegistry: registry, readinessPre: pre, readinessFull: full });

      const qualification = bind("scientific-qualification", R.QUALIFICATION, SQ.qualifyProcess(sources2));
      const priorReport = { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId },
        testStatus: { scientificValidity: false, testMode: true, humanProfessionalValidation: false } };
      const registry3 = reg();
      const report = bind("scientific-unified-report", R.REPORT, SUR.buildScientificUnifiedReport(Object.assign({}, sources2,
        { runContext: Object.assign({}, ctxBase, { artifactRegistry: registry3 }), priorReport, qualification,
          priorVerdict: { verdictRef: "verdict-anterieur-1" }, artifactRegistry: registry3 })));
      const accTpl = FRA.buildAcceptanceTemplate(report);
      const acceptance = bind("final-report-acceptance", R.ACCEPTANCE, Object.assign({}, accTpl, {
        decision: FRA.DECISION.ACCEPT, actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel",
        decidedAt: now(), authenticationMode: authMode, reservationsAcknowledged: accTpl.reservationsPresented.slice() }));

      const registry4 = reg();
      const ctxF = Object.assign({}, ctxBase, { artifactRegistry: registry4 });
      const authRefs = [LIN.artifactRef(qualification, "scientific-qualification", R.QUALIFICATION),
        LIN.artifactRef(report, "scientific-unified-report", R.REPORT),
        LIN.artifactRef(acceptance, "final-report-acceptance", R.ACCEPTANCE)];
      const authorization = DA.resolveDownstreamUseAuthorization({ runContext: ctxF, qualification,
        qualificationSources: Object.assign({}, sources2, { runContext: ctxF, artifactRegistry: registry4 }),
        report, acceptance, acceptanceValidator: FRA.validateAcceptance,
        lineageRefs: authRefs, artifactRegistry: registry4, policy: o.policy });

      return { mission, discovery, verification, assessment, validation, verified, eligibility, corpus, twinSet,
        reviewSet, aggregation, capability, llmConfig, registry: registry4, lineageRefs: lineageRefs2, authRefs,
        sources: Object.assign({}, sources2, { runContext: ctxF, artifactRegistry: registry4 }),
        pre, full, qualification, priorReport, report, acceptance, authorization,
        ctx: ctxF, manifest, attestation, verifier, boundary, op, bind, reg, docRefs, B };
    },
  };
}

module.exports = { buildChain, provisionOperator, boundaryFor, candidate, docRecord, now };
