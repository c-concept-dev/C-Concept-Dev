"use strict";
/**
 * MONO-10 v0.1 — lib/panel-gated-adapter.js
 *
 * FERMETURE EXECUTABLE DE A-07.
 *
 * MONO-09 v0.2 est GELE. Son buildProfessionalCorpus filtre sur
 * verificationStatus === "VERIFIED" : un candidat verifie documentairement mais
 * NON approuve par un humain entrerait dans le corpus. Ce module ne modifie pas
 * v0.2 — il le COMPOSE.
 *
 * Apres verifyProfessionals, tout candidat sans approbation humaine est
 * retrograde en UNVERIFIED avec motif explicite. EF-02C ne voit donc jamais
 * un professionnel non approuve.
 *
 * L'adaptateur compose s'injecte dans ctx.adapter exactement comme v0.2 :
 * aucun contrat gele n'est touche.
 */

const { fail } = require("./lineage.js");
const { approvedPanelMembers } = require("./panel-gate.js");

const NOT_APPROVED_REASON = "MONO-10 : aucun APPROVE_FOR_DOCUMENTARY_PANEL humain pour ce candidat — jamais admis au corpus professionnel.";

/**
 * createPanelGatedAdapter(baseAdapter, { panelValidation, candidateAssessment, allowFixture })
 * baseAdapter : adaptateur MONO-09 v0.2 (ou tout adaptateur conforme au port).
 */
function createPanelGatedAdapter(baseAdapter, opts) {
  opts = opts || {};
  if (!baseAdapter || typeof baseAdapter.discoverProfessionals !== "function"
    || typeof baseAdapter.verifyProfessionals !== "function"
    || typeof baseAdapter.buildProfessionalCorpus !== "function") {
    throw fail("PANEL_GATED_ADAPTER_BASE_INVALID", "adaptateur de base non conforme au professionalPipelinePort.");
  }
  const panelValidation = opts.panelValidation || null;
  const candidateAssessment = opts.candidateAssessment || null;

  // Resolue une seule fois, de facon fail-closed : sans porte humaine valide,
  // aucun professionnel ne passe — jamais un ensemble vide silencieux.
  let approvedSet = null;
  function approved() {
    if (approvedSet) return approvedSet;
    if (!panelValidation || !candidateAssessment) {
      throw fail("PANEL_GATE_MISSING",
        "aucune ProfessionalPanelValidation liee a une ProfessionalCandidateAssessment n'a ete fournie — EF-02C ne peut recevoir aucun professionnel (fermeture A-07).");
    }
    approvedSet = approvedPanelMembers(panelValidation, candidateAssessment, { allowFixture: opts.allowFixture === true });
    return approvedSet;
  }

  async function discoverProfessionals(inputs, ctx) {
    return baseAdapter.discoverProfessionals(inputs, ctx);
  }

  async function verifyProfessionals(inputs, ctx) {
    const base = await baseAdapter.verifyProfessionals(inputs, ctx);
    const ok = approved();   // leve si la porte humaine est absente ou invalide
    const gated = (base.verified || []).map(function (v) {
      const id = v.candidateRef || ("unresolved:" + v.displayName);
      if (ok.has(id)) {
        return Object.assign({}, v, { panelApproval: "APPROVED_BY_HUMAN", panelGate: "MONO-10-v1" });
      }
      // Retrogradation : le statut documentaire est conserve pour tracabilite,
      // mais il ne franchit plus le filtre d'EF-02C.
      return Object.assign({}, v, {
        verificationStatus: "UNVERIFIED",
        documentaryVerificationStatus: v.verificationStatus,
        panelApproval: "NOT_APPROVED",
        panelGate: "MONO-10-v1",
        panelGateReason: NOT_APPROVED_REASON,
      });
    });
    return Object.assign({}, base, {
      verified: gated,
      summary: Object.assign({}, base.summary, {
        verified: gated.filter((v) => v.verificationStatus === "VERIFIED").length,
        unverified: gated.filter((v) => v.verificationStatus === "UNVERIFIED").length,
        panelApproved: gated.filter((v) => v.panelApproval === "APPROVED_BY_HUMAN").length,
        panelGate: "MONO-10-v1",
      }),
    });
  }

  async function buildProfessionalCorpus(inputs, ctx) {
    const ver = inputs && inputs.professionalVerification;
    const ok = approved();
    // Double verrou : meme si un appelant fournissait une verification non
    // filtree, aucun professionnel non approuve n'atteint le corpus.
    const leaked = (ver && ver.verified || []).filter((v) =>
      v.verificationStatus === "VERIFIED" && !ok.has(v.candidateRef || ("unresolved:" + v.displayName)));
    if (leaked.length) {
      throw fail("UNAPPROVED_PROFESSIONAL_REACHED_EF02C",
        leaked.length + " professionnel(s) verifie(s) sans approbation humaine ont atteint EF-02C : " +
        leaked.map((v) => v.displayName).join(", ") + ". " + NOT_APPROVED_REASON);
    }
    return baseAdapter.buildProfessionalCorpus(inputs, ctx);
  }

  return { discoverProfessionals, verifyProfessionals, buildProfessionalCorpus };
}

module.exports = { createPanelGatedAdapter, NOT_APPROVED_REASON };
