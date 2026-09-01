import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCandidate } from "../core/adn/index.js";
import { CRITIC_GLOBAL_JSON_SCHEMA, buildSubstitutionBatchSchema, materializeSubstitutionReviewFromCandidates } from "../workers/shared/operational-request-core.js";
import { runCriticWithAnthropic, runCriticWithGroq, ANTHROPIC_MODEL } from "../workers/groq/src/index.js";

// 3F.3.3-X2-BATCH-R5.2 : ANTHROPIC CRITIC REAL SMOKE (préparation locale). Évalue le pipeline Critic
// batché (Critic global + Substitution Review) sur Anthropic, en réutilisant EXACTEMENT la même
// fixture N=4, le même plan de batch [issue1,issue2]/[issue3,issue4], le même assemblage et la même
// dérivation/validation que le chemin Groq de référence (R3B) — seul le transport change. Aucun
// mock ne simule un vrai délai réseau : ces tests ne prouvent jamais la performance réelle (objet du
// smoke réel préparé séparément), seulement la correction structurelle du câblage Anthropic.

// --- Fixture N=4 R3B, reprise à l'identique (tests/operational-request-critic-transport-optimization-
// x2batch-r3b.test.mjs) : mêmes helpers, même contenu, jamais une redérivation approximative. ---------

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}

function analystOutputWithIssues(n, { descLen = 0 } = {}) {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "x" },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: n }, (_, i) => ({
      id: `issue${i + 1}`, type: "missing_information",
      description: descLen > 0 ? "x".repeat(descLen) : `Description réelle et distincte ${i + 1} — ne doit jamais être perdue.`,
      impact: "material", substitutable: false, recommended_treatment: "question", kind: null
    })),
    question_candidates: [],
    confirmation_signals: confirmationSignals()
  };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];
// X2-C.4 : le provider produit désormais des candidates matérialisées (jamais alternatives_reviewed/
// available_alternative directement) -- cf. buildSubstitutionBatchSchema/materializeSubstitutionReviewFromCandidates.
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
function globalOutputFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function anthropicToolUseResponse(toolInput, { status = 200, schemaName } = {}) {
  return Response.json({ content: [{ type: "tool_use", name: schemaName, input: toolInput }] }, { status });
}

function bodyOf(options) { return JSON.parse(options.body); }
function schemaNameOf(options) { return bodyOf(options).tools[0].name; }
function issueIdsOf(options) { return Object.keys(bodyOf(options).tools[0].input_schema.properties); }

// X2-C.4 : SUBSTITUTION_REVIEW_SYSTEM_PROMPT s'est agrandi (matérialisation exhaustive des 6
// candidates, 7 champs chacune) -- GROQ_CRITIC_CAPABILITY.fixedOverheadUnits (INCHANGÉ) mesure la
// taille RÉELLE du prompt, donc computeBatchPlan (INCHANGÉ) produit désormais [1,1,1,1] pour cette
// fixture N=4, plus un plan [2,2] comme avant X2-C.4 (cf. tests/operational-request-critic-transport-
// optimization-x2batch-r3b.test.mjs, R3B-6, re-mesuré de façon identique).
const N4_FIXTURE = () => analystOutputWithIssues(4, { descLen: 2000 }); // même fixture-technique R3B, force >=2 batches réels

// --- R5.2-1 : plan de batch IDENTIQUE à Groq pour la même fixture ----------------------------------

test("R5.2-1 : N=4 (fixture R3B) sur Anthropic -> plan de batch [1,1,1,1] STRICTEMENT identique à Groq (dimensionnement réutilisé, jamais recalculé)", async (t) => {
  const batchSizes = [];
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    const issueIds = issueIdsOf(options);
    batchSizes.push(issueIds.length);
    return anthropicToolUseResponse(batchEntryFor(issueIds, null), { schemaName: "substitution_review_batch" });
  });
  await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  assert.deepEqual(batchSizes, [1, 1, 1, 1], `attendu le même plan [1,1,1,1] que Groq (R3B post-X2-C.4), obtenu ${JSON.stringify(batchSizes)}.`);
});

// --- R5.2-2 : assemblage 4/4, issue_ids et ordre corrects -------------------------------------------

test("R5.2-2 : N=4 -> assemblage 4/4, ordre et issue_ids corrects (un batch par issue, post-X2-C.4)", async (t) => {
  const batchIssueIds = [];
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    const issueIds = issueIdsOf(options);
    batchIssueIds.push(issueIds);
    return anthropicToolUseResponse(batchEntryFor(issueIds, null), { schemaName: "substitution_review_batch" });
  });
  const output = await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  assert.deepEqual(batchIssueIds, [["issue1"], ["issue2"], ["issue3"], ["issue4"]]);
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R5.2-3 : structured output via tool_use natif Anthropic, schémas EXACTS -----------------------

test("R5.2-3 : Critic global -> tool_use Anthropic, input_schema = CRITIC_GLOBAL_JSON_SCHEMA exact, tool_choice forcé, modèle correct", async (t) => {
  let captured;
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") { captured = bodyOf(options); return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" }); }
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  assert.equal(captured.tools.length, 1);
  assert.equal(captured.tools[0].name, "critic_global");
  assert.deepEqual(captured.tools[0].input_schema, CRITIC_GLOBAL_JSON_SCHEMA);
  assert.deepEqual(captured.tool_choice, { type: "tool", name: "critic_global" });
  assert.equal(captured.model, ANTHROPIC_MODEL);
});

test("R5.2-3b : chaque batch Substitution Review -> tool_use Anthropic, input_schema = buildSubstitutionBatchSchema(issueIds) exact pour CE lot", async (t) => {
  const capturedByBatch = [];
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    capturedByBatch.push(bodyOf(options));
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  assert.equal(capturedByBatch.length, 4);
  assert.deepEqual(capturedByBatch[0].tools[0].input_schema, buildSubstitutionBatchSchema(["issue1"]));
  assert.deepEqual(capturedByBatch[1].tools[0].input_schema, buildSubstitutionBatchSchema(["issue2"]));
  assert.deepEqual(capturedByBatch[2].tools[0].input_schema, buildSubstitutionBatchSchema(["issue3"]));
  assert.deepEqual(capturedByBatch[3].tools[0].input_schema, buildSubstitutionBatchSchema(["issue4"]));
});

// --- R5.2-4 : assemblage + derive + validate (inchangés) produisent une sortie CriticOutput valide --

test("R5.2-4 : le pipeline complet (assemblage + derive + validate, tous inchangés) produit une sortie CriticOutput valide avec Anthropic", async (t) => {
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), "estimate"), { schemaName: "substitution_review_batch" });
  });
  const output = await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  for (const key of ["agreement", "operational_request_candidate_review", "vetoes", "semantic_drift_detected", "significant_stakes", "question_substitution_review", "illegitimate_question_found"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(output, key), `CriticOutput.${key} doit être présent (derive+validate inchangés).`);
  }
  assert.equal(output.question_substitution_review.length, 4);
  assert.ok(output.question_substitution_review.every((r) => r.available_alternative === "estimate"));
  assert.equal(output.agreement, "disagree", "4 alternatives disponibles -> 4 recours illégitimes détectés -> disagree (dérivation mécanique inchangée).");
  assert.equal(output.illegitimate_question_found.length, 4);
});

// --- R5.2-5 : un échec technique de batch reste explicite, jamais un review fabriqué ----------------

test("R5.2-5 : un échec technique d'un batch Anthropic remonte technical_state=\"partial_failure\", jamais une review de repli inventée", async (t) => {
  let batchCall = 0;
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    batchCall += 1;
    if (batchCall === 1) return anthropicToolUseResponse({ error: { type: "overloaded_error", message: "surchargé" } }, { status: 529, schemaName: "substitution_review_batch" });
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await assert.rejects(
    () => runCriticWithAnthropic(
      { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
      { ANTHROPIC_API_KEY: "server-only" }
    ),
    (error) => {
      assert.equal(error.technical_state, "partial_failure");
      assert.equal(error.batchFailures.length, 1);
      assert.equal(error.succeededBatchCount, 3);
      assert.equal(error.totalBatchCount, 4);
      return true;
    }
  );
});

// --- R5.2-6 : aucun pacer/retry inventé pour Anthropic (un seul fetch par appel, jamais de reprise) -

test("R5.2-6 : aucune reprise automatique n'est inventée pour Anthropic -- un HTTP 429/529 sur un appel du pipeline Critic échoue immédiatement (un seul fetch pour cet appel, aucun sleep)", async (t) => {
  let globalFetchCount = 0;
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") { globalFetchCount += 1; return anthropicToolUseResponse({ error: { type: "rate_limit_error", message: "429" } }, { status: 429, schemaName: "critic_global" }); }
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await assert.rejects(
    () => runCriticWithAnthropic(
      { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
      { ANTHROPIC_API_KEY: "server-only" }
    ),
    /Anthropic a répondu 429/
  );
  assert.equal(globalFetchCount, 1, "le Critic global ne doit être appelé qu'une seule fois -- aucune reprise 429 n'existe côté Anthropic (même discipline NE PAS INVENTER que R5.1/decideWithAnthropic).");
});

// --- R5.2-7 : Groq reste strictement inchangé (régression) ------------------------------------------

test("R5.2-7 : runCriticWithGroq reste strictement inchangé -- même fixture N=4, même plan [1,1,1,1] (post-X2-C.4) que Anthropic, appelle toujours l'endpoint Groq", async (t) => {
  let calledGroqEndpoint = false;
  const batchSizes = [];
  withFetch(t, async (url, options) => {
    calledGroqEndpoint = calledGroqEndpoint || String(url).includes("groq.com");
    const body = JSON.parse(options.body);
    const name = body.response_format.json_schema.name;
    if (name === "critic_global") return Response.json({ choices: [{ message: { content: JSON.stringify(globalOutputFixture()) } }] });
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    batchSizes.push(issueIds.length);
    return Response.json({ choices: [{ message: { content: JSON.stringify(batchEntryFor(issueIds, null)) } }] });
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.equal(calledGroqEndpoint, true);
  assert.deepEqual(batchSizes, [1, 1, 1, 1]);
  assert.equal(output.question_substitution_review.length, 4);
});

// --- 3F.3.3-X2-BATCH-R5.2a : ANTHROPIC CRITIC MEASUREMENT TIMEOUT ONLY --------------------------
//
// Preuve réelle exploitée : smoke réel R5.2 (claude-sonnet-4-6, pipeline Critic batché N=4) —
// authentification OK, aucun 401, aucun 429, mais le premier appel (Critic global) a été interrompu
// EXACTEMENT à 20007ms ("The operation was aborted due to timeout") — un artefact du timeout
// /decision (20000ms), jamais dimensionné pour ce pipeline au prompt/schéma nettement plus
// volumineux. ANTHROPIC_CRITIC_TIMEOUT_MS=60000 est désormais utilisé UNIQUEMENT par
// runCriticWithAnthropic (Critic global + chaque batch) ; ANTHROPIC_TIMEOUT_MS=20000 reste
// strictement inchangé pour /decision (decideWithAnthropic) ; le timeout Groq (8000ms) reste
// strictement inchangé pour les deux pipelines Groq (/decision et Critic).

function withAbortSignalTimeoutSpy(t) {
  const original = AbortSignal.timeout;
  const calls = [];
  AbortSignal.timeout = (ms) => { calls.push(ms); return original.call(AbortSignal, ms); };
  t.after(() => { AbortSignal.timeout = original; });
  return calls;
}

test("R5.2a-1 : le Critic global Anthropic déclenche AbortSignal.timeout(60000), jamais 20000 (timeout /decision)", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  assert.ok(calls.includes(60000), `attendu au moins un appel AbortSignal.timeout(60000), obtenu ${JSON.stringify(calls)}`);
  assert.ok(!calls.includes(20000), "le pipeline Critic Anthropic ne doit jamais utiliser 20000ms (réservé à /decision).");
});

test("R5.2a-2 : chaque batch Substitution Review Anthropic déclenche aussi AbortSignal.timeout(60000)", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), null), { schemaName: "substitution_review_batch" });
  });
  await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  // 5 appels attendus (1 global + 4 batches, post-X2-C.4) : tous à 60000, jamais un mélange de valeurs.
  assert.equal(calls.length, 5, `attendu 5 appels réseau (1 global + 4 batches), obtenu ${JSON.stringify(calls)}`);
  assert.ok(calls.every((ms) => ms === 60000), `tous les appels du pipeline Critic Anthropic doivent utiliser 60000ms, obtenu ${JSON.stringify(calls)}`);
});

test("R5.2a-3 : le pipeline Critic Groq reste strictement inchangé -- AbortSignal.timeout(8000), jamais 60000 ni 20000", async (t) => {
  const calls = withAbortSignalTimeoutSpy(t);
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    const name = body.response_format.json_schema.name;
    if (name === "critic_global") return Response.json({ choices: [{ message: { content: JSON.stringify(globalOutputFixture()) } }] });
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    return Response.json({ choices: [{ message: { content: JSON.stringify(batchEntryFor(issueIds, null)) } }] });
  });
  await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.ok(calls.length > 0, "au moins un appel réseau attendu côté Groq.");
  assert.ok(calls.every((ms) => ms === 8000), `le pipeline Critic Groq doit rester à 8000ms, obtenu ${JSON.stringify(calls)}`);
});

// --- 3F.3.3-FINAL-INTEGRATION (audit Question d'Intégration N°3) : ANTHROPIC_CRITIC_INCOMPLETE_
// TOOL_USE_MUST_FAIL ---------------------------------------------------------------------------------
//
// Constat d'audit : contrairement à Groq (json_schema strict mode, required===properties, tout batch
// contractuellement incomplet est rejeté HTTP 400 par le provider AVANT toute réponse -- cause racine
// STRUCTURED_OUTPUT_PROVIDER_LIMIT de X2-C.4/MICRO-PREUVE), l'API Anthropic ne revalide pas
// strictement tool_use.input contre input_schema : un batch peut revenir en HTTP 200 avec moins de 6
// familles de candidates par issue. Avant le correctif FINAL-INTEGRATION, cette absence était
// silencieusement interprétée par materializeSubstitutionReviewFromCandidates comme "famille non
// applicable" (branche !candidate d'evaluateSubstitutionCandidateGate) plutôt que comme un manquement
// contractuel -- risque réel (vérifié empiriquement en dry-run local, aucun smoke réseau) : un
// question_is_last_resort=true pourrait être atteint sans que les familles omises par le provider
// n'aient jamais été réellement évaluées. Anthropic Critic reste NON ROUTÉ en production
// (executeForRole ne l'appelle jamais) -- ce test prouve que MÊME s'il l'était, aucune sortie
// contractuellement incomplète ne peut être acceptée comme review valide, ne peut contourner
// validateCriticOutput, ne peut produire un succès partiel silencieux, et ne fabrique jamais une
// famille/candidate/review manquante.

test("FINAL-INTEGRATION-1 : un batch Anthropic HTTP 200 dont une issue ne contient QUE 3/6 familles de candidates (scenario/condition/leave_unknown absentes, résidu réel R5.2a) ne produit JAMAIS une review acceptée -- rejet contractuel explicite, jamais un succès partiel silencieux", async (t) => {
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse(
      { issue1: { candidates: { research: candidateFor("research", false), decide: candidateFor("decide", false), estimate: candidateFor("estimate", true) } } },
      { schemaName: "substitution_review_batch" }
    );
  });
  await assert.rejects(
    () => runCriticWithAnthropic(
      { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(1), previous_vetoes: [] },
      { ANTHROPIC_API_KEY: "server-only" }
    ),
    (error) => {
      assert.match(error.message, /candidates doit contenir exactement les 6 familles/, `attendu un rejet contractuel explicite nommant les 6 familles, obtenu : ${error.message}`);
      assert.match(error.message, /research, decide, estimate/, "l'erreur doit lister les familles réellement reçues (jamais une famille fabriquée).");
      return true;
    }
  );
});

test("FINAL-INTEGRATION-2 : un batch Anthropic HTTP 200 dont une issue ne contient AUCUNE candidate (candidates={} ou absent) est rejeté à l'identique -- jamais requalifié en \"aucune alternative disponible\" (question_is_last_resort) sans preuve que les 6 familles ont été évaluées", async (t) => {
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse({ issue1: { candidates: {} } }, { schemaName: "substitution_review_batch" });
  });
  await assert.rejects(
    () => runCriticWithAnthropic(
      { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(1), previous_vetoes: [] },
      { ANTHROPIC_API_KEY: "server-only" }
    ),
    /candidates doit contenir exactement les 6 familles/
  );
});

test("FINAL-INTEGRATION-3 : materializeSubstitutionReviewFromCandidates rejette aussi un SURPLUS de familles (candidate inventée hors des 6 connues) -- jamais un contrat élargi silencieusement", () => {
  const sevenFamilies = Object.fromEntries([...LADDER, "bogus_family"].map((t) => [t, candidateFor(t, false)]));
  assert.throws(
    () => materializeSubstitutionReviewFromCandidates(sevenFamilies),
    /candidates doit contenir exactement les 6 familles/
  );
});

test("FINAL-INTEGRATION-4 : le chemin Groq (json_schema strict, référence historique) reste par construction incapable de produire ce cas -- vérifié explicitement pour ne jamais régresser silencieusement en un rejet côté provider plutôt qu'un succès légitime", async (t) => {
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    const name = body.response_format.json_schema.name;
    if (name === "critic_global") return Response.json({ choices: [{ message: { content: JSON.stringify(globalOutputFixture()) } }] });
    const issueIds = Object.keys(body.response_format.json_schema.schema.properties);
    return Response.json({ choices: [{ message: { content: JSON.stringify(batchEntryFor(issueIds, "estimate")) } }] });
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(1), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.equal(output.question_substitution_review[0].available_alternative, "estimate", "Groq (6 familles toujours fournies par construction du test) doit continuer à produire une review valide -- comportement inchangé.");
});

test("FINAL-INTEGRATION-5 : materializeSubstitutionReviewFromCandidates -- un jeu de 6 candidates COMPLET et valide produit un résultat STRICTEMENT identique à avant ce correctif (non-régression unitaire directe, aucune famille manquante à rejeter)", () => {
  const complete = Object.fromEntries(LADDER.map((t) => [t, candidateFor(t, t === "scenario")]));
  const materialized = materializeSubstitutionReviewFromCandidates(complete);
  assert.deepEqual(Object.keys(materialized.alternatives_reviewed).sort(), [...LADDER].sort());
  assert.equal(materialized.available_alternative, "scenario");
  assert.equal(materialized.alternatives_reviewed.scenario.reasonably_available, true);
  for (const t of LADDER) {
    if (t !== "scenario") assert.equal(materialized.alternatives_reviewed[t].reasonably_available, false);
  }
});

test("FINAL-INTEGRATION-6 : le correctif ne modifie ni evaluateSubstitutionCandidateGate, ni deriveCriticConsequences, ni validateCriticOutput, ni aucune sémantique métier -- le pipeline Anthropic complet (assemblage + derive + validate, tous inchangés) reste identique à R5.2-4 pour un jeu de candidates complet", async (t) => {
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse(batchEntryFor(issueIdsOf(options), "estimate"), { schemaName: "substitution_review_batch" });
  });
  const output = await runCriticWithAnthropic(
    { original_request: "x", clarification_history: [], analyst_output: N4_FIXTURE(), previous_vetoes: [] },
    { ANTHROPIC_API_KEY: "server-only" }
  );
  for (const key of ["agreement", "operational_request_candidate_review", "vetoes", "semantic_drift_detected", "significant_stakes", "question_substitution_review", "illegitimate_question_found"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(output, key), `CriticOutput.${key} doit rester présent (derive+validate strictement inchangés par le correctif).`);
  }
  assert.equal(output.agreement, "disagree", "dérivation mécanique inchangée : 4 alternatives disponibles -> 4 recours illégitimes -> disagree (identique à R5.2-4).");
  assert.equal(output.illegitimate_question_found.length, 4);
});

test("FINAL-INTEGRATION-7 : un rejet contractuel (candidates incomplètes) ne décide JAMAIS degraded_state -- il remonte une exception technique brute au code appelant, seul habilité (createDegradedRoleResult) à en décider, jamais materializeSubstitutionReviewFromCandidates ni aucun rôle LLM", async (t) => {
  withFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return anthropicToolUseResponse(globalOutputFixture(), { schemaName: "critic_global" });
    return anthropicToolUseResponse({ issue1: { candidates: { research: candidateFor("research", false) } } }, { schemaName: "substitution_review_batch" });
  });
  await assert.rejects(
    () => runCriticWithAnthropic(
      { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(1), previous_vetoes: [] },
      { ANTHROPIC_API_KEY: "server-only" }
    ),
    (error) => {
      assert.ok(!Object.prototype.hasOwnProperty.call(error, "state"), "l'erreur ne doit jamais porter un champ state=\"degraded_state\" -- seul le code appelant (createDegradedRoleResult) décide de la dégradation.");
      assert.notEqual(error.message, "degraded_state");
      return true;
    }
  );
});
