"use strict";

const { invokePort } = require("../lib/port-factory");
const EF02D1D2Orchestrator = require("../dependencies/ef-02d1d2-orchestrator-v1.js");
const EF02D3CoveragePanel = require("../dependencies/ef-02d3-coverage-panel-v1.js");

// EligibilityPanelPort — CDC MONO-01 section 4.5.
//
// Formalise EF-02D. D1 reste déterministe, D2 reste LLM injecté/corpus-grounded
// (workerCallFn est déjà le point d'injection retenu par le module gelé lui-même —
// ce port ne fait qu'exposer ce même point, jamais un nouveau), D3 reste générique
// avec resume/fusion additive. Le port ne fusionne jamais D1/D2/D3 en une boîte
// opaque unique : trois méthodes séparées, comme l'exige la frontière EF-02A/B/C
// voisine (section 4.4) et la matrice MONO-00.
//
// RÉVISION ADDITIVE (post-audit MONO-02) : selectUsableRecords() expose la
// fonction gelée EF02D1D2Orchestrator.usableRecords() — jamais réimplémentée
// ailleurs (MONO-02 la reconstruisait localement avant cette révision, en
// violation du principe « ne jamais reconstruire un input métier d'un lot
// gelé »). Cette méthode appelle directement la fonction gelée et renvoie
// son résultat tel quel, sans nouvelle logique — EF-02D lui-même reste
// inchangé (aucun fichier gelé modifié).
const MODULE_ID = "EF-02D";

function createEligibilityPanelPort(baselinePort) {
  return {
    schema: "EvidenceForge.EligibilityPanelPort",

    // D1+D2 orchestrés : ProfessionalCorpusSet + MissionDimensionSet + HeuristicPolicy
    // -> DocumentaryEligibilityRelevanceSet
    buildEligibilityRelevanceSet(professionalCorpusSet, missionQuestion, dimensionSet, heuristicPolicy, workerCallFn, opts) {
      return invokePort(
        {
          portId: "EligibilityPanelPort.buildEligibilityRelevanceSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["professionalCorpusSet", "dimensionSet", "heuristicPolicy"],
          inputContracts: {
            professionalCorpusSet: { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2" },
          },
          outputContract: { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2" },
          externalDependencies: ["llm"],
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          ...opts,
          inputs: { professionalCorpusSet, dimensionSet, heuristicPolicy },
          invoke: (inputs, ctx) =>
            EF02D1D2Orchestrator.buildEligibilityRelevanceSet(
              inputs.professionalCorpusSet,
              missionQuestion,
              inputs.dimensionSet,
              inputs.heuristicPolicy,
              workerCallFn,
              ctx.executionContext && ctx.executionContext.evaluateOpts
            ),
        }
      );
    },

    // D3 : construction de la CoverageMatrix + PanelSelection
    buildCoverageMatrix(usableRecords, corpusByRef, dimensionSet, missionQuestion, workerCallFn, opts) {
      return invokePort(
        {
          portId: "EligibilityPanelPort.buildCoverageMatrix",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["usableRecords", "corpusByRef", "dimensionSet"],
          outputContract: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4" },
          externalDependencies: ["llm"],
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          ...opts,
          inputs: { usableRecords, corpusByRef, dimensionSet },
          invoke: (inputs) =>
            EF02D3CoveragePanel.buildCoverageMatrix(
              inputs.usableRecords,
              inputs.corpusByRef,
              inputs.dimensionSet,
              missionQuestion,
              workerCallFn
            ),
        }
      );
    },

    // Reprise additive de la CoverageMatrix (seuls les manquants sont (ré)évalués).
    resumeCoverageMatrix(existingMatrix, usableRecords, corpusByRef, dimensionSet, missionQuestion, workerCallFn, opts) {
      return invokePort(
        {
          portId: "EligibilityPanelPort.resumeCoverageMatrix",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["existingMatrix", "usableRecords", "corpusByRef", "dimensionSet"],
          inputContracts: {
            existingMatrix: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4" },
          },
          outputContract: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4" },
          externalDependencies: ["llm"],
          callType: "ASYNC_EXTERNAL",
        },
        baselinePort,
        {
          ...opts,
          inputs: { existingMatrix, usableRecords, corpusByRef, dimensionSet },
          invoke: (inputs) =>
            EF02D3CoveragePanel.resumeCoverageMatrix(
              inputs.existingMatrix,
              inputs.usableRecords,
              inputs.corpusByRef,
              inputs.dimensionSet,
              missionQuestion,
              workerCallFn
            ),
        }
      );
    },

    // Sélection du panel — déterministe, pas de LLM, aucun vote/prestige (invariant #7).
    selectPanel(coverageMatrix, dimensionSet, heuristicPolicy, opts) {
      return invokePort(
        {
          portId: "EligibilityPanelPort.selectPanel",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["coverageMatrix", "dimensionSet", "heuristicPolicy"],
          inputContracts: {
            coverageMatrix: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4" },
          },
          outputContract: { schema: "EvidenceForge.PanelSelection", schemaVersion: "EF-02D3-PANEL-v4" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { coverageMatrix, dimensionSet, heuristicPolicy },
          invoke: (inputs) =>
            EF02D3CoveragePanel.selectPanel(inputs.coverageMatrix, inputs.dimensionSet, inputs.heuristicPolicy),
        }
      );
    },

    // Sélection des enregistrements "usables" (éligibles ET pertinents sur au
    // moins une dimension) — appelle directement EF02D1D2Orchestrator.usableRecords(),
    // jamais une réimplémentation. Ajoutée pour que les consommateurs du port
    // (ex: un orchestrateur MONO-02) n'aient jamais à reconstruire ce filtre
    // eux-mêmes à partir des champs bruts d'un DocumentaryEligibilityRelevanceSet.
    selectUsableRecords(eligibilityRelevanceSet, opts) {
      return invokePort(
        {
          portId: "EligibilityPanelPort.selectUsableRecords",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["eligibilityRelevanceSet"],
          inputContracts: {
            eligibilityRelevanceSet: { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2" },
          },
          outputContract: null, // sortie = tableau brut de records, pas un contrat gelé versionné à part
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { eligibilityRelevanceSet },
          invoke: (inputs) => EF02D1D2Orchestrator.usableRecords(inputs.eligibilityRelevanceSet),
        }
      );
    },
  };
}

module.exports = { createEligibilityPanelPort };
