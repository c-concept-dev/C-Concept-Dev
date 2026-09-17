"use strict";

const { invokePort } = require("../lib/port-factory");
const EF03BReviewRunner = require("../dependencies/ef-03b-review-runner-v1.js");

// DocumentaryReviewPort — CDC MONO-01 section 4.10.
//
// La matrice MONO-00 fait autorité sur ces dépendances : EF-03B dépend
// architecturalement de MissionDocumentMapping (via la construction en amont
// du TargetDocumentSet), jamais comme paramètre direct de la fonction gelée —
// exactement la précision apportée par la correction d'audit n°1 de MONO-00.
// Séparation obligatoire : targetEvidenceRefs ≠ twinBasisWorkRefs (préservée
// telle quelle par le module gelé, jamais recalculée ici).
const MODULE_ID = "EF-03";

function createDocumentaryReviewPort(baselinePort) {
  return {
    schema: "EvidenceForge.DocumentaryReviewPort",

    buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, workerCallFn, opts) {
      return invokePort(
        {
          portId: "DocumentaryReviewPort.buildDocumentaryReviewSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["reviewSchema", "twinSet", "targetDocumentSet"],
          inputContracts: {
            reviewSchema: { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1" },
            twinSet: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" },
            targetDocumentSet: { schema: "EvidenceForge.TargetDocumentSet", schemaVersion: "EF-03-DOC-v1" },
          },
          outputContract: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1" },
          externalDependencies: ["llm"],
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSchema, twinSet, targetDocumentSet },
          invoke: (inputs) =>
            EF03BReviewRunner.buildDocumentaryReviewSet({
              reviewSchema: inputs.reviewSchema,
              twinSet: inputs.twinSet,
              targetDocumentSet: inputs.targetDocumentSet,
              workerCallFn,
            }),
        }
      );
    },

    resumeDocumentaryReviewSet(existingReviewSet, reviewSchema, twinSet, targetDocumentSet, workerCallFn, opts) {
      return invokePort(
        {
          portId: "DocumentaryReviewPort.resumeDocumentaryReviewSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["existingReviewSet", "reviewSchema", "twinSet", "targetDocumentSet"],
          inputContracts: {
            existingReviewSet: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1" },
            reviewSchema: { schema: "EvidenceForge.ReviewSchema", schemaVersion: "EF-03A-v1" },
            twinSet: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" },
            targetDocumentSet: { schema: "EvidenceForge.TargetDocumentSet", schemaVersion: "EF-03-DOC-v1" },
          },
          outputContract: { schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1" },
          externalDependencies: ["llm"],
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          ...opts,
          inputs: { existingReviewSet, reviewSchema, twinSet, targetDocumentSet },
          invoke: (inputs) =>
            EF03BReviewRunner.resumeDocumentaryReviewSet(inputs.existingReviewSet, {
              reviewSchema: inputs.reviewSchema,
              twinSet: inputs.twinSet,
              targetDocumentSet: inputs.targetDocumentSet,
              workerCallFn,
            }),
        }
      );
    },
  };
}

module.exports = { createDocumentaryReviewPort };
