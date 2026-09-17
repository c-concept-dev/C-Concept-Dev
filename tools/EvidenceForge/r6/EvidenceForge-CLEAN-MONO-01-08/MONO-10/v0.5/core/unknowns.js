"use strict";
/**
 * MONO-10 v0.5 — core/unknowns.js
 *
 * FERMETURE v0.3 B-5 (§14, §15, §16).
 *
 * v0.3 scellait solidement la chaine d'evenements — rejeu, fork, desordre,
 * transitionId reutilise : tout etait rejete. Mais elle scellait un CONTENU que
 * personne ne verifiait : `evidenceRefs: ["preuve-qui-n-existe-pas"]` fermait un
 * inconnu bloquant. Une chaine inviolable autour d'une preuve inexistante.
 *
 * v0.4 : une transition n'est valide que si ses references de preuve RESOLVENT
 * contre le registre d'artefacts — existence, empreinte, relation, run, mission.
 * Chaque evenement porte en outre son run et un numero de sequence monotone.
 *
 * `unknown remains unknown` : un inconnu ne se ferme que par une preuve qui
 * existe reellement.
 */

const { sha256Of, isNonEmptyStr, fail } = require("./canonical.js");
const { resolveLineage } = require("./lineage.js");
const AAR = require("./authenticated-artifact-registry.js");

const BLOCKING = { BLOCKING: "BLOCKING", NON_BLOCKING: "NON_BLOCKING", NOT_ASSESSED: "NOT_ASSESSED" };
const STATUS = { OPEN: "OPEN", RESOLVED: "RESOLVED", SUPERSEDED: "SUPERSEDED", RECLASSIFIED: "RECLASSIFIED" };
const TERMINAL = [STATUS.RESOLVED, STATUS.SUPERSEDED, STATUS.RECLASSIFIED];
const SEVERITY = { BLOCKING: 2, NOT_ASSESSED: 1, NON_BLOCKING: 0 };

function makeUnknown(u) {
  u = u || {};
  if (!isNonEmptyStr(u.reason)) throw fail("UNKNOWN_INVALID", "reason non vide requise.");
  if (!isNonEmptyStr(u.originArtifact)) throw fail("UNKNOWN_INVALID", "originArtifact requis.");
  const base = {
    originArtifact: u.originArtifact, reason: u.reason,
    blockingStatus: BLOCKING[u.blockingStatus] ? u.blockingStatus : BLOCKING.NOT_ASSESSED,
    evidenceRefs: Array.isArray(u.evidenceRefs) ? u.evidenceRefs.slice() : [],
    runId: isNonEmptyStr(u.runId) ? u.runId : null,
    transitions: [],
  };
  base.unknownId = isNonEmptyStr(u.unknownId) ? u.unknownId : ("unk-" + sha256Of(base).slice(0, 16));
  base.genesisHash = sha256Of({ unknownId: base.unknownId, originArtifact: base.originArtifact, reason: base.reason, runId: base.runId });
  base.status = STATUS.OPEN;
  base.sequence = 0;
  return base;
}

function effectiveStatus(u) {
  if (!u || !Array.isArray(u.transitions) || u.transitions.length === 0) return STATUS.OPEN;
  return u.transitions[u.transitions.length - 1].toStatus;
}

function transitionPayload(u, t) {
  return { unknownId: u.unknownId, sequence: t.sequence, fromStatus: t.fromStatus, toStatus: t.toStatus,
    reason: t.reason, evidenceRefs: t.evidenceRefs, decidedAt: t.decidedAt, runId: t.runId,
    previousEventHash: t.previousEventHash };
}

/**
 * assertChainValid(u, label, ctx)
 * ctx.registry               §14 — registre des artefacts disponibles
 * ctx.expectedRunId / ctx.expectedMissionHash / ctx.expectedAttestationHash
 * ctx.requireResolvableEvidence  defaut TRUE des qu'un registre est fourni
 */
function assertChainValid(u, label, ctx) {
  ctx = ctx || {};
  label = label || (u && u.unknownId) || "unknown";
  if (!u || !isNonEmptyStr(u.unknownId)) throw fail("UNKNOWN_INVALID", label + " : unknownId requis.");
  if (!Array.isArray(u.transitions)) throw fail("UNKNOWN_CHAIN_INVALID", label + " : transitions[] requis.");
  let prevStatus = STATUS.OPEN, prevHash = u.genesisHash || null, prevSeq = 0;

  for (let i = 0; i < u.transitions.length; i++) {
    const t = u.transitions[i];
    const tag = label + " : transition[" + i + "]";
    if (t.fromStatus !== prevStatus) throw fail("UNKNOWN_CHAIN_INVALID", tag + " part de \"" + t.fromStatus + "\" au lieu de \"" + prevStatus + "\".");
    if (TERMINAL.indexOf(t.toStatus) === -1) throw fail("UNKNOWN_CHAIN_INVALID", tag + " : toStatus \"" + t.toStatus + "\" non autorise.");
    if (!isNonEmptyStr(t.reason)) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", tag + " sans motif.");
    if (!Array.isArray(t.evidenceRefs) || t.evidenceRefs.length === 0) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", tag + " sans preuve.");
    if (!isNonEmptyStr(t.decidedAt) || isNaN(Date.parse(t.decidedAt))) throw fail("UNKNOWN_CHAIN_INVALID", tag + " sans horodatage reel.");
    // §15 — sequence monotone : un rejeu logique ne peut pas se glisser.
    if (typeof t.sequence !== "number" || t.sequence !== prevSeq + 1) {
      throw fail("UNKNOWN_CHAIN_INVALID", tag + " : sequence " + t.sequence + " attendue " + (prevSeq + 1) + " — rejeu ou desordre.");
    }
    if (t.previousEventHash !== prevHash) throw fail("UNKNOWN_CHAIN_INVALID", tag + " ne chaine pas l'evenement precedent (fork ou predecesseur manquant).");
    if (t.transitionId !== sha256Of(transitionPayload(u, t))) throw fail("UNKNOWN_CHAIN_INVALID", tag + " : transitionId invalide — evenement forge.");
    // §15 — un evenement d'un autre run ne ferme pas un inconnu de ce run.
    if (isNonEmptyStr(ctx.expectedRunId) && isNonEmptyStr(t.runId) && t.runId !== ctx.expectedRunId) {
      throw fail("UNKNOWN_CROSS_RUN_EVENT", tag + " : evenement issu du run \"" + t.runId + "\", attendu \"" + ctx.expectedRunId + "\".");
    }
    // §14 — LA fermeture : la preuve doit exister et resoudre.
    if (ctx.registry && ctx.requireResolvableEvidence !== false) {
      // §29/§34 — le registre doit etre celui du run authentifie.
      if (!AAR.isAuthenticatedRegistry(ctx.registry)) {
        throw fail("ARTIFACT_REGISTRY_FORGED", tag + " : registre non rattache a un run authentifie — une preuve ne se resout pas contre une realite declaree.");
      }
      const res = resolveLineage(t.evidenceRefs, ctx.registry, {
        expectedRunId: ctx.expectedRunId, expectedMissionHash: ctx.expectedMissionHash,
        expectedAttestationHash: ctx.expectedAttestationHash,
        crossRunAllowedRelations: ctx.crossRunAllowedRelations,
      });
      if (!res.resolved) {
        throw fail("UNKNOWN_EVIDENCE_UNRESOLVED", tag + " : la preuve invoquee ne resout pas — " + res.problems.join(" ; "));
      }
    } else if (ctx.requireResolvableEvidence === true && !ctx.registry) {
      throw fail("UNKNOWN_EVIDENCE_UNRESOLVED", tag + " : aucun registre fourni, la preuve ne peut pas etre resolue.");
    }
    prevStatus = t.toStatus; prevHash = t.transitionId; prevSeq = t.sequence;
  }
  if (u.status !== prevStatus) {
    throw fail("UNKNOWN_STATUS_FORGED", label + " : champ status=\"" + u.status + "\" incoherent avec la chaine (=\"" + prevStatus + "\").");
  }
  if (typeof u.sequence === "number" && u.sequence !== prevSeq) {
    throw fail("UNKNOWN_CHAIN_INVALID", label + " : sequence declaree " + u.sequence + " incoherente avec la chaine (" + prevSeq + ").");
  }
  return true;
}

/** transition(unknown, newStatus, evidence, ctx) — la preuve est verifiee ICI. */
function transition(unknown, newStatus, evidence, ctx) {
  ctx = ctx || {};
  assertChainValid(unknown, null, ctx);
  if (TERMINAL.indexOf(newStatus) === -1) throw fail("UNKNOWN_TRANSITION_INVALID", "statut " + JSON.stringify(newStatus) + " non autorise.");
  if (!evidence || !isNonEmptyStr(evidence.reason)) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "motif explicite requis.");
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0) throw fail("UNKNOWN_TRANSITION_REQUIRES_EVIDENCE", "au moins une reference de preuve requise.");
  if (ctx.registry) {
    if (!AAR.isAuthenticatedRegistry(ctx.registry)) {
      throw fail("ARTIFACT_REGISTRY_FORGED", "registre non rattache a un run authentifie.");
    }
    const res = resolveLineage(evidence.evidenceRefs, ctx.registry, {
      expectedRunId: ctx.expectedRunId, expectedMissionHash: ctx.expectedMissionHash,
      expectedAttestationHash: ctx.expectedAttestationHash, crossRunAllowedRelations: ctx.crossRunAllowedRelations });
    if (!res.resolved) throw fail("UNKNOWN_EVIDENCE_UNRESOLVED", "la preuve invoquee ne resout pas — " + res.problems.join(" ; "));
  } else if (ctx.requireResolvableEvidence !== false) {
    throw fail("UNKNOWN_EVIDENCE_UNRESOLVED", "aucun registre d'artefacts : une reference de preuve non resolue ne ferme aucun inconnu.");
  }
  const seq = (unknown.transitions.length ? unknown.transitions[unknown.transitions.length - 1].sequence : 0) + 1;
  const prevHash = unknown.transitions.length ? unknown.transitions[unknown.transitions.length - 1].transitionId : unknown.genesisHash;
  const t = { sequence: seq, fromStatus: effectiveStatus(unknown), toStatus: newStatus, reason: evidence.reason,
    evidenceRefs: evidence.evidenceRefs.slice(), decidedAt: isNonEmptyStr(evidence.decidedAt) ? evidence.decidedAt : new Date().toISOString(),
    runId: isNonEmptyStr(ctx.expectedRunId) ? ctx.expectedRunId : (unknown.runId || null), previousEventHash: prevHash };
  t.transitionId = sha256Of(transitionPayload(unknown, t));
  return Object.assign({}, unknown, { status: newStatus, sequence: seq, transitions: unknown.transitions.concat([t]) });
}

/**
 * mergeUnknown(a, b) — §16. Fusion par HISTOIRE VALIDEE :
 * la chaine la plus longue doit contenir l'autre comme prefixe exact. Ce n'est
 * ni « premier arrive », ni « plus favorable » : c'est la suite d'evenements
 * dont l'autre est un etat anterieur. Le blocage le plus severe survit.
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
  const blocking = SEVERITY[a.blockingStatus] >= SEVERITY[b.blockingStatus] ? a.blockingStatus : b.blockingStatus;
  return Object.assign({}, longer, { blockingStatus: blocking });
}

function propagate(upstream, added, ctx) {
  const out = new Map();
  const put = (u) => {
    assertChainValid(u, null, ctx || { requireResolvableEvidence: false });
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
  if (lost.length) throw fail("UNKNOWN_SILENTLY_DROPPED", (label || "propagation") + " : " + lost.length + " unknown(s) OPEN perdu(s) — " + lost.map((u) => u.unknownId).join(", "));
  return true;
}

function openOnes(list) { return (list || []).filter((u) => effectiveStatus(u) === STATUS.OPEN); }
function blockingOpen(list) { return openOnes(list).filter((u) => u.blockingStatus === BLOCKING.BLOCKING); }

module.exports = { makeUnknown, transition, mergeUnknown, propagate, assertNoSilentLoss, assertChainValid,
  effectiveStatus, openOnes, blockingOpen, BLOCKING, STATUS, TERMINAL };
