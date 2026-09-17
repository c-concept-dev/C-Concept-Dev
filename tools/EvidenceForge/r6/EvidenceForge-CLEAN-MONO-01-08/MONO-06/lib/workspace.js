"use strict";
/**
 * MONO-06 — workspace.js
 *
 * Implemente l'isolation BASELINE PRISTINE / EXECUTION WORKSPACE decidee
 * par la gouvernance (voir CDC-TRACE.md section "Isolation baseline /
 * execution"). Aucun test n'est jamais lance avec cwd = baselineDir.
 *
 * baselineDir : extraction fraiche du ZIP canonique, jamais executee,
 *   sert uniquement aux checks d'integrite (presence, manifest, hash,
 *   nested dependencies, recherche statique, contrats).
 * executionDir : seconde extraction independante, jetable, seule a
 *   recevoir npm install/ci, node_modules, et l'execution reelle des
 *   suites de tests.
 */

const fs = require("fs");
const path = require("path");
const { execWithTimeout, TIMEOUTS_MS } = require("./exec-with-timeout");

function freshDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function extractZip(zipAbsPath, destDir) {
  freshDir(destDir);
  const result = execWithTimeout(
    "unzip", ["-oq", zipAbsPath, "-d", destDir],
    { stdio: "pipe" },
    TIMEOUTS_MS.BUILD_TIMEOUT, "BUILD_TIMEOUT"
  );
  if (!result.ok) {
    throw new Error(`Extraction ZIP echouee ou expiree (${zipAbsPath}): ${result.error}`);
  }
}

/**
 * Cree les deux extractions independantes pour un artefact et retourne
 * leurs chemins racine (dossier extrait + sous-dossier rootDirInZip).
 */
function createIsolatedPair(kitRoot, artifact, workRoot) {
  const zipAbsPath = path.join(kitRoot, artifact.zipPath);
  if (!fs.existsSync(zipAbsPath)) {
    return { missing: true, zipAbsPath };
  }

  const baselineExtractRoot = path.join(workRoot, "baseline", artifact.id);
  const executionExtractRoot = path.join(workRoot, "execution", artifact.id);

  try {
    extractZip(zipAbsPath, baselineExtractRoot);
    extractZip(zipAbsPath, executionExtractRoot);
  } catch (e) {
    return { missing: true, reason: e.message, zipAbsPath };
  }

  const baselineDir = path.join(baselineExtractRoot, artifact.rootDirInZip);
  const executionDir = path.join(executionExtractRoot, artifact.rootDirInZip);

  if (!fs.existsSync(baselineDir) || !fs.existsSync(executionDir)) {
    return {
      missing: true,
      reason: `rootDirInZip '${artifact.rootDirInZip}' introuvable apres extraction`,
      baselineExtractRoot,
      executionExtractRoot
    };
  }

  return { missing: false, baselineDir, executionDir, zipAbsPath };
}

module.exports = { freshDir, extractZip, createIsolatedPair };
