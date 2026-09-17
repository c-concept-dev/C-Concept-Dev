"use strict";

const path = require("path");
const http = require("http");
const { createHttpServer } = require("../app/server/http-server.js");

const MONO01_PATH = path.join(__dirname, "..", "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01");
const GRAPH_PATH = path.join(__dirname, "..", "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "graph", "mono-02-orchestration-graph-v1.json");
const efFx = require(path.join(MONO01_PATH, "test", "fixtures-eforch.js"));

function startTestUpstreamServer(routes) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      req.rawBody = body;
      const handler = routes[req.url] || routes["default"];
      if (!handler) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      handler(req, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

function startOperatorServer(secrets) {
  const { server, api, mono01, mono03, mono04, runRegistry } = createHttpServer({ secrets });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, api, mono01, mono03, mono04, runRegistry, port: server.address().port, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(url, { method, headers: { "Content-Type": "application/json", "Content-Length": data ? Buffer.byteLength(data) : 0 } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = b ? JSON.parse(b) : null;
        } catch (e) {
          parsed = b;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: b });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function buildRealCreateRunPayload(missionId, idSuffix) {
  const confirmed = await efFx.buildConfirmedRunContract(missionId);
  const resolverTrace = efFx.buildResolverTrace(missionId, confirmed);
  const searchProtocol = await efFx.buildSearchProtocol(missionId, idSuffix);
  return {
    missionId,
    missionQuestion: "Question de test ?",
    externalInputs: {
      runContract: confirmed,
      efOrchExecutionDependencies: {
        ef01aInjected: efFx.buildEF01AInjected(missionId),
        resolverTrace,
        searchProtocol,
        protocolHash: searchProtocol.protocolHash,
      },
    },
    efOrchConnectorProviders: { openalex: "openalex-proxy" },
  };
}

module.exports = { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload, MONO01_PATH, GRAPH_PATH };
