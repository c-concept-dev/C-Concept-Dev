"use strict";
/**
 * MONO-10 v0.5 — core/replay-protection.js   (§12, §13)
 *
 * Un `Set` en memoire fourni par l'appelant n'est pas une protection : il
 * disparait a la fin de l'appel et l'appelant peut ne pas le fournir. v0.5
 * definit un CONTRAT, provisionne par la frontiere operateur, et le rend
 * OBLIGATOIRE en production — absent, on echoue ferme, jamais en avertissement.
 *
 * Contrat minimal :
 *   hasSeen(authorityId, nonce)
 *   getSeen(authorityId, nonce)     -> l'enregistrement de consommation, ou null
 *   markSeen(authorityId, nonce, meta)
 *   checkAndConsume(authorityId, nonce, meta) -> { consumed, reason }
 *
 * `getSeen` distingue un REJEU (nonce consomme par un AUTRE run) d'une simple
 * reverification du run qui l'a legitimement consomme.
 *
 * `checkAndConsume` doit etre ATOMIQUE du point de vue de l'appelant : deux
 * consommations du meme nonce ne peuvent pas reussir toutes les deux.
 */

const fs = require("fs");
const path = require("path");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");

const STORE_BRAND = new WeakSet();
const KIND = { MEMORY: "MEMORY", FILE: "FILE" };

function assertStoreContract(store, label) {
  if (!store || typeof store !== "object") throw fail("REPLAY_STORE_MISSING", (label || "store") + " : absent.");
  ["hasSeen", "getSeen", "markSeen", "checkAndConsume"].forEach(function (m) {
    if (typeof store[m] !== "function") throw fail("REPLAY_STORE_INVALID", (label || "store") + " : methode \"" + m + "\" absente.");
  });
  return true;
}
/** Marque d'origine : seul un store construit ICI la porte. Un objet fourni par
 *  l'appelant ne peut pas l'obtenir, meme en imitant la forme du contrat. */
function isProvisionedStore(store) { return !!store && STORE_BRAND.has(store); }

function brand(store) { STORE_BRAND.add(store); return Object.freeze(store); }

/** Store EN MEMOIRE — jamais admis en PRODUCTION (voir operator-trust-boundary). */
function createMemoryReplayStore(namespaceId) {
  const seen = new Map();
  return brand({
    kind: KIND.MEMORY, persistent: false, storeId: "memory:" + (namespaceId || "anonymous"),
    hasSeen(authorityId, nonce) { return seen.has(authorityId + "|" + nonce); },
    getSeen(authorityId, nonce) { return seen.get(authorityId + "|" + nonce) || null; },
    markSeen(authorityId, nonce, meta) { seen.set(authorityId + "|" + nonce, meta || {}); return true; },
    checkAndConsume(authorityId, nonce, meta) {
      const k = authorityId + "|" + nonce;
      if (seen.has(k)) return { consumed: false, reason: "nonce deja consomme pour cette autorite" };
      seen.set(k, Object.assign({ consumedAt: new Date().toISOString() }, meta || {}));
      return { consumed: true, reason: null };
    },
  });
}

/**
 * Store PERSISTANT adosse au systeme de fichiers, provisionne par l'exploitant.
 * L'exclusion mutuelle repose sur une creation de fichier exclusive (`wx`) :
 * l'operation echoue si l'entree existe deja, ce qui rend la consommation
 * atomique au niveau du systeme de fichiers. Il survit au redemarrage.
 */
function createFileReplayStore(dir) {
  if (!isNonEmptyStr(dir)) throw fail("REPLAY_STORE_INVALID", "repertoire requis.");
  fs.mkdirSync(dir, { recursive: true });
  const entry = (a, n) => path.join(dir, sha256Of({ a: a, n: n }) + ".nonce");
  return brand({
    kind: KIND.FILE, persistent: true, storeId: "file:" + sha256Of({ dir: dir }).slice(0, 16),
    hasSeen(authorityId, nonce) { return fs.existsSync(entry(authorityId, nonce)); },
    getSeen(authorityId, nonce) {
      try { return JSON.parse(fs.readFileSync(entry(authorityId, nonce), "utf8")); } catch (e) { return null; }
    },
    markSeen(authorityId, nonce, meta) {
      try { fs.writeFileSync(entry(authorityId, nonce), JSON.stringify(meta || {}), { flag: "wx" }); return true; }
      catch (e) { return false; }
    },
    checkAndConsume(authorityId, nonce, meta) {
      try {
        fs.writeFileSync(entry(authorityId, nonce),
          JSON.stringify(Object.assign({ consumedAt: new Date().toISOString() }, meta || {})), { flag: "wx" });
        return { consumed: true, reason: null };
      } catch (e) {
        if (e && e.code === "EEXIST") return { consumed: false, reason: "nonce deja consomme (entree persistante existante)" };
        return { consumed: false, reason: "store indisponible : " + ((e && e.message) || e) };
      }
    },
  });
}

module.exports = { createMemoryReplayStore, createFileReplayStore, assertStoreContract, isProvisionedStore, KIND };
