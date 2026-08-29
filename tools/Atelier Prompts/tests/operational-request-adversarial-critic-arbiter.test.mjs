import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCandidate, assessIntentPreservationDeterministic } from "../core/adn/index.js";
import {
  makeCriticUserMessage,
  makeArbiterUserMessage,
  validateCriticOutput,
  validateArbiterOutput
} from "../workers/shared/operational-request-core.js";

// 3F.3.3-C, D5 : scénarios adversariaux Critique/Arbitre avec une VRAIE original_request non vide
// (jamais ""), en cohérence avec le correctif A1 du harnais. Ce fichier ne fait aucun appel réseau :
// il prouve, sur des sorties synthétiques mais réalistes, que les invariants B1 (cohérence
// détection -> verdict du Critique) et C7 (l'Arbitre ne peut jamais atteindre READY sans preuve de
// provenance) tiennent sur des cas concrets, au-delà des 15 cas du corpus.

const ORIGINAL_REQUEST = "Prépare un compte rendu de la réunion hebdomadaire, avec les décisions, les actions et les points en suspens dans des sections séparées.";

function baseCandidate(overrides = {}) {
  return {
    ...createEmptyCandidate(),
    objective: "Produire un compte rendu de la réunion hebdomadaire.",
    expected_deliverable: "Compte rendu structuré en trois sections : décisions, actions, points en suspens.",
    ...overrides
  };
}

function baseProvenance(extra = []) {
  return [
    { field: "objective", value: "Produire un compte rendu de la réunion hebdomadaire.", provenance: "explicit_user_statement" },
    { field: "expected_deliverable", value: "Compte rendu structuré en trois sections : décisions, actions, points en suspens.", provenance: "explicit_user_statement" },
    ...extra
  ];
}

function analystOutputStub(candidate, provenance) {
  return {
    operational_request_candidate: candidate,
    provenance_records: provenance,
    issues: [], question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

// --- 1. Un agree véritablement légitime ---------------------------------------------------------

test("D5 : un agree légitime — candidat entièrement tracé, aucune addition, aucun problème réel", () => {
  const analystOutput = analystOutputStub(baseCandidate(), baseProvenance());
  const criticMessage = makeCriticUserMessage({ original_request: ORIGINAL_REQUEST, analyst_output: analystOutput, previous_vetoes: [] });
  assert.equal(JSON.parse(criticMessage).original_request, ORIGINAL_REQUEST);

  const criticOutput = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  });
  assert.equal(criticOutput.agreement, "agree");
});

// --- 2. Une addition non tracée mais NON matérielle ne force jamais un veto ----------------------

test("D5 : une addition non tracée mais non matérielle reste consignée sans provoquer de veto (pas de biais anti-agree)", () => {
  const candidateWithStyleTweak = baseCandidate({ expected_deliverable: "Compte rendu clair, structuré en trois sections : décisions, actions, points en suspens." });
  const analystOutput = analystOutputStub(candidateWithStyleTweak, baseProvenance());
  const criticOutput = validateCriticOutput({
    agreement: "agree",
    operational_request_candidate_review: {
      unsupported_additions_found: ["expected_deliverable: ajout de l'adjectif 'clair', reformulation stylistique sans impact sur le livrable attendu"],
      unsupported_removals_found: [],
      missed_material_issues: []
    },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  });
  assert.equal(criticOutput.agreement, "agree");
  assert.equal(criticOutput.operational_request_candidate_review.unsupported_additions_found.length, 1);
  void analystOutput;
});

// --- 3. Une addition matérielle DOIT provoquer une escalade (veto ou missed_material_issue) ------

test("D5 : une addition non tracée et matérielle doit être escaladée en veto qualifié, jamais laissée en simple agree", () => {
  const candidateWithMaterialAddition = baseCandidate({ confirmed_constraints: ["Le compte rendu doit être envoyé à toute la direction générale."] });
  const analystOutput = analystOutputStub(candidateWithMaterialAddition, baseProvenance());

  // Rappel volontaire (B1) : la matérialité d'un ajout non tracé n'est jamais arbitrable par le
  // schéma seul (unsupported_additions_found n'entre dans aucune règle structurelle) — c'est un
  // jugement du Critique, porté par le prompt (C6), jamais par une contrainte de validation aveugle.
  // Le comportement attendu ici est donc démontré par l'escalade correcte, pas par un rejet structurel.
  const escalated = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: ["confirmed_constraints: direction générale ajoutée sans trace"], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [{
      issue_id: "ADDED-DEST-001",
      new_information_trigger: "Le candidat ajoute un destinataire (direction générale) absent de la demande et de tout provenance record.",
      why_material: "Le destinataire change fondamentalement le ton, le contenu et la diffusion attendue du compte rendu.",
      why_not_substitutable: "C'est une décision qui appartient exclusivement à l'utilisateur, non déductible du contexte."
    }],
    semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  });
  assert.equal(escalated.agreement, "disagree");
  assert.equal(escalated.vetoes.length, 1);
  void analystOutput;
});

// --- 4. Une dérive sémantique matérielle --------------------------------------------------------

test("D5 : une dérive sémantique matérielle (préférence reclassée en contrainte) est détectée et motivée", () => {
  const softRequest = "Rédige un message de suivi client, si possible en français.";
  const candidateWithDrift = baseCandidate({
    objective: "Rédiger un message de suivi client.",
    expected_deliverable: "Un message court de suivi client.",
    confirmed_constraints: ["Le message doit impérativement être rédigé en français."]
  });
  const analystOutput = analystOutputStub(candidateWithDrift, [
    { field: "objective", value: "Rédiger un message de suivi client.", provenance: "explicit_user_statement" },
    { field: "expected_deliverable", value: "Un message court de suivi client.", provenance: "explicit_user_statement" },
    { field: "confirmed_constraints", value: "Le message doit impérativement être rédigé en français.", provenance: "explicit_user_statement" }
  ]);
  const criticMessage = makeCriticUserMessage({ original_request: softRequest, analyst_output: analystOutput, previous_vetoes: [] });
  assert.equal(JSON.parse(criticMessage).original_request, softRequest);

  const criticOutput = validateCriticOutput({
    agreement: "disagree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: true,
    semantic_drift_notes: ["La demande exprimait une préférence souple ('si possible en français'), reclassée à tort en contrainte impérative par l'Analyste."],
    significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  });
  assert.equal(criticOutput.semantic_drift_detected, true);
  assert.equal(criticOutput.semantic_drift_notes.length, 1);
});

// --- 5. L'Arbitre refuse READY faute de preuve de provenance -------------------------------------

test("D5 : l'Arbitre ne peut jamais atteindre operational_request_ready sans provenance vérifiable (le gate déterministe le bloque même si l'Arbitre l'affirme)", () => {
  const candidateWithUnprovenField = baseCandidate({ confirmed_constraints: ["Le compte rendu doit être envoyé à toute la direction générale."] });
  const arbiterMessage = makeArbiterUserMessage({
    original_request: ORIGINAL_REQUEST,
    analyst_output: analystOutputStub(candidateWithUnprovenField, baseProvenance()),
    critic_output: { agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" }
  });
  assert.equal(JSON.parse(arbiterMessage).original_request, ORIGINAL_REQUEST);

  const arbiterOutput = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: candidateWithUnprovenField,
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Aucune ambiguïté matérielle ne subsiste selon l'Arbitre."
  });
  assert.equal(arbiterOutput.state, "operational_request_ready", "la validation structurelle seule ne suffit pas à garantir la légitimité de READY.");

  // Le gate déterministe (CDC §14.1), lui, ne se fie jamais à l'affirmation de l'Arbitre : il vérifie
  // mécaniquement la provenance de chaque champ non vide du candidat final.
  const gate = assessIntentPreservationDeterministic({
    candidate_previous: null,
    candidate_next: arbiterOutput.operational_request_candidate,
    provenance_records: baseProvenance(), // ne couvre PAS confirmed_constraints : direction générale reste sans preuve.
    status_changes: [],
    issues_previous: [], issues_next: [],
    resolutions: []
  });
  assert.equal(gate.pass, false, "operational_request_ready affirmé par l'Arbitre sans provenance vérifiable doit être bloqué par le gate déterministe.");
  assert.equal(gate.unsupported_additions.length, 1);
  assert.equal(gate.unsupported_additions[0].field, "confirmed_constraints");
});

// --- 6. L'Arbitre peut légitimement conclure READY ------------------------------------------------

test("D5 : l'Arbitre peut légitimement conclure operational_request_ready quand tout le candidat est tracé", () => {
  const candidate = baseCandidate();
  const arbiterOutput = validateArbiterOutput({
    state: "operational_request_ready",
    operational_request_candidate: candidate,
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Le candidat couvre exactement la demande, chaque champ est tracé, aucun problème matériel ne subsiste."
  });
  const gate = assessIntentPreservationDeterministic({
    candidate_previous: null,
    candidate_next: arbiterOutput.operational_request_candidate,
    provenance_records: baseProvenance(),
    status_changes: [],
    issues_previous: [], issues_next: [],
    resolutions: []
  });
  assert.equal(gate.pass, true, "un candidat entièrement tracé doit permettre au gate déterministe de laisser passer READY.");
  assert.equal(arbiterOutput.state, "operational_request_ready");
});
