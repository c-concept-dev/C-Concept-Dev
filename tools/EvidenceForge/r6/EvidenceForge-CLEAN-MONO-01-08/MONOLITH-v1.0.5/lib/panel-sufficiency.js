"use strict";
/**
 * EvidenceForge MONOLITH v1.0.5 — lib/panel-sufficiency.js
 * EARLY-STOP ADAPTATIF de l'evaluation des professionnels (regle PANEL-SUFFICIENCY-v1) : machine a etats DETERMINISTE, alimentee
 * uniquement par les sorties deja produites par la boucle gelee MONO-11 (corpus, classe de pertinence, dimensions soutenues) — aucun
 * appel LLM pour decider. Trois etats :
 *   EARLY_STOP_CONTINUE  : le panel n'est pas demontrablement suffisant ;
 *   EARLY_STOP_CANDIDATE : plateau (aucune nouveaute depuis `window` evaluations, chaque dimension echantillonnee au minimum) — signal
 *                          INFORMATIF par defaut (closeOnPlateau=false : un plateau n'est pas une preuve, voir AUTOPSIE-PANEL-COST-OPTIMIZER) ;
 *   EARLY_STOP_CONFIRMED : SUFFISANCE demontree : chaque dimension de mission ayant des candidats a >= targetAdmissiblePerDimension
 *                          candidats admissibles (SUPPORTED ⇔ admis par le gate gele, invariant G-3) ou son vivier est epuise.
 * Nouveaute (remet le compteur de plateau a zero) : candidat admissible ; nouvelle dimension SUPPORTED ; nouvelle dimension
 * SUPPORTED ∪ PARTIAL ; premier echantillon d'une dimension. Une dimension dont la cible est atteinte est FERMEE (ses candidats
 * restants ne sont plus evalues) ; les autres continuent. Le plafond (cap) reste une garde, jamais une cible ; le budget garde
 * la priorite (verifie avant chaque appel, en amont de ce module). Parametres generiques (config professionals.earlyStop), aucun
 * nombre de cas.
 */
const STATES = Object.freeze({ CONTINUE: "EARLY_STOP_CONTINUE", CANDIDATE: "EARLY_STOP_CANDIDATE", CONFIRMED: "EARLY_STOP_CONFIRMED" });
const DEFAULTS = Object.freeze({ enabled: true, targetAdmissiblePerDimension: 3, minEvaluatedPerDimension: 3, plateauWindowFactor: 2, plateauWindowMin: 10, closeOnPlateau: false, plateauGraceFactor: 2, closeDimensionOnTarget: true });
const RULE_ID = "PANEL-SUFFICIENCY-v1";
const dimId = (d) => (typeof d === "string" ? d : (d && (d.dimensionId || d.id)) || null);

/**
 * createSufficiencyTracker({ dimensions: [id], candidates: [{ candidateRef, dimension }], policy })
 * -> { observe(o), shouldEvaluate(candidateRef), skip(candidateRef, reason), decision(), record() }
 */
function createSufficiencyTracker(input) {
  input = input || {}; const policy = Object.assign({}, DEFAULTS, input.policy || {});
  const dims = (input.dimensions || []).map(dimId).filter(Boolean); const D = Math.max(1, dims.length);
  const window = Math.max(policy.plateauWindowMin, Math.round(policy.plateauWindowFactor * D)); const grace = Math.round(policy.plateauGraceFactor * D);
  const per = {}; const primary = new Map();
  (input.candidates || []).forEach((c) => { const d = dimId(c.dimension) || "(sans dimension)"; primary.set(c.candidateRef, d); if (!per[d]) per[d] = { dimensionId: d, candidates: 0, evaluated: 0, skipped: 0, admissible: 0, remaining: 0, lastNoveltyAt: 0, closed: false, closedReason: null, closedAtRank: null }; per[d].candidates++; per[d].remaining++; });
  const covS = new Set(), covP = new Set(); let rank = 0, lastNovelty = 0, admissible = 0, candidateAt = null, confirmedAt = null, state = STATES.CONTINUE; const history = [];
  const missionDims = dims.filter((d) => per[d]);   /* dimensions de mission ayant au moins un candidat */
  const poolless = dims.filter((d) => !per[d]);
  function evalState() {
    if (!policy.enabled) return STATES.CONTINUE;
    const satisfied = missionDims.every((d) => per[d].admissible >= policy.targetAdmissiblePerDimension || per[d].remaining === 0);
    if (satisfied && missionDims.length) return STATES.CONFIRMED;
    const sampled = missionDims.every((d) => per[d].evaluated >= policy.minEvaluatedPerDimension || per[d].remaining === 0);
    const since = rank - lastNovelty;
    if (sampled && since >= window) { if (policy.closeOnPlateau && since >= window + grace) return STATES.CONFIRMED; return STATES.CANDIDATE; }
    return STATES.CONTINUE;
  }
  function observe(o) {
    o = o || {}; const d = primary.get(o.candidateRef) || dimId(o.dimension) || "(sans dimension)"; if (!per[d]) per[d] = { dimensionId: d, candidates: 0, evaluated: 0, skipped: 0, admissible: 0, remaining: 0, lastNoveltyAt: 0, closed: false, closedReason: null, closedAtRank: null };
    rank++; const p = per[d]; p.evaluated++; if (p.remaining > 0) p.remaining--;
    const sup = new Set((o.supportedDimensions || []).map(dimId).filter(Boolean)), par = new Set((o.partialDimensions || []).map(dimId).filter(Boolean));
    const isAdm = o.relevanceClass === "SUPPORTED"; const novel = []; if (isAdm) novel.push("ADMISSIBLE"); if (Array.from(sup).some((x) => !covS.has(x))) novel.push("NEW_SUPPORTED_DIMENSION"); if (Array.from(new Set([...sup, ...par])).some((x) => !covS.has(x) && !covP.has(x))) novel.push("NEW_PARTIAL_DIMENSION"); if (p.evaluated === 1) novel.push("FIRST_OF_DIMENSION");
    if (isAdm) { admissible++; p.admissible++; } sup.forEach((x) => covS.add(x)); par.forEach((x) => covP.add(x)); if (novel.length) { lastNovelty = rank; p.lastNoveltyAt = p.evaluated; }
    if (policy.enabled && policy.closeDimensionOnTarget && !p.closed && p.admissible >= policy.targetAdmissiblePerDimension) { p.closed = true; p.closedReason = "TARGET_ADMISSIBLE_REACHED"; p.closedAtRank = rank; }
    const prev = state; state = evalState(); if (state === STATES.CANDIDATE && candidateAt === null) candidateAt = rank; if (state === STATES.CONFIRMED && confirmedAt === null) confirmedAt = rank;
    history.push({ rank, candidateRef: o.candidateRef, dimension: d, corpus: o.corpus || null, relevanceClass: o.relevanceClass || null, novelty: novel, admissibleCumulative: admissible, dimsSupported: covS.size, dimsSupportedOrPartial: new Set([...covS, ...covP]).size, state, transition: prev !== state ? prev + "→" + state : null });
    return { state, novelty: novel };
  }
  function shouldEvaluate(candidateRef) { if (!policy.enabled) return { evaluate: true }; if (state === STATES.CONFIRMED) return { evaluate: false, reason: "PANEL_SUFFICIENT" }; const d = primary.get(candidateRef); if (d && per[d] && per[d].closed) return { evaluate: false, reason: "DIMENSION_" + per[d].closedReason }; return { evaluate: true }; }
  function skip(candidateRef, reason) { const d = primary.get(candidateRef) || "(sans dimension)"; if (per[d]) { per[d].skipped++; if (per[d].remaining > 0) per[d].remaining--; } history.push({ rank: null, candidateRef, dimension: d, skipped: true, reason: reason || null, state }); }
  function decision() {
    const since = rank - lastNovelty; const reasons = [];
    missionDims.forEach((d) => { const p = per[d]; if (p.admissible >= policy.targetAdmissiblePerDimension) reasons.push(d + " : cible atteinte (" + p.admissible + " admissible(s))"); else if (p.remaining === 0) reasons.push(d + " : vivier épuisé (" + p.admissible + " admissible(s) sur " + p.evaluated + " évalué(s))"); else reasons.push(d + " : " + p.admissible + "/" + policy.targetAdmissiblePerDimension + " admissible(s), " + p.remaining + " candidat(s) restant(s)"); });
    return { schema: "EvidenceForge.PanelSufficiencyDecision", rule: RULE_ID, policy, state, evaluated: rank, skipped: Object.keys(per).reduce((a, k) => a + per[k].skipped, 0), admissible, sinceNovelty: since, plateauWindow: window, plateauGrace: grace, candidateAt, confirmedAt,
      coverage: { dimensions: dims, withCandidates: missionDims, withoutCandidates: poolless, supported: Array.from(covS), supportedOrPartial: Array.from(new Set([...covS, ...covP])), satisfied: missionDims.filter((d) => per[d].admissible >= policy.targetAdmissiblePerDimension), exhausted: missionDims.filter((d) => per[d].remaining === 0 && per[d].admissible < policy.targetAdmissiblePerDimension) },
      perDimension: per, reasons, statement: state === STATES.CONFIRMED ? "Panel jugé suffisant : chaque angle de mission a atteint sa cible d'admissibles ou a épuisé son vivier ; les candidats restants ne sont pas évalués (journalisés)." : state === STATES.CANDIDATE ? "Plateau observé (aucune nouveauté depuis " + since + " évaluations) : signal informatif, l'évaluation continue (un plateau n'est pas une preuve de suffisance)." : "Le panel n'est pas encore démontrablement suffisant : l'évaluation continue." };
  }
  return { observe, shouldEvaluate, skip, decision, record: () => Object.assign(decision(), { history }), STATES, policy, window, grace };
}

module.exports = { createSufficiencyTracker, STATES, DEFAULTS, RULE_ID };
