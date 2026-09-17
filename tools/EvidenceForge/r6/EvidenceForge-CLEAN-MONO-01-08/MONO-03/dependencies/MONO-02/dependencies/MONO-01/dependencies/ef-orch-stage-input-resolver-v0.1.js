// EvidenceForge — EF-ORCH-03B — StageInputResolver — v0.1
// Rôle strict : reconstruire l'input exact d'un stage à partir des
// checkpoints déjà figés dans RunOutputStore, selon une définition de
// dépendances déclarative (le "pipeline"). Ne connaît aucune science métier
// EF-01 — c'est la définition de pipeline, fournie par l'appelant, qui porte
// la connaissance "EF-01D dépend de EF-01C2", jamais un `if (stageId===...)`
// codé en dur ici.
//
// N'exécute jamais aucun stage, ne rejoue jamais un stage amont : un
// checkpoint amont absent ou corrompu est une erreur explicite, jamais une
// invitation à recalculer.
//
// Chaque dépendance porte SON PROPRE protocolHash (ou son absence explicite),
// jamais un protocolHash unique appliqué globalement à toutes les
// dépendances d'un stage : deux dépendances d'un même stage peuvent avoir
// été figées sous des protocoles différents, ou l'une n'avoir aucun
// protocole applicable pendant que l'autre en a un.
"use strict";

function str(v) {
  return String(v == null ? "" : v).trim();
}

// inputFrom accepte deux formes équivalentes pour chaque dépendance :
//   "EF-01C2"                              -> protocolHash: null
//   { stageId: "EF-01C2", protocolHash }   -> protocolHash explicite
function normalizeDependency(dep) {
  if (typeof dep === "string") {
    const stageId = str(dep);
    if (!stageId) throw new Error("resolveStageInput: entrée de dépendance vide dans inputFrom.");
    return { stageId, protocolHash: null };
  }
  if (dep && typeof dep === "object") {
    const stageId = str(dep.stageId);
    if (!stageId) throw new Error("resolveStageInput: dépendance sans stageId dans inputFrom.");
    return { stageId, protocolHash: dep.protocolHash != null ? str(dep.protocolHash) : null };
  }
  throw new Error("resolveStageInput: entrée de dépendance invalide dans inputFrom (" + JSON.stringify(dep) + ").");
}

// ---------------------------------------------------------------------------
// resolveStageInput({ pipeline, stageId, store, runId, runContractHash, initialInput })
// pipeline : [{ stageId, inputFrom: [ "X" | {stageId:"X", protocolHash}, ... ] }, ...]
// -> l'input exact à passer à executeStage pour ce stage.
//
// Pas de paramètre protocolHash global ici : chaque dépendance déclare le
// sien (ou son absence) dans inputFrom, résolu indépendamment des autres.
// ---------------------------------------------------------------------------
async function resolveStageInput({ pipeline, stageId, store, runId, runContractHash, initialInput }) {
  if (!Array.isArray(pipeline)) throw new Error("resolveStageInput: pipeline manquant ou invalide.");
  const entry = pipeline.find((p) => p && p.stageId === stageId);
  if (!entry) throw new Error("resolveStageInput: stage \"" + str(stageId) + "\" absent de la définition du pipeline.");

  const rawDeps = Array.isArray(entry.inputFrom) ? entry.inputFrom : [];
  const deps = rawDeps.map(normalizeDependency);

  if (deps.length === 0) {
    // Premier stage de la chaîne (ou stage sans dépendance déclarée) : son
    // input est l'input initial du run, jamais un checkpoint.
    return initialInput !== undefined ? initialInput : {};
  }

  const resolved = {};
  for (const dep of deps) {
    const identity = { runId, runContractHash, stageId: dep.stageId, protocolHash: dep.protocolHash };

    const exists = await store.hasSuccessfulOutput(identity);
    if (!exists) {
      throw new Error(
        "resolveStageInput: checkpoint amont absent pour \"" + dep.stageId + "\"" +
        (dep.protocolHash ? " sous protocolHash=" + dep.protocolHash : " (sans protocole)") +
        " (requis par \"" + str(stageId) + "\") — impossible de reconstruire l'input ; aucun stage amont n'est rejoué automatiquement."
      );
    }
    const verify = await store.verifySuccessfulOutput(identity);
    if (!verify.valid) {
      throw new Error(
        "resolveStageInput: checkpoint amont corrompu pour \"" + dep.stageId + "\" (requis par \"" + str(stageId) + "\", " +
        "storedHash=" + verify.storedHash + ", computedHash=" + verify.computedHash + ") — reconstruction refusée, décision explicite requise."
      );
    }
    const got = await store.getSuccessfulOutput(identity);
    resolved[dep.stageId] = got.output;
  }

  // Une dépendance unique (cas du pipeline EF-01 linéaire) redonne
  // directement la sortie amont telle quelle, sans l'envelopper — c'est ce
  // que le vrai pipeline fait déjà (chaque module reçoit l'export complet du
  // précédent). Plusieurs dépendances sont regroupées par stageId d'origine.
  return deps.length === 1 ? resolved[deps[0].stageId] : resolved;
}

const EFOrchStageInputResolver = { resolveStageInput };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchStageInputResolver;
}
if (typeof window !== "undefined") {
  window.EFOrchStageInputResolver = EFOrchStageInputResolver;
}
