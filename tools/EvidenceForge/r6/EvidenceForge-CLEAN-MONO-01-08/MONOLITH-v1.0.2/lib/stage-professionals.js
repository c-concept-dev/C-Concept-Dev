"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/stage-professionals.js
 * Etapes PROFESSIONALS, TWINS_REVIEWS, QUALIFICATION : composition des lots geles
 *   MONO-09 v0.2 (decouverte / identite, dependances OpenAlex REELLES injectees) ->
 *   MONO-10 v0.19 (frontiere de confiance PRODUCTION par run, manifeste de run, registre authentifie, liaison amont,
 *                  evaluation des candidats, capacite LLM certifiee par sonde reelle) ->
 *   MONO-11 v0.2 (GELE, sceau verifie AVANT chargement : corpus reels -> suffisance -> pertinence reelle -> gate machine ->
 *                 couverture -> jumeaux -> revues -> agregation -> qualification composee).
 * Reprise du mecanisme des scripts d'exploitation 19/23 (P0.1), sans aucune constante de cas.
 * Aucun acte humain n'est simule : la porte est MACHINE (MONO-11) ; l'utilisateur n'a rien a valider ici.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const { createOpenAlexFetch } = require("./stage-retrieval.js");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const now = () => new Date().toISOString();
const wid = (u) => String(u || "").replace(/^https?:\/\/openalex\.org\//, "");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Sceau MONO-11 v0.2 verifie AVANT tout require du lot (RUN_ON_UNSEALED_CODE sinon) ; zip canonique compare a la config. */
function loadSealedMono11() {
  const SG = require(path.join(P.MONO11, "core", "run-seal-guard.js"));
  const SEAL = SG.assertSealedRuntime({ lotDir: P.MONO11, zipPath: P.MONO11_ZIP, expectedZipSha256: P.CONFIG.frozenLots["MONO-11"].canonicalZipSha256, expectedVersion: "v0.2" });
  const M11 = require(path.join(P.MONO11, "index.js"));
  process.env.EVIDENCEFORGE_BUNDLE_ROOT = P.BUNDLE;
  const F = M11.frozenBridge.loadFrozen({ bundleRoot: P.BUNDLE });
  return { SEAL, M11, F };
}

/** Client OpenAlex par run : oeuvres par identifiant (cache memoire + cache disque journalise). */
function createOpenAlexClient(runDir, log) {
  const oa = createOpenAlexFetch(runDir, log); const works = new Map();
  async function getJson(pathAndQuery) { const res = await oa.fetchImpl("https://api.openalex.org" + pathAndQuery); const text = await res.text(); if (res.status !== 200) throw Object.assign(new Error("OpenAlex HTTP " + res.status), { httpStatus: res.status }); return JSON.parse(text); }
  async function getWork(id) { const k = wid(id); if (!works.has(k)) works.set(k, await getJson("/works/" + k)); return works.get(k); }
  return { getJson, getWork, calls: oa.calls };
}

/** Dependances REELLES de MONO-09 : identite lue sur l'oeuvre-source, expansion par oeuvres liees, jamais completees. */
function realMono09Deps(client) {
  return {
    async resolveAuthorIdentity(seed) {
      const found = [];
      for (const ref of seed.seedReferences) {
        let w; try { w = await client.getWork(ref.providerWorkId); } catch (e) { if (e.code === "NETWORK_UNAVAILABLE") throw e; continue; }
        (w.authorships || []).forEach(function (a) { if (a.author && norm(a.author.display_name) === norm(seed.displayName)) found.push({ providerAuthorId: a.author.id || null, orcid: a.author.orcid || null, affiliation: (a.institutions && a.institutions[0] && a.institutions[0].display_name) || null, work: w.id }); });
      }
      const ids = Array.from(new Set(found.map((f) => f.providerAuthorId).filter(Boolean)));
      if (ids.length !== 1) return { providerAuthorId: null, orcid: null, affiliation: null, note: ids.length === 0 ? "aucun identifiant auteur OpenAlex sur l'oeuvre-source" : "identifiants auteur distincts : " + ids.join(",") };
      const f = found.find((x) => x.providerAuthorId === ids[0]); return { providerAuthorId: ids[0], orcid: f.orcid, affiliation: f.affiliation };
    },
    async expandRelatedAuthors(seed) {
      const out = [];
      for (const ref of seed.seedReferences.slice(0, 2)) {
        let w; try { w = await client.getWork(ref.providerWorkId); } catch (e) { if (e.code === "NETWORK_UNAVAILABLE") throw e; continue; }
        for (const rel of (w.related_works || []).slice(0, 3)) {
          let rw; try { rw = await client.getWork(rel); } catch (e) { if (e.code === "NETWORK_UNAVAILABLE") throw e; continue; }
          (rw.authorships || []).forEach(function (a) { if (!a.author || !a.author.id) return; out.push({ providerAuthorId: a.author.id, displayName: a.author.display_name, orcid: a.author.orcid || null, affiliation: (a.institutions && a.institutions[0] && a.institutions[0].display_name) || null, relation: "AUTHOR_OF_RELATED_WORK", evidenceRefs: [rw.id], relatedToSeedWork: w.id }); });
        }
      }
      return out;
    },
    fetchAuthorWorks: undefined,
  };
}

/**
 * dedupeDiscovery(discovery, verification) — ADAPTATEUR ADDITIF v1.0.1 (BUG run efm-20260915-2257172b) :
 * MONO-09 v0.2 (gele) emet UNE entree candidat par (auteur x discipline de la source incluse) ; un meme auteur reel (meme
 * candidateRef OpenAlex) present dans des sources de deux disciplines donne deux entrees. MONO-10 les evalue toutes deux et
 * MONO-11 v0.2 (gele) refuse alors, a juste titre, d'enregistrer deux fois `mono11:corpus-sufficiency:<candidateRef>`
 * (LEDGER_DUPLICATE_OR_INVALID). Ici : une seule entree par identite reelle, en FUSIONNANT (jamais en perdant) les preuves :
 * seedReferences, evidenceRefs, provenance concatenes ; `disciplines` = liste des dimensions (champ lu par MONO-10
 * assessCandidates a la place de dimensionRef). Les entrees sans candidateRef ne sont pas touchees. Idempotent.
 */
function dedupeDiscovery(discovery, verification) {
  const uniq = (a) => Array.from(new Set(a));
  const byRef = new Map(); const out = []; const merged = [];
  (discovery.candidates || []).forEach(function (c) {
    if (!c.candidateRef || !byRef.has(c.candidateRef)) { const copy = Object.assign({}, c); if (c.candidateRef) byRef.set(c.candidateRef, copy); out.push(copy); return; }
    const k = byRef.get(c.candidateRef);
    k.disciplines = uniq((k.disciplines || [k.dimensionRef]).concat(c.disciplines || [c.dimensionRef]).filter(Boolean));
    const seen = new Set((k.seedReferences || []).map((r) => r.providerWorkId)); k.seedReferences = (k.seedReferences || []).concat((c.seedReferences || []).filter((r) => !seen.has(r.providerWorkId)));
    k.evidenceRefs = uniq((k.evidenceRefs || []).concat(c.evidenceRefs || [])); k.provenance = (k.provenance || []).concat(c.provenance || []);
    k.mergedEntries = (k.mergedEntries || 1) + 1; merged.push({ candidateRef: c.candidateRef, displayName: c.displayName, dimensionRef: c.dimensionRef, seedWorks: (c.seedReferences || []).map((r) => r.providerWorkId) });
  });
  const vSeen = new Set(); const verified = (verification && verification.verified || []).filter(function (v) { if (!v.candidateRef) return true; if (vSeen.has(v.candidateRef)) return false; vSeen.add(v.candidateRef); return true; });
  const record = { schema: "EvidenceForge.MonolithCandidateDeduplication", schemaVersion: "MONOLITH-v1.0.1", rule: "ONE_CANDIDATE_PER_PROVIDER_AUTHOR_ID_EVIDENCE_MERGED", before: (discovery.candidates || []).length, after: out.length, mergedEntries: merged, verifiedBefore: (verification && verification.verified || []).length, verifiedAfter: verified.length };
  return { discovery: Object.assign({}, discovery, { candidates: out }), verification: verification ? Object.assign({}, verification, { verified: verified }) : verification, record: record };
}

/** PROFESSIONALS (1/2) : EF-02A decouverte + EF-02B verification (MONO-09 v0.2, OpenAlex reel). */
async function discoverProfessionals(input) {
  const M09A = require(path.join(P.MONO09, "lib", "professional-adapter.js"));
  const client = createOpenAlexClient(input.runDir, input.log);
  const adapter = M09A.createProfessionalPipelineAdapter(realMono09Deps(client));
  const included = (input.corpusSnapshot.sources || []).filter((s) => s.statutScreening === "inclus");
  if (!included.length) { const e = new Error("NO_INCLUDED_SOURCE"); e.code = "NO_INCLUDED_SOURCE"; e.userMessage = "Aucune source n'a été retenue au screening : aucun professionnel ne peut être découvert. Le run s'arrête (rien n'est inventé)."; throw e; }
  const dimensionSetLite = { dimensions: input.dimensionSet.dimensions.map((d) => ({ name: d.id, id: d.id, label: d.label || d.id })) };
  const discoveryRaw = await adapter.discoverProfessionals({ corpusSnapshot: input.corpusSnapshot, missionDimensionSet: dimensionSetLite });
  const verificationRaw = await adapter.verifyProfessionals({ professionalDiscovery: discoveryRaw });
  const dd = dedupeDiscovery(discoveryRaw, verificationRaw); const discovery = dd.discovery, verification = dd.verification;
  const cands = discovery.candidates || [];
  if (!cands.filter((c) => c.candidateRef).length) { const e = new Error("ZERO_PROFESSIONAL_IDENTIFIED"); e.code = "ZERO_PROFESSIONAL_IDENTIFIED"; e.userMessage = "Aucun professionnel n'a pu être identifié avec un identifiant réel dans la base de publications. Le run s'arrête."; throw e; }
  return { discovery, verification, deduplication: dd.record, includedCount: included.length, candidates: cands.length, resolved: cands.filter((c) => c.candidateRef).length, networkCalls: client.calls };
}

/** v1.0.2 — codes de transport OpenAlex : reseau/delai/429/5xx = PANNE (jamais un verdict documentaire) ; 400/404 = donnee absente (legitime). */
function openAlexTransportError(e) {
  if (!e) return null; if (e.code === "NETWORK_UNAVAILABLE" || e.code === "PROVIDER_TIMEOUT") return e;
  if (e.httpStatus === 429 || (e.httpStatus >= 500 && e.httpStatus <= 599)) { const t = new Error("PROVIDER_UNAVAILABLE: OpenAlex HTTP " + e.httpStatus); t.code = e.httpStatus === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE"; t.userMessage = "La base de publications (OpenAlex) a répondu par une erreur (HTTP " + e.httpStatus + "). Le run est arrêté proprement ; il pourra reprendre."; t.httpStatus = e.httpStatus; return t; }
  return null;
}

/** Ouvre un run MONO-10 PRODUCTION pour une tentative (frontiere, manifeste, registre, sonde LLM certifiee, registre MONO-11). Registre d'acteurs VIDE (aucune validation humaine simulee). */
async function openMono10Run(input) {
  const { SEAL, M11, F } = loadSealedMono11(); const M10 = F.M10, R = M10.LIN.RELATION;
  const opDir = path.join(input.runDir, "operator", input.attemptRunId); fs.mkdirSync(opDir, { recursive: true });
  const roots = [];
  input.included.forEach((s) => roots.push({ sourceRootId: s.provenance.originalReference, authorityRootId: "AUT-OPENALEX-WORKS-RETRIEVAL", familyRootId: "FAM-OPENALEX" }));
  input.discovery.candidates.filter((c) => c.candidateRef).forEach((c) => roots.push({ sourceRootId: c.candidateRef, authorityRootId: "AUT-OPENALEX-AUTHORS", familyRootId: "FAM-OPENALEX" }));
  const authority = M10.OP.mintOperatorAuthority({ authorityId: "AUT-MONOLITH-" + input.attemptRunId, namespace: "PRODUCTION" });
  M10.OP.writeHumanActorRegistry(path.join(opDir, "actors.json"), []); fs.chmodSync(path.join(opDir, "actors.json"), 0o600);
  M10.OP.writeProvenanceRootRegistry(path.join(opDir, "provenance-roots.json"), roots); M10.OP.writeHistoricalInputRegistry(path.join(opDir, "historical-inputs.json"), []);
  const cfgPath = M10.OP.writeOperatorTrustConfig(path.join(opDir, "trust.json"), { operatorTrustBoundaryId: "otb-monolith-" + input.attemptRunId, namespace: "PRODUCTION",
    authorities: [{ authorityId: authority.authorityId, keys: [authority.keyRecord()] }], replayProtection: { kind: "FILE", authorityScope: [authority.authorityId] },
    humanAuth: { kind: "OPERATOR_ACT_PROOF", registryPath: path.join(opDir, "actors.json") }, llmCapability: { kind: "OPERATOR_TRANSPORT", transportModuleRef: path.join(P.ROOT, "lib", "llm-transport.js") }, acceptance: {},
    provenanceAuthority: { kind: "OPERATOR_ROOT_REGISTRY", registryPath: path.join(opDir, "provenance-roots.json") }, historicalInput: { kind: "OPERATOR_AUTHORIZED_INPUTS", registryPath: path.join(opDir, "historical-inputs.json") } });
  process.env[M10.OTB.ENV_VAR] = cfgPath; process.env.EVIDENCEFORGE_MONOLITH_LLM_LOG = path.join(input.runDir, "llm-calls.jsonl");
  const boundary = M10.OTB.provisionProductionTrustBoundary(); const verifier = M10.OTB.verifierFor(boundary);
  const intent = { runId: input.attemptRunId, missionHash: input.missionHash, producerId: "EvidenceForge-" + P.CONFIG.product.version, producerVersion: "MONO-11-v0.2(seal " + SEAL.runtimeSealSha256.slice(0, 12) + ")+MONO-10-v0.19", executionMode: "PRODUCTION", openedAt: now() };
  const validityMs = (P.CONFIG.attestationValidityHours || 8) * 3600 * 1000; const att = authority.attest(intent, { expiresAt: new Date(Date.now() + validityMs).toISOString() });
  const manifest = M10.RM.openRunEvidenceManifest({ verifier, attestation: att, runIntent: intent, missionBinding: { missionId: input.missionId }, missionHash: input.missionHash });
  const ctx = { manifest, verifier, attestation: att }; const registry = M10.AAR.openAuthenticatedArtifactRegistry(manifest, ctx);
  const bind = (id, rel, art) => { const b = M10.RM.bindArtifact(manifest, art, id, art.schema || rel); registry.register({ artifactId: id, relation: rel, artifact: b }); return registry.get(id).artifact; };
  bind("mission", R.MISSION, { schema: "EvidenceForge.Mission", missionId: input.missionId, missionHash: input.missionHash, missionQuestion: input.missionQuestion });
  /* capacite LLM REELLE certifiee par la frontiere (sonde reelle, delai borne) */
  const llmConfig = { providerId: "anthropic", modelId: input.llm.model, workerBindingId: "evidenceforge-llm-proxy", credentialPresent: !!process.env.EVIDENCEFORGE_WORKER_API_KEY, authMode: "delegated", runId: input.attemptRunId };
  let capability; try { capability = bind("llm-capability", R.CAPABILITY, await verifier.runLlmProbe(llmConfig, ctx)); } catch (e) { input.llm.latch(e, "probe"); throw e; }
  const cert = verifier.certifyLlmCapability({ registry, artifactId: "llm-capability" });
  if (capability.status !== "AVAILABLE" || cert.certified !== true) { const e = new Error("LLM_UNAVAILABLE: " + capability.status + " / " + JSON.stringify(cert.problems || [])); e.code = "LLM_UNAVAILABLE"; e.userMessage = "Le fournisseur d'analyse n'a pas pu être certifié disponible (" + capability.status + "). Le run s'arrête proprement."; throw e; }
  const ledger = M11.ledger.openMono11Ledger({ manifest, registry, RM: M10.RM, CANON: M10.CANON, sealInfo: SEAL });
  return { SEAL, M11, F, M10, R, manifest, registry, verifier, ctx, att, bind, ledger, llmConfig, capability: { status: capability.status, probeStatus: capability.probeStatus, requestId: capability.requestId, certified: cert.certified }, capabilityArtifact: capability, cfgPath,
    attestation: { attestationId: att.attestationId, authorityId: att.authorityId, issuedAt: att.issuedAt, expiresAt: att.expiresAt, validityMs, operatorChoice: "validité " + (P.CONFIG.attestationValidityHours || 8) + " h (défaut MONO-10 : 1 h) pour un run long" } };
}

/** agregation : toute classificationError (EF-03C gele : echec de classification absorbe dans l'agregat) => jamais une qualification ni un rapport */
function assertNoClassificationError(aggregation) {
  const aggErrors = ((aggregation && aggregation.aggregates) || []).filter((a) => a.classificationError).map((a) => ({ targetId: a.targetId, dimensionId: a.dimensionId, error: a.classificationError }));
  if (aggErrors.length) { const e = new Error("AGGREGATION_CLASSIFICATION_ERROR: " + aggErrors.length + " groupe(s)"); e.code = "AGGREGATION_CLASSIFICATION_ERROR"; e.details = aggErrors; e.userMessage = "L'agrégation des revues a échoué sur " + aggErrors.length + " groupe(s) (classification refusée) : aucune qualification ni rapport n'est produit. Le run pourra reprendre."; throw e; }
}

/** Enveloppe le llmCall pour MONO-11 : journalise la finalite ; le verrou de panne est dans lib/llm.js. */
function assertNoTransportFailure(llm, where) { const f = llm.transportFailure && llm.transportFailure(); if (f) { const e = new Error(f.code + ": panne de transport pendant " + where + " — " + f.message); e.code = f.code; e.userMessage = (f.userMessage || "Panne du fournisseur ou du réseau") + " L'étape « " + where + " » est incomplète pour cause de transport : aucun résultat partiel n'est retenu ; le run reprendra là où les preuves sont valides."; e.transportFailure = f; throw e; } }

/**
 * PROFESSIONALS (2/2) — v1.0.2 : MONO-10 frontiere/run + MONO-11 panel autonome, puis CHECKPOINT METIER durable
 * (calcul -> validation -> ecriture atomique hachee -> DONE par le pipeline). Aucune panne de transport n'est absorbee.
 * input : { runDir, runId, attemptRunId, missionId, missionHash, missionQuestion, runContract, corpusSnapshot, discovery, verification, llm, log }
 * -> { checkpoint } (objet a persister par store.saveCheckpoint) + stats
 */
async function runPanel(input) {
  const log = typeof input.log === "function" ? input.log : function () {};
  const rc = input.runContract; const included = input.corpusSnapshot.sources.filter((s) => s.statutScreening === "inclus");
  const dd = dedupeDiscovery(input.discovery, input.verification); const discovery = dd.discovery, verification = dd.verification;
  if (dd.record.mergedEntries.length) log({ event: "candidates_deduplicated", merged: dd.record.mergedEntries.length, before: dd.record.before, after: dd.record.after });
  const run = await openMono10Run(Object.assign({}, input, { included, discovery }));
  const { M10, R, F, M11, SEAL, registry, manifest, verifier, bind, ledger } = run;
  const dimensionSet = await F.M01.DIM.buildMissionDimensionSet({ missionId: input.missionId, createdAt: rc.createdAt, dimensions: rc.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.id, label: d.discipline || d.id, definition: d.justification || d.id, weight: 1 })) });
  const discoveryB = bind("professional-discovery", R.DISCOVERY, discovery), verificationB = bind("professional-verification", R.VERIFICATION, verification);
  const binder = M10.UEB.createUpstreamEvidenceBinder({ registry, manifest, verifier, artifactIdPrefix: "amont" });
  const screened = included.map((x) => ({ localSourceId: x.id, providerWorkId: x.provenance.originalReference, observed: x, retrievedAt: input.corpusSnapshot.dateGel || null }));
  const boundSources = M10.UEB.bindScreenedSources({ binder, screenedSources: screened }), boundIdentities = M10.UEB.bindResolvedIdentities({ binder, discovery });
  const boundDiscovery = bind("professional-discovery-bound", R.DISCOVERY, M10.UEB.bindUpstreamDiscovery({ discovery, sourceRefByProviderWorkId: boundSources.refByProviderWorkId, identityRefByCandidateRef: boundIdentities.refByCandidateRef,
    ambiguousIdentifiers: boundSources.ambiguous, upstreamVerification: verification, strongIdentifierField: "orcid", upstreamDiscoveryRef: M10.LIN.artifactRef(discoveryB, "professional-discovery", R.DISCOVERY) }));
  const assessment = bind("candidate-assessment", R.ASSESSMENT, M10.CA.assessCandidates({ discovery: boundDiscovery, verification: verificationB, missionLabels: dimensionSet.dimensions.map((d) => d.id), runId: input.attemptRunId, missionHash: input.missionHash,
    attestationHash: manifest.runtimeAttestationHash, artifactRegistry: registry, verifier, discoveryArtifactId: "professional-discovery-bound", verificationArtifactId: "professional-verification" }));
  const assessmentRef = M10.LIN.artifactRef(assessment, "candidate-assessment", R.ASSESSMENT);
  log({ event: "mono10_assessment", summary: assessment.summary, mono10RunId: input.attemptRunId });

  /* corpus reels par auteur (OpenAlex, cache par URL : aucune requete reseau pour une reponse deja obtenue) ; panne de transport => verrou */
  const client = createOpenAlexClient(input.runDir, log); const RAW = new Map(); const llm = input.llm;
  async function fetchAuthorWorks(candidateRef) {
    if (llm.transportFailure()) throw Object.assign(new Error(llm.transportFailure().code + " (verrou de panne)"), { code: llm.transportFailure().code, latched: true });
    let j; try { j = await client.getJson("/works?filter=author.id:" + wid(candidateRef) + "&per-page=100&sort=publication_year:desc&select=id,display_name,doi,publication_year,topics,authorships,type"); }
    catch (e) { const t = openAlexTransportError(e); if (t) { llm.latch(t, "corpus fetch " + candidateRef); throw t; } throw e; }
    const works = (j.results || []).map((w) => Object.assign({}, w, { topics: (w.topics || []).map((t) => ({ name: t.display_name, id: t.id, score: t.score })) }));
    RAW.set(candidateRef, works.map((w) => ({ id: w.id, authorships: (w.authorships || []).map((a) => ({ author: { id: a.author && a.author.id, orcid: a.author && a.author.orcid } })) })));
    return works;
  }
  async function attributionFor(candidateRef, corpus) {
    const raw = RAW.get(candidateRef) || []; const byWorkRef = {};
    (corpus.corpus.works || []).forEach(function (w) { const r = raw.find((x) => x.id === w.workRef); const mine = r ? (r.authorships || []).filter((a) => a.author && a.author.id === candidateRef) : [];
      byWorkRef[w.workRef] = { attributed: mine.length > 0, authorIds: r ? (r.authorships || []).map((a) => a.author && a.author.id).filter(Boolean) : [], orcids: mine.map((a) => a.author.orcid).filter(Boolean) }; });
    return { method: "openalex-authorships (filter author.id, verifie sur chaque oeuvre)", byWorkRef };
  }
  const gateCtx = { runId: input.attemptRunId, missionHash: input.missionHash, operatorTrustBoundaryId: manifest.operatorTrustBoundaryId, attestationHash: manifest.runtimeAttestationHash };
  const res = await M11.autonomousRun.runAutonomousPanel({ frozen: F, ledger, registry, assessment, discovery: boundDiscovery, verification: verificationB, fetchAuthorWorks, attributionFor,
    llmCall: llm.llmCall, onValidation: llm.onValidation, missionQuestion: input.missionQuestion, dimensionSet, ctx: gateCtx, assessmentRef, log });
  /* FRONTIERE FAIL-CLOSED : si une panne de transport s'est produite pendant l'evaluation, le panel n'est PAS un verdict */
  assertNoTransportFailure(llm, "Découvrir et évaluer les professionnels");
  const evidence = ledger.exportArtifacts(); const chains = { mono10: registry.verifyEventChain(), mono11: ledger.verifyChain() };
  if (!chains.mono10.valid || !chains.mono11.valid) throw Object.assign(new Error("LINEAGE_CHAIN_INVALID"), { code: "LINEAGE_CHAIN_INVALID" });
  const inputHashes = { corpusSnapshot: sha(JSON.stringify(input.corpusSnapshot)), discovery: sha(JSON.stringify(input.discovery)), verification: sha(JSON.stringify(input.verification || null)), runContractHash: rc.runContractHash, missionHash: input.missionHash, dimensionSetHash: dimensionSet.dimensionSetHash };
  const checkpoint = { schema: "EvidenceForge.ProfessionalsCheckpoint", schemaVersion: "MONOLITH-v1.0.2", runId: input.runId, attemptId: input.attemptId, mono10RunId: input.attemptRunId,
    lotVersions: { mono11: SEAL.mono11Version, mono10: "v0.19", mono09: "v0.2", monolith: P.CONFIG.product.version }, seal: { mono11Version: SEAL.mono11Version, runtimeSealSha256: SEAL.runtimeSealSha256, runCodeHash: SEAL.runCodeHash, mono11ZipSha256: SEAL.mono11ZipSha256, mono11ManifestSha256: SEAL.mono11ManifestSha256 },
    inputHashes, dimensionSet, deduplication: dd.record, assessment, panel: res.panel, gateInputs: res.gateInputs, corpusSetAll: res.corpusSetAll, stats: res.stats,
    evidence, ledgerExport: ledger.export(), registryEntries: registry.entries(), chains, capability: run.capability, llmConfig: run.llmConfig, attestation: run.attestation, operatorConfig: run.cfgPath,
    outputHashes: { panelHash: res.panel.panelHash, assessment: M10.CANON.artifactHash(assessment), ledgerRoot: ledger.rootHash, registryRoot: chains.mono10.registryRootHash, evidenceCount: Object.keys(evidence).length },
    transportFailures: [], openAlexCalls: client.calls.length, llmCounts: llm.counts(), complete: true };
  return { checkpoint, stats: res.stats, panelCounts: res.panel.counts };
}

/**
 * TWINS_REVIEWS + QUALIFICATION — v1.0.2 : repart du CHECKPOINT PROFESSIONNEL (jamais de recalcul de l'evaluation ni du panel) :
 * nouveau run MONO-10 pour la tentative, re-ancrage des preuves du checkpoint dans le nouveau registre MONO-11 (hashes d'origine
 * conserves), puis couverture -> jumeaux -> revues -> agregation (classificationError verifiee) -> qualification composee -> checkpoint aval.
 * input : { runDir, runId, attemptId, attemptRunId, missionId, missionHash, missionQuestion, runContract, corpusSnapshot, discovery, verification, checkpoint, targetDocuments, llm, upstreamReservations, log }
 */
async function runDownstreamFromCheckpoint(input) {
  const log = typeof input.log === "function" ? input.log : function () {}; const cp = input.checkpoint; const llm = input.llm;
  const included = input.corpusSnapshot.sources.filter((s) => s.statutScreening === "inclus"); const dd = dedupeDiscovery(input.discovery, input.verification);
  const run = await openMono10Run(Object.assign({}, input, { included, discovery: dd.discovery }));
  const { M10, R, F, M11, SEAL, registry, bind, ledger } = run;
  if (cp.seal.runtimeSealSha256 !== SEAL.runtimeSealSha256) throw Object.assign(new Error("CHECKPOINT_SEAL_MISMATCH"), { code: "CHECKPOINT_SEAL_MISMATCH", userMessage: "Le point de reprise a été produit sous un autre sceau MONO-11 : reprise refusée." });
  /* re-ancrage : le checkpoint lui-meme (hashes, run MONO-10 d'origine, racine du registre d'origine) puis chaque preuve, sous son identifiant d'origine */
  bind("professionals-checkpoint", R.ASSESSMENT, { schema: "EvidenceForge.ProfessionalsCheckpointRef", contentHash: cp.contentHash, sourceMono10RunId: cp.mono10RunId, sourceLedgerRoot: cp.outputHashes.ledgerRoot, sourceRegistryRoot: cp.outputHashes.registryRoot, panelHash: cp.outputHashes.panelHash, evidenceCount: cp.outputHashes.evidenceCount, reanchoredBy: input.attemptRunId });
  const assessment = bind("candidate-assessment", R.ASSESSMENT, cp.assessment);
  Object.keys(cp.evidence).forEach((id) => { if (id !== "mono11:gate-panel") ledger.record(id, cp.evidence[id].kind, cp.evidence[id].artifact, []); });
  const panel = ledger.record("mono11:gate-panel", "machine-gate-panel", cp.panel, cp.gateInputs.flatMap((g) => [ledger.ref(g.evidenceArtifactRefs.corpus.artifactId), ledger.ref(g.evidenceArtifactRefs.relevance.artifactId)]).filter(Boolean));
  log({ event: "checkpoint_reanchored", sourceMono10RunId: cp.mono10RunId, evidence: Object.keys(cp.evidence).length, panelHash: cp.outputHashes.panelHash });
  const targets = input.targetDocuments.map((d, i) => ({ targetId: "target-" + String(i + 1).padStart(2, "0"), label: d.title, role: "review_target_not_evidence", content: d.content, sourceDocumentRef: d.hashSha256 }));
  const runContext = Object.assign({ artifactRegistry: registry }, run.ctx);
  const dn = await M11.autonomousRun.runDownstream({ frozen: F, ledger, panel, gateInputs: cp.gateInputs, corpusSetAll: cp.corpusSetAll, dimensionSet: cp.dimensionSet, missionQuestion: input.missionQuestion, missionId: input.missionId,
    targetDocuments: targets, llmCall: llm.llmCall, onValidation: llm.onValidation, assessment, runContext, reviewMaxPasses: P.CONFIG.llm.reviewMaxPasses, coverageMaxPasses: P.CONFIG.llm.coverageMaxPasses, log });
  assertNoTransportFailure(llm, "Faire examiner votre demande par les jumeaux documentaires");
  assertNoClassificationError(dn.aggregation);
  const base = { frozen: F, assessment, panel: dn.panel, corpusSet: dn.corpusSet, twinSet: dn.twinSet, reviewSet: dn.reviewSet, aggregation: dn.aggregation, llmCapability: run.capabilityArtifact, llmConfig: run.llmConfig, runContext, ledger, registry, upstreamReservations: input.upstreamReservations || [] };
  const pre = M11.composedQualification.evaluateReadiness(Object.assign({ phase: "PRE" }, base)); const full = M11.composedQualification.evaluateReadiness(Object.assign({ phase: "FULL" }, base));
  const qualification = M11.composedQualification.qualifyProcess(Object.assign({ readinessPre: pre, readinessFull: full }, base));
  const qBound = ledger.record("mono11:scientific-qualification", "qualification", qualification, [ledger.ref("mono11:aggregation")]);
  const evidence = ledger.exportArtifacts(); const chains = { mono10: registry.verifyEventChain(), mono11: ledger.verifyChain() };
  if (!chains.mono10.valid || !chains.mono11.valid) throw Object.assign(new Error("LINEAGE_CHAIN_INVALID"), { code: "LINEAGE_CHAIN_INVALID" });
  const evidenceDir = path.join(input.runDir, "evidence"); let nPersist = 0;
  Object.keys(evidence).forEach(function (id) { const parts = id.replace(/^mono11:/, "").split(":"); const dir = parts.shift(); const name = (parts.join("_").replace(/https?:\/\/[^/]+\//g, "").replace(/[^A-Za-z0-9_.-]/g, "_")) || "index";
    const pth = path.join(evidenceDir, dir, name + ".json"); fs.mkdirSync(path.dirname(pth), { recursive: true }); fs.writeFileSync(pth, JSON.stringify(evidence[id], null, 2) + "\n"); nPersist++; });
  const checkpoint = { schema: "EvidenceForge.DownstreamCheckpoint", schemaVersion: "MONOLITH-v1.0.2", runId: input.runId, attemptId: input.attemptId, mono10RunId: input.attemptRunId, professionalsCheckpointHash: cp.contentHash, seal: cp.seal,
    panel: dn.panel, corpusSet: dn.corpusSet, twinSet: dn.twinSet, coverageMatrix: dn.coverageMatrix, panelSelection: dn.panelSelection, reviewSchema: dn.reviewSchema, targetDocumentSet: dn.targetDocumentSet, normalizationRecords: dn.normalizationRecords, enforcementTraces: dn.enforcementTraces,
    reviewSet: dn.reviewSet, aggregation: dn.aggregation, readinessPre: pre, readinessFull: full, qualification: Object.assign({ runId: input.runId }, qBound), chains, capability: run.capability, attestation: run.attestation, operatorConfig: run.cfgPath, ledgerExport: ledger.export(), registryEntries: registry.entries(),
    outputHashes: { reviewSchemaHash: dn.reviewSet.reviewSchemaHash, ledgerRoot: ledger.rootHash, registryRoot: chains.mono10.registryRootHash, evidencePersisted: nPersist }, llmCounts: llm.counts(), complete: true };
  return { checkpoint, summary: { twins: dn.twinSet.twins.length, blocked: dn.twinSet.blocked.length, reviews: dn.reviewSet.summary, qualification: qualification.status } };
}

module.exports = { discoverProfessionals, runPanel, runDownstreamFromCheckpoint, openMono10Run, openAlexTransportError, assertNoTransportFailure, assertNoClassificationError, dedupeDiscovery, loadSealedMono11, realMono09Deps, createOpenAlexClient };
