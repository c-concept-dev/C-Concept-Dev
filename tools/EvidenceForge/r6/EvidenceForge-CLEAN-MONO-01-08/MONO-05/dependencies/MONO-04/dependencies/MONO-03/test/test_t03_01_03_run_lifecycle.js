"use strict";
const { freshMono03, createSampleRun } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { mono03 } = freshMono03();

  // T03-01 create run
  const created = await createSampleRun(mono03, "run-t0301", "mission-t0301");
  check("T03-01. createRun() produit un RunState complet avec les 14 nœuds réels de MONO-02", created.runId === "run-t0301" && Object.keys(created.nodeStates).length === 14, JSON.stringify(Object.keys(created.nodeStates).length));
  check("T03-01b. tous les nœuds démarrent NOT_STARTED", Object.values(created.nodeStates).every((n) => n.state === "NOT_STARTED"));
  check("T03-01c. createRun() refuse d'écraser un run existant (RUN_STATE_CONFLICT)", await mono03.runStore.createRun({ runId: "run-t0301", missionId: "x", nodeDefs: [] }).then(() => false, (e) => e.code === "RUN_STATE_CONFLICT"));

  // T03-02 load run
  const loaded = await mono03.runStore.loadRun("run-t0301");
  check("T03-02. loadRun() retrouve exactement le RunState créé", loaded.runId === "run-t0301" && loaded.missionId === "mission-t0301");

  // T03-03 unknown run rejected
  let rejected = false;
  try {
    await mono03.runStore.loadRun("run-jamais-cree");
  } catch (e) {
    rejected = e.code === "RUN_NOT_FOUND";
  }
  check("T03-03. loadRun() sur un run inconnu -> RUN_NOT_FOUND explicite", rejected);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
