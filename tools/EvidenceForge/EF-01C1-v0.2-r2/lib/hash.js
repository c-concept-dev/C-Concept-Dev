"use strict";
// EF-01C1-v0.2-r1 — lib/hash.js — inchange par rapport a v0.2 (meme
// convention canonique du CDC section 8, memes primitives gelees R6
// reutilisees). Ajoute computeCanonicalContentHash(), utilise pour
// resolverOutputHash (F-07, consomme par EF-01C1-v0.2-r1) — thin wrapper,
// aucune nouvelle logique de hachage.

const path = require("path");

function loadHashDeps(bundleRoot) {
  if (!bundleRoot) {
    throw new Error("loadHashDeps: bundleRoot requis (racine de l'extraction R6) — jamais un chemin implicite.");
  }
  const hashModulePath = path.join(bundleRoot, "MONO-01", "dependencies", "ef-orch-hash-v0.1.js");
  const EFOrchHash = require(hashModulePath);
  return {
    canonicalJson: EFOrchHash.canonicalJson,
    sha256Bytes: EFOrchHash.sha256Bytes,
    sha256CanonicalJson: EFOrchHash.sha256CanonicalJson,
  };
}

async function computeInputHash(hashDeps, canonicalInputObject) {
  return hashDeps.sha256CanonicalJson(canonicalInputObject);
}

async function computeRawResponseHash(hashDeps, rawResponseText) {
  const bytes = new TextEncoder().encode(String(rawResponseText));
  return hashDeps.sha256Bytes(bytes);
}

async function computePromptTemplateHash(hashDeps, promptTemplateString) {
  const bytes = new TextEncoder().encode(String(promptTemplateString));
  return hashDeps.sha256Bytes(bytes);
}

// RESOLVER_OUTPUT_HASH_SPEC (F-07) : hash du contenu causal COMPLET de la
// sortie resolver (proposals[] + targetContextReport), pour lier
// causalement le planner (EF-01C1-v0.2-r1) au contenu REEL du resolver —
// jamais un simple compteur. Meme primitive canonique que les autres hash
// de ce lot.
async function computeCanonicalContentHash(hashDeps, canonicalContentObject) {
  return hashDeps.sha256CanonicalJson(canonicalContentObject);
}

module.exports = {
  loadHashDeps: loadHashDeps,
  computeInputHash: computeInputHash,
  computeRawResponseHash: computeRawResponseHash,
  computePromptTemplateHash: computePromptTemplateHash,
  computeCanonicalContentHash: computeCanonicalContentHash,
};
