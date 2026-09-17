"use strict";

const { invokePort } = require("../lib/port-factory");
const EF04LineageGuard = require("../dependencies/ef-04-lineage-guard-v1.js");

// LineagePort — CDC MONO-01 section 4.13.
//
// EF-04 est FAIL-CLOSED. assertLineage() du module gelé est SYNC et THROW à
// la première violation trouvée (jamais un warning) : ce port ne transforme
// jamais ce throw en un statut "réussi avec avertissement" — un échec de
// assertLineage produit toujours un IntegrationResult non-SUCCESS.
// La limitation gelée reste visible telle quelle dans lineageAssurance
// (targetDocumentsHashBoundFromEF03=false, documentaryTwinsHashBoundFromEF03=false) —
// ce port ne la masque ni ne la "corrige" silencieusement.
const MODULE_ID = "EF-04";

function createLineagePort(baselinePort) {
  return {
    schema: "EvidenceForge.LineagePort",

    assertLineage(inputs, opts) {
      const { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis } = inputs || {};
      return invokePort(
        {
          portId: "LineagePort.assertLineage",
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
          outputContract: null, // sortie { ok, reviewSchemaHash, missionId, lineageAssurance }, pas un contrat gelé versionné
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis },
          invoke: (portInputs) =>
            EF04LineageGuard.assertLineage({
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

    buildLineageFingerprint(inputs, opts) {
      const { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis } = inputs || {};
      return invokePort(
        {
          portId: "LineagePort.buildLineageFingerprint",
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
          outputContract: null,
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis },
          invoke: (portInputs) =>
            EF04LineageGuard.buildLineageFingerprint({
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

// Vrai PASS au sens du CDC (section 4.13) : le résultat d'intégration a
// réussi ET la sortie interne d'assertLineage confirme ok===true.
function isLineagePass(lineageResult) {
  return !!(lineageResult && lineageResult.status === "SUCCESS" && lineageResult.output && lineageResult.output.ok === true);
}

module.exports = { createLineagePort, isLineagePass };
