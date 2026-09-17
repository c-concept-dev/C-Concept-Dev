"use strict";
const { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload, GRAPH_PATH } = require("../helpers.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  let openalexCalls = 0;
  const upstream = await startTestUpstreamServer({
    "/llm": (req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: "reponse llm" })); },
    "/openalex": (req, res) => { openalexCalls++; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ results: [{ display_name: "Source via test" }] })); },
  });

  const op = await startOperatorServer({
    providerConfigs: {
      "clone-proxy": { endpoint: upstream.baseUrl + "/llm", timeoutMs: 3000, method: "POST" },
      "openalex-proxy": { endpoint: upstream.baseUrl + "/openalex", timeoutMs: 3000, method: "GET" },
    },
  });

  {
    const home = await httpJson("GET", op.baseUrl + "/");
    const appjs = await httpJson("GET", op.baseUrl + "/app.js");
    check("T05-01. le serveur répond sur / et /app.js (200)", home.status === 200 && appjs.status === 200, JSON.stringify({ home: home.status, appjs: appjs.status }));
    check("T05-01b. les en-têtes de sécurité sont présents sur la page HTML", !!home.headers["content-security-policy"] && home.headers["x-content-type-options"] === "nosniff" && !!home.headers["referrer-policy"], JSON.stringify(home.headers));
  }

  {
    const r = await httpJson("GET", op.baseUrl + "/api/runs");
    check("T05-02. GET /api/runs -> 200, liste vide au départ", r.status === 200 && Array.isArray(r.body) && r.body.length === 0, JSON.stringify(r.body));
  }

  const missionId = "mission-t05-integration";
  const payload = await buildRealCreateRunPayload(missionId, "t05int");
  let created;
  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs", { runId: "run-t05-int", ...payload });
    created = r.body;
    check("T05-03. POST /api/runs avec un RunContract réel et valide -> 201, RunState créé", r.status === 201 && created.runId === "run-t05-int", JSON.stringify({ status: r.status, body: r.body }));
  }
  {
    const r = await httpJson("POST", op.baseUrl + "/api/runs", { runId: "run-t05-invalid", missionId: "x", externalInputs: { runContract: { schema: "PasLeBonSchema" } } });
    check("T05-03b. POST /api/runs avec un RunContract invalide -> 400 INVALID_REQUEST", r.status === 400 && r.body.errorCode === "INVALID_REQUEST", JSON.stringify(r.body));
  }

  {
    const r = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int");
    check("T05-04. GET /api/runs/:runId -> 200, détail cohérent", r.status === 200 && r.body.missionId === missionId, JSON.stringify(r.body));
  }

  {
    const realGraph = require(GRAPH_PATH);
    const r = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/graph");
    const ids = r.body.nodes.map((n) => n.nodeId);
    check("T05-05. GET .../graph renvoie EXACTEMENT les IDs du vrai graphe MONO-02", JSON.stringify(ids) === JSON.stringify(realGraph.nodes.map((n) => n.nodeId)), JSON.stringify(ids));
    check("T05-06. tous les nœuds démarrent dans un état parmi les 7 valides", r.body.nodes.every((n) => ["NOT_STARTED", "READY", "RUNNING", "SUCCESS", "FAILED", "BLOCKED", "PAUSED"].includes(n.state)));
  }

  {
    const nodeBefore = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/nodes/EF-ORCH-SUBSYSTEM");
    check("T05-07. EF-ORCH-SUBSYSTEM démarre READY", nodeBefore.body.state === "READY", nodeBefore.body.state);

    const runResult = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-int/nodes/EF-ORCH-SUBSYSTEM/run");
    check("T05-09. runNode() progresse réellement (vrais appels réseau OpenAlex observés)", runResult.status === 200 && openalexCalls > 0, JSON.stringify({ status: runResult.status, openalexCalls }));

    const blockedAttempt = await httpJson("POST", op.baseUrl + "/api/runs/run-t05-int/nodes/EF-03D/run");
    check("T05-08. un nœud non-READY refuse runNode() côté serveur (409), même via un appel HTTP direct", blockedAttempt.status === 409, JSON.stringify(blockedAttempt.body));
  }

  {
    const r = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/dependencies");
    check("T05-16. GET .../dependencies expose provider/dependencyType/configured/available, jamais un secret", r.status === 200 && r.body.every((d) => "provider" in d && "dependencyType" in d && "configured" in d && "available" in d) && !JSON.stringify(r.body).match(/sk-|Bearer/i), JSON.stringify(r.body));
  }

  {
    const r = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/nodes/EF-ORCH-SUBSYSTEM");
    const serialized = JSON.stringify(r.body);
    check("T05-14. le détail du nœud EF-ORCH-SUBSYSTEM est exposé (state/attemptCount/lastError)", "state" in r.body && "attemptCount" in r.body);
    check("T05-15. AUCUN champ ne référence les structures internes des checkpoints EF-ORCH", !/runOutputs|checkpointIdentities|stateMachineSnapshots/.test(serialized), serialized.slice(0, 200));
  }

  {
    const arts = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/artifacts");
    check("T05-21a. GET .../artifacts fonctionne (lecture)", arts.status === 200 && Array.isArray(arts.body));
    if (arts.body.length > 0) {
      const artifactId = arts.body[0].artifactId;
      const putAttempt = await httpJson("PUT", op.baseUrl + "/api/runs/run-t05-int/artifacts/" + artifactId, { payload: { tampered: true } });
      check("T05-21b. un PUT arbitraire sur un artefact est refusé (aucune route d'édition n'existe)", putAttempt.status === 404 || putAttempt.status === 405, JSON.stringify(putAttempt.status));
    } else {
      check("T05-21b. (ignoré, aucun artefact produit à ce stade)", true);
    }
  }

  {
    const lineage = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/lineage");
    check("T05-22a. lineage NOT_RUN au départ", lineage.body.status === "NOT_RUN", JSON.stringify(lineage.body));
    const reportAttempt = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-int/report");
    check("T05-22b. GET .../report refusé par le SERVEUR (403 LINEAGE_BLOCKED) tant que lineage != PASS", reportAttempt.status === 403 && reportAttempt.body.errorCode === "LINEAGE_BLOCKED", JSON.stringify(reportAttempt.body));
  }

  {
    const bogus = await httpJson("GET", op.baseUrl + "/api/runs/run-inexistant");
    check("T05-12/34. une erreur conserve un errorCode ET un message lisible distincts", bogus.status === 404 && bogus.body.errorCode === "RUN_NOT_FOUND" && typeof bogus.body.message === "string" && bogus.body.message.length > 0, JSON.stringify(bogus.body));
  }

  await op.close();
  await upstream.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
