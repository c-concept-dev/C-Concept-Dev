// EvidenceForge — EF-ORCH — Contrats de sortie EF-01A→EF-01F — v0.1
// Chaque validateur ci-dessous est extrait de la logique de validation
// d'entrée RÉELLEMENT présente dans le module aval du vrai pipeline (ex. la
// validation d'output d'EF-01B est ce que le vrai EF-01C1 vérifie déjà avant
// d'accepter un fichier). Rien n'est inventé ici — c'est un contrat déjà en
// vigueur, rendu réutilisable et testable isolément.
//
// Distinction importante, non négociable : déterminisme "métier" ≠ octet-pour-
// octet identique entre deux exécutions. EF-01A, EF-01D, EF-01E, EF-01F
// génèrent des identifiants et horodatages locaux (Date.now()/Math.random()
// côté EF-01A, decisionId/completedAt côté EF-01D/E/F). Un validateur ici
// vérifie la CONFORMITÉ STRUCTURELLE et LOGIQUE de la sortie, jamais une
// égalité bit-à-bit avec une exécution précédente — cette dernière notion
// n'a de sens qu'après isolement explicite des métadonnées volatiles par un
// futur exécuteur, ce qui n'est pas fait ici.
"use strict";

const { sha256Bytes } = require("./ef-orch-hash-v0.1.js");

function isArr(v) { return Array.isArray(v); }
function isStr(v) { return typeof v === "string" && v.trim().length > 0; }

// Reproduit EXACTEMENT l'algorithme réel de hachage du SearchProtocol, tel
// que vérifié dans le code source d'EF-01C1 (au gel) et d'EF-01C2 (au
// chargement) : sha256Text(JSON.stringify({ ...p, protocolHash: undefined })).
// C'est un JSON.stringify ordinaire, à l'ORDRE D'INSERTION des clés de
// l'objet — PAS notre fondation canonique à clés triées. Les deux algorithmes
// divergent presque systématiquement (vérifié empiriquement : deux hash
// totalement différents sur un même protocole). Utiliser sha256CanonicalJson
// ici rejetterait à tort tout vrai export EF-01C1/EF-01C2 comme corrompu.
async function sha256LikeRealSearchProtocol(protocolWithoutHash) {
  const text = JSON.stringify(protocolWithoutHash);
  return sha256Bytes(new TextEncoder().encode(text));
}

// Reproduit fidèlement stable()+JSON.stringify du vrai EF-01F : un tri
// RÉCURSIF des clés d'objet (contrairement à protocolHash, insensible à
// l'ordre d'insertion), mais via JSON.stringify natif — donc avec son
// comportement natif sur undefined (omis silencieusement), pas notre
// fondation stricte qui rejette une clé présente à undefined. Troisième
// algorithme de hachage distinct dans ce codebase, à ne jamais confondre
// avec sha256LikeRealSearchProtocol (JSON.stringify à l'ordre d'insertion).
function stableSortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(stableSortKeys);
  if (obj && typeof obj === "object") {
    const o = {};
    Object.keys(obj).sort().forEach((k) => { o[k] = stableSortKeys(obj[k]); });
    return o;
  }
  return obj;
}
async function sha256LikeRealCorpusSnapshot(baseWithoutHash) {
  const text = JSON.stringify(stableSortKeys(baseWithoutHash));
  return sha256Bytes(new TextEncoder().encode(text));
}

// ---------------------------------------------------------------------------
// EF-01A — EvidenceForge.MissionDraft / EF-01A-v2
// Contrat réel vérifié en aval par EF-01B au chargement.
// ---------------------------------------------------------------------------
function validateEF01AOutput(output) {
  if (!output) return false;
  if (output.schema !== "EvidenceForge.MissionDraft" || output.schemaVersion !== "EF-01A-v2") return false;
  if (!isStr(output.question)) return false;
  if (!isArr(output.targetDocuments) || !isArr(output.suppliedEvidence)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// EF-01B — ajoute stage/stageVersion + disciplineResolution.validationComplete
// Contrat réel vérifié en aval par EF-01C1 (normalizeMission).
// ---------------------------------------------------------------------------
function validateEF01BOutput(output) {
  if (!validateEF01AOutput(output)) return false; // reste un MissionDraft valide
  if (output.stage !== "EF-01B" || output.stageVersion !== "EF-01B-v2") return false;
  if (!isArr(output.disciplinesRetenues)) return false;
  const dr = output.disciplineResolution;
  if (!dr || dr.validationComplete !== true) return false;
  // zéro discipline retenue exige un motif documenté — même règle que le vrai EF-01C1
  if (output.disciplinesRetenues.length === 0 && !isStr(dr.zeroRetainedMotif)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// EF-01C1 — ajoute searchProtocol figé et hashé
// Contrat réel vérifié en aval par EF-01C2 (normalizeMission), y compris la
// revérification cryptographique du protocolHash.
// ---------------------------------------------------------------------------
async function validateEF01C1Output(output) {
  if (output && output.stage !== "EF-01C1") return false;
  if (!output || output.stageVersion !== "EF-01C1-v1") return false;
  const p = output.searchProtocol;
  if (!p || p.schema !== "EvidenceForge.SearchProtocol") return false;
  if (p.statut !== "figé") return false;
  if (!isStr(p.protocolHash)) return false;
  if (!isArr(p.retrievalPolicies) || p.retrievalPolicies.length !== (p.sourcesActivees || []).length) return false;
  const { protocolHash, ...rest } = p;
  const recomputed = await sha256LikeRealSearchProtocol(rest);
  return recomputed === protocolHash; // même vérification d'intégrité que le vrai EF-01C2 au chargement
}

// ---------------------------------------------------------------------------
// EF-01C2 — ajoute sourcesTrouvees[] / executionLog[]
// Contrat réel vérifié en aval par EF-01D.
// ---------------------------------------------------------------------------
async function validateEF01C2Output(output) {
  if (!output || output.stage !== "EF-01C2" || output.stageVersion !== "EF-01C2-v1") return false;
  const p = output.searchProtocol;
  if (!p) return false;
  const c1Check = await validateEF01C1Output({ ...output, stage: "EF-01C1", stageVersion: "EF-01C1-v1" });
  if (!c1Check) return false; // le protocole figé doit rester intact tel qu'EF-01C1 l'a produit
  if (!isArr(output.sourcesTrouvees)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// EF-01D — ajoute sourcesScreening[] / auditDecisions[] / screeningSummary
// Contrat réel vérifié en aval par EF-01E : aucune source "trouve"/"examine"
// ne doit rester en attente de décision.
// ---------------------------------------------------------------------------
function validateEF01DOutput(output) {
  if (!output || output.stage !== "EF-01D" || output.stageVersion !== "EF-01D-v1") return false;
  if (!isArr(output.sourcesScreening) || !isArr(output.auditDecisions)) return false;
  const pending = output.sourcesScreening.filter((s) => s && (s.statutScreening === "trouve" || s.statutScreening === "examine"));
  return pending.length === 0;
}

// ---------------------------------------------------------------------------
// EF-01E — ajoute sourcesQualified[] / qualificationSummary
// La version réelle actuelle est explicitement TEST (PIPELINE_TEST_NON_SCIENTIFIC,
// scientificValidity:false). Ce validateur ne laisse JAMAIS passer une sortie
// prétendant scientificValidity:true (ce module ne le fait jamais aujourd'hui ;
// si un jour il le fait, ce contrat TEST n'est pas le bon endroit pour l'accepter).
// options.allowTestMode doit être explicitement vrai pour accepter une sortie
// TEST en aval — jamais par défaut.
// ---------------------------------------------------------------------------
function validateEF01EOutput(output, options) {
  const opts = options || {};
  if (!output || output.stage !== "EF-01E" || output.stageVersion !== "EF-01E-v1") return false;
  if (!isArr(output.sourcesQualified) || !isArr(output.auditDecisions)) return false;
  const qs = output.qualificationSummary;
  if (!qs) return false;
  if (qs.scientificValidity === true) return false; // jamais accepté par ce contrat TEST, quelle que soit l'option
  if (qs.testMode !== true || qs.scientificValidity !== false) return false; // les marqueurs honnêtes doivent être présents et cohérents entre eux
  if (opts.allowTestMode !== true) return false; // sans autorisation explicite de l'appelant, une sortie TEST n'est pas acceptée en aval
  const included = output.sourcesQualified.filter((s) => s && s.statutScreening === "inclus");
  const unqualified = included.filter((s) => !s.qualification);
  const withoutDecision = included.filter((s) => !s.screeningDecisionRef);
  return unqualified.length === 0 && withoutDecision.length === 0;
}

// ---------------------------------------------------------------------------
// EF-01F — ajoute corpusSnapshot{...} / corpusFreezeSummary
// Dernier stage de ce lot ; pas de module aval EF-01 à satisfaire, contrat
// posé pour ce qu'EF-02 consommera (CorpusSnapshot).
// ---------------------------------------------------------------------------
async function validateEF01FOutput(output) {
  if (!output || output.stage !== "EF-01F" || output.stageVersion !== "EF-01F-v1") return false;
  const snap = output.corpusSnapshot;
  if (!snap || snap.schema !== "EvidenceForge.CorpusSnapshot" || snap.schemaVersion !== "EF-01F-v1") return false;
  if (!isStr(snap.hashOuChecksum)) return false;
  if (!isArr(snap.sources) || !isArr(snap.auditDecisions)) return false;
  const summary = output.corpusFreezeSummary;
  if (!summary || summary.frozen !== true) return false;
  // Revérification cryptographique — jamais faite avant cette correction :
  // hashOuChecksum n'était vérifié que pour sa PRÉSENCE, jamais recalculé,
  // contrairement à protocolHash qui a déjà cette rigueur. Le vrai EF-01F ne
  // porte pas hashOuChecksum au moment du calcul (la clé n'existe pas encore
  // dans `base`), donc pas de déstructuration nécessaire ici — seulement son
  // absence du snapshot passé au calcul.
  const { hashOuChecksum, ...rest } = snap;
  const recomputed = await sha256LikeRealCorpusSnapshot(rest);
  if (recomputed !== hashOuChecksum) return false;
  return true;
}

const EFOrchEF01OutputContracts = {
  validateEF01AOutput,
  validateEF01BOutput,
  validateEF01C1Output,
  validateEF01C2Output,
  validateEF01DOutput,
  validateEF01EOutput,
  validateEF01FOutput,
  // Exportée pour que l'exécuteur EF-01C1 (vérification d'un SearchProtocol
  // déjà figé) puisse recalculer le même hash historique sans dupliquer
  // l'algorithme une troisième fois — aucun changement de comportement ici,
  // seulement une visibilité étendue d'une fonction pure déjà correcte.
  sha256LikeRealSearchProtocol,
  sha256LikeRealCorpusSnapshot
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01OutputContracts;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01OutputContracts = EFOrchEF01OutputContracts;
}
