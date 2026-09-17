"use strict";

const http = require("http");
const path = require("path");
const { createMono04 } = require("../index.js");
const { createStaticSecretProvider } = require("../lib/secret-provider.js");

const MONO01_PATH = path.join(__dirname, "..", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01");

// startTestServer(routes) -> { port, close } — vrai serveur HTTP local
// (section 20), jamais un mock de fonction. `routes` est une map
// path -> (req, res) => void.
function startTestServer(routes) {
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
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function buildMono04(providerConfigs, secretOverrides) {
  return createMono04({
    providerConfigs,
    secretProvider: createStaticSecretProvider(secretOverrides || { TEST_WORKER_SECRET: "synthetic-test-secret-never-real" }),
  });
}

module.exports = { startTestServer, buildMono04, MONO01_PATH };
