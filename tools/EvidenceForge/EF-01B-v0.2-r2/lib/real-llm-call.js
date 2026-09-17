"use strict";
// EF-01B-v0.2-r1 — lib/real-llm-call.js
//
// Ferme F-03 (MODEL PROVENANCE BINDING), F-04 (TRANSPORT PROVENANCE
// BINDING) et F-06 (REQUEST ID SEMANTICS).
//
// N'appelle JAMAIS buildRealLlmWorkerCallFn() (MONO-08/v0.6/lib/
// real-external-adapter.js) : ce wrapper gele ne retourne qu'un texte brut
// (content[0].text), jetant le reste de l'enveloppe de reponse provider
// (voir son propre commentaire de decouverte de contrat, ligne ~48-67) —
// impossible d'observer depuis lui le modele/id reellement retournes.
//
// Ce module appelle donc gateway.executeRequest() DIRECTEMENT — LA MEME
// primitive bas niveau, deja reutilisee ailleurs dans R6 (real-external-
// adapter.js::discoverProfessionals/buildProfessionalCorpus pour OpenAlex)
// pour un provider different. Meme Gateway MONO-04, meme providerRegistry,
// meme secretProvider, meme retry/circuit-breaker geles : RIEN de la stack
// reseau n'est duplique ni reimplemente ici — seule l'EXTRACTION de la
// reponse differe (on lit aussi result.result.id/.model, pas seulement
// content[0].text).
//
// Source de verite UNIQUE pour le modele : resolveRealLlmModel(env),
// exportee par real-external-adapter.js — LA MEME fonction que
// buildRealLlmWorkerCallFn() utilise en interne pour construire son
// payload. Si le provider echo un modele reel dans sa reponse
// (result.result.model — le cas reel Anthropic), cette valeur OBSERVEE
// prime toujours ; resolveRealLlmModel(env) ne sert de repli que si le
// provider/la fixture ne l'echo pas.
//
// Source de verite UNIQUE pour le transport : la configuration REELLEMENT
// enregistree sur CETTE instance mono04
// (mono04.providerRegistry.getProviderConfig("llm-worker").requiredSecret,
// MONO-04/lib/provider-registry.js, gele) — jamais une variable
// d'environnement relue independamment (qui pourrait diverger de ce qui a
// reellement servi a construire mono04).

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

const AUTH_MODE_BY_REQUIRED_SECRET = {
  ANTHROPIC_API_KEY: "direct",
  EVIDENCEFORGE_WORKER_API_KEY: "delegated",
};

/**
 * resolveEffectiveTransport(mono04) — F-04. Derive le transport REELLEMENT
 * configure sur ce mono04, jamais une valeur declaree independamment.
 */
function resolveEffectiveTransport(mono04) {
  if (!mono04 || !mono04.providerRegistry || typeof mono04.providerRegistry.getProviderConfig !== "function") {
    throw new Error(
      "resolveEffectiveTransport: mono04.providerRegistry.getProviderConfig(\"llm-worker\") requis — le transport ne peut jamais " +
      "etre une valeur declarative sans configuration Gateway reelle a observer (F-04)."
    );
  }
  const cfg = mono04.providerRegistry.getProviderConfig("llm-worker");
  const mode = AUTH_MODE_BY_REQUIRED_SECRET[cfg && cfg.requiredSecret];
  if (!mode) {
    throw new Error(
      "resolveEffectiveTransport: requiredSecret \"" + (cfg && cfg.requiredSecret) + "\" enregistre sur le provider \"llm-worker\" " +
      "ne correspond a aucun mode connu (attendu ANTHROPIC_API_KEY -> direct, EVIDENCEFORGE_WORKER_API_KEY -> delegated) — jamais un mode devine."
    );
  }
  return mode;
}

function defaultErrorFactory(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

/**
 * callTracedRealLlm(opts) :
 *   bundleRoot        - racine extraction R6
 *   mono04            - { gateway, providerRegistry } reel ou LOCAL_CONTROLLED (doit exposer providerRegistry.getProviderConfig)
 *   missionContext     - { runId, nodeId? }
 *   prompt             - texte du prompt reel
 *   env                 - optionnel, defaut process.env (pour tests LOCAL_CONTROLLED)
 *   declaredModel       - optionnel, ASSERTION jamais une valeur de provenance : si fourni et different du modele
 *                         effectivement observe, leve MODEL_PROVENANCE_MISMATCH (F-03)
 *   declaredTransport   - optionnel, ASSERTION : si fourni et different du transport effectivement configure,
 *                         leve TRANSPORT_PROVENANCE_MISMATCH (F-04)
 *   errorFactory        - optionnel, (code, message, details) -> Error, pour rester dans la liste de codes du lot appelant
 *   localInvocationIdPrefix - optionnel, prefixe lisible de l'id local genere
 *
 * Retourne { text, effectiveModel, effectiveTransport, localInvocationId, providerRequestId }.
 * `providerRequestId` vaut null si le provider/la fixture n'a jamais retourne
 * d'identifiant reel (jamais invente — F-06).
 */
async function callTracedRealLlm(opts) {
  opts = opts || {};
  const errorFactory = opts.errorFactory || defaultErrorFactory;
  const required = ["bundleRoot", "mono04", "missionContext", "prompt"];
  for (const f of required) {
    if (!opts[f]) throw new Error("callTracedRealLlm: parametre requis manquant \"" + f + "\".");
  }
  const env = opts.env || process.env;

  const path = require("path");
  const { resolveRealLlmModel } = require(path.join(opts.bundleRoot, "MONO-08", "v0.6", "lib", "real-external-adapter.js"));

  const effectiveTransport = resolveEffectiveTransport(opts.mono04);
  if (isNonEmptyStr(opts.declaredTransport) && opts.declaredTransport !== effectiveTransport) {
    throw errorFactory(
      "TRANSPORT_PROVENANCE_MISMATCH",
      "transport declare (\"" + opts.declaredTransport + "\") ne correspond pas au transport reellement configure sur ce Gateway (\"" + effectiveTransport + "\") — jamais une contradiction silencieuse.",
      { declaredTransport: opts.declaredTransport, effectiveTransport: effectiveTransport }
    );
  }

  const resolvedModel = resolveRealLlmModel(env);
  const localInvocationId = (opts.localInvocationIdPrefix || "local-invocation") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  const gateway = opts.mono04.gateway;
  const result = await gateway.executeRequest({
    requestId: localInvocationId,
    runId: opts.missionContext.runId,
    nodeId: opts.missionContext.nodeId || "worker",
    moduleId: "real-llm-call",
    dependencyType: "worker",
    provider: "llm-worker",
    operation: "call",
    payload: { model: resolvedModel, max_tokens: 4096, messages: [{ role: "user", content: opts.prompt }] },
    timeoutPolicy: {},
    retryPolicy: { maxAttempts: 2, backoffMs: 2000 },
  });

  if (result.status !== "SUCCESS") {
    throw errorFactory(
      "LLM_PROVIDER_UNAVAILABLE",
      "appel LLM echoue : " + (result.technicalDiagnostics && result.technicalDiagnostics.error && result.technicalDiagnostics.error.message),
      { cause: result.technicalDiagnostics }
    );
  }

  const content = result.result && result.result.content;
  if (!Array.isArray(content) || typeof content[0] !== "object" || typeof content[0].text !== "string") {
    throw errorFactory("LLM_RESPONSE_INVALID", "forme de reponse inattendue - champ content[0].text absent ou non textuel.", {});
  }

  // Modele effectif : observation directe (enveloppe reelle du provider)
  // prioritaire sur la resolution locale, jamais l'inverse.
  const echoedModel = isNonEmptyStr(result.result.model) ? result.result.model : null;
  const effectiveModel = echoedModel || resolvedModel;
  if (isNonEmptyStr(opts.declaredModel) && opts.declaredModel !== effectiveModel) {
    throw errorFactory(
      "MODEL_PROVENANCE_MISMATCH",
      "modele declare (\"" + opts.declaredModel + "\") ne correspond pas au modele reellement utilise/observe (\"" + effectiveModel + "\") — jamais une contradiction silencieuse.",
      { declaredModel: opts.declaredModel, effectiveModel: effectiveModel, echoedByProvider: !!echoedModel }
    );
  }

  const providerRequestId = isNonEmptyStr(result.result.id) ? result.result.id : null;

  return {
    text: content[0].text,
    effectiveModel: effectiveModel,
    effectiveTransport: effectiveTransport,
    localInvocationId: localInvocationId,
    providerRequestId: providerRequestId,
  };
}

module.exports = { callTracedRealLlm: callTracedRealLlm, resolveEffectiveTransport: resolveEffectiveTransport };
