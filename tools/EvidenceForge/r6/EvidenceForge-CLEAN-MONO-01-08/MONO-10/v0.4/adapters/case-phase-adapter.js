"use strict";
/**
 * MONO-10 v0.4 — adapters/case-phase-adapter.js — HORS NOYAU.
 * Traduit l'autorisation GENERIQUE vers le vocabulaire d'un cas d'application.
 * Le nom de la phase aval est une DONNEE fournie par l'appelant, jamais une
 * constante de ce module. Le noyau ignore totalement ce fichier.
 */
function mapAuthorizationToCasePhase(authorization, casePhaseName) {
  if (typeof casePhaseName !== "string" || !casePhaseName.trim()) {
    throw new Error("CASE_PHASE_NAME_REQUIRED: le nom de la phase aval doit etre fourni par le cas d'application, jamais code dans le lot.");
  }
  if (!authorization || authorization.schema !== "EvidenceForge.DownstreamUseAuthorization") {
    throw new Error("DOWNSTREAM_AUTHORIZATION_REQUIRED: autorisation generique absente.");
  }
  const out = {
    schema: "EvidenceForge.CasePhaseAuthorization", schemaVersion: "MONO-10-v4-adapter",
    casePhase: casePhaseName,
    genericAuthorization: authorization.authorization,
    executionMode: authorization.executionMode || null,
    reasons: authorization.reasons.slice(),
    derivedFromGenericField: "downstreamUseAuthorized",
    rewritesVerdict: false,
  };
  out[casePhaseName + "_ALLOWED"] = authorization.downstreamUseAuthorized === true;
  return out;
}
module.exports = { mapAuthorizationToCasePhase };
