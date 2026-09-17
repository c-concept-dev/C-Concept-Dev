"use strict";
const { createMono01, REGISTRY_PATH, buildValidChain } = require("./fixtures.js");
const { isLineagePass } = require("../ports/lineage-port.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = createMono01(REGISTRY_PATH);
  const chain = await buildValidChain(mono01, { missionId: "mission-t0115" });

  // 1. ReportPort appelé SANS aucun lineageResult -> LINEAGE_BLOCKED, jamais d'appel du module gelé.
  const withoutLineage = await mono01.reportPort.buildUnifiedReportSummary(chain, undefined);
  check("1. ReportPort sans lineageResult -> status BLOCKED", withoutLineage.status === "BLOCKED", withoutLineage.status);
  check(
    "2. code LINEAGE_BLOCKED",
    withoutLineage.diagnostics && withoutLineage.diagnostics.error && withoutLineage.diagnostics.error.code === "LINEAGE_BLOCKED",
    JSON.stringify(withoutLineage.diagnostics)
  );
  check("3. aucun rapport produit", withoutLineage.output === null);

  // 2. ReportPort appelé avec un lineageResult qui a ÉCHOUÉ (FAILED) -> LINEAGE_BLOCKED.
  const brokenLineage = mono01.lineagePort.assertLineage({
    reviewSchema: chain.reviewSchema,
    targetDocumentSet: { ...chain.targetDocumentSet, documents: [] }, // rupture délibérée de la lignée
    twinSet: chain.twinSet,
    reviewSet: chain.reviewSet,
    aggregatedReview: chain.aggregatedReview,
    stabilityAnalysis: chain.stabilityAnalysis,
  });
  check("4. LineagePort.assertLineage avec une entrée brisée -> ne renvoie pas SUCCESS", brokenLineage.status !== "SUCCESS", brokenLineage.status);
  check("4b. isLineagePass() sur un résultat non-SUCCESS -> false", isLineagePass(brokenLineage) === false);

  const withBrokenLineage = await mono01.reportPort.buildUnifiedReportSummary(chain, brokenLineage);
  check("5. ReportPort avec un lineageResult en échec -> LINEAGE_BLOCKED", withBrokenLineage.status === "BLOCKED" && withBrokenLineage.diagnostics.error.code === "LINEAGE_BLOCKED");

  // 3. ReportPort appelé avec un VRAI PASS de LineagePort -> rapport produit.
  const passLineage = mono01.lineagePort.assertLineage({
    reviewSchema: chain.reviewSchema,
    targetDocumentSet: chain.targetDocumentSet,
    twinSet: chain.twinSet,
    reviewSet: chain.reviewSet,
    aggregatedReview: chain.aggregatedReview,
    stabilityAnalysis: chain.stabilityAnalysis,
  });
  check("6. LineagePort.assertLineage sur une chaîne valide -> SUCCESS", passLineage.status === "SUCCESS", JSON.stringify(passLineage.diagnostics));
  check("6b. isLineagePass() sur ce résultat -> true", isLineagePass(passLineage) === true);

  const finalReport = await mono01.reportPort.buildUnifiedReportSummary(chain, passLineage);
  check("7. ReportPort avec PASS explicite -> SUCCESS, rapport produit", finalReport.status === "SUCCESS", JSON.stringify(finalReport.diagnostics));
  check(
    "8. la limitation de lignée gelée reste visible dans le résultat de LineagePort (jamais masquée)",
    passLineage.output.lineageAssurance.targetDocumentsHashBoundFromEF03 === false &&
      passLineage.output.lineageAssurance.documentaryTwinsHashBoundFromEF03 === false
  );

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  if (failed.length) {
    console.log("\nECHECS : " + failed.length);
    process.exit(1);
  } else {
    console.log("\nTOUS LES TESTS PASSENT (" + results.length + ")");
  }
})();
