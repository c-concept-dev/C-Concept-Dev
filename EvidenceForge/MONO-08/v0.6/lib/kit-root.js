"use strict";
/**
 * MONO-08 — lib/kit-root.js
 * Meme mecanisme deja valide dans MONO-07 (jamais une nouvelle
 * architecture) : CLI explicite > EVIDENCEFORGE_KIT_ROOT > echec explicite.
 */

function resolveKitRoot(argv) {
  const cliArg = (argv || process.argv)[2];
  if (cliArg) return cliArg;
  if (process.env.EVIDENCEFORGE_KIT_ROOT) return process.env.EVIDENCEFORGE_KIT_ROOT;
  const err = new Error(
    "KIT_ROOT_REQUIRED — aucun chemin de kit fourni. Fournissez-le explicitement :\n" +
    "  node bin/run-real-smoke.js /chemin/vers/le/kit\n" +
    "ou :\n" +
    "  EVIDENCEFORGE_KIT_ROOT=/chemin/vers/le/kit node bin/run-real-smoke.js\n" +
    "Jamais un chemin de session implicite."
  );
  err.code = "KIT_ROOT_REQUIRED";
  throw err;
}

module.exports = { resolveKitRoot };
