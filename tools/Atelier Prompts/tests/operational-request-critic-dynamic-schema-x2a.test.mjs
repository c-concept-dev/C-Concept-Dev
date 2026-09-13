import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  CRITIC_OUTPUT_FIELDS,
  TREATMENT_VALUES,
  buildQuestionReviewTargets,
  buildQuestionSubstitutionReviewSchema,
  buildCriticJsonSchema,
  validateCriticOutput,
  parseCriticOutput,
  makeCriticUserMessage,
  resolveRoleSchema,
  ROLE_DEFINITIONS
} from "../workers/shared/operational-request-core.js";

// 3F.3.3-X2-A : intégration en production du mécanisme C validé expérimentalement (X1/X1-E) —
// question_substitution_review devient un objet keyed-by-issue_id, avec cardinalité imposée
// STRUCTURELLEMENT par le schéma JSON (additionalProperties:false, required===Object.keys(properties))
// plutôt que par une instruction narrative. Ce fichier prouve les 22 propriétés comportementales
// exigées par la mission (X2A-1 à X2A-22) — jamais uniquement une présence de texte dans le prompt.
//
// D reste explicitement hors périmètre : available_alternative, question_is_last_resort,
// illegitimate_question_found, agreement, why_available, la calibration S4 et la cohérence G4 ne
// sont ni renommés ni resémantisés — seule la cardinalité structurelle de question_substitution_review
// change de mécanisme.

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation structurelle de ${treatment} compte tenu des données reçues.` }
  ]));
}

function reviewValue(alternative) {
  return {
    alternatives_reviewed: alternativesReviewed(alternative),
    question_is_last_resort: alternative === null,
    available_alternative: alternative
  };
}

function materialQuestionIssue(id) {
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null };
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

// --- X2A-1 : 0 target -> aucune omission, sortie substitution vide cohérente ------------------------

test("X2A-1 : 0 target -> question_substitution_review absent du schéma envoyé, mais [] déterministe dans la sortie normalisée (aucune omission fautive)", () => {
  const schema = buildCriticJsonSchema([]);
  assert.ok(!("question_substitution_review" in schema.properties), "N=0 : la propriété doit être absente de properties (court-circuit déterministe, jamais un sous-schéma vide envoyé au provider).");
  assert.ok(!schema.required.includes("question_substitution_review"));

  const output = minimalCriticOutput();
  delete output.question_substitution_review; // simule la réponse LLM réelle : la clé est absente
  const result = validateCriticOutput(output);
  assert.deepEqual(result.question_substitution_review, [], "l'absence de la clé doit être normalisée en [] déterministiquement, jamais un jugement LLM.");
});

// --- X2A-2 : 1 target -> schema contient exactement cette clé ---------------------------------------

test("X2A-2 : 1 target -> le schéma contient exactement cette clé", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.deepEqual(Object.keys(schema.properties), ["issue1"]);
  assert.deepEqual(schema.required, ["issue1"]);
});

// --- X2A-3 : 4 targets -> schema contient exactement les 4 clés -------------------------------------

test("X2A-3 : 4 targets -> le schéma contient exactement ces 4 clés (sentinelle B-01B : issue1-4)", () => {
  const targets = ["issue1", "issue2", "issue3", "issue4"].map((issue_id) => ({ issue_id }));
  const schema = buildQuestionSubstitutionReviewSchema(targets);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["issue1", "issue2", "issue3", "issue4"]);
  assert.deepEqual([...schema.required].sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

// --- X2A-4 : required === properties -----------------------------------------------------------------

test("X2A-4 : required === Object.keys(properties), pour 0/1/4/7 targets", () => {
  for (const n of [0, 1, 4, 7]) {
    const targets = Array.from({ length: n }, (_, i) => ({ issue_id: `t${i}` }));
    const schema = buildQuestionSubstitutionReviewSchema(targets);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `n=${n}`);
  }
});

// --- X2A-5 : additionalProperties=false ---------------------------------------------------------------

test("X2A-5 : additionalProperties=false à tous les niveaux (racine, valeur, alternatives_reviewed, chaque alternative)", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.equal(schema.additionalProperties, false);
  const entry = schema.properties.issue1;
  assert.equal(entry.additionalProperties, false);
  assert.equal(entry.properties.alternatives_reviewed.additionalProperties, false);
  for (const treatment of LADDER) {
    assert.equal(entry.properties.alternatives_reviewed.properties[treatment].additionalProperties, false);
  }
});

// --- X2A-6 : clé manquante rejetée --------------------------------------------------------------------

test("X2A-6 : une clé manquante (target attendu absent de la réponse) est rejetée par le validateur", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2")] };
  const targets = buildQuestionReviewTargets(analystOutput);
  assert.equal(targets.length, 2);
  // La réponse LLM omet issue2 : normalizeQuestionSubstitutionReviewRaw absorbe l'objet mais le
  // scorer/validateur ne peuvent PAS rattraper une cardinalité manquante ici (cela reste vérifié par
  // le scorer avec analyst_output, cf. score-role-outputs.mjs, inchangé) ; ce test vérifie que la
  // clé manquante n'apparaît simplement jamais dans la sortie normalisée (elle ne peut pas être
  // inventée).
  const raw = { issue1: reviewValue(null) };
  const output = minimalCriticOutput({ question_substitution_review: raw });
  const result = validateCriticOutput(output);
  assert.deepEqual(result.question_substitution_review.map((r) => r.issue_id), ["issue1"]);
  assert.ok(!result.question_substitution_review.some((r) => r.issue_id === "issue2"), "issue2 ne doit jamais être inventée : son absence de la réponse brute doit rester une absence dans la sortie normalisée.");
});

// --- X2A-7 : clé fantôme rejetée -----------------------------------------------------------------------

test("X2A-7 : le schéma dynamique interdit structurellement toute clé fantôme (additionalProperties:false, issue_id hors targets)", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.equal(schema.additionalProperties, false, "additionalProperties:false interdit mécaniquement toute clé (ex. issue_fantome) absente de properties.");
  assert.ok(!("issue_fantome" in schema.properties));
});

// --- X2A-8 : matching issue_id exact --------------------------------------------------------------------

test("X2A-8 : issue_id est reporté exactement tel quel depuis la clé de l'objet, jamais reconstruit ni reformulé", () => {
  const raw = { "issue-42_étrange.id": reviewValue("estimate") };
  const output = minimalCriticOutput({ question_substitution_review: raw, agreement: "disagree", illegitimate_question_found: [{ issue_id: "issue-42_étrange.id", available_alternative: "estimate", why_available: "Justification structurelle." }] });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review[0].issue_id, "issue-42_étrange.id");
});

// --- X2A-9 : raw keyed object -> tableau normalisé historique -------------------------------------------

test("X2A-9 : la forme brute keyed-by-issue_id est normalisée en tableau historique {issue_id, alternatives_reviewed, question_is_last_resort, available_alternative}", () => {
  const raw = { issue1: reviewValue("estimate"), issue2: reviewValue(null) };
  const output = minimalCriticOutput({
    question_substitution_review: raw,
    agreement: "disagree",
    illegitimate_question_found: [{ issue_id: "issue1", available_alternative: "estimate", why_available: "Justification structurelle." }]
  });
  const result = validateCriticOutput(output);
  assert.ok(Array.isArray(result.question_substitution_review), "la sortie normalisée reste un tableau, pour le scorer/consommateurs existants.");
  assert.equal(result.question_substitution_review.length, 2);
  const byId = new Map(result.question_substitution_review.map((r) => [r.issue_id, r]));
  assert.deepEqual(Object.keys(byId.get("issue1")).sort(), ["alternatives_reviewed", "available_alternative", "issue_id", "question_is_last_resort"]);
  assert.equal(byId.get("issue1").available_alternative, "estimate");
  assert.equal(byId.get("issue2").question_is_last_resort, true);
});

// --- X2A-10 : aucune reconstruction depuis description/type ---------------------------------------------

test("X2A-10 : le schéma ignore tout champ du target autre qu'issue_id (aucune reconstruction depuis description/type)", () => {
  const targets = [
    { issue_id: "issue1", type: "missing_information", description: "Ceci pourrait ressembler à issue2 textuellement.", impact: "material", recommended_treatment: "question" },
    { issue_id: "issue2", type: "missing_information", description: "Ceci pourrait ressembler à issue1 textuellement.", impact: "material", recommended_treatment: "question" }
  ];
  const schema = buildQuestionSubstitutionReviewSchema(targets);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["issue1", "issue2"], "seul issue_id détermine les clés, jamais description/type.");
});

// --- X2A-11 : aucun fuzzy matching --------------------------------------------------------------------

test("X2A-11 : aucun fuzzy matching, aucune distance d'édition dans le code de production modifié", () => {
  const sourcePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /fuzzy|levenshtein|edit[\s_-]?distance|similarity[\s_-]?score/i);
});

// --- X2A-12 : aucun embedding/similarity ----------------------------------------------------------------

test("X2A-12 : aucun embedding ni représentation vectorielle dans le code de production modifié", () => {
  const sourcePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /embedding|vector[\s_-]?representation|cosine[\s_-]?similarity/i);
});

// --- X2A-13 : les six alternatives viennent de la source canonique --------------------------------------

test("X2A-13 : les six alternatives du schéma dynamique proviennent de TREATMENT_VALUES (source canonique), jamais d'une deuxième liste", () => {
  const canonicalLadder = TREATMENT_VALUES.filter((v) => v !== "question");
  assert.deepEqual([...canonicalLadder].sort(), [...LADDER].sort(), "précondition : la ladder canonique correspond à la ladder de test.");
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  const alternativesRequired = schema.properties.issue1.properties.alternatives_reviewed.required;
  assert.deepEqual([...alternativesRequired].sort(), [...canonicalLadder].sort());
});

// --- X2A-14 à X2A-17 : champs D hors périmètre, inchangés -----------------------------------------------

test("X2A-14 : available_alternative reste inchangé dans ce lot (nullable, valeurs légales = ladder hors question)", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  const field = schema.properties.issue1.properties.available_alternative;
  assert.deepEqual(field.type, ["string", "null"]);
  assert.deepEqual([...field.enum].sort(), [...LADDER, null].sort());
});

// 3F.3.3-X2-B, levier D : question_is_last_resort n'est plus une propriété du schéma LLM (X2-A) —
// il est dérivé mécaniquement par deriveCriticConsequences (workers/shared/operational-request-core.js).
// Superseded : cf. tests/operational-request-critic-dynamic-schema-x2b.test.mjs pour la preuve
// comportementale complète de la dérivation.
test("X2A-15 : question_is_last_resort n'est plus une clé du schéma LLM (X2-B, dérivé) — why_available la remplace", () => {
  const schema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.ok(!("question_is_last_resort" in schema.properties.issue1.properties), "superseded par X2-B : dérivé, plus demandé au LLM.");
  assert.deepEqual(schema.properties.issue1.properties.why_available, { type: ["string", "null"] });
});

// 3F.3.3-X2-B : illegitimate_question_found n'est plus dans le schéma LLM (X2-A) — dérivé.
test("X2A-16 : illegitimate_question_found n'est plus dans le schéma LLM (X2-B, dérivé) ; validateCriticOutput (inchangé) continue de le valider structurellement une fois reconstruit", () => {
  assert.ok(!("illegitimate_question_found" in CRITIC_JSON_SCHEMA.properties), "superseded par X2-B : dérivé, plus demandé au LLM.");
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: { issue1: reviewValue("estimate") },
    illegitimate_question_found: [{ issue_id: "issue1", available_alternative: "estimate", why_available: "Justification structurelle." }]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  assert.equal(result.illegitimate_question_found[0].issue_id, "issue1");
});

// 3F.3.3-X2-B : agreement n'est plus dans le schéma LLM (X2-A) — dérivé.
test("X2A-17 : agreement n'est plus dans le schéma LLM (X2-B, dérivé) ; validateCriticOutput (inchangé) continue de valider l'enum et la cohérence détection->verdict", () => {
  assert.ok(!("agreement" in CRITIC_JSON_SCHEMA.properties), "superseded par X2-B : dérivé, plus demandé au LLM.");
  assert.throws(() => validateCriticOutput(minimalCriticOutput({ agreement: "invalide" })), TypeError);
});

// --- X2A-18 : S4 calibration inchangée -------------------------------------------------------------------

test("X2A-18 : la calibration sémantique S4 de reasonably_available reste intacte dans le prompt", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /research=true uniquement si/);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown=true si/);
});

// --- X2A-19 : G3 strict JSON inchangé hors nécessité structurelle -----------------------------------------

test("X2A-19 : G3 (interdiction available_alternative_reason, routage justification) reste intact — seule la cardinalité (issue_id -> clé) a changé", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le reason déjà présent dans alternatives_reviewed\.<alternative correspondante>\.reason est la seule et unique explication de la disponibilité de cette alternative/);
  const invalidReview = { ...reviewValue("estimate"), available_alternative_reason: "en trop" };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: { issue1: invalidReview },
    illegitimate_question_found: [{ issue_id: "issue1", available_alternative: "estimate", why_available: "x" }]
  });
  assert.throws(() => validateCriticOutput(output), TypeError, "une clé hors contrat dans une valeur keyed-by-issue_id doit toujours être rejetée (additionalProperties:false, validateur inchangé).");
});

// --- X2A-20 : G4 cohérence inchangée hors adaptation de représentation -------------------------------------

test("X2A-20 : la chaîne de cohérence G4 (CAS A/CAS B, signal <-> revue, agreement) reste intacte pour la forme keyed-by-issue_id", () => {
  // CAS A : alternative disponible -> signal obligatoire, sinon rejet (OMISSION) — inchangé.
  const omission = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: { issue1: reviewValue("estimate") },
    illegitimate_question_found: []
  });
  assert.throws(() => validateCriticOutput(omission), /mais aucune entrée correspondante n'existe dans illegitimate_question_found/);

  // CAS B : six alternatives false -> last_resort=true, aucun signal requis, agreement="agree" valide.
  const legitimate = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: { issue1: reviewValue(null) },
    illegitimate_question_found: []
  });
  const result = validateCriticOutput(legitimate);
  assert.equal(result.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(result.illegitimate_question_found.length, 0);
});

// --- X2A-21 : N=0 n'envoie jamais le schéma X1 vide rejeté par Groq -----------------------------------------

test("X2A-21 : N=0 ne produit jamais le sous-schéma dégénéré {properties:{}, required:[]} qui a été rejeté empiriquement par Groq (HTTP 400)", () => {
  const schema = buildCriticJsonSchema([]);
  assert.ok(!("question_substitution_review" in schema.properties), "la propriété doit être absente, jamais présente avec properties:{} / required:[].");
  // Preuve supplémentaire, au niveau du registre de rôles réellement utilisé par les deux workers :
  const criticInput = { analyst_output: { issues: [] } };
  const resolvedSchema = resolveRoleSchema(ROLE_DEFINITIONS.critic, criticInput);
  assert.ok(!("question_substitution_review" in resolvedSchema.properties), "le schéma résolu pour un appel réel à 0 target doit aussi omettre la propriété.");
});

// --- X2A-22 : aucune modification des moteurs gelés ------------------------------------------------------

test("X2A-22 : le frozen guard confirme qu'aucun moteur gelé n'a été modifié", () => {
  const guardPath = fileURLToPath(new URL("../tools/frozen-guard.mjs", import.meta.url));
  const output = execFileSync("node", [guardPath], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "OK", `frozen guard doit rapporter OK (obtenu : ${JSON.stringify(report)}).`);
});

// --- Non-régression : les autres champs Critic (hors question_substitution_review) sont inchangés -------

test("X2A-verif : les 9 champs CRITIC_OUTPUT_FIELDS restent inchangés (aucun champ D renommé, aucun ajouté, aucun retiré)", () => {
  assert.deepEqual([...CRITIC_OUTPUT_FIELDS], [
    "agreement",
    "operational_request_candidate_review",
    "vetoes",
    "semantic_drift_detected",
    "semantic_drift_notes",
    "significant_stakes",
    "significant_stakes_reason",
    "question_substitution_review",
    "illegitimate_question_found"
  ]);
});

// 3F.3.3-X2-B : parseCriticOutput reçoit désormais la forme RÉELLEMENT produite par le LLM —
// why_available vit dans la valeur elle-même (question_is_last_resort/agreement/
// illegitimate_question_found sont dérivés, jamais lus depuis le raw).
test("X2A-verif : parseCriticOutput accepte un aller-retour JSON complet de la forme réelle keyed-by-issue_id (4 targets, mixte)", () => {
  const raw = JSON.stringify({
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: "",
    question_substitution_review: {
      issue1: { alternatives_reviewed: alternativesReviewed(null), available_alternative: null, why_available: null },
      issue2: { alternatives_reviewed: alternativesReviewed("estimate"), available_alternative: "estimate", why_available: "x" },
      issue3: { alternatives_reviewed: alternativesReviewed("scenario"), available_alternative: "scenario", why_available: "y" },
      issue4: { alternatives_reviewed: alternativesReviewed(null), available_alternative: null, why_available: null }
    }
  });
  const result = parseCriticOutput(raw);
  assert.equal(result.question_substitution_review.length, 4);
  assert.deepEqual(result.question_substitution_review.map((r) => r.issue_id).sort(), ["issue1", "issue2", "issue3", "issue4"]);
});

test("X2A-verif : makeCriticUserMessage reste inchangé (question_review_targets toujours calculé mécaniquement, indépendant de X2A)", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2")] };
  const message = JSON.parse(makeCriticUserMessage({ original_request: "x", analyst_output: analystOutput, previous_vetoes: [] }));
  assert.equal(message.question_review_targets.length, 2);
});
