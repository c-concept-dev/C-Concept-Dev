import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildQuestionReviewTargets,
  makeCriticUserMessage,
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  CRITIC_OUTPUT_FIELDS,
  validateCriticOutput
} from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";
import { benchmarkCriticIsolation } from "../evaluation/lot10g3b3f3/run-role-benchmark.mjs";

// 3F.3.3-S3 : la preuve empirique décisive (smoke Groq réel, sentinelle sentinel-b01b-substitution,
// post-S2-E) a montré que le Critic peut produire un JSON strictement valide (valid_json=true) tout
// en échouant totalement à matérialiser la seconde lecture B-01B (agreement="agree",
// question_substitution_review=[], illegitimate_question_found=[]) malgré 4 issues material+question
// réelles — score.pass=false. S2 avait ajouté une SORTIE obligatoire, mais le Critic devait encore
// retrouver LUI-MÊME, dans tout l'Analyst output, quelles issues satisfont
// impact="material" ET recommended_treatment="question". Cette sélection est purement structurelle,
// ne nécessite aucun jugement LLM, et S3 la retire donc au Critic : buildQuestionReviewTargets la
// calcule mécaniquement et makeCriticUserMessage l'ajoute à l'entrée (question_review_targets),
// jamais une décision sémantique. Aucun mot métier de production (Italie, voyage, budget, dates,
// durée, hébergement, tourisme) n'apparaît dans ce fichier ni dans le code de production S3 : les
// fixtures ci-dessous sont génériques, ou réutilisent la sentinelle S2-E existante.

const S2E_FIXTURE_PATH = fileURLToPath(new URL("../evaluation/lot10g3b3f3/fixtures/critic-b01b-sentinel.json", import.meta.url));
const s2eFixtureCorpus = JSON.parse(fs.readFileSync(S2E_FIXTURE_PATH, "utf8"));
const sentinelCase = s2eFixtureCorpus.cases.find((c) => c.id === "sentinel-b01b-substitution");

function materialQuestionIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null, ...overrides };
}

function nonMaterialQuestionIssue(id) {
  return materialQuestionIssue(id, { impact: "non_material" });
}

function materialDecideIssue(id) {
  return materialQuestionIssue(id, { recommended_treatment: "decide", substitutable: true });
}

function minimalAnalystOutputWithIssues(issues) {
  return {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues,
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation structurelle de ${treatment}.` }
  ]));
}

function lastResortReview(issueId) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(null), question_is_last_resort: true, available_alternative: null };
}

function availableReview(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(alternative), question_is_last_resort: false, available_alternative: alternative };
}

function illegitimateFinding(issueId, alternative) {
  return { issue_id: issueId, available_alternative: alternative, why_available: `Justification structurelle : ${alternative} disponible pour ${issueId}.` };
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

function withFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}

function groqChatResponse(content, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage });
}

// --- Section 29 : zéro target -------------------------------------------------------------------

test("S3-1 : aucune issue material+question -> buildQuestionReviewTargets retourne []", () => {
  const analystOutput = minimalAnalystOutputWithIssues([nonMaterialQuestionIssue("ISSUE-1"), materialDecideIssue("ISSUE-2")]);
  assert.deepEqual(buildQuestionReviewTargets(analystOutput), []);
});

// --- Section 30 : une seule target --------------------------------------------------------------

test("S3-2 : une issue material+question -> exactement une target avec les bons champs", () => {
  const analystOutput = minimalAnalystOutputWithIssues([materialQuestionIssue("ISSUE-1", { type: "ambiguity", description: "Une ambiguïté matérielle non résolue." })]);
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0], {
    issue_id: "ISSUE-1",
    type: "ambiguity",
    description: "Une ambiguïté matérielle non résolue.",
    impact: "material",
    recommended_treatment: "question"
  });
});

// --- Section 31 : plusieurs, aucune règle quantitative ---------------------------------------------

test("S3-3 : 3 material+question, 2 material+decide, 1 non_material+question -> exactement 3 targets", () => {
  const analystOutput = minimalAnalystOutputWithIssues([
    materialQuestionIssue("Q-1"), materialQuestionIssue("Q-2"), materialQuestionIssue("Q-3"),
    materialDecideIssue("D-1"), materialDecideIssue("D-2"),
    nonMaterialQuestionIssue("N-1")
  ]);
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.equal(targets.length, 3);
  assert.deepEqual(targets.map((t) => t.issue_id).sort(), ["Q-1", "Q-2", "Q-3"]);
});

// --- Section 32 : champs autorisés uniquement -----------------------------------------------------

test("S3-4 : chaque target ne contient que les champs autorisés, jamais de provenance ni de champ dérivé", () => {
  const analystOutput = minimalAnalystOutputWithIssues([materialQuestionIssue("ISSUE-1")]);
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.deepEqual(Object.keys(targets[0]).sort(), ["description", "impact", "issue_id", "recommended_treatment", "type"]);
  assert.ok(!("provenance" in targets[0]));
  assert.ok(!("operational_request_candidate" in targets[0]));
  assert.ok(!("substitutable" in targets[0]));
  assert.ok(!("available_alternative" in targets[0]));
  assert.ok(!("reasonably_available" in targets[0]));
});

// --- Section 33 : immutabilité ----------------------------------------------------------------------

test("S3-5 : buildQuestionReviewTargets ne mute ni analystOutput ni ses issues", () => {
  const analystOutput = minimalAnalystOutputWithIssues([materialQuestionIssue("ISSUE-1")]);
  const snapshot = JSON.parse(JSON.stringify(analystOutput));
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.deepEqual(analystOutput, snapshot, "analystOutput ne doit jamais être modifié par cet appel.");
  targets[0].issue_id = "MUTATED";
  assert.equal(analystOutput.issues[0].id, "ISSUE-1", "muter le résultat retourné ne doit jamais affecter l'issue source (pas de partage de référence).");
});

// --- Section 34/35 : le message Critic contient explicitement les targets et leur cardinalité ------

test("S3-6 : avec 2 targets, le message Critic contient la section question_review_targets, les deux issue_id, et la cardinalité exacte", () => {
  const analystOutput = minimalAnalystOutputWithIssues([materialQuestionIssue("ISSUE-A"), materialQuestionIssue("ISSUE-B")]);
  const message = JSON.parse(makeCriticUserMessage({ original_request: "x", analyst_output: analystOutput, previous_vetoes: [] }));
  assert.ok(Array.isArray(message.question_review_targets), "la section question_review_targets doit être présente et être un tableau.");
  assert.equal(message.question_review_targets.length, 2, "cardinalité exacte : deux targets fournies, deux attendues.");
  assert.deepEqual(message.question_review_targets.map((t) => t.issue_id).sort(), ["ISSUE-A", "ISSUE-B"]);
  // L'instruction de cardinalité elle-même (une revue par target, jamais un seuil quantitatif fixe)
  // vit dans le prompt système, sous forme d'une formule symbolique liée à .length — jamais un nombre
  // codé en dur pour un cas particulier.
  assert.match(CRITIC_SYSTEM_PROMPT, /question_review_targets/);
  assert.match(CRITIC_SYSTEM_PROMPT, /nombre de clés attendu dans question_substitution_review est exactement égal au nombre d'éléments/i);
});

// 3F.3.3-X2-A : le court-circuit N=0 est désormais l'absence structurelle de la propriété (jamais un
// tableau vide), cf. buildCriticJsonSchema.
test("S3-7 : zéro target -> le prompt indique explicitement qu'aucune revue de substitution n'est requise", () => {
  const analystOutput = minimalAnalystOutputWithIssues([nonMaterialQuestionIssue("ISSUE-1")]);
  const message = JSON.parse(makeCriticUserMessage({ original_request: "x", analyst_output: analystOutput, previous_vetoes: [] }));
  assert.deepEqual(message.question_review_targets, []);
  assert.match(CRITIC_SYSTEM_PROMPT, /Si question_review_targets est vide.{0,200}question_substitution_review est alors absent de votre réponse/is);
});

// --- Section 40 : audit statique anti-hardcoding ----------------------------------------------------

test("S3-8 : ni le helper ni la section de prompt qu'il alimente ne dépendent d'un case_id, d'un corpus ou d'une catégorie métier", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|corpus\.json/i);
  // Le prédicat exact du helper est vérifié structurellement ci-dessus (S3-1..S3-4) ; ici on vérifie
  // seulement l'absence de toute référence à un identifiant de cas ou de corpus dans le code source
  // du fichier partagé (jamais un test qui se piège lui-même en listant des mots dans son propre
  // texte : on interroge le fichier de PRODUCTION, jamais ce fichier de test).
  const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const sharedCoreSource = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(sharedCoreSource, /case-12|italie|voyage|budget|tourisme/i);
});

// --- Section 41 : le contrat de sortie strict reste inchangé ----------------------------------------

test("S3-9 : CRITIC_OUTPUT_FIELDS et CRITIC_JSON_SCHEMA restent inchangés — question_review_targets est une entrée, jamais une sortie", () => {
  assert.deepEqual(CRITIC_OUTPUT_FIELDS, [
    "agreement", "operational_request_candidate_review", "vetoes", "semantic_drift_detected",
    "semantic_drift_notes", "significant_stakes", "significant_stakes_reason",
    "question_substitution_review", "illegitimate_question_found"
  ]);
  assert.ok(!("question_review_targets" in CRITIC_JSON_SCHEMA.properties), "question_review_targets ne doit jamais apparaître dans le schéma de SORTIE du Critic.");
  assert.deepEqual([...CRITIC_JSON_SCHEMA.required].sort(), [...Object.keys(CRITIC_JSON_SCHEMA.properties)].sort(), "le schéma strict Groq/OpenAI reste conforme (required == properties), sans aucune modification S3.");
});

// --- Section 42 : sentinelle locale S2-E ------------------------------------------------------------

test("S3-10 : buildQuestionReviewTargets appliqué à la fixture S2-E retourne exactement les 4 targets discriminantes", () => {
  const targets = buildQuestionReviewTargets(sentinelCase.fixture_analyst_output);
  assert.equal(targets.length, 4);
  assert.deepEqual(targets.map((t) => t.issue_id).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  for (const target of targets) {
    assert.equal(target.impact, "material");
    assert.equal(target.recommended_treatment, "question");
  }
});

// --- Section 37 : protège S2 — le fake Critic S1-like échoue toujours -------------------------------

test("S3-11 : avec la fixture S2-E, un fake Critic \"agree\" silencieux (question_substitution_review=[]) échoue toujours au score", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput()));
  const results = [];
  await benchmarkCriticIsolation({ ...sentinelCase, oracle: { critic: {} } }, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true);
  assert.equal(criticRow.score.pass, false, "S3 ne doit jamais affaiblir la protection S2 contre le silence.");
});

// --- Section 38 : fake Critic S3-compliant accepté --------------------------------------------------

test("S3-12 : un fake Critic conforme (4 reviews, mapping correct, une alternative disponible, disagree) obtient score.pass=true", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput({
    agreement: "disagree",
    vetoes: [{ issue_id: "issue2", new_information_trigger: "Aucune information nouvelle ne permet de déduire le budget.", why_material: "Le budget conditionne fortement la faisabilité.", why_not_substitutable: "Aucune donnée ne permet de le déduire sans le demander." }],
    question_substitution_review: [
      lastResortReview("issue1"), availableReview("issue2", "estimate"), lastResortReview("issue3"), lastResortReview("issue4")
    ],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  })));
  const results = [];
  await benchmarkCriticIsolation({ ...sentinelCase, oracle: { critic: {} } }, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true);
  assert.equal(criticRow.score.pass, true);
  assert.equal(criticRow.__output.question_substitution_review.length, 4);
});

// --- Section 39 : plusieurs questions légitimes restent possibles -----------------------------------

test("S3-13 : les 4 targets concluent chacune last_resort=true (aucune alternative disponible), agree -> score.pass=true", async (t) => {
  withFetch(t, async () => groqChatResponse(minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [
      lastResortReview("issue1"), lastResortReview("issue2"), lastResortReview("issue3"), lastResortReview("issue4")
    ],
    illegitimate_question_found: []
  })));
  const results = [];
  await benchmarkCriticIsolation({ ...sentinelCase, oracle: { critic: {} } }, "groq", results);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true);
  assert.equal(criticRow.score.pass, true, "plusieurs questions légitimes simultanées ne doivent jamais, à elles seules, faire échouer le score.");
  assert.equal(criticRow.__output.agreement, "agree");
});

// --- Section 43 : end-to-end local sans réseau, via benchmarkCriticIsolation ------------------------

test("S3-14 : end-to-end local — 0 appel Analyst, 1 appel Critic, message contenant les 4 targets, sortie S3 valide et pass", async (t) => {
  let analystCalls = 0;
  let capturedCriticBody = null;
  withFetch(t, async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.response_format?.json_schema?.name === "oprie_analyst") { analystCalls += 1; throw new Error("JAMAIS : aucun appel Analyst ne doit avoir lieu en isolation Critic."); }
    capturedCriticBody = body;
    return groqChatResponse(minimalCriticOutput({
      agreement: "disagree",
      vetoes: [{ issue_id: "issue2", new_information_trigger: "Aucune information nouvelle ne permet de déduire le budget.", why_material: "Le budget conditionne fortement la faisabilité.", why_not_substitutable: "Aucune donnée ne permet de le déduire sans le demander." }],
      question_substitution_review: [
        lastResortReview("issue1"), availableReview("issue2", "estimate"), lastResortReview("issue3"), lastResortReview("issue4")
      ],
      illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
    }));
  });
  const results = [];
  await benchmarkCriticIsolation({ ...sentinelCase, oracle: { critic: {} } }, "groq", results);
  assert.equal(analystCalls, 0);
  assert.ok(capturedCriticBody, "un appel Critique doit avoir été effectué.");
  const sentUserMessage = JSON.parse(capturedCriticBody.messages[1].content);
  assert.ok(Array.isArray(sentUserMessage.question_review_targets));
  assert.equal(sentUserMessage.question_review_targets.length, 4);
  assert.deepEqual(sentUserMessage.question_review_targets.map((t) => t.issue_id).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  const criticRow = results.find((r) => r.role === "critic");
  assert.equal(criticRow.valid_json, true);
  assert.equal(criticRow.score.pass, true);
});

// --- Non-régression : validateCriticOutput accepte toujours une sortie construite sans changement --

test("S3 : validateCriticOutput reste inchangé — une sortie S2 valide continue de passer sans aucune référence à question_review_targets", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("ISSUE-1", "research")],
    illegitimate_question_found: [illegitimateFinding("ISSUE-1", "research")]
  });
  const result = validateCriticOutput(output);
  assert.ok(!("question_review_targets" in result), "question_review_targets n'est jamais un champ de la sortie validée.");
});
