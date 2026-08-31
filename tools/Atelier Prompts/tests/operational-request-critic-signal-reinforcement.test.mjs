import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput } from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-H3D : dernière incohérence comportementale observée après H3C — le smoke réel Critic-only
// sur la sentinelle sentinel-b01b-substitution est passé de "score.pass=false" (H3B, aucune review)
// à "valid_json=false / error_kind=json_error" (H3C), avec exactement l'erreur : "la revue de issue1
// conclut qu'une alternative est disponible (question_is_last_resort=false), mais aucune entrée
// correspondante n'existe dans illegitimate_question_found." Cette erreur, levée par
// validateCriticOutput lui-même, PROUVE empiriquement que H3C (cardinalité S3, N targets -> N
// reviews) et S4 (reconnaissance d'une alternative reasonably_available=true) fonctionnent
// désormais : le Critic a bien produit une review réelle pour issue1 avec question_is_last_resort=
// false. Le seul défaut restant est la conséquence review -> signal de G4 (CAS A / CORRESPONDANCE
// ET CARDINALITÉ), déjà correcte et complète textuellement, mais positionnée à plus de 2000
// caractères du squelette JSON de question_substitution_review (après CLÉS EXACTES et tout le bloc
// S4) — exactement le même phénomène de perte de saillance positionnelle que H3C a déjà corrigé
// pour la cardinalité S3. H3D n'ajoute AUCUNE nouvelle règle et ne touche à aucun bloc S3/S4/G3/G4
// existant : une seule phrase courte est insérée immédiatement après le renforcement de cardinalité
// H3C, donc juste après le squelette JSON de sortie. Coût mesuré : +230 caractères (cible <=300, max
// <=500) ; budget final 18301 caractères, toujours sous la borne H3B/H3C de 18500.
//
// Écart de déduplication déjà connu (mission G4 §18, jamais corrigé ici) : validateCriticOutput
// n'interdit toujours pas deux entrées illegitimate_question_found strictement identiques pour le
// même issue_id — H3D ne touche pas au validator, seulement au prompt ("EXACTEMENT une entrée" y
// reste une consigne adressée au LLM, jamais une garantie du validateur).

test("H3D-1 : le prompt affirme, immédiatement après le squelette de sortie, qu'une revue non-last-resort exige un signal (pas une simple implication narrative)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /SIGNAL OBLIGATOIRE/);
  assert.match(CRITIC_SYSTEM_PROMPT, /pour toute entrée à question_is_last_resort=false, illegitimate_question_found contient EXACTEMENT une entrée au même issue_id/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Une entrée non-last-resort sans ce signal est invalide/);
});

test("H3D-2 : le prompt exige explicitement le même issue_id entre le signal et la revue", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /illegitimate_question_found contient EXACTEMENT une entrée au même issue_id/);
});

test("H3D-3 : le prompt affirme explicitement que le signal implique agreement=\"disagree\"", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /illegitimate_question_found contient EXACTEMENT une entrée au même issue_id, et agreement="disagree"/);
});

test("H3D-4 : le renforcement est positionné immédiatement après CARDINALITÉ OBLIGATOIRE (H3C), avant la description d'alternatives_reviewed", () => {
  const cardinaliteIndex = CRITIC_SYSTEM_PROMPT.indexOf("CARDINALITÉ OBLIGATOIRE");
  const signalIndex = CRITIC_SYSTEM_PROMPT.indexOf("SIGNAL OBLIGATOIRE");
  const alternativesReviewedDescIndex = CRITIC_SYSTEM_PROMPT.indexOf("alternatives_reviewed est un OBJET à exactement ces six clés fixes");
  assert.ok(cardinaliteIndex !== -1 && signalIndex !== -1 && alternativesReviewedDescIndex !== -1);
  assert.ok(cardinaliteIndex < signalIndex, "SIGNAL OBLIGATOIRE doit suivre CARDINALITÉ OBLIGATOIRE.");
  assert.ok(signalIndex < alternativesReviewedDescIndex, "SIGNAL OBLIGATOIRE doit précéder la description d'alternatives_reviewed.");
  const distance = signalIndex - cardinaliteIndex;
  assert.ok(distance < 400, `SIGNAL OBLIGATOIRE doit rester immédiatement adjacent à CARDINALITÉ OBLIGATOIRE, donc proche du squelette de sortie (distance obtenue : ${distance} caractères).`);
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

// --- Section 14 : omission (review présente, signal manquant) -> validator reject (déjà couvert) ----

test("H3D-5 : review non-last-resort sans signal correspondant (omission, reproduit exactement le smoke H3C) reste rejetée par le validateur (inchangé)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: []
  });
  assert.throws(() => validateCriticOutput(output), /la revue de issue1 conclut qu'une alternative est disponible.*mais aucune entrée correspondante n'existe dans illegitimate_question_found/);
});

// --- Section 15 : signal correspondant -> validator + scorer pass -----------------------------------

test("H3D-6 : la même sortie complétée par le signal correspondant (même issue_id, agreement=disagree) passe le validateur et le scorer", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  assert.equal(result.illegitimate_question_found[0].issue_id, "issue1");
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Section 16 : mauvais issue_id -> validator reject (déjà couvert) --------------------------------

test("H3D-7 : un signal ciblant une issue différente de la revue non-last-resort reste rejeté (validateur inchangé)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), /illegitimate_question_found référence issue2 sans revue correspondante dans question_substitution_review/);
});

// --- Section 17 : signal fantôme (review last_resort=true) -> validator reject (déjà couvert) --------

test("H3D-8 : un signal pour une issue dont la revue conclut question_is_last_resort=true (signal fantôme) reste rejeté (validateur inchangé)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("issue1")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), /dont la revue conclut pourtant question_is_last_resort=true \(question légitime\)/);
});

// --- Section 18 : écart de déduplication — documenté, jamais corrigé ici ----------------------------

test("H3D-9 : ÉCART DOCUMENTÉ (hors périmètre H3D, validateur non modifié) — deux signaux identiques pour la même issue non-last-resort ne sont toujours pas rejetés", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate"), illegitimateFinding("issue1", "estimate")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 2, "comportement actuel inchangé depuis G4 : le doublon passe toujours ; ce test documente l'écart sans le corriger.");
});

// --- Section 19 : non-régression H3C (cardinalité N targets -> N reviews, [] uniquement si vide) ----

// 3F.3.3-X2-A : le renforcement narratif H3C (comptage textuel "N targets -> N entrées") est
// remplacé par l'application structurelle du schéma dynamique — cf. commentaire équivalent dans
// operational-request-critic-cardinality-reinforcement.test.mjs. H3D-10 vérifie désormais que ce
// remplacement est effectif et toujours positionné au même endroit (immédiatement avant SIGNAL
// OBLIGATOIRE, cf. H3D-4 ci-dessus, positionnellement inchangé).
test("H3D-10 : le mécanisme de cardinalité (désormais structurel, X2-A) reste intact et positionné juste avant SIGNAL OBLIGATOIRE", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /CARDINALITÉ OBLIGATOIRE/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le schéma impose déjà mécaniquement une clé exactement par élément de question_review_targets/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Si question_review_targets est vide, cette propriété est absente de votre réponse/);
});

// --- Section 20/21/22 : non-régression S4/G3/G4 (fragments porteurs inchangés) ----------------------

test("H3D-11 : la calibration S4 de reasonably_available reste intacte", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  for (const alternative of ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"]) {
    assert.match(CRITIC_SYSTEM_PROMPT, new RegExp(alternative));
  }
});

// 3F.3.3-X2-A : issue_id n'est plus une clé de la VALEUR (il est désormais la clé de l'objet
// question_substitution_review lui-même) — la liste "clés exactes" passe donc de quatre à trois.
test("H3D-12 : le strict JSON G3 reste intact (exact keys — désormais trois, issue_id étant la clé —, available_alternative_reason interdit)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /chaque valeur de question_substitution_review contient EXACTEMENT ces trois clés — alternatives_reviewed, question_is_last_resort, available_alternative — jamais une quatrième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
});

test("H3D-13 : les règles G4 existantes (CAS A/B, cardinalité, signal->disagree, fantôme) restent intactes — H3D les rend seulement plus saillantes positionnellement", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /CHAÎNE DE COHÉRENCE OBLIGATOIRE/);
  assert.match(CRITIC_SYSTEM_PROMPT, /illegitimate_question_found contient EXACTEMENT un signal.*pour ce même issue_id/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Une revue à question_is_last_resort=false SANS le signal correspondant dans illegitimate_question_found est une sortie invalide \(OMISSION\)/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Un signal illegitimate_question_found référençant une issue dont la revue conclut question_is_last_resort=true est un SIGNAL FANTÔME/);
  assert.match(CRITIC_SYSTEM_PROMPT, /si illegitimate_question_found est non vide, agreement doit être "disagree"/);
});

// --- Section 23 : budget prompt -----------------------------------------------------------------------

test("H3D-14 : budget prompt — ajout net mesuré et borné, budget final sous 18500 caractères (borne non relevée)", () => {
  const H3C_END_STATE_CHARS = 18071;
  const BUDGET_MAX_CHARS = 18500;
  const chars = CRITIC_SYSTEM_PROMPT.length;
  const added = chars - H3C_END_STATE_CHARS;
  // eslint-disable-next-line no-console
  console.log(`H3D ajout net : ${added} caractères (18071 -> ${chars}).`);
  assert.ok(added > 0, "H3D doit ajouter du texte (le renforcement lui-même).");
  assert.ok(added <= 500, `l'ajout net ne doit jamais dépasser 500 caractères (obtenu : ${added}).`);
  assert.ok(chars <= BUDGET_MAX_CHARS, `le budget final doit rester sous ${BUDGET_MAX_CHARS} caractères, jamais relevé (obtenu : ${chars}).`);
});

test("H3D-15 : aucun mot métier de production n'a été introduit", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
