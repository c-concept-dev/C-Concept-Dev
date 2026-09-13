import test from "node:test";
import assert from "node:assert/strict";

import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  buildQuestionSubstitutionReviewSchema,
  validateCriticOutput,
  parseCriticOutput
} from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-S2 : le smoke réel sentinelle post-S1 (case-12-italie) a prouvé que S1 (prompt renforcé,
// sans structure obligatoire) était insuffisant : le Critic peut produire agreement="agree" et
// illegitimate_question_found=[] sans laisser aucune trace démontrant qu'il a réellement examiné
// chaque issue material+question contre les six alternatives de la ladder. S2 rend cette seconde
// lecture explicite, structurée et auditable via un nouveau champ, question_substitution_review.
// Ce fichier prouve exclusivement le NOUVEAU contrat structurel (schéma, validateur, scorer) : aucun
// mot métier (Italie, voyage, budget, dates, durée, passeport), aucun case_id de production, aucun
// appel réseau réel. Le scorer reste strictement structurel — jamais de jugement sur la pertinence
// réelle d'une alternative, qui reste exclusivement le jugement du LLM Critic.

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

function materialQuestionIssue(id, overrides = {}) {
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null, ...overrides };
}

function nonMaterialQuestionIssue(id) {
  return materialQuestionIssue(id, { impact: "non_material" });
}

function estimateTreatedIssue(id) {
  return materialQuestionIssue(id, { recommended_treatment: "estimate", substitutable: true });
}

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation de la disponibilité de ${treatment} compte tenu des données reçues.` }
  ]));
}

function lastResortReview(issueId) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(null), question_is_last_resort: true, available_alternative: null };
}

function availableReview(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(alternative), question_is_last_resort: false, available_alternative: alternative };
}

function illegitimateFinding(issueId, alternative, overrides = {}) {
  return { issue_id: issueId, available_alternative: alternative, why_available: `Justification structurelle : ${alternative} était raisonnablement disponible.`, ...overrides };
}

// --- Phase 23 : le prompt exige explicitement la nouvelle structure ------------------------------

// 3F.3.3-X2-B : question_is_last_resort n'est plus une clé du prompt (dérivée) — why_available la
// remplace dans les trois clés nommées littéralement.
test("S2-1 : le prompt nomme littéralement question_substitution_review et ses trois autres clés", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /question_substitution_review/);
  assert.match(CRITIC_SYSTEM_PROMPT, /alternatives_reviewed/);
  assert.match(CRITIC_SYSTEM_PROMPT, /why_available/);
  assert.match(CRITIC_SYSTEM_PROMPT, /available_alternative/);
});

// 3F.3.3-X2-A : la cardinalité (une entrée par issue material+question, jamais zéro ni deux pour une
// même issue) est désormais imposée STRUCTURELLEMENT par le schéma dynamique keyed-by-issue_id
// (additionalProperties:false, required===properties), plus par une instruction narrative comptant
// des entrées de tableau — cf. buildQuestionSubstitutionReviewSchema.
test("S2-2 : le prompt impose la cardinalité exacte, désormais via le mécanisme structurel du schéma (une clé exactement par target)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /une clé exactement par élément de question_review_targets/);
  assert.match(CRITIC_SYSTEM_PROMPT, /interdit mécaniquement toute clé absente de question_review_targets ou manquante par rapport à lui/);
});

test("S2-3 : le prompt fournit un squelette JSON montrant alternatives_reviewed comme objet à six clés fixes", () => {
  const skeletonMatch = CRITIC_SYSTEM_PROMPT.match(/\{\s*"alternatives_reviewed":[\s\S]*?"why_available":\s*null\s*\}/);
  assert.ok(skeletonMatch, "un squelette JSON doit montrer la forme d'une valeur question_substitution_review.");
  const skeleton = skeletonMatch[0];
  for (const treatment of LADDER) assert.match(skeleton, new RegExp(`"${treatment}"`), `${treatment} doit apparaître dans le squelette.`);
  assert.match(skeleton, /"reasonably_available"/);
  assert.match(skeleton, /"reason"/);
});

test("S2-4 : le prompt exige explicitement une justification même pour une alternative jugée non disponible", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /y compris pour une alternative jugée non disponible/i);
});

// --- Phase 24 : zéro issue material+question -> tableau vide, aucun signal requis ----------------

test("S2-24 : aucune issue material+question -> question_substitution_review=[] est structurellement valide, aucun signal requis", () => {
  const analystOutput = { issues: [nonMaterialQuestionIssue("ISSUE-1"), estimateTreatedIssue("ISSUE-2")] };
  const output = minimalCriticOutput();
  const result = validateCriticOutput(output);
  assert.deepEqual(result.question_substitution_review, []);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Phase 25 : une seule issue -> exactement une revue -------------------------------------------

test("S2-25 : une seule issue material+question -> le Critic doit fournir exactement une revue", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1")] });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review.length, 1);
  assert.equal(result.question_substitution_review[0].issue_id, "i1");
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Phase 26 : plusieurs issues -> plusieurs revues, aucune règle de maximum ---------------------

test("S2-26 : plusieurs issues material+question -> exactement autant de revues, aucun maximum", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1"), materialQuestionIssue("i2"), materialQuestionIssue("i3")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1"), lastResortReview("i2"), lastResortReview("i3")] });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review.length, 3);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "plusieurs questions légitimes, toutes correctement revues, ne doivent jamais échouer.");
});

// --- Phase 27 : alternative disponible -> last_resort=false, available_alternative, signal --------

test("S2-27 : une alternative disponible produit last_resort=false, available_alternative cohérent, et un signal B-01B", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("i1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("i1", "estimate")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review[0].question_is_last_resort, false);
  assert.equal(result.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(result.illegitimate_question_found.length, 1);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Phase 28 : question légitime -> last_resort=true, aucune entrée dans illegitimate_question_found ---

test("S2-28 : les six alternatives non disponibles -> question_is_last_resort=true, aucune entrée illegitimate_question_found", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1")] });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review[0].question_is_last_resort, true);
  assert.deepEqual(result.illegitimate_question_found, []);
});

// --- Phase 29 : plusieurs questions légitimes -> agreement=agree reste autorisé -------------------

test("S2-29 : plusieurs questions légitimes (dernier recours) -> illegitimate_question_found=[], agreement=agree autorisé", () => {
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [lastResortReview("i1"), lastResortReview("i2"), lastResortReview("i3"), lastResortReview("i4")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.agreement, "agree");
  assert.equal(result.question_substitution_review.length, 4);
  assert.deepEqual(result.illegitimate_question_found, []);
});

// --- Phase 30 : cas mixte -------------------------------------------------------------------------

test("S2-30 : cas mixte (dernier recours + alternative disponible + non-material + estimate) -> revues et signal ciblés correctement", () => {
  const analystOutput = {
    issues: [
      materialQuestionIssue("A"),           // dernier recours réel
      materialQuestionIssue("B"),           // alternative disponible
      nonMaterialQuestionIssue("C"),        // hors périmètre B-01B (non matérielle)
      estimateTreatedIssue("D")             // hors périmètre B-01B (déjà traitée par estimate)
    ]
  };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("A"), availableReview("B", "decide")],
    illegitimate_question_found: [illegitimateFinding("B", "decide")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review.length, 2);
  assert.deepEqual(result.question_substitution_review.map((r) => r.issue_id).sort(), ["A", "B"]);
  assert.equal(result.illegitimate_question_found.length, 1);
  assert.equal(result.illegitimate_question_found[0].issue_id, "B");
  assert.equal(result.agreement, "disagree");
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "C et D sont légitimement absents de question_substitution_review : hors périmètre B-01B.");
});

// --- Phase 31 : duplication ----------------------------------------------------------------------

test("S2-31 : deux revues pour le même issue_id sont rejetées structurellement", () => {
  const output = minimalCriticOutput({
    question_substitution_review: [lastResortReview("i1"), lastResortReview("i1")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 32 : revue manquante --------------------------------------------------------------------

test("S2-32 : une issue material+question sans entrée dans question_substitution_review échoue structurellement (test central S2)", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1"), materialQuestionIssue("i2")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1")] }); // i2 manquante
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, false);
  const coverage = score.criteria.find((c) => c.criterion === "question_substitution_review_covers_all_targetable_issues");
  assert.ok(coverage, "le critère de couverture doit être évalué dès qu'au moins une issue est ciblable.");
  assert.equal(coverage.pass, false);
});

// --- Phase 33 : fausse revue ------------------------------------------------------------------------

test("S2-33 : une revue ciblant une issue non-material échoue au scorer", () => {
  const analystOutput = { issues: [nonMaterialQuestionIssue("i1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1")] });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, false);
  assert.equal(score.criteria.find((c) => c.criterion === "question_substitution_review_targets_valid_issue").pass, false);
});

test("S2-33b : une revue ciblant une issue déjà traitée par estimate (jamais question) échoue au scorer", () => {
  const analystOutput = { issues: [estimateTreatedIssue("i1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1")] });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.criteria.find((c) => c.criterion === "question_substitution_review_targets_valid_issue").pass, false);
});

test("S2-33c : une revue ciblant une issue inexistante échoue au scorer", () => {
  const analystOutput = { issues: [materialQuestionIssue("i1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("i1"), lastResortReview("DOES-NOT-EXIST")] });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.criteria.find((c) => c.criterion === "question_substitution_review_targets_valid_issue").pass, false);
});

// --- Phase 34 : exactitude des six alternatives ----------------------------------------------------

test("S2-34 : une alternative manquante dans alternatives_reviewed est rejetée", () => {
  const review = lastResortReview("i1");
  delete review.alternatives_reviewed.leave_unknown;
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-34b : une septième clé ajoutée dans alternatives_reviewed est rejetée", () => {
  const review = lastResortReview("i1");
  review.alternatives_reviewed.ask_user = { reasonably_available: false, reason: "x" };
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-34c : \"question\" elle-même comme clé de alternatives_reviewed est rejetée", () => {
  const review = lastResortReview("i1");
  delete review.alternatives_reviewed.research;
  review.alternatives_reviewed.question = { reasonably_available: false, reason: "x" };
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 35 : cohérence last-resort ----------------------------------------------------------------

test("S2-35 : research=true mais question_is_last_resort=true est incohérent et rejeté", () => {
  const review = availableReview("i1", "research");
  review.question_is_last_resort = true;
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-35b : six alternatives false mais question_is_last_resort=false est incohérent et rejeté", () => {
  const review = lastResortReview("i1");
  review.question_is_last_resort = false;
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 36 : available_alternative -----------------------------------------------------------------

test("S2-36 : available_alternative absent (null) alors que question_is_last_resort=false est rejeté", () => {
  const review = availableReview("i1", "research");
  review.available_alternative = null;
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-36b : available_alternative hors de la ladder (ou \"question\") est rejeté", () => {
  for (const invalid of ["question", "ask_user", "not_a_real_treatment"]) {
    const review = availableReview("i1", "research");
    review.available_alternative = invalid;
    const output = minimalCriticOutput({ question_substitution_review: [review] });
    assert.throws(() => validateCriticOutput(output), TypeError, `available_alternative="${invalid}" doit être rejeté.`);
  }
});

test("S2-36c : available_alternative choisie mais déclarée reasonably_available=false est rejeté", () => {
  const review = availableReview("i1", "research");
  review.available_alternative = "decide"; // "decide" n'a jamais été marqué disponible dans cette revue
  const output = minimalCriticOutput({ question_substitution_review: [review] });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 37 : cohérence avec illegitimate_question_found ----------------------------------------

test("S2-37 : question_is_last_resort=false sans signal correspondant dans illegitimate_question_found est rejeté", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("i1", "research")],
    illegitimate_question_found: []
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-37b : un signal présent pour une revue question_is_last_resort=true est rejeté", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("i1")],
    illegitimate_question_found: [illegitimateFinding("i1", "research")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("S2-37c : un signal référençant une issue absente de question_substitution_review est rejeté", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [],
    illegitimate_question_found: [illegitimateFinding("i1", "research")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 38 : cohérence agreement ------------------------------------------------------------------

test("S2-38 : illegitimate_question_found non vide avec agreement=\"agree\" est rejeté structurellement", () => {
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [availableReview("i1", "research")],
    illegitimate_question_found: [illegitimateFinding("i1", "research")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Phase 39 : strict JSON Groq (parité avec tests/operational-request-groq-schema-compat.test.mjs) --

// 3F.3.3-X2-A : question_substitution_review est désormais un OBJET keyed-by-issue_id (mécanisme C),
// jamais un tableau — CRITIC_JSON_SCHEMA (statique, N=0) n'a plus cette propriété du tout ; le schéma
// réel s'obtient via buildQuestionSubstitutionReviewSchema(targets), construit dynamiquement par
// appel. alternatives_reviewed (un objet de six objets, jamais de tableau accidentel) est inchangé.
test("S2-39 : question_substitution_review est un objet keyed-by-issue_id, alternatives_reviewed un objet de six objets (jamais de tableau accidentel)", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["issue1"]);
  const entrySchema = schema.properties.issue1;
  assert.equal(entrySchema.type, "object");
  assert.deepEqual([...entrySchema.required].sort(), ["alternatives_reviewed", "available_alternative", "why_available"]);
  const alternativesSchema = entrySchema.properties.alternatives_reviewed;
  assert.equal(alternativesSchema.type, "object");
  assert.deepEqual([...alternativesSchema.required].sort(), [...LADDER].sort());
  for (const treatment of LADDER) {
    const treatmentSchema = alternativesSchema.properties[treatment];
    assert.equal(treatmentSchema.type, "object", `${treatment} doit être un objet, jamais un tableau.`);
    assert.deepEqual([...treatmentSchema.required].sort(), ["reason", "reasonably_available"]);
  }
  assert.deepEqual(entrySchema.properties.available_alternative.type, ["string", "null"]);
  assert.ok(entrySchema.properties.available_alternative.enum.includes(null));
  assert.ok(!("question_substitution_review" in CRITIC_JSON_SCHEMA.properties), "CRITIC_JSON_SCHEMA (N=0) ne porte plus cette propriété — cf. buildCriticJsonSchema.");
});

// 3F.3.3-X2-B : parseCriticOutput reçoit désormais la forme RÉELLEMENT produite par le LLM (objet
// keyed-by-issue_id, sans question_is_last_resort/agreement/illegitimate_question_found — dérivés
// par deriveCriticConsequences) — plus l'ancienne forme tableau à 9 champs complets.
test("S2-39b : la forme réelle keyed-by-issue_id d'une sortie Critic complète (plusieurs revues) survit à un aller-retour JSON complet", () => {
  const rawOutput = {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: {
      i1: { alternatives_reviewed: alternativesReviewed(null), available_alternative: null, why_available: null },
      i2: { alternatives_reviewed: alternativesReviewed("condition"), available_alternative: "condition", why_available: "Justification structurelle : condition permettait une progression utile pour i2." }
    }
  };
  const roundTripped = parseCriticOutput(JSON.stringify(rawOutput));
  assert.equal(roundTripped.question_substitution_review.length, 2);
  assert.equal(roundTripped.illegitimate_question_found.length, 1);
  assert.equal(roundTripped.agreement, "disagree");
});

// --- Phase 40 : obligation structurelle dès qu'une alternative est jugée disponible ---------------

test("S2-40 : dès que le Critic juge lui-même une alternative disponible, il est structurellement obligé d'en tirer last_resort=false + signal + disagree", () => {
  // Positif : la forme correcte (last_resort=false, signal présent, agreement=disagree) est acceptée.
  const coherent = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("i1", "scenario")],
    illegitimate_question_found: [illegitimateFinding("i1", "scenario")]
  });
  assert.doesNotThrow(() => validateCriticOutput(coherent));
  // Négatif : la même conclusion (une alternative disponible) sans en tirer aucune des trois
  // conséquences structurelles est systématiquement rejetée, quelle que soit celle qui manque.
  const missingSignal = minimalCriticOutput({ agreement: "disagree", question_substitution_review: [availableReview("i1", "scenario")], illegitimate_question_found: [] });
  assert.throws(() => validateCriticOutput(missingSignal), TypeError, "sans signal correspondant, la disponibilité jugée par le Critic reste sans effet structurel : rejeté.");
  const wrongLastResort = availableReview("i1", "scenario");
  wrongLastResort.question_is_last_resort = true;
  const inconsistentLastResort = minimalCriticOutput({ agreement: "disagree", question_substitution_review: [wrongLastResort], illegitimate_question_found: [illegitimateFinding("i1", "scenario")] });
  assert.throws(() => validateCriticOutput(inconsistentLastResort), TypeError);
  const wrongAgreement = minimalCriticOutput({ agreement: "agree", question_substitution_review: [availableReview("i1", "scenario")], illegitimate_question_found: [illegitimateFinding("i1", "scenario")] });
  assert.throws(() => validateCriticOutput(wrongAgreement), TypeError);
});

// Phase 41 (aucun mot métier / case_id de production hardcodé) est satisfaite par construction dans
// tout ce fichier : chaque fixture ci-dessus utilise des identifiants génériques (i1, i2, A, B, C, D)
// et des libellés abstraits — jamais Italie, voyage, budget, dates, durée ou un case_id du corpus. Un
// test qui listerait ces mots interdits pour les rechercher dans son propre code source les
// contiendrait lui-même et échouerait contre sa propre liste : la garantie ne peut être que
// structurelle (revue de code), jamais un test automatisé auto-référentiel.
