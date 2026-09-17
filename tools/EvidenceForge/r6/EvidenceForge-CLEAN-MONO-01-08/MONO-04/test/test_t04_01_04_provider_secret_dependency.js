"use strict";
const { createMono04 } = require("../index.js");
const { createProviderRegistry } = require("../lib/provider-registry.js");
const { createEnvSecretProvider, createStaticSecretProvider } = require("../lib/secret-provider.js");
const { createExternalExecutionGateway } = require("../lib/external-execution-gateway.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  {
    let threw = false;
    try {
      createExternalExecutionGateway({ secretProvider: createEnvSecretProvider() });
    } catch (e) {
      threw = /providerRegistry est obligatoire/i.test(e.message);
    }
    check("T04-01a. createExternalExecutionGateway() sans providerRegistry -> échec immédiat", threw);

    let threwSecret = false;
    try {
      createExternalExecutionGateway({ providerRegistry: createProviderRegistry({}) });
    } catch (e) {
      threwSecret = /secretProvider est obligatoire/i.test(e.message);
    }
    check("T04-01b. createExternalExecutionGateway() sans secretProvider -> échec immédiat", threwSecret);

    let threwMono04 = false;
    try {
      createMono04({});
    } catch (e) {
      threwMono04 = /providerConfigs est obligatoire/i.test(e.message);
    }
    check("T04-01c. createMono04({}) sans providerConfigs -> échec immédiat", threwMono04);
  }

  {
    const mono04 = createMono04({ providerConfigs: { "clone-proxy": { endpoint: "http://127.0.0.1:1/x", timeoutMs: 100 } } });
    const r = await mono04.gateway.executeRequest({ requestId: "r1", provider: "provider-jamais-configure", operation: "x", payload: {} });
    check("T04-02. requête vers un provider non configuré -> PROVIDER_NOT_CONFIGURED, jamais un appel réseau tenté", r.status === "FAILED" && r.technicalDiagnostics.error.code === "PROVIDER_NOT_CONFIGURED" && r.attemptCount === 0, JSON.stringify(r.technicalDiagnostics));
  }

  {
    const mono04 = createMono04({
      providerConfigs: { "secure-provider": { endpoint: "http://127.0.0.1:1/x", timeoutMs: 100, requiredSecret: "SECRET_QUI_N_EXISTE_PAS" } },
      secretProvider: createStaticSecretProvider({}),
    });
    const r = await mono04.gateway.executeRequest({ requestId: "r2", provider: "secure-provider", operation: "x", payload: {} });
    check("T04-03. secret requis absent -> SECRET_UNAVAILABLE, jamais un appel réseau tenté", r.status === "FAILED" && r.technicalDiagnostics.error.code === "SECRET_UNAVAILABLE" && r.attemptCount === 0, JSON.stringify(r.technicalDiagnostics));
  }

  {
    const provider = createEnvSecretProvider({ env: {} });
    let threw = false;
    try {
      provider.getSecret("ANY_KEY");
    } catch (e) {
      threw = e.code === "SECRET_UNAVAILABLE";
    }
    check("T04-04. createEnvSecretProvider() sur un environnement vide ne renvoie JAMAIS de secret par défaut (aucun fallback codé en dur)", threw);
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
