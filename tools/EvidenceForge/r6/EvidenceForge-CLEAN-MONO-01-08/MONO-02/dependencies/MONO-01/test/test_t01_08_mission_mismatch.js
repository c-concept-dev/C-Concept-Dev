"use strict";
const { createMono01, REGISTRY_PATH, twin, twinSetOf } = require("./fixtures.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const { buildReviewTargets } = require("../dependencies/ef-03a-review-schema-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);

  // Deux entrées avec des missionId différents : le DocumentaryTwinSet porte
  // "mission-A", et l'appelant déclare explicitement "mission-B".
  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId: "mission-A",
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const t1 = twin("p1");
  const twinSetA = twinSetOf("mission-A", "Question ?", t1);
  const reviewTargets = buildReviewTargets(["Doc A"]);

  const result = await mono01.reviewSchemaPort.buildReviewSchema(twinSetA, dimensionSet, reviewTargets, "Question ?", {
    missionId: "mission-B", // divergent de twinSetA.missionId
  });

  check("1. missionId divergent entre callArgs et une entrée -> BLOCKED", result.status === "BLOCKED", result.status);
  check(
    "2. code MISSION_ID_MISMATCH",
    result.diagnostics && result.diagnostics.error && result.diagnostics.error.code === "MISSION_ID_MISMATCH",
    JSON.stringify(result.diagnostics)
  );
  check(
    "3. les deux identifiants divergents apparaissent dans les détails",
    result.diagnostics.error.details.missionIds.includes("mission-A") && result.diagnostics.error.details.missionIds.includes("mission-B"),
    JSON.stringify(result.diagnostics.error.details)
  );

  // Contre-épreuve : mission cohérente -> pas de blocage sur ce contrôle.
  const ok = await mono01.reviewSchemaPort.buildReviewSchema(twinSetA, dimensionSet, reviewTargets, "Question ?", { missionId: "mission-A" });
  check("4. missionId cohérent -> pas de MISSION_ID_MISMATCH", ok.status === "SUCCESS", JSON.stringify(ok.diagnostics));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
