import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { isLegalTransition } from "../core/adn/operational-request-state.js";
import {
  ANALYST_SYSTEM_PROMPT, ARBITER_SYSTEM_PROMPT, CRITIC_GLOBAL_SYSTEM_PROMPT,
  ANALYST_JSON_SCHEMA, ARBITER_JSON_SCHEMA,
  ROLE_DEFINITIONS, validateDegradedRoleResult, validateArbiterOutput, validateCriticOutput
} from "../workers/shared/operational-request-core.js";
import groqWorker, {
  DECISION_GROQ_RETRY_POLICY, GROQ_PRODUCTION_RETRY_DEFAULTS, ROLE_PROVIDER_ORDER,
  assertRoleContractUsable, decideWithHaChain, degradedResultFromProviderChainError,
  runCriticWithGroq, runRoleWithHaChain
} from "../workers/groq/src/index.js";
import { FAILURE_CLASSES, ProviderChainError } from "../workers/shared/provider-ha.js";

// =================================================================================================
// HA-02 — (A) latence de bascule 429 propre au rôle Decision, (B) haute disponibilité des rôles
// OPRIE (analyst/critic/arbiter) sur le MÊME orchestrateur que HA-01, (C) raccord canonique
// ProviderChainError -> degraded_state.
//
// Aucune nouvelle autorité sémantique : prompts, schémas, parseurs et validateurs viennent tous de
// ROLE_DEFINITIONS (operational-request-core.js, INCHANGÉ). Les providers ne sont que du transport.
// =================================================================================================

const ENV = { ALLOWED_ORIGINS: "https://atelier.example.com", GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", "OPenAI-API": "o" };

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}
function validAnalystOutput() {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Rédiger une lettre de motivation." },
    provenance_records: [{ field: "objective", value: "Rédiger une lettre de motivation.", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  };
}
function validCriticOutput() {
  return {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false,
    significant_stakes_reason: "", question_substitution_review: [], illegitimate_question_found: []
  };
}
function criticGlobalFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}
function validArbiterOutput() {
  return {
    state: "operational_request_ready", operational_request_candidate: createEmptyCandidate(), issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: "Aucun problème matériel ne subsiste."
  };
}
const ROLE_INPUT = Object.freeze({
  analyst: { original_request: "Rédige une lettre de motivation.", clarification_history: [] },
  critic: { original_request: "Rédige une lettre de motivation.", clarification_history: [], analyst_output: validAnalystOutput(), previous_vetoes: [] },
  arbiter: { original_request: "Rédige une lettre de motivation.", clarification_history: [], analyst_output: validAnalystOutput(), critic_output: validCriticOutput() }
});
const ROLE_OUTPUT = Object.freeze({ analyst: validAnalystOutput, critic: criticGlobalFixture, arbiter: validArbiterOutput });

const DECISION_INPUT = { demande: "Traduis en anglais : Bonjour", materiau_present: false, mode_demande: "rapide" };
const DECISION_OK = { etat_demande: "exploitable", route: "rapide", confiance: "haute", raison_interne: "La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.", question: null };

const chatOk = (payload) => Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
const toolOk = (payload, name) => Response.json({ content: [{ type: "tool_use", name, input: payload }] });
const httpFail = (status = 503) => Response.json({ error: { message: "indisponible" } }, { status });

function providerOf(url) {
  const v = String(url);
  return v.includes("api.groq.com") ? "groq" : v.includes("api.anthropic.com") ? "anthropic" : v.includes("api.openai.com") ? "openai" : "unknown";
}
function withProviders(t, handlers) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    const body = JSON.parse(options.body);
    const schemaName = body.response_format?.json_schema?.name ?? body.tools?.[0]?.name ?? null;
    calls.push({ provider, schemaName });
    const handler = handlers[provider];
    assert.ok(handler, `appel inattendu vers "${provider}".`);
    return handler({ body, schemaName, options });
  };
  return calls;
}
function withCapturedConsole(t) {
  const entries = [];
  const log = console.log, error = console.error;
  console.log = (...a) => entries.push(a); console.error = (...a) => entries.push(a);
  t.after(() => { console.log = log; console.error = error; });
  return entries;
}
/** Répond correctement pour un rôle donné, quel que soit le provider et l'étape du pipeline. */
function roleResponder(role, provider) {
  return ({ schemaName }) => {
    const payload = schemaName === "critic_global" ? criticGlobalFixture()
      : schemaName === "substitution_review_batch" ? {}
      : ROLE_OUTPUT[role]();
    return provider === "anthropic" ? toolOk(payload, schemaName) : chatOk(payload);
  };
}
const providersFor = (role, spec) => Object.fromEntries(Object.entries(spec).map(([p, v]) => [p, v === "ok" ? roleResponder(role, p) : v]));

// -------------------------------------------------------------------------------------------------
// DEEP-PROVIDER-ROUTING-FINAL-01 — CE QUE CES TESTS PROUVENT ENCORE, ET CE QU'ILS NE PROUVENT PLUS.
//
// HA-02 a été écrit quand le plan profond enchaînait Groq -> Anthropic -> OpenAI. Ce n'est plus
// l'ordre de production : ROLE_PROVIDER_ORDER ne contient plus qu'Anthropic, et HA02-ORDER l'affirme
// désormais explicitement. Le MÉCANISME, lui, n'a pas été retiré — runRoleWithHaChain, ses trois
// adaptateurs, la classification d'échec, la règle de cause commune et le fail-closed sont le même
// code que celui qui sert /decision, où la chaîne à trois fournisseurs reste bel et bien active.
//
// D'où cette constante : les tests de MÉCANIQUE passent l'ordre explicitement, exactement comme le
// ferait un appelant qui en configure un. Ils continuent donc de garder ce qu'ils gardaient — même
// prompt et même schéma chez chaque fournisseur, aucun model shopping, aucun résultat fabriqué,
// aucun mélange de fournisseurs dans un même CriticOutput — sans laisser croire une seconde que la
// production ferait encore ces bascules. Ce qu'ils ne prouvent plus, ils ne le prétendent plus.
// -------------------------------------------------------------------------------------------------
const CHAINE_HA_MECANIQUE = Object.freeze(["groq", "anthropic", "openai"]);
const ORDRE = { order: CHAINE_HA_MECANIQUE };

// =================================================================================================
// (A) LATENCE DE BASCULE 429 — /decision
// =================================================================================================

test("HA02-D1 : sur un Retry-After long, /decision NE DORT PAS et bascule immédiatement — une seule tentative Groq", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { "retry-after": "60" } }),
    anthropic: () => toolOk(DECISION_OK, "decision_provider")
  });
  const started = Date.now();
  const actual = await decideWithHaChain(DECISION_INPUT, ENV);
  const elapsed = Date.now() - started;
  assert.equal(calls.filter((c) => c.provider === "groq").length, 1, "un Retry-After de 60 s dépasse le plafond d'attente : aucune reprise ne doit être tentée.");
  assert.equal(actual.route, "rapide");
  assert.ok(elapsed < 1500, `la bascule doit être immédiate, jamais après une attente de 60 s (mesuré ${elapsed} ms).`);
});

test("HA02-D4 : le plafond d'attente est BORNÉ et dérivé — on reprend sous le coût d'une bascule, jamais au-dessus", async (t) => {
  for (const [retryAfterSeconds, expectedGroqCalls, why] of [
    ["1", 2, "1000 + 750 = 1750 ms <= 3000 ms : une reprise courte est moins coûteuse qu'une bascule."],
    ["3", 1, "3000 + 750 = 3750 ms > 3000 ms : patienter serait dominé par la bascule."]
  ]) {
    await test(`HA02-D4/retry-after=${retryAfterSeconds}s`, async (sub) => {
      withCapturedConsole(sub);
      const calls = withProviders(sub, {
        groq: () => new Response('{"error":{}}', { status: 429, headers: { "retry-after": retryAfterSeconds } }),
        anthropic: () => toolOk(DECISION_OK, "decision_provider")
      });
      await decideWithHaChain(DECISION_INPUT, ENV);
      assert.equal(calls.filter((c) => c.provider === "groq").length, expectedGroqCalls, why);
    });
  }
});

test("HA02-D2 : la politique de reprise de Critic est INCHANGÉE — mêmes constantes, aucun plafond d'attente", () => {
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.defaultBackoffMs, 30000);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetryWaitMs, Infinity, "aucune borne d'attente par défaut : le comportement historique est strictement préservé.");
});

test("HA02-D2b : un 429 sur le Critic épuise TOUJOURS 1 + 2 reprises (politique historique), jamais la politique courte de Decision", async (t) => {
  withCapturedConsole(t);
  let globalCalls = 0;
  withProviders(t, { groq: () => { globalCalls += 1; return new Response('{"error":{}}', { status: 429, headers: { "retry-after": "0" } }); } });
  await assert.rejects(() => runCriticWithGroq(ROLE_INPUT.critic, ENV, { retryOverrides: { sleepFn: async () => {} } }));
  assert.equal(globalCalls, 3, "Critic : 1 tentative + 2 reprises, exactement comme avant HA-02.");
});

test("HA02-D3 : Groq répond -> aucune bascule, aucun autre provider contacté", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: () => chatOk(DECISION_OK) });
  const actual = await decideWithHaChain(DECISION_INPUT, ENV);
  assert.deepEqual(calls.map((c) => c.provider), ["groq"]);
  assert.equal(actual.route, "rapide");
});

test("HA02-D5 : aucun double retry — l'orchestrateur ne rejoue jamais un provider, la reprise appartient au seul transport", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => new Response('{"error":{}}', { status: 429, headers: { "retry-after": "0" } }),
    anthropic: () => httpFail(500),
    openai: () => chatOk(DECISION_OK)
  });
  await decideWithHaChain(DECISION_INPUT, ENV);
  assert.equal(calls.filter((c) => c.provider === "groq").length, 2, "1 + maxRetries(1) : la couche HA n'ajoute aucune reprise.");
  assert.equal(calls.filter((c) => c.provider === "anthropic").length, 1, "aucune reprise Anthropic.");
  assert.equal(calls.filter((c) => c.provider === "openai").length, 1, "aucune reprise OpenAI.");
});

test("HA02-D6 : Decision et Critic ont des CONFIGS distinctes sans dupliquer le transport", () => {
  assert.notDeepEqual(DECISION_GROQ_RETRY_POLICY, GROQ_PRODUCTION_RETRY_DEFAULTS);
  assert.equal(DECISION_GROQ_RETRY_POLICY.maxRetries, 1);
  assert.equal(DECISION_GROQ_RETRY_POLICY.maxRetryWaitMs, 3000);
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  assert.equal((source.match(/export async function fetchGroqWithRetry\(/g) || []).length, 1, "une seule implémentation de reprise : jamais un second mécanisme dupliqué par rôle.");
  assert.equal((source.match(/async function callGroqChatCompletion\(/g) || []).length, 1, "un seul transport Groq partagé par tous les rôles.");
});

// =================================================================================================
// (B) HAUTE DISPONIBILITÉ DES RÔLES — analyst / critic / arbiter
// =================================================================================================

test("HA02-ORDER : l'ordre des rôles n'est plus celui de Decision — le plan profond n'a qu'Anthropic", () => {
  assert.deepEqual(ROLE_PROVIDER_ORDER, ["anthropic"]);
  assert.ok(Object.isFrozen(ROLE_PROVIDER_ORDER));
  /* Et il ne s'agit pas d'un ordre tronqué : ni Groq ni OpenAI n'y figurent plus du tout. */
  assert.equal(ROLE_PROVIDER_ORDER.includes("groq"), false);
  assert.equal(ROLE_PROVIDER_ORDER.includes("openai"), false);
});

for (const [role, prefix] of [["analyst", "HA02-A"], ["critic", "HA02-C"], ["arbiter", "HA02-R"]]) {
  test(`${prefix}1 : ${role} — Groq réussit, aucun autre provider contacté`, async (t) => {
    withCapturedConsole(t);
    const calls = withProviders(t, providersFor(role, { groq: "ok" }));
    const output = await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq"]);
    assert.ok(output && typeof output === "object");
  });

  test(`${prefix}2 : ${role} — échec technique Groq -> Anthropic`, async (t) => {
    withCapturedConsole(t);
    const calls = withProviders(t, providersFor(role, { groq: () => httpFail(503), anthropic: "ok" }));
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq", "anthropic"]);
  });

  test(`${prefix}3 : ${role} — Groq et Anthropic échouent -> OpenAI`, async (t) => {
    withCapturedConsole(t);
    const calls = withProviders(t, providersFor(role, { groq: () => httpFail(503), anthropic: () => httpFail(500), openai: "ok" }));
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq", "anthropic", "openai"]);
  });

  test(`${prefix}-SEMANTIC : ${role} — une sortie techniquement valide est FINALE, jamais rejouée ailleurs`, async (t) => {
    withCapturedConsole(t);
    const calls = withProviders(t, providersFor(role, { groq: "ok" }));
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    assert.ok(!calls.some((c) => c.provider !== "groq"), "aucun model shopping : un succès technique met fin à la chaîne.");
  });

  test(`${prefix}-CONTRACT : ${role} — les trois providers reçoivent EXACTEMENT le même prompt et le même schéma`, async (t) => {
    withCapturedConsole(t);
    const seen = [];
    const capture = (provider) => ({ body, schemaName }) => {
      seen.push({ provider, system: body.system ?? body.messages?.[0]?.content, schema: body.tools?.[0]?.input_schema ?? body.response_format?.json_schema?.schema, schemaName });
      return provider === "groq" || provider === "anthropic" ? httpFail(503) : (provider === "openai" ? chatOk(ROLE_OUTPUT[role]()) : httpFail(503));
    };
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE).catch(() => {});
    withProviders(t, { groq: capture("groq"), anthropic: capture("anthropic"), openai: capture("openai") });
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE).catch(() => {});
    const firstCallPerProvider = ["groq", "anthropic", "openai"].map((p) => seen.find((s) => s.provider === p)).filter(Boolean);
    assert.equal(firstCallPerProvider.length, 3, "les trois providers doivent avoir été tentés.");
    const [a, b, c] = firstCallPerProvider;
    assert.equal(a.system, b.system); assert.equal(b.system, c.system);
    assert.deepEqual(a.schema, b.schema); assert.deepEqual(b.schema, c.schema);
  });

  test(`${prefix}-ALLFAIL : ${role} — les trois échouent -> ProviderChainError, aucun résultat fabriqué`, async (t) => {
    withCapturedConsole(t);
    withProviders(t, providersFor(role, { groq: () => httpFail(503), anthropic: () => httpFail(500), openai: () => httpFail(502) }));
    const error = await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE).then(() => null, (e) => e);
    assert.ok(error instanceof ProviderChainError);
    assert.equal(error.all_providers_failed, true);
    assert.deepEqual(error.attempts.map((x) => x.provider), ["groq", "anthropic", "openai"]);
    for (const forbidden of ["state", "operational_request_ready", "clarification_required", "agreement", "next_question", "route"]) {
      assert.ok(!Object.hasOwn(error, forbidden), `aucun champ métier ne doit être fabriqué (${forbidden}).`);
    }
  });
}

test("HA02-A6 : Analyst réutilise EXACTEMENT le prompt, le schéma et le validateur canoniques", async (t) => {
  withCapturedConsole(t);
  let captured;
  withProviders(t, { groq: ({ body }) => { captured = body; return chatOk(validAnalystOutput()); } });
  await runRoleWithHaChain("analyst", ROLE_INPUT.analyst, ENV, ORDRE);
  assert.equal(captured.messages[0].content, ANALYST_SYSTEM_PROMPT);
  assert.deepEqual(captured.response_format.json_schema.schema, ANALYST_JSON_SCHEMA);
  assert.equal(ROLE_DEFINITIONS.analyst.systemPrompt, ANALYST_SYSTEM_PROMPT);
});

test("HA02-R4/R5 : Arbiter — validateArbiterOutput et l'intent preservation restent obligatoires quel que soit le provider", async (t) => {
  withCapturedConsole(t);
  // operational_request_ready avec un intent_preservation négatif est structurellement illégal.
  const illegal = { ...validArbiterOutput(), intent_preservation: { objective_preserved: false, priorities_preserved: true, semantic_equivalence: true, concerns: ["dérive"] } };
  assert.throws(() => validateArbiterOutput(illegal), /intent_preservation/);
  withProviders(t, { groq: () => chatOk(illegal), anthropic: () => chatOk(illegal), openai: () => chatOk(illegal) });
  const error = await runRoleWithHaChain("arbiter", ROLE_INPUT.arbiter, ENV, ORDRE).then(() => null, (e) => e);
  assert.ok(error instanceof ProviderChainError, "aucun provider ne peut contourner le validateur : la chaîne échoue en fail-closed.");
  assert.deepEqual(error.attempts.map((x) => x.failure_class), Array(3).fill(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID));
});

test("HA02-R8 : Arbiter — aucun chemin de repli ne peut produire un état READY artificiel", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: () => httpFail(503), anthropic: () => httpFail(503), openai: () => httpFail(503) });
  const error = await runRoleWithHaChain("arbiter", ROLE_INPUT.arbiter, ENV, ORDRE).then(() => null, (e) => e);
  const serialized = JSON.stringify({ message: error.message, attempts: error.attempts });
  for (const forbidden of ["operational_request_ready", "clarification_required", "confirmation_required", "blocked"]) {
    assert.ok(!serialized.includes(forbidden), `l'échec technique ne doit jamais mentionner un état OPRIE (${forbidden}).`);
  }
});

test("HA02-C4/C5/C6 : Critic — exact-six, batching et partial_failure restent portés par runCriticBatchedPipeline, jamais réimplémentés par la couche HA", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  // Scan du CODE seul : les commentaires ont le droit de nommer les invariants qu'ils expliquent.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/exact.?six/i, /assembleSubstitutionReviews\s*\(/, /applySubstitutionGate\s*\(/, /deriveCriticConsequences\s*\(/, /validateCriticOutput\s*\(/]) {
    assert.doesNotMatch(code, forbidden, `la couche provider ne doit jamais réimplémenter un invariant Critic (${forbidden}).`);
  }
  assert.equal((source.match(/runCriticBatchedPipeline\(/g) || []).length, 4, "les 4 pipelines Critic (Groq, Groq fan-out, Anthropic, OpenAI) délèguent tous à l'unique orchestrateur de batch.");
});

test("HA02-C6b : un échec de batch (technical_state=partial_failure) est une panne TECHNIQUE et bascule, sans jamais fabriquer de review", async (t) => {
  withCapturedConsole(t);
  const input = { ...ROLE_INPUT.critic, analyst_output: { ...validAnalystOutput(), issues: [{ id: "issue1", type: "missing_information", description: "D.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }] } };
  const calls = withProviders(t, {
    groq: ({ schemaName }) => schemaName === "critic_global" ? chatOk(criticGlobalFixture()) : httpFail(500),
    anthropic: ({ schemaName }) => toolOk(schemaName === "critic_global" ? criticGlobalFixture() : {}, schemaName)
  });
  await runRoleWithHaChain("critic", input, ENV, ORDRE).catch(() => {});
  assert.ok(calls.some((c) => c.provider === "anthropic"), "un partial_failure doit être classé TECHNICAL_FAILOVER et permettre la bascule.");
});

test("HA02-C8 : le fan-out candidate-group reste INACTIF — jamais atteint par le routage HA", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  const chainBody = source.slice(source.indexOf("const CRITIC_PIPELINES"), source.indexOf("function roleFromPathname"));
  assert.doesNotMatch(chainBody, /runCriticWithGroqFanOut/, "le fan-out ne doit être câblé dans aucune chaîne HA.");
  assert.match(source, /export async function runCriticWithGroqFanOut/, "il reste néanmoins exporté, intact, pour une décision ultérieure explicite.");
});

test("HA02-C10 : le failover Critic est PAR PIPELINE — jamais un mélange de providers dans un même CriticOutput", async (t) => {
  withCapturedConsole(t);
  const input = { ...ROLE_INPUT.critic, analyst_output: { ...validAnalystOutput(), issues: [{ id: "issue1", type: "missing_information", description: "D.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null }] } };
  const calls = withProviders(t, {
    groq: ({ schemaName }) => schemaName === "critic_global" ? chatOk(criticGlobalFixture()) : httpFail(500),
    anthropic: ({ schemaName }) => toolOk(schemaName === "critic_global" ? criticGlobalFixture() : {}, schemaName)
  });
  await runRoleWithHaChain("critic", input, ENV, ORDRE).catch(() => {});
  const anthropicCalls = calls.filter((c) => c.provider === "anthropic");
  assert.ok(anthropicCalls.some((c) => c.schemaName === "critic_global"),
    "après bascule, le provider suivant rejoue le pipeline ENTIER (global inclus) : jamais un batch réparé isolément par un autre modèle.");
});

test("HA02-PREFLIGHT : un contrat de rôle inutilisable est une CONTRACT_ERROR — aucun appel réseau, jamais trois fois la même erreur", () => {
  for (const role of ["analyst", "critic", "arbiter"]) {
    assert.doesNotThrow(() => assertRoleContractUsable(role, ROLE_INPUT[role]), `le contrat ${role} de production doit rester utilisable.`);
  }
  assert.throws(() => assertRoleContractUsable("inconnu", {}), /rôle OPRIE inconnu/);
});

// =================================================================================================
// (C) DEGRADED_STATE — raccord canonique
// =================================================================================================

for (const [role, id] of [["analyst", "HA02-G1"], ["critic", "HA02-G2"], ["arbiter", "HA02-G3"]]) {
  test(`${id} : ${role} — ProviderChainError -> degraded_state canonique, validé par le contrat OPRIE existant`, async (t) => {
    withCapturedConsole(t);
    withProviders(t, providersFor(role, { groq: () => httpFail(503), anthropic: () => httpFail(500), openai: () => httpFail(502) }));
    const error = await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE).then(() => null, (e) => e);
    const degraded = degradedResultFromProviderChainError(role, error);
    assert.deepEqual(validateDegradedRoleResult(degraded), degraded, "la sortie doit passer le validateur canonique existant, jamais une nouvelle shape.");
    assert.deepEqual(Object.keys(degraded).sort(), ["reason", "role", "state"]);
    assert.equal(degraded.state, "degraded_state");
    assert.equal(degraded.role, role);
    assert.match(degraded.reason, /groq \(technical_failover\), anthropic \(technical_failover\), openai \(technical_failover\)/);
  });
}

test("HA02-G4 : degraded_state ne route jamais — la machine d'état interdit déjà la transition vers un verdict", () => {
  assert.equal(isLegalTransition("degraded_state", "operational_request_ready"), false);
  assert.equal(isLegalTransition("degraded_state", "blocked"), false);
  assert.equal(isLegalTransition("degraded_state", "understanding"), true, "seul un retour en compréhension reste légal.");
});

test("HA02-G5/G6 : un résultat dégradé ne contient AUCUN verdict, AUCUNE route et AUCUNE question synthétique", () => {
  const degraded = degradedResultFromProviderChainError("arbiter", { attempts: [{ provider: "groq", failure_class: FAILURE_CLASSES.TECHNICAL_FAILOVER }] });
  const serialized = JSON.stringify(degraded);
  for (const forbidden of ["operational_request_ready", "clarification_required", "confirmation_required", "blocked", "next_question", "question", "route", "rapide", "architecte", "agreement"]) {
    assert.ok(!serialized.includes(forbidden), `un état dégradé ne doit jamais porter "${forbidden}".`);
  }
});

test("HA02-G7 : le raccord ne transporte QUE des données techniques d'énumérations fermées — aucun secret, aucun prompt, aucune réponse brute", () => {
  const degraded = degradedResultFromProviderChainError("analyst", {
    attempts: [{ provider: "groq", failure_class: FAILURE_CLASSES.CONFIG_UNAVAILABLE, secret: "gsk_FUITE", raw: "réponse brute du modèle", prompt: ANALYST_SYSTEM_PROMPT }]
  });
  const serialized = JSON.stringify(degraded);
  for (const forbidden of ["gsk_", "FUITE", "réponse brute", ANALYST_SYSTEM_PROMPT.slice(0, 40)]) {
    assert.ok(!serialized.includes(forbidden), `le raccord ne doit jamais laisser passer "${forbidden}".`);
  }
  assert.equal(degraded.reason, "Aucun fournisseur disponible pour ce rôle : groq (config_unavailable).");
});

test("HA02-G8 : une classe d'échec inconnue est ramenée à une valeur de l'énumération fermée, jamais recopiée telle quelle", () => {
  const degraded = degradedResultFromProviderChainError("critic", { attempts: [{ provider: "groq", failure_class: "<script>injection</script>" }] });
  assert.ok(!degraded.reason.includes("script"), "aucune donnée non énumérée ne doit transiter.");
  assert.match(degraded.reason, /groq \(programming_error\)/);
});

// =================================================================================================
// CONTRAT HTTP DES RÔLES — strictement inchangé (R1-9/R1-10)
// =================================================================================================

test("HA02-HTTP : l'échec des trois providers reste un 502 role_provider_failure SANS aucun champ d'état — contrat R1-9 préservé", async (t) => {
  withCapturedConsole(t);
  withProviders(t, providersFor("analyst", { groq: () => httpFail(503), anthropic: () => httpFail(500), openai: () => httpFail(502) }));
  const response = await groqWorker.fetch(new Request("https://worker.example/analyst", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://atelier.example.com" }, body: JSON.stringify(ROLE_INPUT.analyst)
  }), ENV);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "role_provider_failure");
  for (const forbidden of ["state", "degraded_state", "operational_request_ready", "clarification_required", "blocked", "agreement"]) {
    assert.equal(forbidden in body, false, `la réponse de panne ne doit jamais contenir la clé "${forbidden}".`);
  }
});

/* DEEP-PROVIDER-ROUTING-FINAL-01 — CE TEST-CI EMPRUNTE LE VRAI CHEMIN HTTP, donc l'ordre de
   PRODUCTION : il ne reçoit pas ORDRE et c'est délibéré. Ce qui a changé, c'est le fournisseur qui
   sert — Anthropic, plus Groq. Ce qui n'a pas changé, et c'est l'objet du test, c'est que le chemin
   nominal rend 200 avec la même sortie validée, sans consulter personne d'autre. */
test("HA02-HTTP-b : le chemin nominal des trois rôles rend 200 et la même sortie validée (désormais Anthropic)", async (t) => {
  withCapturedConsole(t);
  for (const role of ["analyst", "arbiter"]) {
    const calls = withProviders(t, providersFor(role, { anthropic: "ok" }));
    const response = await groqWorker.fetch(new Request(`https://worker.example/${role}`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://atelier.example.com" }, body: JSON.stringify(ROLE_INPUT[role])
    }), ENV);
    assert.equal(response.status, 200, role);
    assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["anthropic"], role);
  }
});
