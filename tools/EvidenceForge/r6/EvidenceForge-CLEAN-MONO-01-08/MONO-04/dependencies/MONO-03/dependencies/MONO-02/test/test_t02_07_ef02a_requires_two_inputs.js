"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Graphe : EF-02A déclare bien les deux requiredInputs (déjà vérifié en T02-01),
  // ici on vérifie le comportement d'exécution réel.

  // Cas 1 : EF-PR-GEN-01 jamais lancé (donc pas de missionDimensionSet résolu) -> EF-02A jamais READY.
  const ctx1 = await buildFullContext("mission-t0207a");
  const engine1 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx1);
  engine1.computeReadyNodes();
  await engine1.runNode("EF-ORCH-SUBSYSTEM");
  engine1.computeReadyNodes();
  check("1. EF-02A pas READY tant qu'EF-PR-GEN-01 (source de MissionDimensionSet) n'a pas SUCCESS", engine1.getNodeState("EF-02A") !== "READY");

  // Cas 2 : EF-ORCH jamais lancé (donc pas de CorpusSnapshot résolu côté upstream requis) -> EF-02A jamais READY.
  const ctx2 = await buildFullContext("mission-t0207b");
  const engine2 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx2);
  engine2.computeReadyNodes(); // ne devrait promouvoir qu'EF-ORCH pour l'instant
  check("2. EF-02A pas READY tant qu'EF-ORCH n'a pas SUCCESS", engine2.getNodeState("EF-02A") !== "READY");

  // Cas 3 : les deux upstream SUCCESS -> EF-02A devient READY et s'exécute avec les DEUX objets réels.
  const ctx3 = await buildFullContext("mission-t0207c");
  const engine3 = createOrchestrationEngine(GRAPH_PATH, mono01, ctx3);
  await driveEngine(engine3, { maxIterations: 3 });
  check("3. après EF-ORCH+EF-PR-GEN-01 SUCCESS, EF-02A devient READY puis SUCCESS", engine3.getNodeState("EF-02A") === "SUCCESS", engine3.getNodeState("EF-02A"));
  check("4. la sortie d'EF-02A est bien un ProfessionalDiscovery/EF-02A-v2 réel", engine3.context.nodeOutputs["EF-02A"].schema === "EvidenceForge.ProfessionalDiscovery" && engine3.context.nodeOutputs["EF-02A"].schemaVersion === "EF-02A-v2");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
