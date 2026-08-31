import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  CRITIC_OUTPUT_FIELDS,
  validateCriticOutput,
  parseCriticOutput
} from "../workers/shared/operational-request-core.js";

// 3F.3.3-G1 : ce fichier prouve que le contrat Critic (prompt, schéma, validateur) est cohérent et
// que le schéma/validateur rejettent explicitement toute forme aplatie ou déplacée — en particulier
// la forme réellement produite par Groq en HTTP 400 (json_validate_failed) après 3F.3.3-C8, où
// operational_request_candidate_review était un tableau vide et unsupported_additions_found /
// unsupported_removals_found étaient hissés à la racine. Aucune assertion ici ne porte sur B-01/B-02
// ni sur une sémantique métier nouvelle : G1 ne change ni le schéma ni le validateur, seulement le
// prompt qui les décrit.

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

function illegitimateQuestionFinding(overrides = {}) {
  return { issue_id: "ISSUE-1", available_alternative: "research", why_available: "Un fait externe vérifiable aurait pu être recherché avant de questionner l'utilisateur.", ...overrides };
}

// 3F.3.3-S2 : validateCriticOutput exige désormais une cohérence bidirectionnelle entre
// question_substitution_review et illegitimate_question_found (même issue_id, même
// available_alternative) — cette fabrique construit toujours la revue correspondante.
function reviewForAvailableAlternative(issueId, alternative) {
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

// --- 1/6. Critic valide avec review objet, illegitimate_question_found vide → accepté -----------

test("G1-1 : une sortie Critic valide (operational_request_candidate_review objet, illegitimate_question_found vide) est acceptée", () => {
  const result = validateCriticOutput(minimalCriticOutput());
  assert.equal(result.agreement, "agree");
  assert.deepEqual(result.operational_request_candidate_review, { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] });
  assert.deepEqual(result.illegitimate_question_found, []);
});

// --- 2. operational_request_candidate_review: [] → rejeté ---------------------------------------

test("G1-2 : operational_request_candidate_review sous forme de tableau (au lieu d'objet) est rejeté", () => {
  const output = { ...minimalCriticOutput(), operational_request_candidate_review: [] };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- 3/4/5. Champs de review au mauvais niveau (racine au lieu du conteneur) → rejeté ------------

test("G1-3 : unsupported_additions_found hissé à la racine (hors operational_request_candidate_review) est rejeté", () => {
  const output = {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_removals_found: [], missed_material_issues: [] },
    unsupported_additions_found: [],
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("G1-4 : unsupported_removals_found hissé à la racine (hors operational_request_candidate_review) est rejeté", () => {
  const output = {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], missed_material_issues: [] },
    unsupported_removals_found: [],
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("G1-5 : illegitimate_question_found déplacé dans operational_request_candidate_review (au lieu de la racine) est rejeté", () => {
  const output = {
    agreement: "agree",
    operational_request_candidate_review: {
      unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [],
      illegitimate_question_found: []
    },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
  };
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- 7/8. illegitimate_question_found non vide : cohérence avec agreement (contrat C8 inchangé) --

test("G1-7 : structure C8 correcte avec illegitimate_question_found non vide et agreement=\"disagree\" est acceptée", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [reviewForAvailableAlternative("ISSUE-1", "research")],
    illegitimate_question_found: [illegitimateQuestionFinding()]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  assert.equal(result.agreement, "disagree");
});

test("G1-8 : illegitimate_question_found non vide avec agreement=\"agree\" reste rejeté (contrat C8 inchangé par G1)", () => {
  const output = minimalCriticOutput({ agreement: "agree", illegitimate_question_found: [illegitimateQuestionFinding()] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- 9. Reproduction exacte de la forme produite par Groq (failed_generation du smoke) -----------

test("G1-9 : la forme exacte de failed_generation observée sur Groq (case-12-italie, post-H1) est invalide", () => {
  const failedGeneration = {
    agreement: "agree",
    operational_request_candidate_review: [],
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: true,
    significant_stakes_reason: "Une erreur dans la préparation d'un voyage peut entraîner des coûts financiers, des désagréments logistiques et un impact sur l'expérience du voyageur.",
    unsupported_additions_found: [],
    unsupported_removals_found: [],
    illegitimate_question_found: []
  };
  assert.throws(() => validateCriticOutput(failedGeneration), TypeError);
  assert.throws(() => parseCriticOutput(JSON.stringify(failedGeneration)), TypeError);
});

// --- 10. Le prompt Critic décrit la structure attendue sans ambiguïté ----------------------------

test("G1-10 : le prompt Critic nomme explicitement le conteneur operational_request_candidate_review pour ses trois sous-champs", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /operational_request_candidate_review/, "le nom du conteneur doit apparaître littéralement dans le prompt (absent avant G1).");
  assert.match(CRITIC_SYSTEM_PROMPT, /unsupported_removals_found/, "unsupported_removals_found doit être expliqué au moins une fois (absent avant G1).");
  // Propriété structurelle plutôt qu'une phrase figée : les trois noms de sous-champs et le nom du
  // conteneur doivent tous apparaître dans le même paragraphe MISSION (point 1), preuve qu'ils sont
  // présentés comme un groupe et non comme des champs racine indépendants.
  const missionPoint1 = CRITIC_SYSTEM_PROMPT.split("\n").find((line) => line.startsWith("1. "));
  assert.ok(missionPoint1, "le point 1 de MISSION doit exister.");
  for (const field of ["operational_request_candidate_review", "unsupported_additions_found", "unsupported_removals_found"]) {
    assert.match(missionPoint1, new RegExp(field), `${field} doit être mentionné dans le même paragraphe que le conteneur.`);
  }
  // illegitimate_question_found reste décrit séparément (point 8, racine du schéma) : il ne doit
  // jamais apparaître dans ce même paragraphe de conteneur, sous peine de réintroduire l'ambiguïté
  // inverse (le faire percevoir comme membre de operational_request_candidate_review).
  assert.doesNotMatch(missionPoint1, /illegitimate_question_found/);
});

test("G1 : le schéma JSON strict Critic reste cohérent avec le validateur (G1 ne touche ni l'un ni l'autre)", () => {
  assert.deepEqual(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.required, [
    "unsupported_additions_found", "unsupported_removals_found", "missed_material_issues"
  ]);
  assert.equal(CRITIC_JSON_SCHEMA.properties.operational_request_candidate_review.type, "object");
  const result = validateCriticOutput(minimalCriticOutput());
  // 3F.3.3-X2-A : CRITIC_JSON_SCHEMA est désormais la forme N=0 (question_substitution_review omis
  // structurellement, cf. buildCriticJsonSchema) — la sortie normalisée de validateCriticOutput,
  // elle, porte toujours les 9 mêmes clés (CRITIC_OUTPUT_FIELDS), y compris
  // question_substitution_review=[] par défaut. Comparaison contre la vraie référence applicative,
  // jamais contre un artefact de schéma qui varie désormais avec N.
  assert.deepEqual(Object.keys(result).sort(), [...CRITIC_OUTPUT_FIELDS].sort());
});

// --- Non-régression Analyst : aucune trace de ce correctif ne doit apparaître côté Analyste -------

test("G1 : createEmptyCandidate (Analyst) reste totalement inchangé par ce lot Critic-only", () => {
  assert.deepEqual(createEmptyCandidate(), {
    objective: "", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
    confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: []
  });
});
