// EvidenceForge — EF-03A — Review Schema — v1
//
// EF-03A ne produit aucun avis. Il construit le contrat de sortie que le
// futur Review Runner (EF-03B) devra respecter, pour que chaque jumeau
// documentaire examine exactement la même mission, les mêmes documents
// cibles et les mêmes dimensions. Aucune constante de dimensions locale —
// MissionDimensionSet (EF-PR-GEN-01, gelé) est la source unique.
"use strict";

const { sha256CanonicalJson } = require("../dependencies/ef-orch-hash-v0.1.js");

function str(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function assertTwinSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryTwinSet" || d.schemaVersion !== "EF-02E-v2" || !Array.isArray(d.twins)) {
    throw new Error("EF-03A: DocumentaryTwinSet (EF-02E-v2) invalide ou manquant.");
  }
}
function assertDimensionSet(d) {
  if (!d || d.schema !== "EvidenceForge.MissionDimensionSet" || d.schemaVersion !== "EF-PR-GEN-v1" || !Array.isArray(d.dimensions) || !d.dimensions.length) {
    throw new Error("EF-03A: MissionDimensionSet (EF-PR-GEN-v1) invalide ou manquant — aucune dimension codée en dur n'est utilisée.");
  }
}

const DISCLAIMER = "Ce rapport contient des simulations d'avis produites par IA à partir de documents publics associés à des professionnels réels. Les professionnels cités n'ont pas participé à cette revue et n'ont pas validé les réponses synthétiques. Toute position non explicitement documentée est signalée comme inférence prudente ou non déterminable.";

// ---------------------------------------------------------------------------
// buildReviewTargets(labels) — transforme une liste de libellés (fournie par
// l'appelant, jamais un textarea codé en dur) en cibles de revue génériques.
// Les cibles de revue sont des OBJETS À EXAMINER, jamais des preuves du
// jumeau — rappelé explicitement dans reviewContract.
// ---------------------------------------------------------------------------
function buildReviewTargets(labels) {
  return arr(labels).map((label, i) => str(label)).filter(Boolean).map((label, i) => ({
    targetId: "target-" + String(i + 1).padStart(2, "0"),
    label,
    role: "review_target_not_evidence"
  }));
}

// ---------------------------------------------------------------------------
// buildReviewSchema({twinSet, dimensionSet, reviewTargets, missionQuestion})
// -> ReviewSchema / EF-03A-v1
//
// INVARIANT STRUCTUREL : le ReviewSchema décrit l'AUDIT À EXÉCUTER, jamais
// le panel qui va l'exécuter. À mission/dimensions/targets identiques, deux
// DocumentaryTwinSet différents produisent un schéma STRUCTURELLEMENT
// IDENTIQUE (même schemaHash) — le TwinSet ne sert qu'à vérifier une
// cohérence contractuelle et, éventuellement, hériter la question si elle
// n'est pas fournie autrement. Il ne doit JAMAIS influencer le contenu du
// schéma (dimensions, targets, règles) — ce serait laisser le panel
// sélectionné façonner l'instrument qui va servir à l'évaluer.
// ---------------------------------------------------------------------------
async function buildReviewSchema({ twinSet, dimensionSet, reviewTargets, missionQuestion }) {
  assertTwinSet(twinSet);
  assertDimensionSet(dimensionSet);
  const targets = arr(reviewTargets);
  if (!targets.length) throw new Error("EF-03A: reviewTargets[] vide — au moins un document cible est requis.");
  const question = str(missionQuestion) || str(twinSet.missionQuestion);
  if (!question) throw new Error("EF-03A: missionQuestion absente (ni fournie, ni présente dans le DocumentaryTwinSet).");

  const substantive = {
    schema: "EvidenceForge.ReviewSchema",
    schemaVersion: "EF-03A-v1",
    stage: "EF-03A",
    stageVersion: "EF-03A-v1-generic",
    missionQuestion: question,
    intendedUse: "research_internal",
    reviewTargets: targets,
    dimensions: dimensionSet.dimensions,
    dimensionSetRef: { missionId: dimensionSet.missionId, dimensionSetHash: dimensionSet.dimensionSetHash },
    epistemicPolicy: {
      statuses: ["documented", "cautious_inference", "not_determinable"],
      documentedRule: "Claim directly supported by at least one work embedded in the documentary twin corpus.",
      cautiousInferenceRule: "Interpretive extension compatible with the documentary corpus but not explicitly stated in a source; must include inference rationale and limitations.",
      notDeterminableRule: "Use when the twin corpus does not support a reliable position.",
      defaultWhenUnsupported: "not_determinable"
    },
    reviewContract: {
      sameMissionForAllTwins: true,
      sameTargetsForAllTwins: true,
      mayUseOnlyTwinDocumentaryCorpus: true,
      targetDocumentsAreNeverEvidence: true,
      coverageMayGuideScopeButNotCreateEvidence: true,
      syntheticQuotesForbidden: true,
      firstPersonImitationForbidden: true,
      realOpinionAttributionForbidden: true,
      participationOrEndorsementInferenceForbidden: true
    },
    reviewOutputSchema: {
      twinId: "string", professionalRef: "string", referenceProfessionalName: "string",
      reviewStatus: "complete|partial|error",
      targetAssessments: [{
        targetId: "string",
        findings: [{
          findingId: "string",
          dimensionId: "un identifiant parmi " + dimensionSet.dimensions.map((d) => d.id).join(", "),
          disposition: "support|concern|gap|recommendation|not_determinable",
          epistemicStatus: "documented|cautious_inference|not_determinable",
          statement: "string", rationale: "string",
          supportingWorkRefs: ["openAlexWorkId|doi|title"],
          targetEvidenceRefs: ["target section or passage identifiers"],
          confidenceQualitative: "high|medium|low",
          limitations: ["string"]
        }],
        targetSummary: { strengths: ["findingId"], concerns: ["findingId"], gaps: ["findingId"], recommendations: ["findingId"], notDeterminable: ["findingId"] }
      }],
      crossTargetSynthesis: { convergentFindings: ["findingId"], contradictions: ["findingId"], priorityRecommendations: ["findingId"], unresolvedQuestions: ["string"] }
    },
    qualityRules: {
      everyDocumentedFindingNeedsAtLeastOneSupportingWork: true,
      cautiousInferenceNeedsExplicitRationale: true,
      notDeterminableNeedsNoSyntheticFiller: true,
      everyFindingNeedsDimension: true,
      noFreeTextCitationAsProfessionalQuote: true,
      outputMustBeValidJson: true
    },
    disclaimer: DISCLAIMER,
    testMode: true, scientificValidity: false, humanProfessionalValidation: false
  };

  const schemaHash = await sha256CanonicalJson(substantive);
  // sourceTwinStageVersion : informatif seulement (traçabilité de quel
  // export EF-02E a servi à VÉRIFIER la cohérence), jamais inclus dans le
  // hash structurel — deux TwinSet différents mais de même schemaVersion
  // produisent le même schemaHash, comme exigé.
  return { ...substantive, sourceTwinStageVersion: twinSet.schemaVersion || null, schemaHash };
}

const EF03AReviewSchema = { buildReviewSchema, buildReviewTargets, DISCLAIMER };

if (typeof module !== "undefined" && module.exports) module.exports = EF03AReviewSchema;
if (typeof window !== "undefined") window.EF03AReviewSchema = EF03AReviewSchema;
