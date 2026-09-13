import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  TREATMENT_VALUES,
  validateCriticOutput,
  deriveCriticConsequences
} from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-S1 : le canal B-01B (illegitimate_question_found, schéma/validateur/scorer C8, forme
// objet-unique G2) est déjà correct structurellement. Le smoke réel sentinelle (case-12-italie)
// montre que le Critic Groq, bien qu'il produise un JSON strictement valide, ne réalise pas
// effectivement la seconde lecture attendue : il conclut agree sans avoir vraiment examiné, une
// par une, les issues matérielles que l'Analyste a traitées par question. Ce fichier prouve deux
// choses distinctes, jamais mélangées : (1) le PROMPT exprime désormais explicitement cette seconde
// lecture, de façon saillante et séquencée avant la décision finale d'agreement ; (2) le CONTRAT
// existant (validateur + scorer, tous deux inchangés par S1) représente et vérifie correctement
// aussi bien les questions légitimes que les recours illégitimes, sans jamais forcer ni interdire
// quoi que ce soit de quantitatif. Aucune assertion ici ne dépend d'un mot métier (Italie, voyage,
// budget, dates, durée) ni n'invoque un LLM réel.

function minimalCriticOutput(overrides = {}) {
  return {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: [],
    ...overrides
  };
}

// 3F.3.3-S2 : validateCriticOutput exige désormais une cohérence bidirectionnelle entre
// question_substitution_review et illegitimate_question_found — cette fabrique construit toujours
// les deux ensemble à partir d'un seul available_alternative, jamais deux sources divergentes.
function reviewWithAvailableAlternative(issueId, alternative) {
  return {
    issue_id: issueId,
    alternatives_reviewed: {
      research: { reasonably_available: alternative === "research", reason: "Évaluation de la disponibilité d'un fait externe vérifiable." },
      decide: { reasonably_available: alternative === "decide", reason: "Évaluation de la disponibilité d'une décision déléguée." },
      estimate: { reasonably_available: alternative === "estimate", reason: "Évaluation de la disponibilité d'une estimation raisonnable." },
      scenario: { reasonably_available: alternative === "scenario", reason: "Évaluation de la disponibilité de plusieurs scénarios." },
      condition: { reasonably_available: alternative === "condition", reason: "Évaluation d'une conditionnalité explicite." },
      leave_unknown: { reasonably_available: alternative === "leave_unknown", reason: "Évaluation du caractère bloquant de l'inconnue." }
    },
    question_is_last_resort: false,
    available_alternative: alternative
  };
}

function materialQuestionIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null, ...overrides };
}

function illegitimateQuestionFinding(overrides = {}) {
  return { issue_id: "ISSUE-1", available_alternative: "research", why_available: "Un fait externe vérifiable aurait pu être recherché avant de questionner l'utilisateur.", ...overrides };
}

// 3F.3.3-S2 : une revue "dernier recours" générique — les six alternatives déclarées non disponibles.
function lastResortReview(issueId) {
  return {
    issue_id: issueId,
    alternatives_reviewed: {
      research: { reasonably_available: false, reason: "Aucun fait externe vérifiable identifié." },
      decide: { reasonably_available: false, reason: "Aucune délégation explicite identifiée." },
      estimate: { reasonably_available: false, reason: "Aucune estimation raisonnable ne serait fiable ici." },
      scenario: { reasonably_available: false, reason: "Aucun scénario alternatif plausible identifié." },
      condition: { reasonably_available: false, reason: "Aucune condition explicite ne permettrait de différer la réponse." },
      leave_unknown: { reasonably_available: false, reason: "L'inconnue est bloquante pour la suite du travail." }
    },
    question_is_last_resort: true,
    available_alternative: null
  };
}

// --- Phase 10 : le prompt exige explicitement l'inspection de chaque issue question --------------

test("S1-1 : le prompt exige une lecture individuelle, issue par issue, de chaque recommended_treatment=\"question\"", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /parcourez individuellement chaque issue/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /une par une/i, "le prompt doit demander un examen un par un des alternatives, pas un jugement global.");
  assert.match(CRITIC_SYSTEM_PROMPT, /strictement individuelle, issue par issue/i);
});

test("S1-2 : le prompt restreint explicitement B-01B aux issues matérielles traitées par question", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /impact\s*!=\s*"material"/);
  assert.match(CRITIC_SYSTEM_PROMPT, /recommended_treatment\s*!=\s*"question"/);
  assert.match(CRITIC_SYSTEM_PROMPT, /B-01B ne s'applique qu'aux issues matérielles/);
});

test("S1-3 : les six alternatives non-question sont toutes explicitement nommées dans le mandat Critic", () => {
  for (const alternative of ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"]) {
    assert.match(CRITIC_SYSTEM_PROMPT, new RegExp(alternative), `${alternative} doit apparaître littéralement dans le prompt.`);
  }
  assert.deepEqual(
    TREATMENT_VALUES.filter((v) => v !== "question"),
    ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"],
    "la ladder non-question de référence (TREATMENT_VALUES) doit rester celle utilisée par le test ci-dessus."
  );
});

// --- Phase 4/10 : une question légitime reste explicitement possible -----------------------------

// 3F.3.3-X2-B : le LLM ne produit plus illegitimate_question_found — "n'ajoutez rien" devient
// "available_alternative et why_available valent tous deux null", dérivé mécaniquement ensuite.
test("S1-4 : le prompt autorise explicitement de ne rien signaler (valeurs null) quand aucune alternative n'est raisonnablement disponible", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /aucune alternative n'est raisonnablement disponible, available_alternative et why_available valent tous deux null/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /une question ainsi confirmée reste pleinement légitime/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /ne doit jamais être requalifié.{0,60}vers une disponibilité artificielle/i);
});

// --- Phase 5/10/12 : aucune règle quantitative --------------------------------------------------

test("S1-5 : le prompt interdit explicitement toute règle quantitative sur le nombre de questions", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /aucun maximum, aucune cible, aucun seuil/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'utilisez jamais le nombre de questions comme critère à lui seul/);
  // Propriété négative : aucune formulation numérique de seuil de questions ne doit exister nulle part.
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /max(imum)?\s*(de\s*)?\d+\s*questions?/i);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /une seule question/i);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /plus d'une question/i);
});

// 3F.3.3-X2-B : agreement n'est plus décidé par le LLM ("Décidez agreement en dernier" / point 8
// n'existe plus) — deriveCriticConsequences le calcule mécaniquement une fois la seconde lecture
// B-01B (et les autres jugements sémantiques) connus. S1-6/S1-7 vérifient désormais cette séquence
// au niveau de la dérivation elle-même : le calcul d'agreement dépend bien du résultat de la seconde
// lecture (illegitimate_question_found dérivé), jamais l'inverse.
test("S1-6 : le calcul dérivé d'agreement dépend du résultat de la seconde lecture B-01B (illegitimate_question_found dérivé), jamais l'inverse", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /SECONDE LECTURE OBLIGATOIRE/, "la section de seconde lecture doit exister.");
  const withAvailable = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: { issue1: { alternatives_reviewed: reviewWithAvailableAlternative("issue1", "estimate").alternatives_reviewed, available_alternative: "estimate", why_available: "x" } }
  });
  assert.equal(withAvailable.agreement, "disagree", "agreement doit refléter le résultat de la seconde lecture, jamais une valeur indépendante.");
});

test("S1-7 : agreement n'est plus une décision du LLM — il n'existe plus de texte de prompt lui demandant de le décider en dernier", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /Décidez agreement en dernier/i, "supersédé par X2-B : agreement est calculé, jamais décidé par le LLM.");
});

// --- Phase 12 : protection anti-forçage -----------------------------------------------------------

test("S1-8 : le prompt n'impose ni disagree systématique, ni disponibilité forcée, ni interdiction de questionner ; agree reste une conséquence dérivée légitime d'une revue propre", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /toujours\s+disagree/i);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /question(ner)?\s+(est\s+)?interdit/i);
  const allLegitimate = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: { issue1: { alternatives_reviewed: reviewWithAvailableAlternative("issue1", null).alternatives_reviewed, available_alternative: null, why_available: null } }
  });
  assert.equal(allLegitimate.agreement, "agree", "une revue entièrement légitime (six alternatives indisponibles) doit dériver agree, jamais forcé vers disagree.");
});

// --- Phase 6 : le format dérivé reste celui de C8 (why_available porte désormais la justification) --

test("S1-9 : la forme dérivée de illegitimate_question_found (issue_id, available_alternative, why_available) reste inchangée — désormais calculée, plus demandée au LLM", () => {
  assert.ok(!("illegitimate_question_found" in CRITIC_JSON_SCHEMA.properties), "X2-B : n'est plus dans le schéma envoyé au LLM.");
  const derived = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: { issue1: { alternatives_reviewed: reviewWithAvailableAlternative("issue1", "estimate").alternatives_reviewed, available_alternative: "estimate", why_available: "x" } }
  });
  assert.deepEqual(Object.keys(derived.illegitimate_question_found[0]).sort(), ["available_alternative", "issue_id", "why_available"]);
});

// --- Phase 11 : cas de contrat A à G (structurels, jamais un oracle sémantique dans le scorer) ---

test("S1-11A : une seule issue matérielle réellement non substituable, aucun signal, agree accepté sans critère tautologique", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({ agreement: "agree", question_substitution_review: [lastResortReview("ISSUE-1")], illegitimate_question_found: [] });
  const result = validateCriticOutput(output);
  assert.deepEqual(result.illegitimate_question_found, []);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "une revue complète et correcte, sans aucun signal B-01B, ne doit jamais échouer.");
  assert.ok(!score.criteria.some((c) => c.criterion.startsWith("illegitimate_question_")), "aucun critère illegitimate_question_found ne doit être ajouté quand ce tableau est vide.");
});

test("S1-11B : plusieurs issues matérielles réellement non substituables, aucun signal, agree accepté", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1"), materialQuestionIssue("ISSUE-2"), materialQuestionIssue("ISSUE-3")] };
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [lastResortReview("ISSUE-1"), lastResortReview("ISSUE-2"), lastResortReview("ISSUE-3")],
    illegitimate_question_found: []
  });
  const result = validateCriticOutput(output);
  assert.deepEqual(result.illegitimate_question_found, []);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "plusieurs questions légitimes ne doivent jamais, à elles seules, faire échouer le score.");
});

test("S1-11C : une issue avec research raisonnablement disponible peut légitimement produire un signal", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewWithAvailableAlternative("ISSUE-1", "research")],
    illegitimate_question_found: [illegitimateQuestionFinding({ issue_id: "ISSUE-1", available_alternative: "research" })]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.ok(score.criteria.every((c) => !c.criterion.startsWith("illegitimate_question_") || c.pass), "le signal research doit satisfaire tous les critères structurels B-01B.");
});

test("S1-11D : une issue avec decide raisonnablement disponible peut légitimement produire un signal", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewWithAvailableAlternative("ISSUE-1", "decide")],
    illegitimate_question_found: [illegitimateQuestionFinding({ issue_id: "ISSUE-1", available_alternative: "decide" })]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.ok(score.criteria.every((c) => !c.criterion.startsWith("illegitimate_question_") || c.pass));
});

test("S1-11E : une issue avec leave_unknown raisonnablement disponible peut légitimement produire un signal", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewWithAvailableAlternative("ISSUE-1", "leave_unknown")],
    illegitimate_question_found: [illegitimateQuestionFinding({ issue_id: "ISSUE-1", available_alternative: "leave_unknown" })]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.ok(score.criteria.every((c) => !c.criterion.startsWith("illegitimate_question_") || c.pass));
});

test("S1-11F : une issue non-material n'est jamais un terrain valide pour B-01B (référence rejetée structurellement)", () => {
  const analystOutput = { issues: [{ id: "ISSUE-1", type: "missing_information", description: "x", impact: "non_material", substitutable: false, recommended_treatment: "question", kind: null }] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewWithAvailableAlternative("ISSUE-1", "research")],
    illegitimate_question_found: [illegitimateQuestionFinding({ issue_id: "ISSUE-1", available_alternative: "research" })]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  // Le scorer C8 (inchangé par S1) ne vérifie structurellement que issue_id valide + recommended_treatment="question" ;
  // la restriction "impact=material" est une consigne du prompt, pas du scorer (S1 est prompt-only, Phase 14).
  // Ce test documente cette frontière explicitement plutôt que de la présumer.
  const treatmentCriterion = score.criteria.find((c) => c.criterion === "illegitimate_question_targets_question_treatment");
  assert.ok(treatmentCriterion, "le critère de correspondance de traitement doit être évalué.");
  assert.equal(treatmentCriterion.pass, true, "recommended_treatment=\"question\" reste satisfait ; le scorer ne juge jamais la matérialité (autorité du Critic LLM, jamais du scorer).");
});

test("S1-11G : une issue déjà traitée par estimate est hors périmètre B-01B (référence invalide détectée structurellement)", () => {
  const analystOutput = { issues: [{ id: "ISSUE-1", type: "missing_information", description: "x", impact: "material", substitutable: true, recommended_treatment: "estimate", kind: null }] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewWithAvailableAlternative("ISSUE-1", "research")],
    illegitimate_question_found: [illegitimateQuestionFinding({ issue_id: "ISSUE-1" })]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  const treatmentCriterion = score.criteria.find((c) => c.criterion === "illegitimate_question_targets_question_treatment");
  assert.equal(treatmentCriterion.pass, false, "une issue déjà traitée par estimate (jamais question) ne doit jamais être une cible valide pour illegitimate_question_found.");
});

// --- Non-régression : Analyst totalement hors périmètre de S1 -------------------------------------

test("S1 : createEmptyCandidate (Analyst) reste totalement inchangé par ce lot Critic-only", () => {
  assert.deepEqual(createEmptyCandidate(), {
    objective: "", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
    confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [],
    /* OPRIE-INPUT-AVAILABILITY-FIELD-01 : onzième champ, ajouté par un lot qui, lui, touche
       délibérément le candidat. La garde continue de figer la forme exacte — elle en a seulement
       une de plus à figer. Les dix historiques sont intacts, dans leur ordre. */
    available_inputs: []
  });
});
