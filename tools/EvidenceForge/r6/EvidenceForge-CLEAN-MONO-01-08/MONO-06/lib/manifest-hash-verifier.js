"use strict";
/**
 * MONO-06 — manifest-hash-verifier.js  (T06-03)
 *
 * Verifie le manifeste SHA-256 racine de chaque artefact, dans sa
 * BASELINE PRISTINE uniquement (jamais dans l'execution workspace).
 *
 * Ne suppose jamais un nom de fichier manifeste unique : chaque artefact
 * declare ses propres manifestPaths dans artifact-registry.js (verifie
 * physiquement au prealable, voir CDC-TRACE.md).
 *
 * Un artefact sans manifeste interne connu (manifestStatus =
 * HISTORICAL_FREEZE_CONFIRMED_NO_MANIFEST) n'est pas un echec : c'est un
 * statut de preuve deja documente dans missing-evidence.json. Le check
 * remonte alors SKIPPED_NO_MANIFEST, jamais un FAIL deguise.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Parse un fichier manifeste au format "sha256sum -c" standard :
 * "<hash>  <chemin relatif>\n" par ligne (deux espaces conventionnels,
 * mais on tolere une ou plusieurs espaces pour robustesse).
 */
function parseManifest(absManifestPath) {
  const content = fs.readFileSync(absManifestPath, "utf8");
  const entries = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!m) {
      entries.push({ malformedLine: rawLine });
      continue;
    }
    entries.push({ expectedHash: m[1].toLowerCase(), relPath: m[2].trim() });
  }
  return entries;
}

/**
 * Verifie un manifeste donne. `baseRel` est le chemin (relatif a
 * baselineDir) de la racine du SOUS-ARBRE que ce manifeste decrit —
 * jamais suppose egal a la racine de l'artefact top-level : un manifeste
 * imbrique (ex. dependencies/MONO-01/manifest/SHA256SUMS) liste des
 * chemins relatifs a dependencies/MONO-01/, pas a la racine de
 * l'artefact qui l'englobe. Ce champ est declare explicitement par
 * l'appelant (voir artifact-registry.js), jamais devine par convention
 * de nommage (les 7 lots historiques et les 6 lots MONO n'utilisent pas
 * la meme convention de rangement du fichier manifeste lui-meme).
 */
function verifyManifestFile(baselineDir, manifestRelPath, baseRel) {
  const absManifestPath = path.join(baselineDir, manifestRelPath);
  if (!fs.existsSync(absManifestPath)) {
    return { status: "FAIL", reason: `manifeste introuvable: ${manifestRelPath}` };
  }
  const subtreeRootAbs = path.join(baselineDir, baseRel);
  const entries = parseManifest(absManifestPath);
  const mismatches = [];
  const missingFiles = [];
  const malformed = [];
  let okCount = 0;

  for (const entry of entries) {
    if (entry.malformedLine !== undefined) {
      malformed.push(entry.malformedLine);
      continue;
    }
    const fileAbsPath = path.join(subtreeRootAbs, entry.relPath);
    if (!fs.existsSync(fileAbsPath)) {
      missingFiles.push(entry.relPath);
      continue;
    }
    const actualHash = sha256File(fileAbsPath);
    if (actualHash !== entry.expectedHash) {
      mismatches.push({ relPath: entry.relPath, expected: entry.expectedHash, actual: actualHash });
    } else {
      okCount++;
    }
  }

  const status = mismatches.length === 0 && missingFiles.length === 0 && malformed.length === 0
    ? "PASS"
    : "FAIL";

  return {
    status,
    manifestRelPath,
    totalEntries: entries.length,
    okCount,
    mismatches,
    missingFiles,
    malformed
  };
}

/**
 * Verifie TOUS les manifestes declares d'un artefact (racine + nested,
 * si nestedManifestPaths est fourni) dans sa baseline pristine.
 */
function verifyArtifactManifests(baselineDir, artifact) {
  if (artifact.manifestStatus === "HISTORICAL_FREEZE_CONFIRMED_NO_MANIFEST") {
    return {
      status: "SKIPPED_NO_MANIFEST",
      reason: "Aucun manifeste interne dans ce paquet historique (reconfirme, voir missing-evidence.json) — statut de preuve HISTORICAL_FREEZE_CONFIRMED base sur T06-05..T06-11 (tests rejoues), pas sur un manifeste.",
      results: []
    };
  }

  const allPaths = [
    ...(artifact.manifestPaths || []),
    ...(artifact.nestedManifestPaths || [])
  ];

  if (allPaths.length === 0) {
    return { status: "FAIL", reason: "Aucun manifestPaths declare pour un artefact sans manifestStatus explicite — anomalie de registre", results: [] };
  }

  const results = allPaths.map((p) => {
    const manifestPath = typeof p === "string" ? p : p.path;
    const baseRel = typeof p === "string" ? "." : p.baseRel;
    return verifyManifestFile(baselineDir, manifestPath, baseRel);
  });
  const status = results.every((r) => r.status === "PASS") ? "PASS" : "FAIL";
  return { status, results };
}

module.exports = { sha256File, parseManifest, verifyManifestFile, verifyArtifactManifests };
