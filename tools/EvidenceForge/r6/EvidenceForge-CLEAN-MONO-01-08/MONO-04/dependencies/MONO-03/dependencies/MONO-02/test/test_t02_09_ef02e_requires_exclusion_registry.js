"use strict";
const { buildMono01, createOrchestrationEngine, GRAPH_PATH, buildFullContext, driveEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const mono01 = buildMono01();

  // Sans exclusionRegistry (jamais fourni) -> EF-02E ne peut jamais atteindre SUCCESS,
  // même si tout le reste de la chaîne amont réussit.
  const ctxNoRegistry = await buildFullContext("mission-t0209a");
  delete ctxNoRegistry.externalInputs.exclusionRegistry;
  const engineNoRegistry = createOrchestrationEngine(GRAPH_PATH, mono01, ctxNoRegistry);
  await driveEngine(engineNoRegistry, { maxIterations: 10 });
  check("1. sans exclusionRegistry, EF-02D SUCCESS mais EF-02E jamais SUCCESS", engineNoRegistry.getNodeState("EF-02D") === "SUCCESS" && engineNoRegistry.getNodeState("EF-02E") !== "SUCCESS", `EF-02D=${engineNoRegistry.getNodeState("EF-02D")} EF-02E=${engineNoRegistry.getNodeState("EF-02E")}`);
  check("2. la chaîne en aval d'EF-02E (EF-03A...EF-04A) ne progresse jamais non plus", ["EF-03A", "EF-03B", "EF-03C", "EF-03D", "EF-04-LINEAGE", "EF-04A"].every((id) => engineNoRegistry.getNodeState(id) === "NOT_STARTED"));

  // Avec un registre VIDE mais explicitement fourni -> EF-02E réussit normalement.
  const ctxEmptyRegistry = await buildFullContext("mission-t0209b");
  ctxEmptyRegistry.externalInputs.exclusionRegistry = { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [] };
  const engineEmptyRegistry = createOrchestrationEngine(GRAPH_PATH, mono01, ctxEmptyRegistry);
  await driveEngine(engineEmptyRegistry, { maxIterations: 14 });
  check("3. registre d'exclusion VIDE mais explicite -> EF-02E SUCCESS", engineEmptyRegistry.getNodeState("EF-02E") === "SUCCESS", engineEmptyRegistry.getNodeState("EF-02E"));
  check("4. la chaîne complète va jusqu'à EF-04A SUCCESS avec un registre vide explicite", engineEmptyRegistry.getNodeState("EF-04A") === "SUCCESS");

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
