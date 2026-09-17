"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/panel-sufficiency.js
 * SUFFISANCE DU PANEL — regle PANEL-SUFFICIENCY-v2, strategie MIN_INDEPENDENT_REPRESENTATION. Machine a etats DETERMINISTE alimentee
 * uniquement par des sorties deja produites (decision du gate gele par candidat, dimensions soutenues, oeuvres citees, sources-graines) :
 * aucun appel LLM pour decider. Elle ne pretend pas demontrer une verite scientifique : elle applique une POLITIQUE PRODUIT explicite,
 * versionnee, configurable et tracee (`policy.provenance = PRODUCT_POLICY`), adossee a UN plancher contractuel lu dans le lot gele :
 * l'invariant anti-mono-jumeau de l'agregation (MONO-01 EF-03C : une convergence exige >= 2 jumeaux independants).
 *
 *   Representation d'un angle  = candidats APPROUVES par le gate gele (jamais « SUPPORTED » seul) dont la pertinence soutient cet angle
 *                                (meme definition que la couverture G-6 du gate).
 *   Independance                = deux representants sont independants s'ils ne partagent AUCUNE oeuvre citee pour l'angle (identite
 *                                workRef / DOI / titre canonique ; un representant sans oeuvre identifiable n'est jamais compte independant) ET aucune
 *                                source-graine ; nombre de representants independants = plus grand ensemble deux a deux independants,
 *                                construit gloutonnement dans l'ordre d'evaluation (deterministe).
 *   Angle SUFFISANT            <=> representants >= minimumAdmissibleRepresentativesPerDimension (PRODUCT_POLICY)
 *                                ET independants >= minimumIndependentRepresentativesPerDimension (CONTRACTUAL_FLOOR = 2).
 *   Etats par angle : DIMENSION_CONTINUE | DIMENSION_SUFFICIENT | DIMENSION_EXHAUSTED_PARTIAL | DIMENSION_EXHAUSTED_EMPTY | DIMENSION_NO_POOL
 *   Etats du panel  : PANEL_CONTINUE | PANEL_SUFFICIENT | PANEL_EXHAUSTED_WITH_GAPS   (« on a assez » n'est jamais confondu avec « on ne peut plus trouver »)
 *   Early-stop      : EARLY_STOP_CONFIRMED uniquement sur PANEL_SUFFICIENT ; EARLY_STOP_CANDIDATE = plateau (signal) ; sinon EARLY_STOP_CONTINUE.
 * Un angle SUFFISANT est ferme (ses candidats de dimension primaire ne sont plus evalues) ; un vivier epuise n'est jamais « suffisant ».
 * Le plafond (cap) reste une garde ; le budget garde la priorite (verifie avant chaque appel, en amont de ce module). Aucun nom de cas.
 */
const STATES = Object.freeze({ CONTINUE: "EARLY_STOP_CONTINUE", CANDIDATE: "EARLY_STOP_CANDIDATE", CONFIRMED: "EARLY_STOP_CONFIRMED" });
const DIM = Object.freeze({ CONTINUE: "DIMENSION_CONTINUE", SUFFICIENT: "DIMENSION_SUFFICIENT", EXHAUSTED_PARTIAL: "DIMENSION_EXHAUSTED_PARTIAL", EXHAUSTED_EMPTY: "DIMENSION_EXHAUSTED_EMPTY", NO_POOL: "DIMENSION_NO_POOL" });
const PANEL = Object.freeze({ CONTINUE: "PANEL_CONTINUE", SUFFICIENT: "PANEL_SUFFICIENT", EXHAUSTED_WITH_GAPS: "PANEL_EXHAUSTED_WITH_GAPS" });
const RULE_ID = "PANEL-SUFFICIENCY-v2";
const CONTRACTUAL_FLOOR = Object.freeze({ minimumIndependentRepresentativesPerDimension: 2, source: "MONO-01 EF-03C (gele) : invariant anti-mono-jumeau — une convergence exige >= 2 jumeaux independants (twinRefs.length < 2 => rejetee)" });
const DEFAULT_POLICY = Object.freeze({
  id: RULE_ID, strategy: "MIN_INDEPENDENT_REPRESENTATION", provenance: "PRODUCT_POLICY",
  minimumAdmissibleRepresentativesPerDimension: 3,       /* PRODUCT_POLICY : marge au-dessus du plancher contractuel (un admis peut ne pas donner de jumeau) — jamais un seuil scientifique */
  minimumIndependentRepresentativesPerDimension: 2,      /* CONTRACTUAL_FLOOR : ne peut etre abaisse sous 2 (voir CONTRACTUAL_FLOOR.source) */
  independence: ["SUPPORTING_WORKS", "SEED_SOURCES"],
  closeDimensionWhenSufficient: true,
  plateau: { minEvaluatedPerDimension: 3, windowFactor: 2, windowMin: 10, graceFactor: 2, closeOnPlateau: false },
});
const dimId = (d) => (typeof d === "string" ? d : (d && (d.dimensionId || d.id)) || null);
const canon = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/** Normalise une policy (nouvelle forme, ou forme v1 a plat) ; le plancher contractuel ne peut pas etre abaisse. */
function normalizePolicy(input) {
  input = input || {}; const p = Object.assign({}, DEFAULT_POLICY, input.policy || {});
  if (input.targetAdmissiblePerDimension != null && input.policy == null) p.minimumAdmissibleRepresentativesPerDimension = Number(input.targetAdmissiblePerDimension);   /* compat v1 */
  const pl = Object.assign({}, DEFAULT_POLICY.plateau, (input.policy && input.policy.plateau) || {});
  ["minEvaluatedPerDimension", "closeOnPlateau"].forEach((k) => { if (input[k] != null && input.policy == null) pl[k] = input[k]; }); if (input.plateauWindowFactor != null && input.policy == null) pl.windowFactor = input.plateauWindowFactor; if (input.plateauWindowMin != null && input.policy == null) pl.windowMin = input.plateauWindowMin; if (input.plateauGraceFactor != null && input.policy == null) pl.graceFactor = input.plateauGraceFactor;
  if (input.closeDimensionOnTarget != null && input.policy == null) p.closeDimensionWhenSufficient = input.closeDimensionOnTarget;
  p.plateau = pl; p.enabled = input.enabled !== false;
  p.minimumIndependentRepresentativesPerDimension = Math.max(CONTRACTUAL_FLOOR.minimumIndependentRepresentativesPerDimension, Number(p.minimumIndependentRepresentativesPerDimension) || 0);
  p.minimumAdmissibleRepresentativesPerDimension = Math.max(p.minimumIndependentRepresentativesPerDimension, Number(p.minimumAdmissibleRepresentativesPerDimension) || 0);
  p.independence = Array.isArray(p.independence) ? p.independence.slice() : DEFAULT_POLICY.independence.slice(); delete p.$comment; delete p.plateau.$comment;
  return p;
}

/** Identites d'oeuvres citees pour un angle : workRef (OpenAlex) prioritaire, sinon DOI, sinon titre canonique ; une reference non identifiable est ignoree. */
function workIdentities(refs, supportingWorks) {
  const byTitle = new Map(), byDoi = new Map();
  (supportingWorks || []).forEach((w) => { if (!w) return; const id = isStr(w.workRef) ? w.workRef : (isStr(w.doi) ? w.doi.toLowerCase() : (isStr(w.title) ? "title:" + canon(w.title) : null)); if (!id) return; if (isStr(w.title)) byTitle.set(canon(w.title), id); if (isStr(w.doi)) byDoi.set(w.doi.toLowerCase(), id); });
  const out = new Set(); (refs || []).forEach((r) => { if (!isStr(r)) return; const id = byDoi.get(r.toLowerCase()) || byTitle.get(canon(r)); if (id) out.add(id); }); return out;
}

/**
 * createSufficiencyTracker({ dimensions: [id], candidates: [{ candidateRef, dimension, seedWorkRefs? }], policy })
 * -> { observe(o), shouldEvaluate(candidateRef), skip(candidateRef, reason), decision(), record(), policy }
 * observe(o) : { candidateRef, corpus, relevanceClass, approved (decision du gate gele : true/false/null), supportedDimensions, partialDimensions,
 *               supportingDimensionsDetail: [{ dimensionId, supportingWorkRefs }], supportingWorks: [{ workRef, doi, title }], seedWorkRefs: [] }
 */
function createSufficiencyTracker(input) {
  input = input || {}; const policy = normalizePolicy(input.policy || {});
  const dims = (input.dimensions || []).map(dimId).filter(Boolean); const D = Math.max(1, dims.length);
  const window = Math.max(policy.plateau.windowMin, Math.round(policy.plateau.windowFactor * D)); const grace = Math.round(policy.plateau.graceFactor * D);
  const pool = {}; const primary = new Map(); const seedsOf = new Map();
  const mkPool = (d) => ({ dimensionId: d, candidates: 0, evaluated: 0, skipped: 0, remaining: 0 });
  (input.candidates || []).forEach((c) => { const d = dimId(c.dimension) || "(sans dimension)"; primary.set(c.candidateRef, d); if (Array.isArray(c.seedWorkRefs)) seedsOf.set(c.candidateRef, c.seedWorkRefs.filter(isStr)); if (!pool[d]) pool[d] = mkPool(d); pool[d].candidates++; pool[d].remaining++; });
  const rep = {}; dims.forEach((d) => { rep[d] = { dimensionId: d, representatives: [], independent: [], works: new Set(), seeds: new Set(), closed: false, closedReason: null, closedAtRank: null }; });
  const covS = new Set(), covP = new Set(); let rank = 0, lastNovelty = 0, approvedTotal = 0, candidateAt = null, confirmedAt = null, state = STATES.CONTINUE; const history = []; const skippedSet = new Set();
  const useWorks = policy.independence.indexOf("SUPPORTING_WORKS") !== -1, useSeeds = policy.independence.indexOf("SEED_SOURCES") !== -1;
  /** un representant sans aucune oeuvre identifiable citee pour l'angle (reference non resolue / inventee) ne peut jamais etre compte independant : independance non verifiable */
  function verifiable(e) { return !useWorks || e.works.size > 0; }
  function independentOf(a, b) { if (useWorks && Array.from(a.works).some((w) => b.works.has(w))) return false; if (useSeeds && Array.from(a.seeds).some((s) => b.seeds.has(s))) return false; return true; }
  function dimState(d) {
    const r = rep[d]; const p = pool[d]; const n = r.representatives.length, ni = r.independent.length;
    if (n >= policy.minimumAdmissibleRepresentativesPerDimension && ni >= policy.minimumIndependentRepresentativesPerDimension) return DIM.SUFFICIENT;
    if (!p) return DIM.NO_POOL; if (p.remaining > 0) return DIM.CONTINUE; return n > 0 ? DIM.EXHAUSTED_PARTIAL : DIM.EXHAUSTED_EMPTY;
  }
  function panelState() {
    const states = dims.map(dimState); if (dims.length && states.every((s) => s === DIM.SUFFICIENT)) return PANEL.SUFFICIENT;
    const anythingLeft = Object.keys(pool).some((d) => pool[d].remaining > 0); if (!anythingLeft) return PANEL.EXHAUSTED_WITH_GAPS; return PANEL.CONTINUE;
  }
  function evalState() {
    if (!policy.enabled) return STATES.CONTINUE;
    const ps = panelState(); if (ps === PANEL.SUFFICIENT) return STATES.CONFIRMED; if (ps === PANEL.EXHAUSTED_WITH_GAPS) return STATES.CONTINUE;   /* plus rien a evaluer : ce n'est pas un arret anticipe, c'est un manque declare */
    const sampled = Object.keys(pool).every((d) => pool[d].evaluated >= policy.plateau.minEvaluatedPerDimension || pool[d].remaining === 0); const since = rank - lastNovelty;
    if (sampled && since >= window) { if (policy.plateau.closeOnPlateau && since >= window + grace) return STATES.CONFIRMED; return STATES.CANDIDATE; }
    return STATES.CONTINUE;
  }
  function observe(o) {
    o = o || {}; if (o.candidateRef && skippedSet.has(o.candidateRef)) return { state, novelty: [], ignored: "SKIPPED" };
    if (o.ignore) return { state, novelty: [], ignored: String(o.ignore) };   /* ex. parcours a vide apres verrou de transport : jamais une evaluation */
    const d = primary.get(o.candidateRef) || dimId(o.dimension) || "(sans dimension)"; if (!pool[d]) pool[d] = mkPool(d);
    rank++; const p = pool[d]; p.evaluated++; if (p.remaining > 0) p.remaining--;
    const sup = new Set((o.supportedDimensions || []).map(dimId).filter(Boolean)), par = new Set((o.partialDimensions || []).map(dimId).filter(Boolean));
    const approved = o.approved === true; const novel = [];
    if (approved) novel.push("APPROVED"); if (Array.from(sup).some((x) => !covS.has(x))) novel.push("NEW_SUPPORTED_DIMENSION"); if (Array.from(new Set([...sup, ...par])).some((x) => !covS.has(x) && !covP.has(x))) novel.push("NEW_PARTIAL_DIMENSION"); if (p.evaluated === 1) novel.push("FIRST_OF_DIMENSION");
    const seeds = new Set((o.seedWorkRefs || seedsOf.get(o.candidateRef) || []).filter(isStr));
    if (approved) { approvedTotal++;
      (o.supportingDimensionsDetail || Array.from(sup).map((x) => ({ dimensionId: x, supportingWorkRefs: [] }))).forEach((sd) => { const x = dimId(sd); if (!x || !rep[x]) return; const works = workIdentities(sd.supportingWorkRefs, o.supportingWorks);
        const entry = { candidateRef: o.candidateRef, rank, works, seeds }; const r = rep[x]; r.representatives.push(entry); works.forEach((w) => r.works.add(w)); seeds.forEach((s) => r.seeds.add(s));
        if (verifiable(entry) && r.independent.every((e) => independentOf(e, entry))) { r.independent.push(entry); if (novel.indexOf("NEW_INDEPENDENT_REPRESENTATIVE") === -1) novel.push("NEW_INDEPENDENT_REPRESENTATIVE"); } }); }
    sup.forEach((x) => covS.add(x)); par.forEach((x) => covP.add(x)); if (novel.length) lastNovelty = rank;
    if (policy.enabled && policy.closeDimensionWhenSufficient) dims.forEach((x) => { const r = rep[x]; if (!r.closed && dimState(x) === DIM.SUFFICIENT) { r.closed = true; r.closedReason = "DIMENSION_SUFFICIENT"; r.closedAtRank = rank; } });
    const prev = state; state = evalState(); if (state === STATES.CANDIDATE && candidateAt === null) candidateAt = rank; if (state === STATES.CONFIRMED && confirmedAt === null) confirmedAt = rank;
    history.push({ rank, candidateRef: o.candidateRef, dimension: d, corpus: o.corpus || null, relevanceClass: o.relevanceClass || null, approved: o.approved === true ? true : (o.approved === false ? false : null), novelty: novel, approvedCumulative: approvedTotal, dimsSupported: covS.size, dimsSupportedOrPartial: new Set([...covS, ...covP]).size, panel: panelState(), state, transition: prev !== state ? prev + "→" + state : null });
    return { state, novelty: novel };
  }
  function shouldEvaluate(candidateRef) { if (!policy.enabled) return { evaluate: true }; if (state === STATES.CONFIRMED) return { evaluate: false, reason: "PANEL_SUFFICIENT" }; const d = primary.get(candidateRef); if (d && rep[d] && rep[d].closed) return { evaluate: false, reason: rep[d].closedReason }; return { evaluate: true }; }
  function skip(candidateRef, reason) { skippedSet.add(candidateRef); const d = primary.get(candidateRef) || "(sans dimension)"; if (pool[d]) { pool[d].skipped++; if (pool[d].remaining > 0) pool[d].remaining--; } history.push({ rank: null, candidateRef, dimension: d, skipped: true, reason: reason || null, state }); }
  function decision() {
    const since = rank - lastNovelty; const perDimension = {}; const reasons = [];
    dims.forEach((d) => { const r = rep[d], p = pool[d] || null; const st = dimState(d); const n = r.representatives.length, ni = r.independent.length;
      const why = st === DIM.SUFFICIENT ? "représenté par " + n + " professionnel(s) approuvé(s), dont " + ni + " indépendant(s) (≥ " + policy.minimumAdmissibleRepresentativesPerDimension + " et ≥ " + policy.minimumIndependentRepresentativesPerDimension + ")"
        : st === DIM.NO_POOL ? "aucun candidat sélectionné pour cet angle" + (n ? " ; " + n + " représentant(s) venus d'autres angles (" + ni + " indépendant(s)), insuffisant" : "")
        : st === DIM.CONTINUE ? n + " représentant(s) approuvé(s) (" + ni + " indépendant(s)) sur cible " + policy.minimumAdmissibleRepresentativesPerDimension + "/" + policy.minimumIndependentRepresentativesPerDimension + ", " + p.remaining + " candidat(s) restant(s)"
        : st === DIM.EXHAUSTED_PARTIAL ? "vivier épuisé sans représentation suffisante : " + n + " représentant(s) (" + ni + " indépendant(s)) sur cible " + policy.minimumAdmissibleRepresentativesPerDimension + "/" + policy.minimumIndependentRepresentativesPerDimension
        : "vivier épuisé sans aucun professionnel approuvé";
      perDimension[d] = { dimensionId: d, state: st, why, representatives: n, independentRepresentatives: ni, representativeRefs: r.representatives.map((e) => e.candidateRef), independentRefs: r.independent.map((e) => e.candidateRef), distinctSupportingWorks: r.works.size, distinctSeedSources: r.seeds.size,
        pool: p ? { initial: p.candidates, evaluated: p.evaluated, skipped: p.skipped, remaining: p.remaining } : null, closed: r.closed, closedReason: r.closedReason, closedAtRank: r.closedAtRank }; reasons.push(d + " : " + st + " — " + why); });
    const ps = panelState();
    const gaps = dims.filter((d) => dimState(d) !== DIM.SUFFICIENT);
    return { schema: "EvidenceForge.PanelSufficiencyDecision", rule: RULE_ID, policy: Object.assign({ contractualFloor: CONTRACTUAL_FLOOR }, policy), state, panel: ps, evaluated: rank, skipped: Object.keys(pool).reduce((a, k) => a + pool[k].skipped, 0), approved: approvedTotal, sinceNovelty: since, plateauWindow: window, plateauGrace: grace, candidateAt, confirmedAt,
      coverage: { dimensions: dims, supported: Array.from(covS), supportedOrPartial: Array.from(new Set([...covS, ...covP])), sufficient: dims.filter((d) => dimState(d) === DIM.SUFFICIENT), gaps, exhaustedPartial: dims.filter((d) => dimState(d) === DIM.EXHAUSTED_PARTIAL), exhaustedEmpty: dims.filter((d) => dimState(d) === DIM.EXHAUSTED_EMPTY), noPool: dims.filter((d) => dimState(d) === DIM.NO_POOL) },
      perDimension, reasons,
      statement: ps === PANEL.SUFFICIENT ? "Panel suffisant selon la politique produit " + RULE_ID + " : chaque angle est représenté par au moins " + policy.minimumAdmissibleRepresentativesPerDimension + " professionnels approuvés dont " + policy.minimumIndependentRepresentativesPerDimension + " indépendants (œuvres et sources-graines distinctes) ; les candidats restants ne sont pas évalués (journalisés). Ce n'est pas une preuve scientifique de complétude."
        : ps === PANEL.EXHAUSTED_WITH_GAPS ? "Vivier épuisé sans représentation suffisante pour " + gaps.length + " angle(s) (" + gaps.join(", ") + ") : le panel s'arrête faute de candidats, pas parce qu'il est suffisant."
        : state === STATES.CANDIDATE ? "Plateau observé (aucune nouveauté depuis " + since + " évaluations) : signal informatif, l'évaluation continue (un plateau n'est pas une preuve de suffisance)." : "Le panel n'est pas encore suffisant selon la politique : l'évaluation continue." };
  }
  return { observe, shouldEvaluate, skip, decision, record: () => Object.assign(decision(), { history }), STATES, DIM, PANEL, policy, window, grace };
}

module.exports = { createSufficiencyTracker, normalizePolicy, workIdentities, STATES, DIM, PANEL, DEFAULT_POLICY, CONTRACTUAL_FLOOR, RULE_ID };
