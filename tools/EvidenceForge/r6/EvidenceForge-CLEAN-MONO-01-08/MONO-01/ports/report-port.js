"use strict";

const { invokePort } = require("../lib/port-factory");
const EF04AUnifiedReport = require("../dependencies/ef-04a-unified-report-v1.js");
const { isLineagePass } = require("./lineage-port");

// ReportPort — CDC MONO-01 section 4.14.
//
// N'accepte que des objets ayant passé LineagePort. Le gate est vérifié ICI,
// AVANT tout appel du module gelé — jamais après coup. Le module gelé
// EF-04A revalide lui-même la lignée en interne (défense en profondeur),
// mais ce n'est pas ce second contrôle interne que T01-15 vérifie : c'est
// que MONO-01 lui-même n'appelle jamais buildUnifiedReportSummary() sans
// qu'un LineagePort.assertLineage() explicite ait déjà produit PASS.
const MODULE_ID = "EF-04";

function createReportPort(baselinePort) {
  return {
    schema: "EvidenceForge.ReportPort",

    buildUnifiedReportSummary(inputs, lineageResult, opts) {
      const { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis } = inputs || {};

      return invokePort(
        {
          portId: "ReportPort.buildUnifiedReportSummary",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: [
            "reviewSchema",
            "targetDocumentSet",
            "twinSet",
            "reviewSet",
            "aggregatedReview",
            "stabilityAnalysis",
          ],
          outputContract: { schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1" },
          callType: "ASYNC",
          gate: () =>
            isLineagePass(lineageResult)
              ? null
              : {
                  code: "LINEAGE_BLOCKED",
                  message:
                    "ReportPort: aucun rapport ne peut être produit sans un résultat PASS explicite de LineagePort.assertLineage().",
                  details: { moduleId: MODULE_ID },
                },
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis },
          invoke: (portInputs) =>
            EF04AUnifiedReport.buildUnifiedReportSummary({
              reviewSchema: portInputs.reviewSchema,
              targetDocumentSet: portInputs.targetDocumentSet,
              twinSet: portInputs.twinSet,
              reviewSet: portInputs.reviewSet,
              aggregatedReview: portInputs.aggregatedReview,
              stabilityAnalysis: portInputs.stabilityAnalysis,
            }),
        }
      );
    },
  };
}

module.exports = { createReportPort };
