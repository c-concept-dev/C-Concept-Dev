// EvidenceForge — EF-04 — Lineage Guard — v2
//
// v1 vérifiait uniquement la COMPATIBILITÉ D'INSTRUMENT (reviewSchemaHash) —
// insuffisant : deux runs différents peuvent partager la même mission, les
// mêmes dimensions et donc le même schemaHash tout en ayant des documents
// cibles différents, un autre DocumentaryTwinSet, ou un ReviewSet différent.
// v2 vérifie la LIGNÉE EFFECTIVE DES ARTEFACTS, pas seulement la
// compatibilité du schéma.
//
// LIMITE DOCUMENTÉE, JAMAIS CACHÉE : `DocumentaryReviewSet` (EF-03B-v1,
// GELÉ) ne propage NI le hash du document cible (TargetDocumentSet
// contentHash) NI le hash de stabilité du twin (DocumentaryTwin
// stability.contentHash) — seulement des citations littérales
// (targetEvidenceRefs, twinBasisWorkRefs) et des identifiants
// (twinId/targetId/findingId). Une vérification stricte par hash de
// document/twin est donc IMPOSSIBLE sans modifier EF-03. Ce module vérifie
// à la place, de façon honnête et documentée, que chaque citation utilisée
// dans les revues existe RÉELLEMENT dans les objets fournis à EF-04 — une
// preuve réelle mais non absolue (un édit qui préserve les passages cités
// mot pour mot ne serait pas détecté ; documenté explicitement).
"use strict";

const { sha256CanonicalJson } = require("../dependencies/ef-orch-hash-v0.1.js");
const { getDocumentForTarget, contentContainsRef } = require("../dependencies/ef-03-target-document-set-v1.js");
const { collectGroups } = require("../dependencies/ef-03c-aggregation-v1.js");

function arr(v) { return Array.isArray(v) ? v : []; }

function assertReviewSchema(d) {
  if (!d || d.schema !== "EvidenceForge.ReviewSchema" || d.schemaVersion !== "EF-03A-v1" || !d.schemaHash) {
    throw new Error("EF-04: ReviewSchema (EF-03A-v1) invalide ou manquant.");
  }
}
function assertReviewSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryReviewSet" || d.schemaVersion !== "EF-03B-v1") {
    throw new Error("EF-04: DocumentaryReviewSet (EF-03B-v1) invalide ou manquant.");
  }
}
function assertAggregatedReview(d) {
  if (!d || d.schema !== "EvidenceForge.AggregatedDocumentaryReview" || d.schemaVersion !== "EF-03C-v1") {
    throw new Error("EF-04: AggregatedDocumentaryReview (EF-03C-v1) invalide ou manquant.");
  }
}
function assertStabilityAnalysis(d) {
  if (!d || d.schema !== "EvidenceForge.StabilityContradictionAnalysis" || d.schemaVersion !== "EF-03D-v1") {
    throw new Error("EF-04: StabilityContradictionAnalysis (EF-03D-v1) invalide ou manquant.");
  }
}
function assertTargetDocumentSet(d) {
  if (!d || d.schema !== "EvidenceForge.TargetDocumentSet" || d.schemaVersion !== "EF-03-DOC-v1" || !Array.isArray(d.documents)) {
    throw new Error("EF-04: TargetDocumentSet (EF-03-DOC-v1) invalide ou manquant.");
  }
}
function assertTwinSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryTwinSet" || d.schemaVersion !== "EF-02E-v2" || !Array.isArray(d.twins)) {
    throw new Error("EF-04: DocumentaryTwinSet (EF-02E-v2) invalide ou manquant.");
  }
}

// ---------------------------------------------------------------------------
// 1. Compatibilité d'instrument — reviewSchemaHash ET missionId, séparément.
// schemaHash exclut délibérément missionId (invariant EF-03A) : EF-04 doit
// donc vérifier missionId lui-même, sans quoi deux missions différentes
// utilisant le même instrument d'audit passeraient à tort.
// ---------------------------------------------------------------------------
function assertInstrumentCompatibility(reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis) {
  const expectedHash = reviewSchema.schemaHash;
  for (const [label, obj] of [["DocumentaryReviewSet", reviewSet], ["AggregatedDocumentaryReview", aggregatedReview], ["StabilityContradictionAnalysis", stabilityAnalysis]]) {
    if (obj.reviewSchemaHash !== expectedHash) {
      throw new Error("EF-04: rupture de lignée — " + label + " porte reviewSchemaHash=\"" + obj.reviewSchemaHash + "\", attendu \"" + expectedHash + "\".");
    }
  }
  // missionId vérifié sur TOUS les objets qui en portent un — TargetDocumentSet
  // et DocumentaryTwinSet inclus. Un twin ou un jeu de documents dont le
  // CONTENU se trouve identique par coïncidence à un autre run ne serait pas
  // détecté par la seule revalidation de citations — le missionId de chaque
  // objet est donc vérifié séparément et explicitement, jamais déduit.
  const missionIds = [targetDocumentSet.missionId, twinSet.missionId, reviewSet.missionId, aggregatedReview.missionId, stabilityAnalysis.missionId].filter((x) => x != null);
  const distinct = new Set(missionIds);
  if (distinct.size > 1) {
    throw new Error("EF-04: rupture de lignée — missionId incohérent entre les objets fournis (" + [...distinct].join(", ") + ") — même reviewSchemaHash n'implique pas même mission.");
  }
  return { reviewSchemaHash: expectedHash, missionId: [...distinct][0] || null };
}

// ---------------------------------------------------------------------------
// 2. Cross-référence findingId — AggregatedDocumentaryReview et
// StabilityContradictionAnalysis ne doivent citer AUCUN findingId absent du
// DocumentaryReviewSet réellement fourni. Détecte "ReviewSet d'un run +
// Aggregation d'un autre run" sans dépendre d'un comptage.
// ---------------------------------------------------------------------------
function collectKnownFindingIds(reviewSet) {
  const s = new Set();
  for (const review of reviewSet.reviews) for (const f of arr(review.findings)) s.add(f.findingId);
  return s;
}
function collectAggregateReferencedFindingIds(aggregatedReview) {
  const s = new Set();
  for (const agg of aggregatedReview.aggregates) {
    for (const id of arr(agg.allFindingIds)) s.add(id);
    for (const c of arr(agg.convergences)) for (const id of arr(c.findingIds)) s.add(id);
    for (const dv of arr(agg.divergences)) for (const b of arr(dv.branches)) for (const id of arr(b.findingIds)) s.add(id);
  }
  return s;
}
function assertAggregationTracesToReviewSet(reviewSet, aggregatedReview) {
  const known = collectKnownFindingIds(reviewSet);
  for (const id of collectAggregateReferencedFindingIds(aggregatedReview)) {
    if (!known.has(id)) throw new Error("EF-04: rupture de lignée — AggregatedDocumentaryReview référence un findingId (\"" + id + "\") absent du DocumentaryReviewSet fourni. Ces deux objets ne proviennent pas du même run.");
  }
  // Vérifie aussi que chaque groupe (target×dimension) recalculé depuis le
  // reviewSet correspond réellement à un groupe présent dans l'agrégation —
  // pas seulement l'inverse.
  const realGroups = new Set([...collectGroups(reviewSet).keys()]);
  for (const agg of aggregatedReview.aggregates) {
    const key = agg.targetId + "::" + agg.dimensionId;
    if (!realGroups.has(key)) throw new Error("EF-04: rupture de lignée — AggregatedDocumentaryReview contient un groupe (" + key + ") introuvable dans le DocumentaryReviewSet fourni.");
  }
}
function assertStabilityTracesToSources(reviewSet, aggregatedReview, stabilityAnalysis) {
  const knownFindingIds = collectKnownFindingIds(reviewSet);
  const knownTwinIds = new Set(reviewSet.reviews.map((r) => r.twinId));
  const realGroups = new Set([...collectGroups(reviewSet).keys()]);
  for (const a of stabilityAnalysis.analyses) {
    const key = a.targetId + "::" + a.dimensionId;
    if (!realGroups.has(key)) throw new Error("EF-04: rupture de lignée — StabilityContradictionAnalysis contient un groupe (" + key + ") introuvable dans le DocumentaryReviewSet fourni.");
    for (const out of arr(a.stability && a.stability.leaveOneTwinOut)) {
      if (!knownTwinIds.has(out.twinRemoved)) throw new Error("EF-04: rupture de lignée — StabilityContradictionAnalysis référence un twin (\"" + out.twinRemoved + "\") absent du DocumentaryReviewSet fourni.");
    }
    for (const c of arr(a.contradictions)) {
      for (const fid of [c.findingIdA, c.findingIdB].filter(Boolean)) {
        if (!knownFindingIds.has(fid)) throw new Error("EF-04: rupture de lignée — une contradiction référence un findingId (\"" + fid + "\") absent du DocumentaryReviewSet fourni.");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Documents cibles — revalidation des citations, PAS un hash direct
// (indisponible dans le contrat gelé EF-03B). Si un targetEvidenceRef cité
// dans une revue n'existe plus littéralement dans le TargetDocumentSet
// fourni, c'est la preuve qu'un document différent (ou une version
// différente) a été substitué.
// ---------------------------------------------------------------------------
function assertTargetDocumentLineage(reviewSet, targetDocumentSet) {
  for (const review of reviewSet.reviews) {
    const doc = getDocumentForTarget(targetDocumentSet, review.targetId);
    for (const f of arr(review.findings)) {
      for (const ref of arr(f.targetEvidenceRefs)) {
        if (!doc || !contentContainsRef(doc, ref)) {
          throw new Error(
            "EF-04: rupture de lignée documentaire — le finding \"" + f.findingId + "\" cite un passage (\"" + ref + "\") absent du document cible (targetId=\"" + review.targetId + "\") fourni à EF-04. " +
            "Le document a changé depuis la production de cette revue, ou un document différent a été substitué."
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. DocumentaryTwinSet — même principe : revalidation des twinBasisWorkRefs
// contre worksUsed du twin RÉELLEMENT fourni, jamais un matching par nom.
// ---------------------------------------------------------------------------
function assertTwinSetLineage(reviewSet, twinSet) {
  const twinsById = new Map(twinSet.twins.map((t) => [t.twinId, t]));
  for (const review of reviewSet.reviews) {
    const twin = twinsById.get(review.twinId);
    if (!twin) throw new Error("EF-04: rupture de lignée — le twin \"" + review.twinId + "\" cité dans le DocumentaryReviewSet est absent du DocumentaryTwinSet fourni à EF-04.");
    const knownRefs = new Set(arr(twin.documentaryBasis && twin.documentaryBasis.worksUsed).map((w) => w.workRef));
    for (const f of arr(review.findings)) {
      for (const ref of arr(f.twinBasisWorkRefs)) {
        if (!knownRefs.has(ref)) {
          throw new Error(
            "EF-04: rupture de lignée — le finding \"" + f.findingId + "\" cite une base documentaire (\"" + ref + "\") absente de documentaryBasis.worksUsed du twin \"" + review.twinId + "\" fourni à EF-04. " +
            "Un DocumentaryTwinSet différent a été substitué."
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// lineageAssurance — la FORCE RÉELLE de la garantie, machine-readable,
// jamais seulement documentée en prose. EF-03B (gelé) ne propage NI le hash
// du document cible NI le hash de stabilité du twin — la revalidation par
// citation littérale est une preuve réelle mais non absolue : une
// modification qui préserverait toutes les références citées échapperait
// à la détection. Ce n'est jamais présenté comme un hash-binding source.
// ---------------------------------------------------------------------------
function buildLineageAssurance() {
  return {
    schemaBound: true,
    missionBound: true,
    reviewChainBound: true,
    targetDocumentsReferenceRevalidated: true,
    documentaryTwinsReferenceRevalidated: true,
    targetDocumentsHashBoundFromEF03: false,
    documentaryTwinsHashBoundFromEF03: false,
    assuranceLevel: "reference_revalidated_not_source_hash_bound",
    limitation: "Les objets documentaires et les twins fournis à EF-04 sont revalidés contre les références citées dans les reviews. EF-03B ne propageant pas leurs hashes source, EF-04 ne peut pas démontrer qu'ils sont byte-for-byte identiques aux objets fournis lors de l'exécution originale d'EF-03B. Une modification qui préserverait toutes les références citées peut ne pas être détectée. Limitation connue, pas un échec — une amélioration future du protocole de lignée pourrait la lever, hors périmètre de ce lot."
  };
}

// ---------------------------------------------------------------------------
// assertLineage — orchestration complète. AUCUN MODE PERMISSIF : la première
// violation trouvée interrompt immédiatement (throw), jamais un warning.
// ---------------------------------------------------------------------------
function assertLineage({ reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis }) {
  assertReviewSchema(reviewSchema);
  assertTargetDocumentSet(targetDocumentSet);
  assertTwinSet(twinSet);
  assertReviewSet(reviewSet);
  assertAggregatedReview(aggregatedReview);
  assertStabilityAnalysis(stabilityAnalysis);

  const { reviewSchemaHash, missionId } = assertInstrumentCompatibility(reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis);
  assertTargetDocumentLineage(reviewSet, targetDocumentSet);
  assertTwinSetLineage(reviewSet, twinSet);
  assertAggregationTracesToReviewSet(reviewSet, aggregatedReview);
  assertStabilityTracesToSources(reviewSet, aggregatedReview, stabilityAnalysis);

  return { ok: true, reviewSchemaHash, missionId, lineageAssurance: buildLineageAssurance() };
}

// ---------------------------------------------------------------------------
// buildLineageFingerprint — calculé PAR EF-04 à partir des artefacts déjà
// vérifiés par assertLineage (jamais un substitut à ces contrôles). Le
// hash canonique (sha256CanonicalJson) rend l'ordre des clés JSON sans
// incidence sur le résultat.
// ---------------------------------------------------------------------------
async function buildLineageFingerprint({ reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis }) {
  const targetDocumentHashes = targetDocumentSet.documents.map((d) => ({ targetId: d.targetId, contentHash: d.contentHash })).sort((a, b) => a.targetId.localeCompare(b.targetId));
  const twinHashes = twinSet.twins.map((t) => ({ twinId: t.twinId, contentHash: (t.stability && t.stability.contentHash) || null })).sort((a, b) => a.twinId.localeCompare(b.twinId));
  const reviewSetHash = await sha256CanonicalJson(reviewSet.reviews);
  const aggregationHash = await sha256CanonicalJson(aggregatedReview.aggregates);
  const stabilityHash = await sha256CanonicalJson(stabilityAnalysis.analyses);

  const snapshot = {
    missionId: reviewSet.missionId || null,
    reviewSchemaHash: reviewSchema.schemaHash,
    targetDocumentHashes, twinHashes,
    reviewSetHash, aggregationHash, stabilityHash
  };
  const lineageFingerprint = await sha256CanonicalJson(snapshot);
  return { ...snapshot, lineageFingerprint };
}

const EF04LineageGuard = {
  assertLineage, buildLineageFingerprint, buildLineageAssurance,
  assertReviewSchema, assertReviewSet, assertAggregatedReview, assertStabilityAnalysis, assertTargetDocumentSet, assertTwinSet,
  assertInstrumentCompatibility, assertTargetDocumentLineage, assertTwinSetLineage, assertAggregationTracesToReviewSet, assertStabilityTracesToSources,
  collectKnownFindingIds
};

if (typeof module !== "undefined" && module.exports) module.exports = EF04LineageGuard;
if (typeof window !== "undefined") window.EF04LineageGuard = EF04LineageGuard;
