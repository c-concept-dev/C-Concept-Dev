"use strict";
/**
 * MONO-10 v0.6 — core/replay-protection.js   (§25, §26, §27, §28)
 *
 * FERMETURES v0.5 B06 et B07.
 *
 * B06 : `consumeNonce: false` permettait de verifier sans consommer, donc de
 *       rejouer. En v0.6, la consommation est OBLIGATOIRE en production a
 *       l'ouverture d'un run : le drapeau ne peut plus la desactiver.
 * B07 : le store etait attache a une instance de frontiere et a un repertoire
 *       arbitraire. Une seconde frontiere au repertoire vierge acceptait la
 *       meme attestation. En v0.6, la cle logique est
 *       `authorityId + keyId + nonce`, et le store declare son NAMESPACE
 *       D'AUTORITE : deux frontieres de la meme autorite doivent partager le
 *       meme namespace, sans quoi c'est un echec ferme.
 */

const fs = require("fs");
const path = require("path");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");

const STORE_BRAND = new WeakSet();
const KIND = { MEMORY: "MEMORY", FILE: "FILE" };

function assertStoreContract(store, label) {
  if (!store || typeof store !== "object") throw fail("REPLAY_STORE_MISSING", (label || "store") + " : absent.");
  ["hasSeen", "getSeen", "markSeen", "checkAndConsume", "coversAuthority"].forEach(function (m) {
    if (typeof store[m] !== "function") throw fail("REPLAY_STORE_INVALID", (label || "store") + " : methode \"" + m + "\" absente.");
  });
  return true;
}
function isProvisionedStore(store) { return !!store && STORE_BRAND.has(store); }
function brand(store) { STORE_BRAND.add(store); return Object.freeze(store); }

/** §26 — la cle logique inclut l'autorite ET la cle de signature. */
function nonceKey(authorityId, keyId, nonce) { return sha256Of({ a: authorityId, k: keyId || null, n: nonce }); }

/** Store EN MEMOIRE — jamais admis en PRODUCTION. */
function createMemoryReplayStore(o) {
  o = o || {};
  const seen = new Map();
  const scope = new Set(o.authorityScope || []);
  return brand({
    kind: KIND.MEMORY, persistent: false, shared: false,
    storeId: "memory:" + (o.namespaceId || "anonymous"),
    authorityScope: Array.from(scope),
    coversAuthority(authorityId) { return scope.size === 0 || scope.has(authorityId); },
    hasSeen(a, k, n) { return seen.has(nonceKey(a, k, n)); },
    getSeen(a, k, n) { return seen.get(nonceKey(a, k, n)) || null; },
    markSeen(a, k, n, meta) { seen.set(nonceKey(a, k, n), meta || {}); return true; },
    checkAndConsume(a, k, n, meta) {
      const key = nonceKey(a, k, n);
      if (seen.has(key)) return { consumed: false, reason: "nonce deja consomme pour cette autorite et cette cle" };
      seen.set(key, Object.assign({ consumedAt: new Date().toISOString() }, meta || {}));
      return { consumed: true, reason: null };
    },
  });
}

/**
 * Store PERSISTANT et PARTAGEABLE. Le repertoire est un NAMESPACE D'AUTORITE :
 * l'exploitant declare quelles autorites il couvre, et le store refuse de
 * repondre pour une autorite hors de son perimetre — ce qui rend l'absence de
 * partage visible au lieu de silencieuse.
 */
function createFileReplayStore(o) {
  o = o || {};
  const dir = o.directory;
  if (!isNonEmptyStr(dir)) throw fail("REPLAY_STORE_INVALID", "directory requis.");
  const scope = new Set(o.authorityScope || []);
  if (scope.size === 0) {
    throw fail("REPLAY_STORE_SCOPE_MISSING",
      "un store de rejeu doit declarer les autorites qu'il couvre (authorityScope) : sans perimetre explicite, "
      + "deux frontieres de la meme autorite pourraient ne pas partager le meme namespace — fail closed.");
  }
  fs.mkdirSync(dir, { recursive: true });
  const entry = (a, k, n) => path.join(dir, nonceKey(a, k, n) + ".nonce");
  return brand({
    kind: KIND.FILE, persistent: true, shared: true,
    storeId: "file:" + sha256Of({ dir: path.resolve(dir) }).slice(0, 16),
    /** §27 — le namespace logique, publiable et comparable entre frontieres. */
    authorityNamespaceHash: sha256Of({ dir: path.resolve(dir), scope: Array.from(scope).slice().sort() }),
    authorityScope: Array.from(scope),
    coversAuthority(authorityId) { return scope.has(authorityId); },
    hasSeen(a, k, n) { return fs.existsSync(entry(a, k, n)); },
    getSeen(a, k, n) { try { return JSON.parse(fs.readFileSync(entry(a, k, n), "utf8")); } catch (e) { return null; } },
    markSeen(a, k, n, meta) { try { fs.writeFileSync(entry(a, k, n), JSON.stringify(meta || {}), { flag: "wx" }); return true; } catch (e) { return false; } },
    checkAndConsume(a, k, n, meta) {
      try {
        fs.writeFileSync(entry(a, k, n), JSON.stringify(Object.assign({ consumedAt: new Date().toISOString() }, meta || {})), { flag: "wx" });
        return { consumed: true, reason: null };
      } catch (e) {
        if (e && e.code === "EEXIST") return { consumed: false, reason: "nonce deja consomme (entree persistante existante)" };
        return { consumed: false, reason: "store indisponible : " + ((e && e.message) || e) };
      }
    },
  });
}

module.exports = { createMemoryReplayStore, createFileReplayStore, assertStoreContract, isProvisionedStore, nonceKey, KIND };
