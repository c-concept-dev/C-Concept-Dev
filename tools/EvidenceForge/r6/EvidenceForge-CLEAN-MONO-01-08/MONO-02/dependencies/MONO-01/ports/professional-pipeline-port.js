"use strict";

const { invokePort } = require("../lib/port-factory");

// ProfessionalPipelinePort — CDC MONO-01 section 4.4.
//
// *** DÉCISION D'ARCHITECTURE TRANCHÉE (correction post-audit) ***
//
// EF-02A/B/C restent des outils HTML à dépôt de fichier manuel, gelés,
// jamais modifiés. MONO-01 ne les pilote jamais (pas d'automatisation d'UI
// dans ce lot), et ne les réimplémente jamais silencieusement en module JS
// pur. La décision retenue : l'invocation passe TOUJOURS par un
// **ExternalStageAdapter** injecté explicitement par l'appelant à chaque
// appel (voir contracts/external-stage-adapter-v1.json, bindingType =
// EXTERNAL_STAGE_ADAPTER). MONO-01 ne sait rien de la façon dont l'adaptateur
// obtient son résultat — il valide seulement sa présence et la conformité de
// sa sortie, exactement comme pour tout autre port.
//
// bindingStatus = BOUND : la frontière ET le mécanisme d'invocation sont
// désormais fixés et documentés. Ce qui reste variable à l'exécution est la
// présence effective de l'adaptateur — son absence produit
// DEPENDENCY_UNAVAILABLE (dependency="externalStageAdapter"), jamais un
// comportement par défaut inventé. Les trois étapes restent strictement
// séparées : un adaptateur qui n'implémente que discoverProfessionals ne
// rend jamais verifyProfessionals ou buildProfessionalCorpus disponibles.
//
// CORRECTION (bug réel trouvé) : discoverProfessionals (EF-02A) exige DEUX
// entrées gelées — CorpusSnapshot ET MissionDimensionSet — jamais une seule.
// stageDefinition()/invokeStage() acceptent désormais une LISTE de
// spécifications d'entrée ({ name, contract }), chacune requise et validée
// individuellement, jamais un requiredInputName singulier qui laisserait une
// entrée transiter sans contrôle.

function stageDefinition(step, methodName, moduleId, expectedCanonicalVersion, inputSpecs, outputContract) {
  return { step, methodName, moduleId, expectedCanonicalVersion, inputSpecs, outputContract };
}

function invokeStage(def, baselinePort, inputs, opts) {
  opts = opts || {};
  const adapter = opts.adapter;
  const adapterFn =
    adapter && typeof adapter[def.methodName] === "function" ? adapter[def.methodName].bind(adapter) : undefined;

  // La présence de l'adaptateur POUR CETTE ÉTAPE PRÉCISE est traitée comme
  // n'importe quelle autre dépendance externe — même mécanique fail-closed
  // que toutes les autres (lib/port-factory.js), aucun chemin spécial.
  const dependenciesAvailable = { ...(opts.dependenciesAvailable || {}), externalStageAdapter: !!adapterFn };

  const requiredInputs = def.inputSpecs.map((s) => s.name);
  const inputContracts = {};
  for (const spec of def.inputSpecs) {
    if (spec.contract) inputContracts[spec.name] = spec.contract;
  }

  return invokePort(
    {
      portId: `ProfessionalPipelinePort.${def.step}`,
      moduleId: def.moduleId,
      expectedCanonicalVersion: def.expectedCanonicalVersion,
      requiredInputs,
      inputContracts,
      outputContract: def.outputContract,
      externalDependencies: ["externalStageAdapter"],
      callType: "ASYNC_EXTERNAL",
    },
    baselinePort,
    {
      ...opts,
      dependenciesAvailable,
      inputs,
      invoke: adapterFn,
    }
  );
}

function createProfessionalPipelinePort(baselinePort) {
  return {
    schema: "EvidenceForge.ProfessionalPipelinePort",
    bindingStatus: "BOUND",
    bindingType: "EXTERNAL_STAGE_ADAPTER",

    // EF-02A : CorpusSnapshot + MissionDimensionSet -> ProfessionalDiscovery.
    // Les DEUX entrées sont requises et validées individuellement — ni l'une
    // ni l'autre ne peut transiter sans contrôle de schema/schemaVersion.
    discoverProfessionals(corpusSnapshot, missionDimensionSet, opts) {
      const def = stageDefinition(
        "discoverProfessionals",
        "discoverProfessionals",
        "EF-02A",
        "v1",
        [
          { name: "corpusSnapshot", contract: { schema: "EvidenceForge.CorpusSnapshot" } },
          // Version exacte prise telle quelle dans MONO-00 (mono-00-frozen-baseline-registry-v1.json,
          // schemaVersionsProduced d'EF-PR-GEN-01) — jamais inventée.
          { name: "missionDimensionSet", contract: { schema: "EvidenceForge.MissionDimensionSet", schemaVersion: "EF-PR-GEN-v1" } },
        ],
        { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2" }
      );
      return invokeStage(def, baselinePort, { corpusSnapshot, missionDimensionSet }, opts);
    },

    // EF-02B : ProfessionalDiscovery -> ProfessionalVerification (une seule
    // entrée gelée requise, conforme à la chaîne CDC section 4.4).
    verifyProfessionals(professionalDiscovery, opts) {
      const def = stageDefinition(
        "verifyProfessionals",
        "verifyProfessionals",
        "EF-02B",
        "v1",
        [{ name: "professionalDiscovery", contract: { schema: "EvidenceForge.ProfessionalDiscovery", schemaVersion: "EF-02A-v2" } }],
        { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2" }
      );
      return invokeStage(def, baselinePort, { professionalDiscovery }, opts);
    },

    // EF-02C : ProfessionalVerification -> ProfessionalCorpusSet (une seule
    // entrée gelée requise, conforme à la chaîne CDC section 4.4).
    buildProfessionalCorpus(professionalVerification, opts) {
      const def = stageDefinition(
        "buildProfessionalCorpus",
        "buildProfessionalCorpus",
        "EF-02C",
        "v2",
        [{ name: "professionalVerification", contract: { schema: "EvidenceForge.ProfessionalVerification", schemaVersion: "EF-02B-v2" } }],
        { schema: "EvidenceForge.ProfessionalCorpusSet", schemaVersion: "EF-02C-v2" }
      );
      return invokeStage(def, baselinePort, { professionalVerification }, opts);
    },
  };
}

module.exports = { createProfessionalPipelinePort };
