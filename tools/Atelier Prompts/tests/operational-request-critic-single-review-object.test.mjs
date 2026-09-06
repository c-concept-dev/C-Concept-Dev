import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  validateCriticOutput,
  parseCriticOutput,
  deriveCriticConsequences
} from "../workers/shared/operational-request-core.js";

// 3F.3.3-G2 : G1 a fait comprendre à Groq que unsupported_additions_found / unsupported_removals_found
// / missed_material_issues appartiennent à operational_request_candidate_review, mais le smoke réel
// post-G1 (case-12-italie, critic seul) montre que Groq interprète encore ce conteneur comme une
// LISTE de reviews (un tableau de deux objets). Ce fichier prouve que le schéma/validateur rejettent
// cette forme (déjà le cas avant G2 — ni le schéma ni le validateur ne changent ici) et que le prompt
// exprime désormais sans ambiguïté la cardinalité "un seul objet". Aucune assertion ici ne porte sur
// B-01/B-02, sur l'Analyste, sur l'Arbitre ni sur le harnais H1.

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

// --- Phase 9 : review objet unique valide → accepté ----------------------------------------------

test("G2-1 : operational_request_candidate_review sous forme d'objet unique reste accepté (schéma/validateur inchangés)", () => {
  const result = validateCriticOutput(minimalCriticOutput());
  assert.deepEqual(result.operational_request_candidate_review, { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] });
});

// --- Phase 9 : review tableau vide → rejeté (déjà couvert en G1, reconfirmé ici) ------------------

test("G2-2 : operational_request_candidate_review: [] (tableau vide) reste rejeté", () => {
  const output = { ...minimalCriticOutput(), operational_request_candidate_review: [] };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 9 : review tableau d'un seul objet → rejeté --------------------------------------------

test("G2-3 : operational_request_candidate_review sous forme de tableau contenant un seul objet de review est rejeté", () => {
  const output = {
    ...minimalCriticOutput(),
    operational_request_candidate_review: [
      { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }
    ]
  };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 7/9 : reproduction exacte de la forme erronée post-G1 (tableau de deux objets) ---------

test("G2-4 : la forme exacte observée sur Groq post-G1 (tableau de deux objets de review) est rejetée", () => {
  const postG1FailedGeneration = {
    agreement: "disagree",
    operational_request_candidate_review: [
      {
        missed_material_issues: [],
        unsupported_additions_found: ["expected_deliverable", "assumptions_allowed", "remaining_unknowns"],
        unsupported_removals_found: []
      },
      {
        missed_material_issues: [],
        unsupported_additions_found: [],
        unsupported_removals_found: []
      }
    ],
    vetoes: [],
    semantic_drift_detected: true,
    semantic_drift_notes: ["..."],
    significant_stakes: true,
    significant_stakes_reason: "...",
    illegitimate_question_found: []
  };
  // Vérification structurelle (forme), pas un message textuel particulier : operational_request_candidate_review
  // doit être un objet, jamais un Array — quel que soit son nombre d'éléments.
  assert.ok(Array.isArray(postG1FailedGeneration.operational_request_candidate_review), "préconditions du test : la fixture reproduit bien un tableau.");
  assert.throws(() => validateCriticOutput(postG1FailedGeneration), TypeError);
  assert.throws(() => parseCriticOutput(JSON.stringify(postG1FailedGeneration)), TypeError);
});

// --- Phase 8 : le prompt interdit explicitement la forme array, sans ambiguïté -------------------

test("G2-5 : le prompt Critic déclare explicitement operational_request_candidate_review comme objet unique, jamais un tableau", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /operational_request_candidate_review/);
  // Propriétés structurelles plutôt qu'une phrase figée : la règle de cardinalité doit être présente
  // sous une formulation équivalente, sans dépendre d'un unique tour de phrase exact.
  assert.match(CRITIC_SYSTEM_PROMPT, /OBJET JSON UNIQUE|objet unique|un seul objet/i, "le prompt doit affirmer que le conteneur est un objet unique.");
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais un tableau/i, "le prompt doit interdire explicitement la forme tableau.");
  // Les deux formes invalides déjà observées empiriquement (tableau vide, tableau de plusieurs
  // objets) doivent toutes deux être explicitement nommées comme invalides.
  assert.match(CRITIC_SYSTEM_PROMPT, /INVALIDE\s*:\s*"operational_request_candidate_review":\s*\[\]/);
  assert.match(CRITIC_SYSTEM_PROMPT, /INVALIDE\s*:\s*"operational_request_candidate_review":\s*\[\{\.\.\.\},\s*\{\.\.\.\}\]/);
});

test("G2-6 : le prompt fournit un squelette JSON minimal montrant operational_request_candidate_review comme objet, sans dupliquer tout le schéma", () => {
  // Le squelette doit montrer les trois sous-champs à l'intérieur d'un unique objet operational_request_candidate_review...
  const skeletonMatch = CRITIC_SYSTEM_PROMPT.match(/\{\s*"operational_request_candidate_review":\s*\{[\s\S]*?\}\s*\}/);
  assert.ok(skeletonMatch, "un squelette JSON minimal doit être présent dans le prompt.");
  const skeleton = skeletonMatch[0];
  for (const field of ["unsupported_additions_found", "unsupported_removals_found", "missed_material_issues"]) {
    assert.match(skeleton, new RegExp(field), `${field} doit apparaître dans le squelette.`);
  }
  // ...et ne doit jamais dupliquer l'intégralité du contrat (agreement, vetoes, illegitimate_question_found
  // n'ont pas leur place dans ce squelette minimal, qui ne sert qu'à lever l'ambiguïté objet-vs-tableau).
  for (const field of ["agreement", "vetoes", "illegitimate_question_found", "semantic_drift_detected"]) {
    assert.doesNotMatch(skeleton, new RegExp(field), `${field} ne doit pas apparaître dans le squelette minimal (pas une duplication du schéma).`);
  }
});

// --- Phase 10 : le prompt ne demande jamais plusieurs objets de review, la pluralité restant interne -

test("G2-7 : le prompt précise que la pluralité s'exprime dans les tableaux internes, jamais en répétant l'objet de review", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais (répété|dupliqué|mis en liste)/i);
});

// --- Phase 5/10 : illegitimate_question_found strictement intact (racine, tableau, contrat C8) ---

// 3F.3.3-X2-B : illegitimate_question_found n'est plus une propriété du schéma LLM (dérivé) —
// deriveCriticConsequences le reconstruit à la racine de la sortie normalisée, forme C8 inchangée.
test("G2-8 : illegitimate_question_found n'est plus dans le schéma LLM (dérivé) ; la sortie normalisée le reconstruit à la racine, forme C8 inchangée", () => {
  assert.ok(!("illegitimate_question_found" in CRITIC_JSON_SCHEMA.properties), "n'est plus une propriété du schéma envoyé au LLM.");
  const derived = deriveCriticConsequences({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: { issue1: { alternatives_reviewed: Object.fromEntries(["research", "decide", "estimate", "scenario", "condition", "leave_unknown"].map((a) => [a, { reasonably_available: a === "estimate", reason: "x" }])), available_alternative: "estimate", why_available: "y" } }
  });
  assert.ok(Array.isArray(derived.illegitimate_question_found), "illegitimate_question_found doit rester un tableau à la racine de la sortie normalisée.");
  assert.equal(derived.operational_request_candidate_review.illegitimate_question_found, undefined, "jamais une propriété de operational_request_candidate_review.");
  assert.deepEqual(Object.keys(derived.illegitimate_question_found[0]).sort(), ["available_alternative", "issue_id", "why_available"]);
});

// --- Phase 10 : schéma Critic strictement inchangé par G2 -----------------------------------------

test("G2-9 : CRITIC_JSON_SCHEMA reste structurellement identique à G1 (G2 est prompt-only)", () => {
  assert.equal(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.type, "object");
  assert.deepEqual(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.required, [
    "unsupported_additions_found", "unsupported_removals_found", "missed_material_issues"
  ]);
  assert.equal(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.additionalProperties, false);
});

// --- Non-régression Analyst : totalement hors périmètre de G2 -------------------------------------

test("G2 : createEmptyCandidate (Analyst) reste totalement inchangé par ce lot Critic-only", () => {
  assert.deepEqual(createEmptyCandidate(), {
    objective: "", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
    confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [],
    /* OPRIE-INPUT-AVAILABILITY-FIELD-01 : onzième champ, ajouté par un lot qui, lui, touche
       délibérément le candidat. La garde continue de figer la forme exacte — elle en a seulement
       une de plus à figer. Les dix historiques sont intacts, dans leur ordre. */
    available_inputs: []
  });
});
