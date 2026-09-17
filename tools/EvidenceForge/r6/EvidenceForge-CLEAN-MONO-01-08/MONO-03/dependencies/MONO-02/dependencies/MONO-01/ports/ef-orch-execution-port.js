"use strict";

const { invokePort } = require("../lib/port-factory");
const EFOrchRunContract = require("../dependencies/ef-orch-runcontract-v0.1.js");
const EFOrchStateMachine = require("../dependencies/ef-orch-state-machine-v0.1.js");
const EFOrchDurableStageRunner = require("../dependencies/ef-orch-durable-stage-runner-v0.1.js");
const EFOrchEF01Stages = require("../dependencies/ef-orch-ef01-stage-registry-v0.1.js");
const EFOrchDurableBackend = require("../dependencies/ef-orch-durable-backend-v0.1.js");
const EFOrchDurableRunOutputStore = require("../dependencies/ef-orch-durable-run-output-store-v0.1.js");
const EFOrchDurableCheckpointIdentity = require("../dependencies/ef-orch-durable-checkpoint-identity-v0.1.js");
const EFOrchRunStateSnapshot = require("../dependencies/ef-orch-run-state-snapshot-v0.1.js");
const EFOrchStageInputResolver = require("../dependencies/ef-orch-stage-input-resolver-v0.1.js");
const EFOrchEF01OutputContracts = require("../dependencies/ef-orch-ef01-output-contracts-v0.1.js");
const EFOrchEF01AExecutor = require("../dependencies/ef-orch-ef01a-executor-v0.1.js");
const EFOrchEF01BExecutor = require("../dependencies/ef-orch-ef01b-executor-v0.1.js");
const EFOrchEF01C1Executor = require("../dependencies/ef-orch-ef01c1-executor-v0.1.js");
const EFOrchEF01C2Executor = require("../dependencies/ef-orch-ef01c2-executor-v0.1.js");
const EFOrchEF01DExecutor = require("../dependencies/ef-orch-ef01d-executor-v0.1.js");
const EFOrchEF01EExecutor = require("../dependencies/ef-orch-ef01e-executor-v0.1.js");
const EFOrchEF01FExecutor = require("../dependencies/ef-orch-ef01f-executor-v0.1.js");

// EFOrchExecutionPort — CDC MONO-01.x, décision "EF-ORCH comme sous-système
// orchestré autonome gelé", RÉVISÉ après audit indépendant pour une
// durabilité cross-process réelle.
//
// EF-ORCH conserve SEUL : sa state machine interne, son durable stage
// runner, son mécanisme checkpoint/resume, son RunOutputStore, ses
// politiques restart_stage/resume_checkpoint, son ordre EF-01A->F, ses
// invariants gelés. Ce port ne fait QUE composer les exports gelés déjà
// séparés (jamais recopier leur logique).
//
// *** DURABILITÉ CROSS-PROCESS (correction post-audit) ***
// `createInMemoryAsyncBackend()` (EFOrchDurableBackend, gelé) est une
// IMPLÉMENTATION DE TEST du contrat de backend durable abstrait
// (get/put/has/keys) — jamais une garantie de persistance au-delà du
// processus courant. La durabilité cross-process est la responsabilité de
// l'implémentation de backend INJECTÉE par l'appelant (`options.durableBackend`
// à la construction du port) : IndexedDB, un backend réseau, un fichier, ou
// toute autre implémentation du même contrat. Le port ne choisit jamais lui
// -même un backend "de production" — il ne fait qu'utiliser celui qu'on lui
// donne, avec un backend mémoire comme secours pour un usage ponctuel/test
// uniquement si aucun n'est fourni (jamais présenté comme une garantie de
// durabilité).
//
// resume()/getStatus()/getResult() ne dépendent JAMAIS d'une Map locale
// comme source de vérité : ils réhydratent systématiquement l'état depuis
// stateSnapshotStore.getRunState(runId), lui-même construit sur le backend
// injecté — un `port2` construit dans un nouveau processus, pointant sur le
// même backend durable, retrouve exactement le même état qu'un `port1`
// disparu. Un petit cache local FACULTATIF (`localExecutorCache`) subsiste
// uniquement pour éviter à l'appelant de refournir, dans le MÊME processus,
// des artefacts déjà connus — jamais consulté par resume()/getStatus()/
// getResult() pour l'état du run lui-même.
const MODULE_ID = "EF-ORCH";
const PIPELINE = [
  { stageId: "EF-01A", inputFrom: [] },
  { stageId: "EF-01B", inputFrom: ["EF-01A"] },
  { stageId: "EF-01C1", inputFrom: ["EF-01B"] },
  { stageId: "EF-01C2", inputFrom: ["EF-01C1"] },
  { stageId: "EF-01D", inputFrom: [] }, // résolu manuellement (protocolHash requis, voir driveRun)
  { stageId: "EF-01E", inputFrom: ["EF-01D"] },
  { stageId: "EF-01F", inputFrom: ["EF-01E"] },
];
const STAGE_IDS = EFOrchEF01Stages.EF01_STAGE_CLASSIFICATION.map((s) => s.stageId);

const OUTPUT_VALIDATORS = {
  "EF-01A": EFOrchEF01OutputContracts.validateEF01AOutput,
  "EF-01B": EFOrchEF01OutputContracts.validateEF01BOutput,
  "EF-01C1": EFOrchEF01OutputContracts.validateEF01C1Output,
  "EF-01C2": EFOrchEF01OutputContracts.validateEF01C2Output,
  "EF-01D": EFOrchEF01OutputContracts.validateEF01DOutput,
  "EF-01E": (out) => EFOrchEF01OutputContracts.validateEF01EOutput(out, { allowTestMode: true }),
  "EF-01F": EFOrchEF01OutputContracts.validateEF01FOutput,
};

function buildExecutors(d) {
  const executors = {};
  if (d.ef01aInjected !== undefined) {
    executors["EF-01A"] = async (input) => ({ status: "ok", output: await EFOrchEF01AExecutor.buildMissionDraftFromRunContract(input, d.ef01aInjected) });
  }
  if (d.resolverTrace !== undefined) {
    executors["EF-01B"] = EFOrchEF01BExecutor.createEF01BExecutor(d.runContract, d.resolverTrace);
  }
  if (d.searchProtocol !== undefined) {
    executors["EF-01C1"] = EFOrchEF01C1Executor.createEF01C1Executor(d.runContract, d.searchProtocol);
  }
  if (d.connectorRunners !== undefined) {
    executors["EF-01C2"] = EFOrchEF01C2Executor.createEF01C2Executor({
      store: d.runOutputStore,
      runId: d.runId,
      runContractHash: d.runContractHash,
      connectorRunners: d.connectorRunners,
    });
  }
  if (d.screeningArtifact !== undefined) {
    executors["EF-01D"] = EFOrchEF01DExecutor.createEF01DExecutor(d.screeningArtifact);
  }
  if (d.qualificationTestArtifact !== undefined) {
    executors["EF-01E"] = EFOrchEF01EExecutor.createEF01EExecutor(d.qualificationTestArtifact);
  }
  if (d.ef01fInjected !== undefined) {
    executors["EF-01F"] = EFOrchEF01FExecutor.createEF01FExecutor(d.ef01fInjected);
  }
  return executors;
}

function createRegistry() {
  return EFOrchEF01Stages.registerEF01Stages();
}

// Construit des stores FRAIS à chaque appel, tous adossés au MÊME backend
// injecté — les stores eux-mêmes sont sans état propre (leur cache interne
// est un simple accélérateur, jamais consulté avant le backend lorsqu'il
// est vide), donc les recréer à chaque appel ne perd jamais d'information :
// toute la donnée réelle vit dans `backend`.
function buildStores(backend) {
  return {
    runOutputStore: EFOrchDurableRunOutputStore.createDurableRunOutputStore({ backend }),
    stateSnapshotStore: EFOrchRunStateSnapshot.createDurableStateSnapshotStore({ backend }),
    checkpointIdentityStore: EFOrchDurableCheckpointIdentity.createDurableCheckpointIdentityStore({ backend }),
  };
}

async function driveRun(state, ctx) {
  while (state.status === "running") {
    const stageId = EFOrchStateMachine.currentStageId(state);
    const executor = ctx.executors[stageId];
    if (typeof executor !== "function") {
      // Aucun exécuteur fourni pour ce stage : jamais un échec EF-ORCH natif
      // — une pause d'orchestration côté port, en attente d'un futur
      // resume() avec les artefacts restants.
      return { state, awaitingStage: stageId };
    }
    let input;
    if (stageId === "EF-01D") {
      input = await EFOrchStageInputResolver.resolveStageInput({
        pipeline: [{ stageId: "EF-01D", inputFrom: [{ stageId: "EF-01C2", protocolHash: ctx.protocolHash }] }],
        stageId: "EF-01D",
        store: ctx.runOutputStore,
        runId: ctx.runId,
        runContractHash: ctx.runContractHash,
      });
    } else {
      input = await EFOrchStageInputResolver.resolveStageInput({
        pipeline: PIPELINE,
        stageId,
        store: ctx.runOutputStore,
        runId: ctx.runId,
        runContractHash: ctx.runContractHash,
        initialInput: ctx.runContract,
      });
    }

    const protocolHash = stageId === "EF-01C2" ? ctx.protocolHash : undefined;

    const result = await EFOrchDurableStageRunner.runAndPersistStage({
      state,
      registry: ctx.registry,
      runOutputStore: ctx.runOutputStore,
      stateSnapshotStore: ctx.stateSnapshotStore,
      checkpointIdentityStore: ctx.checkpointIdentityStore,
      executor,
      input,
      runContractHash: ctx.runContractHash,
      protocolHash,
      auditDecisions: ctx.auditDecisions || [],
      validateOutput: OUTPUT_VALIDATORS[stageId],
    });

    state = result.state; // déjà persisté durablement par runAndPersistStage (putRunStateAfterVerifiedCheckpoint)
    if (result.kind !== "advanced" && result.kind !== "checkpoint_reused") {
      return { state, lastResult: result };
    }
  }
  return { state };
}

function summarizeState(runId, state) {
  return {
    efOrchRunIdentity: runId,
    status: state.status, // idle|running|paused|failed|completed — état natif EF-ORCH, jamais réinterprété
    currentStage: EFOrchStateMachine.currentStageId(state),
    completedStages: state.checkpoints.map((c) => c.stageId),
    checkpointAvailable: state.checkpoints.length > 0,
    lastError: state.error || null,
    gate: state.gate || null,
  };
}

function createEFOrchExecutionPort(baselinePort, options) {
  options = options || {};
  // Le backend n'est JAMAIS choisi implicitement par ce port — aucun
  // fallback silencieux vers createInMemoryAsyncBackend(). L'appelant doit
  // injecter explicitement options.durableBackend, y compris pour un usage
  // de test (créer soi-même un EFOrchDurableBackend.createInMemoryAsyncBackend()
  // et le passer explicitement). Sans backend injecté, le port EXISTE
  // (createMono01() reste utilisable pour ses 15 autres ports) mais refuse
  // explicitement toute opération réelle — voir assertBackendProvided().
  const backend = options.durableBackend || null;

  function assertBackendProvided() {
    if (!backend) {
      throw new Error(
        "EFOrchExecutionPort: aucun durableBackend injecté — ce port refuse de prétendre être durable. " +
          "Fournir options.durableBackend explicitement à createEFOrchExecutionPort() (ou " +
          "createMono01(registry, { efOrchDurableBackend }) ) — un backend mémoire de test " +
          "(EFOrchDurableBackend.createInMemoryAsyncBackend()) reste possible mais doit être injecté " +
          "explicitement par l'appelant, jamais choisi silencieusement par ce port."
      );
    }
  }

  // Cache FACULTATIF, jamais une source de vérité pour l'état du run —
  // seulement une commodité intra-processus pour les exécuteurs déjà connus.
  const localExecutorCache = new Map(); // runId -> executors

  async function rehydrate(runId) {
    const stores = buildStores(backend);
    const state = await stores.stateSnapshotStore.getRunState(runId);
    return { stores, state };
  }

  return {
    schema: "EvidenceForge.EFOrchExecutionPort",
    bindingType: "FROZEN_SUBSYSTEM_COMPOSITION",
    // Exposé pour permettre à un appelant de partager explicitement le même
    // backend entre deux instances de port (ex. simulation cross-process en
    // test) — jamais utilisé par le port lui-même comme raccourci d'état.
    durableBackend: backend,

    start(runContract, executionDependencies) {
      return invokePort(
        {
          portId: "EFOrchExecutionPort.start",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v0.1",
          requiredInputs: ["runContract"],
          inputContracts: { runContract: { schema: "EvidenceForge.RunContract" } },
          outputContract: null,
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          inputs: { runContract },
          invoke: async (inputs) => {
            assertBackendProvided();
            const contract = inputs.runContract;
            const integrity = await EFOrchRunContract.verifyRunContractIntegrity(contract);
            if (integrity !== true) {
              throw new Error("EFOrchExecutionPort: RunContract invalide (échec de verifyRunContractIntegrity — hash ou structure incohérents).");
            }
            const runId = (executionDependencies && executionDependencies.runId) || contract.runContractHash;
            const stores = buildStores(backend);
            const registry = createRegistry();
            const executors = buildExecutors({ ...executionDependencies, runContract: contract, runId, runContractHash: contract.runContractHash, runOutputStore: stores.runOutputStore });
            localExecutorCache.set(runId, executors);

            const state = EFOrchStateMachine.startRun(
              EFOrchStateMachine.createRunState({ runId, runContractHash: contract.runContractHash, stages: STAGE_IDS })
            );
            await stores.stateSnapshotStore.putRunState(state); // persisté AVANT toute exécution — un rehydrate immédiat après start() retrouve au moins l'état "running" initial

            const ctx = {
              registry,
              runOutputStore: stores.runOutputStore,
              stateSnapshotStore: stores.stateSnapshotStore,
              checkpointIdentityStore: stores.checkpointIdentityStore,
              executors,
              runId,
              runContractHash: contract.runContractHash,
              runContract: contract,
              protocolHash: executionDependencies && executionDependencies.protocolHash,
              auditDecisions: executionDependencies && executionDependencies.auditDecisions,
            };

            const { state: finalState, awaitingStage } = await driveRun(state, ctx);
            const summary = summarizeState(runId, finalState);
            summary.efOrchNativeStatus = finalState.status;
            summary.awaitingStage = awaitingStage || null;
            summary.status = awaitingStage ? "AWAITING_DEPENDENCIES" : finalState.status;

            if (finalState.status === "completed") {
              const f = await stores.runOutputStore.getSuccessfulOutput({ runId, runContractHash: contract.runContractHash, stageId: "EF-01F", protocolHash: null });
              summary.corpusSnapshot = f ? f.output.corpusSnapshot : null;
            }
            return summary;
          },
        }
      );
    },

    resume(runIdentity, executionDependencies) {
      return invokePort(
        {
          portId: "EFOrchExecutionPort.resume",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v0.1",
          requiredInputs: ["runIdentity"],
          outputContract: null,
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          inputs: { runIdentity },
          invoke: async (inputs) => {
            assertBackendProvided();
            const runId = inputs.runIdentity;
            const { stores, state: rehydratedState } = await rehydrate(runId);
            if (!rehydratedState) {
              throw new Error(`EFOrchExecutionPort: aucun run durablement connu pour l'identité "${runId}" — resume() impossible sans un start() préalable persisté sur ce backend.`);
            }

            let state = rehydratedState;
            if (state.status === "paused") {
              const decision = executionDependencies && executionDependencies.decision;
              if (!decision || !decision.gateId) {
                throw new Error("EFOrchExecutionPort: resume() sur un run en pause requiert executionDependencies.decision.gateId.");
              }
              // Import manuel éventuel — composition directe de la fonction gelée, jamais une réimplémentation.
              for (const manual of (executionDependencies && executionDependencies.manualImportCheckpoints) || []) {
                await EFOrchEF01C2Executor.provideManualImportCheckpoint({
                  store: stores.runOutputStore,
                  runId,
                  runContractHash: state.runContractHash,
                  protocolHash: (executionDependencies && executionDependencies.protocolHash) || undefined,
                  connectorId: manual.connectorId,
                  sourcesTrouvees: manual.sourcesTrouvees,
                  log: manual.log,
                });
              }
              state = EFOrchStateMachine.resumeRun(state, decision);
              await stores.stateSnapshotStore.putRunState(state);
            } else if (state.status !== "running") {
              throw new Error(`EFOrchExecutionPort: resume() refusé — statut EF-ORCH natif actuel "${state.status}" (seul "paused" ou "running" peut être repris ; "failed" est terminal dans la state machine gelée, jamais réinterprété comme reprenable).`);
            }

            // Exécuteurs : réutilise le cache local intra-processus s'il
            // existe pour ce runId, complété/écrasé par les artefacts
            // explicitement fournis à CET appel — jamais requis pour la
            // correction (un processus neuf sans cache fonctionne aussi
            // bien à condition de fournir les artefacts nécessaires ici).
            const cached = localExecutorCache.get(runId) || {};
            const fresh = executionDependencies
              ? buildExecutors({ ...executionDependencies, runContract: executionDependencies.runContract, runId, runContractHash: state.runContractHash, runOutputStore: stores.runOutputStore })
              : {};
            const executors = { ...cached, ...fresh };
            localExecutorCache.set(runId, executors);

            const ctx = {
              registry: createRegistry(),
              runOutputStore: stores.runOutputStore,
              stateSnapshotStore: stores.stateSnapshotStore,
              checkpointIdentityStore: stores.checkpointIdentityStore,
              executors,
              runId,
              runContractHash: state.runContractHash,
              runContract: executionDependencies && executionDependencies.runContract,
              protocolHash: (executionDependencies && executionDependencies.protocolHash) || undefined,
              auditDecisions: executionDependencies && executionDependencies.auditDecisions,
            };

            const { state: finalState, awaitingStage } = await driveRun(state, ctx);
            const summary = summarizeState(runId, finalState);
            summary.efOrchNativeStatus = finalState.status;
            summary.awaitingStage = awaitingStage || null;
            summary.status = awaitingStage ? "AWAITING_DEPENDENCIES" : finalState.status;

            if (finalState.status === "completed") {
              const f = await stores.runOutputStore.getSuccessfulOutput({ runId, runContractHash: state.runContractHash, stageId: "EF-01F", protocolHash: null });
              summary.corpusSnapshot = f ? f.output.corpusSnapshot : null;
            }
            return summary;
          },
        }
      );
    },

    // Lecture seule, réhydratée depuis le backend durable — jamais depuis un
    // cache local. Nécessairement asynchrone (le backend l'est).
    async getStatus(runIdentity) {
      assertBackendProvided();
      const { state } = await rehydrate(runIdentity);
      if (!state) return { efOrchRunIdentity: runIdentity, status: "NOT_AVAILABLE" };
      return summarizeState(runIdentity, state);
    },

    async getResult(runIdentity) {
      assertBackendProvided();
      const { stores, state } = await rehydrate(runIdentity);
      if (!state) return { efOrchRunIdentity: runIdentity, corpusSnapshot: "NOT_AVAILABLE" };
      if (state.status !== "completed") return { efOrchRunIdentity: runIdentity, corpusSnapshot: null, status: state.status };
      const f = await stores.runOutputStore.getSuccessfulOutput({ runId: runIdentity, runContractHash: state.runContractHash, stageId: "EF-01F", protocolHash: null });
      return { ...summarizeState(runIdentity, state), corpusSnapshot: f ? f.output.corpusSnapshot : null };
    },
  };
}

module.exports = { createEFOrchExecutionPort, PIPELINE, STAGE_IDS };
