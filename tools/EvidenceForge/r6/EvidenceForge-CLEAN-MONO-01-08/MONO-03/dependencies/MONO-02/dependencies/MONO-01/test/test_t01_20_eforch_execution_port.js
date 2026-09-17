"use strict";
const { createMono01, REGISTRY_PATH } = require("./fixtures.js");
const fx = require("./fixtures-eforch.js");
const EFOrchDurableBackend = require("../dependencies/ef-orch-durable-backend-v0.1.js");
const fs = require("fs");
const path = require("path");

const results = [];
const check = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

(async () => {
  // Backend mémoire de test injecté EXPLICITEMENT — createMono01() ne le
  // fournit jamais lui-même (correction post-audit, frontière d'injection).
  const testBackend = EFOrchDurableBackend.createInMemoryAsyncBackend();
  const mono01 = createMono01(REGISTRY_PATH, { efOrchDurableBackend: testBackend });
  const port = mono01.efOrchExecutionPort;

  // === EF-ORCH-01 - RunContract absent -> BLOCKED ===
  {
    const r = await port.start(undefined, {});
    check("EF-ORCH-01. RunContract absent -> BLOCKED", r.status === "BLOCKED" && r.diagnostics.error.code === "MISSING_REQUIRED_INPUT", JSON.stringify(r.diagnostics));
  }

  // === EF-ORCH-02 - RunContract invalide -> BLOCKED ===
  {
    const r = await port.start({ schema: "EvidenceForge.RunContract", runContractHash: "not-a-real-hash", humanConfirmation: {} }, {});
    check("EF-ORCH-02a. RunContract de mauvais schema -> jamais SUCCESS", r.status !== "SUCCESS", JSON.stringify(r.diagnostics));

    const missionId = "mission-eforch02";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const tampered = { ...confirmed, runContractHash: "0".repeat(64) };
    const r2 = await port.start(tampered, {});
    check("EF-ORCH-02b. RunContract avec hash trafique (integrite rompue) -> FAILED, jamais SUCCESS", r2.status === "FAILED" && /invalide/i.test(r2.diagnostics.error.message), JSON.stringify(r2.diagnostics));
  }

  // === EF-ORCH-03 - Execution reussie -> CorpusSnapshot valide ===
  let successRunId, successCorpusSnapshot;
  {
    const missionId = "mission-eforch03";
    successRunId = "run-eforch03";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "eforch03");
    const { runner: oaRunner } = fx.buildOpenAlexRunner("oa-eforch03");

    const r1 = await port.start(confirmed, {
      runId: successRunId,
      ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol,
      connectorRunners: { openalex: oaRunner },
      protocolHash: searchProtocol.protocolHash,
      screeningArtifact: fx.buildScreeningArtifact(["oa-eforch03"], searchProtocol.protocolHash),
    });
    check("EF-ORCH-03a. start() SUCCESS jusqu'a EF-01D puis attente d'artefacts E/F", r1.status === "SUCCESS" && r1.output.awaitingStage === "EF-01E", JSON.stringify(r1.output));

    const qualifArtifact = fx.buildQualificationArtifact(fx.buildScreeningArtifact(["oa-eforch03"], searchProtocol.protocolHash), searchProtocol);
    const r2 = await port.resume(successRunId, { qualificationTestArtifact: qualifArtifact });
    check("EF-ORCH-03b. resume() avec qualificationTestArtifact -> attente F", r2.status === "SUCCESS" && r2.output.awaitingStage === "EF-01F", JSON.stringify(r2.output));

    const r3 = await port.resume(successRunId, { ef01fInjected: fx.buildEF01FInjected("eforch03") });
    check("EF-ORCH-03c. resume() avec ef01fInjected -> completed, CorpusSnapshot produit", r3.status === "SUCCESS" && r3.output.status === "completed" && !!r3.output.corpusSnapshot, JSON.stringify(r3.output && r3.output.status));
    check("EF-ORCH-03d. CorpusSnapshot valide (schema/schemaVersion exacts)", r3.output.corpusSnapshot.schema === "EvidenceForge.CorpusSnapshot" && r3.output.corpusSnapshot.schemaVersion === "EF-01F-v1");

    successCorpusSnapshot = r3.output.corpusSnapshot;

    const handoff = mono01.corpusSnapshotPort.receive(successCorpusSnapshot, { missionId });
    check("EF-ORCH-03e. CorpusSnapshot accepte tel quel par CorpusSnapshotPort (flux CDC section 7)", handoff.status === "SUCCESS" && handoff.output === successCorpusSnapshot);
  }

  // === EF-ORCH-04 - Le port utilise uniquement le code EF-ORCH gele ===
  {
    const src = fs.readFileSync(require.resolve("../ports/ef-orch-execution-port.js"), "utf8");
    const requireLines = [...src.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]);
    const allowed = requireLines.every((r) => r === "../lib/port-factory" || r.startsWith("../dependencies/ef-orch-"));
    check("EF-ORCH-04. tous les require() du port ciblent lib/port-factory ou dependencies/ef-orch-*", allowed, JSON.stringify(requireLines));
  }

  // === EF-ORCH-05 - Hash des fichiers EF-ORCH inchange avant/apres ===
  {
    const provenance = fs.readFileSync(path.join(__dirname, "..", "dependencies", "PROVENANCE.md"), "utf8");
    const eforchFiles = fs
      .readdirSync(path.join(__dirname, "..", "dependencies"))
      .filter((f) => f.startsWith("ef-orch-") && f.endsWith(".js"));
    const crypto = require("crypto");
    const mismatches = [];
    for (const f of eforchFiles) {
      const content = fs.readFileSync(path.join(__dirname, "..", "dependencies", f));
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      if (!provenance.includes(hash)) mismatches.push(f);
    }
    check(`EF-ORCH-05. les ${eforchFiles.length} fichiers ef-orch-*.js ont tous leur hash declare dans PROVENANCE.md`, mismatches.length === 0, JSON.stringify(mismatches));
  }

  // === EF-ORCH-06 - Checkpoint disponible -> reprise native EF-ORCH utilisee ===
  {
    const missionId = "mission-eforch06";
    const runId = "run-eforch06";
    const confirmed = await fx.buildConfirmedRunContract(missionId, { webPublicActive: true });
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "eforch06", { webPublic: true });
    const { runner: oaRunner, counter } = fx.buildOpenAlexRunner("oa-eforch06");

    const r1 = await port.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
    });
    check("EF-ORCH-06a. gate manual_import_required declenche sur web_public, OpenAlex appele une fois", r1.output.status === "paused" && counter.calls === 1, JSON.stringify(r1.output));

    const gate = (await port.getStatus(runId)).gate;
    const r1b = await port.resume(runId, { decision: { gateId: "wrong-gate-id" } }).catch((e) => ({ status: "ERROR_THROWN", message: e.message }));
    check("EF-ORCH-06b. resume() avec un gateId incorrect est rejete", r1b.status === "FAILED" || r1b.status === "ERROR_THROWN");

    const r2 = await port.resume(runId, {
      manualImportCheckpoints: [{ connectorId: "web_public", sourcesTrouvees: [{ id: "manuel-eforch06", titre: "Source manuelle", auteurOuOrganisme: "", date: "", reference: "", discipline: "STAPS", theme: "", provenance: { connectorId: "web_public", connectorType: "web_search", retrievalMethod: "import_manuel", originalReference: null }, qualification: null, dependancesConnues: [], extraitUtilise: "", dateConsultation: "2026-08-27T00:20:00.000Z", statutScreening: "trouve" }], log: null }],
      decision: { gateId: gate.gateId, decision: "manual_data_provided" },
      protocolHash: searchProtocol.protocolHash,
      connectorRunners: { openalex: oaRunner },
    });
    check("EF-ORCH-06c. resume() avec import manuel + bon gateId -> EF-01C2 termine, checkpoint OpenAlex REUTILISE (aucun second appel)", r2.output.completedStages.includes("EF-01C2") && counter.calls === 1, JSON.stringify({ completed: r2.output.completedStages, calls: counter.calls }));
  }

  // === EF-ORCH-07 - Aucun checkpoint -> comportement natif EF-ORCH respecte ===
  {
    const missionId = "mission-eforch07";
    const runId = "run-eforch07";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "eforch07");
    const { runner: oaRunner, counter } = fx.buildOpenAlexRunner("oa-eforch07");

    const r1 = await port.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
      screeningArtifact: fx.buildScreeningArtifact(["oa-eforch07"], searchProtocol.protocolHash),
    });
    check("EF-ORCH-07. run frais sans checkpoint preexistant -> comportement natif normal", r1.status === "SUCCESS" && counter.calls === 1, JSON.stringify({ status: r1.status, calls: counter.calls }));
  }

  // === EF-ORCH-08 - Erreur d'un stage -> pas de faux SUCCESS ===
  {
    const missionId = "mission-eforch08";
    const runId = "run-eforch08";
    const confirmed = await fx.buildConfirmedRunContract(missionId);
    const resolverTrace = fx.buildResolverTrace(missionId, confirmed);
    const searchProtocol = await fx.buildSearchProtocol(missionId, "eforch08");
    const { runner: oaRunner } = fx.buildOpenAlexRunner("oa-eforch08");

    // EF-01D avec un screeningArtifact délibérément invalide (référence une
    // source absente du corpus EF-01C2 réel) — le module gelé (assertScreeningArtifactComplete)
    // doit rejeter explicitement, jamais produire un EF-01D "réussi" bidon.
    const invalidScreeningArtifact = fx.buildScreeningArtifact(["source-qui-n-existe-pas"], searchProtocol.protocolHash);

    const r = await port.start(confirmed, {
      runId, ef01aInjected: fx.buildEF01AInjected(missionId),
      resolverTrace, searchProtocol, connectorRunners: { openalex: oaRunner }, protocolHash: searchProtocol.protocolHash,
      screeningArtifact: invalidScreeningArtifact,
    });
    check(
      "EF-ORCH-08. screeningArtifact référençant une source inexistante -> échec explicite d'EF-01D, jamais un SUCCESS masqué",
      r.status === "SUCCESS" && r.output.efOrchNativeStatus === "failed" && r.output.currentStage === "EF-01D",
      JSON.stringify(r.output)
    );
  }

  // === EF-ORCH-09 - CorpusSnapshot invalide -> rejet avant suite du monolithe ===
  {
    const missionId = "mission-eforch09";
    const fakeCorpusSnapshot = { schema: "NotACorpusSnapshot", stage: "EF-01F" };
    const r = mono01.corpusSnapshotPort.receive(fakeCorpusSnapshot, { missionId });
    check("EF-ORCH-09. CorpusSnapshot de mauvais schema -> BLOCKED / SCHEMA_VERSION_MISMATCH", r.status === "BLOCKED" && r.diagnostics.error.code === "SCHEMA_VERSION_MISMATCH", JSON.stringify(r.diagnostics));
    check("EF-ORCH-09b. contre-epreuve : un CorpusSnapshot reellement produit passe la validation", !!successCorpusSnapshot && successCorpusSnapshot.schema === "EvidenceForge.CorpusSnapshot");
  }

  // === EF-ORCH-10 - Le port ne contient aucune copie de logique EF-01A->F ===
  {
    const src = fs.readFileSync(require.resolve("../ports/ef-orch-execution-port.js"), "utf8");
    const forbiddenPatterns = [/function\s+buildMissionDraft/, /function\s+buildEF01[A-F]Output/, /function\s+assertScreeningArtifact/, /function\s+assertQualificationTestArtifact/, /function\s+evaluateEligibility/];
    const violations = forbiddenPatterns.filter((re) => re.test(src));
    check("EF-ORCH-10. aucune fonction metier EF-01A->F redefinie dans le port", violations.length === 0, JSON.stringify(violations.map(String)));
  }

  // === EF-ORCH-11 - Les dependances externes declarees correspondent a MONO-00 ===
  {
    const classifyEF01B = mono01.externalExecutionPort.classify("EF-ORCH", "llm", "EF-01B");
    const classifyEF01C1 = mono01.externalExecutionPort.classify("EF-ORCH", "llm", "EF-01C1");
    const classifyEF01C2llm = mono01.externalExecutionPort.classify("EF-ORCH", "llm", "EF-01C2");
    const classifyEF01C2net = mono01.externalExecutionPort.classify("EF-ORCH", "network", "EF-01C2");
    check("EF-ORCH-11a. EF-01B LLM = INDIRECT_UPSTREAM (MONO-00, preserve)", classifyEF01B.classification === "INDIRECT_UPSTREAM");
    check("EF-ORCH-11b. EF-01C1 LLM = INDIRECT_UPSTREAM (MONO-00, preserve)", classifyEF01C1.classification === "INDIRECT_UPSTREAM");
    check("EF-ORCH-11c. EF-01C2 LLM = NONE", classifyEF01C2llm.classification === "NONE");
    check("EF-ORCH-11d. EF-01C2 reseau = DIRECT_RUNTIME (MONO-00, preserve)", classifyEF01C2net.classification === "DIRECT_RUNTIME");

    const { EF01_STAGE_CLASSIFICATION } = require("../dependencies/ef-orch-ef01-stage-registry-v0.1.js");
    const c2 = EF01_STAGE_CLASSIFICATION.find((s) => s.stageId === "EF-01C2");
    check("EF-ORCH-11e. la classification gelee EF-01C2 n'a pas ete alteree", c2.executionClass === "read_only_external" && c2.resumePolicy === "resume_checkpoint" && c2.deterministic === false);
  }

  // === EF-ORCH-12 - La state machine interne reste propriete d'EF-ORCH ===
  {
    const src = fs.readFileSync(require.resolve("../ports/ef-orch-execution-port.js"), "utf8");
    const hasOwnTransitionLogic = /\bstate\.status\s*=(?!==)/.test(src);
    check("EF-ORCH-12a. le port n'affecte jamais directement state.status", !hasOwnTransitionLogic);

    const usesStateMachine = /EFOrchStateMachine\.(startRun|advanceStage|failRun|pauseRun|resumeRun|currentStageId)/.test(src);
    check("EF-ORCH-12b. le port utilise les fonctions de EFOrchStateMachine pour toute transition", usesStateMachine);

    const before = JSON.stringify(await port.getStatus(successRunId));
    await port.getStatus(successRunId);
    await port.getResult(successRunId);
    const after = JSON.stringify(await port.getStatus(successRunId));
    check("EF-ORCH-12c. getStatus()/getResult() sont read-only", before === after);
  }

  let failed = results.filter((r) => !r.pass);
  for (const r of results) console.log((r.pass ? "PASS" : "FAIL") + " - " + r.name + (r.pass ? "" : "  [" + r.detail + "]"));
  console.log(failed.length ? "\nECHECS : " + failed.length : "\nTOUS LES TESTS PASSENT (" + results.length + ")");
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error("ERREUR FATALE :", e.stack);
  process.exit(2);
});
