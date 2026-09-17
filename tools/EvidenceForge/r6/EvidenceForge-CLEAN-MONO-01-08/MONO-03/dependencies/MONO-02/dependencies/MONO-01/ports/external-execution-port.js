"use strict";

// ExternalExecutionPort — CDC MONO-01 section 4.15.
//
// Représente les dépendances externes (LLM, OpenAlex, Crossref, PubMed,
// Worker) SANS les coder dans les modules, en distinguant DIRECT_RUNTIME /
// INDIRECT_UPSTREAM / NONE — jamais simplifié en booléen.
//
// Chaque entrée de la table ci-dessous est dérivée directement des champs
// llmDependency/workerDependency/networkDependency du registre MONO-00
// (mono-00-frozen-baseline-registry-v1.json), reproduits ou résumés dans la
// colonne `evidence`. Là où le registre donne un texte qualifié
// (INDIRECT_UPSTREAM / PARTIAL / granularité par sous-étape), cette
// granularité est préservée telle quelle, jamais aplatie. Là où le registre
// ne donne qu'un booléen brut (cas d'EF-02A/B/C), ce port applique la règle
// explicite suivante, documentée ici plutôt que devinée silencieusement :
// `true` sans qualification -> DIRECT_RUNTIME (dépendance consommée dans le
// flux d'exécution normal du module) ; `false` -> NONE.
//
// EF-ORCH et EF-03 exigent un `subModuleId` pour lever l'ambiguïté de
// sous-étape signalée par le registre lui-même (MONO-00 T00-15) — sans lui,
// le port refuse de répondre plutôt que de donner une réponse moyenne fausse.

const NONE = "NONE";
const DIRECT = "DIRECT_RUNTIME";
const INDIRECT = "INDIRECT_UPSTREAM";

// { moduleId: { llm: {...}, worker: {...}, network: {...} } }
// Une entrée peut être soit une classification directe (module homogène),
// soit une map indexée par subModuleId (module hétérogène par sous-étape).
const CLASSIFICATION_TABLE = {
  "EF-ORCH": {
    llm: {
      bySubModule: {
        "EF-01B": { classification: INDIRECT, evidence: "MONO-00: EF-01B consomme un artefact (EF01BResolverTrace) produit par une planification LLM extérieure au stage orchestré." },
        "EF-01C1": { classification: INDIRECT, evidence: "MONO-00: EF-01C1 consomme un artefact (SearchProtocol) produit par une planification LLM extérieure au stage orchestré." },
        "EF-01C2": { classification: NONE, evidence: "MONO-00: EF-01C2 appelle OpenAlex/Crossref/PubMed directement, aucun appel LLM." },
      },
      requiresSubModule: true,
    },
    worker: { classification: NONE, evidence: "MONO-00: aucun Worker Cloudflare direct dans EF-ORCH lui-même (workerDependency=PARTIAL, résolu ici à NONE pour EF-ORCH au niveau module)." },
    network: {
      bySubModule: {
        "EF-01C2": { classification: DIRECT, evidence: "MONO-00: EF-01C2 -> OpenAlex/Crossref/PubMed DIRECT_RUNTIME (exemple donné explicitement par le CDC section 4.15)." },
      },
      requiresSubModule: true,
      defaultWhenNoSubModule: { classification: NONE, evidence: "MONO-00: réseau non utilisé hors EF-01C2 dans EF-ORCH." },
    },
  },
  "EF-PR-GEN-01": {
    llm: { classification: NONE, evidence: "MONO-00: llmDependency=false." },
    worker: { classification: NONE, evidence: "MONO-00: workerDependency=false." },
    network: { classification: NONE, evidence: "MONO-00: networkDependency=false." },
  },
  "EF-02A": {
    llm: { classification: DIRECT, evidence: "MONO-00: llmDependency=true (booléen non qualifié -> DIRECT_RUNTIME par la règle du port)." },
    worker: { classification: DIRECT, evidence: "MONO-00: workerDependency=true — Worker openalex-proxy appelé pendant la découverte." },
    network: { classification: DIRECT, evidence: "MONO-00: networkDependency=true — via le Worker, jamais un appel navigateur direct à api.openalex.org." },
  },
  "EF-02B": {
    llm: { classification: NONE, evidence: "MONO-00: llmDependency=false." },
    worker: { classification: DIRECT, evidence: "MONO-00: workerDependency=true — vérification d'identité via Worker." },
    network: { classification: DIRECT, evidence: "MONO-00: networkDependency=true." },
  },
  "EF-02C": {
    llm: { classification: NONE, evidence: "MONO-00: llmDependency=false." },
    worker: { classification: DIRECT, evidence: "MONO-00: workerDependency=true — construction du corpus via Worker OpenAlex." },
    network: { classification: DIRECT, evidence: "MONO-00: networkDependency=true." },
  },
  "EF-02D": {
    llm: { classification: DIRECT, evidence: "MONO-00: llmDependency=true — D2/D3 appellent workerCallFn de façon synchrone-attendue pendant l'évaluation (mode exact de la baseline, cf. T01-10)." },
    worker: { classification: NONE, evidence: "MONO-00: workerDependency=false." },
    network: { classification: NONE, evidence: "MONO-00: networkDependency=false." },
  },
  "EF-02E": {
    llm: { classification: NONE, evidence: "MONO-00: llmDependency=false — construction entièrement déterministe." },
    worker: { classification: NONE, evidence: "MONO-00: workerDependency=false." },
    network: { classification: NONE, evidence: "MONO-00: networkDependency=false." },
  },
  "EF-03": {
    llm: {
      bySubModule: {
        "EF-03A": { classification: NONE, evidence: "MONO-00: EF-03A/EF-03D — aucun LLM." },
        "EF-03B": { classification: DIRECT, evidence: "MONO-00: EF-03B — LLM obligatoire (DocumentaryReviewPort, ASYNC_EXTERNAL)." },
        "EF-03C": { classification: DIRECT, evidence: "MONO-00: EF-03C — LLM optionnel, utilisé uniquement pour la classification convergence/divergence quand fourni." },
        "EF-03D": { classification: NONE, evidence: "MONO-00: EF-03A/EF-03D — aucun LLM." },
      },
      requiresSubModule: true,
    },
    worker: { classification: NONE, evidence: "MONO-00: workerDependency=false." },
    network: { classification: NONE, evidence: "MONO-00: networkDependency=false." },
  },
  "EF-04": {
    llm: { classification: NONE, evidence: "MONO-00: llmDependency=false — Lineage Guard et rapport entièrement déterministes." },
    worker: { classification: NONE, evidence: "MONO-00: workerDependency=false." },
    network: { classification: NONE, evidence: "MONO-00: networkDependency=false." },
  },
};

function createExternalExecutionPort(baselinePort) {
  return {
    schema: "EvidenceForge.ExternalExecutionPort",

    // classify(moduleId, dependencyType, subModuleId?) -> { classification, evidence } | { error }
    classify(moduleId, dependencyType, subModuleId) {
      if (!baselinePort.hasModule(moduleId)) {
        return { error: "MODULE_NOT_IN_BASELINE", moduleId };
      }
      const moduleTable = CLASSIFICATION_TABLE[moduleId];
      if (!moduleTable || !moduleTable[dependencyType]) {
        return { classification: NONE, evidence: `Aucune dépendance "${dependencyType}" déclarée pour "${moduleId}" dans la table de classification.` };
      }
      const entry = moduleTable[dependencyType];
      if (entry.bySubModule) {
        if (!subModuleId) {
          if (entry.defaultWhenNoSubModule) return entry.defaultWhenNoSubModule;
          return {
            error: "SUBMODULE_REQUIRED",
            message: `"${moduleId}"/"${dependencyType}" est hétérogène par sous-étape (MONO-00 T00-15) — subModuleId requis, jamais une moyenne devinée.`,
          };
        }
        return (
          entry.bySubModule[subModuleId] || {
            classification: NONE,
            evidence: `Sous-étape "${subModuleId}" non répertoriée comme dépendante de "${dependencyType}" pour "${moduleId}".`,
          }
        );
      }
      return { classification: entry.classification, evidence: entry.evidence };
    },
  };
}

module.exports = { createExternalExecutionPort, NONE, DIRECT, INDIRECT };
