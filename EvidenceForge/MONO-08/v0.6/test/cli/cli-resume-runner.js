"use strict";
// test/cli/cli-resume-runner.js — sous-processus dedie a
// test_t08_r6_closure.js (R6-03/R6-04/R6-09) : prouve que le VRAI point
// d'entree CLI `--phase resume` (bin/run-real-smoke.js::runResumePhase,
// exporte, jamais reimplemente ici) appelle reellement
// resumeRealScreening() — avec un adapter/workerCallFn LOCAL_CONTROLLED
// injecte via le 5e parametre `deps`, et driveRunOpts:{stopBeforeNode:
// "EF-PR-GEN-01"} (meme convention que test/cross-process/worker-a.js,
// R2/R5) pour ne pas exiger un adaptateur complet au-dela de la preuve
// EF-ORCH-SUBSYSTEM=SUCCESS visee ici.
//
// argv: kitRoot mono07LibPath persistenceDir runId snapshotId auditDecisionsPath

const path = require("path");
const [, , kitRoot, mono07LibPath, persistenceDir, runId, snapshotId, auditDecisionsPath] = process.argv;
process.env.EVIDENCEFORGE_PERSISTENCE_DIR = persistenceDir;

const runner = require(path.join(__dirname, "..", "..", "bin", "run-real-smoke.js"));

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
  };
}

const cliArgs = { runId: runId, snapshotId: snapshotId, auditDecisionsPath: auditDecisionsPath };
runner.runResumePhase(kitRoot, mono07LibPath, buildCompleteMission(), cliArgs, {
  adapter: {}, workerCallFn: async function () { return "{}"; },
  driveRunOpts: { stopBeforeNode: "EF-PR-GEN-01" },
}).catch(function (e) { console.error("CLI_RESUME_RUNNER_FATAL:" + e.stack); process.exit(3); });
