import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  SUBSTITUTION_CANDIDATE_FIELDS, evaluateSubstitutionCandidateGate, materializeSubstitutionReviewFromCandidates,
  buildSubstitutionBatchSchema, buildQuestionReviewTargets, runCriticBatchedPipeline, TREATMENT_VALUES
} from "../workers/shared/operational-request-core.js";
import { TRANSPORT_LIMITS } from "../workers/shared/decision-core.js";
import { runCriticWithGroq } from "../workers/groq/src/index.js";

// LOT X2-C.4 — EXHAUSTIVE ALTERNATIVE MATERIALIZATION. Cause précise identifiée par X2-C.3 (Cas A
// réel : les six alternatives_reviewed valaient déjà reasonably_available=false, sans qu'aucun champ
// du contrat n'oblige le provider à s'engager sur CHACUNE des cinq dimensions séparément -- un rejet
// global, non structuré, était indiscernable d'un rejet réellement motivé). Ce lot remplace, dans le
// SEUL batch de Substitution Review (buildSubstitutionBatchSchema), le couple {reasonably_available,
// reason} par une candidate à sept clés fixes par famille, forçant un jugement engagé et indépendant
// par dimension. Le Substitution Gate candidate-level (evaluateSubstitutionCandidateGate) traduit
// ensuite ce jugement, de façon PURE et déterministe, vers la forme historique
// {alternatives_reviewed, available_alternative} que assembleSubstitutionReviews, deriveCriticConsequences,
// validateCriticOutput et applySubstitutionGate (X2-C.3) consomment déjà, tous INCHANGÉS.
// buildAlternativesReviewedJsonSchema, buildQuestionSubstitutionReviewSchema, buildCriticJsonSchema,
// CRITIC_SYSTEM_PROMPT (mécanisme monolithique X2-A/X2-B) restent, eux, strictement byte-identiques.

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
const LADDER = TREATMENT_VALUES.filter((v) => v !== "question");

// Comme la variante x2batch, avec une borne supplémentaire : un commentaire de section top-level
// (`\n// `, jamais indenté) arrête aussi l'extraction -- nécessaire ici car un bloc de section (X2-C.3)
// suit immédiatement materializeSubstitutionReviewFromCandidates avant la prochaine déclaration.
function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(startMatch, `fonction ${name} introuvable.`);
  const start = startMatch.index;
  const rest = source.slice(start + 1);
  const boundary = rest.search(/\n(?:\/\*\*|export |function |\/\/ )/);
  const end = boundary === -1 ? source.length : start + 1 + boundary;
  return source.slice(start, end);
}

function candidate(overrides = {}) {
  return {
    candidate_action: "Action concrète proposée.",
    applicable: true,
    preserves_objective: true,
    requires_user_reserved_choice: false,
    contradicts_known_facts: false,
    produces_complete_deliverable: true,
    justification: "Cette famille permet réellement de continuer utilement le travail.",
    ...overrides
  };
}

function rejectedCandidate(overrides = {}) {
  return candidate({
    applicable: false, preserves_objective: false, produces_complete_deliverable: false,
    candidate_action: null, justification: "Cette famille ne permet aucune progression utile.",
    ...overrides
  });
}

function allCandidates(overridesByTreatment = {}) {
  return Object.fromEntries(LADDER.map((t) => [t, overridesByTreatment[t] ? overridesByTreatment[t] : rejectedCandidate()]));
}

// --- X2C4-1/2 : exactement 6 candidates requises, aucune manquante (garantie SCHÉMA) ----------------

test("X2C4-1 : buildSubstitutionBatchSchema exige EXACTEMENT 6 candidates par issue, additionalProperties=false, required===properties", () => {
  const schema = buildSubstitutionBatchSchema(["issue1"]);
  const candidates = schema.properties.issue1.properties.candidates;
  assert.equal(candidates.additionalProperties, false);
  assert.deepEqual(Object.keys(candidates.properties).sort(), [...LADDER].sort());
  assert.deepEqual(candidates.required.sort(), [...LADDER].sort());
  assert.equal(candidates.required.length, 6);
});

test("X2C4-2 : chaque candidate individuelle exige EXACTEMENT les 7 champs du contrat, aucun manquant, aucun surnuméraire", () => {
  const schema = buildSubstitutionBatchSchema(["issue1"]);
  const candidates = schema.properties.issue1.properties.candidates;
  for (const treatment of LADDER) {
    const candidateSchema = candidates.properties[treatment];
    assert.equal(candidateSchema.additionalProperties, false);
    assert.deepEqual(candidateSchema.required.sort(), [...SUBSTITUTION_CANDIDATE_FIELDS].sort());
    assert.deepEqual(Object.keys(candidateSchema.properties).sort(), [...SUBSTITUTION_CANDIDATE_FIELDS].sort());
  }
});

// --- X2C4-3 : treatment unique (les 6 clés sont distinctes, jamais dupliquées) -----------------------

test("X2C4-3 : les six familles (treatment) sont des clés distinctes, jamais dupliquées", () => {
  assert.equal(new Set(LADDER).size, 6);
  const materialized = materializeSubstitutionReviewFromCandidates(allCandidates());
  assert.deepEqual(Object.keys(materialized.alternatives_reviewed).sort(), [...LADDER].sort());
});

// --- X2C4-4 : ordre stable (canonique, LADDER_ALTERNATIVE_VALUES) ------------------------------------

test("X2C4-4 : l'ordre canonique (research, decide, estimate, scenario, condition, leave_unknown) est stable, indépendant de l'ordre des clés d'entrée", () => {
  const candidatesByTreatment = allCandidates({ scenario: candidate() });
  // Reconstruire l'objet avec un ordre de clés différent (JS préserve l'ordre d'insertion) : le
  // résultat matérialisé doit rester identique, l'ordre canonique n'est jamais celui de l'entrée.
  const reordered = {};
  for (const t of [...LADDER].reverse()) reordered[t] = candidatesByTreatment[t];
  const a = materializeSubstitutionReviewFromCandidates(candidatesByTreatment);
  const b = materializeSubstitutionReviewFromCandidates(reordered);
  assert.deepEqual(a, b);
  assert.equal(a.available_alternative, "scenario");
});

// --- X2C4-5..9 : les 5 conditions du Gate candidate-level, une par une ------------------------------

test("X2C4-5 : candidate applicable et contract-preserving (les 5 conditions réunies) -> ACCEPTED_CONTRACT_PRESERVING", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate());
  assert.equal(gate.accepted, true);
  assert.equal(gate.reason_code, "ACCEPTED_CONTRACT_PRESERVING");
});

test("X2C4-6 : requires_user_reserved_choice=true -> REJECTED_USER_RESERVED_CHOICE", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate({ requires_user_reserved_choice: true }));
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_USER_RESERVED_CHOICE");
});

test("X2C4-7 : preserves_objective=false -> REJECTED_OBJECTIVE_CHANGED", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate({ preserves_objective: false }));
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_OBJECTIVE_CHANGED");
});

test("X2C4-8 : contradicts_known_facts=true -> REJECTED_CONTRADICTS_FACTS", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate({ contradicts_known_facts: true }));
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_CONTRADICTS_FACTS");
});

test("X2C4-9 : produces_complete_deliverable=false -> REJECTED_INSUFFICIENT_JUSTIFICATION (livrable incomplet)", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate({ produces_complete_deliverable: false }));
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_INSUFFICIENT_JUSTIFICATION");
});

test("X2C4-9b : applicable=false -> REJECTED_NO_ALTERNATIVE (rien à valider pour cette famille)", () => {
  const gate = evaluateSubstitutionCandidateGate(rejectedCandidate());
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_NO_ALTERNATIVE");
});

test("X2C4-9c : justification vide -> REJECTED_INSUFFICIENT_JUSTIFICATION, même si applicable=true", () => {
  const gate = evaluateSubstitutionCandidateGate(candidate({ justification: "" }));
  assert.equal(gate.accepted, false);
  assert.equal(gate.reason_code, "REJECTED_INSUFFICIENT_JUSTIFICATION");
});

// --- X2C4-10/11/12 : dérivation question_is_last_resort à partir des candidates matérialisées -------

test("X2C4-10 : les six candidates sont présentes et toutes rejetées par le Gate -> question_is_last_resort=true (via deriveCriticConsequences, INCHANGÉ)", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    { executeGlobal: async () => globalOutputFixture(), executeBatch: async () => ({ issue1: { candidates: allCandidates() } }) }
  );
  assert.equal(output.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(output.question_substitution_review[0].available_alternative, null);
});

test("X2C4-11 : une seule candidate acceptée par le Gate -> question_is_last_resort=false", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    { executeGlobal: async () => globalOutputFixture(), executeBatch: async () => ({ issue1: { candidates: allCandidates({ estimate: candidate() }) } }) }
  );
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(output.question_substitution_review[0].available_alternative, "estimate");
});

test("X2C4-12 : plusieurs candidates acceptées par le Gate -> comportement déterministe (la première dans l'ordre canonique l'emporte, jamais un score, jamais un choix arbitraire)", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    { executeGlobal: async () => globalOutputFixture(), executeBatch: async () => ({ issue1: { candidates: allCandidates({ scenario: candidate(), decide: candidate() }) } }) }
  );
  // decide précède scenario dans LADDER_ALTERNATIVE_VALUES -> decide l'emporte.
  assert.equal(output.question_substitution_review[0].available_alternative, "decide");
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
});

// --- X2C4-13..17 : interdictions structurelles du mandat --------------------------------------------

test("X2C4-13 : evaluateSubstitutionCandidateGate/materializeSubstitutionReviewFromCandidates ne codent aucune spécificité de domaine (mot métier, date, budget, voyage)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionCandidateGate", "materializeSubstitutionReviewFromCandidates"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /voyage|budget|italie|tourisme|hébergement|destinataire/i, `${name} ne doit référencer aucun mot métier de production.`);
  }
});

test("X2C4-14 : aucun mécanisme de fuzzy matching / distance d'édition n'est introduit par ce lot", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const pattern of [/levenshtein/i, /edit.distance/i, /\bfuzzy/i, /similarity[\s_-]?score/i]) {
    assert.doesNotMatch(source, pattern, `operational-request-core.js ne doit jamais contenir ${pattern} (mandat X2-C.4).`);
  }
});

test("X2C4-15 : aucun embedding ni représentation vectorielle n'est introduit par ce lot", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const pattern of [/\bembedding/i, /vector[\s_-]?representation/i, /cosine.similarity/i]) {
    assert.doesNotMatch(source, pattern, `operational-request-core.js ne doit jamais contenir ${pattern} (mandat X2-C.4).`);
  }
});

test("X2C4-16 : aucun score, seuil ou pondération arbitraire dans le Gate candidate-level (5 conditions booléennes strictes, jamais un cumul numérique)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  const body = extractFunctionSource(source, "evaluateSubstitutionCandidateGate");
  assert.doesNotMatch(body, /\bscore\b/i);
  assert.doesNotMatch(body, /weight|pond[ée]r/i);
  assert.doesNotMatch(body, /\b\d{2,}\b/, "aucun seuil numérique arbitraire à 2+ chiffres.");
});

test("X2C4-17 : le verdict du Gate candidate-level ne dépend jamais du nombre total d'issues ni de sa position dans le lot", async () => {
  const alone = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    { executeGlobal: async () => globalOutputFixture(), executeBatch: async (input) => Object.fromEntries(input.issueIds.map((id) => [id, { candidates: allCandidates({ estimate: candidate() }) }])) }
  );
  const inBatchOf3 = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["a", "issue1", "b"]), capability: TIGHT_CAPABILITY },
    { executeGlobal: async () => globalOutputFixture(), executeBatch: async (input) => Object.fromEntries(input.issueIds.map((id) => [id, { candidates: allCandidates(id === "issue1" ? { estimate: candidate() } : {}) }])) }
  );
  assert.equal(alone.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(inBatchOf3.question_substitution_review.find((r) => r.issue_id === "issue1").available_alternative, "estimate");
});

// --- X2C4-18/19 : OPRIE et provider/HTTP inchangés ---------------------------------------------------

test("X2C4-18 : evaluateSubstitutionCandidateGate/materializeSubstitutionReviewFromCandidates ne mentionnent jamais degraded_state, agreement, clarification_required ni operational_request_ready -- OPRIE reste seule autorité de readiness", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionCandidateGate", "materializeSubstitutionReviewFromCandidates"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /degraded_state|clarification_required|confirmation_required|operational_request_ready/);
    assert.doesNotMatch(body, /\bagreement\b/);
  }
});

test("X2C4-19 : TRANSPORT_LIMITS (HTTP-8192a, gelé) reste strictement inchangé -- aucun provider nommé dans le Gate candidate-level", () => {
  assert.deepEqual(TRANSPORT_LIMITS, { decision: 16384, analyst: 16384, critic: 65536, arbiter: 196608, absolute: 262144 });
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["evaluateSubstitutionCandidateGate", "materializeSubstitutionReviewFromCandidates"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /groq|anthropic|openai/i, `${name} ne doit jamais nommer un provider.`);
  }
});

// --- Fixtures partagées pour les tests d'intégration runCriticBatchedPipeline -----------------------

const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };

function analystOutputFixture(issueIds) {
  return {
    operational_request_candidate: { objective: "x", expected_deliverable: "", secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
    provenance_records: [{ field: "objective", value: "x", provenance: "explicit_user_statement" }],
    issues: issueIds.map((id) => ({ id, type: "missing_information", description: `Description de ${id}.`, impact: "material", substitutable: false, recommended_treatment: "question", kind: null })),
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

function globalOutputFixture(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    ...overrides
  };
}

// --- X2C4-SENTINEL-A/B : rejeu déterministe des deux sentinelles X2-C.2, chemin RÉEL HTTP mocké ------
// Section 8 du mandat. Chemin exercé : runCriticWithGroq (workers/groq/src/index.js, INCHANGÉ) ->
// requête HTTP réelle -> réponse HTTP mockée SEULEMENT au niveau du corps (jamais une structure
// interne du pipeline injectée) -> materializeSubstitutionReviewFromCandidates -> assembleSubstitutionReviews
// -> applySubstitutionGate (X2-C.3) -> deriveCriticConsequences -> validateCriticOutput. Les deux
// descriptions ("type de voyage" / "destinataire du document") sont des FIXTURES DE PREUVE génériques
// réutilisées telles quelles depuis X2-C.1/X2-C.2, jamais des règles de production.

function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}
function groqResponse(contentObj, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status });
}
function schemaNameOf(options) { return JSON.parse(options.body).response_format.json_schema.name; }
function issueIdsOf(options) { return Object.keys(JSON.parse(options.body).response_format.json_schema.schema.properties); }

function singleIssueAnalystOutput(description) {
  return {
    operational_request_candidate: { ...createEmptyCandidate(), objective: "Produire le livrable demandé." },
    provenance_records: [{ field: "objective", value: "Produire le livrable demandé.", provenance: "explicit_user_statement" }],
    issues: [{ id: "issue-1", type: "missing_information", description, impact: "material", substitutable: false, recommended_treatment: "question", kind: null }],
    question_candidates: [],
    confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
  };
}

test("X2C4-SENTINEL-A : Cas A (\"type de voyage\", substituable) rejoué via runCriticWithGroq réel -- une candidate matérialisée applicable et acceptée par le Gate -> question_is_last_resort=false, illegitimate_question_found=true", async (t) => {
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = issueIdsOf(options);
    const body = { [issueIds[0]]: { candidates: allCandidates({ scenario: candidate() }) } };
    return groqResponse(body);
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: singleIssueAnalystOutput("Le type de voyage (tourisme, affaires, famille, etc.) n'est pas spécifié."), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.equal(output.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(output.question_substitution_review[0].available_alternative, "scenario");
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.illegitimate_question_found[0].issue_id, "issue-1");
});

test("X2C4-SENTINEL-B : Cas B (\"destinataire du document\", non substituable) rejoué via runCriticWithGroq réel -- les 6 candidates matérialisées et rejetées par le Gate -> question_is_last_resort=true, illegitimate_question_found=false", async (t) => {
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = issueIdsOf(options);
    const body = { [issueIds[0]]: { candidates: allCandidates() } };
    return groqResponse(body);
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: singleIssueAnalystOutput("Le destinataire du document n'est pas défini, et les destinataires possibles exigent des contenus incompatibles."), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: async () => {} } }
  );
  assert.equal(output.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(output.question_substitution_review[0].available_alternative, null);
  assert.equal(output.illegitimate_question_found.length, 0);
  assert.equal(output.agreement, "agree");
});

// --- X2C4-verif : frozen guard -----------------------------------------------------------------

test("X2C4-verif : le frozen guard confirme qu'aucun moteur gelé n'a été modifié par X2-C.4", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK");
});
