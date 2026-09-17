"use strict";
/**
 * MONO-07 — kit-root.js
 *
 * BUG PACKAGE CORRIGÉ (trouvé par audit indépendant depuis une extraction
 * neuve) : une version antérieure de chaque fichier de test contenait
 * `process.argv[2] || "<chemin absolu propre à une session particulière>"`
 * (ex: sous /home puis claude/...) — un chemin de
 * session en dur, contraire au CDC. Toute exécution hors de cette session
 * précise échouait silencieusement en retombant sur un chemin inexistant.
 *
 * Résolution désormais strictement :
 *   1. argument CLI explicite (process.argv[2])
 *   2. sinon variable d'environnement EVIDENCEFORGE_KIT_ROOT
 *   3. sinon échec explicite KIT_ROOT_REQUIRED — jamais un chemin par défaut.
 */

function resolveKitRoot(argv) {
  const cliArg = (argv || process.argv)[2];
  if (cliArg) return cliArg;
  if (process.env.EVIDENCEFORGE_KIT_ROOT) return process.env.EVIDENCEFORGE_KIT_ROOT;
  const err = new Error(
    "KIT_ROOT_REQUIRED — aucun chemin de kit fourni. Fournissez-le explicitement :\n" +
    "  node test/run-all.js /chemin/vers/le/kit\n" +
    "ou :\n" +
    "  EVIDENCEFORGE_KIT_ROOT=/chemin/vers/le/kit node test/run-all.js\n" +
    "Jamais un chemin de session implicite."
  );
  err.code = "KIT_ROOT_REQUIRED";
  throw err;
}

module.exports = { resolveKitRoot };
