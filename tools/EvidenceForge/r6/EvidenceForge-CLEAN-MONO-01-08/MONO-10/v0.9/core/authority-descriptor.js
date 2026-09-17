"use strict";
/**
 * MONO-10 v0.9 — core/authority-descriptor.js   (§10, §11, §12)
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
 * §3/§4/§5 (v0.9) — FERMETURE R1. IDENTITE COMPOSITE DE FRONTIERE.
 *
 * v0.8 comparait le seul `operatorTrustBoundaryId`. Or cet identifiant est
 * DECLARE dans la configuration : l'audit A a provisionne deux configurations
 * distinctes portant `operatorTrustBoundaryId = "MEME-ID"` — racines de
 * provenance differentes — et l'autorite de l'une a emis une capacite sur le
 * run de l'autre, pour une racine que la seconde ne connaissait pas.
 *
 * `configBindingHash` etait deja PORTE par chaque descripteur. Il n'etait pas
 * COMPARE. Porter une preuve sans la verifier ne protege de rien.
 *
 * v0.9 : deux frontieres ne sont « la meme » que si l'identite COMPOSITE
 * coincide — identifiant declare ET liaison de configuration ET espace
 * d'execution. Chaque champ manquant est un refus, pas une tolerance.
 */
function boundaryIdentityOf(source) {
  if (!source) return null;
  const id = source.operatorBoundaryId || source.operatorTrustBoundaryId || null;
  const cbh = source.configBindingHash || null;
  const mode = source.executionMode || source.namespace || null;
  if (!isNonEmptyStr(id) || !isNonEmptyStr(cbh)) return null;
  return Object.freeze({ operatorBoundaryId: id, configBindingHash: cbh, executionMode: mode,
    identityHash: sha256Of({ id: id, cbh: cbh, mode: mode }) });
}

/**
 * assertSameBoundary(descriptor, expected, label)
 * `expected` : identite composite, ou objet portant les champs (verificateur,
 * manifeste, descripteur). Un simple identifiant en chaine est REFUSE : il ne
 * suffit plus a prouver une origine.
 */
function assertSameBoundary(descriptor, expected, label) {
  const tag = label || "autorite";
  const mine = boundaryIdentityOf(descriptor);
  if (!mine) {
    throw fail("AUTHORITY_NOT_BOUNDARY_ISSUED",
      tag + " : identite de frontiere emettrice incomplete (identifiant et configBindingHash requis).");
  }
  if (typeof expected === "string") {
    throw fail("AUTHORITY_BOUNDARY_EXPECTATION_INCOMPLETE",
      tag + " : un identifiant declare ne prouve pas une frontiere. L'identite attendue doit porter "
      + "configBindingHash — un identifiant seul est declaratif (R1).");
  }
  const theirs = boundaryIdentityOf(expected);
  if (!theirs) {
    throw fail("AUTHORITY_BOUNDARY_EXPECTATION_MISSING",
      tag + " : la frontiere attendue n'est pas identifiee completement — on ne verifie pas une origine contre rien.");
  }
  if (mine.operatorBoundaryId !== theirs.operatorBoundaryId) {
    throw fail("AUTHORITY_CROSS_BOUNDARY",
      tag + " : emise par la frontiere \"" + mine.operatorBoundaryId + "\", presentee sous \""
      + theirs.operatorBoundaryId + "\" — refus.");
  }
  if (mine.configBindingHash !== theirs.configBindingHash) {
    throw fail("AUTHORITY_CONFIG_BINDING_MISMATCH",
      tag + " : meme identifiant declare (\"" + mine.operatorBoundaryId + "\") mais liaison de configuration "
      + "differente — deux configurations distinctes ne sont pas la meme frontiere (R1).");
  }
  if (isNonEmptyStr(theirs.executionMode) && isNonEmptyStr(mine.executionMode)
    && mine.executionMode !== theirs.executionMode) {
    throw fail("AUTHORITY_EXECUTION_MODE_MISMATCH",
      tag + " : espace d'execution \"" + mine.executionMode + "\" presente sous \"" + theirs.executionMode + "\".");
  }
  return true;
}

/** Vrai/faux, sans lever : pour les predicats isProvisioned*. */
function sameBoundary(descriptor, expected) {
  try { return assertSameBoundary(descriptor, expected, "identite"); }
  catch (e) { return false; }
}

module.exports = { makeAuthorityDescriptor, assertSameBoundary, sameBoundary, boundaryIdentityOf, KIND };
