"use strict";
const { startTestServer, buildMono04 } = require("./fixtures.js");
const { createMono04 } = require("../index.js");
const { createStaticSecretProvider } = require("../lib/secret-provider.js");
const { computeRequestFingerprint } = require("../lib/request-fingerprint.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  let calls = 0;
  const server = await startTestServer({
    "/echo": (req, res) => {
      calls++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "ok" }));
    },
  });

  {
    calls = 0;
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    const req = { requestId: "c01", provider: "/echo", operation: "x", payload: { a: 1 } };
    const r1 = await mono04.gateway.executeRequest(req);
    const r2 = await mono04.gateway.executeRequest({ ...req });
    check("T04-IDEMPOTENCE-CONFLICT-01. même requestId + même requête -> un seul appel réseau réel, résultat identique réutilisé", calls === 1 && r1.completedAt === r2.completedAt, JSON.stringify({ calls }));
  }

  {
    calls = 0;
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "c02", provider: "/echo", operation: "x", payload: { a: 1 } });
    let conflict = null;
    try {
      await mono04.gateway.executeRequest({ requestId: "c02", provider: "/echo", operation: "x", payload: { a: 999 } });
    } catch (e) {
      conflict = e;
    }
    check("T04-IDEMPOTENCE-CONFLICT-02. même requestId + payload DIFFÉRENT -> EXTERNAL_REQUEST_CONFLICT explicite, jamais une réutilisation silencieuse (bug rapporté)", conflict && conflict.code === "EXTERNAL_REQUEST_CONFLICT" && calls === 1, JSON.stringify({ calls, code: conflict && conflict.code }));
  }

  {
    calls = 0;
    const mono04 = buildMono04({
      "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" },
      "/echo2": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" },
    });
    await mono04.gateway.executeRequest({ requestId: "c03", provider: "/echo", operation: "x", payload: {} });
    let conflict = null;
    try {
      await mono04.gateway.executeRequest({ requestId: "c03", provider: "/echo2", operation: "x", payload: {} });
    } catch (e) {
      conflict = e;
    }
    check("T04-IDEMPOTENCE-CONFLICT-03. même requestId + provider DIFFÉRENT -> conflit", conflict && conflict.code === "EXTERNAL_REQUEST_CONFLICT" && calls === 1, JSON.stringify({ calls, code: conflict && conflict.code }));
  }

  {
    calls = 0;
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "c04", provider: "/echo", operation: "x", payload: {} });
    let conflict = null;
    try {
      await mono04.gateway.executeRequest({ requestId: "c04", provider: "/echo", operation: "DIFFERENT", payload: {} });
    } catch (e) {
      conflict = e;
    }
    check("T04-IDEMPOTENCE-CONFLICT-04. même requestId + operation DIFFÉRENTE -> conflit", conflict && conflict.code === "EXTERNAL_REQUEST_CONFLICT" && calls === 1, JSON.stringify({ calls, code: conflict && conflict.code }));
  }

  {
    calls = 0;
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "c05", runId: "run-A", nodeId: "node-A", moduleId: "EF-02D", provider: "/echo", operation: "x", payload: {} });
    let conflictRunId = null, conflictNodeId = null, conflictModuleId = null;
    try {
      await mono04.gateway.executeRequest({ requestId: "c05", runId: "run-B", nodeId: "node-A", moduleId: "EF-02D", provider: "/echo", operation: "x", payload: {} });
    } catch (e) { conflictRunId = e; }
    try {
      await mono04.gateway.executeRequest({ requestId: "c05", runId: "run-A", nodeId: "node-B", moduleId: "EF-02D", provider: "/echo", operation: "x", payload: {} });
    } catch (e) { conflictNodeId = e; }
    try {
      await mono04.gateway.executeRequest({ requestId: "c05", runId: "run-A", nodeId: "node-A", moduleId: "EF-03B", provider: "/echo", operation: "x", payload: {} });
    } catch (e) { conflictModuleId = e; }
    check(
      "T04-IDEMPOTENCE-CONFLICT-05. même requestId + runId/nodeId/moduleId différent (chacun testé isolément) -> conflit à chaque fois, jamais un second appel réseau",
      conflictRunId && conflictRunId.code === "EXTERNAL_REQUEST_CONFLICT" && conflictNodeId && conflictNodeId.code === "EXTERNAL_REQUEST_CONFLICT" && conflictModuleId && conflictModuleId.code === "EXTERNAL_REQUEST_CONFLICT" && calls === 1,
      JSON.stringify({ calls })
    );
  }

  {
    calls = 0;
    const mono04 = buildMono04({ "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "c06", provider: "/echo", operation: "x", payload: { a: 1, b: 2 } });
    let threw = false;
    try {
      await mono04.gateway.executeRequest({ requestId: "c06", provider: "/echo", operation: "x", payload: { b: 2, a: 1 } });
    } catch (e) {
      threw = true;
    }
    check("T04-IDEMPOTENCE-CONFLICT-06. ordre différent des clés JSON, contenu sémantiquement identique -> même fingerprint, PAS de faux conflit", threw === false && calls === 1, JSON.stringify({ calls, threw }));

    const fp1 = computeRequestFingerprint({ provider: "/echo", operation: "x", payload: { a: 1, b: 2 } });
    const fp2 = computeRequestFingerprint({ provider: "/echo", operation: "x", payload: { b: 2, a: 1 } });
    check("T04-IDEMPOTENCE-CONFLICT-06b. computeRequestFingerprint() lui-même produit une empreinte identique indépendamment de l'ordre des clés", fp1 === fp2, JSON.stringify({ fp1, fp2 }));
  }

  {
    const logs = [];
    const originalPayload = { hello: "world" };
    const frozenSnapshot = JSON.stringify(originalPayload);
    const mono04 = createMono04({
      providerConfigs: { "/echo": { endpoint: server.baseUrl + "/echo", timeoutMs: 500, method: "POST", requiredSecret: "TEST_SECRET_07" } },
      secretProvider: createStaticSecretProvider({ TEST_SECRET_07: "sk-JAMAIS-DANS-LE-FINGERPRINT-NI-LES-LOGS" }),
      logger: (entry) => logs.push(entry),
    });
    await mono04.gateway.executeRequest({ requestId: "c07", provider: "/echo", operation: "x", payload: originalPayload });
    const fingerprint = computeRequestFingerprint({ requestId: "c07", provider: "/echo", operation: "x", payload: originalPayload });
    check("T04-IDEMPOTENCE-CONFLICT-07a. le fingerprint calculé ne contient jamais la valeur du secret réel", !fingerprint.includes("sk-JAMAIS-DANS-LE-FINGERPRINT-NI-LES-LOGS"), fingerprint);
    check("T04-IDEMPOTENCE-CONFLICT-07b. aucun log capturé ne contient le secret réel", !JSON.stringify(logs).includes("sk-JAMAIS-DANS-LE-FINGERPRINT-NI-LES-LOGS"));
    check("T04-IDEMPOTENCE-CONFLICT-07c. le payload de l'appelant n'est jamais modifié par le calcul du fingerprint", JSON.stringify(originalPayload) === frozenSnapshot);
  }

  await server.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
