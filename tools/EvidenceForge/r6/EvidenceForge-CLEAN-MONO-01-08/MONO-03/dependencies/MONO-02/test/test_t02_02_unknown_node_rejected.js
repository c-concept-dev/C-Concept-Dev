"use strict";
const { buildFullEngine } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const engine = await buildFullEngine("mission-t0202");

  check("1. getNodeState('EF-99') -> null (nœud inconnu)", engine.getNodeState("EF-99") === null);

  const canRunResult = engine.canRun("EF-99");
  check("2. canRun('EF-99') -> ok:false, ORCHESTRATION_BLOCKED (nœud inconnu)", canRunResult.ok === false && canRunResult.error.code === "ORCHESTRATION_BLOCKED");

  const runResult = await engine.runNode("EF-99");
  check("3. runNode('EF-99') -> ok:false, ORCHESTRATION_BLOCKED", runResult.ok === false && runResult.error.code === "ORCHESTRATION_BLOCKED", JSON.stringify(runResult));

  const transitionResult = engine.transition("EF-99", "READY");
  check("4. transition('EF-99', 'READY') -> ok:false, ORCHESTRATION_BLOCKED", transitionResult.ok === false && transitionResult.error.code === "ORCHESTRATION_BLOCKED");

  check("5. 'EF-99' n'apparaît jamais dans listNodeIds()", !engine.listNodeIds().includes("EF-99"));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})();
