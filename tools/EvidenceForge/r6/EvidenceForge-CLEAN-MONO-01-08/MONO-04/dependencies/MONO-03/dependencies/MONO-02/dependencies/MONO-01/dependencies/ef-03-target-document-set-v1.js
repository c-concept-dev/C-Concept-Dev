// EvidenceForge — EF-03 — TargetDocumentSet — v1
//
// Contrat manquant identifié explicitement : EF-03B ne peut juger un
// document cible sans disposer de son contenu réel — reproduire le défaut
// déjà corrigé en EF-02D3 (jugement de couverture sans corpus réel) serait
// une régression. Aucun contrat EF-01 existant ne porte cette forme
// sémantique (targetId/rôle/contenu/provenance) — le Document Blob Store
// d'EF-ORCH est un mécanisme de stockage par hash, pas un contrat de
// données ; sa convention de hash (SHA-256) est réutilisée ici, jamais
// réinventée.
"use strict";

const { sha256CanonicalJson } = require("../dependencies/ef-orch-hash-v0.1.js");

function str(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

// ---------------------------------------------------------------------------
// buildTargetDocumentSet(missionId, documents) — chaque document doit
// porter un contenu réel (chaîne non vide) ou être explicitement marqué
// absent/vide (jamais un champ manquant silencieux).
// ---------------------------------------------------------------------------
async function buildTargetDocumentSet(missionId, documents) {
  const cleaned = [];
  for (const [i, d] of arr(documents).entries()) {
    const targetId = str(d.targetId);
    if (!targetId) throw new Error("buildTargetDocumentSet: document #" + i + " sans targetId.");
    const content = d.content == null ? "" : String(d.content);
    const contentHash = await sha256CanonicalJson(content);
    cleaned.push({
      targetId,
      role: str(d.role),
      sourceDocumentRef: str(d.sourceDocumentRef) || null,
      content,
      isEmpty: content.length === 0,
      provenance: str(d.provenance) || null,
      version: str(d.version) || null,
      contentHash
    });
  }
  return {
    schema: "EvidenceForge.TargetDocumentSet",
    schemaVersion: "EF-03-DOC-v1",
    missionId: missionId || null,
    documents: cleaned
  };
}

function assertTargetDocumentSet(d) {
  if (!d || d.schema !== "EvidenceForge.TargetDocumentSet" || d.schemaVersion !== "EF-03-DOC-v1" || !Array.isArray(d.documents)) {
    throw new Error("TargetDocumentSet (EF-03-DOC-v1) invalide ou manquant.");
  }
}

function getDocumentForTarget(targetDocumentSet, targetId) {
  assertTargetDocumentSet(targetDocumentSet);
  return targetDocumentSet.documents.find((d) => d.targetId === targetId) || null;
}

// contentContainsRef(document, ref) — vérification anti-hallucination par
// présence littérale exacte, jamais une correspondance approximative par
// similarité.
function contentContainsRef(document, ref) {
  if (!document || !ref) return false;
  return document.content.includes(ref);
}

const EF03TargetDocumentSet = { buildTargetDocumentSet, assertTargetDocumentSet, getDocumentForTarget, contentContainsRef };

if (typeof module !== "undefined" && module.exports) module.exports = EF03TargetDocumentSet;
if (typeof window !== "undefined") window.EF03TargetDocumentSet = EF03TargetDocumentSet;
