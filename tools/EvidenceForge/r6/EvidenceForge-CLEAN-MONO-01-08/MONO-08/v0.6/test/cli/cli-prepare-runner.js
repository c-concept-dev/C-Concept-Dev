"use strict";
// test/cli/cli-prepare-runner.js — sous-processus dedie a
// test_t08_r6_closure.js (R6-01/R6-02/R6-09) : prouve que le VRAI point
// d'entree CLI `--phase prepare` (bin/run-real-smoke.js::runPreparePhase,
// exporte, jamais reimplemente ici) appelle reellement
// prepareRealScreening() — avec un openAlexFetchImpl LOCAL_CONTROLLED
// injecte via le 5e parametre `deps` (reserve aux appelants
// programmatiques, jamais accessible via un flag CLI reel — voir le
// commentaire de runPreparePhase()).
//
// runPreparePhase() appelle finish() -> process.exit() en interne : ce
// script DOIT donc etre son propre sous-processus (jamais appele en
// process depuis test_t08_r6_closure.js, qui serait sinon lui-meme
// termine par cet appel).
//
// argv: kitRoot mono07LibPath persistenceDir fetchCountFilePath

const path = require("path");
const fs = require("fs");
const [, , kitRoot, mono07LibPath, persistenceDir, fetchCountFilePath] = process.argv;
process.env.EVIDENCEFORGE_PERSISTENCE_DIR = persistenceDir;

const runner = require(path.join(__dirname, "..", "..", "bin", "run-real-smoke.js"));

function jsonResponse(body) { return { ok: true, status: 200, json: async function () { return body; } }; }
const HASH64 = "3".repeat(64);

function buildCompleteMission() {
  return {
    missionId: "r6-cli-mission",
    missionQuestion: "Question R6 CLI ?",
    dimensions: [{ id: "DIM_A", label: "Dimension A" }],
    targetDocuments: [{
      documentId: "t1", title: "Target 1", url: "https://example.invalid/t1", status: "VERIFIED",
      contentBase64: Buffer.from("Contenu de test document 1 (CLI R6)").toString("base64"),
      content: "Contenu de test document 1 (CLI R6) - texte pour EF-03A/EF-03.",
    }],
    readyForExecution: true,
    eForchProvenance: {
      resolverRuns: [{ provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64, proposalCountRaw: 1, proposalCountStored: 1, technicalProposalLimit: 20, targetContextReport: [] }],
      plannerRun: { provider: "p", model: "m", promptVersion: "v", date: new Date().toISOString(), inputHash: HASH64, rawResponseHash: HASH64 },
      plannerOutput: {
        sources: [{ connectorId: "openalex", label: "OpenAlex", justification: "j" }],
        queries: [{ discipline: "DIM_A", connectorId: "openalex", requete: "q", justification: "j" }],
        retrieval: [{ connectorId: "openalex", sortMode: "relevance", pageSize: 25, maxPages: 1, maxResults: 5, stopCondition: "s", retryPolicy: "r", rateLimitPolicy: "rl", budgetMax: "b" }],
        criteresInclusion: ["c1"], criteresExclusion: ["e1"], regleDedoublonnage: "DOI", methodeQualification: "Q",
      },
      humanValidation: { validatedAt: new Date().toISOString(), commentaire: "reel" },
    },
  };
}

let fetchCallCount = 0;
const twoRecordFetchImpl = async function () {
  fetchCallCount++;
  fs.writeFileSync(fetchCountFilePath, String(fetchCallCount));
  return jsonResponse({ results: [
    { display_name: "Record CLI A", authorships: [{ author: { display_name: "Author A" } }], publication_date: "2024-01-01", doi: "10.1/CLIA", id: "https://openalex.org/WCLIA" },
    { display_name: "Record CLI B", authorships: [{ author: { display_name: "Author B" } }], publication_date: "2024-02-02", doi: "10.1/CLIB", id: "https://openalex.org/WCLIB" },
  ] });
};

fs.writeFileSync(fetchCountFilePath, "0");
runner.runPreparePhase(kitRoot, mono07LibPath, buildCompleteMission(), {}, { openAlexFetchImpl: twoRecordFetchImpl })
  .catch(function (e) { console.error("CLI_PREPARE_RUNNER_FATAL:" + e.stack); process.exit(3); });
