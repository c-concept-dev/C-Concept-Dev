"use strict";
/**
 * MONO-07 — mono06-gate.js
 *
 * MONO-07 ne doit jamais considérer comme valide un E2E exécuté sur une
 * baseline déjà en régression (section 33 du CDC initial, réaffirmée
 * section 4 de la reprise post-rebaseline R1). Ce module appelle
 * RÉELLEMENT le harnais MONO-06 (jamais une réimplémentation de ses
 * vérifications) et bloque l'exécution si le gate ne passe pas.
 *
 * MONO-06 est lui-même requis frais depuis son propre ZIP canonique
 * (résolution dynamique du nom, comme pour MONO-05 — jamais un chemin en
 * dur vers une version particulière).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function freshDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function resolveZip(kitRoot, artifactPrefix) {
  const monoDir = path.join(kitRoot, "04-ARTEFACTS-CANONIQUES/MONO");
  const candidates = fs.readdirSync(monoDir).filter((f) => new RegExp(`^EvidenceForge-${artifactPrefix}-.*\\.zip$`).test(f));
  if (candidates.length !== 1) {
    throw new Error(`mono06-gate: résolution ambiguë ou impossible pour ${artifactPrefix} sous ${monoDir} (candidats: ${candidates.join(", ") || "aucun"})`);
  }
  return path.join(monoDir, candidates[0]);
}

/**
 * Exécute réellement le harnais MONO-06 contre le kit fourni et retourne
 * son rapport complet. Lève une exception si MONO-06 lui-même n'est pas
 * present dans le kit (aucun gate n'est alors possible — jamais interprété
 * comme un PASS implicite).
 */
async function runMono06Gate(kitRoot, workDir) {
  const mono06ZipAbs = resolveZip(kitRoot, "MONO-06");
  const extractRoot = path.join(workDir, "mono06-gate-extract");
  freshDir(extractRoot);
  execFileSync("unzip", ["-oq", mono06ZipAbs, "-d", extractRoot], { stdio: "pipe" });
  const mono06Root = path.join(extractRoot, "MONO-06");
  if (!fs.existsSync(mono06Root)) {
    throw new Error("mono06-gate: extraction de MONO-06 invalide (dossier MONO-06/ absent).");
  }

  const { runHarness } = require(path.join(mono06Root, "lib", "harness.js"));
  const harnessWorkDir = path.join(workDir, "mono06-gate-harness-work");
  const report = runHarness({ kitRoot, workRoot: harnessWorkDir, skipTestExecution: false });
  return { report, mono06Root };
}

/**
 * Baseline de tests actuellement gelée (R3) — vérifiée explicitement en
 * plus du simple statut PASS de MONO-06, pour qu'aucune ancienne valeur
 * (721/731/772, MONO-05 à 65/106) ne puisse jamais être silencieusement
 * acceptée si un registre MONO-06 obsolète ou incorrect était utilisé par
 * erreur.
 */
const EXPECTED_BASELINE_R3 = { monoTotal: 785, historiqueTotal: 1223 };

/**
 * Point d'entrée bloquant : lève une exception explicite si le gate
 * échoue, jamais un booléen silencieux qu'un appelant pourrait ignorer.
 */
async function assertMono06GatePasses(kitRoot, workDir) {
  const { report } = await runMono06Gate(kitRoot, workDir);
  if (report.overallStatus !== "PASS") {
    throw new Error(
      `MONO-06 REGRESSION GATE ÉCHOUÉ (statut: ${report.overallStatus}) — MONO-07 refuse d'exécuter un E2E sur une baseline en régression. ` +
      `Totaux: MONO ${JSON.stringify(report.globalTotals)}.`
    );
  }
  const { monoObserved, historiqueObserved } = report.globalTotals;
  if (monoObserved !== EXPECTED_BASELINE_R3.monoTotal || historiqueObserved !== EXPECTED_BASELINE_R3.historiqueTotal) {
    throw new Error(
      `MONO-06 REGRESSION GATE : totaux inattendus (MONO=${monoObserved}, attendu ${EXPECTED_BASELINE_R3.monoTotal} ; ` +
      `historique=${historiqueObserved}, attendu ${EXPECTED_BASELINE_R3.historiqueTotal}) — baseline R3 non confirmée, refus explicite plutôt qu'une acceptation silencieuse d'une baseline différente.`
    );
  }
  return report;
}

module.exports = { runMono06Gate, assertMono06GatePasses, resolveZip, EXPECTED_BASELINE_R3 };
