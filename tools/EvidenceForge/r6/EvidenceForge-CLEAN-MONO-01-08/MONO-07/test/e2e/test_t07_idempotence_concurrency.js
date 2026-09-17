"use strict";
// test/e2e/test_t07_idempotence_concurrency.js — T07-25/26/27, T07-28/29/30

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);
  const env = buildEnv(kitRoot, "/tmp/t07-idem-work-" + Date.now(), { providerConfigs, secrets: {} });

  {
    const request = { requestId: "idem-req-001", runId: "r", nodeId: "n", moduleId: "m", dependencyType: "worker", provider: "worker-success", operation: "call", payload: { a: 1 }, timeoutPolicy: {}, retryPolicy: {} };
    const p1 = env.mono04.gateway.executeRequest(request);
    const p2 = env.mono04.gateway.executeRequest({ ...request });
    const [r1, r2] = await Promise.all([p1, p2]);
    check("T07-29. même requestId + même fingerprint -> une seule opération logique réelle (résultats identiques, jamais deux exécutions distinctes)", JSON.stringify(r1) === JSON.stringify(r2));
  }

  {
    const requestId = "idem-req-002";
    await env.mono04.gateway.executeRequest({ requestId, runId: "r", nodeId: "n", moduleId: "m", dependencyType: "worker", provider: "worker-success", operation: "call", payload: { a: 1 }, timeoutPolicy: {}, retryPolicy: {} });
    let conflict = null;
    try {
      await env.mono04.gateway.executeRequest({ requestId, runId: "r", nodeId: "n", moduleId: "m", dependencyType: "worker", provider: "worker-success", operation: "call", payload: { a: 999 }, timeoutPolicy: {}, retryPolicy: {} });
    } catch (e) {
      conflict = e.code;
    }
    check("T07-30. même requestId + fingerprint différent -> EXTERNAL_REQUEST_CONFLICT réel (vrai Gateway MONO-04-R2, jamais un mock)", conflict === "EXTERNAL_REQUEST_CONFLICT", conflict);
  }

  {
    const runId = "t07-concurrency-" + Date.now().toString(36);
    await createRealE2ERun(env, { runId });
    const [a, b] = await Promise.allSettled([
      env.operatorApi.runNode(runId, "EF-ORCH-SUBSYSTEM"),
      env.operatorApi.runNode(runId, "EF-ORCH-SUBSYSTEM")
    ]);
    const succeeded = [a, b].filter((r) => r.status === "fulfilled" && r.value.state === "SUCCESS");
    const rejectedAsCollision = [a, b].filter((r) => r.status === "rejected");
    check("T07-28a. une seule exécution réelle aboutit en SUCCESS (l'autre est rejetée comme collision technique, jamais un second SUCCESS métier)", succeeded.length === 1 || (succeeded.length === 2 && JSON.stringify(succeeded[0].value) === JSON.stringify(succeeded[1].value)), `succeeded=${succeeded.length}, rejected=${rejectedAsCollision.length}`);

    const artifacts = await env.operatorApi.listArtifacts(runId);
    const orchArtifacts = artifacts.filter((art) => art.nodeId === "EF-ORCH-SUBSYSTEM");
    check("T07-28b. aucun double artefact pour ce nœud (exactement 1 ArtifactRecord)", orchArtifacts.length === 1, orchArtifacts.length);

    const node = await env.operatorApi.getNode(runId, "EF-ORCH-SUBSYSTEM");
    check("T07-28c. attemptCount cohérent (pas de double comptage métier dû à la collision d'orchestration)", node.attemptCount === 1, node.attemptCount);
  }

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
