"use strict";
const { createBaselinePort } = require("../lib/baseline-port.js");
const { createEFOrchExecutionPort } = require("../ports/ef-orch-execution-port.js");
const EFOrchDurableBackend = require("../dependencies/ef-orch-durable-backend-v0.1.js");
const fx = require("./fixtures-eforch.js");
const { REGISTRY_PATH } = require("./fixtures.js");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  const baselinePort = createBaselinePort(REGISTRY_PATH);

  // === EF-ORCH-DURABLE-01 — port1/start, port2/getStatus, retrouvé sans Map partagée ===
  {
    const sharedBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const port1 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });

    const missionId = "mission-durable01";
    const runId = "run-durable01";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "durable01");
    const { runner: oaRunner } = fx.buildOpenAlexRunner("oa-durable01");

    const r1 = await port1.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
      screeningArtifact: fx.buildScreeningArtifact(["oa-durable01"], searchProtocol.protocolHash),
    });
    check("EF-ORCH-DURABLE-01a. port1.start() progresse (AWAITING_DEPENDENCIES à EF-01E)", r1.status === "SUCCESS" && r1.output.awaitingStage === "EF-01E", JSON.stringify(r1.output));

    // port2 : INSTANCE DISTINCTE, aucune Map partagée avec port1 — seul le backend est commun.
    const port2 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });
    const status2 = await port2.getStatus(runId);
    check(
      "EF-ORCH-DURABLE-01b. port2 (nouvelle instance, même backend) retrouve l'état exact via getStatus() SANS Map partagée",
      status2.status === "running" && status2.completedStages.length === 5 && status2.completedStages.includes("EF-01D"),
      JSON.stringify(status2)
    );
  }

  // === EF-ORCH-DURABLE-02 — checkpoint EF-01C2 existant, nouveau port, checkpoint réutilisé, aucun second appel OpenAlex ===
  {
    const sharedBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const port1 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });

    const missionId = "mission-durable02";
    const runId = "run-durable02";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "durable02");
    const { runner: oaRunner, counter } = fx.buildOpenAlexRunner("oa-durable02");

    const r1 = await port1.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
    });
    check("EF-ORCH-DURABLE-02a. port1 : EF-01C2 checkpointé, OpenAlex appelé une fois", r1.output.completedStages.includes("EF-01C2") && counter.calls === 1, JSON.stringify({ completed: r1.output.completedStages, calls: counter.calls }));

    // "Nouveau processus simulé" : port2 est une instance totalement neuve,
    // reconstruite avec un NOUVEAU connectorRunner (compteur séparé) — si le
    // checkpoint EF-01C2 est bien réutilisé, ce second connectorRunner ne
    // doit JAMAIS être invoqué.
    const port2 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });
    const { runner: oaRunner2, counter: counter2 } = fx.buildOpenAlexRunner("oa-durable02-SHOULD-NOT-BE-USED");
    const r2 = await port2.resume(runId, {
      connectorRunners: { openalex: oaRunner2 }, // fourni mais ne doit jamais être appelé pour EF-01C2 (déjà checkpointé)
      protocolHash: searchProtocol.protocolHash,
      screeningArtifact: fx.buildScreeningArtifact(["oa-durable02"], searchProtocol.protocolHash),
    });
    check(
      "EF-ORCH-DURABLE-02b. port2 (nouvelle instance) réutilise le checkpoint EF-01C2 durable — AUCUN second appel OpenAlex, même avec un connectorRunner différent fourni",
      counter2.calls === 0 && counter.calls === 1,
      JSON.stringify({ port1Calls: counter.calls, port2NewRunnerCalls: counter2.calls, r2status: r2.output && r2.output.status })
    );
    check("EF-ORCH-DURABLE-02c. port2 progresse bien au-delà d'EF-01C2 (EF-01D atteint)", r2.status === "SUCCESS" && r2.output.completedStages.includes("EF-01D"), JSON.stringify(r2.output));
  }

  // === EF-ORCH-DURABLE-03 — backend neuf sans run, resume() -> rejet explicite ===
  {
    const freshBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const port = createEFOrchExecutionPort(baselinePort, { durableBackend: freshBackend });
    const r = await port.resume("run-jamais-demarre", {});
    check("EF-ORCH-DURABLE-03. resume() sur un backend neuf sans run préexistant -> rejet explicite (FAILED), jamais un crash silencieux ni une reprise inventée", r.status === "FAILED" && /aucun run durablement connu/i.test(r.diagnostics.error.message), JSON.stringify(r.diagnostics));

    const status = await port.getStatus("run-jamais-demarre");
    check("EF-ORCH-DURABLE-03b. getStatus() sur un run inconnu -> NOT_AVAILABLE, jamais un état inventé", status.status === "NOT_AVAILABLE");
  }

  // === EF-ORCH-DURABLE-04 — corruption du snapshot/checkpoint durable -> rejet fail-closed ===
  {
    const backend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const port1 = createEFOrchExecutionPort(baselinePort, { durableBackend: backend });
    const missionId = "mission-durable04";
    const runId = "run-durable04";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "durable04");
    const { runner: oaRunner } = fx.buildOpenAlexRunner("oa-durable04");

    await port1.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
    });

    // Corruption directe du backend : falsifie la sortie stockée d'EF-01C2
    // (contourne l'API du store, comme le ferait une vraie corruption disque).
    const identityKey = await require("../dependencies/ef-orch-run-output-store-v0.1.js").computeIdentityKey({
      runId, runContractHash: confirmed.runContractHash, stageId: "EF-01C2", protocolHash: searchProtocol.protocolHash,
    });
    const stored = await backend.get("runOutputs", identityKey);
    await backend.put("runOutputs", identityKey, { ...stored, output: { ...stored.output, sourcesTrouvees: [{ tampered: true }] } }); // contenu modifié, outputHash resté celui d'origine -> incohérence détectable

    const port2 = createEFOrchExecutionPort(baselinePort, { durableBackend: backend });
    const r2 = await port2.resume(runId, {
      protocolHash: searchProtocol.protocolHash,
      screeningArtifact: fx.buildScreeningArtifact(["oa-durable04"], searchProtocol.protocolHash),
    });
    check(
      "EF-ORCH-DURABLE-04. checkpoint EF-01C2 corrompu (contenu modifié, hash devenu incohérent) -> rejet fail-closed, jamais une réparation silencieuse",
      r2.status === "FAILED" || (r2.status === "SUCCESS" && r2.output.efOrchNativeStatus === "failed"),
      JSON.stringify(r2.status === "SUCCESS" ? r2.output : r2.diagnostics)
    );
  }

  // === EF-ORCH-DURABLE-05 — fail-closed sans backend ; commodité de test explicite ; partage explicite entre deux ports ===
  {
    // 05a — sans backend injecté, le port EXISTE (construction jamais
    // refusée, pour ne pas casser createMono01() pour ses 15 autres ports)
    // mais REFUSE explicitement toute opération réelle : c'est là qu'est le
    // "REFUS FAIL-CLOSED" — au premier usage réel, jamais un fallback
    // silencieux vers un backend mémoire.
    const portNoBackend = createEFOrchExecutionPort(baselinePort);
    check("EF-ORCH-DURABLE-05a-0. sans durableBackend injecté, port.durableBackend est null (jamais un backend implicite créé)", portNoBackend.durableBackend === null);

    const missionId = "mission-durable05a";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const startAttempt = await portNoBackend.start(confirmed, {});
    check(
      "EF-ORCH-DURABLE-05a. start() sans durableBackend injecté -> REFUS FAIL-CLOSED explicite, jamais un backend mémoire créé silencieusement",
      startAttempt.status === "FAILED" && /aucun durableBackend injecté/i.test(startAttempt.diagnostics.error.message),
      JSON.stringify(startAttempt.diagnostics)
    );
    let getStatusThrew = false;
    try {
      await portNoBackend.getStatus("n-importe-quel-run");
    } catch (e) {
      getStatusThrew = /aucun durableBackend injecté/i.test(e.message);
    }
    check("EF-ORCH-DURABLE-05a-2. getStatus() sans durableBackend injecté -> refus explicite également (pas seulement start())", getStatusThrew);

    // 05b — backend mémoire explicitement injecté -> accepté, pleinement fonctionnel pour les tests.
    const explicitBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const portExplicit = createEFOrchExecutionPort(baselinePort, { durableBackend: explicitBackend });
    check("EF-ORCH-DURABLE-05b. un durableBackend mémoire explicitement injecté est accepté et utilisé (jamais silencieusement remplacé)", portExplicit.durableBackend === explicitBackend);
    const r = await portExplicit.start(confirmed, { runId: "run-durable05b", ef01aInjected: fx.buildEF01AInjected(missionId) });
    check("EF-ORCH-DURABLE-05b-2. avec un backend explicite, start() fonctionne réellement (pas de refus)", r.status === "SUCCESS", JSON.stringify(r.diagnostics));

    // 05c — backend partagé EXPLICITEMENT entre port1 et port2 -> réhydratation réussie (redondant avec DURABLE-01, revérifié ici sous l'angle "05").
    const sharedBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
    const port1 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });
    const port2 = createEFOrchExecutionPort(baselinePort, { durableBackend: sharedBackend });
    const missionId05c = "mission-durable05c";
    const confirmed05c = await fx.buildConfirmedRunContract(missionId05c);
    await port1.start(confirmed05c, { runId: "run-durable05c", ef01aInjected: fx.buildEF01AInjected(missionId05c) });
    const status2 = await port2.getStatus("run-durable05c");
    check("EF-ORCH-DURABLE-05c. backend partagé explicitement entre port1 et port2 -> réhydratation réussie sur une instance distincte", status2.status === "running" && status2.completedStages.includes("EF-01A"), JSON.stringify(status2));
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " — " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error("ERREUR FATALE :", e.stack);
  process.exit(2);
});
