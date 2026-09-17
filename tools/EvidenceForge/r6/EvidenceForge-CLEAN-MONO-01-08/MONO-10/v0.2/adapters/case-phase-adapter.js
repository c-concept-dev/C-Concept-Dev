"use strict";
/**
 * MONO-10 v0.2 — adapters/case-phase-adapter.js
 *
 * HORS NOYAU. Traduit l'autorisation GENERIQUE du noyau vers le vocabulaire
 * d'un cas d'application donne.
 *
 * Le noyau ignore totalement ce fichier. Aucune mission n'est obligee de
 * l'utiliser : une mission qui ne connait pas ce cas ne verra jamais son
 * vocabulaire.
 *
 * Le nom de la phase aval est une DONNEE fournie par l'appelant, jamais une
 * constante de ce module — ainsi cet adaptateur reste lui-meme reutilisable.
 */

function mapAuthorizationToCasePhase(authorization, casePhaseName) {
  if (typeof casePhaseName !== "string" || !casePhaseName.trim()) {
    throw new Error("CASE_PHASE_NAME_REQUIRED: le nom de la phase aval doit etre fourni par le cas d'application, jamais code dans le lot.");
  }
  if (!authorization || authorization.schema !== "EvidenceForge.DownstreamUseAuthorization") {
    throw new Error("DOWNSTREAM_AUTHORIZATION_REQUIRED: autorisation generique absente.");
  }
  const out = {
    schema: "EvidenceForge.CasePhaseAuthorization", schemaVersion: "MONO-10-v2-adapter",
    casePhase: casePhaseName,
    genericAuthorization: authorization.authorization,
    reasons: authorization.reasons.slice(),
    derivedFromGenericField: "downstreamUseAuthorized",
    rewritesVerdict: false,
  };
  out[casePhaseName + "_ALLOWED"] = authorization.downstreamUseAuthorized === true;
  return out;
}

module.exports = { mapAuthorizationToCasePhase };
