"use strict";
/**
 * MONO-11 v0.1 — core/autonomous-panel-adapter.js   (audit §8 : machine-gated-adapter + HumanOverride)
 *
 * Fait ce que `panel-gated-adapter.js` (MONO-10 v0.19) fait pour la porte humaine,
 * a partir du PANEL MACHINE : il ne laisse entrer au corpus/jumeaux QUE les
 * candidats AUTO_APPROVED (contrat gateStates.admitsToCorpus), plus les
 * overrides humains APPROVE authentifies, moins les overrides REJECT.
 *
 * L'override humain est OPTIONNEL et passe par l'artefact GELE de MONO-10
 * (`ProfessionalPanelValidation`, validee par `validatePanelValidation` :
 * actes humains reels, preuves resolues, HUMAN_AUTHENTICATED). Le present module
 * n'authentifie donc AUCUN acte humain lui-meme, et ne fabrique jamais un
 * `actorType: "human"` : un acte machine reste machine.
 *
 * Regles :
 *   - AMBIGUOUS n'est admis par personne (ni machine, ni override) ;
 *   - un override APPROVE ne porte que sur AUTO_DEFERRED / INSUFFICIENT / AUTO_REJECTED ;
 *   - un override REJECT retire un AUTO_APPROVED ; DEFER ne change rien ;
 *   - tout override est CONSIGNE sur la decision machine (humanOverride), jamais substitue.
 */
const path = require("path");
const CONTRACTS = require(path.join(__dirname, "..", "contracts", "mono11-contracts.json"));
const ADMITS = CONTRACTS.gateStates.admitsToCorpus;
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * applyHumanOverride({ frozen, panel, panelValidation, assessment, ctx })
 * Rend un NOUVEAU panel (le panel machine n'est jamais mute) avec humanOverride consigne.
 */
function applyHumanOverride(input) {
  input = input || {};
  const panel = input.panel;
  if (!panel || panel.schema !== "EvidenceForge.MachineEvidenceGatePanel") throw Object.assign(new Error("PANEL_REQUIRED"), { code: "PANEL_REQUIRED" });
  if (!input.panelValidation) return Object.assign({}, panel, { humanOverrideApplied: false, humanOverride: null });
  const PG = input.frozen.M10.PG;
  const v = PG.validatePanelValidation(input.panelValidation, input.assessment, input.ctx || {});
  if (!v.valid) {
    const e = new Error("HUMAN_OVERRIDE_INVALID: " + v.problems.slice(0, 3).join(" ; ")); e.code = "HUMAN_OVERRIDE_INVALID"; e.problems = v.problems; throw e;
  }
  const decisions = new Map(); arr(input.panelValidation.decisions).forEach((d) => decisions.set(d.candidateId, d));
  const applied = [], refused = [];
  const newDecisions = panel.decisions.map(function (d) {
    const o = decisions.get(d.candidateId);
    if (!o) return d;
    const authenticated = v.authenticatedByCandidate && v.authenticatedByCandidate.get(d.candidateId) === true;
    const rec = { decision: o.decision, actorType: o.actorType, actorIdentity: o.actorIdentity, decidedAt: o.decidedAt, authenticated: authenticated, effect: null };
    if (!authenticated) { rec.effect = "REFUSED_NOT_AUTHENTICATED"; refused.push(d.candidateId); return Object.assign({}, d, { humanOverride: rec }); }
    if (o.decision === PG.DECISION.APPROVE) {
      if (d.state === "AMBIGUOUS") { rec.effect = "REFUSED_AMBIGUOUS_IDENTITY"; refused.push(d.candidateId); }
      else if (ADMITS.indexOf(d.state) !== -1) { rec.effect = "NO_CHANGE_ALREADY_ADMITTED"; }
      else { rec.effect = "ADMITTED_BY_HUMAN_OVERRIDE"; applied.push(d.candidateId); }
    } else if (o.decision === PG.DECISION.REJECT) {
      rec.effect = ADMITS.indexOf(d.state) !== -1 ? "REMOVED_BY_HUMAN_OVERRIDE" : "NO_CHANGE_NOT_ADMITTED"; if (rec.effect === "REMOVED_BY_HUMAN_OVERRIDE") applied.push(d.candidateId);
    } else rec.effect = "NO_CHANGE_DEFER";
    return Object.assign({}, d, { humanOverride: rec });
  });
  return Object.assign({}, panel, { decisions: newDecisions, humanOverrideApplied: applied.length > 0,
    humanOverride: { validated: true, applied: applied, refused: refused, source: "MONO-10 v0.19 ProfessionalPanelValidation (actes humains authentifies)" } });
}

/** Les candidats admis au corpus : etat machine admissible, corrige par les seuls overrides authentifies. */
function admittedCandidateIds(panel) {
  return arr(panel && panel.decisions).filter(function (d) {
    const o = d.humanOverride;
    if (o && o.effect === "ADMITTED_BY_HUMAN_OVERRIDE") return true;
    if (o && o.effect === "REMOVED_BY_HUMAN_OVERRIDE") return false;
    return ADMITS.indexOf(d.state) !== -1;
  }).map((d) => d.candidateId);
}

/**
 * buildPanelSelection({ panel, dimensionSet, missionQuestion, coverageMatrix })
 * -> PanelSelection (forme EF-02D3-PANEL-v4 attendue par EF-02E), SANS selectPanel :
 *    ni plafond, ni quota, ni gain marginal — l'admission vient du gate.
 */
function buildPanelSelection(input) {
  input = input || {};
  const panel = input.panel, ds = input.dimensionSet, cm = input.coverageMatrix;
  const ids = admittedCandidateIds(panel);
  const evalByRef = new Map(arr(cm && cm.evaluations).map((e) => [e.professionalRef, e]));
  const selected = ids.map(function (id, i) {
    const ev = evalByRef.get(id) || {};
    return { rank: i + 1, professionalRef: id, dimensionJudgments: arr(ev.dimensions), overallNote: ev.overallNote || "" };
  });
  const coverageSummary = {};
  arr(ds && ds.dimensions).forEach(function (d) {
    coverageSummary[d.id] = { label: d.label, providers: selected.filter((p) => p.dimensionJudgments.some((x) => x.id === d.id && ["strong", "moderate"].indexOf(x.level) !== -1)).map((p) => p.professionalRef) };
  });
  return {
    schema: "EvidenceForge.PanelSelection", schemaVersion: "EF-02D3-PANEL-v4",
    missionQuestion: input.missionQuestion || null,
    selectionPolicy: { algorithm: "MONO-11 machine evidence gate (G-1..G-11) ; aucun plafond, aucun quota, aucun classement", coverageThreshold: null, maxPanel: null,
      minMarginalGain: null, redundancyPenalty: null, heuristicPolicyId: null, heuristicPolicyStatus: null,
      fixedQuota: false, noPrestigeWeighting: true, noVoting: true, gatePanelHash: panel.panelHash, humanOverrideApplied: panel.humanOverrideApplied === true },
    dimensions: arr(ds && ds.dimensions), selectedPanel: selected, selectionTrace: [],
    coverageSummary: coverageSummary,
    summary: { panelSize: selected.length, coveredDimensions: Object.values(coverageSummary).filter((c) => c.providers.length).length,
      uncoveredDimensions: Object.entries(coverageSummary).filter(([, c]) => !c.providers.length).map(([id]) => id),
      testMode: true, scientificValidity: false, humanProfessionalValidation: false },
    testMode: true, scientificValidity: false, humanProfessionalValidation: false,
  };
}

/** Restreint un ProfessionalCorpusSet (EF-02C-v2) aux candidats admis. Rien d'autre n'entre. */
function filterCorpusSetToPanel(corpusSet, panel) {
  const ids = new Set(admittedCandidateIds(panel));
  return Object.assign({}, corpusSet, { professionalCorpora: arr(corpusSet && corpusSet.professionalCorpora).filter((c) => ids.has(c.professionalRef)),
    gatedBy: { schema: "EvidenceForge.MachineEvidenceGatePanel", panelHash: panel.panelHash, admitted: Array.from(ids) } });
}

module.exports = { applyHumanOverride, admittedCandidateIds, buildPanelSelection, filterCorpusSetToPanel };
