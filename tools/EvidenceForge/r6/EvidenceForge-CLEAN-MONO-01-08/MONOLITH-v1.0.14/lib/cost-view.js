"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/cost-view.js
 * VUE DE COUT d'un run pour l'API et l'interface : ACTUAL (ledger) + BUDGET (budget.json) + PROGRESSION reelle de l'etape +
 * FORECAST (lib/cost-forecast.js, separe). Lecture seule sur les artefacts du run ; aucun appel, aucune ecriture.
 */
const fs = require("fs"), path = require("path");
const P = require("./paths.js");
const CL = require("./cost-ledger.js");
const BG = require("./budget-guard.js");
const CF = require("./cost-forecast.js");
const LIVE = require("./live-status.js");   /* v1.0.8 : observabilite live */
const round2 = (v) => Math.round(v * 100) / 100;

/** Reference historique : runs COMPLETED du meme dossier possedant un ledger (jamais le run courant). */
function historyRuns(excludeRunId) {
  if (!fs.existsSync(P.RUNS)) return [];
  return fs.readdirSync(P.RUNS).filter((n) => n.startsWith("efm-") && n !== excludeRunId).map(function (n) {
    const dir = path.join(P.RUNS, n); try { const st = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")); if (st.status !== "COMPLETED" || st.kind === "IMPORTED_REPORT") return null; const totals = CL.readTotals(dir); if (!totals || !totals.calls.real) return null; return { runId: n, totals, stages: st.stages }; } catch (e) { return null; }
  }).filter(Boolean);
}

/** Progression de l'etape courante en unites reelles (evenements et artefacts du run), et couts par unite deja mesures. */
function progressOf(store, state, entries) {
  const events = store.events(); const out = { professionals: null, twins: null };
  const realEntries = entries.filter((e) => CL.REAL_KINDS.indexOf(e.kind) !== -1 && e.cost);
  const sel = store.loadJson("professionals-selection.json");
  if (sel) {
    const evaluated = new Set(events.filter((e) => e.event === "candidate_evidence" && e.candidateId).map((e) => e.candidateId));
    const byCand = new Map(); realEntries.forEach((e) => { if (e.candidateRef) byCand.set(e.candidateRef, (byCand.get(e.candidateRef) || 0) + e.cost.totalUsd); });
    const perCandidateUsd = Array.from(evaluated).map((id) => round2(byCand.get(id) || 0));
    out.professionals = { unit: "professionnel", selected: sel.selectedCount, evaluated: evaluated.size, poolCount: sel.poolCount, cap: sel.cap, capApplied: sel.capApplied === true, perCandidateUsd, stageUsd: round2(perCandidateUsd.reduce((a, b) => a + b, 0)) };
  }
  const tw = events.filter((e) => e.event === "twins_built").pop(); const pc = store.loadJson("plan-confirmation.json");
  /* v1.0.7 — cibles de revue REELLES (review-targets.json : dossier de mission = 1 cible) ; a defaut, documents de la mission (contrat historique) */
  const rtj = store.loadJson("review-targets.json");
  const targets = rtj && Array.isArray(rtj.targets) ? rtj.targets.length : (pc && pc.executionMission && Array.isArray(pc.executionMission.targetDocuments) ? pc.executionMission.targetDocuments.length : null);
  const doneReviews = state.stages && state.stages.TWINS_REVIEWS && state.stages.TWINS_REVIEWS.reviews;
  if (tw || doneReviews) {
    const built = doneReviews ? doneReviews.twins : (tw.built != null ? tw.built : (tw.twins || 0)); const expected = doneReviews ? doneReviews.reviewsExpected : (targets != null ? built * targets : null);
    const byTwin = new Map(); realEntries.forEach((e) => { if (e.twinId && /^EF-03B review/.test(e.purpose || "")) byTwin.set(e.twinId + "|" + (e.targetId || ""), (byTwin.get(e.twinId + "|" + (e.targetId || "")) || 0) + e.cost.totalUsd); });
    const ru = store.loadJson("review-units.json");
    out.twins = { unit: "revue", twins: built, reviewsExpected: expected, reviewsComplete: doneReviews ? doneReviews.reviewsComplete : byTwin.size, perReviewUsd: Array.from(byTwin.values()).map(round2),
      reviewTargetMode: rtj ? rtj.mode : "PER_DOCUMENT", targets, reviewDocuments: expected, reviewDocumentsComplete: doneReviews ? doneReviews.reviewsComplete : byTwin.size, reviewItems: ru ? ru.reviewItems : null, reviewItemsComplete: ru ? ru.reviewItemsComplete : null, twinsReviewed: ru ? ru.twinsReviewed : byTwin.size ? new Set(Array.from(byTwin.keys()).map((k) => k.split("|")[0])).size : 0 };
  }
  return out;
}

/** v1.0.8 — bloc live : appel fournisseur en cours (etat, jumeau, cible, flux), revues logiques attendues / completes, derniers horodatages ; null si aucun statut live. */
function liveOf(store, state) {
  const l = LIVE.readLiveStatus(store.dir); if (!l) return null; const stale = l.updatedAt ? Date.now() - Date.parse(l.updatedAt) : null;
  return { updatedAt: l.updatedAt, stage: l.stage, attemptId: l.attemptId, staleMs: stale, active: state.status === "RUNNING", providerCallState: l.providerCallState, providerCallPurpose: l.providerCallPurpose, providerCallStartedAt: l.providerCallStartedAt, lastProviderActivityAt: l.lastProviderActivityAt, elapsedMs: l.elapsedMs, streamEventsReceived: l.streamEventsReceived, streamBytesReceived: l.streamBytesReceived,
    currentTwinIndex: l.currentTwinIndex, currentTwinId: l.currentTwinId, twinsTotal: l.twinsTotal, currentTargetIndex: l.currentTargetIndex, targetId: l.targetId, reviewTargetMode: l.reviewTargetMode, targetsTotal: l.targetsTotal, logicalReviewsExpected: l.logicalReviewsExpected, logicalReviewsComplete: l.logicalReviewsComplete, reviewsInvalidPasses: l.reviewsInvalidPasses,
    llmReal: l.llmReal, llmReused: l.llmReused, ef03b: l.ef03b || null, lastCheckpointAt: l.lastCheckpointAt, lastValidatedReviewAt: l.lastValidatedReviewAt, totalUsd: l.totalUsd, currentStageUsd: l.currentStageUsd, lastTransportCode: l.lastTransportCode, lastTransportAt: l.lastTransportAt, heartbeats: l.heartbeats };
}

/** v1.0.7 — bloc economique de la vue : politique de lots, dernier lot clos, contribution marginale, prochain lot, projection avant revues, alerte d'exception (descriptif). */
function economicsOf(store, state, fc) {
  const eco = store.loadJson("professionals-economic-panel.json") || (function () { const p = store.loadJson("professionals-sufficiency-partial.json"); return p && p.economicPanel ? p.economicPanel : null; })();
  const projection = store.loadJson("economic-projection.json"); const decision = store.loadJson("economic-review-decision.json"); const ru = store.loadJson("review-units.json");
  const cfg = (P.CONFIG.professionals && P.CONFIG.professionals.economic) || {}; const outlierUsd = Number(cfg.economicOutlierUsd != null ? cfg.economicOutlierUsd : 40);
  const central = fc && fc.forecast ? fc.forecast.central : null; const lower = fc && fc.forecast ? fc.forecast.lowerBound : null;
  const outlier = ((central != null ? central : lower) != null && (central != null ? central : lower) > outlierUsd) || !!(projection && projection.ECONOMIC_OUTLIER_WARNING);   /* forecast global OU projection avant revues */
  const last = eco && eco.batches && eco.batches.length ? eco.batches[eco.batches.length - 1] : null;
  return { policy: cfg.policy || "NONE", capIsGuardNotTarget: true, cap: P.CONFIG.professionals && P.CONFIG.professionals.maxCandidatesToEvaluate, panel: eco ? { initialPanelSize: eco.initialPanelSize, batchesClosed: eco.batches.length, currentBatch: eco.currentBatch, evaluated: eco.evaluated, approved: eco.approved, scientificPanelState: eco.scientificPanelState, economicState: eco.economicState, diminishingReturns: eco.diminishingReturns, averageMarginalGainPerBatch: eco.averageMarginalGainPerBatch, duplicateReviewRate: eco.duplicateReviewRate, stopped: eco.stopped,
      lastBatch: last ? { index: last.index, kind: last.kind, evaluated: last.contribution.evaluated, newApproved: last.contribution.newApproved, newDisciplinesCovered: last.contribution.newDisciplinesCovered, newIndependentPositions: last.contribution.newIndependentPositions, nearDuplicatePositions: last.contribution.nearDuplicatePositions, costUsd: last.costUsd } : null,
      nextBatch: eco.currentBatchInProgress && eco.currentBatchInProgress.nextBatchEstimate ? eco.currentBatchInProgress.nextBatchEstimate : null } : null,
    projection: projection ? { status: projection.status, INITIAL_PANEL_SIZE: projection.INITIAL_PANEL_SIZE, PANEL_SIZE: projection.PANEL_SIZE, EXPECTED_TWINS: projection.EXPECTED_TWINS, EXPECTED_REVIEWS: projection.EXPECTED_REVIEWS, EXPECTED_REVIEW_CALLS: projection.EXPECTED_REVIEW_CALLS, LOW_COST: projection.LOW_COST, CENTRAL_COST: projection.CENTRAL_COST, HIGH_COST: projection.HIGH_COST, ECONOMIC_OUTLIER_WARNING: projection.ECONOMIC_OUTLIER_WARNING, ECONOMIC_REVIEW_REQUIRED: projection.ECONOMIC_REVIEW_REQUIRED, mainCostDriver: projection.mainCostDriver, reviewTargetMode: projection.reviewTargetMode, confirmed: !!(decision && decision.confirmed), confirmedBy: decision ? decision.confirmedBy : null } : null,
    reviewUnits: ru ? { reviewDocuments: ru.reviewDocuments, reviewDocumentsComplete: ru.reviewDocumentsComplete, reviewItems: ru.reviewItems, twinsReviewed: ru.twinsReviewed, duplicateReviewRate: ru.marginal ? ru.marginal.duplicateReviewRate : null } : null,
    ECONOMIC_OUTLIER_WARNING: outlier, outlierUsd, userMessage: outlier ? "Cette mission est inhabituellement coûteuse." : null,
    costPerInformationGain: last && last.costUsd != null ? { costPerNewApproved: last.costPerNewApproved, costPerNewDisciplineCovered: last.costPerNewDisciplineCovered, costPerNewIndependentPosition: last.costPerNewIndependentPosition, costPerBatch: last.costUsd } : null };
}

/** buildCostView(store) -> EvidenceForge.CostView | null (run sans ledger : coût non journalisé pour ce run) */
function buildCostView(store) {
  const state = store.read(); if (!state) return null;
  const totals = CL.readTotals(store.dir); const budget = BG.readBudget(store.dir); const entries = totals ? CL.readEntries(store.dir) : [];
  const progress = progressOf(store, state, entries);
  const hist = CF.buildHistoryReference(historyRuns(state.runId)); const fc = CF.forecast({ stages: state.stages, status: state.status, totals: totals || { totalUsd: 0, byStage: {} }, progress, history: hist.runs ? hist : null });
  const spent = totals ? totals.totalUsd : 0; const b = budget || null;
  const cur = state.stage; const stageActual = totals && totals.byStage[cur] ? totals.byStage[cur].totalUsd : 0;
  return { schema: "EvidenceForge.CostView", runId: state.runId, status: state.status, stage: cur, ledgerPresent: !!totals, currency: (totals && totals.currency) || "USD",
    actual: totals ? { totalUsd: round2(spent), inputUsd: round2(totals.inputUsd), outputUsd: round2(totals.outputUsd), cacheWriteUsd: round2(totals.cacheWriteUsd), cacheReadUsd: round2(totals.cacheReadUsd), tokens: totals.tokens, calls: totals.calls, lastCall: totals.lastCall, byStage: totals.byStage, byModel: totals.byModel, byPurpose: totals.byPurpose, pricingVersion: totals.pricingVersion, pricingSnapshotHash: totals.pricingSnapshotHash, pricingDrift: totals.pricingDrift, currentStageUsd: round2(stageActual), label: "ACTUAL_COST" } : null,
    budget: b ? { mode: b.mode || null, confirmedUnlimited: b.confirmedUnlimited === true, missing: false, costBudgetUsd: b.costBudgetUsd, warningThresholdUsd: b.warningThresholdUsd, remainingUsd: b.costBudgetUsd === null ? null : round2(Math.max(0, b.costBudgetUsd - spent)), warningReached: b.warningThresholdUsd !== null && spent >= b.warningThresholdUsd, limitReached: b.costBudgetUsd !== null && spent >= b.costBudgetUsd, updatedAt: b.updatedAt, limitReachedAt: b.limitReachedAt || null, warningRaisedAt: b.warningRaisedAt || null,
      forecastExceedsBudget: b.costBudgetUsd !== null && fc.forecast.central != null ? fc.forecast.central > b.costBudgetUsd : (b.costBudgetUsd !== null && fc.forecast.lowerBound != null ? fc.forecast.lowerBound > b.costBudgetUsd : null) } : { mode: null, confirmedUnlimited: false, missing: true, anomaly: "BUDGET_FILE_MISSING", costBudgetUsd: null, warningThresholdUsd: null, remainingUsd: null, warningReached: false, limitReached: false },   /* RUN SAFETY : l'absence de budget.json est une anomalie, pas une configuration */
    progress, forecast: fc, economics: economicsOf(store, state, fc), live: liveOf(store, state), generatedAt: new Date().toISOString() };
}

module.exports = { buildCostView, historyRuns, progressOf };
