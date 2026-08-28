import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  TREATMENT_VALUES,
  CONFIRMATION_TRIGGERS,
  ARBITER_STATES,
  makeAnalystUserMessage,
  makeCriticUserMessage,
  makeArbiterUserMessage,
  validateAnalystOutput,
  validateCriticOutput,
  validateArbiterOutput,
  filterQualifiedVetoes,
  isConfirmationRecommended,
  createDegradedRoleResult,
  validateDegradedRoleResult,
  parseAnalystOutput,
  parseCriticOutput,
  parseArbiterOutput,
  ANALYST_JSON_SCHEMA,
  CRITIC_JSON_SCHEMA,
  ARBITER_JSON_SCHEMA
} from "../workers/shared/operational-request-core.js";

function emptyConfirmationSignals() {
  return {
    multiple_ambiguities_resolved: false,
    complex_conflict_arbitrated: false,
    strong_restructuring: false,
    multiple_objectives_hierarchized: false,
    significant_delegation: false
  };
}

function minimalAnalystOutput(overrides = {}) {
  return {
    operational_request_candidate: createEmptyCandidate(),
    provenance_records: [],
    issues: [],
    question_candidates: [],
    confirmation_signals: emptyConfirmationSignals(),
    ...overrides
  };
}

function minimalCriticOutput(overrides = {}) {
  return {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    ...overrides
  };
}

function readyArbiterOutput(overrides = {}) {
  return {
    state: "operational_request_ready",
    operational_request_candidate: createEmptyCandidate(),
    issues: [],
    next_question: null,
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Aucune ambiguïté ou contradiction matérielle ne subsiste.",
    ...overrides
  };
}

// --- Schémas déclaratifs -----------------------------------------------------

test("les 3 schémas déclaratifs sont bien formés et distincts", () => {
  for (const schema of [ANALYST_JSON_SCHEMA, CRITIC_JSON_SCHEMA, ARBITER_JSON_SCHEMA]) {
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
  }
  assert.notDeepEqual(Object.keys(ANALYST_JSON_SCHEMA.properties), Object.keys(CRITIC_JSON_SCHEMA.properties));
  assert.notDeepEqual(Object.keys(CRITIC_JSON_SCHEMA.properties), Object.keys(ARBITER_JSON_SCHEMA.properties));
  assert.notDeepEqual(Object.keys(ANALYST_JSON_SCHEMA.properties), Object.keys(ARBITER_JSON_SCHEMA.properties));
});

// --- Analyste -----------------------------------------------------------------

test("validateAnalystOutput accepte une sortie minimale, entièrement vide (anti-questionnaire)", () => {
  const result = validateAnalystOutput(minimalAnalystOutput());
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.question_candidates, []);
  assert.equal(result.operational_request_candidate.objective, "");
});

test("validateAnalystOutput rejette une propriété inattendue au premier niveau", () => {
  assert.throws(() => validateAnalystOutput({ ...minimalAnalystOutput(), extra_champ_metier: true }), TypeError);
});

test("validateAnalystOutput exige un recommended_treatment tiré du vocabulaire universel", () => {
  const badTreatment = minimalAnalystOutput({
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Destination non précisée.", impact: "material", substitutable: false, recommended_treatment: "demander_a_l_utilisateur" }]
  });
  assert.throws(() => validateAnalystOutput(badTreatment), TypeError);

  const goodTreatment = minimalAnalystOutput({
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Destination non précisée.", impact: "material", substitutable: false, recommended_treatment: "question" }]
  });
  assert.equal(validateAnalystOutput(goodTreatment).issues[0].recommended_treatment, "question");
});

test("validateAnalystOutput rejette une question candidate ciblant un issue_id inconnu", () => {
  const output = minimalAnalystOutput({
    question_candidates: [{ text: "Quelle durée ?", targets_issue_id: "ISSUE-999", expected_progress: "Fixe la durée du séjour." }]
  });
  assert.throws(() => validateAnalystOutput(output), TypeError);
});

test("validateAnalystOutput valide une question candidate reliée à une issue déclarée", () => {
  const output = minimalAnalystOutput({
    issues: [{ id: "ISSUE-001", type: "missing_information", description: "Durée non précisée.", impact: "material", substitutable: false, recommended_treatment: "question" }],
    question_candidates: [{ text: "Quelle durée ?", targets_issue_id: "ISSUE-001", expected_progress: "Fixe la durée du séjour." }]
  });
  const result = validateAnalystOutput(output);
  assert.equal(result.question_candidates.length, 1);
});

test("validateAnalystOutput délègue la validation de provenance_records au module d'état partagé", () => {
  const output = minimalAnalystOutput({
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Préparer un voyage en Italie." },
    provenance_records: [{ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" }]
  });
  assert.equal(validateAnalystOutput(output).provenance_records.length, 1);
  const badProvenance = minimalAnalystOutput({ provenance_records: [{ field: "champ_inconnu", value: "x", provenance: "explicit_user_statement" }] });
  assert.throws(() => validateAnalystOutput(badProvenance), TypeError);
});

// --- Critique -------------------------------------------------------------------

test("validateCriticOutput accepte agree sans avoir dû inventer d'objection (contrainte #12)", () => {
  const result = validateCriticOutput(minimalCriticOutput());
  assert.equal(result.agreement, "agree");
  assert.deepEqual(result.vetoes, []);
  assert.equal(result.semantic_drift_detected, false);
});

test("validateCriticOutput rejette agree accompagné d'un veto (incohérence)", () => {
  const output = minimalCriticOutput({
    agreement: "agree",
    vetoes: [{ issue_id: "ISSUE-001", new_information_trigger: "x", why_material: "x", why_not_substitutable: "x" }]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("validateCriticOutput rejette disagree sans veto ni dérive détectée (aucun désaccord gratuit)", () => {
  assert.throws(() => validateCriticOutput(minimalCriticOutput({ agreement: "disagree" })), TypeError);
});

test("validateCriticOutput accepte un veto qualifié complet et rejette un veto incomplet", () => {
  const qualified = minimalCriticOutput({
    agreement: "disagree",
    vetoes: [{ issue_id: "ISSUE-001", new_information_trigger: "Nouvelle contrainte révélée au tour 3.", why_material: "Change le périmètre.", why_not_substitutable: "Appartient à l'utilisateur." }]
  });
  assert.equal(validateCriticOutput(qualified).vetoes.length, 1);

  const incomplete = minimalCriticOutput({
    agreement: "disagree",
    vetoes: [{ issue_id: "ISSUE-001", new_information_trigger: "x", why_material: "x", why_not_substitutable: "" }]
  });
  assert.throws(() => validateCriticOutput(incomplete), TypeError);
});

test("validateCriticOutput exige une note explicative dès que semantic_drift_detected=true (anti-glissement)", () => {
  const withoutNote = minimalCriticOutput({ agreement: "disagree", semantic_drift_detected: true, semantic_drift_notes: [] });
  assert.throws(() => validateCriticOutput(withoutNote), TypeError);

  const withNote = minimalCriticOutput({ agreement: "disagree", semantic_drift_detected: true, semantic_drift_notes: ["L'objectif a été restreint sans justification."] });
  assert.equal(validateCriticOutput(withNote).semantic_drift_notes.length, 1);
});

test("filterQualifiedVetoes distingue un veto réellement nouveau d'un veto redondant", () => {
  const previous = [{ issue_id: "ISSUE-001", new_information_trigger: "Contrainte révélée au tour 2." }];
  const { qualified, redundant } = filterQualifiedVetoes([
    { issue_id: "ISSUE-001", new_information_trigger: "Contrainte révélée au tour 2.", why_material: "x", why_not_substitutable: "x" },
    { issue_id: "ISSUE-002", new_information_trigger: "Nouvelle contradiction révélée au tour 4.", why_material: "x", why_not_substitutable: "x" }
  ], previous);
  assert.equal(redundant.length, 1);
  assert.equal(qualified.length, 1);
  assert.equal(qualified[0].issue_id, "ISSUE-002");
});

// --- Arbitre (conditionnel) ------------------------------------------------------

test("validateArbiterOutput accepte operational_request_ready seulement avec un intent_preservation entièrement positif", () => {
  assert.equal(validateArbiterOutput(readyArbiterOutput()).state, "operational_request_ready");

  const partial = readyArbiterOutput({ intent_preservation: { objective_preserved: true, priorities_preserved: false, semantic_equivalence: true, concerns: [] } });
  assert.throws(() => validateArbiterOutput(partial), TypeError);

  const withConcerns = readyArbiterOutput({ intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: ["résiduel"] } });
  assert.throws(() => validateArbiterOutput(withConcerns), TypeError);
});

test("validateArbiterOutput exige next_question uniquement pour clarification_required", () => {
  const missingQuestion = readyArbiterOutput({ state: "clarification_required", next_question: null, reason: "x" });
  assert.throws(() => validateArbiterOutput(missingQuestion), TypeError);

  const withQuestion = readyArbiterOutput({
    state: "clarification_required",
    next_question: { text: "Quel budget ?", targets_issue_id: "ISSUE-001", expected_progress: "Fixe le budget." },
    reason: "Le budget change matériellement les options possibles."
  });
  assert.equal(validateArbiterOutput(withQuestion).state, "clarification_required");
});

test("validateArbiterOutput exige confirmation_reason uniquement pour confirmation_required", () => {
  const missing = readyArbiterOutput({ state: "confirmation_required", confirmation_reason: null, reason: "x" });
  assert.throws(() => validateArbiterOutput(missing), TypeError);

  const withReason = readyArbiterOutput({ state: "confirmation_required", confirmation_reason: "Restructuration forte d'une demande désordonnée.", reason: "x" });
  assert.equal(validateArbiterOutput(withReason).state, "confirmation_required");
});

test("validateArbiterOutput exige blocked_reason uniquement pour blocked", () => {
  const missing = readyArbiterOutput({ state: "blocked", blocked_reason: null, reason: "x" });
  assert.throws(() => validateArbiterOutput(missing), TypeError);

  const withReason = readyArbiterOutput({ state: "blocked", blocked_reason: "Aucune stratégie substitutive honnête ne reste disponible.", reason: "x" });
  assert.equal(validateArbiterOutput(withReason).state, "blocked");
});

test("validateArbiterOutput rejette toute tentative de degraded_state auto-déclaré par le modèle", () => {
  assert.equal(ARBITER_STATES.includes("degraded_state"), false);
  assert.throws(() => validateArbiterOutput(readyArbiterOutput({ state: "degraded_state" })), TypeError);
});

test("createDegradedRoleResult / validateDegradedRoleResult expriment la dégradation hors du contrat LLM", () => {
  const result = createDegradedRoleResult("arbiter", "Workers AI et Groq indisponibles pour ce rôle.");
  assert.equal(result.state, "degraded_state");
  assert.equal(validateDegradedRoleResult(result).role, "arbiter");
  assert.throws(() => createDegradedRoleResult("orchestrateur", "x"), TypeError);
  assert.throws(() => createDegradedRoleResult("arbiter", ""), TypeError);
});

// --- Confirmation adaptative (déterministe, sans LLM) -----------------------------

test("isConfirmationRecommended n'exige rien quand aucun déclencheur n'est actif", () => {
  const result = isConfirmationRecommended({ confirmation_signals: emptyConfirmationSignals(), significant_stakes: false });
  assert.equal(result.recommended, false);
  assert.deepEqual(result.triggers, []);
});

test("isConfirmationRecommended détecte un déclencheur analyste et un déclencheur critique", () => {
  const fromAnalyst = isConfirmationRecommended({ confirmation_signals: { ...emptyConfirmationSignals(), strong_restructuring: true }, significant_stakes: false });
  assert.equal(fromAnalyst.recommended, true);
  assert.deepEqual(fromAnalyst.triggers, ["strong_restructuring"]);

  const fromCritic = isConfirmationRecommended({ confirmation_signals: emptyConfirmationSignals(), significant_stakes: true });
  assert.equal(fromCritic.recommended, true);
  assert.deepEqual(fromCritic.triggers, ["significant_stakes"]);
});

test("CONFIRMATION_TRIGGERS couvre les cinq signaux analyste plus significant_stakes", () => {
  assert.equal(CONFIRMATION_TRIGGERS.length, 6);
  assert.ok(CONFIRMATION_TRIGGERS.includes("significant_stakes"));
});

// --- Messages et parsing ------------------------------------------------------------

test("les constructeurs de message produisent un JSON exploitable avec les clés attendues", () => {
  const analystMessage = JSON.parse(makeAnalystUserMessage({ original_request: "Préparer un voyage.", clarification_history: [] }));
  assert.deepEqual(Object.keys(analystMessage).sort(), ["clarification_history", "original_request"]);

  const criticMessage = JSON.parse(makeCriticUserMessage({ original_request: "x", analyst_output: minimalAnalystOutput(), previous_vetoes: [] }));
  assert.deepEqual(Object.keys(criticMessage).sort(), ["analyst_output", "clarification_history", "original_request", "previous_vetoes"]);

  const arbiterMessage = JSON.parse(makeArbiterUserMessage({ original_request: "x", analyst_output: minimalAnalystOutput(), critic_output: minimalCriticOutput() }));
  assert.deepEqual(Object.keys(arbiterMessage).sort(), ["analyst_output", "clarification_history", "critic_output", "original_request"]);
});

test("parseAnalystOutput / parseCriticOutput / parseArbiterOutput acceptent une réponse encadrée de balises de code", () => {
  const fenced = "```json\n" + JSON.stringify(minimalAnalystOutput()) + "\n```";
  assert.deepEqual(parseAnalystOutput(fenced).issues, []);
  assert.equal(parseCriticOutput(JSON.stringify(minimalCriticOutput())).agreement, "agree");
  assert.equal(parseArbiterOutput(JSON.stringify(readyArbiterOutput())).state, "operational_request_ready");
});

test("TREATMENT_VALUES couvre exactement les 7 stratégies universelles, question en dernier recours", () => {
  assert.deepEqual([...TREATMENT_VALUES], ["research", "decide", "estimate", "scenario", "condition", "leave_unknown", "question"]);
});
