"use strict";

const { createRunStore } = require("./lib/run-store.js");
const { createRunLock } = require("./lib/run-lock.js");
const { createPersistenceCoordinator } = require("./lib/persistence-coordinator.js");
const { computeResumePlan } = require("./lib/resume-planner.js");
const { createInMemoryBackend } = require("./lib/persistence-backend.js");

// createMono03(options) — options.persistenceBackend est OBLIGATOIRE et
// EXPLICITE, jamais un défaut implicite (même discipline que
// MONO-01.x::createMono01 après ses corrections d'audit). Contrairement à
// createMono01 (qui construit ses 15 autres ports même sans backend
// EF-ORCH, pour ne rien casser d'indépendant), MONO-03 n'a AUCUNE
// fonctionnalité indépendante de la persistance : createMono03() REFUSE
// donc de se construire du tout sans backend explicite — un échec immédiat
// et net, jamais une construction partielle qui masquerait le problème.
function createMono03(options) {
  options = options || {};
  if (!options.persistenceBackend) {
    throw new Error(
      "createMono03: options.persistenceBackend est obligatoire — aucun backend n'est créé implicitement. " +
        "Injecter explicitement un backend (ex: require('./lib/persistence-backend.js').createInMemoryBackend() " +
        "pour un usage de test, ou une implémentation de production compatible get/put/has/delete/keys)."
    );
  }
  const backend = options.persistenceBackend;
  const runStore = createRunStore(backend);
  const runLock = createRunLock(backend);
  const coordinator = createPersistenceCoordinator(runStore);

  return {
    backend,
    runStore,
    artifactStore: runStore.artifactStore,
    runLock,
    coordinator,
    computeResumePlan,
  };
}

module.exports = { createMono03, createInMemoryBackend };
