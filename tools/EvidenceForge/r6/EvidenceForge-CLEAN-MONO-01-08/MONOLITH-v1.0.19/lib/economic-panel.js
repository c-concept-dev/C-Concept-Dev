"use strict";
/**
 * EvidenceForge MONOLITH v1.0.7 — lib/economic-panel.js
 * ECONOMIC PANEL OPTIMIZATION · EARLY SUFFICIENCY · MARGINAL VALUE CONTROL · REVIEW FANOUT CONTROL — fonctions PURES, deterministes,
 * sans LLM, sans reseau. Principe produit : DISCOVER BROADLY -> SCREEN AGGRESSIVELY -> SELECT PARSIMONIOUSLY -> REVIEW INDEPENDENTLY ->
 * TEST SUFFICIENCY EARLY -> ADD ONLY IF MARGINAL VALUE JUSTIFIES IT -> STOP WHEN SUFFICIENT.
 *
 * AUTORITE : l'etat scientifique du panel (PANEL_CONTINUE | PANEL_SUFFICIENT | PANEL_EXHAUSTED_WITH_GAPS) vient EXCLUSIVEMENT du traqueur
 * PANEL-SUFFICIENCY-v2 (lib/panel-sufficiency.js, inchange). Ce module ne fabrique JAMAIS un PANEL_SUFFICIENT : le cout peut seulement
 * EMPECHER l'ajout d'un lot (PANEL_INCOMPLETE_BUDGET_LIMIT, reprenable) ; un panel suffisant ARRETE toute evaluation supplementaire.
 * Le plafond `maxCandidatesToEvaluate` est une GARDE (capIsGuardNotTarget = true) : l'evaluation s'arrete bien avant s'il y a suffisance.
 *
 *   planBatches(...)                : panel initial compact (min par angle) puis lots d'expansion de petite taille (expansionBatch)
 *   createEconomicController(...)   : decide, candidat par candidat et lot par lot, si l'evaluation continue ; mesure la contribution
 *                                     marginale de chaque lot (composantes separees, jamais un score unique) ; signal descriptif
 *                                     DIMINISHING_INFORMATION_RETURNS ; arret budgetaire AVANT un lot (jamais une suffisance)
 *   buildReviewTargets(...)         : REVIEW FANOUT CONTROL — 1 cible « dossier de mission » (tous les documents, delimites) =>
 *                                     1 revue complete par jumeau et par mission ; mode PER_DOCUMENT conserve, explicite
 *   projectDownstream(...)          : projection avec le panel INITIAL / courant AVANT la premiere revue couteuse (low/central/high),
 *                                     ECONOMIC_OUTLIER_WARNING, ECONOMIC_REVIEW_REQUIRED (gate humain, jamais un blocage scientifique)
 *   countReviewUnits(...)           : reviewDocuments (1 par jumeau x cible) vs reviewItems (findings) — jamais confondus
 *   reviewMarginalContribution(...) : contribution marginale post-revue par jumeau (positions independantes, doublons, divergences, gaps)
 */
const crypto = require("crypto");
const sha = (s) => crypto.createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");
const round2 = (v) => Math.round(v * 100) / 100, round4 = (v) => Math.round(v * 1e4) / 1e4;
const arr = (v) => (Array.isArray(v) ? v : []);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const quantile = (xs, q) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };

const POLICY_ID = "SUFFICIENCY_FIRST";
const ECONOMIC_STATE = Object.freeze({ CONTINUE: "ECONOMIC_CONTINUE", STOPPED_SUFFICIENT: "STOPPED_PANEL_SUFFICIENT", STOPPED_BUDGET: "PANEL_INCOMPLETE_BUDGET_LIMIT", EXHAUSTED: "POOL_EXHAUSTED" });
const CODES = Object.freeze({ BUDGET_LIMIT: "PANEL_INCOMPLETE_BUDGET_LIMIT", DIMINISHING: "DIMINISHING_INFORMATION_RETURNS", OUTLIER: "ECONOMIC_OUTLIER_WARNING", REVIEW_REQUIRED: "ECONOMIC_REVIEW_REQUIRED", SUFFICIENT: "PANEL_SUFFICIENT" });
const REVIEW_TARGET_MODES = Object.freeze(["MISSION_DOSSIER", "PER_DOCUMENT"]);
const DEFAULTS = Object.freeze({
  policy: POLICY_ID, capIsGuardNotTarget: true,
  minProfessionalsPerCoreDiscipline: 1, targetProfessionalsPerCoreDiscipline: 2, maxProfessionalsPerCoreDisciplineBeforeReassess: 3,
  expansionBatch: 4, diminishingReturnsBatches: 3, budgetAwareExpansion: true, minCostSamples: 3,
  reviewTargetMode: "MISSION_DOSSIER", dossierMaxChars: 400000,
  economicReviewThresholdUsd: 40, economicOutlierUsd: 40, kpiStandardUsd: [10, 25], kpiComplexUsd: [25, 40],
});

function normalizeEconomicPolicy(input) {
  const p = Object.assign({}, DEFAULTS, input || {}); delete p.$comment;
  p.capIsGuardNotTarget = true;   /* non desactivable : le plafond n'est jamais une cible */
  ["minProfessionalsPerCoreDiscipline", "targetProfessionalsPerCoreDiscipline", "maxProfessionalsPerCoreDisciplineBeforeReassess", "expansionBatch", "diminishingReturnsBatches", "minCostSamples"].forEach((k) => { p[k] = Math.max(1, Math.floor(Number(p[k]) || DEFAULTS[k])); });
  if (REVIEW_TARGET_MODES.indexOf(p.reviewTargetMode) === -1) p.reviewTargetMode = DEFAULTS.reviewTargetMode;
  p.enabled = p.enabled !== false && p.policy === POLICY_ID;
  return p;
}

/**
 * planBatches({ orderedCandidates: [{ candidateRef, dimension }], dimensions: [id], policy })
 * L'ordre d'entree est l'ordre d'evaluation (selection deterministe, tourniquet par discipline). Lot INITIAL = minProfessionalsPerCoreDiscipline
 * candidats par angle dote d'un vivier (pris dans l'ordre) ; lots d'EXPANSION = tranches de `expansionBatch` candidats dans l'ordre restant.
 * Un candidat appartient a exactement un lot ; aucun candidat n'est deplace (la boucle gelee est sequentielle et n'evalue chacun qu'une fois).
 */
function planBatches(input) {
  const policy = normalizeEconomicPolicy(input.policy); const cands = arr(input.orderedCandidates).filter((c) => c && c.candidateRef);
  const perDim = {}; const initial = [], rest = [];
  cands.forEach((c) => { const d = c.dimension || "(sans dimension)"; perDim[d] = (perDim[d] || 0); if (perDim[d] < policy.minProfessionalsPerCoreDiscipline) { perDim[d]++; initial.push(c.candidateRef); } else rest.push(c.candidateRef); });
  const batches = [{ index: 0, kind: "INITIAL", candidateRefs: initial }];
  for (let i = 0; i < rest.length; i += policy.expansionBatch) batches.push({ index: batches.length, kind: "EXPANSION", candidateRefs: rest.slice(i, i + policy.expansionBatch) });
  if (!initial.length && batches.length > 1) { batches.shift(); batches.forEach((b, i) => { b.index = i; }); batches[0].kind = "INITIAL"; }
  const batchOf = new Map(); batches.forEach((b) => b.candidateRefs.forEach((r) => batchOf.set(r, b.index)));
  return { policy, batches, batchOf, initialPanelSize: batches.length ? batches[0].candidateRefs.length : 0, dimensionsWithPool: Object.keys(perDim).length, totalCandidates: cands.length };
}

/**
 * createEconomicController({ tracker, plan, policy, budget: { mode, costBudgetUsd } | null, spentUsd: () => number, perCandidateUsd: () => number[], historyPerCandidateUsd?: { low, central, high }, log? })
 * -> { beforeEvaluate(candidateRef) -> { evaluate, reason?, stop?, code? }, record(), stopped() }
 * beforeEvaluate : (1) arret deja decide => skip ; (2) autorite scientifique : tracker.shouldEvaluate (PANEL_SUFFICIENT / angle ferme) => skip ;
 * (3) franchissement de lot => reevaluation (contribution marginale du lot clos, rendements decroissants, suffisance, budget du lot suivant).
 */
function createEconomicController(input) {
  const tracker = input.tracker; const plan = input.plan; const policy = normalizeEconomicPolicy(input.policy || plan.policy); const log = typeof input.log === "function" ? input.log : function () {};
  const spentUsd = typeof input.spentUsd === "function" ? input.spentUsd : () => 0; const samplesFn = typeof input.perCandidateUsd === "function" ? input.perCandidateUsd : () => [];
  const budget = input.budget || null; const hist = input.historyPerCandidateUsd || null;
  let currentBatch = 0, stopped = null, consecutiveNoGain = 0; const batchRecords = []; let batchStartRank = 0, batchStartSpent = spentUsd(), batchStartHistoryLen = 0;
  const openBatch = (idx) => { const b = plan.batches[idx]; return { index: idx, kind: b ? b.kind : "EXPANSION", planned: b ? b.candidateRefs.length : 0, startRank: batchStartRank, startSpentUsd: round4(batchStartSpent) }; };
  let open = openBatch(0);

  function estimateNextBatchUsd(idx) {
    const b = plan.batches[idx]; if (!b) return { estimateUsd: null, basis: "NO_BATCH", units: 0 };
    const samples = samplesFn().filter((v) => typeof v === "number" && v >= 0);
    if (samples.length >= policy.minCostSamples) return { estimateUsd: round4(mean(samples) * b.candidateRefs.length), low: round4((quantile(samples, 0.25) || 0) * b.candidateRefs.length), high: round4((quantile(samples, 0.75) || 0) * b.candidateRefs.length), basis: "IN_RUN", samples: samples.length, units: b.candidateRefs.length, perUnitUsd: round4(mean(samples)) };
    if (hist && typeof hist.central === "number") return { estimateUsd: round4(hist.central * b.candidateRefs.length), low: round4((hist.low || hist.central) * b.candidateRefs.length), high: round4((hist.high || hist.central) * b.candidateRefs.length), basis: "HISTORY", units: b.candidateRefs.length, perUnitUsd: round4(hist.central) };
    return { estimateUsd: null, basis: "UNKNOWN", units: b.candidateRefs.length, note: "aucune mesure de cout par candidat (ni dans ce run, ni dans l'historique) : le lot n'est pas bloque, son cout n'est pas projete" };
  }
  function contributionOf(startRank, endRank, startHistoryLen) {
    const rec = tracker.record(); const h = rec.history.slice(startHistoryLen).filter((x) => x.rank != null && x.rank > startRank && x.rank <= endRank);
    const evaluated = h.length; const approvedRows = h.filter((x) => x.approved === true);
    const c = { evaluated, newApproved: approvedRows.length, newDisciplinesCovered: h.filter((x) => arr(x.novelty).indexOf("NEW_SUPPORTED_DIMENSION") !== -1).length, newPartialDisciplines: h.filter((x) => arr(x.novelty).indexOf("NEW_PARTIAL_DIMENSION") !== -1).length,
      newIndependentPositions: h.filter((x) => arr(x.novelty).indexOf("NEW_INDEPENDENT_REPRESENTATIVE") !== -1).length,
      nearDuplicatePositions: approvedRows.filter((x) => arr(x.novelty).indexOf("NEW_INDEPENDENT_REPRESENTATIVE") === -1).length,
      duplicatePositions: approvedRows.filter((x) => arr(x.novelty).indexOf("NEW_INDEPENDENT_REPRESENTATIVE") === -1 && arr(x.novelty).indexOf("NEW_SUPPORTED_DIMENSION") === -1).length,
      notApproved: evaluated - approvedRows.length, perDimension: {} };
    h.forEach((x) => { const d = x.dimension || "(sans dimension)"; if (!c.perDimension[d]) c.perDimension[d] = { evaluated: 0, approved: 0 }; c.perDimension[d].evaluated++; if (x.approved === true) c.perDimension[d].approved++; });
    c.informationGain = c.newDisciplinesCovered + c.newPartialDisciplines + c.newIndependentPositions;   /* somme descriptive de composantes conservees separement (un approuve quasi-doublon n'est pas une information nouvelle) ; jamais une autorite */
    return c;
  }
  function closeBatch() {
    const rec = tracker.record(); const endRank = rec.evaluated; const contrib = contributionOf(open.startRank, endRank, batchStartHistoryLen);
    const cost = round4(spentUsd() - open.startSpentUsd);
    const gain = contrib.informationGain > 0; consecutiveNoGain = gain ? 0 : consecutiveNoGain + 1;
    const r = Object.assign({}, open, { endRank, contribution: contrib, costUsd: cost, costPerNewApproved: contrib.newApproved ? round4(cost / contrib.newApproved) : null, costPerNewDisciplineCovered: contrib.newDisciplinesCovered ? round4(cost / contrib.newDisciplinesCovered) : null, costPerNewIndependentPosition: contrib.newIndependentPositions ? round4(cost / contrib.newIndependentPositions) : null,
      scientificPanelStateAfter: rec.panel, sufficiencyStateAfter: rec.state, approvedCumulative: rec.approved, evaluatedCumulative: rec.evaluated, gapsAfter: rec.coverage.gaps.slice(), diminishingReturnsAfter: consecutiveNoGain >= policy.diminishingReturnsBatches });
    batchRecords.push(r); log({ event: "economic_batch_closed", batch: r.index, kind: r.kind, evaluated: contrib.evaluated, newApproved: contrib.newApproved, newDisciplinesCovered: contrib.newDisciplinesCovered, newIndependentPositions: contrib.newIndependentPositions, costUsd: cost, panel: rec.panel, diminishing: r.diminishingReturnsAfter });
    if (r.diminishingReturnsAfter) log({ event: CODES.DIMINISHING, code: CODES.DIMINISHING, consecutiveBatchesWithoutGain: consecutiveNoGain, panel: rec.panel, note: "signal descriptif : n'arrete pas le panel tant que la suffisance scientifique n'est pas atteinte ; suggere requetes pauvres, angle mal defini, corpus sature ou duplication" });
    batchStartRank = endRank; batchStartSpent = spentUsd(); batchStartHistoryLen = rec.history.length;
    return r;
  }
  const deferred = [];   /* candidats NON evalues par arret budgetaire : ni evalues ni « epuises » (le vivier scientifique reste ouvert, reprise possible) */
  function beforeEvaluate(candidateRef) {
    if (stopped) { if (stopped.code === CODES.BUDGET_LIMIT) deferred.push(candidateRef); return { evaluate: false, reason: stopped.code, stop: true, code: stopped.code, deferred: stopped.code === CODES.BUDGET_LIMIT }; }
    const dec = tracker.shouldEvaluate(candidateRef); if (!dec.evaluate) { if (dec.reason === "PANEL_SUFFICIENT" && !stopped) { stopped = { code: CODES.SUFFICIENT, at: "tracker" }; log({ event: "economic_stop", code: CODES.SUFFICIENT, note: "panel suffisant (autorite : PANEL-SUFFICIENCY-v2) : aucun candidat supplementaire, aucun appel" }); } return dec; }
    const b = plan.batchOf.has(candidateRef) ? plan.batchOf.get(candidateRef) : currentBatch;
    while (b > currentBatch) {
      closeBatch();
      const d = tracker.decision();
      if (d.panel === "PANEL_SUFFICIENT") { stopped = { code: CODES.SUFFICIENT, at: "batch-" + currentBatch }; log({ event: "economic_stop", code: CODES.SUFFICIENT }); return { evaluate: false, reason: CODES.SUFFICIENT, stop: true, code: CODES.SUFFICIENT }; }
      const next = currentBatch + 1; const est = estimateNextBatchUsd(next); const spent = spentUsd();
      /* budget LIMITED : le lot n'est pas lance si son estimation depasserait le plafond ; sans estimation (UNKNOWN), le lot n'est lance que s'il reste du budget (le garde-budget reel protege ensuite chaque appel) */
      const limited = policy.budgetAwareExpansion && budget && budget.mode === "LIMITED" && typeof budget.costBudgetUsd === "number";
      const wouldExceed = limited && (est.estimateUsd != null ? (spent + est.estimateUsd > budget.costBudgetUsd) : (spent >= budget.costBudgetUsd));
      if (wouldExceed) {
        stopped = { code: CODES.BUDGET_LIMIT, at: "before-batch-" + next, spentUsd: round4(spent), nextBatchEstimateUsd: est.estimateUsd, costBudgetUsd: budget.costBudgetUsd, basis: est.basis, units: est.units, gaps: d.coverage.gaps.slice(), scientificPanelState: d.panel };
        log({ event: "economic_stop", code: CODES.BUDGET_LIMIT, spentUsd: stopped.spentUsd, nextBatchEstimateUsd: est.estimateUsd, costBudgetUsd: budget.costBudgetUsd, panel: d.panel });
        deferred.push(candidateRef); return { evaluate: false, reason: CODES.BUDGET_LIMIT, stop: true, code: CODES.BUDGET_LIMIT, detail: stopped, deferred: true };
      }
      currentBatch = next; open = openBatch(next); open.nextBatchEstimate = est; log({ event: "economic_batch_opened", batch: next, planned: open.planned, estimate: est, panel: d.panel, gaps: d.coverage.gaps });
    }
    return { evaluate: true, batch: currentBatch };
  }
  function record() {
    const d = tracker.decision(); const currentContribution = contributionOf(open.startRank, d.evaluated, batchStartHistoryLen);
    const economicState = stopped ? (stopped.code === CODES.SUFFICIENT ? ECONOMIC_STATE.STOPPED_SUFFICIENT : ECONOMIC_STATE.STOPPED_BUDGET) : (d.panel === "PANEL_EXHAUSTED_WITH_GAPS" ? ECONOMIC_STATE.EXHAUSTED : ECONOMIC_STATE.CONTINUE);
    const zeroYield = Object.keys(d.perDimension).filter((k) => { const p = d.perDimension[k]; return p.pool && p.pool.evaluated >= policy.maxProfessionalsPerCoreDisciplineBeforeReassess && p.representatives === 0; });
    return { schema: "EvidenceForge.EconomicPanelRecord", schemaVersion: "MONOLITH-v1.0.7", policy: Object.assign({}, policy), capIsGuardNotTarget: true,
      authority: { scientific: "PANEL-SUFFICIENCY-v2 (lib/panel-sufficiency.js) — seule source de PANEL_SUFFICIENT", economic: "SUFFICIENCY_FIRST — peut empecher un lot (budget), jamais fabriquer une suffisance" },
      initialPanelSize: plan.initialPanelSize, plannedBatches: plan.batches.length, currentBatch, batches: batchRecords.slice(), currentBatchInProgress: Object.assign({}, open, { contributionSoFar: currentContribution }),
      evaluated: d.evaluated, skipped: d.skipped, deferredByBudget: deferred.length, approved: d.approved, scientificPanelState: d.panel, sufficiencyState: d.state, gaps: d.coverage.gaps, economicState, stopped: stopped ? Object.assign({}, stopped) : null,
      diminishingReturns: { active: consecutiveNoGain >= policy.diminishingReturnsBatches, consecutiveBatchesWithoutGain: consecutiveNoGain, threshold: policy.diminishingReturnsBatches, zeroYieldDimensions: zeroYield, descriptiveOnly: true },
      averageMarginalGainPerBatch: (() => { const withEval = batchRecords.filter((b) => b.contribution.evaluated > 0); return withEval.length ? round4(mean(withEval.map((b) => b.contribution.informationGain))) : null; })(), batchesWithEvaluations: batchRecords.filter((b) => b.contribution.evaluated > 0).length,
      duplicateReviewRate: (() => { const ap = batchRecords.reduce((n, b) => n + b.contribution.newApproved, 0), dup = batchRecords.reduce((n, b) => n + b.contribution.nearDuplicatePositions, 0); return ap ? round4(dup / ap) : null; })(),
      statement: economicState === ECONOMIC_STATE.STOPPED_SUFFICIENT ? "Panel suffisant (autorité : PANEL-SUFFICIENCY-v2) : évaluation arrêtée, aucun professionnel supplémentaire." : economicState === ECONOMIC_STATE.STOPPED_BUDGET ? "Lot suivant non lancé : son coût estimé dépasserait le budget. Le panel reste INCOMPLET (jamais présenté comme suffisant) ; reprise possible après augmentation du budget." : economicState === ECONOMIC_STATE.EXHAUSTED ? "Vivier épuisé sans suffisance : manque déclaré, pas une suffisance." : "Évaluation par lots en cours ; réévaluation à chaque lot." };
  }
  return { beforeEvaluate, record, stopped: () => stopped, policy, plan };
}

/** REVIEW FANOUT CONTROL — buildReviewTargets({ documents: [{ documentId, title|name, content, hashSha256|sha256 }], mode, dossierMaxChars }) */
function buildReviewTargets(input) {
  const docs = arr(input.documents); const policy = normalizeEconomicPolicy(input.policy || {}); let mode = input.mode || policy.reviewTargetMode; const maxChars = Number(input.dossierMaxChars || policy.dossierMaxChars);
  const one = (d, i) => ({ documentId: d.documentId || ("doc-" + (i + 1)), title: d.title || d.name || d.documentId, content: String(d.content || ""), hashSha256: d.hashSha256 || d.sha256 || sha(String(d.content || "")) });
  const list = docs.map(one); let fallbackReason = null;
  if (mode === "MISSION_DOSSIER" && list.length > 1) {
    const total = list.reduce((n, d) => n + d.content.length, 0);
    if (total > maxChars) { fallbackReason = "DOSSIER_TOO_LARGE: " + total + " caracteres > dossierMaxChars " + maxChars + " — repli PER_DOCUMENT (explicite, journalise)"; mode = "PER_DOCUMENT"; }
  }
  if (mode === "MISSION_DOSSIER" && list.length > 1) {
    let pos = 0; const spans = []; const parts = list.map((d, i) => { const head = "===== DOCUMENT " + (i + 1) + " / " + list.length + " : " + d.title + " =====\n"; const body = head + d.content + "\n\n"; spans.push({ documentId: d.documentId, title: d.title, hashSha256: d.hashSha256, startChar: pos + head.length, endChar: pos + head.length + d.content.length, characters: d.content.length }); pos += body.length; return body; });
    const content = parts.join(""); const label = "Dossier de mission (" + list.length + " documents)";
    return { mode: "MISSION_DOSSIER", fallbackReason: null, targets: [{ documentId: "dossier-" + sha(content).slice(0, 12), title: label, content, hashSha256: sha(content), sourceDocuments: spans }], sourceDocumentCount: list.length, reviewsPerTwin: 1, aggregationGroupsPerDimension: 1, characters: content.length };
  }
  /* 0 ou 1 document en mode dossier : la cible est le document lui-meme (aucun en-tete ajoute, citations litterales inchangees) ; le mode reste MISSION_DOSSIER (1 revue par jumeau) */
  const effectiveMode = mode === "MISSION_DOSSIER" && list.length <= 1 ? "MISSION_DOSSIER" : "PER_DOCUMENT";
  return { mode: effectiveMode, fallbackReason, targets: list.map((d) => Object.assign({}, d, { sourceDocuments: [{ documentId: d.documentId, title: d.title, hashSha256: d.hashSha256, startChar: 0, endChar: d.content.length, characters: d.content.length }] })), sourceDocumentCount: list.length, reviewsPerTwin: list.length, aggregationGroupsPerDimension: list.length, characters: list.reduce((n, d) => n + d.content.length, 0) };
}

/**
 * projectDownstream({ approved, expectedTwins?, targets, dimensions, spentUsd, perReviewUsd: number[] | null, historyPerReviewUsd?: {low,central,high}, perCoverageUsd: number[] | null,
 *   coverageRetryRate?, reviewRetryRate?, aggregationPerGroupUsd?, thresholdUsd, outlierUsd, budget? })
 * Projection AVANT la premiere revue couteuse : unites = revues attendues (jumeaux x cibles), appels de couverture (1 par admis), agregation (cibles x angles).
 * Jamais une garantie ; UNKNOWN quand rien n'est mesurable (aucun tarif invente).
 */
function projectDownstream(input) {
  const approved = Number(input.approved || 0); const twins = input.expectedTwins != null ? Number(input.expectedTwins) : approved; const targets = Math.max(0, Number(input.targets || 0)); const dims = Math.max(0, Number(input.dimensions || 0));
  const reviews = twins * targets; const coverageCalls = approved; const aggregationGroups = targets * dims; const spent = Number(input.spentUsd || 0);
  const pick = (samples, hist) => { const s = arr(samples).filter((v) => typeof v === "number" && v >= 0); if (s.length >= (input.minSamples || 3)) return { low: quantile(s, 0.25), central: mean(s), high: quantile(s, 0.75), basis: "IN_RUN", n: s.length }; if (hist && typeof hist.central === "number") return { low: hist.low != null ? hist.low : hist.central, central: hist.central, high: hist.high != null ? hist.high : hist.central, basis: "HISTORY", n: hist.n || null }; return null; };
  const rv = pick(input.perReviewUsd, input.historyPerReviewUsd), cv = pick(input.perCoverageUsd, input.historyPerCoverageUsd);
  const rr = 1 + Math.max(0, Number(input.reviewRetryRate || 0)), cr = 1 + Math.max(0, Number(input.coverageRetryRate || 0)); const aggU = typeof input.aggregationPerGroupUsd === "number" ? input.aggregationPerGroupUsd : null;
  const parts = []; let low = 0, central = 0, high = 0, unknown = [];
  const add = (label, units, u, factor) => { if (units === 0) { parts.push({ label, units, low: 0, central: 0, high: 0, basis: "NONE" }); return; } if (!u) { unknown.push(label); parts.push({ label, units, basis: "UNKNOWN" }); return; } const l = u.low * units * factor, c = u.central * units * factor, h = u.high * units * factor; low += l; central += c; high += h; parts.push({ label, units, low: round2(l), central: round2(c), high: round2(h), basis: u.basis, perUnitUsd: round4(u.central), retryFactor: factor }); };
  /* couverture EF-02D3 (1 appel par admis, + reprises) : mesuree dans ce run ou l'historique ; sinon PROXY = cout unitaire d'une revue mesure (prompts de taille comparable ; jamais un tarif invente) */
  add("couverture (1 appel par professionnel admis)", coverageCalls, cv || (rv ? Object.assign({}, rv, { basis: "PROXY_REVIEW_UNIT" }) : null), cr); add("revues (jumeaux × cibles)", reviews, rv, rr);
  /* agregation (1 appel par groupe cible x angle) : cout unitaire mesure si disponible, sinon PROXY = cout unitaire d'une revue mesure (borne prudente issue de mesures, jamais un tarif invente) */
  add("agrégation (cibles × angles)", aggregationGroups, aggU != null ? { low: aggU, central: aggU, high: aggU, basis: "ESTIMATE" } : (rv ? Object.assign({}, rv, { basis: "PROXY_REVIEW_UNIT" }) : null), 1);
  const status = unknown.length ? "PARTIAL" : "PROJECTED"; const thr = Number(input.thresholdUsd != null ? input.thresholdUsd : DEFAULTS.economicReviewThresholdUsd), out = Number(input.outlierUsd != null ? input.outlierUsd : DEFAULTS.economicOutlierUsd);
  const totalCentral = status === "PROJECTED" ? round2(spent + central) : null, totalLow = round2(spent + low), totalHigh = status === "PROJECTED" ? round2(spent + high) : null;
  const driver = parts.filter((p) => p.central != null).sort((a, b) => b.central - a.central)[0] || null;
  const outlier = totalCentral != null ? totalCentral > out : totalLow > out; const reviewRequired = totalCentral != null ? totalCentral > thr : totalLow > thr;
  return { schema: "EvidenceForge.DownstreamProjection", schemaVersion: "MONOLITH-v1.0.7", label: "ESTIMATE — NOT GUARANTEE", notGuarantee: true, status,
    INITIAL_PANEL_SIZE: input.initialPanelSize != null ? input.initialPanelSize : null, PANEL_SIZE: approved, EXPECTED_TWINS: twins, EXPECTED_REVIEWS: reviews, EXPECTED_REVIEW_CALLS: Math.round(reviews * rr), EXPECTED_COVERAGE_CALLS: Math.round(coverageCalls * cr), EXPECTED_AGGREGATION_GROUPS: aggregationGroups, targets, dimensions: dims,
    spentUsd: round2(spent), LOW_COST: totalLow, CENTRAL_COST: totalCentral, HIGH_COST: totalHigh, remaining: { low: round2(low), central: status === "PROJECTED" ? round2(central) : null, high: status === "PROJECTED" ? round2(high) : null }, parts, unknown,
    mainCostDriver: driver ? driver.label : null, ECONOMIC_OUTLIER_WARNING: outlier, ECONOMIC_REVIEW_REQUIRED: reviewRequired, thresholdUsd: thr, outlierUsd: out,
    budgetExceeded: input.budget && input.budget.mode === "LIMITED" && typeof input.budget.costBudgetUsd === "number" ? ((totalCentral != null ? totalCentral : totalLow) > input.budget.costBudgetUsd) : null,
    kpi: totalCentral == null ? null : (totalCentral <= DEFAULTS.kpiStandardUsd[1] ? "STANDARD" : totalCentral <= DEFAULTS.kpiComplexUsd[1] ? "COMPLEX" : "EXCEPTIONAL"),
    userMessage: outlier ? "Cette mission est inhabituellement coûteuse." : null };
}

/** reviewDocuments (revues completes, 1 par jumeau x cible) et reviewItems (findings) — jamais confondus. */
function countReviewUnits(reviewSet) {
  const reviews = arr(reviewSet && reviewSet.reviews); const complete = reviews.filter((r) => r.reviewStatus === "complete");
  const items = reviews.reduce((n, r) => n + arr(r.findings).length, 0); const itemsComplete = complete.reduce((n, r) => n + arr(r.findings).length, 0);
  const twins = new Set(reviews.map((r) => r.twinId || r.professionalRef)), targets = new Set(reviews.map((r) => r.targetId));
  return { reviewDocuments: reviews.length, reviewDocumentsComplete: complete.length, reviewItems: items, reviewItemsComplete: itemsComplete, twinsReviewed: twins.size, targets: targets.size, reviewsExpected: reviewSet && reviewSet.summary ? reviewSet.summary.reviewsExpected : null };
}

/** Contribution marginale POST-REVUE par jumeau (ordre du panel) : positions independantes nouvelles, doublons, divergences et gaps nouveaux — descriptif. */
function reviewMarginalContribution(input) {
  const twinsOrder = arr(input.twinsOrder); const reviews = arr(input.reviewSet && input.reviewSet.reviews); const agg = input.aggregation || {};
  const findingsByTwin = new Map(); reviews.forEach((r) => { const t = r.twinId; if (!findingsByTwin.has(t)) findingsByTwin.set(t, []); arr(r.findings).forEach((f) => findingsByTwin.get(t).push(f)); });
  const groups = arr(agg.aggregates); const ownerOfFinding = new Map(); reviews.forEach((r) => arr(r.findings).forEach((f) => { if (f.findingId) ownerOfFinding.set(f.findingId, r.twinId); }));
  const seenConv = new Set(), seenDiv = new Set(), seenGap = new Set(), seenPos = new Set(); const out = [];
  twinsOrder.forEach((twinId, i) => {
    const fs = findingsByTwin.get(twinId) || []; let newIndependentPositions = 0, duplicatePositions = 0, nearDuplicatePositions = 0, newDivergences = 0, newEvidenceGaps = 0, newReservations = 0, newRequirements = 0;
    fs.forEach((f) => { const pos = (f.dimensionId || "") + "|" + (f.disposition || ""); if (!seenPos.has(pos)) { seenPos.add(pos); newIndependentPositions++; if (f.disposition === "recommendation") newRequirements++; } else nearDuplicatePositions++; if (f.epistemicStatus && /cautious|not_determinable|notDeterminable/i.test(String(f.epistemicStatus))) newReservations++; });
    groups.forEach((g) => { arr(g.convergences).forEach((c) => { const mine = arr(c.findingIds).some((id) => ownerOfFinding.get(id) === twinId); if (!mine) return; if (seenConv.has(c.convergenceId)) duplicatePositions++; else seenConv.add(c.convergenceId); });
      arr(g.divergences).forEach((d) => { const mine = arr(d.branches).some((b) => arr(b.findingIds).some((id) => ownerOfFinding.get(id) === twinId)); if (mine && !seenDiv.has(d.divergenceId)) { seenDiv.add(d.divergenceId); newDivergences++; } });
      arr(g.evidenceGaps).forEach((gap) => { const id = typeof gap === "string" ? gap : (gap && (gap.findingId || gap.id)); if (id && ownerOfFinding.get(id) === twinId && !seenGap.has(id)) { seenGap.add(id); newEvidenceGaps++; } }); });
    out.push({ order: i + 1, twinId, findings: fs.length, marginalContribution: { newRequirements, newReservations, newDivergences, newEvidenceGaps, newIndependentPositions, duplicatePositions, nearDuplicatePositions }, redundant: fs.length > 0 && newIndependentPositions === 0 && newDivergences === 0 && newEvidenceGaps === 0 && newRequirements === 0 && newReservations === 0 });
  });
  const redundant = out.filter((o) => o.redundant).length;
  return { schema: "EvidenceForge.ReviewMarginalContribution", schemaVersion: "MONOLITH-v1.0.7", descriptiveOnly: true, twins: out, redundantTwins: redundant, duplicateReviewRate: out.length ? round4(redundant / out.length) : null, note: "descriptif : une revue redondante n'est jamais supprimee ; la divergence est conservee (information utile)" };
}

module.exports = { POLICY_ID, ECONOMIC_STATE, CODES, DEFAULTS, REVIEW_TARGET_MODES, normalizeEconomicPolicy, planBatches, createEconomicController, buildReviewTargets, projectDownstream, countReviewUnits, reviewMarginalContribution };
