"use strict";
/**
 * MONO-08 — lib/frozen-zip-integrity.js
 *
 * Verifie que les ZIP canoniques geles restent bit-a-bit identiques
 * avant/apres toute execution MONO-08. MONO-08 ne travaille jamais
 * directement sur le kit — uniquement des copies/extractions ailleurs.
 *
 * DECOUVERTE (audit independant) : le "kit" (kitRoot, structure
 * 04-ARTEFACTS-CANONIQUES/MONO/) est le kit de baseline gele deja verifie
 * par MONO-06-R3 — il contient MONO-00 a MONO-06-R3 (7 ZIP), jamais
 * MONO-07 (verifie : kit-r3 n'a jamais inclus le ZIP de MONO-07, celui-ci
 * est un livrable FRERE, distinct, reference par MONO-08 via son
 * repertoire lib/ — EVIDENCEFORGE_MONO07_LIB_PATH — jamais par une copie
 * dans le kit). hashKit() accepte donc desormais un second parametre
 * optionnel mono07ZipPath : si fourni, le ZIP de MONO-07 est inclus dans
 * le meme mecanisme de verification, aligne sur le contrat reel de
 * MONO-08 (qui depend reellement de MONO-07). Retro-compatible : sans ce
 * parametre, seuls les 7 ZIP du kit sont verifies comme avant.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EXPECTED_FILES = [
  "EvidenceForge-MONO-00-v1.zip",
  "EvidenceForge-MONO-01-v1.zip",
  "EvidenceForge-MONO-02-R1.zip",
  "EvidenceForge-MONO-03-R1.zip",
  "EvidenceForge-MONO-04-R1.zip",
  "EvidenceForge-MONO-05-R3.zip",
  "EvidenceForge-MONO-06-R3.zip",
];

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hashKit(kitRoot, mono07ZipPath) {
  const monoDir = path.join(kitRoot, "04-ARTEFACTS-CANONIQUES", "MONO");
  const hashes = {};
  for (const f of EXPECTED_FILES) {
    const p = path.join(monoDir, f);
    if (!fs.existsSync(p)) {
      hashes[f] = { present: false, sha256: null };
      continue;
    }
    hashes[f] = { present: true, sha256: sha256File(p) };
  }
  if (mono07ZipPath) {
    const key = "EvidenceForge-MONO-07-v1.zip";
    if (!fs.existsSync(mono07ZipPath)) {
      hashes[key] = { present: false, sha256: null };
    } else {
      hashes[key] = { present: true, sha256: sha256File(mono07ZipPath) };
    }
  }
  return hashes;
}

function compareHashes(before, after) {
  const files = Object.keys(before);
  const diffs = [];
  for (const f of files) {
    const b = before[f];
    const a = after[f] || { present: false, sha256: null };
    if (b.sha256 !== a.sha256 || b.present !== a.present) {
      diffs.push({ file: f, before: b, after: a });
    }
  }
  return { identical: diffs.length === 0, diffs: diffs };
}

module.exports = { hashKit: hashKit, compareHashes: compareHashes, EXPECTED_FILES: EXPECTED_FILES };
