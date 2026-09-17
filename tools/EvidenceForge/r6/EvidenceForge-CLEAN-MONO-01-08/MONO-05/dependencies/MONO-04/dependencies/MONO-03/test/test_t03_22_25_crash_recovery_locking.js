"use strict";
const { freshMono03, mono03On, createSampleRun, orderedNodeIds } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  // === T03-22 crash after artifact before SUCCESS ===
  {
    const { backend, mono03 } = freshMono03();
    const runId = "run-t0322";
    await createSampleRun(mono03, runId, "mission-t0322");
    await mono03.runStore.markNodeRunning(runId, "EF-PR-GEN-01");

    const payload = { schema: "EvidenceForge.MissionDimensionSet", v: 1 };
    await mono03.artifactStore.putArtifact({ runId, nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId: "mission-t0322", payload });

    const mono03B = mono03On(backend);
    const reloaded = await mono03B.runStore.loadRun(runId);
    check("T03-22. artefact écrit avant un crash simulé, mais l'état du nœud reste RUNNING (jamais un SUCCESS déduit de la seule présence de l'artefact)", reloaded.nodeStates["EF-PR-GEN-01"].state === "RUNNING", reloaded.nodeStates["EF-PR-GEN-01"].state);

    const completed = await mono03B.runStore.recordNodeSuccess({ runId, nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId: "mission-t0322", payload });
    check("T03-22b. rejouer recordNodeSuccess() avec le même payload après le crash complète proprement le protocole (idempotent)", completed.nodeStates["EF-PR-GEN-01"].state === "SUCCESS");
  }

  // === T03-23 crash after RUNNING before output ===
  {
    const { backend, mono03 } = freshMono03();
    const runId = "run-t0323";
    await createSampleRun(mono03, runId, "mission-t0323");
    await mono03.runStore.markNodeRunning(runId, "EF-02A");

    const mono03B = mono03On(backend);
    const reloaded = await mono03B.runStore.loadRun(runId);
    check("T03-23. après un crash pendant RUNNING (aucun output produit), le nœud reste RUNNING dans le RunState retrouvé — jamais un état inventé", reloaded.nodeStates["EF-02A"].state === "RUNNING");

    const plan = await mono03B.coordinator.getResumePlan(runId, orderedNodeIds());
    const entry = plan.reasoningCodes.find((r) => r.nodeId === "EF-02A");
    check("T03-23b. le plan de reprise classe ce nœud RUNNING+RESTART_STAGE dans nodesToReplay (comportement natif attendu)", plan.nodesToReplay.includes("EF-02A") && entry.policy === "RESTART_STAGE", JSON.stringify(entry));
  }

  // === T03-24 duplicate execution prevented + T03-25 lock released correctly ===
  {
    const { mono03 } = freshMono03();
    const runId = "run-t0324";
    await createSampleRun(mono03, runId, "mission-t0324");

    await mono03.runLock.acquireRunLock(runId, "orchestrator-A");
    let secondAcquireRejected = false;
    try {
      await mono03.runLock.acquireRunLock(runId, "orchestrator-B");
    } catch (e) {
      secondAcquireRejected = e.code === "RUN_LOCKED";
    }
    check("T03-24. un second acquireRunLock() sur le même run déjà verrouillé -> RUN_LOCKED, jamais un double-verrou silencieux", secondAcquireRejected);

    let releaseByWrongOwnerRejected = false;
    try {
      await mono03.runLock.releaseRunLock(runId, "orchestrator-B");
    } catch (e) {
      releaseByWrongOwnerRejected = e.code === "RUN_LOCKED";
    }
    check("T03-24b. releaseRunLock() par un tiers non-propriétaire -> refusé, jamais une libération par un autre orchestrateur", releaseByWrongOwnerRejected);

    await mono03.runLock.releaseRunLock(runId, "orchestrator-A");
    const nowFree = await mono03.runLock.isLocked(runId);
    check("T03-25. releaseRunLock() par le bon propriétaire libère effectivement le verrou", nowFree === false);

    const reAcquire = await mono03.runLock.acquireRunLock(runId, "orchestrator-B");
    check("T03-25b. après libération, un autre orchestrateur peut acquérir le verrou normalement", reAcquire.ownerId === "orchestrator-B");
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
