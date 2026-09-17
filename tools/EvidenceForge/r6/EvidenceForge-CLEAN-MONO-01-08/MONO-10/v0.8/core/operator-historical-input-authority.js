"use strict";
/**
 * MONO-10 v0.8 — core/operator-historical-input-authority.js   (§7, §8)
 *
 * FERMETURE B2. En v0.6, traverser les runs demandait :
 *
 *   historicalInputContract: { contractKind: "IMMUTABLE_HISTORICAL_INPUT",
 *                              relations: [...], operatorAuthenticated: true }
 *
 * `LINEAGE.md` presentait `operatorAuthenticated === true` comme le controle et
 * affirmait « un appelant ne s'accorde pas a lui-meme le droit de traverser les
 * runs ». L'audit a montre qu'il suffisait d'ecrire ce booleen. Le controle
 * documente etait une auto-declaration.
 *
 * v0.7 : le droit d'entree historique est une CAPACITE PROVISIONNEE. L'appelant
 * peut DEMANDER :  authorize(reference)
 * Il ne peut plus DECLARER :  thisHistoricalInputIsAuthorized = true
 *
 * Une autorisation exige la correspondance EXACTE des onze champs du §8. Le
 * defaut reste le refus.
 */

const fs = require("fs");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");
const { assertNoAuthorityAssertion } = require("./caller-assertion-guard.js");
const AD = require("./authority-descriptor.js");

const AUTHORITY_BRAND = new WeakSet();
const DESCRIPTORS = new WeakMap();
const AUTHORIZATION_BRAND = new WeakSet();

/** §8 — les champs qu'un accord doit engager. Aucun n'est optionnel. */
const BOUND_FIELDS = ["sourceRunId", "sourceMissionHash", "artifactId", "artifactHash", "artifactType",
  "relation", "destinationRunId", "destinationMissionHash", "purpose"];

function normalizeEntry(e, i) {
  if (!e || typeof e !== "object") throw fail("HISTORICAL_INPUT_ENTRY_INVALID", "entree[" + i + "] : objet requis.");
  BOUND_FIELDS.forEach(function (f) {
    if (!isNonEmptyStr(e[f])) throw fail("HISTORICAL_INPUT_ENTRY_INVALID", "entree[" + i + "] : champ \"" + f + "\" requis.");
  });
  if (!isNonEmptyStr(e.frozenIdentity)) {
    throw fail("HISTORICAL_INPUT_FROZEN_IDENTITY_MISSING",
      "entree[" + i + "] : preuve d'immuabilite requise (frozenIdentity) — un lot historique se cite, il ne se redecouvre pas.");
  }
  const out = {};
  BOUND_FIELDS.forEach(function (f) { out[f] = e[f]; });
  out.frozenIdentity = e.frozenIdentity;
  out.authorizedAt = isNonEmptyStr(e.authorizedAt) ? e.authorizedAt : null;
  out.version = isNonEmptyStr(e.version) ? e.version : null;
  return Object.freeze(out);
}

/**
 * FERMETURE B02 (v0.8). En v0.7 ce module exportait
 * `createOperatorHistoricalInputAuthority({ namespace, registryPath })` :
 * l'appelant ecrivait son propre fichier d'autorisations et obtenait le droit
 * de franchir les runs. Desormais, seule la POIGNEE D'EMISSION d'une
 * frontiere provisionnee construit une autorite, et le chemin vient de la
 * configuration deja chargee par cette frontiere.
 */
function build(descriptor, entries, sourcePath) {
  const authorityId = descriptor.authorityId;

  function authorize(request) {
    assertNoAuthorityAssertion(request, "demande d'entree historique");
    const problems = [];
    BOUND_FIELDS.forEach(function (f) {
      if (!isNonEmptyStr(request && request[f])) problems.push("champ \"" + f + "\" absent de la demande");
    });
    if (problems.length) return { authorized: false, problems: problems, authorization: null };

    const match = entries.filter(function (e) {
      return BOUND_FIELDS.every(function (f) { return e[f] === request[f]; });
    });
    if (match.length === 0) {
      return { authorized: false, authorization: null,
        problems: ["aucune entree historique autorisee ne correspond a cette demande — "
          + "le franchissement de run reste refuse par defaut"] };
    }
    if (match.length > 1) {
      return { authorized: false, authorization: null,
        problems: [match.length + " autorisations concurrentes pour la meme reference — ambiguite jamais resolue en silence"] };
    }
    const e = match[0];
    const authorization = {
      schema: "EvidenceForge.HistoricalInputAuthorization", schemaVersion: "MONO-10-v8",
      authorityId: authorityId, authorityKind: AD.KIND.HISTORICAL_INPUT,
      operatorBoundaryId: descriptor.operatorBoundaryId,
      executionMode: descriptor.executionMode, issuerGeneration: descriptor.issuerGeneration,
      namespace: descriptor.executionMode,
      frozenIdentity: e.frozenIdentity, version: e.version, authorizedAt: e.authorizedAt,
      grantedAt: new Date().toISOString(),
    };
    BOUND_FIELDS.forEach(function (f) { authorization[f] = e[f]; });
    authorization.authorizationHash = sha256Of(authorization);
    AUTHORIZATION_BRAND.add(authorization);
    DESCRIPTORS.set(authorization, descriptor);
    return { authorized: true, authorization: Object.freeze(authorization), problems: [] };
  }

  const authority = { schema: "EvidenceForge.OperatorHistoricalInputAuthority", schemaVersion: "MONO-10-v8",
    authorityKind: AD.KIND.HISTORICAL_INPUT, authorityId: authorityId,
    operatorBoundaryId: descriptor.operatorBoundaryId, namespace: descriptor.executionMode,
    executionMode: descriptor.executionMode, provisionedFrom: descriptor.provisionedFrom,
    configBindingHash: descriptor.configBindingHash, issuerGeneration: descriptor.issuerGeneration,
    descriptorHash: descriptor.descriptorHash,
    authorizedCount: entries.length, registryDeclared: sourcePath !== null,
    boundFields: Object.freeze(BOUND_FIELDS.slice()), authorize: authorize };
  AUTHORITY_BRAND.add(authority);
  DESCRIPTORS.set(authority, descriptor);
  return Object.freeze(authority);
}

function createFromBoundary(issuance, cfg) {
  const OTB = require("./operator-trust-boundary.js");
  if (!OTB.isBoundaryIssuanceHandle(issuance)) {
    throw fail("AUTHORITY_ISSUER_NOT_BOUNDARY",
      "une autorite d'entree historique ne se construit que depuis une OperatorTrustBoundary provisionnee.");
  }
  cfg = cfg || {};
  let entries = [], sourcePath = null;
  if (cfg.kind === "OPERATOR_AUTHORIZED_INPUTS") {
    sourcePath = issuance.operatorConfigPaths.historicalInputRegistryPath;
    if (!isNonEmptyStr(sourcePath)) {
      throw fail("HISTORICAL_INPUT_REGISTRY_MISSING", "la configuration de l'exploitant ne declare aucun historicalInputRegistryPath.");
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
    catch (e) { throw fail("HISTORICAL_INPUT_REGISTRY_UNREADABLE", "registre d'entrees historiques illisible : " + ((e && e.message) || e)); }
    if (!Array.isArray(raw.authorized)) throw fail("HISTORICAL_INPUT_REGISTRY_INVALID", "authorized[] requis.");
    entries = raw.authorized.map(normalizeEntry);
  } else if (cfg.kind === "TEST_AUTHORIZED_INPUTS") {
    if (issuance.namespace !== "TEST") {
      throw fail("HISTORICAL_INPUT_AUTHORITY_INSUFFICIENT", "des autorisations en memoire n'autorisent rien hors TEST.");
    }
    entries = (cfg.authorized || []).map(normalizeEntry);
  }
  return build(AD.makeAuthorityDescriptor(issuance, AD.KIND.HISTORICAL_INPUT,
    { kind: cfg.kind || "NONE", registryDeclared: sourcePath !== null }), entries, sourcePath);
}

/** §14 — fabrique de TEST explicite, jamais acceptee par un sink de production. */
function createTestHistoricalInputAuthority(input) {
  input = input || {};
  const pseudo = Object.freeze({
    operatorBoundaryId: "otb-test-inprocess:" + sha256Of({ a: input.authorized || [] }).slice(0, 12),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    configBindingHash: sha256Of({ inProcess: true, a: input.authorized || [] }),
    issuerGeneration: "test", operatorConfigPaths: {},
  });
  return build(AD.makeAuthorityDescriptor(pseudo, AD.KIND.HISTORICAL_INPUT, { kind: "TEST_AUTHORIZED_INPUTS" }),
    (input.authorized || []).map(normalizeEntry), null);
}

function isProvisionedHistoricalInputAuthority(a, expected) {
  if (!a || !AUTHORITY_BRAND.has(a) || typeof a.authorize !== "function") return false;
  const d = DESCRIPTORS.get(a);
  if (!d) return false;
  if (expected && isNonEmptyStr(expected.operatorBoundaryId) && d.operatorBoundaryId !== expected.operatorBoundaryId) return false;
  if (expected && expected.requireProduction === true && d.executionMode !== "PRODUCTION") return false;
  return true;
}
function isHistoricalInputAuthorization(a, expected) {
  if (!a || !AUTHORIZATION_BRAND.has(a)) return false;
  const d = DESCRIPTORS.get(a);
  if (!d) return false;
  if (expected && isNonEmptyStr(expected.operatorBoundaryId) && d.operatorBoundaryId !== expected.operatorBoundaryId) return false;
  return true;
}
function descriptorOf(a) { return DESCRIPTORS.get(a) || null; }

module.exports = { createFromBoundary, createTestHistoricalInputAuthority,
  isProvisionedHistoricalInputAuthority, isHistoricalInputAuthorization, descriptorOf, BOUND_FIELDS };
