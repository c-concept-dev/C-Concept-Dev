"use strict";
/**
 * MONO-10 v0.2 — core/final-report-acceptance.js
 * Acceptation humaine du rapport. Ne modifie ni preuves, ni qualification, ni
 * verdict : elle alimente uniquement l'autorisation aval generique.
 */

const { isNonEmptyStr, fail, stamp, CLASS, assertProductionEvidence } = require("./execution-evidence.js");
const { artifactRef, assertHumanAct, assertRefMatches } = require("./lineage.js");

const DECISION = { ACCEPT: "ACCEPT_AS_REPORTED", ACCEPT_WITH_RESERVATIONS: "ACCEPT_WITH_RESERVATIONS", REJECT: "REJECT_FOR_REVIEW" };
const ALLOWED = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS, DECISION.REJECT];
const CONTINUATION_OK = [DECISION.ACCEPT, DECISION.ACCEPT_WITH_RESERVATIONS];
const FORBIDDEN_FIELDS = ["finalVerdict", "verdict", "priorVerdict", "scientificallyActionableVerdict", "qualificationStatus", "downstreamUseAuthorized"];

function buildAcceptanceTemplate(report, opts) {
  opts = opts || {};
  if (!report || report.schema !== "EvidenceForge.ScientificUnifiedReport") throw fail("ACCEPTANCE_TEMPLATE_INPUT_INVALID", "ScientificUnifiedReport requis.");
  return Object.assign({
    _readme: "Acceptation du rapport. Ne modifie ni preuves, ni qualification, ni verdict. Alimente uniquement l'autorisation d'usage aval.",
    schema: "EvidenceForge.FinalReportAcceptance", schemaVersion: "MONO-10-v2",
    reportRef: artifactRef(report, "scientific-unified-report"),
    reservationsPresented: (report.reservations || []).slice(),
    unknownsPresented: (report.unknowns || []).map((u) => u.reason || u),
    decision: null, reservationsAcknowledged: [], actorType: null, actorIdentity: null, decidedAt: null,
  }, stamp(opts.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

function validateAcceptance(acceptance, report, mode) {
  mode = mode || {};
  const problems = [];
  if (!acceptance || acceptance.schema !== "EvidenceForge.FinalReportAcceptance") {
    return { valid: false, problems: ["schema inattendu ou artefact absent"], continuationAllowed: false };
  }
  if (mode.production === true) {
    try { assertProductionEvidence(acceptance, "FinalReportAcceptance", mode); } catch (e) { problems.push(e.message); }
  }
  if (report) { try { assertRefMatches(acceptance.reportRef, report, "reportRef"); } catch (e) { problems.push(e.message); } }
  if (ALLOWED.indexOf(acceptance.decision) === -1) problems.push("decision invalide " + JSON.stringify(acceptance.decision));
  try { assertHumanAct(acceptance, "FinalReportAcceptance", mode); } catch (e) { problems.push(e.message); }
  FORBIDDEN_FIELDS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(acceptance, k)) problems.push("champ \"" + k + "\" present : une acceptation ne reecrit jamais un verdict, une qualification ni une autorisation");
  });
  if (problems.length) return { valid: false, problems: problems, continuationAllowed: false };
  return { valid: true, problems: [], continuationAllowed: CONTINUATION_OK.indexOf(acceptance.decision) !== -1 };
}

module.exports = { buildAcceptanceTemplate, validateAcceptance, DECISION, ALLOWED, CONTINUATION_OK, FORBIDDEN_FIELDS };
