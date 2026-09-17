// EvidenceForge — EF-ORCH — Classification des stages EF-01A→EF-01F — v0.1
// Fixe la classification avant tout branchement d'exécuteur réel (EF-ORCH-03).
// Vérifiée contre le code réel des modules, pas supposée.
//
// Distinction importante : le module HTML historique et l'exécuteur
// orchestré ne sont pas toujours classés pareil, quand la phase probabiliste
// a été déplacée en amont de la confirmation du RunContract (EF-ORCH-03E
// pour EF-01B, EF-ORCH-03F pour EF-01C1) :
//   - EF-01A : genId() locaux via Date.now()/Math.random(), aucun fetch —
//     module historique et exécuteur orchestré sont tous deux locaux.
//   - EF-01B, EF-01C1 : le module HTML historique appelle fetch(workerUrl)
//     vers le Worker Anthropic (LLM). L'exécuteur ORCHESTRÉ, lui, ne fait
//     aucun appel réseau — il matérialise/vérifie un artefact déjà figé
//     pendant une pré-analyse antérieure à la confirmation du RunContract.
//     C'est pour cette raison, et seulement celle-ci, qu'ils sont classés
//     "pure"/deterministic:true/restart_stage ci-dessous malgré une
//     planification réelle non déterministe et humaine en amont.
//   - EF-01C2 : fetch vers OpenAlex/Crossref/PubMed — ici le retrieval EST
//     la fonction du stage lui-même, aucune pré-analyse ne peut absorber cet
//     appel réseau. Reste read_only_external/deterministic:false/
//     resume_checkpoint, sans reclassification prévue.
//   - EF-01D, EF-01E (version TEST), EF-01F : aucun fetch, logique locale pure.
"use strict";

const { createStageAdapterRegistry } = require("./ef-orch-stage-adapter-v0.1.js");

// executionClass / deterministic sont deux axes séparés (cf. EF-ORCH-02) :
// - executionClass répond à "un replay a-t-il un effet externe ?"
// - deterministic répond à "un replay donne-t-il le même résultat métier ?"
// checkpointPolicy: "freeze_successful_output" pour tous les stages V1 — une
// fois qu'un stage a produit une sortie valide pour ce run, elle devient la
// vérité de ce run et n'est jamais recalculée par un stage aval qui reprend
// après un gate. Les métadonnées volatiles (Date.now, IDs aléatoires) ne
// remettent pas en cause ce déterminisme métier — cf. notes par stage.
const EF01_STAGE_CLASSIFICATION = Object.freeze([
  {
    stageId: "EF-01A",
    executionClass: "pure",
    deterministic: true, // métier déterministe à entrée identique ; IDs/timestamps volatils à isoler par l'exécuteur, pas par cette classification
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "Local, construction mission/documents. Contenu métier déterministe ; octet exact de l'export non garanti (Date.now/Math.random)."
  },
  {
    stageId: "EF-01B",
    executionClass: "pure", // reclassifié après EF-ORCH-03E : l'exécuteur orchestré ne fait aucun appel réseau
    deterministic: true, // au sens métier de l'exécution orchestrée — cf. note ci-dessous
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "L'étape probabiliste Anthropic n'a pas disparu : elle a été déplacée dans la pré-analyse antérieure à la confirmation du RunContract (cf. EF01BResolverTrace). L'exécuteur orchestré EF-01B ne fait aucun appel réseau et ne prend aucune nouvelle décision disciplinaire — il matérialise le RunContract confirmé, dont les disciplines et leur statut final sont déjà la vérité méthodologique actée."
  },
  {
    stageId: "EF-01C1",
    executionClass: "pure", // reclassifié après EF-ORCH-03F : l'exécuteur orchestré ne fait aucun appel réseau
    deterministic: true, // au sens métier de l'exécution orchestrée — cf. note ci-dessous
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "La planification reste non déterministe et humaine (appel Anthropic, édition du protocole, validation humaine), mais elle précède l'exécution orchestrée. L'exécuteur EF-01C1 lui-même ne fait aucun appel réseau : il vérifie l'intégrité (protocolHash historique JSON.stringify) et la cohérence d'un SearchProtocol déjà figé avec le RunContract confirmé, sans jamais le reconstruire."
  },
  {
    stageId: "EF-01C2",
    executionClass: "read_only_external",
    deterministic: false, // lecture seule ≠ résultat reproductible : un corpus OpenAlex/Crossref/PubMed peut différer dix minutes ou trois mois plus tard
    resumePolicy: "resume_checkpoint",
    checkpointPolicy: "freeze_successful_output",
    note: "OpenAlex/Crossref/PubMed. Le corpus récupéré est figé en checkpoint ; les stages aval utilisent ce corpus exact, jamais un nouveau retrieval."
  },
  {
    stageId: "EF-01D",
    executionClass: "pure",
    deterministic: true, // logique de décision déterministe (règles du RunContract) ; métadonnées d'exécution (timestamps/IDs) isolées du déterminisme métier
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "Screening local + AuditDecision. Rejouable depuis le checkpoint figé d'EF-01C2 (jamais depuis EF-01C2 lui-même)."
  },
  {
    stageId: "EF-01E",
    executionClass: "pure",
    deterministic: true,
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "ATTENTION : qualification factice TEST dans la version actuelle (PIPELINE_TEST_NON_SCIENTIFIC, scientificValidity:false). Branchable pour valider l'orchestration technique, jamais comme qualification finale du futur produit."
  },
  {
    stageId: "EF-01F",
    executionClass: "pure",
    deterministic: true,
    resumePolicy: "restart_stage",
    checkpointPolicy: "freeze_successful_output",
    note: "Gel/agrégation locale (CorpusSnapshot + hashOuChecksum)."
  }
]);

// ---------------------------------------------------------------------------
// registerEF01Stages(registry?) -> registry
// Enregistre les 7 stages sur un registre EF-ORCH-02. En crée un nouveau si
// aucun n'est fourni. Ne branche aucun exécuteur — c'est le rôle d'EF-ORCH-03.
// ---------------------------------------------------------------------------
function registerEF01Stages(registry) {
  const reg = registry || createStageAdapterRegistry();
  for (const s of EF01_STAGE_CLASSIFICATION) {
    reg.registerStageAdapter({
      stageId: s.stageId,
      executionClass: s.executionClass,
      deterministic: s.deterministic,
      resumePolicy: s.resumePolicy,
      checkpointPolicy: s.checkpointPolicy
    });
  }
  return reg;
}

const EFOrchEF01Stages = { EF01_STAGE_CLASSIFICATION, registerEF01Stages };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01Stages;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01Stages = EFOrchEF01Stages;
}
