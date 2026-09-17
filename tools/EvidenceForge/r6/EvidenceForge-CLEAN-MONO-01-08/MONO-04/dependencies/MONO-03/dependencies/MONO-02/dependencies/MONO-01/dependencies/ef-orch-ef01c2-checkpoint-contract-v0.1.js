// EvidenceForge — EF-ORCH — Contrat de validation des sous-checkpoints EF-01C2 — v0.1
//
// N'invente aucune science : chaque invariant ci-dessous est vérifié contre
// le vrai code source d'EF-01C2 avant d'être exigé.
//
// Pour un connecteur AUTOMATIQUE (garanti par executeAll()) :
//   - le log est initialisé AVANT l'appel à runX() avec
//     { connectorId, requestsCount:0, resultsCount:0, costUsd:0, errors:[], startedAt }
//     donc ces champs existent TOUJOURS, quoi que fasse runX() ;
//   - `finishedAt` est posé par executeAll() APRÈS le try/catch entourant
//     l'appel à runX() — garanti même si runX() lève une exception
//     inattendue, jamais seulement en cas de succès ;
//   - `stopReason` est toujours assigné à la toute fin du corps de chaque
//     runX() (openalex/crossref/pubmed), y compris quand toutes les requêtes
//     échouent — seule une exception JS réellement inattendue à l'intérieur
//     de runX() pourrait le laisser absent, ce qui est précisément le genre
//     de défaut qu'on veut détecter ici, pas couvrir silencieusement.
//
// Pour un connecteur MANUEL (wireManualForm()) :
//   - AUCUN executionLog n'est jamais créé pour un import manuel dans le
//     vrai format — `log` est donc légitimement absent (null), jamais exigé.
//   - Chaque source ajoutée passe par makeSource(), exactement comme les
//     sources automatiques : mêmes invariants de forme, `titre` obligatoire
//     (bloqué côté UI par `if(!str(titre)){alert(...);return}`).
//
// Dans les deux cas, chaque source (via makeSource()) porte
// `provenance.connectorId` et `statutScreening:"trouve"` de façon
// inconditionnelle — ce sont les seuls invariants vraiment universels sur
// une source, quel que soit le connecteur qui l'a produite.
"use strict";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function isArr(v) {
  return Array.isArray(v);
}
function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function assertSourcesShapeValid(sourcesTrouvees, connectorId) {
  if (!isArr(sourcesTrouvees)) {
    throw new Error("assertConnectorCheckpointOutputValid: sourcesTrouvees doit être un tableau pour \"" + connectorId + "\".");
  }
  sourcesTrouvees.forEach((s, i) => {
    if (!s || !str(s.titre)) {
      throw new Error("assertConnectorCheckpointOutputValid: sourcesTrouvees[" + i + "].titre manquant pour \"" + connectorId + "\" (obligatoire, y compris à l'import manuel).");
    }
    if (!s.provenance || str(s.provenance.connectorId) !== str(connectorId)) {
      throw new Error(
        "assertConnectorCheckpointOutputValid: sourcesTrouvees[" + i + "].provenance.connectorId (\"" + (s.provenance && s.provenance.connectorId) +
        "\") ne correspond pas au connecteur du checkpoint (\"" + connectorId + "\") — jamais accepté silencieusement."
      );
    }
    if (s.statutScreening !== "trouve") {
      throw new Error("assertConnectorCheckpointOutputValid: sourcesTrouvees[" + i + "].statutScreening doit être \"trouve\" à ce stade (reçu \"" + s.statutScreening + "\") pour \"" + connectorId + "\".");
    }
  });
}

// ---------------------------------------------------------------------------
// assertConnectorCheckpointOutputValid({ connectorId, capability, output })
// Lève une erreur explicite si l'output n'est pas structurellement valide —
// à appeler AVANT tout putSuccessfulOutput, jamais après.
// ---------------------------------------------------------------------------
function assertConnectorCheckpointOutputValid({ connectorId, capability, output }) {
  const cid = str(connectorId);
  if (!cid) {
    throw new Error("assertConnectorCheckpointOutputValid: connectorId manquant.");
  }
  const out = output || {};
  assertSourcesShapeValid(out.sourcesTrouvees, cid);

  if (capability === "automatic") {
    const log = out.log;
    if (!log || typeof log !== "object") {
      throw new Error("assertConnectorCheckpointOutputValid: log manquant pour le connecteur automatique \"" + cid + "\" — toujours présent dans le vrai executeAll().");
    }
    if (str(log.connectorId) !== cid) {
      throw new Error(
        "assertConnectorCheckpointOutputValid: log.connectorId (\"" + log.connectorId + "\") ne correspond pas au connecteur du checkpoint (\"" + cid +
        "\") — jamais accepté (ex. un runner défectueux qui retournerait le log d'un autre connecteur)."
      );
    }
    for (const field of ["requestsCount", "resultsCount", "costUsd"]) {
      if (!isNum(log[field])) {
        throw new Error("assertConnectorCheckpointOutputValid: log." + field + " manquant ou non numérique pour \"" + cid + "\" (toujours initialisé à 0 par executeAll()).");
      }
    }
    if (!isArr(log.errors)) {
      throw new Error("assertConnectorCheckpointOutputValid: log.errors doit être un tableau pour \"" + cid + "\" (toujours initialisé par executeAll()).");
    }
    if (!str(log.startedAt)) {
      throw new Error("assertConnectorCheckpointOutputValid: log.startedAt manquant pour \"" + cid + "\" (toujours posé avant l'appel à runX()).");
    }
    if (!str(log.finishedAt)) {
      throw new Error("assertConnectorCheckpointOutputValid: log.finishedAt manquant pour \"" + cid + "\" (toujours posé par executeAll() après le try/catch, succès ou échec).");
    }
    if (!str(log.stopReason)) {
      throw new Error("assertConnectorCheckpointOutputValid: log.stopReason manquant pour \"" + cid + "\" (toujours assigné en fin de runX() dans le vrai module, y compris en cas d'échec réseau total).");
    }
    return true;
  }

  // manual_required : aucun log n'existe jamais dans le vrai format —
  // absent (null) accepté tel quel ; si un appelant en fournit un quand
  // même, il doit au moins être cohérent, jamais inventé au hasard.
  if (out.log != null && str(out.log.connectorId) !== cid) {
    throw new Error("assertConnectorCheckpointOutputValid: log fourni pour un import manuel référence un autre connecteur (\"" + out.log.connectorId + "\" != \"" + cid + "\").");
  }
  return true;
}

const EFOrchEF01C2CheckpointContract = { assertConnectorCheckpointOutputValid };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01C2CheckpointContract;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01C2CheckpointContract = EFOrchEF01C2CheckpointContract;
}
