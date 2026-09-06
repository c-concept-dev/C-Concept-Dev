import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  LADDER_ALTERNATIVE_VALUES, SUBSTITUTION_CANDIDATE_FIELDS,
  buildSubstitutionBatchSchema, buildQuestionReviewTargets, computeBatchPlan,
  estimateSubstitutionBatchOutputUnits, assembleSubstitutionReviews,
  CRITIC_GLOBAL_SYSTEM_PROMPT, SUBSTITUTION_REVIEW_SYSTEM_PROMPT
} from "../workers/shared/operational-request-core.js";
import groqWorker, { runCriticWithGroq, runRoleWithHaChain } from "../workers/groq/src/index.js";
import { FAILURE_CLASSES, ProviderChainError, failureClassOf } from "../workers/shared/provider-ha.js";

// =================================================================================================
// CSR-01 — FIABILITÉ DE L'ÉTAPE SUBSTITUTION REVIEW BATCHÉE.
//
// CAUSE RACINE CORRIGÉE : per_target_output_units valait 260, coût calibré pour la forme d'entrée
// ANTÉRIEURE à X2-C.4 ({alternatives_reviewed, available_alternative} — deux champs). X2-C.4 l'a
// remplacée par SIX candidates de SEPT champs (42 champs par issue) sans recalibrer ce coût. Le
// plafond de sortie d'un batch d'une issue valait donc 350 jetons pour une réponse qui en exige plus
// de mille : Anthropic s'arrêtait à max_tokens et renvoyait {}, OpenAI s'arrêtait à length et
// renvoyait une chaîne tronquée, et assembleSubstitutionReviews constatait ensuite, à juste titre,
// que l'issue n'était pas couverte. Ni le modèle, ni le parseur, ni le contrat n'étaient en cause.
// =================================================================================================

const ENV = { ALLOWED_ORIGINS: "https://atelier.example.com", GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", "OPenAI-API": "o" };
const OUTPUT_UNITS_PER_FIELD_MEASURED = 30;
// Besoin de SORTIE réellement mesuré pour UNE issue lors des smokes CSR-01 contre les vrais
// fournisseurs : Anthropic 1247 jetons (pire cas), OpenAI 935. Sert de garde de non-régression.
const MEASURED_WORST_CASE_OUTPUT_UNITS_FOR_ONE_ISSUE = 1247;

function confirmationSignals() {
  return { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false };
}
function analystOutputWith(n) {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "O." },
    provenance_records: [{ field: "objective", value: "O.", provenance: "explicit_user_statement" }],
    issues: Array.from({ length: n }, (_, i) => ({ id: `issue${i + 1}`, type: "missing_information", description: `D${i + 1}.`, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [], confirmation_signals: confirmationSignals()
  };
}
const criticInput = (n) => ({ original_request: "O.", clarification_history: [], analyst_output: analystOutputWith(n), previous_vetoes: [] });
function globalFixture() {
  return { operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "" };
}
function candidateFor(accepted) {
  return accepted
    ? { candidate_action: "Action.", applicable: true, preserves_objective: true, requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: true, justification: "ok" }
    : { candidate_action: null, applicable: false, preserves_objective: false, requires_user_reserved_choice: false, contradicts_known_facts: false, produces_complete_deliverable: false, justification: "non" };
}
const batchEntry = (ids, available = "decide") => Object.fromEntries(ids.map((id) => [id, { candidates: Object.fromEntries(LADDER_ALTERNATIVE_VALUES.map((f) => [f, candidateFor(f === available)])) }]));

const chatOk = (p) => Response.json({ choices: [{ message: { content: JSON.stringify(p) } }] });
const toolOk = (p, name) => Response.json({ content: [{ type: "tool_use", name, input: p }] });
const providerOf = (u) => String(u).includes("groq") ? "groq" : String(u).includes("anthropic") ? "anthropic" : "openai";

/* DEEP-PROVIDER-ROUTING-FINAL-01 — CE FICHIER TESTE LA CLASSIFICATION D'ÉCHEC, PAS LE ROUTAGE.
   Ce qui l'intéresse, c'est qu'un rejet structurel non marqué NE bascule PAS (CSR01-8) et qu'une
   panne technique rejoue le pipeline ENTIER chez le fournisseur suivant (CSR01-10). Ces deux
   invariants appartiennent à runProviderChain, qui reste actif — /decision s'en sert toujours. Le
   plan profond, lui, n'a plus qu'Anthropic ; les tests qui ont besoin de plusieurs fournisseurs
   passent donc l'ordre explicitement, au lieu de dépendre d'un ordre de production qui a changé. */
const CHAINE_HA_MECANIQUE = Object.freeze(["groq", "anthropic", "openai"]);
const ORDRE = { order: CHAINE_HA_MECANIQUE };

function withCapturedConsole(t) {
  const l = console.log, e = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = l; console.error = e; });
}
/** Mock complet et VALIDE d'un provider pour tout le pipeline Critic. */
function criticProvider(provider, { batchBehaviour = "ok" } = {}) {
  return ({ body, schemaName }) => {
    if (schemaName === "critic_global") return provider === "anthropic" ? toolOk(globalFixture(), schemaName) : chatOk(globalFixture());
    const ids = Object.keys(body.response_format?.json_schema?.schema?.properties ?? body.tools?.[0]?.input_schema?.properties ?? {});
    const payload = batchBehaviour === "ok" ? batchEntry(ids)
      : batchBehaviour === "empty" ? {}
      : batchEntry(ids.slice(0, Math.max(0, ids.length - 1)));
    return provider === "anthropic" ? toolOk(payload, schemaName) : chatOk(payload);
  };
}
function withProviders(t, handlers) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    const body = JSON.parse(options.body);
    const schemaName = body.response_format?.json_schema?.name ?? body.tools?.[0]?.name ?? null;
    calls.push({ provider, schemaName, issueIds: Object.keys(body.response_format?.json_schema?.schema?.properties ?? body.tools?.[0]?.input_schema?.properties ?? {}) });
    const h = handlers[provider];
    assert.ok(h, `appel inattendu vers "${provider}"`);
    return h({ body, schemaName });
  };
  return calls;
}
const PRODUCTION_OUTPUT_CAPABILITY = {
  perIssueOutputUnits: LADDER_ALTERNATIVE_VALUES.length * SUBSTITUTION_CANDIDATE_FIELDS.length * OUTPUT_UNITS_PER_FIELD_MEASURED,
  fixedOutputOverheadUnits: 20, safetyMarginRatio: 0.25, minOutputUnits: 256, maxOutputUnits: 2048
};

// --- CAUSE RACINE : garde de non-régression -------------------------------------------------------

test("CSR01-ROOT : le plafond de sortie d'un batch d'UNE issue couvre le besoin RÉELLEMENT MESURÉ (1247 jetons), là où l'ancien modèle n'en accordait que 350", () => {
  const estimated = estimateSubstitutionBatchOutputUnits(1, PRODUCTION_OUTPUT_CAPABILITY);
  assert.ok(estimated >= MEASURED_WORST_CASE_OUTPUT_UNITS_FOR_ONE_ISSUE,
    `le plafond estimé (${estimated}) doit couvrir le pire cas mesuré (${MEASURED_WORST_CASE_OUTPUT_UNITS_FOR_ONE_ISSUE}).`);
  const legacyCapability = { ...PRODUCTION_OUTPUT_CAPABILITY, perIssueOutputUnits: 260 };
  assert.ok(estimateSubstitutionBatchOutputUnits(1, legacyCapability) < MEASURED_WORST_CASE_OUTPUT_UNITS_FOR_ONE_ISSUE,
    "l'ancien modèle de coût doit rester démontrablement insuffisant : c'est la cause racine.");
});

test("CSR01-ROOT-b : le coût de sortie par issue est DÉRIVÉ de la structure du contrat, jamais un nombre posé", () => {
  assert.equal(PRODUCTION_OUTPUT_CAPABILITY.perIssueOutputUnits,
    LADDER_ALTERNATIVE_VALUES.length * SUBSTITUTION_CANDIDATE_FIELDS.length * OUTPUT_UNITS_PER_FIELD_MEASURED);
  assert.equal(LADDER_ALTERNATIVE_VALUES.length, 6);
  assert.equal(SUBSTITUTION_CANDIDATE_FIELDS.length, 7);
});

test("CSR01-ROOT-c : un batch n'est jamais planifié au-delà de ce qu'un modèle peut RÉPONDRE", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(6));
  const maxAnswerable = Math.max(1, Math.floor((PRODUCTION_OUTPUT_CAPABILITY.maxOutputUnits / 1.25 - 20) / PRODUCTION_OUTPUT_CAPABILITY.perIssueOutputUnits));
  const plan = computeBatchPlan(targets, { fixedOverheadUnits: 100, perTargetUnits: 10, maxUnitsPerBatch: 100000, maxTargetsPerBatch: maxAnswerable });
  for (const batch of plan) {
    assert.ok(batch.length <= maxAnswerable);
    assert.ok(estimateSubstitutionBatchOutputUnits(batch.length, PRODUCTION_OUTPUT_CAPABILITY) >= MEASURED_WORST_CASE_OUTPUT_UNITS_FOR_ONE_ISSUE * batch.length * 0.99,
      "chaque batch planifié doit rester répondable dans son propre plafond de sortie.");
  }
  assert.equal(plan.flat().length, 6, "aucune issue perdue par le plafonnement.");
});

test("CSR01-ROOT-d : maxTargetsPerBatch OMIS laisse computeBatchPlan strictement inchangé", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(5));
  const base = { fixedOverheadUnits: 100, perTargetUnits: 10, maxUnitsPerBatch: 100000 };
  assert.deepEqual(computeBatchPlan(targets, base), [targets], "sans plafond, tous les targets tiennent dans un seul batch, comme avant CSR-01.");
  assert.throws(() => computeBatchPlan(targets, { ...base, maxTargetsPerBatch: 0 }), /maxTargetsPerBatch invalide/);
  assert.throws(() => computeBatchPlan(targets, { ...base, maxTargetsPerBatch: 1.5 }), /maxTargetsPerBatch invalide/);
});

// --- CSR01-1 / 2 / 3 : pipeline complet ------------------------------------------------------------

test("CSR01-1 : UNE issue -> pipeline Critic complet PASS (global + batch + assemblage + validation)", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: criticProvider("groq") });
  const output = await runCriticWithGroq(criticInput(1), ENV, { retryOverrides: { sleepFn: async () => {} } });
  assert.equal(output.question_substitution_review.length, 1);
  assert.equal(output.question_substitution_review[0].issue_id, "issue1");
  assert.equal(Object.keys(output.question_substitution_review[0].alternatives_reviewed).length, 6);
});

test("CSR01-2 : plusieurs issues dans UN MÊME batch -> PASS (mécanisme de regroupement intact quand la capacité de sortie le permet)", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(3));
  const plan = computeBatchPlan(targets, { fixedOverheadUnits: 100, perTargetUnits: 10, maxUnitsPerBatch: 100000, maxTargetsPerBatch: 3 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].length, 3);
  const ids = plan[0].map((x) => x.issue_id);
  assert.deepEqual(assembleSubstitutionReviews(targets, [Object.fromEntries(ids.map((id) => [id, { alternatives_reviewed: {}, available_alternative: null }]))]).map((r) => r.issue_id), ids);
});

test("CSR01-3 : plusieurs batches -> PASS, toutes les issues couvertes, ordre préservé", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: criticProvider("groq") });
  const output = await runCriticWithGroq(criticInput(3), ENV, { retryOverrides: { sleepFn: async () => {} } });
  const batchCalls = calls.filter((c) => c.schemaName === "substitution_review_batch");
  assert.ok(batchCalls.length >= 2, `attendu au moins 2 batches réels, obtenu ${batchCalls.length}.`);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3"]);
});

// --- CSR01-4 / 5 / 6 : couverture exacte -----------------------------------------------------------

test("CSR01-4 : chaque issue demandée est couverte exactement une fois", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: criticProvider("groq") });
  await runCriticWithGroq(criticInput(4), ENV, { retryOverrides: { sleepFn: async () => {} } });
  const emitted = calls.filter((c) => c.schemaName === "substitution_review_batch").flatMap((c) => c.issueIds);
  assert.deepEqual([...emitted].sort(), ["issue1", "issue2", "issue3", "issue4"]);
  assert.equal(new Set(emitted).size, emitted.length, "aucune issue demandée deux fois.");
});

test("CSR01-5 : une issue INVENTÉE par le provider est rejetée, jamais absorbée", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(1));
  assert.throws(() => assembleSubstitutionReviews(targets, [{ issue1: { alternatives_reviewed: {}, available_alternative: null }, issueFantome: { alternatives_reviewed: {}, available_alternative: null } }]), /issue_id inconnu/);
});

test("CSR01-6 : une issue PERDUE est rejetée, jamais comblée par une review fabriquée", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(2));
  assert.throws(() => assembleSubstitutionReviews(targets, [{ issue1: { alternatives_reviewed: {}, available_alternative: null } }]), /issue\(s\) manquante\(s\)/);
});

// --- CSR01-7 / 8 : classification --------------------------------------------------------------------

test("CSR01-7 : un batch incomplet du PROVIDER est un STRUCTURED_OUTPUT_INVALID -> failover autorisé", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: criticProvider("groq", { batchBehaviour: "empty" }), anthropic: criticProvider("anthropic") });
  const output = await runRoleWithHaChain("critic", criticInput(1), ENV, ORDRE);
  assert.ok(calls.some((c) => c.provider === "anthropic"), "une violation du contrat de sortie par le modèle doit permettre de basculer.");
  assert.equal(output.question_substitution_review.length, 1);
});

test("CSR01-7b : le marqueur de violation est posé par l'assembleur lui-même, jamais déduit d'un message d'erreur", () => {
  const targets = buildQuestionReviewTargets(analystOutputWith(1));
  const error = (() => { try { assembleSubstitutionReviews(targets, [{}]); } catch (e) { return e; } })();
  assert.equal(error.output_contract_violation, true);
  assert.deepEqual(error.missing_issue_ids, ["issue1"]);
});

test("CSR01-8 : une erreur NON marquée reste PROGRAMMING_ERROR -> fail-closed, jamais un autre modèle pour masquer notre bug", async (t) => {
  withCapturedConsole(t);
  const bug = new TypeError("assembleur interne défaillant");
  assert.equal(failureClassOf(bug), FAILURE_CLASSES.PROGRAMMING_ERROR);
  assert.notEqual(bug.output_contract_violation, true);
  const calls = withProviders(t, {
    groq: ({ schemaName }) => schemaName === "critic_global" ? chatOk(globalFixture()) : chatOk({ issue1: { candidates: "structure invalide" } }),
    anthropic: criticProvider("anthropic")
  });
  await runRoleWithHaChain("critic", criticInput(1), ENV, ORDRE).catch(() => {});
  assert.ok(!calls.some((c) => c.provider === "anthropic"), "un rejet structurel non marqué ne doit jamais déclencher de bascule.");
});

// --- CSR01-9 / 10 / 11 : chaîne HA, pipeline homogène ------------------------------------------------

test("CSR01-9 : Groq en échec -> pipeline COMPLET rejoué chez Anthropic", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: () => Response.json({ error: {} }, { status: 503 }), anthropic: criticProvider("anthropic") });
  const output = await runRoleWithHaChain("critic", criticInput(2), ENV, ORDRE);
  assert.equal(output.question_substitution_review.length, 2);
  assert.ok(calls.filter((c) => c.provider === "anthropic" && c.schemaName === "critic_global").length === 1, "le provider suivant rejoue l'appel global, jamais seulement les batches.");
});

test("CSR01-10 : Groq et Anthropic en échec -> pipeline COMPLET chez OpenAI", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: {} }, { status: 503 }),
    anthropic: () => Response.json({ error: {} }, { status: 500 }),
    openai: criticProvider("openai")
  });
  const output = await runRoleWithHaChain("critic", criticInput(1), ENV, ORDRE);
  assert.equal(output.question_substitution_review.length, 1);
  assert.deepEqual([...new Set(calls.map((c) => c.provider))], ["groq", "anthropic", "openai"]);
});

test("CSR01-11 : un CriticOutput est TOUJOURS produit par un seul provider — jamais un global et des batches mélangés", async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: criticProvider("groq", { batchBehaviour: "empty" }), anthropic: criticProvider("anthropic") });
  await runRoleWithHaChain("critic", criticInput(2), ENV, ORDRE);
  const anthropicCalls = calls.filter((c) => c.provider === "anthropic");
  assert.equal(anthropicCalls.filter((c) => c.schemaName === "critic_global").length, 1);
  assert.ok(anthropicCalls.filter((c) => c.schemaName === "substitution_review_batch").length >= 1);
});

// --- CSR01-12 à 16 : invariants préservés ------------------------------------------------------------

test("CSR01-12 : exact-six — le schéma réellement émis exige les 6 familles pour chaque issue", async (t) => {
  withCapturedConsole(t);
  const schemas = [];
  withProviders(t, { groq: ({ body, schemaName }) => { if (schemaName === "substitution_review_batch") schemas.push(body.response_format.json_schema.schema); return criticProvider("groq")({ body, schemaName }); } });
  await runCriticWithGroq(criticInput(2), ENV, { retryOverrides: { sleepFn: async () => {} } });
  assert.ok(schemas.length >= 1);
  for (const schema of schemas) {
    for (const id of Object.keys(schema.properties)) {
      assert.deepEqual(Object.keys(schema.properties[id].properties.candidates.properties).sort(), [...LADDER_ALTERNATIVE_VALUES].sort());
      assert.deepEqual([...schema.properties[id].properties.candidates.required].sort(), [...LADDER_ALTERNATIVE_VALUES].sort());
    }
    assert.deepEqual(schema, buildSubstitutionBatchSchema(Object.keys(schema.properties)));
  }
});

test("CSR01-13 : partial_failure reste produit tel quel quand un batch échoue techniquement", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: ({ schemaName }) => schemaName === "critic_global" ? chatOk(globalFixture()) : Response.json({ error: {} }, { status: 500 }) });
  const error = await runCriticWithGroq(criticInput(1), ENV, { retryOverrides: { sleepFn: async () => {} } }).then(() => null, (e) => e);
  assert.equal(error.technical_state, "partial_failure");
  assert.ok(Array.isArray(error.batchFailures) && error.batchFailures.length >= 1);
  for (const forbidden of ["agreement", "degraded_state", "question_substitution_review"]) assert.ok(!Object.hasOwn(error, forbidden));
});

test("CSR01-14 : le fan-out candidate-group reste INACTIF", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../workers/groq/src/index.js", import.meta.url)), "utf8");
  const chain = source.slice(source.indexOf("const CRITIC_PIPELINES"), source.indexOf("function roleFromPathname"));
  assert.doesNotMatch(chain, /runCriticWithGroqFanOut/);
  assert.match(source, /export async function runCriticWithGroqFanOut/);
});

test("CSR01-15 : B01B — question_substitution_review alimente toujours illegitimate_question_found sans second jugement", async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: criticProvider("groq") });
  const output = await runCriticWithGroq(criticInput(1), ENV, { retryOverrides: { sleepFn: async () => {} } });
  assert.equal(output.question_substitution_review[0].available_alternative, "decide");
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.illegitimate_question_found[0].issue_id, "issue1");
  assert.equal(output.illegitimate_question_found[0].why_available, "ok", "why_available est dérivé mécaniquement de la candidate retenue, jamais redemandé au modèle.");
});

test("CSR01-16 : aucun hardcoding métier introduit par CSR-01", () => {
  for (const file of ["../workers/groq/src/index.js", "../workers/shared/operational-request-core.js"]) {
    const source = fs.readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /issue1/i, /\bItalie\b/i, /\bvoyage\b/i]) {
      assert.doesNotMatch(code, forbidden, `${file} ne doit contenir aucun marqueur métier (${forbidden}).`);
    }
  }
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /issue1|case_id|Italie/i);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /issue1|case_id|Italie/i);
});
