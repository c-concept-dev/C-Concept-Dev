"use strict";
// test/e2e/test_t07_e2e_resume.js — T07-E2E-RESUME (T07-23/24)

const { buildEnv } = require("../../lib/harness-env");
const { buildProviderConfigs } = require("../../lib/provider-configs");
const { startSyntheticExternalServer } = require("../../lib/synthetic-external-server");
const fx = require("../../lib/synthetic-fixtures");
const { createRealE2ERun, driveRun, rehydrateForNewProcess } = require("../../lib/e2e-driver");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { resolveKitRoot } = require("../../lib/kit-root");
  const kitRoot = resolveKitRoot();
  const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
  const providerConfigs = buildProviderConfigs(server.baseUrl);

  const envA = buildEnv(kitRoot, "/tmp/t07-resume-work-" + Date.now(), { providerConfigs, secrets: {} });
  const runId = "t07-resume-" + Date.now().toString(36);
  await createRealE2ERun(envA, { runId });
  await driveRun(envA.operatorApi, runId, { maxIterations: 20, stopBeforeNode: "EF-03A" });
  const graphMid = await envA.operatorApi.getGraph(runId);
  const successCountMid = graphMid.nodes.filter((n) => n.state === "SUCCESS").length;
  check("T07-23a. instance A progresse réellement jusqu'à l'interruption simulée (8/14 SUCCESS attendu)", successCountMid === 8, `${successCountMid}/14`);

  const runRegistryB = require(envA.mono05Root + "/app/server/run-registry.js").createRunRegistry(envA.mono01, envA.mono03);
  const operatorApiB = require(envA.mono05Root + "/app/server/operator-api.js").createOperatorApi({ mono01: envA.mono01, mono03: envA.mono03, mono04: envA.mono04, runRegistry: runRegistryB });
  const envB = { ...envA, runRegistry: runRegistryB, operatorApi: operatorApiB };
  check("T07-24a. instance B utilise une NOUVELLE Map d'engines (jamais celle de A)", runRegistryB.engines !== envA.runRegistry.engines && runRegistryB.engines.size === 0);

  await rehydrateForNewProcess(envB, runId);
  const graphAfterRehydrate = await operatorApiB.getGraph(runId);
  check("T07-24b. réhydratation correcte : les 8 nœuds déjà SUCCESS sont retrouvés SUCCESS dans le nouveau moteur (REG-02)", graphAfterRehydrate.nodes.filter((n) => n.state === "SUCCESS").length === 8);

  const { trace } = await driveRun(operatorApiB, runId, { maxIterations: 20 });
  check("T07-23b. la reprise progresse réellement (nouveaux nœuds exécutés depuis l'instance B)", trace.length === 6, `trace.length=${trace.length}`);

  const graphEnd = await operatorApiB.getGraph(runId);
  check("T07-23c. reprise complète : 14/14 SUCCESS après reprise depuis l'instance B", graphEnd.nodes.every((n) => n.state === "SUCCESS"));

  const report = await operatorApiB.getReport(runId);
  check("T07-23d. rapport final accessible après reprise, identique fonctionnellement à un run direct (schéma correct)", report.schema === "EvidenceForge.UnifiedReportSummary");

  await server.close();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
