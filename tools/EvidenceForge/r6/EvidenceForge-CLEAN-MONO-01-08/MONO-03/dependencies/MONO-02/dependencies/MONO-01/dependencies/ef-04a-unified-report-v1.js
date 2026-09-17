// EvidenceForge — EF-04A — Unified Report Summary — v1
//
// Organise ce qui existe déjà (EF-03A/B/C/D) en un rapport traçable. Ne crée
// AUCUNE conclusion métier nouvelle : aucun vote, aucune majorité, aucun
// prestige, aucune opinion professionnelle réelle. Une contradiction reste
// "contradiction documentaire non résolue" ; structurallyStable reste
// "stable dans les scénarios de retrait testés", jamais une validation
// scientifique. Ne construit RIEN si assertLineage() échoue — pas de mode
// permissif, pas de "rapport avec warning".
"use strict";

const { assertLineage, buildLineageFingerprint } = require("./ef-04-lineage-guard-v1.js");
const { collectGroups } = require("../dependencies/ef-03c-aggregation-v1.js");

function arr(v) { return Array.isArray(v) ? v : []; }

// ---------------------------------------------------------------------------
// Formulations neutres et déterministes — jamais de personnification de
// l'opinion réelle. "le jumeau documentaire associé à X" ou, mieux, aucune
// personnification du tout : "une analyse documentaire conclut...".
// ---------------------------------------------------------------------------
function stabilityPhrase(structurallyStable) {
  return structurallyStable
    ? "stable dans les scénarios de retrait testés ici"
    : "instable dans au moins un des scénarios de retrait testés ici";
}
const STABILITY_DISCLAIMER = "Ceci ne constitue en aucun cas une robustesse scientifique, une validation, ni une confirmation par des experts.";

function dimensionSummaryText(group) {
  const nConv = group.convergences ? group.convergences.length : 0;
  const nDiv = group.divergences ? group.divergences.length : 0;
  const nND = group.notDeterminableCount || 0;
  const stab = group.structurallyStable === null ? "non évaluée" : stabilityPhrase(group.structurallyStable);
  return "Dimension " + group.dimensionId + " (target " + group.targetId + ") : " + nConv + " convergence(s) documentaire(s), " + nDiv + " divergence(s), " + nND + " zone(s) not_determinable, stabilité structurelle " + stab + ".";
}

// ---------------------------------------------------------------------------
// buildUnifiedReportSummary — construit le rapport UNIQUEMENT après
// assertLineage(...) = PASS. Toute rupture de lignée propage l'erreur telle
// quelle — NO REPORT, jamais un rapport dégradé avec avertissement.
// ---------------------------------------------------------------------------
async function buildUnifiedReportSummary(inputs) {
  const { reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis } = inputs;

  // Aucun mode permissif : si assertLineage lève, l'appel s'arrête ici,
  // aucun rapport n'est retourné.
  const lineage = assertLineage({ reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis });
  const fingerprint = await buildLineageFingerprint({ reviewSchema, targetDocumentSet, twinSet, reviewSet, aggregatedReview, stabilityAnalysis });

  // --- Documents audités : références et métadonnées, jamais une duplication du contenu brut ---
  const documentsAudited = targetDocumentSet.documents.map((d) => ({
    targetId: d.targetId, role: d.role, sourceDocumentRef: d.sourceDocumentRef,
    isEmpty: d.isEmpty, provenance: d.provenance, contentHash: d.contentHash
  }));

  // --- Panel documentaire réellement utilisé : dérivé des twins qui apparaissent RÉELLEMENT dans les revues, jamais du panel nominal ---
  const usedTwinIds = new Set(reviewSet.reviews.map((r) => r.twinId));
  const documentaryPanel = twinSet.twins.filter((t) => usedTwinIds.has(t.twinId)).map((t) => ({
    twinId: t.twinId, professionalRef: t.professionalRef,
    referenceIdentity: t.referenceIdentity,
    documentaryBasisWorkCount: arr(t.documentaryBasis && t.documentaryBasis.worksUsed).length,
    isRealPerson: false, isDocumentaryTwin: true
  }));

  // --- Findings organisés par (target × dimension), jamais un vote ---
  const groupsMap = collectGroups(reviewSet);
  const findingsByTargetAndDimension = [...groupsMap.values()].map((g) => ({
    targetId: g.targetId, dimensionId: g.dimensionId,
    findings: g.findings.map((f) => ({
      findingId: f.findingId, twinId: f.twinId, professionalRef: f.professionalRef,
      disposition: f.disposition, epistemicStatus: f.epistemicStatus,
      finding: f.finding, rationale: f.rationale,
      targetEvidenceRefs: f.targetEvidenceRefs, twinBasisWorkRefs: f.twinBasisWorkRefs,
      limitations: f.limitations
    }))
  }));

  // --- Convergences / divergences / zones not_determinable — reprises telles quelles depuis EF-03C, jamais réinterprétées ---
  const convergences = [];
  const divergences = [];
  const notDeterminableZones = [];
  for (const agg of aggregatedReview.aggregates) {
    for (const c of arr(agg.convergences)) {
      convergences.push({
        convergenceId: c.convergenceId, targetId: agg.targetId, dimensionId: agg.dimensionId,
        findingIds: c.findingIds, independentTwinCount: c.independentTwinCount, contributingTwinRefs: c.contributingTwinRefs,
        epistemicProfile: c.epistemicProfile, targetEvidenceRefs: c.targetEvidenceRefs, twinBasisWorkRefs: c.twinBasisWorkRefs,
        rationale: c.rationale,
        statement: "Convergence documentaire : " + c.independentTwinCount + " analyse(s) documentaire(s) indépendante(s) aboutissent à des constats compatibles."
      });
    }
    for (const dv of arr(agg.divergences)) {
      divergences.push({
        divergenceId: dv.divergenceId, targetId: agg.targetId, dimensionId: agg.dimensionId,
        branches: dv.branches,
        statement: "Divergence documentaire non résolue entre " + dv.branches.length + " branche(s) distincte(s), conservées séparément."
      });
    }
    if (arr(agg.notDeterminable).length || arr(agg.evidenceGaps).length) {
      notDeterminableZones.push({
        targetId: agg.targetId, dimensionId: agg.dimensionId,
        notDeterminableFindingIds: agg.notDeterminable, evidenceGapFindingIds: agg.evidenceGaps
      });
    }
  }

  // --- Stabilité — définition explicite et non ambiguë, jamais "validation scientifique" ---
  const stability = stabilityAnalysis.analyses.map((a) => ({
    targetId: a.targetId, dimensionId: a.dimensionId,
    structurallyStable: a.stability.structurallyStable,
    structurallyStableStatement: (a.stability.structurallyStable ? "Résultat " : "Résultat NON ") + stabilityPhrase(a.stability.structurallyStable) + ". " + STABILITY_DISCLAIMER,
    leaveOneTwinOut: a.stability.leaveOneTwinOut, leaveOneEvidenceOut: a.stability.leaveOneEvidenceOut,
    dependencies: a.dependencies, notDeterminableReasons: a.notDeterminableReasons
  }));

  // --- Contradictions — jamais résolues, jamais "conclusion probable" ---
  const contradictions = stabilityAnalysis.analyses.flatMap((a) => arr(a.contradictions).map((c) => ({ ...c, targetId: a.targetId, dimensionId: a.dimensionId, statement: "Contradiction documentaire non résolue." })));

  // --- Synthèses déterministes par groupe (texte gabarit, jamais un jugement inventé) ---
  const dimensionSummaries = [...groupsMap.keys()].map((key) => {
    const [targetId, dimensionId] = key.split("::");
    const agg = aggregatedReview.aggregates.find((a) => a.targetId === targetId && a.dimensionId === dimensionId);
    const stab = stabilityAnalysis.analyses.find((a) => a.targetId === targetId && a.dimensionId === dimensionId);
    return dimensionSummaryText({
      targetId, dimensionId,
      convergences: agg ? agg.convergences : [],
      divergences: agg ? agg.divergences : [],
      notDeterminableCount: agg ? arr(agg.notDeterminable).length : 0,
      structurallyStable: stab ? stab.stability.structurallyStable : null
    });
  });

  // --- Limitations consolidées ---
  const limitations = [
    "Un DocumentaryTwin n'est jamais le professionnel réel, son opinion réelle, ni une simulation de sa personnalité.",
    "Un finding EF-03B est une analyse du document cible sous les contraintes documentaires du twin — jamais l'opinion réelle du professionnel.",
    "Aucune contradiction n'est résolue ici — 'contradiction documentaire non résolue' reste le seul statut possible.",
    "structurallyStable signifie exclusivement 'stable dans les scénarios de retrait testés' — jamais une validation scientifique, jamais une confirmation par des experts.",
    lineage.lineageAssurance.limitation
  ];

  return {
    schema: "EvidenceForge.UnifiedReportSummary", schemaVersion: "EF-04A-v1",
    mission: { missionId: lineage.missionId, missionQuestion: reviewSchema.missionQuestion, dimensionSetRef: reviewSchema.dimensionSetRef },
    lineage: { reviewSchemaHash: lineage.reviewSchemaHash, missionId: lineage.missionId, lineageFingerprint: fingerprint.lineageFingerprint, lineageAssurance: lineage.lineageAssurance },
    auditScope: { reviewTargets: reviewSchema.reviewTargets, dimensions: reviewSchema.dimensions },
    documentsAudited,
    documentaryPanel,
    findingsByTargetAndDimension,
    convergences, divergences, notDeterminableZones,
    dimensionSummaries,
    stability, contradictions,
    limitations,
    provenance: {
      reviewSchemaHash: lineage.reviewSchemaHash,
      sourceStages: { EF03A: reviewSchema.stageVersion, EF03B: "EF-03B-v1", EF03C: "EF-03C-v1", EF03D: "EF-03D-v1" },
      lineageFingerprint: fingerprint.lineageFingerprint
    },
    testStatus: { testMode: true, scientificValidity: false, humanProfessionalValidation: false }
  };
}

const EF04AUnifiedReport = { buildUnifiedReportSummary };

if (typeof module !== "undefined" && module.exports) module.exports = EF04AUnifiedReport;
if (typeof window !== "undefined") window.EF04AUnifiedReport = EF04AUnifiedReport;
