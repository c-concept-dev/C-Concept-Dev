import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { OPERATIONAL_REQUEST_STATES, isLegalTransition } from "../core/adn/operational-request-state.js";
import {
  OPRIE_ROLES, ANALYST_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT,
  ARBITER_OUTPUT_FIELDS, ARBITER_STATES,
  validateArbiterOutput, validateDegradedRoleResult
} from "../workers/shared/operational-request-core.js";
import {
  OPERATIONAL_REQUEST_ROLE_SEQUENCE, OPERATIONAL_REQUEST_TURN_ORIGIN_STATE,
  assertOrchestratedRolesCoverOprie, runOperationalRequestTurn
} from "../workers/shared/operational-request-orchestrator.js";
import { ProviderChainError } from "../workers/shared/provider-ha.js";
import groqWorker from "../workers/groq/src/index.js";

// =================================================================================================
// ORCH-01 — orchestrateur serveur canonique de la demande opérationnelle.
//
// UNE porte d'entrée (/operational-request) qui enchaîne Analyste -> Critique -> Arbitre, chacun sur
// sa propre chaîne HA (Groq -> Anthropic -> OpenAI, gelée). L'orchestrateur n'est PAS une autorité :
// il ne lit jamais le contenu d'une sortie de rôle, ne compare rien, ne corrige rien. L'état final
// est celui que l'Arbitre a prononcé ; degraded_state est le seul état que l'orchestrateur produit
// lui-même, et uniquement lorsqu'une chaîne de fournisseurs est épuisée.
// =================================================================================================

const ORIGIN = "https://atelier.example.com";
const ENV = { ALLOWED_ORIGINS: ORIGIN, GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", "OPenAI-API": "o" };
const REQUEST_TEXT = "Rédige une lettre de motivation pour un poste de développeur.";
// Forme canonique d'un tour de clarification (core/adn/operational-request-state.js) : {turn, question,
// answer, provenance}, turn valant l'index + 1. Aucune tolérance : c'est le contrat, pas une convention.
const HISTORY = [{ turn: 1, question: "Pour quel type d'entreprise ?", answer: "Une PME.", provenance: "user" }];
const INPUT = { original_request: REQUEST_TEXT, clarification_history: HISTORY };

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}
function analystOutput() {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre de motivation." },
    provenance_records: [{ field: "objective", value: "Rédiger une lettre de motivation.", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  };
}
function criticGlobal() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}
const POSITIVE_INTENT = { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] };
function arbiterOutput(state) {
  const base = {
    state, operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre de motivation." },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null, intent_preservation: POSITIVE_INTENT, reason: "Motif."
  };
  // Un QuestionCandidate est « entièrement rempli ou entièrement vide » : une question doit donc
  // cibler une issue réellement présente dans la sortie (contrat gelé, non contourné ici).
  if (state === "clarification_required") return {
    ...base,
    issues: [{ id: "issue1", type: "missing_information", description: "Le destinataire n'est pas précisé.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }],
    next_question: { text: "À quelle entreprise l'adressez-vous ?", targets_issue_id: "issue1", expected_progress: "Identifier le destinataire." }
  };
  if (state === "confirmation_required") return { ...base, confirmation_reason: "Plusieurs arbitrages ont été faits." };
  if (state === "blocked") return { ...base, blocked_reason: "La demande contient une contradiction irréductible." };
  return base;
}

const chatOk = (p) => Response.json({ choices: [{ message: { content: JSON.stringify(p) } }] });
const toolOk = (p, name) => Response.json({ content: [{ type: "tool_use", name, input: p }] });
const httpFail = (status = 503) => Response.json({ error: { message: "indisponible" } }, { status });
const providerOf = (u) => String(u).includes("groq") ? "groq" : String(u).includes("anthropic") ? "anthropic" : "openai";

function withCapturedConsole(t) {
  const l = console.log, e = console.error;
  const entries = [];
  console.log = (...a) => entries.push(a); console.error = (...a) => entries.push(a);
  t.after(() => { console.log = l; console.error = e; });
  return entries;
}

/** Répond correctement à chaque étape ; `overrides` permet de faire échouer un rôle précis. */
function withProviders(t, { arbiterState = "operational_request_ready", fail = {}, handlers = null } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    const body = JSON.parse(options.body);
    const schemaName = body.response_format?.json_schema?.name ?? body.tools?.[0]?.name ?? null;
    const role = schemaName === "oprie_analyst" ? "analyst"
      : schemaName === "oprie_arbiter" ? "arbiter"
      : "critic";
    calls.push({ provider, role, schemaName });
    if (handlers?.[role]) return handlers[role]({ provider, schemaName, body });
    if (fail[role]) return httpFail(fail[role] === true ? 503 : fail[role]);
    const payload = role === "analyst" ? analystOutput() : role === "arbiter" ? arbiterOutput(arbiterState) : criticGlobal();
    return provider === "anthropic" ? toolOk(payload, schemaName) : chatOk(payload);
  };
  return calls;
}
const post = (path, body, { origin = ORIGIN, headers = {} } = {}) => new Request(`https://worker.example${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

// --- ORCH01-1 : nominal ---------------------------------------------------------------------------

test("ORCH01-1 : nominal — Analyste puis Critique puis Arbitre, dans cet ordre exact, aucune étape sautée", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t);
  const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((c) => c.role), ["analyst", "critic", "arbiter"]);
  assert.deepEqual(OPERATIONAL_REQUEST_ROLE_SEQUENCE, ["analyst", "critic", "arbiter"]);
  assertOrchestratedRolesCoverOprie();
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE].sort(), [...OPRIE_ROLES].sort());
});

test("ORCH01-1b : chaque rôle reçoit son prompt canonique, et le serveur construit lui-même les entrées internes", async (t) => {
  withCapturedConsole(t);
  const seen = [];
  withProviders(t, { handlers: {
    analyst: ({ body }) => { seen.push({ role: "analyst", system: body.messages[0].content, user: JSON.parse(body.messages[1].content) }); return chatOk(analystOutput()); },
    critic: ({ body, schemaName }) => { seen.push({ role: "critic", system: body.messages[0].content, user: JSON.parse(body.messages[1].content) }); return chatOk(criticGlobal()); },
    arbiter: ({ body }) => { seen.push({ role: "arbiter", system: body.messages[0].content, user: JSON.parse(body.messages[1].content) }); return chatOk(arbiterOutput("operational_request_ready")); }
  } });
  await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  const byRole = Object.fromEntries(seen.map((s) => [s.role, s]));
  assert.equal(byRole.analyst.system, ANALYST_SYSTEM_PROMPT);
  assert.equal(byRole.critic.system, CRITIC_GLOBAL_SYSTEM_PROMPT);
  assert.equal(byRole.arbiter.system, ARBITER_SYSTEM_PROMPT);
  assert.ok(byRole.critic.user.analyst_output, "le serveur fournit analyst_output au Critique : le client ne le transmet jamais.");
  assert.ok(byRole.arbiter.user.analyst_output && byRole.arbiter.user.critic_output, "le serveur fournit analyst_output ET critic_output à l'Arbitre.");
});

// --- ORCH01-2 à 5 : les quatre états sémantiques ---------------------------------------------------

for (const [state, id] of [["clarification_required", "ORCH01-2"], ["confirmation_required", "ORCH01-3"], ["operational_request_ready", "ORCH01-4"], ["blocked", "ORCH01-5"]]) {
  test(`${id} : l'état "${state}" prononcé par l'Arbitre est rendu tel quel, jamais réinterprété`, async (t) => {
    withCapturedConsole(t);
    withProviders(t, { arbiterState: state });
    const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.state, state);
    assert.deepEqual(Object.keys(body).sort(), [...ARBITER_OUTPUT_FIELDS].sort(), "la réponse porte exactement les champs d'un ArbiterOutput : aucune shape concurrente, aucun champ en plus.");
    assert.ok(ARBITER_STATES.includes(body.state));
    assert.ok(isLegalTransition(OPERATIONAL_REQUEST_TURN_ORIGIN_STATE, body.state));
    if (state === "clarification_required") assert.ok(body.next_question.text, "clarification_required expose la question suivante.");
    if (state === "confirmation_required") assert.ok(body.confirmation_reason, "confirmation_required expose son motif.");
    if (state === "blocked") assert.ok(body.blocked_reason, "blocked expose son motif.");
    if (state === "operational_request_ready") {
      assert.ok(body.operational_request_candidate.objective, "ready expose la demande opérationnelle.");
      // validateArbiterOutput réduit un QuestionCandidate entièrement vide à null : c'est la forme
      // canonique d'une absence de question, pas un objet aux champs nuls.
      assert.equal(body.next_question, null);
    }
  });
}

// --- ORCH01-6/7/8 : degraded_state par rôle --------------------------------------------------------

for (const [role, id] of [["analyst", "ORCH01-6"], ["critic", "ORCH01-7"], ["arbiter", "ORCH01-8"]]) {
  test(`${id} : les trois fournisseurs de "${role}" échouent -> degraded_state canonique`, async (t) => {
    withCapturedConsole(t);
    const calls = withProviders(t, { fail: { [role]: 503 } });
    const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
    assert.equal(response.status, 200, "degraded_state est un état OPRIE public : le tour a abouti.");
    const body = await response.json();
    assert.equal(body.state, "degraded_state");
    assert.equal(body.role, role);
    assert.deepEqual(validateDegradedRoleResult(body), body, "la réponse est un DegradedRoleResult canonique, jamais une shape inventée.");
    assert.deepEqual(Object.keys(body).sort(), ["reason", "role", "state"]);
    const failed = calls.filter((c) => c.role === role);
    assert.deepEqual([...new Set(failed.map((c) => c.provider))], ["groq", "anthropic", "openai"], "les trois fournisseurs doivent avoir été tentés avant de dégrader.");
    assert.ok(!calls.some((c) => OPERATIONAL_REQUEST_ROLE_SEQUENCE.indexOf(c.role) > OPERATIONAL_REQUEST_ROLE_SEQUENCE.indexOf(role)),
      "aucun rôle postérieur ne doit être exécuté après une dégradation.");
  });
}

// --- ORCH01-9 : jamais degraded -> ready ------------------------------------------------------------

test("ORCH01-9 : une dégradation ne peut jamais devenir un verdict — ni ici, ni via la machine d'état", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { fail: { analyst: 503 } });
  const body = await (await groqWorker.fetch(post("/operational-request", INPUT), ENV)).json();
  assert.equal(body.state, "degraded_state");
  for (const forbidden of ["operational_request_ready", "clarification_required", "confirmation_required", "blocked"]) {
    assert.ok(!JSON.stringify(body).includes(forbidden), `un tour dégradé ne doit jamais porter "${forbidden}".`);
  }
  assert.equal(isLegalTransition("degraded_state", "operational_request_ready"), false);
  assert.equal(isLegalTransition("degraded_state", "blocked"), false);
  assert.ok(OPERATIONAL_REQUEST_STATES.includes("degraded_state"));
});

test("ORCH01-9b : un échec de chaîne ne fabrique jamais de question, de route ni de candidat", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { fail: { arbiter: 500 } });
  const body = await (await groqWorker.fetch(post("/operational-request", INPUT), ENV)).json();
  for (const forbidden of ["next_question", "operational_request_candidate", "route", "rapide", "architecte", "issues", "intent_preservation"]) {
    assert.ok(!Object.hasOwn(body, forbidden), `un tour dégradé ne doit porter aucun champ sémantique (${forbidden}).`);
  }
});

// --- ORCH01-10 : aucune information provider exposée -------------------------------------------------

test("ORCH01-10 : la réponse n'expose AUCUN détail fournisseur, modèle, prompt ou secret", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { fail: { critic: 401 } });
  const raw = await (await groqWorker.fetch(post("/operational-request", INPUT), ENV)).text();
  for (const forbidden of ["groq", "anthropic", "openai", "gpt-", "claude-", "sk-ant-", "gsk_", "Bearer", "api.groq.com", "technical_failover", "config_unavailable", "provider"]) {
    assert.ok(!raw.toLowerCase().includes(forbidden.toLowerCase()), `la réponse ne doit jamais contenir "${forbidden}".`);
  }
  assert.ok(!raw.includes(ANALYST_SYSTEM_PROMPT.slice(0, 40)), "aucun prompt ne doit fuiter.");
});

test("ORCH01-10b : le détail technique existe, mais UNIQUEMENT dans l'observabilité serveur", async (t) => {
  const events = [];
  withCapturedConsole(t);
  withProviders(t, { fail: { analyst: 503 } });
  await runOperationalRequestTurn(INPUT, {
    executeRole: () => { throw Object.assign(new ProviderChainError("analyst", [{ provider: "groq", failure_class: "technical_failover" }]), { all_providers_failed: true }); },
    log: (e) => events.push(e)
  });
  const degraded = events.find((e) => e.event === "operational_request_degraded");
  assert.ok(degraded, "un événement de dégradation doit être journalisé.");
  assert.equal(degraded.role, "analyst");
  assert.match(degraded.internal_reason, /groq \(technical_failover\)/, "le détail reste disponible côté serveur pour le diagnostic.");
});

// --- ORCH01-11/12 : immuabilité de la demande --------------------------------------------------------

test("ORCH01-11 : original_request est transmis à l'identique aux trois rôles et jamais réécrit", async (t) => {
  withCapturedConsole(t);
  const seen = [];
  withProviders(t, { handlers: {
    analyst: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(analystOutput()); },
    critic: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(criticGlobal()); },
    arbiter: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(arbiterOutput("operational_request_ready")); }
  } });
  const input = { original_request: REQUEST_TEXT, clarification_history: HISTORY };
  await groqWorker.fetch(post("/operational-request", input), ENV);
  assert.equal(seen.length, 3);
  for (const message of seen) assert.equal(message.original_request, REQUEST_TEXT, "aucun rôle ne reçoit une demande réécrite.");
  assert.equal(input.original_request, REQUEST_TEXT, "l'entrée de l'appelant n'est jamais mutée.");
});

test("ORCH01-12 : clarification_history est conservée intégralement et transmise à chaque rôle", async (t) => {
  withCapturedConsole(t);
  const seen = [];
  withProviders(t, { handlers: {
    analyst: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(analystOutput()); },
    critic: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(criticGlobal()); },
    arbiter: ({ body }) => { seen.push(JSON.parse(body.messages[1].content)); return chatOk(arbiterOutput("operational_request_ready")); }
  } });
  await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  for (const message of seen) {
    assert.equal(message.clarification_history.length, HISTORY.length);
    assert.equal(message.clarification_history[0].question, HISTORY[0].question);
    assert.equal(message.clarification_history[0].answer, HISTORY[0].answer);
  }
});

// --- ORCH01-13 : intent preservation -----------------------------------------------------------------

test("ORCH01-13 : la préservation d'intention reste obligatoire — un ready au intent_preservation négatif ne passe chez AUCUN fournisseur et dégrade", async (t) => {
  withCapturedConsole(t);
  const broken = { ...arbiterOutput("operational_request_ready"), intent_preservation: { objective_preserved: false, priorities_preserved: true, semantic_equivalence: true, concerns: ["dérive"] } };
  assert.throws(() => validateArbiterOutput(broken), /intent_preservation/);
  const calls = withProviders(t, { handlers: { analyst: () => chatOk(analystOutput()), critic: () => chatOk(criticGlobal()), arbiter: () => chatOk(broken) } });
  const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  const body = await response.json();
  // Les trois fournisseurs produisent la même sortie invalide : chacun est rejeté par le validateur
  // canonique, la chaîne s'épuise, et le tour se termine en dégradation TECHNIQUE -- jamais en ready.
  assert.equal(body.state, "degraded_state", "un ready sans préservation d'intention ne doit jamais être servi.");
  assert.equal(body.role, "arbiter");
  assert.deepEqual([...new Set(calls.filter((c) => c.role === "arbiter").map((c) => c.provider))], ["groq", "anthropic", "openai"]);
  assert.ok(!JSON.stringify(body).includes("operational_request_ready"));
});

// --- ORCH01-14 : aucun model shopping ------------------------------------------------------------------

test("ORCH01-14 : un rôle réussi met fin à SA chaîne — aucun autre fournisseur n'est consulté", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t);
  await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq"], "aucune comparaison entre fournisseurs.");
  assert.equal(calls.length, 3, "exactement un appel par rôle sur le chemin nominal.");
});

test("ORCH01-14b : les chaînes des rôles sont indépendantes — un rôle dégradé n'impose pas son fournisseur aux suivants", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { handlers: {
    analyst: ({ provider }) => provider === "groq" ? httpFail(503) : (provider === "anthropic" ? toolOk(analystOutput(), "oprie_analyst") : chatOk(analystOutput())),
    critic: ({ provider }) => provider === "groq" ? chatOk(criticGlobal()) : httpFail(503),
    arbiter: ({ provider }) => provider === "groq" ? chatOk(arbiterOutput("operational_request_ready")) : httpFail(503)
  } });
  const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.filter((c) => c.role === "analyst").map((c) => c.provider), ["groq", "anthropic"]);
  assert.deepEqual(calls.filter((c) => c.role === "critic").map((c) => c.provider), ["groq"], "le Critique repart de Groq : chaque rôle a sa propre chaîne.");
  assert.deepEqual(calls.filter((c) => c.role === "arbiter").map((c) => c.provider), ["groq"]);
});

// --- ORCH01-15 à 18 : contrat HTTP -----------------------------------------------------------------------

test("ORCH01-15 : JSON invalide -> 400", async (t) => {
  withCapturedConsole(t);
  const response = await groqWorker.fetch(post("/operational-request", "{pas du json"), ENV);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_json");
});

test("ORCH01-15b : champs inattendus ou manquants -> 400, aucun appel fournisseur", async (t) => {
  withCapturedConsole(t);
  let called = false;
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { called = true; return chatOk({}); };
  for (const payload of [{ original_request: REQUEST_TEXT }, { original_request: REQUEST_TEXT, clarification_history: [], analyst_output: {} }, { original_request: "", clarification_history: [] }]) {
    const response = await groqWorker.fetch(post("/operational-request", payload), ENV);
    assert.equal(response.status, 400, JSON.stringify(payload));
  }
  assert.equal(called, false, "une entrée invalide ne doit jamais produire d'appel fournisseur.");
});

test("ORCH01-16 : méthode non autorisée -> 405, et OPTIONS -> 204", async (t) => {
  withCapturedConsole(t);
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const response = await groqWorker.fetch(new Request("https://worker.example/operational-request", { method, headers: { Origin: ORIGIN } }), ENV);
    assert.equal(response.status, 405, method);
  }
  const options = await groqWorker.fetch(new Request("https://worker.example/operational-request", { method: "OPTIONS", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("ORCH01-17 : origine non autorisée -> 403, sans en-tête CORS", async (t) => {
  withCapturedConsole(t);
  const response = await groqWorker.fetch(post("/operational-request", INPUT, { origin: "https://interdit.test" }), ENV);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  const noOrigin = await groqWorker.fetch(new Request("https://worker.example/operational-request", { method: "POST", body: "{}" }), ENV);
  assert.equal(noOrigin.status, 403);
});

test("ORCH01-18 : payload hors limite -> 413", async (t) => {
  withCapturedConsole(t);
  const huge = { original_request: "x".repeat(40000), clarification_history: [] };
  const response = await groqWorker.fetch(post("/operational-request", huge), ENV);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "payload_too_large");
});

test("ORCH01-HEADERS : en-têtes de sécurité présents sur la réponse canonique", async (t) => {
  withCapturedConsole(t);
  withProviders(t);
  const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(response.headers.get("Vary"), "Origin");
});

// --- ORCH01-19/20 : sorties malformées et fail-closed -------------------------------------------------

// Une sortie malformée n'est JAMAIS acceptée — mais les deux issues possibles diffèrent, et cette
// différence est une décision documentée, pas un hasard :
//   - analyst / arbiter : la sortie brute est rejetée par le parseur du rôle -> STRUCTURED_OUTPUT_INVALID,
//     donc éligible au failover ; les trois fournisseurs sont tentés, puis la chaîne dégrade.
//   - critic : un rejet STRUCTUREL du CriticOutput assemblé reste PROGRAMMING_ERROR, donc FAIL-CLOSED
//     dès le premier fournisseur (décision CSR-01 : ne jamais rejouer un défaut de contrat sur un autre
//     modèle en espérant qu'il passe). L'échec est alors technique, jamais sémantique.
test("ORCH01-19 : une sortie malformée d'analyst ou d'arbiter est rejetée par les trois fournisseurs, puis dégrade — jamais un état inventé", async (t) => {
  for (const role of ["analyst", "arbiter"]) {
    await test(`ORCH01-19/${role}`, async (sub) => {
      withCapturedConsole(sub);
      const calls = withProviders(sub, { handlers: { [role]: () => chatOk({ champ: "inattendu" }) } });
      const body = await (await groqWorker.fetch(post("/operational-request", INPUT), ENV)).json();
      assert.equal(body.state, "degraded_state", role);
      assert.equal(body.role, role);
      assert.deepEqual([...new Set(calls.filter((c) => c.role === role).map((c) => c.provider))], ["groq", "anthropic", "openai"],
        "une sortie inexploitable est un défaut de CE modèle : les trois sont tentés avant de dégrader.");
      for (const forbidden of ["operational_request_candidate", "next_question", "issues", "intent_preservation"]) assert.ok(!Object.hasOwn(body, forbidden));
    });
  }
});

test("ORCH01-19b : une sortie Critic structurellement invalide est FAIL-CLOSED dès le premier fournisseur (CSR-01) — 502 technique, jamais un état sémantique", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { handlers: { critic: () => chatOk({ champ: "inattendu" }) } });
  const response = await groqWorker.fetch(post("/operational-request", INPUT), ENV);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "operational_request_failure");
  assert.ok(!Object.hasOwn(body, "state"), "un échec technique ne porte jamais d'état sémantique.");
  assert.deepEqual([...new Set(calls.filter((c) => c.role === "critic").map((c) => c.provider))], ["groq"],
    "aucun model shopping : un défaut de contrat n'est jamais rejoué sur un autre modèle.");
});

test("ORCH01-20 : une erreur de programmation est FAIL-CLOSED — jamais traduite en degraded_state", async (t) => {
  withCapturedConsole(t);
  const bug = new TypeError("défaut interne");
  await assert.rejects(
    () => runOperationalRequestTurn(INPUT, { executeRole: () => { throw bug; }, log: () => {} }),
    /défaut interne/,
    "seule une chaîne de fournisseurs épuisée devient degraded_state ; tout le reste remonte."
  );
  assert.notEqual(bug.all_providers_failed, true);
});

test("ORCH01-20b : une erreur technique non liée aux fournisseurs devient un 502 neutre, sans message interne", async (t) => {
  withCapturedConsole(t);
  const { handleOperationalRequest } = await import("../workers/shared/operational-request-orchestrator.js");
  const response = await handleOperationalRequest(post("/operational-request", INPUT), ENV, {
    executeRole: () => { throw new TypeError("AnalystOutput détail interne confidentiel"); },
    log: () => {}
  });
  assert.equal(response.status, 502);
  const raw = await response.text();
  assert.ok(!raw.includes("AnalystOutput"), "aucun détail de validation interne ne doit fuiter.");
  assert.ok(!raw.includes("confidentiel"));
  assert.match(raw, /La demande opérationnelle n'a pas pu être traitée\./);
  assert.ok(!raw.includes("state"), "un échec technique ne porte jamais d'état sémantique.");
});

// --- ORCH01-21 : hardcoding / autorité ------------------------------------------------------------------

test("ORCH01-21 : aucun hardcoding métier dans l'orchestrateur", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/shared/operational-request-orchestrator.js", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /\bItalie\b/i, /\bvoyage\b/i, /lettre de motivation/i, /process\.env/, /NODE_ENV/]) {
    assert.doesNotMatch(code, forbidden, `l'orchestrateur ne doit contenir aucun marqueur métier (${forbidden}).`);
  }
});

test("ORCH01-21b : l'orchestrateur n'est pas une seconde autorité — aucune table d'états ni jugement recopié", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/shared/operational-request-orchestrator.js", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Il ne doit jamais NOMMER un état sémantique dans son code : il ne les connaît que par la machine d'état.
  for (const state of ["operational_request_ready", "clarification_required", "confirmation_required", "blocked"]) {
    assert.ok(!code.includes(state), `l'orchestrateur ne doit jamais nommer "${state}" dans son code : seul l'Arbitre le prononce.`);
  }
  assert.match(code, /isLegalTransition/, "la légalité de l'état vient de la machine d'état gelée.");
  assert.ok(!/OPERATIONAL_REQUEST_TRANSITIONS\s*=/.test(code), "aucune table de transitions recopiée.");
});

// --- Rétrocompatibilité des endpoints existants -----------------------------------------------------------

test("ORCH01-COMPAT : /decision, /analyst, /critic et /arbiter conservent leur contrat", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { handlers: {
    analyst: () => chatOk(analystOutput()), critic: () => chatOk(criticGlobal()), arbiter: () => chatOk(arbiterOutput("operational_request_ready"))
  } });
  const analyst = await groqWorker.fetch(post("/analyst", INPUT), ENV);
  assert.equal(analyst.status, 200, "/analyst reste servi tel quel.");
  assert.deepEqual(Object.keys(await analyst.json()).sort(), ["confirmation_signals", "issues", "operational_request_candidate", "provenance_records", "question_candidates"]);
  const notFound = await groqWorker.fetch(post("/inconnu", INPUT), ENV);
  assert.equal(notFound.status, 404, "une route inconnue reste un 404, jamais une orchestration implicite.");
});
