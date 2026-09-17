"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/professionals-economics.js
 * INSTRUMENTATION ECONOMIQUE DU PANEL : jointure, en lecture seule, des artefacts existants du run — selection plafonnee
 * (rang = selectionOrder), decouverte (discipline), evaluation MONO-10 (identityConfidence, assessmentStatus), preuves MONO-11
 * (classe de pertinence, dimensions soutenues), gate machine (panelContribution), jumeaux, revues — et du ledger de cout
 * (evaluationCost par candidateRef). Produit professionals-economics.json : une ligne par professionnel selectionne, la courbe
 * cumulee (cout, admis, couverture nouvelle, jumeaux) et des taux. C'est une MESURE destinee a repondre plus tard, sur donnees
 * reelles, a « a partir de combien de professionnels supplementaires le gain devient-il faible ? ». Le plafond (150) reste une
 * garde haute, pas une cible ; AUCUN early-stop n'est introduit (earlyStop.policy = "NONE").
 */
const CL = require("./cost-ledger.js");
const round4 = (v) => Math.round(v * 1e4) / 1e4;
const arr = (v) => (Array.isArray(v) ? v : []);
const dimId = (d) => (typeof d === "string" ? d : (d && (d.dimensionId || d.id || d.dimension)) || null);

function buildProfessionalsEconomics(store) {
  const state = store.read(); if (!state) return null;
  const selection = store.loadJson("professionals-selection.json");
  if (!selection) return { schema: "EvidenceForge.ProfessionalsEconomics", schemaVersion: "MONOLITH-v1.0.5", runId: state.runId, status: "NOT_AVAILABLE", note: "aucune sélection persistée : l'étape des professionnels n'a pas commencé", earlyStop: { policy: "NONE" } };
  let cp = null; try { cp = store.loadCheckpoint("checkpoint-professionals.json"); } catch (e) { cp = null; }
  const disc = store.loadJson("professionals-discovery.json"); const candById = new Map(arr(disc && disc.discovery && disc.discovery.candidates).map((c) => [c.candidateRef, c]));
  const assessment = (cp && cp.assessment) || store.loadJson("assessment.json"); const assById = new Map(arr(assessment && assessment.assessments).map((a) => [a.candidateId, a]));
  const panel = (cp && cp.panel) || store.loadJson("panel.json"); const decById = new Map(arr(panel && panel.decisions).map((d) => [d.candidateId, d]));
  const twins = store.loadJson("twins.json"); const twinBy = new Map(arr(twins && twins.twins).map((t) => [t.professionalRef, t.twinId]));
  const reviews = store.loadJson("reviews.json"); const reviewsBy = new Map(); arr(reviews && reviews.reviews).forEach((r) => { reviewsBy.set(r.professionalRef, (reviewsBy.get(r.professionalRef) || 0) + (r.reviewStatus === "complete" ? 1 : 0)); });
  const events = store.events(); const evById = new Map(); events.filter((e) => e.event === "candidate_evidence" && e.candidateId).forEach((e) => evById.set(e.candidateId, e));
  const relById = new Map(); if (cp && cp.evidence) Object.keys(cp.evidence).forEach((k) => { if (k.indexOf("mono11:relevance:") === 0) relById.set(k.slice("mono11:relevance:".length), cp.evidence[k].artifact || cp.evidence[k]); });
  const entries = CL.readEntries(store.dir); const costBy = new Map(), reuseBy = new Map(), callsBy = new Map();
  entries.forEach((e) => { if (!e.candidateRef) return; if (CL.REAL_KINDS.indexOf(e.kind) !== -1) { costBy.set(e.candidateRef, (costBy.get(e.candidateRef) || 0) + ((e.cost && e.cost.totalUsd) || 0)); callsBy.set(e.candidateRef, (callsBy.get(e.candidateRef) || 0) + 1); } else reuseBy.set(e.candidateRef, (reuseBy.get(e.candidateRef) || 0) + 1); });
  const ledgerPresent = entries.length > 0;
  const seenDims = new Set(); let cum = 0, cumAdmitted = 0, cumNew = 0, cumTwins = 0, cumEvaluated = 0;
  const rows = arr(selection.selectionOrder).map(function (id, i) {
    const c = candById.get(id) || {}; const a = assById.get(id) || {}; const d = decById.get(id) || null; const ev = evById.get(id) || null; const rel = relById.get(id) || null;
    const supporting = rel ? arr(rel.supportingDimensions).map(dimId).filter(Boolean) : []; const partial = rel ? arr(rel.partialDimensions).map(dimId).filter(Boolean) : [];
    const newCov = supporting.filter((x) => !seenDims.has(x)), dupCov = supporting.filter((x) => seenDims.has(x)); supporting.forEach((x) => seenDims.add(x));
    const cost = costBy.get(id) || 0; const evaluated = !!ev; if (evaluated) cumEvaluated++; cum += cost;
    const admitted = d ? d.state === "AUTO_APPROVED_FOR_DOCUMENTARY_PANEL" : null; if (admitted) cumAdmitted++; cumNew += newCov.length; const twin = twinBy.get(id) || null; if (twin) cumTwins++;
    return { rank: i + 1, candidateRef: id, discipline: c.dimensionRef || (arr(c.disciplines)[0]) || null, disciplines: arr(c.disciplines).length ? c.disciplines : (c.dimensionRef ? [c.dimensionRef] : []), discoveryOrigin: a.discoveryOrigin || c.candidateStatus || null,
      identityConfidence: a.identityConfidence || null, assessmentStatus: a.assessmentStatus || null, evaluated, corpusStatus: ev ? ev.corpus : null, relevanceClass: rel ? rel.relevanceClass : (ev ? ev.relevance : null), oracleCalls: ev ? ev.oracleCalls : null,
      evaluationCostUsd: round4(cost), realCalls: callsBy.get(id) || 0, reusedCalls: reuseBy.get(id) || 0, cumulativeCostUsd: round4(cum),
      eligibilityStatus: d ? d.state : null, panelContribution: admitted === null ? null : (admitted ? "ADMITTED" : "NOT_ADMITTED"), reasonCodes: d ? arr(d.reasonCodes) : [], supportingDimensions: supporting, partialDimensions: partial, newCoverage: newCov, duplicateCoverage: dupCov,
      twinProduced: !!twin, twinId: twin, finalUse: reviewsBy.get(id) ? { reviewsComplete: reviewsBy.get(id) } : null, cumulative: { evaluated: cumEvaluated, admitted: cumAdmitted, newCoverage: cumNew, twins: cumTwins } };
  });
  const evaluatedRows = rows.filter((r) => r.evaluated); const admittedRows = rows.filter((r) => r.panelContribution === "ADMITTED"); const twinRows = rows.filter((r) => r.twinProduced);
  const perDimension = {}; rows.forEach((r) => { const k = r.discipline || "(sans dimension)"; if (!perDimension[k]) perDimension[k] = { selected: 0, evaluated: 0, admitted: 0, twins: 0, costUsd: 0 }; const p = perDimension[k]; p.selected++; if (r.evaluated) p.evaluated++; if (r.panelContribution === "ADMITTED") p.admitted++; if (r.twinProduced) p.twins++; p.costUsd = round4(p.costUsd + r.evaluationCostUsd); });
  const states = {}; rows.forEach((r) => { if (r.eligibilityStatus) states[r.eligibilityStatus] = (states[r.eligibilityStatus] || 0) + 1; });
  const lastNew = rows.filter((r) => r.newCoverage.length).map((r) => r.rank).pop() || null; const lastAdmitted = admittedRows.map((r) => r.rank).pop() || null;
  const totalCost = round4(cum);
  const rates = { evaluated: evaluatedRows.length, admitted: admittedRows.length, twins: twinRows.length, eligibilityRate: evaluatedRows.length ? round4(admittedRows.length / evaluatedRows.length) : null,
    rejectionRate: evaluatedRows.length ? round4(rows.filter((r) => r.eligibilityStatus === "AUTO_REJECTED").length / evaluatedRows.length) : null, deferredRate: evaluatedRows.length ? round4(rows.filter((r) => r.eligibilityStatus === "AUTO_DEFERRED").length / evaluatedRows.length) : null,
    costPerEvaluatedUsd: evaluatedRows.length ? round4(totalCost / evaluatedRows.length) : null, costPerAdmittedUsd: admittedRows.length ? round4(totalCost / admittedRows.length) : null, costPerTwinUsd: twinRows.length ? round4(totalCost / twinRows.length) : null,
    distinctDimensionsCovered: seenDims.size, rankOfLastNewCoverage: lastNew, rankOfLastAdmitted: lastAdmitted };
  return { schema: "EvidenceForge.ProfessionalsEconomics", schemaVersion: "MONOLITH-v1.0.5", runId: state.runId, status: cp ? "FROM_CHECKPOINT" : "PARTIAL_IN_PROGRESS", ledgerPresent, generatedAt: new Date().toISOString(),
    capStatus: { cap: selection.cap, poolCount: selection.poolCount, selectedCount: selection.selectedCount, capApplied: selection.capApplied === true, algorithm: selection.algorithm, capIsGuardNotTarget: true, statement: "Le plafond est une garde contre l'explosion du nombre d'évaluations ; il n'est ni une cible ni un optimum : le nombre de professionnels évalués est celui du pool, borné par le plafond." },
    totals: { evaluationCostUsd: totalCost, selected: rows.length }, rates, perDimension, eligibilityStates: states, professionals: rows,
    marginalCurve: rows.map((r) => ({ rank: r.rank, cumulativeCostUsd: r.cumulativeCostUsd, cumulativeEvaluated: r.cumulative.evaluated, cumulativeAdmitted: r.cumulative.admitted, cumulativeNewCoverage: r.cumulative.newCoverage, cumulativeTwins: r.cumulative.twins })),
    earlyStop: { policy: "NONE", statement: "Aucun arrêt anticipé n'est appliqué : cette mesure sert à étudier, sur plusieurs runs réels, le rang à partir duquel le gain (admissions, couverture nouvelle, jumeaux) devient faible ; toute politique future devra déclarer ses invariants avant implémentation." },
    limits: ["le rang suit l'ordre de sélection déterministe (tourniquet par discipline), pas un ordre de pertinence", "newCoverage/duplicateCoverage ne sont connus qu'après persistance du checkpoint (preuves MONO-11)", ledgerPresent ? null : "aucun ledger de coût pour ce run (run antérieur à v1.0.5) : coûts à 0"].filter(Boolean) };
}

module.exports = { buildProfessionalsEconomics };
