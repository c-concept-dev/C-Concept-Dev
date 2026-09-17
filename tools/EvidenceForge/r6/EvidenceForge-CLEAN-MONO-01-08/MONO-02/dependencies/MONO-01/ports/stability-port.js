"use strict";

const { invokePort } = require("../lib/port-factory");
const EF03DStabilityContradiction = require("../dependencies/ef-03d-stability-contradiction-v1.js");

// StabilityPort — CDC MONO-01 section 4.12.
//
// EF-03D est déterministe et strictement SYNC dans le code gelé (confirmé :
// `function buildStabilityContradictionAnalysis`, pas `async`) — exactement
// l'exemple donné en section 10 du CDC. Le port n'interprète jamais
// structurallyStable comme une validation scientifique.
const MODULE_ID = "EF-03";

function createStabilityPort(baselinePort) {
  return {
    schema: "EvidenceForge.StabilityPort",

    buildStabilityContradictionAnalysis(reviewSet, aggregatedReview, opts) {
      return invokePort(
        {
          portId: "StabilityPort.buildStabilityContradictionAnalysis",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["reviewSet", "aggregatedReview"],
          inputContracts: {
            reviewSet: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1" },
            aggregatedReview: { schema: "EvidenceForge.AggregatedDocumentaryReview", schemaVersion: "EF-03C-v1" },
          },
          outputContract: { schema: "EvidenceForge.StabilityContradictionAnalysis", schemaVersion: "EF-03D-v1" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSet, aggregatedReview },
          invoke: (inputs) =>
            EF03DStabilityContradiction.buildStabilityContradictionAnalysis(inputs.reviewSet, inputs.aggregatedReview),
        }
      );
    },
  };
}

module.exports = { createStabilityPort };
