"use strict";
// test/cross-process/worker-resume-screening.js — PROCESSUS B (R5, mandat
// section 31).
//
// Processus Node SEPARE, lance APRES la sortie complete du processus A
// (worker-prepare-screening.js) : aucune variable/objet/Map/instance
// mono01/mono03/mono04 du processus A n'existe ici. N'ouvre QUE les
// backends durables FICHIER (memes dossiers sur disque) : reconstruit le
// runtime a neuf, charge le RetrievalSnapshot PAR SON snapshotId (jamais
// une reference JS transmise), injecte des auditDecisions LOCAL_CONTROLLED
// construites depuis les sourceId REELS recus en argument (produits par le
// processus A, jamais devines a l'avance), appelle resumeRealScreening()
// (POST_RETRIEVAL_GATE + createRealMissionRunFromSnapshot, AUCUNE logique
// dupliquee ici), puis termine l'execution du graphe.
//
// Aucun openAlexFetchImpl n'est jamais passe ici : resumeRealScreening()
// ne peut architecturalement pas re-declencher EF-01C2 (buildReplayConnectorRunners
// resout depuis les donnees persistees du snapshot, zero fetchImpl
// implique par construction — voir lib/eforch-artifacts.js).
//
// argv: mono05Root mono07LibPath eforchBackendDir mono03BackendDir snapshotBackendDir runId snapshotId sourceIdsJson

const path = require("path");
const [, , mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, snapshotBackendDir, runId, snapshotId, sourceIdsJson] = process.argv;

const { buildDurableComponents } = require(path.join(__dirname, "..", "..", "lib", "durable-real-env.js"));
const { createFileDurableBackend } = require(path.join(__dirname, "..", "..", "lib", "file-durable-backend.js"));
const { resumeRealScreening } = require(path.join(__dirname, "..", "..", "lib", "real-screening-workflow.js"));
const fx = require("./fixtures.js");

function buildMission() {
  return { dimensions: [{ id: "DIM_A", label: "Dimension A" }], targetDocuments: [{ documentId: "t1", title: "Target 1", url: "https://example.invalid/t1" }] };
}

async function main() {
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  const sourceIds = JSON.parse(sourceIdsJson);

  const env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: {}, secrets: {} });
  const snapshotBackend = createFileDurableBackend(snapshotBackendDir);

  // Etat AVANT reprise : preuve que ce processus n'a rien en memoire tant
  // qu'il n'a pas explicitement rejoue depuis le disque.
  const graphBefore = await env.operatorApi.getGraph(runId).catch(function (e) { return { error: e.message }; });

  const auditDecisionsInput = {
    snapshotId: snapshotId,
    snapshotHash: null, // recalcule par le processus lui-meme via le snapshot charge (voir ci-dessous)
    missionId: null,
    decisions: sourceIds.map(function (sid) {
      return { sourceId: sid, acteur: "human", date: new Date().toISOString(), decision: "inclus", justification: "Pertinent (CROSS_PROCESS R5, processus B)." };
    }),
  };
  // snapshotHash/missionId doivent correspondre EXACTEMENT au snapshot
  // reellement persiste par le processus A — recharges ici depuis le
  // MEME disque (jamais devines), avant construction finale de l'input.
  const persistedSnapshot = await snapshotBackend.get("retrieval-snapshots", snapshotId);
  auditDecisionsInput.snapshotHash = persistedSnapshot.snapshotHash;
  auditDecisionsInput.missionId = persistedSnapshot.missionId;

  const documentContentByUrl = fx.buildDocumentContentByUrl();

  // Adaptateur/workerCallFn LOCAL_CONTROLLED partages avec T-NEW-01/02/03
  // (test/cross-process/fixtures.js) — n'appellent jamais mono04, aucun
  // reseau reel possible via ce chemin de test.
  const resumeResult = await resumeRealScreening(env, fx.buildLocalControlledAdapter(), fx.buildWorkerCallFn(), {
    runId: runId, snapshotBackend: snapshotBackend, snapshotId: snapshotId, auditDecisionsInput: auditDecisionsInput,
    mission: buildMission(), documentContentByUrl: documentContentByUrl,
  });

  // stopBeforeNode:"EF-PR-GEN-01" — meme convention que worker-a.js :
  // prouve que EF-ORCH-SUBSYSTEM (donc EF-01C2 REJOUE + EF-01D construit
  // depuis le snapshot) atteint SUCCESS, sans exiger la construction d'un
  // adaptateur LOCAL_CONTROLLED complet pour la suite du graphe (hors
  // perimetre de la preuve CROSS_PROCESS R5, deja couverte ailleurs par
  // T-NEW-01/02/03 et test_t08_runner_orchestration.js).
  await driveRun(env.operatorApi, runId, { stopBeforeNode: "EF-PR-GEN-01" });
  const graph = await env.operatorApi.getGraph(runId);
  const efOrch = graph.nodes.find(function (n) { return n.nodeId === "EF-ORCH-SUBSYSTEM"; });
  const othersUntouched = graph.nodes.every(function (n) {
    return n.nodeId === "EF-ORCH-SUBSYSTEM" || ["NOT_STARTED", "READY"].indexOf(n.state) !== -1;
  });
  const ok = !!efOrch && efOrch.state === "SUCCESS" && othersUntouched;

  console.log("WORKER_RESUME_RESULT:" + JSON.stringify({
    pid: process.pid,
    ok: ok,
    efOrchState: efOrch && efOrch.state,
    resumeMissionId: resumeResult && resumeResult.missionId,
    graphBeforeRehydrate: graphBefore,
    graph: graph.nodes.map(function (n) { return { nodeId: n.nodeId, state: n.state }; }),
  }));
  process.exit(ok ? 0 : 1);
}

main().catch(function (e) {
  console.error("WORKER_RESUME_FATAL:" + (e && e.stack));
  process.exit(2);
});
