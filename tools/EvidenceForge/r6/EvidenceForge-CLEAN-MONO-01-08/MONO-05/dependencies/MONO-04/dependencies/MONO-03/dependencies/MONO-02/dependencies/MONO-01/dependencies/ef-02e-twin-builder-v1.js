// EvidenceForge — EF-02E — Documentary Twin Builder — v1
//
// Un jumeau documentaire N'EST JAMAIS le professionnel réel, son opinion
// réelle, une simulation de personnalité, un clone, ni une biographie
// générale. C'est exclusivement un objet documentaire dérivé d'un corpus
// public attribuable, limité à ce que ce corpus permet réellement
// d'établir. Construction ENTIÈREMENT DÉTERMINISTE (aucun appel LLM requis
// pour la construction elle-même) — la reproductibilité à corpus/config
// identique en découle directement, sans dépendre de la stabilité d'un
// modèle de langage.
//
// Une identité bibliographique vérifiée (nameMatch+hasAnchor+absence de
// contradiction ORCID, établie en amont par EF-02B) NE SUFFIT JAMAIS seule
// à rendre un professionnel éligible à un jumeau : l'éligibilité
// documentaire (EF-02D1), la présence dans le PanelSelection (EF-02D3) et
// l'absence d'exclusion active (registre) sont TOUTES requises.
"use strict";

const { sha256CanonicalJson } = require("../dependencies/ef-orch-hash-v0.1.js");
const { findActiveExclusion, assertRegistry } = require("./ef-02e-exclusion-registry-v1.js");

const CONSTRUCTOR_VERSION = "EF-02E-v1";

function arr(v) { return Array.isArray(v) ? v : []; }
function str(v) { return String(v == null ? "" : v).trim(); }

function assertCorpusSet(d) {
  if (!d || d.schema !== "EvidenceForge.ProfessionalCorpusSet" || d.schemaVersion !== "EF-02C-v2" || !Array.isArray(d.professionalCorpora)) {
    throw new Error("EF-02E: ProfessionalCorpusSet (EF-02C-v2) invalide ou manquant.");
  }
}
function assertEligibilityRelevanceSet(d) {
  if (!d || d.schema !== "EvidenceForge.DocumentaryEligibilityRelevanceSet" || d.schemaVersion !== "EF-02D-v2" || !Array.isArray(d.records)) {
    throw new Error("EF-02E: DocumentaryEligibilityRelevanceSet (EF-02D-v2) invalide ou manquant.");
  }
}
function assertCoverageMatrix(d) {
  if (!d || d.schema !== "EvidenceForge.CoverageMatrix" || d.schemaVersion !== "EF-02D3-v4" || !Array.isArray(d.evaluations)) {
    throw new Error("EF-02E: CoverageMatrix (EF-02D3-v4) invalide ou manquant.");
  }
}
function assertPanelSelection(d) {
  if (!d || d.schema !== "EvidenceForge.PanelSelection" || d.schemaVersion !== "EF-02D3-PANEL-v4" || !Array.isArray(d.selectedPanel)) {
    throw new Error("EF-02E: PanelSelection (EF-02D3-PANEL-v4) invalide ou manquant.");
  }
}
function assertDimensionSet(d) {
  if (!d || d.schema !== "EvidenceForge.MissionDimensionSet" || d.schemaVersion !== "EF-PR-GEN-v1" || !Array.isArray(d.dimensions)) {
    throw new Error("EF-02E: MissionDimensionSet (EF-PR-GEN-v1) invalide ou manquant.");
  }
}

function normOaId(v) { return str(v).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }

// corpusWorkRefs — ne retient comme référence CONNUE que les travaux
// réellement attribuables au professionnel : si des données d'authorship
// sont disponibles pour un travail et qu'AUCUNE ne correspond à son
// openAlexAuthorId, ce travail est exclu du référentiel connu, même si son
// titre/DOI existe par ailleurs dans le corpus. Aucune réparation
// intelligente : un travail non attribuable devient simplement une
// référence "inconnue" comme un titre inventé — même traitement, même rejet.
function corpusWorkRefs(corpus) {
  const ownId = corpus && corpus.identityRef && corpus.identityRef.openAlexAuthorId ? normOaId(corpus.identityRef.openAlexAuthorId) : null;
  return arr(corpus && corpus.corpus && corpus.corpus.works)
    .filter((w) => {
      const authorships = arr(w.authorships);
      if (!authorships.length || !ownId) return true; // aucune donnée d'authorship disponible : pas de vérification possible, on ne rejette pas ce qu'on ne peut pas vérifier
      return authorships.some((a) => a.authorId && normOaId(a.authorId) === ownId);
    })
    .map((w) => ({ title: w.title || null, doi: w.doi || null }));
}

// ---------------------------------------------------------------------------
// buildTwinForProfessional — construit UN jumeau, ou renvoie {blocked, reason}
// si la construction doit être refusée. Jamais un twin partiel invalide.
// ---------------------------------------------------------------------------
async function buildTwinForProfessional(ctx) {
  const { professionalRef, corpusSet, eligibilityRelevanceSet, coverageMatrix, panelSelection, dimensionSet, exclusionRegistry, missionId, builtAt } = ctx;

  const corpus = corpusSet.professionalCorpora.find((c) => c.professionalRef === professionalRef);
  if (!corpus) return { blocked: true, reason: "corpus_not_found", professionalRef };

  // Identité non vérifiée -> rejet explicite (défense en profondeur, ne
  // fait jamais confiance aveuglément à l'appartenance au panel).
  if (!corpus.identityRef || !str(corpus.identityRef.openAlexAuthorId)) {
    return { blocked: true, reason: "identity_not_verified", professionalRef };
  }

  // Registre d'exclusion — vérifié AVANT toute autre chose métier.
  const activeExclusion = findActiveExclusion(exclusionRegistry, professionalRef, corpus.identityRef);
  if (activeExclusion) return { blocked: true, reason: "active_exclusion", exclusionEntryId: activeExclusion.entryId, professionalRef };

  // Éligibilité documentaire (EF-02D1) — un corpus insuffisant ne produit jamais de twin.
  const eligRecord = eligibilityRelevanceSet.records.find((r) => r.professionalRef === professionalRef);
  if (!eligRecord || eligRecord.eligibility.status !== "eligible_documentary") {
    return { blocked: true, reason: "insufficient_documentary_corpus", professionalRef };
  }

  // Présence dans le panel sélectionné (EF-02D3) — jamais de twin hors panel.
  const panelEntry = panelSelection.selectedPanel.find((p) => p.professionalRef === professionalRef);
  if (!panelEntry) return { blocked: true, reason: "not_in_panel_selection", professionalRef };

  // Entrée de couverture correspondante.
  const coverageEval = coverageMatrix.evaluations.find((e) => e.professionalRef === professionalRef);
  if (!coverageEval || coverageEval.error) return { blocked: true, reason: "coverage_evaluation_missing_or_invalid", professionalRef };

  // ANTI-HALLUCINATION — défense en profondeur : toute référence de travail
  // citée dans la couverture doit exister réellement dans le corpus. Ne fait
  // jamais confiance aveuglément à une validation faite en amont.
  const known = new Set(corpusWorkRefs(corpus).flatMap((w) => [w.title, w.doi]).filter(Boolean));
  for (const dim of coverageEval.dimensions) {
    for (const ref of arr(dim.evidenceWorks)) {
      if (!known.has(ref)) throw new Error("EF-02E: référence inconnue (\"" + ref + "\") pour la dimension \"" + dim.id + "\" du professionnel \"" + professionalRef + "\" — aucune preuve inexistante n'est acceptée dans un jumeau.");
    }
  }

  // documentaryBasis — sous-ensemble traçable : uniquement les travaux déjà
  // cités comme preuve par au moins une dimension de couverture.
  const worksUsedMap = new Map();
  for (const dim of coverageEval.dimensions) {
    for (const ref of arr(dim.evidenceWorks)) {
      if (!worksUsedMap.has(ref)) worksUsedMap.set(ref, { workRef: ref, citedForDimensions: [] });
      worksUsedMap.get(ref).citedForDimensions.push(dim.id);
    }
  }
  const worksUsed = [...worksUsedMap.values()];

  const dimensionCoverage = coverageEval.dimensions.map((dim) => ({
    dimensionId: dim.id, level: dim.level, relevanceStatus: dim.relevanceStatus, epistemicStatus: dim.epistemicStatus,
    evidenceWorks: dim.evidenceWorks, rationale: dim.rationale
  }));

  const limitations = [
    "Ce jumeau ne constitue pas un avis réel, une citation ou une prise de position de la personne.",
    "Le professionnel réel n'a pas participé à la construction de ce jumeau et n'a pas validé son contenu.",
    "Une co-signature d'article ne constitue jamais une opinion personnelle établie.",
    "Le corpus documentaire est limité à ce qui a été retenu comme preuve en EF-02D2/EF-02D3."
  ];

  // epistemicProfile — classé par NIVEAU DE PREUVE uniquement, indépendamment
  // de la pertinence mission (un domaine mission_irrelevant mais documented
  // reste classé "documented" ici — les deux axes restent distincts).
  const epistemicProfile = {
    documentedDomains: dimensionCoverage.filter((d) => d.epistemicStatus === "documented").map((d) => d.dimensionId),
    cautiousInferenceDomains: dimensionCoverage.filter((d) => d.epistemicStatus === "cautious_inference").map((d) => d.dimensionId),
    notDeterminableDomains: dimensionCoverage.filter((d) => d.epistemicStatus === "not_determinable").map((d) => d.dimensionId)
  };

  const sourceCorpusHash = await sha256CanonicalJson(arr(corpus.corpus && corpus.corpus.works));
  const documentarySubsetHash = await sha256CanonicalJson(worksUsed);
  const configHash = await sha256CanonicalJson(panelSelection.selectionPolicy || {});

  const twinCore = {
    schema: "EvidenceForge.DocumentaryTwin",
    schemaVersion: "EF-02E-v2",
    twinId: "twin-" + professionalRef,
    professionalRef,
    referenceIdentity: {
      displayName: corpus.identityRef.displayName || null,
      openAlexAuthorId: corpus.identityRef.openAlexAuthorId || null,
      orcid: corpus.identityRef.orcid || null
    },
    missionId: missionId || null,
    documentaryBasis: {
      sourceCorpusRef: professionalRef,
      worksUsed,
      dimensionCoverage,
      limitations
    },
    epistemicProfile,
    instructionEnvelope: {
      mustUseOnlyDocumentaryBasis: true,
      mustPreserveUncertainty: true,
      mustNotInventPersonalOpinion: true,
      mustNotInferUnpublishedBeliefs: true,
      mustNotClaimProfessionalParticipation: true
    },
    governance: {
      isRealPerson: false,
      isDocumentaryTwin: true,
      humanProfessionalValidation: false,
      intendedUse: "research_internal",
      registryChecked: true,
      registrySnapshotDate: exclusionRegistry.snapshotDate || null,
      objectionStatus: "none_known"
    },
    stability: {
      sourceCorpusHash,
      documentarySubsetHash,
      missionDimensionSetHash: dimensionSet.dimensionSetHash,
      configHash,
      constructorVersion: CONSTRUCTOR_VERSION
    }
  };

  const { stability: _omit, ...twinCoreWithoutStability } = twinCore;
  const contentHash = await sha256CanonicalJson(twinCoreWithoutStability);
  return { ...twinCore, stability: { ...twinCore.stability, contentHash }, builtAt: builtAt || null, retracted: false };
}

// ---------------------------------------------------------------------------
// buildDocumentaryTwinSet — orchestre la construction pour TOUT le panel.
// Ne construit JAMAIS de twin pour un professionnel absent du panel — on
// n'itère QUE sur panelSelection.selectedPanel, jamais sur le corpus entier.
// ---------------------------------------------------------------------------
async function buildDocumentaryTwinSet(inputs) {
  const { corpusSet, eligibilityRelevanceSet, coverageMatrix, panelSelection, dimensionSet, exclusionRegistry, missionId, missionQuestion, builtAt } = inputs;
  assertCorpusSet(corpusSet);
  assertEligibilityRelevanceSet(eligibilityRelevanceSet);
  assertCoverageMatrix(coverageMatrix);
  assertPanelSelection(panelSelection);
  assertDimensionSet(dimensionSet);
  assertRegistry(exclusionRegistry);

  const twins = [];
  const blocked = [];
  for (const panelEntry of panelSelection.selectedPanel) {
    const result = await buildTwinForProfessional({
      professionalRef: panelEntry.professionalRef, corpusSet, eligibilityRelevanceSet, coverageMatrix, panelSelection, dimensionSet, exclusionRegistry, missionId, builtAt
    });
    if (result.blocked) blocked.push(result); else twins.push(result);
  }

  return {
    schema: "EvidenceForge.DocumentaryTwinSet",
    schemaVersion: "EF-02E-v2",
    missionId: missionId || null,
    missionQuestion: missionQuestion || null,
    dimensionSetRef: { missionId: dimensionSet.missionId, dimensionSetHash: dimensionSet.dimensionSetHash },
    twins,
    blocked,
    summary: {
      panelSize: panelSelection.selectedPanel.length,
      twinsBuilt: twins.length,
      blockedCount: blocked.length,
      testMode: true, scientificValidity: false, humanProfessionalValidation: false
    },
    testMode: true
  };
}

// ---------------------------------------------------------------------------
// withdrawTwin — retrait d'un twin déjà construit. Ne supprime jamais
// silencieusement : marque "retracted", et EXIGE une entrée d'exclusion
// correspondante (traçabilité de la décision de retrait).
// ---------------------------------------------------------------------------
function withdrawTwin(twinSet, twinId, exclusionEntry) {
  if (!exclusionEntry || exclusionEntry.reason !== "withdrawn_after_construction") {
    throw new Error("withdrawTwin: une entrée d'exclusion de raison 'withdrawn_after_construction' est obligatoire pour tracer le retrait.");
  }
  const idx = twinSet.twins.findIndex((t) => t.twinId === twinId);
  if (idx < 0) throw new Error("withdrawTwin: twin \"" + twinId + "\" introuvable.");
  const updatedTwins = twinSet.twins.map((t, i) => i === idx ? { ...t, retracted: true } : t);
  return { ...twinSet, twins: updatedTwins, summary: { ...twinSet.summary, twinsBuilt: updatedTwins.filter((t) => !t.retracted).length } };
}

const EF02ETwinBuilder = { buildTwinForProfessional, buildDocumentaryTwinSet, withdrawTwin, CONSTRUCTOR_VERSION };

if (typeof module !== "undefined" && module.exports) module.exports = EF02ETwinBuilder;
if (typeof window !== "undefined") window.EF02ETwinBuilder = EF02ETwinBuilder;
