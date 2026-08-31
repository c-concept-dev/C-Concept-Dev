"use strict";
/**
 * MONO-08 — lib/eforch-artifacts.js
 *
 * Construit chaque artefact prerequis du sous-pipeline EF-ORCH-SUBSYSTEM
 * (EF-01A a EF-01F) EXCLUSIVEMENT via les builders/factories geles deja
 * identifies par inspection directe de :
 *   MONO-01/test/fixtures-eforch.js (preuve de constructibilite),
 *   MONO-01/dependencies/ef-orch-runcontract-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01b-resolver-trace-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01-output-contracts-v0.1.js,
 *   MONO-01/dependencies/ef-orch-ef01e-test-qualification-generator-v0.1.js,
 *   MONO-01/dependencies/ef-orch-hash-v0.1.js.
 *
 * Jamais un objet ad hoc devine pour un artefact qui a un builder gele —
 * seuls ScreeningArtifact et les objets "injected" EF-01A/EF-01F sont
 * construits directement (fixtures-eforch.js fait de meme : aucun builder
 * dedie n'existe pour eux au-dela de la validation inline de l'executeur).
 */

function loadEForchDeps(mono01Path) {
  const path = require("path");
  function dep(name) { return require(path.join(mono01Path, "dependencies", name)); }
  return {
    EFOrchRunContract: dep("ef-orch-runcontract-v0.1.js"),
    ResolverTraceSchema: dep("ef-orch-ef01b-resolver-trace-v0.1.js"),
    createOpenAlexRunner: dep("ef-orch-ef01c2-runner-openalex-v0.1.js").createOpenAlexRunner,
    sha256LikeRealSearchProtocol: dep("ef-orch-ef01-output-contracts-v0.1.js").sha256LikeRealSearchProtocol,
    generateQualificationTestArtifact: dep("ef-orch-ef01e-test-qualification-generator-v0.1.js").generateQualificationTestArtifact,
    sha256Bytes: dep("ef-orch-hash-v0.1.js").sha256Bytes,
  };
}

async function buildConfirmedRunContractForMission(deps, mission, missionQuestion, documentBytesByUrl) {
  const EFOrchRunContract = deps.EFOrchRunContract;
  const sha256Bytes = deps.sha256Bytes;
  const documentsDetectes = [];
  for (const doc of mission.targetDocuments) {
    const bytes = documentBytesByUrl[doc.url];
    if (!bytes) throw new Error("buildConfirmedRunContractForMission: octets manquants pour \"" + doc.url + "\".");
    const hash = await sha256Bytes(bytes);
    documentsDetectes.push({ nom: doc.title || doc.documentId, type: "document_public", hashSha256: hash });
  }
  const disciplinesProposees = mission.dimensions.map(function (d) { return { discipline: d.id, justification: d.label || d.id }; });
  const draft = EFOrchRunContract.buildRunContractDraft({
    demandeBrute: missionQuestion,
    missionReformulee: missionQuestion,
    documentsDetectes: documentsDetectes,
    sourcesFournies: [],
    disciplinesProposees: disciplinesProposees,
    connecteursDisponibles: ["openalex"],
    niveauRevue: "standard",
    webPublicActive: false,
    governanceRef: { usageStatus: "research_internal" },
  });
  return EFOrchRunContract.confirmRunContract(draft, { confirmedAt: new Date().toISOString() });
}

function buildResolverTraceForMission(deps, missionId, confirmedRunContract) {
  const ResolverTraceSchema = deps.ResolverTraceSchema;
  return {
    schema: ResolverTraceSchema.SCHEMA,
    schemaVersion: ResolverTraceSchema.SCHEMA_VERSION,
    runContractHash: confirmedRunContract.runContractHash,
    resolverRuns: confirmedRunContract.disciplinesProposees.map(function (d, i) {
      return {
        runId: "r" + (i + 1), date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6",
        promptVersion: "EF01B-discipline-resolver-v2", missionId: missionId, inputHash: "1".repeat(64), rawResponseHash: "2".repeat(64),
        proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, technicalLimitApplied: false, targetContextReport: [],
      };
    }),
  };
}

async function buildSearchProtocolForMission(deps, missionId, idSuffix, disciplines) {
  const sha256LikeRealSearchProtocol = deps.sha256LikeRealSearchProtocol;
  const sourcesActivees = [{ connectorId: "openalex", label: "OpenAlex", access: "", constraint: "", active: true, justification: "Justification." }];
  const requetesExactes = disciplines.map(function (d, i) { return { id: "q" + (i + 1), connectorId: "openalex", discipline: d, requete: d, justification: "Requete pour la dimension " + d + "." }; });
  // Cardinalite exigee par le validateur reel (validateEF01C1Output) :
  // retrievalPolicies.length === sourcesActivees.length (une politique par
  // SOURCE active, jamais par discipline) — un seul connecteur openalex
  // actif ici, donc une seule politique, quel que soit le nombre de
  // disciplines/requetes.
  const retrievalPolicies = [{ connectorId: "openalex", requete: disciplines.join(", "), sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "maxResults atteint", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }];
  const protoBase = {
    schema: "EvidenceForge.SearchProtocol", schemaVersion: "EF-01C1-v1", id: "protocol-" + idSuffix, missionId: missionId,
    disciplinesRetenues: disciplines, sourcesActivees: sourcesActivees, requetesExactes: requetesExactes,
    fenetreTemporelle: { debut: "", fin: "" }, langues: [], typesDocumentsAdmis: [],
    criteresInclusion: ["Pertinence a la mission."], criteresExclusion: ["Hors sujet."],
    regleDedoublonnage: "DOI.", methodeQualification: "Qualitative.",
    retrievalPolicies: retrievalPolicies,
    statut: "figé", createdAt: new Date().toISOString(), validatedAt: new Date().toISOString(), frozenAt: new Date().toISOString(),
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "Revu (MONO-08)." },
    plannerRuns: [{ runId: "planner-" + idSuffix, date: new Date().toISOString(), provider: "anthropic", model: "claude-sonnet-4-6", promptVersion: "EF01C1-search-planner-v2-compact", missionId: missionId, inputHash: "3".repeat(64), rawResponseHash: "4".repeat(64) }],
  };
  const protocolHash = await sha256LikeRealSearchProtocol(protoBase);
  return Object.assign({}, protoBase, { protocolHash: protocolHash });
}

function buildOpenAlexConnectorRunner(deps, sourceId, fetchImpl) {
  const createOpenAlexRunner = deps.createOpenAlexRunner;
  return createOpenAlexRunner({ fetchImpl: fetchImpl, genId: function () { return sourceId; }, nowIso: function () { return new Date().toISOString(); } });
}
function buildScreeningArtifactForMission(sourceIds, protocolHash) {
  const sources = sourceIds.map(function (id) {
    return {
      id: id, titre: "Source " + id, auteurOuOrganisme: "", date: "", reference: "", discipline: "MONO-08", theme: "",
      provenance: { connectorId: "openalex", connectorType: "api", retrievalMethod: "automatic", originalReference: null },
      qualification: null, dependancesConnues: [], extraitUtilise: "", dateConsultation: new Date().toISOString(),
      statutScreening: "inclus", motifExclusion: "", screeningDecisionRef: "dec-" + id,
    };
  });
  return {
    sourcesScreening: sources,
    auditDecisions: sources.map(function (s) {
      return {
        decisionId: s.screeningDecisionRef, typeDecision: "screening_inclusion", date: new Date().toISOString(), acteur: "human",
        modelProvider: null, modelId: null, promptVersion: null, protocolRef: protocolHash, inputSourceRef: s.id,
        decision: "inclus", justification: "Pertinent (MONO-08).", confidenceQualitative: "humaine", humanOverride: null,
      };
    }),
    completedAt: new Date().toISOString(),
  };
}

function buildQualificationArtifactForMission(deps, screeningArtifact, searchProtocol) {
  const generateQualificationTestArtifact = deps.generateQualificationTestArtifact;
  const ef01dOutputApprox = Object.assign({}, screeningArtifact, { stage: "EF-01D", searchProtocol: searchProtocol });
  return Object.assign({}, generateQualificationTestArtifact(ef01dOutputApprox, { nowIso: function () { return new Date().toISOString(); } }), { completedAt: new Date().toISOString() });
}

function buildEF01AInjectedForMission(missionId, documentBytesByHash, mission) {
  const targetDocuments = mission.targetDocuments.map(function () {
    return { id: "doc-" + Math.random().toString(36).slice(2, 8), ajouteLe: new Date().toISOString() };
  });
  return { metadata: { missionId: missionId, dateCreation: new Date().toISOString(), documents: { targetDocuments: targetDocuments, suppliedEvidence: [] } }, documentBytes: documentBytesByHash };
}

function buildEF01FInjectedForMission(idSuffix) {
  return { corpusId: "corpus-" + idSuffix, dateGel: new Date().toISOString(), completedAt: new Date().toISOString() };
}

module.exports = {
  loadEForchDeps: loadEForchDeps,
  buildConfirmedRunContractForMission: buildConfirmedRunContractForMission,
  buildResolverTraceForMission: buildResolverTraceForMission,
  buildSearchProtocolForMission: buildSearchProtocolForMission,
  buildOpenAlexConnectorRunner: buildOpenAlexConnectorRunner,
  buildScreeningArtifactForMission: buildScreeningArtifactForMission,
  buildQualificationArtifactForMission: buildQualificationArtifactForMission,
  buildEF01AInjectedForMission: buildEF01AInjectedForMission,
  buildEF01FInjectedForMission: buildEF01FInjectedForMission,
};
