"use strict";
/**
 * MONO-10 v0.8 — core/operator-llm-capability-boundary.js   (§45, §46, §47, §48)
 *
 * FERMETURE v0.5 B13.
 *
 * En v0.5, `runActiveProbe(config, transport, ctx)` recevait le transport EN
 * PARAMETRE. Un transport fabrique localement, sous un run de production
 * authentifie, produisait `AVAILABLE` et `usable = true` sans toucher le reseau :
 * la fonction qui prouvait le succes etait fournie par celui qu'elle devait
 * convaincre.
 *
 * v0.6 : le transport de PRODUCTION est une CAPACITE PROVISIONNEE par
 * l'exploitant. L'appelant declare son INTENTION (fournisseur, modele, worker
 * attendus) ; il ne fournit pas le transport.
 *
 * §47 — en TEST, un transport local reste autorise, mais l'artefact porte
 * `executionMode = TEST` et ne peut jamais valoir preuve de production.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const AD = require("./authority-descriptor.js");

const LLM_BRAND = new WeakSet();
const DESCRIPTORS = new WeakMap();
/**
 * FERMETURE B04 (v0.8). `createOperatorLlmCapabilityBoundary({ transportModuleRef })`
 * etait public et rendait un objet de namespace PRODUCTION : l'appelant
 * obtenait donc PRODUCTION_LLM_CAPABILITY depuis un fichier a lui.
 */
function isProvisionedLlmBoundary(b, expected) {
  if (!b || !LLM_BRAND.has(b)) return false;
  const d = DESCRIPTORS.get(b);
  if (!d) return false;
  if (expected && isNonEmptyStr(expected.operatorBoundaryId) && d.operatorBoundaryId !== expected.operatorBoundaryId) return false;
  if (expected && expected.requireProduction === true && d.executionMode !== "PRODUCTION") return false;
  return true;
}
function descriptorOf(b) { return DESCRIPTORS.get(b) || null; }
function brand(b) { LLM_BRAND.add(b); return Object.freeze(b); }

/**
 * createTestLlmCapabilityBoundary({ transport, boundaryId })
 * Reserve a l'espace TEST. Le transport local est accepte ICI, et l'artefact
 * produit portera executionMode = TEST.
 */
function buildTestBoundary(input) {
  input = input || {};
  if (typeof input.transport !== "function") throw fail("LLM_BOUNDARY_INVALID", "transport de test requis.");
  const transport = input.transport;
  return brand({
    boundaryKind: "EvidenceForge.OperatorLlmCapabilityBoundary", schemaVersion: "MONO-10-v6",
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    llmBoundaryId: "olb-test-" + sha256Of({ id: input.boundaryId || "test" }).slice(0, 16),
    async probe(intent) { return transport(intent); },
  });
}

/**
 * createOperatorLlmCapabilityBoundary(cfg)
 * cfg.transportModuleRef : chemin d'un module de transport PROVISIONNE par
 *   l'exploitant, hors de l'espace d'appel. Il est charge ICI, jamais reçu.
 * cfg.allowedProviders / allowedModels / allowedWorkers : ce que l'exploitant
 *   autorise. Une intention hors de ces listes est refusee.
 */
function buildOperatorBoundary(cfg) {
  cfg = cfg || {};
  if (!isNonEmptyStr(cfg.transportModuleRef)) {
    throw fail("LLM_BOUNDARY_NOT_PROVISIONED",
      "aucun transport de production provisionne : EvidenceForge ne fabrique pas la preuve de sa propre capacite — fail closed.");
  }
  let mod;
  try { mod = require(cfg.transportModuleRef); }
  catch (e) { throw fail("LLM_BOUNDARY_UNLOADABLE", "transport de production illisible (" + cfg.transportModuleRef + ") : " + ((e && e.message) || e)); }
  if (!mod || typeof mod.probe !== "function") throw fail("LLM_BOUNDARY_INVALID", "le module de transport doit exposer probe().");
  const allowed = {
    providers: Array.isArray(cfg.allowedProviders) ? cfg.allowedProviders.slice() : null,
    models: Array.isArray(cfg.allowedModels) ? cfg.allowedModels.slice() : null,
    workers: Array.isArray(cfg.allowedWorkers) ? cfg.allowedWorkers.slice() : null,
  };
  return brand({
    boundaryKind: "EvidenceForge.OperatorLlmCapabilityBoundary", schemaVersion: "MONO-10-v6",
    namespace: "PRODUCTION", provisionedFrom: "ENVIRONMENT",
    llmBoundaryId: "olb-prod-" + sha256Of({ m: cfg.transportModuleRef, a: allowed }).slice(0, 16),
    transportRefHash: sha256Of({ m: cfg.transportModuleRef }),
    async probe(intent) {
      intent = intent || {};
      const deny = [];
      if (allowed.providers && allowed.providers.indexOf(intent.providerId) === -1) deny.push("fournisseur \"" + intent.providerId + "\" non autorise par l'exploitant");
      if (allowed.models && allowed.models.indexOf(intent.modelId) === -1) deny.push("modele \"" + intent.modelId + "\" non autorise par l'exploitant");
      if (allowed.workers && allowed.workers.indexOf(intent.workerBindingId) === -1) deny.push("worker \"" + intent.workerBindingId + "\" non autorise par l'exploitant");
      if (deny.length) return { httpStatus: 0, denied: true, denyReasons: deny };
      return mod.probe(intent);
    },
  });
}

/** createFromBoundary(issuance, cfg) — le seul chemin ; la reference de
 * transport vient de la configuration DEJA CHARGEE par la frontiere. */
function createFromBoundary(issuance, cfg) {
  const OTB = require("./operator-trust-boundary.js");
  if (!OTB.isBoundaryIssuanceHandle(issuance)) {
    throw fail("AUTHORITY_ISSUER_NOT_BOUNDARY",
      "une frontiere de capacite LLM ne se construit que depuis une OperatorTrustBoundary provisionnee.");
  }
  cfg = cfg || {};
  const ref = issuance.operatorConfigPaths.llmTransportModuleRef;
  if (!isNonEmptyStr(ref)) throw fail("LLM_BOUNDARY_CONFIG_INVALID", "la configuration de l'exploitant ne declare aucun transportModuleRef.");
  let b;
  if (cfg.kind === "OPERATOR_TRANSPORT") {
    b = buildOperatorBoundary({ transportModuleRef: ref, allowedProviders: cfg.allowedProviders,
      allowedModels: cfg.allowedModels, allowedWorkers: cfg.allowedWorkers });
  } else if (cfg.kind === "TEST_TRANSPORT") {
    if (issuance.namespace !== "TEST") throw fail("LLM_BOUNDARY_INSUFFICIENT", "un transport de test ne prouve aucune capacite hors TEST.");
    b = buildTestBoundary({ transportModuleRef: null, transport: require(ref).probe,
      boundaryId: issuance.operatorBoundaryId, allowedProviders: cfg.allowedProviders,
      allowedModels: cfg.allowedModels, allowedWorkers: cfg.allowedWorkers });
  } else {
    throw fail("LLM_BOUNDARY_CONFIG_INVALID", "genre de frontiere de capacite LLM inconnu.");
  }
  DESCRIPTORS.set(b, AD.makeAuthorityDescriptor(issuance, AD.KIND.LLM_CAPABILITY, { kind: cfg.kind }));
  return b;
}

/** §14 — fabrique de TEST explicite. */
function createTestLlmCapabilityAuthority(input) {
  input = input || {};
  const pseudo = Object.freeze({ operatorBoundaryId: "otb-test-inprocess:" + sha256Of({ b: input.boundaryId || "test" }).slice(0, 12),
    namespace: "TEST", provisionedFrom: "IN_PROCESS_TEST",
    configBindingHash: sha256Of({ inProcess: true }), issuerGeneration: "test", operatorConfigPaths: {} });
  const b = buildTestBoundary(input);
  DESCRIPTORS.set(b, AD.makeAuthorityDescriptor(pseudo, AD.KIND.LLM_CAPABILITY, { kind: "TEST_TRANSPORT" }));
  return b;
}

module.exports = { createFromBoundary, createTestLlmCapabilityAuthority, isProvisionedLlmBoundary, descriptorOf };
