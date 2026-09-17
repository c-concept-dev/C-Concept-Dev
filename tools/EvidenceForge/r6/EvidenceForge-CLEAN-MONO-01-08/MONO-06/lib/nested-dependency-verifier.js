"use strict";
/**
 * MONO-06 — nested-dependency-verifier.js  (T06-04)
 *
 * Verifie le hash bytewise des dependances imbriquees a travers TOUTE la
 * chaine, pas seulement niveau par niveau isolement (exigence CDC point 3):
 *
 *   MONO-05 -> dependencies/MONO-04 -> dependencies/MONO-03
 *           -> dependencies/MONO-02 -> dependencies/MONO-01
 *           -> dependencies/*.js (copies bytewise des 7 lots historiques)
 *
 * Deux mecanismes distincts, tous deux operant sur les BASELINES PRISTINES
 * (jamais sur un execution workspace) :
 *
 * A. Pour MONO-02..05 : le sous-arbre dependencies/MONO-(X-1)/... imbrique
 *    dans MONO-X est compare fichier par fichier (hash SHA-256) au
 *    contenu de la baseline pristine STANDALONE de MONO-(X-1)-v1.zip.
 *    Une difference = mutation reelle detectee, jamais masquee par une
 *    verification uniquement au niveau manifeste.
 *
 * B. Pour MONO-01 : chaque fichier plat dependencies/*.js est mis en
 *    correspondance avec sa source declaree dans dependencies/PROVENANCE.md
 *    (parse de la table markdown), puis son hash est recalcule et compare
 *    au fichier correspondant dans la baseline pristine STANDALONE du
 *    paquet historique source (jamais en faisant confiance au hash ecrit
 *    dans PROVENANCE.md lui-meme — recalcul independant a partir du ZIP
 *    canonique historique).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256File(absPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function listFilesRecursive(rootAbs) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(path.relative(rootAbs, abs));
    }
  })(rootAbs);
  return out.sort();
}

/**
 * A. Compare bytewise un sous-arbre imbrique a la baseline standalone
 *    du meme artefact.
 */
function compareNestedSubtree(nestedAbsDir, standaloneAbsDir) {
  if (!fs.existsSync(nestedAbsDir)) {
    return { status: "FAIL", reason: `sous-arbre imbrique absent: ${nestedAbsDir}` };
  }
  if (!fs.existsSync(standaloneAbsDir)) {
    return { status: "FAIL", reason: `baseline standalone absente: ${standaloneAbsDir}` };
  }
  const nestedFiles = new Set(listFilesRecursive(nestedAbsDir));
  const standaloneFiles = new Set(listFilesRecursive(standaloneAbsDir));

  const onlyInNested = [...nestedFiles].filter((f) => !standaloneFiles.has(f));
  const onlyInStandalone = [...standaloneFiles].filter((f) => !nestedFiles.has(f));
  const mismatches = [];

  for (const relFile of nestedFiles) {
    if (!standaloneFiles.has(relFile)) continue;
    const h1 = sha256File(path.join(nestedAbsDir, relFile));
    const h2 = sha256File(path.join(standaloneAbsDir, relFile));
    if (h1 !== h2) mismatches.push({ relFile, nestedHash: h1, standaloneHash: h2 });
  }

  const status = onlyInNested.length === 0 && onlyInStandalone.length === 0 && mismatches.length === 0
    ? "PASS"
    : "FAIL";

  return { status, onlyInNested, onlyInStandalone, mismatches, filesCompared: nestedFiles.size };
}

/**
 * Parse la table markdown de dependencies/PROVENANCE.md.
 * Format de ligne attendu :
 * "| <fichier> | <NomZip.zip>[ / <sous-dossier>/] | <hash> |"
 */
function parseProvenanceTable(provenanceAbsPath) {
  const content = fs.readFileSync(provenanceAbsPath, "utf8");
  const rows = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([a-fA-F0-9]{64})\s*\|\s*$/);
    if (!m) continue;
    const [, fichier, sourceRaw, hash] = m;
    if (fichier === "Fichier" || fichier === "---" || /^-+$/.test(fichier)) continue;
    const sourceMatch = sourceRaw.match(/^(.+?\.zip)\s*(?:\/\s*(.+?)\/?\s*)?$/);
    if (!sourceMatch) continue;
    rows.push({
      fichier: fichier.trim(),
      sourceZip: sourceMatch[1].trim(),
      sourceSubdir: (sourceMatch[2] || "").trim(),
      declaredHash: hash.toLowerCase()
    });
  }
  return rows;
}

/**
 * B. Verifie chaque fichier plat de MONO-01/dependencies/*.js contre la
 *    baseline standalone du paquet historique source declare dans
 *    PROVENANCE.md.
 *
 * historicalBaselineDirsByZipName: { "EF-ORCH-RELEASE-v0.1.zip": "<abs baselineDir>", ... }
 */
function verifyMono01ProvenanceChain(mono01BaselineDir, historicalBaselineDirsByZipName) {
  const provenancePath = path.join(mono01BaselineDir, "dependencies", "PROVENANCE.md");
  if (!fs.existsSync(provenancePath)) {
    return { status: "FAIL", reason: "dependencies/PROVENANCE.md introuvable dans MONO-01" };
  }
  const rows = parseProvenanceTable(provenancePath);
  if (rows.length === 0) {
    return { status: "FAIL", reason: "PROVENANCE.md ne contient aucune ligne exploitable" };
  }

  const results = [];
  for (const row of rows) {
    const localFileAbs = path.join(mono01BaselineDir, "dependencies", row.fichier);
    if (!fs.existsSync(localFileAbs)) {
      results.push({ ...row, status: "FAIL", reason: "fichier absent de MONO-01/dependencies" });
      continue;
    }
    const historicalBaseDir = historicalBaselineDirsByZipName[row.sourceZip];
    if (!historicalBaseDir) {
      results.push({ ...row, status: "FAIL", reason: `paquet historique source non fourni au verificateur: ${row.sourceZip}` });
      continue;
    }
    const candidatePaths = row.sourceSubdir
      ? [path.join(historicalBaseDir, row.sourceSubdir, row.fichier)]
      : [path.join(historicalBaseDir, row.fichier)];
    // Tolerance : si le sous-dossier declare n'existe pas tel quel, chercher le fichier
    // n'importe ou dans l'arbre du paquet historique (mais jamais inventer une correspondance
    // si plusieurs fichiers homonymes existent : ambiguite => FAIL explicite).
    let sourceAbs = candidatePaths.find(fs.existsSync);
    if (!sourceAbs) {
      const allFiles = listFilesRecursive(historicalBaseDir);
      const matches = allFiles.filter((f) => path.basename(f) === row.fichier);
      if (matches.length === 1) sourceAbs = path.join(historicalBaseDir, matches[0]);
      else if (matches.length > 1) {
        results.push({ ...row, status: "FAIL", reason: `ambigu: ${matches.length} fichiers homonymes trouves dans ${row.sourceZip}` });
        continue;
      }
    }
    if (!sourceAbs) {
      results.push({ ...row, status: "FAIL", reason: `fichier source introuvable dans la baseline de ${row.sourceZip}` });
      continue;
    }
    const localHash = sha256File(localFileAbs);
    const sourceHash = sha256File(sourceAbs);
    const status = localHash === sourceHash ? "PASS" : "FAIL";
    results.push({ ...row, status, localHash, sourceHash, recomputedFromCanonical: true });
  }

  const allPass = results.every((r) => r.status === "PASS");
  return { status: allPass ? "PASS" : "FAIL", rowCount: rows.length, results };
}

module.exports = {
  sha256File,
  listFilesRecursive,
  compareNestedSubtree,
  parseProvenanceTable,
  verifyMono01ProvenanceChain
};
