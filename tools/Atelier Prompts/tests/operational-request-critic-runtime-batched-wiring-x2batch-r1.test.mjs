import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  CRITIC_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT, CRITIC_GLOBAL_JSON_SCHEMA,
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT, ANALYST_SYSTEM_PROMPT
} from "../workers/shared/operational-request-core.js";
import groqWorker, { runRoleWithGroq, runCriticWithGroq } from "../workers/groq/src/index.js";
import workersAIWorker, { runRoleWithWorkersAI, runCriticWithWorkersAI } from "../workers/workers-ai/src/index.js";

// 3F.3.3-X2-BATCH-R1 : câblage runtime — le pipeline batché (Critic global + Substitution Review
// batchée) devient le chemin RÉEL de production pour le rôle critic sur les deux providers. Le
// mécanisme monolithique (runRoleWithGroq/runRoleWithWorkersAI appliqué à "critic") est CONSERVÉ
// intact comme référence/rollback explicite (section 4 du lot R1), mais n'est plus le chemin par
// défaut du routage HTTP (fetch()). Cette campagne prouve le NOUVEAU comportement runtime et
// l'absence de double chemin production involontaire.

const groqSrcPath = fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url));
const workersAiSrcPath = fileURLToPath(new URL("../workers/workers-ai/src/index.js", import.meta.url));

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}

function analystOutputWithIssues(n, { descLen = 0 } = {}) {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: n }, (_, i) => ({
      id: `issue${i + 1}`, type: "missing_information",
      description: descLen > 0 ? "x".repeat(descLen) : `Description ${i + 1}.`,
      impact: "material", substitutable: false, recommended_treatment: "question", kind: null
    })),
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  };
}

function criticBody(n, opts) {
  return { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(n, opts), previous_vetoes: [] };
}

function postRole(role, body) {
  return new Request(`https://worker.example/${role}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://atelier.example.com" }, body: JSON.stringify(body) });
}

const GROQ_ENV = { ALLOWED_ORIGINS: "https://atelier.example.com", GROQ_API_KEY: "server-only" };

function globalOutputFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];
// FINAL-INTEGRATION : forme post-X2-C.4 (candidates matérialisées, 6 familles/7 champs), jamais la
// forme historique {alternatives_reviewed, available_alternative} -- même helper que R5.2 (référence).
function candidateFor(treatment, isAccepted) {
  return isAccepted
    ? { candidate_action: `Action via ${treatment}.`, applicable: true, preserves_objective: true, requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: true, justification: "ok" }
    : { candidate_action: null, applicable: false, preserves_objective: false, requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: false, justification: "non" };
}
function batchEntryFor(issueIds, available) {
  const out = {};
  for (const id of issueIds) {
    out[id] = { candidates: Object.fromEntries(LADDER.map((t) => [t, candidateFor(t, t === available)])) };
  }
  return out;
}

function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqResponse(contentObj, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status });
}

// --- R1-1/R1-2 : le runtime n'appelle plus le monolithique par défaut -----------------------------

test("R1-1 (Groq) : le rôle critic, sur le routage HTTP réel, n'utilise plus CRITIC_SYSTEM_PROMPT (monolithique) mais CRITIC_GLOBAL_SYSTEM_PROMPT", async (t) => {
  let captured;
  withGroqFetch(t, async (url, options) => { captured = JSON.parse(options.body); return groqResponse(globalOutputFixture()); });
  const response = await groqWorker.fetch(postRole("critic", criticBody(0)), GROQ_ENV);
  assert.equal(response.status, 200);
  assert.equal(captured.messages[0].content, CRITIC_GLOBAL_SYSTEM_PROMPT);
  assert.notEqual(captured.messages[0].content, CRITIC_SYSTEM_PROMPT);
  assert.doesNotMatch(captured.messages[0].content, /FORME DE question_substitution_review/);
});

test("R1-2 (Workers AI) : le rôle critic, sur le routage HTTP réel, n'utilise plus CRITIC_SYSTEM_PROMPT (monolithique) mais CRITIC_GLOBAL_SYSTEM_PROMPT", async () => {
  let captured;
  const env = { ALLOWED_ORIGINS: "https://atelier.example.com", AI: { run: async (model, options) => { captured = options; return { response: globalOutputFixture() }; } } };
  const response = await workersAIWorker.fetch(postRole("critic", criticBody(0)), env);
  assert.equal(response.status, 200);
  assert.equal(captured.messages[0].content, CRITIC_GLOBAL_SYSTEM_PROMPT);
  assert.notEqual(captured.messages[0].content, CRITIC_SYSTEM_PROMPT);
});

// --- R1-3/R1-4 : N=0 -> global seulement, zéro batch --------------------------------------------

test("R1-3 (Groq) : N=0 -> un seul appel réseau (Critic global), aucun batch", async (t) => {
  let calls = 0;
  withGroqFetch(t, async (url, options) => { calls += 1; return groqResponse(globalOutputFixture()); });
  const response = await groqWorker.fetch(postRole("critic", criticBody(0)), GROQ_ENV);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  const body = await response.json();
  assert.deepEqual(body.question_substitution_review, []);
  assert.equal(body.agreement, "agree");
});

test("R1-4 (Workers AI) : N=0 -> un seul appel réseau (Critic global), aucun batch", async () => {
  let calls = 0;
  const env = { ALLOWED_ORIGINS: "https://atelier.example.com", AI: { run: async () => { calls += 1; return { response: globalOutputFixture() }; } } };
  const response = await workersAIWorker.fetch(postRole("critic", criticBody(0)), env);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

// --- R1-5/R1-6 : N=1 -> global + 1 batch ---------------------------------------------------------

test("R1-5 (Groq) : N=1 -> global + exactement 1 appel batch, cardinalité exacte", async (t) => {
  const calls = [];
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    return groqResponse(batchEntryFor(["issue1"], "estimate"));
  });
  const response = await groqWorker.fetch(postRole("critic", criticBody(1)), GROQ_ENV);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].response_format.json_schema.name, "substitution_review_batch");
  const body = await response.json();
  assert.equal(body.question_substitution_review.length, 1);
  assert.equal(body.question_substitution_review[0].issue_id, "issue1");
});

test("R1-6 (Workers AI) : N=1 -> global + exactement 1 appel batch, cardinalité exacte", async () => {
  const calls = [];
  const env = {
    ALLOWED_ORIGINS: "https://atelier.example.com",
    AI: {
      run: async (model, options) => {
        calls.push(options);
        if (options.messages[0].content === CRITIC_GLOBAL_SYSTEM_PROMPT) return { response: globalOutputFixture() };
        return { response: batchEntryFor(["issue1"], "estimate") };
      }
    }
  };
  const response = await workersAIWorker.fetch(postRole("critic", criticBody(1)), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const body = await response.json();
  assert.equal(body.question_substitution_review.length, 1);
});

// --- R1-7/R1-8 : N=4, capacité réelle produisant >=2 batches ---------------------------------------
//
// Appel DIRECT de runCriticWithGroq/runCriticWithWorkersAI (la fonction de production réelle, celle
// que fetch()/execute() invoque) plutôt qu'un aller-retour HTTP complet : l'endpoint /critic impose
// par ailleurs un plafond de 8192 octets sur le CORPS DE REQUÊTE ENTRANT (readJsonBody,
// decision-core.js, contrainte pré-existante et sans rapport avec X2-BATCH) qui interdirait tout
// contexte assez volumineux pour forcer réellement 2 batches sous la capacité par lot (24400
// caractères) — cf. rapport R1, risque résiduel documenté. Contourner ce plafond HTTP, orthogonal au
// pipeline critic lui-même, permet de prouver le mécanisme de batching réel sans dépendre d'une
// limite indépendante.

test("R1-7 (Groq) : N=4 avec un contexte réaliste volumineux -> la capacité réelle du runtime produit au moins 2 batches, assemblage final valide", async (t) => {
  const calls = [];
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    return groqResponse(batchEntryFor(issueIds, null));
  });
  const output = await runCriticWithGroq(criticBody(4, { descLen: 2000 }), { GROQ_API_KEY: "server-only" });
  const batchCalls = calls.filter((c) => c.response_format.json_schema.name === "substitution_review_batch");
  assert.ok(batchCalls.length >= 2, `attendu au moins 2 appels batch réels, obtenu ${batchCalls.length}.`);
  const coveredIds = batchCalls.flatMap((c) => Object.keys(c.response_format.json_schema.schema.properties));
  assert.deepEqual(coveredIds.sort(), ["issue1", "issue2", "issue3", "issue4"]);
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
});

test("R1-8 (Workers AI) : N=4 avec un contexte réaliste volumineux -> la capacité réelle du runtime produit au moins 2 batches, assemblage final valide", async () => {
  const calls = [];
  const env = {
    AI: {
      run: async (model, options) => {
        calls.push(options);
        if (options.messages[0].content === CRITIC_GLOBAL_SYSTEM_PROMPT) return { response: globalOutputFixture() };
        const issueIds = Object.keys(options.response_format.json_schema.properties);
        return { response: batchEntryFor(issueIds, null) };
      }
    }
  };
  const output = await runCriticWithWorkersAI(criticBody(4, { descLen: 2000 }), env);
  const batchCalls = calls.filter((c) => c.messages[0].content === SUBSTITUTION_REVIEW_SYSTEM_PROMPT);
  assert.ok(batchCalls.length >= 2, `attendu au moins 2 appels batch réels, obtenu ${batchCalls.length}.`);
  assert.equal(output.question_substitution_review.length, 4);
});

// --- R1-9/R1-10 : panne batch -> échec technique explicite, jamais degraded_state/agreement fabriqué --

test("R1-9 (Groq) : panne du batch (N=1, via le routage HTTP réel handleRoleRequest) -> 502 role_provider_failure, jamais degraded_state/agreement fabriqué, OPRIE non contourné", async (t) => {
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    return groqResponse({ error: { code: "server_error", message: "boom" } }, 500);
  });
  const response = await groqWorker.fetch(postRole("critic", criticBody(1)), GROQ_ENV);
  assert.equal(response.status, 502);
  const responseBody = await response.json();
  assert.equal(responseBody.error, "role_provider_failure");
  for (const forbidden of ["state", "operational_request_ready", "clarification_required", "blocked", "degraded_state", "agreement", "question_substitution_review"]) {
    assert.equal(forbidden in responseBody, false, `la réponse de panne ne doit jamais contenir la clé "${forbidden}".`);
  }
});

test("R1-10 (Workers AI) : panne du batch (N=1, via le routage HTTP réel handleRoleRequest) -> 502 role_provider_failure, jamais degraded_state/agreement fabriqué", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://atelier.example.com",
    AI: {
      run: async (model, options) => {
        if (options.messages[0].content === CRITIC_GLOBAL_SYSTEM_PROMPT) return { response: globalOutputFixture() };
        throw new Error("Workers AI indisponible pour ce batch.");
      }
    }
  };
  const response = await workersAIWorker.fetch(postRole("critic", criticBody(1)), env);
  assert.equal(response.status, 502);
  const responseBody = await response.json();
  assert.equal(responseBody.error, "role_provider_failure");
  for (const forbidden of ["degraded_state", "agreement", "question_substitution_review"]) {
    assert.equal(forbidden in responseBody, false);
  }
});

// --- R1-11/R1-12 : le mécanisme monolithique reste intact, explicitement en legacy/rollback --------

test("R1-11 (Groq) : runRoleWithGroq(\"critic\", ...) — chemin monolithique legacy — reste pleinement fonctionnel, byte-identique à avant R1", async (t) => {
  let captured;
  withGroqFetch(t, async (url, options) => { captured = JSON.parse(options.body); return groqResponse({
    agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [], illegitimate_question_found: []
  }); });
  const output = await runRoleWithGroq("critic", criticBody(0), { GROQ_API_KEY: "server-only" });
  assert.equal(captured.messages[0].content, CRITIC_SYSTEM_PROMPT);
  assert.equal(output.agreement, "agree");
});

test("R1-12 (Workers AI) : runRoleWithWorkersAI(\"critic\", ...) — chemin monolithique legacy — reste pleinement fonctionnel", async () => {
  let captured;
  const env = { AI: { run: async (model, options) => { captured = options; return { response: {
    agreement: "agree", operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: [], illegitimate_question_found: []
  } }; } } };
  const output = await runRoleWithWorkersAI("critic", criticBody(0), env);
  assert.equal(captured.messages[0].content, CRITIC_SYSTEM_PROMPT);
  assert.equal(output.agreement, "agree");
});

// --- R1-13 : aucun double chemin production involontaire -----------------------------------------

// HA-02 : l'invariant protégé par ce test est INCHANGÉ — « critic ne peut être routé que vers le
// pipeline batché, par UNE seule décision de routage, jamais deux branches concurrentes ». Seule sa
// PORTÉE de vérification s'élargit : depuis HA-02, la décision de routage critic vit dans
// runRoleWithHaChain (qui choisit le pipeline batché comme unité de failover) et non plus dans le
// corps de executeForRole, lequel se contente désormais de déléguer les trois rôles à la chaîne HA.
// Vérifier l'unicité sur TOUT le fichier est strictement plus fort que sur le seul corps de
// executeForRole : aucune seconde branche critic ne peut se cacher ailleurs. Aucun assouplissement.
test("R1-13 (portée élargie HA-02) : le routage fetch() ne peut router critic que vers le pipeline batché — une seule fonction de sélection (executeForRole) et UNE SEULE décision de routage critic dans tout le fichier, jamais deux branches concurrentes", () => {
  for (const [label, path] of [["groq", groqSrcPath], ["workers-ai", workersAiSrcPath]]) {
    const source = fs.readFileSync(path, "utf8");
    const executeForRoleMatches = source.match(/function executeForRole\(/g) || [];
    assert.equal(executeForRoleMatches.length, 1, `${label} : une seule fonction executeForRole attendue.`);
    const criticBranches = source.match(/role === "critic"/g) || [];
    assert.equal(criticBranches.length, 1, `${label} : une seule décision de routage critic attendue dans tout le fichier.`);
  }
});

test("R1-14 : analyst et arbiter restent routés vers le chemin générique mono-call inchangé (non concernés par X2-BATCH)", async (t) => {
  let captured;
  withGroqFetch(t, async (url, options) => { captured = JSON.parse(options.body); return groqResponse({
    operational_request_candidate: createEmptyCandidate(), provenance_records: [], issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  }); });
  const response = await groqWorker.fetch(postRole("analyst", { original_request: "x", clarification_history: [] }), GROQ_ENV);
  assert.equal(response.status, 200);
  assert.equal(captured.messages[0].content, ANALYST_SYSTEM_PROMPT);
});

// --- R1-15 : aucune instruction fantôme dans les prompts actifs -----------------------------------

test("R1-15 : les prompts actifs (Critic global, Substitution Review) ne contiennent aucune instruction fantôme sur why_available", () => {
  for (const prompt of [CRITIC_GLOBAL_SYSTEM_PROMPT, SUBSTITUTION_REVIEW_SYSTEM_PROMPT]) {
    assert.doesNotMatch(prompt, /produisez\s+why_available|why_available\s+séparément|reformul\w*\s+why_available|ne\s+(pas\s+)?recopier\s+.*reason/i);
  }
  // Le schéma réellement envoyé au LLM pour un batch ne demande jamais why_available (dérivé
  // mécaniquement par assembleSubstitutionReviews, jamais produit par le LLM).
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /"why_available"/);
});

// --- R1-16 : capability formalisée, aucune constante métier invisible ----------------------------

test("R1-16 : les deux adaptateurs provider formalisent leur capacité dans un objet nommé unique, exposant tous les paramètres attendus", () => {
  for (const [label, path, constName] of [["groq", groqSrcPath, "GROQ_CRITIC_CAPABILITY"], ["workers-ai", workersAiSrcPath, "WORKERS_AI_CRITIC_CAPABILITY"]]) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, new RegExp(`const ${constName} = Object\\.freeze\\(`), `${label} : capacité non trouvée sous un nom explicite unique.`);
    for (const field of ["input_budget", "tpm_budget", "rpm_budget", "fixed_output_units", "per_target_output_units", "completion_safety_factor", "min_completion_units", "max_completion_units"]) {
      assert.match(source, new RegExp(`${field}\\s*:`), `${label} : champ de capacité manquant : ${field}.`);
    }
  }
});

// --- R1-17 : aucune constante provider dans le core (régression) --------------------------------

test("R1-17 : le câblage runtime (capacité provider, orchestration réseau critic) vit exclusivement dans les adaptateurs, jamais dans operational-request-core.js", () => {
  // operational-request-core.js contient déjà, avant R1, quelques mentions légitimes et
  // pré-existantes de "Groq" en documentation (compatibilité JSON Schema strict, cf. X2-A/X2-B) —
  // un bannissement total du mot serait un faux positif. R1 vérifie plutôt l'absence des ÉLÉMENTS
  // DE CÂBLAGE RUNTIME eux-mêmes (jamais définis ici, toujours dans les adaptateurs) et l'absence de
  // toute NOUVELLE référence provider dans le code introduit par X2-BATCH (déjà couvert par XB-35).
  const corePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(corePath, "utf8");
  for (const forbidden of ["GROQ_CRITIC_CAPABILITY", "WORKERS_AI_CRITIC_CAPABILITY", "runCriticWithGroq", "runCriticWithWorkersAI", "GROQ_ENDPOINT", "\\bfetch\\(", "env\\.AI\\.run"]) {
    assert.doesNotMatch(source, new RegExp(forbidden), `operational-request-core.js ne doit jamais contenir de câblage runtime provider (${forbidden}).`);
  }
});
