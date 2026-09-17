// EvidenceForge — EF-03C — Aggregated Documentary Review — v1
//
// Agrège les revues (EF-03B) sans jamais les réduire à un vote d'experts.
// Le groupement, le dénombrement et la provenance restent ENTIÈREMENT
// DÉTERMINISTES — aucun LLM n'est nécessaire pour ces opérations. Seule la
// classification sémantique convergence/divergence est éligible à un LLM
// injecté (optionnel) ; l'invariant anti-mono-twin est appliqué PAR LE
// CODE après coup, jamais laissé à la confiance du LLM.
//
// Interdits, appliqués structurellement : majorité, consensus par nombre,
// score de vérité, "N experts sur M", prestige, pondération par citation,
// moyenne des statuts épistémiques.
"use strict";

function str(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function assertReviewSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryReviewSet" || d.schemaVersion !== "EF-03B-v1" || !Array.isArray(d.reviews)) {
    throw new Error("EF-03C: DocumentaryReviewSet (EF-03B-v1) invalide ou manquant.");
  }
}

function groupKey(targetId, dimensionId) { return targetId + "::" + dimensionId; }

// ---------------------------------------------------------------------------
// collectGroups(reviewSet) — PUR, déterministe. Pour chaque (target ×
// dimension), rassemble tous les findings des revues complètes, avec leur
// provenance (review, twin). Ne juge jamais la compatibilité sémantique ici.
// ---------------------------------------------------------------------------
function collectGroups(reviewSet) {
  assertReviewSet(reviewSet);
  const groups = new Map();
  for (const review of reviewSet.reviews) {
    if (review.reviewStatus !== "complete") continue;
    for (const finding of arr(review.findings)) {
      const key = groupKey(finding.targetId, finding.dimensionId);
      if (!groups.has(key)) groups.set(key, { targetId: finding.targetId, dimensionId: finding.dimensionId, findings: [] });
      groups.get(key).findings.push({ ...finding, reviewRef: review.twinId + "::" + review.targetId });
    }
  }
  return groups;
}

// independentTwinCount — plusieurs revues du MÊME twin comptent comme UNE
// seule source documentaire indépendante (jamais gonflé artificiellement).
function independentTwinRefs(findings) {
  return [...new Set(findings.map((f) => f.twinId))];
}

// ---------------------------------------------------------------------------
// buildBaseAggregate(group) — PUR. Ne classe ni convergence ni divergence —
// seulement le dénombrement, la provenance et les preuves. C'est la base
// que la classification sémantique (optionnelle) vient enrichir ensuite,
// jamais remplacer.
// ---------------------------------------------------------------------------
function buildBaseAggregate(group) {
  const findings = group.findings;
  const notDeterminable = findings.filter((f) => f.epistemicStatus === "not_determinable" || f.disposition === "not_determinable").map((f) => f.findingId);
  const evidenceGaps = findings.filter((f) => f.disposition === "gap").map((f) => f.findingId);
  const twinRefs = independentTwinRefs(findings);
  return {
    targetId: group.targetId, dimensionId: group.dimensionId,
    convergences: [], divergences: [],
    notDeterminable, evidenceGaps,
    contributingReviewRefs: [...new Set(findings.map((f) => f.reviewRef))],
    contributingTwinRefs: twinRefs,
    independentTwinCount: twinRefs.length,
    targetEvidenceRefs: [...new Set(findings.flatMap((f) => f.targetEvidenceRefs))],
    twinBasisWorkRefs: [...new Set(findings.flatMap((f) => f.twinBasisWorkRefs))],
    epistemicProfile: {
      documented: findings.filter((f) => f.epistemicStatus === "documented").length,
      cautiousInference: findings.filter((f) => f.epistemicStatus === "cautious_inference").length,
      notDeterminable: findings.filter((f) => f.epistemicStatus === "not_determinable").length
    },
    allFindingIds: findings.map((f) => f.findingId)
  };
}

// ---------------------------------------------------------------------------
// buildClassificationPrompt / parseClassificationResponse — LLM OPTIONNEL,
// uniquement pour la classification sémantique convergence/divergence.
// Le LLM ne fait JAMAIS que grouper des findingId déjà existants — aucune
// preuve nouvelle, aucun statut inventé.
// ---------------------------------------------------------------------------
function buildClassificationPrompt(base, findings, missionQuestion) {
  const eligible = findings.filter((f) => !base.notDeterminable.includes(f.findingId) && !base.evidenceGaps.includes(f.findingId));
  const compact = eligible.map((f) => ({ findingId: f.findingId, twinId: f.twinId, disposition: f.disposition, epistemicStatus: f.epistemicStatus, finding: f.finding, rationale: f.rationale }));
  return `Tu es EvidenceForge EF-03C. Classe les analyses documentaires suivantes (une par professionnel, pour la même cible et la même dimension) en groupes de CONVERGENCE (constats compatibles) et de DIVERGENCE (constats incompatibles). Ne modifie, n'invente et ne résume AUCUN contenu — tu classes uniquement des findingId déjà existants.

MISSION
${str(missionQuestion)}

ANALYSES À CLASSER
${JSON.stringify(compact)}

RÈGLES STRICTES
1. Une convergence signifie que plusieurs analyses DOCUMENTAIRES INDÉPENDANTES aboutissent à des constats compatibles à partir de leurs bases respectives — jamais "plusieurs professionnels pensent la même chose".
2. Ne fusionne jamais une divergence en un résultat unique : conserve les branches distinctes (une entrée par position).
3. N'invente aucun findingId — n'utilise que ceux fournis ci-dessus.
4. Une analyse peut rester seule (ni convergence ni divergence) si elle n'a pas d'équivalent — c'est un résultat normal, pas une erreur.

Retourne UNIQUEMENT ce JSON valide :
{"convergences":[{"findingIds":["..."],"rationale":"..."}],"divergences":[{"branches":[{"findingIds":["..."],"position":"..."}]}]}`;
}

function parseClassificationResponse(text, knownFindingIds) {
  const s = str(text).replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("EF-03C: JSON introuvable dans la réponse de classification.");
  const d = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(d.convergences) || !Array.isArray(d.divergences)) throw new Error("EF-03C: structure de classification invalide.");
  const known = new Set(knownFindingIds);
  for (const c of d.convergences) {
    if (!Array.isArray(c.findingIds)) throw new Error("EF-03C: convergence sans findingIds[].");
    for (const id of c.findingIds) if (!known.has(id)) throw new Error("EF-03C: findingId inconnu dans une convergence (\"" + id + "\") — aucun finding inventé n'est accepté.");
  }
  for (const dv of d.divergences) {
    if (!Array.isArray(dv.branches)) throw new Error("EF-03C: divergence sans branches[].");
    for (const branch of dv.branches) {
      if (!Array.isArray(branch.findingIds)) throw new Error("EF-03C: branche de divergence sans findingIds[].");
      for (const id of branch.findingIds) if (!known.has(id)) throw new Error("EF-03C: findingId inconnu dans une divergence (\"" + id + "\") — aucun finding inventé n'est accepté.");
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// enrichWithClassification(base, findings, classification) — applique la
// classification LLM, MAIS RÉÉCRIT DÉTERMINISTIQUEMENT l'invariant
// anti-mono-twin : un groupe prétendu "convergence" dont les findings
// proviennent d'un seul twin est reclassé comme non-convergent (ses
// findings restent visibles, seuls, jamais supprimés) — jamais une
// confiance aveugle dans le LLM sur ce point structurel.
// ---------------------------------------------------------------------------
function enrichWithClassification(base, findings, classification) {
  const byId = new Map(findings.map((f) => [f.findingId, f]));
  const convergences = [];
  const rejectedMonoTwin = [];

  for (const c of arr(classification.convergences)) {
    const members = c.findingIds.map((id) => byId.get(id)).filter(Boolean);
    const twinRefs = independentTwinRefs(members);
    if (twinRefs.length < 2) {
      // ANTI-MONO-TWIN — appliqué par le code, jamais par confiance dans le LLM.
      rejectedMonoTwin.push({ findingIds: c.findingIds, reason: "single_twin_convergence_rejected" });
      continue;
    }
    convergences.push({
      convergenceId: "conv-" + base.targetId + "-" + base.dimensionId + "-" + convergences.length,
      findingIds: c.findingIds,
      independentTwinCount: twinRefs.length,
      contributingTwinRefs: twinRefs,
      epistemicProfile: {
        documented: members.filter((f) => f.epistemicStatus === "documented").length,
        cautiousInference: members.filter((f) => f.epistemicStatus === "cautious_inference").length,
        notDeterminable: members.filter((f) => f.epistemicStatus === "not_determinable").length
      },
      targetEvidenceRefs: [...new Set(members.flatMap((f) => f.targetEvidenceRefs))],
      twinBasisWorkRefs: [...new Set(members.flatMap((f) => f.twinBasisWorkRefs))],
      rationale: str(c.rationale)
    });
  }

  const divergences = arr(classification.divergences).map((dv, i) => ({
    divergenceId: "div-" + base.targetId + "-" + base.dimensionId + "-" + i,
    branches: dv.branches.map((branch) => {
      const members = branch.findingIds.map((id) => byId.get(id)).filter(Boolean);
      return {
        findingIds: branch.findingIds, position: str(branch.position),
        contributingTwinRefs: independentTwinRefs(members),
        epistemicStatuses: members.map((f) => f.epistemicStatus)
      };
    })
  }));

  return { ...base, convergences, divergences, rejectedMonoTwinConvergences: rejectedMonoTwin };
}

// ---------------------------------------------------------------------------
// buildAggregatedDocumentaryReview — orchestration principale.
// workerCallFn OPTIONNEL : sans lui, l'agrégation reste purement
// déterministe (dénombrement/provenance seulement, aucune classification
// convergence/divergence tentée) — comportement de base toujours disponible
// sans dépendance réseau.
// ---------------------------------------------------------------------------
async function buildAggregatedDocumentaryReview(reviewSet, opts) {
  opts = opts || {};
  const groups = collectGroups(reviewSet);
  const aggregates = [];
  for (const group of groups.values()) {
    const base = buildBaseAggregate(group);
    if (typeof opts.workerCallFn === "function") {
      const eligible = group.findings.filter((f) => !base.notDeterminable.includes(f.findingId) && !base.evidenceGaps.includes(f.findingId));
      if (eligible.length >= 1) {
        const prompt = buildClassificationPrompt(base, group.findings, opts.missionQuestion);
        try {
          const text = await opts.workerCallFn(prompt);
          const classification = parseClassificationResponse(text, group.findings.map((f) => f.findingId));
          aggregates.push(enrichWithClassification(base, group.findings, classification));
          continue;
        } catch (e) {
          aggregates.push({ ...base, classificationError: e.message });
          continue;
        }
      }
    }
    aggregates.push(base);
  }

  return {
    schema: "EvidenceForge.AggregatedDocumentaryReview", schemaVersion: "EF-03C-v1",
    missionId: reviewSet.missionId || null,
    reviewSchemaHash: reviewSet.reviewSchemaHash || null,
    aggregates,
    summary: {
      groups: aggregates.length,
      totalConvergences: aggregates.reduce((n, a) => n + arr(a.convergences).length, 0),
      totalDivergences: aggregates.reduce((n, a) => n + arr(a.divergences).length, 0),
      totalRejectedMonoTwinConvergences: aggregates.reduce((n, a) => n + arr(a.rejectedMonoTwinConvergences).length, 0),
      testMode: true, scientificValidity: false
    },
    testMode: true
  };
}

const EF03CAggregation = {
  collectGroups, buildBaseAggregate, buildClassificationPrompt, parseClassificationResponse,
  enrichWithClassification, buildAggregatedDocumentaryReview, independentTwinRefs
};

if (typeof module !== "undefined" && module.exports) module.exports = EF03CAggregation;
if (typeof window !== "undefined") window.EF03CAggregation = EF03CAggregation;
