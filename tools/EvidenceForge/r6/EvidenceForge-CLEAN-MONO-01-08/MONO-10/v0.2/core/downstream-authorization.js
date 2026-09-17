"use strict";
/**
 * MONO-10 v0.2 — core/downstream-authorization.js
 *
 * FERMETURE F-01. Concept GENERIQUE remplacant p0_2Allowed :
 *   "ce resultat peut-il etre utilise par une etape aval ?"
 *
 * Aucun nom de phase metier n'apparait ici. Un cas d'application qui aurait
 * besoin d'un nom propre doit le faire HORS de ce noyau (voir adapters/).
 *
 * Cette autorisation ne reecrit JAMAIS le verdict.
 */

const { fail, stamp, CLASS, isNonEmptyStr } = require("./execution-evidence.js");
const { assertLineageNonEmpty } = require("./lineage.js");
const { QUALIFICATION, ACTIONABLE_NONE } = require("./scientific-qualification.js");
const { blockingOpen, openOnes } = require("./unknowns.js");

const AUTHORIZATION = { AUTHORIZED: "AUTHORIZED", NOT_AUTHORIZED: "NOT_AUTHORIZED", DEFERRED: "DEFERRED" };

/**
 * resolveDownstreamUseAuthorization({ qualification, report, acceptance,
 *   acceptanceValidator, policy, production })
 *
 * policy.humanAcceptanceRequired  defaut true
 * policy.blockOnNonBlockingReservations  defaut false
 */
function resolveDownstreamUseAuthorization(input) {
  input = input || {};
  const mode = { production: input.production === true };
  const policy = Object.assign({ humanAcceptanceRequired: true, blockOnNonBlockingReservations: false }, input.policy || {});
  const reasons = [];
  const q = input.qualification;

  if (!q || q.schema !== "EvidenceForge.ScientificQualification") {
    return emit(AUTHORIZATION.NOT_AUTHORIZED, ["ScientificQualification absente"], policy, input, mode);
  }
  if (q.qualificationStatus === QUALIFICATION.NOT_QUALIFIED || q.qualificationStatus === QUALIFICATION.IMPOSSIBLE) {
    reasons.push("qualificationStatus = " + q.qualificationStatus + " : usage aval bloque. Le verdict anterieur reste enregistre.");
  }
  if (q.scientificallyActionableVerdict === ACTIONABLE_NONE) {
    reasons.push("scientificallyActionableVerdict = NONE");
  }
  const blocking = blockingOpen(q.unknowns || []);
  if (blocking.length) reasons.push(blocking.length + " inconnu(s) bloquant(s) ouverts");
  if (policy.blockOnNonBlockingReservations && (q.reservations || []).length) {
    reasons.push("politique du run : toute reserve bloque l'usage aval");
  }
  try { assertLineageNonEmpty(input.lineageRefs || (input.report && input.report.lineage), "lineage"); }
  catch (e) { reasons.push(e.message); }

  if (policy.humanAcceptanceRequired) {
    if (!input.acceptance) return emit(AUTHORIZATION.DEFERRED, reasons.concat(["acceptation humaine requise et absente"]), policy, input, mode);
    const validate = typeof input.acceptanceValidator === "function" ? input.acceptanceValidator : null;
    if (!validate) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["aucun validateur d'acceptation injecte"]), policy, input, mode);
    const v = validate(input.acceptance, input.report, mode);
    if (!v.valid) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["acceptation invalide : " + v.problems.join(" ; ")]), policy, input, mode);
    if (v.continuationAllowed !== true) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons.concat(["decision d'acceptation incompatible avec une continuation"]), policy, input, mode);
  }
  if (reasons.length) return emit(AUTHORIZATION.NOT_AUTHORIZED, reasons, policy, input, mode);
  return emit(AUTHORIZATION.AUTHORIZED, ["toutes les conditions du contrat generique sont satisfaites"], policy, input, mode);
}

function emit(status, reasons, policy, input, mode) {
  return Object.assign({
    schema: "EvidenceForge.DownstreamUseAuthorization", schemaVersion: "MONO-10-v2",
    downstreamUseAuthorized: status === AUTHORIZATION.AUTHORIZED,
    authorization: status, reasons: reasons, policy: policy,
    qualificationRef: input.qualificationRef || null, reportRef: input.reportRef || null,
    rewritesVerdict: false,
    note: "Autorise ou non l'usage du resultat par une etape aval. Ne reecrit jamais le verdict, ne modifie aucune preuve.",
  }, stamp(input.executionEvidenceClass || CLASS.REAL_RUNTIME));
}

module.exports = { resolveDownstreamUseAuthorization, AUTHORIZATION };
