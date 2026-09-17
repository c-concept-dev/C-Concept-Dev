"use strict";
/**
 * MONO-10 v0.3 — core/panel-gated-adapter.js
 *
 * FERMETURE A-01 : ce module est LIVRE dans le lot et exporte. En v0.2 il
 * n'existait que dans un fichier de test, alors que la documentation le
 * decrivait comme une etape d'execution — le composant qui fermait la porte
 * n'etait pas livrable.
 *
 * FERMETURE A-02 / §2 : le statut de verification produit par le lot amont est
 * HISTORIQUE. Ce module ne le reecrit JAMAIS. Il ajoute trois champs distincts :
 *
 *   legacyVerificationStatus     copie du constat amont       — immuable
 *   humanPanelDecision           decision humaine             — acte propre
 *   effectiveCorpusEligibility   valeur derivee et motivee    — explicite
 *
 * Le champ que le lot amont possede (`verificationStatus`) est laisse INTACT.
 * L'admission au corpus est decidee par l'eligibilite derivee, pas en maquillant
 * l'etat historique.
 *
 * Le noyau ne connait aucun lot particulier : l'adaptateur de base est injecte
 * et doit seulement respecter l'interface a trois methodes.
 */

const { isNonEmptyStr, fail } = require("./run-evidence-manifest.js");
const { validatePanelValidation, decisionsById } = require("./panel-gate.js");
const { deriveEffectiveEligibility, isEligible, ELIGIBILITY } = require("./effective-eligibility.js");

const GATE_ID = "MONO-10-v3-panel-gate";

/**
 * createPanelGatedAdapter(baseAdapter, opts)
 * opts.panelValidation      artefact de decision humaine
 * opts.candidateAssessment  evaluation a laquelle il est lie
 * opts.runManifest          manifeste du run (requis si production)
 * opts.production           true => provenance verifiee, fixtures refusees
 * opts.eligibilityPolicy    politique de derivation de l'eligibilite
 */
function createPanelGatedAdapter(baseAdapter, opts) {
  opts = opts || {};
  ["discoverProfessionals", "verifyProfessionals", "buildProfessionalCorpus"].forEach(function (m) {
    if (!baseAdapter || typeof baseAdapter[m] !== "function") {
      throw fail("PANEL_GATED_ADAPTER_BASE_INVALID", "adaptateur de base non conforme : methode \"" + m + "\" absente.");
    }
  });

  let cachedEligibility = null;
  function eligibilityByCandidate() {
    if (cachedEligibility) return cachedEligibility;
    if (!opts.panelValidation || !opts.candidateAssessment) {
      throw fail("PANEL_GATE_MISSING",
        "aucune ProfessionalPanelValidation liee a une ProfessionalCandidateAssessment — aucun professionnel ne peut etre transmis a la construction du corpus.");
    }
    const v = validatePanelValidation(opts.panelValidation, opts.candidateAssessment,
      { production: opts.production === true, runManifest: opts.runManifest });
    if (!v.valid) throw fail("PANEL_VALIDATION_INVALID", v.problems.join(" ; "));
    cachedEligibility = { validation: v, decisions: decisionsById(opts.panelValidation) };
    return cachedEligibility;
  }

  async function discoverProfessionals(inputs, ctx) {
    return baseAdapter.discoverProfessionals(inputs, ctx);
  }

  async function verifyProfessionals(inputs, ctx) {
    const base = await baseAdapter.verifyProfessionals(inputs, ctx);
    const { decisions } = eligibilityByCandidate();
    const assessmentById = new Map();
    (opts.candidateAssessment.assessments || []).forEach((a) => assessmentById.set(a.candidateId, a));

    const annotated = (base.verified || []).map(function (v) {
      const id = isNonEmptyStr(v.candidateRef) ? v.candidateRef : ("unresolved:" + v.displayName);
      const a = assessmentById.get(id);
      const eligibility = deriveEffectiveEligibility({
        candidateId: id,
        legacyVerificationStatus: v.verificationStatus,     // LU, jamais ecrit
        humanPanelDecision: decisions.get(id) || null,
        evidenceRefs: (a && a.missionEvidenceRefs) || [],
        policy: opts.eligibilityPolicy,
      });
      // Le champ amont `verificationStatus` n'est PAS present dans l'objet
      // fusionne : il provient de `v` et reste sa valeur d'origine.
      return Object.assign({}, v, {
        legacyVerificationStatus: v.verificationStatus,
        humanPanelDecision: eligibility.humanPanelDecision,
        effectiveCorpusEligibility: eligibility.effectiveCorpusEligibility,
        eligibilitySource: eligibility.eligibilitySource,
        eligibilityReason: eligibility.eligibilityReason,
        panelGate: GATE_ID,
      });
    });

    return Object.assign({}, base, {
      verified: annotated,
      panelGate: {
        gateId: GATE_ID,
        legacyStatusPreserved: true,
        eligible: annotated.filter((v) => isEligible(v)).length,
        deferred: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.DEFERRED).length,
        notEligible: annotated.filter((v) => v.effectiveCorpusEligibility === ELIGIBILITY.NOT_ELIGIBLE).length,
      },
    });
  }

  async function buildProfessionalCorpus(inputs, ctx) {
    eligibilityByCandidate();   // fail-closed : pas de porte valide, pas de corpus
    const ver = inputs && inputs.professionalVerification;
    const verified = (ver && ver.verified) || [];
    const missing = verified.filter((v) => !isNonEmptyStr(v.effectiveCorpusEligibility));
    if (missing.length) {
      throw fail("ELIGIBILITY_NOT_DERIVED",
        missing.length + " professionnel(s) sans effectiveCorpusEligibility : la verification n'est pas passee par la porte.");
    }
    const eligible = verified.filter(isEligible);
    // Le lot amont filtre sur SON propre champ : on ne lui transmet que les
    // candidats eligibles, sans jamais modifier leur statut historique.
    const filtered = Object.assign({}, ver, {
      verified: eligible,
      summary: Object.assign({}, ver.summary, { gatedByPanel: true, transmitted: eligible.length, withheld: verified.length - eligible.length }),
    });
    return baseAdapter.buildProfessionalCorpus(Object.assign({}, inputs, { professionalVerification: filtered }), ctx);
  }

  return { discoverProfessionals, verifyProfessionals, buildProfessionalCorpus, gateId: GATE_ID };
}

module.exports = { createPanelGatedAdapter, GATE_ID };
