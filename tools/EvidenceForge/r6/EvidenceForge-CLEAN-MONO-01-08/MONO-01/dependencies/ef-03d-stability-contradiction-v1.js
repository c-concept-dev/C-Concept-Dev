// EvidenceForge — EF-03D — Stability / Contradiction Analysis — v1
//
// Couche de ROBUSTESSE DOCUMENTAIRE, jamais une nouvelle couche métier.
// N'invente jamais un finding, ne choisit jamais une branche de divergence,
// ne déclare jamais une opinion correcte, ne fabrique jamais de consensus,
// ne produit jamais de score scientifique. Analyse uniquement la
// dépendance, la stabilité et les contradictions des objets déjà produits
// par EF-03B/C.
//
// ENTIÈREMENT DÉTERMINISTE : le leave-one-out RECALCULE réellement l'état
// structurel à partir des reviews restantes (réutilise collectGroups/
// buildBaseAggregate/independentTwinRefs d'EF-03C), jamais une simple
// décrémentation de compteur.
"use strict";

const { collectGroups, buildBaseAggregate, independentTwinRefs } = require("./ef-03c-aggregation-v1.js");

function arr(v) { return Array.isArray(v) ? v : []; }

function assertReviewSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryReviewSet" || d.schemaVersion !== "EF-03B-v1" || !Array.isArray(d.reviews)) {
    throw new Error("EF-03D: DocumentaryReviewSet (EF-03B-v1) invalide ou manquant.");
  }
}
function assertAggregatedReview(d) {
  if (!d || d.schema !== "EvidenceForge.AggregatedDocumentaryReview" || d.schemaVersion !== "EF-03C-v1" || !Array.isArray(d.aggregates)) {
    throw new Error("EF-03D: AggregatedDocumentaryReview (EF-03C-v1) invalide ou manquant.");
  }
}

function groupKeyOf(a) { return a.targetId + "::" + a.dimensionId; }
function removeTwinFromReviewSet(reviewSet, twinId) { return { ...reviewSet, reviews: reviewSet.reviews.filter((r) => r.twinId !== twinId) }; }

// ---------------------------------------------------------------------------
// leaveOneTwinOut(reviewSet, aggregatedReview) — pour CHAQUE twin présent
// dans reviewSet et CHAQUE groupe agrégé, retire réellement les reviews de
// ce twin, RECALCULE le groupe via collectGroups/buildBaseAggregate
// (fonctions réelles d'EF-03C, jamais une simulation algébrique), puis
// compare l'état structurel avant/après.
// ---------------------------------------------------------------------------
function leaveOneTwinOut(reviewSet, aggregatedReview) {
  assertReviewSet(reviewSet);
  assertAggregatedReview(aggregatedReview);
  const allTwins = [...new Set(reviewSet.reviews.map((r) => r.twinId))];
  const results = [];

  for (const twinId of allTwins) {
    const filteredSet = removeTwinFromReviewSet(reviewSet, twinId);
    const remainingGroups = collectGroups(filteredSet); // RECALCUL RÉEL, pas une simulation.

    for (const agg of aggregatedReview.aggregates) {
      const key = groupKeyOf(agg);
      const remainingGroup = remainingGroups.get(key);
      const remainingBase = remainingGroup ? buildBaseAggregate(remainingGroup) : null;
      const remainingFindingIds = new Set(remainingBase ? remainingBase.allFindingIds : []);

      const convergenceOutcomes = arr(agg.convergences).map((conv) => {
        const survivingIds = conv.findingIds.filter((id) => remainingFindingIds.has(id));
        const stillMultiTwin = new Set(conv.contributingTwinRefs.filter((t) => t !== twinId)).size >= 2 && survivingIds.length > 0;
        return { convergenceId: conv.convergenceId, disappearedEntirely: survivingIds.length === 0, downgradedBelowMultiTwin: survivingIds.length > 0 && !stillMultiTwin };
      });
      const divergenceOutcomes = arr(agg.divergences).map((dv) => {
        const survivingBranches = dv.branches.filter((b) => b.findingIds.some((id) => remainingFindingIds.has(id)));
        return { divergenceId: dv.divergenceId, disappearedEntirely: survivingBranches.length === 0, collapsedToSingleBranch: survivingBranches.length === 1 && dv.branches.length > 1 };
      });

      const becameEmptyOrNotDeterminable = !remainingBase || remainingBase.allFindingIds.length === 0;
      const dependencyRevealed = agg.contributingTwinRefs.includes(twinId) && (becameEmptyOrNotDeterminable || convergenceOutcomes.some((c) => c.disappearedEntirely || c.downgradedBelowMultiTwin) || divergenceOutcomes.some((d) => d.disappearedEntirely || d.collapsedToSingleBranch));

      results.push({
        twinRemoved: twinId, targetId: agg.targetId, dimensionId: agg.dimensionId,
        beforeIndependentTwinCount: agg.independentTwinCount,
        afterIndependentTwinCount: remainingBase ? remainingBase.independentTwinCount : 0,
        convergenceOutcomes, divergenceOutcomes,
        resultBecameEmpty: becameEmptyOrNotDeterminable,
        dependencyRevealed
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// leaveOneEvidenceOut(aggregatedReview) — pour chaque groupe, pour chaque
// famille de preuve SÉPARÉMENT (targetEvidenceRefs / twinBasisWorkRefs, sans
// jamais les fusionner), identifie les références dont le retrait priverait
// un finding de TOUTE preuve de cette famille — un finding peut être
// robuste vis-à-vis d'une famille et fragile vis-à-vis de l'autre.
// ---------------------------------------------------------------------------
function leaveOneEvidenceOut(aggregatedReview, findingsByGroupKey) {
  assertAggregatedReview(aggregatedReview);
  const results = [];
  for (const agg of aggregatedReview.aggregates) {
    const findings = findingsByGroupKey.get(groupKeyOf(agg)) || [];
    for (const family of ["targetEvidenceRefs", "twinBasisWorkRefs"]) {
      const allRefs = [...new Set(findings.flatMap((f) => f[family]))];
      for (const ref of allRefs) {
        const dependentFindings = findings.filter((f) => f[family].length === 1 && f[family][0] === ref);
        if (dependentFindings.length) {
          results.push({
            targetId: agg.targetId, dimensionId: agg.dimensionId, evidenceFamily: family, evidenceRef: ref,
            solelyDependentFindingIds: dependentFindings.map((f) => f.findingId),
            wouldBecomeUnsupported: true
          });
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// evidenceDependency(findingsByGroupKey) — dénombrement PUR, descriptif,
// jamais un score de vérité. Un résultat reposant sur une seule preuve
// n'est pas faux — il est documenté comme structurellement fragile.
// ---------------------------------------------------------------------------
function evidenceDependencyReport(findings) {
  return findings.map((f) => ({
    findingId: f.findingId,
    targetEvidenceRefCount: f.targetEvidenceRefs.length,
    twinBasisWorkRefCount: f.twinBasisWorkRefs.length,
    singleTargetEvidenceDependency: f.targetEvidenceRefs.length === 1,
    singleTwinBasisDependency: f.twinBasisWorkRefs.length === 1,
    noRedundancy: f.targetEvidenceRefs.length <= 1 && f.twinBasisWorkRefs.length <= 1
  }));
}

// ---------------------------------------------------------------------------
// Contradictions — DÉTECTION STRUCTURELLE PURE, jamais une résolution.
// Table d'opposition minimale et explicite : support vs concern. Toute
// autre paire de dispositions n'est pas considérée automatiquement opposée
// (gap/recommendation/not_determinable ne contredisent rien par défaut).
// ---------------------------------------------------------------------------
const OPPOSING_DISPOSITIONS = [["support", "concern"]];
function areOpposing(a, b) { return OPPOSING_DISPOSITIONS.some(([x, y]) => (a === x && b === y) || (a === y && b === x)); }

function interReviewContradictions(findingsByGroupKey) {
  const results = [];
  for (const [key, findings] of findingsByGroupKey.entries()) {
    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        const a = findings[i], b = findings[j];
        if (a.twinId === b.twinId) continue; // intra-review traité séparément
        if (areOpposing(a.disposition, b.disposition)) {
          results.push({
            targetId: a.targetId, dimensionId: a.dimensionId,
            reviewRefA: a.reviewRef, reviewRefB: b.reviewRef,
            twinRefA: a.twinId, twinRefB: b.twinId,
            findingIdA: a.findingId, findingIdB: b.findingId,
            targetEvidenceRefsA: a.targetEvidenceRefs, targetEvidenceRefsB: b.targetEvidenceRefs,
            twinBasisWorkRefsA: a.twinBasisWorkRefs, twinBasisWorkRefsB: b.twinBasisWorkRefs,
            epistemicStatusA: a.epistemicStatus, epistemicStatusB: b.epistemicStatus,
            limitationsA: a.limitations, limitationsB: b.limitations,
            resolution: "contradiction documentaire non résolue"
          });
        }
      }
    }
  }
  return results;
}

// Contradiction interne : même twin + même target + même dimension, deux
// findings incompatibles (n'arrive normalement que si des revues en double
// existent pour la même paire twin×target — anomalie structurelle réelle,
// jamais masquée).
function intraReviewContradictions(reviewSet) {
  assertReviewSet(reviewSet);
  const byTwinTargetDim = new Map();
  for (const review of reviewSet.reviews) {
    if (review.reviewStatus !== "complete") continue;
    for (const f of arr(review.findings)) {
      const key = review.twinId + "::" + f.targetId + "::" + f.dimensionId;
      if (!byTwinTargetDim.has(key)) byTwinTargetDim.set(key, []);
      byTwinTargetDim.get(key).push({ ...f, reviewRef: review.twinId + "::" + review.targetId });
    }
  }
  const results = [];
  for (const [key, findings] of byTwinTargetDim.entries()) {
    if (findings.length < 2) continue;
    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        if (areOpposing(findings[i].disposition, findings[j].disposition)) {
          results.push({
            twinRef: findings[i].twinId, targetId: findings[i].targetId, dimensionId: findings[i].dimensionId,
            findingIdA: findings[i].findingId, findingIdB: findings[j].findingId,
            reviewRefA: findings[i].reviewRef, reviewRefB: findings[j].reviewRef,
            resolution: "incohérence interne non résolue"
          });
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// buildStabilityContradictionAnalysis — orchestration principale, entièrement
// déterministe (aucun workerCallFn requis ; réservé pour une extension future
// si une contradiction sémantique non structurelle devait être classifiée).
// ---------------------------------------------------------------------------
function buildStabilityContradictionAnalysis(reviewSet, aggregatedReview) {
  assertReviewSet(reviewSet);
  assertAggregatedReview(aggregatedReview);

  const findingsByGroupKey = collectGroups(reviewSet); // Map<key, {targetId,dimensionId,findings}>
  const findingsFlatByGroupKey = new Map([...findingsByGroupKey.entries()].map(([k, g]) => [k, g.findings]));

  const leaveTwinOutResults = leaveOneTwinOut(reviewSet, aggregatedReview);
  const leaveEvidenceOutResults = leaveOneEvidenceOut(aggregatedReview, findingsFlatByGroupKey);
  const interContra = interReviewContradictions(findingsFlatByGroupKey);
  const intraContra = intraReviewContradictions(reviewSet);

  const analyses = aggregatedReview.aggregates.map((agg) => {
    const key = groupKeyOf(agg);
    const findings = findingsFlatByGroupKey.get(key) || [];
    const twinOut = leaveTwinOutResults.filter((r) => r.targetId === agg.targetId && r.dimensionId === agg.dimensionId);
    const evidenceOut = leaveEvidenceOutResults.filter((r) => r.targetId === agg.targetId && r.dimensionId === agg.dimensionId);
    const contradictionsHere = interContra.filter((c) => c.targetId === agg.targetId && c.dimensionId === agg.dimensionId)
      .concat(intraContra.filter((c) => c.targetId === agg.targetId && c.dimensionId === agg.dimensionId));

    const notDeterminableReasons = [];
    if (findings.length === 0) notDeterminableReasons.push("no_findings");
    if (agg.targetEvidenceRefs.length === 0) notDeterminableReasons.push("no_target_evidence");
    if (agg.twinBasisWorkRefs.length === 0) notDeterminableReasons.push("no_twin_basis_evidence");
    if (contradictionsHere.length > 0) notDeterminableReasons.push("unresolved_contradiction");
    if (agg.independentTwinCount <= 1) notDeterminableReasons.push("single_twin_dependency"); // descriptif, jamais un seuil de fiabilité

    const anyDisappeared = twinOut.some((r) => r.resultBecameEmpty
      || r.convergenceOutcomes.some((c) => c.disappearedEntirely || c.downgradedBelowMultiTwin)
      || r.divergenceOutcomes.some((d) => d.disappearedEntirely || d.collapsedToSingleBranch));

    return {
      targetId: agg.targetId, dimensionId: agg.dimensionId,
      stability: {
        leaveOneTwinOut: twinOut,
        leaveOneEvidenceOut: evidenceOut,
        structurallyStable: !anyDisappeared,
        structurallyStableDefinition: "Stable dans les scénarios de retrait (twin/preuve) testés ici — jamais une validation scientifique."
      },
      dependencies: {
        twinRefs: agg.contributingTwinRefs,
        independentTwinCount: agg.independentTwinCount,
        evidenceDependency: evidenceDependencyReport(findings)
      },
      contradictions: contradictionsHere,
      notDeterminableReasons,
      limitations: [
        "L'analyse de stabilité est une sensibilité documentaire structurelle, jamais une mesure statistique.",
        "structurallyStable ne constitue en aucun cas une validation scientifique.",
        "Une contradiction non résolue reste non résolue ici — EF-03D ne choisit jamais de branche."
      ]
    };
  });

  return {
    schema: "EvidenceForge.StabilityContradictionAnalysis", schemaVersion: "EF-03D-v1",
    missionId: reviewSet.missionId || null,
    reviewSchemaHash: reviewSet.reviewSchemaHash || null,
    analyses,
    summary: {
      groups: analyses.length,
      structurallyStableCount: analyses.filter((a) => a.stability.structurallyStable).length,
      contradictionsFound: analyses.reduce((n, a) => n + a.contradictions.length, 0),
      testMode: true, scientificValidity: false
    },
    testMode: true
  };
}

const EF03DStabilityContradiction = {
  leaveOneTwinOut, leaveOneEvidenceOut, evidenceDependencyReport,
  interReviewContradictions, intraReviewContradictions,
  buildStabilityContradictionAnalysis, areOpposing, OPPOSING_DISPOSITIONS
};

if (typeof module !== "undefined" && module.exports) module.exports = EF03DStabilityContradiction;
if (typeof window !== "undefined") window.EF03DStabilityContradiction = EF03DStabilityContradiction;
