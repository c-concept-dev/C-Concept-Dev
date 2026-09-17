"use strict";
const { startTestServer } = require("./fixtures.js");
const { createMono04 } = require("../index.js");
const { createStaticSecretProvider } = require("../lib/secret-provider.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  let calls = 0;
  const server = await startTestServer({
    "/always-fails": (req, res) => {
      calls++;
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "panne" }));
    },
  });

  const mono04 = createMono04({
    providerConfigs: { "/always-fails": { endpoint: server.baseUrl + "/always-fails", timeoutMs: 300, method: "POST" } },
    secretProvider: createStaticSecretProvider({}),
    circuitBreaker: { failureThreshold: 3, coolDownMs: 200 },
  });

  for (let i = 0; i < 3; i++) {
    await mono04.gateway.executeRequest({ requestId: "cb-" + i, provider: "/always-fails", operation: "x", payload: {} });
  }
  check("T04-CB-01. 3 échecs consécutifs réellement observés par le serveur", calls === 3, JSON.stringify({ calls }));

  const callsBeforeOpen = calls;
  const rOpen = await mono04.gateway.executeRequest({ requestId: "cb-blocked", provider: "/always-fails", operation: "x", payload: {} });
  check(
    "T04-CB-02. après le seuil, un nouvel appel échoue IMMÉDIATEMENT (EXTERNAL_DEPENDENCY_UNAVAILABLE) SANS toucher le réseau",
    rOpen.status === "FAILED" && rOpen.technicalDiagnostics.error.code === "EXTERNAL_DEPENDENCY_UNAVAILABLE" && calls === callsBeforeOpen,
    JSON.stringify({ code: rOpen.technicalDiagnostics.error.code, callsBefore: callsBeforeOpen, callsAfter: calls })
  );

  await new Promise((r) => setTimeout(r, 250));
  const rClosed = await mono04.gateway.executeRequest({ requestId: "cb-after-cooldown", provider: "/always-fails", operation: "x", payload: {} });
  check(
    "T04-CB-03. après le cool-down, le circuit se referme : un nouvel appel RÉEL est retenté (échec normal, pas EXTERNAL_DEPENDENCY_UNAVAILABLE immédiat)",
    calls === callsBeforeOpen + 1 && rClosed.technicalDiagnostics.error.code === "EXTERNAL_HTTP_ERROR",
    JSON.stringify({ calls, code: rClosed.technicalDiagnostics.error.code })
  );

  await server.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
