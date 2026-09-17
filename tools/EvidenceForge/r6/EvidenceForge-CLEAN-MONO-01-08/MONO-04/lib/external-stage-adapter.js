"use strict";

// external-stage-adapter.js — CDC MONO-04 section 9. Fournit un binding
// TECHNIQUE compatible avec le contrat gelé ExternalStageAdapter
// (contracts/external-stage-adapter-v1.json, MONO-01.x) — jamais une UI
// pilotée, jamais une simulation de clics, jamais une reconstruction de la
// logique métier d'EF-02A/B/C (qui reste un outil HTML gelé à dépôt manuel).
//
// Le binding ne DÉCIDE JAMAIS qui est un candidat/vérifié/corpus valide —
// cette décision reste celle de l'outil HTML gelé (ou d'un humain qui
// l'utilise). Ce que MONO-04 fournit ici est la FRONTIÈRE D'EXÉCUTION
// TECHNIQUE : chaque méthode délègue à une fonction "resultProvider"
// injectée explicitement par l'appelant ; l'absence d'un resultProvider
// pour une étape précise échoue fail-closed (EXTERNAL_DEPENDENCY_UNAVAILABLE),
// jamais un comportement par défaut inventé.
function createExternalStageAdapter(resultProviders) {
  const providers = resultProviders || {};

  function bindStage(methodName) {
    const provider = providers[methodName];
    if (typeof provider !== "function") {
      // Absence RÉELLE de la méthode sur l'objet adapter retourné — jamais
      // une méthode fantôme qui throw à l'appel. C'est ce qui permet au
      // contrôle fail-closed déjà existant côté MONO-01.x
      // (ProfessionalPipelinePort::invokeStage : `typeof adapter[def.methodName]
      // === "function"`) de fonctionner exactement comme pour tout autre
      // adapter — jamais un contournement de ce mécanisme déjà gelé.
      return undefined;
    }
    return async function (inputs) {
      return provider(inputs);
    };
  }

  const adapter = {
    schema: "EvidenceForge.ExternalStageAdapter",
    schemaVersion: "MONO-01-v1",
    bindingType: "EXTERNAL_STAGE_ADAPTER",
  };
  const discover = bindStage("discoverProfessionals");
  const verify = bindStage("verifyProfessionals");
  const buildCorpus = bindStage("buildProfessionalCorpus");
  if (discover) adapter.discoverProfessionals = discover;
  if (verify) adapter.verifyProfessionals = verify;
  if (buildCorpus) adapter.buildProfessionalCorpus = buildCorpus;
  return adapter;
}

// createGatewayWorkerCallFn(gateway, requestTemplate) — construit un
// workerCallFn(prompt) RÉEL au sens du point d'injection déjà gelé
// (EF-02D::buildEligibilityRelevanceSet, EF-03B::buildDocumentaryReviewSet
// — signature confirmée dans le code gelé : `await workerCallFn(prompt)`
// -> string). MONO-04 route ce prompt vers le provider via le Gateway
// (timeout/retry/redaction contrôlés) et renvoie le TEXTE brut de la
// réponse — jamais une interprétation du contenu.
function createGatewayWorkerCallFn(gateway, requestTemplate) {
  return async function workerCallFn(prompt) {
    const result = await gateway.executeRequest({
      ...requestTemplate,
      requestId: (requestTemplate.requestId || "worker-call") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      payload: { payload: prompt }, // forme exacte confirmée dans les outils gelés EF-02A (`body:JSON.stringify({payload})`)
    });
    if (result.status !== "SUCCESS") {
      throw new Error(`createGatewayWorkerCallFn: échec technique (${result.technicalDiagnostics.error && result.technicalDiagnostics.error.code}) — ${result.technicalDiagnostics.error && result.technicalDiagnostics.error.message}`);
    }
    const field = requestTemplate.responseTextField || "text";
    if (typeof result.result[field] !== "string") {
      throw new Error(`createGatewayWorkerCallFn: champ de réponse "${field}" absent ou non textuel dans la réponse du Worker.`);
    }
    return result.result[field];
  };
}

// createGatewayFetchImpl(gateway, provider, opts) — construit une fonction
// `fetchImpl` compatible avec le point d'injection déjà gelé
// EF-ORCH::createOpenAlexRunner({fetchImpl, genId, nowIso}). MONO-04 route
// cet appel via le Gateway tout en respectant la frontière déjà établie :
// le runner gelé lui-même construit l'URL et interprète la réponse
// OpenAlex, MONO-04 ne fait que transporter la requête.
function createGatewayFetchImpl(gateway, provider) {
  return async function fetchImpl() {
    const result = await gateway.executeRequest({
      requestId: "openalex-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      provider,
      operation: "fetch",
      payload: null,
    });
    if (result.status !== "SUCCESS") {
      return { ok: false, status: (result.technicalDiagnostics && result.technicalDiagnostics.httpStatus) || 0, json: async () => { throw new Error("fetchImpl: réponse invalide."); } };
    }
    return { ok: true, status: result.technicalDiagnostics.httpStatus, json: async () => result.result };
  };
}

module.exports = { createExternalStageAdapter, createGatewayWorkerCallFn, createGatewayFetchImpl };
