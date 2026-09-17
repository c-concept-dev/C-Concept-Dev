"use strict";
/**
 * MONO-06 — known-limitations-checker.js  (T06-16)
 *
 * Verifie que les limites connues et assumees, listees dans
 * 03-BASELINE/KNOWN-LIMITATIONS.md, restent effectivement documentees
 * dans le lot gele concerne — jamais "corrigees" silencieusement par une
 * regression de perimetre qui ferait disparaitre la mention de la limite.
 *
 * Chaque marqueur ci-dessous a ete verifie manuellement present (au moins
 * une fois, hors dependencies/) dans le lot concerne avant d'etre inscrit
 * ici — ce fichier ne fait que rejouer cette verification, jamais
 * l'inventer.
 *
 * Note de perimetre : ceci verifie la PRESENCE de la documentation de la
 * limite, jamais son bien-fonde technique (qui releve de l'audit
 * independant du lot d'origine, deja effectue et gele).
 */

const fs = require("fs");
const path = require("path");

const KNOWN_LIMITATIONS = [
  {
    id: "EF-04-assurance-level",
    artifactId: "EF-04",
    marker: "reference_revalidated_not_source_hash_bound",
    description: "targetDocuments/documentaryTwins non hash-bound depuis EF-03 — doit rester documente, jamais masque."
  },
  {
    id: "MONO-03-runlock",
    artifactId: "MONO-03",
    marker: "RunLock",
    description: "Pas de compare-and-swap distribue — get()+put() simple, acceptable en memoire uniquement."
  },
  {
    id: "MONO-04-idempotence-in-process",
    artifactId: "MONO-04",
    marker: "in-process",
    description: "Cache de deduplication requestId+fingerprint in-process uniquement, aucune garantie cross-process."
  },
  {
    id: "MONO-05-externalstageadapter-blocked",
    artifactId: "MONO-05",
    marker: "BLOCKED",
    description: "EF-02A/B/C non pilotables depuis le formulaire generique — restent BLOCKED pour tout run cree via MONO-05."
  },
  {
    id: "MONO-05-accessibility-no-automated-audit",
    artifactId: "MONO-05",
    marker: "axe-core",
    description: "Audit accessibilite manuel/cible, aucun outil automatise exhaustif type axe-core integre."
  }
];

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".zip", ".ico", ".woff", ".woff2"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dependencies"]);

function fileContainsMarker(rootAbs, marker) {
  let found = false;
  const matches = [];
  (function walk(dir) {
    if (found) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      let content;
      try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
      if (content.includes(marker)) {
        matches.push(path.relative(rootAbs, abs));
      }
    }
  })(rootAbs);
  return matches;
}

/**
 * baselineDirsById: { "EF-04": "<abs baselineDir>", "MONO-03": "<abs baselineDir>", ... }
 */
function checkKnownLimitations(baselineDirsById) {
  const results = KNOWN_LIMITATIONS.map((lim) => {
    const baselineDir = baselineDirsById[lim.artifactId];
    if (!baselineDir) {
      return { ...lim, status: "SKIPPED", reason: "artefact non fourni au checker" };
    }
    const matches = fileContainsMarker(baselineDir, lim.marker);
    return { ...lim, status: matches.length > 0 ? "PASS" : "FAIL", matches };
  });
  const status = results.every((r) => r.status === "PASS" || r.status === "SKIPPED") ? "PASS" : "FAIL";
  return { status, results };
}

module.exports = { KNOWN_LIMITATIONS, checkKnownLimitations };
