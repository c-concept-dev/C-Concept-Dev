// EvidenceForge — EF-ORCH — EF01C1PlannerTrace + contrat SearchProtocol figé — v0.1
//
// Différence structurelle importante avec EF01BResolverTrace : dans le vrai
// EF-01C1, `plannerRuns` n'est PAS un artefact séparé injecté à côté du
// RunContract — il est embarqué À L'INTÉRIEUR du SearchProtocol lui-même
// (`protocol.plannerRuns`), et donc déjà couvert par `protocolHash`. Il n'y
// a donc rien à "relier" au RunContract ici comme on l'a fait pour la trace
// EF-01B : la trace et l'artefact qu'elle documente sont le même objet.
// Cette brique fournit deux choses distinctes :
//   1. assertPlannerRunsValid — validité structurelle de plannerRuns[]
//      (forme historique : runId/date/provider/model/promptVersion/missionId
//      /inputHash/rawResponseHash — PAS les compteurs de B, qui n'existent
//      pas dans le vrai EF-01C1).
//   2. assertSearchProtocolFrozenAndValid — le "contrat d'entrée" qu'un
//      SearchProtocol déjà figé doit satisfaire pour être accepté par
//      l'exécuteur EF-01C1 : équivalent structurel de validateProtocol() du
//      vrai module, plus l'intégrité cryptographique historique.
"use strict";

const { sha256LikeRealSearchProtocol } = require("./ef-orch-ef01-output-contracts-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}
function isArr(v) {
  return Array.isArray(v);
}
function isSha256Hex(v) {
  return typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
}

// ---------------------------------------------------------------------------
// assertPlannerRunsValid(plannerRuns)
// Forme historique exacte, rien de plus : pas de compteurs ou de
// targetContextReport inventés parce qu'ils existent dans EF01BResolverTrace.
// ---------------------------------------------------------------------------
function assertPlannerRunsValid(plannerRuns) {
  if (!isArr(plannerRuns) || plannerRuns.length === 0) {
    throw new Error("assertPlannerRunsValid: plannerRuns manquant ou vide — aucune trace de planification à vérifier.");
  }
  plannerRuns.forEach((run, i) => {
    const requiredNonEmpty = ["runId", "date", "provider", "model", "promptVersion", "missionId"];
    for (const field of requiredNonEmpty) {
      if (!str(run && run[field])) {
        throw new Error("assertPlannerRunsValid: plannerRuns[" + i + "]." + field + " manquant ou vide.");
      }
    }
    if (!isSha256Hex(run && run.inputHash)) {
      throw new Error("assertPlannerRunsValid: plannerRuns[" + i + "].inputHash n'est pas un SHA-256 hexadécimal valide.");
    }
    if (!isSha256Hex(run && run.rawResponseHash)) {
      throw new Error("assertPlannerRunsValid: plannerRuns[" + i + "].rawResponseHash n'est pas un SHA-256 hexadécimal valide.");
    }
  });
  return true;
}

// ---------------------------------------------------------------------------
// assertSearchProtocolFrozenAndValid(searchProtocol)
// Équivalent structurel de validateProtocol() du vrai EF-01C1, appliqué à un
// protocole déjà figé (donc déjà validé humainement en amont) — on revérifie
// que le gel n'a pas été fait sur un protocole incomplet, on ne redemande
// jamais une validation humaine ici.
// ---------------------------------------------------------------------------
async function assertSearchProtocolFrozenAndValid(searchProtocol) {
  const p = searchProtocol;
  if (!p || p.schema !== "EvidenceForge.SearchProtocol" || p.schemaVersion !== "EF-01C1-v1") {
    throw new Error("assertSearchProtocolFrozenAndValid: schéma/version inattendu (attendu EvidenceForge.SearchProtocol/EF-01C1-v1).");
  }
  if (p.statut !== "figé") {
    throw new Error("assertSearchProtocolFrozenAndValid: statut \"" + p.statut + "\" — un SearchProtocol non figé ne peut pas être vérifié par cet exécuteur.");
  }
  if (!isStr(p.protocolHash)) {
    throw new Error("assertSearchProtocolFrozenAndValid: protocolHash manquant.");
  }
  const { protocolHash, ...rest } = p;
  const recomputed = await sha256LikeRealSearchProtocol(rest);
  if (recomputed !== protocolHash) {
    throw new Error(
      "assertSearchProtocolFrozenAndValid: intégrité rompue — protocolHash déclaré (" + protocolHash +
      ") ne correspond pas au hash recalculé selon l'algorithme historique (" + recomputed + ")."
    );
  }

  if (!p.humanValidation || !isStr(p.humanValidation.commentaire)) {
    throw new Error("assertSearchProtocolFrozenAndValid: humanValidation.commentaire manquant — un SearchProtocol figé doit porter la trace d'une validation humaine réelle.");
  }

  const activeConnectors = (isArr(p.sourcesActivees) ? p.sourcesActivees : []).filter((c) => c && c.active !== false);
  if (activeConnectors.length === 0) {
    throw new Error("assertSearchProtocolFrozenAndValid: aucun connecteur actif — le vrai validateProtocol() l'interdit.");
  }
  for (const c of activeConnectors) {
    if (!isStr(c.justification)) {
      throw new Error("assertSearchProtocolFrozenAndValid: justification manquante pour le connecteur \"" + c.connectorId + "\".");
    }
    const hasQuery = (isArr(p.requetesExactes) ? p.requetesExactes : []).some((q) => q && q.connectorId === c.connectorId && isStr(q.requete));
    if (!hasQuery) {
      throw new Error("assertSearchProtocolFrozenAndValid: aucune requête exacte pour le connecteur actif \"" + c.connectorId + "\".");
    }
    const policy = (isArr(p.retrievalPolicies) ? p.retrievalPolicies : []).find((rp) => rp && rp.connectorId === c.connectorId);
    if (!policy) {
      throw new Error("assertSearchProtocolFrozenAndValid: RetrievalPolicy absente pour le connecteur actif \"" + c.connectorId + "\".");
    }
    for (const field of ["sortMode", "stopCondition", "retryPolicy", "rateLimitPolicy", "budgetMax"]) {
      if (!isStr(policy[field])) {
        throw new Error("assertSearchProtocolFrozenAndValid: RetrievalPolicy." + field + " manquant pour \"" + c.connectorId + "\".");
      }
    }
  }
  for (const q of (isArr(p.requetesExactes) ? p.requetesExactes : [])) {
    if (!activeConnectors.some((c) => c.connectorId === q.connectorId)) {
      throw new Error("assertSearchProtocolFrozenAndValid: requête rattachée à un connecteur inactif (\"" + q.connectorId + "\").");
    }
    if (!isStr(q.justification)) {
      throw new Error("assertSearchProtocolFrozenAndValid: justification manquante pour une requête du connecteur \"" + q.connectorId + "\".");
    }
  }
  if (!isArr(p.criteresInclusion) || p.criteresInclusion.length === 0) {
    throw new Error("assertSearchProtocolFrozenAndValid: aucun critère d'inclusion.");
  }
  if (!isArr(p.criteresExclusion) || p.criteresExclusion.length === 0) {
    throw new Error("assertSearchProtocolFrozenAndValid: aucun critère d'exclusion.");
  }
  if (!isStr(p.regleDedoublonnage)) {
    throw new Error("assertSearchProtocolFrozenAndValid: règle de dédoublonnage absente.");
  }
  if (!isStr(p.methodeQualification)) {
    throw new Error("assertSearchProtocolFrozenAndValid: méthode de qualification absente.");
  }
  const debut = p.fenetreTemporelle && p.fenetreTemporelle.debut;
  const fin = p.fenetreTemporelle && p.fenetreTemporelle.fin;
  if (debut && fin && debut > fin) {
    throw new Error("assertSearchProtocolFrozenAndValid: fenêtre temporelle incohérente (debut > fin).");
  }

  assertPlannerRunsValid(p.plannerRuns);

  // Cohérence sémantique, pas seulement cryptographique : une trace de
  // planification qui raconterait l'histoire d'une autre mission serait
  // parfaitement valide cryptographiquement (elle fait partie du contenu
  // hashé), mais n'aurait aucun sens. protocolHash seul ne peut pas détecter
  // ça — il prouve que le contenu n'a pas changé depuis le gel, pas qu'il
  // était cohérent au moment du gel.
  p.plannerRuns.forEach((run, i) => {
    if (str(run.missionId) !== str(p.missionId)) {
      throw new Error(
        "assertSearchProtocolFrozenAndValid: plannerRuns[" + i + "].missionId (" + str(run.missionId) +
        ") ne correspond pas à searchProtocol.missionId (" + str(p.missionId) + ") — trace de planification incohérente avec le protocole qu'elle documente."
      );
    }
  });

  return true;
}

function isStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

const EFOrchEF01C1PlannerTrace = { assertPlannerRunsValid, assertSearchProtocolFrozenAndValid };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01C1PlannerTrace;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01C1PlannerTrace = EFOrchEF01C1PlannerTrace;
}
