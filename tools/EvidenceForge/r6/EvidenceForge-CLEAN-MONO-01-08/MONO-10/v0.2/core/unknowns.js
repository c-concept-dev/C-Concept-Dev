"use strict";
/**
 * MONO-10 v0.2 — core/unknowns.js
 *
 * FERMETURE F-06 / F-07. Les unknowns deviennent une donnee LINEAGE-FIRST.
 * Un unknown ne disparait jamais silencieusement : il ne sort du flux que par
 * une transition EXPLICITE portant une preuve.
 */

const { isNonEmptyStr, fail } = require("./execution-evidence.js");
const { sha256Of } = require("./lineage.js");

const BLOCKING = { BLOCKING: "BLOCKING", NON_BLOCKING: "NON_BLOCKING", NOT_ASSESSED: "NOT_ASSESSED" };
const STATUS = { OPEN: "OPEN", RESOLVED: "RESOLVED", SUPERSEDED: "SUPERSEDED", RECLASSIFIED: "RECLASSIFIED" };
const TERMINAL = [STATUS.RESOLVED, STATUS.SUPERSEDED, STATUS.RECLASSIFIED];

function makeUnknown(u) {
  u = u || {};
  if (!isNonEmptyStr(u.reason)) throw fail("UNKNOWN_INVALID", "reason non vide requise.");
  if (!isNonEmptyStr(u.originArtifact)) throw fail("UNKNOWN_INVALID", "originArtifact requis — un unknown sans origine n'est pas tracable.");
  const blocking = BLOCKING[u.blockingStatus] ? u.blockingStatus : BLOCKING.NOT_ASSESSED;
  const base = {
    originArtifact: u.originArtifact, reason: u.reason,
    blockingStatus: blocking, status: STATUS.OPEN,
    evidenceRefs: Array.isArray(u.evidenceRefs) ? u.evidenceRefs.slice() : [],
    transitions: [],
  };
  base.unknownId = isNonEmptyStr(u.unknownId) ? u.unknownId : ("unk-" + sha256Of(base).slice(0, 16));
  return base;
}

/** Transition EXPLICITE, exigeant une preuve et un motif. */
function transition(unknown, newStatus, evidence) {
  if (TERMINAL.indexOf(newStatus) === -1) throw fail("UNKNOWN_TRANSITION_INVALID", "statut " + JSON.stringify(newStatus) + " non autorise.");
  if (!evidence || !isNonEmptyStr(evidence.reason)) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "une transition exige un motif explicite.");
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0) {
    throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "une transition exige au moins une reference de preuve.");
  }
  return Object.assign({}, unknown, { status: newStatus,
    transitions: unknown.transitions.concat([{ from: unknown.status, to: newStatus, reason: evidence.reason, evidenceRefs: evidence.evidenceRefs.slice(), at: new Date().toISOString() }]) });
}

/**
 * propagate(upstream, added) — fusionne SANS PERTE.
 * Fermeture F-06 : tout unknown amont encore OPEN est conserve. Aucun
 * reconstruction silencieuse a [].
 */
function propagate(upstream, added) {
  const out = new Map();
  (upstream || []).forEach((u) => out.set(u.unknownId, u));
  (added || []).forEach((u) => { if (!out.has(u.unknownId)) out.set(u.unknownId, u); });
  return Array.from(out.values());
}

/** Verifie qu'aucun unknown amont OPEN n'a ete perdu. */
function assertNoSilentLoss(upstream, downstream, label) {
  const down = new Set((downstream || []).map((u) => u.unknownId));
  const lost = (upstream || []).filter((u) => u.status === STATUS.OPEN && !down.has(u.unknownId));
  if (lost.length) {
    throw fail("UNKNOWN_SILENTLY_DROPPED",
      (label || "propagation") + " : " + lost.length + " unknown(s) OPEN perdu(s) sans transition explicite — " + lost.map((u) => u.unknownId).join(", "));
  }
  return true;
}

function openOnes(list) { return (list || []).filter((u) => u.status === STATUS.OPEN); }
function blockingOpen(list) { return openOnes(list).filter((u) => u.blockingStatus === BLOCKING.BLOCKING); }

module.exports = { makeUnknown, transition, propagate, assertNoSilentLoss, openOnes, blockingOpen, BLOCKING, STATUS };
