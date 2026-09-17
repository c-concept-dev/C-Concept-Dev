"use strict";
/**
 * MONO-10 v0.7 — core/operator-historical-input-authority.js   (§7, §8)
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

const AUTHORITY_BRAND = new WeakSet();
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

function createOperatorHistoricalInputAuthority(cfg) {
  cfg = cfg || {};
  const namespace = cfg.namespace === "TEST" ? "TEST" : "PRODUCTION";
  let entries, sourcePath = null;
  if (isNonEmptyStr(cfg.registryPath)) {
    sourcePath = cfg.registryPath;
    let raw;
    try { raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
    catch (e) { throw fail("HISTORICAL_INPUT_REGISTRY_UNREADABLE", "registre d'entrees historiques illisible : " + ((e && e.message) || e)); }
    if (!Array.isArray(raw.authorized)) throw fail("HISTORICAL_INPUT_REGISTRY_INVALID", "authorized[] requis.");
    entries = raw.authorized.map(normalizeEntry);
  } else if (Array.isArray(cfg.authorized)) {
    if (namespace === "PRODUCTION") {
      throw fail("HISTORICAL_INPUT_IN_PROCESS_REFUSED",
        "une autorite d'entree historique de PRODUCTION ne s'alimente pas en memoire depuis le processus appelant.");
    }
    entries = cfg.authorized.map(normalizeEntry);
  } else {
    entries = [];   // aucune entree autorisee : refus par defaut, ce qui est le contrat
  }

  const authorityId = "historical-input-authority:" + sha256Of({ p: sourcePath, n: namespace, c: entries.length }).slice(0, 16);

  /**
   * authorize(request) — l'appelant DEMANDE. Il ne declare rien.
   * Toute propriete d'autorite portee par la demande est refusee (§6).
   */
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
      schema: "EvidenceForge.HistoricalInputAuthorization", schemaVersion: "MONO-10-v7",
      authorityId: authorityId, namespace: namespace,
      frozenIdentity: e.frozenIdentity, version: e.version, authorizedAt: e.authorizedAt,
      grantedAt: new Date().toISOString(),
    };
    BOUND_FIELDS.forEach(function (f) { authorization[f] = e[f]; });
    authorization.authorizationHash = sha256Of(authorization);
    AUTHORIZATION_BRAND.add(authorization);
    return { authorized: true, authorization: Object.freeze(authorization), problems: [] };
  }

  const authority = { schema: "EvidenceForge.OperatorHistoricalInputAuthority",
    authorityId: authorityId, namespace: namespace,
    provisionedFrom: sourcePath ? "ENVIRONMENT" : "IN_PROCESS_TEST",
    authorizedCount: entries.length, boundFields: Object.freeze(BOUND_FIELDS.slice()),
    authorize: authorize };
  AUTHORITY_BRAND.add(authority);
  return Object.freeze(authority);
}

function isProvisionedHistoricalInputAuthority(a) {
  return !!a && AUTHORITY_BRAND.has(a) && typeof a.authorize === "function";
}
function isHistoricalInputAuthorization(a) { return !!a && AUTHORIZATION_BRAND.has(a); }

module.exports = { createOperatorHistoricalInputAuthority, isProvisionedHistoricalInputAuthority,
  isHistoricalInputAuthorization, BOUND_FIELDS };
