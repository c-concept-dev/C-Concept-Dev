"use strict";

// node-runners.js — CDC MONO-02 : "il ne fait qu'appeler le port MONO-01".
//
// Chaque fonction ci-dessous appelle EXCLUSIVEMENT des méthodes de
// mono01.<port>.* (le paquet MONO-01 gelé, dependencies/MONO-01/index.js) —
// jamais un fichier sous dependencies/MONO-01/dependencies/ (code gelé
// interne à MONO-01, hors de portée de MONO-02). Vérifié statiquement par
// test/test_t02_16_no_direct_frozen_invocation.js.
//
// *** LIMITE CONNUE #1 (documentée, jamais masquée) ***
// MissionPort.validateMissionDimensionSet/validateMissionDocumentMapping/
// validateHeuristicPolicy sont déclarés avec outputContract=null dans
// MONO-01 (gelé, non modifiable) : les fonctions gelées sous-jacentes
// renvoient un booléen (true/false), jamais un objet ni une exception.
// Parce qu'aucun outputContract n'est déclaré, port-factory.js accepte ce
// booléen tel quel et renvoie systématiquement status="SUCCESS" — MÊME
// QUAND LA VALIDATION A ÉCHOUÉ (output=false). C'est un angle mort réel de
// MONO-01, découvert en construisant MONO-02, jamais corrigé dans MONO-01
// (gelé). MONO-02 compense EXPLICITEMENT ici, sans jamais modifier MONO-01 :
// isMissionPortValidationTrue() n'accepte un résultat MissionPort que si
// status==="SUCCESS" ET output===true, sinon traite l'appel comme un échec
// d'orchestration (BLOCKED), jamais un SUCCESS accepté aveuglément.
//
// *** LIMITE CONNUE #2 — RÉSOLUE (révision MONO-01.x) ***
// EligibilityPanelPort.buildCoverageMatrix (EF-02D3) exige des
// "usableRecords" pré-filtrés. MONO-01 expose désormais
// EligibilityPanelPort.selectUsableRecords(eligibilityRelevanceSet), qui
// appelle directement EF02D1D2Orchestrator.usableRecords() (le module gelé)
// — MONO-02 ne reconstruit plus ce prédicat lui-même. Voir
// dependencies/MONO-01/contracts/... et test/test_t02_23_no_local_usable_records_duplication.js
// (garde de non-régression statique empêchant le retour de cette duplication).

// CORRECTIF MONO-02-R1 (regressionId: MONO02-CORPUS-BY-REF-MAP) — corpusByRef
// doit etre une Map (voir dependencies/MONO-01/dependencies/ef-02d3-coverage-panel-v1.js
// ligne 184 : "corpusByRef : Map<professionalRef, ProfessionalCorpus>", et son
// usage corpusByRef.get(record.professionalRef)). Une version anterieure
// retournait un Object simple ({}), qui n'a pas de methode .get() — jamais
// exerce par les 324 tests historiques (aucun n'invoquait buildCoverageMatrix
// avec un usableRecords non vide), demontre reel par un run E2E MONO-07 avec
// au moins un professionnel reellement usable. Recherche exhaustive des
// usages de corpusByRefOf/corpusByRef dans MONO-02 et ses tests avant ce
// correctif : aucun appel n'attend un Object simple (voir CDC-TRACE.md).
function corpusByRefOf(professionalCorpusSet) {
  const map = new Map();
  for (const c of (professionalCorpusSet && professionalCorpusSet.professionalCorpora) || []) {
    map.set(c.professionalRef, c);
  }
  return map;
}

function isMissionPortValidationTrue(result) {
  return !!(result && result.status === "SUCCESS" && result.output === true);
}

function orchestrationBlockedFrom(moduleId, message, details) {
  return {
    schema: "EvidenceForge.IntegrationResult",
    schemaVersion: "MONO-01-v1",
    runId: null,
    moduleId,
    status: "BLOCKED",
    outputContract: null,
    output: null,
    diagnostics: {
      error: {
        schema: "EvidenceForge.IntegrationError",
        schemaVersion: "MONO-01-v1",
        code: "INTEGRATION_CONTRACT_ERROR",
        message,
        details: details || {},
      },
    },
  };
}

function compositeSuccess(moduleId, output) {
  return {
    schema: "EvidenceForge.IntegrationResult",
    schemaVersion: "MONO-01-v1",
    runId: null,
    moduleId,
    status: "SUCCESS",
    outputContract: `composite/${moduleId}`,
    output,
    diagnostics: {},
  };
}

const nodeRunners = {
  "EF-ORCH-SUBSYSTEM": async (mono01, ctx) => {
    // EF-ORCH est un sous-système orchestré autonome gelé (sa propre state
    // machine, son propre mécanisme checkpoint/resume EF-01A->F) — ce nœud
    // ne pilote JAMAIS individuellement EF-01A/B/C1/C2/D/E/F : il appelle
    // exclusivement EFOrchExecutionPort.start()/resume(), qui compose déjà
    // le sous-système gelé en interne. MONO-02 ne connaît que l'état
    // externe du sous-système, jamais sa state machine interne.
    const port = mono01.efOrchExecutionPort;
    const deps = ctx.externalInputs.efOrchExecutionDependencies || {};
    const raw = ctx.efOrchRunId ? await port.resume(ctx.efOrchRunId, deps) : await port.start(ctx.externalInputs.runContract, deps);

    if (raw.status !== "SUCCESS") return raw; // échec technique du port lui-même (ex: RunContract absent/invalide) — propagé tel quel, jamais réinterprété

    const summary = raw.output;
    ctx.efOrchRunId = summary.efOrchRunIdentity; // mémorisé pour les appels resume() suivants de ce même run

    if (summary.efOrchNativeStatus === "completed") {
      // Flux CDC section 7 : CorpusSnapshot -> CorpusSnapshotPort avant toute suite.
      return mono01.corpusSnapshotPort.receive(summary.corpusSnapshot, { missionId: ctx.missionId });
    }
    if (summary.efOrchNativeStatus === "failed") {
      return orchestrationBlockedFrom(
        "EF-ORCH",
        `EF-ORCH-SUBSYSTEM: run EF-ORCH natif en échec au stage "${summary.currentStage}": ${summary.lastError && summary.lastError.message}`,
        { stageId: summary.currentStage, lastError: summary.lastError }
      );
    }
    // "paused" (gate en attente) ou AWAITING_DEPENDENCIES (artefacts de
    // stage encore manquants) : le sous-système existe et progresse mais
    // n'a pas encore terminé — jamais un échec, une précondition non
    // satisfaite (BLOCKED), en attente d'un resume() ultérieur avec les
    // artefacts/décisions requis.
    return {
      schema: "EvidenceForge.IntegrationResult",
      schemaVersion: "MONO-01-v1",
      runId: null,
      moduleId: "EF-ORCH",
      status: "BLOCKED",
      outputContract: null,
      output: null,
      diagnostics: {
        error: {
          schema: "EvidenceForge.IntegrationError",
          schemaVersion: "MONO-01-v1",
          code: "DEPENDENCY_UNAVAILABLE",
          message: `EF-ORCH-SUBSYSTEM en attente (statut natif "${summary.efOrchNativeStatus}"${summary.awaitingStage ? `, stage "${summary.awaitingStage}"` : ""}${summary.gate ? `, gate "${summary.gate.gateId}"` : ""}).`,
          details: { efOrchNativeStatus: summary.efOrchNativeStatus, awaitingStage: summary.awaitingStage, gate: summary.gate },
        },
      },
    };
  },

  "EF-PR-GEN-01": async (mono01, ctx) => {
    const { missionDimensionSet, missionDocumentMapping, heuristicPolicy } = ctx.externalInputs;

    const r1 = await mono01.missionPort.validateMissionDimensionSet(missionDimensionSet, { missionId: ctx.missionId });
    if (!isMissionPortValidationTrue(r1)) {
      return orchestrationBlockedFrom("EF-PR-GEN-01", "MissionDimensionSet invalide (validation MONO-01 a renvoyé false — voir LIMITE CONNUE #1).", { field: "missionDimensionSet", raw: r1 });
    }
    const r2 = await mono01.missionPort.validateMissionDocumentMapping(missionDocumentMapping, { missionId: ctx.missionId });
    if (!isMissionPortValidationTrue(r2)) {
      return orchestrationBlockedFrom("EF-PR-GEN-01", "MissionDocumentMapping invalide (validation MONO-01 a renvoyé false — voir LIMITE CONNUE #1).", { field: "missionDocumentMapping", raw: r2 });
    }
    const r3 = await mono01.missionPort.validateHeuristicPolicy(heuristicPolicy, ctx.knownKeySchemas, { missionId: ctx.missionId });
    if (!isMissionPortValidationTrue(r3)) {
      return orchestrationBlockedFrom("EF-PR-GEN-01", "HeuristicPolicy invalide (validation MONO-01 a renvoyé false — voir LIMITE CONNUE #1).", { field: "heuristicPolicy", raw: r3 });
    }
    return compositeSuccess("EF-PR-GEN-01", { missionDimensionSet, missionDocumentMapping, heuristicPolicy });
  },

  "EF-02A": async (mono01, ctx) => {
    const missionDimensionSet = ctx.nodeOutputs["EF-PR-GEN-01"].missionDimensionSet;
    const corpusSnapshot = ctx.nodeOutputs["EF-ORCH-SUBSYSTEM"]; // produit par le sous-système EF-ORCH, jamais un externalInput direct
    return mono01.professionalPipelinePort.discoverProfessionals(corpusSnapshot, missionDimensionSet, {
      missionId: ctx.missionId,
      adapter: ctx.adapter,
      dependenciesAvailable: ctx.dependenciesAvailable,
    });
  },

  "EF-02B": async (mono01, ctx) => {
    return mono01.professionalPipelinePort.verifyProfessionals(ctx.nodeOutputs["EF-02A"], {
      missionId: ctx.missionId,
      adapter: ctx.adapter,
      dependenciesAvailable: ctx.dependenciesAvailable,
    });
  },

  "EF-02C": async (mono01, ctx) => {
    return mono01.professionalPipelinePort.buildProfessionalCorpus(ctx.nodeOutputs["EF-02B"], {
      missionId: ctx.missionId,
      adapter: ctx.adapter,
      dependenciesAvailable: ctx.dependenciesAvailable,
    });
  },

  "EF-02D": async (mono01, ctx) => {
    const corpusSet = ctx.nodeOutputs["EF-02C"];
    const { missionDimensionSet, heuristicPolicy } = ctx.nodeOutputs["EF-PR-GEN-01"];

    const elig = await mono01.eligibilityPanelPort.buildEligibilityRelevanceSet(
      corpusSet,
      ctx.missionQuestion,
      missionDimensionSet,
      heuristicPolicy,
      ctx.workerCallFn,
      { missionId: ctx.missionId, dependenciesAvailable: ctx.dependenciesAvailable }
    );
    if (elig.status !== "SUCCESS") return elig;

    // EligibilityPanelPort.selectUsableRecords() (révision MONO-01.x) —
    // appelle directement le module gelé, jamais une reconstruction locale
    // (voir LIMITE CONNUE #2 ci-dessus, désormais résolue).
    const usableRecordsResult = mono01.eligibilityPanelPort.selectUsableRecords(elig.output, { missionId: ctx.missionId });
    if (usableRecordsResult.status !== "SUCCESS") return usableRecordsResult;
    const usableRecords = usableRecordsResult.output;
    const corpusByRef = corpusByRefOf(corpusSet);

    const coverage = await mono01.eligibilityPanelPort.buildCoverageMatrix(
      usableRecords,
      corpusByRef,
      missionDimensionSet,
      ctx.missionQuestion,
      ctx.workerCallFn,
      { missionId: ctx.missionId, dependenciesAvailable: ctx.dependenciesAvailable }
    );
    if (coverage.status !== "SUCCESS") return coverage;

    const panel = mono01.eligibilityPanelPort.selectPanel(coverage.output, missionDimensionSet, heuristicPolicy, { missionId: ctx.missionId });
    if (panel.status !== "SUCCESS") return panel;

    return compositeSuccess("EF-02D", {
      eligibilityRelevanceSet: elig.output,
      coverageMatrix: coverage.output,
      panelSelection: panel.output,
    });
  },

  "EF-02E": async (mono01, ctx) => {
    const corpusSet = ctx.nodeOutputs["EF-02C"];
    const { eligibilityRelevanceSet, coverageMatrix, panelSelection } = ctx.nodeOutputs["EF-02D"];
    const { missionDimensionSet } = ctx.nodeOutputs["EF-PR-GEN-01"];

    return mono01.documentaryTwinPort.buildDocumentaryTwinSet(
      {
        corpusSet,
        eligibilityRelevanceSet,
        coverageMatrix,
        panelSelection,
        dimensionSet: missionDimensionSet,
        exclusionRegistry: ctx.externalInputs.exclusionRegistry,
        missionId: ctx.missionId,
        missionQuestion: ctx.missionQuestion,
        builtAt: ctx.builtAt,
      },
      { missionId: ctx.missionId }
    );
  },

  "TARGET_DOCUMENT_SET": async (mono01, ctx) => {
    return mono01.targetDocumentPort.buildTargetDocumentSet(ctx.missionId, ctx.externalInputs.documents, { missionId: ctx.missionId });
  },

  "EF-03A": async (mono01, ctx) => {
    const twinSet = ctx.nodeOutputs["EF-02E"];
    const { missionDimensionSet } = ctx.nodeOutputs["EF-PR-GEN-01"];
    return mono01.reviewSchemaPort.buildReviewSchema(twinSet, missionDimensionSet, ctx.externalInputs.reviewTargets, ctx.missionQuestion, {
      missionId: ctx.missionId,
    });
  },

  "EF-03B": async (mono01, ctx) => {
    const reviewSchema = ctx.nodeOutputs["EF-03A"];
    const twinSet = ctx.nodeOutputs["EF-02E"];
    const targetDocumentSet = ctx.nodeOutputs["TARGET_DOCUMENT_SET"];
    return mono01.documentaryReviewPort.buildDocumentaryReviewSet(reviewSchema, twinSet, targetDocumentSet, ctx.workerCallFn, {
      missionId: ctx.missionId,
      dependenciesAvailable: ctx.dependenciesAvailable,
    });
  },

  "EF-03C": async (mono01, ctx) => {
    return mono01.aggregationPort.buildAggregatedDocumentaryReview(ctx.nodeOutputs["EF-03B"], { missionId: ctx.missionId });
  },

  "EF-03D": async (mono01, ctx) => {
    return mono01.stabilityPort.buildStabilityContradictionAnalysis(ctx.nodeOutputs["EF-03B"], ctx.nodeOutputs["EF-03C"], { missionId: ctx.missionId });
  },

  "EF-04-LINEAGE": async (mono01, ctx) => {
    return mono01.lineagePort.assertLineage(
      {
        reviewSchema: ctx.nodeOutputs["EF-03A"],
        targetDocumentSet: ctx.nodeOutputs["TARGET_DOCUMENT_SET"],
        twinSet: ctx.nodeOutputs["EF-02E"],
        reviewSet: ctx.nodeOutputs["EF-03B"],
        aggregatedReview: ctx.nodeOutputs["EF-03C"],
        stabilityAnalysis: ctx.nodeOutputs["EF-03D"],
      },
      { missionId: ctx.missionId }
    );
  },

  "EF-04A": async (mono01, ctx) => {
    const lineageResult = ctx.nodeResults["EF-04-LINEAGE"];
    return mono01.reportPort.buildUnifiedReportSummary(
      {
        reviewSchema: ctx.nodeOutputs["EF-03A"],
        targetDocumentSet: ctx.nodeOutputs["TARGET_DOCUMENT_SET"],
        twinSet: ctx.nodeOutputs["EF-02E"],
        reviewSet: ctx.nodeOutputs["EF-03B"],
        aggregatedReview: ctx.nodeOutputs["EF-03C"],
        stabilityAnalysis: ctx.nodeOutputs["EF-03D"],
      },
      lineageResult,
      { missionId: ctx.missionId }
    );
  },
};

module.exports = { nodeRunners, corpusByRefOf, isMissionPortValidationTrue };
