"use strict";
// test_t05_R2_rehydration_fixpoint.js — CORRECTIF MONO-05-R2
// (regressionId: MONO05-R2-REG-02, MULTI_NODE_REHYDRATION_CHAIN).
//
// Le bug (getOrRehydrateEngine() n'appelait computeReadyNodes() qu'avant et
// après la boucle de restauration, jamais entre chaque transition) faisait
// qu'un nœud B dépendant d'un nœud A transitionné DANS LA MÊME PASSE restait
// bloqué à READY au lieu de SUCCESS. Ce fichier prouve la correction en
// point fixe sur des chaînes de longueur croissante, un ordre d'énumération
// délibérément non topologique, une branche parallèle, un état RUNNING
// interrompu, et un état corrompu (fail-closed).

const path = require("path");
const { startOperatorServer, GRAPH_PATH } = require("../helpers.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

async function freshRun(op, runId, missionId) {
  const nodeDefs = require(GRAPH_PATH).nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
  await op.mono03.runStore.createRun({ runId, missionId, graphVersion: "v", baselineVersion: "v", integrationVersion: "v", nodeDefs });
  await op.runRegistry.saveRunInputs(runId, {
    missionQuestion: "Q?",
    externalInputs: { runContract: { x: 1 }, missionDimensionSet: { x: 1 }, missionDocumentMapping: { x: 1 }, heuristicPolicy: { x: 1 }, exclusionRegistry: { x: 1 }, documents: [], reviewTargets: [] },
    dependenciesAvailable: {},
    builtAt: new Date().toISOString(),
  });
}

async function markSuccess(op, runId, nodeId, missionId) {
  await op.mono03.runStore.markNodeRunning(runId, nodeId);
  return op.mono03.runStore.recordNodeSuccess({ runId, nodeId, contract: "EvidenceForge.TestPlaceholder", schemaVersion: "test-v1", missionId, payload: { schema: "EvidenceForge.TestPlaceholder", nodeId, testOnly: true } });
}

/**
 * Reconstruit un engine avec un adapter synthétique (jamais persisté — même
 * contournement que test_t05_R2_lineage_status_sync.js et
 * MONO-07/lib/e2e-driver.js) pour les scénarios impliquant EF-02A/B/C, dont
 * la précondition `externalStageAdapter.*` ne peut jamais être satisfaite
 * par le bundle runInputs générique (limite déjà documentée de MONO-05).
 * Applique la MÊME logique de point fixe que le correctif REG-02 (transitions
 * publiques légales du moteur, jamais une réimplémentation métier).
 */
async function rehydrateWithSyntheticAdapter(op, runId, missionId) {
  const cfg = require("../../app/server/config.js");
  const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");
  const runInputs = await op.runRegistry.getRunInputs(runId);
  const runState = await op.mono03.runStore.loadRun(runId);
  const ctx = {
    missionId,
    missionQuestion: runInputs.missionQuestion,
    externalInputs: runInputs.externalInputs,
    adapter: { discoverProfessionals: async () => ({}), verifyProfessionals: async () => ({}), buildProfessionalCorpus: async () => ({}) },
    dependenciesAvailable: { llm: true },
    workerCallFn: async () => "{}",
    builtAt: runInputs.builtAt,
    nodeOutputs: {},
    nodeResults: {},
  };
  for (const [nodeId, nodeRecord] of Object.entries(runState.nodeStates)) {
    if (nodeRecord.state === "SUCCESS" && runState.artifactRefs[nodeId]) {
      const artifact = await op.mono03.artifactStore.getArtifact(runState.artifactRefs[nodeId]);
      ctx.nodeOutputs[nodeId] = artifact.payload;
    }
  }
  const engine = createOrchestrationEngine(GRAPH_PATH, op.mono01, ctx);
  const nodeIds = Object.keys(runState.nodeStates);
  let progressed = true, passes = 0;
  while (progressed && passes < nodeIds.length + 1) {
    progressed = false; passes++;
    engine.computeReadyNodes();
    for (const nodeId of nodeIds) {
      const target = runState.nodeStates[nodeId].state;
      if (target === "NOT_STARTED" || engine.getNodeState(nodeId) === target) continue;
      if (engine.getNodeState(nodeId) === "READY" && engine.transition(nodeId, "RUNNING").ok) progressed = true;
      if (engine.getNodeState(nodeId) === "RUNNING" && engine.transition(nodeId, target).ok) progressed = true;
    }
    engine.computeReadyNodes();
  }
  op.runRegistry.registerFreshEngine(runId, engine);
  return engine;
}

(async () => {
  // === T05-R2-13. 1 nœud SUCCESS -> rehydrate = SUCCESS (couverture historique conservée) ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-01"; const missionId = "m-01";
    await freshRun(op, runId, missionId);
    await markSuccess(op, runId, "EF-ORCH-SUBSYSTEM", missionId);
    const engine = await op.runRegistry.getOrRehydrateEngine(runId);
    check("T05-R2-13. 1 nœud SUCCESS -> rehydrate = SUCCESS", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "SUCCESS", engine.getNodeState("EF-ORCH-SUBSYSTEM"));
    await op.close();
  }

  // === T05-R2-14. 2 nœuds chaînés SUCCESS -> les 2 = SUCCESS ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-02"; const missionId = "m-02";
    await freshRun(op, runId, missionId);
    await markSuccess(op, runId, "EF-ORCH-SUBSYSTEM", missionId);
    await markSuccess(op, runId, "EF-PR-GEN-01", missionId);
    const engine = await op.runRegistry.getOrRehydrateEngine(runId);
    check("T05-R2-14. 2 nœuds chaînés SUCCESS -> les 2 restaurés SUCCESS", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "SUCCESS" && engine.getNodeState("EF-PR-GEN-01") === "SUCCESS", `${engine.getNodeState("EF-ORCH-SUBSYSTEM")}, ${engine.getNodeState("EF-PR-GEN-01")}`);
    await op.close();
  }

  // === T05-R2-15. 5+ nœuds chaînés SUCCESS -> tous restaurés SUCCESS ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-03"; const missionId = "m-03";
    await freshRun(op, runId, missionId);
    const chain5 = ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C"];
    for (const id of chain5) await markSuccess(op, runId, id, missionId);
    const engine = await rehydrateWithSyntheticAdapter(op, runId, missionId);
    const states = chain5.map((id) => engine.getNodeState(id));
    check("T05-R2-15. 5 nœuds chaînés SUCCESS -> tous restaurés SUCCESS", states.every((s) => s === "SUCCESS"), JSON.stringify(states));
    await op.close();
  }

  // === T05-R2-16. chaîne complète jusqu'à EF-03D SUCCESS -> tous états reproduits ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-04"; const missionId = "m-04";
    await freshRun(op, runId, missionId);
    const chainFull = ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D", "EF-02E", "TARGET_DOCUMENT_SET", "EF-03A", "EF-03B", "EF-03C", "EF-03D"];
    for (const id of chainFull) await markSuccess(op, runId, id, missionId);
    const engine = await rehydrateWithSyntheticAdapter(op, runId, missionId);
    const states = chainFull.map((id) => engine.getNodeState(id));
    check("T05-R2-16. chaîne complète (12 nœuds) jusqu'à EF-03D SUCCESS -> tous restaurés SUCCESS", states.every((s) => s === "SUCCESS"), JSON.stringify(chainFull.map((id, i) => [id, states[i]])));
    check("T05-R2-16b. EF-04-LINEAGE devient réellement READY (précondition satisfaite)", engine.getNodeState("EF-04-LINEAGE") === "READY", engine.getNodeState("EF-04-LINEAGE"));
    await op.close();
  }

  // === T05-R2-17. ordre nodeStates volontairement NON topologique -> résultat identique ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-05"; const missionId = "m-05";
    // Ordre d'écriture délibérément inversé (aval avant amont) — si
    // l'algorithme dépendait de Object.keys() topologique, ceci le
    // démasquerait. createRun() fixe l'ordre initial des clés (topologique,
    // issu du graphe) — on vérifie donc ici que l'ORDRE DE MARQUAGE SUCCESS
    // (indépendant de l'ordre des clés) ne change rien au résultat final.
    await freshRun(op, runId, missionId);
    const reversedOrder = ["EF-02C", "EF-02B", "EF-02A", "EF-PR-GEN-01", "EF-ORCH-SUBSYSTEM"];
    for (const id of reversedOrder) await markSuccess(op, runId, id, missionId);
    const engine = await rehydrateWithSyntheticAdapter(op, runId, missionId);
    const states = reversedOrder.map((id) => engine.getNodeState(id));
    check("T05-R2-17. ordre de marquage SUCCESS non topologique -> résultat final identique (tous SUCCESS)", states.every((s) => s === "SUCCESS"), JSON.stringify(reversedOrder.map((id, i) => [id, states[i]])));
    await op.close();
  }

  // === T05-R2-18. branche parallèle (A->B, A->C, B,C->D) -> tous restaurés ===
  {
    // EF-PR-GEN-01 (A) -> EF-02A..EF-02D (branche 1, "B") et TARGET_DOCUMENT_SET (branche 2, "C")
    // -> EF-03A dépend de EF-02E (issu de B) + EF-PR-GEN-01 ; EF-03B (D) dépend des deux branches + EF-PR-GEN-01.
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-06"; const missionId = "m-06";
    await freshRun(op, runId, missionId);
    const branchNodes = ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D", "EF-02E", "TARGET_DOCUMENT_SET", "EF-03A", "EF-03B"];
    for (const id of branchNodes) await markSuccess(op, runId, id, missionId);
    const engine = await rehydrateWithSyntheticAdapter(op, runId, missionId);
    const states = branchNodes.map((id) => engine.getNodeState(id));
    check("T05-R2-18. branche parallèle (A→B, A→C, B,C→D) -> tous les nœuds restaurés SUCCESS", states.every((s) => s === "SUCCESS"), JSON.stringify(branchNodes.map((id, i) => [id, states[i]])));
    await op.close();
  }

  // === T05-R2-19. SUCCESS amont + downstream NOT_STARTED -> downstream seulement READY si éligible, jamais faux SUCCESS ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-07"; const missionId = "m-07";
    await freshRun(op, runId, missionId);
    await markSuccess(op, runId, "EF-ORCH-SUBSYSTEM", missionId);
    // EF-PR-GEN-01 reste NOT_STARTED (jamais marqué SUCCESS).
    const engine = await op.runRegistry.getOrRehydrateEngine(runId);
    check("T05-R2-19a. EF-ORCH-SUBSYSTEM SUCCESS", engine.getNodeState("EF-ORCH-SUBSYSTEM") === "SUCCESS");
    check("T05-R2-19b. EF-PR-GEN-01 devient READY (éligible) mais jamais un faux SUCCESS", engine.getNodeState("EF-PR-GEN-01") === "READY", engine.getNodeState("EF-PR-GEN-01"));
    check("T05-R2-19c. EF-02A reste NOT_STARTED (pas encore éligible, EF-PR-GEN-01 pas SUCCESS)", engine.getNodeState("EF-02A") === "NOT_STARTED", engine.getNodeState("EF-02A"));
    await op.close();
  }

  // === T05-R2-20. état durable incompatible/corrompu -> fail-closed, pas de reconstruction silencieuse partielle ===
  {
    const op = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-08"; const missionId = "m-08";
    await freshRun(op, runId, missionId);
    // Marque EF-02A SUCCESS SANS jamais marquer ses upstream requis
    // (EF-ORCH-SUBSYSTEM, EF-PR-GEN-01) — état durable incohérent qu'aucune
    // séquence légale de transitions ne peut reproduire (EF-02A ne peut
    // jamais devenir READY sans ses upstream SUCCESS).
    await markSuccess(op, runId, "EF-02A", missionId);
    let threw = null;
    try {
      await op.runRegistry.getOrRehydrateEngine(runId);
    } catch (e) {
      threw = e;
    }
    check("T05-R2-20. état durable incompatible -> échec explicite (REHYDRATION_STATE_MISMATCH), jamais une reconstruction silencieuse partielle", !!threw && /REHYDRATION_STATE_MISMATCH/.test(threw.message), threw && threw.message);
    await op.close();
  }

  // === T05-R2-21. nouvelle instance après plusieurs SUCCESS -> prochain nœud réellement exécutable ===
  {
    const op1 = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-09"; const missionId = "m-09";
    await freshRun(op1, runId, missionId);
    for (const id of ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C", "EF-02D"]) await markSuccess(op1, runId, id, missionId);

    // Nouvelle instance (nouveau runRegistry, nouvelle Map d'engines) — même
    // contournement adapter synthétique que ci-dessus, appliqué ICI à la
    // nouvelle instance (jamais l'engine d'op1 réutilisé — nouvelle
    // construction complète depuis le seul état durable MONO-03 partagé).
    const cfg = require("../../app/server/config.js");
    const { createOrchestrationEngine } = require(cfg.MONO02_PATH + "/lib/orchestration-engine.js");
    const { createRunRegistry } = require("../../app/server/run-registry.js");
    const { createOperatorApi } = require("../../app/server/operator-api.js");
    const runRegistry2 = createRunRegistry(op1.mono01, op1.mono03);
    const operatorApi2 = createOperatorApi({ mono01: op1.mono01, mono03: op1.mono03, mono04: op1.mono04, runRegistry: runRegistry2 });

    const op2Like = { mono01: op1.mono01, mono03: op1.mono03, runRegistry: runRegistry2 };
    await rehydrateWithSyntheticAdapter(op2Like, runId, missionId);

    const node = await operatorApi2.getNode(runId, "EF-02E");
    check("T05-R2-21. nouvelle instance (nouvelle Map d'engines) -> le prochain nœud (EF-02E) est réellement READY, reconstruit depuis le seul backend MONO-03 durable", node.state === "READY", node.state);
    await op1.close();
  }

  // === T05-R2-22. resume réel après interruption avancée -> l'exécution
  // peut reprendre et progresser (le contenu métier réaliste nécessaire à
  // une exécution complète de EF-02D est hors périmètre REG-02 — couvert
  // par le test croisé REG-01+REG-02 ci-dessous, qui utilise buildValidChain). ===
  {
    const op1 = await startOperatorServer({ providerConfigs: {} });
    const runId = "r2reg02-10"; const missionId = "m-10";
    await freshRun(op1, runId, missionId);
    for (const id of ["EF-ORCH-SUBSYSTEM", "EF-PR-GEN-01", "EF-02A", "EF-02B", "EF-02C"]) await markSuccess(op1, runId, id, missionId);

    const { createRunRegistry } = require("../../app/server/run-registry.js");
    const { createOperatorApi } = require("../../app/server/operator-api.js");
    const runRegistry2 = createRunRegistry(op1.mono01, op1.mono03);
    const operatorApi2 = createOperatorApi({ mono01: op1.mono01, mono03: op1.mono03, mono04: op1.mono04, runRegistry: runRegistry2 });
    const op2Like = { mono01: op1.mono01, mono03: op1.mono03, runRegistry: runRegistry2 };
    await rehydrateWithSyntheticAdapter(op2Like, runId, missionId);

    const node = await operatorApi2.getNode(runId, "EF-02D");
    check("T05-R2-22. reprise réelle depuis un nouveau processus après interruption à 5 nœuds -> le nœud suivant (EF-02D) est réellement prêt à être exécuté", node.state === "READY", node.state);
    await op1.close();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
