"use strict";
/**
 * MONO-10 v0.6 — core/artifact-trust-levels.js   (§57)
 *
 * REGISTERED n'est PAS un synonyme d'AUTHENTICATED. Les audits de v0.5 ont
 * montre qu'un artefact fabrique par l'appelant, enregistre apres l'attestation,
 * obtenait le meme poids qu'une preuve authentifiee. v0.6 nomme les niveaux et
 * refuse de les confondre.
 */
const { isNonEmptyStr, fail } = require("./canonical.js");

const TRUST_LEVEL = {
  REGISTERED: "REGISTERED",                                 // present dans une collection
  BOUND_TO_RUN: "BOUND_TO_RUN",                             // empreinte croisee valide
  AUTHENTICATED_PROVENANCE: "AUTHENTICATED_PROVENANCE",     // origine documentaire resolue
  HUMAN_AUTHENTICATED: "HUMAN_AUTHENTICATED",               // acte humain prouve
  PRODUCTION_CAPABILITY_PROVED: "PRODUCTION_CAPABILITY_PROVED", // capacite constatee par l'exploitant
};
const ORDER = [TRUST_LEVEL.REGISTERED, TRUST_LEVEL.BOUND_TO_RUN, TRUST_LEVEL.AUTHENTICATED_PROVENANCE,
  TRUST_LEVEL.HUMAN_AUTHENTICATED, TRUST_LEVEL.PRODUCTION_CAPABILITY_PROVED];

function rank(l) { const i = ORDER.indexOf(l); return i === -1 ? -1 : i; }

/** assertAtLeast(actual, required, label) — un niveau inferieur ne suffit jamais. */
function assertAtLeast(actual, required, label) {
  if (rank(actual) === -1) throw fail("TRUST_LEVEL_UNKNOWN", (label || "artefact") + " : niveau de confiance \"" + actual + "\" inconnu — fail closed.");
  if (rank(required) === -1) throw fail("TRUST_LEVEL_UNKNOWN", (label || "artefact") + " : niveau requis inconnu.");
  if (rank(actual) < rank(required)) {
    throw fail("TRUST_LEVEL_INSUFFICIENT", (label || "artefact") + " : niveau " + actual + " insuffisant, " + required + " exige. "
      + "Etre enregistre dans un run ne vaut pas etre authentifie comme preuve.");
  }
  return true;
}

module.exports = { TRUST_LEVEL, ORDER, rank, assertAtLeast };
