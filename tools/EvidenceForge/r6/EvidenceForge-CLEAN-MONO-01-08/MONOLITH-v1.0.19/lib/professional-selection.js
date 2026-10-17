"use strict";
/**
 * EvidenceForge MONOLITH — lib/professional-selection.js (v1.0.3)
 * PLAFOND D'EVALUATION : MAX_PROFESSIONAL_CANDIDATES_TO_EVALUATE (config professionals.maxCandidatesToEvaluate, decision produit
 * du proprietaire : 150). Le moteur peut DECOUVRIR autant de candidats qu'il veut ; seuls N entrent dans l'evaluation LLM
 * (corpus OpenAlex + oracle de pertinence MONO-11). Point d'integration : orchestration non gelee, ENTRE l'evaluation MONO-10
 * (locale, sans LLM, sur tout le pool) et MONO-11 (gele, qui n'itere que sur l'assessment qu'on lui donne).
 *
 * SELECTION DETERMINISTE — algorithme PROFESSIONAL-SELECTION-v1 :
 *   - aucune information posterieure a l'appel LLM, aucun nouvel appel, aucun score invente, aucun lexique metier ;
 *   - cle de rang CANONIQUE par candidat, dans cet ordre : statut d'evaluation MONO-10 (PRESENT_FOR_HUMAN_REVIEW d'abord),
 *     pertinence MONO-10 (PLAUSIBLE d'abord), confiance d'identite (STRONG > MODERATE > WEAK), origine (graine d'une source
 *     incluse avant auteur d'oeuvre liee), nombre de preuves de mission (desc), puis candidateRef (ordre lexical : stabilite) ;
 *   - DIVERSITE DISCIPLINAIRE : un seau par dimension de mission (dimensionRef du candidat), chaque seau trie par la cle de
 *     rang ; tirage en TOURNIQUET sur les seaux (ordre lexical des dimensions) jusqu'au plafond => une discipline abondante ne
 *     peut pas eliminer une discipline minoritaire ;
 *   - hash du pool, hash de la selection : la meme entree donne exactement la meme sortie.
 */
const crypto = require("crypto");
const ALGORITHM = "PROFESSIONAL-SELECTION-v1";
const sha = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
const STATUS_RANK = { PRESENT_FOR_HUMAN_REVIEW: 0, INSUFFICIENT_DOCUMENTARY_BASIS: 1, IDENTITY_AMBIGUOUS: 2, OUT_OF_SCOPE_DOCUMENTARILY: 3 };
const RELEVANCE_RANK = { PLAUSIBLE: 0 };
const IDENTITY_RANK = { STRONG: 0, MODERATE: 1, WEAK: 2 };
const ORIGIN_RANK = { SEED_CANDIDATE: 0, DISCOVERED_CANDIDATE: 1 };
const rank = (m, v, dflt) => (Object.prototype.hasOwnProperty.call(m, v) ? m[v] : dflt);

function rankKey(a, c) {
  const rel = typeof a.relevance === "string" ? a.relevance : (a.relevance && (a.relevance.status || a.relevance.level)) || "";
  const origin = a.discoveryOrigin || (c && c.candidateStatus) || "";
  return [rank(STATUS_RANK, a.assessmentStatus, 9), rank(RELEVANCE_RANK, rel, 9), rank(IDENTITY_RANK, a.identityConfidence, 9), rank(ORIGIN_RANK, origin, 9), -((a.missionEvidenceRefs || []).length), a.candidateId];
}
function cmpKey(x, y) { for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; }

/**
 * selectCandidates({ assessment, discovery, cap }) -> record
 * record : { schema, algorithm, cap, poolCount, poolHash, selectedCount, selectedIds, excludedIds, reason, perDimension, selectionHash, capApplied }
 */
function selectCandidates(input) {
  const cap = Number(input.cap); if (!Number.isFinite(cap) || cap < 1) throw Object.assign(new Error("SELECTION_CAP_INVALID"), { code: "SELECTION_CAP_INVALID" });
  const candById = new Map(); ((input.discovery && input.discovery.candidates) || []).forEach((c) => { if (c.candidateRef) candById.set(c.candidateRef, c); });
  /* pool EVALUABLE : seules les evaluations MONO-10 dont le candidat a un identifiant fournisseur peuvent entrer dans l'evaluation LLM
     (MONO-11 ignore les identites non resolues : elles ne consomment aucune place du plafond ; consignees a part) */
  const allAss = ((input.assessment && input.assessment.assessments) || []).filter((a) => a && typeof a.candidateId === "string");
  const pool = allAss.filter((a) => candById.has(a.candidateId)); const unevaluableIds = allAss.filter((a) => !candById.has(a.candidateId)).map((a) => a.candidateId).sort();
  const poolIds = pool.map((a) => a.candidateId).slice().sort();
  const poolHash = sha(JSON.stringify(poolIds));
  const buckets = new Map();
  pool.forEach(function (a) { const c = candById.get(a.candidateId); const dim = (c && (c.dimensionRef || (c.disciplines && c.disciplines[0]))) || "(sans dimension)"; if (!buckets.has(dim)) buckets.set(dim, []); buckets.get(dim).push({ id: a.candidateId, key: rankKey(a, c), dim, dims: (c && c.disciplines) || (c && c.dimensionRef ? [c.dimensionRef] : []) }); });
  const dims = Array.from(buckets.keys()).sort(); dims.forEach((d) => buckets.get(d).sort((x, y) => cmpKey(x.key, y.key)));
  const selected = []; const cursors = {}; dims.forEach((d) => { cursors[d] = 0; });
  let progress = true;
  while (selected.length < cap && progress) { progress = false; for (const d of dims) { if (selected.length >= cap) break; const b = buckets.get(d); if (cursors[d] < b.length) { selected.push(b[cursors[d]]); cursors[d]++; progress = true; } } }
  const selectedIds = selected.map((s) => s.id); const selSet = new Set(selectedIds);
  const excludedIds = pool.map((a) => a.candidateId).filter((id) => !selSet.has(id)).sort();
  const perDimension = {}; dims.forEach((d) => { perDimension[d] = { pool: buckets.get(d).length, selected: buckets.get(d).filter((x) => selSet.has(x.id)).length }; });
  const selectionHash = sha(JSON.stringify(selectedIds.slice().sort()));
  return { schema: "EvidenceForge.ProfessionalEvaluationSelection", schemaVersion: "MONOLITH-v1.0.3", algorithm: ALGORITHM, cap, poolCount: pool.length, poolHash, assessedCount: allAss.length, unevaluableCount: unevaluableIds.length, unevaluableIds, selectedCount: selectedIds.length, selectedIds, excludedIds,
    reason: pool.length > cap ? "PROFESSIONAL_EVALUATION_CAP" : "NO_CAP_APPLIED_POOL_WITHIN_LIMIT", capApplied: pool.length > cap, perDimension, selectionOrder: selectedIds, selectionHash, complete: true };
}

/** Assessment PLAFONNE (meme schema MONO-10, sous-ensemble des evaluations, resume recalcule) — jamais une reevaluation. */
function capAssessment(assessment, selection) {
  const sel = new Set(selection.selectedIds);
  /* v1.0.5 — ORDRE D'EVALUATION = selectionOrder (tourniquet par discipline, meilleur rang d'abord) : la boucle gelee MONO-11 parcourt
     l'assessment dans l'ordre recu ; l'ordre MONO-10 (groupe par discipline) laissait des angles entiers non vus sous contrainte de budget */
  const pos = new Map((selection.selectionOrder || []).map((id, i) => [id, i]));
  const assessments = (assessment.assessments || []).filter((a) => sel.has(a.candidateId)).map((a, i) => ({ a, i })).sort((x, y) => (pos.has(x.a.candidateId) && pos.has(y.a.candidateId) ? pos.get(x.a.candidateId) - pos.get(y.a.candidateId) : x.i - y.i)).map((x) => x.a);
  const summary = { total: assessments.length, presentedForHumanReview: assessments.filter((a) => a.assessmentStatus === "PRESENT_FOR_HUMAN_REVIEW").length, insufficientDocumentaryBasis: assessments.filter((a) => a.assessmentStatus === "INSUFFICIENT_DOCUMENTARY_BASIS").length,
    identityAmbiguous: assessments.filter((a) => a.assessmentStatus === "IDENTITY_AMBIGUOUS").length, outOfScopeDocumentarily: assessments.filter((a) => a.assessmentStatus === "OUT_OF_SCOPE_DOCUMENTARILY").length };
  summary.humanReviewBurden = summary.presentedForHumanReview; summary.openUnknowns = (assessment.unknowns || []).filter((u) => selectedUnknown(u, assessments)).length;
  const out = Object.assign({}, assessment, { assessments, unknowns: (assessment.unknowns || []).filter((u) => selectedUnknown(u, assessments)), summary,
    evaluationCap: { algorithm: selection.algorithm, cap: selection.cap, poolCount: selection.poolCount, poolHash: selection.poolHash, selectedCount: selection.selectedCount, selectionHash: selection.selectionHash, reason: selection.reason, fullAssessmentTotal: (assessment.assessments || []).length, evaluationOrder: selection.selectionOrder ? "SELECTION_ORDER" : "ASSESSMENT_ORDER" } });
  delete out.runBinding;   /* le sous-ensemble est lie a nouveau par le run (artefact derive, provenance explicite vers l'evaluation complete) */
  return out;
}
function selectedUnknown(u, assessments) { const names = assessments.map((a) => a.professionalIdentity && a.professionalIdentity.displayName).filter(Boolean); return !u || typeof u.reason !== "string" || names.some((n) => u.reason.indexOf('"' + n + '"') !== -1); }

/** GARDE DURE : verifie qu'un candidat est dans la selection et que le compte des candidats entres en evaluation ne depasse jamais le plafond. */
function createEvaluationGuard(selection) {
  const sel = new Set(selection.selectedIds); const seen = new Set();
  function violation(msg, details) { const e = new Error("EVALUATION_CAP_INVARIANT_VIOLATION: " + msg); e.code = "EVALUATION_CAP_INVARIANT_VIOLATION"; e.fatal = true; e.details = details || null; e.userMessage = "Invariant violé : le moteur a tenté d'évaluer un professionnel hors de la sélection plafonnée. Arrêt immédiat sans appel réseau."; return e; }
  return {
    enter(candidateRef) { if (!sel.has(candidateRef)) throw violation("candidat hors selection : " + candidateRef, { candidateRef }); seen.add(candidateRef); if (seen.size > selection.cap) throw violation("evaluatedCandidateCount " + seen.size + " > cap " + selection.cap, { evaluated: seen.size, cap: selection.cap }); },
    check(candidateRef) { if (candidateRef && !sel.has(candidateRef)) throw violation("appel oracle pour un candidat hors selection : " + candidateRef, { candidateRef }); },
    evaluatedCount: () => seen.size, evaluatedIds: () => Array.from(seen),
  };
}

module.exports = { selectCandidates, capAssessment, createEvaluationGuard, rankKey, ALGORITHM, STATUS_RANK, IDENTITY_RANK, ORIGIN_RANK, RELEVANCE_RANK };
