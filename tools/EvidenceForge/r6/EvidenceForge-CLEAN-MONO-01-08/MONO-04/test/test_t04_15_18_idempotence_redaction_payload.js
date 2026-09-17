"use strict";
const { startTestServer, buildMono04 } = require("./fixtures.js");
const { createMono04 } = require("../index.js");
const { createStaticSecretProvider } = require("../lib/secret-provider.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  let callCount = 0;
  let lastReceivedAuth = null;
  const server = await startTestServer({
    "/echo": (req, res) => {
      callCount++;
      lastReceivedAuth = req.headers["authorization"];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "ok", receivedPayload: req.rawBody ? JSON.parse(req.rawBody) : null }));
    },
  });

  {
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    const req = { requestId: "t15-stable", provider: "/echo", operation: "x", payload: { a: 1 } };
    const [r1] = await Promise.all([mono04.gateway.executeRequest(req), mono04.gateway.executeRequest(req)]);
    const r3 = await mono04.gateway.executeRequest(req);
    check("T04-15a. deux appels CONCURRENTS avec le même requestId ne déclenchent qu'UN SEUL appel réseau réel", callCount === 1, JSON.stringify({ callCount }));
    check("T04-15b. un appel SÉQUENTIEL ultérieur avec le même requestId réutilise le résultat en cache (toujours un seul appel réseau)", callCount === 1 && r3.completedAt === r1.completedAt, JSON.stringify({ callCount }));
    let conflictThrown = false;
    try {
      await mono04.gateway.executeRequest({ provider: "/echo", operation: "x", payload: {} });
    } catch (e) {
      conflictThrown = e.code === "EXTERNAL_REQUEST_CONFLICT";
    }
    check("T04-15c. requestId manquant -> EXTERNAL_REQUEST_CONFLICT explicite", conflictThrown);
  }

  {
    const logs = [];
    const mono04WithLogger = createMono04({
      providerConfigs: { "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST", requiredSecret: "TEST_WORKER_SECRET" } },
      secretProvider: createStaticSecretProvider({ TEST_WORKER_SECRET: "sk-VRAIMENT-SECRET-JAMAIS-DANS-LES-LOGS" }),
      logger: (entry) => logs.push(entry),
    });
    await mono04WithLogger.gateway.executeRequest({ requestId: "t16", provider: "/echo", operation: "x", payload: { hello: "world" } });
    const serialized = JSON.stringify(logs);
    check("T04-16. le secret réel n'apparaît JAMAIS en clair dans les logs techniques capturés", !serialized.includes("sk-VRAIMENT-SECRET-JAMAIS-DANS-LES-LOGS"), serialized.slice(0, 300));
    const startEntry = logs.find((l) => l.event === "external_call_start");
    check("T04-17. le header Authorization est explicitement redacté ([REDACTED]) dans le log de départ, jamais omis silencieusement", startEntry && startEntry.headers && startEntry.headers.Authorization === "[REDACTED]", JSON.stringify(startEntry && startEntry.headers));
    check("T04-17b. le VRAI secret a bien été utilisé pour l'appel réel (le serveur l'a reçu), la redaction ne concerne QUE les logs", lastReceivedAuth === "Bearer sk-VRAIMENT-SECRET-JAMAIS-DANS-LES-LOGS", lastReceivedAuth);
  }

  {
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    const originalPayload = { a: 1, nested: { b: 2 } };
    const frozenSnapshot = JSON.stringify(originalPayload);
    const r = await mono04.gateway.executeRequest({ requestId: "t18", provider: "/echo", operation: "x", payload: originalPayload });
    check("T04-18a. le payload fourni par l'appelant n'est jamais modifié après l'appel (même référence, contenu identique)", JSON.stringify(originalPayload) === frozenSnapshot);
    check("T04-18b. le serveur a bien reçu le payload EXACT, jamais réécrit en transit", JSON.stringify(r.result.receivedPayload) === frozenSnapshot, JSON.stringify(r.result.receivedPayload));
  }

  await server.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
