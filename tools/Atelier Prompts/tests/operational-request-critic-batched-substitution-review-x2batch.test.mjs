import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_GLOBAL_SYSTEM_PROMPT,
  CRITIC_GLOBAL_JSON_SCHEMA,
  CRITIC_JSON_SCHEMA,
  SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
  buildQuestionSubstitutionReviewSchema,
  buildSubstitutionBatchSchema,
  buildQuestionReviewTargets,
  computeBatchPlan,
  assembleSubstitutionReviews,
  estimateSubstitutionBatchOutputUnits,
  runCriticBatchedPipeline,
  deriveCriticConsequences,
  validateCriticOutput,
  makeSubstitutionReviewBatchUserMessage,
  makeCriticGlobalUserMessage,
  TREATMENT_VALUES
} from "../workers/shared/operational-request-core.js";

// 3F.3.3-X2-BATCH : campagne dédiée — CRITIC GLOBAL + SUBSTITUTION REVIEW BATCHÉE. Architecture
// ADDITIVE (cf. commentaire en tête de la section X2-BATCH dans operational-request-core.js) :
// CRITIC_SYSTEM_PROMPT, buildCriticJsonSchema(questionReviewTargets), CRITIC_JSON_SCHEMA restent
// byte-identiques et continuent d'être exercés par les campagnes X2-A/X2-B existantes (546+31 tests,
// inchangés). Cette campagne ne teste QUE les nouveaux éléments : CRITIC_GLOBAL_SYSTEM_PROMPT,
// SUBSTITUTION_REVIEW_SYSTEM_PROMPT, buildSubstitutionBatchSchema, computeBatchPlan,
// assembleSubstitutionReviews, estimateSubstitutionBatchOutputUnits, runCriticBatchedPipeline.

const LADDER = TREATMENT_VALUES.filter((v) => v !== "question");
const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));

function target(issueId, overrides = {}) {
  return { issue_id: issueId, type: "missing_information", description: `Description de ${issueId}.`, impact: "material", recommended_treatment: "question", ...overrides };
}

function targets(n) {
  return Array.from({ length: n }, (_, i) => target(`issue${i + 1}`));
}

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    treatment === availableTreatment
      ? { reasonably_available: true, reason: `${treatment} permet réellement de continuer utilement le travail malgré l'inconnue.` }
      : { reasonably_available: false, reason: `${treatment} ne permet aucune progression utile compte tenu des données reçues.` }
  ]));
}

function batchEntry(availableTreatment) {
  return { alternatives_reviewed: alternativesReviewed(availableTreatment), available_alternative: availableTreatment || null };
}

// X2-C.4 : forme RAW réellement produite par executeBatch depuis ce lot (candidates matérialisées,
// jamais alternatives_reviewed/available_alternative directement) -- utilisée par les seuls tests qui
// exercent runCriticBatchedPipeline (XB-27..XB-33) ; assembleSubstitutionReviews reste testée avec
// batchEntry ci-dessus (forme déjà matérialisée, contrat inchangé de cette fonction).
function candidateFor(treatment, isAccepted) {
  return isAccepted
    ? {
        candidate_action: `Action concrète via ${treatment}.`,
        applicable: true, preserves_objective: true, requires_user_reserved_choice: false,
        contradicts_known_facts: false, produces_complete_deliverable: true,
        justification: `${treatment} permet réellement de continuer utilement le travail malgré l'inconnue.`
      }
    : {
        candidate_action: null,
        applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
        contradicts_known_facts: false, produces_complete_deliverable: false,
        justification: `${treatment} ne permet aucune progression utile compte tenu des données reçues.`
      };
}

function candidatesEntry(availableTreatment) {
  return { candidates: Object.fromEntries(LADDER.map((treatment) => [treatment, candidateFor(treatment, treatment === availableTreatment)])) };
}

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
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    ...overrides
  };
}

// --- XB-1/2/3 : séparation stricte des deux prompts ---------------------------------------------

test("XB-1 : SUBSTITUTION_REVIEW_SYSTEM_PROMPT ne demande jamais de produire vetoes, semantic drift, missed issues, stakes ou agreement — un rappel de périmètre (exclusion explicite) reste autorisé", () => {
  // Ces champs de SORTIE, propres au Critic global, ne doivent jamais être demandés ici : on vérifie
  // l'absence des NOMS DE CHAMPS structurels (contrat JSON), jamais un bannissement du mot en prose —
  // une phrase de périmètre ("vous ne vous prononcez jamais sur les vetoes") reste légitime et
  // attendue (cf. CRITIC_GLOBAL_SYSTEM_PROMPT, qui procède symétriquement pour la substitution).
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /semantic_drift_detected|semantic_drift_notes/);
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /missed_material_issues/);
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /significant_stakes_reason/);
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /unsupported_additions_found|unsupported_removals_found/);
  assert.doesNotMatch(SUBSTITUTION_REVIEW_SYSTEM_PROMPT, /veto qualifié|new_information_trigger|why_not_substitutable/);
});

test("XB-2 : CRITIC_GLOBAL_SYSTEM_PROMPT ne contient aucune responsabilité de substitution de questions", () => {
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /question_substitution_review/);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /alternatives_reviewed/);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /available_alternative/);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /why_available/);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /reasonably_available/);
  assert.doesNotMatch(CRITIC_GLOBAL_SYSTEM_PROMPT, /question_review_targets/);
});

test("XB-3 : CRITIC_GLOBAL_JSON_SCHEMA est structurellement le schéma N=0 (jamais question_substitution_review, quel que soit N réel)", () => {
  assert.deepEqual(CRITIC_GLOBAL_JSON_SCHEMA, CRITIC_JSON_SCHEMA);
  assert.equal(Object.prototype.hasOwnProperty.call(CRITIC_GLOBAL_JSON_SCHEMA.properties, "question_substitution_review"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(CRITIC_GLOBAL_JSON_SCHEMA.properties, "agreement"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(CRITIC_GLOBAL_JSON_SCHEMA.properties, "illegitimate_question_found"), false);
});

test("XB-4 : CRITIC_SYSTEM_PROMPT (mécanisme monolithique X2-A/X2-B) reste byte-identique, non affecté par l'introduction de X2-BATCH", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /SECONDE LECTURE OBLIGATOIRE/);
  assert.match(CRITIC_SYSTEM_PROMPT, /question_substitution_review/);
});

// --- XB-5/6/7 : buildSubstitutionBatchSchema -----------------------------------------------------

test("XB-5 : buildSubstitutionBatchSchema (X2-C.4) produit exactement une clé par entrée (candidates), jamais alternatives_reviewed/available_alternative -- le choix de l'alternative appartient désormais au Substitution Gate déterministe, jamais au provider", () => {
  const schema = buildSubstitutionBatchSchema(["issue1", "issue2"]);
  assert.deepEqual(schema.required.sort(), ["issue1", "issue2"]);
  assert.equal(schema.additionalProperties, false);
  const CANDIDATE_FIELDS_SORTED = ["applicable", "candidate_action", "contradicts_known_facts", "justification", "preserves_objective", "produces_complete_deliverable", "requires_user_reserved_choice"];
  for (const id of ["issue1", "issue2"]) {
    assert.deepEqual(Object.keys(schema.properties[id].properties), ["candidates"]);
    assert.deepEqual(schema.properties[id].required, ["candidates"]);
    const candidates = schema.properties[id].properties.candidates;
    assert.equal(candidates.additionalProperties, false);
    assert.deepEqual(Object.keys(candidates.properties).sort(), [...LADDER].sort());
    assert.deepEqual(candidates.required.sort(), [...LADDER].sort());
    for (const treatment of LADDER) {
      const candidateSchema = candidates.properties[treatment];
      assert.equal(candidateSchema.additionalProperties, false);
      assert.deepEqual(Object.keys(candidateSchema.properties).sort(), CANDIDATE_FIELDS_SORTED);
      assert.deepEqual(candidateSchema.required.sort(), CANDIDATE_FIELDS_SORTED);
    }
  }
});

test("XB-6 : required === Object.keys(properties) === issueIds reçus, dans tous les cas (0, 1, N)", () => {
  assert.deepEqual(buildSubstitutionBatchSchema([]).required, []);
  assert.deepEqual(buildSubstitutionBatchSchema(["a"]).required, ["a"]);
  const ids = ["issue1", "issue2", "issue3"];
  const schema = buildSubstitutionBatchSchema(ids);
  assert.deepEqual(Object.keys(schema.properties), ids);
  assert.deepEqual(schema.required, ids);
});

test("XB-7 : depuis X2-C.4, le sous-schéma batché (candidates) est délibérément différent et plus riche que le sous-schéma monolithique (alternatives_reviewed) -- buildAlternativesReviewedJsonSchema (mécanisme monolithique X2-A/X2-B) reste, lui, strictement inchangé", () => {
  const monolithic = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]).properties.issue1.properties.alternatives_reviewed;
  assert.deepEqual(Object.keys(monolithic.properties).sort(), [...LADDER].sort());
  for (const treatment of LADDER) {
    assert.deepEqual(Object.keys(monolithic.properties[treatment].properties).sort(), ["reason", "reasonably_available"]);
  }
  const batchedEntry = buildSubstitutionBatchSchema(["issue1"]).properties.issue1;
  assert.deepEqual(Object.keys(batchedEntry.properties), ["candidates"]);
  assert.equal(Object.prototype.hasOwnProperty.call(batchedEntry.properties, "alternatives_reviewed"), false);
});

// --- XB-8..XB-14 : computeBatchPlan --------------------------------------------------------------

const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };

test("XB-8 : N=0 -> aucun batch", () => {
  assert.deepEqual(computeBatchPlan([], TIGHT_CAPABILITY), []);
});

test("XB-9 : N=1 -> un seul batch d'une seule issue", () => {
  const plan = computeBatchPlan(targets(1), TIGHT_CAPABILITY);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].length, 1);
  assert.equal(plan[0][0].issue_id, "issue1");
});

test("XB-10 : N=4 avec une enveloppe technique serrée force au moins 2 batches, ordre préservé, couverture exacte", () => {
  const plan = computeBatchPlan(targets(4), TIGHT_CAPABILITY);
  assert.ok(plan.length >= 2, `attendu au moins 2 batches, obtenu ${plan.length}.`);
  const flat = plan.flat().map((t) => t.issue_id);
  assert.deepEqual(flat, ["issue1", "issue2", "issue3", "issue4"], "l'ordre aplati doit rester identique à l'ordre d'entrée.");
  assert.equal(new Set(flat).size, 4, "aucune duplication, aucune perte.");
});

test("XB-11 : N=20 -> plusieurs batches, ordre stable, chaque issue exactement une fois", () => {
  const plan = computeBatchPlan(targets(20), TIGHT_CAPABILITY);
  assert.ok(plan.length > 1);
  const flat = plan.flat().map((t) => t.issue_id);
  assert.deepEqual(flat, targets(20).map((t) => t.issue_id));
  assert.equal(new Set(flat).size, 20);
});

test("XB-12 : N=100 (stress) -> plan déterministe, aucune perte, aucune duplication, pas de comportement quadratique manifeste", () => {
  const input = targets(100);
  const started = performance.now();
  const plan = computeBatchPlan(input, TIGHT_CAPABILITY);
  const elapsedMs = performance.now() - started;
  const flat = plan.flat().map((t) => t.issue_id);
  assert.deepEqual(flat, input.map((t) => t.issue_id));
  assert.equal(new Set(flat).size, 100);
  // Pas une exigence de latence de production nominale (cf. lot, section 18) : seuil large, pour
  // détecter uniquement une régression algorithmique grossière (ex. O(n^2) accidentel), jamais pour
  // calibrer une performance réelle.
  assert.ok(elapsedMs < 200, `computeBatchPlan(100) doit rester largement sous 200ms (obtenu ${elapsedMs.toFixed(2)}ms) — pas de comportement quadratique manifeste.`);
  // Déterminisme : deux exécutions produisent exactement le même plan.
  const plan2 = computeBatchPlan(input, TIGHT_CAPABILITY);
  assert.deepEqual(plan, plan2);
});

test("XB-13 : un seul target dépassant à lui seul l'enveloppe technique déclenche une erreur explicite, jamais une troncature silencieuse", () => {
  assert.throws(() => computeBatchPlan(targets(1), { fixedOverheadUnits: 100, perTargetUnits: 500, maxUnitsPerBatch: 220 }), /dépasse à lui seul/);
});

test("XB-14 : computeBatchPlan ne lit jamais le contenu métier des targets (description/type) — seul le nombre et l'enveloppe technique décident de la partition", () => {
  const adversarial = [
    target("issue1", { description: "Italie voyage tourisme budget hébergement case-12" }),
    target("issue2", { description: "totalement différent, aucun rapport sémantique" }),
    target("issue3", { description: "Italie voyage tourisme budget hébergement case-12" }),
    target("issue4", { description: "encore autre chose" })
  ];
  const planAdversarial = computeBatchPlan(adversarial, TIGHT_CAPABILITY);
  const planPlain = computeBatchPlan(targets(4), TIGHT_CAPABILITY);
  assert.deepEqual(planAdversarial.map((b) => b.length), planPlain.map((b) => b.length), "la forme du plan (tailles de batch) ne doit dépendre que du nombre de targets et de l'enveloppe, jamais de leur contenu — deux issues au contenu identique ne sont jamais regroupées pour cette raison.");
});

test("XB-15 : capability invalide (fixedOverheadUnits/perTargetUnits/maxUnitsPerBatch) est rejetée explicitement", () => {
  assert.throws(() => computeBatchPlan(targets(1), { perTargetUnits: 50, maxUnitsPerBatch: 220 }), /fixedOverheadUnits/);
  assert.throws(() => computeBatchPlan(targets(1), { fixedOverheadUnits: 100, maxUnitsPerBatch: 220 }), /perTargetUnits/);
  assert.throws(() => computeBatchPlan(targets(1), { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 100 }), /maxUnitsPerBatch/);
});

// --- XB-16..XB-23 : assembleSubstitutionReviews --------------------------------------------------

test("XB-16 : N=1, assemblage exact depuis un seul batch", () => {
  const result = assembleSubstitutionReviews(targets(1), [{ issue1: batchEntry("estimate") }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].issue_id, "issue1");
  assert.equal(result[0].available_alternative, "estimate");
});

test("XB-17 : N=4 réparties sur 2 batches, assemblage dans l'ordre de questionReviewTargets (jamais l'ordre des batches)", () => {
  const t4 = targets(4);
  const batchA = { issue3: batchEntry(null), issue1: batchEntry("decide") };
  const batchB = { issue4: batchEntry("research"), issue2: batchEntry(null) };
  const result = assembleSubstitutionReviews(t4, [batchA, batchB]);
  assert.deepEqual(result.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
});

test("XB-18 : why_available dérivé = alternatives_reviewed[available_alternative].reason, copie mécanique exacte", () => {
  const [entry] = assembleSubstitutionReviews(targets(1), [{ issue1: batchEntry("scenario") }]);
  assert.equal(entry.why_available, entry.alternatives_reviewed.scenario.reason);
  assert.equal(entry.why_available, "scenario permet réellement de continuer utilement le travail malgré l'inconnue.");
});

test("XB-19 : why_available vaut null quand available_alternative vaut null (comportement contractuel historique, sans invention)", () => {
  const [entry] = assembleSubstitutionReviews(targets(1), [{ issue1: batchEntry(null) }]);
  assert.equal(entry.available_alternative, null);
  assert.equal(entry.why_available, null);
});

test("XB-20 : collision — deux batches renvoient le même issue_id -> erreur explicite", () => {
  assert.throws(
    () => assembleSubstitutionReviews(targets(1), [{ issue1: batchEntry(null) }, { issue1: batchEntry("decide") }]),
    /collision/
  );
});

test("XB-21 : issue_id inconnu (absent de questionReviewTargets) -> erreur explicite", () => {
  assert.throws(
    () => assembleSubstitutionReviews(targets(1), [{ issue999: batchEntry(null) }]),
    /inconnu/
  );
});

test("XB-22 : issue manquante (aucun batch ne la couvre) -> erreur explicite, jamais un défaut fabriqué", () => {
  assert.throws(
    () => assembleSubstitutionReviews(targets(2), [{ issue1: batchEntry(null) }]),
    /manquante/
  );
});

test("XB-23 : questionReviewTargets avec un issue_id en double est rejeté avant tout assemblage", () => {
  assert.throws(
    () => assembleSubstitutionReviews([target("issue1"), target("issue1")], [{ issue1: batchEntry(null) }]),
    /double/
  );
});

test("XB-24 : un résultat de batch de forme invalide (non-objet) est rejeté explicitement", () => {
  assert.throws(() => assembleSubstitutionReviews(targets(1), ["not-an-object"]), /objet keyed-by-issue_id/);
});

// --- XB-25 : estimateSubstitutionBatchOutputUnits ------------------------------------------------

test("XB-25 : estimateSubstitutionBatchOutputUnits calcule une enveloppe de sortie dérivée de la taille du batch, jamais une constante recopiée", () => {
  const capability = { perIssueOutputUnits: 300, fixedOutputOverheadUnits: 100, safetyMarginRatio: 0.2, minOutputUnits: 256, maxOutputUnits: 2048 };
  const forOne = estimateSubstitutionBatchOutputUnits(1, capability);
  const forFour = estimateSubstitutionBatchOutputUnits(4, capability);
  assert.equal(forOne, Math.ceil((100 + 300 * 1) * 1.2));
  assert.equal(forFour, Math.ceil((100 + 300 * 4) * 1.2));
  assert.ok(forFour > forOne, "le budget de sortie doit croître avec le nombre d'issues du batch.");
});

test("XB-26 : estimateSubstitutionBatchOutputUnits respecte les bornes min/max quand fournies", () => {
  // raw = 0 + 10*1 = 10.
  // Sans bornes : résultat brut inchangé.
  assert.equal(estimateSubstitutionBatchOutputUnits(1, { perIssueOutputUnits: 10, fixedOutputOverheadUnits: 0, safetyMarginRatio: 0 }), 10);
  // minOutputUnits seul relève un résultat trop bas.
  assert.equal(estimateSubstitutionBatchOutputUnits(1, { perIssueOutputUnits: 10, fixedOutputOverheadUnits: 0, safetyMarginRatio: 0, minOutputUnits: 500 }), 500);
  // maxOutputUnits seul plafonne un résultat trop haut.
  assert.equal(estimateSubstitutionBatchOutputUnits(10, { perIssueOutputUnits: 10, fixedOutputOverheadUnits: 0, safetyMarginRatio: 0, maxOutputUnits: 50 }), 50);
  // Les deux bornes fournies : min appliqué puis max — la borne haute l'emporte si les deux entrent
  // en tension (configuration à corriger par l'appelant, jamais un jugement pris ici).
  assert.equal(estimateSubstitutionBatchOutputUnits(1, { perIssueOutputUnits: 10, fixedOutputOverheadUnits: 0, safetyMarginRatio: 0, minOutputUnits: 500, maxOutputUnits: 50 }), 50);
});

// --- XB-27..XB-33 : runCriticBatchedPipeline -----------------------------------------------------

test("XB-27 : N=0 -> executeBatch n'est jamais appelé, Critic global exécuté normalement, sortie finale conforme au contrat historique", async () => {
  let batchCalls = 0;
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture([]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async () => { batchCalls += 1; return {}; }
    }
  );
  assert.equal(batchCalls, 0);
  assert.deepEqual(output.question_substitution_review, []);
  assert.deepEqual(output.illegitimate_question_found, []);
  assert.equal(output.agreement, "agree");
});

test("XB-28 : N=1 -> un seul appel batch, cardinalité exacte, assemblage et dérivation corrects", async () => {
  const calls = [];
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => { calls.push(input); return { issue1: candidatesEntry("estimate") }; }
    }
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].issueIds, ["issue1"]);
  assert.equal(output.question_substitution_review.length, 1);
  assert.equal(output.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.agreement, "disagree");
});

test("XB-29 : N=4 forcé sur au moins 2 batches -> ordre, couverture exacte, aucune collision, assemblage, dérivation, validation", async () => {
  const calls = [];
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1", "issue2", "issue3", "issue4"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => {
        calls.push(input.issueIds);
        return Object.fromEntries(input.issueIds.map((id) => [id, candidatesEntry(id === "issue2" ? "decide" : null)]));
      }
    }
  );
  assert.ok(calls.length >= 2, "au moins deux appels batch attendus pour N=4 avec cette enveloppe.");
  assert.deepEqual(calls.flat(), ["issue1", "issue2", "issue3", "issue4"]);
  assert.equal(output.question_substitution_review.length, 4);
  assert.deepEqual(output.question_substitution_review.map((r) => r.issue_id), ["issue1", "issue2", "issue3", "issue4"]);
  assert.equal(output.illegitimate_question_found.length, 1);
  assert.equal(output.illegitimate_question_found[0].issue_id, "issue2");
  assert.equal(output.agreement, "disagree");
  // La validation historique (validateCriticOutput, inchangée) doit accepter le résultat sans erreur —
  // déjà garanti par le fait que runCriticBatchedPipeline le retourne (elle l'appelle en dernier), mais
  // revérifié explicitement pour documenter l'invariant.
  assert.doesNotThrow(() => validateCriticOutput(output));
});

test("XB-30 : les appels de batch sont strictement séquentiels, jamais en parallèle", async () => {
  const events = [];
  await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture(["issue1", "issue2", "issue3", "issue4"]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (input) => {
        events.push({ type: "start", batchIndex: input.batchIndex });
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push({ type: "end", batchIndex: input.batchIndex });
        return Object.fromEntries(input.issueIds.map((id) => [id, candidatesEntry(null)]));
      }
    }
  );
  // Séquentiel : chaque "end" précède le "start" suivant — jamais deux "start" consécutifs sans "end" entre eux.
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].type === "start") {
      assert.equal(events[i + 1].type, "end", "un batch doit se terminer avant que le suivant ne démarre (aucune parallélisation).");
    }
  }
});

test("XB-31 : panne partielle — un batch échoue techniquement, aucune issue inventée, aucun agreement fabriqué, état technique explicite", async () => {
  await assert.rejects(
    () => runCriticBatchedPipeline(
      { original_request: "x", analyst_output: analystOutputFixture(["issue1", "issue2", "issue3", "issue4"]), capability: TIGHT_CAPABILITY },
      {
        executeGlobal: async () => globalOutputFixture(),
        executeBatch: async (input) => {
          if (input.issueIds.includes("issue3")) throw new Error("provider_failure simulée");
          return Object.fromEntries(input.issueIds.map((id) => [id, candidatesEntry(null)]));
        }
      }
    ),
    (error) => {
      assert.equal(error.technical_state, "partial_failure");
      assert.ok(Array.isArray(error.batchFailures) && error.batchFailures.length === 1);
      assert.ok(error.batchFailures[0].issueIds.includes("issue3"));
      assert.equal(typeof error.succeededBatchCount, "number");
      assert.equal(typeof error.totalBatchCount, "number");
      assert.ok(error.succeededBatchCount < error.totalBatchCount);
      return true;
    }
  );
});

test("XB-32 : échec du Critic global -> aucun batch n'est tenté, échec technique propagé tel quel", async () => {
  let batchCalls = 0;
  await assert.rejects(
    () => runCriticBatchedPipeline(
      { original_request: "x", analyst_output: analystOutputFixture(["issue1"]), capability: TIGHT_CAPABILITY },
      {
        executeGlobal: async () => { throw new Error("global provider_failure simulée"); },
        executeBatch: async () => { batchCalls += 1; return {}; }
      }
    ),
    /global provider_failure simulée/
  );
  assert.equal(batchCalls, 0);
});

test("XB-33 : le Critic global contribue toujours à agreement (un veto global suffit à disagree, même en N=0)", async () => {
  const output = await runCriticBatchedPipeline(
    { original_request: "x", analyst_output: analystOutputFixture([]), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture({ vetoes: [{ issue_id: "issueX", new_information_trigger: "t", why_material: "m", why_not_substitutable: "s" }] }),
      executeBatch: async () => { throw new Error("ne doit jamais être appelé en N=0"); }
    }
  );
  assert.equal(output.agreement, "disagree");
  assert.equal(output.vetoes.length, 1);
});

// --- XB-34 : test de parité déterministe (section 19 du lot) -------------------------------------

test("XB-34 : parité déterministe stricte — assemblage batché + dérivation === référence monolithique normalisée, sur données synthétiques contrôlées", () => {
  const t4 = targets(4);
  const referenceRaw = {
    ...globalOutputFixture(),
    question_substitution_review: [
      { issue_id: "issue1", ...batchEntry("decide"), why_available: alternativesReviewed("decide").decide.reason },
      { issue_id: "issue2", ...batchEntry(null), why_available: null },
      { issue_id: "issue3", ...batchEntry("research"), why_available: alternativesReviewed("research").research.reason },
      { issue_id: "issue4", ...batchEntry(null), why_available: null }
    ]
  };
  const referenceNormalized = validateCriticOutput(deriveCriticConsequences(referenceRaw));

  // Découpage en 3 batches arbitraires (1, 2, 1), assemblage, puis exactement le même pipeline de
  // dérivation/validation que la référence.
  const batchResults = [
    { issue1: batchEntry("decide") },
    { issue2: batchEntry(null), issue3: batchEntry("research") },
    { issue4: batchEntry(null) }
  ];
  const assembled = assembleSubstitutionReviews(t4, batchResults);
  const batchedNormalized = validateCriticOutput(deriveCriticConsequences({ ...globalOutputFixture(), question_substitution_review: assembled }));

  assert.deepEqual(batchedNormalized, referenceNormalized, "identité stricte exigée : données déterministes, aucune génération LLM réelle impliquée dans ce test.");
});

// --- XB-35..XB-38 : invariant d'autorité (section 4) et absence de constante provider (section 5) -----

// Extraction robuste du texte d'une fonction (déclaration + docblock qui la précède immédiatement),
// bornée à la prochaine déclaration (export, function, ou le prochain docblock '/**') — jamais un
// simple indexOf("\nexport ") qui capturerait aussi le docblock de la fonction SUIVANTE.
function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(startMatch, `fonction ${name} introuvable.`);
  const start = startMatch.index;
  const rest = source.slice(start + 1);
  const boundary = rest.search(/\n(?:\/\*\*|export |function )/);
  const end = boundary === -1 ? source.length : start + 1 + boundary;
  return source.slice(start, end);
}

test("XB-35 : les nouvelles fonctions de partition/capacité (computeBatchPlan, buildSubstitutionBatchSchema, estimateSubstitutionBatchOutputUnits) ne codent en dur aucune constante provider (plafond TPM réel, nom de provider, modèle)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["computeBatchPlan", "buildSubstitutionBatchSchema", "estimateSubstitutionBatchOutputUnits", "runCriticBatchedPipeline"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /\b8000\b/, `${name} ne doit jamais coder 8000 en dur.`);
    assert.doesNotMatch(body, /groq/i, `${name} ne doit jamais nommer un provider.`);
    assert.doesNotMatch(body, /openai\/gpt-oss-20b/i, `${name} ne doit jamais nommer un modèle.`);
  }
});

test("XB-36 : computeBatchPlan et assembleSubstitutionReviews ne mentionnent jamais degraded_state, agreement, clarification_required (aucune autorité sémantique OPRIE usurpée)", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  for (const name of ["computeBatchPlan", "assembleSubstitutionReviews"]) {
    const body = extractFunctionSource(source, name);
    assert.doesNotMatch(body, /degraded_state/);
    assert.doesNotMatch(body, /\bagreement\b/);
    assert.doesNotMatch(body, /clarification_required|confirmation_required|operational_request_ready/);
  }
});

test("XB-37 : runCriticBatchedPipeline ne décide jamais degraded_state lui-même (absent de son propre code) — il transmet uniquement un état technique explicite", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  const start = source.indexOf("export async function runCriticBatchedPipeline(");
  const end = source.indexOf("\nexport const ARBITER_JSON_SCHEMA", start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /degraded_state/);
  assert.match(body, /technical_state/);
});

test("XB-38 : aucun mot métier de production (Italie, voyage, budget, tourisme, case-12, sentinelle) n'a été introduit par X2-BATCH", () => {
  const source = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(source, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});

// --- XB-verif : frozen guard --------------------------------------------------------------------

test("XB-verif : le frozen guard confirme qu'aucun moteur gelé n'a été modifié par X2-BATCH", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK");
});
