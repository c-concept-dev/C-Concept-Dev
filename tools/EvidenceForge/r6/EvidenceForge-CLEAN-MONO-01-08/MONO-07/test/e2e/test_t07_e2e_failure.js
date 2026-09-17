"use strict";
// test/e2e/test_t07_e2e_failure.js — T07-25/26/27

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);

  {
    const env = buildEnv(kitRoot, "/tmp/t07-timeout-work-" + Date.now(), { providerConfigs, secrets: {} });
    const start = Date.now();
    let timedOut = false;
    let observedCode = null;
    try {
      const result = await env.mono04.gateway.executeRequest({
        requestId: "timeout-probe-001", runId: "r", nodeId: "n", moduleId: "m",
        dependencyType: "worker", provider: "worker-timeout", operation: "call",
        payload: {}, timeoutPolicy: {}, retryPolicy: { maxAttempts: 1, backoffMs: 0 }
      });
      observedCode = result.technicalDiagnostics && result.technicalDiagnostics.error && result.technicalDiagnostics.error.code;
      timedOut = result.status === "FAILED" && observedCode === "EXTERNAL_TIMEOUT";
    } catch (e) {
      observedCode = e.code;
      timedOut = e.code === "EXTERNAL_TIMEOUT" || /timeout/i.test(e.message);
    }
    const elapsed = Date.now() - start;
    check("T07-27a. un vrai timeout MONO-04 se déclenche réellement (route qui ne répond jamais, jamais un throw simulé) — résultat structuré status=FAILED, code=EXTERNAL_TIMEOUT", timedOut, `code=${observedCode}, elapsed=${elapsed}ms`);
    check("T07-27b. le timeout se déclenche dans le délai configuré, jamais un blocage indéfini", elapsed < 5000, `elapsed=${elapsed}ms`);
  }

  {
    const env = buildEnv(kitRoot, "/tmp/t07-failure-work-" + Date.now(), { providerConfigs, secrets: {} });
    const runId = "t07-failure-" + Date.now().toString(36);
    await createRealE2ERun(env, { runId, openAlexProviderId: "openalex-success" });

    await driveRun(env.operatorApi, runId, { maxIterations: 20, stopBeforeNode: "EF-02B" });
    const engine = env.runRegistry.engines.get(runId);
    const originalVerify = engine.context.adapter.verifyProfessionals;
    engine.context.adapter.verifyProfessionals = async () => {
      throw new Error("EF-02B échec technique synthétique (provider indisponible) — scénario de test délibéré.");
    };

    const r = await env.operatorApi.runNode(runId, "EF-02B");
    check("T07-25a. EF-02B FAILED (échec technique réel, adapter défaillant)", r.state === "FAILED", JSON.stringify(r.lastError));

    const graphAfterFail = await env.operatorApi.getGraph(runId);
    const downstream = ["EF-02C", "EF-02D", "EF-02E", "EF-03A", "EF-03B", "EF-03C", "EF-03D", "EF-04-LINEAGE", "EF-04A"];
    check("T07-25b. tous les nœuds downstream restent BLOCKED/NOT_STARTED (jamais exécutés)", downstream.every((id) => graphAfterFail.nodes.find((n) => n.nodeId === id).state !== "SUCCESS"));

    let reportBlocked = null;
    try { await env.operatorApi.getReport(runId); } catch (e) { reportBlocked = e.code; }
    check("T07-25c. aucun rapport final accessible tant que le nœud échoué bloque la chaîne", reportBlocked === "ARTIFACT_NOT_FOUND" || reportBlocked === "LINEAGE_BLOCKED", reportBlocked);

    check("T07-25d. diagnostic technique conservé (lastError explicite, jamais silencieux)", !!r.lastError && !!r.lastError.message);

    engine.context.adapter.verifyProfessionals = originalVerify;
    const retryResult = await env.operatorApi.retryNode(runId, "EF-02B");
    check("T07-26a. après restauration du provider nominal, retryNode() réussit réellement", retryResult.state === "SUCCESS", JSON.stringify(retryResult));

    await driveRun(env.operatorApi, runId, { maxIterations: 20 });
    const graphEnd = await env.operatorApi.getGraph(runId);
    check("T07-26b. progression complète après recovery : 14/14 SUCCESS", graphEnd.nodes.every((n) => n.state === "SUCCESS"));

    const artifacts = await env.operatorApi.listArtifacts(runId);
    const ef02bArtifacts = artifacts.filter((a) => a.nodeId === "EF-02B");
    check("T07-26c. aucune duplication d'artefact après retry (exactement 1 ArtifactRecord pour EF-02B)", ef02bArtifacts.length === 1);
  }

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
