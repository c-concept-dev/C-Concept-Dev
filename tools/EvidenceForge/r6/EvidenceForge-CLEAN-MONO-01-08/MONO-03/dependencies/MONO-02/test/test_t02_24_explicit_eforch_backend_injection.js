"use strict";
const { createMono01 } = require("../dependencies/MONO-01/index.js");
const EFOrchDurableBackend = require("../dependencies/MONO-01/dependencies/ef-orch-durable-backend-v0.1.js");
const { createOrchestrationEngine, GRAPH_PATH, MONO00_REGISTRY_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T02-24 — Correction post-audit (frontière d'injection stricte) : MONO-02
// ne doit plus construire createMono01(REGISTRY_PATH) nu pour un scénario
// EF-ORCH — le backend durable doit traverser explicitement
// durableBackend -> createMono01(...) -> EFOrchExecutionPort ->
// EF-ORCH-SUBSYSTEM. Ce test confirme que ce chemin fonctionne réellement à
// travers l'OrchestrationEngine complet, pas seulement le port isolé.

(async () => {
  // 1. createMono01(REGISTRY_PATH) NU (sans backend) -> EF-ORCH-SUBSYSTEM
  //    ne peut jamais réussir réellement : le nœud échoue fail-closed dès
  //    que le graphe tente de l'exécuter.
  const mono01Nu = createMono01(MONO00_REGISTRY_PATH);
  check("1. createMono01(REGISTRY_PATH) nu -> efOrchExecutionPort.durableBackend est null", mono01Nu.efOrchExecutionPort.durableBackend === null);

  const context = await buildFullContext("mission-t0224-nu");
  const engineNu = createOrchestrationEngine(GRAPH_PATH, mono01Nu, context);
  engineNu.computeReadyNodes();
  const runNu = await engineNu.runNode("EF-ORCH-SUBSYSTEM");
  check(
    "2. EF-ORCH-SUBSYSTEM sur un mono01 sans backend injecté -> échoue explicitement (jamais un faux SUCCESS, jamais un backend mémoire créé en douce)",
    runNu.ok === false,
    JSON.stringify(runNu)
  );

  // 2. Le chemin correct : un backend durable explicitement injecté à
  //    travers createMono01(registry, { efOrchDurableBackend }), reçu par
  //    EFOrchExecutionPort, utilisé réellement par EF-ORCH-SUBSYSTEM.
  const explicitBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const mono01Explicit = createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend: explicitBackend });
  check("3. createMono01(registry, { efOrchDurableBackend }) -> le port reçoit exactement ce backend (jamais un autre construit silencieusement)", mono01Explicit.efOrchExecutionPort.durableBackend === explicitBackend);

  const context2 = await buildFullContext("mission-t0224-explicit");
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01Explicit, context2);
  await driveEngine(engine2, { maxIterations: 3 });
  check("4. EF-ORCH-SUBSYSTEM avec un backend explicitement injecté via createMono01 progresse réellement à travers l'OrchestrationEngine", engine2.getNodeState("EF-ORCH-SUBSYSTEM") === "SUCCESS" || engine2.getNodeState("EF-ORCH-SUBSYSTEM") === "RUNNING", engine2.getNodeState("EF-ORCH-SUBSYSTEM"));

  // 3. Deux instances createMono01() DISTINCTES, backend explicitement
  //    partagé -> l'orchestrateur d'une instance peut observer/reprendre un
  //    run démarré par l'orchestrateur de l'autre (même principe que T01-22,
  //    vérifié ici depuis le graphe MONO-02 complet).
  const sharedBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const monoA = createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend: sharedBackend });
  const monoB = createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend: sharedBackend });
  check("5. deux instances createMono01() distinctes partageant explicitement le même backend EF-ORCH", monoA !== monoB && monoA.efOrchExecutionPort.durableBackend === monoB.efOrchExecutionPort.durableBackend);

  const context3 = await buildFullContext("mission-t0224-shared");
  const engineA = createOrchestrationEngine(GRAPH_PATH, monoA, context3);
  engineA.computeReadyNodes();
  const runA = await engineA.runNode("EF-ORCH-SUBSYSTEM");
  check("6. engineA (mono01=monoA) exécute EF-ORCH-SUBSYSTEM", runA.ok === true || engineA.getNodeState("EF-ORCH-SUBSYSTEM") !== "NOT_STARTED", JSON.stringify(runA.error || runA.result));

  // Un runId déterministe (hash du RunContract) permet à monoB.efOrchExecutionPort
  // de retrouver le même run via son propre EF-ORCH-SUBSYSTEM (même backend).
  const runContractHash = context3.externalInputs.runContract.runContractHash;
  const statusFromB = await monoB.efOrchExecutionPort.getStatus(runContractHash);
  check("7. monoB (instance distincte, même backend partagé) retrouve le run démarré via engineA/monoA", statusFromB.status !== "NOT_AVAILABLE", JSON.stringify(statusFromB));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error("ERREUR FATALE :", e.stack);
  process.exit(2);
});
