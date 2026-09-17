"use strict";

const { invokePort } = require("../lib/port-factory");
const EF03TargetDocumentSet = require("../dependencies/ef-03-target-document-set-v1.js");

// TargetDocumentPort — CDC MONO-01 section 4.8.
//
// Construit/expose TargetDocumentSet à partir de MissionDocumentMapping +
// documents fournis. Le Document Blob Store historique (EF-ORCH) n'est jamais
// utilisé directement ici comme substitut : ce port ne lit que des documents
// déjà résolus (targetId/role/content/...), jamais le blob store lui-même.
const MODULE_ID = "EF-03";

function createTargetDocumentPort(baselinePort) {
  return {
    schema: "EvidenceForge.TargetDocumentPort",

    buildTargetDocumentSet(missionId, documents, opts) {
      return invokePort(
        {
          portId: "TargetDocumentPort.buildTargetDocumentSet",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["documents"],
          outputContract: { schema: "EvidenceForge.TargetDocumentSet", schemaVersion: "EF-03-DOC-v1" },
          callType: "ASYNC",
        },
        baselinePort,
        {
          ...opts,
          missionId,
          inputs: { documents },
          invoke: (inputs) => EF03TargetDocumentSet.buildTargetDocumentSet(missionId, inputs.documents),
        }
      );
    },

    getDocumentForTarget(targetDocumentSet, targetId, opts) {
      return invokePort(
        {
          portId: "TargetDocumentPort.getDocumentForTarget",
          moduleId: MODULE_ID,
          expectedCanonicalVersion: "v1",
          requiredInputs: ["targetDocumentSet"],
          inputContracts: { targetDocumentSet: { schema: "EvidenceForge.TargetDocumentSet", schemaVersion: "EF-03-DOC-v1" } },
          outputContract: null,
          callType: "SYNC",
        },
        baselinePort,
        {
          ...opts,
          inputs: { targetDocumentSet },
          invoke: (inputs) => EF03TargetDocumentSet.getDocumentForTarget(inputs.targetDocumentSet, targetId),
        }
      );
    },
  };
}

module.exports = { createTargetDocumentPort };
