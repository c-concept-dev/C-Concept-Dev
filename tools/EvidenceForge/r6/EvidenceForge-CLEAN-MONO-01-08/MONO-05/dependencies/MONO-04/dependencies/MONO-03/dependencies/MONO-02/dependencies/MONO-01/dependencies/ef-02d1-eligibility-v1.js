// EvidenceForge — EF-02D1 — Documentary Eligibility — v1
//
// Brique générique. Consomme un ProfessionalCorpus (EF-02C-v2) et une
// HeuristicPolicy (EF-PR-GEN-v1). Aucun seuil métier silencieux : les
// quatre critères (minWorks/minDoi/minYears/minTopics) proviennent
// EXCLUSIVEMENT de la politique fournie, jamais d'une constante locale.
//
// Ne confond jamais : identité vérifiée, volume documentaire, pertinence
// mission, expertise démontrée, opinion personnelle. Cette brique ne juge
// QUE le volume documentaire — rien d'autre.
"use strict";

const REQUIRED_POLICY_KEYS = ["minWorks", "minDoi", "minYears", "minTopics"];

function arr(v) { return Array.isArray(v) ? v : []; }

function assertPolicy(heuristicPolicy) {
  if (!heuristicPolicy || heuristicPolicy.schema !== "EvidenceForge.HeuristicPolicy" || heuristicPolicy.schemaVersion !== "EF-PR-GEN-v1") {
    throw new Error("evaluateEligibility: HeuristicPolicy invalide ou manquante — aucun seuil de secours codé en dur n'est utilisé.");
  }
  const missing = REQUIRED_POLICY_KEYS.filter((k) => !(k in heuristicPolicy.values));
  if (missing.length) {
    throw new Error("evaluateEligibility: HeuristicPolicy incomplète pour EF-02D1 — clés manquantes : " + missing.join(", ") + ".");
  }
}

// ---------------------------------------------------------------------------
// evaluateEligibility(corpus, heuristicPolicy) -> DocumentaryEligibility
// Opère sur UN ProfessionalCorpus (EF-02C-v2). Un corpus en erreur
// (status !== "complete") est explicitement insufficient_documentary, sans
// inventer de valeurs pour des travaux qui n'existent pas.
// ---------------------------------------------------------------------------
function evaluateEligibility(corpus, heuristicPolicy) {
  assertPolicy(heuristicPolicy);
  const crit = {
    minWorks: heuristicPolicy.values.minWorks,
    minDoi: heuristicPolicy.values.minDoi,
    minYears: heuristicPolicy.values.minYears,
    minTopics: heuristicPolicy.values.minTopics
  };

  if (!corpus || corpus.status !== "complete") {
    return {
      schema: "EvidenceForge.DocumentaryEligibility",
      schemaVersion: "EF-02D-v2",
      professionalRef: corpus ? corpus.professionalRef : null,
      status: "insufficient_documentary",
      criteria: crit,
      observed: { works: 0, doi: 0, years: 0, topics: 0 },
      pass: { works: false, doi: false, years: false, topics: false },
      reason: corpus && corpus.error ? "corpus_build_error: " + corpus.error : "corpus_not_complete"
    };
  }

  const works = arr(corpus.corpus && corpus.corpus.works);
  const doi = works.filter((w) => !!w.doi).length;
  const years = new Set(works.map((w) => w.publicationYear).filter(Boolean)).size;
  const topics = new Set(works.flatMap((w) => arr(w.topics).map((t) => t.name).filter(Boolean))).size;

  const pass = {
    works: works.length >= crit.minWorks,
    doi: doi >= crit.minDoi,
    years: years >= crit.minYears,
    topics: topics >= crit.minTopics
  };
  const status = Object.values(pass).every(Boolean) ? "eligible_documentary" : "insufficient_documentary";

  return {
    schema: "EvidenceForge.DocumentaryEligibility",
    schemaVersion: "EF-02D-v2",
    professionalRef: corpus.professionalRef,
    status,
    criteria: crit,
    observed: { works: works.length, doi, years, topics },
    pass
  };
}

const EF02D1Eligibility = { evaluateEligibility, REQUIRED_POLICY_KEYS };

if (typeof module !== "undefined" && module.exports) module.exports = EF02D1Eligibility;
if (typeof window !== "undefined") window.EF02D1Eligibility = EF02D1Eligibility;
