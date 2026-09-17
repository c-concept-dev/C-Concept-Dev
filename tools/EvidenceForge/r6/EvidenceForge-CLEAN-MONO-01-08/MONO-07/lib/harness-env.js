"use strict";
/**
 * MONO-07 — harness-env.js
 *
 * Construit l'environnement d'exécution E2E en RÉUTILISANT réellement les
 * lots geles MONO-01->05, via l'extraction fraiche du paquet canonique
 * MONO-05 (baseline R1 ou ulterieure — le nom exact du ZIP est resolu
 * dynamiquement, jamais fige en dur, voir extractFrozenMono05() — c'est
 * exactement ce qui a permis a MONO-07 de rebasculer sur chaque nouvelle
 * baseline (R1 puis R2) sans
 * aucun changement de code lors de la rebaseline corrective). Deja
 * verifie bytewise par MONO-06/nested-dependency-verifier.js. MONO-07 ne
 * reconstruit AUCUN cablage : `createOperatorBackends()`,
 * `createRunRegistry()` et `createOperatorApi()` sont ceux de MONO-05
 * lui-meme, requis tels quels depuis l'extraction — jamais copies/reecrits
 * ici.
 *
 * Ceci satisfait a la fois :
 *  - section 4 (composer reellement MONO-01+02+03+04+05)
 *  - section 26 (utiliser MONO-05, ne pas reconstruire une UI/API)
 *  - la regle generale "ne jamais reimplementer un module historique/gele"
 *
 * Le chemin du kit gele est TOUJOURS un argument explicite — jamais un
 * defaut de session.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function freshDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Extrait fraichement le paquet canonique MONO-05 (nom de ZIP resolu
 * dynamiquement — v1, R1, ou toute rebaseline ulterieure, voir ci-dessous)
 * depuis le kit gele dans workDir/mono05-extract, et retourne le chemin
 * racine MONO-05/ resultant. N'ecrit jamais dans le kit gele lui-meme.
 */
function extractFrozenMono05(kitRoot, workDir, zipFileName) {
  // Jamais un nom fige en dur unique : une rebaseline corrective (ex: R1)
  // renomme le ZIP canonique (EvidenceForge-MONO-05-v1.zip ->
  // EvidenceForge-MONO-05-R2.zip, ou toute version ulterieure). Si aucun nom explicite n'est fourni,
  // cherche le premier fichier correspondant au motif dans le dossier MONO
  // du kit — jamais une supposition sur la version.
  const monoDir = path.join(kitRoot, "04-ARTEFACTS-CANONIQUES/MONO");
  let resolvedZipName = zipFileName;
  if (!resolvedZipName) {
    if (!fs.existsSync(monoDir)) {
      throw new Error(`harness-env: dossier ${monoDir} introuvable — MONO-07 ne fabrique jamais un artefact absent (STOP).`);
    }
    const candidates = fs.readdirSync(monoDir).filter((f) => /^EvidenceForge-MONO-05-.*\.zip$/.test(f));
    if (candidates.length === 0) {
      throw new Error(`harness-env: aucun ZIP EvidenceForge-MONO-05-*.zip trouve sous ${monoDir} — MONO-07 ne fabrique jamais un artefact absent (STOP).`);
    }
    if (candidates.length > 1) {
      throw new Error(`harness-env: plusieurs ZIP MONO-05 trouves (${candidates.join(", ")}) — nom explicite requis pour lever l'ambiguite.`);
    }
    resolvedZipName = candidates[0];
  }
  const zipAbsPath = path.join(monoDir, resolvedZipName);
  if (!fs.existsSync(zipAbsPath)) {
    throw new Error(`harness-env: ${resolvedZipName} introuvable sous ${kitRoot} — MONO-07 ne fabrique jamais un artefact absent (STOP).`);
  }
  const extractRoot = path.join(workDir, "mono05-extract");
  freshDir(extractRoot);
  execFileSync("unzip", ["-oq", zipAbsPath, "-d", extractRoot], { stdio: "pipe" });
  const mono05Root = path.join(extractRoot, "MONO-05");
  if (!fs.existsSync(mono05Root)) {
    throw new Error("harness-env: extraction de MONO-05 invalide (dossier MONO-05/ absent apres extraction).");
  }
  return mono05Root;
}

/**
 * Construit l'environnement complet : mono01/mono03/mono04 (backends
 * explicitement injectes, jamais un defaut implicite - meme discipline que
 * MONO-05 lui-meme), runRegistry, operatorApi. secretsConfig est passe tel
 * quel a cfg.createOperatorBackends (voir MONO-05/app/server/config.js).
 */
function buildEnv(kitRoot, workDir, secretsConfig, zipFileName) {
  const mono05Root = extractFrozenMono05(kitRoot, workDir, zipFileName);
  const serverDir = path.join(mono05Root, "app", "server");

  // require() direct des fichiers geles de MONO-05 — jamais une copie.
  const cfg = require(path.join(serverDir, "config.js"));
  const { createRunRegistry } = require(path.join(serverDir, "run-registry.js"));
  const { createOperatorApi } = require(path.join(serverDir, "operator-api.js"));

  const { mono01, mono03, mono04, efOrchBackend, mono03Backend } = cfg.createOperatorBackends(secretsConfig);
  const runRegistry = createRunRegistry(mono01, mono03);
  const operatorApi = createOperatorApi({ mono01, mono03, mono04, runRegistry });

  return { mono05Root, cfg, mono01, mono03, mono04, efOrchBackend, mono03Backend, runRegistry, operatorApi };
}

module.exports = { buildEnv, extractFrozenMono05, freshDir };
