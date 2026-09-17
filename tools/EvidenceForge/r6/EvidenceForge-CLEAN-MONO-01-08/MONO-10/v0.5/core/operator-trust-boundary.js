"use strict";
/**
 * MONO-10 v0.5 — core/operator-trust-boundary.js   (§2, §3, §4, §6, §7, §8)
 *
 * ================================================================
 *   EVIDENCEFORGE MAY CHOOSE WHAT TO VERIFY.
 *   EVIDENCEFORGE MAY NOT CHOOSE WHOM TO TRUST.
 * ================================================================
 *
 * Trois versions ont deplace la meme auto-declaration d'un cran :
 *   v0.1/v0.2  la racine etait dans l'artefact
 *   v0.3       la racine etait dans le manifeste
 *   v0.4       la racine etait un ARGUMENT de fonction
 * v0.5 arrete la recursion : une frontiere de PRODUCTION ne peut etre obtenue
 * que par PROVISIONNEMENT DEPUIS L'ENVIRONNEMENT, jamais par un parametre.
 *
 *   provisionProductionTrustBoundary()   lit EVIDENCEFORGE_OPERATOR_TRUST_CONFIG
 *   provisionTestTrustBoundary(...)      espace TEST uniquement, par construction
 *
 * Il n'existe AUCUNE fonction exportee qui accepte des ancrages, une cle, une
 * carte de confiance ou un callback de verification pour l'espace PRODUCTION.
 *
 * Limite assumee et documentee (THREAT-MODEL) : un processus qui controle
 * l'environnement et le systeme de fichiers de l'exploitant peut provisionner
 * une frontiere malveillante. C'est la frontiere « exploitant compromis », hors
 * perimetre. Ce qui est ferme ici, c'est que l'APPELANT DE L'API EvidenceForge
 * — le code de mission et de run — ne peut plus choisir a qui faire confiance.
 */

const fs = require("fs");
const path = require("path");
const { canonical, sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { makeKeyRecord, KEY_STATUS, publicKeyFingerprint } = require("./key-lifecycle.js");
const RP = require("./replay-protection.js");
const HAB = require("./operator-human-auth-boundary.js");

const BOUNDARY_BRAND = new WeakSet();
const NAMESPACE = { TEST: "TEST", PRODUCTION: "PRODUCTION" };
const PROVISIONED_FROM = { ENVIRONMENT: "ENVIRONMENT", IN_PROCESS_TEST: "IN_PROCESS_TEST" };
const ENV_VAR = "EVIDENCEFORGE_OPERATOR_TRUST_CONFIG";

function isOperatorTrustBoundary(b) { return !!b && BOUNDARY_BRAND.has(b); }

function assertProductionBoundary(b, label) {
  label = label || "frontiere operateur";
  if (!isOperatorTrustBoundary(b)) {
    throw fail("OPERATOR_TRUST_BOUNDARY_FORGED", label + " : objet non issu d'un provisionnement — un appelant ne fabrique pas sa frontiere de confiance.");
  }
  if (b.namespace !== NAMESPACE.PRODUCTION) {
    throw fail("OPERATOR_TRUST_BOUNDARY_NOT_PRODUCTION", label + " : espace de confiance " + b.namespace + " — une frontiere de TEST ne valide jamais une execution de PRODUCTION.");
  }
  if (b.provisionedFrom !== PROVISIONED_FROM.ENVIRONMENT) {
    throw fail("OPERATOR_TRUST_BOUNDARY_NOT_PROVISIONED", label + " : une frontiere de PRODUCTION doit etre provisionnee par l'environnement, jamais construite en cours de processus.");
  }
  return true;
}

/** Index des cles : authorityId -> keyId -> enregistrement. */
function buildKeyIndex(authorities, namespace) {
  const index = new Map();
  const fingerprints = new Map();
  (authorities || []).forEach(function (a, i) {
    if (!a || !isNonEmptyStr(a.authorityId)) throw fail("TRUST_CONFIG_INVALID", "authorities[" + i + "] : authorityId requis.");
    if (!Array.isArray(a.keys) || a.keys.length === 0) throw fail("TRUST_CONFIG_INVALID", "authorities[" + i + "] : au moins une cle requise.");
    const byKeyId = new Map();
    a.keys.forEach(function (k, j) {
      const rec = makeKeyRecord(Object.assign({}, k, { authorityId: a.authorityId }));
      if (byKeyId.has(rec.keyId)) throw fail("TRUST_CONFIG_INVALID", "keyId duplique : " + rec.keyId);
      // §8 — une meme cle publique ne peut pas servir deux espaces de confiance.
      const seen = fingerprints.get(rec.publicKeyFingerprint);
      if (seen && seen !== a.authorityId) {
        throw fail("TRUST_ANCHOR_KEY_REUSED", "l'empreinte " + rec.publicKeyFingerprint.slice(0, 16)
          + " est declaree pour deux autorites (" + seen + ", " + a.authorityId + ") dans la meme frontiere.");
      }
      fingerprints.set(rec.publicKeyFingerprint, a.authorityId);
      byKeyId.set(rec.keyId, rec);
    });
    index.set(a.authorityId, byKeyId);
  });
  return { index: index, fingerprints: fingerprints };
}

function sealBoundary(b) { BOUNDARY_BRAND.add(b); return Object.freeze(b); }

function buildBoundary(cfg, namespace, provisionedFrom, sourceDescriptor) {
  const built = buildKeyIndex(cfg.authorities, namespace);
  // Protection anti-rejeu : provisionnee ICI, jamais par l'appelant.
  let replayStore = null;
  const rp = cfg.replayProtection || {};
  if (rp.kind === RP.KIND.FILE) {
    if (!isNonEmptyStr(rp.directory)) throw fail("TRUST_CONFIG_INVALID", "replayProtection.directory requis pour un store FILE.");
    replayStore = RP.createFileReplayStore(rp.directory);
  } else if (rp.kind === RP.KIND.MEMORY) {
    if (namespace === NAMESPACE.PRODUCTION) {
      throw fail("REPLAY_PROTECTION_INSUFFICIENT", "un store en memoire ne protege pas un espace de PRODUCTION : il ne survit pas au processus.");
    }
    replayStore = RP.createMemoryReplayStore(cfg.operatorTrustBoundaryId || "test");
  } else if (namespace === NAMESPACE.PRODUCTION) {
    // §12 — fail closed, jamais un simple avertissement.
    throw fail("REPLAY_PROTECTION_MISSING", "aucune protection anti-rejeu provisionnee : une frontiere de PRODUCTION ne peut pas s'en passer.");
  }
  // Mecanisme d'authentification humaine : provisionne ICI aussi.
  let humanAuth = null;
  const ha = cfg.humanAuth || {};
  if (ha.kind === "OPERATOR_REGISTRY") humanAuth = HAB.createOperatorRegistryHumanAuthMechanism({ registryPath: ha.registryPath });
  else if (ha.kind === "TEST_FIXTURE") {
    if (namespace === NAMESPACE.PRODUCTION) throw fail("HUMAN_AUTH_INSUFFICIENT", "un mecanisme de fixture ne peut pas authentifier en PRODUCTION.");
    humanAuth = HAB.createTestHumanAuthMechanism(cfg.operatorTrustBoundaryId || "test");
  }
  if (namespace === NAMESPACE.PRODUCTION && humanAuth && humanAuth.namespace !== NAMESPACE.PRODUCTION) {
    throw fail("HUMAN_AUTH_INSUFFICIENT", "mecanisme humain hors espace de production.");
  }

  const descriptor = {
    namespace: namespace,
    authorities: Array.from(built.index.entries()).map(([aid, keys]) => ({
      authorityId: aid, keys: Array.from(keys.values()).map((k) => ({ keyId: k.keyId, fingerprint: k.publicKeyFingerprint, status: k.status, validFrom: k.validFrom, validUntil: k.validUntil })),
    })),
    replayProtection: replayStore ? { kind: replayStore.kind, persistent: replayStore.persistent } : null,
    humanAuth: humanAuth ? { mechanismId: humanAuth.mechanismId, namespace: humanAuth.namespace } : null,
  };
  const boundaryId = "otb-" + sha256Of(descriptor).slice(0, 24);

  return sealBoundary({
    schema: "EvidenceForge.OperatorTrustBoundary", schemaVersion: "MONO-10-v5",
    operatorTrustBoundaryId: isNonEmptyStr(cfg.operatorTrustBoundaryId) ? cfg.operatorTrustBoundaryId : boundaryId,
    boundaryDescriptorHash: sha256Of(descriptor),
    namespace: namespace,
    provisionedFrom: provisionedFrom,
    provisionedAt: new Date().toISOString(),
    sourceDescriptor: sourceDescriptor,
    /** Lecture seule : aucune methode d'ajout ou de remplacement de cle. */
    lookupKey(authorityId, keyId) {
      const byKeyId = built.index.get(authorityId);
      return (byKeyId && byKeyId.get(keyId)) || null;
    },
    listAuthorities() { return descriptor.authorities.map((a) => a.authorityId); },
    replayStore: replayStore,
    humanAuthMechanism: humanAuth,
    policy: Object.freeze({
      requireAntiReplay: namespace === NAMESPACE.PRODUCTION,
      requireHumanAuthMechanism: namespace === NAMESPACE.PRODUCTION,
      allowCrossRunLineage: false,
    }),
  });
}

/**
 * §2/§3/§6 — PRODUCTION : provisionnement par l'environnement, point final.
 * Aucun parametre de confiance n'est accepte. `opts` ne sert qu'a surcharger la
 * variable d'environnement consultee, ce qui reste un choix d'exploitation, pas
 * un choix de confiance : le contenu vient toujours d'un fichier hors processus.
 */
function provisionProductionTrustBoundary(opts) {
  opts = opts || {};
  const envVar = isNonEmptyStr(opts.envVar) ? opts.envVar : ENV_VAR;
  const configPath = process.env[envVar];
  if (!isNonEmptyStr(configPath)) {
    throw fail("OPERATOR_TRUST_NOT_PROVISIONED",
      "aucune frontiere de confiance provisionnee : la variable d'environnement " + envVar + " n'est pas definie. "
      + "EvidenceForge ne fabrique pas sa propre racine de confiance — fail closed.");
  }
  let raw;
  try { raw = fs.readFileSync(configPath, "utf8"); }
  catch (e) { throw fail("OPERATOR_TRUST_CONFIG_UNREADABLE", "configuration de confiance illisible (" + configPath + ") : " + ((e && e.message) || e)); }
  let cfg;
  try { cfg = JSON.parse(raw); }
  catch (e) { throw fail("OPERATOR_TRUST_CONFIG_INVALID", "configuration de confiance non analysable : " + ((e && e.message) || e)); }
  if (cfg.namespace !== NAMESPACE.PRODUCTION) {
    throw fail("OPERATOR_TRUST_CONFIG_INVALID", "la configuration provisionnee declare l'espace \"" + cfg.namespace + "\" — une frontiere de production exige PRODUCTION.");
  }
  if (/PRIVATE KEY/.test(raw)) throw fail("OPERATOR_TRUST_CONFIG_CONTAINS_SECRET", "la configuration contient de la matiere privee — refusee.");
  return buildBoundary(cfg, NAMESPACE.PRODUCTION, PROVISIONED_FROM.ENVIRONMENT,
    { kind: "ENVIRONMENT_FILE", envVar: envVar, configPathHash: sha256Of({ p: path.resolve(configPath) }), configHash: sha256Of({ raw: raw }) });
}

/**
 * §7 — TEST : construction en processus autorisee, mais l'espace TEST est
 * BAKED dans l'objet. Demander PRODUCTION ici est refuse par construction.
 */
function provisionTestTrustBoundary(cfg) {
  cfg = cfg || {};
  if (cfg.namespace && cfg.namespace !== NAMESPACE.TEST) {
    throw fail("OPERATOR_TRUST_BOUNDARY_NOT_PRODUCTION",
      "une frontiere construite en processus ne peut jamais occuper l'espace PRODUCTION.");
  }
  return buildBoundary(Object.assign({}, cfg, { namespace: NAMESPACE.TEST }), NAMESPACE.TEST, PROVISIONED_FROM.IN_PROCESS_TEST,
    { kind: "IN_PROCESS_TEST" });
}

module.exports = { provisionProductionTrustBoundary, provisionTestTrustBoundary,
  isOperatorTrustBoundary, assertProductionBoundary, NAMESPACE, PROVISIONED_FROM, ENV_VAR, KEY_STATUS };
