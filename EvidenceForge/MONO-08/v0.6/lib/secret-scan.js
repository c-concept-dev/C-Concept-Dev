"use strict";
/**
 * MONO-08 — lib/secret-scan.js
 *
 * Recherche la VALEUR d'un secret connu dans un ensemble de textes/objets
 * (RunState, ArtifactRecord, reports, trace, logs, DOM, storage) — jamais
 * un affichage du secret lui-meme dans les logs de ce scanner. Ne rapporte
 * que le nombre d'occurrences trouvees + l'emplacement, jamais la valeur.
 */

function scanForSecretValues(haystackByLabel, secretValues) {
  const occurrences = [];
  for (const label of Object.keys(haystackByLabel)) {
    const value = haystackByLabel[label];
    const text = typeof value === "string" ? value : JSON.stringify(value);
    for (const secretValue of secretValues) {
      if (!secretValue) continue;
      if (text.includes(secretValue)) {
        occurrences.push({ location: label, found: true });
      }
    }
  }
  return { clean: occurrences.length === 0, occurrences: occurrences };
}

module.exports = { scanForSecretValues: scanForSecretValues };
