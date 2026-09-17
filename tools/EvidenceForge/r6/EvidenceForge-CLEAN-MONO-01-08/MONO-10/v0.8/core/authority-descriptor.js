"use strict";
/**
 * MONO-10 v0.8 — core/authority-descriptor.js   (§10, §11, §12)
 *
 * Descripteur commun a toutes les autorites critiques. Il rend VERIFIABLE la
 * phrase que v0.7 ne pouvait pas soutenir :
 *
 *   « cette autorite a ete emise par CETTE frontiere operateur provisionnee »
 *
 * En v0.7, `isProvisioned*` ne prouvait que « cree par ce module ». L'audit a
 * construit de vraies autorites depuis un chemin d'appelant. Ici, chaque
 * autorite est indissociable de l'identite de la frontiere qui l'a emise, et
 * un consommateur peut EXIGER la frontiere courante.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");

const KIND = Object.freeze({
  PROVENANCE: "PROVENANCE_AUTHORITY",
  HISTORICAL_INPUT: "HISTORICAL_INPUT_AUTHORITY",
  HUMAN_ACT: "HUMAN_ACT_AUTHORITY",
  LLM_CAPABILITY: "LLM_CAPABILITY_AUTHORITY",
});

/**
 * makeAuthorityDescriptor(issuance, kind, extra)
 * `issuance` est la poignee d'emission de la frontiere : elle a deja ete
 * validee par l'appelant de cette fonction (le module d'autorite).
 */
function makeAuthorityDescriptor(issuance, kind, extra) {
  if (!issuance || !isNonEmptyStr(issuance.operatorBoundaryId)) {
    throw fail("AUTHORITY_DESCRIPTOR_INVALID", "poignee d'emission sans identite de frontiere.");
  }
  if (!KIND[Object.keys(KIND).filter((k) => KIND[k] === kind)[0]]) {
    throw fail("AUTHORITY_KIND_UNKNOWN", "genre d'autorite \"" + kind + "\" inconnu.");
  }
  const d = {
    schema: "EvidenceForge.AuthorityDescriptor", schemaVersion: "MONO-10-v8",
    operatorBoundaryId: issuance.operatorBoundaryId,
    authorityKind: kind,
    executionMode: issuance.namespace,
    /** §9 — DERIVE du contexte de provisionnement, jamais d'un chemin fourni. */
    provisionedFrom: issuance.provisionedFrom,
    configBindingHash: issuance.configBindingHash,
    issuerGeneration: issuance.issuerGeneration,
    issuedAt: new Date().toISOString(),
    detail: Object.freeze(Object.assign({}, extra || {})),
  };
  d.authorityId = kind.toLowerCase().replace(/_/g, "-") + ":"
    + sha256Of({ b: d.operatorBoundaryId, k: kind, c: d.configBindingHash, g: d.issuerGeneration, x: d.detail }).slice(0, 16);
  d.descriptorHash = sha256Of(d);
  return Object.freeze(d);
}

/**
 * assertSameBoundary(descriptor, expectedBoundaryId, label) — §12.
 * Une autorite (ou une capacite qu'elle a emise) presentee sous une AUTRE
 * frontiere est refusee, meme si les fichiers, l'autorite et le namespace sont
 * identiques.
 */
function assertSameBoundary(descriptor, expectedBoundaryId, label) {
  if (!descriptor || !isNonEmptyStr(descriptor.operatorBoundaryId)) {
    throw fail("AUTHORITY_NOT_BOUNDARY_ISSUED", (label || "autorite") + " : aucune identite de frontiere emettrice.");
  }
  if (!isNonEmptyStr(expectedBoundaryId)) {
    throw fail("AUTHORITY_BOUNDARY_EXPECTATION_MISSING",
      (label || "autorite") + " : la frontiere attendue n'est pas nommee — on ne verifie pas une origine contre rien.");
  }
  if (descriptor.operatorBoundaryId !== expectedBoundaryId) {
    throw fail("AUTHORITY_CROSS_BOUNDARY",
      (label || "autorite") + " : emise par la frontiere \"" + descriptor.operatorBoundaryId
      + "\", presentee sous \"" + expectedBoundaryId + "\" — refus.");
  }
  return true;
}

module.exports = { makeAuthorityDescriptor, assertSameBoundary, KIND };
