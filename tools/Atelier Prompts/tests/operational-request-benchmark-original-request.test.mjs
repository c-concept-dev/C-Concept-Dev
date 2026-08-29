import assert from "node:assert/strict";
import test from "node:test";

import { benchmarkCriticIsolation } from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";

// 3F.3.3-C, A1 : les appels Critique isolé/Arbitre du benchmark utilisaient auparavant
// original_request: "" au lieu de la vraie demande originale du cas de corpus, ce qui ne
// correspond pas au contrat runtime (makeCriticUserMessage/makeArbiterUserMessage) et invalide
// silencieusement tout jugement de dérive sémantique par le Critique/Arbitre. Ce fichier prouve
// que le harnais échoue bruyamment si un cas critic_isolation n'a pas d'original_request réel, et
// que la vraie demande — jamais une chaîne vide — est effectivement envoyée au provider.

// Aucun appel réseau réel : globalThis.fetch est systématiquement mocké.

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

const criticOutputStub = {
  agreement: "agree",
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ""
};

const fixtureAnalystOutput = {
  operational_request_candidate: {
    objective: "Produire un compte rendu de la réunion hebdomadaire.",
    expected_deliverable: "Compte rendu structuré en trois sections.",
    secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [],
    delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: []
  },
  provenance_records: [{ field: "objective", value: "Produire un compte rendu de la réunion hebdomadaire.", provenance: "explicit_user_statement" }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
};

test("benchmarkCriticIsolation refuse un cas critic_isolation dépourvu d'input.original_request (jamais de repli sur une chaîne vide)", async () => {
  const testCase = { id: "case-x", role_under_test: "critic_isolation", fixture_analyst_output: fixtureAnalystOutput, oracle: { critic: {} } };
  await assert.rejects(
    () => benchmarkCriticIsolation(testCase, "groq", []),
    /original_request/
  );
});

test("benchmarkCriticIsolation envoie la vraie demande originale du cas de corpus au Critique, jamais une chaîne vide", async (t) => {
  const capturedBodies = [];
  withFetch(t, async (url, options) => {
    capturedBodies.push(JSON.parse(options.body));
    return groqChatResponse(criticOutputStub);
  });
  const testCase = {
    id: "case-10-critique-accepte-sans-veto",
    role_under_test: "critic_isolation",
    input: { original_request: "Fais-moi un compte rendu de la réunion hebdomadaire, avec les décisions, les actions et les points en suspens dans des sections séparées.", clarification_history: [] },
    fixture_analyst_output: fixtureAnalystOutput,
    oracle: { critic: { expect_agreement: "agree", expect_vetoes: false } }
  };
  await benchmarkCriticIsolation(testCase, "groq", []);
  assert.ok(capturedBodies.length > 0, "au moins un appel Critique attendu.");
  for (const body of capturedBodies) {
    const userMessage = JSON.parse(body.messages[1].content);
    assert.equal(userMessage.original_request, testCase.input.original_request);
    assert.notEqual(userMessage.original_request, "", "original_request ne doit jamais être une chaîne vide quand le corpus fournit la vraie demande.");
  }
});

test("benchmarkCriticIsolation envoie aussi la vraie demande originale à l'Arbitre lorsque l'oracle en attend un", async (t) => {
  const readyArbiterStub = {
    state: "clarification_required",
    operational_request_candidate: fixtureAnalystOutput.operational_request_candidate,
    issues: [],
    next_question: { text: "Quel est le format attendu ?", targets_issue_id: null, expected_progress: "x" },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Une clarification reste nécessaire."
  };
  const capturedBodies = [];
  let callCount = 0;
  withFetch(t, async (url, options) => {
    callCount += 1;
    capturedBodies.push(JSON.parse(options.body));
    return callCount % 2 === 1 ? groqChatResponse(criticOutputStub) : groqChatResponse(readyArbiterStub);
  });
  const testCase = {
    id: "case-11-critique-veto-qualifie",
    role_under_test: "critic_isolation",
    input: { original_request: "Fais-moi un compte rendu de la réunion hebdomadaire.", clarification_history: [] },
    fixture_analyst_output: fixtureAnalystOutput,
    oracle: { critic: {}, arbiter: { forbidden_state: "operational_request_ready" } }
  };
  await benchmarkCriticIsolation(testCase, "groq", []);
  assert.ok(capturedBodies.length >= 2, "au moins un appel Critique et un appel Arbitre attendus.");
  assert.equal(capturedBodies.length % 2, 0, "chaque répétition doit alterner exactement un appel Critique puis un appel Arbitre.");
  for (const body of capturedBodies) {
    const userMessage = JSON.parse(body.messages[1].content);
    assert.equal(userMessage.original_request, testCase.input.original_request);
    assert.notEqual(userMessage.original_request, "");
  }
});
