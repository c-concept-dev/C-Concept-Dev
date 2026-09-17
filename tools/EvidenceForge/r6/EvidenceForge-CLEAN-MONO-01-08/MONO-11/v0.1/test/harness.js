"use strict";
/**
 * MONO-11 v0.1 — test/harness.js
 * Monte un run MONO-10 PRODUCTION reel (frontiere operateur provisionnee par la
 * fixture GELEE de MONO-10 : test/fixture-chain.js), une decouverte MONO-09 reelle
 * (deps de test injectees) et le chemin MONO-11 complet, sur une mission synthetique.
 * Aucune preuve REAL : tout ce qui sort d'ici est marque fixture.
 */
const path = require("path");
const M11 = require("../index.js");
const { MISSIONS, makeFakeLlm } = require("./fixtures/domains.js");

function bundleRoot() {
  return process.env.EVIDENCEFORGE_BUNDLE_ROOT || path.resolve(__dirname, "..", "..", "..");
}

function snapshotFor(mission) {
  const seeds = mission.candidates.filter((c) => !c.secondary && c.seedWork !== null && c.seedWork !== undefined);
  const sources = seeds.map(function (c, i) {
    const w = c.works[(c.seedWork || 1) - 1];
    return { id: "source-synth-" + (i + 1), titre: w.display_name, auteurOuOrganisme: c.displayName, discipline: mission.dimensions[0].id,
      statutScreening: "inclus", provenance: { connectorId: "fixture", retrievalMethod: "fixture", originalReference: w.id } };
  });
  /* les personnes sans seedWork sont aussi des graines (source incluse dediee) pour entrer dans la decouverte */
  mission.candidates.filter((c) => !c.secondary && (c.seedWork === null || c.seedWork === undefined)).forEach(function (c, i) {
    const w = c.works[0];
    sources.push({ id: "source-synth-x" + (i + 1), titre: w.display_name, auteurOuOrganisme: c.displayName, discipline: mission.dimensions[0].id,
      statutScreening: "inclus", provenance: { connectorId: "fixture", retrievalMethod: "fixture", originalReference: w.id } });
  });
  return { schema: "EvidenceForge.CorpusSnapshot", id: "snap-" + mission.missionId, missionId: mission.missionId, sources: sources };
}

async function mountRun(missionKey, opts) {
  opts = opts || {};
  const mission = MISSIONS[missionKey];
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: bundleRoot() });
  const FX = require(path.join(F.M10.dir, "test", "fixture-chain.js"));
  const M10 = F.M10;
  const byName = new Map(mission.candidates.map((c) => [c.displayName, c]));
  const byId = new Map(mission.candidates.map((c) => [c.authorId, c]));
  const adapter = F.M09.adapter.createProfessionalPipelineAdapter({
    async resolveAuthorIdentity(seed) { const p = byName.get(seed.displayName); return p ? { providerAuthorId: p.authorId, orcid: p.orcid, affiliation: p.affiliation } : { providerAuthorId: null }; },
    async expandRelatedAuthors() { return mission.candidates.filter((c) => c.secondary).map((c) => ({ providerAuthorId: c.authorId, displayName: c.displayName, orcid: c.orcid, affiliation: c.affiliation, relation: "AUTHOR_OF_RELATED_WORK", evidenceRefs: [c.works[0].id] })); },
  });
  const snapshot = snapshotFor(mission);
  const dimensionSet = await F.M01.DIM.buildMissionDimensionSet({ missionId: mission.missionId, dimensions: mission.dimensions, createdAt: "2026-01-01T00:00:00.000Z" });
  const discovery = await adapter.discoverProfessionals({ corpusSnapshot: snapshot, missionDimensionSet: dimensionSet });
  /* homonymie synthetique : marquee sur le candidat designe */
  discovery.candidates.forEach((c) => { const p = byId.get(c.candidateRef); if (p && p.identityAmbiguity) c.identityAmbiguity = p.identityAmbiguity; });
  const verification = await adapter.verifyProfessionals({ professionalDiscovery: discovery });

  const roots = [];
  snapshot.sources.forEach((s) => roots.push({ sourceRootId: s.provenance.originalReference, authorityRootId: "AUT-FIXTURE-WORKS", familyRootId: "FAM-FIXTURE" }));
  mission.candidates.forEach((c) => roots.push({ sourceRootId: c.authorId, authorityRootId: "AUT-FIXTURE-AUTHORS", familyRootId: "FAM-FIXTURE" }));
  const op = FX.provisionOperator({ namespace: "PRODUCTION", provenanceRoots: roots });
  const boundary = FX.boundaryFor(op);
  const verifier = M10.OTB.verifierFor(boundary);
  const missionHash = M10.CANON.sha256Of({ missionQuestion: mission.missionQuestion });
  const runId = "run-fixture-" + missionKey + "-" + Date.now().toString(36);
  const intent = { runId, missionHash, producerId: "MONO-11-harness", producerVersion: "v0.1", executionMode: "PRODUCTION", openedAt: new Date().toISOString() };
  const att = op.authority.attest(intent);
  const manifest = M10.RM.openRunEvidenceManifest({ verifier, attestation: att, runIntent: intent, missionBinding: { missionId: mission.missionId }, missionHash });
  const ctx = { manifest, verifier, attestation: att };
  const registry = M10.AAR.openAuthenticatedArtifactRegistry(manifest, ctx);
  const R = M10.LIN.RELATION;
  const bind = (id, rel, art) => { const b = M10.RM.bindArtifact(manifest, art, id, art.schema || rel); registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };
  bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId: mission.missionId, missionHash, missionQuestion: mission.missionQuestion });
  const discoveryB = bind("professional-discovery", R.DISCOVERY, discovery);
  const verificationB = bind("professional-verification", R.VERIFICATION, verification);
  const binder = M10.UEB.createUpstreamEvidenceBinder({ registry, manifest, verifier, artifactIdPrefix: "amont" });
  const screened = snapshot.sources.map((x) => ({ localSourceId: x.id, providerWorkId: x.provenance.originalReference, observed: x, retrievedAt: null }));
  const boundSources = M10.UEB.bindScreenedSources({ binder, screenedSources: screened });
  const boundIdentities = M10.UEB.bindResolvedIdentities({ binder, discovery });
  const boundDiscovery = bind("professional-discovery-bound", R.DISCOVERY, M10.UEB.bindUpstreamDiscovery({
    discovery, sourceRefByProviderWorkId: boundSources.refByProviderWorkId, identityRefByCandidateRef: boundIdentities.refByCandidateRef,
    ambiguousIdentifiers: boundSources.ambiguous, upstreamVerification: verification, strongIdentifierField: "orcid",
    upstreamDiscoveryRef: M10.LIN.artifactRef(discoveryB, "professional-discovery", R.DISCOVERY) }));
  const assessment = bind("candidate-assessment", R.ASSESSMENT, M10.CA.assessCandidates({
    discovery: boundDiscovery, verification: verificationB, missionLabels: mission.dimensions.map((d) => d.label),
    runId, missionHash, attestationHash: manifest.runtimeAttestationHash, artifactRegistry: registry, verifier,
    discoveryArtifactId: "professional-discovery-bound", verificationArtifactId: "professional-verification" }));
  const assessmentRef = M10.LIN.artifactRef(assessment, "candidate-assessment", R.ASSESSMENT);
  const ledger = M11.ledger.openMono11Ledger({ manifest, registry, RM: M10.RM, CANON: M10.CANON });
  const llm = opts.llm || makeFakeLlm(mission, opts.tamper ? { tamper: opts.tamper } : {});
  const gateCtx = { runId, missionHash, operatorTrustBoundaryId: manifest.operatorTrustBoundaryId, attestationHash: manifest.runtimeAttestationHash };
  const fetchAuthorWorks = opts.fetchAuthorWorks || (async (ref) => { const p = byId.get(ref); return p ? p.works : []; });
  const attributionFor = opts.attributionFor || (async (ref, corpus) => {
    const p = byId.get(ref); const byWorkRef = {};
    (corpus.corpus.works || []).forEach((w) => { const raw = (p && p.works.find((x) => x.id === w.workRef)) || null;
      const ids = raw ? raw.authorships.map((a) => a.author.id) : [];
      byWorkRef[w.workRef] = { attributed: !!p && p.attributed && ids.indexOf(ref) !== -1, authorIds: ids, orcids: raw ? raw.authorships.map((a) => a.author.orcid).filter(Boolean) : [] }; });
    return { method: "fixture-authorships", byWorkRef };
  });
  return { mission, F, M10, op, boundary, verifier, manifest, ctx, registry, runId, missionHash, bind, R, discovery, verification, boundDiscovery, assessment, assessmentRef,
    ledger, llm, gateCtx, dimensionSet, snapshot, fetchAuthorWorks, attributionFor, byId, byName,
    async runPanel(extra) {
      return M11.autonomousPanelAdapter && require("../core/autonomous-run.js").runAutonomousPanel(Object.assign({
        frozen: F, ledger, registry, assessment, discovery: boundDiscovery, verification: verificationB, fetchAuthorWorks, attributionFor, llmCall: llm,
        missionQuestion: mission.missionQuestion, dimensionSet, ctx: gateCtx, assessmentRef }, extra || {}));
    },
    async runDownstream(res, extra) {
      return require("../core/autonomous-run.js").runDownstream(Object.assign({ frozen: F, ledger, panel: res.panel, gateInputs: res.gateInputs, corpusSetAll: res.corpusSetAll,
        dimensionSet, missionQuestion: mission.missionQuestion, missionId: mission.missionId, llmCall: opts.downstreamLlm || makeDownstreamFakeLlm(),
        targetDocuments: [{ targetId: "target-01", label: "document cible synthetique", role: "review_target_not_evidence", content: "Passage un du document cible synthetique. Passage deux, egalement synthetique." }],
        assessment, runContext: ctx }, extra || {}));
    },
    async llmCapability() {
      const llmConfig = { providerId: "prov-fixture", modelId: "mod-fixture", workerBindingId: "bind-fixture", credentialPresent: true, runId };
      const cap = bind("llm-capability", R.CAPABILITY, await verifier.runLlmProbe(llmConfig, ctx));
      const cert = verifier.certifyLlmCapability({ registry, artifactId: "llm-capability" });
      return { capability: registry.get("llm-capability").artifact, llmConfig, certified: cert.certified === true };
    },
  };
}

/** LLM simule pour l'aval : couverture EF-02D3, revues EF-03B, classification EF-03C — cite des references EXACTES. */
function makeDownstreamFakeLlm() {
  return async function (prompt) {
    if (prompt.indexOf("EF-02D3") !== -1) {
      const m = /"professionalRef":"([^"]+)"/.exec(prompt); const works = JSON.parse(prompt.slice(prompt.indexOf('{"professionalRef"'), prompt.indexOf("\n\nRÈGLES"))).works;
      const dims = [...prompt.matchAll(/\{"id":"([^"]+)","level"/g)].map((x) => x[1]);
      return JSON.stringify({ professionalRef: m[1], dimensions: dims.map((id, i) => ({ id, level: i === 0 ? "strong" : "moderate", evidenceWorks: works.slice(0, 1).map((w) => w.title), rationale: "fixture", contradictionWithMissing: false })), overallNote: "fixture" });
    }
    if (prompt.indexOf("EF-03B") !== -1) {
      const dims = [...prompt.matchAll(/\{"dimensionId":"([^"]+)","disposition"/g)].map((x) => x[1]);
      const worksUsed = JSON.parse(prompt.slice(prompt.indexOf('{"displayName"'), prompt.indexOf("\n\nRÈGLES"))).worksUsed;
      return JSON.stringify({ findings: dims.map((id) => ({ dimensionId: id, disposition: "concern", epistemicStatus: worksUsed.length ? "documented" : "not_determinable", finding: "constat fixture", rationale: "fixture",
        targetEvidenceRefs: ["Passage un du document cible synthetique."], twinBasisWorkRefs: worksUsed.slice(0, 1).map((w) => w.workRef), confidenceQualitative: "low", limitations: ["fixture"] })) });
    }
    if (prompt.indexOf("EF-03C") !== -1) {
      const ids = [...prompt.matchAll(/finding-[A-Za-z0-9:_.\-\/]+/g)].map((x) => x[0]);
      return JSON.stringify({ convergences: ids.length ? [{ findingIds: Array.from(new Set(ids)), summary: "fixture" }] : [], divergences: [] });
    }
    return "{}";
  };
}

module.exports = { mountRun, makeDownstreamFakeLlm, bundleRoot };
