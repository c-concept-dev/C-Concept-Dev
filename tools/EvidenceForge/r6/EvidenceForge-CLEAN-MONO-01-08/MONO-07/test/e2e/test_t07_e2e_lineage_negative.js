"use strict";
// test/e2e/test_t07_e2e_lineage_negative.js — T07-33/34 (lineage FAIL / STALE)

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

  {
    const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(server.baseUrl);
    const env = buildEnv(kitRoot, "/tmp/t07-lineage-fail-" + Date.now(), { providerConfigs, secrets: {} });
    const runId = "t07-lineage-fail-" + Date.now().toString(36);
    await createRealE2ERun(env, { runId });
    await driveRun(env.operatorApi, runId, { maxIterations: 20, stopBeforeNode: "EF-04-LINEAGE" });

    const graphBefore = await env.operatorApi.getGraph(runId);
    check("T07-33a. 12/14 nœuds SUCCESS avant corruption (précondition)", graphBefore.nodes.filter((n) => n.state === "SUCCESS").length === 12);

    const engine = env.runRegistry.engines.get(runId);
    engine.context.nodeOutputs["TARGET_DOCUMENT_SET"] = { schema: "EvidenceForge.TargetDocumentSet", schemaVersion: "EF-03-v1", missionId: fx.MISSION_ID, documents: [] };

    const r = await env.operatorApi.runNode(runId, "EF-04-LINEAGE");
    check("T07-33b. EF-04-LINEAGE FAILED (lignée rompue détectée réellement par assertLineage)", r.state === "FAILED", JSON.stringify(r.lastError));

    const state = await env.mono03.runStore.loadRun(runId);
    check("T07-33c. lineageStatus synchronisé à FAIL (jamais laissé null, jamais un faux PASS)", state.lineageStatus && state.lineageStatus.status === "FAIL", JSON.stringify(state.lineageStatus));

    const nodeEF04A = await env.operatorApi.getNode(runId, "EF-04A");
    check("T07-33d. EF-04A non produit / non accessible (reste non-READY)", nodeEF04A.state !== "READY" && nodeEF04A.state !== "SUCCESS", nodeEF04A.state);

    let blocked = null;
    try { await env.operatorApi.getReport(runId); } catch (e) { blocked = e.code; }
    check("T07-33e. getReport() = LINEAGE_BLOCKED", blocked === "LINEAGE_BLOCKED", blocked);

    await server.close();
  }

  {
    const server = await startSyntheticExternalServer({ workerResponder: fx.combinedWorkerResponder, openAlexResponder: fx.openAlexResponder });
    const providerConfigs = buildProviderConfigs(server.baseUrl);

    const envA = buildEnv(kitRoot, "/tmp/t07-stale-a-" + Date.now(), { providerConfigs, secrets: {} });
    const runIdA = "t07-stale-a-" + Date.now().toString(36);
    await createRealE2ERun(envA, { runId: runIdA });
    await driveRun(envA.operatorApi, runIdA, { maxIterations: 20 });
    const stateA = await envA.mono03.runStore.loadRun(runIdA);
    check("T07-34a. run A complet (14/14) — précondition", (await envA.operatorApi.getGraph(runIdA)).nodes.every((n) => n.state === "SUCCESS"));

    const envB = buildEnv(kitRoot, "/tmp/t07-stale-b-" + Date.now(), { providerConfigs, secrets: {} });
    const runIdB = "t07-stale-b-" + Date.now().toString(36);
    await createRealE2ERun(envB, { runId: runIdB });
    await driveRun(envB.operatorApi, runIdB, { maxIterations: 20 });
    check("T07-34b. run B complet (14/14), lineage réellement PASS avant corruption — précondition", (await envB.operatorApi.getLineage(runIdB)).status === "PASS");
    const reportBeforeStale = await envB.operatorApi.getReport(runIdB);
    check("T07-34c. getReport(B) accessible AVANT la simulation de staleness", reportBeforeStale.schema === "EvidenceForge.UnifiedReportSummary");

    await envB.mono03.coordinator.recordLineagePass(runIdB, { reviewSchemaHash: "perime", lineageAssurance: {} }, { "EF-03A": stateA.artifactRefs["EF-03A"] });

    const stillValid = await envB.mono03.coordinator.isLineageStillValid(runIdB);
    check("T07-34d. isLineageStillValid(B) = false après un PASS référençant un artefact d'un autre run", stillValid === false);

    const lineageB = await envB.operatorApi.getLineage(runIdB);
    check("T07-34e. getLineage(B).status = STALE (jamais présenté comme un PASS courant)", lineageB.status === "STALE", JSON.stringify(lineageB));

    let blockedB = null;
    try { await envB.operatorApi.getReport(runIdB); } catch (e) { blockedB = e.code; }
    check("T07-34f. getReport(B) = LINEAGE_BLOCKED après la staleness (jamais accepté silencieusement)", blockedB === "LINEAGE_BLOCKED", blockedB);

    await server.close();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
