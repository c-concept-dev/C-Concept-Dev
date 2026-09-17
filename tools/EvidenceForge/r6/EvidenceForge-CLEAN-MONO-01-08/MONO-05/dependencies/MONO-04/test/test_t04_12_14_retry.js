"use strict";
const { startTestServer, buildMono04 } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  let attempts500 = 0;
  const server = await startTestServer({
    "/flaky-then-ok": (req, res) => {
      attempts500++;
      if (attempts500 < 3) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "transient" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: "ok apres retries" }));
      }
    },
  });

  {
    const mono04 = buildMono04({ "/flaky-then-ok": { endpoint: server.baseUrl + "/flaky-then-ok", timeoutMs: 500, method: "POST" } });
    const r = await mono04.gateway.executeRequest({
      requestId: "t12",
      provider: "/flaky-then-ok",
      operation: "x",
      payload: {},
      retryPolicy: { maxAttempts: 4, backoffMs: 10 },
    });
    check("T04-12. retryPolicy explicite respectée : le serveur (réellement en panne 2 fois) finit par réussir, résultat SUCCESS", r.status === "SUCCESS" && r.attemptCount === 3 && attempts500 === 3, JSON.stringify({ attemptCount: r.attemptCount, serverSeen: attempts500 }));
  }

  {
    let calls = 0;
    const server2 = await startTestServer({
      "/count": (req, res) => {
        calls++;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "panne" }));
      },
    });
    const mono04 = buildMono04({ "/count": { endpoint: server2.baseUrl + "/count", timeoutMs: 500, method: "POST" } });
    const r = await mono04.gateway.executeRequest({ requestId: "t13", provider: "/count", operation: "x", payload: {}, retryPolicy: { maxAttempts: 3, backoffMs: 5 } });
    check("T04-13. exactement 3 tentatives réellement effectuées (jamais plus que maxAttempts), échec final EXTERNAL_RETRY_EXHAUSTED", calls === 3 && r.attemptCount === 3 && r.technicalDiagnostics.error.code === "EXTERNAL_RETRY_EXHAUSTED", JSON.stringify({ calls, attemptCount: r.attemptCount }));
    await server2.close();
  }

  {
    let calls = 0;
    const server3 = await startTestServer({
      "/count2": (req, res) => {
        calls++;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "panne" }));
      },
    });
    const mono04 = buildMono04({ "/count2": { endpoint: server3.baseUrl + "/count2", timeoutMs: 500, method: "POST" } });
    const r = await mono04.gateway.executeRequest({ requestId: "t14", provider: "/count2", operation: "x", payload: {}, retryPolicy: { maxAttempts: 999999, backoffMs: 1 } });
    const { HARD_MAX_ATTEMPTS_CAP } = require("../lib/external-execution-gateway.js");
    check(`T04-14. maxAttempts=999999 demandé -> plafonné réellement à HARD_MAX_ATTEMPTS_CAP=${HARD_MAX_ATTEMPTS_CAP}`, calls === HARD_MAX_ATTEMPTS_CAP && r.attemptCount === HARD_MAX_ATTEMPTS_CAP, JSON.stringify({ calls, cap: HARD_MAX_ATTEMPTS_CAP }));
    await server3.close();
  }

  {
    let calls = 0;
    const server4 = await startTestServer({
      "/count3": (req, res) => {
        calls++;
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad request" }));
      },
    });
    const mono04 = buildMono04({ "/count3": { endpoint: server4.baseUrl + "/count3", timeoutMs: 500, method: "POST" } });
    await mono04.gateway.executeRequest({ requestId: "t14b", provider: "/count3", operation: "x", payload: {}, retryPolicy: { maxAttempts: 5, backoffMs: 1 } });
    check("T04-14b. une erreur 400 (non transitoire) n'est jamais retentée, même avec maxAttempts=5", calls === 1, JSON.stringify({ calls }));
    await server4.close();
  }

  await server.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
