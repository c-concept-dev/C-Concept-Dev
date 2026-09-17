"use strict";
/**
 * MONO-10 v0.8 — core/operator-provenance-authority.js   (§3, §4, §5, §16, §17)
 *
 * FERMETURE B01. En v0.7, ce module exportait
 * `createOperatorProvenanceAuthority({ namespace, registryPath })`. L'audit A
 * a montre qu'un appelant — depuis un run pourtant legitime, sans toucher un
 * seul fichier de l'exploitant — ecrivait son propre `roots.json`, appelait ce
 * constructeur, recevait un objet authentiquement marque, et obtenait :
 *
 *     AUTHENTICATED_PROVENANCE sur ses artefacts,
 *     une independance d'identite STRONG depuis deux racines inventees,
 *     un candidat PRESENT_FOR_HUMAN_REVIEW.
 *
 * Le defaut n'etait pas la marque : elle etait authentique. Le defaut etait
 * qu'une marque prouve « cree par ce module » et non « emis par CETTE
 * frontiere provisionnee ».
 *
 * v0.8 :
 *   - le constructeur de PRODUCTION n'est plus public. `createFromBoundary`
 *     exige la POIGNEE D'EMISSION, creee uniquement dans `buildBoundary` et
 *     jamais exportee ;
 *   - le chemin du registre n'est plus un parametre : il est lu sur la
 *     configuration DEJA CHARGEE par la frontiere (§7, §8) ;
 *   - `provisionedFrom` est derive du contexte reel (§9) ;
 *   - `isProvisionedProvenanceAuthority(a, expected)` verifie l'appartenance a
 *     la frontiere courante (§5, §12).
 *
 * Le contrat de resolution est inchange : les racines retenues sont celles du
 * registre de l'exploitant, jamais celles portees par l'artefact.
 */

const fs = require("fs");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");
const CC = require("./canonical-contracts.js");
const AD = require("./authority-descriptor.js");

const STATUS = CC.PROVENANCE_STATUS;
const AUTHORITY_BRAND = new WeakSet();
/** §5/§6 — registre boundary-scoped : autorite -> descripteur d'emission. */
const DESCRIPTORS = new WeakMap();

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

function build(descriptor, roots, sourcePath) {
  const bySource = new Map();
  roots.forEach(function (r) {
    if (!bySource.has(r.sourceRootId)) bySource.set(r.sourceRootId, []);
    bySource.get(r.sourceRootId).push(r);
  });
  const registryHash = sha256Of({ roots: roots });

  function resolveRoots(request) {
    const asked = request && request.sourceRootId;
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
    return { status: STATUS.AUTHENTICATED, sourceRootId: r.sourceRootId,
      authorityRootId: r.authorityRootId, familyRootId: r.familyRootId, problems: [],
      /** La derivation engage la FRONTIERE emettrice, pas seulement le registre. */
      derivationRef: "provenance-root:" + sha256Of({ entry: r, registryHash: registryHash,
        boundary: descriptor.operatorBoundaryId, generation: descriptor.issuerGeneration }).slice(0, 32) };
  }

  function declaredVersusAuthenticated(record, resolved) {
    const declared = { authorityRootId: (record && record.authorityRootId) || null,
      familyRootId: (record && record.familyRootId) || null };
    const agrees = resolved.status === STATUS.AUTHENTICATED
      && declared.authorityRootId === resolved.authorityRootId
      && declared.familyRootId === resolved.familyRootId;
    return { declared: declared,
      authenticated: { authorityRootId: resolved.authorityRootId, familyRootId: resolved.familyRootId },
      declarationAgrees: agrees,
      note: "les racines retenues sont celles du registre de l'exploitant ; la declaration portee par l'artefact n'a aucun effet." };
  }

  const authority = {
    schema: "EvidenceForge.EvidenceProvenanceAuthority", schemaVersion: "MONO-10-v8",
    authorityKind: AD.KIND.PROVENANCE,
    authorityId: descriptor.authorityId,
    operatorBoundaryId: descriptor.operatorBoundaryId,
    namespace: descriptor.executionMode,
    executionMode: descriptor.executionMode,
    /** §9 — DERIVE, jamais deduit de la presence d'un chemin. */
    provisionedFrom: descriptor.provisionedFrom,
    configBindingHash: descriptor.configBindingHash,
    issuerGeneration: descriptor.issuerGeneration,
    descriptorHash: descriptor.descriptorHash,
    registryHash: registryHash, rootCount: roots.length, registrySourcePath: sourcePath ? true : false,
    knownSourceRoots: Object.freeze(Array.from(bySource.keys())),
    resolveRoots: resolveRoots, declaredVersusAuthenticated: declaredVersusAuthenticated, STATUS: STATUS,
  };
  AUTHORITY_BRAND.add(authority);
  DESCRIPTORS.set(authority, descriptor);
  return Object.freeze(authority);
}

/**
 * createFromBoundary(issuance, cfg) — LE SEUL chemin vers une autorite de
 * PRODUCTION. `issuance` doit etre la poignee d'emission d'une frontiere
 * reellement provisionnee ; elle n'est pas exportee et ne peut pas etre
 * fabriquee.
 */
function createFromBoundary(issuance, cfg) {
  const OTB = require("./operator-trust-boundary.js");   // tardif : evite le cycle de chargement
  if (!OTB.isBoundaryIssuanceHandle(issuance)) {
    throw fail("AUTHORITY_ISSUER_NOT_BOUNDARY",
      "une autorite de provenance ne se construit que depuis une OperatorTrustBoundary provisionnee. "
      + "Un constructeur public n'est pas une frontiere operateur, et un chemin fourni par l'appelant "
      + "n'est pas une preuve d'origine.");
  }
  cfg = cfg || {};
  const kind = cfg.kind;
  let roots, sourcePath = null;
  if (kind === "OPERATOR_ROOT_REGISTRY") {
    // §7/§8 — le chemin vient de la configuration chargee par la frontiere.
    sourcePath = issuance.operatorConfigPaths.provenanceRegistryPath;
    if (!isNonEmptyStr(sourcePath)) {
      throw fail("PROVENANCE_REGISTRY_MISSING", "la configuration de l'exploitant ne declare aucun provenanceRegistryPath.");
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
    catch (e) { throw fail("PROVENANCE_REGISTRY_UNREADABLE", "registre de racines illisible : " + ((e && e.message) || e)); }
    if (!Array.isArray(raw.roots)) throw fail("PROVENANCE_REGISTRY_INVALID", "roots[] requis.");
    roots = raw.roots.map(normalizeRoot);
  } else if (kind === "TEST_ROOT_REGISTRY") {
    if (issuance.namespace !== "TEST") {
      throw fail("PROVENANCE_AUTHORITY_INSUFFICIENT", "un registre de racines en memoire n'authentifie rien hors TEST.");
    }
    roots = (cfg.roots || []).map(normalizeRoot);
  } else {
    throw fail("PROVENANCE_REGISTRY_MISSING", "aucun registre de racines provisionne — fail closed.");
  }
  return build(AD.makeAuthorityDescriptor(issuance, AD.KIND.PROVENANCE,
    { kind: kind, registryDeclared: sourcePath !== null }), roots, sourcePath);
}

/**
 * §14 — fabrique de TEST explicite. L'objet produit porte executionMode TEST
 * et n'est jamais accepte par un sink de production.
 */
function createTestProvenanceAuthority(input) {
  input = input || {};
  const pseudo = Object.freeze({
    operatorBoundaryId: "otb-test-inprocess:" + sha256Of({ r: input.roots || [] }).slice(0, 12),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    configBindingHash: sha256Of({ inProcess: true, roots: input.roots || [] }),
    issuerGeneration: "test", operatorConfigPaths: {},
  });
  return build(AD.makeAuthorityDescriptor(pseudo, AD.KIND.PROVENANCE, { kind: "TEST_ROOT_REGISTRY" }),
    (input.roots || []).map(normalizeRoot), null);
}

/**
 * isProvisionedProvenanceAuthority(a, expected)
 * `expected.operatorBoundaryId` : exige LA frontiere courante (§5, §12).
 * `expected.requireProduction`  : exige un espace de production.
 */
function isProvisionedProvenanceAuthority(a, expected) {
  if (!a || !AUTHORITY_BRAND.has(a)) return false;
  const d = DESCRIPTORS.get(a);
  if (!d) return false;
  if (expected && isNonEmptyStr(expected.operatorBoundaryId) && d.operatorBoundaryId !== expected.operatorBoundaryId) return false;
  if (expected && expected.requireProduction === true && d.executionMode !== "PRODUCTION") return false;
  return typeof a.resolveRoots === "function";
}
function descriptorOf(a) { return DESCRIPTORS.get(a) || null; }

module.exports = { createFromBoundary, createTestProvenanceAuthority,
  isProvisionedProvenanceAuthority, descriptorOf, STATUS };
