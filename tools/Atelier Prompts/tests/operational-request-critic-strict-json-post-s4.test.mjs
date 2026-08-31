import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CRITIC_SYSTEM_PROMPT,
  CRITIC_JSON_SCHEMA,
  buildQuestionSubstitutionReviewSchema,
  validateCriticOutput
} from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-G3 : le smoke réel post-S4 (sentinelle sentinel-b01b-substitution) a échoué en HTTP 400
// (json_validate_failed) : Groq a produit une clé hors contrat, available_alternative_reason, dans
// des entrées de question_substitution_review, ainsi que des signes de forme JSON mal fermée autour
// de certains objets alternatives_reviewed. Diagnostic : CRITIC_JSON_SCHEMA porte déjà
// additionalProperties:false à chacun des trois niveaux concernés (l'entrée, alternatives_reviewed,
// chaque alternative individuelle) — la non-conformité ne vient donc jamais d'un schéma incomplet,
// mais d'une dérive de génération que la contrainte de décodage stricte de Groq n'a pas empêchée,
// probablement par analogie avec why_available (illegitimate_question_found), qui EST un champ de
// justification légitime mais à un tout autre endroit du contrat. Comme pour G1/G2 (déjà des
// renforcements texte-seul, jamais des changements de schéma), G3 ajoute uniquement des rappels
// explicites au CRITIC_SYSTEM_PROMPT : clés exactes à chaque niveau, interdiction nommée de
// available_alternative_reason, et routage explicite de chaque justification vers son unique champ
// dédié. CRITIC_JSON_SCHEMA, le validateur et le scorer restent strictement inchangés — ce fichier le
// prouve autant qu'il prouve le nouveau texte de prompt. Aucun mot métier de production (Italie,
// voyage, budget, dates, durée, tourisme, sentinelle) n'apparaît dans le code de production modifié.

// --- Section 25 : interdiction explicite d'available_alternative_reason ---------------------------

test("G3-1 : le prompt interdit nommément available_alternative_reason comme clé de sortie", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez jamais available_alternative_reason, ni aucune autre clé absente du schéma/);
});

// --- Section 26 : exactement les 4 clés de chaque review -------------------------------------------

// 3F.3.3-X2-A : issue_id devient la clé de l'objet — trois clés désormais dans chaque valeur.
test("G3-2 : le prompt rappelle explicitement les 3 clés exactes d'une valeur question_substitution_review", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /chaque valeur de question_substitution_review contient EXACTEMENT ces trois clés — alternatives_reviewed, question_is_last_resort, available_alternative — jamais une quatrième/);
});

// --- Section 27 : exactement les 6 clés d'alternatives_reviewed -------------------------------------

test("G3-3 : le prompt rappelle explicitement les 6 clés exactes d'alternatives_reviewed", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /alternatives_reviewed contient EXACTEMENT ces six clés — research, decide, estimate, scenario, condition, leave_unknown — jamais une septième/);
});

// --- Section 28 : exactement les 2 clés de chaque alternative ---------------------------------------

test("G3-4 : le prompt rappelle explicitement les 2 clés exactes de chaque alternative individuelle", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /Chaque alternative individuelle \(chacune des six\) contient EXACTEMENT ces deux clés — reasonably_available, reason — jamais une autre/);
});

// --- Section 29 : routage explicite des justifications -----------------------------------------------

test("G3-5 : le prompt route explicitement chaque justification vers son unique champ dédié, jamais un champ inventé", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /l'explication de pourquoi une alternative est disponible vit exclusivement dans alternatives_reviewed\.<alternative>\.reason, jamais ailleurs, jamais dupliquée dans un champ séparé/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le reason déjà présent dans alternatives_reviewed\.<alternative correspondante>\.reason est la seule et unique explication attendue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /la justification du signal illegitimate_question_found vit exclusivement dans son propre champ why_available/);
  assert.match(CRITIC_SYSTEM_PROMPT, /ne la recopiez jamais dans question_substitution_review/);
});

// --- Section 17 : rappel JSON strict général --------------------------------------------------------

test("G3-6 : la consigne finale rappelle explicitement l'absence de prose, de clé renommée, de commentaire et de virgule finale", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /aucune phrase avant ou après l'objet, aucune clé renommée, aucun commentaire, aucune virgule finale superflue, et aucune propriété absente du schéma/);
});

test("G3-7 : les INTERDICTIONS listent explicitement l'interdiction de toute clé hors schéma dans question_substitution_review", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez jamais available_alternative_reason, ni aucune autre clé absente du schéma, à question_substitution_review ou à l'une quelconque de ses sous-structures/);
});

// --- Section 31 : le schéma reste additionalProperties:false à chacun des trois niveaux -------------

// 3F.3.3-X2-A : question_substitution_review est désormais un schéma dynamique keyed-by-issue_id
// (buildQuestionSubstitutionReviewSchema), plus le tableau statique de CRITIC_JSON_SCHEMA (qui
// représente maintenant le cas N=0, sans cette propriété — cf. buildCriticJsonSchema). On construit
// ici le schéma pour un target représentatif afin d'inspecter la forme d'une valeur.
test("G3-8 : le schéma dynamique de question_substitution_review reste additionalProperties:false aux trois niveaux (valeur, alternatives_reviewed, chaque alternative) — UNCHANGED", () => {
  const dynamicSchema = buildQuestionSubstitutionReviewSchema([{ issue_id: "issue1" }]);
  assert.equal(dynamicSchema.type, "object");
  assert.equal(dynamicSchema.additionalProperties, false);
  assert.deepEqual(dynamicSchema.required, ["issue1"]);
  const entrySchema = dynamicSchema.properties.issue1;
  assert.equal(entrySchema.type, "object");
  assert.equal(entrySchema.additionalProperties, false);
  assert.deepEqual([...entrySchema.required].sort(), ["alternatives_reviewed", "available_alternative", "question_is_last_resort"]);

  const alternativesSchema = entrySchema.properties.alternatives_reviewed;
  assert.equal(alternativesSchema.type, "object");
  assert.equal(alternativesSchema.additionalProperties, false);
  assert.deepEqual([...alternativesSchema.required].sort(), ["condition", "decide", "estimate", "leave_unknown", "research", "scenario"]);

  for (const treatment of ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"]) {
    const alternativeSchema = alternativesSchema.properties[treatment];
    assert.equal(alternativeSchema.type, "object");
    assert.equal(alternativeSchema.additionalProperties, false);
    assert.deepEqual([...alternativeSchema.required].sort(), ["reason", "reasonably_available"]);
  }
});

// --- Fixtures génériques ------------------------------------------------------------------------------

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation structurelle de ${treatment} compte tenu des données reçues.` }
  ]));
}

function lastResortReview(issueId) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(null), question_is_last_resort: true, available_alternative: null };
}

function availableReview(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesReviewed(alternative), question_is_last_resort: false, available_alternative: alternative };
}

function illegitimateFinding(issueId, alternative) {
  return { issue_id: issueId, available_alternative: alternative, why_available: `Justification structurelle : ${alternative} permettait une progression utile pour ${issueId}.` };
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

function materialQuestionIssue(id) {
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null };
}

// --- Section 35 : sortie locale valide (4 reviews, mixte, disagree) -------------------------------

test("G3-9 : une sortie Critic locale valide (4 reviews, mixte true/false, disagree) passe le validateur et le scorer", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2"), materialQuestionIssue("issue3"), materialQuestionIssue("issue4")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    vetoes: [{ issue_id: "issue2", new_information_trigger: "Aucune information nouvelle ne permet de déduire la valeur manquante.", why_material: "Le point conditionne fortement la faisabilité.", why_not_substitutable: "Aucune donnée ne permet de le déduire sans le demander." }],
    question_substitution_review: [
      lastResortReview("issue1"),
      availableReview("issue2", "estimate"),
      availableReview("issue3", "scenario"),
      lastResortReview("issue4")
    ],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate"), illegitimateFinding("issue3", "scenario")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review.length, 4);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Section 30/36 : available_alternative_reason est structurellement rejeté ----------------------

test("G3-10 : une entrée question_substitution_review portant available_alternative_reason en plus est rejetée par le validateur (clé hors contrat)", () => {
  const invalidReview = { ...availableReview("issue1", "estimate"), available_alternative_reason: "estimate était la meilleure option disponible." };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [invalidReview],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

test("G3-11 : une clé hors contrat à l'intérieur d'une alternative individuelle (ex. sur estimate) est également rejetée", () => {
  const reviewed = alternativesReviewed("estimate");
  reviewed.estimate = { ...reviewed.estimate, available_alternative_reason: "Justification en trop." };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [{ issue_id: "issue1", alternatives_reviewed: reviewed, question_is_last_resort: false, available_alternative: "estimate" }],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), TypeError);
});

// --- Section 32 : non-régression sémantique S4 (substrings protégés) --------------------------------

test("G3-12 : le prompt conserve intégralement les substrings sémantiques S4 (progression utile, resolve/continue, calibrations, anti-biais)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /estimate=true si une valeur, une plage ou une hypothèse approximative/);
  assert.match(CRITIC_SYSTEM_PROMPT, /scenario=true si plusieurs variantes plausibles permettent d'avancer malgré l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /condition=true si une partie du travail peut être formulée sous la forme si X → \.\.\., sinon → \.\.\./);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown=true si l'inconnue peut rester explicitement ouverte/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais toutes vraies par défaut \(aucune des six n'est automatiquement disponible\), jamais toutes fausses par défaut/);
});

// --- Section 22/23 : S3 (question_review_targets/cardinalité) et S2-E (structure) intacts, mots-clés ---

// 3F.3.3-X2-A : "nombre de clés" (objet keyed-by-issue_id) remplace "nombre d'entrées" (tableau).
test("G3-13 : le prompt conserve intégralement le contrat S3 (question_review_targets, cardinalité exacte)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /question_review_targets est un TABLEAU fourni dans l'entrée de ce tour, précalculé mécaniquement/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le nombre de targets qu'elle contient fixe exactement le nombre de clés attendu dans question_substitution_review/);
});

// --- Section 37 : aucun mot métier de production dans le fichier partagé --------------------------

test("G3-14 : le fichier de production partagé ne contient aucun mot métier (Italie, voyage, budget, tourisme, case-12, sentinelle)", () => {
  const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const sharedCoreSource = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(sharedCoreSource, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
