"use strict";

const { invokePort } = require("../lib/port-factory");
const EF02EExclusionRegistry = require("../dependencies/ef-02e-exclusion-registry-v1.js");

// GovernancePort — CDC MONO-01 section 4.6.
//
// Expose ExclusionRegistrySet à EF-02E. Aucune édition implicite pendant un
// run : deactivateExclusion() n'est jamais appelé automatiquement par ce
// port lui-même (la désactivation reste un acte explicite et versionné de
// l'appelant, jamais déclenché en cascade — voir invariant DocumentaryTwinPort).
const MODULE_ID = "EF-02E";

function createGovernancePort(baselinePort) {
  let currentRegistry = null;

  return {
    schema: "EvidenceForge.GovernancePort",

    // Construit (ou remplace explicitement) le registre courant. Même un
    // registre vide doit être construit explicitement — jamais un défaut implicite.
    setRegistry(entries, snapshotDate, opts) {
      const result = invokePort(
        {
          portId: "GovernancePort.setRegistry",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["entries"],
          outputContract: { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { entries: entries || [] },
          invoke: (inputs) => EF02EExclusionRegistry.buildExclusionRegistry(inputs.entries, snapshotDate),
        }
      );
      if (result.status === "SUCCESS") currentRegistry = result.output;
      return result;
    },

    getCurrentRegistry() {
      return currentRegistry; // peut être null si jamais explicitement fourni — jamais un vide implicite
    },

    // Snapshot explicite pour un run donné — toujours la même référence que
    // le registre courant tant qu'il n'a pas été explicitement remplacé.
    getRegistrySnapshotForRun() {
      return currentRegistry;
    },

    findActiveExclusion(registry, professionalRef, identityRef, opts) {
      return invokePort(
        {
          portId: "GovernancePort.findActiveExclusion",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["registry"],
          inputContracts: { registry: { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1" } },
          outputContract: null,
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { registry },
          invoke: (inputs) => EF02EExclusionRegistry.findActiveExclusion(inputs.registry, professionalRef, identityRef),
        }
      );
    },

    // Modification de gouvernance explicite et versionnée (jamais implicite/automatique).
    deactivateExclusion(registry, entryId, reason, date, decisionProvenance, opts) {
      const result = invokePort(
        {
          portId: "GovernancePort.deactivateExclusion",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["registry"],
          inputContracts: { registry: { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1" } },
          outputContract: { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { registry },
          invoke: (inputs) =>
            EF02EExclusionRegistry.deactivateExclusion(inputs.registry, entryId, reason, date, decisionProvenance),
        }
      );
      // Explicite : l'appelant décide s'il fait de ce nouveau registre le
      // registre courant. Ce port ne le fait jamais tout seul.
      return result;
    },
  };
}

module.exports = { createGovernancePort };
