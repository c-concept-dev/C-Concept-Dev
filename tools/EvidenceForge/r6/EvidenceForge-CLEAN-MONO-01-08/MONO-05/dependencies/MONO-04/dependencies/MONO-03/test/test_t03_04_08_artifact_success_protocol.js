"use strict";
const { freshMono03, createSampleRun } = require("./fixtures.js");
const { sha256Hex } = require("../lib/canonical-hash.js");
const { computeArtifactId } = require("../lib/artifact-store.js");
const { createInMemoryBackend } = require("../lib/persistence-backend.js");
const { createMono03 } = require("../index.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const { backend, mono03 } = freshMono03();
  await createSampleRun(mono03, "run-t0304", "mission-t0304");

  // T03-04 persist artifact
  const record = await mono03.artifactStore.putArtifact({
    runId: "run-t0304", nodeId: "EF-ORCH-SUBSYSTEM", contract: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", missionId: "mission-t0304",
    payload: { schema: "EvidenceForge.CorpusSnapshot", schemaVersion: "EF-01F-v1", missionId: "mission-t0304", hashOuChecksum: "x" },
  });
  check("T03-04. putArtifact() persiste et retourne un ArtifactRecord complet", !!record.artifactId && !!record.contentHash, JSON.stringify(record.artifactId));

  // T03-05 artifact hash verified
  const fetched = await mono03.artifactStore.getArtifact(record.artifactId);
  check("T03-05. getArtifact() revérifie le contentHash à la lecture (identique ici)", fetched.contentHash === record.contentHash);

  // T03-06 artifact corruption detected
  const raw = await backend.get("artifacts", record.artifactId);
  await backend.put("artifacts", record.artifactId, { ...raw, payload: { ...raw.payload, hashOuChecksum: "TAMPERED" } });
  let corruptionDetected = false;
  try {
    await mono03.artifactStore.getArtifact(record.artifactId);
  } catch (e) {
    corruptionDetected = e.code === "PERSISTED_ARTIFACT_MISMATCH";
  }
  check("T03-06. corruption du payload détectée à la lecture -> PERSISTED_ARTIFACT_MISMATCH, jamais une réparation heuristique", corruptionDetected);

  // T03-07 SUCCESS requires persisted output
  let successWithoutArtifact = false;
  try {
    await mono03.runStore.recordNodeSuccess({ runId: "run-t0304", nodeId: "EF-PR-GEN-01", contract: "x", schemaVersion: "x", missionId: "mission-t0304", payload: undefined });
  } catch (e) {
    successWithoutArtifact = e.code === "SUCCESS_WITHOUT_ARTIFACT";
  }
  check("T03-07. recordNodeSuccess() sans payload -> SUCCESS_WITHOUT_ARTIFACT, jamais un SUCCESS sans artefact", successWithoutArtifact);

  // T03-08 write failure prevents SUCCESS
  const payload = { schema: "EvidenceForge.MissionDimensionSet", value: 1 };
  const contentHash = sha256Hex(payload);
  const artifactId = computeArtifactId({ runId: "run-t0308", nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId: "mission-t0308", contentHash });
  const backendFailing = createInMemoryBackend({ failNextPutFor: ["artifacts:" + artifactId] });
  const mono03c = createMono03({ persistenceBackend: backendFailing });
  await createSampleRun(mono03c, "run-t0308", "mission-t0308");
  await mono03c.runStore.markNodeRunning("run-t0308", "EF-PR-GEN-01");
  let writeFailed = false;
  try {
    await mono03c.runStore.recordNodeSuccess({ runId: "run-t0308", nodeId: "EF-PR-GEN-01", contract: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1", missionId: "mission-t0308", payload });
  } catch (e) {
    writeFailed = e.code === "PERSISTENCE_WRITE_FAILED";
  }
  check("T03-08a. échec d'écriture simulé de l'artefact -> l'exception se propage (PERSISTENCE_WRITE_FAILED)", writeFailed);
  const stateAfter = await mono03c.runStore.loadRun("run-t0308");
  check("T03-08b. le nœud reste RUNNING (jamais un faux SUCCESS) après l'échec d'écriture", stateAfter.nodeStates["EF-PR-GEN-01"].state === "RUNNING", stateAfter.nodeStates["EF-PR-GEN-01"].state);

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
