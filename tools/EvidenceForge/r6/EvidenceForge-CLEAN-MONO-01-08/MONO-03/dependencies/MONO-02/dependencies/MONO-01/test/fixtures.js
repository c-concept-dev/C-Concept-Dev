"use strict";

const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const { createMono01 } = require("../index.js");
const path = require("path");

const REGISTRY_PATH = path.join(__dirname, "..", "registry", "mono-00-frozen-baseline-registry-v1.json");

function twin(id, worksUsed) {
  return {
    schema: "EvidenceForge.DocumentaryTwin",
    schemaVersion: "EF-02E-v2",
    twinId: "twin-" + id,
    professionalRef: id,
    referenceIdentity: { displayName: "Professionnel " + id },
    documentaryBasis: {
      worksUsed: worksUsed || [{ workRef: "Étude " + id, citedForDimensions: ["d1"] }],
      dimensionCoverage: [],
      limitations: [],
    },
    stability: { contentHash: "hash-" + id },
    retracted: false,
  };
}

function twinSetOf(missionId, missionQuestion, ...twins) {
  return {
    schema: "EvidenceForge.DocumentaryTwinSet",
    schemaVersion: "EF-02E-v2",
    missionId,
    missionQuestion,
    twins,
  };
}

async function findingsResponse(dimIds, opts) {
  opts = opts || {};
  return JSON.stringify({
    findings: dimIds.map((id) => ({
      dimensionId: id,
      disposition: opts.disposition || "support",
      epistemicStatus: opts.epistemicStatus || "documented",
      finding: "Constat pour " + id,
      rationale: "x",
      targetEvidenceRefs: opts.targetEvidenceRefs !== undefined ? opts.targetEvidenceRefs : ["passage cible"],
      twinBasisWorkRefs: opts.twinBasisWorkRefs !== undefined ? opts.twinBasisWorkRefs : ["Étude " + (opts.twinId || "p1")],
      confidenceQualitative: "medium",
      limitations: [],
    })),
  });
}

// Construit une chaîne complète et valide EN PASSANT PAR LES PORTS MONO-01
// eux-mêmes (dogfooding) — ReviewSchemaPort -> TargetDocumentPort ->
// DocumentaryReviewPort -> AggregationPort -> StabilityPort -> LineagePort ->
// ReportPort. N'utilise directement les dépendances gelées que pour
// MissionDimensionSet et le DocumentaryTwinSet de test (hors périmètre
// EF-02A/B/C, décision ouverte).
async function buildValidChain(mono01, opts) {
  opts = opts || {};
  const missionId = opts.missionId || "mission-test";
  const missionQuestion = opts.missionQuestion || "Question de test MONO-01 ?";
  const twinId = opts.twinId || "p1";

  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId: opts.dimensionSetMissionId || missionId,
    dimensions: [{ id: "d1", label: "A", definition: "Définition A", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  const t1 = twin(twinId, [{ workRef: "Étude " + twinId, citedForDimensions: ["d1"] }]);
  const twinSet = twinSetOf(missionId, missionQuestion, t1);

  const reviewTargets = require("../dependencies/ef-03a-review-schema-v1.js").buildReviewTargets(["Document de test"]);

  const reviewSchemaResult = await mono01.reviewSchemaPort.buildReviewSchema(
    twinSet,
    dimensionSet,
    reviewTargets,
    missionQuestion,
    { missionId }
  );
  if (reviewSchemaResult.status !== "SUCCESS") {
    throw new Error("fixtures: échec construction ReviewSchema — " + JSON.stringify(reviewSchemaResult.diagnostics));
  }
  const reviewSchema = reviewSchemaResult.output;

  const targetDocSetResult = await mono01.targetDocumentPort.buildTargetDocumentSet(
    missionId,
    [{ targetId: reviewSchema.reviewTargets[0].targetId, role: "cahier", content: "Ce document contient un passage cible important." }],
    { missionId }
  );
  if (targetDocSetResult.status !== "SUCCESS") {
    throw new Error("fixtures: échec construction TargetDocumentSet — " + JSON.stringify(targetDocSetResult.diagnostics));
  }
  const targetDocumentSet = targetDocSetResult.output;

  const workerCallFn = async () => findingsResponse(["d1"], { twinId });

  const reviewSetResult = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(
    reviewSchema,
    twinSet,
    targetDocumentSet,
    workerCallFn,
    { missionId, dependenciesAvailable: { llm: true } }
  );
  if (reviewSetResult.status !== "SUCCESS") {
    throw new Error("fixtures: échec construction DocumentaryReviewSet — " + JSON.stringify(reviewSetResult.diagnostics));
  }
  const reviewSet = reviewSetResult.output;

  const aggregatedResult = await mono01.aggregationPort.buildAggregatedDocumentaryReview(reviewSet, { missionId });
  if (aggregatedResult.status !== "SUCCESS") {
    throw new Error("fixtures: échec construction AggregatedDocumentaryReview — " + JSON.stringify(aggregatedResult.diagnostics));
  }
  const aggregatedReview = aggregatedResult.output;

  const stabilityResult = mono01.stabilityPort.buildStabilityContradictionAnalysis(reviewSet, aggregatedReview, { missionId });
  if (stabilityResult.status !== "SUCCESS") {
    throw new Error("fixtures: échec construction StabilityContradictionAnalysis — " + JSON.stringify(stabilityResult.diagnostics));
  }
  const stabilityAnalysis = stabilityResult.output;

  return { missionId, missionQuestion, dimensionSet, twinSet, reviewSchema, targetDocumentSet, reviewSet, aggregatedReview, stabilityAnalysis };
}

module.exports = { REGISTRY_PATH, createMono01, twin, twinSetOf, findingsResponse, buildValidChain };
