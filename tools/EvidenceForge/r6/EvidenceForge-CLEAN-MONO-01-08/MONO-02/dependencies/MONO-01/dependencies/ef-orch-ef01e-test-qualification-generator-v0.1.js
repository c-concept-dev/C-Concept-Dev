// EvidenceForge — Générateur QualificationTestArtifact — v0.1
// UTILITAIRE HORS PIPELINE ORCHESTRÉ — jamais appelé par l'exécuteur EF-01E.
// Reproduit fidèlement buildTestQualification()/addTestDecision() du vrai
// module TEST, avec une seule différence assumée : acteur:"system_test" au
// lieu de acteur:"human", pour ne jamais faire mentir une décision sur son
// origine. Le vrai outil interactif (un humain cliquant réellement le
// bouton) reste libre de produire acteur:"human" — les deux sont acceptés
// par assertQualificationTestArtifactValid.
"use strict";

const { TEST_TAG, DIMENSIONS } = require("./ef-orch-ef01e-qualification-test-artifact-v0.1.js");

function genId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// generateTestQualificationForSource(sourceId, protocolHash, options?)
// -> { qualification, decisions[] }
// ---------------------------------------------------------------------------
function generateTestQualificationForSource(sourceId, protocolHash, options) {
  const opts = options || {};
  const acteur = opts.acteur || "system_test";
  const nowIso = opts.nowIso || (() => new Date().toISOString());
  const genIdFn = opts.genId || genId;

  const refs = {};
  const decisions = DIMENSIONS.map((dim) => {
    const decisionId = genIdFn("decision");
    const value = dim === "niveauDePreuve" ? "nullable_non_evalue" : "TEST — non évaluée";
    refs[dim] = decisionId;
    return {
      decisionId, typeDecision: "qualification_dimension", date: nowIso(), acteur,
      modelProvider: null, modelId: null, promptVersion: null, protocolRef: protocolHash, inputSourceRef: sourceId,
      decision: { dimension: dim, value, testOnly: true },
      justification: "TEST PIPELINE — valeur factice créée automatiquement après action explicite de l'utilisateur. Aucune interprétation scientifique.",
      confidenceQualitative: "non_applicable_test", humanOverride: null,
      testOnly: true, testTag: TEST_TAG
    };
  });

  const dims = {};
  const justifications = {};
  DIMENSIONS.forEach((dim) => {
    dims[dim] = dim === "niveauDePreuve" ? null : "TEST — non évaluée";
    justifications[dim] = "Qualification factice de test.";
  });

  const qualification = {
    ...dims,
    justifications,
    auditDecisionRefs: refs,
    testOnly: true,
    testTag: TEST_TAG,
    qualifiedAt: nowIso()
  };

  return { qualification, decisions };
}

// ---------------------------------------------------------------------------
// generateQualificationTestArtifact(ef01dOutput, options?)
// Qualifie TOUTES les sources incluses de la sortie EF-01D fournie ; les
// autres restent avec qualification:null, exactement comme le vrai module.
// ---------------------------------------------------------------------------
function generateQualificationTestArtifact(ef01dOutput, options) {
  const protocolHash = ef01dOutput.searchProtocol && ef01dOutput.searchProtocol.protocolHash;
  const allDecisions = [];
  const sourcesQualified = (ef01dOutput.sourcesScreening || []).map((s) => {
    if (s.statutScreening !== "inclus") return { ...s };
    const { qualification, decisions } = generateTestQualificationForSource(s.id, protocolHash, options);
    allDecisions.push(...decisions);
    return { ...s, qualification };
  });
  return { sourcesQualified, auditDecisions: allDecisions };
}

const EFOrchEF01ETestQualificationGenerator = { generateTestQualificationForSource, generateQualificationTestArtifact };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01ETestQualificationGenerator;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01ETestQualificationGenerator = EFOrchEF01ETestQualificationGenerator;
}
