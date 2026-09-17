// EvidenceForge — EF-ORCH — Contrat QualificationTestArtifact EF-01E — v0.1
//
// EF-01E production N'EXISTE PAS dans le baseline : le seul module réel est
// explicitement TEST (EvidenceForge-EF-01E-v0.1-TEST.html), qui le dit
// noir sur blanc ("les qualifications automatiques de ce fichier n'ont
// aucune valeur scientifique"). Cette brique ne fait donc AUCUNE prétention
// de méthodologie de qualification réelle — elle vérifie seulement qu'un
// artefact TEST déjà produit (hors de ce stage orchestré) est structurellement
// fidèle au format du vrai module TEST.
//
// Garde-fou central : l'exécuteur orchestré EF-01E ne génère jamais aucune
// qualification ni aucune AuditDecision — exactement le même principe que
// pour EF-01D, renforcé ici parce que le vrai module TEST associe
// acteur:"human" à des décisions qui sont en réalité auto-générées par un
// bouton. Reproduire ça depuis l'orchestrateur ferait mentir l'orchestrateur
// sur l'origine de la décision. Le contrat accepte donc acteur:"human" (un
// humain a réellement cliqué dans l'outil réel) OU acteur:"system_test"
// (produit par un utilitaire de génération TEST séparé, jamais par
// l'exécuteur orchestré lui-même) — jamais acteur:"orchestrateur" ici.
//
// Format vérifié contre le vrai code source (buildTestQualification / addTestDecision) :
//   qualification par source incluse :
//     typeSource, autoriteInstitutionnelle, qualiteMethodologique,
//     pertinenceDirecte, actualite, applicabiliteContexte,
//     independanceConflits, niveauDePreuve (nullable),
//     justifications{...mêmes clés...}, auditDecisionRefs{...mêmes clés...},
//     testOnly:true, testTag:"PIPELINE_TEST_NON_SCIENTIFIC", qualifiedAt.
//   AuditDecision (une par dimension) :
//     decisionId, typeDecision:"qualification_dimension", date, acteur,
//     modelProvider, modelId, promptVersion, protocolRef, inputSourceRef,
//     decision:{dimension, value, testOnly:true}, justification,
//     confidenceQualitative, humanOverride, testOnly:true,
//     testTag:"PIPELINE_TEST_NON_SCIENTIFIC".
"use strict";

function str(v) {
  return String(v == null ? "" : v).trim();
}
function isArr(v) {
  return Array.isArray(v);
}
function isStr(v) {
  return typeof v === "string" && v.trim().length > 0;
}

const TEST_TAG = "PIPELINE_TEST_NON_SCIENTIFIC";
const ALLOWED_ACTEURS = Object.freeze(["human", "system_test"]);
const DIMENSIONS = Object.freeze([
  "typeSource", "autoriteInstitutionnelle", "qualiteMethodologique", "pertinenceDirecte",
  "actualite", "applicabiliteContexte", "independanceConflits", "niveauDePreuve"
]);

// ---------------------------------------------------------------------------
// assertQualificationTestArtifactValid({ sourcesQualified, auditDecisions, protocolHash, expectedSourceIds })
// expectedSourceIds : l'ensemble COMPLET des sources d'EF-01D (incluses,
// exclues, doublons confondus) — sourcesQualified doit porter exactement le
// même ensemble, jamais un sous-ensemble filtré aux seules incluses.
// ---------------------------------------------------------------------------
function assertQualificationTestArtifactValid({ sourcesQualified, auditDecisions, protocolHash, expectedSourceIds, existingDecisionIds }) {
  if (!isArr(sourcesQualified)) {
    throw new Error("assertQualificationTestArtifactValid: sourcesQualified manquant ou n'est pas un tableau.");
  }
  if (!isArr(auditDecisions)) {
    throw new Error("assertQualificationTestArtifactValid: auditDecisions manquant ou n'est pas un tableau.");
  }

  const actualIds = sourcesQualified.map((s) => str(s && s.id));
  const dupIds = actualIds.filter((id, i) => actualIds.indexOf(id) !== i);
  if (dupIds.length) {
    throw new Error("assertQualificationTestArtifactValid: sourcesQualified contient des id dupliqués : [" + [...new Set(dupIds)].join(", ") + "].");
  }
  const dupDecisionIds = auditDecisions.map((d) => str(d && d.decisionId)).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupDecisionIds.length) {
    throw new Error("assertQualificationTestArtifactValid: auditDecisions contient des decisionId dupliqués : [" + [...new Set(dupDecisionIds)].join(", ") + "].");
  }

  // Aucune décision de qualification ne doit réutiliser le decisionId d'une
  // décision de screening EF-01D déjà existante — les deux tableaux seront
  // fusionnés dans la sortie finale, une collision y serait irréversible.
  if (isArr(existingDecisionIds)) {
    const existing = new Set(existingDecisionIds.map(str));
    const collisions = auditDecisions.map((d) => str(d && d.decisionId)).filter((id) => existing.has(id));
    if (collisions.length) {
      throw new Error("assertQualificationTestArtifactValid: decisionId(s) en collision avec des AuditDecision EF-01D déjà existantes : [" + [...new Set(collisions)].join(", ") + "].");
    }
  }

  if (isArr(expectedSourceIds)) {
    const expected = [...new Set(expectedSourceIds.map(str))].sort();
    const actual = [...new Set(actualIds)].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      const missing = expected.filter((id) => !actual.includes(id));
      const extra = actual.filter((id) => !expected.includes(id));
      throw new Error(
        "assertQualificationTestArtifactValid: sourcesQualified ne correspond pas exactement à l'ensemble complet des sources d'EF-01D" +
        (missing.length ? " — manquantes: [" + missing.join(", ") + "]" : "") +
        (extra.length ? " — en trop/inventées: [" + extra.join(", ") + "]" : "") + "."
      );
    }
  }

  const decisionsById = new Map(auditDecisions.map((d) => [str(d && d.decisionId), d]));
  const referencedDecisionIds = new Set(); // pour détecter toute décision orpheline, jamais référencée par aucune dimension

  sourcesQualified.forEach((s, i) => {
    const sid = str(s && s.id);
    if (!sid) throw new Error("assertQualificationTestArtifactValid: sourcesQualified[" + i + "] sans id.");
    const included = s.statutScreening === "inclus";

    if (!included) {
      if (s.qualification != null) {
        throw new Error("assertQualificationTestArtifactValid: sourcesQualified[" + i + "] (" + sid + ", statut \"" + s.statutScreening + "\") ne doit jamais être qualifiée — seules les sources incluses le sont.");
      }
      return; // rien de plus à vérifier pour une source non incluse
    }

    const q = s.qualification;
    if (!q) {
      throw new Error("assertQualificationTestArtifactValid: sourcesQualified[" + i + "] (" + sid + ") incluse mais sans qualification.");
    }
    if (q.testOnly !== true || q.testTag !== TEST_TAG) {
      throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" n'est pas marquée testOnly:true/testTag=\"" + TEST_TAG + "\" — jamais acceptée sans ce marquage explicite.");
    }
    if (!isStr(q.qualifiedAt)) {
      throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" sans qualifiedAt.");
    }
    if (!q.justifications || typeof q.justifications !== "object") {
      throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" sans justifications.");
    }
    if (!q.auditDecisionRefs || typeof q.auditDecisionRefs !== "object") {
      throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" sans auditDecisionRefs.");
    }

    for (const dim of DIMENSIONS) {
      if (!(dim in q)) {
        throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" — dimension \"" + dim + "\" absente.");
      }
      if (dim !== "niveauDePreuve" && !isStr(q[dim])) {
        throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" — dimension \"" + dim + "\" vide (obligatoire, sauf niveauDePreuve qui est nullable).");
      }
      if (!isStr(q.justifications[dim])) {
        throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" — justification de la dimension \"" + dim + "\" manquante ou vide.");
      }
      const ref = str(q.auditDecisionRefs[dim]);
      if (!ref) {
        throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" — auditDecisionRefs[\"" + dim + "\"] manquant.");
      }
      const decision = decisionsById.get(ref);
      if (!decision) {
        throw new Error("assertQualificationTestArtifactValid: qualification de \"" + sid + "\" — auditDecisionRefs[\"" + dim + "\"] (\"" + ref + "\") ne référence aucun AuditDecision existant.");
      }
      referencedDecisionIds.add(ref);
      if (str(decision.inputSourceRef) !== sid) {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" référencé par \"" + sid + "\" concerne en réalité \"" + decision.inputSourceRef + "\" — décision mal attribuée.");
      }
      if (decision.typeDecision !== "qualification_dimension") {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" a typeDecision=\"" + decision.typeDecision + "\", attendu \"qualification_dimension\".");
      }
      if (!decision.decision || decision.decision.dimension !== dim) {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" ne porte pas dimension=\"" + dim + "\" dans son champ decision.");
      }
      // decision.value doit correspondre EXACTEMENT à la valeur de
      // qualification pour cette dimension — sauf niveauDePreuve, cas
      // spécial confirmé dans le vrai addTestDecision() : qualification
      // reste null mais la décision porte value="nullable_non_evalue",
      // jamais une égalité naïve avec null.
      const expectedValue = dim === "niveauDePreuve" ? "nullable_non_evalue" : q[dim];
      if (decision.decision.value !== expectedValue) {
        throw new Error(
          "assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" a decision.value=\"" + decision.decision.value +
          "\" incohérent avec la qualification de \"" + sid + "\" pour \"" + dim + "\" (attendu \"" + expectedValue + "\")."
        );
      }
      if (decision.decision.testOnly !== true || decision.testOnly !== true || decision.testTag !== TEST_TAG) {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" n'est pas marquée testOnly:true/testTag=\"" + TEST_TAG + "\" de façon cohérente.");
      }
      if (!isStr(decision.justification)) {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" a une justification vide.");
      }
      if (!ALLOWED_ACTEURS.includes(decision.acteur)) {
        throw new Error(
          "assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" a acteur=\"" + decision.acteur +
          "\" — seuls " + ALLOWED_ACTEURS.map((a) => "\"" + a + "\"").join(" ou ") + " sont acceptés ; jamais une décision fabriquée par l'exécuteur orchestré lui-même."
        );
      }
      if (protocolHash && str(decision.protocolRef) !== str(protocolHash)) {
        throw new Error("assertQualificationTestArtifactValid: AuditDecision \"" + ref + "\" a protocolRef=\"" + decision.protocolRef + "\" incohérent avec le protocolHash du run (\"" + protocolHash + "\").");
      }
    }
  });

  // Aucune AuditDecision orpheline : chaque décision fournie doit être
  // référencée par exactement une dimension d'une qualification — sinon elle
  // échapperait à tous les contrôles ci-dessus (acteur, testTag, protocolRef...).
  const allDecisionIds = new Set(auditDecisions.map((d) => str(d && d.decisionId)));
  const orphans = [...allDecisionIds].filter((id) => !referencedDecisionIds.has(id));
  if (orphans.length) {
    throw new Error("assertQualificationTestArtifactValid: AuditDecision orpheline(s), jamais référencée(s) par aucune dimension : [" + orphans.join(", ") + "].");
  }

  return true;
}

// ---------------------------------------------------------------------------
// computeQualificationSummary — pur, déterministe, reproduit fidèlement
// l'objet exporté par le vrai module TEST (testMode/scientificValidity/warning
// toujours identiques, jamais autre chose que "TEST"). completedAt est
// désormais obligatoire — jamais généré ici (Date.now() interdit), même
// règle que EF-01D et EF-01F. Sans cette valeur fixée par l'appelant, deux
// appels identiques produiraient deux completedAt différents et donc deux
// outputHash différents pour le même checkpoint, violant le contrat
// deterministic:true/restart_stage d'EF-01E.
// ---------------------------------------------------------------------------
function computeQualificationSummary(sourcesQualified, completedAt) {
  const c = str(completedAt);
  if (!c) {
    throw new Error("computeQualificationSummary: completedAt manquant — métadonnée volatile, jamais générée ici.");
  }
  const included = sourcesQualified.filter((s) => s.statutScreening === "inclus");
  const qualifiedIncluded = included.filter((s) => s.qualification && Object.keys(s.qualification).length > 0);
  return {
    totalSources: sourcesQualified.length,
    includedSources: included.length,
    qualifiedIncludedSources: qualifiedIncluded.length,
    testMode: true,
    scientificValidity: false,
    warning: "PIPELINE TEST ONLY — screening et qualifications non interprétables scientifiquement.",
    completedAt: c
  };
}

const EFOrchEF01EQualificationTestArtifact = { TEST_TAG, ALLOWED_ACTEURS, DIMENSIONS, assertQualificationTestArtifactValid, computeQualificationSummary };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01EQualificationTestArtifact;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01EQualificationTestArtifact = EFOrchEF01EQualificationTestArtifact;
}
