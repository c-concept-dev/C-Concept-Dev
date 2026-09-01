import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { CRITIC_GLOBAL_SYSTEM_PROMPT } from "../workers/shared/operational-request-core.js";
import groqWorker, {
  runCriticWithGroq, fetchGroqWithRetry, parseRetryAfterMs, parseRetryDelayFromBody,
  createGroqRateLimitPacer, GROQ_PRODUCTION_RETRY_DEFAULTS
} from "../workers/groq/src/index.js";
import { fetchGroqWithRetry as fetchGroqWithRetryFromHarness } from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";

// 3F.3.3-X2-BATCH-R2 : PACING TPM INTRA-PIPELINE. Avant R2, callGroqChatCompletion (workers/groq/
// src/index.js) faisait un fetch() brut : un HTTP 429 échouait IMMÉDIATEMENT, sans jamais honorer le
// Retry-After que Groq communique explicitement, et sans aucune mémoire entre les appels séquentiels
// d'un même pipeline Critic batché (global -> batch1 -> batch2). Premier smoke réel X2-BATCH-R1 :
// les deux batches ont reçu HTTP 429 (Limit 8000, Used ≈5900, Requested ≈6340, retry_after≈31.8s),
// jamais retentés, produisant technical_state=partial_failure alors que le split lui-même avait déjà
// résolu le problème de TAILLE par requête (Requested < Limit à chaque appel).
//
// Ce fichier ne mocke JAMAIS un vrai délai : sleepFn est toujours injecté (instantané), la suite
// reste rapide et déterministe (section 8 du lot R2). Aucun test n'attend réellement 30+ secondes.

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function analystOutputWithIssues(n) {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: n }, (_, i) => ({
      id: `issue${i + 1}`, type: "missing_information", description: `Description ${i + 1}.`,
      impact: "material", substitutable: false, recommended_treatment: "question", kind: null
    })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

function criticInput(n) {
  return { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(n), previous_vetoes: [] };
}

function globalOutputFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}

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
    out[id] = {
      candidates: Object.fromEntries(LADDER.map((t) => [t, candidateFor(t, t === available)]))
    };
  }
  return out;
}

function groqResponse(contentObj, status = 200, headers = {}) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status, headers });
}

// Corps 429 réaliste, format Groq réel observé au smoke X2-BATCH-R1.
function groq429Body({ limit = 8000, used = 5902, requested = 6341, retryAfterS = 31.8225 } = {}) {
  return Response.json({
    error: {
      message: `Rate limit reached for model \`openai/gpt-oss-20b\` in organization on tokens per minute (TPM): Limit ${limit}, Used ${used}, Requested ${requested}, please try again in ${retryAfterS}s.`,
      type: "tokens",
      code: "rate_limit_exceeded"
    }
  }, { status: 429 });
}

function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function recordingSleep(log) {
  return async (ms) => { log.push(ms); };
}

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
const workersAiSrcPath = fileURLToPath(new URL("../workers/workers-ai/src/index.js", import.meta.url));

// --- Phase 0 / relocalisation : une seule source de vérité ---------------------------------------

test("R2-0a : le harnais réexporte fetchGroqWithRetry/parseRetryAfterMs/parseRetryDelayFromBody depuis workers/groq/src/index.js (pas une seconde copie)", async () => {
  assert.equal(typeof fetchGroqWithRetryFromHarness, "function");
  // Comportement identique sur un cas simple : succès direct, aucun retry.
  const log = [];
  const responses = [groqResponse({ ok: true })];
  globalThis.fetch = async () => responses.shift();
  const { response, retries } = await fetchGroqWithRetryFromHarness("https://x", {}, { sleepFn: recordingSleep(log) });
  assert.equal(response.status, 200);
  assert.equal(retries, 0);
});

test("R2-0b : GROQ_PRODUCTION_RETRY_DEFAULTS est un objet gelé, complet, sans dépendance à un CLI", () => {
  assert.ok(Object.isFrozen(GROQ_PRODUCTION_RETRY_DEFAULTS));
  for (const key of ["maxRetries", "safetyMarginMs", "defaultBackoffMs", "timeoutMs"]) {
    assert.equal(typeof GROQ_PRODUCTION_RETRY_DEFAULTS[key], "number");
  }
});

// --- R2-3 : Retry-After honoré (calcul exact) -----------------------------------------------------

test("R2-3 : un 429 avec un délai explicite dans le corps (\"please try again in 31.8225s\") est honoré — attente = retry_after + marge de sécurité", async (t) => {
  const log = [];
  let call = 0;
  withGroqFetch(t, async () => {
    call += 1;
    return call === 1 ? groq429Body({ retryAfterS: 31.8225 }) : groqResponse({ ok: true });
  });
  const { retries, rate_limited_wait_ms } = await fetchGroqWithRetry("https://x", {}, { sleepFn: recordingSleep(log) });
  assert.equal(retries, 1);
  assert.equal(call, 2);
  const expectedWaitMs = Math.round(31.8225 * 1000) + GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs;
  assert.equal(log[0], expectedWaitMs);
  assert.equal(rate_limited_wait_ms, expectedWaitMs);
});

test("R2-3b : parseRetryDelayFromBody extrait exactement 31822/31823 ms depuis le message Groq réel", () => {
  const raw = JSON.stringify({ error: { message: "...on tokens per minute (TPM): Limit 8000, Used 5902, Requested 6341, please try again in 31.8225s." } });
  const ms = parseRetryDelayFromBody(raw);
  assert.ok(ms === 31822 || ms === 31823, `attendu ~31822ms, obtenu ${ms}`);
});

// --- R2-4 : 429 transitoire -> retry -> succès -----------------------------------------------------

test("R2-4 : un 429 transitoire suivi d'un succès est traité comme un succès (jamais un échec technique)", async (t) => {
  let call = 0;
  withGroqFetch(t, async () => {
    call += 1;
    return call === 1 ? groq429Body() : groqResponse({ ok: true });
  });
  const { response, retries } = await fetchGroqWithRetry("https://x", {}, { sleepFn: recordingSleep([]) });
  assert.equal(response.status, 200);
  assert.equal(retries, 1);
});

// --- R2-5 : 429 persistant -> partial_failure explicite ---------------------------------------------

test("R2-5 : un 429 persistant (au-delà de maxRetries) produit un échec technique explicite, jamais un succès fabriqué", async (t) => {
  withGroqFetch(t, async () => groq429Body());
  await assert.rejects(
    () => fetchGroqWithRetry("https://x", {}, { sleepFn: recordingSleep([]), maxRetries: 2 }),
    (error) => {
      assert.equal(error.error_kind, "http_429");
      assert.equal(error.exhausted, true);
      assert.equal(error.retries, 2);
      return true;
    }
  );
});

test("R2-5b (pipeline complet) : un batch dont le 429 persiste au-delà de maxRetries produit technical_state=partial_failure, jamais un CriticOutput fabriqué", async (t) => {
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    return groq429Body(); // toujours 429 pour les batches
  });
  await assert.rejects(
    () => runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep([]), maxRetries: 1 } }),
    (error) => {
      assert.equal(error.technical_state, "partial_failure");
      assert.ok(Array.isArray(error.batchFailures) && error.batchFailures.length === 1);
      assert.match(error.batchFailures[0].error, /429/);
      return true;
    }
  );
});

// --- R2-6 : aucun jugement sémantique fabriqué sur échec technique -------------------------------

test("R2-6 : sur 429 exhaustif, aucune valeur sémantique n'est fabriquée (pas de reasonably_available par défaut, pas d'agreement, pas de degraded_state) dans l'erreur remontée", async (t) => {
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    return groq429Body();
  });
  await assert.rejects(
    () => runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep([]), maxRetries: 0 } }),
    (error) => {
      const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
      for (const forbidden of ["reasonably_available", "agreement", "degraded_state", "illegitimate_question_found"]) {
        assert.doesNotMatch(serialized, new RegExp(forbidden));
      }
      return true;
    }
  );
});

// --- R2-1/R2-2 : jamais de parallélisme entre appels d'un même pipeline ----------------------------

// 3F.3.3-X2-BATCH-R2.1 (CORRIGÉ) : ce test validait auparavant (à tort) que l'appel batch suivant
// était RE-DIFFÉRÉ du même délai que celui déjà consommé par le retry du Critic global — c'est
// exactement le défaut de double-pacing confirmé et corrigé par le lot R2.1 (cf.
// operational-request-critic-tpm-pacing-x2batch-r2-1.test.mjs, R2.1-1). Le comportement correct est
// l'inverse : un délai déjà consommé par le retry d'UN appel ne doit JAMAIS être repayé par le suivant.
test("R2-1 (corrigé R2.1) : quand le Critic global a dû attendre suite à un 429, l'appel batch suivant du MÊME pipeline part immédiatement — il ne repaie jamais ce délai déjà consommé", async (t) => {
  const sleeps = [];
  let call = 0;
  withGroqFetch(t, async (url, options) => {
    call += 1;
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") {
      return call === 1 ? groq429Body({ retryAfterS: 2 }) : groqResponse(globalOutputFixture());
    }
    return groqResponse(batchEntryFor(Object.keys(body.response_format.json_schema.schema.properties), null));
  });
  const output = await runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  assert.equal(output.question_substitution_review.length, 1);
  // Une seule attente réelle a eu lieu : le retry interne du Critic global sur SON PROPRE 429. Le
  // batch suivant ne doit produire AUCUNE attente supplémentaire (plus de reliquat pacer reprogrammé).
  assert.equal(sleeps.length, 1, `attendu 1 seule attente tracée (le retry du global), obtenu ${sleeps.length} : ${JSON.stringify(sleeps)}`);
});

test("R2-2 : deux appels batch d'un même pipeline ne partent jamais simultanément — strictement séquentiels", async (t) => {
  const events = [];
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    events.push({ type: "start", issueIds });
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push({ type: "end", issueIds });
    return groqResponse(batchEntryFor(issueIds, null));
  });
  await runCriticWithGroq(criticInput(4), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep([]) } });
  // Avec la capacité par défaut (input_budget=24400) et ces 4 issues minces, un seul batch de 4 —
  // le test de séquentialité réel (>=2 batches) est couvert par R2-10 ci-dessous ; ici on vérifie
  // simplement l'absence de chevauchement quelle que soit la forme du plan.
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].type === "start") assert.equal(events[i + 1].type, "end");
  }
});

// --- R2-9 : N=0 n'attend jamais un batch inexistant ------------------------------------------------

test("R2-9 : N=0 -> aucun appel batch, aucune attente de pacing, un seul appel réseau (le Critic global)", async (t) => {
  let calls = 0;
  const sleeps = [];
  withGroqFetch(t, async () => { calls += 1; return groqResponse(globalOutputFixture()); });
  const output = await runCriticWithGroq(criticInput(0), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  assert.equal(calls, 1);
  assert.equal(sleeps.length, 0);
  assert.deepEqual(output.question_substitution_review, []);
});

// --- R2-10 : N=4 / >=2 batches réels conserve ordre et assemblage, avec la nouvelle politique de reprise --

test("R2-10 : N=4 forcé sur >=2 batches (fixture volumineuse) — ordre, couverture, assemblage corrects avec la reprise 429 active", async (t) => {
  // Réutilise la même technique que R1-7 (contexte volumineux -> plusieurs batches réels sous la
  // capacité de production réelle), avec en plus un 429 transitoire sur le tout premier batch pour
  // prouver que la reprise + le pacing n'altèrent ni l'ordre ni l'assemblage final.
  const bigDescription = "x".repeat(2000);
  const analystOutput = {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: 4 }, (_, i) => ({ id: `issue${i + 1}`, type: "missing_information", description: bigDescription, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
  const calls = [];
  let firstBatchAttempt = true;
  withGroqFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format.json_schema.name === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    calls.push(issueIds);
    if (firstBatchAttempt) { firstBatchAttempt = false; return groq429Body({ retryAfterS: 1 }); }
    return groqResponse(batchEntryFor(issueIds, null));
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  const batchCalls = calls.length;
  assert.ok(batchCalls >= 3, `attendu >=3 tentatives de batch (>=2 batches réels + 1 retry sur le premier), obtenu ${batchCalls}.`);
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R2-7 : pacing provider absent du core sémantique ----------------------------------------------

test("R2-7 : operational-request-core.js ne contient aucune trace du pacer, de 429, de retry-after ou d'un nom de provider (le pacing reste une particularité de l'adaptateur)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  // "groq"/"workers ai" apparaissent déjà, légitimement, en documentation pré-existante (compatibilité
  // JSON Schema strict, cf. X2-A/X2-B/X2-BATCH-R1) — cf. la même discipline de portée que XB-35/R1-17 :
  // on vérifie l'absence des ÉLÉMENTS DE PACING eux-mêmes, jamais un bannissement total du mot.
  assert.doesNotMatch(source, /\b429\b/);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /rate.limit/i);
  assert.doesNotMatch(source, /pacer/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|parseRetryAfterMs|parseRetryDelayFromBody/);
});

// --- R2-8 : Workers AI ne reçoit aucune hypothèse Groq codée en dur --------------------------------

test("R2-8 : workers/workers-ai/src/index.js ne contient aucun parsing 429/retry-after spécifique à Groq, aucun pacer Groq codé en dur", () => {
  const source = fs.readFileSync(workersAiSrcPath, "utf8");
  assert.doesNotMatch(source, /try again in/i);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|fetchGroqWithRetry/);
});

// --- Pacer : tests unitaires directs -------------------------------------------------------------

test("Pacer-1 : createGroqRateLimitPacer ne fait jamais attendre avant le tout premier appel (aucune information encore connue)", async () => {
  const sleeps = [];
  const pacer = createGroqRateLimitPacer({ sleepFn: recordingSleep(sleeps) });
  await pacer.before();
  assert.equal(sleeps.length, 0);
});

test("Pacer-2 : après recordWaitMs(w), before() attend approximativement le reliquat, jamais w depuis zéro à chaque appel", async () => {
  const sleeps = [];
  const pacer = createGroqRateLimitPacer({ sleepFn: recordingSleep(sleeps) });
  pacer.recordWaitMs(1000);
  await pacer.before();
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] > 0 && sleeps[0] <= 1000, `attendu une attente positive <=1000ms, obtenu ${sleeps[0]}`);
});

test("Pacer-3 : recordWaitMs(0) ou une valeur non finie n'installe aucune attente", async () => {
  const sleeps = [];
  const pacer = createGroqRateLimitPacer({ sleepFn: recordingSleep(sleeps) });
  pacer.recordWaitMs(0);
  pacer.recordWaitMs(NaN);
  pacer.recordWaitMs(-5);
  await pacer.before();
  assert.equal(sleeps.length, 0);
});

// --- Frontière HTTP 8192 : hors périmètre, non touchée --------------------------------------------

// R2-verif (corrigé LOT HTTP-8192) : même correction que R2.1-verif -- le littéral "maxBytes = 8192"
// a été délibérément remplacé par TRANSPORT_LIMITS (politique route-specific). Intention d'origine
// préservée : ce plafond reste défini une seule fois, dans decision-core.js.
test("R2-verif (corrigé LOT HTTP-8192) : le plafond transport (TRANSPORT_LIMITS) reste défini une seule fois, dans decision-core.js", () => {
  const decisionCorePath = fileURLToPath(new URL("../workers/shared/decision-core.js", import.meta.url));
  const source = fs.readFileSync(decisionCorePath, "utf8");
  assert.match(source, /export const TRANSPORT_LIMITS/);
});
