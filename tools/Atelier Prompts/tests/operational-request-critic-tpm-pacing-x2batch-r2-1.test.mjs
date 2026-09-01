import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import { runCriticWithGroq } from "../workers/groq/src/index.js";

// 3F.3.3-X2-BATCH-R2.1 : CORRECTION RETRY/PACER SEMANTICS. R2 avait introduit un pacer
// (createGroqRateLimitPacer) qui, après CHAQUE appel Groq (succès après retry, ou échec par
// épuisement des retries), transmettait rate_limited_wait_ms — la somme des délais DÉJÀ ATTENDUS en
// interne par fetchGroqWithRetry — à pacer.recordWaitMs(). Cette valeur décrit toujours un délai
// ENTIÈREMENT CONSOMMÉ au moment où elle est produite, jamais une contrainte encore future : la
// transmettre à recordWaitMs (qui suppose un délai encore à venir) reprogrammait ce délai déjà écoulé
// comme s'il restait dû, et le pacer faisait alors REPAYER ce même délai à l'appel suivant du même
// pipeline (avant même que cet appel suivant ait lui-même reçu un 429). Confirmé par audit
// code-grounded + chronologie du smoke réel R2 : batch1 429 (retry_after=32.8425s) → retry batch1 200
// (33756ms attendus, cohérent) → puis ~34.7s SUPPLÉMENTAIRES avant que batch2 soit seulement tenté,
// alors que batch2 n'avait reçu AUCUN 429 propre à ce moment-là.
//
// Ce lot retire les deux appels à pacer.recordWaitMs(rate_limited_wait_ms) dans callGroqChatCompletion
// (chemin succès ET chemin catch/épuisement — même défaut aux deux sites). createGroqRateLimitPacer
// elle-même n'est PAS modifiée (son contrat before()/recordWaitMs() était déjà correct ; c'est
// UNIQUEMENT l'appelant qui lui fournissait une donnée rétrospective). fetchGroqWithRetry (le retry
// RÉACTIF, par appel) reste l'unique mécanisme de correction TPM réel de ce pipeline : chaque appel
// honore désormais exclusivement SON PROPRE 429 éventuel, jamais celui d'un appel précédent.
//
// Ce fichier ne mocke JAMAIS un vrai délai : sleepFn est toujours injecté (instantané), la suite
// reste rapide et déterministe (section 6 du lot R2.1 : "ne pas faire un test de 30 secondes").

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

function groqResponse(contentObj, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status });
}

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

function schemaNameOf(options) {
  return JSON.parse(options.body).response_format.json_schema.name;
}

function issueIdsOf(options) {
  return Object.keys(JSON.parse(options.body).response_format.json_schema.schema.properties);
}

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
const workersAiSrcPath = fileURLToPath(new URL("../workers/workers-ai/src/index.js", import.meta.url));

// --- R2.1-1 : un délai déjà consommé n'est jamais repayé par l'appel suivant ----------------------

test("R2.1-1 : 429 -> wait 31.8s -> retry 200 ; l'appel suivant ne repaie pas ces 31.8s", async (t) => {
  const sleeps = [];
  let globalCall = 0;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") {
      globalCall += 1;
      return globalCall === 1 ? groq429Body({ retryAfterS: 31.8225 }) : groqResponse(globalOutputFixture());
    }
    return groqResponse(batchEntryFor(issueIdsOf(options), null));
  });
  const output = await runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  assert.equal(output.question_substitution_review.length, 1);
  assert.equal(sleeps.length, 1, `une seule attente réelle a eu lieu (le retry du global) ; obtenu ${sleeps.length} : ${JSON.stringify(sleeps)}`);
  const expectedWaitMs = Math.round(31.8225 * 1000) + 750;
  assert.equal(sleeps[0], expectedWaitMs, "l'unique attente doit correspondre exactement au Retry-After + marge de sécurité, jamais plus.");
});

// --- R2.1-2 : B démarre immédiatement après le succès de A, hors temps normal d'orchestration -----

test("R2.1-2 : deux appels successifs, A 429 -> retry 200 ; B (le batch suivant) démarre sans attente pacer imposée", async (t) => {
  const sleeps = [];
  let globalCall = 0;
  const batchStartTimestamps = [];
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") {
      globalCall += 1;
      return globalCall === 1 ? groq429Body({ retryAfterS: 5 }) : groqResponse(globalOutputFixture());
    }
    batchStartTimestamps.push(Date.now());
    return groqResponse(batchEntryFor(issueIdsOf(options), null));
  });
  await runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  assert.equal(batchStartTimestamps.length, 1);
  // Seule l'attente du retry de A a été tracée (sleepFn injecté, instantané) ; aucune seconde entrée
  // de sleeps n'a été introduite avant B, donc B a été tenté sans passer par un pacer.before() actif.
  assert.equal(sleeps.length, 1, `attendu 1 attente (le retry de A), obtenu ${sleeps.length} : ${JSON.stringify(sleeps)}`);
});

// --- R2.1-3 : B reçoit ensuite son PROPRE 429 -- seul le Retry-After de B est attendu ---------------

test("R2.1-3 : A (premier batch) réussit avec 429->retry, B (second batch) reçoit ensuite son propre 429 distinct -- seul le Retry-After de B est honoré, jamais celui de A rejoué", async (t) => {
  // Nécessite >=2 batches RÉELS pour que A et B soient deux appels réseau distincts (pas seulement
  // deux tentatives du même batch) -- même technique que R1/R2 (description volumineuse) pour forcer
  // le split sous la capacité de production réelle (input_budget=24400).
  const bigDescription = "x".repeat(2000);
  const analystOutput = {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: 4 }, (_, i) => ({ id: `issue${i + 1}`, type: "missing_information", description: bigDescription, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
  const sleeps = [];
  const seenIssueIdSets = [];
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = issueIdsOf(options);
    const key = issueIds.join(",");
    const isFirstAttemptOfThisBatch = !seenIssueIdSets.includes(key);
    if (isFirstAttemptOfThisBatch) seenIssueIdSets.push(key);
    const isBatchA = key === seenIssueIdSets[0];
    if (isFirstAttemptOfThisBatch) {
      // 1er essai de CE batch : 429, avec un Retry-After PROPRE à ce batch (A != B).
      return groq429Body({ retryAfterS: isBatchA ? 10 : 3 });
    }
    return groqResponse(batchEntryFor(issueIds, null)); // retry -> succès
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep(sleeps) } }
  );
  assert.equal(output.question_substitution_review.length, 4);
  assert.ok(seenIssueIdSets.length >= 2, `attendu >=2 batches réels distincts, obtenu ${seenIssueIdSets.length}.`);
  // X2-C.4 : SUBSTITUTION_REVIEW_SYSTEM_PROMPT s'est agrandi (matérialisation exhaustive), donc N=4
  // avec cette même fixture produit désormais plus de 2 batches réels (computeBatchPlan, INCHANGÉ,
  // réagit mécaniquement à la taille réelle du prompt). L'invariant audité par ce test généralise
  // naturellement à N batches : CHAQUE batch honore exclusivement son PROPRE Retry-After (A=10s,
  // chaque autre batch=3s selon la fixture ci-dessus) -- jamais un reliquat d'un autre batch rejoué.
  const waitA = Math.round(10 * 1000) + 750;
  const waitB = Math.round(3 * 1000) + 750;
  assert.equal(sleeps.length, seenIssueIdSets.length, `un seul sleep (son propre Retry-After) par batch réel, obtenu ${JSON.stringify(sleeps)}`);
  assert.equal(sleeps[0], waitA, `le premier batch (A) doit honorer son propre Retry-After=10s, obtenu ${JSON.stringify(sleeps)}`);
  for (const sleep of sleeps.slice(1)) {
    assert.equal(sleep, waitB, `chaque batch suivant doit honorer son propre Retry-After=3s, jamais celui de A (10s), obtenu ${JSON.stringify(sleeps)}`);
  }
});

// --- R2.1-4 : aucun double comptage du safetyMarginMs ------------------------------------------------

test("R2.1-4 : la marge de sécurité (safetyMarginMs=750) n'est comptée qu'une seule fois par 429 réel, jamais additionnée une seconde fois via le pacer", async (t) => {
  const sleeps = [];
  let globalCall = 0;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") {
      globalCall += 1;
      return globalCall === 1 ? groq429Body({ retryAfterS: 2 }) : groqResponse(globalOutputFixture());
    }
    return groqResponse(batchEntryFor(issueIdsOf(options), null));
  });
  await runCriticWithGroq(criticInput(1), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  const totalWaited = sleeps.reduce((a, b) => a + b, 0);
  const singleMarginWait = Math.round(2 * 1000) + 750;
  assert.equal(totalWaited, singleMarginWait, `la marge de sécurité ne doit apparaître qu'une fois dans le total attendu (${singleMarginWait}ms), obtenu ${totalWaited}ms sur ${JSON.stringify(sleeps)}`);
});

// --- R2.1-5 : second site recordWaitMs (retries épuisés) -- aucun délai déjà expiré reprogrammé ----

test("R2.1-5 : un batch dont les retries s'épuisent (429 persistant) ne fait pas attendre le batch suivant du reliquat déjà consommé par ses propres tentatives", async (t) => {
  const sleeps = [];
  let batchAttempt = 0;
  const batchCallLog = [];
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    batchAttempt += 1;
    batchCallLog.push({ attempt: batchAttempt, issueIds: issueIdsOf(options) });
    // batch1 (A) : 429 persistant (jamais résolu, épuise ses retries). batch2 (B) ne devrait alors
    // jamais être atteint dans CE pipeline puisque runCriticBatchedPipeline s'arrête sur l'échec
    // technique d'un batch -- ce test vérifie donc surtout qu'AUCUNE attente supplémentaire n'est
    // introduite entre les tentatives internes de A elles-mêmes au-delà du nombre attendu de retries.
    return groq429Body({ retryAfterS: 1 });
  });
  await assert.rejects(
    () => runCriticWithGroq(criticInput(2), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps), maxRetries: 2 } }),
    (error) => {
      assert.equal(error.technical_state, "partial_failure");
      return true;
    }
  );
  // L'invariant vérifié est INCHANGÉ : le nombre d'attentes doit valoir EXACTEMENT le nombre de
  // reprises internes des batches réellement tentés — jamais une attente supplémentaire
  // "reprogrammée" par le pacer après un échec (ce qui prouverait le défaut R2).
  //
  // CSR-01 : l'attendu n'est plus le littéral 2 mais la valeur DÉRIVÉE du plan de batch réel
  // (batches × maxRetries). Deux raisons : (a) depuis la recalibration du coût de sortie, ces deux
  // issues forment deux batches et non un ; (b) runCriticBatchedPipeline ne s'arrête PAS au premier
  // batch en échec — elle les tente tous puis lève partial_failure — ce que le commentaire d'origine
  // de ce test supposait à tort. Paramétrer l'attendu rend l'invariant robuste au plan de batch.
  const maxRetries = 2;
  const attemptedBatches = new Set(batchCallLog.map((c) => c.issueIds.join(","))).size;
  const expectedWaitPerRetry = Math.round(1 * 1000) + 750;
  assert.equal(sleeps.length, attemptedBatches * maxRetries, `attendu exactement ${attemptedBatches * maxRetries} attentes (les reprises internes des ${attemptedBatches} batch(es) épuisé(s)), obtenu ${sleeps.length} : ${JSON.stringify(sleeps)}`);
  for (const w of sleeps) assert.equal(w, expectedWaitPerRetry, "aucune attente ne doit différer du Retry-After annoncé : jamais un délai déjà consommé reprogrammé.");
});

// --- R2.1-6 : partial_failure inchangé si retries réellement épuisés -------------------------------

test("R2.1-6 : partial_failure reste produit explicitement quand les retries sont réellement épuisés (comportement R2 préservé)", async (t) => {
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    return groq429Body();
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

// --- R2.1-7 : N=4 [2,2] -- ordre, assemblage, derive, validate inchangés ---------------------------

test("R2.1-7 : N=4 sur >=2 batches réels (fixture volumineuse), avec un 429 transitoire sur le premier batch -- ordre/assemblage/derive/validate corrects, et aucune attente pacer supplémentaire entre batch1 (succès) et batch2", async (t) => {
  const bigDescription = "x".repeat(2000);
  const analystOutput = {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: 4 }, (_, i) => ({ id: `issue${i + 1}`, type: "missing_information", description: bigDescription, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
  const sleeps = [];
  const calls = [];
  let firstBatchAttempt = true;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = issueIdsOf(options);
    calls.push(issueIds);
    if (firstBatchAttempt) { firstBatchAttempt = false; return groq429Body({ retryAfterS: 1 }); }
    return groqResponse(batchEntryFor(issueIds, null));
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep(sleeps) } }
  );
  assert.ok(calls.length >= 3, `attendu >=3 tentatives de batch (>=2 batches réels + 1 retry sur le premier), obtenu ${calls.length}.`);
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
  // Une seule attente réelle (le retry du premier batch) ; le second batch part sans reliquat imposé.
  assert.equal(sleeps.length, 1, `attendu 1 seule attente (le retry du premier batch), obtenu ${sleeps.length} : ${JSON.stringify(sleeps)}`);
});

// --- R2.1-8 : N=0 -- aucune régression ---------------------------------------------------------------

test("R2.1-8 : N=0 -> aucun appel batch, aucune attente, un seul appel réseau (le Critic global) -- inchangé par R2.1", async (t) => {
  let calls = 0;
  const sleeps = [];
  withGroqFetch(t, async () => { calls += 1; return groqResponse(globalOutputFixture()); });
  const output = await runCriticWithGroq(criticInput(0), { GROQ_API_KEY: "server-only" }, { retryOverrides: { sleepFn: recordingSleep(sleeps) } });
  assert.equal(calls, 1);
  assert.equal(sleeps.length, 0);
  assert.deepEqual(output.question_substitution_review, []);
});

// --- R2.1-9 : Workers AI inchangé ---------------------------------------------------------------------

test("R2.1-9 : workers/workers-ai/src/index.js ne contient toujours aucune trace de pacer/retry Groq -- inchangé par R2.1", () => {
  const source = fs.readFileSync(workersAiSrcPath, "utf8");
  assert.doesNotMatch(source, /try again in/i);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|fetchGroqWithRetry/);
});

// --- R2.1-10 : aucune logique provider/pacing dans operational-request-core.js -----------------------

test("R2.1-10 : operational-request-core.js reste totalement dépourvu de logique de pacing/retry provider -- inchangé par R2.1", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(source, /\b429\b/);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /rate.limit/i);
  assert.doesNotMatch(source, /pacer/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|parseRetryAfterMs|parseRetryDelayFromBody/);
});

// --- Frontière HTTP 8192 : hors périmètre, non touchée ------------------------------------------------

// R2.1-verif (corrigé LOT HTTP-8192) : vérifiait auparavant que le plafond transport restait le
// littéral "maxBytes = 8192" -- ce littéral n'existe plus depuis LOT HTTP-8192, qui l'a
// délibérément remplacé par une politique route-specific (TRANSPORT_LIMITS, cf.
// tests/http-transport-limits.test.mjs pour la couverture dédiée). L'intention d'origine (ce
// plafond reste défini une seule fois, dans decision-core.js, jamais dupliqué ailleurs par un lot
// qui n'a pas vocation à y toucher) est préservée en vérifiant que TRANSPORT_LIMITS y est bien
// exporté -- même discipline que la correction de R2-1 en R2.1 : un test qui encodait une contrainte
// devenue obsolète est mis à jour, jamais supprimé silencieusement.
test("R2.1-verif (corrigé LOT HTTP-8192) : le plafond transport (TRANSPORT_LIMITS) reste défini une seule fois, dans decision-core.js", () => {
  const decisionCorePath = fileURLToPath(new URL("../workers/shared/decision-core.js", import.meta.url));
  const source = fs.readFileSync(decisionCorePath, "utf8");
  assert.match(source, /export const TRANSPORT_LIMITS/);
});
