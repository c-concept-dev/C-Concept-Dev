"use strict";
const { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload } = require("../helpers.js");
const { createMono03 } = require("../../dependencies/MONO-04/dependencies/MONO-03/index.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const upstream = await startTestUpstreamServer({
    "/llm": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "ok" })); },
    "/openalex": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ results: [{ display_name: "S" }] })); },
  });
  const providerConfigs = {
    "clone-proxy": { endpoint: upstream.baseUrl + "/llm", timeoutMs: 3000, method: "POST" },
    "openalex-proxy": { endpoint: upstream.baseUrl + "/openalex", timeoutMs: 3000, method: "GET" },
  };

  let sharedMono03Backend;
  {
    const op1 = await startOperatorServer({ providerConfigs });
    sharedMono03Backend = op1.mono03.backend;

    const missionId = "mission-t05-restart";
    const payload = await buildRealCreateRunPayload(missionId, "t05restart");
    await httpJson("POST", op1.baseUrl + "/api/runs", { runId: "run-t05-restart", ...payload });
    await httpJson("POST", op1.baseUrl + "/api/runs/run-t05-restart/nodes/EF-ORCH-SUBSYSTEM/run");

    const beforeRestart = await httpJson("GET", op1.baseUrl + "/api/runs/run-t05-restart");
    check("T05-restart-a. avant redémarrage : run accessible, updatedAt renseigné", beforeRestart.status === 200 && !!beforeRestart.body.updatedAt);

    await op1.close();

    const mono03Reused = createMono03({ persistenceBackend: sharedMono03Backend });
    const op2 = await (async () => {
      const path = require("path");
      const cfg = require("../../app/server/config.js");
      const { createMono01 } = require(path.join(cfg.MONO01_PATH, "index.js"));
      const EFOrchDurableBackend = require(path.join(cfg.MONO01_PATH, "dependencies", "ef-orch-durable-backend-v0.1.js"));
      const { createMono04 } = require("../../dependencies/MONO-04/index.js");
      const { createStaticSecretProvider } = require("../../dependencies/MONO-04/lib/secret-provider.js");
      const { createRunRegistry } = require("../../app/server/run-registry.js");
      const { createOperatorApi } = require("../../app/server/operator-api.js");
      const http = require("http");

      const mono01 = createMono01(cfg.REGISTRY_PATH, { efOrchDurableBackend: EFOrchDurableBackend.createInMemoryAsyncBackend() });
      const mono04 = createMono04({ providerConfigs, secretProvider: createStaticSecretProvider({}) });
      const runRegistry = createRunRegistry(mono01, mono03Reused);
      const api = createOperatorApi({ mono01, mono03: mono03Reused, mono04, runRegistry });
      const server = http.createServer(async (req, res) => {
        const url = new (require("url").URL)(req.url, "http://localhost");
        if (url.pathname === "/api/runs/run-t05-restart") {
          const body = await api.getRun("run-t05-restart").catch((e) => ({ __error: e.message }));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        } else res.writeHead(404).end();
      });
      return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
    })();

    const afterRestart = await httpJson("GET", op2.baseUrl + "/api/runs/run-t05-restart");
    check(
      "T05-restart-b. après 'redémarrage' (nouvelle instance serveur complète, même backend MONO-03) -> RunState RETROUVÉ",
      afterRestart.status === 200 && afterRestart.body.missionId === missionId && afterRestart.body.updatedAt === beforeRestart.body.updatedAt,
      JSON.stringify({ before: beforeRestart.body, after: afterRestart.body })
    );
    await op2.close();
  }

  {
    let openalexCallCount = 0;
    const upstream2 = await startTestUpstreamServer({
      "/llm": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "ok" })); },
      "/openalex": (req, res) => { openalexCallCount++; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ results: [{ display_name: "S" }] })); },
    });
    const op = await startOperatorServer({
      providerConfigs: {
        "clone-proxy": { endpoint: upstream2.baseUrl + "/llm", timeoutMs: 3000, method: "POST" },
        "openalex-proxy": { endpoint: upstream2.baseUrl + "/openalex", timeoutMs: 3000, method: "GET" },
      },
    });
    const missionId = "mission-t05-dup";
    const payload = await buildRealCreateRunPayload(missionId, "t05dup");
    await httpJson("POST", op.baseUrl + "/api/runs", { runId: "run-t05-dup", ...payload });

    const [r1, r2] = await Promise.all([
      httpJson("POST", op.baseUrl + "/api/runs/run-t05-dup/nodes/EF-ORCH-SUBSYSTEM/run"),
      httpJson("POST", op.baseUrl + "/api/runs/run-t05-dup/nodes/EF-ORCH-SUBSYSTEM/run"),
    ]);
    const succeededCount = [r1.status, r2.status].filter((s) => s === 200).length;
    const oneSucceededOneRejected = succeededCount === 1;
    const bothSucceeded = succeededCount === 2;
    check(
      "T05-39. deux requêtes CONCURRENTES sur le même nœud READY -> jamais deux exécutions logiques distinctes (au niveau HTTP)",
      oneSucceededOneRejected || bothSucceeded,
      JSON.stringify({ r1: r1.status, r1body: r1.body, r2: r2.status, r2body: r2.body })
    );
    if (oneSucceededOneRejected) {
      const rejected = r1.status !== 200 ? r1 : r2;
      check("T05-39b. la requête rejetée porte un code d'erreur explicite de concurrence, jamais un succès silencieux masquant le conflit", rejected.body && ["NODE_NOT_READY", "ORCHESTRATION_BLOCKED"].includes(rejected.body.errorCode), JSON.stringify(rejected.body));
    }
    // PREUVE DE FOND (au-delà du seul code HTTP) : même si les DEUX réponses
    // HTTP sont 200 (l'une ayant pu observer un état déjà avancé plutôt que
    // de relancer l'exécution), le VRAI travail (appel réseau OpenAlex) ne
    // doit avoir été effectué QU'UNE SEULE FOIS — sinon deux exécutions
    // logiques ont réellement eu lieu, quel que soit ce que le code HTTP
    // suggère.
    check("T05-39c. PREUVE DE FOND : un seul appel réseau OpenAlex réel a été observé côté serveur upstream, quel que soit le nombre de réponses HTTP 200 côté client (jamais une double exécution masquée)", openalexCallCount === 1, JSON.stringify({ openalexCallCount }));
    await op.close();
    await upstream2.close();
  }

  await upstream.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
