"use strict";
// test/cross-process/worker-b.js — PROCESSUS B (T-NEW-01/02/03, preuve
// CROSS_PROCESS reelle).
//
// Processus Node SEPARE, lance APRES la sortie complete du processus A
// (test_t08_cross_process.js attend son exit avant de lancer celui-ci) :
// aucune variable, aucun objet, aucun Map, aucune instance mono01/mono03
// du processus A n'existe ici — le cache de modules Node est propre a ce
// processus, donc require(...) reconstruit des instances entierement
// nouvelles, meme pour des fichiers deja charges par le processus A.
// N'ouvre QUE le backend durable FICHIER (meme baseDir sur disque) :
// reconstruit le runtime a neuf, rehydrate via rehydrateRealMissionRun()
// (deja teste ailleurs, jamais reimplemente ici), puis termine l'execution
// jusqu'a 14/14 SUCCESS.
//
// REMEDIATION R2 (B-01) : reutilise lib/durable-real-env.js::
// buildDurableComponents() — LA MEME fonction que lib/cross-process-
// restart-worker.js (processus B du chemin REEL) emploie desormais.
//
// argv: mono05Root mono07LibPath eforchBackendDir mono03BackendDir runId

const path = require("path");
const [, , mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId] = process.argv;

const { buildDurableComponents } = require(path.join(__dirname, "..", "..", "lib", "durable-real-env.js"));
const { rehydrateRealMissionRun } = require(path.join(__dirname, "..", "..", "lib", "real-e2e-driver.js"));
const fx = require("./fixtures.js");

async function main() {
  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));

  // MEME baseDir que le processus A, sur disque — une instance de backend
  // DIFFERENTE (aucune reference JS partagee), pointant vers le MEME
  // contenu durable.
  const env = buildDurableComponents(mono05Root, { eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir, providerConfigs: {}, secrets: {} });
  const operatorApi = env.operatorApi;

  // Etat AVANT reprise : preuve que ce processus n'a rien en memoire tant
  // qu'il n'a pas explicitement rehydrate depuis le disque.
  const graphBefore = await operatorApi.getGraph(runId).catch(function (e) { return { error: e.message }; });

  await rehydrateRealMissionRun(env, fx.buildLocalControlledAdapter(), fx.buildWorkerCallFn(), fx.buildOpenAlexFetchImpl(), runId);
  await driveRun(operatorApi, runId, { maxIterations: 20 });

  const graph = await operatorApi.getGraph(runId);
  const allSuccess = graph.nodes.every(function (n) { return n.state === "SUCCESS"; });

  console.log("WORKER_B_RESULT:" + JSON.stringify({
    allSuccess: allSuccess, pid: process.pid,
    graphBeforeRehydrate: graphBefore,
    graph: graph.nodes.map(function (n) { return { nodeId: n.nodeId, state: n.state }; }),
  }));
  process.exit(allSuccess ? 0 : 1);
}

main().catch(function (e) {
  console.error("WORKER_B_FATAL:" + e.stack);
  process.exit(2);
});
