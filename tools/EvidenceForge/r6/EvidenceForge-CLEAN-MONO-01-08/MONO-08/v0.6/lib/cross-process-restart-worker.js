#!/usr/bin/env node
"use strict";
/**
 * MONO-08 — lib/cross-process-restart-worker.js
 *
 * REMEDIATION R2 (B-01) : PROCESSUS B du persistence-restart RÉEL de
 * bin/run-real-smoke.js. Lancé via child_process.spawn par le processus
 * A (bin/run-real-smoke.js lui-même) SEULEMENT après que A ait persisté
 * l'état du run et se soit engagé à ne plus le toucher — jamais en
 * parallèle. Processus Node OS RÉEL et SÉPARÉ (PID distinct, cache de
 * modules propre à ce processus) : reconstruit mono01/mono03/mono04/
 * runRegistry/operatorApi À NEUF, ouvre UNIQUEMENT les dossiers durables
 * sur disque (aucun objet JS reçu de A — seules des chaînes via argv),
 * réhydrate via real-e2e-driver.js::rehydrateRealMissionRun() (fonction
 * déjà existante et testée, jamais réimplémentée ici), termine le run.
 *
 * Réutilise lib/durable-real-env.js::buildDurableComponents() À
 * L'IDENTIQUE de ce que le processus A utilise — même mécanique, jamais
 * une seconde implémentation parallèle (voir mandat R2, section 6/7).
 *
 * Secrets : JAMAIS transmis via argv (visibles dans la liste des
 * processus) — hérités de process.env (comportement par défaut de
 * child_process.spawn sans option `env`, donc identiques à ceux du
 * processus A qui l'a lancé).
 *
 * argv : mono05Root mono07LibPath eforchBackendDir mono03BackendDir runId missionId
 */

const path = require("path");
const [, , mono05Root, mono07LibPath, eforchBackendDir, mono03BackendDir, runId, missionId] = process.argv;

const { buildDurableComponents } = require("./durable-real-env");
const { rehydrateRealMissionRun } = require("./real-e2e-driver");
const { buildRealProviderConfigs } = require("./real-provider-configs");
const { buildRealExternalStageAdapter, buildRealLlmWorkerCallFn } = require("./real-external-adapter");
const { realOpenAlexFetchImpl } = require("./real-openalex-fetch");

async function main() {
  if (!mono05Root || !mono07LibPath || !eforchBackendDir || !mono03BackendDir || !runId || !missionId) {
    throw new Error("cross-process-restart-worker: arguments manquants (mono05Root mono07LibPath eforchBackendDir mono03BackendDir runId missionId requis).");
  }
  const providerConfigs = buildRealProviderConfigs();
  const env = buildDurableComponents(mono05Root, {
    eforchBackendDir: eforchBackendDir, mono03BackendDir: mono03BackendDir,
    providerConfigs: providerConfigs, secrets: process.env,
  });

  const adapter = buildRealExternalStageAdapter(env.mono04, { runId: runId, missionId: missionId });
  const workerCallFn = buildRealLlmWorkerCallFn(env.mono04, { runId: runId, missionId: missionId });
  const timeoutMs = parseInt(process.env.EVIDENCEFORGE_HTTP_TIMEOUT_MS || "8000", 10);
  const openAlexFetchImpl = realOpenAlexFetchImpl(timeoutMs);

  await rehydrateRealMissionRun(env, adapter, workerCallFn, openAlexFetchImpl, runId);

  const { driveRun } = require(path.join(mono07LibPath, "e2e-driver.js"));
  await driveRun(env.operatorApi, runId, { maxIterations: 20 });

  const graph = await env.operatorApi.getGraph(runId);
  const allSuccess = graph.nodes.every(function (n) { return n.state === "SUCCESS"; });

  console.log("RESTART_WORKER_RESULT:" + JSON.stringify({
    allSuccess: allSuccess, pid: process.pid,
    graph: graph.nodes.map(function (n) { return { nodeId: n.nodeId, state: n.state }; }),
  }));
  process.exit(allSuccess ? 0 : 1);
}

main().catch(function (e) {
  console.error("RESTART_WORKER_FATAL:" + e.stack);
  process.exit(2);
});
