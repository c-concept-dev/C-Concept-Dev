"use strict";
const { freshMono03, createSampleRun, mono03On } = require("./fixtures.js");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

const MONO01_PATH = path.join(__dirname, "..", "dependencies", "MONO-02", "dependencies", "MONO-01");
const { createMono01 } = require(path.join(MONO01_PATH, "index.js"));
const EFOrchDurableBackend = require(path.join(MONO01_PATH, "dependencies", "ef-orch-durable-backend-v0.1.js"));
const efOrchFixtures = require(path.join(MONO01_PATH, "test", "fixtures-eforch.js"));
const MONO00_REGISTRY_PATH = path.join(MONO01_PATH, "registry", "mono-00-frozen-baseline-registry-v1.json");

(async () => {
  const { mono03 } = freshMono03();
  const runId = "run-t0318";
  const missionId = "mission-t0318";
  await createSampleRun(mono03, runId, missionId);

  const efOrchBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const mono01A = createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend: efOrchBackend });

  const confirmed = await efOrchFixtures.buildConfirmedRunContract(missionId);
  const resolverTrace = efOrchFixtures.buildResolverTrace(missionId, confirmed);
  const searchProtocol = await efOrchFixtures.buildSearchProtocol(missionId, "t0318");
  const { runner: oaRunner } = efOrchFixtures.buildOpenAlexRunner("oa-t0318");
  const efOrchRunId = "eforch-run-t0318";

  await mono03.runStore.markNodeRunning(runId, "EF-ORCH-SUBSYSTEM");
  const startResult = await mono01A.efOrchExecutionPort.start(confirmed, {
    runId: efOrchRunId, ef01aInjected: efOrchFixtures.buildEF01AInjected(missionId),
    resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
  });

  await mono03.runStore.setEFOrchRunIdentity(runId, startResult.output.efOrchRunIdentity, startResult.output.efOrchNativeStatus);
  const stateWithIdentity = await mono03.runStore.loadRun(runId);
  check("T03-18. efOrchRunIdentity et efOrchNativeStatus persistés dans le RunState global", stateWithIdentity.efOrchRunIdentity === efOrchRunId && stateWithIdentity.efOrchNativeStatus === startResult.output.efOrchNativeStatus, JSON.stringify({ id: stateWithIdentity.efOrchRunIdentity, status: stateWithIdentity.efOrchNativeStatus }));

  await mono03.runStore.recordNodePaused(runId, "EF-ORCH-SUBSYSTEM", { reason: "gate en attente (simulation)" });

  const reloadedState = await mono03.runStore.loadRun(runId);
  const mono01B = createMono01(MONO00_REGISTRY_PATH, { efOrchDurableBackend: efOrchBackend });
  const statusFromB = await mono01B.efOrchExecutionPort.getStatus(reloadedState.efOrchRunIdentity);
  check("T03-19. le run EF-ORCH démarré par mono01A est retrouvé par mono01B (process B) via l'efOrchRunIdentity persisté par MONO-03", statusFromB.status !== "NOT_AVAILABLE" && statusFromB.completedStages.includes("EF-01A"), JSON.stringify(statusFromB));

  const fs = require("fs");
  const libFiles = fs.readdirSync(path.join(__dirname, "..", "lib")).map((f) => path.join(__dirname, "..", "lib", f));
  const forbiddenPatterns = [/runOutputs/, /checkpointIdentities/, /stateMachineSnapshots/, /EFOrchStateMachine/, /EFOrchDurableStageRunner/, /ef-orch-/, /currentStageId/, /advanceStage/];
  const violations = [];
  for (const f of libFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const re of forbiddenPatterns) {
      if (re.test(src)) violations.push({ file: path.basename(f), pattern: String(re) });
    }
  }
  check("T03-20. aucun fichier lib/ de MONO-03 ne référence les structures/namespaces internes d'EF-ORCH", violations.length === 0, JSON.stringify(violations));

  const mono03SecondInstance = mono03On(mono03.backend);
  const stateFromSecondInstance = await mono03SecondInstance.runStore.loadRun(runId);
  check("T03-21. une seconde instance createMono03() (même backend) retrouve exactement le RunState laissé par la première", stateFromSecondInstance.efOrchRunIdentity === efOrchRunId && stateFromSecondInstance.nodeStates["EF-ORCH-SUBSYSTEM"].state === "PAUSED", JSON.stringify(stateFromSecondInstance.nodeStates["EF-ORCH-SUBSYSTEM"]));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error("ERREUR FATALE:", e.stack); process.exit(2); });
