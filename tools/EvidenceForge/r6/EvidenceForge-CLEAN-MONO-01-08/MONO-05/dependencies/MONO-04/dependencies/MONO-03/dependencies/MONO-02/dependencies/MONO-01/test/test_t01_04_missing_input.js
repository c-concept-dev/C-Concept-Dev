"use strict";
const { createMono01, REGISTRY_PATH, twin, twinSetOf, findingsResponse } = require("./fixtures.js");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const { buildReviewTargets } = require("../dependencies/ef-03a-review-schema-v1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const missionId = "mission-t0104";

  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "DA", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const t1 = twin("p1");
  const twinSet = twinSetOf(missionId, "Question ?", t1);
  const reviewTargets = buildReviewTargets(["Doc A"]);
  const reviewSchemaResult = await mono01.reviewSchemaPort.buildReviewSchema(twinSet, dimensionSet, reviewTargets, "Question ?", { missionId });
  check("setup. ReviewSchema construit avec succès", reviewSchemaResult.status === "SUCCESS", JSON.stringify(reviewSchemaResult.diagnostics));
  const reviewSchema = reviewSchemaResult.output;

  // Exemple EF-03B sans TargetDocumentSet — l'entrée requise "targetDocumentSet"
  // est délibérément omise.
  const result = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(
    reviewSchema,
    twinSet,
    undefined, // targetDocumentSet manquant
    async () => findingsResponse(["d1"]),
    { missionId, dependenciesAvailable: { llm: true } }
  );

  check("1. EF-03B sans TargetDocumentSet -> status BLOCKED", result.status === "BLOCKED", result.status);
  check(
    "2. code MISSING_REQUIRED_INPUT",
    result.diagnostics && result.diagnostics.error && result.diagnostics.error.code === "MISSING_REQUIRED_INPUT",
    JSON.stringify(result.diagnostics)
  );
  check(
    "3. le champ manquant désigné est bien targetDocumentSet",
    result.diagnostics.error.details.missing === "targetDocumentSet",
    JSON.stringify(result.diagnostics.error.details)
  );
  check("4. aucune sortie produite (le module gelé n'a jamais été appelé)", result.output === null);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
