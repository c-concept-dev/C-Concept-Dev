"use strict";
/**
 * MONO-10 v0.1 — lib/final-report-acceptance.js
 *
 * Porte humaine d'acceptation du rapport final. Elle ne modifie NI les preuves,
 * NI la qualification, NI le verdict. Elle gouverne uniquement l'autorisation
 * d'usage en aval (P0.2).
 *
 * Le rapport existe sans elle : sa production ne doit dependre de personne.
 */

const { isNonEmptyStr, fail, assertHumanAct, artifactRef, assertBound } = require("./lineage.js");

const DECISION = {
  ACCEPT: "ACCEPT_AS_REPORTED",
  ACCEPT_WITH_RESERVATIONS: "ACCEPT_WITH_RESERVATIONS",
  REJECT: "REJECT_FOR_REVIEW",
};
const ALLOWED = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS, DECISION.REJECT];
const CONTINUATION_OK = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS];

/** Gabarit VIDE : aucune decision, aucune identite, aucun horodatage pre-remplis. */
function buildAcceptanceTemplate(report) {
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") {
    throw fail("ACCEPTANCE_TEMPLATE_INPUT_INVALID", "ScientificUnifiedReport requis.");
  }
  return {
    _readme: "Acceptation du rapport final. Ne modifie ni preuves, ni qualification, ni verdict. Gouverne uniquement l'autorisation P0.2. Completer decision/actorIdentity/decidedAt.",
    schema: "EvidenceForge.FinalReportAcceptance", schemaVersion: "MONO-10-v1",
    reportRef: artifactRef(report, report.artifactId || "scientific-unified-report"),
    reservationsPresented: (report.reservations || []).slice(),
    unknownsPresented: (report.unknowns || []).slice(),
    decision: null, reservationsAcknowledged: [],
    actorType: null, actorIdentity: null, decidedAt: null,
  };
}

/**
 * validateAcceptance(acceptance, report, opts) -> { valid, problems, continuationAllowed }
 * Une acceptation ne peut jamais reecrire un verdict : tout champ de verdict
 * present dans l'artefact est refuse.
 */
function validateAcceptance(acceptance, report, opts) {
  opts = opts || {};
  const problems = [];
  if (!acceptance || acceptance.schema !== "EvidenceForge.FinalReportAcceptance") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], continuationAllowed: false };
  }
  try { assertBound(acceptance.reportRef, "reportRef"); } catch (e) { problems.push(e.message); }
  if (report) {
    const now = artifactRef(report, report.artifactId || "scientific-unified-report");
    if (acceptance.reportRef && acceptance.reportRef.sha256 !== now.sha256) {
      problems.push("reportRef ne correspond pas au rapport fourni — acceptation liee a une autre version");
    }
  }
  if (ALLOWED.indexOf(acceptance.decision) === -1) {
    problems.push("decision invalide (" + JSON.stringify(acceptance.decision) + "), attendu " + ALLOWED.join(" | "));
  }
  try { assertHumanAct(acceptance, "FinalReportAcceptance", { allowFixture: opts.allowFixture === true }); }
  catch (e) { problems.push(e.message); }

  ["finalVerdict", "verdict", "scientificallyActionableVerdict", "qualificationStatus"].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(acceptance, k)) {
      problems.push("champ \"" + k + "\" present dans l'acceptation : une acceptation ne reecrit jamais un verdict ni une qualification");
    }
  });

  if (problems.length) return { valid: false, problems: problems, continuationAllowed: false };
  return { valid: true, problems: [], continuationAllowed: CONTINUATION_OK.indexOf(acceptance.decision) !== -1 };
}

/**
 * resolveP0_2Authorization(report, acceptance, opts)
 * P0.2 exige : qualification permettant un usage scientifique ET une acceptation
 * humaine valide et compatible avec la continuation.
 */
function resolveP0_2Authorization(report, acceptance, opts) {
  const reasons = [];
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") {
    return { p0_2Allowed: false, reasons: ["ScientificUnifiedReport absent"] };
  }
  if (report.scientificallyActionableVerdict === "NONE") {
    reasons.push("scientificallyActionableVerdict = NONE (qualification insuffisante) — le verdict legacy reste enregistre, son usage est bloque");
  }
  if (!acceptance) {
    reasons.push("aucune FinalReportAcceptance : P0.2 non autorise");
    return { p0_2Allowed: false, reasons: reasons };
  }
  const v = validateAcceptance(acceptance, report, opts);
  if (!v.valid) { reasons.push("acceptation invalide : " + v.problems.join(" ; ")); return { p0_2Allowed: false, reasons: reasons }; }
  if (!v.continuationAllowed) reasons.push("decision " + acceptance.decision + " : continuation non autorisee");
  return { p0_2Allowed: reasons.length === 0, reasons: reasons };
}

module.exports = { buildAcceptanceTemplate, validateAcceptance, resolveP0_2Authorization, DECISION, ALLOWED, CONTINUATION_OK };
