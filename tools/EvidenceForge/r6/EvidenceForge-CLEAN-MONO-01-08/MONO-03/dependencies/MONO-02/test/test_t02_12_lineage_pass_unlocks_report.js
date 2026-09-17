"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, seedRealisticChain } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const missionId = "mission-t0212";
  const missionQuestion = "Question de test MONO-02 ?";
  const mono01 = buildMono01();
  const ctx = await buildFullContext(missionId);
  const engine = createOrchestrationEngine(GRAPH_PATH, mono01, ctx);

  await seedRealisticChain(engine, missionId, missionQuestion);

  engine.computeReadyNodes();
  check("1. EF-04A n'est pas READY avant qu'EF-04-LINEAGE ait tourné", engine.getNodeState("EF-04A") !== "READY");

  const lineageRun = await engine.runNode("EF-04-LINEAGE");
  check("2. EF-04-LINEAGE SUCCESS avec la chaîne intacte", lineageRun.ok === true && engine.getNodeState("EF-04-LINEAGE") === "SUCCESS", JSON.stringify(lineageRun.result && lineageRun.result.diagnostics));
  check("2b. le résultat de lignée porte ok:true et les limitations gelées visibles (jamais masquées)", lineageRun.result.output.ok === true && lineageRun.result.output.lineageAssurance.targetDocumentsHashBoundFromEF03 === false);

  engine.computeReadyNodes();
  check("3. EF-04A devient READY dès qu'EF-04-LINEAGE est SUCCESS", engine.getNodeState("EF-04A") === "READY");

  const reportRun = await engine.runNode("EF-04A");
  check("4. EF-04A SUCCESS — un vrai UnifiedReportSummary est produit", reportRun.ok === true && reportRun.result.output.schema === "EvidenceForge.UnifiedReportSummary" && reportRun.result.output.schemaVersion === "EF-04A-v1", JSON.stringify(reportRun.result && reportRun.result.diagnostics));
  check("5. le rapport porte bien le missionId attendu", reportRun.result.output.mission.missionId === missionId);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
