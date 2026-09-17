"use strict";
const { freshMono03, createSampleRun, orderedNodeIds } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { mono03 } = freshMono03();
  await createSampleRun(mono03, "run-t0309", "mission-t0309");
  await mono03.runStore.markNodeRunning("run-t0309", "EF-ORCH-SUBSYSTEM");
  const payload = { schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1" };
  const s1 = await mono03.runStore.recordNodeSuccess({ runId: "run-t0309", nodeId: "EF-ORCH-SUBSYSTEM", contract: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", missionId: "mission-t0309", payload });

  const s2 = await mono03.runStore.recordNodeSuccess({ runId: "run-t0309", nodeId: "EF-ORCH-SUBSYSTEM", contract: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", missionId: "mission-t0309", payload });
  check("T03-09. re-enregistrer le MÊME artefact SUCCESS est idempotent (aucune erreur, même artifactId)", s2.nodeStates["EF-ORCH-SUBSYSTEM"].outputArtifactRefs[0] === s1.nodeStates["EF-ORCH-SUBSYSTEM"].outputArtifactRefs[0]);

  let refusedReplay = false;
  try {
    await mono03.runStore.markNodeRunning("run-t0309", "EF-ORCH-SUBSYSTEM");
  } catch (e) {
    refusedReplay = e.code === "RUN_STATE_CONFLICT";
  }
  check("T03-10a. markNodeRunning() sur un nœud déjà SUCCESS -> refusé (RUN_STATE_CONFLICT), jamais rejoué", refusedReplay);

  let refusedDifferentArtifact = false;
  try {
    await mono03.runStore.recordNodeSuccess({ runId: "run-t0309", nodeId: "EF-ORCH-SUBSYSTEM", contract: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", missionId: "mission-t0309", payload: { schema: "EvidenceForge.CorpusSnapshot", different: true } });
  } catch (e) {
    refusedDifferentArtifact = e.code === "RUN_STATE_CONFLICT";
  }
  check("T03-10b. re-enregistrer un artefact DIFFÉRENT sur un nœud déjà SUCCESS -> refusé, jamais un écrasement silencieux", refusedDifferentArtifact);

  const plan1 = await mono03.coordinator.getResumePlan("run-t0309", orderedNodeIds());
  const plan2 = await mono03.coordinator.getResumePlan("run-t0309", orderedNodeIds());
  check("T03-11. computeResumePlan() est déterministe (même RunState + même ordre -> même plan)", JSON.stringify(plan1) === JSON.stringify(plan2));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
