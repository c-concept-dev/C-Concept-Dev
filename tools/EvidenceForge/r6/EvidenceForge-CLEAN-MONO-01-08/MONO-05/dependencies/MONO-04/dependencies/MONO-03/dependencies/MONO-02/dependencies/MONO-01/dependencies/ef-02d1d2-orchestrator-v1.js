// EvidenceForge — EF-02D1+D2 — Orchestrateur — v1 (corrigé)
//
// EF-02D2 produit désormais un jugement PAR DIMENSION (relevanceStatus +
// epistemicStatus, orthogonaux) au lieu d'un verdict global unique. Cet
// orchestrateur combine EF-02D1 (éligibilité documentaire, pur) et EF-02D2
// (jugements de pertinence par dimension, LLM injecté).
"use strict";

const { evaluateEligibility } = require("./ef-02d1-eligibility-v1.js");
const { evaluateMissionRelevance } = require("./ef-02d2-mission-relevance-v1.js");

function arr(v) { return Array.isArray(v) ? v : []; }

function assertCorpusSet(d) {
  if (!d || d.schema !== "EvidenceForge.ProfessionalCorpusSet" || d.schemaVersion !== "EF-02C-v2" || !Array.isArray(d.professionalCorpora)) {
    throw new Error("EF-02D1D2: ProfessionalCorpusSet (EF-02C-v2) invalide ou manquant.");
  }
}

// ---------------------------------------------------------------------------
// buildEligibilityRelevanceSet(corpusSet, missionQuestion, dimensionSet, heuristicPolicy, workerCallFn, opts)
// -> DocumentaryEligibilityRelevanceSet / EF-02D-v2
// Chaque record distingue explicitement deux objets, jamais fusionnés :
//   eligibility        — sortie brute d'EF-02D1 (volume documentaire)
//   dimensionRelevance — tableau brut des jugements EF-02D2 (pertinence par
//                        dimension, chacun avec relevanceStatus+epistemicStatus)
// ---------------------------------------------------------------------------
async function buildEligibilityRelevanceSet(corpusSet, missionQuestion, dimensionSet, heuristicPolicy, workerCallFn, opts) {
  assertCorpusSet(corpusSet);
  const records = [];
  for (const corpus of corpusSet.professionalCorpora) {
    const eligibility = evaluateEligibility(corpus, heuristicPolicy);
    let dimensionRelevance = null, d2Error = null;
    try {
      const d2 = await evaluateMissionRelevance(corpus, missionQuestion, dimensionSet, workerCallFn, opts);
      dimensionRelevance = d2.judgments;
    } catch (e) {
      d2Error = e.message;
    }
    records.push({
      schema: "EvidenceForge.DocumentaryEligibilityRelevance",
      schemaVersion: "EF-02D-v2",
      professionalRef: corpus.professionalRef,
      displayName: (corpus.identityRef && corpus.identityRef.displayName) || null,
      identityRef: corpus.identityRef || {},
      eligibility,
      dimensionRelevance,
      d2Error,
      sourceCorpusSummary: corpus.summary || {},
      evaluatedAt: new Date().toISOString(),
      testOnly: true
    });
  }
  const withD2 = records.filter((r) => Array.isArray(r.dimensionRelevance));
  const c = {
    d1Eligible: records.filter((r) => r.eligibility.status === "eligible_documentary").length,
    d1Insufficient: records.filter((r) => r.eligibility.status === "insufficient_documentary").length,
    anyMissionRelevantOrPartial: withD2.filter((r) => r.dimensionRelevance.some((j) => ["mission_relevant", "partially_relevant"].includes(j.relevanceStatus))).length,
    allMissionIrrelevant: withD2.filter((r) => r.dimensionRelevance.every((j) => j.relevanceStatus === "mission_irrelevant")).length,
    d2Errors: records.filter((r) => r.d2Error).length
  };
  return {
    schema: "EvidenceForge.DocumentaryEligibilityRelevanceSet",
    schemaVersion: "EF-02D-v2",
    missionId: corpusSet.missionId || null,
    missionQuestion,
    dimensionSetRef: { missionId: dimensionSet.missionId, dimensionSetHash: dimensionSet.dimensionSetHash, dimensionCount: dimensionSet.dimensions.length },
    sourceCorpusSet: { schemaVersion: corpusSet.schemaVersion, corporaAvailable: corpusSet.professionalCorpora.length },
    records,
    summary: { targeted: records.length, ...c, testMode: true, scientificValidity: false, humanProfessionalValidation: false, warning: "Documentary eligibility and per-dimension relevance only. No professional participation or endorsement is inferred.", completedAt: new Date().toISOString() }
  };
}

// Un professionnel est "utilisable" pour EF-02D3 si son corpus est
// documentairement suffisant (eligibility) ET pertinent sur AU MOINS une
// dimension (relevanceStatus mission_relevant ou partially_relevant sur au
// moins un jugement) — un professionnel dont TOUTES les dimensions sont
// mission_irrelevant n'a pas sa place dans la suite, quel que soit son
// epistemicStatus.
function usableRecords(eligibilityRelevanceSet) {
  return arr(eligibilityRelevanceSet.records).filter((r) =>
    r.eligibility.status === "eligible_documentary" &&
    Array.isArray(r.dimensionRelevance) &&
    r.dimensionRelevance.some((j) => ["mission_relevant", "partially_relevant"].includes(j.relevanceStatus))
  );
}

const EF02D1D2Orchestrator = { buildEligibilityRelevanceSet, usableRecords };

if (typeof module !== "undefined" && module.exports) module.exports = EF02D1D2Orchestrator;
if (typeof window !== "undefined") window.EF02D1D2Orchestrator = EF02D1D2Orchestrator;
