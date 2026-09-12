import test from "node:test";
import assert from "node:assert/strict";

import {
  OPERATIONAL_REQUEST_STATES,
  PROVENANCE_VALUES,
  createOriginalRequestRecord,
  validateOriginalRequestRecord,
  appendClarificationTurn,
  assertSameOriginalRequest,
  createEmptyCandidate,
  normalizeCandidate,
  validateIssue,
  normalizeIssues,
  validateProvenanceRecord,
  normalizeProvenanceRecords,
  validateStatusChange,
  validateResolution,
  isLegalTransition
} from "../core/adn/index.js";

test("createOriginalRequestRecord fige la demande originale et refuse une valeur vide", () => {
  const record = createOriginalRequestRecord("  Organiser un séjour en Italie.  ");
  assert.equal(record.original_request, "Organiser un séjour en Italie.");
  assert.deepEqual(record.clarification_history, []);
  assert.ok(Object.isFrozen(record));
  assert.throws(() => createOriginalRequestRecord(""), TypeError);
  assert.throws(() => createOriginalRequestRecord("   "), TypeError);
});

test("appendClarificationTurn ajoute un tour sans jamais réécrire original_request", () => {
  const record = createOriginalRequestRecord("Préparer un voyage.");
  const turn1 = appendClarificationTurn(record, { question: "Quelle durée ?", answer: "Dix jours." });
  assert.equal(turn1.original_request, record.original_request);
  assert.equal(turn1.clarification_history.length, 1);
  assert.equal(turn1.clarification_history[0].turn, 1);
  assert.equal(turn1.clarification_history[0].provenance, "user");
  // le record précédent n'est jamais muté
  assert.equal(record.clarification_history.length, 0);

  const turn2 = appendClarificationTurn(turn1, { question: "Quel budget ?", answer: "1200 euros." });
  assert.equal(turn2.clarification_history.length, 2);
  assert.equal(turn2.clarification_history[1].turn, 2);
  assert.equal(turn2.original_request, record.original_request);
  assertSameOriginalRequest(record, turn2);
});

test("appendClarificationTurn rejette question/réponse vides ou provenance invalide", () => {
  const record = createOriginalRequestRecord("Préparer un voyage.");
  assert.throws(() => appendClarificationTurn(record, { question: "", answer: "Dix jours." }), TypeError);
  assert.throws(() => appendClarificationTurn(record, { question: "Quelle durée ?", answer: "" }), TypeError);
  assert.throws(() => appendClarificationTurn(record, { question: "Quelle durée ?", answer: "Dix jours.", provenance: "assistant" }), TypeError);
});

test("assertSameOriginalRequest détecte toute tentative de réécriture", () => {
  const a = createOriginalRequestRecord("Demande A.");
  const b = createOriginalRequestRecord("Demande B.");
  assert.throws(() => assertSameOriginalRequest(a, b), TypeError);
});

test("validateOriginalRequestRecord rejette une numérotation de tours incohérente", () => {
  const record = createOriginalRequestRecord("Préparer un voyage.");
  const withTurn1 = appendClarificationTurn(record, { question: "Quelle durée ?", answer: "Dix jours." });
  const corrupted = { ...withTurn1, clarification_history: [{ ...withTurn1.clarification_history[0], turn: 2 }] };
  assert.throws(() => validateOriginalRequestRecord(corrupted), TypeError);
});

test("createEmptyCandidate produit un candidat entièrement vide et valide (règle anti-questionnaire)", () => {
  const empty = createEmptyCandidate();
  const normalized = normalizeCandidate(empty);
  assert.equal(normalized.objective, "");
  assert.deepEqual(normalized.confirmed_constraints, []);
  assert.deepEqual(normalized.remaining_unknowns, []);
});

test("normalizeCandidate rejette un champ métier ou une forme incorrecte", () => {
  const base = createEmptyCandidate();
  assert.throws(() => normalizeCandidate({ ...base, budget_voyage: "1200€" }), TypeError, "un champ métier ajouté doit être rejeté");
  assert.throws(() => normalizeCandidate({ ...base, objective: 42 }), TypeError, "un champ scalaire doit être une chaîne");
  assert.throws(() => normalizeCandidate({ ...base, confirmed_constraints: "budget serré" }), TypeError, "un champ liste doit être un tableau");
  assert.throws(() => normalizeCandidate({ ...base, confirmed_constraints: [""] }), TypeError, "un élément de liste vide doit être rejeté");
});

test("validateIssue applique la primitive conflict unifiée (kind obligatoire et exclusif)", () => {
  const conflict = validateIssue({
    id: "ISSUE-001",
    type: "conflict",
    kind: "priority_conflict",
    description: "Deux priorités concurrentes non arbitrées.",
    impact: "material",
    substitutable: false,
    recommended_treatment: "question"
  });
  assert.equal(conflict.kind, "priority_conflict");

  assert.throws(() => validateIssue({
    id: "ISSUE-002",
    type: "conflict",
    description: "Sans kind.",
    impact: "material",
    substitutable: false,
    recommended_treatment: "question"
  }), TypeError, "un conflict sans kind doit être rejeté");

  assert.throws(() => validateIssue({
    id: "ISSUE-003",
    type: "missing_information",
    kind: "priority_conflict",
    description: "kind interdit hors conflict.",
    impact: "material",
    substitutable: false,
    recommended_treatment: "question"
  }), TypeError, "kind est interdit hors conflict");
});

test("normalizeIssues attribue un identifiant stable quand il est absent", () => {
  const issues = normalizeIssues([
    { type: "missing_information", description: "Destination non précisée.", impact: "material", substitutable: false, recommended_treatment: "question" }
  ]);
  assert.equal(issues[0].id, "ISSUE-001");
});

test("validateProvenanceRecord et normalizeProvenanceRecords valident champ/valeur/provenance", () => {
  const record = validateProvenanceRecord({ field: "objective", value: "Préparer un voyage en Italie.", provenance: "explicit_user_statement" });
  assert.equal(record.provenance, "explicit_user_statement");
  assert.throws(() => validateProvenanceRecord({ field: "champ_inconnu", value: "x", provenance: "explicit_user_statement" }), TypeError);
  assert.throws(() => validateProvenanceRecord({ field: "objective", value: "x", provenance: "invention" }), TypeError);
  assert.deepEqual(normalizeProvenanceRecords([]), []);
});

test("validateStatusChange et validateResolution exigent une justification non vide", () => {
  assert.throws(() => validateStatusChange({ field: "confirmed_constraints", value: "x", reason: "" }), TypeError);
  const change = validateStatusChange({ field: "confirmed_constraints", value: "x", reason: "Superseded by clarification turn 2." });
  assert.equal(change.field, "confirmed_constraints");
  assert.throws(() => validateResolution({ issue_id: "ISSUE-001", provenance: "explicit_user_statement", note: "" }), TypeError);
  const resolution = validateResolution({ issue_id: "ISSUE-001", provenance: "explicit_user_statement", note: "Arbitré via réponse utilisateur tour 3." });
  assert.equal(resolution.issue_id, "ISSUE-001");
});

test("la machine d'état interdit à degraded_state de produire un verdict sémantique direct", () => {
  assert.equal(OPERATIONAL_REQUEST_STATES.includes("confirmation_required"), true);
  assert.equal(OPERATIONAL_REQUEST_STATES.includes("degraded_state"), true);
  assert.equal(isLegalTransition("understanding", "degraded_state"), true);
  assert.equal(isLegalTransition("degraded_state", "understanding"), true);
  assert.equal(isLegalTransition("degraded_state", "operational_request_ready"), false);
  assert.equal(isLegalTransition("degraded_state", "blocked"), false);
  assert.equal(isLegalTransition("confirmation_required", "operational_request_ready"), true);
  assert.equal(isLegalTransition("confirmation_required", "understanding"), true);
  assert.equal(isLegalTransition("blocked", "operational_request_ready"), false);
  assert.throws(() => isLegalTransition("etat_inconnu", "understanding"), TypeError);
});

/* Le vocabulaire du CDC §6, PLUS l'unique extension autorisée par OPRIE-MATERIAL-PROVENANCE-02.
 *
 * La garde n'est ni supprimée ni relâchée : elle protège désormais neuf valeurs au lieu de huit,
 * et continue de refuser toute valeur qui n'y figure pas. L'extension est tracée, motivée par
 * l'audit OPRIE-MATERIAL-PROVENANCE-01 — aucune des huit valeurs d'origine ne désignait un fait
 * porté par material_content, troisième source du plan profond depuis OPRIE-MATERIAL-CONTENT-02.
 * Les huit valeurs historiques sont inchangées et gardent exactement leur sens. */
test("PROVENANCE_VALUES couvre le vocabulaire du CDC et sa seule extension tracée", () => {
  assert.deepEqual([...PROVENANCE_VALUES].sort(), [
    "clarification_answer",
    "conditional_scenario",
    "confirmed_preference",
    "delegated_decision",
    "explicit_user_statement",
    "external_fact_to_research",
    "labeled_estimate",
    "safe_deduction",
    "user_provided_material"
  ].sort());
  /* Les huit du CDC restent présentes, dans leur ordre d'origine : l'extension est ADDITIVE. */
  assert.deepEqual([...PROVENANCE_VALUES].slice(0, 8), [
    "explicit_user_statement", "clarification_answer", "confirmed_preference", "safe_deduction",
    "delegated_decision", "external_fact_to_research", "labeled_estimate", "conditional_scenario"
  ]);
});
