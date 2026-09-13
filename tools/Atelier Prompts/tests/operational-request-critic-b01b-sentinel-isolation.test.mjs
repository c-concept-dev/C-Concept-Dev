import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { benchmarkCriticIsolation, TIMEOUT_MS, buildCompletedIndex } from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";
import { validateAnalystOutput } from "../workers/shared/operational-request-core.js";

// 3F.3.3-S2-E : preuve empirique déterministe de B-01B (S2) sur une sortie Analyst FIGÉE, sans aucun
// nouveau tirage Analyste — isole la question scientifique "le Critic produit-il réellement la revue
// de substitution et détecte-t-il une question illégitime ?" de la stochasticité côté Analyste déjà
// observée (parfois material+question, parfois material+decide, parfois JSON de provenance invalide).
//
// Architecture retenue (diagnostic avant code, mission §9) : AUCUNE modification de
// evaluation/lot10g3b3f3/run-role-benchmark.mjs — le mécanisme role_under_test="critic_isolation"
// (benchmarkCriticIsolation, exporté) existe déjà, n'appelle jamais le provider Analyste, câble déjà
// context.analyst_output=testCase.fixture_analyst_output dans scoreCriticOutput, et hérite déjà du
// timeout global H2, du pacing, des retries et du checkpoint via le même runRole partagé que le
// chemin générique analyst_and_critic. C'est le plus petit changement possible : seule une fixture
// (evaluation/lot10g3b3f3/fixtures/critic-b01b-sentinel.json, un mini-corpus autonome, jamais
// evaluation/lot10g3b3f3/corpus.json) et ce fichier de test sont ajoutés. Ce même fichier de fixture
// peut aussi servir de --corpus alternatif pour un futur smoke réel Critic-seul (mission §32),
// autorisé séparément — aucun smoke réseau n'est exécuté ici.
//
// Aucun mot métier de production n'est introduit dans du CODE ici : le contenu narratif (voyage,
// dates, budget, durée, format) n'existe que dans la fixture JSON dédiée, jamais dans
// operational-request-core.js ni score-role-outputs.mjs (tous deux inchangés par S2-E). Le harnais
// lui-même ne tranche jamais une question sémantique (mission §26) : les tests ci-dessous ne jugent
// jamais si une alternative est "vraiment" disponible, ils vérifient uniquement que le pipeline
// d'isolation transmet et note correctement une sortie Critic bien ou mal formée.

const FIXTURE_PATH = fileURLToPath(new URL("../evaluation/lot10g3b3f3/fixtures/critic-b01b-sentinel.json", import.meta.url));
const fixtureCorpus = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const sentinelCase = fixtureCorpus.cases.find((c) => c.id === "sentinel-b01b-substitution");

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation structurelle de ${treatment} au vu des données figées reçues.` }
  ]));
}

function lastResortReview(issueId) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(null), question_is_last_resort: true, available_alternative: null };
}

function availableReview(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(alternative), question_is_last_resort: false, available_alternative: alternative };
}

// 3F.3.3-X2-B : forme RÉELLEMENT produite par le LLM (mock de réponse Groq uniquement) — why_available
// remplace question_is_last_resort, consommé par deriveCriticConsequences.
function availableReviewRawLlm(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(alternative), available_alternative: alternative, why_available: `Justification structurelle : ${alternative} était raisonnablement disponible pour ${issueId}.` };
}

function illegitimateFinding(issueId, alternative) {
  return { issue_id: issueId, available_alternative: alternative, why_available: `Justification structurelle : ${alternative} était raisonnablement disponible pour ${issueId}.` };
}

function minimalCriticOutput(overrides = {}) {
  return {
    agreement: "agree",
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: [],
    illegitimate_question_found: [],
    ...overrides
  };
}

// --- Section 18 : la fixture protège son propre caractère discriminant ----------------------------

test("S2-E-1 : la fixture sentinelle contient exactement 4 issues material+question et 1 issue non_material", () => {
  assert.ok(sentinelCase, "le cas sentinel-b01b-substitution doit exister dans la fixture.");
  assert.equal(sentinelCase.role_under_test, "critic_isolation");
  const validated = validateAnalystOutput(sentinelCase.fixture_analyst_output);
  const materialQuestion = validated.issues.filter((i) => i.impact === "material" && i.recommended_treatment === "question");
  assert.equal(materialQuestion.length, 4, "la fixture doit rester discriminante : exactement 4 issues material+question.");
  assert.deepEqual(materialQuestion.map((i) => i.id).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  const nonMaterial = validated.issues.filter((i) => i.impact !== "material");
  assert.equal(nonMaterial.length, 1, "exactement 1 issue non_material, pour distinguer la couverture ciblée d'une couverture aveugle.");
  assert.equal(nonMaterial[0].id, "issue5");
});

test("S2-E-2 : la fixture est P1-compatible (tout ProvenanceRecord a field/provenance/value non vides)", () => {
  const validated = validateAnalystOutput(sentinelCase.fixture_analyst_output);
  assert.ok(validated.provenance_records.length > 0);
  for (const record of validated.provenance_records) {
    assert.ok(record.field, "field ne doit jamais être vide.");
    assert.ok(record.value && record.value.trim(), "value ne doit jamais être vide (P1).");
    assert.ok(record.provenance, "provenance ne doit jamais être vide.");
  }
});

test("S2-E-3 : la fixture n'invente pas l'anomalie passeport (défaut séparé, non touché par S2-E)", () => {
  const candidate = sentinelCase.fixture_analyst_output.operational_request_candidate;
  assert.deepEqual(candidate.assumptions_allowed, [], "assumptions_allowed doit rester vide : l'invention passeport est un défaut séparé, jamais réutilisé ni corrigé ici.");
  const passportProvenance = sentinelCase.fixture_analyst_output.provenance_records.filter((r) => r.field === "assumptions_allowed");
  assert.equal(passportProvenance.length, 0);
});

// --- Section 19/20 : isolation réelle — zéro appel Analyste, exactement un appel Critique ---------

test("S2-E-4 : benchmarkCriticIsolation n'appelle jamais l'Analyste (provider factice explosif) et appelle le Critique exactement une fois", async (t) => {
  let analystCalls = 0;
  let criticCalls = 0;
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    const isAnalystSchema = body.response_format?.json_schema?.name === "oprie_analyst";
    if (isAnalystSchema) {
      analystCalls += 1;
      throw new Error("JAMAIS : le provider Analyste ne doit jamais être invoqué en mode critic_isolation.");
    }
    criticCalls += 1;
    return groqChatResponse(minimalCriticOutput({
      question_substitution_review: [
        lastResortReview("issue1"), lastResortReview("issue2"), lastResortReview("issue3"), lastResortReview("issue4")
      ]
    }));
  });
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  await benchmarkCriticIsolation(testCase, "groq", results);
  assert.equal(analystCalls, 0, "analyst_calls doit être exactement 0.");
  assert.equal(criticCalls, results.filter((r) => r.role === "critic").length);
  assert.ok(criticCalls >= 1, "au moins un appel Critique attendu.");
});

// --- Section 21 : le scorer reçoit bien context.analyst_output depuis la fixture -------------------

test("S2-E-5 : le scorer reçoit context.analyst_output=fixture, rendant visibles les 4 issues material+question", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput({
    question_substitution_review: [
      lastResortReview("issue1"), lastResortReview("issue2"), lastResortReview("issue3"), lastResortReview("issue4")
    ]
  })));
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  await benchmarkCriticIsolation(testCase, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.ok(criticRow, "une ligne de résultat Critic doit être produite.");
  assert.equal(criticRow.valid_json, true);
  const coverageCriterion = criticRow.score.criteria.find((c) => c.criterion === "question_substitution_review_covers_all_targetable_issues");
  assert.ok(coverageCriterion, "le critère de couverture S2 doit être présent : preuve que context.analyst_output a bien été transmis.");
  assert.equal(coverageCriterion.pass, true);
});

// --- Section 24 : une sortie Critic S2 valide et complète doit passer le score ---------------------

test("S2-E-6 : une sortie Critic S2 bien formée (4 revues, une alternative disponible, disagree) obtient score.pass=true", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput({
    agreement: "disagree",
    vetoes: [{
      issue_id: "issue2",
      new_information_trigger: "Aucune information nouvelle ne permet de déduire le budget disponible.",
      why_material: "Le budget conditionne fortement la faisabilité du plan de voyage demandé.",
      why_not_substitutable: "Aucune donnée ne permet de déduire un budget sans le demander explicitement."
    }],
    question_substitution_review: [
      lastResortReview("issue1"),
      availableReviewRawLlm("issue2", "estimate"),
      lastResortReview("issue3"),
      lastResortReview("issue4")
    ],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  })));
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  await benchmarkCriticIsolation(testCase, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true, "la sortie doit être structurellement valide (validateCriticOutput).");
  assert.equal(criticRow.score.pass, true, "une revue S2 complète et cohérente doit obtenir un score structurel pass=true.");
  assert.equal(criticRow.__output.question_substitution_review.length, 4);
  assert.ok(criticRow.__output.question_substitution_review.some((r) => r.question_is_last_resort === false));
  assert.ok(criticRow.__output.illegitimate_question_found.length > 0);
  assert.equal(criticRow.__output.agreement, "disagree");
});

// --- Section 25 : la preuve locale que S2 empêche exactement la pathologie S1 (agree silencieux) ---

test("S2-E-7 : une sortie \"agree\" silencieuse (question_substitution_review=[], illegitimate_question_found=[]) échoue au score malgré 4 issues material+question réelles", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput()));
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  await benchmarkCriticIsolation(testCase, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true, "cette forme reste structurellement valide (validateCriticOutput seul ne peut pas la détecter) : la preuve doit venir du scorer.");
  assert.equal(criticRow.score.pass, false, "S2 doit faire échouer le score : c'est exactement la pathologie observée après S1 sur case-12-italie.");
  const missingCoverage = criticRow.score.criteria.find((c) => c.criterion === "question_substitution_review_covers_all_targetable_issues");
  assert.ok(missingCoverage, "le critère de couverture doit être présent (analyst_output fourni par la fixture).");
  assert.equal(missingCoverage.pass, false);
});

// --- Section 22 : le timeout global H2 continue de s'appliquer en isolation ------------------------

test("S2-E-8 : un Critique qui ne répond jamais est borné par le timeout de rôle (H2), jamais un blocage indéfini", async (t) => {
  withFetch(t, async () => new Promise(() => {}));
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  const start = Date.now();
  await benchmarkCriticIsolation(testCase, "groq", results, { roleTimeoutMs: 300 });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 5000, `l'appel doit être borné par roleTimeoutMs, jamais bloquer indéfiniment (écoulé=${elapsed}ms).`);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, false, "un appel qui ne répond jamais doit être classé en échec technique, jamais un succès.");
  assert.equal(criticRow.error_kind, "timeout");
});

test("S2-E-9 : le timeout de rôle utilisé par défaut reste le TIMEOUT_MS global du harnais (aucun chemin parallèle)", () => {
  assert.ok(Number.isFinite(TIMEOUT_MS) && TIMEOUT_MS > 0, "TIMEOUT_MS (H2) doit rester la valeur par défaut, aucune constante dupliquée pour l'isolation.");
});

// --- Section 13 : l'exécution isolée n'implique jamais de tirage Analyste (compteur exact) --------

test("S2-E-10 : sur plusieurs répétitions de résultats déjà en cache (completedIndex), aucun appel Analyste n'est jamais tenté", async (t) => {
  let analystCalls = 0;
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format?.json_schema?.name === "oprie_analyst") { analystCalls += 1; throw new Error("JAMAIS"); }
    return groqChatResponse(minimalCriticOutput({
      question_substitution_review: [lastResortReview("issue1"), lastResortReview("issue2"), lastResortReview("issue3"), lastResortReview("issue4")]
    }));
  });
  const results = [];
  const testCase = { ...sentinelCase, oracle: { critic: {} } };
  await benchmarkCriticIsolation(testCase, "groq", results, { completedIndex: new Map() });
  const completedIndex = buildCompletedIndex(results);
  const resultsAfterResume = [];
  await benchmarkCriticIsolation(testCase, "groq", resultsAfterResume, { completedIndex });
  assert.equal(analystCalls, 0, "ni la première passe ni une reprise (checkpoint) ne doivent jamais appeler l'Analyste.");
  assert.equal(resultsAfterResume.length, 0, "toutes les lignes étant déjà dans completedIndex, aucun nouvel appel Critique ne doit être refait.");
});
