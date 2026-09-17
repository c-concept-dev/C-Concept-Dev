"use strict";
/**
 * MONO-10 v0.7 — core/operator-provenance-authority.js   (§32, §33, §34)
 *
 * FERMETURE de l'observation non declaree de l'audit v0.6.
 *
 * En v0.6, `sourceRootId`, `authorityRootId`, `familyRootId` etaient des
 * CHAINES que l'appelant ecrivait dans un artefact avant de l'enregistrer. Le
 * registre authentifiait la liaison au run, pas la veracite des racines. Un
 * appelant obtenait donc une confiance d'identite STRONG en presentant la meme
 * source sous deux etiquettes d'autorite inventees : l'independance etait
 * AUTO-DECLAREE, alors que `TRUST-MODEL.md` affirmait l'inverse.
 *
 * v0.7 : les racines d'AUTORITE et de FAMILLE ne sont plus lues sur l'artefact.
 * Elles sont RESOLUES contre un registre de racines provisionne par
 * l'exploitant, hors du processus appelant. Ce que l'artefact porte n'est plus
 * qu'une DEMANDE de resolution.
 *
 *   racine inconnue du registre  ->  UNRESOLVED  (donc jamais independante)
 *   racine ambigue               ->  AMBIGUOUS   (jamais resolue en silence)
 *   racine reconnue              ->  AUTHENTICATED, avec les racines DU REGISTRE
 *
 * L'appelant ne cree pas l'independance en changeant des chaines : pour
 * obtenir deux autorites independantes, il faut que l'exploitant ait
 * reellement enregistre deux autorites distinctes.
 */

const fs = require("fs");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");
const CC = require("./canonical-contracts.js");

const STATUS = CC.PROVENANCE_STATUS;
const AUTHORITY_BRAND = new WeakSet();

function normalizeRoot(r, i) {
  if (!r || typeof r !== "object") throw fail("PROVENANCE_ROOT_INVALID", "entree[" + i + "] : objet requis.");
  if (!isNonEmptyStr(r.sourceRootId)) throw fail("PROVENANCE_ROOT_INVALID", "entree[" + i + "] : sourceRootId requis.");
  return Object.freeze({
    sourceRootId: r.sourceRootId,
    authorityRootId: isNonEmptyStr(r.authorityRootId) ? r.authorityRootId : null,
    familyRootId: isNonEmptyStr(r.familyRootId) ? r.familyRootId : null,
    attestedAt: isNonEmptyStr(r.attestedAt) ? r.attestedAt : null,
  });
}

/**
 * createOperatorProvenanceAuthority(cfg)
 * cfg.kind         "OPERATOR_ROOT_REGISTRY"
 * cfg.registryPath fichier JSON { roots: [...] }   (lu par l'autorite elle-meme)
 * cfg.roots        variante en memoire, reservee au namespace TEST
 * cfg.namespace    TEST | PRODUCTION
 */
function createOperatorProvenanceAuthority(cfg) {
  cfg = cfg || {};
  const namespace = cfg.namespace === "TEST" ? "TEST" : "PRODUCTION";
  let roots, sourcePath = null;
  if (isNonEmptyStr(cfg.registryPath)) {
    sourcePath = cfg.registryPath;
    let raw;
    try { raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
    catch (e) { throw fail("PROVENANCE_REGISTRY_UNREADABLE", "registre de racines illisible : " + ((e && e.message) || e)); }
    if (!Array.isArray(raw.roots)) throw fail("PROVENANCE_REGISTRY_INVALID", "roots[] requis.");
    roots = raw.roots.map(normalizeRoot);
  } else if (Array.isArray(cfg.roots)) {
    if (namespace === "PRODUCTION") {
      throw fail("PROVENANCE_REGISTRY_IN_PROCESS_REFUSED",
        "une autorite de provenance de PRODUCTION ne peut pas etre alimentee en memoire par le processus appelant : un chemin de registre est requis.");
    }
    roots = cfg.roots.map(normalizeRoot);
  } else {
    throw fail("PROVENANCE_REGISTRY_MISSING", "aucun registre de racines provisionne — fail closed.");
  }

  const bySource = new Map();
  roots.forEach(function (r) {
    if (!bySource.has(r.sourceRootId)) bySource.set(r.sourceRootId, []);
    bySource.get(r.sourceRootId).push(r);
  });
  const authorityId = "provenance-authority:" + sha256Of({ p: sourcePath, n: namespace, c: roots.length }).slice(0, 16);
  const registryHash = sha256Of({ roots: roots });

  function resolveRoots(descriptor) {
    const asked = descriptor && descriptor.sourceRootId;
    if (!isNonEmptyStr(asked)) {
      return { status: STATUS.ABSENT, sourceRootId: null, authorityRootId: null, familyRootId: null,
        problems: ["aucune racine de source demandee : l'origine reelle de la preuve est inconnue"], derivationRef: null };
    }
    const hits = bySource.get(asked) || [];
    if (hits.length === 0) {
      return { status: STATUS.UNRESOLVED, sourceRootId: null, authorityRootId: null, familyRootId: null,
        problems: ["racine de source \"" + asked + "\" absente du registre provisionne par l'exploitant — "
          + "une racine declaree par l'appelant n'est pas une racine authentifiee"], derivationRef: null };
    }
    const distinct = [];
    hits.forEach(function (h) {
      const k = h.authorityRootId + "|" + h.familyRootId;
      if (distinct.indexOf(k) === -1) distinct.push(k);
    });
    if (distinct.length > 1) {
      return { status: STATUS.AMBIGUOUS, sourceRootId: asked, authorityRootId: null, familyRootId: null,
        problems: [hits.length + " entrees de racines divergentes pour \"" + asked + "\" — ambiguite jamais resolue en silence"],
        derivationRef: null };
    }
    const r = hits[0];
    // Les racines rendues sont celles DU REGISTRE, jamais celles de l'artefact.
    return { status: STATUS.AUTHENTICATED, sourceRootId: r.sourceRootId,
      authorityRootId: r.authorityRootId, familyRootId: r.familyRootId, problems: [],
      derivationRef: "provenance-root:" + sha256Of({ entry: r, registryHash: registryHash }).slice(0, 32) };
  }

  /** §34 — ce que l'artefact DECLARAIT, pour trace ; jamais pour decider. */
  function declaredVersusAuthenticated(record, resolved) {
    const declared = { authorityRootId: (record && record.authorityRootId) || null,
      familyRootId: (record && record.familyRootId) || null };
    const agrees = resolved.status === STATUS.AUTHENTICATED
      && declared.authorityRootId === resolved.authorityRootId
      && declared.familyRootId === resolved.familyRootId;
    return { declared: declared, authenticated: { authorityRootId: resolved.authorityRootId, familyRootId: resolved.familyRootId },
      declarationAgrees: agrees,
      note: "les racines retenues sont celles du registre de l'exploitant ; la declaration portee par l'artefact n'a aucun effet." };
  }

  const authority = { schema: "EvidenceForge.EvidenceProvenanceAuthority", authorityId: authorityId,
    namespace: namespace, provisionedFrom: sourcePath ? "ENVIRONMENT" : "IN_PROCESS_TEST",
    registryHash: registryHash, rootCount: roots.length,
    knownSourceRoots: Object.freeze(Array.from(bySource.keys())),
    resolveRoots: resolveRoots, declaredVersusAuthenticated: declaredVersusAuthenticated, STATUS: STATUS };
  AUTHORITY_BRAND.add(authority);
  return Object.freeze(authority);
}

function isProvisionedProvenanceAuthority(a) {
  if (!a || !AUTHORITY_BRAND.has(a)) return false;
  return typeof a.resolveRoots === "function" && isNonEmptyStr(a.authorityId);
}

module.exports = { createOperatorProvenanceAuthority, isProvisionedProvenanceAuthority, STATUS };
