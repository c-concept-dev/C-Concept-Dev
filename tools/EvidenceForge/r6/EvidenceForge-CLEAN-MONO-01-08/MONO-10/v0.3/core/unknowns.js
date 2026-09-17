"use strict";
/**
 * MONO-10 v0.3 — core/unknowns.js
 *
 * FERMETURE B-07 / §11 / §12. Un unknown est une CHAINE D'EVENEMENTS.
 *
 * En v0.2, forcer `status: "RESOLVED"` sur une copie suffisait a le faire
 * disparaitre des bloquants. Ici, le statut est derive de la chaine : un statut
 * incoherent avec `transitions` est REJETE, et la fusion de deux versions
 * reconstruit la chaine au lieu de garder arbitrairement la premiere.
 */

const { isNonEmptyStr, fail, sha256Of } = require("./run-evidence-manifest.js");

const BLOCKING = { BLOCKING: "BLOCKING", NON_BLOCKING: "NON_BLOCKING", NOT_ASSESSED: "NOT_ASSESSED" };
const STATUS = { OPEN: "OPEN", RESOLVED: "RESOLVED", SUPERSEDED: "SUPERSEDED", RECLASSIFIED: "RECLASSIFIED" };
const TERMINAL = [STATUS.RESOLVED, STATUS.SUPERSEDED, STATUS.RECLASSIFIED];

function makeUnknown(u) {
  u = u || {};
  if (!isNonEmptyStr(u.reason)) throw fail("UNKNOWN_INVALID", "reason non vide requise.");
  if (!isNonEmptyStr(u.originArtifact)) throw fail("UNKNOWN_INVALID", "originArtifact requis.");
  const base = {
    originArtifact: u.originArtifact, reason: u.reason,
    blockingStatus: BLOCKING[u.blockingStatus] ? u.blockingStatus : BLOCKING.NOT_ASSESSED,
    evidenceRefs: Array.isArray(u.evidenceRefs) ? u.evidenceRefs.slice() : [],
    transitions: [],
  };
  base.unknownId = isNonEmptyStr(u.unknownId) ? u.unknownId : ("unk-" + sha256Of(base).slice(0, 16));
  base.genesisHash = sha256Of({ unknownId: base.unknownId, originArtifact: base.originArtifact, reason: base.reason });
  base.status = STATUS.OPEN;
  return base;
}

/** Le statut EFFECTIF est derive de la chaine, jamais lu sur le champ. */
function effectiveStatus(u) {
  if (!u || !Array.isArray(u.transitions) || u.transitions.length === 0) return STATUS.OPEN;
  return u.transitions[u.transitions.length - 1].toStatus;
}

/** Verifie que la chaine est coherente et que le champ status n'a pas ete force. */
function assertChainValid(u, label) {
  label = label || (u && u.unknownId) || "unknown";
  if (!u || !isNonEmptyStr(u.unknownId)) throw fail("UNKNOWN_INVALID", label + " : unknownId requis.");
  if (!Array.isArray(u.transitions)) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transitions[] requis.");
  let prevStatus = STATUS.OPEN;
  let prevHash = u.genesisHash || null;
  for (let i = 0; i < u.transitions.length; i++) {
    const t = u.transitions[i];
    if (t.fromStatus !== prevStatus) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transition[" + i + "] part de \"" + t.fromStatus + "\" au lieu de \"" + prevStatus + "\".");
    if (TERMINAL.indexOf(t.toStatus) === -1) throw fail("UNKNOWN_CHAIN_INVALID", label + " : toStatus \"" + t.toStatus + "\" non autorise.");
    if (!isNonEmptyStr(t.reason)) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", label + " : transition[" + i + "] sans motif.");
    if (!Array.isArray(t.evidenceRefs) || t.evidenceRefs.length === 0) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", label + " : transition[" + i + "] sans preuve.");
    if (!isNonEmptyStr(t.decidedAt) || isNaN(Date.parse(t.decidedAt))) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transition[" + i + "] sans horodatage reel.");
    if (t.previousEventHash !== prevHash) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transition[" + i + "] ne chaine pas l'evenement precedent (fork ou predecesseur manquant).");
    const expected = sha256Of({ unknownId: u.unknownId, fromStatus: t.fromStatus, toStatus: t.toStatus, reason: t.reason, evidenceRefs: t.evidenceRefs, decidedAt: t.decidedAt, previousEventHash: t.previousEventHash });
    if (t.transitionId !== expected) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transitionId invalide — evenement forge.");
    prevStatus = t.toStatus; prevHash = t.transitionId;
  }
  const derived = prevStatus;
  if (u.status !== derived) {
    throw fail("UNKNOWN_STATUS_FORGED", label + " : champ status=\"" + u.status + "\" incoherent avec la chaine (=\"" + derived + "\") — un statut ne se declare jamais.");
  }
  return true;
}

function transition(unknown, newStatus, evidence) {
  assertChainValid(unknown);
  if (TERMINAL.indexOf(newStatus) === -1) throw fail("UNKNOWN_TRANSITION_INVALID", "statut " + JSON.stringify(newStatus) + " non autorise.");
  if (!evidence || !isNonEmptyStr(evidence.reason)) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "motif explicite requis.");
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "au moins une reference de preuve requise.");
  const from = effectiveStatus(unknown);
  const prevHash = unknown.transitions.length ? unknown.transitions[unknown.transitions.length - 1].transitionId : unknown.genesisHash;
  const t = { fromStatus: from, toStatus: newStatus, reason: evidence.reason,
    evidenceRefs: evidence.evidenceRefs.slice(), decidedAt: isNonEmptyStr(evidence.decidedAt) ? evidence.decidedAt : new Date().toISOString(),
    previousEventHash: prevHash };
  t.transitionId = sha256Of({ unknownId: unknown.unknownId, fromStatus: t.fromStatus, toStatus: t.toStatus, reason: t.reason, evidenceRefs: t.evidenceRefs, decidedAt: t.decidedAt, previousEventHash: t.previousEventHash });
  return Object.assign({}, unknown, { status: newStatus, transitions: unknown.transitions.concat([t]) });
}

/**
 * mergeUnknown(a, b) — §12. Reconstruit la chaine ; ne garde jamais
 * arbitrairement la premiere version. Un OPEN/BLOCKING plus recent ne peut pas
 * etre masque par une version anterieure plus favorable.
 */
function mergeUnknown(a, b) {
  if (a.unknownId !== b.unknownId) throw fail("UNKNOWN_MERGE_INVALID", "identifiants differents.");
  if (a.genesisHash !== b.genesisHash) throw fail("UNKNOWN_FORK_DETECTED", a.unknownId + " : genesis divergente — fork detecte.");
  const longer = a.transitions.length >= b.transitions.length ? a : b;
  const shorter = longer === a ? b : a;
  for (let i = 0; i < shorter.transitions.length; i++) {
    if (shorter.transitions[i].transitionId !== longer.transitions[i].transitionId) {
      throw fail("UNKNOWN_FORK_DETECTED", a.unknownId + " : chaines divergentes a la transition " + i + ".");
    }
  }
  // Le blocage le plus severe survit : une version anterieure ne l'attenue jamais.
  const severity = { BLOCKING: 2, NOT_ASSESSED: 1, NON_BLOCKING: 0 };
  const blocking = severity[a.blockingStatus] >= severity[b.blockingStatus] ? a.blockingStatus : b.blockingStatus;
  return Object.assign({}, longer, { blockingStatus: blocking });
}

function propagate(upstream, added) {
  const out = new Map();
  const put = (u) => {
    assertChainValid(u);
    if (out.has(u.unknownId)) out.set(u.unknownId, mergeUnknown(out.get(u.unknownId), u));
    else out.set(u.unknownId, u);
  };
  (upstream || []).forEach(put);
  (added || []).forEach(put);
  return Array.from(out.values());
}

function assertNoSilentLoss(upstream, downstream, label) {
  const down = new Set((downstream || []).map((u) => u.unknownId));
  const lost = (upstream || []).filter((u) => effectiveStatus(u) === STATUS.OPEN && !down.has(u.unknownId));
  if (lost.length) {
    throw fail("UNKNOWN_SILENTLY_DROPPED", (label || "propagation") + " : " + lost.length + " unknown(s) OPEN perdu(s) — " + lost.map((u) => u.unknownId).join(", "));
  }
  return true;
}

function openOnes(list) { return (list || []).filter((u) => effectiveStatus(u) === STATUS.OPEN); }
function blockingOpen(list) { return openOnes(list).filter((u) => u.blockingStatus === BLOCKING.BLOCKING); }

module.exports = { makeUnknown, transition, mergeUnknown, propagate, assertNoSilentLoss, assertChainValid, effectiveStatus, openOnes, blockingOpen, BLOCKING, STATUS };
