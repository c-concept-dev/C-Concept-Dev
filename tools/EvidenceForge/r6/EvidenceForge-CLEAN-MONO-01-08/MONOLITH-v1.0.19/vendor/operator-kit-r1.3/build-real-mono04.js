"use strict";
// scripts/lib/build-real-mono04.js — construit un mono04 REEL en
// reutilisant EXCLUSIVEMENT les fonctions R6 gelees deja utilisees par
// bin/run-real-smoke.js pour ce meme usage — jamais une construction
// parallele :
//   - buildRealProviderConfigs(env)   (MONO-08/v0.6/lib/real-provider-configs.js)
//   - createEnvSecretProvider()       (MONO-04/lib/secret-provider.js)
//   - createMono04(options)           (MONO-04/index.js)
//
// buildRealProviderConfigs() leve deja fail-closed si LLM_AUTH_MODE est
// invalide ou si un provider pointe vers une URL locale/synthetique
// (section 10 du CDC R6, gelee) — jamais reimplemente ici.

const path = require("path");

function buildRealMono04(bundleRoot, env) {
  env = env || process.env;
  const { buildRealProviderConfigs } = require(path.join(bundleRoot, "MONO-08", "v0.6", "lib", "real-provider-configs.js"));
  const { createEnvSecretProvider } = require(path.join(bundleRoot, "MONO-04", "lib", "secret-provider.js"));
  const { createMono04 } = require(path.join(bundleRoot, "MONO-04", "index.js"));

  const providerConfigs = buildRealProviderConfigs(env);
  const secretProvider = createEnvSecretProvider();
  return createMono04({ providerConfigs: providerConfigs, secretProvider: secretProvider });
}

module.exports = { buildRealMono04: buildRealMono04 };
