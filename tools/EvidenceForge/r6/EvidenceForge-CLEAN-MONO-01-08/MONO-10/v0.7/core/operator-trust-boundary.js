"use strict";
/**
 * MONO-10 v0.6 — core/operator-trust-boundary.js   (§2, §3, §4, §6, §7, §8)
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
const OAB = require("./operator-acceptance-boundary.js");
const OLB = require("./operator-llm-capability-boundary.js");
const OPA = require("./operator-provenance-authority.js");
const OHIA = require("./operator-historical-input-authority.js");

/**
 * §29 — registre d'empreintes a l'echelle du PROCESSUS. Une meme cle publique
 * ne peut pas etre ancree dans deux espaces de confiance, meme via deux
 * frontieres distinctes. Limite assumee : la detection porte sur les frontieres
 * provisionnees dans ce processus ; `authorityNamespaceHash` permet a
 * l'exploitant de la verifier entre processus (voir KEY-MANAGEMENT.md).
 */
const FINGERPRINT_NAMESPACE = new Map();

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
      // §29 — separation PHYSIQUE des cles entre espaces TEST et PRODUCTION.
      const prior = FINGERPRINT_NAMESPACE.get(rec.publicKeyFingerprint);
      if (prior && prior.namespace !== namespace) {
        throw fail("TRUST_ANCHOR_KEY_CROSS_NAMESPACE", "l'empreinte " + rec.publicKeyFingerprint.slice(0, 16)
          + " est deja ancree dans l'espace " + prior.namespace + " : une meme cle physique ne peut pas servir TEST et PRODUCTION.");
      }
      FINGERPRINT_NAMESPACE.set(rec.publicKeyFingerprint, { namespace: namespace, authorityId: a.authorityId });
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
  const authorityIds = (cfg.authorities || []).map((a) => a && a.authorityId).filter(isNonEmptyStr);
  // §9/§10/§11 — le namespace anti-rejeu est DERIVE de l'autorite et de la cle.
  // Il n'est pas choisi, ni par l'appelant, ni par la frontiere.
  const authorityKeyIndex = (cfg.authorities || []).map(function (a) {
    return { authorityId: a && a.authorityId,
      keyIds: ((a && a.keys) || []).map((k) => k && k.keyId).filter(isNonEmptyStr) };
  }).filter((a) => isNonEmptyStr(a.authorityId));
  let replayNamespaceId = null;
  if (rp.kind === RP.KIND.FILE || rp.kind === RP.KIND.MEMORY) {
    replayNamespaceId = RP.deriveReplayNamespaceId({ namespace: namespace, authorities: authorityKeyIndex });
    RP.assertNamespaceConsistency(replayNamespaceId, authorityKeyIndex, cfg.operatorTrustBoundaryId || "frontiere");
  }
  if (rp.kind === RP.KIND.FILE) {
    if (isNonEmptyStr(rp.directory)) {
      throw fail("REPLAY_DIRECTORY_REFUSED",
        "replayProtection.directory n'est plus accepte : le repertoire de la reserve est DERIVE de replayRoot et du "
        + "namespace d'autorite. Un emplacement choisi permettrait de reinitialiser le namespace anti-rejeu.");
    }
    if (!isNonEmptyStr(rp.replayRoot)) throw fail("TRUST_CONFIG_INVALID", "replayProtection.replayRoot requis pour une reserve FILE.");
    replayStore = RP.createFileReplayStore({ replayRoot: rp.replayRoot, replayNamespaceId: replayNamespaceId,
      authorityScope: rp.authorityScope || authorityIds });
    const notCovered = authorityIds.filter((a) => !replayStore.coversAuthority(a));
    if (notCovered.length) {
      throw fail("REPLAY_PROTECTION_SCOPE_INCOMPLETE", "la reserve de rejeu ne couvre pas " + notCovered.join(", ")
        + " : le partage du namespace anti-rejeu n'est pas garanti — fail closed.");
    }
  } else if (rp.kind === RP.KIND.MEMORY) {
    if (namespace === NAMESPACE.PRODUCTION) {
      throw fail("REPLAY_PROTECTION_INSUFFICIENT", "une reserve en memoire ne protege pas un espace de PRODUCTION : elle ne survit pas au processus.");
    }
    replayStore = RP.createMemoryReplayStore({ replayNamespaceId: replayNamespaceId, authorityScope: authorityIds });
  } else if (namespace === NAMESPACE.PRODUCTION) {
    // §12 — fail closed, jamais un simple avertissement.
    throw fail("REPLAY_PROTECTION_MISSING", "aucune protection anti-rejeu provisionnee : une frontiere de PRODUCTION ne peut pas s'en passer.");
  }
  // Mecanisme d'authentification humaine : provisionne ICI aussi.
  let humanAuth = null;
  const ha = cfg.humanAuth || {};
  if (ha.kind === "OPERATOR_ACT_PROOF" || ha.kind === "OPERATOR_REGISTRY") {
    humanAuth = HAB.createOperatorActProofMechanism({ registryPath: ha.registryPath });
  } else if (ha.kind === "TEST_FIXTURE") {
    if (namespace === NAMESPACE.PRODUCTION) throw fail("HUMAN_AUTH_INSUFFICIENT", "un mecanisme de fixture ne peut pas authentifier en PRODUCTION.");
    humanAuth = HAB.createTestHumanAuthMechanism(cfg.operatorTrustBoundaryId || "test");
  }
  if (namespace === NAMESPACE.PRODUCTION && humanAuth && humanAuth.namespace !== NAMESPACE.PRODUCTION) {
    throw fail("HUMAN_AUTH_INSUFFICIENT", "mecanisme humain hors espace de production.");
  }

  // §5 — la validation d'acceptation est une CAPACITE de la frontiere.
  const acceptanceBoundary = OAB.createAcceptanceBoundary({
    namespace: namespace, boundaryId: cfg.operatorTrustBoundaryId,
    humanAcceptanceRequired: (cfg.acceptance || {}).humanAcceptanceRequired !== false,
    // Appel PARESSEUX : evite un cycle de chargement entre la frontiere et le
    // module d'acceptation. La fonction validee est celle du lot, jamais un
    // parametre d'appel.
    validate: function (acceptance, report, ctx) {
      return require("./final-report-acceptance.js").validateAcceptanceArtifact(acceptance, report, ctx);
    },
  });
  // §45 — le transport LLM de production est provisionne, jamais reçu.
  let llmBoundary = null;
  const lb = cfg.llmCapability || {};
  if (lb.kind === "OPERATOR_TRANSPORT") {
    llmBoundary = OLB.createOperatorLlmCapabilityBoundary({ transportModuleRef: lb.transportModuleRef,
      allowedProviders: lb.allowedProviders, allowedModels: lb.allowedModels, allowedWorkers: lb.allowedWorkers });
  } else if (lb.kind === "TEST_TRANSPORT") {
    if (namespace === NAMESPACE.PRODUCTION) throw fail("LLM_BOUNDARY_INSUFFICIENT", "un transport de test ne prouve aucune capacite de PRODUCTION.");
    llmBoundary = OLB.createTestLlmCapabilityBoundary({ transportModuleRef: null,
      transport: require(lb.transportModuleRef).probe, boundaryId: cfg.operatorTrustBoundaryId });
  }

  // §32/§33 — autorite de PROVENANCE : les racines de source, d'autorite et de
  // famille sont resolues contre un registre de l'exploitant, jamais lues sur
  // l'artefact que l'appelant a construit.
  let provenanceAuthority = null;
  const pa = cfg.provenanceAuthority || {};
  if (pa.kind === "OPERATOR_ROOT_REGISTRY") {
    provenanceAuthority = OPA.createOperatorProvenanceAuthority({ namespace: namespace, registryPath: pa.registryPath, roots: pa.roots });
  } else if (pa.kind === "TEST_ROOT_REGISTRY") {
    if (namespace === NAMESPACE.PRODUCTION) throw fail("PROVENANCE_AUTHORITY_INSUFFICIENT", "un registre de racines de test n'authentifie aucune provenance de PRODUCTION.");
    provenanceAuthority = OPA.createOperatorProvenanceAuthority({ namespace: namespace, roots: pa.roots || [] });
  } else if (namespace === NAMESPACE.PRODUCTION) {
    throw fail("PROVENANCE_AUTHORITY_MISSING",
      "aucune autorite de provenance provisionnee : sans elle, une racine de source declaree par l'appelant serait crue — fail closed.");
  }

  // §7/§8 — autorite d'ENTREE HISTORIQUE. Absente, le franchissement de run
  // reste refuse ; aucun booleen d'appelant ne le remplace.
  let historicalInputAuthority = null;
  const hi = cfg.historicalInput || {};
  if (hi.kind === "OPERATOR_AUTHORIZED_INPUTS") {
    historicalInputAuthority = OHIA.createOperatorHistoricalInputAuthority({ namespace: namespace, registryPath: hi.registryPath });
  } else if (hi.kind === "TEST_AUTHORIZED_INPUTS") {
    if (namespace === NAMESPACE.PRODUCTION) throw fail("HISTORICAL_INPUT_AUTHORITY_INSUFFICIENT", "une autorite d'entree historique de test n'autorise rien en PRODUCTION.");
    historicalInputAuthority = OHIA.createOperatorHistoricalInputAuthority({ namespace: namespace, authorized: hi.authorized || [] });
  }

  const descriptor = {
    namespace: namespace,
    authorities: Array.from(built.index.entries()).map(([aid, keys]) => ({
      authorityId: aid, keys: Array.from(keys.values()).map((k) => ({ keyId: k.keyId, fingerprint: k.publicKeyFingerprint, status: k.status, validFrom: k.validFrom, validUntil: k.validUntil })),
    })),
    replayProtection: replayStore ? { kind: replayStore.kind, persistent: replayStore.persistent,
      // §11 — le descripteur ENGAGE le namespace anti-rejeu reel : toute
      // reserve differente change boundaryDescriptorHash, donc le manifeste.
      replayNamespaceId: replayStore.replayNamespaceId || null,
      authorityNamespaceHash: replayStore.authorityNamespaceHash || null, authorityScope: replayStore.authorityScope } : null,
    acceptance: { acceptanceBoundaryId: acceptanceBoundary.acceptanceBoundaryId, humanAcceptanceRequired: acceptanceBoundary.humanAcceptanceRequired },
    llmCapability: llmBoundary ? { llmBoundaryId: llmBoundary.llmBoundaryId, namespace: llmBoundary.namespace } : null,
    humanAuth: humanAuth ? { mechanismId: humanAuth.mechanismId, namespace: humanAuth.namespace } : null,
    provenanceAuthority: provenanceAuthority ? { authorityId: provenanceAuthority.authorityId,
      namespace: provenanceAuthority.namespace, registryHash: provenanceAuthority.registryHash } : null,
    historicalInput: historicalInputAuthority ? { authorityId: historicalInputAuthority.authorityId,
      namespace: historicalInputAuthority.namespace, authorizedCount: historicalInputAuthority.authorizedCount } : null,
  };
  const boundaryId = "otb-" + sha256Of(descriptor).slice(0, 24);

  return sealBoundary({
    schema: "EvidenceForge.OperatorTrustBoundary", schemaVersion: "MONO-10-v7",
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
    acceptanceBoundary: acceptanceBoundary,
    llmCapabilityBoundary: llmBoundary,
    provenanceAuthority: provenanceAuthority,
    historicalInputAuthority: historicalInputAuthority,
    /** §31 — modele de revocation : relecture VIVE de la configuration. */
    revocationModel: provisionedFrom === PROVISIONED_FROM.ENVIRONMENT ? "LIVE_CONFIG_LOOKUP" : "IN_PROCESS_SNAPSHOT",
    reloadKey: (function () {
      if (provisionedFrom !== PROVISIONED_FROM.ENVIRONMENT || !sourceDescriptor || !sourceDescriptor.configPath) return null;
      return function (authorityId, keyId) {
        try {
          const fresh = JSON.parse(fs.readFileSync(sourceDescriptor.configPath, "utf8"));
          const a = (fresh.authorities || []).filter((x) => x && x.authorityId === authorityId)[0];
          if (!a) return null;
          const k = (a.keys || []).filter((x) => x && x.keyId === keyId)[0];
          return k ? makeKeyRecord(Object.assign({}, k, { authorityId: authorityId })) : null;
        } catch (e) { return undefined; }   // undefined = configuration illisible => fail closed
      };
    })(),
    policy: Object.freeze({
      requireAntiReplay: namespace === NAMESPACE.PRODUCTION,
      requireHumanAuthMechanism: namespace === NAMESPACE.PRODUCTION,
      requireHumanActProof: namespace === NAMESPACE.PRODUCTION,
      requireOperatorLlmTransport: namespace === NAMESPACE.PRODUCTION,
      forceNonceConsumption: namespace === NAMESPACE.PRODUCTION,
      allowCrossRunLineage: false,
      requireProvenanceAuthority: namespace === NAMESPACE.PRODUCTION,
      historicalInputRequiresOperatorAuthority: true,
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
    { kind: "ENVIRONMENT_FILE", envVar: envVar, configPath: path.resolve(configPath),
      configPathHash: sha256Of({ p: path.resolve(configPath) }), configHash: sha256Of({ raw: raw }) });
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
