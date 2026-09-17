"use strict";
/**
 * MONO-10 v0.6 — core/panel-gated-adapter.js  (§7)
 *
 * Module LIVRE, exporte, consommable hors tests. Il ferme la porte devant la
 * construction du corpus.
 *
 * FERMETURE v0.5 B02/B03 (§10, §11, §12).
 *
 * En v0.5, `buildProfessionalCorpus` filtrait sur le champ
 * `effectiveCorpusEligibility` PORTE PAR L'OBJET reçu. Un appelant qui
 * remplacait ce champ — et le booleen `recomputed` — faisait entrer au corpus
 * des candidats DEFER ou REJECT.
 *
 * v0.6 : l'eligibilite est RECALCULEE JUSTE AVANT L'ENTREE AU CORPUS, depuis la
 * porte humaine authentifiee, la liaison de candidat, le run et la mission.
 * Aucun champ reçu n'est lu comme decision.
 *
 * Le statut de verification produit par un lot amont est HISTORIQUE : il n'est
 * JAMAIS reecrit. L'adaptateur ajoute trois champs distincts et gate sur
 * l'eligibilite DERIVEE, jamais sur un statut maquille.
 *
 * DEFER et REJECT ne franchissent jamais la porte (§7).
 * Le noyau ne connait aucun lot : l'adaptateur de base est INJECTE.
 */

const { isNonEmptyStr, fail } = require("./canonical.js");
const { validatePanelValidation, decisionsById } = require("./panel-gate.js");
const { deriveEffectiveEligibility, isEligible, isEligibleDecision, ELIGIBILITY } = require("./effective-eligibility.js");

const GATE_ID = "MONO-10-v6-panel-gate";

function createPanelGatedAdapter(baseAdapter, opts) {
  opts = opts || {};
  ["discoverProfessionals", "verifyProfessionals", "buildProfessionalCorpus"].forEach(function (m) {
    if (!baseAdapter || typeof baseAdapter[m] !== "function") {
      throw fail("PANEL_GATED_ADAPTER_BASE_INVALID", "adaptateur de base non conforme : methode \"" + m + "\" absente.");
    }
  });

  let cached = null;
  function gate() {
    if (cached) return cached;
    if (!opts.panelValidation || !opts.candidateAssessment) {
      throw fail("PANEL_GATE_MISSING", "aucune ProfessionalPanelValidation liee a une ProfessionalCandidateAssessment — aucun professionnel ne peut etre transmis a la construction du corpus.");
    }
    const v = validatePanelValidation(opts.panelValidation, opts.candidateAssessment, opts.runContext || {});
    if (!v.valid) throw fail("PANEL_VALIDATION_INVALID", v.problems.join(" ; "));
    cached = { validation: v, decisions: decisionsById(opts.panelValidation) };
    return cached;
  }

  async function discoverProfessionals(inputs, ctx) { return baseAdapter.discoverProfessionals(inputs, ctx); }

  async function verifyProfessionals(inputs, ctx) {
    const base = await baseAdapter.verifyProfessionals(inputs, ctx);
    const g = gate();
    const assessmentById = new Map();
    (opts.candidateAssessment.assessments || []).forEach((a) => assessmentById.set(a.candidateId, a));

    const annotated = (base.verified || []).map(function (v) {
      const id = isNonEmptyStr(v.candidateRef) ? v.candidateRef : ("unresolved:" + v.displayName);
      const a = assessmentById.get(id);
      const e = deriveEffectiveEligibility({
        candidateId: id,
        legacyVerificationStatus: v.verificationStatus,        // LU, jamais ecrit
        humanPanelDecision: g.decisions.get(id) || null,
        humanActAuthenticated: g.validation.authenticatedByCandidate
          ? g.validation.authenticatedByCandidate.get(id) === true : false,
        panelGateValid: g.validation.valid === true,
        suppliedEffectiveCorpusEligibility: v.effectiveCorpusEligibility,
        evidenceRefs: (a && a.missionEvidenceRefs) || [],
        policy: opts.eligibilityPolicy,
      });
      return Object.assign({}, v, {
        legacyVerificationStatus: v.verificationStatus,
        humanPanelDecision: e.humanPanelDecision,
        humanActAuthenticated: e.humanActAuthenticated,
        effectiveCorpusEligibility: e.effectiveCorpusEligibility,
        eligibilitySource: e.eligibilitySource,
        eligibilityReason: e.eligibilityReason,
        panelGate: GATE_ID,
      });
    });

    return Object.assign({}, base, {
      verified: annotated,
      panelGate: { gateId: GATE_ID, legacyStatusPreserved: true,
        eligible: annotated.filter((x) => x.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_HUMAN_PANEL_APPROVAL
          || x.effectiveCorpusEligibility === ELIGIBILITY.ELIGIBLE_BY_LEGACY_VERIFICATION).length,
        deferred: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.DEFERRED).length,
        notEligible: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.NOT_ELIGIBLE).length },
    });
  }

  async function buildProfessionalCorpus(inputs, ctx) {
    const g = gate();   // fail-closed : pas de porte valide, pas de corpus
    const ver = inputs && inputs.professionalVerification;
    const verified = (ver && ver.verified) || [];
    const assessmentById = new Map();
    (opts.candidateAssessment.assessments || []).forEach((a) => assessmentById.set(a.candidateId, a));

    // §10 — RECALCUL AU SINK. Rien de ce que porte l'objet reçu n'est cru.
    const decisions = [];
    verified.forEach(function (v) {
      const id = isNonEmptyStr(v.candidateRef) ? v.candidateRef : ("unresolved:" + v.displayName);
      const a = assessmentById.get(id);
      const sinkDecision = deriveEffectiveEligibility({
        candidateId: id,
        legacyVerificationStatus: v.verificationStatus,
        humanPanelDecision: g.decisions.get(id) || null,
        humanActAuthenticated: g.validation.authenticatedByCandidate
          ? g.validation.authenticatedByCandidate.get(id) === true : false,
        panelGateValid: g.validation.valid === true,
        evidenceRefs: (a && a.missionEvidenceRefs) || [],
        policy: opts.eligibilityPolicy,
        suppliedEffectiveCorpusEligibility: v.effectiveCorpusEligibility,
      });
      decisions.push({ candidateRef: id, entry: v, decision: sinkDecision });
    });
    const eligible = decisions.filter((x) => isEligibleDecision(x.decision)).map((x) => x.entry);
    const ignored = decisions.filter((x) => isNonEmptyStr(x.decision.suppliedEligibilityIgnored));
    const filtered = Object.assign({}, ver, { verified: eligible,
      summary: Object.assign({}, ver.summary, { gatedByPanel: true, eligibilityRecomputedAtSink: true,
        transmitted: eligible.length, withheld: verified.length - eligible.length,
        suppliedEligibilityIgnored: ignored.length }) });
    return baseAdapter.buildProfessionalCorpus(Object.assign({}, inputs, { professionalVerification: filtered }), ctx);
  }

  return { discoverProfessionals, verifyProfessionals, buildProfessionalCorpus, gateId: GATE_ID };
}

module.exports = { createPanelGatedAdapter, GATE_ID };
