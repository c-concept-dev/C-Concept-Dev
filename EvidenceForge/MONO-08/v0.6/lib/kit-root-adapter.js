#!/usr/bin/env node
"use strict";
/**
 * MONO-08 — lib/kit-root-adapter.js
 *
 * REMEDIATION R2 (B-04, audit indépendant round 2) : le paquet de
 * remédiation livre MONO-00/ -> MONO-07/ en clair (jamais en ZIP,
 * mandat section 18 : exactement MONO-01..MONO-08 + AUDIT-REMEDIATION +
 * TEST-REPORTS + MIGRATION-NOTES + RELEASE-MANIFEST.md). Mais
 * MONO-07/lib/harness-env.js (lot gelé, JAMAIS modifié ici) attend un
 * layout `KIT_ROOT/04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-05-
 * *.zip` — et MONO-06 (`mono06-gate.js`, également gelé) attend le même
 * layout pour MONO-00..MONO-06.
 *
 * Ce module NE MODIFIE NI harness-env.js NI mono06-gate.js : il
 * construit, à la demande et dans un répertoire TEMPORAIRE, EXACTEMENT
 * le layout que ces modules gelés attendent déjà — à partir du contenu
 * canonique livré en clair dans ce même paquet. MONO-05/ en clair reste
 * l'unique source canonique : le ZIP temporaire produit ici n'est
 * JAMAIS une seconde copie permanente/concurrente, seulement un artefact
 * jetable régénéré à chaque appel (voir mandat section 15 : « MONO-05/
 * présent dans le bundle doit rester l'unique source canonique »).
 *
 * Aucune ligne d'aucun lot gelé (MONO-00->07) n'est modifiée par ce
 * fichier.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const KNOWN_LOTS = ["MONO-00", "MONO-01", "MONO-02", "MONO-03", "MONO-04", "MONO-05", "MONO-06", "MONO-07"];

/**
 * buildTemporaryKitRoot(bundleRoot, outDir)
 *
 * bundleRoot : racine du paquet remédié en clair, contenant MONO-00/ ...
 * MONO-07/ (chacun le dossier canonique tel que livré — jamais un ZIP).
 * outDir : répertoire de travail JETABLE (créé/vidé par cette fonction) —
 * jamais un chemin partagé avec le paquet source lui-même.
 *
 * Retourne le chemin de la racine KIT_ROOT temporaire construite
 * (contenant 04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-XX-clean.zip
 * pour chaque lot MONO-00..MONO-07 réellement présent dans bundleRoot).
 * Un lot absent de bundleRoot est silencieusement ignoré (jamais un ZIP
 * vide fabriqué) — l'appelant (assertMono06GatePasses, extractFrozenMono05)
 * échoue alors lui-même explicitement si un lot requis manque, jamais
 * masqué ici.
 */
function buildTemporaryKitRoot(bundleRoot, outDir) {
  if (!bundleRoot || !fs.existsSync(bundleRoot)) {
    throw new Error("buildTemporaryKitRoot: bundleRoot introuvable (\"" + bundleRoot + "\") — jamais un chemin implicite.");
  }
  if (!outDir) {
    throw new Error("buildTemporaryKitRoot: outDir requis (repertoire de travail jetable explicite, jamais devine).");
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  const monoDir = path.join(outDir, "04-ARTEFACTS-CANONIQUES", "MONO");
  fs.mkdirSync(monoDir, { recursive: true });

  const built = [];
  for (const lot of KNOWN_LOTS) {
    const lotDir = path.join(bundleRoot, lot);
    if (!fs.existsSync(lotDir)) continue;
    const zipName = "EvidenceForge-" + lot + "-clean.zip";
    const zipPath = path.join(monoDir, zipName);
    // zip -rq depuis l'INTERIEUR du dossier parent, avec le nom du lot
    // comme entree racine — reproduit exactement la structure
    // <LOT>/... attendue a l'interieur du ZIP par extractFrozenMono05()/
    // resolveZip() (jamais un chemin absolu ni un contenu aplati).
    execFileSync("zip", ["-rq", zipPath, lot], { cwd: bundleRoot, stdio: "pipe" });
    built.push({ lot: lot, zipPath: zipPath });
  }
  if (built.length === 0) {
    throw new Error("buildTemporaryKitRoot: aucun lot MONO-00..MONO-07 trouve sous \"" + bundleRoot + "\" — jamais un KIT_ROOT vide fabrique silencieusement.");
  }
  return outDir;
}

if (require.main === module) {
  const bundleRoot = process.argv[2];
  const outDir = process.argv[3];
  if (!bundleRoot || !outDir) {
    console.error("Usage: node lib/kit-root-adapter.js <bundleRoot> <outDir>");
    process.exit(2);
  }
  try {
    const result = buildTemporaryKitRoot(path.resolve(bundleRoot), path.resolve(outDir));
    console.log(result);
  } catch (e) {
    console.error("kit-root-adapter: " + e.message);
    process.exit(1);
  }
}

module.exports = { buildTemporaryKitRoot: buildTemporaryKitRoot, KNOWN_LOTS: KNOWN_LOTS };
