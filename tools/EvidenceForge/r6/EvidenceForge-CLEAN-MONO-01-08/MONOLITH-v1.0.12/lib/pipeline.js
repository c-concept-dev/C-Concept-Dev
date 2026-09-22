"use strict";
/**
 * EvidenceForge MONOLITH v1.0 — lib/pipeline.js
 * ORCHESTRATION reprenable, fail-closed : MISSION -> DISCIPLINES -> PLAN -> [porte CONFIRM_PLAN : acte utilisateur reel]
 *   -> RETRIEVAL -> [porte RATIFY_SOURCES : acte utilisateur reel] -> CORPUS -> PROFESSIONALS -> TWINS_REVIEWS -> QUALIFICATION -> REPORT.
 * Regles : l'etat sur disque est la seule verite ; une etape terminee n'est jamais rejouee ; un appel LLM reel n'est jamais
 * compte comme reutilisation (politique gelee MONO-11) ; toute indisponibilite fournisseur arrete proprement le run
 * (status STOPPED, reprenable) ; toute erreur de contrat arrete le run (status FAILED) ; rien n'est invente pour « finir ».
 * Aucun acte humain n'est simule : les deux portes attendent un clic reel, avec l'identite saisie par l'utilisateur.
 * v1.0.5 (additif) : LEDGER DE COUT par run (lib/cost-ledger.js) + BUDGET DUR (lib/budget-guard.js, verifie AVANT chaque appel reel,
 * BUDGET_LIMIT_REACHED = STOPPED reprenable) ; REVUE DE PORTEFEUILLE du corpus (lib/corpus-portfolio-review.js, notADecision) entre la
 * preuve de screening et la Porte 2 ; ECONOMIE DU PANEL (lib/professionals-economics.js) au rapport. Aucun lot gele touche.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const P = require("./paths.js");
const RS = require("./run-store.js");
const { createLlm } = require("./llm.js");
const SM = require("./stage-mission.js"), S1 = require("./stage-ef01.js"), SR = require("./stage-retrieval.js"), SP = require("./stage-professionals.js"), SRP = require("./stage-report.js");
const RSTOP = require("./run-stop.js");
const DC = require("./document-chunker.js");
const EP = require("./economic-panel.js");
const LIVE = require("./live-status.js");
const EF3 = require("./ef03b-resilience.js");   /* v1.0.10 : EF-03B REVIEW RESILIENCE — adaptateur additif autour de llmCall remis a l'aval gele (stage-professionals inchange) */   /* v1.0.8 : observabilite live durable (live-status.json + state.updatedAt/counters) pendant les appels fournisseur */   /* v1.0.7 : economic panel (SUFFICIENCY_FIRST), fanout des revues, projection, gate economique */   /* v1.0.6 AUTO-CHUNK UPLOAD : metadonnees de segments persistees, verifiees a chaque chargement */
const CL = require("./cost-ledger.js"), BG = require("./budget-guard.js"), CPR = require("./corpus-portfolio-review.js"), PE = require("./professionals-economics.js"), CV = require("./cost-view.js"); const CF = require("./cost-forecast.js");   /* v1.0.7 : reference historique pour les estimations de lot */
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const now = () => new Date().toISOString();
/* reprenables : indisponibilites fournisseur ET sorties fournisseur invalides (un nouvel appel reel peut reussir) ; jamais une erreur de contrat */
/* LEDGER_DUPLICATE_OR_INVALID : cause connue (doublons de candidats MONO-09 sur plusieurs disciplines), corrigee en v1.0.1 par
   deduplication a la reprise (dedupeDiscovery) ; la reprise rejoue l'etape PROFESSIONALS sur un nouveau run MONO-10 */
const RESUMABLE = ["STOPPED_BY_USER", "PANEL_INCOMPLETE_BUDGET_LIMIT", "PROVIDER_STREAM_INTERRUPTED", "INTERRUPTED_BY_RESTART", "LEDGER_DUPLICATE_OR_INVALID", "AGGREGATION_CLASSIFICATION_ERROR", "CHECKPOINT_CORRUPT", "PROVIDER_CREDIT_EXHAUSTED", "PROVIDER_RATE_LIMITED", "NETWORK_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "LLM_UNAVAILABLE", "PROVIDER_EMPTY_RESPONSE",
  "LLM_PROVIDER_UNAVAILABLE", "LLM_RESPONSE_INVALID", "LLM_OUTPUT_SCHEMA_INVALID", "REFORMULATION_INVALID", "PLANNER_OUTPUT_INVALID", "RESOLVER_OUTPUT_INVALID",
  "BUDGET_LIMIT_REACHED", "PRICING_UNKNOWN_FOR_MODEL",
  "PROVIDER_PLACEHOLDER", "PROVIDER_URL_INVALID", "PROVIDER_DNS_ERROR", "PROVIDER_CONNECTION_REFUSED", "PROVIDER_TLS_ERROR", "PROVIDER_AUTH_ERROR", "PROVIDER_ROUTE_NOT_FOUND", "PROVIDER_CAPACITY", "PROVIDER_BAD_RESPONSE", "REVIEWS_REPLAY_REQUESTED"];   /* v1.0.5 : pannes de configuration/transport distinguees, toutes reprenables une fois corrigees */   /* v1.0.5 : plafond de depense atteint / tarif inconnu = arret propre AVANT l'appel, reprenable apres decision humaine (budget) */
const isResumable = (state) => state && (state.status === "STOPPED" || (state.status === "FAILED" && state.error && RESUMABLE.indexOf(state.error.code) !== -1));
const running = new Map();   // runId -> Promise (un seul moteur par run)

/** v1.0.5 — ledger de cout + garde de budget d'un run (artefacts a cote de state.json, jamais dans un checkpoint hache). */
function costFor(store, state) {
  const ledger = CL.createCostLedger({ runDir: store.dir, runId: store.runId, onRecord: (line, totals) => { store.event({ level: "tech", actor: "machine", event: "cost_update", kind: line.kind, purpose: line.purpose, stage: line.stage, callUsd: line.cost ? line.cost.totalUsd : null, priced: line.priced, totalUsd: totals.totalUsd, realCalls: totals.calls.real, reusedCalls: totals.calls.reuse, _state: state }); } });
  const budget = BG.createBudgetGuard({ runDir: store.dir, runId: store.runId, ledger, onEvent: (ev) => {
    if (ev.type === "budget_warning") store.event({ level: "user", actor: "machine", event: "budget_warning", code: "BUDGET_WARNING", message: "Alerte budget : " + ev.spentUsd.toFixed(2) + " USD dépensés, seuil d'alerte " + ev.warningThresholdUsd.toFixed(2) + " USD" + (ev.costBudgetUsd !== null ? " (plafond " + ev.costBudgetUsd.toFixed(2) + " USD)" : "") + ". Le run continue ; vous pouvez le laisser aller, ajuster le budget ou l'arrêter.", _state: state });
    if (ev.type === "budget_limit") store.event({ level: "user", actor: "machine", event: "budget_limit", code: "BUDGET_LIMIT_REACHED", message: "Plafond de dépense atteint (" + ev.spentUsd.toFixed(2) + " / " + ev.costBudgetUsd.toFixed(2) + " USD) : aucun nouvel appel payant n'est lancé.", _state: state });
    if (ev.type === "budget_set") store.event({ level: "user", actor: "user", event: "budget_set", message: "Budget du run : plafond " + (ev.budget.costBudgetUsd === null ? "aucun" : ev.budget.costBudgetUsd.toFixed(2) + " USD") + ", alerte " + (ev.budget.warningThresholdUsd === null ? "aucune" : ev.budget.warningThresholdUsd.toFixed(2) + " USD") + ".", _state: state }); } });
  ledger.attachBudget(budget);
  return { ledger, budget };
}

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
  if (typeof input.assertProviderReady === "function") await input.assertProviderReady();   /* v1.0.5 : fournisseur pret (sonde gratuite) avant de creer le moindre artefact */
  const runId = RS.newRunId(); const store = RS.createRunStore(runId);
  const docsDir = path.join(store.dir, "documents"); fs.mkdirSync(docsDir, { recursive: true });
  intake.documents.forEach((d) => fs.writeFileSync(path.join(docsDir, d.documentId + ".txt"), Buffer.from(d.contentBase64, "base64")));
  /* v1.0.6 — segments : metadonnees (bornes, hashes, ordre, total) persistees SANS le texte (il se rederive du fichier source) ; jamais un document par segment */
  store.saveJson("documents-chunks.json", { schema: "EvidenceForge.DocumentChunks", schemaVersion: "MONOLITH-v1.0.6", maxChunkChars: SM.chunkOptions().maxChunkChars, strategy: DC.STRATEGY, documentCount: intake.documents.length, chunkCount: intake.documents.reduce((n, d) => n + d.chunking.totalChunks, 0), documents: intake.documents.map((d) => DC.chunkMetadata(d.chunked)) });
  const state = makeState(runId, q, intake.documents.map((d) => ({ documentId: d.documentId, name: d.name, bytes: d.bytes, sha256: d.sha256, chunking: d.chunking })));
  state.documentsRejected = intake.rejected;
  /* RUN SAFETY — budget EXPLICITE a la creation : mode LIMITED (plafond > 0) ou UNLIMITED_CONFIRMED (confirmation explicite) ; budget.json est
     ecrit AVANT state.json, donc avant tout appel ; un champ vide n'est jamais transforme en « sans plafond » ; l'absence de budget.json devient une anomalie */
  const bm = BG.normalizeBudgetMode(input.budget);   /* leve BUDGET_REQUIRED / BUDGET_INVALID */
  const budgetSet = costFor(store, state).budget.set(bm, "user", { mode: bm.mode, confirmedUnlimited: bm.confirmedUnlimited });
  store.write(state); store.event({ level: "user", message: "Run créé. " + intake.documents.length + " document(s) accepté(s)" + (intake.rejected.length ? ", " + intake.rejected.length + " refusé(s)." : ".") , _state: state });
  return { runId, documents: state.mission.documents, rejected: intake.rejected, budget: { mode: budgetSet.mode, confirmedUnlimited: budgetSet.confirmedUnlimited === true, costBudgetUsd: budgetSet.costBudgetUsd, warningThresholdUsd: budgetSet.warningThresholdUsd } };   /* v1.0.5 : ce qui est REELLEMENT enregistre */
}

function loadDocuments(store, state) {
  /* v1.0.6 — si le run porte des metadonnees de segments, chaque document est re-decoupe (deterministe) et confronte a ce qui a ete
     enregistre : nombre annonce != nombre present => INPUT_DOCUMENT_CHUNK_MISSING ; texte/hash d'un segment different => INPUT_DOCUMENT_TRUNCATED ;
     trou/doublon/bornes => DOCUMENT_INCOMPLETE. Aucune erreur n'est degradee en avertissement. Les anciens runs (sans fichier) restent lus tels quels. */
  const meta = store.loadJson("documents-chunks.json"); const byId = {}; ((meta && meta.documents) || []).forEach((m) => { byId[m.sourceDocumentId] = m; });
  return (state.mission.documents || []).map(function (d) { const bytes = fs.readFileSync(path.join(store.dir, "documents", d.documentId + ".txt")); if (sha(bytes) !== d.sha256) throw Object.assign(new Error("DOCUMENT_HASH_MISMATCH: " + d.name), { code: "DOCUMENT_HASH_MISMATCH" });
    const doc = Object.assign({}, d, { content: bytes.toString("utf8"), contentBase64: bytes.toString("base64") });
    if (meta) { const recorded = byId[d.documentId]; const chunked = SM.chunkedView(doc);
      if (!recorded) throw Object.assign(new Error(DC.STATUS.CHUNK_MISSING + ": aucun segment enregistre pour " + d.name), { code: DC.STATUS.CHUNK_MISSING, userMessage: "Le document « " + d.name + " » n'a pas de segments enregistres : le run ne peut pas garantir une lecture complete." });
      const merged = Object.assign({}, recorded, { chunks: recorded.chunks.map((m) => { const c = chunked.chunks.find((x) => x.sequence === m.sequence); return Object.assign({}, m, { text: c ? c.text : undefined }); }) });
      if (recorded.totalChunks !== chunked.totalChunks) throw Object.assign(new Error(DC.STATUS.CHUNK_MISSING + ": " + d.name + " annonce " + recorded.totalChunks + " segment(s), " + chunked.totalChunks + " rederive(s)"), { code: DC.STATUS.CHUNK_MISSING, userMessage: "Le document « " + d.name + " » n'a plus le nombre de segments enregistre à sa création." });
      const v = DC.verifyChunkedDocument(merged, doc.content);
      if (!v.ok) throw Object.assign(new Error(v.status + ": " + d.name + " — " + v.errors.slice(0, 2).join(" ; ")), { code: v.status, userMessage: "Le document « " + d.name + " » ne peut pas être lu intégralement (" + v.status + ") : le run est arrêté plutôt que de travailler sur un texte incomplet." });
      doc.chunked = chunked; doc.chunking = d.chunking || { sourceCharacterLength: chunked.sourceCharacterLength, totalChunks: chunked.totalChunks, maxChunkChars: chunked.maxChunkChars, ingestionStatus: chunked.ingestionStatus, sourceTextSha256: chunked.sourceTextSha256 }; }
    return doc; });
}

function fail(store, state, e, llm, base, cost) {
  if (llm && base) { const c = llm.counts(); state.counters.llmReal = base.real + c.real; state.counters.llmReused = base.reused + c.reused; }   /* compteurs exacts meme en cas d'echec */
  const code = e.code || "UNEXPECTED_ERROR"; const resumable = RESUMABLE.indexOf(code) !== -1; const userStop = code === RSTOP.STOP_CODE;
  state.status = resumable ? "STOPPED" : "FAILED"; state.error = { code, message: String(e.message).slice(0, 2000), userMessage: e.userMessage || null, at: now(), stage: state.stage, resumable, details: e.details || null };
  state.userMessage = e.userMessage || (resumable ? "Le run est arrêté proprement ; il pourra reprendre." : "Le run s'est arrêté sur une erreur de contrat : aucun résultat partiel n'est présenté comme un résultat.");
  if (state.stages[state.stage] && state.stages[state.stage].status === "RUNNING") state.stages[state.stage].status = resumable ? "INTERRUPTED" : "FAILED";   /* une etape DONE n'est jamais degradee par un echec ulterieur (ex. preflight) */
  /* RUN SAFETY — arret utilisateur : cause distincte (USER_STOP), demande honoree, etat partiel persiste (jamais un checkpoint, jamais un verdict) */
  if (userStop) { try { const req = RSTOP.honor(store.dir, { honoredStage: state.stage }); const t = cost ? cost.ledger.totals() : null; const b = cost ? cost.budget.read() : null;
      const partial = []; if (e.panelPartialState) partial.push({ file: "professionals-sufficiency-partial.json", kind: "EvidenceForge.PanelSufficiencyPartialState" }); ["professionals-selection.json", "screening-evidence.json", "corpus-portfolio-review.json", "checkpoint-professionals.json"].forEach((f) => { if (fs.existsSync(path.join(store.dir, f))) partial.push({ file: f }); });
      const lastEntry = cost ? CL.readEntries(store.dir).filter((l) => l.kind === "REAL_CALL" || l.kind === "KIT_CALL").pop() || null : null;
      const ss = RSTOP.buildStopState({ runId: state.runId, state, ledgerTotals: t, lastEntry, budget: b, request: req, partialArtifacts: partial, checkpointRef: state.checkpoints || null }); store.saveJson(RSTOP.STATE_FILE, ss); state.stop = { requestedAt: req ? req.requestedAt : null, actor: req ? req.actor : null, honoredAt: req ? req.honoredAt : null, stateFile: RSTOP.STATE_FILE }; } catch (x) { /* la tracabilite n'ajoute jamais une panne */ } }
  store.write(state); store.event({ level: "user", actor: userStop ? "user" : "system", event: userStop ? "run_stopped_by_user" : undefined, message: state.userMessage, code, normalizedCause: userStop ? "USER_STOP" : (e.transportFailure ? "TRANSPORT_FAILURE" : (resumable ? "PROVIDER_OR_TRANSIENT" : "CONTRACT")), resumable, previousState: "RUNNING", nextState: state.status, _state: state }); store.event({ level: "tech", actor: "system", message: e.stack ? String(e.stack).slice(0, 4000) : String(e.message), code, details: e.details || null, _state: state });
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
    const attemptRunId = runId + "-a" + state.attempts;
    /* v1.0.5 : ledger + garde de budget de ce run, actives dans le registre (sonde MONO-10 : transport non injecte) ; etape courante posee pour l'attribution */
    const cost = costFor(store, state); cost.ledger.setAttempt(state.attempts); cost.ledger.setStage(state.stage); cost.ledger.activate([runId, attemptRunId]);
    /* RUN SAFETY — advance() n'est appele que par un acte utilisateur (creation, porte, reprise) : une demande d'arret en attente est consommee ici, jamais ailleurs */
    const pendingStop = RSTOP.pending(store.dir); if (pendingStop) { RSTOP.consume(store.dir, "user-resume"); store.event({ level: "user", actor: "user", event: "run_resumed_after_user_stop", message: "Reprise explicite après un arrêt à votre demande (" + pendingStop.requestedAt + ") : les résultats déjà produits sont réutilisés.", _state: state }); }
    const stopCheck = () => RSTOP.pending(store.dir);
    /* v1.0.8 — observabilite live : le traceur LLM, les evenements de flux et les validations alimentent live-status.json + state (heartbeat borne) */
    let live = null;
    const llm = createLlm({ runDir: store.dir, runId, sealHash, ledger: cost.ledger, budget: cost.budget, stopCheck, onTrace: (e) => { store.event(Object.assign({ level: "tech", actor: "machine", _state: state }, e)); if (live) live.onTrace(e); }, onStream: (e) => { if (live) live.onStream(e); } });
    const base = { real: (state.counters && state.counters.llmReal) || 0, reused: (state.counters && state.counters.llmReused) || 0 };   // compteurs CUMULES sur les tentatives
    live = LIVE.createLiveStatus({ store, state, llm, baseCounters: base, heartbeatMs: (P.CONFIG.observability && P.CONFIG.observability.heartbeatMs) || 10000, minWriteMs: (P.CONFIG.observability && P.CONFIG.observability.minWriteMs) || 5000 });
    { const ov = llm.onValidation; llm.onValidation = (v) => { ov(v); try { live.onValidation(v); } catch (x) { /* observabilite */ } }; }
    state.counters = Object.assign({ llmReal: 0, llmReused: 0, openAlexCalls: 0, kitRealCalls: 0 }, state.counters || {});
    const log = (e) => { store.event(Object.assign({ level: "tech", actor: "machine", _state: state }, e)); if (live) { try { live.onTrace(e); } catch (x) { /* observabilite */ } } };
    const setStage = (s, msg) => { const sr = stopCheck(); if (sr) throw RSTOP.stopError(sr);   /* RUN SAFETY : jamais une transition vers une etape (payante) apres une demande d'arret */
      const prev = state.stages[s].status; state.stage = s; cost.ledger.setStage(s); state.stages[s].status = "RUNNING"; state.stages[s].startedAt = state.stages[s].startedAt || now(); store.write(state); store.event({ level: "user", actor: "machine", message: RS.STAGE_LABELS[s] + (msg ? " — " + msg : "") + "…", stage: s, previousState: prev, nextState: "RUNNING", _state: state }); };
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
      if (!isDone("DISCIPLINES")) { setStage("DISCIPLINES"); const r = await S1.runDisciplines({ runDir: store.dir, runId, missionId, missionQuestion, documents, cost, onAttempt: kitAttempt("résolveur") }); store.saveJson("disciplines.json", r); done("DISCIPLINES", { retenues: r.disciplinesRetenues.length, attempt: r.attemptNo }); }
      const disciplines = store.loadJson("disciplines.json");
      if (!isDone("PLAN")) { setStage("PLAN"); const r = await S1.runPlanner({ runDir: store.dir, runId, missionId, missionQuestion, runContract: disciplines.runContract, resolverOutputHash: disciplines.resolver.resolverOutputHash, cost, onAttempt: kitAttempt("planificateur") }); store.saveJson("plan.json", r); done("PLAN", { attempt: r.attemptNo }); }
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
        const ev = await SR.buildScreeningEvidence({ llm, mission: missionQuestion, dimensions: dims, sources: en.enriched, batchSize: P.CONFIG.screening.batchSize, maxPasses: P.CONFIG.screening.maxPasses || 3, evidenceFields: P.CONFIG.screening.evidenceFields, retryStrategy: P.CONFIG.screening.retryStrategy, outputBounds: P.CONFIG.screening.outputBounds });
        store.saveJson("screening-evidence.json", ev); state.counters.openAlexCalls += r.networkCalls.length + en.networkCalls.length;
        /* v1.0.5 — REVUE DE PORTEFEUILLE (additive, notADecision) : signaux de niveau corpus pour la lecture humaine avant la Porte 2 ;
           la partie deterministe est toujours produite, la partie LLM declare son indisponibilite ; une panne de transport (verrou) arrete le run comme ailleurs */
        store.event({ level: "user", message: "Revue d'ensemble du corpus proposé (redondances, couverture des angles, méthodes hors domaine)…", _state: state });
        const initialReview = await CPR.buildCorpusPortfolioReview({ llm, mission: missionQuestion, dimensions: dims, sources: en.enriched, evidence: ev, config: P.CONFIG.portfolio || {} });
        const balanced = require("./portfolio-balancing.js").balancePortfolio({ sources: en.enriched, dimensions: dims, evidence: ev, review: initialReview, config: (P.CONFIG.portfolio || {}).balancing || {} });
        const review = balanced.review;
        store.saveJson("screening-primary.json", ev);
        store.saveJson("screening-evidence.json", balanced.evidence);
        store.saveJson("corpus-portfolio-review.json", review);
        store.event({ level: "user", message: "Rééquilibrage proposé : " + review.balancing.adjustments.length + " ajustement(s), " + review.possibleUndercoverage.length + " angle(s) non résolu(s). Aucun appel LLM supplémentaire.", _state: state });
        SP.assertNoTransportFailure(llm, "Revue d'ensemble du corpus");
        if (!r.snapshot.sourceCount) { const e = new Error("NO_SOURCE_RETRIEVED"); e.code = "NO_SOURCE_RETRIEVED"; e.userMessage = "Aucune publication n'a été trouvée pour ce plan de recherche. Le run s'arrête (rien n'est inventé). Reformulez votre demande."; throw e; }
        done("RETRIEVAL", { sources: r.snapshot.sourceCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length, portfolioWarnings: review.warnings.length, portfolioLlmStatus: review.llmStatus });
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
        /* v1.0.5 — suffisance du panel (early-stop deterministe) : transitions annoncees a l'utilisateur, decision persistee a part et dans le checkpoint */
        const onSufficiency = (d) => store.event({ level: "user", actor: "machine", event: "panel_sufficiency", code: d.state, panel: d.panel, message: d.state === "EARLY_STOP_CONFIRMED" ? "Panel suffisant après " + d.evaluated + " évaluation(s) (politique " + d.rule + ") : " + d.statement : d.state === "EARLY_STOP_CANDIDATE" ? "Plateau observé après " + d.evaluated + " évaluation(s) : " + d.statement : "Plateau informatif terminé : l'évaluation continue, le panel n'étant pas encore suffisant (" + d.statement + ")", _state: state });
        /* v1.0.7 — entrees economiques du controleur de lots : budget du run (lecture), depense reelle (ledger), cout par candidat deja mesure dans ce run, reference historique */
        const economic = { budget: (() => { try { return cost.budget.read(); } catch (x) { return null; } })(), spentUsd: () => cost.ledger.totals().totalUsd, perCandidateUsd: () => { try { const pr = CV.progressOf(store, store.read() || state, CL.readEntries(store.dir)); return pr.professionals ? pr.professionals.perCandidateUsd : []; } catch (x) { return []; } }, historyPerCandidateUsd: (() => { try { const h = CF.buildHistoryReference(CV.historyRuns(runId)); return h.perUnit && h.perUnit.professionalUsd || null; } catch (x) { return null; } })() };
        let r; try { r = await SP.runPanel({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification, llm, log, selection, onSelection, onSufficiency, economic });
        } catch (e) {
          /* v1.0.5 — etat partiel persiste sur arret (plafond budget, panne, invariant) : artefact a part, jamais un checkpoint, jamais un verdict */
          if (e && e.panelPartialState) { try { const t = cost.ledger.totals(); const partial = Object.assign({}, e.panelPartialState, { at: now(), cost: { totalUsd: t.totalUsd, professionalsUsd: (t.byStage && t.byStage.PROFESSIONALS && t.byStage.PROFESSIONALS.totalUsd) || null, realCalls: t.calls.real, currency: t.currency || "USD" }, budget: (() => { try { return cost.budget.read(); } catch (x) { return null; } })() });
              store.saveJson("professionals-sufficiency-partial.json", partial); store.event({ level: "user", actor: "machine", event: "panel_partial_state", code: partial.reason, panel: partial.scientificPanelState, message: "État du panel au moment de l'arrêt persisté (" + partial.evaluated + " évaluation(s), " + partial.approved + " approuvé(s), " + partial.scientificPanelState + ") : état partiel, ni verdict ni preuve de suffisance.", _state: state }); } catch (x) { /* la tracabilite n'ajoute jamais une panne */ } }
          throw e; }
        if (r.sufficiencyRecord) store.saveJson("professionals-sufficiency.json", r.sufficiencyRecord);
        if (r.economicRecord) { store.saveJson("professionals-economic-panel.json", r.economicRecord); store.event({ level: "user", actor: "machine", event: "economic_panel", code: r.economicRecord.economicState, panel: r.economicRecord.scientificPanelState, message: "Panel par lots (" + EP.POLICY_ID + ") : panel initial " + r.economicRecord.initialPanelSize + ", " + r.economicRecord.batches.length + " lot(s) clos, " + r.economicRecord.evaluated + " évalué(s), " + r.economicRecord.approved + " approuvé(s) — " + r.economicRecord.statement, _state: state }); }
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
        /* ===== v1.0.7 — REVIEW FANOUT CONTROL + PROJECTION AVANT LA PREMIERE REVUE + GATE ECONOMIQUE (humain, jamais scientifique) ===== */
        const ecoCfg = EP.normalizeEconomicPolicy(P.CONFIG.professionals && P.CONFIG.professionals.economic);
        let reviewTargets = store.loadJson("review-targets.json");
        if (!reviewTargets) { const rt = EP.buildReviewTargets({ documents: confirmation.executionMission.targetDocuments, mode: ecoCfg.reviewTargetMode, dossierMaxChars: ecoCfg.dossierMaxChars, policy: ecoCfg });
          reviewTargets = { schema: "EvidenceForge.ReviewTargets", schemaVersion: "MONOLITH-v1.0.7", mode: rt.mode, fallbackReason: rt.fallbackReason, sourceDocumentCount: rt.sourceDocumentCount, reviewsPerTwin: rt.reviewsPerTwin, characters: rt.characters, targets: rt.targets.map((t) => ({ documentId: t.documentId, title: t.title, hashSha256: t.hashSha256, characters: t.content.length, sourceDocuments: t.sourceDocuments })), _content: rt.targets.map((t) => t.content) };
          const persisted = Object.assign({}, reviewTargets); delete persisted._content; store.saveJson("review-targets.json", persisted); if (rt.fallbackReason) store.event({ level: "user", actor: "machine", code: "REVIEW_TARGET_FALLBACK", message: rt.fallbackReason, _state: state }); }
        const targetDocs = reviewTargets._content ? reviewTargets.targets.map((t, i) => ({ documentId: t.documentId, title: t.title, content: reviewTargets._content[i], hashSha256: t.hashSha256 })) : (function () { const rt = EP.buildReviewTargets({ documents: confirmation.executionMission.targetDocuments, mode: reviewTargets.mode, dossierMaxChars: Number.MAX_SAFE_INTEGER, policy: ecoCfg }); return rt.targets.map((t) => ({ documentId: t.documentId, title: t.title, content: t.content, hashSha256: t.hashSha256 })); })();
        targetDocs.forEach((t, i) => { if (reviewTargets.targets[i] && reviewTargets.targets[i].hashSha256 !== t.hashSha256) throw Object.assign(new Error("REVIEW_TARGET_HASH_MISMATCH: " + t.title), { code: "REVIEW_TARGET_HASH_MISMATCH", userMessage: "Les cibles de revue persistées ne correspondent plus aux documents du run : reprise refusée." }); });
        const projection = buildDownstreamProjection(store, state, cpPro, reviewTargets, ecoCfg); store.saveJson("economic-projection.json", projection);
        const decision = store.loadJson("economic-review-decision.json");
        if (projection.ECONOMIC_REVIEW_REQUIRED && !(decision && decision.confirmed)) {
          state.status = "WAITING_USER"; state.gate = { id: RS.GATES.ECONOMIC_REVIEW, since: now(), userMessage: "Projection de coût avant les revues : " + (projection.CENTRAL_COST != null ? projection.CENTRAL_COST.toFixed(2) + " USD (central)" : "au moins " + projection.LOW_COST.toFixed(2) + " USD") + " pour " + projection.EXPECTED_REVIEWS + " revue(s) par " + projection.EXPECTED_TWINS + " jumeau(x) potentiel(s). Ce seuil (" + projection.thresholdUsd + " USD) demande votre confirmation explicite avant de lancer les revues. Ce n'est pas un blocage scientifique." };
          store.write(state); store.event({ level: "user", actor: "machine", event: "economic_review_required", code: EP.CODES.REVIEW_REQUIRED, message: "Revue économique requise avant les jumeaux : projection " + (projection.CENTRAL_COST != null ? projection.CENTRAL_COST.toFixed(2) : "≥ " + projection.LOW_COST.toFixed(2)) + " USD > seuil " + projection.thresholdUsd + " USD (" + (projection.mainCostDriver || "cause non projetable") + "). Confirmation humaine attendue.", previousState: "RUNNING", nextState: "WAITING_USER", _state: state }); return; }
        setStage("TWINS_REVIEWS");
        const disc = store.loadJson("professionals-discovery.json");
        const selCp = store.loadJson("professionals-selection.json"); if (selCp && selCp.capApplied) upstreamReservations.push({ code: "PROFESSIONAL_EVALUATION_CAP", detail: "Plafond d'évaluation appliqué : " + selCp.selectedCount + " professionnels évalués sur " + selCp.poolCount + " découverts (sélection déterministe " + selCp.algorithm + ", hash " + selCp.selectionHash.slice(0, 16) + ") ; les autres n'ont pas été évalués." });
        /* v1.0.5 — early-stop par suffisance : reserve explicite quand des candidats selectionnes n'ont pas ete evalues */
        if (cpPro.sufficiency && cpPro.sufficiency.skipped > 0) upstreamReservations.push({ code: "PROFESSIONAL_EVALUATION_EARLY_STOP", detail: "Arrêt anticipé de l'évaluation selon la politique produit " + cpPro.sufficiency.rule + " (état " + cpPro.sufficiency.state + ", panel " + cpPro.sufficiency.panel + ") : " + cpPro.sufficiency.evaluated + " professionnel(s) évalué(s), " + cpPro.sufficiency.skipped + " non évalué(s) car leur angle était suffisamment représenté (" + (cpPro.sufficiency.policy && cpPro.sufficiency.policy.minimumAdmissibleRepresentativesPerDimension) + " approuvés dont " + (cpPro.sufficiency.policy && cpPro.sufficiency.policy.minimumIndependentRepresentativesPerDimension) + " indépendants) ou le panel jugé suffisant — règle opérationnelle, pas une preuve de complétude (" + cpPro.sufficiency.reasons.join(" ; ") + ")." });
        /* v1.0.5 (v2) — vivier epuise sans representation suffisante : reserve explicite, distincte de la suffisance */
        if (cpPro.sufficiency && cpPro.sufficiency.panel === "PANEL_EXHAUSTED_WITH_GAPS") upstreamReservations.push({ code: "PROFESSIONAL_POOL_EXHAUSTED_WITH_GAPS", detail: "Vivier de professionnels épuisé sans représentation suffisante pour " + cpPro.sufficiency.coverage.gaps.length + " angle(s) : " + cpPro.sufficiency.coverage.gaps.join(", ") + " (" + cpPro.sufficiency.reasons.join(" ; ") + ")." });
        if (live) live.note({ reviewTargetMode: reviewTargets.mode, targetsTotal: reviewTargets.targets.length, targetId: reviewTargets.targets.length === 1 ? "target-01" : null, logicalReviewsExpected: null }, true);
        /* v1.0.10 — EF-03B REVIEW RESILIENCE : l'aval gele recoit un llm dont llmCall / onValidation passent par l'adaptateur (registre des revues VALID, budget de sortie,
           troncature => completion ciblee, litteralisation sur extraits) ; le lot gele valide et accepte seul. Transport, verrou, compteurs : ceux du llm reel (delegues). */
        let twinsBuilt = null; const logDown = (e) => { if (e && e.event === "twins_built" && typeof e.built === "number") twinsBuilt = e.built; return log(e); };
        const adapter = EF3.createReviewAdapter({ llm, runDir: store.dir, runId, attemptId: state.attempts, sealHash, config: { maxTokens: P.CONFIG.llm.reviewMaxTokens }, onTrace: logDown, twinsTotal: () => twinsBuilt });
        const llmDown = Object.assign({}, llm, { llmCall: adapter.llmCall, onValidation: adapter.onValidation });
        const r = await SP.runDownstreamFromCheckpoint({ runDir: store.dir, runId, attemptId: state.attempts, attemptRunId, missionId, missionHash: state.mission.questionSha256, missionQuestion, runContract: disciplines.runContract, corpusSnapshot, discovery: disc.discovery, verification: disc.verification,
          checkpoint: cpPro, targetDocuments: targetDocs, llm: llmDown, upstreamReservations, log: logDown });   /* v1.0.7 : cibles = dossier de mission (ou par document, explicite) */
        const ef03b = adapter.stats(); r.summary.ef03b = ef03b; store.saveJson("ef03b-resilience.json", Object.assign({ schema: "EvidenceForge.EF03BResilienceSummary", schemaVersion: "MONOLITH-v1.0.12", attemptId: state.attempts }, ef03b));   /* v1.0.10 : reuse registre / troncatures / completions / litteralisations / cout cumule des revues */
        const ref = store.saveCheckpoint("checkpoint-downstream.json", r.checkpoint); cpDown = store.loadCheckpoint("checkpoint-downstream.json"); log({ event: "checkpoint_saved", checkpoint: "downstream", contentHash: ref.contentHash });
        store.saveJson("corpora-admitted.json", cpDown.corpusSet); store.saveJson("twins.json", cpDown.twinSet); store.saveJson("coverage.json", cpDown.coverageMatrix); store.saveJson("panel-selection.json", cpDown.panelSelection); store.saveJson("review-schema.json", cpDown.reviewSchema);
        store.saveJson("target-document-set.json", cpDown.targetDocumentSet); store.saveJson("reviews.json", cpDown.reviewSet); store.saveJson("normalization-records.json", cpDown.normalizationRecords); store.saveJson("enforcement-traces.json", cpDown.enforcementTraces);
        store.saveJson("aggregation.json", cpDown.aggregation); store.saveJson("qualification.json", Object.assign({ readinessPre: cpDown.readinessPre, readinessFull: cpDown.readinessFull }, cpDown.qualification));
        store.saveJson("mono10-run.json", { professionals: { mono10RunId: cpPro.mono10RunId, attestation: cpPro.attestation, capability: cpPro.capability, chains: cpPro.chains, registryEntries: cpPro.registryEntries, ledger: cpPro.ledgerExport, operatorConfig: cpPro.operatorConfig, stats: cpPro.stats, dimensionSetHash: cpPro.dimensionSet.dimensionSetHash },
          downstream: { mono10RunId: cpDown.mono10RunId, attestation: cpDown.attestation, capability: cpDown.capability, chains: cpDown.chains, registryEntries: cpDown.registryEntries, ledger: cpDown.ledgerExport, operatorConfig: cpDown.operatorConfig, evidenceArtifactsPersisted: cpDown.outputHashes.evidencePersisted } });
        state.checkpoints = Object.assign({}, state.checkpoints || {}, { downstream: ref });
        /* v1.0.7 — compteurs distincts (jamais confondus) et contribution marginale post-revue (descriptive) */
        try { const units = EP.countReviewUnits(cpDown.reviewSet); const twinsOrder = (cpDown.twinSet.twins || []).map((t) => t.twinId); const rmc = EP.reviewMarginalContribution({ twinsOrder, reviewSet: cpDown.reviewSet, aggregation: cpDown.aggregation }); store.saveJson("review-units.json", Object.assign({ schema: "EvidenceForge.ReviewUnits", schemaVersion: "MONOLITH-v1.0.7", reviewTargetMode: reviewTargets.mode }, units, { marginal: rmc })); r.summary.reviewUnits = units; } catch (x) { /* mesure descriptive : jamais une panne */ }
        done("TWINS_REVIEWS", { twins: r.summary.twins, blocked: r.summary.blocked, reviews: r.summary.reviews, reviewUnits: r.summary.reviewUnits || null, reviewTargetMode: reviewTargets.mode }); setStage("QUALIFICATION"); done("QUALIFICATION", { qualificationStatus: r.summary.qualification });
      }
      if (!isDone("REPORT")) {
        setStage("REPORT");
        const q = store.loadJson("qualification.json"), rev = store.loadJson("reviews.json"), rm = store.loadJson("retrieval-meta.json"), cm = store.loadJson("corpus-meta.json");
        const report = SRP.buildUserReport({ state, reformulation: state.mission.reformulated, runContract: disciplines.runContract, corpusSnapshot, discovery: store.loadJson("professionals-discovery.json").discovery, panel: store.loadJson("panel.json"), twinSet: store.loadJson("twins.json"), reviewSet: rev,
          aggregation: store.loadJson("aggregation.json"), qualification: q, readinessPre: q.readinessPre, readinessFull: q.readinessFull, seal: state.seal, llmCounts: llm.counts(), cost: cost.ledger.totals(), retrieval: rm, targetDocuments: confirmation.executionMission.targetDocuments,
          upstreamReservations: [], lineageRefs: { corpusArtifactRef: cm.corpusArtifactRef, searchProtocolHash: confirmation.searchProtocol.protocolHash } });
        store.saveJson("report.json", report);
        store.saveJson("professionals-economics.json", PE.buildProfessionalsEconomics(store));   /* v1.0.5 : mesure du gain marginal du panel (jamais un seuil) */
        state.summary = { PROCESS_QUALIFICATION: report.headline.PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE: report.headline.SCIENTIFICALLY_USABLE, counts: report.counts, reportHash: report.reportHash };
        done("REPORT");
      }
      state.status = "COMPLETED"; state.gate = null; state.completedAt = now(); state.userMessage = "Analyse terminée. " + (state.summary ? SRP.QUALIFICATION_USER[state.summary.PROCESS_QUALIFICATION] : ""); store.write(state);
      store.event({ level: "user", message: state.userMessage , _state: state });
      writeLineage(store, state);
      return store.publicState(state);
    } catch (e) { fail(store, state, e, llm, base, cost); return store.publicState(state); }
    finally { cost.ledger.deactivate([runId, attemptRunId]); if (live) { try { live.stop(); } catch (x) { /* */ } } }
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

/** v1.0.7 — projection AVANT la premiere revue couteuse : panel courant (approuves), cibles de revue, couts par unite mesures (run) ou historiques. */
function buildDownstreamProjection(store, state, cpPro, reviewTargets, ecoCfg) {
  const panel = (cpPro && cpPro.panel) || store.loadJson("panel.json") || {}; const approved = (panel.approvedCandidateIds || []).length; const dims = (cpPro && cpPro.dimensionSet && cpPro.dimensionSet.dimensions || []).length;
  const entries = CL.readEntries(store.dir); const real = entries.filter((e) => CL.REAL_KINDS.indexOf(e.kind) !== -1 && e.cost);
  const perReview = []; const byReview = new Map(); real.forEach((e) => { if (e.twinId && /^EF-03B review/.test(e.purpose || "")) byReview.set(e.twinId + "|" + (e.targetId || ""), (byReview.get(e.twinId + "|" + (e.targetId || "")) || 0) + e.cost.totalUsd); }); byReview.forEach((v) => perReview.push(v));
  const perCoverage = []; const byCov = new Map(); real.forEach((e) => { if (/^EF-02D3 coverage/.test(e.purpose || "")) { const k = e.candidateRef || e.twinId || String(byCov.size); byCov.set(k, (byCov.get(k) || 0) + e.cost.totalUsd); } }); byCov.forEach((v) => perCoverage.push(v));
  let hist = null; try { hist = CF.buildHistoryReference(CV.historyRuns(state.runId)); } catch (x) { hist = null; }
  const eco = store.loadJson("professionals-economic-panel.json"); const budget = (() => { try { return costFor(store, state).budget.read(); } catch (x) { return null; } })();
  const spent = (() => { try { return costFor(store, state).ledger.totals().totalUsd; } catch (x) { return 0; } })();
  const proj = EP.projectDownstream({ approved, targets: reviewTargets.targets.length, dimensions: dims, spentUsd: spent, initialPanelSize: eco ? eco.initialPanelSize : null, perReviewUsd: perReview, historyPerReviewUsd: hist && hist.perUnit && hist.perUnit.reviewUsd || null, perCoverageUsd: perCoverage, historyPerCoverageUsd: null,
    thresholdUsd: ecoCfg.economicReviewThresholdUsd, outlierUsd: ecoCfg.economicOutlierUsd, budget: budget ? { mode: budget.mode, costBudgetUsd: budget.costBudgetUsd } : null });
  return Object.assign(proj, { runId: state.runId, generatedAt: now(), reviewTargetMode: reviewTargets.mode, sourceDocumentCount: reviewTargets.sourceDocumentCount, causes: { panelSize: approved, reviews: proj.EXPECTED_REVIEWS, dimensions: dims, targets: reviewTargets.targets.length, mainCostDriver: proj.mainCostDriver } });
}

/** v1.0.7 — Porte economique : acte humain explicite (jamais une decision scientifique) ; la projection est conservee avec la decision. */
async function confirmEconomics(runId, input) {
  const store = RS.createRunStore(runId); const state = store.read();
  if (!state || !state.gate || state.gate.id !== RS.GATES.ECONOMIC_REVIEW) { const e = new Error("GATE_NOT_OPEN"); e.code = "GATE_NOT_OPEN"; e.userMessage = "Aucune confirmation économique n'est attendue à ce stade."; throw e; }
  const who = String((input && input.confirmedBy) || "").trim(); if (who.length < 2) { const e = new Error("HUMAN_IDENTITY_REQUIRED"); e.code = "HUMAN_IDENTITY_REQUIRED"; e.userMessage = "Indiquez votre nom : la confirmation économique est un acte humain réel."; throw e; }
  const projection = store.loadJson("economic-projection.json");
  store.saveJson("economic-review-decision.json", { schema: "EvidenceForge.EconomicReviewDecision", schemaVersion: "MONOLITH-v1.0.7", confirmed: true, confirmedBy: who, recordedAt: now(), projection, note: "gate économique humain : la suffisance scientifique du panel n'est pas affectée" });
  state.gate = null; state.status = "RUNNING"; store.write(state); store.event({ level: "user", actor: "user", message: "Coût projeté accepté par " + who + " (" + (projection && projection.CENTRAL_COST != null ? projection.CENTRAL_COST.toFixed(2) + " USD central" : "projection partielle") + ") : lancement des revues.", previousState: "WAITING_USER", nextState: "RUNNING", _state: state });
  advance(runId); return { ok: true, confirmedBy: who };
}

/** Vue de porte : ce que l'utilisateur doit lire avant d'agir. */
function gateView(runId) {
  const store = RS.createRunStore(runId); const state = store.read(); if (!state || !state.gate) return null;
  if (state.gate.id === RS.GATES.ECONOMIC_REVIEW) return { gate: state.gate, projection: store.loadJson("economic-projection.json"), economicPanel: store.loadJson("professionals-economic-panel.json"), reviewTargets: store.loadJson("review-targets.json"), budget: (() => { try { return costFor(store, state).budget.read(); } catch (x) { return null; } })() };
  if (state.gate.id === RS.GATES.CONFIRM_PLAN) { const d = store.loadJson("disciplines.json"), p = store.loadJson("plan.json");
    return { gate: state.gate, reformulation: state.mission.reformulated, disciplines: d.disciplinesRetenues, plan: p.userView.requetes, documents: state.mission.documents }; }
  if (state.gate.id === RS.GATES.RATIFY_SOURCES) { const ev = store.loadJson("screening-evidence.json"), en = store.loadJson("sources-enriched.json"); const byId = new Map(en.enriched.map((s) => [s.sourceId, s]));
    return { gate: state.gate, summary: { sources: ev.sourcesCount, judged: ev.judged, duplicates: ev.duplicates, failed: ev.failedSourceIds.length }, notADecision: ev.notADecision,
      proposals: ev.proposals.map((p) => Object.assign({ titre: (byId.get(p.sourceId) || {}).titre, annee: (byId.get(p.sourceId) || {}).annee, lieu: (byId.get(p.sourceId) || {}).lieu, doi: (byId.get(p.sourceId) || {}).doi, resume: ((byId.get(p.sourceId) || {}).resume || "").slice(0, 600) }, p))
        /* v1.0.2 : une source SANS proposition machine est presentee explicitement (proposed: null, decision par defaut « exclu » affichee), jamais omise ni source de TypeError */
        .concat(ev.failedSourceIds.map((id) => Object.assign({ titre: (byId.get(id) || {}).titre, annee: (byId.get(id) || {}).annee, lieu: (byId.get(id) || {}).lieu, doi: (byId.get(id) || {}).doi, resume: ((byId.get(id) || {}).resume || "").slice(0, 600) }, { sourceId: id, proposed: null, defaultDecision: "exclu", justification: "Aucune proposition machine (tri non abouti pour cette source) : exclue par prudence sauf décision explicite de votre part.", evidence: [], confiance: null }))),
      failedSourceIds: ev.failedSourceIds.map((id) => ({ sourceId: id, titre: (byId.get(id) || {}).titre })),
      /* v1.0.5 : revue de portefeuille (signaux, jamais une decision) presentee AU-DESSUS de la liste inchangee */
      portfolio: store.loadJson("corpus-portfolio-review.json") }; }
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

/** v1.0.5 — budget d'un run : lecture / mise a jour (acte explicite de l'utilisateur, a tout moment, y compris pour reprendre apres BUDGET_LIMIT_REACHED). */
function updateBudget(runId, input) {
  const store = RS.createRunStore(runId); const state = store.read(); if (!state) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
  if (state.kind === "IMPORTED_REPORT") { const e = new Error("BUDGET_INVALID: rapport importe"); e.code = "BUDGET_INVALID"; e.userMessage = "Un rapport importé n'a pas de budget."; throw e; }
  const bm = BG.normalizeBudgetMode(input);   /* RUN SAFETY : lever un plafond en cours de run exige la meme confirmation explicite qu'a la creation */
  const c = costFor(store, state); const b = c.budget.set(bm, "user", { mode: bm.mode, confirmedUnlimited: bm.confirmedUnlimited }); return { ok: true, budget: b, cost: CV.buildCostView(store) };
}

/** RUN SAFETY — primitive unique d'arret utilisateur. Moteur actif : la demande est persistee et lue avant tout appel / toute etape ;
 *  aucun moteur (CREATED, WAITING_USER, STOPPED, FAILED) : l'etat passe immediatement a STOPPED / STOPPED_BY_USER avec etat partiel. */
function requestRunStop(runId, input) {
  input = input || {}; const store = RS.createRunStore(runId); const state = store.read(); if (!state) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
  if (state.kind === "IMPORTED_REPORT" || state.status === "COMPLETED") { const e = new Error("RUN_NOT_ACTIVE"); e.code = "RUN_NOT_ACTIVE"; e.userMessage = "Ce run n'est pas actif : rien à arrêter."; throw e; }
  const r = RSTOP.request(store.dir, { runId, actor: input.actor || "user" });
  if (r.created) store.event({ level: "user", actor: "user", event: "run_stop_requested", message: "Arrêt demandé par l'utilisateur : aucun nouvel appel au service d'analyse ne sera lancé ; un appel déjà envoyé peut se terminer et être facturé.", _state: state });
  const engineActive = running.has(runId) && state.status === "RUNNING";
  if (!engineActive && (state.status === "CREATED" || state.status === "WAITING_USER" || (state.status === "RUNNING" && !running.has(runId)))) {
    /* aucun moteur ne tourne (porte ouverte, ou RUNNING orphelin d'un processus precedent) : l'arret est immediat et persiste */
    const e = RSTOP.stopError(r.request); const cost = costFor(store, state); const prevGate = state.gate; state.gate = null; fail(store, state, e, null, null, cost); if (prevGate) state.stoppedAtGate = prevGate.id; store.write(state);
    return { ok: true, immediate: true, state: store.publicState(state) };
  }
  return { ok: true, immediate: false, pending: !!r.request, state: store.publicState(state) };
}
/** v1.0.10 — REPLAY CIBLE DES REVUES (EF-03B) : reprise technique depuis le checkpoint professionnel (jamais MISSION..PROFESSIONALS, jamais un recalcul du panel).
 *  L'aval (jumeaux, revues, agregation, qualification, rapport) est rejoue ; les revues logiques deja VALID sont servies par le registre (0 appel), seules les
 *  revues manquantes ou invalides sont recalculees. Le checkpoint aval precedent est ARCHIVE (jamais detruit). Acte explicite ; le budget reste applique. */
function replayReviews(runId, input) {
  input = input || {}; const store = RS.createRunStore(runId); const state = store.read(); if (!state) throw Object.assign(new Error("RUN_NOT_FOUND"), { code: "RUN_NOT_FOUND" });
  const err = (code, msg) => { const e = new Error(code); e.code = code; e.userMessage = msg; return e; };
  if (state.kind === "IMPORTED_REPORT") throw err("REPLAY_NOT_APPLICABLE", "Un rapport importé n'a pas de revues à rejouer.");
  if (state.status === "RUNNING" || running.has(runId)) throw err("ALREADY_RUNNING", "Le run est en cours : arrêtez-le avant de demander un replay.");
  if (!state.stages || !state.stages.PROFESSIONALS || state.stages.PROFESSIONALS.status !== "DONE") throw err("REPLAY_REQUIRES_PROFESSIONALS_CHECKPOINT", "Le replay des revues exige un panel professionnel terminé et son point de reprise ; ce run n'en a pas.");
  let cp = null; try { cp = store.loadCheckpoint("checkpoint-professionals.json"); } catch (e) { cp = null; } if (!cp || cp.complete !== true) throw err("REPLAY_REQUIRES_PROFESSIONALS_CHECKPOINT", "Point de reprise professionnel absent ou incomplet : replay refusé.");
  const archived = []; const tag = "before-replay-a" + (state.attempts || 0) + "-" + now().replace(/[:.]/g, "-");
  ["checkpoint-downstream.json", "reviews.json", "enforcement-traces.json", "aggregation.json", "qualification.json", "report.json", "twins.json", "review-units.json", "ef03b-resilience.json"].forEach((f) => { const p = path.join(store.dir, f); if (fs.existsSync(p)) { const dir = path.join(store.dir, "replay-archive", tag); fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(p, path.join(dir, f)); archived.push(f); } });
  const cpd = path.join(store.dir, "checkpoint-downstream.json"); if (fs.existsSync(cpd)) fs.renameSync(cpd, path.join(store.dir, "replay-archive", tag, "checkpoint-downstream.archived.json"));
  ["TWINS_REVIEWS", "QUALIFICATION", "REPORT"].forEach((s) => { state.stages[s] = { status: "PENDING" }; }); if (state.checkpoints) delete state.checkpoints.downstream;
  const e = err("REVIEWS_REPLAY_REQUESTED", "Replay des revues demandé" + (input.requestedBy ? " par " + String(input.requestedBy).slice(0, 120) : "") + " : les étapes amont (mission, disciplines, plan, recherche, corpus, panel) ne sont pas rejouées ; les revues déjà validées sont réutilisées sans appel ; seules les revues manquantes ou invalides seront recalculées. Reprenez le run pour lancer le replay."); 
  state.status = "STOPPED"; state.stage = "TWINS_REVIEWS"; state.gate = null; state.summary = null; state.completedAt = null; state.error = { code: e.code, message: e.message, userMessage: e.userMessage, at: now(), stage: "TWINS_REVIEWS", resumable: true, details: { archived, archiveTag: tag } }; state.userMessage = e.userMessage; state.replay = { requestedAt: now(), requestedBy: input.requestedBy || "user", archiveTag: tag, fromAttempt: state.attempts || 0 };
  store.write(state); store.event({ level: "user", actor: "user", event: "reviews_replay_requested", code: e.code, message: e.userMessage, resumable: true, previousState: "COMPLETED_OR_STOPPED", nextState: "STOPPED", _state: state });
  return { ok: true, archiveTag: tag, archived, state: store.publicState(state) };
}
function costView(runId) { const store = RS.createRunStore(runId); return CV.buildCostView(store); }
function economicsView(runId) { const store = RS.createRunStore(runId); if (!store.read()) return null; return PE.buildProfessionalsEconomics(store); }

module.exports = { startRun, advance, confirmPlan, ratifySources, confirmEconomics, replayReviews, buildDownstreamProjection, gateView, importReport, updateBudget, costView, economicsView, requestRunStop, RESUMABLE, isResumable, _loadDocuments: loadDocuments /* v1.0.6 : expose pour test-chunking (verification des segments au rechargement) */ };
