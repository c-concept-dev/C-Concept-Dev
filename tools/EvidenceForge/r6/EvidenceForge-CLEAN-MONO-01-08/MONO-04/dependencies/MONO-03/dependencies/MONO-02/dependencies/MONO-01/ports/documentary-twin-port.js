"use strict";

const { invokePort } = require("../lib/port-factory");
const EF02ETwinBuilder = require("../dependencies/ef-02e-twin-builder-v1.js");

// DocumentaryTwinPort — CDC MONO-01 section 4.7.
//
// exclusionRegistry est un input REQUIS (même vide) — T01-14. La désactivation
// d'une exclusion ne déclenche jamais automatiquement une reconstruction du
// twin : ce port n'observe aucun registre en continu, il consomme un
// ExclusionRegistrySet donné à un instant donné, explicitement fourni à chaque
// appel par GovernancePort.getRegistrySnapshotForRun().
const MODULE_ID = "EF-02E";

function createDocumentaryTwinPort(baselinePort) {
  return {
    schema: "EvidenceForge.DocumentaryTwinPort",

    buildDocumentaryTwinSet(inputs, opts) {
      const {
        corpusSet,
        eligibilityRelevanceSet,
        coverageMatrix,
        panelSelection,
        dimensionSet,
        exclusionRegistry,
        missionId,
        missionQuestion,
        builtAt,
      } = inputs || {};

      return invokePort(
        {
          portId: "DocumentaryTwinPort.buildDocumentaryTwinSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: [
            "corpusSet",
            "eligibilityRelevanceSet",
            "coverageMatrix",
            "panelSelection",
            "dimensionSet",
            "exclusionRegistry",
          ],
          inputContracts: {
            corpusSet: { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2" },
            eligibilityRelevanceSet: { schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet", schemaVersion: "EF-02D-v2" },
            coverageMatrix: { schema: "EvidenceForge.CoverageMatrix", schemaVersion: "EF-02D3-v4" },
            panelSelection: { schema: "EvidenceForge.PanelSelection", schemaVersion: "EF-02D3-PANEL-v4" },
            exclusionRegistry: { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1" },
          },
          outputContract: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" },
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          missionId,
          inputs: {
            corpusSet,
            eligibilityRelevanceSet,
            coverageMatrix,
            panelSelection,
            dimensionSet,
            exclusionRegistry,
          },
          invoke: (portInputs) =>
            EF02ETwinBuilder.buildDocumentaryTwinSet({
              corpusSet: portInputs.corpusSet,
              eligibilityRelevanceSet: portInputs.eligibilityRelevanceSet,
              coverageMatrix: portInputs.coverageMatrix,
              panelSelection: portInputs.panelSelection,
              dimensionSet: portInputs.dimensionSet,
              exclusionRegistry: portInputs.exclusionRegistry,
              missionId,
              missionQuestion,
              builtAt,
            }),
        }
      );
    },

    // Retrait explicite d'un twin déjà construit — jamais déclenché automatiquement.
    withdrawTwin(twinSet, twinId, exclusionEntry, opts) {
      return invokePort(
        {
          portId: "DocumentaryTwinPort.withdrawTwin",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["twinSet"],
          inputContracts: { twinSet: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" } },
          outputContract: { schema: "EvidenceForge.DocumentaryTwinSet", schemaVersion: "EF-02E-v2" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { twinSet },
          invoke: (inputs) => EF02ETwinBuilder.withdrawTwin(inputs.twinSet, twinId, exclusionEntry),
        }
      );
    },
  };
}

module.exports = { createDocumentaryTwinPort };
