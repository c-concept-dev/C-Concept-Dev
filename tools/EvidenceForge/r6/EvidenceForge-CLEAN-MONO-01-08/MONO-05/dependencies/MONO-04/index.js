"use strict";

const { createProviderRegistry } = require("./lib/provider-registry.js");
const { createEnvSecretProvider } = require("./lib/secret-provider.js");
const { createExternalExecutionGateway } = require("./lib/external-execution-gateway.js");
const { createExternalStageAdapter, createGatewayWorkerCallFn, createGatewayFetchImpl } = require("./lib/external-stage-adapter.js");

// createMono04(options) — options.providerConfigs est OBLIGATOIRE et
// explicite (même discipline que MONO-01.x/MONO-03 après leurs corrections
// d'audit respectives) : MONO-04 ne construit jamais de configuration
// provider par défaut. secretProvider est optionnel (défaut :
// createEnvSecretProvider(), qui lit process.env et échoue fail-closed si
// une clé manque — jamais une valeur codée en dur).
function createMono04(options) {
  const opts = options || {};
  if (!opts.providerConfigs) {
    throw new Error("createMono04: options.providerConfigs est obligatoire — aucune configuration provider par défaut n'est fournie.");
  }
  const providerRegistry = createProviderRegistry(opts.providerConfigs);
  const secretProvider = opts.secretProvider || createEnvSecretProvider();
  const gateway = createExternalExecutionGateway({
    providerRegistry,
    secretProvider,
    fetchImpl: opts.fetchImpl,
    logger: opts.logger,
    circuitBreaker: opts.circuitBreaker,
  });

  return {
    providerRegistry,
    secretProvider,
    gateway,
    createExternalStageAdapter,
    createGatewayWorkerCallFn: (requestTemplate) => createGatewayWorkerCallFn(gateway, requestTemplate),
    createGatewayFetchImpl: (provider) => createGatewayFetchImpl(gateway, provider),
  };
}

module.exports = { createMono04 };
