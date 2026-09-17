"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/stage-retrieval.js
 * Etapes RETRIEVAL et CORPUS : recuperation REELLE (OpenAlex, runner equitable gele MONO-08 v0.8), RetrievalSnapshot
 * (mecanisme gele v0.6), ENRICHISSEMENT des sources (resumes OpenAlex, appels reels journalises), PREUVE DE SCREENING
 * MACHINE (screening-evidence.js), puis — apres RATIFICATION par l'utilisateur (acte humain reel exige par le contrat
 * gele) — reprise gelee (POST_RETRIEVAL_GATE, ScreeningArtifact, QualificationTestArtifact) et pilotage du graphe MONO-02
 * jusqu'au CorpusSnapshot. Aucun retrieval n'est rejoue a la reprise (connecteurs de rejeu purs, geles).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const SE = require("./screening-evidence.js");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/** fetch OpenAlex journalise + cache par URL (rejeu sans reseau a la reprise). */
function createOpenAlexFetch(runDir, log) {
  const cacheDir = path.join(runDir, "openalex-cache"); fs.mkdirSync(cacheDir, { recursive: true });
  const indexPath = path.join(cacheDir, "index.json"); const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : {};
  const calls = [];
  async function fetchImpl(url, init) {
    const key = String(url).replace(/([?&](api_key|mailto|token)=)[^&]*/gi, "$1[EXPURGE]");
    if (index[key] && fs.existsSync(path.join(cacheDir, index[key] + ".json"))) {
      const body = fs.readFileSync(path.join(cacheDir, index[key] + ".json"), "utf8");
      calls.push({ at: new Date().toISOString(), url: key, reused: true, bodySha256: index[key] });
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }
    const t0 = Date.now(); let res; const ac = new AbortController(); let to = false; const timer = setTimeout(() => { to = true; ac.abort(); }, Number(P.CONFIG.openalex.timeoutMs || 60000));
    try { res = await fetch(url, Object.assign({}, init || {}, { headers: Object.assign({ "User-Agent": P.CONFIG.openalex.userAgent }, (init && init.headers) || {}), signal: ac.signal })); }
    catch (e) { clearTimeout(timer); calls.push({ at: new Date().toISOString(), url: key, error: String(e.message) }); const err = new Error((to ? "PROVIDER_TIMEOUT" : "NETWORK_UNAVAILABLE") + ": " + e.message); err.code = to ? "PROVIDER_TIMEOUT" : "NETWORK_UNAVAILABLE"; err.userMessage = to ? "La base de publications (OpenAlex) n'a pas répondu dans le délai imparti. Le run est arrêté proprement ; il pourra reprendre." : "Réseau indisponible : impossible de joindre la base de publications (OpenAlex). Aucun résultat n'est inventé."; err.fatal = true; throw err; }
    clearTimeout(timer);
    const body = await res.text(); const h = sha(body);
    if (res.status === 200) { fs.writeFileSync(path.join(cacheDir, h + ".json"), body); index[key] = h; fs.writeFileSync(indexPath, JSON.stringify(index, null, 2)); }
    calls.push({ at: new Date().toISOString(), url: key, httpStatus: res.status, ms: Date.now() - t0, bodySha256: h, reused: false });
    if (log) log({ event: "openalex_call", httpStatus: res.status, ms: Date.now() - t0 });
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
  }
  return { fetchImpl, calls, cacheDir };
}

/** Cherche, dans le backend durable EF-ORCH du run, l'erreur native (state.error) d'un run en echec — lecture seule, generique. */
function findNativeOrchError(dir) {
  if (!fs.existsSync(dir)) return null; let found = null;
  (function walk(d) { fs.readdirSync(d).forEach(function (f) { const p = path.join(d, f); if (found) return; if (fs.statSync(p).isDirectory()) return walk(p); if (!f.endsWith(".json")) return;
    try { const j = JSON.parse(fs.readFileSync(p, "utf8")); const st = j && j.value && j.value.state; if (st && st.status === "failed" && st.error) found = { stageId: st.error.stageId || null, message: st.error.message || null, at: st.error.at || null }; } catch (e) { /* fichier non pertinent */ } }); })(dir);
  return found;
}

/** RETRIEVAL : artefacts pre-retrieval depuis les artefacts EXISTANTS (jamais reconstruits), retrieval reel, snapshot gele. */
async function prepareRetrieval(input) {
  const cfg = { MONO01_PATH: P.MONO01, MONO08_V06_PATH: P.MONO08_V06 };
  const { buildPreRetrievalArtifactsFromExisting } = require(path.join(P.MONO08_V08, "lib", "prepare-existing-artifacts.js"));
  const EA = require(path.join(P.MONO08_V06, "lib", "eforch-artifacts.js"));
  const RSW = require(path.join(P.MONO08_V06, "lib", "real-screening-workflow.js"));
  const oa = createOpenAlexFetch(input.runDir, input.log);
  const mission = Object.assign({}, input.executionMission, { dimensions: input.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline })) });
  const bytes = {}; input.executionMission.targetDocuments.forEach((d) => { if (d.status === "VERIFIED") bytes[d.url] = Buffer.from(d.contentBase64, "base64"); });
  const pre = await buildPreRetrievalArtifactsFromExisting(cfg, { v06LibPath: path.join(P.MONO08_V06, "lib"), mission: mission, existingRunContract: input.runContract, existingSearchProtocol: input.searchProtocol, existingEForchProvenance: input.provenance,
    expectedRunContractHash: input.runContract.runContractHash || (input.runContract.hashes && input.runContract.hashes.runContractHash) || null, expectedProtocolHash: input.searchProtocol.protocolHash || (input.searchProtocol.hashes && input.searchProtocol.hashes.protocolHash) || null, documentBytesByUrl: bytes, openAlexFetchImpl: oa.fetchImpl });
  if (pre.connectorRunners.openalex.name !== "memoizedFairRunner") throw Object.assign(new Error("RUNNER_NOT_FAIR"), { code: "RUNNER_NOT_FAIR" });
  const retrievalResult = await EA.executeActiveConnectorsRetrieval(pre.connectorRunners, pre.searchProtocol);
  const fairAggregate = await pre.connectorRunners.openalex({ connectorId: "openalex" }, pre.searchProtocol);
  const resolverTrace = EA.buildResolverTraceForMission(pre.deps, pre.missionId, pre.runContract, { mode: "REAL", resolverRuns: input.provenance.resolverRuns });
  const snapshot = await RSW.buildRetrievalSnapshot(pre.deps, { missionId: pre.missionId, missionQuestion: mission.question, runContract: pre.runContract, searchProtocol: pre.searchProtocol, resolverTrace: resolverTrace,
    ef01aInjected: pre.ef01aInjected, ef01fInjected: pre.ef01fInjected, retrievalResult: retrievalResult, providerIdentity: { connector: "openalex", proxy: "direct https (api.openalex.org)", transport: "https" } });
  await RSW.verifySnapshotIntegrity(pre.deps, snapshot);   // signature gelee (deps, snapshot) : leve SNAPSHOT_INTEGRITY_ERROR, sinon OK
  return { snapshot: snapshot, missionId: pre.missionId, networkCalls: oa.calls, coverage: fairAggregate.coverage, snapshotIntegrity: "VERIFIED_BY_FROZEN_MECHANISM" };
}

/** Reconstitue un resume depuis abstract_inverted_index (OpenAlex). */
function abstractFromInverted(inv) { if (!inv || typeof inv !== "object") return null; const pos = []; Object.keys(inv).forEach((w) => (inv[w] || []).forEach((i) => { pos[i] = w; })); const t = pos.filter(Boolean).join(" ").trim(); return t || null; }

/** ENRICHISSEMENT reel des sources (resume, annee, lieu) — un appel OpenAlex par source, journalise, cache. */
async function enrichSources(input) {
  const oa = createOpenAlexFetch(input.runDir, input.log);
  const out = [];
  for (const s of input.snapshot.sources) {
    const wid = String(s.providerNativeId || "").replace(/^https?:\/\/openalex\.org\//, "");
    let enr = { sourceId: s.sourceId, titre: s.titre, doi: s.reference && /doi\.org/.test(s.reference) ? s.reference : null, providerId: s.providerNativeId || null, annee: s.date ? String(s.date).slice(0, 4) : null, discipline: s.discipline, resume: null, lieu: null, lookupStatus: "SKIPPED" };
    if (wid) {
      try { const res = await oa.fetchImpl("https://api.openalex.org/works/" + wid + "?select=id,display_name,abstract_inverted_index,publication_year,primary_location,type,doi"); const j = JSON.parse(await res.text());
        if (res.status === 200) enr = Object.assign(enr, { resume: abstractFromInverted(j.abstract_inverted_index), annee: j.publication_year ? String(j.publication_year) : enr.annee, lieu: (j.primary_location && j.primary_location.source && j.primary_location.source.display_name) || null, type: j.type || null, lookupStatus: "SUCCESS" });
        else enr.lookupStatus = "HTTP_" + res.status; } catch (e) { if (e.fatal) throw e; enr.lookupStatus = "ERROR"; }
    }
    out.push(enr);
  }
  return { enriched: out, networkCalls: oa.calls };
}

function buildAuditDecisions(snapshot, evidence, overrides, ratifiedBy) {
  const who = String(ratifiedBy || "").trim();
  if (who.length < 2) { const e = new Error("HUMAN_IDENTITY_REQUIRED"); e.code = "HUMAN_IDENTITY_REQUIRED"; e.userMessage = "Indiquez votre nom : la ratification des sources est un acte humain réel, enregistré à votre nom."; throw e; }
  const byId = new Map((evidence.proposals || []).map((p) => [p.sourceId, p]));
  const now = new Date().toISOString(); overrides = overrides || {};
  const decisions = (snapshot.sources || []).map(function (s) {
    const prop = byId.get(s.sourceId); let decision = prop ? prop.proposed : null; let just = prop ? prop.justification : "";
    if (!prop) { decision = "exclu"; just = "Aucune proposition machine disponible pour cette source (screening non abouti) : exclue par prudence, jamais incluse par defaut."; }
    let overridden = false;
    if (overrides[s.sourceId] && ["inclus", "exclu"].indexOf(overrides[s.sourceId]) !== -1 && overrides[s.sourceId] !== decision && decision !== "doublon") { decision = overrides[s.sourceId]; overridden = true; }
    return { sourceId: s.sourceId, titre: s.titre, reference: s.reference, acteur: "human", acteurIdentite: who, date: now, decision: decision, machineProposal: prop ? prop.proposed : null, overriddenByUser: overridden,
      justification: (overridden ? "Décision de l'utilisateur, différente de la proposition machine (" + prop.proposed + "). " : "Ratifiée par l'utilisateur. Proposition machine : ") + just };
  });
  return { schema: "EvidenceForge.PostRetrievalAuditDecisions", schemaVersion: "1.0", snapshotId: snapshot.snapshotId, snapshotHash: snapshot.snapshotHash, missionId: snapshot.missionId,
    ratification: { actorIdentity: who, recordedAt: now, act: "USER_RATIFICATION_OF_MACHINE_SCREENING", statement: "Je ratifie la sélection des sources proposée par EvidenceForge, après en avoir pris connaissance, avec les modifications que j'ai indiquées.", machineEvidenceSha256: sha(JSON.stringify(evidence)), overridesCount: Object.keys(overrides).length },
    fullTextRead: false, disclaimer: "Décisions de screening ratifiées par l'utilisateur sur la base des métadonnées et résumés réels ; aucun texte intégral lu.", decisions: decisions };
}

/**
 * ratifyAndBuildCorpus : ratification utilisateur -> auditDecisions (acteur "human" = l'utilisateur, identite saisie) ->
 * reprise gelee -> graphe MONO-02 jusqu'au CorpusSnapshot.
 * input : { runDir, runId, snapshot, evidence, overrides: {sourceId: "inclus"|"exclu"}, ratifiedBy, executionMission, runContract }
 */
async function ratifyAndBuildCorpus(input) {
  const auditDecisionsInput = buildAuditDecisions(input.snapshot, input.evidence, input.overrides, input.ratifiedBy);
  return buildCorpusFromDecisions(Object.assign({}, input, { auditDecisionsInput }));
}

/** buildCorpusFromDecisions({ runDir, runId, snapshot, auditDecisionsInput, executionMission, runContract }) : POST_RETRIEVAL_GATE gele + graphe -> CorpusSnapshot. */
async function buildCorpusFromDecisions(input) {
  const auditDecisionsInput = input.auditDecisionsInput;
  const RSW = require(path.join(P.MONO08_V06, "lib", "real-screening-workflow.js"));
  const { buildDurableComponents } = require(path.join(P.MONO08_V06, "lib", "durable-real-env.js"));
  const { createFileDurableBackend } = require(path.join(P.MONO08_V06, "lib", "file-durable-backend.js"));
  const { driveRun } = require(path.join(P.MONO07_LIB, "e2e-driver.js"));
  const runRoot = path.join(input.runDir, "eforch-runtime"); fs.mkdirSync(runRoot, { recursive: true });
  const env = buildDurableComponents(P.MONO05, { eforchBackendDir: path.join(runRoot, "durable-eforch"), mono03BackendDir: path.join(runRoot, "durable-mono03"), providerConfigs: {}, secrets: {} });
  const snapshotBackend = createFileDurableBackend(path.join(runRoot, "durable-snapshots"));
  await snapshotBackend.put(RSW.SNAPSHOT_NAMESPACE, input.snapshot.snapshotId, input.snapshot);
  const mission = { dimensions: input.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline })), targetDocuments: input.executionMission.targetDocuments };
  const documentContentByUrl = {}; input.executionMission.targetDocuments.forEach((d) => { documentContentByUrl[d.url] = Buffer.from(d.contentBase64, "base64").toString("utf8"); });
  const workerCalls = []; const workerCallFn = async function () { workerCalls.push(new Date().toISOString()); return "{}"; };   // aucun LLM sur ce segment (graphe arrete avant EF-PR-GEN-01)
  const graphRunId = "eforch-" + input.runId;
  const resume = await RSW.resumeRealScreening(env, {}, workerCallFn, { runId: graphRunId, snapshotBackend, snapshotId: input.snapshot.snapshotId, auditDecisionsInput, mission, documentContentByUrl });
  await driveRun(env.operatorApi, graphRunId, { stopBeforeNode: "EF-PR-GEN-01" });
  const graph = await env.operatorApi.getGraph(graphRunId);
  const nodes = graph.nodes.map((n) => ({ nodeId: n.nodeId, state: n.state, lastError: n.lastError ? n.lastError.message : null }));
  const sub = nodes.find((n) => n.nodeId === "EF-ORCH-SUBSYSTEM");
  if (!sub || sub.state !== "SUCCESS") {
    const native = findNativeOrchError(path.join(runRoot, "durable-eforch"));   /* diagnostic du sous-systeme gele (jamais masque) */
    const e = new Error("CORPUS_NOT_BUILT: " + JSON.stringify(sub) + (native ? " ; EF-ORCH natif : " + JSON.stringify(native) : "")); e.code = "CORPUS_NOT_BUILT"; e.details = { node: sub, nativeError: native };
    e.userMessage = "Le corpus de sources n'a pas pu être constitué (" + ((sub && sub.lastError) || "état " + (sub && sub.state)) + (native && native.message ? " ; cause : " + native.message : "") + "). Aucun résultat n'est produit."; throw e; }
  const artifacts = await env.operatorApi.listArtifacts(graphRunId);   // API gelee MONO-05 : listArtifacts / getArtifact
  const corpusRef = artifacts.find((a) => a.nodeId === "EF-ORCH-SUBSYSTEM" && a.contract === "EvidenceForge.CorpusSnapshot");
  if (!corpusRef) { const e = new Error("CORPUS_ARTIFACT_NOT_FOUND"); e.code = "CORPUS_ARTIFACT_NOT_FOUND"; e.userMessage = "Le corpus de sources n'a pas été produit par le graphe gelé."; throw e; }
  const corpusArtifact = await env.operatorApi.getArtifact(graphRunId, corpusRef.artifactId);
  const corpusSnapshot = corpusArtifact.payload;
  const runInputs = await env.runRegistry.getRunInputs(graphRunId); const dep = runInputs.externalInputs.efOrchExecutionDependencies;
  const counts = {}; (corpusSnapshot.sources || []).forEach((s) => { counts[s.statutScreening] = (counts[s.statutScreening] || 0) + 1; });
  return { auditDecisionsInput, corpusSnapshot, corpusArtifactRef: { artifactId: corpusRef.artifactId, contentHash: corpusRef.contentHash, createdAt: corpusRef.createdAt }, screeningArtifact: dep.screeningArtifact, qualificationTestArtifact: dep.qualificationTestArtifact, retrievalLineage: dep.retrievalLineage, graphNodes: nodes, graphRunId, workerCallFnInvocations: workerCalls.length, screeningCounts: counts };
}

module.exports = { prepareRetrieval, enrichSources, ratifyAndBuildCorpus, buildCorpusFromDecisions, buildAuditDecisions, createOpenAlexFetch, abstractFromInverted, buildScreeningEvidence: SE.buildScreeningEvidence };
