"use strict";
const { freshMono03, createSampleRun, orderedNodeIds } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { mono03 } = freshMono03();
  const runId = "run-t0312";
  await createSampleRun(mono03, runId, "mission-t0312");

  const scenarios = [
    { nodeId: "EF-02A", expectedPolicy: "RESTART_STAGE", expectedBucket: "nodesToReplay", testId: "T03-12" },
    { nodeId: "EF-ORCH-SUBSYSTEM", expectedPolicy: "RESUME_CHECKPOINT", expectedBucket: "nodesToResume", testId: "T03-13" },
    { nodeId: "EF-03B", expectedPolicy: "REPLAY_MISSING_ONLY", expectedBucket: "nodesToResume", testId: "T03-14" },
    { nodeId: "EF-03D", expectedPolicy: "RECOMPUTE_DETERMINISTIC", expectedBucket: "nodesToRecompute", testId: "T03-15" },
    { nodeId: "EF-02E", expectedPolicy: "EXPLICIT_REBUILD_REQUIRED", expectedBucket: "nodesBlocked", testId: "T03-16" },
    { nodeId: "EF-04-LINEAGE", expectedPolicy: "NO_RETRY", expectedBucket: "nodesBlocked", testId: "T03-17" },
  ];

  for (const s of scenarios) {
    await mono03.runStore.markNodeRunning(runId, s.nodeId);
    await mono03.runStore.recordNodeFailure(runId, s.nodeId, { message: "échec simulé pour " + s.nodeId });
  }

  const plan = await mono03.coordinator.getResumePlan(runId, orderedNodeIds());

  for (const s of scenarios) {
    const entry = plan.reasoningCodes.find((r) => r.nodeId === s.nodeId);
    check(`${s.testId}. ${s.nodeId} (retryPolicy=${s.expectedPolicy}) classé dans ${s.expectedBucket}`, plan[s.expectedBucket].includes(s.nodeId) && entry && entry.policy === s.expectedPolicy, JSON.stringify(entry));
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
