import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  resolveProviders,
  SUPPORTED_PROVIDER_FILTERS,
  WORKERS_AI_MODEL,
  GROQ_MODEL,
  callWorkersAI,
  callGroq
} from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";
import { PRIMARY_MODEL, runRoleWithWorkersAI } from "../workers/workers-ai/src/index.js";
import { MODEL as RUNTIME_GROQ_MODEL, runRoleWithGroq } from "../workers/groq/src/index.js";
import {
  ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA,
  CRITIC_SYSTEM_PROMPT, CRITIC_JSON_SCHEMA,
  ARBITER_SYSTEM_PROMPT, ARBITER_JSON_SCHEMA
} from "../workers/shared/operational-request-core.js";

// Ce fichier ne fait AUCUN appel réseau réel : globalThis.fetch et env.AI.run sont systématiquement
// mockés. Il prouve la PARITÉ entre le harnais de benchmark (evaluation/lot10g3b3f3) et le runtime
// (workers/workers-ai, workers/groq, 3F.3.4) — mêmes prompts, mêmes schémas, mêmes modèles, mêmes
// paramètres d'inférence pertinents — avant toute exécution réelle en 3F.3.3-B.

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function cloudflareRestResponse(response, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ success: true, result: { response, usage } });
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

// --- --provider ------------------------------------------------------------------------------------

test("resolveProviders : all (ou absent) exécute les deux providers, comportement inchangé", () => {
  assert.deepEqual(resolveProviders("all"), ["workers-ai", "groq"]);
  assert.deepEqual(resolveProviders(undefined), ["workers-ai", "groq"]);
});

test("resolveProviders : workers-ai exécute uniquement Workers AI", () => {
  assert.deepEqual(resolveProviders("workers-ai"), ["workers-ai"]);
});

test("resolveProviders : groq exécute uniquement Groq", () => {
  assert.deepEqual(resolveProviders("groq"), ["groq"]);
});

test("resolveProviders : une valeur inconnue est rejetée avec un message explicite", () => {
  assert.throws(() => resolveProviders("bing"), /--provider invalide/);
  assert.throws(() => resolveProviders("Workers-AI"), /--provider invalide/, "sensible à la casse, pas de correspondance approximative silencieuse");
  for (const value of SUPPORTED_PROVIDER_FILTERS) assert.doesNotThrow(() => resolveProviders(value));
});

// --- Parité des modèles par défaut -----------------------------------------------------------------

test("le modèle Workers AI par défaut du benchmark est importé du runtime, jamais retapé", () => {
  assert.equal(WORKERS_AI_MODEL, PRIMARY_MODEL);
});

test("le modèle Groq par défaut du benchmark est importé du runtime, jamais retapé", () => {
  assert.equal(GROQ_MODEL, RUNTIME_GROQ_MODEL);
});

// --- Parité prompt/schéma/paramètres : Workers AI (comparaison des options envoyées à env.AI.run vs REST) ---

test("Workers AI : le benchmark envoie exactement le même prompt, schéma et paramètres que le runtime", async (t) => {
  let runtimeOptions;
  const runtimeOutputStub = {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
  await runRoleWithWorkersAI("analyst", { original_request: "x", clarification_history: [] }, {
    AI: { run: async (model, options) => { runtimeOptions = { model, options }; return { response: runtimeOutputStub }; } }
  });

  let benchmarkBody;
  withFetch(t, async (url, options) => { benchmarkBody = { url, body: JSON.parse(options.body) }; return cloudflareRestResponse(runtimeOutputStub); });
  await callWorkersAI(ANALYST_SYSTEM_PROMPT, JSON.stringify({ original_request: "x", clarification_history: [] }), ANALYST_JSON_SCHEMA);

  assert.equal(runtimeOptions.model, WORKERS_AI_MODEL, "le runtime utilise bien PRIMARY_MODEL, identique au modèle par défaut du benchmark.");
  assert.ok(benchmarkBody.url.includes(WORKERS_AI_MODEL), "l'URL REST du benchmark cible le même modèle.");
  assert.equal(runtimeOptions.options.messages[0].content, benchmarkBody.body.messages[0].content);
  assert.equal(runtimeOptions.options.messages[0].content, ANALYST_SYSTEM_PROMPT);
  assert.deepEqual(runtimeOptions.options.response_format, benchmarkBody.body.response_format);
  assert.deepEqual(runtimeOptions.options.response_format.json_schema, ANALYST_JSON_SCHEMA);
  assert.equal(runtimeOptions.options.max_tokens, benchmarkBody.body.max_tokens);
  assert.equal(runtimeOptions.options.temperature, benchmarkBody.body.temperature);
});

// --- Parité prompt/schéma/paramètres : Groq (même transport, comparaison directe) ---------------------

test("Groq : le benchmark envoie exactement le même prompt, schéma et paramètres d'inférence que le runtime", async (t) => {
  const criticOutputStub = {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    illegitimate_question_found: []
  };
  const analystOutputStub = {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };

  let runtimeBody;
  withFetch(t, async (url, options) => { runtimeBody = JSON.parse(options.body); return groqChatResponse(criticOutputStub); });
  await runRoleWithGroq("critic", { original_request: "x", clarification_history: [], analyst_output: analystOutputStub, previous_vetoes: [] }, { GROQ_API_KEY: "server-only" });

  let benchmarkBody;
  withFetch(t, async (url, options) => { benchmarkBody = JSON.parse(options.body); return groqChatResponse(criticOutputStub); });
  await callGroq("critic", CRITIC_SYSTEM_PROMPT, JSON.stringify({ original_request: "x", clarification_history: [], analyst_output: analystOutputStub, previous_vetoes: [] }), CRITIC_JSON_SCHEMA);

  assert.deepEqual(benchmarkBody, runtimeBody, "le corps de requête Groq du benchmark doit être structurellement identique à celui du runtime pour le même rôle.");
  assert.equal(benchmarkBody.model, RUNTIME_GROQ_MODEL);
  assert.equal(benchmarkBody.messages[0].content, CRITIC_SYSTEM_PROMPT);
  assert.deepEqual(benchmarkBody.response_format.json_schema.schema, CRITIC_JSON_SCHEMA);
  assert.equal(benchmarkBody.response_format.json_schema.name, "oprie_critic");
  assert.equal(benchmarkBody.response_format.json_schema.strict, true);
  assert.equal(benchmarkBody.reasoning_format, "hidden");
  assert.equal(benchmarkBody.reasoning_effort, "low");
  assert.equal(benchmarkBody.temperature, 0);
  assert.equal(benchmarkBody.stream, false);
});

test("Groq : le nom de schéma suit oprie_<rôle> pour l'analyste et l'arbitre également", async (t) => {
  withFetch(t, async () => groqChatResponse({}));
  let captured;
  const fetchSpy = async (url, options) => { captured = JSON.parse(options.body); return groqChatResponse({}); };
  withFetch(t, fetchSpy);
  await callGroq("analyst", ANALYST_SYSTEM_PROMPT, "{}", ANALYST_JSON_SCHEMA).catch(() => {});
  assert.equal(captured.response_format.json_schema.name, "oprie_analyst");

  withFetch(t, fetchSpy);
  await callGroq("arbiter", ARBITER_SYSTEM_PROMPT, "{}", ARBITER_JSON_SCHEMA).catch(() => {});
  assert.equal(captured.response_format.json_schema.name, "oprie_arbiter");
});

// --- .gitignore des résultats de benchmark --------------------------------------------------------

test("evaluation/lot10g3b3f3/.gitignore protège results/ sans supprimer la possibilité de le committer explicitement", () => {
  const gitignorePath = fileURLToPath(new URL("../evaluation/lot10g3b3f3/.gitignore", import.meta.url));
  const content = fs.readFileSync(gitignorePath, "utf8");
  assert.match(content, /^results\/$/m, "la règle doit ignorer le dossier results/ à la racine de lot10g3b3f3/, pas ailleurs.");
  assert.match(content, /git add -f/, "le fichier doit documenter le contournement volontaire (git add -f).");
});

test("evaluation/lot10g3b3f3/results/ n'est actuellement pas suivi par Git (aucun résultat committé par erreur)", () => {
  const resultsDir = fileURLToPath(new URL("../evaluation/lot10g3b3f3/results", import.meta.url));
  assert.equal(fs.existsSync(resultsDir), false, "aucun résultat de benchmark ne doit être présent dans le dépôt avant l'exécution réelle de 3F.3.3-B.");
});
