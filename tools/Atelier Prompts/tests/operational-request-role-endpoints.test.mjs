import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCandidate } from "../core/adn/index.js";
import { ANALYST_SYSTEM_PROMPT, ANALYST_JSON_SCHEMA, CRITIC_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT } from "../workers/shared/operational-request-core.js";
import workersAIWorker, { runRoleWithWorkersAI, decideWithWorkersAI } from "../workers/workers-ai/src/index.js";
import groqWorker, { runRoleWithGroq, decideWithGroq } from "../workers/groq/src/index.js";

// Aucun appel réseau réel dans ce fichier : env.AI.run (Workers AI) et globalThis.fetch (Groq) sont
// mockés, exactement comme tests/decision-provider.test.mjs pour le Decision Provider legacy.
// L'exécution réelle contre les deux providers est différée à 3F.3.3-B (après ce sous-lot).

const ORIGIN_ENV = { ALLOWED_ORIGINS: "https://atelier.example.com" };
const ORIGIN_AND_KEY_ENV = { ...ORIGIN_ENV, GROQ_API_KEY: "server-only" };

function confirmationSignals() {
  return {
    multiple_ambiguities_resolved: false,
    complex_conflict_arbitrated: false,
    strong_restructuring: false,
    multiple_objectives_hierarchized: false,
    significant_delegation: false
  };
}

function analystRequestBody() {
  return { original_request: "Rédige une lettre de motivation.", clarification_history: [] };
}

function validAnalystOutput() {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre de motivation." },
    provenance_records: [{ field: "objective", value: "Rédiger une lettre de motivation.", provenance: "explicit_user_statement" }],
    issues: [],
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  };
}

function criticRequestBody() {
  return { original_request: "Rédige une lettre de motivation.", clarification_history: [], analyst_output: validAnalystOutput(), previous_vetoes: [] };
}

function validCriticOutput() {
  return {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: ""
  };
}

function arbiterRequestBody() {
  return { original_request: "Rédige une lettre de motivation.", clarification_history: [], analyst_output: validAnalystOutput(), critic_output: validCriticOutput() };
}

function validArbiterOutput() {
  return {
    state: "operational_request_ready",
    operational_request_candidate: createEmptyCandidate(),
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Aucun problème matériel ne subsiste."
  };
}

function postRole(role, body, { origin = "https://atelier.example.com" } = {}) {
  return new Request(`https://worker.example/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
  });
}

function workersAiEnv(mockRun) {
  return { ...ORIGIN_ENV, AI: { run: mockRun } };
}

function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

// --- Analyste ------------------------------------------------------------------------------------

test("Analyste sur Workers AI : requête valide -> sortie validée, mêmes prompt/schéma que le registre partagé", async () => {
  let captured;
  const env = workersAiEnv(async (model, options) => { captured = { model, options }; return { response: validAnalystOutput() }; });
  const response = await workersAIWorker.fetch(postRole("analyst", analystRequestBody()), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.operational_request_candidate.objective, "Rédiger une lettre de motivation.");
  assert.equal(captured.options.messages[0].content, ANALYST_SYSTEM_PROMPT);
  assert.deepEqual(captured.options.response_format.json_schema, ANALYST_JSON_SCHEMA);
});

test("Analyste sur Groq : requête valide -> sortie validée", async (t) => {
  let captured;
  withGroqFetch(t, async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return Response.json({ choices: [{ message: { content: JSON.stringify(validAnalystOutput()) } }] });
  });
  const response = await groqWorker.fetch(postRole("analyst", analystRequestBody()), ORIGIN_AND_KEY_ENV);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.operational_request_candidate.objective, "Rédiger une lettre de motivation.");
  assert.equal(captured.body.messages[0].content, ANALYST_SYSTEM_PROMPT);
});

// --- Critique --------------------------------------------------------------------------------------

test("Critique sur Workers AI : requête valide -> agreement=agree préservé", async () => {
  const env = workersAiEnv(async () => ({ response: validCriticOutput() }));
  const response = await workersAIWorker.fetch(postRole("critic", criticRequestBody()), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).agreement, "agree");
});

test("Critique sur Groq : requête valide -> agreement=agree préservé", async (t) => {
  withGroqFetch(t, async () => Response.json({ choices: [{ message: { content: JSON.stringify(validCriticOutput()) } }] }));
  const response = await groqWorker.fetch(postRole("critic", criticRequestBody()), ORIGIN_AND_KEY_ENV);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).agreement, "agree");
});

// --- Arbitre (conditionnel, mais l'endpoint reste exécutable indépendamment) --------------------------

test("Arbitre sur Workers AI : requête valide -> state=operational_request_ready", async () => {
  const env = workersAiEnv(async () => ({ response: validArbiterOutput() }));
  const response = await workersAIWorker.fetch(postRole("arbiter", arbiterRequestBody()), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "operational_request_ready");
});

test("Arbitre sur Groq : requête valide -> state=operational_request_ready", async (t) => {
  withGroqFetch(t, async () => Response.json({ choices: [{ message: { content: JSON.stringify(validArbiterOutput()) } }] }));
  const response = await groqWorker.fetch(postRole("arbiter", arbiterRequestBody()), ORIGIN_AND_KEY_ENV);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "operational_request_ready");
});

// --- Schéma invalide (sortie du modèle non conforme) -----------------------------------------------

test("sortie modèle non conforme au schéma -> erreur technique explicite, jamais un pseudo-verdict", async () => {
  const env = workersAiEnv(async () => ({ response: { ...validAnalystOutput(), extra_champ_non_prevu: true } }));
  const response = await workersAIWorker.fetch(postRole("analyst", analystRequestBody()), env);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "role_provider_failure");
  assert.equal(body.role, "analyst");
  assert.equal("state" in body, false);
  assert.equal("operational_request_ready" in body, false);
});

// --- Panne provider ------------------------------------------------------------------------------

test("panne Workers AI (exception réseau) -> erreur technique explicite, jamais operational_request_ready/clarification_required/blocked", async () => {
  const env = workersAiEnv(async () => { throw new Error("Workers AI indisponible."); });
  const response = await workersAIWorker.fetch(postRole("critic", criticRequestBody()), env);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "role_provider_failure");
  for (const forbidden of ["state", "operational_request_ready", "clarification_required", "blocked", "degraded_state"]) {
    assert.equal(forbidden in body, false, `la réponse de panne ne doit jamais contenir la clé "${forbidden}".`);
  }
});

test("panne Groq (HTTP 500) -> erreur technique explicite, jamais un verdict fabriqué", async (t) => {
  withGroqFetch(t, async () => Response.json({ error: { code: "server_error", message: "boom" } }, { status: 500 }));
  const response = await groqWorker.fetch(postRole("arbiter", arbiterRequestBody()), ORIGIN_AND_KEY_ENV);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "role_provider_failure");
  assert.equal(body.role, "arbiter");
});

test("GROQ_API_KEY absent -> erreur technique explicite, jamais un verdict fabriqué", async () => {
  const response = await groqWorker.fetch(postRole("analyst", analystRequestBody()), ORIGIN_ENV);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "role_provider_failure");
});

// --- Validation d'entrée (avant tout appel provider) ------------------------------------------------

test("requête d'entrée invalide -> 400, le provider n'est jamais appelé", async () => {
  let called = false;
  const env = workersAiEnv(async () => { called = true; return { response: validAnalystOutput() }; });
  const response = await workersAIWorker.fetch(postRole("analyst", { ...analystRequestBody(), champ_metier_invente: true }), env);
  assert.equal(response.status, 400);
  assert.equal(called, false, "le provider ne doit jamais être appelé quand l'entrée est invalide.");
});

test("critic_output manquant pour l'Arbitre -> 400 avant tout appel provider", async () => {
  let called = false;
  const env = workersAiEnv(async () => { called = true; return { response: validArbiterOutput() }; });
  const bad = { original_request: "x", clarification_history: [], analyst_output: validAnalystOutput() };
  const response = await workersAIWorker.fetch(postRole("arbiter", bad), env);
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

// --- Endpoints historiques non régressés (coexistence additive) --------------------------------------

test("la route /decision historique répond toujours à l'identique sur les deux workers", async () => {
  const decisionBody = JSON.stringify({ demande: "Traduis en anglais : Bonjour à tous", materiau_present: false, mode_demande: "rapide" });
  const decision = { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.", question: null };

  const workersAiEnvDecision = { ...ORIGIN_ENV, AI: { run: async () => ({ response: decision }) } };
  const decisionResponse = await workersAIWorker.fetch(new Request("https://worker.example/decision", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://atelier.example.com" }, body: decisionBody }), workersAiEnvDecision);
  assert.equal(decisionResponse.status, 200);
  assert.equal((await decisionResponse.json()).route, "rapide");

  const unknownRole = await workersAIWorker.fetch(new Request("https://worker.example/unknown", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://atelier.example.com" }, body: "{}" }), workersAiEnvDecision);
  assert.equal(unknownRole.status, 404, "une route inconnue ne doit ni router vers un rôle, ni vers /decision par erreur.");
});

// --- Même prompt, même schéma, quel que soit le provider ----------------------------------------------

test("même rôle -> prompt système et schéma strictement identiques sur Workers AI et Groq", async (t) => {
  let workersAiCaptured;
  const workersEnv = workersAiEnv(async (model, options) => { workersAiCaptured = options; return { response: validCriticOutput() }; });
  await workersAIWorker.fetch(postRole("critic", criticRequestBody()), workersEnv);

  let groqCaptured;
  withGroqFetch(t, async (url, options) => { groqCaptured = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: JSON.stringify(validCriticOutput()) } }] }); });
  await groqWorker.fetch(postRole("critic", criticRequestBody()), ORIGIN_AND_KEY_ENV);

  assert.equal(workersAiCaptured.messages[0].content, groqCaptured.messages[0].content);
  assert.equal(workersAiCaptured.messages[0].content, CRITIC_SYSTEM_PROMPT);
  assert.deepEqual(workersAiCaptured.response_format.json_schema, groqCaptured.response_format.json_schema.schema);
});

test("runRoleWithWorkersAI et runRoleWithGroq rejettent un rôle inconnu avant tout appel réseau", async (t) => {
  await assert.rejects(() => runRoleWithWorkersAI("orchestrator", {}, workersAiEnv(async () => { throw new Error("ne doit pas être appelé"); })), /Rôle OPRIE inconnu/);
  withGroqFetch(t, async () => { throw new Error("ne doit pas être appelé"); });
  await assert.rejects(() => runRoleWithGroq("orchestrator", {}, {}), /Rôle OPRIE inconnu/);
});

test("decideWithWorkersAI et decideWithGroq restent exportés et fonctionnels après l'ajout des rôles OPRIE", async (t) => {
  const decision = { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.", question: null };
  const workersResult = await decideWithWorkersAI({ demande: "Traduis en anglais : Bonjour à tous", materiau_present: false, mode_demande: "rapide" }, { AI: { run: async () => ({ response: decision }) } });
  assert.equal(workersResult.route, "rapide");

  withGroqFetch(t, async () => Response.json({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
  const groqResult = await decideWithGroq({ demande: "Organise mes idées en plan", materiau_present: true, mode_demande: "rapide" }, { GROQ_API_KEY: "server-only" });
  assert.equal(groqResult.route, "rapide");
});

// --- Prompts jamais mélangés entre rôles --------------------------------------------------------------

test("le prompt Arbitre n'est jamais envoyé pour une requête Analyste, et réciproquement", async () => {
  let captured;
  const env = workersAiEnv(async (model, options) => { captured = options; return { response: validAnalystOutput() }; });
  await workersAIWorker.fetch(postRole("analyst", analystRequestBody()), env);
  assert.notEqual(captured.messages[0].content, ARBITER_SYSTEM_PROMPT);
  assert.equal(captured.messages[0].content, ANALYST_SYSTEM_PROMPT);
});
