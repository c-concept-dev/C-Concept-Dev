"use strict";
// test/e2e/test_t07_e2e_secrets.js — T07-31/32

const path = require("path");
const http = require("http");
const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const SECRET_NAME = "SYNTHETIC_MONO07_SECRET_NAME";
const SECRET_VALUE = "SYNTHETIC_MONO07_SECRET_VALUE_9f8e7d6c5b4a";

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();

  let receivedAuthHeader = null;
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);
  const env = buildEnv(kitRoot, "/tmp/t07-secrets-work-" + Date.now(), { providerConfigs, secrets: { [SECRET_NAME]: SECRET_VALUE } });

  const capturingServer = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        receivedAuthHeader = req.headers["authorization"] || null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: "{}" }));
      });
    });
    s.listen(0, "127.0.0.1", () => resolve({ port: s.address().port, close: () => new Promise((r) => s.close(r)) }));
  });
  const secretProvider = env.mono04.secretProvider;
  const providerRegistryWithSecret = { ...providerConfigs, "capture-secret": { endpoint: `http://127.0.0.1:${capturingServer.port}`, timeoutMs: 3000, method: "POST", requiredSecret: SECRET_NAME } };
  const { createMono04 } = require(path.join(env.cfg.MONO04_PATH, "index.js"));
  const mono04Probe = createMono04({ providerConfigs: providerRegistryWithSecret, secretProvider });
  const workerCallFnProbe = mono04Probe.createGatewayWorkerCallFn({ provider: "capture-secret", requestId: "secret-probe", responseTextField: "text" });
  await workerCallFnProbe("sonde");
  check("T07-31a. le VRAI SecretProvider (mono04.createStaticSecretProvider) résout bien le secret configuré", secretProvider.hasSecret(SECRET_NAME));
  check("T07-31b. le Gateway MONO-04 réel envoie bien le secret en Authorization: Bearer <secret> (preuve d'usage réel, pas seulement de configuration)", receivedAuthHeader === `Bearer ${SECRET_VALUE}`, receivedAuthHeader);
  await capturingServer.close();

  const runId = "t07-secrets-" + Date.now().toString(36);
  await createRealE2ERun(env, { runId, workerProviderId: "worker-with-secret" });
  await driveRun(env.operatorApi, runId, { maxIterations: 20 });

  const state = await env.mono03.runStore.loadRun(runId);
  const runStateJson = JSON.stringify(state);
  check("T07-31c. le secret n'apparaît jamais dans RunState (NodeStateRecord inclus)", !runStateJson.includes(SECRET_VALUE), "recherché dans " + runStateJson.length + " caractères");

  const artifacts = await env.operatorApi.listArtifacts(runId);
  let artifactsLeak = false;
  for (const a of artifacts) {
    const payload = await env.operatorApi.getArtifact(runId, a.artifactId);
    if (JSON.stringify(payload).includes(SECRET_VALUE)) artifactsLeak = true;
  }
  check("T07-32a. le secret n'apparaît dans aucun ArtifactRecord (14 artefacts inspectés)", !artifactsLeak);

  const report = await env.operatorApi.getReport(runId);
  check("T07-32b. le secret n'apparaît jamais dans le rapport final (UnifiedReportSummary)", !JSON.stringify(report).includes(SECRET_VALUE));

  const lineage = await env.operatorApi.getLineage(runId);
  check("T07-32c. le secret n'apparaît jamais dans la réponse getLineage()", !JSON.stringify(lineage).includes(SECRET_VALUE));

  const graph = await env.operatorApi.getGraph(runId);
  check("T07-32d. le secret n'apparaît jamais dans la réponse getGraph() (toutes les réponses OperatorApi inspectées)", !JSON.stringify(graph).includes(SECRET_VALUE));

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
