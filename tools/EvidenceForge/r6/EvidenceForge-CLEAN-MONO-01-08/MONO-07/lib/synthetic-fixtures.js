"use strict";
/**
 * MONO-07 — synthetic-fixtures.js
 *
 * Construit tous les objets synthétiques du run E2E, en réutilisant
 * EXCLUSIVEMENT les modules gelés (jamais une réimplémentation) pour
 * fabriquer des objets structurellement valides. Toute entité marquée
 * SYNTHETIC_* (section 3 du CDC) — jamais une identité réelle, jamais une
 * ressemblance avec une vraie preuve scientifique ou une vraie opinion
 * professionnelle.
 *
 * Deux professionnels usables (SYNTHETIC_PROFESSIONAL_001/002) traversent
 * tout le pipeline pour produire 2 jumeaux documentaires × 2 documents
 * cibles = 4 DocumentaryReview (section 14). Un désaccord documentaire
 * délibéré est construit entre les deux jumeaux sur un même document cible
 * (section 16 — contradiction préservée, jamais un faux consensus).
 */

const path = require("path");

function loadMono01Frozen(mono05Root) {
  const dep = path.join(mono05Root, "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01", "dependencies");
  return {
    EFPrGenMissionDimensionSet: require(path.join(dep, "ef-pr-gen-mission-dimension-set-v1.js")),
    EFPrGenMissionDocumentMapping: require(path.join(dep, "ef-pr-gen-mission-document-mapping-v1.js")),
    EFPrGenHeuristicPolicy: require(path.join(dep, "ef-pr-gen-heuristic-policy-v1.js")),
    EF03AReviewSchema: require(path.join(dep, "ef-03a-review-schema-v1.js")),
    EFOrchHash: require(path.join(dep, "ef-orch-hash-v0.1.js"))
  };
}

function loadMono01TestFixtures(mono05Root) {
  // fixtures-eforch.js : outil de test DÉJÀ prouvé par MONO-01/MONO-02
  // eux-mêmes (jamais une reconstruction séparée du même prédicat) — voir
  // CDC-TRACE.md pour la justification de cette réutilisation.
  const testDir = path.join(mono05Root, "dependencies", "MONO-04", "dependencies", "MONO-03", "dependencies", "MONO-02", "dependencies", "MONO-01", "test");
  return require(path.join(testDir, "fixtures-eforch.js"));
}

const MISSION_ID = "SYNTHETIC_MISSION_001";
const MISSION_QUESTION = "Question synthétique MONO-07 : quelles pratiques documentaires génériques ressortent du corpus synthétique ?";
const OPENALEX_SOURCE_ID = "oa-synthetic-fixed-001"; // deterministe, jamais genere aleatoirement (voir e2e-driver.js)

// Deux dimensions génériques, jamais une taxonomie de pilote spécifique.
const DIMENSIONS = [
  { id: "SYNTHETIC_DIM_A", label: "Dimension synthétique A", definition: "Definition generique A pour test E2E.", weight: 1 },
  { id: "SYNTHETIC_DIM_B", label: "Dimension synthétique B", definition: "Definition generique B pour test E2E.", weight: 1 }
];

const TARGET_DOCUMENTS = [
  {
    targetId: "target-01", // convention imposée par ef-03a-review-schema-v1.js::buildReviewTargets (jamais un id inventé)
    role: "document_synthetique_1",
    label: "Document synthétique alpha",
    content: "Ce document synthétique contient le passage cible alpha démontrant une pratique structurée. Passage repère alpha."
  },
  {
    targetId: "target-02",
    role: "document_synthetique_2",
    label: "Document synthétique beta",
    content: "Ce document synthétique contient le passage cible beta illustrant une limite méthodologique. Passage repère beta."
  }
];

function buildReviewTargets(mono05Root) {
  const frozen = loadMono01Frozen(mono05Root);
  // buildReviewTargets(labels) genere target-01/target-02/... dans l'ordre —
  // jamais un id choisi par MONO-07 : on aligne TARGET_DOCUMENTS sur cette
  // convention plutot que l'inverse (le module gele fait autorite).
  return frozen.EF03AReviewSchema.buildReviewTargets(TARGET_DOCUMENTS.map((d) => d.label));
}

function buildExclusionRegistry() {
  return { schema: "EvidenceForge.ExclusionRegistrySet", schemaVersion: "EF-GOV-REG-v1", entries: [] };
}

// Deux professionnels synthétiques usables (éligibles + pertinents) —
// deviennent les deux jumeaux documentaires du happy path.
const SYNTHETIC_PROFESSIONALS = [
  {
    professionalRef: "SYNTHETIC_PROFESSIONAL_001",
    displayName: "Professionnel synthétique 001",
    openAlexAuthorId: "https://openalex.org/A-SYNTHETIC001",
    works: [
      { doi: "10.9999/synthetic-001-a", title: "SYNTHETIC_CORPUS_WORK_001A", publicationYear: 2021, topics: [{ name: "synthetic-topic-1" }] },
      { doi: "10.9999/synthetic-001-b", title: "SYNTHETIC_CORPUS_WORK_001B", publicationYear: 2022, topics: [{ name: "synthetic-topic-2" }] }
    ]
  },
  {
    professionalRef: "SYNTHETIC_PROFESSIONAL_002",
    displayName: "Professionnel synthétique 002",
    openAlexAuthorId: "https://openalex.org/A-SYNTHETIC002",
    works: [
      { doi: "10.9999/synthetic-002-a", title: "SYNTHETIC_CORPUS_WORK_002A", publicationYear: 2020, topics: [{ name: "synthetic-topic-1" }] },
      { doi: "10.9999/synthetic-002-b", title: "SYNTHETIC_CORPUS_WORK_002B", publicationYear: 2023, topics: [{ name: "synthetic-topic-3" }] }
    ]
  }
];

async function buildMissionArtifacts(mono05Root) {
  const frozen = loadMono01Frozen(mono05Root);
  const missionDimensionSet = await frozen.EFPrGenMissionDimensionSet.buildMissionDimensionSet({
    missionId: MISSION_ID,
    dimensions: DIMENSIONS,
    createdAt: "2026-08-30T00:00:00.000Z"
  });
  const missionDocumentMapping = frozen.EFPrGenMissionDocumentMapping.buildMissionDocumentMapping({
    missionId: MISSION_ID,
    slots: TARGET_DOCUMENTS.map((d) => ({ targetId: d.targetId, role: d.role, matchers: { aliases: [d.role] } })),
    ambiguityFloor: 0.2
  });
  const heuristicPolicy = frozen.EFPrGenHeuristicPolicy.buildHeuristicPolicy({
    policyId: "SYNTHETIC_POLICY_001",
    status: "test_unvalidated",
    values: { minWorks: 2, minDoi: 2, minYears: 2, minTopics: 1, coverageThreshold: "moderate", maxPanel: 5, minMarginalGain: 0.1, redundancyPenalty: 0.2 },
    justification: "Politique heuristique synthétique MONO-07 — fixture de test, jamais une politique de production."
  });
  return { missionDimensionSet, missionDocumentMapping, heuristicPolicy };
}

async function buildEFOrchExecutionDependencies(mono05Root) {
  const fx2 = loadMono01TestFixtures(mono05Root);
  const confirmed = await fx2.buildConfirmedRunContract(MISSION_ID);
  const resolverTrace = fx2.buildResolverTrace(MISSION_ID, confirmed);
  const searchProtocol = await fx2.buildSearchProtocol(MISSION_ID, "e2ehappy");
  const screeningArtifact = fx2.buildScreeningArtifact([OPENALEX_SOURCE_ID], searchProtocol.protocolHash);
  const qualificationTestArtifact = fx2.buildQualificationArtifact(screeningArtifact, searchProtocol);
  return {
    confirmedRunContract: confirmed,
    executionDependencies: {
      ef01aInjected: fx2.buildEF01AInjected(MISSION_ID),
      resolverTrace,
      searchProtocol,
      protocolHash: searchProtocol.protocolHash,
      screeningArtifact,
      qualificationTestArtifact,
      ef01fInjected: fx2.buildEF01FInjected("e2ehappy")
    },
    sourceId: OPENALEX_SOURCE_ID
  };
}

/**
 * Construit un ExternalStageAdapter RÉEL (mono04.createExternalStageAdapter,
 * jamais une réimplémentation) dont les resultProviders renvoient les deux
 * professionnels synthétiques usables à travers EF-02A/B/C réellement
 * traversés (section 9 — jamais un ProfessionalCorpusSet construit
 * directement pour éviter ces trois nœuds).
 */
function buildSyntheticAdapter(mono04) {
  return mono04.createExternalStageAdapter({
    discoverProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalDiscovery",
      schemaVersion: "EF-02A-v2",
      missionId: inputs.corpusSnapshot.missionId,
      candidates: SYNTHETIC_PROFESSIONALS.map((p) => ({
        professionalRef: p.professionalRef,
        identityRef: { openAlexAuthorId: p.openAlexAuthorId, displayName: p.displayName }
      }))
    }),
    verifyProfessionals: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalVerification",
      schemaVersion: "EF-02B-v2",
      missionId: inputs.professionalDiscovery.missionId,
      professionalRecords: inputs.professionalDiscovery.candidates.map((c) => ({
        professionalRef: c.professionalRef,
        identityRef: c.identityRef,
        verified: true
      }))
    }),
    buildProfessionalCorpus: async (inputs) => ({
      schema: "EvidenceForge.ProfessionalCorpusSet",
      schemaVersion: "EF-02C-v2",
      missionId: inputs.professionalVerification.missionId,
      professionalCorpora: inputs.professionalVerification.professionalRecords.map((r) => {
        const synth = SYNTHETIC_PROFESSIONALS.find((p) => p.professionalRef === r.professionalRef);
        return {
          schema: "EvidenceForge.ProfessionalCorpus",
          schemaVersion: "EF-02C-v2",
          professionalRef: r.professionalRef,
          identityRef: r.identityRef,
          corpus: { works: synth.works },
          status: "complete"
        };
      })
    })
  });
}

/**
 * Réponse du serveur worker synthétique pour EF-02D (eligibility/coverage) —
 * juge les deux professionnels mission_relevant/documented sur les deux
 * dimensions (nécessaire pour qu'ils soient tous deux "usable" et couverts
 * par le panel).
 */
function eligibilityWorkerResponder(payload) {
  const prompt = String(payload || "");
  // D2 (mission relevance) : un jugement par dimension.
  // BUG REEL TROUVE (dans MONO-07 lui-meme, jamais un lot gele) : la
  // condition precedente (prompt.includes("relevanceStatus")) etait
  // ambigue -- "relevanceStatus" apparait aussi dans le CONTEXTE du prompt
  // D3 (rappel du jugement D2 deja etabli), pas seulement dans le schema
  // de sortie attendu de D2. Toutes les reponses D3 recevaient donc a tort
  // le format D2 ({judgments:[...]}) au lieu de {dimensions:[...]},
  // produisant systematiquement 0 twin usable (EF-02D3: "2 dimensions
  // attendues"). Corrige par un marqueur non ambigu : seul le schema JSON
  // de sortie D2 (ef-02d2-mission-relevance-v1.js) declare le champ
  // "dimensionId" ; D3 ne le declare jamais (il utilise "id").
  if (prompt.includes('"dimensionId"')) {
    return JSON.stringify({
      judgments: DIMENSIONS.map((d) => ({
        dimensionId: d.id,
        relevanceStatus: "mission_relevant",
        epistemicStatus: "documented",
        rationale: "Pertinence synthétique établie pour le test E2E.",
        supportingWorkRefs: prompt.includes("001A") ? ["SYNTHETIC_CORPUS_WORK_001A"] : ["SYNTHETIC_CORPUS_WORK_002A"],
        limitations: []
      }))
    });
  }
  // D3 (coverage) : niveau de couverture PAR PROFESSIONNEL ET PAR DIMENSION,
  // délibérément complémentaire (P1 fort sur A/faible sur B, P2 l'inverse)
  // — jamais une couverture identique entre les deux, qui ferait ignorer le
  // second professionnel par l'algorithme réel de sélection de panel
  // (greedy set-cover : un second professionnel totalement redondant
  // n'apporte aucun gain marginal et n'est jamais sélectionné). Nécessaire
  // pour obtenir réellement 2 professionnels usables → 2 twins (section 11
  // du CDC), jamais un contournement de l'algorithme de sélection lui-même.
  const isP1 = prompt.includes("001A");
  return JSON.stringify({
    dimensions: DIMENSIONS.map((d) => ({
      id: d.id,
      level: (d.id === "SYNTHETIC_DIM_A") === isP1 ? "strong" : "weak",
      relevanceStatus: "mission_relevant",
      epistemicStatus: "documented",
      rationale: "Couverture synthétique suffisante pour le test E2E.",
      evidenceWorks: isP1 ? ["SYNTHETIC_CORPUS_WORK_001A"] : ["SYNTHETIC_CORPUS_WORK_002A"]
    }))
  });
}

/**
 * Réponse du serveur worker synthétique pour EF-03B (reviews) — produit
 * DÉLIBÉRÉMENT un accord documentaire (les deux twins "support" sur
 * SYNTHETIC_TARGET_001) et une contradiction documentaire (twin 001
 * "support" vs twin 002 "concern" sur SYNTHETIC_TARGET_002) — jamais un
 * faux consensus (section 16).
 */
function reviewWorkerResponder(payload) {
  const prompt = String(payload || "");
  const isTwin001 = prompt.includes("Professionnel synthétique 001");
  const isTarget1 = prompt.includes("passage cible alpha") || /targetId="?target-01/.test(prompt);

  function finding(dimId, disposition, targetRef, workRef) {
    return {
      dimensionId: dimId,
      disposition,
      epistemicStatus: "documented",
      finding: `Constat synthétique (${disposition}) pour ${dimId}.`,
      rationale: "Analyse synthétique pour test E2E MONO-07.",
      targetEvidenceRefs: [targetRef],
      twinBasisWorkRefs: [workRef],
      confidenceQualitative: "medium",
      limitations: []
    };
  }

  const targetRef = isTarget1 ? "Passage repère alpha" : "Passage repère beta";
  const workRef = isTwin001 ? "SYNTHETIC_CORPUS_WORK_001A" : "SYNTHETIC_CORPUS_WORK_002A";

  let dispositionA;
  if (isTarget1) {
    // Accord : les deux twins "support" sur la cible 1.
    dispositionA = "support";
  } else {
    // Contradiction délibérée sur la cible 2.
    dispositionA = isTwin001 ? "support" : "concern";
  }

  return JSON.stringify({
    findings: [
      finding("SYNTHETIC_DIM_A", dispositionA, targetRef, workRef),
      finding("SYNTHETIC_DIM_B", "support", targetRef, workRef)
    ]
  });
}

function combinedWorkerResponder(payload) {
  const prompt = String(payload || "");
  if (prompt.includes("EvidenceForge EF-03B")) return reviewWorkerResponder(payload);
  return eligibilityWorkerResponder(payload);
}

// NOTE CONTRACTUELLE (vérifiée avant toute implémentation, jamais supposée) :
// EF-03C (MONO-01/dependencies/ef-03c-aggregation-v1.js) accepte un
// `workerCallFn` optionnel pour une classification sémantique
// convergence/divergence — mais MONO-02/lib/node-runners.js (gelé)
// n'injecte JAMAIS ce paramètre lors de l'appel réel
// (`mono01.aggregationPort.buildAggregatedDocumentaryReview(ctx.nodeOutputs["EF-03B"], { missionId })`).
// Ce mode sans workerCallFn est le comportement CONTRACTUELLEMENT VALIDE et
// explicitement testé par EF-03 lui-même (8 des ~12 scénarios de
// test_ef03c_aggregation.js appellent buildAggregatedDocumentaryReview(rs)
// sans aucune option) : agrégation déterministe, convergences/divergences
// nommées vides, mais TOUS les findings bruts (twin, target, dimension,
// disposition, evidence refs) intégralement conservés et tracables — la
// contradiction n'est donc jamais perdue, seulement pas classifiée sous un
// libellé sémantique. MONO-07 ne fabrique donc JAMAIS de réponse pour ce
// prompt de classification (il n'est jamais envoyé) et ne doit jamais
// vérifier convergences/divergences comme condition de PASS — voir
// CDC-TRACE.md, section "LIMITATION CONTRACTUELLE EF-03C".

function openAlexResponder() {
  return { results: [{ display_name: "Source synthétique MONO-07" }] };
}

module.exports = {
  MISSION_ID,
  MISSION_QUESTION,
  OPENALEX_SOURCE_ID,
  DIMENSIONS,
  TARGET_DOCUMENTS,
  SYNTHETIC_PROFESSIONALS,
  loadMono01Frozen,
  loadMono01TestFixtures,
  buildMissionArtifacts,
  buildEFOrchExecutionDependencies,
  buildSyntheticAdapter,
  buildReviewTargets,
  buildExclusionRegistry,
  eligibilityWorkerResponder,
  reviewWorkerResponder,
  combinedWorkerResponder,
  openAlexResponder
};
