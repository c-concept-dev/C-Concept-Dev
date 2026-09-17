"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { createOperatorBackends } = require("./config.js");
const { createRunRegistry } = require("./run-registry.js");
const { createOperatorApi } = require("./operator-api.js");

// http-server.js — CDC MONO-05 sections 4, 18. Frontière HTTP unique entre
// le navigateur et OperatorApi. Le navigateur n'a jamais accès direct aux
// modules gelés, au backend de persistance, ou au SecretProvider — tout
// passe par cette couche, qui ne fait que router/sérialiser.
const CLIENT_DIR = path.join(__dirname, "..", "client");
const STATIC_CONTENT_TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function applySecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
}

function sendJson(res, statusCode, body) {
  applySecurityHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res, err) {
  const code = err.code || "INTERNAL_ERROR";
  const statusMap = {
    INVALID_REQUEST: 400,
    NODE_NOT_FOUND: 404,
    ARTIFACT_NOT_FOUND: 404,
    RUN_NOT_FOUND: 404,
    RESUME_NOT_ALLOWED: 409,
    RUN_LOCKED: 409,
    LINEAGE_BLOCKED: 403,
    NODE_NOT_READY: 409,
    UPSTREAM_NOT_SUCCESS: 409,
    ORCHESTRATION_BLOCKED: 409,
    MISSING_REQUIRED_INPUT: 400,
    DEPENDENCY_UNAVAILABLE: 409,
  };
  const status = statusMap[code] || 500;
  sendJson(res, status, { errorCode: code, message: err.message, details: err.details || {} });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(CLIENT_DIR, rel);
  if (!filePath.startsWith(CLIENT_DIR)) {
    applySecurityHeaders(res);
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      applySecurityHeaders(res);
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    applySecurityHeaders(res);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": STATIC_CONTENT_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function createHttpServer(options) {
  const opts = options || {};
  const { mono01, mono03, mono04 } = createOperatorBackends(opts.secrets);
  const runRegistry = createRunRegistry(mono01, mono03);
  const api = createOperatorApi({ mono01, mono03, mono04, runRegistry });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (!pathname.startsWith("/api/")) {
      serveStatic(req, res, pathname);
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        let parsedBody = {};
        if (body) {
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            return sendError(res, { code: "INVALID_REQUEST", message: "Corps JSON invalide." });
          }
        }

        const segs = pathname.split("/").filter(Boolean);
        if (segs[1] === "runs" && segs.length === 2 && req.method === "GET") {
          return sendJson(res, 200, await api.listRuns());
        }
        if (segs[1] === "runs" && segs.length === 2 && req.method === "POST") {
          return sendJson(res, 201, await api.createRun(parsedBody));
        }
        if (segs[1] === "runs" && segs.length === 3 && req.method === "GET") {
          return sendJson(res, 200, await api.getRun(segs[2]));
        }
        if (segs[1] === "runs" && segs[3] === "graph" && req.method === "GET") {
          return sendJson(res, 200, await api.getGraph(segs[2]));
        }
        if (segs[1] === "runs" && segs[3] === "nodes" && segs.length === 5 && req.method === "GET") {
          return sendJson(res, 200, await api.getNode(segs[2], segs[4]));
        }
        if (segs[1] === "runs" && segs[3] === "nodes" && segs[5] === "run" && req.method === "POST") {
          return sendJson(res, 200, await api.runNode(segs[2], segs[4]));
        }
        if (segs[1] === "runs" && segs[3] === "nodes" && segs[5] === "resume" && req.method === "POST") {
          return sendJson(res, 200, await api.resumeNode(segs[2], segs[4]));
        }
        if (segs[1] === "runs" && segs[3] === "nodes" && segs[5] === "retry" && req.method === "POST") {
          return sendJson(res, 200, await api.retryNode(segs[2], segs[4]));
        }
        if (segs[1] === "runs" && segs[3] === "artifacts" && segs.length === 4 && req.method === "GET") {
          return sendJson(res, 200, await api.listArtifacts(segs[2]));
        }
        if (segs[1] === "runs" && segs[3] === "artifacts" && segs.length === 5 && req.method === "GET") {
          return sendJson(res, 200, await api.getArtifact(segs[2], segs[4]));
        }
        if (segs[1] === "runs" && segs[3] === "dependencies" && req.method === "GET") {
          return sendJson(res, 200, await api.getDependencies(segs[2]));
        }
        if (segs[1] === "runs" && segs[3] === "lineage" && req.method === "GET") {
          return sendJson(res, 200, await api.getLineage(segs[2]));
        }
        if (segs[1] === "runs" && segs[3] === "report" && req.method === "GET") {
          return sendJson(res, 200, await api.getReport(segs[2]));
        }
        return sendError(res, { code: "NOT_FOUND", message: "Route inconnue." });
      } catch (e) {
        return sendError(res, e);
      }
    });
  });

  return { server, api, mono01, mono03, mono04, runRegistry };
}

module.exports = { createHttpServer };
