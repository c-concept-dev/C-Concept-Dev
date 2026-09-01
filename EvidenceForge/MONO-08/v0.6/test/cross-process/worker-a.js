"use strict";
// test/cross-process/worker-a.js — PROCESSUS A (T-NEW-01/02/03, preuve
// CROSS_PROCESS reelle).
//
// Processus Node INDEPENDANT (lance par test_t08_cross_process.js via
// child_process.spawn) : construit ses PROPRES instances mono01/mono03
// (jamais partagees, jamais recues par IPC), injecte le backend durable
// FICHIER (lib/file-durable-backend.js) au lieu du backend en memoire par
// defaut de MONO-05/config.js (Option A de composition, jamais une
// modification de createOperatorBackends() ni d'aucun lot gele). Cree un
// run, l'avance jusqu'a EF-ORCH-SUBSYSTEM=SUCCESS SEULEMENT
// (stopBeforeNode), persiste, puis se termine COMPLETEMENT (process.exit)
// — aucun etat ne survit dans ce processus au-dela de cette sortie.
//
// REMEDIATION R2 (B-01) : reutilise lib/durable-real-env.js::
// buildDurableComponents() — LA MEME fonction que bin/run-real-smoke.js
// (processus A du chemin REEL) et lib/cross-process-restart-worker.js
// (processus B du chemin REEL) emploient desormais, jamais une seconde
// construction dupliquee ici. Ce test prouve donc, en LOCAL_CONTROLLED,
// exactement la meme mecanique de composition que le chemin REEL utilise.
//
// argv: mono05Root mono07LibPath eforchBackendDir mono03BackendDir runId [stopBeforeNode]
// stopBeforeNode optionnel (defaut "EF-PR-GEN-01", pour compatibilite avec
// test_t08_cross_process.js) — passer une chaine vide force un drive
// COMPLET (14/14), utilise par test_t08_r2_closure.js (B-01) pour preparer
// un run deja termine avant d'y brancher lib/cross-process-restart-worker.js.

const path = require("path");
const [, , mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId, stopBeforeNodeArg] = process.argv;
const stopBeforeNode = typeof stopBeforeNodeArg === "undefined" ? "EF-PR-GEN-01" : (stopBeforeNodeArg || null);

const { buildDurableComponents } = require(path.join(__dirname, "..", "..", "lib", "durable-real-env.js"));
const { createRealMissionRun } = require(path.join(__dirname, "..", "..", "lib", "real-e2e-driver.js"));
const fx = require("./fixtures.js");

async function main() {
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  // providerConfigs/secrets vides : les adaptateurs LOCAL_CONTROLLED
  // (fx.buildLocalControlledAdapter()/buildWorkerCallFn()) n'appellent
  // jamais mono04 — aucun reseau reel possible via ce chemin de test.
  const env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: {}, secrets: {} });
  const operatorApi = env.operatorApi;

  await createRealMissionRun(env, fx.buildLocalControlledAdapter(), fx.buildWorkerCallFn(), {
    runId: runId, mission: fx.buildMission(), missionQuestion: "Question CROSS_PROCESS ?",
    documentBytesByUrl: fx.buildDocumentBytesByUrl(), documentContentByUrl: fx.buildDocumentContentByUrl(),
    openAlexFetchImpl: fx.buildOpenAlexFetchImpl(),
  });

  await driveRun(operatorApi, runId, stopBeforeNode ? { stopBeforeNode: stopBeforeNode } : { maxIterations: 20 });
  const graph = await operatorApi.getGraph(runId);
  const efOrch = graph.nodes.find(function (n) { return n.nodeId === "EF-ORCH-SUBSYSTEM"; });
  let ok;
  if (stopBeforeNode) {
    // READY est un etat calcule EN DIRECT par l'engine (jamais persiste par
    // mono03.runStore : seuls SUCCESS/FAILED/BLOCKED le sont) — EF-PR-GEN-01
    // peut legitimement apparaitre READY ici (ses dependances sont
    // satisfaites) sans jamais avoir ete EXECUTE. "Aucun autre noeud execute"
    // signifie : aucun etat persistant (SUCCESS/FAILED/BLOCKED) ailleurs
    // qu'EF-ORCH-SUBSYSTEM.
    const othersUntouched = graph.nodes.every(function (n) {
      return n.nodeId === "EF-ORCH-SUBSYSTEM" || ["NOT_STARTED", "READY"].indexOf(n.state) !== -1;
    });
    ok = !!efOrch && efOrch.state === "SUCCESS" && othersUntouched;
  } else {
    ok = graph.nodes.every(function (n) { return n.state === "SUCCESS"; });
  }

  console.log("WORKER_A_RESULT:" + JSON.stringify({
    ok: ok, pid: process.pid, efOrchState: efOrch && efOrch.state, stopBeforeNode: stopBeforeNode,
    graph: graph.nodes.map(function (n) { return { nodeId: n.nodeId, state: n.state }; }),
  }));
  process.exit(ok ? 0 : 1);
}

main().catch(function (e) {
  console.error("WORKER_A_FATAL:" + e.stack);
  process.exit(2);
});
