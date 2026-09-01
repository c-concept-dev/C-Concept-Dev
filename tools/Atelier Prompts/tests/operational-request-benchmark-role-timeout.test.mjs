import assert from "node:assert/strict";
import test from "node:test";

import {
  runRole,
  benchmarkAnalystAndCritic,
  buildCompletedIndex,
  splitResumableCompleted,
  isRetryableRow,
  RETRYABLE_ERROR_KINDS
} from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";
import { CRITIC_SYSTEM_PROMPT, CRITIC_JSON_SCHEMA, parseCriticOutput } from "../workers/shared/operational-request-core.js";

// 3F.3.3-H2 : ce fichier ne fait AUCUN appel réseau réel. Il prouve que --timeout-ms borne
// désormais l'exécution LOGIQUE complète d'un rôle (tentative + retries + backoff + parsing), pas
// seulement chaque tentative HTTP individuelle — le défaut résiduel constaté sur le smoke réel
// post-3F.3.3-S1 (process actif >3 min avec --timeout-ms=60000, aucune socket TCP, endormi dans un
// sleep de backoff). Chaque test utilise un roleTimeoutMs COURT (quelques dizaines de ms), jamais une
// attente réelle de plusieurs secondes ou minutes. Aucune assertion ici ne porte sur la sémantique
// Analyste/Critique/Arbitre, sur B-01/B-02, ni sur le prompt (S1 reste intact et hors périmètre).

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

const analystOutputStub = {
  operational_request_candidate: {
    objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
    confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: []
  },
  provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
};

function makeAnalystAndCriticTestCase(id) {
  return {
    id,
    role_under_test: "analyst_and_critic",
    input: { original_request: "Fais-moi un compte rendu.", clarification_history: [] },
    oracle: { analyst: {}, critic: {} }
  };
}

function schemaNameOf(options) {
  return JSON.parse(options.body).response_format.json_schema.name.replace("oprie_", "");
}

// --- Phase 9 : Promise qui ne se résout jamais -----------------------------------------------------

test("H2-9 : un rôle dont la Promise ne se résout jamais est borné par le timeout global, jamais un blocage infini", async (t) => {
  withFetch(t, () => new Promise(() => {}));
  const startedAt = Date.now();
  const result = await runRole("critic", "groq", CRITIC_SYSTEM_PROMPT, "{}", CRITIC_JSON_SCHEMA, parseCriticOutput, 40);
  const elapsed = Date.now() - startedAt;
  assert.equal(result.valid_json, false);
  assert.equal(result.error_kind, "timeout");
  assert.equal(result.score, undefined, "runRole ne calcule pas de score : il retourne le résultat brut du rôle.");
  assert.ok(elapsed < 2000, `le test doit se terminer rapidement, jamais attendre indéfiniment (elapsed=${elapsed}ms).`);
});

// --- Phase 10 : fetch (mock) qui ignore délibérément l'AbortSignal ----------------------------------

test("H2-10 : même si le fetch ignore délibérément l'AbortSignal, le timeout global libère runRole (test le plus important de H2)", async (t) => {
  let receivedSignal = null;
  withFetch(t, (url, options) => {
    receivedSignal = options.signal;
    // Provider hostile : ne consulte jamais options.signal, ne réagit jamais à son abandon.
    return new Promise(() => {});
  });
  const startedAt = Date.now();
  const result = await runRole("critic", "groq", CRITIC_SYSTEM_PROMPT, "{}", CRITIC_JSON_SCHEMA, parseCriticOutput, 40);
  const elapsed = Date.now() - startedAt;
  assert.ok(receivedSignal, "un signal doit être transmis au fetch, même s'il est ignoré par ce mock hostile.");
  assert.equal(result.valid_json, false);
  assert.equal(result.error_kind, "timeout");
  assert.ok(elapsed < 2000, `le wrapper ne doit dépendre d'aucune coopération du provider (elapsed=${elapsed}ms).`);
});

// --- Phase 11 : backoff 429 plus long que le timeout global -----------------------------------------

test("H2-11 : un backoff 429 (Retry-After long) est interrompu par le timeout global, jamais attendu jusqu'au bout", async (t) => {
  withFetch(t, () => Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": "5" } }));
  const startedAt = Date.now();
  const result = await runRole("critic", "groq", CRITIC_SYSTEM_PROMPT, "{}", CRITIC_JSON_SCHEMA, parseCriticOutput, 60);
  const elapsed = Date.now() - startedAt;
  assert.equal(result.valid_json, false);
  assert.equal(result.error_kind, "timeout");
  assert.ok(elapsed < 2000, `les 5s réelles de Retry-After ne doivent jamais être attendues (elapsed=${elapsed}ms).`);
});

// --- Phase 12 : Analyst réussi + Critic qui pend indéfiniment -> checkpoint conserve les deux -------

test("H2-12 : Analyst réussi et Critic qui pend indéfiniment produisent chacun une ligne de résultat, aucune perte", async (t) => {
  withFetch(t, (url, options) => {
    if (schemaNameOf(options) === "analyst") return groqChatResponse(analystOutputStub);
    return new Promise(() => {}); // le Critic ne se résout jamais
  });
  // repetitions vaut 3 par défaut (aucun --repetitions dans l'argv du test-runner) : les runs 1 et 2
  // sont préchargés en cache (analyst + critic déjà complétés), pour isoler exactement le scénario du
  // lot — un run où l'Analyste réussit puis le Critique pend indéfiniment — sur le run 3 restant.
  const completedRows = [];
  for (let run = 1; run <= 2; run += 1) {
    completedRows.push({ case_id: "case-h2-checkpoint", role: "analyst", provider: "groq", run, valid_json: true, error_kind: null, __output: analystOutputStub });
    completedRows.push({ case_id: "case-h2-checkpoint", role: "critic", provider: "groq", run, valid_json: true, error_kind: null, __output: {} });
  }
  const completedIndex = buildCompletedIndex(completedRows);
  const results = [...completedRows];
  const checkpointedRows = [];
  const onResult = async (row) => { checkpointedRows.push(row); };
  const testCase = makeAnalystAndCriticTestCase("case-h2-checkpoint");

  await benchmarkAnalystAndCritic(testCase, "groq", results, { completedIndex, onResult, roleTimeoutMs: 40 });

  assert.equal(results.length, 6, "4 lignes déjà en cache (runs 1-2 complets) + 2 nouvelles lignes pour le run 3 (analyst OK + critic timeout).");
  const run3Analyst = results.find((r) => r.role === "analyst" && r.run === 3);
  const run3Critic = results.find((r) => r.role === "critic" && r.run === 3);
  assert.ok(run3Analyst, "le run 3 de l'Analyste doit avoir été exécuté et enregistré.");
  assert.equal(run3Analyst.valid_json, true, "l'Analyste, réussi avant le blocage du Critique, ne doit jamais être perdu.");
  assert.ok(run3Critic, "le run 3 du Critique (bloqué indéfiniment) doit tout de même produire une ligne.");
  assert.equal(run3Critic.valid_json, false);
  assert.equal(run3Critic.error_kind, "timeout");
  assert.equal(run3Critic.score, null, "aucun score ne doit être calculé pour un résultat timeout.");
  assert.equal(run3Critic.__output, null, "aucune sortie parsée ne doit être associée à un résultat timeout.");
  assert.ok(run3Critic.error, "un message d'erreur explicite doit accompagner le timeout.");
  assert.equal(checkpointedRows.length, 2, "seules les 2 nouvelles lignes (run 3) doivent déclencher une écriture de checkpoint ; les runs déjà en cache n'en déclenchent aucune.");
});

// --- Phase 13 : scénario exact observé sur le smoke (Analyst checkpointé, Critic manquant, resume) --

test("H2-13a : resume avec Analyst déjà checkpointé et Critic absent n'exécute que le Critique, borné par le timeout", async (t) => {
  const calledRoles = [];
  withFetch(t, (url, options) => {
    calledRoles.push(schemaNameOf(options));
    return new Promise(() => {}); // si l'Analyste était appelé à tort, il resterait ici bloqué aussi
  });
  // Comme ci-dessus : runs 1-2 entièrement en cache, run 3 = Analyste déjà checkpointé mais Critique
  // absent — reproduction exacte du scénario du lot (Analyst jamais rejoué, Critic seul manquant).
  const completedRows = [];
  for (let run = 1; run <= 2; run += 1) {
    completedRows.push({ case_id: "case-h2-resume", role: "analyst", provider: "groq", run, valid_json: true, error_kind: null, __output: analystOutputStub });
    completedRows.push({ case_id: "case-h2-resume", role: "critic", provider: "groq", run, valid_json: true, error_kind: null, __output: {} });
  }
  completedRows.push({ case_id: "case-h2-resume", role: "analyst", provider: "groq", run: 3, valid_json: true, error_kind: null, __output: analystOutputStub });
  const completedIndex = buildCompletedIndex(completedRows);
  const results = [...completedRows];

  const testCase = makeAnalystAndCriticTestCase("case-h2-resume");
  await benchmarkAnalystAndCritic(testCase, "groq", results, { completedIndex, roleTimeoutMs: 40 });

  assert.deepEqual(calledRoles, ["critic"], "seul le Critique (manquant du point de reprise) doit être appelé ; l'Analyste déjà checkpointé ne doit jamais être rejoué.");
  assert.equal(results.length, 6, "5 lignes déjà en cache + 1 nouvelle ligne (le Critique du run 3, timeouté).");
  const newRow = results[results.length - 1];
  assert.equal(newRow.role, "critic");
  assert.equal(newRow.run, 3);
  assert.equal(newRow.error_kind, "timeout");
});

test("H2-13b : splitResumableCompleted (politique B) — un succès n'est jamais rejouable, un timeout l'est toujours", () => {
  const okAnalystRow = { case_id: "case-h2", role: "analyst", provider: "groq", run: 1, valid_json: true, error_kind: null, __output: analystOutputStub };
  const timeoutCriticRow = { case_id: "case-h2", role: "critic", provider: "groq", run: 1, valid_json: false, error_kind: "timeout", __output: null };
  const networkErrorRow = { case_id: "case-h2", role: "critic", provider: "groq", run: 2, valid_json: false, error_kind: "network_error", __output: null };
  const jsonErrorRow = { case_id: "case-h2", role: "critic", provider: "groq", run: 3, valid_json: false, error_kind: "json_error", __output: null };

  assert.equal(isRetryableRow(okAnalystRow), false);
  assert.equal(isRetryableRow(timeoutCriticRow), true);
  assert.equal(isRetryableRow(networkErrorRow), true);
  assert.equal(isRetryableRow(jsonErrorRow), false, "un JSON invalide n'est jamais une panne d'infrastructure : jamais rejoué automatiquement.");

  const { kept, retryable } = splitResumableCompleted([okAnalystRow, timeoutCriticRow, networkErrorRow, jsonErrorRow]);
  assert.deepEqual(kept, [okAnalystRow, jsonErrorRow]);
  assert.deepEqual(retryable, [timeoutCriticRow, networkErrorRow]);
  assert.deepEqual(RETRYABLE_ERROR_KINDS, ["timeout", "network_error"]);
});

// --- Non-régression H1 : runRole reste appelable exactement comme avant (6 arguments) ----------------

test("H2 : runRole reste rétro-compatible avec l'appel H1 à 6 arguments (roleTimeoutMs optionnel, défaut TIMEOUT_MS)", async (t) => {
  withFetch(t, () => Response.json({ choices: [{ message: { content: JSON.stringify({ agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "", question_substitution_review: [], illegitimate_question_found: [] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  const result = await runRole("critic", "groq", CRITIC_SYSTEM_PROMPT, "{}", CRITIC_JSON_SCHEMA, parseCriticOutput);
  assert.equal(result.valid_json, true);
});
