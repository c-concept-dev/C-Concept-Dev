"use strict";
/**
 * MONO-10 v0.5 — core/panel-gated-adapter.js  (§7)
 *
 * Module LIVRE, exporte, consommable hors tests. Il ferme la porte devant la
 * construction du corpus.
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
const { deriveEffectiveEligibility, isEligible, ELIGIBILITY } = require("./effective-eligibility.js");

const GATE_ID = "MONO-10-v5-panel-gate";

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
        recomputed: true,
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
        eligible: annotated.filter(isEligible).length,
        deferred: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.DEFERRED).length,
        notEligible: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.NOT_ELIGIBLE).length },
    });
  }

  async function buildProfessionalCorpus(inputs, ctx) {
    gate();   // fail-closed : pas de porte valide, pas de corpus
    const ver = inputs && inputs.professionalVerification;
    const verified = (ver && ver.verified) || [];
    const missing = verified.filter((v) => !isNonEmptyStr(v.effectiveCorpusEligibility));
    if (missing.length) {
      throw fail("ELIGIBILITY_NOT_DERIVED", missing.length + " professionnel(s) sans effectiveCorpusEligibility : la verification n'est pas passee par la porte.");
    }
    const eligible = verified.filter(isEligible);
    const filtered = Object.assign({}, ver, { verified: eligible,
      summary: Object.assign({}, ver.summary, { gatedByPanel: true, transmitted: eligible.length, withheld: verified.length - eligible.length }) });
    return baseAdapter.buildProfessionalCorpus(Object.assign({}, inputs, { professionalVerification: filtered }), ctx);
  }

  return { discoverProfessionals, verifyProfessionals, buildProfessionalCorpus, gateId: GATE_ID };
}

module.exports = { createPanelGatedAdapter, GATE_ID };
