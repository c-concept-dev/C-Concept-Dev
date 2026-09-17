"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/pipeline.js
 * ORCHESTRATION reprenable, fail-closed : MISSION -> DISCIPLINES -> PLAN -> [porte CONFIRM_PLAN : acte utilisateur reel]
 *   -> RETRIEVAL -> [porte RATIFY_SOURCES : acte utilisateur reel] -> CORPUS -> PROFESSIONALS -> TWINS_REVIEWS -> QUALIFICATION -> REPORT.
 * Regles : l'etat sur disque est la seule verite ; une etape terminee n'est jamais rejouee ; un appel LLM reel n'est jamais
 * compte comme reutilisation (politique gelee MONO-11) ; toute indisponibilite fournisseur arrete proprement le run
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
/* LEDGER_DUPLICATE_OR_INVALID : cause connue (doublons de candidats MONO-09 sur plusieurs disciplines), corrigee en v1.0.1 par
   deduplication a la reprise (dedupeDiscovery) ; la reprise rejoue l'etape PROFESSIONALS sur un nouveau run MONO-10 */
const RESUMABLE = ["INTERRUPTED_BY_RESTART", "LEDGER_DUPLICATE_OR_INVALID", "AGGREGATION_CLASSIFICATION_ERROR", "CHECKPOINT_CORRUPT", "PROVIDER_CREDIT_EXHAUSTED", "PROVIDER_RATE_LIMITED", "NETWORK_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "LLM_UNAVAILABLE", "PROVIDER_EMPTY_RESPONSE",
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
  /* document refuse : jamais un lancement silencieux sur la question seule — l'utilisateur doit confirmer explicitement */
  if (intake.rejected.length && input.acknowledgeRejected !== true) { const e = new Error("DOCUMENTS_REJECTED"); e.code = "DOCUMENTS_REJECTED"; e.details = { rejected: intake.rejected, accepted: intake.documents.map((d) => d.name) };
    e.userMessage = intake.rejected.length + " document(s) refusé(s) : " + intake.rejected.map((r) => r.name + " (" + r.reason + ")").join(" ; ") + ". Voulez-vous continuer " + (intake.documents.length ? "avec les " + intake.documents.length + " document(s) accepté(s) seulement" : "sans document (votre demande seule sera examinée)") + " ?"; throw e; }
  const runId = RS.newRunId(); const store = RS.createRunStore(runId);
  const docsDir = path.join(store.dir, "documents"); fs.mkdirSync(docsDir, { recursive: true });
  intake.documents.forEach((d) => fs.writeFileSync(path.join(docsDir, d.documentId + ".txt"), Buffer.from(d.contentBase64, "base64")));
  const state = makeState(runId, q, intake.documents.map((d) => ({ documentId: d.documentId, name: d.name, bytes: d.bytes, sha256: d.sha256 })));
  state.documentsRejected = intake.rejected;
  store.write(state); store.event({ level: "user", message: "Run créé. " + intake.documents.length + " document(s) accepté(s)" + (intake.rejected.length ? ", " + intake.rejected.length + " refusé(s)." : ".") , _state: state });
  return { runId, documents: state.mission.documents, rejected: intake.rejected };
}

function loadDocuments(store, state) {
  return (state.mission.documents || []).map(function (d) { const bytes = fs.readFileSync(path.join(store.dir, "documents", d.documentId + ".txt")); if (sha(bytes) !== d.sha256) throw Object.assign(new Error("DOCUMENT_HASH_MISMATCH: " + d.name), { code: "DOCUMENT_HASH_MISMATCH" });
    return Object.assign({}, d, { content: bytes.toString("utf8"), contentBase64: bytes.toString("base64") }); });
}

function fail(store, state, e, llm, base) {
  if (llm && base) { const c = llm.counts(); state.counters.llmReal = base.real + c.real; state.counters.llmReused = base.reused + c.reused; }   /* compteurs exacts meme en cas d'echec */
  const code = e.code || "UNEXPECTED_ERROR"; const resumable = RESUMABLE.indexOf(code) !== -1;
  state.status = resumable ? "STOPPED" : "FAILED"; state.error = { code, message: String(e.message).slice(0, 2000), userMessage: e.userMessage || null, at: now(), stage: state.stage, resumable, details: e.details || null };
  state.userMessage = e.userMessage || (resumable ? "Le run est arrêté proprement ; il pourra reprendre." : "Le run s'est arrêté sur une erreur de contrat : aucun résultat partiel n'est présenté comme un résultat.");
  if (state.stages[state.stage] && state.stages[state.stage].status === "RUNNING") state.stages[state.stage].status = resumable ? "INTERRUPTED" : "FAILED";   /* une etape DONE n'est jamais degradee par un echec ulterieur (ex. preflight) */
  store.write(state); store.event({ level: "user", actor: "system", message: state.userMessage, code, normalizedCause: e.transportFailure ? "TRANSPORT_FAILURE" : (resumable ? "PROVIDER_OR_TRANSIENT" : "CONTRACT"), resumable, previousState: "RUNNING", nextState: state.status, _state: state }); store.event({ level: "tech", actor: "system", message: e.stack ? String(e.stack).slice(0, 4000) : String(e.message), code, details: e.details || null, _state: state });
}

/** Moteur : avance depuis l'etat courant jusqu'a une porte, la fin, ou un arret. Reentrant-safe. */
function advance(runId) {
  if (running.has(runId)) return running.get(runId);
  const p = (async function () {
    const store = RS.createRunStore(runId); const state = store.read();
    if (!state) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
    if (state.status === "COMPLETED" || (state.status === "FAILED" && !isResumable(state))) return store.publicState(state);
    state.attempts = (state.attempts || 0) + 1; state.status = "RUNNING"; state.error = null; state.userMessage = null;
    const firstPending = RS.STAGES.find((k) => state.stages[k].status !== "DONE"); if (firstPending) state.stage = firstPending;   /* le pointeur d'etape ne designe jamais une etape terminee */
    store.write(state); store.event({ level: "tech", message: "tentative " + state.attempts + " : reprise a l'etape " + state.stage, actor: "system", previousState: "RESUME", nextState: "RUNNING", _state: state });
    let sealHash = null; try { sealHash = SP.loadSealedMono11().SEAL.runtimeSealSha256; } catch (e) { fail(store, state, e); return store.publicState(state); }
    const llm = createLlm({ runDir: store.dir, runId, sealHash, onTrace: (e) => store.event(Object.assign({ level: "tech", actor: "machine", _state: state }, e)) });
    const base = { real: (state.counters && state.counters.llmReal) || 0, reused: (state.counters && state.counters.llmReused) || 0 };   // compteurs CUMULES sur les tentatives
    state.counters = Object.assign({ llmReal: 0, llmReused: 0, openAlexCalls: 0, kitRealCalls: 0 }, state.counters || {});
    const log = (e) => store.event(Object.assign({ level: "tech", actor: "machine", _state: state }, e));
    const setStage = (s, msg) => { const prev = state.stages[s].status; state.stage = s; state.stages[s].status = "RUNNING"; state.stages[s].startedAt = state.stages[s].startedAt || now(); store.write(state); store.event({ level: "user", actor: "machine", message: RS.STAGE_LABELS[s] + (msg ? " — " + msg : "") + "…", stage: s, previousState: prev, nextState: "RUNNING", _state: state }); };
    const done = (s, extra) => { const ex = Object.assign({}, extra || {}); delete ex.status;   /* v1.0.2 : `status` reserve (v1.0.1 ecrasait DONE par le statut de qualification => reprise reentrante) */
      state.stages[s] = Object.assign(state.stages[s], ex, { status: "DONE", completedAt: now() }); const c = llm.counts(); state.counters.llmReal = base.real + c.real; state.counters.llmReused = base.reused + c.reused; state.counters.reuseRefused = (state.counters.reuseRefused || 0) + (c.reuseRefused || 0); store.write(state);
      store.event({ level: "user", actor: "machine", message: RS.STAGE_LABELS[s] + " : terminé.", stage: s, previousState: "RUNNING", nextState: "DONE", checkpointRef: (extra && extra.checkpoint) || null, durationMs: state.stages[s].startedAt ? Date.now() - Date.parse(state.stages[s].startedAt) : null, _state: state }); };
    const isDone = (s) => state.stages[s].status === "DONE";
    try {
      /* preflight fournisseur : jamais de travail sur un fournisseur absent */
      const pf = await llm.preflight(); state.provider = { checkedAt: now(), ok: pf.ok, code: pf.code, model: pf.model || llm.model };
      if (!pf.ok) { const e = new Error(pf.code); e.code = pf.code; e.userMessage = pf.user; throw e; }
      store.write(state);
      const documents = loadDocuments(store, state);
      const missionQuestion = state.mission.question, missionId = state.mission.missionId;

      if (!isDone("MISSION")) { setStage("MISSION"); const r = await SM.reformulate({ llm, question: missionQuestion, documents }); state.mission.reformulated = r.reformulation; store.saveJson("mission.json", { reformulation: r.reformulation, provenance: r.provenance }); done("MISSION"); }
      const kitAttempt = (label) => async (n) => { state.counters.kitRealCalls += 1; store.write(state); store.event({ level: "tech", message: "kit EF-01 " + label + " : appel reel, tentative " + n }); };   /* compte AVANT l'appel : exact meme en cas d'echec */
      if (!isDone("DISCIPLINES")) { setStage("DISCIPLINES"); const r = await S1.runDisciplines({ runDir: store.dir, runId, missionId, missionQuestion, documents, onAttempt: kitAttempt("résolveur") }); store.saveJson("disciplines.json", r); done("DISCIPLINES", { retenues: r.disciplinesRetenues.length, attempt: r.attemptNo }); }
      const disciplines = store.loadJson("disciplines.json");
      if (!isDone("PLAN")) { setStage("PLAN"); const r = await S1.runPlanner({ runDir: store.dir, runId, missionId, missionQuestion, runContract: disciplines.runContract, resolverOutputHash: disciplines.resolver.resolverOutputHash, onAttempt: kitAttempt("planificateur") }); store.saveJson("plan.json", r); done("PLAN", { attempt: r.attemptNo }); }
      if (!store.loadJson("plan-confirmation.json")) {
        state.status = "WAITING_USER"; state.gate = { id: RS.GATES.CONFIRM_PLAN, since: now(), userMessage: "Vérifiez la compréhension de votre demande, les angles d'expertise retenus et le plan de recherche, puis confirmez et lancez l'analyse (acte enregistré à votre nom)." };
        store.write(state); store.event({ level: "user", message: "En attente de votre confirmation pour lancer l'analyse." , _state: state }); return store.publicState(state);
      }
      const plan = store.loadJson("plan.json"), confirmation = store.loadJson("plan-confirmation.json");
      /* garde precoce (v1.0.1) : l'invariant de cardinalite d'EF-01A gele (documentsAudites == targetDocuments) est verifie AVANT de
         depenser la recherche et la ratification de l'utilisateur ; un run cree avant le correctif du parcours « question seule » echoue ici, clairement */
      const nAud = ((disciplines.runContract.perimetre || {}).documentsAudites || []).length, nTgt = (confirmation.executionMission.targetDocuments || []).length;
      if (nAud !== nTgt) { const e = new Error("RUNCONTRACT_TARGET_MISMATCH: documentsAudites=" + nAud + " targetDocuments=" + nTgt); e.code = "RUNCONTRACT_TARGET_MISMATCH"; e.userMessage = "Ce run a été préparé avec un contrat de mission qui ne déclare pas le document examiné (" + nAud + " déclaré, " + nTgt + " à examiner) : le corpus ne pourrait pas être constitué. Ce run n'est pas reprenable ; créez une nouvelle demande (le défaut est corrigé pour les nouveaux runs)."; throw e; }
      if (!isDone("RETRIEVAL")) {
        setStage("RETRIEVAL", "recherche réelle dans la base de publications");
        const r = await SR.prepareRetrieval({ runDir: store.dir, executionMission: confirmation.executionMission, runContract: disciplines.runContract, searchProtocol: confirmation.searchProtocol, provenance: confirmation.provenance, log });
        store.saveJson("retrieval-snapshot.json", r.snapshot); store.saveJson("retrieval-meta.json", { missionId: r.missionId, coverage: r.coverage, networkCalls: r.networkCalls, snapshotIntegrity: r.snapshotIntegrity, snapshotHash: r.snapshot.snapshotHash, sourceCount: r.snapshot.sourceCount });
        store.event({ level: "user", message: r.snapshot.sourceCount + " publication(s) trouvée(s). Lecture des résumés réels…" , _state: state });
        const en = await SR.enrichSources({ runDir: store.dir, snapshot: r.snapshot, log }); store.saveJson("sources-enriched.json", en);
        store.event({ level: "user", message: "Tri documentaire des publications (proposition machine, à ratifier)…" , _state: state });
        const dims = disciplines.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline, definition: d.justification }));
        const ev = await SR.buildScreeningEvidence({ llm, mission: missionQuestion, dimensions: dims, sources: en.enriched, batchSize: P.CONFIG.screening.batchSize, maxPasses: P.CONFIG.screening.maxPasses || 3 });
        store.saveJson("screening-evidence.json", ev); state.counters.openAlexCalls += r.networkCalls.length + en.networkCalls.length;
        if (!r.snapshot.sourceCount) { const e = new Error("NO_SOURCE_RETRIEVED"); e.code = "NO_SOURCE_RETRIEVED"; e.userMessage = "Aucune publication n'a été trouvée pour ce plan de recherche. Le run s'arrête (rien n'est inventé). Reformulez votre demande."; throw e; }
        done("RETRIEVAL", { sources: r.snapshot.sourceCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length });
      }
      if (!store.loadJson("sources-ratification.json")) {
        state.status = "WAITING_USER"; state.gate = { id: RS.GATES.RATIFY_SOURCES, since: now(), userMessage: "EvidenceForge propose une sélection des publications trouvées. Parcourez-la (vous pouvez inverser un choix), puis ratifiez-la : chaque décision est enregistrée à votre nom." };
        store.write(state); store.event({ level: "user", message: "En attente de votre ratification des sources." , _state: state }); return store.publicState(state);
      }
      if (!isDone("CORPUS")) {
        setStage("CORPUS"); const rat = store.loadJson("sources-ratification.json");
        /* les decisions issues de l'acte humain sont PERSISTEES avant l'appel gele (jamais perdues si le corpus echoue) */
        const auditDecisionsInput = store.loadJson("audit-decisions.json") || SR.buildAuditDecisions(store.loadJson("retrieval-snapshot.json"), store.loadJson("screening-evidence.json"), rat.overrides, rat.ratifiedBy);
        store.saveJson("audit-decisions.json", auditDecisionsInput); const dc = {}; auditDecisionsInput.decisions.forEach((d) => { dc[d.decision] = (dc[d.decision] || 0) + 1; }); store.event({ level: "user", actor: "user", message: "Décisions ratifiées : " + JSON.stringify(dc).replace(/[{}"]/g, "").replace(/,/g, ", ") + " (" + auditDecisionsInput.decisions.length + " sources).", _state: state });
        const r = await SR.buildCorpusFromDecisions({ runDir: store.dir, runId, snapshot: store.loadJson("retrieval-snapshot.json"), auditDecisionsInput, executionMission: confirmation.executionMission, runContract: disciplines.runContract });
        store.saveJson("corpus-snapshot.json", r.corpusSnapshot);
        store.saveJson("corpus-meta.json", { corpusArtifactRef: r.corpusArtifactRef, graphRunId: r.graphRunId, graphNodes: r.graphNodes, screeningCounts: r.screeningCounts, workerCallFnInvocations: r.workerCallFnInvocations, retrievalLineage: r.retrievalLineage, qualificationTestArtifact: r.qualificationTestArtifact, screeningArtifactSummary: { sources: (r.screeningArtifact.sourcesScreening || []).length, evidenceProvenance: r.screeningArtifact.evidenceProvenance } });
        done("CORPUS", r.screeningCounts);
      }
      const corpusSnapshot = store.loadJson("corpus-snapshot.json");
      const upstreamReservations = [
        { code: "SCREENING_RATIFIED_ON_METADATA", detail: "Screening proposé par la machine sur métadonnées et résumés réels, ratifié par l'utilisateur ; aucun texte intégral lu." },
        { code: "DISCIPLINES_AUTO_RETAINED", detail: "Angles d'expertise retenus automatiquement (AUTO_RETAIN_VALID_PROPOSALS) sans revue humaine." },
        { code: "DISCIPLINE_LABEL_IS_QUERY_LINEAGE", detail: "Le libellé de discipline d'un candidat est la lignée de requête de la source incluse, pas une expertise vérifiée." },
      ];

      const attemptRunId = runId + "-a" + state.attempts;
      /* ===== PROFESSIONALS : decouverte (artefact reutilise s'il existe) + evaluation/panel -> CHECKPOINT durable -> DONE ===== */
      let cpPro = null; try { cpPro = store.loadCheckpoint("checkpoint-professionals.json"); } catch (e) { store.event({ level: "user", message: e.userMessage || e.message, code: e.code, _state: state }); cpPro = null; }
      if (isDone("PROFESSIONALS") && !cpPro) { state.stages.PROFESSIONALS.status = "PENDING"; store.event({ level: "user", message: "Point de reprise des professionnels absent ou invalide : l'étape sera recalculée (les réponses déjà validées sont réutilisées).", _state: state }); }
      if (!isDone("PROFESSIONALS")) {
        setStage("PROFESSIONALS", "découverte réelle");
        const dimensionSetLite = { dimensions: disciplines.runContract.disciplinesProposees.filter((d) => d.statut === "retenue").map((d) => ({ id: d.discipline, label: d.discipline })) };
        let disc = store.loadJson("professionals-discovery.json");
        if (!disc) { disc = await SP.discoverProfessionals({ runDir: store.dir, corpusSnapshot, dimensionSet: dimensionSetLite, log }); store.saveJson("professionals-discovery.json", disc); state.counters.openAlexCalls += disc.networkCalls.length; store.write(state); }
        store.event({ level: "user", message: disc.candidates + " professionnel(s) candidat(s), " + disc.resolved + " identifié(s). Évaluation et constitution du panel…", _state: state });
        /* v1.0.3 — plafond d'evaluation : selection persistee AVANT le premier appel LLM ; a la reprise, la MEME selection est imposee */
        let selection = null; try { selection = store.loadCheckpoint("professionals-selection.json"); } catch (e) { store.event({ level: "user", message: e.userMessage || e.message, code: e.code, _state: state }); throw e; }
        const onSelection = async (sel) => { const ref = store.saveCheckpoint("professionals-selection.json", sel); state.checkpoints = Object.assign({}, state.checkpoints || {}, { selection: ref }); store.write(state);
          store.event({ level: "user", actor: "machine", message: "Plafond d'évaluation : " + sel.selectedCount + " professionnel(s) retenu(s) sur " + sel.poolCount + " découvert(s) (" + (sel.capApplied ? "plafond " + sel.cap + " appliqué" : "sous le plafond") + "), sélection déterministe persistée avant tout appel payant.", checkpointRef: ref.contentHash, _state: state }); };
        const r = await SP.runPanel({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification, llm, log, selection, onSelection });
        /* ordre obligatoire : calcul -> validation -> ecriture atomique du checkpoint (hache) -> artefacts derives -> DONE */
        const ref = store.saveCheckpoint("checkpoint-professionals.json", r.checkpoint); cpPro = store.loadCheckpoint("checkpoint-professionals.json");
        store.saveJson("assessment.json", cpPro.assessment); store.saveJson("panel.json", cpPro.panel); store.saveJson("corpora-all.json", cpPro.corpusSetAll); store.saveJson("candidates-deduplication.json", cpPro.deduplication);
        state.checkpoints = Object.assign({}, state.checkpoints || {}, { professionals: ref }); state.seal = cpPro.seal; state.counters.openAlexCalls += cpPro.openAlexCalls;
        done("PROFESSIONALS", { panelCounts: r.panelCounts, stats: r.stats, checkpoint: ref.contentHash });
      }
      /* ===== TWINS_REVIEWS + QUALIFICATION : depuis le checkpoint professionnel (jamais de recalcul du panel) -> CHECKPOINT aval -> DONE ===== */
      let cpDown = null; try { cpDown = store.loadCheckpoint("checkpoint-downstream.json"); } catch (e) { store.event({ level: "user", message: e.userMessage || e.message, code: e.code, _state: state }); cpDown = null; }
      if (isDone("QUALIFICATION") && !cpDown) { state.stages.TWINS_REVIEWS.status = "PENDING"; state.stages.QUALIFICATION.status = "PENDING"; }
      if (!isDone("QUALIFICATION")) {
        setStage("TWINS_REVIEWS");
        const disc = store.loadJson("professionals-discovery.json");
        const selCp = store.loadJson("professionals-selection.json"); if (selCp && selCp.capApplied) upstreamReservations.push({ code: "PROFESSIONAL_EVALUATION_CAP", detail: "Plafond d'évaluation appliqué : " + selCp.selectedCount + " professionnels évalués sur " + selCp.poolCount + " découverts (sélection déterministe " + selCp.algorithm + ", hash " + selCp.selectionHash.slice(0, 16) + ") ; les autres n'ont pas été évalués." });
        const r = await SP.runDownstreamFromCheckpoint({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification,
          checkpoint: cpPro, targetDocuments: confirmation.executionMission.targetDocuments, llm, upstreamReservations, log });
        const ref = store.saveCheckpoint("checkpoint-downstream.json", r.checkpoint); cpDown = store.loadCheckpoint("checkpoint-downstream.json");
        store.saveJson("corpora-admitted.json", cpDown.corpusSet); store.saveJson("twins.json", cpDown.twinSet); store.saveJson("coverage.json", cpDown.coverageMatrix); store.saveJson("panel-selection.json", cpDown.panelSelection); store.saveJson("review-schema.json", cpDown.reviewSchema);
        store.saveJson("target-document-set.json", cpDown.targetDocumentSet); store.saveJson("reviews.json", cpDown.reviewSet); store.saveJson("normalization-records.json", cpDown.normalizationRecords); store.saveJson("enforcement-traces.json", cpDown.enforcementTraces);
        store.saveJson("aggregation.json", cpDown.aggregation); store.saveJson("qualification.json", Object.assign({ readinessPre: cpDown.readinessPre, readinessFull: cpDown.readinessFull }, cpDown.qualification));
        store.saveJson("mono10-run.json", { professionals: { mono10RunId: cpPro.mono10RunId, attestation: cpPro.attestation, capability: cpPro.capability, chains: cpPro.chains, registryEntries: cpPro.registryEntries, ledger: cpPro.ledgerExport, operatorConfig: cpPro.operatorConfig, stats: cpPro.stats, dimensionSetHash: cpPro.dimensionSet.dimensionSetHash },
          downstream: { mono10RunId: cpDown.mono10RunId, attestation: cpDown.attestation, capability: cpDown.capability, chains: cpDown.chains, registryEntries: cpDown.registryEntries, ledger: cpDown.ledgerExport, operatorConfig: cpDown.operatorConfig, evidenceArtifactsPersisted: cpDown.outputHashes.evidencePersisted } });
        state.checkpoints = Object.assign({}, state.checkpoints || {}, { downstream: ref });
        done("TWINS_REVIEWS", { twins: r.summary.twins, blocked: r.summary.blocked, reviews: r.summary.reviews }); setStage("QUALIFICATION"); done("QUALIFICATION", { qualificationStatus: r.summary.qualification });
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
      store.event({ level: "user", message: state.userMessage , _state: state });
      writeLineage(store, state);
      return store.publicState(state);
    } catch (e) { fail(store, state, e, llm, base); return store.publicState(state); }
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
  state.gate = null; state.status = "RUNNING"; store.write(state); store.event({ level: "user", actor: "user", message: "Plan confirmé par " + r.validation.validatedBy + ". Lancement de l'analyse automatique.", previousState: "WAITING_USER", nextState: "RUNNING", stage: "PLAN", _state: state });
  advance(runId); return { ok: true, validatedBy: r.validation.validatedBy, protocolHash: r.searchProtocol.protocolHash };
}

/** Porte 2 — acte utilisateur reel : ratification des sources (avec renversements eventuels). */
async function ratifySources(runId, input) {
  const store = RS.createRunStore(runId); const state = store.read();
  if (!state || !state.gate || state.gate.id !== RS.GATES.RATIFY_SOURCES) { const e = new Error("GATE_NOT_OPEN"); e.code = "GATE_NOT_OPEN"; e.userMessage = "Aucune ratification n'est attendue à ce stade."; throw e; }
  const who = String(input.ratifiedBy || "").trim(); if (who.length < 2) { const e = new Error("HUMAN_IDENTITY_REQUIRED"); e.code = "HUMAN_IDENTITY_REQUIRED"; e.userMessage = "Indiquez votre nom : la ratification est un acte humain réel."; throw e; }
  const overrides = {}; Object.keys(input.overrides || {}).forEach((k) => { if (["inclus", "exclu"].indexOf(input.overrides[k]) !== -1) overrides[k] = input.overrides[k]; });
  store.saveJson("sources-ratification.json", { ratifiedBy: who, overrides, recordedAt: now(), evidenceSha256: sha(JSON.stringify(store.loadJson("screening-evidence.json"))) });
  state.gate = null; state.status = "RUNNING"; store.write(state); store.event({ level: "user", actor: "user", message: "Sources ratifiées par " + who + " (" + Object.keys(overrides).length + " choix modifié(s)).", previousState: "WAITING_USER", nextState: "RUNNING", stage: "RETRIEVAL", _state: state });
  advance(runId); return { ok: true, ratifiedBy: who, overrides: Object.keys(overrides).length };
}

/** Vue de porte : ce que l'utilisateur doit lire avant d'agir. */
function gateView(runId) {
  const store = RS.createRunStore(runId); const state = store.read(); if (!state || !state.gate) return null;
  if (state.gate.id === RS.GATES.CONFIRM_PLAN) { const d = store.loadJson("disciplines.json"), p = store.loadJson("plan.json");
    return { gate: state.gate, reformulation: state.mission.reformulated, disciplines: d.disciplinesRetenues, plan: p.userView.requetes, documents: state.mission.documents }; }
  if (state.gate.id === RS.GATES.RATIFY_SOURCES) { const ev = store.loadJson("screening-evidence.json"), en = store.loadJson("sources-enriched.json"); const byId = new Map(en.enriched.map((s) => [s.sourceId, s]));
    return { gate: state.gate, summary: { sources: ev.sourcesCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length }, notADecision: ev.notADecision,
      proposals: ev.proposals.map((p) => Object.assign({ titre: (byId.get(p.sourceId) || {}).titre, annee: (byId.get(p.sourceId) || {}).annee, lieu: (byId.get(p.sourceId) || {}).lieu, doi: (byId.get(p.sourceId) || {}).doi, resume: ((byId.get(p.sourceId) || {}).resume || "").slice(0, 600) }, p))
        /* v1.0.2 : une source SANS proposition machine est presentee explicitement (proposed: null, decision par defaut « exclu » affichee), jamais omise ni source de TypeError */
        .concat(ev.failedSourceIds.map((id) => Object.assign({ titre: (byId.get(id) || {}).titre, annee: (byId.get(id) || {}).annee, lieu: (byId.get(id) || {}).lieu, doi: (byId.get(id) || {}).doi, resume: ((byId.get(id) || {}).resume || "").slice(0, 600) }, { sourceId: id, proposed: null, defaultDecision: "exclu", justification: "Aucune proposition machine (tri non abouti pour cette source) : exclue par prudence sauf décision explicite de votre part.", evidence: [], confiance: null }))),
      failedSourceIds: ev.failedSourceIds.map((id) => ({ sourceId: id, titre: (byId.get(id) || {}).titre })) }; }
  return { gate: state.gate };
}

/** Import d'un rapport JSON exporte (reimport) : run COMPLETED de type IMPORTED_REPORT, hash canonique verifie ; rien n'est recalcule. */
function importReport(report) {
  const v = SRP.verifyReportHash(report);
  if (report.schema !== "EvidenceForge.UserReport" || !v.valid) { const e = new Error("REPORT_IMPORT_INVALID"); e.code = "REPORT_IMPORT_INVALID"; e.userMessage = "Ce fichier n'est pas un rapport EvidenceForge intact (schéma ou hash canonique non vérifié)."; e.details = v; throw e; }
  const runId = "efm-report-" + String(report.reportHash).slice(0, 12); const store = RS.createRunStore(runId);
  const stages = {}; RS.STAGES.forEach((s) => { stages[s] = { status: "DONE", imported: true }; });
  const state = { schema: "EvidenceForge.MonolithRunState", schemaVersion: "MONOLITH-v1.0.1", runId, status: "COMPLETED", stage: "REPORT", stages, gate: null, createdAt: now(), completedAt: now(), kind: "IMPORTED_REPORT",
    importedFrom: { sourceRunId: report.runId, reportHash: report.reportHash, generatedAt: report.generatedAt, importedAt: now() }, mission: { question: report.question, documents: report.documents || [], reformulated: { missionReformulee: report.missionReformulee, perimetre: report.perimetre } },
    attempts: 0, counters: (report.pipeline && report.pipeline.llm) ? { llmReal: report.pipeline.llm.real, llmReused: report.pipeline.llm.reused, openAlexCalls: null } : null, seal: (report.integrity && report.integrity.seal) || null,
    summary: { PROCESS_QUALIFICATION: report.headline.PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE: report.headline.SCIENTIFICALLY_USABLE, counts: report.counts, reportHash: report.reportHash }, userMessage: "Rapport importé (lecture seule, hash vérifié). Les artefacts détaillés du run d'origine ne sont pas inclus dans un export JSON.", error: null };
  store.saveJson("report.json", report); store.write(state); store.event({ level: "user", message: state.userMessage , _state: state });
  return { runId, verified: v };
}

function writeLineage(store, state) {
  const files = fs.readdirSync(store.dir).filter((f) => f.endsWith(".json")).map((f) => ({ path: f, sha256: sha(fs.readFileSync(path.join(store.dir, f))) }));
  store.saveJson("lineage.json", { schema: "EvidenceForge.MonolithLineage", runId: state.runId, seal: state.seal, frozenLots: P.CONFIG.frozenLots, attempts: state.attempts, artifacts: files, generatedAt: now() });
}

module.exports = { startRun, advance, confirmPlan, ratifySources, gateView, importReport, RESUMABLE, isResumable };
