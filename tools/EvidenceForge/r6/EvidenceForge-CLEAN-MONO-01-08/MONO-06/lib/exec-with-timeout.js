"use strict";
/**
 * MONO-06 — exec-with-timeout.js
 *
 * Wrapper unique autour de execFileSync avec timeout OBLIGATOIRE. Toute
 * commande externe du harnais (npm install/ci, playwright install, npm
 * test, build/verify EF-ORCH, tests node/python individuels) passe par
 * ce module — jamais un execFileSync nu sans timeout ailleurs dans le
 * code.
 *
 * Un depassement de timeout ne fait JAMAIS planter le harnais : il est
 * capture et retourne comme un resultat structure (timedOut: true),
 * jamais une exception qui remonterait non geree.
 */

const { execFileSync } = require("child_process");

const TIMEOUTS_MS = {
  DEPENDENCY_INSTALL_TIMEOUT: 180000, // npm install / npm ci / pip-like
  BROWSER_INSTALL_TIMEOUT: 180000,    // npx playwright install chromium
  TEST_TIMEOUT: 180000,               // npm test / suite complete d'un lot
  BUILD_TIMEOUT: 60000                // build-monolith.js / verify-monolith-fidelity.js / un seul fichier test_ef_orch_*.js
};

/**
 * Execute une commande avec un timeout explicite. Retourne toujours un
 * objet structure, ne relance jamais l'exception brute de execFileSync.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} options  options standard execFileSync (cwd, encoding, ...)
 * @param {number} timeoutMs  une des valeurs de TIMEOUTS_MS, jamais optionnelle
 * @param {string} timeoutLabel  nom de la politique de timeout appliquee (pour le rapport)
 */
function execWithTimeout(cmd, args, options, timeoutMs, timeoutLabel) {
  if (typeof timeoutMs !== "number") {
    throw new Error("execWithTimeout: timeoutMs est obligatoire (aucune execution sans timeout explicite)");
  }
  try {
    const stdout = execFileSync(cmd, args, { ...options, timeout: timeoutMs, killSignal: "SIGKILL" });
    return { ok: true, timedOut: false, stdout, exitCode: 0 };
  } catch (e) {
    const timedOut = e.signal === "SIGKILL" || e.killed === true || e.code === "ETIMEDOUT";
    return {
      ok: false,
      timedOut,
      timeoutLabel: timedOut ? timeoutLabel : undefined,
      exitCode: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString() : "",
      stderr: e.stderr ? e.stderr.toString() : "",
      error: e.message
    };
  }
}

module.exports = { execWithTimeout, TIMEOUTS_MS };
