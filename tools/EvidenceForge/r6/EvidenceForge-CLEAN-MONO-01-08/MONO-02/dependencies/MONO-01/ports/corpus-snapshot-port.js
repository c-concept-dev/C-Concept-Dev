"use strict";

const { invokePort } = require("../lib/port-factory");

// CorpusSnapshotPort — CDC MONO-01 section 4.3.
//
// Raccorde la fin d'EF-ORCH (EF-01F) à EF-02A. Vérifie schema/version/mission
// et expose le CorpusSnapshot SANS AUCUNE extraction sémantique nouvelle.
// MONO-01 n'exécute pas EF-ORCH lui-même (pipeline E2E interdit, section 15) :
// ce port reçoit un CorpusSnapshot déjà produit et le fait seulement transiter,
// validé, vers la frontière suivante.
const MODULE_ID = "EF-ORCH";

function createCorpusSnapshotPort(baselinePort) {
  return {
    schema: "EvidenceForge.CorpusSnapshotPort",

    receive(corpusSnapshot, opts) {
      return invokePort(
        {
          portId: "CorpusSnapshotPort.receive",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v0.1",
          requiredInputs: ["corpusSnapshot"],
          inputContracts: {
            corpusSnapshot: { schema: "EvidenceForge.CorpusSnapshot" },
          },
          outputContract: { schema: "EvidenceForge.CorpusSnapshot" },
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { corpusSnapshot },
          invoke: (inputs) => inputs.corpusSnapshot, // passthrough strict
        }
      );
    },
  };
}

module.exports = { createCorpusSnapshotPort };
