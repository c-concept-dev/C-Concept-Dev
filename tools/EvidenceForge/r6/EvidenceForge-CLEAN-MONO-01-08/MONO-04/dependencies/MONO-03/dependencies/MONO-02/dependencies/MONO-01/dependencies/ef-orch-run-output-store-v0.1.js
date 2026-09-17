// EvidenceForge — EF-ORCH-03A — RunOutputStore — v0.1
// Rôle strict : conserver une sortie de stage déjà réussie et validée, pour
// qu'un stage aval (ou un run repris) utilise exactement cette sortie sans
// déclencher silencieusement une nouvelle exécution. N'exécute jamais rien,
// n'appelle jamais aucun réseau, ne connaît ni la State Machine ni le Stage
// Adapter — cf. EF-ORCH-03 §2 (séparation stricte des responsabilités).
"use strict";

const { sha256CanonicalJson } = require("./ef-orch-hash-v0.1.js");

function isNonEmptyStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function str(v) {
  return String(v == null ? "" : v).trim();
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

// structuredClone est disponible nativement (Node >= 17, tous navigateurs
// modernes) — pas de réimplémentation maison d'un clone profond.
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

// ---------------------------------------------------------------------------
// Identité d'un checkpoint = hash canonique de (runId, runContractHash,
// stageId, protocolHash). Jamais stageId seul : deux runs différents ne
// doivent jamais pouvoir partager un checkpoint, même par accident.
//
// protocolHash est normalisé à null explicite quand il est absent. Le store
// ne peut pas — et ne doit pas essayer de — distinguer "ce stage n'a pas de
// protocole applicable" de "l'appelant a oublié de le fournir" : cette
// connaissance métier appartient à la classification EF-01/EF-02 et à
// l'orchestrateur, jamais au store générique. La seule garantie que le store
// offre est : un protocolHash fourni fait partie de l'identité, et deux
// protocolHash différents ne récupèrent jamais le même checkpoint.
//
// Fonction exportée (pas seulement interne) : les tests doivent pouvoir
// calculer exactement la même clé pour injecter une corruption dans un
// backingStore fourni, sans dupliquer cette logique ailleurs et risquer une
// divergence avec la vraie clé utilisée en production.
// ---------------------------------------------------------------------------
async function computeIdentityKey({ runId, runContractHash, stageId, protocolHash }) {
  if (!isNonEmptyStr(runId)) throw new Error("RunOutputStore: runId manquant ou vide.");
  if (!isNonEmptyStr(runContractHash)) throw new Error("RunOutputStore: runContractHash manquant ou vide.");
  if (!isNonEmptyStr(stageId)) throw new Error("RunOutputStore: stageId manquant ou vide.");
  return sha256CanonicalJson({
    runId: str(runId),
    runContractHash: str(runContractHash),
    stageId: str(stageId),
    protocolHash: protocolHash != null ? str(protocolHash) : null
  });
}

// ---------------------------------------------------------------------------
// createRunOutputStore(options?) -> store en mémoire.
// options.backingStore : Map optionnelle à utiliser comme stockage interne.
// Réservé à l'usage des tests, qui peuvent ainsi fournir leur propre Map et
// la corrompre directement pour tester verifySuccessfulOutput — sans qu'aucune
// fonction de mutation directe n'existe dans l'API publique retournée
// ci-dessous. Le code de production n'a jamais besoin de passer ce paramètre :
// une Map privée est créée par défaut.
// ---------------------------------------------------------------------------
function createRunOutputStore(options) {
  const opts = options || {};
  const entries = opts.backingStore instanceof Map ? opts.backingStore : new Map();

  // Vue publique : toujours un clone frais et mutable, jamais une référence
  // vers l'objet gelé interne — lire ne doit jamais permettre de corrompre
  // le store, même par inadvertance.
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

  // -------------------------------------------------------------------------
  // putSuccessfulOutput
  // -------------------------------------------------------------------------
  async function putSuccessfulOutput(params) {
    const p = params || {};
    if (p.output === undefined) throw new Error("putSuccessfulOutput: output manquant.");

    const key = await computeIdentityKey(p); // lève si runId/runContractHash/stageId invalides

    // Jamais confiance dans un outputHash fourni par l'appelant : recalculé
    // systématiquement avec la fondation canonique déjà gelée. Si l'appelant
    // en a quand même fourni un, il doit correspondre — sinon rejet explicite,
    // jamais un silencieux "on l'ignore et on recalcule sans le dire".
    const computedHash = await sha256CanonicalJson(p.output);
    if (p.outputHash !== undefined && p.outputHash !== null && str(p.outputHash) && str(p.outputHash) !== computedHash) {
      throw new Error(
        "putSuccessfulOutput: outputHash fourni (" + str(p.outputHash) + ") ne correspond pas au hash recalculé (" + computedHash + ") — jamais accepté sans recalcul."
      );
    }

    const existing = entries.get(key);
    if (existing) {
      if (existing.outputHash === computedHash) {
        // Idempotent : même identité, même contenu -> on renvoie le checkpoint
        // existant tel quel, jamais un doublon ni un réécrasement.
        return publicView(existing);
      }
      throw new Error(
        "putSuccessfulOutput: conflit — un checkpoint différent existe déjà pour runId=\"" + str(p.runId) +
        "\" stageId=\"" + str(p.stageId) + "\" (hash existant " + existing.outputHash + ", nouveau " + computedHash +
        "). Jamais d'écrasement silencieux (\"last write wins\" interdit pour une sortie réussie)."
      );
    }

    const entry = {
      runId: str(p.runId),
      runContractHash: str(p.runContractHash),
      stageId: str(p.stageId),
      protocolHash: p.protocolHash != null ? str(p.protocolHash) : null,
      output: deepFreeze(clone(p.output)), // clone AVANT gel : ne fige jamais l'objet de l'appelant lui-même
      outputHash: computedHash,
      createdAt: new Date().toISOString() // audit uniquement — ne participe jamais au calcul d'outputHash
    };
    entries.set(key, entry);
    return publicView(entry);
  }

  // -------------------------------------------------------------------------
  // getSuccessfulOutput — jamais d'exécution, jamais de réseau, jamais de
  // recalcul, jamais de fallback. Absence = null, explicitement.
  // -------------------------------------------------------------------------
  async function getSuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    const entry = entries.get(key);
    return entry ? publicView(entry) : null;
  }

  // -------------------------------------------------------------------------
  // hasSuccessfulOutput — présence pure, même résolution d'identité complète
  // que get/put (donc sensible au protocolHash quand il fait partie de la
  // demande, sans logique spéciale : c'est la même fonction computeIdentityKey).
  // -------------------------------------------------------------------------
  async function hasSuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    return entries.has(key);
  }

  // -------------------------------------------------------------------------
  // verifySuccessfulOutput — revérification cryptographique, jamais de
  // réparation automatique. Retourne une information explicite de validité.
  // -------------------------------------------------------------------------
  async function verifySuccessfulOutput(identity) {
    const key = await computeIdentityKey(identity || {});
    const entry = entries.get(key);
    if (!entry) return { valid: false, reason: "checkpoint_absent", storedHash: null, computedHash: null };
    const computedHash = await sha256CanonicalJson(entry.output);
    return { valid: computedHash === entry.outputHash, storedHash: entry.outputHash, computedHash };
  }

  // Surface publique exacte et volontairement minimale : aucune fonction de
  // mutation directe, aucun accès à `entries`. Une corruption pour les tests
  // ne peut venir que d'un backingStore fourni par l'appelant du test
  // lui-même — jamais de cette API.
  return {
    putSuccessfulOutput,
    getSuccessfulOutput,
    hasSuccessfulOutput,
    verifySuccessfulOutput
  };
}

const EFOrchRunOutputStore = { createRunOutputStore, computeIdentityKey };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchRunOutputStore;
}
if (typeof window !== "undefined") {
  window.EFOrchRunOutputStore = EFOrchRunOutputStore;
}
