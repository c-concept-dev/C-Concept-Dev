"use strict";
// EF-01B-C1-v0.2-r1-INTEGRATION — lib/build-eforch-provenance.js
//
// Assemble `mission.eForchProvenance` = { resolverRuns, plannerRun,
// plannerOutput, humanValidation } a partir des sorties REELLES de
// EF-01B-v0.2 (acquireResolverRun — un resultat par discipline) et
// EF-01C1-v0.2 (acquirePlannerRun — un seul resultat pour toute la
// mission), PLUS une validation humaine REELLE du SearchProtocol fournie
// SEPAREMENT par l'appelant.
//
// N'INVENTE JAMAIS `humanValidation` : si l'appelant ne le fournit pas
// explicitement (validatedAt + commentaire non vides), ce module leve —
// jamais un repli synthetique (CDC section 7 : "Aucune humanValidation
// automatique"). Ce module ne fait AUCUN appel LLM lui-meme : il ne fait
// que reunir des resultats deja acquis par EF-01B-v0.2/EF-01C1-v0.2.

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * buildEForchProvenance(opts) :
 *   resolverRuns     - [resolverRun, ...] (sortie de EF-01B-v0.2::acquireResolverRun, un par discipline, DANS L'ORDRE du RunContract confirme)
 *   plannerRun       - sortie de EF-01C1-v0.2::acquirePlannerRun
 *   plannerOutput    - idem
 *   humanValidation  - { validatedAt, commentaire } - ACTE HUMAIN REEL, jamais synthetise par ce module
 *
 * Retourne { resolverRuns, plannerRun, plannerOutput, humanValidation }
 * (copie defensive, jamais les references de l'appelant) — directement
 * assignable a mission.eForchProvenance.
 */
function buildEForchProvenance(opts) {
  opts = opts || {};
  if (!Array.isArray(opts.resolverRuns) || opts.resolverRuns.length === 0) {
    throw new Error("buildEForchProvenance: resolverRuns[] (non vide) requis — un resolverRun REEL par discipline (EF-01B-v0.2::acquireResolverRun), jamais devine.");
  }
  if (!opts.plannerRun || typeof opts.plannerRun !== "object") {
    throw new Error("buildEForchProvenance: plannerRun requis (EF-01C1-v0.2::acquirePlannerRun), jamais devine.");
  }
  if (!opts.plannerOutput || typeof opts.plannerOutput !== "object") {
    throw new Error("buildEForchProvenance: plannerOutput requis (EF-01C1-v0.2::acquirePlannerRun), jamais devine.");
  }
  if (!opts.humanValidation || !isNonEmptyStr(opts.humanValidation.validatedAt) || !isNonEmptyStr(opts.humanValidation.commentaire)) {
    throw new Error(
      "buildEForchProvenance: humanValidation REEL requis ({validatedAt, commentaire} non vides) — jamais fabrique par ce module ni par un lot en amont " +
      "(CDC section 7 : \"Aucune humanValidation automatique\"). Cet acte humain doit etre fourni explicitement par l'appelant."
    );
  }
  return {
    resolverRuns: opts.resolverRuns.map(function (r) { return Object.assign({}, r); }),
    plannerRun: Object.assign({}, opts.plannerRun),
    plannerOutput: Object.assign({}, opts.plannerOutput),
    humanValidation: { validatedAt: opts.humanValidation.validatedAt, commentaire: opts.humanValidation.commentaire },
  };
}

module.exports = { buildEForchProvenance: buildEForchProvenance };
