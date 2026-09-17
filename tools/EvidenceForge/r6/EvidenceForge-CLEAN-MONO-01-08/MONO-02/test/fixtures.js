"use strict";

const path = require("path");
const { createMono01 } = require("../dependencies/MONO-01/index.js");
const { createOrchestrationEngine } = require("../lib/orchestration-engine.js");
const EFOrchDurableBackend = require("../dependencies/MONO-01/dependencies/ef-orch-durable-backend-v0.1.js");

const MONO00_REGISTRY_PATH = path.join(__dirname, "..", "dependencies", "MONO-01", "registry", "mono-00-frozen-baseline-registry-v1.json");
const GRAPH_PATH = path.join(__dirname, "..", "graph", "mono-02-orchestration-graph-v1.json");

// buildMono01(options?) — construit TOUJOURS createMono01() avec un backend
// EF-ORCH explicitement injecté (correction post-audit, frontière
// d'injection) : jamais createMono01(MONO00_REGISTRY_PATH) nu pour un
// scénario qui pourrait toucher EF-ORCH-SUBSYSTEM. Par défaut, un backend
// mémoire de test FRAÎCHEMENT créé ici (jamais fourni implicitement par
// MONO-01 lui-même, qui refuse désormais tout défaut silencieux) ;
// options.efOrchDurableBackend permet de partager explicitement un même
// backend entre plusieurs appels (ex: simuler deux instances distinctes de
// l'orchestrateur sur le même run).
function buildMono01(options) {
  options = options || {};
  const efOrchDurableBackend = options.efOrchDurableBackend || EFOrchDurableBackend.createInMemoryAsyncBackend();
  return createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend });
}

async function findingsResponse(dimIds, opts) {
  opts = opts || {};
  return JSON.stringify({
    findings: dimIds.map((id) => ({
      dimensionId: id,
      disposition: opts.disposition || "support",
      epistemicStatus: "documented",
      finding: "Constat pour " + id,
      rationale: "x",
      targetEvidenceRefs: opts.targetEvidenceRefs !== undefined ? opts.targetEvidenceRefs : ["passage cible"],
      twinBasisWorkRefs: opts.twinBasisWorkRefs !== undefined ? opts.twinBasisWorkRefs : ["Étude " + (opts.twinId || "p1")],
      confidenceQualitative: "medium",
      limitations: [],
    })),
  });
}

// D2/D3 workerCallFn générique — utilisé par EF-02D (mission relevance +
// coverage). Retourne un jugement "mission_relevant"/"documented"/"strong"
// suffisant pour rendre le professionnel "usable" et couvrir la dimension.
async function eligibilityWorkerCallFn(prompt) {
  // Le contenu exact du prompt varie selon D2 vs D3 ; on renvoie un JSON
  // générique couvrant les deux formats attendus par les modules gelés.
  return JSON.stringify({
    judgments: [{ dimensionId: "d1", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x" }],
    dimensions: [{ id: "d1", level: "strong", relevanceStatus: "mission_relevant", epistemicStatus: "documented", rationale: "x", evidenceWorks: ["Étude p1"] }],
  });
}

function buildExternalInputs(missionId) {
  return {
    runContract: null, // rempli par buildFullExternalInputs via les fixtures EF-ORCH de MONO-01
    efOrchExecutionDependencies: null,
    missionDimensionSet: null, // rempli par buildValidMissionArtifacts
    missionDocumentMapping: null,
    heuristicPolicy: null,
    exclusionRegistry: null,
    documents: null,
    reviewTargets: null,
  };
}

async function buildValidMissionArtifacts(missionId) {
  const EFPrGenMissionDimensionSet = require("../dependencies/MONO-01/dependencies/ef-pr-gen-mission-dimension-set-v1.js");
  const EFPrGenMissionDocumentMapping = require("../dependencies/MONO-01/dependencies/ef-pr-gen-mission-document-mapping-v1.js");
  const EFPrGenHeuristicPolicy = require("../dependencies/MONO-01/dependencies/ef-pr-gen-heuristic-policy-v1.js");
  // NOTE: ces trois require() sont réservés à fixtures.js (harnais de test),
  // jamais à lib/ ou node-runners.js — voir test_t02_16 (no direct frozen
  // invocation) qui exclut explicitement test/ de son périmètre puisque le
  // rôle du harnais est justement de fabriquer des objets gelés VALIDES pour
  // simuler ce qu'un opérateur fournirait, pas d'orchestrer quoi que ce soit.

  const missionDimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "Définition A", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const missionDocumentMapping = EFPrGenMissionDocumentMapping.buildMissionDocumentMapping({
    missionId,
    slots: [{ targetId: "target-01", role: "cahier", matchers: { aliases: ["cahier principal"] } }],
    ambiguityFloor: 0.2,
  });
  const heuristicPolicy = EFPrGenHeuristicPolicy.buildHeuristicPolicy({
    policyId: "policy-mono02-test",
    status: "test_unvalidated",
    values: { minWorks: 1, minDoi: 1, minYears: 1, minTopics: 0, coverageThreshold: "moderate", maxPanel: 5, minMarginalGain: 0.1, redundancyPenalty: 0.2 },
    justification: "Fixture de test MONO-02",
  });
  return { missionDimensionSet, missionDocumentMapping, heuristicPolicy };
}

function buildGoodAdapter() {
  return {
    discoverProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalDiscovery",
      schemaVersion: "EF-02A-v2",
      missionId: inputs.corpusSnapshot.missionId,
      candidates: [{ professionalRef: "p1", identityRef: { openAlexAuthorId: "https://openalex.org/A-p1", displayName: "Professionnel p1" } }],
    }),
    verifyProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalVerification",
      schemaVersion: "EF-02B-v2",
      missionId: inputs.professionalDiscovery.missionId,
      professionalRecords: inputs.professionalDiscovery.candidates.map((c) => ({ professionalRef: c.professionalRef, identityRef: c.identityRef, verified: true })),
    }),
    buildProfessionalCorpus: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalCorpusSet",
      schemaVersion: "EF-02C-v2",
      missionId: inputs.professionalVerification.missionId,
      professionalCorpora: inputs.professionalVerification.professionalRecords.map((r) => ({
        schema: "EvidenceForge.ProfessionalCorpus",
        schemaVersion: "EF-02C-v2",
        professionalRef: r.professionalRef,
        identityRef: r.identityRef,
        corpus: { works: [{ doi: "10.1/x", title: "Étude " + r.professionalRef, publicationYear: 2020, topics: [] }] },
        status: "complete",
      })),
    }),
  };
}

// Fait avancer un engine autant que possible : calcule les nœuds READY,
// exécute chacun, répète jusqu'à ce qu'aucun nouveau progrès ne soit
// possible ou que stopAfter soit atteint. Retourne le nombre d'itérations.
async function driveEngine(engine, opts) {
  opts = opts || {};
  const maxIterations = opts.maxIterations || 30;
  let iterations = 0;
  while (iterations++ < maxIterations) {
    const ready = engine.computeReadyNodes();
    const toRun = ready.filter((id) => engine.getNodeState(id) === "READY");
    if (toRun.length === 0) break;
    for (const nodeId of toRun) {
      if (engine.getNodeState(nodeId) !== "READY") continue;
      await engine.runNode(nodeId);
      if (opts.stopAfter && opts.stopAfter === nodeId) return iterations;
    }
  }
  return iterations;
}

function buildFullExternalInputs(missionId, artifacts, eforchFixtures) {
  const inputs = buildExternalInputs(missionId);
  inputs.missionDimensionSet = artifacts.missionDimensionSet;
  inputs.missionDocumentMapping = artifacts.missionDocumentMapping;
  inputs.heuristicPolicy = artifacts.heuristicPolicy;
  inputs.exclusionRegistry = { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [] };
  inputs.documents = [{ targetId: "target-01", role: "cahier", content: "Ce document contient un passage cible important." }];
  const { buildReviewTargets } = require("../dependencies/MONO-01/dependencies/ef-03a-review-schema-v1.js");
  inputs.reviewTargets = buildReviewTargets(["Document de test"]);
  inputs.runContract = eforchFixtures.confirmed;
  inputs.efOrchExecutionDependencies = {
    ef01aInjected: eforchFixtures.ef01aInjected,
    resolverTrace: eforchFixtures.resolverTrace,
    searchProtocol: eforchFixtures.searchProtocol,
    connectorRunners: { openalex: eforchFixtures.oaRunner },
    protocolHash: eforchFixtures.searchProtocol.protocolHash,
    screeningArtifact: eforchFixtures.screeningArtifact,
    qualificationTestArtifact: eforchFixtures.qualificationTestArtifact,
    ef01fInjected: eforchFixtures.ef01fInjected,
  };
  return inputs;
}

// Construit une chaîne d'artefacts EF-ORCH réels et VALIDES (RunContract
// confirmé, resolverTrace, searchProtocol, screeningArtifact,
// qualificationTestArtifact) en réutilisant les fixtures déjà prouvées de
// MONO-01 (dependencies/MONO-01/test/fixtures-eforch.js) — jamais une
// reconstruction séparée du même prédicat.
async function buildEFOrchArtifacts(missionId, idSuffix) {
  const fx = require("../dependencies/MONO-01/test/fixtures-eforch.js");
  const confirmed = await fx.buildConfirmedRunContract(missionId);
  const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
  const searchProtocol = await fx.buildSearchProtocol(missionId, idSuffix);
  const sourceId = "oa-" + idSuffix;
  const { runner: oaRunner, counter } = fx.buildOpenAlexRunner(sourceId);
  const screeningArtifact = fx.buildScreeningArtifact([sourceId], searchProtocol.protocolHash);
  const qualificationTestArtifact = fx.buildQualificationArtifact(screeningArtifact, searchProtocol);
  return {
    confirmed,
    resolverTrace,
    searchProtocol,
    oaRunner,
    oaCallCounter: counter,
    screeningArtifact,
    qualificationTestArtifact,
    ef01aInjected: fx.buildEF01AInjected(missionId),
    ef01fInjected: fx.buildEF01FInjected(idSuffix),
  };
}

async function buildFullContext(missionId) {
  const artifacts = await buildValidMissionArtifacts(missionId);
  const eforchFixtures = await buildEFOrchArtifacts(missionId, missionId.replace(/[^a-z0-9]/gi, "").slice(-12));
  return {
    missionId,
    missionQuestion: "Question de test MONO-02 ?",
    externalInputs: buildFullExternalInputs(missionId, artifacts, eforchFixtures),
    adapter: buildGoodAdapter(),
    dependenciesAvailable: { llm: true },
    workerCallFn: eligibilityWorkerCallFn,
    builtAt: "2026-01-01T00:00:00.000Z",
  };
}

async function buildFullEngine(missionId) {
  const mono01 = buildMono01();
  const context = await buildFullContext(missionId);
  return createOrchestrationEngine(GRAPH_PATH, mono01, context);
}

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
  return { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2", missionId, missionQuestion, twins };
}

// Force un nœud à SUCCESS avec une sortie fournie par le test, EN
// CONTOURNANT runNode() et checkPreconditions() — un utilitaire de test
// UNIQUEMENT (jamais utilisé par l'engine lui-même en fonctionnement normal),
// pour isoler un nœud spécifique (ex : EF-04-LINEAGE) sans devoir faire
// réussir toute la chaîne professionnelle amont à chaque test.
function forceNodeSuccess(engine, nodeId, output) {
  engine.transition(nodeId, "READY");
  engine.transition(nodeId, "RUNNING");
  engine.context.nodeOutputs[nodeId] = output;
  engine.context.nodeResults[nodeId] = {
    schema: "EvidenceForge.IntegrationResult",
    schemaVersion: "MONO-01-v1",
    runId: null,
    moduleId: null,
    status: "SUCCESS",
    outputContract: null,
    output,
    diagnostics: {},
  };
  return engine.transition(nodeId, "SUCCESS");
}

// Construit une chaîne EF-02E->EF-03D RÉALISTE (reviews non vides) en
// appelant directement les ports MONO-01 concernés (même technique que
// MONO-01 test/fixtures.js::buildValidChain), puis l'injecte dans le
// contexte d'un engine via forceNodeSuccess — pour tester spécifiquement
// EF-04-LINEAGE/EF-04A sans dépendre du succès du panel professionnel réel
// (qui exigerait un moteur D1/D2/D3 entièrement réglé, hors du périmètre de
// ce test d'orchestration).
async function seedRealisticChain(engine, missionId, missionQuestion) {
  const mono01 = require("../dependencies/MONO-01/index.js").createMono01(MONO00_REGISTRY_PATH);
  const EFPrGenMissionDimensionSet = require("../dependencies/MONO-01/dependencies/ef-pr-gen-mission-dimension-set-v1.js");
  const { buildReviewTargets } = require("../dependencies/MONO-01/dependencies/ef-03a-review-schema-v1.js");

  const dimensionSet = await EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId,
    dimensions: [{ id: "d1", label: "A", definition: "Définition A", weight: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const t1 = twin("p1");
  const twinSet = twinSetOf(missionId, missionQuestion, t1);
  const reviewTargets = buildReviewTargets(["Document de test"]);

  const reviewSchemaResult = await mono01.reviewSchemaPort.buildReviewSchema(twinSet, dimensionSet, reviewTargets, missionQuestion, { missionId });
  const reviewSchema = reviewSchemaResult.output;

  const targetDocSetResult = await mono01.targetDocumentPort.buildTargetDocumentSet(
    missionId,
    [{ targetId: reviewSchema.reviewTargets[0].targetId, content: "Ce document contient un passage cible important." }],
    { missionId }
  );
  const targetDocumentSet = targetDocSetResult.output;

  const workerCallFn = async () => findingsResponse(["d1"], { twinId: "p1" });
  const reviewSetResult = await mono01.documentaryReviewPort.buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, workerCallFn, {
    missionId,
    dependenciesAvailable: { llm: true },
  });
  const reviewSet = reviewSetResult.output;

  const aggregatedResult = await mono01.aggregationPort.buildAggregatedDocumentaryReview(reviewSet, { missionId });
  const aggregatedReview = aggregatedResult.output;

  const stabilityResult = mono01.stabilityPort.buildStabilityContradictionAnalysis(reviewSet, aggregatedReview, { missionId });
  const stabilityAnalysis = stabilityResult.output;

  forceNodeSuccess(engine, "EF-02E", twinSet);
  forceNodeSuccess(engine, "TARGET_DOCUMENT_SET", targetDocumentSet);
  forceNodeSuccess(engine, "EF-03A", reviewSchema);
  forceNodeSuccess(engine, "EF-03B", reviewSet);
  forceNodeSuccess(engine, "EF-03C", aggregatedReview);
  forceNodeSuccess(engine, "EF-03D", stabilityAnalysis);

  return { dimensionSet, twinSet, reviewSchema, targetDocumentSet, reviewSet, aggregatedReview, stabilityAnalysis };
}

module.exports = {
  MONO00_REGISTRY_PATH,
  GRAPH_PATH,
  buildMono01,
  createOrchestrationEngine,
  findingsResponse,
  eligibilityWorkerCallFn,
  buildExternalInputs,
  buildValidMissionArtifacts,
  buildGoodAdapter,
  driveEngine,
  buildFullExternalInputs,
  buildFullContext,
  buildEFOrchArtifacts,
  buildFullEngine,
  twin,
  twinSetOf,
  forceNodeSuccess,
  seedRealisticChain,
};
