"use strict";

// PersistenceBackend — CDC MONO-03 section 8. Abstraction minimale que tout
// backend de persistance doit respecter, get/put/has/delete/keys, toutes
// asynchrones — même l'implémentation mémoire ci-dessous les rend
// explicitement asynchrones, pour ne jamais laisser un appelant supposer un
// accès synchrone qu'un vrai backend durable (IndexedDB ou équivalent) ne
// pourra jamais offrir. Ce module ne connaît RIEN du domaine EvidenceForge
// (namespace/key/value génériques) — jamais un couplage au domaine.
//
// *** FRONTIÈRE D'INJECTION (même principe que MONO-01.x EFOrchExecutionPort) ***
// createInMemoryBackend() est une implémentation de TEST du contrat
// abstrait — jamais une garantie de durabilité cross-process. Aucun
// composant de MONO-03 (RunStore, ArtifactStore, RunLock) ne construit
// jamais ce backend lui-même : il doit toujours être injecté explicitement
// par l'appelant. Un backend de production (IndexedDB ou équivalent) est
// hors périmètre de MONO-03 — MONO-03 définit la frontière d'injection,
// jamais l'implémentation persistante finale.

function microtaskDelay() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// createInMemoryBackend(options?) — options.failNextPutFor: Set/Array de
// "namespace:key" pour lesquels le PROCHAIN put() doit échouer explicitement
// (simulation de panne d'écriture, section 14 : jamais un faux SUCCESS).
function createInMemoryBackend(options) {
  const opts = options || {};
  const failNextPutFor = new Set(opts.failNextPutFor || []);
  const stores = new Map(); // namespace -> Map(key -> value)

  function storeFor(namespace) {
    if (!stores.has(namespace)) stores.set(namespace, new Map());
    return stores.get(namespace);
  }

  return {
    schema: "EvidenceForge.PersistenceBackend",
    bindingType: "IN_MEMORY_TEST_ONLY",

    async get(namespace, key) {
      await microtaskDelay();
      const m = storeFor(namespace);
      return m.has(key) ? structuredClone(m.get(key)) : undefined;
    },
    async put(namespace, key, value) {
      await microtaskDelay();
      const marker = namespace + ":" + key;
      if (failNextPutFor.has(marker)) {
        failNextPutFor.delete(marker);
        throw new Error(`createInMemoryBackend: échec simulé de commit durable pour "${marker}".`);
      }
      storeFor(namespace).set(key, structuredClone(value));
      return true;
    },
    async has(namespace, key) {
      await microtaskDelay();
      return storeFor(namespace).has(key);
    },
    async delete(namespace, key) {
      await microtaskDelay();
      return storeFor(namespace).delete(key);
    },
    async keys(namespace) {
      await microtaskDelay();
      return [...storeFor(namespace).keys()];
    },
  };
}

module.exports = { createInMemoryBackend };
