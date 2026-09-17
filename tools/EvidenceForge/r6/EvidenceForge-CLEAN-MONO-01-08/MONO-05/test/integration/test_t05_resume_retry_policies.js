"use strict";
const { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload } = require("../helpers.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const upstream = await startTestUpstreamServer({
    "/llm": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "ok" })); },
    "/openalex": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ results: [{ display_name: "S" }] })); },
  });
  const op = await startOperatorServer({
    providerConfigs: {
      "clone-proxy": { endpoint: upstream.baseUrl + "/llm", timeoutMs: 3000, method: "POST" },
      "openalex-proxy": { endpoint: upstream.baseUrl + "/openalex", timeoutMs: 3000, method: "GET" },
    },
  });

  const missionId = "mission-t05-resume";
  const payload = await buildRealCreateRunPayload(missionId, "t05resume");
  await httpJson("POST", op.baseUrl + "/api/runs", { runId: "run-t05-resume", ...payload });
  await httpJson("POST", op.baseUrl + "/api/runs/run-t05-resume/nodes/EF-ORCH-SUBSYSTEM/run");

  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-resume/nodes/EF-ORCH-SUBSYSTEM/resume");
    check("T05-13a. resumeNode() sur un nœud BLOCKED (pas PAUSED/FAILED) est refusé explicitement (RESUME_NOT_ALLOWED)", r.status === 409 && r.body.errorCode === "RESUME_NOT_ALLOWED", JSON.stringify(r.body));
  }

  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-resume/nodes/EF-04-LINEAGE/retry");
    check("T05-resume-b. retryNode() sur EF-04-LINEAGE (retryPolicy=NO_RETRY) est TOUJOURS refusé", r.status === 409 && r.body.errorCode === "RESUME_NOT_ALLOWED", JSON.stringify(r.body));
  }

  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-resume/nodes/EF-02E/retry");
    check("T05-resume-c. retryNode() sur EF-02E (retryPolicy=EXPLICIT_REBUILD_REQUIRED) est refusé", r.status === 409 && r.body.errorCode === "RESUME_NOT_ALLOWED", JSON.stringify(r.body));
  }

  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-resume/nodes/NOEUD-INEXISTANT/retry");
    check("T05-node-not-found. action sur un nodeId inconnu -> 404 NODE_NOT_FOUND explicite", r.status === 404 && r.body.errorCode === "NODE_NOT_FOUND", JSON.stringify(r.body));
  }

  await op.close();
  await upstream.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
