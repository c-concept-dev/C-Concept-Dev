// EvidenceForge — EF-ORCH-04A — Contrat de backend durable abstrait — v0.1
//
// Contrat minimal que tout backend de persistance doit respecter, qu'il
// s'agisse d'un backend en mémoire asynchrone (pour les tests, ci-dessous)
// ou d'un futur adaptateur IndexedDB. On PROUVE la sémantique de persistance
// contre ce contrat d'abord ; IndexedDB n'en sera ensuite qu'une
// implémentation, jamais une source de sémantique nouvelle.
//
// Un backend expose exactement trois opérations, toutes asynchrones (même
// l'implémentation en mémoire ci-dessous les rend explicitement
// asynchrones, pour ne jamais laisser un appelant supposer un accès
// synchrone qui n'existerait plus avec IndexedDB) :
//   get(storeName, key)  -> valeur clonée, ou undefined si absente
//   put(storeName, key, value) -> résout seulement après committment durable
//   has(storeName, key)  -> booléen
"use strict";

function microtaskDelay() {
  // Force un vrai passage asynchrone même pour le backend en mémoire, pour
  // qu'aucun test ne puisse accidentellement dépendre d'un comportement
  // synchrone qu'IndexedDB ne pourra jamais offrir.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// createInMemoryAsyncBackend(options?)
// options.failNextPutFor : Set ou Array de "storeName:key" pour lesquels le
// PROCHAIN put() doit échouer explicitement — utilisé pour simuler un échec
// de commit durable (panne disque, quota dépassé, etc.) sans avoir besoin
// d'un vrai IndexedDB défaillant.
// ---------------------------------------------------------------------------
function createInMemoryAsyncBackend(options) {
  const opts = options || {};
  const failNextPutFor = new Set(opts.failNextPutFor || []);
  const stores = new Map(); // storeName -> Map(key -> value)

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  return {
    async get(storeName, key) {
      await microtaskDelay();
      const m = storeFor(storeName);
      return m.has(key) ? structuredClone(m.get(key)) : undefined;
    },
    async put(storeName, key, value) {
      await microtaskDelay();
      const marker = storeName + ":" + key;
      if (failNextPutFor.has(marker)) {
        failNextPutFor.delete(marker); // échec ponctuel, pas permanent — simule une panne transitoire
        throw new Error("createInMemoryAsyncBackend: échec simulé de commit durable pour \"" + marker + "\".");
      }
      const m = storeFor(storeName);
      m.set(key, structuredClone(value));
      return true;
    },
    async has(storeName, key) {
      await microtaskDelay();
      return storeFor(storeName).has(key);
    },
    // Réservé aux tests : itère les clés d'un store, pour simuler une
    // réhydratation complète au démarrage. Jamais utilisé par les wrappers
    // durables eux-mêmes autrement que via cette même méthode publique.
    async keys(storeName) {
      await microtaskDelay();
      return [...storeFor(storeName).keys()];
    }
  };
}

const EFOrchDurableBackend = { createInMemoryAsyncBackend };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchDurableBackend;
}
if (typeof window !== "undefined") {
  window.EFOrchDurableBackend = EFOrchDurableBackend;
}
