"use strict";
/**
 * EvidenceForge MONOLITH v1.0.8 — lib/live-status.js
 * OBSERVABILITE LIVE DURABLE pendant un run (surtout TWINS_REVIEWS) : un fichier `live-status.json` (schema EvidenceForge.LiveStatus)
 * + `state.json` rafraichi (updatedAt, counters.llmReal / llmReused) sur ACTIVITE SIGNIFICATIVE (debut / fin / interruption d'appel,
 * validation, checkpoint, jumeaux construits) et par HEARTBEAT BORNE (defaut 10 s) tant qu'un appel fournisseur est en cours.
 * Jamais une ecriture par jeton ; volume borne (un fichier reecrit en place). Ne journalise ni prompt ni reponse ni secret :
 * identifiants, tailles, compteurs, horodatages, codes. Mode console : EVIDENCEFORGE_TRACE_REVIEWS=1 (desactive par defaut).
 */
const fs = require("fs"), path = require("path");
const CL = require("./cost-ledger.js");
const CALL_STATE = Object.freeze({ IDLE: "IDLE", STARTED: "STARTED", STREAMING: "STREAMING", COMPLETED: "COMPLETED", FAILED: "FAILED" });
const FILE = "live-status.json";
const now = () => new Date().toISOString();

function readLiveStatus(runDir) { try { return JSON.parse(fs.readFileSync(path.join(runDir, FILE), "utf8")); } catch (e) { return null; } }

/**
 * createLiveStatus({ store, state, llm, baseCounters, heartbeatMs, minWriteMs, trace })
 * -> { onTrace(e), onStream(e), onValidation(v), note(patch, significant), snapshot(), stop() }
 */
function createLiveStatus(opts) {
  opts = opts || {}; const store = opts.store; const state = opts.state; const llm = opts.llm; const base = opts.baseCounters || { real: 0, reused: 0 };
  const heartbeatMs = Math.max(1000, Number(opts.heartbeatMs || 10000)), minWriteMs = Math.max(500, Number(opts.minWriteMs || 5000));
  const TRACE = opts.trace === true || process.env.EVIDENCEFORGE_TRACE_REVIEWS === "1";
  const live = { schema: "EvidenceForge.LiveStatus", schemaVersion: "MONOLITH-v1.0.8", runId: store.runId, stage: state.stage, attemptId: state.attempts || null, startedAt: now(), updatedAt: now(),
    twinsTotal: null, currentTwinIndex: null, currentTwinId: null, twinsSeen: [], currentTargetIndex: null, targetId: null, reviewTargetMode: null, targetsTotal: null,
    logicalReviewsExpected: null, logicalReviewsComplete: 0, logicalReviewsValidated: 0, reviewsInvalidPasses: 0,
    providerCallState: CALL_STATE.IDLE, providerCallPurpose: null, providerCallStartedAt: null, providerCallLocalRequestId: null, providerRequestId: null, lastProviderActivityAt: null, streamEventsReceived: 0, streamBytesReceived: 0, elapsedMs: 0,
    llmReal: base.real, llmReused: base.reused, ef03b: { registryReuses: 0, truncations: 0, completions: 0, literalizations: 0, validated: 0, cumulativeReviewCostUsd: 0, lastStrategy: null, lastState: null }, lastCheckpointAt: null, lastValidatedReviewAt: null, totalUsd: null, currentStageUsd: null, lastTransportCode: null, lastTransportAt: null, heartbeats: 0, writes: 0 };
  let lastWrite = 0, timer = null, stopped = false;
  const refreshCost = () => { try { const t = CL.readTotals(store.dir); if (t) { live.totalUsd = Math.round(t.totalUsd * 1e4) / 1e4; const s = t.byStage && t.byStage[live.stage]; live.currentStageUsd = s ? Math.round(s.totalUsd * 1e4) / 1e4 : 0; } } catch (e) { /* observabilite */ } };
  const refreshCounters = () => { if (llm && typeof llm.counts === "function") { const c = llm.counts(); live.llmReal = base.real + c.real; live.llmReused = base.reused + c.reused; } };
  function write(significant) {
    if (stopped) return false; const t = Date.now(); if (!significant && t - lastWrite < minWriteMs) return false;
    lastWrite = t; live.updatedAt = now(); if (live.providerCallStartedAt && live.providerCallState !== CALL_STATE.IDLE && live.providerCallState !== CALL_STATE.COMPLETED && live.providerCallState !== CALL_STATE.FAILED) live.elapsedMs = t - Date.parse(live.providerCallStartedAt);
    refreshCounters(); refreshCost(); live.stage = state.stage; live.writes++;
    try { store.saveJson(FILE, live); } catch (e) { /* jamais bloquant */ }
    try { state.counters = Object.assign({}, state.counters || {}, { llmReal: live.llmReal, llmReused: live.llmReused }); state.live = { updatedAt: live.updatedAt, stage: live.stage, providerCallState: live.providerCallState, currentTwinId: live.currentTwinId, currentTwinIndex: live.currentTwinIndex, twinsTotal: live.twinsTotal, logicalReviewsExpected: live.logicalReviewsExpected, logicalReviewsComplete: live.logicalReviewsComplete, ef03b: live.ef03b, elapsedMs: live.elapsedMs, lastTransportCode: live.lastTransportCode, streamEventsReceived: live.streamEventsReceived, streamBytesReceived: live.streamBytesReceived }; store.write(state); } catch (e) { /* jamais bloquant */ }
    return true;
  }
  const t = (line) => { if (TRACE) { try { console.log(line); } catch (e) { /* */ } } };
  function heartbeat() { if (stopped) return; if (live.providerCallState === CALL_STATE.STARTED || live.providerCallState === CALL_STATE.STREAMING) { live.heartbeats++; write(true); t("[EF STREAM] twin=" + (live.currentTwinId || "-") + " state=" + live.providerCallState + " elapsed=" + live.elapsedMs + "ms events=" + live.streamEventsReceived + " bytes=" + live.streamBytesReceived + " lastActivity=" + (live.lastProviderActivityAt || "-")); } }
  timer = setInterval(heartbeat, heartbeatMs); if (timer.unref) timer.unref();
  function noteTwin(e) { if (e && e.twinId) { if (live.twinsSeen.indexOf(e.twinId) === -1) live.twinsSeen.push(e.twinId); live.currentTwinId = e.twinId; live.currentTwinIndex = live.twinsSeen.indexOf(e.twinId) + 1; } if (e && e.targetId) { live.targetId = e.targetId; const m = /target-(\d+)/.exec(e.targetId); live.currentTargetIndex = m ? Number(m[1]) : null; } }
  /** Evenements du traceur LLM (opts.onTrace de createLlm) et du pipeline (log). */
  function onTrace(e) {
    if (!e || stopped) return;
    if (e.event === "twins_built") { live.twinsTotal = e.built; live.logicalReviewsExpected = live.targetsTotal != null ? e.built * live.targetsTotal : e.built; write(true); t("[EF REVIEW] twins=" + e.built + " logicalReviewsExpected=" + live.logicalReviewsExpected + " target=" + (live.reviewTargetMode || "?")); return; }
    if (e.event === "llm_call" || e.event === "llm_reuse") { noteTwin(e); live.providerCallState = e.event === "llm_reuse" ? CALL_STATE.IDLE : (e.outcome === "OK" ? CALL_STATE.COMPLETED : CALL_STATE.FAILED); live.lastProviderActivityAt = now(); if (e.providerRequestId) live.providerRequestId = e.providerRequestId; if (e.outcome && e.outcome !== "OK" && e.event === "llm_call") { live.lastTransportCode = e.outcome; live.lastTransportAt = now(); } write(true); return; }
    if (e.event === "llm_stream_interrupted") { noteTwin(e); live.providerCallState = CALL_STATE.FAILED; live.lastTransportCode = e.code || "PROVIDER_STREAM_INTERRUPTED"; live.lastTransportAt = now(); live.streamEventsReceived = e.streamEvents || live.streamEventsReceived; live.streamBytesReceived = e.streamBytes || live.streamBytesReceived; write(true); return; }
    if (e.event === "transport_failure_latched") { live.lastTransportCode = e.code || e.outcome || null; live.lastTransportAt = now(); live.providerCallState = CALL_STATE.FAILED; write(true); return; }
    if (e.event === "checkpoint_reanchored" || e.event === "checkpoint_saved") { live.lastCheckpointAt = now(); write(true); return; }
    /* v1.0.10 — EF-03B REVIEW RESILIENCE : compteurs de l'adaptateur (reuse registre, troncatures, completions, litteralisations, revues validees, cout cumule) */
    if (e.event === "ef03b_pass") { noteTwin(e); const s = live.ef03b; if (e.strategy === "REGISTRY_REUSE") s.registryReuses++; if (e.state === "REVIEW_OUTPUT_TRUNCATED") s.truncations++; if (e.strategy === "TRUNCATION_COMPLETION") s.completions++; if (e.strategy === "LITERALIZATION_EXCERPTS") s.literalizations++; if (e.state === "VALIDATED") s.validated++; if (typeof e.cumulativeReviewCostUsd === "number") s.cumulativeReviewCostUsd = e.cumulativeReviewCostUsd; s.lastStrategy = e.strategy || null; s.lastState = e.state || null; write(e.state === "VALIDATED" || e.strategy === "REGISTRY_REUSE"); return; }
  }
  /** Evenements de flux (opts.onStream de createLlm) : STREAM_STARTED / STREAM_PROGRESS (borne) / STREAM_COMPLETED. */
  function onStream(e) {
    if (!e || stopped) return; noteTwin(e);
    if (e.kind === "STREAM_STARTED") { live.providerCallState = CALL_STATE.STARTED; live.providerCallPurpose = e.purpose || null; live.providerCallStartedAt = now(); live.providerCallLocalRequestId = e.localRequestId || null; live.providerRequestId = null; live.streamEventsReceived = 0; live.streamBytesReceived = 0; live.elapsedMs = 0; live.lastProviderActivityAt = now(); write(true); t("[EF REVIEW] twin=" + (live.currentTwinId || "-") + " review=" + (live.currentTwinIndex || "?") + "/" + (live.twinsTotal || "?") + " target=" + (live.reviewTargetMode || live.targetId || "?") + " state=STARTED"); return; }
    if (e.kind === "STREAM_PROGRESS") { live.providerCallState = CALL_STATE.STREAMING; live.streamEventsReceived = e.events || 0; live.streamBytesReceived = e.bytes || 0; live.lastProviderActivityAt = e.lastActivityAt || now(); if (e.providerRequestId) live.providerRequestId = e.providerRequestId; write(false); return; }
    if (e.kind === "STREAM_COMPLETED") { live.providerCallState = CALL_STATE.COMPLETED; live.streamEventsReceived = e.events || live.streamEventsReceived; live.streamBytesReceived = e.bytes || live.streamBytesReceived; live.lastProviderActivityAt = now(); if (e.providerRequestId) live.providerRequestId = e.providerRequestId; write(true); return; }
  }
  /** Validation locale (onValidation du lot gele) : une revue logique est COMPLETE seulement quand une passe est VALID. */
  function onValidation(v) {
    if (!v || stopped) return; const isReview = /EF-03B/.test(String(v.stage || "")) || (live.providerCallPurpose && /EF-03B/.test(live.providerCallPurpose));
    if (v.valid) { if (isReview) { live.logicalReviewsValidated++; live.logicalReviewsComplete = live.logicalReviewsValidated; live.lastValidatedReviewAt = now(); t("[EF REVIEW] twin=" + (live.currentTwinId || "-") + " state=VALIDATED cost=" + (live.currentStageUsd != null ? live.currentStageUsd + " USD (étape)" : "-") + " checkpoint=" + (live.lastCheckpointAt ? "SAVED@" + live.lastCheckpointAt : "PENDING")); } write(true); }
    else { if (isReview) live.reviewsInvalidPasses++; write(false); }
  }
  function note(patch, significant) { Object.assign(live, patch || {}); write(significant !== false); }
  function stop() { stopped = true; if (timer) clearInterval(timer); }
  return { onTrace, onStream, onValidation, note, snapshot: () => Object.assign({}, live), stop, write, CALL_STATE };
}

module.exports = { createLiveStatus, readLiveStatus, CALL_STATE, FILE };
