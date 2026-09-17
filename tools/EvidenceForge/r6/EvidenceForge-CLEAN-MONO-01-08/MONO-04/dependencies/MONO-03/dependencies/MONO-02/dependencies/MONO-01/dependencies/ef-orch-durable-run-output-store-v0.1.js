// EvidenceForge — EF-ORCH-04A — DurableRunOutputStore — v0.1
//
// N'ouvre PAS ef-orch-run-output-store-v0.1.js (gelé) : réutilise ses
// fonctions pures exportées (computeIdentityKey, via la fondation de hash)
// et reproduit le MÊME CONTRAT PUBLIC (idempotence, conflit, immutabilité,
// anti-corruption) — mais avec une seule source de vérité pour createdAt,
// contrôlée ici, jamais déléguée à une instance vivante du store gelé.
//
// Invariant central : un succès retourné par putSuccessfulOutput() signifie
// que les données survivront à une perte immédiate du processus.
//
// Second invariant, tout aussi central après la correction de ce tour :
// UNE SEULE frontière de vérification (verifyPersistedEntry ci-dessous) est
// utilisée par put/get/verify/hydrate. Le cache local n'est JAMAIS considéré
// comme la seule source de vérité — un cache vide ne signifie jamais
// "absent", seulement "pas encore vérifié dans ce processus". Toute lecture
// depuis le backend, avant mise en cache ou retour à l'appelant, revérifie :
//   1. l'identité (la clé recalculée depuis les champs de l'entrée doit
//      correspondre exactement à la clé sous laquelle elle a été trouvée) ;
//   2. le contenu (outputHash recalculé).
// Une entrée qui échoue l'un ou l'autre est une CORRUPTION, jamais
// silencieusement acceptée, jamais réparée, jamais mise en cache.
"use strict";

const { sha256CanonicalJson } = require("./ef-orch-hash-v0.1.js");
const { computeIdentityKey } = require("./ef-orch-run-output-store-v0.1.js"); // fonction pure réexportée, jamais l'instance de store elle-même

function str(v) {
  return String(v == null ? "" : v).trim();
}
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((k) => deepFreeze(value[k]));
  return Object.freeze(value);
}

const STORE_NAME = "runOutputs";

function publicView(entry) {
  return {
    runId: entry.runId,
    runContractHash: entry.runContractHash,
    stageId: entry.stageId,
    protocolHash: entry.protocolHash,
    output: clone(entry.output),
    outputHash: entry.outputHash,
    createdAt: entry.createdAt
  };
}

// ---------------------------------------------------------------------------
// verifyPersistedEntry(entry, expectedKey) -> { valid, reason?, computedKey?, computedHash? }
// Frontière de vérification UNIQUE, utilisée par toutes les opérations de
// lecture (get, verify, hydrate) et par la relecture d'un éventuel existant
// dans put. Ne lève jamais elle-même — retourne un verdict explicite, à
// l'appelant de décider (lever, rejeter, exclure de l'hydratation...).
// ---------------------------------------------------------------------------
async function verifyPersistedEntry(entry, expectedKey) {
  if (!entry) return { valid: false, reason: "entry_absente" };
  const computedKey = await computeIdentityKey({
    runId: entry.runId,
    runContractHash: entry.runContractHash,
    stageId: entry.stageId,
    protocolHash: entry.protocolHash
  });
  if (computedKey !== expectedKey) {
    return { valid: false, reason: "identite_incoherente", computedKey };
  }
  const computedHash = await sha256CanonicalJson(entry.output);
  if (computedHash !== entry.outputHash) {
    return { valid: false, reason: "hash_incoherent", computedHash };
  }
  return { valid: true, computedKey, computedHash };
}

function createDurableRunOutputStore({ backend }) {
  if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function") {
    throw new Error("createDurableRunOutputStore: backend invalide (attendu {get, put, has}).");
  }
  // Le cache est STRICTEMENT interne — jamais injectable de l'extérieur.
  // Une entrée injectée n'aurait jamais franchi verifyPersistedEntry(), et
  // l'appelant conserverait une référence lui permettant de la modifier
  // après coup : les deux annuleraient la frontière de vérification unique
  // que ce module prétend garantir.
  const localCache = new Map();

  // Lecture "froide" partagée par get/put : consulte le cache, sinon le
  // backend AVEC vérification avant toute mise en cache ou usage.
  async function resolveVerifiedEntry(key) {
    const cached = localCache.get(key);
    if (cached) return { entry: cached, verification: { valid: true } }; // déjà vérifiée au moment de sa mise en cache
    const fromBackend = await backend.get(STORE_NAME, key);
    if (!fromBackend) return { entry: null, verification: { valid: false, reason: "entry_absente" } };
    const verification = await verifyPersistedEntry(fromBackend, key);
    return { entry: verification.valid ? fromBackend : null, verification, raw: fromBackend };
  }

  async function putSuccessfulOutput(params) {
    const p = params || {};
    if (p.output === undefined) throw new Error("putSuccessfulOutput: output manquant.");
    const key = await computeIdentityKey(p);
    const outputHash = await sha256CanonicalJson(p.output);

    if (p.outputHash !== undefined && p.outputHash !== null && str(p.outputHash) && str(p.outputHash) !== outputHash) {
      throw new Error(
        "putSuccessfulOutput: outputHash fourni (" + str(p.outputHash) + ") ne correspond pas au hash recalculé (" + outputHash + ") — jamais accepté sans recalcul."
      );
    }

    // Consultation OBLIGATOIRE du backend si le cache local est vide — un
    // cache vide après redémarrage ne signifie jamais "rien n'existe".
    const { entry: existing, verification, raw } = await resolveVerifiedEntry(key);

    if (raw && !verification.valid) {
      throw new Error(
        "putSuccessfulOutput: checkpoint durable déjà présent sous cette identité mais CORROMPU (" + verification.reason +
        ") — jamais écrasé ni réparé silencieusement. Décision explicite requise avant toute nouvelle écriture."
      );
    }

    if (existing) {
      if (existing.outputHash === outputHash) {
        if (!localCache.has(key)) localCache.set(key, deepFreeze(clone(existing))); // remonte en cache une entrée saine trouvée dans le backend
        return publicView(existing);
      }
      throw new Error(
        "putSuccessfulOutput: conflit — un checkpoint différent existe déjà (durablement) pour runId=\"" + str(p.runId) +
        "\" stageId=\"" + str(p.stageId) + "\" (hash existant " + existing.outputHash + ", nouveau " + outputHash +
        "). Jamais d'écrasement silencieux, y compris après redémarrage."
      );
    }

    const entry = {
      runId: str(p.runId),
      runContractHash: str(p.runContractHash),
      stageId: str(p.stageId),
      protocolHash: p.protocolHash != null ? str(p.protocolHash) : null,
      output: clone(p.output),
      outputHash,
      createdAt: new Date().toISOString()
    };

    await backend.put(STORE_NAME, key, entry); // durable D'ABORD
    localCache.set(key, deepFreeze(clone(entry)));
    return publicView(entry);
  }

  async function getSuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    const { entry, verification, raw } = await resolveVerifiedEntry(key);
    if (raw && !verification.valid) {
      throw new Error(
        "getSuccessfulOutput: checkpoint trouvé sous cette identité mais CORROMPU (" + verification.reason +
        ") — jamais retourné comme fiable. Une lecture ne doit jamais faire confiance aveuglément au backend."
      );
    }
    if (!entry) return null;
    if (!localCache.has(key)) localCache.set(key, deepFreeze(clone(entry)));
    return publicView(entry);
  }

  async function hasSuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    if (localCache.has(key)) return true;
    // Une entrée présente mais corrompue existe "quelque part" mais n'est
    // pas un checkpoint utilisable — has() reflète l'utilisabilité, pas la
    // simple présence d'octets.
    const { entry } = await resolveVerifiedEntry(key);
    return !!entry;
  }

  async function verifySuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    const cached = localCache.get(key);
    if (cached) {
      const v = await verifyPersistedEntry(cached, key);
      return v.valid
        ? { valid: true, storedHash: cached.outputHash, computedHash: v.computedHash }
        : { valid: false, reason: v.reason, storedHash: cached.outputHash, computedHash: v.computedHash || null };
    }
    const fromBackend = await backend.get(STORE_NAME, key);
    if (!fromBackend) return { valid: false, reason: "checkpoint_absent", storedHash: null, computedHash: null };
    const v = await verifyPersistedEntry(fromBackend, key);
    return v.valid
      ? { valid: true, storedHash: fromBackend.outputHash, computedHash: v.computedHash }
      : { valid: false, reason: v.reason, storedHash: fromBackend.outputHash, computedHash: v.computedHash || null };
  }

  async function hydrate() {
    if (typeof backend.keys !== "function") {
      throw new Error("hydrate: ce backend n'expose pas keys() — impossible de réhydrater l'ensemble du store.");
    }
    const keys = await backend.keys(STORE_NAME);
    const corrupted = [];
    for (const key of keys) {
      const entry = await backend.get(STORE_NAME, key);
      if (!entry) continue;
      const verification = await verifyPersistedEntry(entry, key);
      if (!verification.valid) {
        corrupted.push({ key, reason: verification.reason });
        continue;
      }
      localCache.set(key, deepFreeze(clone(entry)));
    }
    return { hydratedCount: keys.length - corrupted.length, corrupted };
  }

  return { putSuccessfulOutput, getSuccessfulOutput, hasSuccessfulOutput, verifySuccessfulOutput, hydrate };
}

const EFOrchDurableRunOutputStore = { createDurableRunOutputStore };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchDurableRunOutputStore;
}
if (typeof window !== "undefined") {
  window.EFOrchDurableRunOutputStore = EFOrchDurableRunOutputStore;
}
