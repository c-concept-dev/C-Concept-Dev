"use strict";

const fs = require("fs");

// BaselinePort — CDC MONO-01 section 4.1.
//
// Le registre MONO-00 est l'unique autorité de compatibilité. Ce module ne
// choisit jamais une variante historique, ne complète jamais un champ
// manquant, et refuse tout module absent du registre. Aucune lecture directe
// de fichiers historiques hors MONO-00 n'a lieu ici.

function assertValidRegistry(raw) {
  if (!raw || raw.schema !== "EvidenceForge.FrozenBaselineRegistry") {
    throw new Error(
      `BaselinePort: schema de registre inattendu ("${raw && raw.schema}") — ` +
        `refus de démarrer sans une baseline MONO-00 valide (CDC section 2).`
    );
  }
  if (raw.schemaVersion !== "MONO-00-v1") {
    throw new Error(
      `BaselinePort: schemaVersion de registre inattendue ("${raw.schemaVersion}") — ` +
        `seule MONO-00-v1 est une autorité de compatibilité reconnue par MONO-01.`
    );
  }
  if (!Array.isArray(raw.modules) || raw.modules.length === 0) {
    throw new Error("BaselinePort: registre sans aucun module déclaré — refus de démarrer.");
  }
  return raw;
}

function loadRegistry(registryPath) {
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return assertValidRegistry(raw);
}

function createBaselinePort(registryPathOrObject) {
  const registry =
    typeof registryPathOrObject === "string"
      ? loadRegistry(registryPathOrObject)
      : assertValidRegistry(registryPathOrObject);

  const byId = new Map(registry.modules.map((m) => [m.moduleId, m]));

  return {
    schema: "EvidenceForge.BaselinePort",
    registrySchemaVersion: registry.schemaVersion,

    hasModule(moduleId) {
      return byId.has(moduleId);
    },

    // Ne retourne jamais un module reconstruit ou approximé : soit l'entrée
    // exacte du registre, soit null. Aucune réparation par similarité.
    getModuleDefinition(moduleId) {
      return byId.has(moduleId) ? byId.get(moduleId) : null;
    },

    getExpectedInputs(moduleId) {
      const m = byId.get(moduleId);
      return m ? m.schemaVersionsConsumed || [] : null;
    },

    getExpectedOutputs(moduleId) {
      const m = byId.get(moduleId);
      return m ? m.schemaVersionsProduced || [] : null;
    },

    getExternalDependencies(moduleId) {
      const m = byId.get(moduleId);
      if (!m) return null;
      return {
        llmDependency: m.llmDependency !== undefined ? m.llmDependency : null,
        workerDependency: m.workerDependency !== undefined ? m.workerDependency : null,
        networkDependency: m.networkDependency !== undefined ? m.networkDependency : null,
      };
    },

    getResumeCapability(moduleId) {
      const m = byId.get(moduleId);
      return m ? (m.resumeCapability !== undefined ? m.resumeCapability : null) : null;
    },

    listModuleIds() {
      return [...byId.keys()];
    },
  };
}

module.exports = { createBaselinePort, loadRegistry };
