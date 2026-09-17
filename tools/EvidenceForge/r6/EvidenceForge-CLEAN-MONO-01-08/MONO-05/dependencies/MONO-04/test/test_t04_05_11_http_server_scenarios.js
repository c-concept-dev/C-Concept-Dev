"use strict";
const { startTestServer, buildMono04 } = require("./fixtures.js");
const net = require("net");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const server = await startTestServer({
    "/ok-json": (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "reponse valide", meta: { ok: true } }));
    },
    "/ok-html": (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Erreur inattendue de la plateforme</body></html>");
    },
    "/http-400": (req, res) => { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "bad request" })); },
    "/http-401": (req, res) => { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "unauthorized" })); },
    "/http-403": (req, res) => { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "forbidden" })); },
    "/http-404": (req, res) => { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not found" })); },
    "/http-429": (req, res) => { res.writeHead(429, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "rate limited" })); },
    "/http-500": (req, res) => { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "server error" })); },
    "/never-responds": () => {},
    "/malformed-json": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"text": "tronque'); },
    "/too-big": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "x".repeat(200) })); },
    "/missing-key": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ nope: true })); },
  });

  function providerFor(pathName, extra) {
    return { [pathName]: { endpoint: server.baseUrl + pathName, timeoutMs: 500, method: "POST", expectedContentType: "application/json", ...extra } };
  }

  {
    const mono04 = buildMono04(providerFor("/never-responds", { timeoutMs: 150 }));
    const t0 = Date.now();
    const r = await mono04.gateway.executeRequest({ requestId: "t05", provider: "/never-responds", operation: "x", payload: {} });
    const elapsed = Date.now() - t0;
    check("T04-05. timeout appliqué (jamais une attente infinie), status EXTERNAL_TIMEOUT", r.status === "FAILED" && r.technicalDiagnostics.error.code === "EXTERNAL_TIMEOUT" && elapsed < 2000, JSON.stringify({ code: r.technicalDiagnostics.error.code, elapsed }));
  }

  {
    const closedPort = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.listen(0, "127.0.0.1", () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    });
    const mono04 = buildMono04({ "closed-port": { endpoint: `http://127.0.0.1:${closedPort}/`, timeoutMs: 500, method: "POST" } });
    const r = await mono04.gateway.executeRequest({ requestId: "t06", provider: "closed-port", operation: "x", payload: {} });
    check("T04-06. échec réseau réel (port fermé) -> EXTERNAL_NETWORK_ERROR", r.status === "FAILED" && r.technicalDiagnostics.error.code === "EXTERNAL_NETWORK_ERROR", JSON.stringify(r.technicalDiagnostics.error));
  }

  {
    for (const code of [400, 401, 403, 404, 429, 500]) {
      const p = `/http-${code}`;
      const mono04 = buildMono04(providerFor(p));
      const r = await mono04.gateway.executeRequest({ requestId: "t07-" + code, provider: p, operation: "x", payload: {} });
      check(`T04-07. HTTP ${code} réel -> EXTERNAL_HTTP_ERROR, jamais un SUCCESS`, r.status === "FAILED" && r.technicalDiagnostics.error.code === "EXTERNAL_HTTP_ERROR" && r.technicalDiagnostics.httpStatus === code, JSON.stringify(r.technicalDiagnostics));
    }
  }

  {
    const mono04 = buildMono04(providerFor("/ok-html"));
    const r = await mono04.gateway.executeRequest({ requestId: "t08", provider: "/ok-html", operation: "x", payload: {} });
    check("T04-08. page HTML retournée en 200 -> INVALID_EXTERNAL_RESPONSE, jamais un SUCCESS métier ou technique", r.status === "FAILED" && r.technicalDiagnostics.error.code === "INVALID_EXTERNAL_RESPONSE", JSON.stringify(r.technicalDiagnostics.error));
  }

  {
    const mono04 = buildMono04(providerFor("/malformed-json"));
    const r = await mono04.gateway.executeRequest({ requestId: "t09", provider: "/malformed-json", operation: "x", payload: {} });
    check("T04-09. JSON tronqué/malformé -> INVALID_EXTERNAL_RESPONSE", r.status === "FAILED" && r.technicalDiagnostics.error.code === "INVALID_EXTERNAL_RESPONSE", JSON.stringify(r.technicalDiagnostics.error));
  }

  {
    const mono04 = buildMono04(providerFor("/ok-json"));
    const r = await mono04.gateway.executeRequest({ requestId: "t10", provider: "/ok-json", operation: "x", payload: { hello: "world" } });
    check("T04-10. JSON valide 200 -> SUCCESS avec le contenu exact", r.status === "SUCCESS" && r.result.text === "reponse valide", JSON.stringify(r.result));
  }

  {
    const mono04ok = buildMono04(providerFor("/ok-json", { requiredResponseKeys: ["text", "meta"] }));
    const rOk = await mono04ok.gateway.executeRequest({ requestId: "t11a", provider: "/ok-json", operation: "x", payload: {} });
    check("T04-11a. requiredResponseKeys satisfaites -> SUCCESS", rOk.status === "SUCCESS");

    const mono04missing = buildMono04(providerFor("/missing-key", { requiredResponseKeys: ["text"] }));
    const rMissing = await mono04missing.gateway.executeRequest({ requestId: "t11b", provider: "/missing-key", operation: "x", payload: {} });
    check("T04-11b. requiredResponseKeys non satisfaites -> INVALID_EXTERNAL_RESPONSE", rMissing.status === "FAILED" && rMissing.technicalDiagnostics.error.code === "INVALID_EXTERNAL_RESPONSE");

    const mono04big = buildMono04(providerFor("/too-big", { maxResponseBytes: 50 }));
    const rBig = await mono04big.gateway.executeRequest({ requestId: "t11c", provider: "/too-big", operation: "x", payload: {} });
    check("T04-11c. réponse dépassant maxResponseBytes -> INVALID_EXTERNAL_RESPONSE (garde de taille, T04-36)", rBig.status === "FAILED" && rBig.technicalDiagnostics.error.code === "INVALID_EXTERNAL_RESPONSE");
  }

  await server.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
