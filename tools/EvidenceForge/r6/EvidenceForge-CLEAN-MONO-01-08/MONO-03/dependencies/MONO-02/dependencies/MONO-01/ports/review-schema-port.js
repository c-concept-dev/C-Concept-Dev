"use strict";

const { invokePort } = require("../lib/port-factory");
const EF03AReviewSchema = require("../dependencies/ef-03a-review-schema-v1.js");

// ReviewSchemaPort — CDC MONO-01 section 4.9.
//
// Invariant : ReviewSchema = mission-owned. Ce port n'accepte jamais la
// composition du panel comme entrée — DocumentaryTwinSet n'y sert qu'à
// vérifier l'assertTwinSet interne, jamais à dériver le schéma lui-même.
const MODULE_ID = "EF-03";

function createReviewSchemaPort(baselinePort) {
  return {
    schema: "EvidenceForge.ReviewSchemaPort",

    buildReviewSchema(twinSet, dimensionSet, reviewTargets, missionQuestion, opts) {
      return invokePort(
        {
          portId: "ReviewSchemaPort.buildReviewSchema",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["twinSet", "dimensionSet", "reviewTargets"],
          inputContracts: {
            twinSet: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" },
          },
          outputContract: { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1" },
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { twinSet, dimensionSet, reviewTargets },
          invoke: (inputs) =>
            EF03AReviewSchema.buildReviewSchema({
              twinSet: inputs.twinSet,
              dimensionSet: inputs.dimensionSet,
              reviewTargets: inputs.reviewTargets,
              missionQuestion,
            }),
        }
      );
    },
  };
}

module.exports = { createReviewSchemaPort };
