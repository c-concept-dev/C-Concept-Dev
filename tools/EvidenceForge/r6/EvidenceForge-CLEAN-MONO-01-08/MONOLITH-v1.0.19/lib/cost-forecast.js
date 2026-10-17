"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/cost-forecast.js
 * ESTIMATEUR de cout final, SEPARE de la comptabilite reelle (lib/cost-ledger.js). Il ne lit que des mesures : le ledger du
 * run (ACTUAL), la progression reelle des etapes (unites traitees / a traiter), et — optionnellement — une reference
 * historique calculee sur des runs COMPLETED du meme dossier qui possedent un ledger. Il ne contient AUCUN tarif ni AUCUN
 * cout par defaut : quand rien n'est mesurable, il rend UNKNOWN (jamais une valeur inventee).
 * Sortie : { actual, forecast: { status: COMPLETE|PARTIAL|UNKNOWN, low, central, high, lowerBound }, perStage[], method, notGuarantee: true, label: "ESTIMATE — NOT GUARANTEE" }
 * Methode par etape :
 *   - DONE : mesuree (actual byStage) ;
 *   - PROFESSIONALS en cours : unite = candidat selectionne ; par-candidat = repartition des couts mesures dans CE run (p25 / moyenne / p75)
 *     sur les candidats deja evalues (>= minSamples) × candidats restants ;
 *   - TWINS_REVIEWS en cours : unite = revue attendue ; par-revue mesure dans ce run ;
 *   - etape non commencee : reference historique (moyenne par unite ou par run) si disponible, sinon UNKNOWN ;
 *   - QUALIFICATION, REPORT : aucun appel LLM (0).
 */
const STAGES = ["MISSION", "DISCIPLINES", "PLAN", "RETRIEVAL", "CORPUS", "PROFESSIONALS", "TWINS_REVIEWS", "QUALIFICATION", "REPORT"];
const NO_LLM_STAGES = ["CORPUS", "QUALIFICATION", "REPORT"];
const round2 = (v) => Math.round(v * 100) / 100;
const quantile = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const MIN_SAMPLES = 3;

/** Reference historique : moyenne par unite (professionnel evalue, revue) et par etape, depuis des runs COMPLETED avec ledger. */
function buildHistoryReference(runs) {
  const perStage = {}, perUnit = { professionalUsd: [], reviewUsd: [], sourceScreeningUsd: [] }; let n = 0;
  (runs || []).forEach(function (r) {
    if (!r || !r.totals || !r.stages) return; n++;
    Object.keys(r.totals.byStage || {}).forEach((s) => { if (!perStage[s]) perStage[s] = []; perStage[s].push(r.totals.byStage[s].totalUsd); });
    const ev = r.stages.PROFESSIONALS && r.stages.PROFESSIONALS.stats && r.stages.PROFESSIONALS.stats.evaluated; const pc = r.totals.byStage && r.totals.byStage.PROFESSIONALS;
    if (ev > 0 && pc) perUnit.professionalUsd.push(pc.totalUsd / ev);
    const rv = r.stages.TWINS_REVIEWS && r.stages.TWINS_REVIEWS.reviews && r.stages.TWINS_REVIEWS.reviews.reviewsExpected; const tc = r.totals.byStage && r.totals.byStage.TWINS_REVIEWS;
    if (rv > 0 && tc) perUnit.reviewUsd.push(tc.totalUsd / rv);
    const src = r.stages.RETRIEVAL && r.stages.RETRIEVAL.sources; const rc = r.totals.byStage && r.totals.byStage.RETRIEVAL;
    if (src > 0 && rc) perUnit.sourceScreeningUsd.push(rc.totalUsd / src);
  });
  const stat = (arr) => (arr.length ? { n: arr.length, low: round2(quantile(arr, 0.25)), central: round2(mean(arr)), high: round2(quantile(arr, 0.75)) } : null);
  const out = { runs: n, perStage: {}, perUnit: {} }; Object.keys(perStage).forEach((s) => { out.perStage[s] = stat(perStage[s]); }); Object.keys(perUnit).forEach((k) => { out.perUnit[k] = stat(perUnit[k]); });
  return out;
}

/**
 * forecast({ stages, status, totals, progress: { professionals: { selected, evaluated, perCandidateUsd[] }, twins: { reviewsExpected, reviewsComplete, perReviewUsd[] } }, history? })
 */
function forecast(input) {
  const stages = input.stages || {}; const totals = input.totals || null; const prog = input.progress || {}; const hist = input.history || null;
  const byStage = (totals && totals.byStage) || {}; const spent = totals ? totals.totalUsd : 0;
  const perStage = []; let unknown = 0, low = 0, central = 0, high = 0;
  const measured = (s) => (byStage[s] ? byStage[s].totalUsd : 0);
  STAGES.forEach(function (s) {
    const st = (stages[s] && stages[s].status) || "PENDING"; const done = st === "DONE"; const row = { stage: s, status: st, actualUsd: round2(measured(s)) };
    if (done || NO_LLM_STAGES.indexOf(s) !== -1 || input.status === "COMPLETED") { row.kind = done ? "MEASURED" : "NO_LLM_CALL"; row.remaining = { low: 0, central: 0, high: 0 }; perStage.push(row); return; }
    let rem = null;
    if (s === "PROFESSIONALS" && prog.professionals && prog.professionals.selected != null) {
      const p = prog.professionals; const left = Math.max(0, p.selected - (p.evaluated || 0)); const samples = (p.perCandidateUsd || []).filter((v) => typeof v === "number");
      if (samples.length >= MIN_SAMPLES) rem = { low: quantile(samples, 0.25) * left, central: mean(samples) * left, high: quantile(samples, 0.75) * left, basis: "IN_RUN", unit: "professionnel", units: left, samples: samples.length, perUnit: { low: round2(quantile(samples, 0.25)), central: round2(mean(samples)), high: round2(quantile(samples, 0.75)) } };
      else if (hist && hist.perUnit && hist.perUnit.professionalUsd) { const u = hist.perUnit.professionalUsd; rem = { low: u.low * left, central: u.central * left, high: u.high * left, basis: "HISTORY", unit: "professionnel", units: left, samples: u.n, perUnit: u }; }
    } else if (s === "TWINS_REVIEWS" && prog.twins && prog.twins.reviewsExpected != null) {
      const t = prog.twins; const left = Math.max(0, t.reviewsExpected - (t.reviewsComplete || 0)); const samples = (t.perReviewUsd || []).filter((v) => typeof v === "number");
      if (samples.length >= MIN_SAMPLES) rem = { low: quantile(samples, 0.25) * left, central: mean(samples) * left, high: quantile(samples, 0.75) * left, basis: "IN_RUN", unit: "revue", units: left, samples: samples.length };
      else if (hist && hist.perUnit && hist.perUnit.reviewUsd) { const u = hist.perUnit.reviewUsd; rem = { low: u.low * left, central: u.central * left, high: u.high * left, basis: "HISTORY", unit: "revue", units: left, samples: u.n, perUnit: u }; }
    }
    if (!rem && hist && hist.perStage && hist.perStage[s] && st !== "RUNNING") { const u = hist.perStage[s]; rem = { low: u.low, central: u.central, high: u.high, basis: "HISTORY_STAGE_TOTAL", samples: u.n }; }
    if (!rem && hist && hist.perStage && hist.perStage[s] && st === "RUNNING") { const u = hist.perStage[s]; const m = measured(s); rem = { low: Math.max(0, u.low - m), central: Math.max(0, u.central - m), high: Math.max(0, u.high - m), basis: "HISTORY_STAGE_TOTAL_MINUS_MEASURED", samples: u.n }; }
    if (!rem) { row.kind = "UNKNOWN"; row.remaining = null; row.note = "aucune mesure disponible pour projeter cette étape (ni dans ce run, ni dans l'historique)"; unknown++; perStage.push(row); return; }
    row.kind = "PROJECTED"; row.remaining = { low: round2(rem.low), central: round2(rem.central), high: round2(rem.high) }; row.basis = rem.basis; row.unit = rem.unit || null; row.units = rem.units != null ? rem.units : null; row.samples = rem.samples || null; row.perUnit = rem.perUnit || null;
    low += rem.low; central += rem.central; high += rem.high; perStage.push(row);
  });
  const fc = unknown === 0 ? { status: input.status === "COMPLETED" ? "COMPLETE" : "PROJECTED", low: round2(spent + low), central: round2(spent + central), high: round2(spent + high), lowerBound: round2(spent + low) }
    : { status: "PARTIAL", low: null, central: null, high: null, lowerBound: round2(spent + low), unknownStages: perStage.filter((r) => r.kind === "UNKNOWN").map((r) => r.stage), note: "au moins " + round2(spent + low).toFixed(2) + " USD ; " + unknown + " étape(s) non projetable(s)" };
  if (input.status === "COMPLETED") { fc.status = "COMPLETE"; fc.low = fc.central = fc.high = fc.lowerBound = round2(spent); delete fc.note; delete fc.unknownStages; }
  return { schema: "EvidenceForge.CostForecast", label: "ESTIMATE — NOT GUARANTEE", notGuarantee: true, actualUsd: round2(spent), forecast: fc, perStage, history: hist ? { runs: hist.runs } : null,
    method: "Séparé de la comptabilité : étapes terminées = mesurées ; étape en cours = coût par unité mesuré dans ce run (p25 / moyenne / p75) × unités restantes ; étapes non commencées = référence historique (runs terminés avec ledger) ou UNKNOWN. Aucun tarif ni coût par défaut n'est codé dans l'estimateur." };
}

module.exports = { forecast, buildHistoryReference, STAGES, NO_LLM_STAGES, MIN_SAMPLES, quantile, mean };
