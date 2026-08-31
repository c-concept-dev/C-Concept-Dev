"use strict";
// test/cross-process/worker-a.js — PROCESSUS A (T-NEW-01/02/03, preuve
// CROSS_PROCESS reelle).
//
// Processus Node INDEPENDANT (lance par test_t08_cross_process.js via
// child_process.spawn) : construit ses PROPRES instances mono01/mono03
// (jamais partagees, jamais recues par IPC), injecte le backend durable
// FICHIER (lib/file-durable-backend.js) au lieu du backend en memoire par
// defaut de MONO-05/config.js (Option A de composition, jamais une
// modification de createOperatorBackends() ni d'aucun lot gele) via
// createMono01/createMono03 directement. Cree un run, l'avance jusqu'a
// EF-ORCH-SUBSYSTEM=SUCCESS SEULEMENT (stopBeforeNode), persiste, puis
// se termine COMPLETEMENT (process.exit) — aucun etat ne survit dans ce
// processus au-dela de cette sortie.
//
// argv: mono05Root mono07LibPath eforchBackendDir mono03BackendDir runId

const path = require("path");
const [, , mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId] = process.argv;

const { createFileDurableBackend } = require(path.join(__dirname, "..", "..", "lib", "file-durable-backend.js"));
const { createRealMissionRun } = require(path.join(__dirname, "..", "..", "lib", "real-e2e-driver.js"));
const fx = require("./fixtures.js");

async function main() {
  const cfg = require(path.join(mono05Root, "app", "server", "config.js"));
  const { createMono01 } = require(path.join(cfg.MONO01_PATH, "index.js"));
  const { createMono03 } = require(path.join(cfg.MONO04_PATH, "dependencies", "MONO-03", "index.js"));
  const { createMono04 } = require(path.join(cfg.MONO04_PATH, "index.js"));
  const { createStaticSecretProvider } = require(path.join(cfg.MONO04_PATH, "lib", "secret-provider.js"));
  const { createRunRegistry } = require(path.join(mono05Root, "app", "server", "run-registry.js"));
  const { createOperatorApi } = require(path.join(mono05Root, "app", "server", "operator-api.js"));
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));

  const efOrchBackend = createFileDurableBackend(eforchBackendDir);
  const mono03Backend = createFileDurableBackend(mono03BackendDir);
  const mono01 = createMono01(cfg.REGISTRY_PATH, { efOrchDurableBackend: efOrchBackend });
  const mono03 = createMono03({ persistenceBackend: mono03Backend });
  const mono04 = createMono04({ providerConfigs: {}, secretProvider: createStaticSecretProvider({}) }); // jamais de reseau reel: adapter/workerCallFn LOCAL_CONTROLLED n'appellent jamais mono04
  const runRegistry = createRunRegistry(mono01, mono03);
  const operatorApi = createOperatorApi({ mono01: mono01, mono03: mono03, mono04: mono04, runRegistry: runRegistry });
  const env = { mono01: mono01, mono03: mono03, mono04: mono04, runRegistry: runRegistry, operatorApi: operatorApi, cfg: cfg };

  await createRealMissionRun(env, fx.buildLocalControlledAdapter(), fx.buildWorkerCallFn(), {
    runId: runId, mission: fx.buildMission(), missionQuestion: "Question CROSS_PROCESS ?",
    documentBytesByUrl: fx.buildDocumentBytesByUrl(), documentContentByUrl: fx.buildDocumentContentByUrl(),
    openAlexFetchImpl: fx.buildOpenAlexFetchImpl(),
  });

  await driveRun(operatorApi, runId, { stopBeforeNode: "EF-PR-GEN-01" });
  const graph = await operatorApi.getGraph(runId);
  const efOrch = graph.nodes.find(function (n) { return n.nodeId === "EF-ORCH-SUBSYSTEM"; });
  // READY est un etat calcule EN DIRECT par l'engine (jamais persiste par
  // mono03.runStore : seuls SUCCESS/FAILED/BLOCKED le sont) — EF-PR-GEN-01
  // peut legitimement apparaitre READY ici (ses dependances sont
  // satisfaites) sans jamais avoir ete EXECUTE. "Aucun autre noeud execute"
  // signifie : aucun etat persistant (SUCCESS/FAILED/BLOCKED) ailleurs
  // qu'EF-ORCH-SUBSYSTEM.
  const othersUntouched = graph.nodes.every(function (n) {
    return n.nodeId === "EF-ORCH-SUBSYSTEM" || ["NOT_STARTED", "READY"].indexOf(n.state) !== -1;
  });
  const ok = !!efOrch && efOrch.state === "SUCCESS" && othersUntouched;

  console.log("WORKER_A_RESULT:" + JSON.stringify({
    ok: ok, pid: process.pid, efOrchState: efOrch && efOrch.state, othersUntouched: othersUntouched,
    graph: graph.nodes.map(function (n) { return { nodeId: n.nodeId, state: n.state }; }),
  }));
  process.exit(ok ? 0 : 1);
}

main().catch(function (e) {
  console.error("WORKER_A_FATAL:" + e.stack);
  process.exit(2);
});
