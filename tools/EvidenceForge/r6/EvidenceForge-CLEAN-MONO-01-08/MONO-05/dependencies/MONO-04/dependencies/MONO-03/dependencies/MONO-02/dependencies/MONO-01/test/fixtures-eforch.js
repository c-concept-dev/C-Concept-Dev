"use strict";

const EFOrchRunContract = require("../dependencies/ef-orch-runcontract-v0.1.js");
const { SCHEMA: B_TRACE_SCHEMA, SCHEMA_VERSION: B_TRACE_VERSION } = require("../dependencies/ef-orch-ef01b-resolver-trace-v0.1.js");
const { createOpenAlexRunner } = require("../dependencies/ef-orch-ef01c2-runner-openalex-v0.1.js");
const { sha256LikeRealSearchProtocol } = require("../dependencies/ef-orch-ef01-output-contracts-v0.1.js");
const { generateQualificationTestArtifact } = require("../dependencies/ef-orch-ef01e-test-qualification-generator-v0.1.js");

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function buildConfirmedRunContract(missionId, opts) {
  opts = opts || {};
  const draft = EFOrchRunContract.buildRunContractDraft({
    demandeBrute: "Q ?",
    missionReformulee: "Mission de test EFOrchExecutionPort.",
    documentsDetectes: [],
    sourcesFournies: [],
    disciplinesProposees: [{ discipline: "STAPS", justification: "Justification suffisante." }],
    connecteursDisponibles: ["openalex"],
    niveauRevue: "standard",
    webPublicActive: !!opts.webPublicActive,
    governanceRef: { usageStatus: "research_internal" },
  });
  return EFOrchRunContract.confirmRunContract(draft, { confirmedAt: "2026-08-27T00:00:00.000Z" });
}

function buildResolverTrace(missionId, confirmed) {
  return {
    schema: B_TRACE_SCHEMA,
    schemaVersion: B_TRACE_VERSION,
    runContractHash: confirmed.runContractHash,
    resolverRuns: [
      {
        runId: "r1", date: "2026-08-27T00:00:00.000Z", provider: "anthropic", model: "claude-sonnet-4-6",
        promptVersion: "EF01B-discipline-resolver-v2", missionId, inputHash: "1".repeat(64), rawResponseHash: "2".repeat(64),
        proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, technicalLimitApplied: false, targetContextReport: [],
      },
    ],
  };
}

async function buildSearchProtocol(missionId, idSuffix, opts) {
  opts = opts || {};
  const sourcesActivees = [{ connectorId: "openalex", label: "OpenAlex", access: "", constraint: "", active: true, justification: "Justification." }];
  const requetesExactes = [{ id: "q1", connectorId: "openalex", discipline: "STAPS", requete: "activité physique", justification: "x" }];
  const retrievalPolicies = [{ connectorId: "openalex", requete: "activité physique", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "x", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" }];
  if (opts.webPublic) {
    sourcesActivees.push({ connectorId: "web_public", label: "Web Public", access: "", constraint: "", active: true, justification: "Justification." });
    requetesExactes.push({ id: "q2", connectorId: "web_public", discipline: "STAPS", requete: "activité physique", justification: "x" });
    retrievalPolicies.push({ connectorId: "web_public", requete: "activité physique", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "x", retryPolicy: "2 tentatives", rateLimitPolicy: "1000 req/s", budgetMax: "budget raisonnable" });
  }
  const protoBase = {
    schema: "EvidenceForge.SearchProtocol", schemaVersion: "EF-01C1-v1", id: "protocol-" + idSuffix, missionId,
    disciplinesRetenues: ["STAPS"], sourcesActivees, requetesExactes,
    fenetreTemporelle: { debut: "", fin: "" }, langues: [], typesDocumentsAdmis: [],
    criteresInclusion: ["Inclusion."], criteresExclusion: ["Exclusion."],
    regleDedoublonnage: "DOI.", methodeQualification: "Qualitative.",
    retrievalPolicies,
    statut: "figé", createdAt: "2026-08-27T00:01:00.000Z", validatedAt: "2026-08-27T00:02:00.000Z", frozenAt: "2026-08-27T00:03:00.000Z",
    humanValidation: { validatedAt: "2026-08-27T00:02:00.000Z", commentaire: "Revu." },
    plannerRuns: [{ runId: "planner-" + idSuffix, date: "2026-08-27T00:00:30.000Z", provider: "anthropic", model: "claude-sonnet-4-6", promptVersion: "EF01C1-search-planner-v2-compact", missionId, inputHash: "3".repeat(64), rawResponseHash: "4".repeat(64) }],
  };
  const protocolHash = await sha256LikeRealSearchProtocol(protoBase);
  return { ...protoBase, protocolHash };
}

function buildOpenAlexRunner(sourceId, opts) {
  opts = opts || {};
  let calls = 0;
  const counter = { get calls() { return calls; } };
  const runner = createOpenAlexRunner({
    fetchImpl: async () => {
      calls++;
      if (opts.fail) throw new Error("panne réseau simulée");
      return jsonResponse({ results: [{ display_name: "Source OA" }] });
    },
    genId: () => sourceId,
    nowIso: () => "2026-08-27T00:10:00.000Z",
  });
  return { runner, counter };
}

function buildScreeningArtifact(sourceIds, protocolHash, opts) {
  opts = opts || {};
  const sources = sourceIds.map((id) => ({
    id, titre: "Source " + id, auteurOuOrganisme: "", date: "", reference: "", discipline: "STAPS", theme: "",
    provenance: { connectorId: opts.connectorFor ? opts.connectorFor(id) : "openalex", connectorType: "api", retrievalMethod: "automatic", originalReference: null },
    qualification: null, dependancesConnues: [], extraitUtilise: "", dateConsultation: "2026-08-27T00:20:00.000Z",
    statutScreening: "inclus", motifExclusion: "", screeningDecisionRef: "dec-" + id,
  }));
  return {
    sourcesScreening: sources,
    auditDecisions: sources.map((s) => ({
      decisionId: s.screeningDecisionRef, typeDecision: "screening_inclusion", date: "2026-08-27T00:30:00.000Z", acteur: "human",
      modelProvider: null, modelId: null, promptVersion: null, protocolRef: protocolHash, inputSourceRef: s.id,
      decision: "inclus", justification: "Pertinent.", confidenceQualitative: "humaine", humanOverride: null,
    })),
    completedAt: "2026-08-27T00:31:00.000Z",
  };
}

function buildQualificationArtifact(screeningArtifact, searchProtocol) {
  const ef01dOutputApprox = { ...screeningArtifact, stage: "EF-01D", searchProtocol };
  return { ...generateQualificationTestArtifact(ef01dOutputApprox, { nowIso: () => "2026-08-27T00:40:00.000Z" }), completedAt: "2026-08-27T00:41:00.000Z" };
}

function buildEF01AInjected(missionId) {
  return { metadata: { missionId, dateCreation: "2026-08-27T00:05:00.000Z", documents: { targetDocuments: [], suppliedEvidence: [] } } };
}

function buildEF01FInjected(idSuffix) {
  return { corpusId: "corpus-" + idSuffix, dateGel: "2026-08-27T01:00:00.000Z", completedAt: "2026-08-27T01:01:00.000Z" };
}

module.exports = {
  buildConfirmedRunContract,
  buildResolverTrace,
  buildSearchProtocol,
  buildOpenAlexRunner,
  buildScreeningArtifact,
  buildQualificationArtifact,
  buildEF01AInjected,
  buildEF01FInjected,
};
