import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyCandidate } from "../core/adn/index.js";
import {
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT, buildQuestionReviewTargets, projectSubstitutionReviewTarget,
  makeSubstitutionReviewBatchUserMessage
} from "../workers/shared/operational-request-core.js";
import { runCriticWithGroq } from "../workers/groq/src/index.js";

// 3F.3.3-X2-BATCH-R3B : OPTIMISATION TRANSPORT (déduplication targets.description + compaction du
// system prompt Substitution Review). Aucun changement d'architecture batch, de pacing, d'OPRIE, de
// deriveCriticConsequences, de validateCriticOutput ni de available_alternative — seule la manière
// dont question_review_targets est SÉRIALISÉ sur le fil change (projection déterministe, pure,
// n'affectant ni issue_id ni l'ordre), et le texte du system prompt (deux mentions ajoutées pour
// documenter explicitement la résolution issue_id -> analyst_output.issues[].description, et quatre
// endroits compactés où une règle était strictement dupliquée ailleurs dans le même prompt).
//
// Ce fichier ne mocke JAMAIS un vrai délai (sleepFn toujours injecté) : aucun test n'attend
// réellement. GROQ_CRITIC_CAPABILITY (workers/groq/src/index.js) reste inchangée par ce lot — le
// plan de batch (nombre/tailles) doit donc rester STRICTEMENT identique à R2.1.

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
function groqResponse(contentObj, status = 200) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(contentObj) } }] }, { status });
}
function withGroqFetch(t, mockFetch) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = mockFetch;
}
function recordingSleep(log) {
  return async (ms) => { log.push(ms); };
}
function schemaNameOf(options) { return JSON.parse(options.body).response_format.json_schema.name; }
function issueIdsOf(options) { return Object.keys(JSON.parse(options.body).response_format.json_schema.schema.properties); }
function parsedUserMessage(options) { return JSON.parse(JSON.parse(options.body).messages[1].content); }

const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
const workersAiSrcPath = fileURLToPath(new URL("../workers/workers-ai/src/index.js", import.meta.url));

// --- R3B-1 : issue_id permet toujours de résoudre la description exacte ---------------------------

test("R3B-1 : projectSubstitutionReviewTarget retire description, mais issue_id résout sans ambiguïté la même description via analyst_output.issues", () => {
  const analystOutput = analystOutputWithIssues(4);
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.equal(targets.length, 4);
  for (const target of targets) {
    const projected = projectSubstitutionReviewTarget(target);
    assert.equal(Object.prototype.hasOwnProperty.call(projected, "description"), false, "projectSubstitutionReviewTarget ne doit jamais porter description.");
    assert.deepEqual(Object.keys(projected).sort(), ["impact", "issue_id", "recommended_treatment", "type"]);
    const matching = analystOutput.issues.filter((issue) => issue.id === target.issue_id);
    assert.equal(matching.length, 1, `issue_id "${target.issue_id}" doit résoudre EXACTEMENT une issue dans analyst_output.issues.`);
    assert.equal(matching[0].description, target.description, "la description résolue via issue_id doit être byte-identique à celle du target d'origine.");
  }
});

test("R3B-1b : aucune target projetée ne peut pointer vers une issue inconnue (correspondance issue_id <-> analyst_output.issues[].id garantie pour tout N)", () => {
  const analystOutput = analystOutputWithIssues(7);
  const targets = buildQuestionReviewTargets(analystOutput);
  const knownIds = new Set(analystOutput.issues.map((i) => i.id));
  for (const target of targets) {
    assert.ok(knownIds.has(target.issue_id), `issue_id "${target.issue_id}" doit être une issue connue.`);
  }
});

// --- R3B-2 : aucune description n'est perdue sémantiquement du contexte global ---------------------

test("R3B-2 : le message utilisateur transmis conserve analyst_output.issues en entier (toutes les descriptions, y compris hors du batch courant)", () => {
  const analystOutput = analystOutputWithIssues(4);
  const allTargets = buildQuestionReviewTargets(analystOutput);
  const batchTargets = allTargets.slice(0, 2); // seulement 2 des 4 issues dans CE batch
  const userMessageStr = makeSubstitutionReviewBatchUserMessage({ original_request: "x", clarification_history: [], analyst_output: analystOutput, batchTargets });
  const parsed = JSON.parse(userMessageStr);
  assert.equal(parsed.analyst_output.issues.length, 4, "analyst_output.issues doit rester COMPLET (4 issues), jamais restreint au batch.");
  for (let i = 0; i < 4; i += 1) {
    assert.equal(parsed.analyst_output.issues[i].description, analystOutput.issues[i].description, `description de issue${i + 1} doit être intacte dans analyst_output, y compris pour une issue hors de ce batch.`);
  }
  assert.equal(parsed.question_review_targets.length, 2, "question_review_targets doit rester limité aux 2 targets de CE batch.");
  for (const target of parsed.question_review_targets) {
    assert.equal(Object.prototype.hasOwnProperty.call(target, "description"), false);
  }
});

// --- R3B-3 : ordre des targets inchangé -------------------------------------------------------------

test("R3B-3 : la projection préserve l'ordre exact des targets, jamais un tri ni un réordonnancement", () => {
  const analystOutput = analystOutputWithIssues(5);
  const targets = buildQuestionReviewTargets(analystOutput);
  const projected = targets.map(projectSubstitutionReviewTarget);
  assert.deepEqual(projected.map((t) => t.issue_id), targets.map((t) => t.issue_id));
  assert.deepEqual(projected.map((t) => t.issue_id), ["issue1", "issue2", "issue3", "issue4", "issue5"]);
});

// --- R3B-4 / R3B-5 : N=0 et N=1 inchangés -----------------------------------------------------------

test("R3B-4 : N=0 -> aucun target, aucun batch, un seul appel réseau (le Critic global), inchangé par R3B", async (t) => {
  let calls = 0;
  withGroqFetch(t, async () => { calls += 1; return groqResponse(globalOutputFixture()); });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutputWithIssues(0), previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  assert.equal(calls, 1);
  assert.deepEqual(output.question_substitution_review, []);
});

test("R3B-5 : N=1 -> un seul batch d'une issue, description résolue via analyst_output, review correcte", async (t) => {
  const analystOutput = analystOutputWithIssues(1);
  let sawTargetWithoutDescription = false;
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const parsed = parsedUserMessage(options);
    sawTargetWithoutDescription = parsed.question_review_targets.every((t) => !("description" in t));
    return groqResponse(batchEntryFor(issueIdsOf(options), null));
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  assert.ok(sawTargetWithoutDescription);
  assert.equal(output.question_substitution_review.length, 1);
  assert.equal(output.question_substitution_review[0].issue_id, "issue1");
});

// --- R3B-6 : N=4 plan production cohérent -------------------------------------------------------------
// NOTE X2-C.4 : GROQ_CRITIC_CAPABILITY.fixedOverheadUnits (workers/groq/src/index.js, INCHANGÉ) mesure
// la taille RÉELLE de SUBSTITUTION_REVIEW_SYSTEM_PROMPT au moment de l'appel — jamais une constante
// recopiée. X2-C.4 a agrandi ce prompt (matérialisation exhaustive des 6 candidates, 7 champs chacune,
// au lieu de 2) : computeBatchPlan (INCHANGÉ) réagit donc mécaniquement en réduisant la taille de
// batch réelle pour N=4 — un effet de bord authentique et attendu d'un contrat de sortie plus riche,
// jamais une régression du calcul lui-même. Cette valeur, autrefois [2,2] (R2.1/R3B), est donc
// RE-MESURÉE et reverrouillée ici plutôt que silencieusement laissée obsolète.

test("R3B-6 : N=4 sur le plan réel de production — le plan reflète fidèlement la taille RÉELLE du prompt X2-C.4 (candidates), plus de batches, plus petits, qu'avant X2-C.4", async (t) => {
  const bigDescription = "x".repeat(2000); // même fixture-technique que R1/R2/R2.1 pour forcer >=2 batches réels
  const analystOutput = analystOutputWithIssues(4, { descLen: 2000 });
  const batchSizes = [];
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    const issueIds = issueIdsOf(options);
    batchSizes.push(issueIds.length);
    return groqResponse(batchEntryFor(issueIds, null));
  });
  await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  assert.equal(batchSizes.reduce((a, b) => a + b, 0), 4, "les 4 issues doivent toutes être couvertes, quel que soit le découpage réel.");
  assert.deepEqual(batchSizes, [1, 1, 1, 1], `plan réel re-mesuré après X2-C.4 (prompt agrandi), obtenu ${JSON.stringify(batchSizes)}. void bigDescription=${bigDescription.length}`);
});

// --- R3B-7 : assemblage 4/4 inchangé ------------------------------------------------------------------

test("R3B-7 : N=4 -> assemblage 4/4, ordre et issue_ids corrects, avec la projection transport active", async (t) => {
  const analystOutput = analystOutputWithIssues(4, { descLen: 2000 });
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    return groqResponse(batchEntryFor(issueIdsOf(options), null));
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- R3B-8 / R3B-9 : deriveCriticConsequences / validateCriticOutput inchangés (exercés, pas modifiés) --

test("R3B-8/R3B-9 : le pipeline complet (derive + validate, tous deux inchangés par ce lot) produit une sortie CriticOutput valide avec la projection transport active", async (t) => {
  const analystOutput = analystOutputWithIssues(2);
  withGroqFetch(t, async (url, options) => {
    if (schemaNameOf(options) === "critic_global") return groqResponse(globalOutputFixture());
    return groqResponse(batchEntryFor(issueIdsOf(options), "estimate"));
  });
  const output = await runCriticWithGroq(
    { original_request: "x", clarification_history: [], analyst_output: analystOutput, previous_vetoes: [] },
    { GROQ_API_KEY: "server-only" },
    { retryOverrides: { sleepFn: recordingSleep([]) } }
  );
  // validateCriticOutput (inchangé) exige exactement ces clés de premier niveau -- leur présence
  // prouve que derive+validate ont bien tourné, jamais court-circuités par la projection transport.
  for (const key of ["agreement", "operational_request_candidate_review", "vetoes", "semantic_drift_detected", "significant_stakes", "question_substitution_review", "illegitimate_question_found"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(output, key), `CriticOutput.${key} doit être présent (derive+validate inchangés).`);
  }
  assert.equal(output.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(output.illegitimate_question_found[0].why_available, "ok");
});

// --- R3B-10 : le prompt compacté conserve tous les invariants explicitement audités ------------------

test("R3B-10 : SUBSTITUTION_REVIEW_SYSTEM_PROMPT (compacté, structure de sortie revue par X2-C.4) conserve tous les invariants sémantiques audités par ce lot", () => {
  const prompt = SUBSTITUTION_REVIEW_SYSTEM_PROMPT;
  // Définition du rôle / autorité du Substitution Review / anti-glissement.
  assert.match(prompt, /revue de substitution ciblée/);
  assert.match(prompt, /Vous ne rédigez jamais le livrable/);
  // Ladder complète des six familles, nommées et définies individuellement.
  for (const alt of LADDER) assert.match(prompt, new RegExp(alt));
  assert.match(prompt, /DÉFINITION DES SIX FAMILLES \(jugement issue par issue, jamais par défaut/);
  // Structure candidates (X2-C.4) et interdiction de calculer soi-même available_alternative.
  assert.match(prompt, /MATÉRIALISATION OBLIGATOIRE/);
  assert.match(prompt, /N'ajoutez JAMAIS available_alternative ni why_available/);
  // Interdiction d'inventer.
  assert.match(prompt, /N'inventez jamais une action théorique/);
  // Relation avec analyst_output (Optimisation 1) et avec original_request.
  assert.match(prompt, /analyst_output\.issues\[\]\.description/);
  assert.match(prompt, /issue_id ↔ id/);
  assert.match(prompt, /original_request/);
  // Identité des issue_ids / obligation d'évaluer uniquement le subset de ce lot.
  assert.match(prompt, /la clé est l'issue_id lui-même, tel quel, jamais reformulé/);
  assert.match(prompt, /vous n'examinez que les issues qui vous sont assignées dans ce lot/);
  // CLÉS EXACTES toujours présent (structure de sortie).
  assert.match(prompt, /CLÉS EXACTES, RIEN D'AUTRE/);
  // Règles de sortie / anti-glissement (clôture JSON strict).
  assert.match(prompt, /aucune phrase avant ou après l'objet/);
  // justification obligatoire même si inapplicable (règle X2-C.4, symétrique de l'ancienne reason).
  assert.match(prompt, /justification est obligatoire pour chacune, y compris quand applicable=false/);
});

test("R3B-10b : la description n'apparaît plus dans la FORME de question_review_targets documentée (cohérent avec la projection transport réelle)", () => {
  const formeSection = SUBSTITUTION_REVIEW_SYSTEM_PROMPT.split("FORME DE question_review_targets")[1].split("FORME DE LA REVUE ATTENDUE")[0];
  assert.doesNotMatch(formeSection, /"description":\s*"\.\.\."/, "la forme documentée ne doit plus annoncer un champ description qui n'est plus transmis.");
});

// --- R3B-11 : Workers AI non affecté par une hypothèse Groq -----------------------------------------

test("R3B-11 : workers/workers-ai/src/index.js reste dépourvu de toute logique Groq-spécifique (inchangé par R3B, qui ne touche que operational-request-core.js)", () => {
  const source = fs.readFileSync(workersAiSrcPath, "utf8");
  assert.doesNotMatch(source, /try again in/i);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|fetchGroqWithRetry/);
});

// --- R3B-12 : aucune logique de transport provider (pacing/429/retry) n'entre dans core.js -----------

test("R3B-12 : operational-request-core.js reste dépourvu de toute logique de pacing/retry/429 provider (la projection transport R3B est un projection de PAYLOAD, jamais une logique réseau)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(source, /\b429\b/);
  assert.doesNotMatch(source, /retry.after/i);
  assert.doesNotMatch(source, /rate.limit/i);
  assert.doesNotMatch(source, /pacer/i);
  assert.doesNotMatch(source, /createGroqRateLimitPacer|GROQ_PRODUCTION_RETRY_DEFAULTS|parseRetryAfterMs|parseRetryDelayFromBody/);
});

// --- Frontière HTTP 8192 / architecture batch : hors périmètre, non touchées ------------------------

// R3B-verif-1 (corrigé LOT HTTP-8192) : même correction que R2-verif/R2.1-verif -- le littéral
// "maxBytes = 8192" a été délibérément remplacé par TRANSPORT_LIMITS (politique route-specific).
// Intention d'origine préservée : ce plafond reste défini une seule fois, dans decision-core.js.
test("R3B-verif-1 (corrigé LOT HTTP-8192) : le plafond transport (TRANSPORT_LIMITS) reste défini une seule fois, dans decision-core.js", () => {
  const decisionCorePath = fileURLToPath(new URL("../workers/shared/decision-core.js", import.meta.url));
  const source = fs.readFileSync(decisionCorePath, "utf8");
  assert.match(source, /export const TRANSPORT_LIMITS/);
});

test("R3B-verif-2 : buildQuestionReviewTargets (chemin legacy makeCriticUserMessage) continue de porter description — seule la sérialisation Substitution Review batchée projette ce champ hors du transport", () => {
  const analystOutput = analystOutputWithIssues(2);
  const targets = buildQuestionReviewTargets(analystOutput);
  for (const target of targets) {
    assert.ok(Object.prototype.hasOwnProperty.call(target, "description"), "buildQuestionReviewTargets doit rester INCHANGÉE, description incluse, pour tout appelant autre que le batch Substitution Review.");
  }
});
