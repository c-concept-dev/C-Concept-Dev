import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { OPRIE_ROLES } from "../workers/shared/operational-request-core.js";
import {
  DECISION_GROQ_RETRY_POLICY, GROQ_PRODUCTION_RETRY_DEFAULTS, ROLE_GROQ_RETRY_POLICIES,
  ROLE_PROVIDER_ORDER, DECISION_PROVIDER_ORDER,
  runCriticWithGroq, runRoleWithGroq, runRoleWithHaChain
} from "../workers/groq/src/index.js";
import { ProviderChainError } from "../workers/shared/provider-ha.js";

// =================================================================================================
// HA-03 — GARDE DE DISPONIBILITÉ DES RÔLES OPRIE.
//
// Défaut corrigé, observé en production (version 06075188) : les rôles héritaient de
// maxRetryWaitMs = Infinity. Sur un Retry-After long, le Worker dormait sans borne dans sa première
// tentative Groq et n'atteignait JAMAIS Anthropic ni OpenAI. Preuve produite par les logs de
// production : un seul provider_ha_attempt(groq), puis 150 s de silence, aucun fallback.
//
// La correction borne l'ATTENTE, jamais le NOMBRE de reprises : maxRetries reste 2 pour les trois
// rôles, donc R2 / R2.1 / R3B / X2-BATCH sont préservés à l'identique.
// =================================================================================================

const ENV = { GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", "OPenAI-API": "o" };
// Retry-After réellement observé en production, celui qui bloquait la chaîne (rapport R2.1).
const PATHOLOGICAL_RETRY_AFTER_S = 31.8225;
// Retry-After réellement observés côté Groq lors des mesures CSR-01 : doivent rester honorés.
const REALISTIC_RETRY_AFTER_S = [3.8475, 16.6125];

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}
function analystOutput() {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "O." },
    provenance_records: [{ field: "objective", value: "O.", provenance: "explicit_user_statement" }],
    issues: [], question_candidates: [], confirmation_signals: confirmationSignals()
  };
}
function criticGlobal() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}
function arbiterOutput() {
  return {
    state: "operational_request_ready", operational_request_candidate: { ...createEmptyCandidate(), objective: "O." }, issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null }, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] }, reason: "Motif."
  };
}
const ROLE_INPUT = Object.freeze({
  analyst: { original_request: "O.", clarification_history: [] },
  critic: { original_request: "O.", clarification_history: [], analyst_output: analystOutput(), previous_vetoes: [] },
  arbiter: { original_request: "O.", clarification_history: [], analyst_output: analystOutput(), critic_output: null }
});
const ROLE_PAYLOAD = Object.freeze({ analyst: analystOutput, critic: criticGlobal, arbiter: arbiterOutput });

const chatOk = (p) => Response.json({ choices: [{ message: { content: JSON.stringify(p) } }] });
const toolOk = (p, n) => Response.json({ content: [{ type: "tool_use", name: n, input: p }] });
const groq429 = (retryAfterS) => new Response('{"error":{"message":"rate limit","code":"rate_limit_exceeded"}}', { status: 429, headers: { "retry-after": String(retryAfterS) } });
const httpFail = (status = 503) => Response.json({ error: { message: "ko" } }, { status });
const providerOf = (u) => String(u).includes("groq") ? "groq" : String(u).includes("anthropic") ? "anthropic" : "openai";

// -------------------------------------------------------------------------------------------------
// DEEP-PROVIDER-ROUTING-FINAL-01 — LA GARDE RESTE, LE CHEMIN QU'ELLE GARDAIT A DISPARU.
//
// HA-03 corrige un défaut précis : sur un Retry-After long, la première tentative Groq d'un rôle
// dormait sans borne et n'atteignait jamais le fournisseur suivant. Le plan profond n'appelle plus
// Groq, donc ce défaut n'a plus de chemin pour se produire EN PRODUCTION. La garde n'est pas
// supprimée pour autant : ROLE_GROQ_RETRY_POLICIES et la borne d'attente restent dans le code, et
// les tests ci-dessous continuent de les vérifier en passant l'ordre explicitement — comme le ferait
// tout appelant qui reconfigurerait la chaîne. Supprimer une garde parce que son chemin est
// momentanément fermé, c'est la perdre le jour où on le rouvre.
//
// Ce que ces tests ne prétendent plus : que la production bascule. HA03-11 dit maintenant l'inverse.
// -------------------------------------------------------------------------------------------------
const CHAINE_HA_MECANIQUE = Object.freeze(["groq", "anthropic", "openai"]);
const ORDRE = { order: CHAINE_HA_MECANIQUE };

function withCapturedConsole(t) {
  const l = console.log, e = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = l; console.error = e; });
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
    const h = handlers[provider];
    assert.ok(h, `appel inattendu vers "${provider}"`);
    return h({ schemaName });
  };
  return calls;
}
/** Répond correctement pour un rôle, quel que soit le fournisseur et l'étape du pipeline. */
const responder = (role, provider) => ({ schemaName }) => {
  const payload = schemaName === "critic_global" ? criticGlobal() : schemaName === "substitution_review_batch" ? {} : ROLE_PAYLOAD[role]();
  return provider === "anthropic" ? toolOk(payload, schemaName) : chatOk(payload);
};

// --- Politiques : dérivation et non-régression -------------------------------------------------------

test("HA03-6 : la politique Decision est strictement INCHANGÉE par ce lot", () => {
  assert.deepEqual(DECISION_GROQ_RETRY_POLICY, { maxRetries: 1, maxRetryWaitMs: 3000 });
});

test("HA03-7 : les défauts historiques sont INCHANGÉS — seule l'attente des rôles est bornée, jamais le nombre de reprises", () => {
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.defaultBackoffMs, 30000);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000);
  for (const role of OPRIE_ROLES) {
    assert.deepEqual(Object.keys(ROLE_GROQ_RETRY_POLICIES[role]), ["maxRetryWaitMs"],
      `la politique du rôle ${role} ne doit borner QUE l'attente : jamais maxRetries, jamais le timeout réseau.`);
  }
});

test("HA03-GUARD : chaque rôle a une garde FINIE, et aucune ne vaut plus que le coût de sa propre bascule", () => {
  // Bascule la plus rapide réellement mesurée par rôle (HA-02 / CSR-01, previews à 0 % de trafic).
  const measuredFastestFallbackMs = { analyst: 16270, arbiter: 17680, critic: 26400 };
  for (const role of OPRIE_ROLES) {
    const cap = ROLE_GROQ_RETRY_POLICIES[role].maxRetryWaitMs;
    assert.ok(Number.isFinite(cap), `${role} : la garde doit être finie — Infinity est le défaut corrigé par ce lot.`);
    assert.ok(cap > 0);
    assert.ok(cap < measuredFastestFallbackMs[role],
      `${role} : attendre Groq plus longtemps que le coût de la bascule (${measuredFastestFallbackMs[role]} ms) serait strictement dominé.`);
  }
  assert.ok(ROLE_GROQ_RETRY_POLICIES.critic.maxRetryWaitMs > ROLE_GROQ_RETRY_POLICIES.analyst.maxRetryWaitMs,
    "le Critique conserve plus de tolérance que l'Analyste : sa bascule coûte davantage.");
});

// --- HA03-8 / HA03-9 : coeur de la correction -----------------------------------------------------

test("HA03-8 : un Retry-After COURT reste honoré — le comportement historique est conservé dans tous les cas réalistes", async (t) => {
  for (const retryAfterS of REALISTIC_RETRY_AFTER_S) {
    await test(`HA03-8/retry-after=${retryAfterS}s`, async (sub) => {
      withCapturedConsole(sub);
      const sleeps = [];
      let attempt = 0;
      withProviders(sub, { groq: ({ schemaName }) => (attempt += 1) === 1 ? groq429(retryAfterS) : responder("critic", "groq")({ schemaName }) });
      await runCriticWithGroq(ROLE_INPUT.critic, ENV, { retryOverrides: { sleepFn: async (ms) => { sleeps.push(ms); } } });
      assert.deepEqual(sleeps, [Math.round(retryAfterS * 1000) + 750],
        "un délai réellement observé côté Groq doit encore être attendu, exactement une fois.");
      assert.equal(attempt, 2, "la reprise a bien eu lieu.");
    });
  }
});

test("HA03-9 : un Retry-After LONG n'est JAMAIS attendu — la garde abandonne Groq sans dormir", async (t) => {
  withCapturedConsole(t);
  const sleeps = [];
  const calls = withProviders(t, {
    groq: () => groq429(PATHOLOGICAL_RETRY_AFTER_S),
    anthropic: ({ schemaName }) => responder("critic", "anthropic")({ schemaName })
  });
  const started = Date.now();
  await runRoleWithHaChain("critic", ROLE_INPUT.critic, ENV, { ...ORDRE, retryOverrides: { sleepFn: async (ms) => { sleeps.push(ms); } } });
  const elapsed = Date.now() - started;
  assert.deepEqual(sleeps, [], `aucune attente ne doit avoir lieu pour un Retry-After de ${PATHOLOGICAL_RETRY_AFTER_S}s ; obtenu ${JSON.stringify(sleeps)}`);
  assert.equal(calls.filter((c) => c.provider === "groq").length, 1, "une seule tentative Groq : la reprise est abandonnée, pas rejouée.");
  assert.ok(calls.some((c) => c.provider === "anthropic"), "le fournisseur suivant doit être atteint — c'est tout l'objet du lot.");
  assert.ok(elapsed < 2000, `la bascule doit être immédiate ; mesuré ${elapsed} ms.`);
});

// --- HA03-1 / 2 / 3 : bascule réelle par rôle -------------------------------------------------------

for (const [role, id] of [["analyst", "HA03-1"], ["arbiter", "HA03-2"], ["critic", "HA03-3"]]) {
  test(`${id} : ${role} — Retry-After long sur Groq -> Groq abandonné -> Anthropic atteint et servi`, async (t) => {
    withCapturedConsole(t);
    const started = Date.now();
    const calls = withProviders(t, {
      groq: () => groq429(PATHOLOGICAL_RETRY_AFTER_S),
      anthropic: ({ schemaName }) => responder(role, "anthropic")({ schemaName })
    });
    const output = await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    const elapsed = Date.now() - started;
    assert.ok(output && typeof output === "object", `${role} doit produire une sortie servie par Anthropic.`);
    assert.equal(calls.filter((c) => c.provider === "groq").length, 1);
    assert.ok(calls.some((c) => c.provider === "anthropic"));
    assert.ok(elapsed < 5000, `${role} ne doit jamais rester bloqué ; mesuré ${elapsed} ms (avant HA-03 : blocage indéfini).`);
    if (role === "critic") {
      assert.ok(calls.some((c) => c.provider === "anthropic" && c.schemaName === "critic_global"),
        "le Critique rejoue le pipeline COMPLET chez Anthropic — homogénéité par pipeline, invariant HA-02 préservé.");
    }
  });
}

// --- HA03-4 / 5 : suite de la chaîne et fail-closed ---------------------------------------------------

test("HA03-4 : Groq (Retry-After long) puis Anthropic KO -> OpenAI est atteint", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => groq429(PATHOLOGICAL_RETRY_AFTER_S),
    anthropic: () => httpFail(500),
    openai: ({ schemaName }) => responder("analyst", "openai")({ schemaName })
  });
  const output = await runRoleWithHaChain("analyst", ROLE_INPUT.analyst, ENV, ORDRE);
  assert.ok(output.operational_request_candidate);
  assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq", "anthropic", "openai"]);
});

test("HA03-5 : les trois fournisseurs échouent -> ProviderChainError, fail-closed, aucun résultat fabriqué", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: () => groq429(PATHOLOGICAL_RETRY_AFTER_S), anthropic: () => httpFail(500), openai: () => httpFail(502) });
  const error = await runRoleWithHaChain("analyst", ROLE_INPUT.analyst, ENV, ORDRE).then(() => null, (e) => e);
  assert.ok(error instanceof ProviderChainError);
  assert.equal(error.all_providers_failed, true);
  assert.deepEqual(error.attempts.map((a) => a.provider), ["groq", "anthropic", "openai"]);
  for (const forbidden of ["state", "operational_request_candidate", "route"]) assert.ok(!Object.hasOwn(error, forbidden));
});

// --- HA03-10 / 11 : invariants HA ---------------------------------------------------------------------

test("HA03-10 : aucun model shopping — un succès Groq met fin à la chaîne, aucune garde ne le rejoue", async (t) => {
  withCapturedConsole(t);
  for (const role of OPRIE_ROLES) {
    const calls = withProviders(t, { groq: ({ schemaName }) => responder(role, "groq")({ schemaName }) });
    await runRoleWithHaChain(role, ROLE_INPUT[role], ENV, ORDRE);
    assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq"], role);
  }
});

test("HA03-11 : l'ordre de Decision est inchangé, celui des rôles est désormais Anthropic seul", () => {
  /* DEEP-PROVIDER-ROUTING-FINAL-01 — l'ordre des rôles a changé APRÈS ce lot, par une décision
     mesurée puis appliquée. Les gardes de reprise ci-dessous, elles, n'ont pas bougé d'un
     millième de seconde : c'est ce que HA-03 avait à protéger, et c'est ce qui reste protégé. */
  assert.deepEqual(ROLE_PROVIDER_ORDER, ["anthropic"]);
  assert.deepEqual(DECISION_PROVIDER_ORDER, ["groq", "anthropic", "openai"]);
  assert.deepEqual([...Object.keys(ROLE_GROQ_RETRY_POLICIES)].sort(), [...OPRIE_ROLES].sort(),
    "chaque rôle OPRIE, et seulement eux, possède une garde.");
});

// --- HA03-12 / 13 / 14 : hygiène ------------------------------------------------------------------------

test("HA03-12 : aucun hardcoding métier introduit", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /\bItalie\b/i, /\bvoyage\b/i, /process\.env/, /NODE_ENV/]) {
    assert.doesNotMatch(code, forbidden, String(forbidden));
  }
});

test("HA03-13 : aucun transport ni aucune boucle de reprise dupliqués — un seul mécanisme, paramétré", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  assert.equal((source.match(/export async function fetchGroqWithRetry\(/g) || []).length, 1);
  assert.equal((source.match(/async function callGroqChatCompletion\(/g) || []).length, 1);
  assert.equal((source.match(/while \(true\) \{/g) || []).length, 1, "une seule boucle de reprise dans tout le fichier.");
});

// ORCH-01 a été réintégré sur HA-03 : la prémisse d'origine de ce test (« l'orchestrateur ne figure
// pas sur cette branche ») a donc été volontairement supprimée par cette réintégration. L'invariant
// ARCHITECTURAL qu'il protégeait réellement est en revanche permanent, et il est vérifié ici sous sa
// forme durable : la garde de disponibilité appartient à la couche TRANSPORT et à elle seule. La
// couche d'orchestration ne doit jamais définir, surcharger ni contourner une politique de reprise —
// sans quoi il existerait deux autorités concurrentes sur le même comportement.
test("HA03-14 (prémisse mise à jour) : la garde de disponibilité reste l'affaire du transport — la couche d'orchestration ne définit ni ne surcharge aucune politique de reprise", () => {
  const orchestratorPath = fileURLToPath(new URL("../workers/shared/operational-request-orchestrator.js", import.meta.url));
  if (!fs.existsSync(orchestratorPath)) return; // HA-03 seul : rien à vérifier.
  const orchestrator = fs.readFileSync(orchestratorPath, "utf8");
  for (const forbidden of [/maxRetryWaitMs/, /maxRetries/, /retryOverrides/, /fetchGroqWithRetry/, /GROQ_PRODUCTION_RETRY_DEFAULTS/, /ROLE_GROQ_RETRY_POLICIES/]) {
    assert.doesNotMatch(orchestrator, forbidden, `l'orchestrateur ne doit jamais toucher à la politique de transport (${forbidden}).`);
  }
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  assert.equal((source.match(/ROLE_GROQ_RETRY_POLICIES = /g) || []).length, 1, "les gardes des rôles restent définies en un seul endroit.");
});

// --- Preuve directe sur l'adaptateur de rôle ------------------------------------------------------------

test("HA03-ADAPTER : runRoleWithGroq applique la garde de SON rôle, sans jamais la partager entre rôles", async (t) => {
  withCapturedConsole(t);
  for (const role of ["analyst", "arbiter"]) {
    const sleeps = [];
    let attempt = 0;
    withProviders(t, { groq: ({ schemaName }) => (attempt += 1) === 1 ? groq429(PATHOLOGICAL_RETRY_AFTER_S) : responder(role, "groq")({ schemaName }) });
    await assert.rejects(() => runRoleWithGroq(role, ROLE_INPUT[role], ENV, { retryOverrides: { sleepFn: async (ms) => { sleeps.push(ms); } } }));
    assert.deepEqual(sleeps, [], `${role} : aucune attente au-delà de sa garde.`);
    assert.equal(attempt, 1, `${role} : la tentative n'est pas rejouée après abandon.`);
  }
});
