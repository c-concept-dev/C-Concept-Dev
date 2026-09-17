"use strict";

const { invokePort } = require("../lib/port-factory");
const EFPrGenMissionDimensionSet = require("../dependencies/ef-pr-gen-mission-dimension-set-v1.js");
const EFPrGenMissionDocumentMapping = require("../dependencies/ef-pr-gen-mission-document-mapping-v1.js");
const EFPrGenHeuristicPolicy = require("../dependencies/ef-pr-gen-heuristic-policy-v1.js");

// MissionPort — CDC MONO-01 section 4.2.
//
// Expose RunContract / MissionDimensionSet / MissionDocumentMapping /
// HeuristicPolicy. « mission context ≠ panel context » : ce port ne dérive
// jamais ces objets de la composition du panel — il les valide et les
// transporte tels quels, produits en amont par EF-ORCH / EF-PR-GEN-01.
const MODULE_ID = "EF-PR-GEN-01";

function createMissionPort(baselinePort) {
  return {
    schema: "EvidenceForge.MissionPort",

    validateMissionDimensionSet(dimensionSet, opts) {
      return invokePort(
        {
          portId: "MissionPort.validateMissionDimensionSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["dimensionSet"],
          outputContract: null,
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { dimensionSet },
          invoke: (inputs) => EFPrGenMissionDimensionSet.validateMissionDimensionSet(inputs.dimensionSet),
        }
      );
    },

    validateMissionDocumentMapping(mapping, opts) {
      return invokePort(
        {
          portId: "MissionPort.validateMissionDocumentMapping",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["mapping"],
          outputContract: null,
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { mapping },
          invoke: (inputs) => EFPrGenMissionDocumentMapping.validateMissionDocumentMapping(inputs.mapping),
        }
      );
    },

    validateHeuristicPolicy(policy, knownKeySchemas, opts) {
      return invokePort(
        {
          portId: "MissionPort.validateHeuristicPolicy",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["policy"],
          outputContract: null,
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { policy },
          invoke: (inputs) => EFPrGenHeuristicPolicy.validateHeuristicPolicy(inputs.policy, knownKeySchemas),
        }
      );
    },

    // RunContract est produit et consommé par EF-ORCH (hors périmètre MONO-01 :
    // aucun moteur d'orchestration n'est reconstruit ici). Ce port se contente
    // d'exposer un passthrough validé structurellement pour les besoins des
    // ports en aval qui en ont besoin comme contexte de mission.
    receiveRunContract(runContract, opts) {
      return invokePort(
        {
          portId: "MissionPort.receiveRunContract",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["runContract"],
          inputContracts: { runContract: { schema: "EvidenceForge.RunContract" } },
          outputContract: null,
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { runContract },
          invoke: (inputs) => inputs.runContract, // passthrough strict, aucune transformation
        }
      );
    },
  };
}

module.exports = { createMissionPort };
