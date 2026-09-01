"use strict";
// test/cross-process/worker-prepare-screening.js — PROCESSUS A (R5,
// mandat section 31 : preuve CROSS_PROCESS reelle du workflow en deux
// phases PREPARE_REAL_SCREENING / RESUME_REAL_SCREENING).
//
// Processus Node INDEPENDANT (lance par test_t08_r5_closure.js via
// child_process.spawn) : construit ses PROPRES mono01/mono03 (jamais
// partages), injecte les backends durables FICHIER (eforch/mono03 ET le
// nouveau backend snapshot, lib/file-durable-backend.js — AUCUN mecanisme
// de persistance parallele, le meme que R2/B-01), execute
// prepareRealScreening() JUSQU'A OPERATOR_INPUT_REQUIRED_AUDIT_DECISIONS,
// puis se termine COMPLETEMENT (process.exit) — aucun etat ne survit dans
// ce processus au-dela de cette sortie ; SEUL le disque (snapshotBackendDir)
// transporte le RetrievalSnapshot vers le processus B.
//
// Provider LOCAL_CONTROLLED a DEUX enregistrements distincts (mandat
// section 30 : au moins deux ids/metadonnees differents) — jamais le
// fixtures.js partage (celui-ci n'en fournit qu'un seul), pour prouver
// que sourceCount>=2 et que les sourceId sont bien distincts.
//
// argv: mono05Root eforchBackendDir mono03BackendDir snapshotBackendDir runId

const path = require("path");
const [, , mono05Root, eforchBackendDir, mono03BackendDir, snapshotBackendDir] = process.argv;

const { buildDurableComponents } = require(path.join(__dirname, "..", "..", "lib", "durable-real-env.js"));
const { createFileDurableBackend } = require(path.join(__dirname, "..", "..", "lib", "file-durable-backend.js"));
const { prepareRealScreening, buildAuditDecisionsTemplate } = require(path.join(__dirname, "..", "..", "lib", "real-screening-workflow.js"));

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }
const HASH64 = "7".repeat(64);

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}
function buildRealProvenance() {
  return {
    resolverRuns: [{ provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
    plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
    plannerOutput: {
      sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "j" }],
      queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "q", justification: "j" }],
      retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "s", retryPolicy: "r", rateLimitPolicy: "rl", budgetMax: "b" }],
      criteresInclusion: ["c1"], criteresExclusion: ["e1"], regleDedoublonnage: "DOI", methodeQualification: "Q",
    },
    humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel (CROSS_PROCESS R5)" },
  };
}
// DEUX enregistrements distincts — jamais un seul (mandat section 30).
function buildTwoRecordFetchImpl() {
  return async function () {
    return jsonResponse({ results: [
      { display_name: "Record CROSS_PROCESS A", authorships: [{ author: { display_name: "Author A" } }], publication_date: "2024-01-01", doi: "10.1/CPA", id: "https://openalex.org/WCPA" },
      { display_name: "Record CROSS_PROCESS B", authorships: [{ author: { display_name: "Author B" } }], publication_date: "2024-02-02", doi: "10.1/CPB", id: "https://openalex.org/WCPB" },
    ] });
  };
}

async function main() {
  const env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: {}, secrets: {} });
  const snapshotBackend = createFileDurableBackend(snapshotBackendDir);

  const mission = buildMission();
  const documentBytesByUrl = { "https://example.invalid/t1": new TextEncoder().encode("Contenu de test document 1 (CROSS_PROCESS R5)") };

  const prepResult = await prepareRealScreening(env, {
    mission: mission, missionQuestion: "Question CROSS_PROCESS R5 ?", documentBytesByUrl: documentBytesByUrl,
    openAlexFetchImpl: buildTwoRecordFetchImpl(), realProvenance: buildRealProvenance(), snapshotBackend: snapshotBackend,
  });

  const snapshot = await snapshotBackend.get("retrieval-snapshots", prepResult.snapshotId);
  const template = buildAuditDecisionsTemplate(snapshot);

  console.log("WORKER_PREPARE_RESULT:" + JSON.stringify({
    pid: process.pid,
    state: prepResult.state,
    snapshotId: prepResult.snapshotId,
    snapshotHash: prepResult.snapshotHash,
    missionId: prepResult.missionId,
    sourceCount: prepResult.sourceCount,
    sourceIds: prepResult.sourceIds,
    templateDecisionsAllNull: template.decisions.every(function (d) { return d.acteur === null && d.date === null && d.decision === null && d.justification === null; }),
  }));
  process.exit(0);
}

main().catch(function (e) {
  console.error("WORKER_PREPARE_FATAL:" + (e && e.stack));
  process.exit(2);
});
