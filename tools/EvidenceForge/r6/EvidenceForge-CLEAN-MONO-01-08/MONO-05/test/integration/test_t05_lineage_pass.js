"use strict";
const { startTestUpstreamServer, startOperatorServer, httpJson, buildRealCreateRunPayload } = require("../helpers.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const upstream = await startTestUpstreamServer({});
  const op = await startOperatorServer({ providerConfigs: {} });

  const missionId = "mission-t05-lineage-pass";
  const payload = await buildRealCreateRunPayload(missionId, "t05lineagepass");
  await httpJson("POST", op.baseUrl + "/api/runs", { runId: "run-t05-lineage-pass", ...payload });

  const reportPayload = {
    schema: "EvidenceForge.UnifiedReportSummary",
    schemaVersion: "EF-04A-v1",
    missionId,
    assuranceLevel: "reference_revalidated_not_source_hash_bound",
    targetDocumentsHashBoundFromEF03: false,
    documentaryTwinsHashBoundFromEF03: false,
  };
  await op.mono03.runStore.recordNodeSuccess({ runId: "run-t05-lineage-pass", nodeId: "EF-04A", contract: reportPayload.schema, schemaVersion: reportPayload.schemaVersion, missionId, payload: reportPayload });
  await op.mono03.coordinator.recordLineagePass("run-t05-lineage-pass", { reviewSchemaHash: "h", lineageAssurance: {} }, {});

  {
    const lineage = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-lineage-pass/lineage");
    check("T05-23a. lineage réellement PASS (via MONO-03.coordinator, jamais un contournement de l'API elle-même)", lineage.body.status === "PASS", JSON.stringify(lineage.body));

    const report = await httpJson("GET", op.baseUrl + "/api/runs/run-t05-lineage-pass/report");
    check("T05-23b. GET .../report devient accessible (200) une fois lineage PASS", report.status === 200, JSON.stringify(report.body));
    check("T05-24. le rapport expose explicitement sa limite d'assurance, jamais masquée", report.body.assuranceLevel === "reference_revalidated_not_source_hash_bound" && report.body.targetDocumentsHashBoundFromEF03 === false && report.body.documentaryTwinsHashBoundFromEF03 === false, JSON.stringify(report.body));
  }

  await op.close();
  await upstream.close();

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
