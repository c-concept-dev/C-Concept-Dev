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
  const targets = pc && pc.executionMission && Array.isArray(pc.executionMission.targetDocuments) ? pc.executionMission.targetDocuments.length : null;
  const doneReviews = state.stages && state.stages.TWINS_REVIEWS && state.stages.TWINS_REVIEWS.reviews;
  if (tw || doneReviews) {
    const built = doneReviews ? doneReviews.twins : (tw.built != null ? tw.built : (tw.twins || 0)); const expected = doneReviews ? doneReviews.reviewsExpected : (targets != null ? built * targets : null);
    const byTwin = new Map(); realEntries.forEach((e) => { if (e.twinId && /^EF-03B review/.test(e.purpose || "")) byTwin.set(e.twinId + "|" + (e.targetId || ""), (byTwin.get(e.twinId + "|" + (e.targetId || "")) || 0) + e.cost.totalUsd); });
    out.twins = { unit: "revue", twins: built, reviewsExpected: expected, reviewsComplete: doneReviews ? doneReviews.reviewsComplete : byTwin.size, perReviewUsd: Array.from(byTwin.values()).map(round2) };
  }
  return out;
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
    budget: b ? { costBudgetUsd: b.costBudgetUsd, warningThresholdUsd: b.warningThresholdUsd, remainingUsd: b.costBudgetUsd === null ? null : round2(Math.max(0, b.costBudgetUsd - spent)), warningReached: b.warningThresholdUsd !== null && spent >= b.warningThresholdUsd, limitReached: b.costBudgetUsd !== null && spent >= b.costBudgetUsd, updatedAt: b.updatedAt, limitReachedAt: b.limitReachedAt || null, warningRaisedAt: b.warningRaisedAt || null,
      forecastExceedsBudget: b.costBudgetUsd !== null && fc.forecast.central != null ? fc.forecast.central > b.costBudgetUsd : (b.costBudgetUsd !== null && fc.forecast.lowerBound != null ? fc.forecast.lowerBound > b.costBudgetUsd : null) } : { costBudgetUsd: null, warningThresholdUsd: null, remainingUsd: null, warningReached: false, limitReached: false },
    progress, forecast: fc, generatedAt: new Date().toISOString() };
}

module.exports = { buildCostView, historyRuns, progressOf };
