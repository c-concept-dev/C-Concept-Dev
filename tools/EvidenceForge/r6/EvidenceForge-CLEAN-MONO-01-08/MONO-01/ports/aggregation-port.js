"use strict";

const { invokePort } = require("../lib/port-factory");
const EF03CAggregation = require("../dependencies/ef-03c-aggregation-v1.js");

// AggregationPort — CDC MONO-01 section 4.11.
//
// N'ajoute jamais vote/majorité/prestige/truth score : le port ne fait que
// transporter la sortie du module gelé, jamais l'enrichir de ces notions.
const MODULE_ID = "EF-03";

function createAggregationPort(baselinePort) {
  return {
    schema: "EvidenceForge.AggregationPort",

    buildAggregatedDocumentaryReview(reviewSet, opts) {
      return invokePort(
        {
          portId: "AggregationPort.buildAggregatedDocumentaryReview",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["reviewSet"],
          inputContracts: { reviewSet: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1" } },
          outputContract: { schema: "EvidenceForge.AggregatedDocumentaryReview", schemaVersion: "EF-03C-v1" },
          externalDependencies: (opts && opts.executionContext && opts.executionContext.classificationWorkerCallFn) ? ["llm"] : [],
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSet },
          invoke: (inputs, ctx) =>
            EF03CAggregation.buildAggregatedDocumentaryReview(
              inputs.reviewSet,
              ctx.executionContext && ctx.executionContext.aggregationOpts
            ),
        }
      );
    },
  };
}

module.exports = { createAggregationPort };
