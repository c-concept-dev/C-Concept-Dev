"use strict";
/**
 * MONO-10 v0.6 — core/operator-llm-capability-boundary.js   (§45, §46, §47, §48)
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

const LLM_BRAND = new WeakSet();
function isProvisionedLlmBoundary(b) { return !!b && LLM_BRAND.has(b); }
function brand(b) { LLM_BRAND.add(b); return Object.freeze(b); }

/**
 * createTestLlmCapabilityBoundary({ transport, boundaryId })
 * Reserve a l'espace TEST. Le transport local est accepte ICI, et l'artefact
 * produit portera executionMode = TEST.
 */
function createTestLlmCapabilityBoundary(input) {
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
function createOperatorLlmCapabilityBoundary(cfg) {
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

module.exports = { createTestLlmCapabilityBoundary, createOperatorLlmCapabilityBoundary, isProvisionedLlmBoundary };
