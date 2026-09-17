"use strict";
const { createMono01 } = require("../index.js");
const { REGISTRY_PATH } = require("./fixtures.js");
const fx = require("./fixtures-eforch.js");
const EFOrchDurableBackend = require("../dependencies/ef-orch-durable-backend-v0.1.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

// T01-22 — Teste la VRAIE factory d'intégration createMono01(registry, options),
// pas uniquement le port isolé : la frontière d'injection du backend EF-ORCH
// doit traverser createMono01() sans que celui-ci ne construise ni ne
// possède jamais ce backend lui-même.

(async () => {
  // 1. createMono01(registry) SANS backend -> les 15 autres ports restent
  //    pleinement utilisables, mais efOrchExecutionPort ne peut fournir
  //    aucune garantie de durabilité (refus explicite au premier usage réel).
  const mono01NoBackend = createMono01(REGISTRY_PATH);
  check("1. createMono01() sans options -> efOrchExecutionPort existe (construction jamais refusée)", !!mono01NoBackend.efOrchExecutionPort);
  check("1b. createMono01() sans options -> efOrchExecutionPort.durableBackend est null", mono01NoBackend.efOrchExecutionPort.durableBackend === null);
  check("1c. les 15 autres ports restent pleinement construits et distincts (createMono01 sans backend ne casse rien d'autre)", Object.keys(mono01NoBackend).length === 16);

  const missionId1 = "mission-t0122-nobackend";
  const confirmed1 = await fx.buildConfirmedRunContract(missionId1);
  const startNoBackend = await mono01NoBackend.efOrchExecutionPort.start(confirmed1, {});
  check(
    "2. createMono01(registry) sans backend -> ne peut PAS fournir un EFOrchExecutionPort exploitable durablement (start() refuse explicitement)",
    startNoBackend.status === "FAILED" && /aucun durableBackend injecté/i.test(startNoBackend.diagnostics.error.message),
    JSON.stringify(startNoBackend.diagnostics)
  );

  // 2. Un autre port de MONO-01 (indépendant d'EF-ORCH) continue de
  //    fonctionner normalement sur cette même instance sans backend EF-ORCH —
  //    la frontière d'injection ne dégrade jamais le reste de MONO-01.
  const missionPortResult = await mono01NoBackend.missionPort.validateHeuristicPolicy({ schema: "EvidenceForge.HeuristicPolicy", schemaVersion: "EF-PR-GEN-v1", status: "test_unvalidated", values: { x: 1 } }, null, { missionId: missionId1 });
  check("3. les autres ports (ex: MissionPort) fonctionnent normalement sur une instance createMono01() sans backend EF-ORCH", missionPortResult.status === "SUCCESS", JSON.stringify(missionPortResult.diagnostics));

  // 3. LA VRAIE FACTORY D'INTÉGRATION : deux instances createMono01() DISTINCTES,
  //    partageant explicitement le MÊME backend EF-ORCH — start() sur l'une,
  //    getStatus()/resume() sur l'autre, état retrouvé.
  const sharedBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const mono1 = createMono01(REGISTRY_PATH, { efOrchDurableBackend: sharedBackend });
  const mono2 = createMono01(REGISTRY_PATH, { efOrchDurableBackend: sharedBackend });

  check("4. mono1 et mono2 sont deux instances createMono01() totalement distinctes", mono1 !== mono2 && mono1.efOrchExecutionPort !== mono2.efOrchExecutionPort);
  check("4b. mono1 et mono2 partagent explicitement le même backend EF-ORCH (injection réussie à travers createMono01)", mono1.efOrchExecutionPort.durableBackend === sharedBackend && mono2.efOrchExecutionPort.durableBackend === sharedBackend);

  const missionId2 = "mission-t0122-shared";
  const runId2 = "run-t0122-shared";
  const confirmed2 = await fx.buildConfirmedRunContract(missionId2);
  const resolverTrace2 = fx.buildResolverTrace(missionId2, confirmed2);
  const searchProtocol2 = await fx.buildSearchProtocol(missionId2, "t0122shared");
  const { runner: oaRunner2 } = fx.buildOpenAlexRunner("oa-t0122shared");

  const r1 = await mono1.efOrchExecutionPort.start(confirmed2, {
    runId: runId2,
    ef01aInjected: fx.buildEF01AInjected(missionId2),
    resolverTrace: resolverTrace2,
    searchProtocol: searchProtocol2,
    connectorRunners: { openalex: oaRunner2 },
    protocolHash: searchProtocol2.protocolHash,
  });
  check("5. mono1.efOrchExecutionPort.start() progresse réellement (via la vraie factory d'intégration)", r1.status === "SUCCESS" && r1.output.completedStages.includes("EF-01C2"), JSON.stringify(r1.output));

  const status2 = await mono2.efOrchExecutionPort.getStatus(runId2);
  check(
    "6. mono2.efOrchExecutionPort.getStatus() (instance createMono01 DISTINCTE) retrouve l'état exact du run démarré par mono1",
    status2.status === "running" && status2.completedStages.includes("EF-01C2"),
    JSON.stringify(status2)
  );

  const r2 = await mono2.efOrchExecutionPort.resume(runId2, {
    screeningArtifact: fx.buildScreeningArtifact(["oa-t0122shared"], searchProtocol2.protocolHash),
    protocolHash: searchProtocol2.protocolHash,
  });
  check("7. mono2.efOrchExecutionPort.resume() (instance distincte) continue réellement l'exécution jusqu'à EF-01D", r2.status === "SUCCESS" && r2.output.completedStages.includes("EF-01D"), JSON.stringify(r2.output));

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error("ERREUR FATALE :", e.stack);
  process.exit(2);
});
