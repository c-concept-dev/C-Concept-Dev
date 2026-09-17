"use strict";
/**
 * MONO-10 v0.11 — test/fixture-chain.js
 *
 * Traverse le VRAI chemin : frontieres operateur (confiance, acceptation, acte
 * humain, capacite LLM), registre append-only authentifie, adaptateur a porte
 * livre, recalcul d'eligibilite au sink.
 *
 * Aucun reseau, aucun LLM reel, aucun run EF-02, aucun acte humain reel.
 */
const os = require("os"), fs = require("fs"), path = require("path"), crypto = require("crypto");
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
const HAP = require(C + "human-act-proof.js");
const HAB = require(C + "operator-human-auth-boundary.js");
const AC = require(C + "artifact-capabilities.js");
const AD = require(C + "authority-descriptor.js");
const OPA = require(C + "operator-provenance-authority.js");
const HAP2 = require(C + "human-act-proof.js");
const OP = require("../tools/operator-provisioning.js");

const R = LIN.RELATION;

/**
 * Racines de provenance de la FIXTURE. Ce sont des racines d'exploitation
 * locales, declarees explicitement, jamais des identifiants de registre reel.
 * Deux familles DISTINCTES existent parce que l'exploitant les a enregistrees
 * comme distinctes — pas parce qu'un appelant a change une chaine.
 */
const DEFAULT_PROVENANCE_ROOTS = [];
for (let i = 0; i < 12; i++) {
  DEFAULT_PROVENANCE_ROOTS.push({ sourceRootId: "SRC-ROOT-A-" + i, authorityRootId: "AUT-ROOT-A-" + i, familyRootId: "FAM-ROOT-A" });
  DEFAULT_PROVENANCE_ROOTS.push({ sourceRootId: "SRC-ROOT-B-" + i, authorityRootId: "AUT-ROOT-B-" + i, familyRootId: "FAM-ROOT-B" });
}
const now = () => new Date().toISOString();
const TRANSPORT_REF = path.resolve(__dirname, "..", "tools", "reference-llm-transport.js");

/** Geste d'EXPLOITATION : ecrire la configuration hors du processus appelant. */
function provisionOperator(o) {
  o = o || {};
  const dir = o.dir || fs.mkdtempSync(path.join(os.tmpdir(), "ef6-operator-"));
  const ns = o.namespace || "PRODUCTION";
  const auth = o.authority || OP.mintOperatorAuthority({ authorityId: o.authorityId || ("AUT-" + ns + "-" + crypto.randomBytes(3).toString("hex")), namespace: ns });
  const registryPath = path.join(dir, "actors.json");
  const provenancePath = path.join(dir, "provenance-roots.json");
  const historicalPath = path.join(dir, "historical-inputs.json");
  const replayRoot = path.join(dir, "replay");
  const actProofSecret = o.actProofSecret || crypto.randomBytes(32).toString("hex");
  OP.writeHumanActorRegistry(registryPath, o.actors || [{ actorIdentity: "auditeur-panel", status: "ACTIVE", actProofSecret: actProofSecret }]);
  // §32 — racines de provenance provisionnees PAR L'EXPLOITANT. La fixture joue
  // ce geste d'exploitation : elle declare quelles racines existent, et le
  // noyau ne croira que celles-la.
  OP.writeProvenanceRootRegistry(provenancePath, o.provenanceRoots || DEFAULT_PROVENANCE_ROOTS);
  OP.writeHistoricalInputRegistry(historicalPath, o.historicalInputs || []);
  const cfg = {
    operatorTrustBoundaryId: o.boundaryId || ("otb-" + ns.toLowerCase() + "-" + crypto.randomBytes(3).toString("hex")),
    namespace: ns,
    authorities: [{ authorityId: auth.authorityId, keys: o.keys || [auth.keyRecord()] }],
    // §22 (v0.8) — plus aucune racine n'est declaree : la reserve est ANCREE au
    // fichier de configuration de confiance. En TEST, la configuration est en
    // memoire : il n'y a pas d'ancre, donc la reserve est en memoire.
    replayProtection: o.replayProtection
      || (ns === "PRODUCTION" ? { kind: "FILE", authorityScope: [auth.authorityId] }
        : { kind: "MEMORY", authorityScope: [auth.authorityId] }),
    humanAuth: o.humanAuth || (ns === "PRODUCTION" ? { kind: "OPERATOR_ACT_PROOF", registryPath: registryPath } : { kind: "TEST_FIXTURE" }),
    llmCapability: o.llmCapability || (ns === "PRODUCTION"
      ? { kind: "OPERATOR_TRANSPORT", transportModuleRef: TRANSPORT_REF }
      : { kind: "TEST_TRANSPORT", transportModuleRef: TRANSPORT_REF }),
    acceptance: o.acceptance || {},
    provenanceAuthority: o.provenanceAuthority || { kind: "OPERATOR_ROOT_REGISTRY", registryPath: provenancePath },
    historicalInput: o.historicalInput || { kind: "OPERATOR_AUTHORIZED_INPUTS", registryPath: historicalPath },
  };
  const cfgPath = path.join(dir, "trust.json");
  OP.writeOperatorTrustConfig(cfgPath, cfg);
  return { dir, cfgPath, authority: auth, namespace: ns, registryPath, provenancePath, historicalPath,
    replayRoot, actProofSecret, cfg };
}

function boundaryFor(op) {
  if (op.namespace === "PRODUCTION") {
    const prev = process.env[OTB.ENV_VAR];
    process.env[OTB.ENV_VAR] = op.cfgPath;
    try { return OTB.provisionProductionTrustBoundary(); }
    finally { if (prev === undefined) delete process.env[OTB.ENV_VAR]; else process.env[OTB.ENV_VAR] = prev; }
  }
  return OTB.provisionTestTrustBoundary(op.cfg);
}

const docRecord = (id, root, authRoot, famRoot, content) => ESP.makeDocumentaryEvidenceRecord({
  evidenceId: id, sourceRootId: root, authorityRootId: authRoot, familyRootId: famRoot,
  retrievedAt: now(), locator: "opaque:" + id, contentHash: content || sha256Of({ id }) });

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
  const verifier = o.verifier || OTB.verifierFor(boundary);
  const mode = boundary.namespace;
  const missionId = o.missionId || "mission-integration";
  const missionBinding = { missionId: missionId };
  const missionHash = sha256Of(missionBinding);
  const runId = o.runId || ("run-" + mode.toLowerCase() + "-" + sha256Of({ missionId, n: o.runSalt || 0 }).slice(0, 8));
  const intent = { runId, missionHash, producerId: "MONO-10", producerVersion: "v0.6", executionMode: mode, openedAt: now() };
  const attestation = o.attestation || op.authority.attest(intent);
  const manifest = RM.openRunEvidenceManifest({ verifier, attestation, runIntent: intent, missionBinding, missionHash });
  const ctxBase = { manifest, verifier, attestation };
  const registry = AAR.openAuthenticatedArtifactRegistry(manifest, ctxBase);
  const ctx = Object.assign({}, ctxBase, { artifactRegistry: registry });

  const bind = (id, rel, art) => { const b = RM.bindArtifact(manifest, art, id, art.schema || rel); registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };

  /**
   * §32 — geste d'exploitation : DEMANDER a l'autorite de provenance
   * d'authentifier les racines d'une preuve documentaire. L'autorite decide ;
   * la fixture n'affirme rien. Une racine absente du registre reste UNRESOLVED,
   * et la preuve ne sera pas presentable a un humain.
   */
  /**
   * §4/§6 (v0.10) — la fixture ne DETIENT plus l'autorite et ne minte plus rien.
   * Elle DEMANDE une certification ; la frontiere resout, decide, inscrit sa
   * decision, emet la capacite et la concede au registre. C'est l'operation
   * causale reelle, pas un geste declaratif.
   */
  function grantProvenance(artifactId) {
    const cert = verifier.certifyProvenance({ registry: registry, artifactId: artifactId });
    if (cert.certified) return "AUTHENTICATED";
    return (cert.resolution && cert.resolution.status) || "UNRESOLVED";
  }
  /** §11 — PRODUCTION_LLM_CAPABILITY exige une sonde REELLEMENT executee. */
  function grantLlmCapability(artifactId) {
    const cert = verifier.certifyLlmCapability({ registry: registry, artifactId: artifactId });
    return cert.certified === true ? true : cert.problems;
  }
  /** §4 — HUMAN_AUTHENTICATED exige la verification de CHAQUE acte presente. */
  function grantHumanAuthenticated(artifactId, acts) {
    const cert = verifier.certifyHumanAuthenticated({ registry: registry, artifactId: artifactId, acts: acts || [] });
    return cert.certified === true ? true : cert.problems;
  }
  const mkProof = (actionType, decisionHash) => {
    if (mode === "TEST") return null;
    return OP.issueHumanActProof({ actorId: o.actorIdentity || "auditeur-panel", actionType, decisionHash,
      runId, missionHash, mechanismRef: verifier.humanAuthMechanismId(), actProofSecret: op.actProofSecret });
  };
  const authMode = mode === "TEST" ? HAB.AUTHENTICATION.TEST_FIXTURE : undefined;

  const mission = bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId, missionHash });
  const cands = o.candidates || [candidate("c-1", ["libelle-alpha"]), candidate("c-2", ["libelle-alpha"]), candidate("c-3", ["libelle-alpha"])];
  const docRefs = new Map();
  cands.forEach(function (c, i) {
    const a = bind("doc-a:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE, docRecord("doc-a:" + c.candidateRef, "SRC-ROOT-A-" + i, "AUTH-ROOT-A-" + i, "FAM-ROOT-A"));
    const b = bind("doc-b:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE, docRecord("doc-b:" + c.candidateRef, "SRC-ROOT-B-" + i, "AUTH-ROOT-B-" + i, "FAM-ROOT-B"));
    grantProvenance("doc-a:" + c.candidateRef);
    grantProvenance("doc-b:" + c.candidateRef);
    docRefs.set("doc-a:" + c.candidateRef, LIN.artifactRef(a, "doc-a:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE));
    docRefs.set("doc-b:" + c.candidateRef, LIN.artifactRef(b, "doc-b:" + c.candidateRef, R.DOCUMENTARY_EVIDENCE));
  });
  const resolved = cands.map((c) => Object.assign({}, c, {
    provenanceRef: docRefs.get(c.provenanceRefKey) || null,
    identifiers: (c.identifiers || []).map((x) => Object.assign({}, x, { provenanceRef: docRefs.get(x.provenanceRefKey) || null })),
    evidenceRefs: (c.evidenceRefKeys || []).map((k) => docRefs.get(k)).filter(Boolean) }));

  const discovery = bind("professional-discovery", R.DISCOVERY, { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A", missionId, candidates: resolved });
  const verification = bind("professional-verification", R.VERIFICATION, { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B", missionId,
    verified: resolved.map((c, i) => ({ candidateRef: c.candidateRef, displayName: c.displayName, verificationStatus: i === 0 ? "UNVERIFIED" : "VERIFIED" })) });

  const assessment = bind("candidate-assessment", R.ASSESSMENT, CA.assessCandidates({ discovery, verification,
    missionLabels: o.missionLabels || ["libelle-alpha"], runId, missionHash,
    attestationHash: manifest.runtimeAttestationHash, artifactRegistry: registry,
    /** §10 (v0.10) — le verificateur du run est REQUIS : sans lui, aucune
     *  provenance n'est verifiable et aucune reference n'entre au corpus. */
    verifier: verifier,
    discoveryArtifactId: "professional-discovery", verificationArtifactId: "professional-verification" }));

  const tpl = PG.buildPanelValidationTemplate(assessment);
  const decisions = o.decisions || { "c-1": PG.DECISION.APPROVE, "c-2": PG.DECISION.APPROVE, "c-3": PG.DECISION.DEFER };
  const assessById = new Map(); (assessment.assessments || []).forEach((a) => assessById.set(a.candidateId, a));
  const validation = bind("panel-validation", R.PANEL_DECISION, Object.assign({}, tpl, {
    decisions: tpl.decisions.map(function (d) {
      const dec = decisions[d.candidateId];
      const dh = PG.panelDecisionHash(assessment, assessById.get(d.candidateId), dec);
      return Object.assign({}, d, { decision: dec, decisionReason: "motif consigne pour " + d.candidateId,
        actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel", decidedAt: now(),
        authenticationMode: authMode, decisionHash: dh,
        humanActProof: mkProof(HAP.ACTION_TYPE.PANEL_DECISION, dh) });
    }) }));

  /**
   * §4 (v0.10) — on presente les ACTES eux-memes et ce qu'ils doivent lier.
   * Le mecanisme verifie chacun ; la fixture n'en resume aucun.
   */
  grantHumanAuthenticated("panel-validation", (validation.decisions || []).map(function (d) {
    return { act: d, expected: { actionType: HAP.ACTION_TYPE.PANEL_DECISION, decisionHash: d.decisionHash,
      runId: runId, missionHash: missionHash } };
  }));

  const baseAdapter = o.baseAdapter || {
    async discoverProfessionals() { return discovery; },
    async verifyProfessionals() { return Object.assign({}, verification, { summary: { total: verification.verified.length } }); },
    async buildProfessionalCorpus(inputs) {
      return { schema: "EvidenceForge.ProfessionalCorpusSet", missionId,
        professionalCorpora: inputs.professionalVerification.verified.map((v) => ({ professionalRef: v.candidateRef, works: ["oeuvre-1"] })) };
    },
  };
  const gated = PGA.createPanelGatedAdapter(baseAdapter, { panelValidation: validation, candidateAssessment: assessment,
    runContext: ctx, panelValidationArtifactId: "panel-validation", eligibilityPolicy: o.eligibilityPolicy });

  return {
    op, boundary, verifier, attestation, manifest, ctx, registry, intent, runId, missionId, missionHash, mode,
    mission, discovery, verification, assessment, validation, gated, docRefs, bind, mkProof, authMode,
    async complete() {
      const verified = await gated.verifyProfessionals({}, {});
      const eligibility = bind("effective-eligibility", R.EFFECTIVE_ELIGIBILITY, { schema: "EvidenceForge.EffectiveCorpusEligibilitySet", missionId,
        entries: verified.verified.map((v) => ({ candidateId: v.candidateRef, effectiveCorpusEligibility: v.effectiveCorpusEligibility })) });
      const corpus = bind("professional-corpus", R.CORPUS, await gated.buildProfessionalCorpus({ professionalVerification: verified }, {}));
      const twinSet = bind("twin-set", R.TWINS, { schema: "EvidenceForge.DocumentaryTwinSet", twins: corpus.professionalCorpora.map((p) => ({ twinRef: "twin-" + p.professionalRef, professionalRef: p.professionalRef })) });
      const reviewSet = bind("review-set", R.REVIEWS, { schema: "EvidenceForge.ReviewSet", reviews: twinSet.twins.map((t) => ({ reviewRef: "review-" + t.twinRef, twinRef: t.twinRef, reviewStatus: "complete" })), summary: { targets: 1 } });
      const aggregation = bind("aggregation", R.AGGREGATION, { schema: "EvidenceForge.Aggregation", aggregates: [{ aggregateRef: "agg-1" }] });
      const llmConfig = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true, runId: runId };
      /** §11 (v0.10) — la sonde est executee PAR la frontiere, jamais par l'appelant. */
      const capability = bind("llm-capability", R.CAPABILITY, await verifier.runLlmProbe(llmConfig, ctx));
      grantLlmCapability("llm-capability");

      const refsOf = () => registry.entries().map((e) => LIN.artifactRef(registry.get(e.artifactId).artifact, e.artifactId, e.relation));
      let lineageRefs = refsOf();
      const sources = { runContext: ctx, candidateAssessment: assessment, panelValidation: validation,
        llmCapability: capability, llmConfig, professionalCorpus: corpus, twinSet, reviewSet, aggregation,
        lineageRefs, artifactRegistry: registry };
      const pre = bind("readiness-pre", R.READINESS_PRE, SR.evaluateReadiness(Object.assign({ phase: "PRE" }, sources)));
      const full = bind("readiness-full", R.READINESS_FULL, SR.evaluateReadiness(Object.assign({ phase: "FULL" }, sources)));
      const lineageRefs2 = refsOf();
      const sources2 = Object.assign({}, sources, { lineageRefs: lineageRefs2,
        readinessLineageRefs: lineageRefs, readinessArtifactRegistry: registry, readinessPre: pre, readinessFull: full });

      const qualification = bind("scientific-qualification", R.QUALIFICATION, SQ.qualifyProcess(sources2));
      const priorReport = { schema: "EvidenceForge.PriorUnifiedReport", mission: { missionId },
        testStatus: { scientificValidity: false, testMode: true, humanProfessionalValidation: false } };
      const report = bind("scientific-unified-report", R.REPORT, SUR.buildScientificUnifiedReport(Object.assign({}, sources2,
        { priorReport, qualification, priorVerdict: { verdictRef: "verdict-anterieur-1" } })));

      const accTpl = FRA.buildAcceptanceTemplate(report);
      const accDecision = o.acceptanceDecision || FRA.DECISION.ACCEPT;
      const accHash = FRA.acceptanceDecisionHash(report, accDecision);
      const acceptance = bind("final-report-acceptance", R.ACCEPTANCE, Object.assign({}, accTpl, {
        decision: accDecision, actorType: "human", actorIdentity: o.actorIdentity || "auditeur-panel",
        decidedAt: now(), authenticationMode: authMode, decisionHash: accHash,
        humanActProof: mkProof(HAP.ACTION_TYPE.REPORT_ACCEPTANCE, accHash),
        reservationsAcknowledged: accTpl.reservationsPresented.slice() }));

      const authRefs = [LIN.artifactRef(qualification, "scientific-qualification", R.QUALIFICATION),
        LIN.artifactRef(report, "scientific-unified-report", R.REPORT),
        LIN.artifactRef(acceptance, "final-report-acceptance", R.ACCEPTANCE)];
      const authorization = DA.resolveDownstreamUseAuthorization({ runContext: ctx, qualification,
        qualificationSources: sources2, report, acceptance, lineageRefs: authRefs, artifactRegistry: registry, policy: o.policy });

      return { mission, discovery, verification, assessment, validation, verified, eligibility, corpus, twinSet,
        reviewSet, aggregation, capability, llmConfig, registry, lineageRefs: lineageRefs2, authRefs,
        sources: sources2, pre, full, qualification, priorReport, report, acceptance, authorization,
        ctx, manifest, attestation, verifier, boundary, op, bind, docRefs, mkProof, intent, runId, missionHash };
    },
  };
}

module.exports = { buildChain, provisionOperator, boundaryFor, candidate, docRecord, now, TRANSPORT_REF };
