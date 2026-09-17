// EvidenceForge — EF-03B — Review Runner — v1
//
// Pour chaque (DocumentaryTwin × ReviewTarget), produit une revue
// documentaire contrainte : une analyse du DOCUMENT CIBLE, produite sous
// les contraintes documentaires du twin — jamais l'opinion réelle du
// professionnel. Deux familles de preuves, JAMAIS fusionnées :
//   targetEvidenceRefs  — tirées du document cible réellement chargé
//   twinBasisWorkRefs   — travaux publics du twin qui justifient sa
//                         perspective documentaire
// Aucun consensus, aucun vote, aucun score de vérité, aucune pondération
// par citation, aucun classement de professionnels — tout cela reste hors
// d'EF-03B, réservé à EF-03C/D.
"use strict";

const { getDocumentForTarget, contentContainsRef } = require("./ef-03-target-document-set-v1.js");

const DISPOSITIONS = ["support", "concern", "gap", "recommendation", "not_determinable"];
const EPISTEMIC_STATUSES = ["documented", "cautious_inference", "not_determinable"];

function str(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function assertReviewSchema(d) {
  if (!d || d.schema !== "EvidenceForge.ReviewSchema" || d.schemaVersion !== "EF-03A-v1") throw new Error("EF-03B: ReviewSchema (EF-03A-v1) invalide ou manquant.");
}
function assertTwinSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryTwinSet" || d.schemaVersion !== "EF-02E-v2" || !Array.isArray(d.twins)) throw new Error("EF-03B: DocumentaryTwinSet (EF-02E-v2) invalide ou manquant.");
}
function assertTargetDocumentSet(d) {
  if (!d || d.schema !== "EvidenceForge.TargetDocumentSet" || d.schemaVersion !== "EF-03-DOC-v1" || !Array.isArray(d.documents)) throw new Error("EF-03B: TargetDocumentSet (EF-03-DOC-v1) invalide ou manquant.");
}

// ---------------------------------------------------------------------------
// buildReviewPrompt — le document cible RÉEL et la base documentaire RÉELLE
// du twin sont tous deux inclus explicitement. Reproduire le défaut déjà
// corrigé en EF-02D3 (juger sans donnée réelle) serait une régression.
// ---------------------------------------------------------------------------
function buildReviewPrompt(twin, targetDoc, reviewSchema) {
  const dimBlock = reviewSchema.dimensions.map((d) => d.id + ": " + d.label + " — " + d.definition).join("\n");
  const template = reviewSchema.dimensions.map((d) =>
    `{"dimensionId":"${d.id}","disposition":"support|concern|gap|recommendation|not_determinable","epistemicStatus":"documented|cautious_inference|not_determinable","finding":"...","rationale":"...","targetEvidenceRefs":["passage exact tiré du document cible"],"twinBasisWorkRefs":["référence exacte tirée de la base documentaire du twin"],"confidenceQualitative":"high|medium|low","limitations":["..."]}`
  ).join(",\n");

  return `Tu es EvidenceForge EF-03B. Produis une analyse documentaire CONTRAINTE du document cible ci-dessous, du point de vue de la base documentaire du professionnel suivant.

MISSION
${reviewSchema.missionQuestion}

DIMENSIONS (une entrée par dimension, dans cet ordre)
${dimBlock}

DOCUMENT CIBLE RÉEL (targetId=${JSON.stringify(targetDoc.targetId)}, rôle=${JSON.stringify(targetDoc.role)})
${targetDoc.content || "(document vide)"}

BASE DOCUMENTAIRE DU PROFESSIONNEL (travaux publics attribuables, jamais son opinion réelle)
${JSON.stringify({ displayName: twin.referenceIdentity.displayName, worksUsed: twin.documentaryBasis.worksUsed, dimensionCoverage: twin.documentaryBasis.dimensionCoverage })}

RÈGLES STRICTES
1. Cette analyse ne représente JAMAIS l'opinion réelle du professionnel — c'est une analyse du document cible produite SOUS LES CONTRAINTES documentaires du twin.
2. "targetEvidenceRefs" doit citer EXACTEMENT des passages présents dans le document cible ci-dessus — jamais reformulés, jamais inventés.
3. "twinBasisWorkRefs" doit citer EXACTEMENT des références présentes dans "worksUsed" ci-dessus — jamais un travail non listé.
4. Ne fusionne JAMAIS ces deux familles de preuves — elles répondent à deux questions différentes (ce que dit le document / pourquoi le twin peut en parler).
5. "epistemicStatus"="documented" exige au moins une référence dans "twinBasisWorkRefs" — sinon utilise "cautious_inference" ou "not_determinable".
6. La simple présence d'un terme dans le document ne constitue jamais un finding : il faut une assertion, une preuve, une justification, des limites et un statut épistémique.
7. Aucun vote, aucun consensus, aucun score de vérité, aucun classement — tu analyses SEUL ce document, pour CE professionnel uniquement.

Retourne UNIQUEMENT ce JSON valide :
{"findings":[
${template}
]}`;
}

// ---------------------------------------------------------------------------
// parseReviewResponse — validation stricte, anti-hallucination à deux volets
// séparés (target vs twin), aucune réparation par similarité.
// ---------------------------------------------------------------------------
function parseReviewResponse(text, twin, targetDoc, reviewSchema) {
  const s = str(text).replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("EF-03B: JSON introuvable.");
  const d = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(d.findings) || d.findings.length !== reviewSchema.dimensions.length) {
    throw new Error("EF-03B: " + reviewSchema.dimensions.length + " findings attendus (un par dimension).");
  }
  const validDimIds = new Set(reviewSchema.dimensions.map((x) => x.id));
  const knownWorkRefs = new Set(arr(twin.documentaryBasis.worksUsed).map((w) => w.workRef));
  const seen = new Set();

  const findings = d.findings.map((f, i) => {
    if (!validDimIds.has(f.dimensionId) || seen.has(f.dimensionId)) throw new Error("EF-03B: dimensionId invalide ou dupliqué (\"" + f.dimensionId + "\").");
    seen.add(f.dimensionId);
    if (!DISPOSITIONS.includes(f.disposition)) throw new Error("EF-03B: disposition invalide (\"" + f.disposition + "\").");
    if (!EPISTEMIC_STATUSES.includes(f.epistemicStatus)) throw new Error("EF-03B: epistemicStatus invalide (\"" + f.epistemicStatus + "\").");
    if (typeof f.finding !== "string" || !f.finding) throw new Error("EF-03B: finding manquant pour \"" + f.dimensionId + "\".");
    if (!Array.isArray(f.targetEvidenceRefs)) throw new Error("EF-03B: targetEvidenceRefs[] absent pour \"" + f.dimensionId + "\".");
    if (!Array.isArray(f.twinBasisWorkRefs)) throw new Error("EF-03B: twinBasisWorkRefs[] absent pour \"" + f.dimensionId + "\".");
    if (!Array.isArray(f.limitations)) f.limitations = [];

    // Anti-hallucination — VOLET A : preuves du document cible.
    for (const ref of f.targetEvidenceRefs) {
      if (!contentContainsRef(targetDoc, ref)) throw new Error("EF-03B: targetEvidenceRef absent du document cible réel (\"" + ref + "\") pour \"" + f.dimensionId + "\" — aucune preuve inventée n'est acceptée.");
    }
    // Anti-hallucination — VOLET B : base documentaire du twin (jamais confondue avec le volet A).
    for (const ref of f.twinBasisWorkRefs) {
      if (!knownWorkRefs.has(ref)) throw new Error("EF-03B: twinBasisWorkRef absent de la base documentaire du twin (\"" + ref + "\") pour \"" + f.dimensionId + "\" — aucune preuve inventée n'est acceptée.");
    }
    // Règle de qualité (héritée d'EF-03A qualityRules) : "documented" exige au moins une preuve de base twin.
    if (f.epistemicStatus === "documented" && f.twinBasisWorkRefs.length === 0) {
      throw new Error("EF-03B: epistemicStatus='documented' sans aucun twinBasisWorkRef pour \"" + f.dimensionId + "\" — preuve target correcte mais provenance twin insuffisante, rejeté (jamais accepté silencieusement).");
    }

    return {
      findingId: "finding-" + twin.twinId + "-" + targetDoc.targetId + "-" + f.dimensionId,
      twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: targetDoc.targetId, dimensionId: f.dimensionId,
      disposition: f.disposition, epistemicStatus: f.epistemicStatus,
      finding: f.finding, rationale: str(f.rationale),
      targetEvidenceRefs: f.targetEvidenceRefs, twinBasisWorkRefs: f.twinBasisWorkRefs,
      confidenceQualitative: ["high", "medium", "low"].includes(f.confidenceQualitative) ? f.confidenceQualitative : "low",
      limitations: f.limitations
    };
  });
  return findings;
}

// ---------------------------------------------------------------------------
// runReviewForTwinTarget — un appel LLM par (twin × target), couvrant toutes
// les dimensions en une fois (comme EF-02D2/D3). Réparation JSON à un essai.
// ---------------------------------------------------------------------------
async function runReviewForTwinTarget(twin, targetDoc, reviewSchema, workerCallFn) {
  if (typeof workerCallFn !== "function") throw new Error("EF-03B: workerCallFn manquant.");
  const prompt = buildReviewPrompt(twin, targetDoc, reviewSchema);
  let text = await workerCallFn(prompt);
  try {
    const findings = parseReviewResponse(text, twin, targetDoc, reviewSchema);
    return { twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: targetDoc.targetId, reviewStatus: "complete", findings, error: null };
  } catch (firstErr) {
    try {
      text = await workerCallFn("Répare uniquement ce JSON pour respecter exactement le schéma et les règles demandées, sans changer le sens. Retourne uniquement le JSON valide.\n\n" + text);
      const findings = parseReviewResponse(text, twin, targetDoc, reviewSchema);
      return { twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: targetDoc.targetId, reviewStatus: "complete", findings, error: null, jsonRepairUsed: true };
    } catch (secondErr) {
      return { twinId: twin.twinId, professionalRef: twin.professionalRef, targetId: targetDoc.targetId, reviewStatus: "error", findings: [], error: secondErr.message };
    }
  }
}

function isValidReview(review) {
  return !!review && review.reviewStatus === "complete" && !review.error && Array.isArray(review.findings) && review.findings.length > 0;
}

function reviewKey(twinId, targetId) { return twinId + "::" + targetId; }

// ---------------------------------------------------------------------------
// buildDocumentaryReviewSet — construction complète, fraîche. Un twin ×
// target par entrée, pour tous les twins actifs (non retirés) et toutes les
// cibles du ReviewSchema qui ont un document résolu dans targetDocumentSet.
// Une cible sans document résolu (mapping manquant/ambigu) est rapportée
// explicitement, jamais silencieusement ignorée.
// ---------------------------------------------------------------------------
async function buildDocumentaryReviewSet({ reviewSchema, twinSet, targetDocumentSet, workerCallFn }) {
  assertReviewSchema(reviewSchema);
  assertTwinSet(twinSet);
  assertTargetDocumentSet(targetDocumentSet);

  const activeTwins = twinSet.twins.filter((t) => !t.retracted);
  const reviews = [];
  const unresolvedTargets = [];
  for (const target of reviewSchema.reviewTargets) {
    const doc = getDocumentForTarget(targetDocumentSet, target.targetId);
    if (!doc) { unresolvedTargets.push(target.targetId); continue; }
    for (const twin of activeTwins) {
      reviews.push(await runReviewForTwinTarget(twin, doc, reviewSchema, workerCallFn));
    }
  }

  return {
    schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1",
    missionId: twinSet.missionId || null,
    reviewSchemaHash: reviewSchema.schemaHash,
    reviews,
    unresolvedTargets,
    summary: {
      twins: activeTwins.length, targets: reviewSchema.reviewTargets.length,
      reviewsComplete: reviews.filter((r) => r.reviewStatus === "complete").length,
      reviewsError: reviews.filter((r) => r.reviewStatus === "error").length,
      unresolvedTargets: unresolvedTargets.length,
      testMode: true, scientificValidity: false, humanProfessionalValidation: false
    },
    testMode: true
  };
}

// ---------------------------------------------------------------------------
// resumeDocumentaryReviewSet — CAPACITÉ GÉNÉRIQUE (même philosophie qu'EF-02D3
// resumeCoverageMatrix) : ne rejoue que les (twin×target) manquants/invalides,
// conserve byte-for-byte les revues déjà valides, fusion additive, aucune
// réécriture silencieuse.
// ---------------------------------------------------------------------------
async function resumeDocumentaryReviewSet(existingReviewSet, { reviewSchema, twinSet, targetDocumentSet, workerCallFn }) {
  assertReviewSchema(reviewSchema);
  assertTwinSet(twinSet);
  assertTargetDocumentSet(targetDocumentSet);

  const existingByKey = new Map(arr(existingReviewSet && existingReviewSet.reviews).map((r) => [reviewKey(r.twinId, r.targetId), r]));
  const activeTwins = twinSet.twins.filter((t) => !t.retracted);
  const unresolvedTargets = [];
  const finalReviews = [];
  let reEvaluated = 0, alreadyValid = 0;

  for (const target of reviewSchema.reviewTargets) {
    const doc = getDocumentForTarget(targetDocumentSet, target.targetId);
    if (!doc) { unresolvedTargets.push(target.targetId); continue; }
    for (const twin of activeTwins) {
      const key = reviewKey(twin.twinId, target.targetId);
      const existing = existingByKey.get(key);
      if (isValidReview(existing)) { finalReviews.push(existing); alreadyValid++; continue; }
      finalReviews.push(await runReviewForTwinTarget(twin, doc, reviewSchema, workerCallFn));
      reEvaluated++;
    }
  }

  return {
    schema: "EvidenceForge.DocumentaryReviewSet", schemaVersion: "EF-03B-v1",
    missionId: twinSet.missionId || null,
    reviewSchemaHash: reviewSchema.schemaHash,
    reviews: finalReviews,
    unresolvedTargets,
    resumeSummary: { alreadyValid, reEvaluated, stillInvalid: finalReviews.filter((r) => r.reviewStatus === "error").length },
    summary: {
      twins: activeTwins.length, targets: reviewSchema.reviewTargets.length,
      reviewsComplete: finalReviews.filter((r) => r.reviewStatus === "complete").length,
      reviewsError: finalReviews.filter((r) => r.reviewStatus === "error").length,
      unresolvedTargets: unresolvedTargets.length,
      testMode: true, scientificValidity: false, humanProfessionalValidation: false
    },
    testMode: true
  };
}

const EF03BReviewRunner = {
  buildReviewPrompt, parseReviewResponse, runReviewForTwinTarget, isValidReview,
  buildDocumentaryReviewSet, resumeDocumentaryReviewSet,
  DISPOSITIONS, EPISTEMIC_STATUSES
};

if (typeof module !== "undefined" && module.exports) module.exports = EF03BReviewRunner;
if (typeof window !== "undefined") window.EF03BReviewRunner = EF03BReviewRunner;
