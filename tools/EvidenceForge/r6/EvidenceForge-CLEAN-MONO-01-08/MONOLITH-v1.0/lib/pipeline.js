"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/pipeline.js
 * ORCHESTRATION reprenable, fail-closed : MISSION -> DISCIPLINES -> PLAN -> [porte CONFIRM_PLAN : acte utilisateur reel]
 *   -> RETRIEVAL -> [porte RATIFY_SOURCES : acte utilisateur reel] -> CORPUS -> PROFESSIONALS -> TWINS_REVIEWS -> QUALIFICATION -> REPORT.
 * Regles : l'etat sur disque est la seule verite ; une etape terminee n'est jamais rejouee ; un appel LLM reel n'est jamais
 * compte comme reutilisation (politique gelee MONO-11 v0.2) ; toute indisponibilite fournisseur arrete proprement le run
 * (status STOPPED, reprenable) ; toute erreur de contrat arrete le run (status FAILED) ; rien n'est invente pour « finir ».
 * Aucun acte humain n'est simule : les deux portes attendent un clic reel, avec l'identite saisie par l'utilisateur.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const RS = require("./run-store.js");
const { createLlm } = require("./llm.js");
const SM = require("./stage-mission.js"), S1 = require("./stage-ef01.js"), SR = require("./stage-retrieval.js"), SP = require("./stage-professionals.js"), SRP = require("./stage-report.js");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const now = () => new Date().toISOString();
/* reprenables : indisponibilites fournisseur ET sorties fournisseur invalides (un nouvel appel reel peut reussir) ; jamais une erreur de contrat */
const RESUMABLE = ["PROVIDER_CREDIT_EXHAUSTED", "PROVIDER_RATE_LIMITED", "NETWORK_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "LLM_UNAVAILABLE", "PROVIDER_EMPTY_RESPONSE",
  "LLM_PROVIDER_UNAVAILABLE", "LLM_RESPONSE_INVALID", "LLM_OUTPUT_SCHEMA_INVALID", "REFORMULATION_INVALID", "PLANNER_OUTPUT_INVALID", "RESOLVER_OUTPUT_INVALID"];
const isResumable = (state) => state && (state.status === "STOPPED" || (state.status === "FAILED" && state.error && RESUMABLE.indexOf(state.error.code) !== -1));
const running = new Map();   // runId -> Promise (un seul moteur par run)

function makeState(runId, question, documents) {
  const stages = {}; RS.STAGES.forEach((s) => { stages[s] = { status: "PENDING" }; });
  return { schema: "EvidenceForge.MonolithRunState", schemaVersion: "MONOLITH-v1.0", runId, status: "CREATED", stage: "MISSION", stages, gate: null, createdAt: now(),
    mission: { question, questionSha256: sha(Buffer.from(question, "utf8")), missionId: "efm-mission-" + sha(Buffer.from(question, "utf8")).slice(0, 12), documents, reformulated: null },
    attempts: 0, counters: { llmReal: 0, llmReused: 0, openAlexCalls: 0 }, seal: null, summary: null, userMessage: null, error: null };
}

/** Demarre un run : intake + preflight fournisseur (fail-closed avant tout travail). */
async function startRun(input) {
  const q = String(input.question || "").trim();
  if (q.length < 12) { const e = new Error("MISSION_INVALID"); e.code = "MISSION_INVALID"; e.userMessage = "Votre demande est trop courte pour être analysée (12 caractères minimum)."; throw e; }
  const intake = SM.intakeDocuments(input.files || []);
  const runId = RS.newRunId(); const store = RS.createRunStore(runId);
  const docsDir = path.join(store.dir, "documents"); fs.mkdirSync(docsDir, { recursive: true });
  intake.documents.forEach((d) => fs.writeFileSync(path.join(docsDir, d.documentId + ".txt"), Buffer.from(d.contentBase64, "base64")));
  const state = makeState(runId, q, intake.documents.map((d) => ({ documentId: d.documentId, name: d.name, bytes: d.bytes, sha256: d.sha256 })));
  state.documentsRejected = intake.rejected;
  store.write(state); store.event({ level: "user", message: "Run créé. " + intake.documents.length + " document(s) accepté(s)" + (intake.rejected.length ? ", " + intake.rejected.length + " refusé(s)." : ".") });
  return { runId, documents: state.mission.documents, rejected: intake.rejected };
}

function loadDocuments(store, state) {
  return (state.mission.documents || []).map(function (d) { const bytes = fs.readFileSync(path.join(store.dir, "documents", d.documentId + ".txt")); if (sha(bytes) !== d.sha256) throw Object.assign(new Error("DOCUMENT_HASH_MISMATCH: " + d.name), { code: "DOCUMENT_HASH_MISMATCH" });
    return Object.assign({}, d, { content: bytes.toString("utf8"), contentBase64: bytes.toString("base64") }); });
}

function fail(store, state, e) {
  const code = e.code || "UNEXPECTED_ERROR"; const resumable = RESUMABLE.indexOf(code) !== -1;
  state.status = resumable ? "STOPPED" : "FAILED"; state.error = { code, message: String(e.message).slice(0, 2000), userMessage: e.userMessage || null, at: now(), stage: state.stage, resumable, details: e.details || null };
  state.userMessage = e.userMessage || (resumable ? "Le run est arrêté proprement ; il pourra reprendre." : "Le run s'est arrêté sur une erreur de contrat : aucun résultat partiel n'est présenté comme un résultat.");
  state.stages[state.stage].status = resumable ? "INTERRUPTED" : "FAILED";
  store.write(state); store.event({ level: "user", message: state.userMessage, code, resumable }); store.event({ level: "tech", message: e.stack ? String(e.stack).slice(0, 4000) : String(e.message), code });
}

/** Moteur : avance depuis l'etat courant jusqu'a une porte, la fin, ou un arret. Reentrant-safe. */
function advance(runId) {
  if (running.has(runId)) return running.get(runId);
  const p = (async function () {
    const store = RS.createRunStore(runId); const state = store.read();
    if (!state) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
    if (state.status === "COMPLETED" || (state.status === "FAILED" && !isResumable(state))) return store.publicState(state);
    state.attempts = (state.attempts || 0) + 1; state.status = "RUNNING"; state.error = null; state.userMessage = null; store.write(state);
    const llm = createLlm({ runDir: store.dir, runId, sealHash: null });
    const base = { real: (state.counters && state.counters.llmReal) || 0, reused: (state.counters && state.counters.llmReused) || 0 };   // compteurs CUMULES sur les tentatives
    state.counters = Object.assign({ llmReal: 0, llmReused: 0, openAlexCalls: 0, kitRealCalls: 0 }, state.counters || {});
    const log = (e) => store.event(Object.assign({ level: "tech" }, e));
    const setStage = (s, msg) => { state.stage = s; state.stages[s].status = "RUNNING"; state.stages[s].startedAt = state.stages[s].startedAt || now(); store.write(state); store.event({ level: "user", message: RS.STAGE_LABELS[s] + (msg ? " — " + msg : "") + "…", stage: s }); };
    const done = (s, extra) => { state.stages[s] = Object.assign(state.stages[s], { status: "DONE", completedAt: now() }, extra || {}); const c = llm.counts(); state.counters.llmReal = base.real + c.real; state.counters.llmReused = base.reused + c.reused; store.write(state); store.event({ level: "user", message: RS.STAGE_LABELS[s] + " : terminé.", stage: s }); };
    const isDone = (s) => state.stages[s].status === "DONE";
    try {
      /* preflight fournisseur : jamais de travail sur un fournisseur absent */
      const pf = await llm.preflight(); state.provider = { checkedAt: now(), ok: pf.ok, code: pf.code, model: pf.model || llm.model };
      if (!pf.ok) { const e = new Error(pf.code); e.code = pf.code; e.userMessage = pf.user; throw e; }
      store.write(state);
      const documents = loadDocuments(store, state);
      const missionQuestion = state.mission.question, missionId = state.mission.missionId;

      if (!isDone("MISSION")) { setStage("MISSION"); const r = await SM.reformulate({ llm, question: missionQuestion, documents }); state.mission.reformulated = r.reformulation; store.saveJson("mission.json", { reformulation: r.reformulation, provenance: r.provenance }); done("MISSION"); }
      if (!isDone("DISCIPLINES")) { setStage("DISCIPLINES"); const r = await S1.runDisciplines({ runDir: store.dir, runId, missionId, missionQuestion, documents }); store.saveJson("disciplines.json", r); state.counters.kitRealCalls += 1; done("DISCIPLINES", { retenues: r.disciplinesRetenues.length }); }   /* kit EF-01B : 1 appel reel via MONO-04 (journalise dans ef01-evidence/) */
      const disciplines = store.loadJson("disciplines.json");
      if (!isDone("PLAN")) { setStage("PLAN"); const r = await S1.runPlanner({ runDir: store.dir, runId, missionId, missionQuestion, runContract: disciplines.runContract, resolverOutputHash: disciplines.resolver.resolverOutputHash }); store.saveJson("plan.json", r); state.counters.kitRealCalls += 1; done("PLAN"); }   /* kit EF-01C1 : 1 appel reel via MONO-04 */
      if (!store.loadJson("plan-confirmation.json")) {
        state.status = "WAITING_USER"; state.gate = { id: RS.GATES.CONFIRM_PLAN, since: now(), userMessage: "Vérifiez la compréhension de votre demande, les angles d'expertise retenus et le plan de recherche, puis confirmez et lancez l'analyse (acte enregistré à votre nom)." };
        store.write(state); store.event({ level: "user", message: "En attente de votre confirmation pour lancer l'analyse." }); return store.publicState(state);
      }
      const plan = store.loadJson("plan.json"), confirmation = store.loadJson("plan-confirmation.json");
      if (!isDone("RETRIEVAL")) {
        setStage("RETRIEVAL", "recherche réelle dans la base de publications");
        const r = await SR.prepareRetrieval({ runDir: store.dir, executionMission: confirmation.executionMission, runContract: disciplines.runContract, searchProtocol: confirmation.searchProtocol, provenance: confirmation.provenance, log });
        store.saveJson("retrieval-snapshot.json", r.snapshot); store.saveJson("retrieval-meta.json", { missionId: r.missionId, coverage: r.coverage, networkCalls: r.networkCalls, snapshotIntegrity: r.snapshotIntegrity, snapshotHash: r.snapshot.snapshotHash, sourceCount: r.snapshot.sourceCount });
        store.event({ level: "user", message: r.snapshot.sourceCount + " publication(s) trouvée(s). Lecture des résumés réels…" });
        const en = await SR.enrichSources({ runDir: store.dir, snapshot: r.snapshot, log }); store.saveJson("sources-enriched.json", en);
        store.event({ level: "user", message: "Tri documentaire des publications (proposition machine, à ratifier)…" });
        const dims = disciplines.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline, definition: d.justification }));
        const ev = await SR.buildScreeningEvidence({ llm, mission: missionQuestion, dimensions: dims, sources: en.enriched, batchSize: P.CONFIG.screening.batchSize, maxPasses: P.CONFIG.screening.maxPasses || 3 });
        store.saveJson("screening-evidence.json", ev); state.counters.openAlexCalls += r.networkCalls.length + en.networkCalls.length;
        if (!r.snapshot.sourceCount) { const e = new Error("NO_SOURCE_RETRIEVED"); e.code = "NO_SOURCE_RETRIEVED"; e.userMessage = "Aucune publication n'a été trouvée pour ce plan de recherche. Le run s'arrête (rien n'est inventé). Reformulez votre demande."; throw e; }
        done("RETRIEVAL", { sources: r.snapshot.sourceCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length });
      }
      if (!store.loadJson("sources-ratification.json")) {
        state.status = "WAITING_USER"; state.gate = { id: RS.GATES.RATIFY_SOURCES, since: now(), userMessage: "EvidenceForge propose une sélection des publications trouvées. Parcourez-la (vous pouvez inverser un choix), puis ratifiez-la : chaque décision est enregistrée à votre nom." };
        store.write(state); store.event({ level: "user", message: "En attente de votre ratification des sources." }); return store.publicState(state);
      }
      if (!isDone("CORPUS")) {
        setStage("CORPUS"); const rat = store.loadJson("sources-ratification.json");
        const r = await SR.ratifyAndBuildCorpus({ runDir: store.dir, runId, snapshot: store.loadJson("retrieval-snapshot.json"), evidence: store.loadJson("screening-evidence.json"), overrides: rat.overrides, ratifiedBy: rat.ratifiedBy, executionMission: confirmation.executionMission, runContract: disciplines.runContract });
        store.saveJson("audit-decisions.json", r.auditDecisionsInput); store.saveJson("corpus-snapshot.json", r.corpusSnapshot);
        store.saveJson("corpus-meta.json", { corpusArtifactRef: r.corpusArtifactRef, graphRunId: r.graphRunId, graphNodes: r.graphNodes, screeningCounts: r.screeningCounts, workerCallFnInvocations: r.workerCallFnInvocations, retrievalLineage: r.retrievalLineage, qualificationTestArtifact: r.qualificationTestArtifact, screeningArtifactSummary: { sources: (r.screeningArtifact.sourcesScreening || []).length, evidenceProvenance: r.screeningArtifact.evidenceProvenance } });
        done("CORPUS", r.screeningCounts);
      }
      const corpusSnapshot = store.loadJson("corpus-snapshot.json");
      if (!isDone("PROFESSIONALS") || !isDone("TWINS_REVIEWS") || !isDone("QUALIFICATION")) {
        setStage("PROFESSIONALS", "découverte réelle");
        const dimensionSetLite = { dimensions: disciplines.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline })) };
        let disc = store.loadJson("professionals-discovery.json");
        if (!disc) { disc = await SP.discoverProfessionals({ runDir: store.dir, corpusSnapshot, dimensionSet: dimensionSetLite, log }); store.saveJson("professionals-discovery.json", disc); state.counters.openAlexCalls += disc.networkCalls.length; store.write(state); }
        store.event({ level: "user", message: disc.candidates + " professionnel(s) candidat(s), " + disc.resolved + " identifié(s). Évaluation et constitution du panel…" });
        const upstreamReservations = [
          { code: "SCREENING_RATIFIED_ON_METADATA", detail: "Screening proposé par la machine sur métadonnées et résumés réels, ratifié par l'utilisateur ; aucun texte intégral lu." },
          { code: "DISCIPLINES_AUTO_RETAINED", detail: "Angles d'expertise retenus automatiquement (AUTO_RETAIN_VALID_PROPOSALS) sans revue humaine." },
          { code: "DISCIPLINE_LABEL_IS_QUERY_LINEAGE", detail: "Le libellé de discipline d'un candidat est la lignée de requête de la source incluse, pas une expertise vérifiée." },
        ];
        const attemptRunId = runId + "-a" + state.attempts;
        const r = await SP.runPanelAndDownstream({ runDir: store.dir, runId: attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification,
          targetDocuments: confirmation.executionMission.targetDocuments, llm, upstreamReservations, log,
          onStage: async (ev, data) => { if (ev === "PROFESSIONALS_DONE") { done("PROFESSIONALS", data); setStage("TWINS_REVIEWS"); } if (ev === "TWINS_REVIEWS_DONE") { done("TWINS_REVIEWS", data); setStage("QUALIFICATION"); } } });
        state.seal = { mono11Version: r.seal.mono11Version, runtimeSealSha256: r.seal.runtimeSealSha256, runCodeHash: r.seal.runCodeHash, mono11ZipSha256: r.seal.mono11ZipSha256, mono11ManifestSha256: r.seal.mono11ManifestSha256 };
        state.counters.openAlexCalls += r.openAlexCalls.length;
        store.saveJson("assessment.json", r.assessment); store.saveJson("panel.json", r.panel); store.saveJson("corpora-all.json", r.corpusSetAll); store.saveJson("corpora-admitted.json", r.downstream.corpusSet);
        store.saveJson("twins.json", r.downstream.twinSet); store.saveJson("coverage.json", r.downstream.coverageMatrix); store.saveJson("panel-selection.json", r.downstream.panelSelection); store.saveJson("review-schema.json", r.downstream.reviewSchema);
        store.saveJson("target-document-set.json", r.downstream.targetDocumentSet); store.saveJson("reviews.json", r.downstream.reviewSet); store.saveJson("normalization-records.json", r.downstream.normalizationRecords); store.saveJson("enforcement-traces.json", r.downstream.enforcementTraces);
        store.saveJson("aggregation.json", r.downstream.aggregation); store.saveJson("qualification.json", Object.assign({ readinessPre: r.readinessPre, readinessFull: r.readinessFull }, r.qualification));
        store.saveJson("mono10-run.json", { mono10RunId: attemptRunId, attestation: r.attestation, capability: r.capability, chains: r.chains, registryEntries: r.registryEntries, ledger: r.ledgerExport, operatorConfig: r.operatorConfig, evidenceArtifactsPersisted: r.evidenceArtifactsPersisted, dimensionSetHash: r.dimensionSet.dimensionSetHash, stats: r.stats });
        done("QUALIFICATION", { status: r.qualification.status });
      }
      if (!isDone("REPORT")) {
        setStage("REPORT");
        const q = store.loadJson("qualification.json"), rev = store.loadJson("reviews.json"), rm = store.loadJson("retrieval-meta.json"), cm = store.loadJson("corpus-meta.json");
        const report = SRP.buildUserReport({ state, reformulation: state.mission.reformulated, runContract: disciplines.runContract, corpusSnapshot, discovery: store.loadJson("professionals-discovery.json").discovery, panel: store.loadJson("panel.json"), twinSet: store.loadJson("twins.json"), reviewSet: rev,
          aggregation: store.loadJson("aggregation.json"), qualification: q, readinessPre: q.readinessPre, readinessFull: q.readinessFull, seal: state.seal, llmCounts: llm.counts(), retrieval: rm, targetDocuments: confirmation.executionMission.targetDocuments,
          upstreamReservations: [], lineageRefs: { corpusArtifactRef: cm.corpusArtifactRef, searchProtocolHash: confirmation.searchProtocol.protocolHash } });
        store.saveJson("report.json", report);
        state.summary = { PROCESS_QUALIFICATION: report.headline.PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE: report.headline.SCIENTIFICALLY_USABLE, counts: report.counts, reportHash: report.reportHash };
        done("REPORT");
      }
      state.status = "COMPLETED"; state.gate = null; state.completedAt = now(); state.userMessage = "Analyse terminée. " + (state.summary ? SRP.QUALIFICATION_USER[state.summary.PROCESS_QUALIFICATION] : ""); store.write(state);
      store.event({ level: "user", message: state.userMessage });
      writeLineage(store, state);
      return store.publicState(state);
    } catch (e) { fail(store, state, e); return store.publicState(state); }
  })();
  running.set(runId, p); p.finally(() => running.delete(runId)); return p;
}

/** Porte 1 — acte utilisateur reel : confirme mission + angles + plan, construit SearchProtocol/provenance/ExecutionMission. */
async function confirmPlan(runId, input) {
  const store = RS.createRunStore(runId); const state = store.read();
  if (!state || !state.gate || state.gate.id !== RS.GATES.CONFIRM_PLAN) { const e = new Error("GATE_NOT_OPEN"); e.code = "GATE_NOT_OPEN"; e.userMessage = "Aucune confirmation n'est attendue à ce stade."; throw e; }
  const disciplines = store.loadJson("disciplines.json"), plan = store.loadJson("plan.json"); const documents = loadDocuments(store, state);
  const r = await S1.confirmPlan({ validatedBy: input.validatedBy, commentaire: input.commentaire, missionId: state.mission.missionId, missionQuestion: state.mission.question, runContract: disciplines.runContract, planner: plan, resolverRuns: disciplines.resolver.resolverRuns, documents });
  store.saveJson("plan-confirmation.json", { validation: r.validation, searchProtocol: r.searchProtocol, provenance: r.provenance, executionMission: r.executionMission, recordedAt: now() });
  state.gate = null; state.status = "RUNNING"; store.write(state); store.event({ level: "user", message: "Plan confirmé par " + r.validation.validatedBy + ". Lancement de l'analyse automatique." });
  advance(runId); return { ok: true, validatedBy: r.validation.validatedBy, protocolHash: r.searchProtocol.protocolHash };
}

/** Porte 2 — acte utilisateur reel : ratification des sources (avec renversements eventuels). */
async function ratifySources(runId, input) {
  const store = RS.createRunStore(runId); const state = store.read();
  if (!state || !state.gate || state.gate.id !== RS.GATES.RATIFY_SOURCES) { const e = new Error("GATE_NOT_OPEN"); e.code = "GATE_NOT_OPEN"; e.userMessage = "Aucune ratification n'est attendue à ce stade."; throw e; }
  const who = String(input.ratifiedBy || "").trim(); if (who.length < 2) { const e = new Error("HUMAN_IDENTITY_REQUIRED"); e.code = "HUMAN_IDENTITY_REQUIRED"; e.userMessage = "Indiquez votre nom : la ratification est un acte humain réel."; throw e; }
  const overrides = {}; Object.keys(input.overrides || {}).forEach((k) => { if (["inclus", "exclu"].indexOf(input.overrides[k]) !== -1) overrides[k] = input.overrides[k]; });
  store.saveJson("sources-ratification.json", { ratifiedBy: who, overrides, recordedAt: now(), evidenceSha256: sha(JSON.stringify(store.loadJson("screening-evidence.json"))) });
  state.gate = null; state.status = "RUNNING"; store.write(state); store.event({ level: "user", message: "Sources ratifiées par " + who + " (" + Object.keys(overrides).length + " choix modifié(s))." });
  advance(runId); return { ok: true, ratifiedBy: who, overrides: Object.keys(overrides).length };
}

/** Vue de porte : ce que l'utilisateur doit lire avant d'agir. */
function gateView(runId) {
  const store = RS.createRunStore(runId); const state = store.read(); if (!state || !state.gate) return null;
  if (state.gate.id === RS.GATES.CONFIRM_PLAN) { const d = store.loadJson("disciplines.json"), p = store.loadJson("plan.json");
    return { gate: state.gate, reformulation: state.mission.reformulated, disciplines: d.disciplinesRetenues, plan: p.userView.requetes, documents: state.mission.documents }; }
  if (state.gate.id === RS.GATES.RATIFY_SOURCES) { const ev = store.loadJson("screening-evidence.json"), en = store.loadJson("sources-enriched.json"); const byId = new Map(en.enriched.map((s) => [s.sourceId, s]));
    return { gate: state.gate, summary: { sources: ev.sourcesCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length }, notADecision: ev.notADecision,
      proposals: ev.proposals.map((p) => Object.assign({ titre: (byId.get(p.sourceId) || {}).titre, annee: (byId.get(p.sourceId) || {}).annee, lieu: (byId.get(p.sourceId) || {}).lieu, doi: (byId.get(p.sourceId) || {}).doi, resume: ((byId.get(p.sourceId) || {}).resume || "").slice(0, 600) }, p)),
      failedSourceIds: ev.failedSourceIds.map((id) => ({ sourceId: id, titre: (byId.get(id) || {}).titre })) }; }
  return { gate: state.gate };
}

function writeLineage(store, state) {
  const files = fs.readdirSync(store.dir).filter((f) => f.endsWith(".json")).map((f) => ({ path: f, sha256: sha(fs.readFileSync(path.join(store.dir, f))) }));
  store.saveJson("lineage.json", { schema: "EvidenceForge.MonolithLineage", runId: state.runId, seal: state.seal, frozenLots: P.CONFIG.frozenLots, attempts: state.attempts, artifacts: files, generatedAt: now() });
}

module.exports = { startRun, advance, confirmPlan, ratifySources, gateView, RESUMABLE, isResumable };
