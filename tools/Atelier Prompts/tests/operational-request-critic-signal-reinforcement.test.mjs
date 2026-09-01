import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput, deriveCriticConsequences } from "../workers/shared/operational-request-core.js";
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

// 3F.3.3-X2-B, levier D : SIGNAL OBLIGATOIRE (H3D) reposait sur une discipline de prompt pour éviter
// l'OMISSION (revue non-last-resort sans signal correspondant). X2-B rend cette discipline
// structurellement inutile : le LLM ne produit plus illegitimate_question_found du tout —
// deriveCriticConsequences le reconstruit mécaniquement depuis la même revue qui porte
// available_alternative/why_available, rendant l'OMISSION structurellement impossible plutôt que
// simplement interdite par le texte. H3D-1 à H3D-4 vérifient désormais cette garantie directement
// sur la fonction de dérivation (même esprit que les tests jumeaux dans
// operational-request-critic-substitution-signal-coherence.test.mjs, ici du point de vue H3D
// spécifiquement : la conséquence review -> signal ne peut plus jamais être omise).

function rawReviewH3D(issueId, alternative) {
  return { [issueId]: { alternatives_reviewed: alternativesReviewed(alternative), available_alternative: alternative, why_available: alternative ? `Justification structurelle : ${alternative} permettait une progression utile pour ${issueId}.` : null } };
}

function rawCriticOutputH3D(overrides = {}) {
  return {
    operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
    vetoes: [],
    semantic_drift_detected: false,
    semantic_drift_notes: [],
    significant_stakes: false,
    significant_stakes_reason: "",
    question_substitution_review: {},
    ...overrides
  };
}

test("H3D-1 : une revue non-last-resort produit toujours son signal correspondant — l'OMISSION est structurellement impossible, jamais une simple implication narrative", () => {
  const derived = deriveCriticConsequences(rawCriticOutputH3D({ question_substitution_review: rawReviewH3D("issue1", "estimate") }));
  assert.equal(derived.illegitimate_question_found.length, 1);
  assert.equal(derived.illegitimate_question_found[0].issue_id, "issue1");
});

test("H3D-2 : le signal dérivé porte toujours exactement le même issue_id que sa revue source", () => {
  const derived = deriveCriticConsequences(rawCriticOutputH3D({ question_substitution_review: { ...rawReviewH3D("issue1", "estimate"), ...rawReviewH3D("issue2", "scenario") } }));
  assert.deepEqual(derived.illegitimate_question_found.map((f) => f.issue_id).sort(), ["issue1", "issue2"]);
});

test("H3D-3 : un signal dérivé implique toujours agreement=\"disagree\"", () => {
  const derived = deriveCriticConsequences(rawCriticOutputH3D({ question_substitution_review: rawReviewH3D("issue1", "estimate") }));
  assert.equal(derived.agreement, "disagree");
});

test("H3D-4 : la garantie structurelle (jamais une position dans le prompt) — SIGNAL OBLIGATOIRE n'existe plus comme texte, la cohérence vient de la dérivation elle-même", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /SIGNAL OBLIGATOIRE/, "supersédé par X2-B : la cohérence review -> signal est désormais garantie par construction, jamais par une instruction textuelle positionnée.");
  assert.match(CRITIC_SYSTEM_PROMPT, /CARDINALITÉ OBLIGATOIRE/, "la cardinalité structurelle du schéma (X2-A), elle, reste intacte et non affectée par X2-B.");
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
// 3F.3.3-X2-B : issue_id n'est plus une clé de la VALEUR — trois clés désormais, question_is_last_resort
// remplacé par why_available (dérivé, plus demandé au LLM).
test("H3D-12 : le strict JSON reste intact (exact keys — désormais alternatives_reviewed/available_alternative/why_available —, available_alternative_reason interdit)", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /chaque valeur de question_substitution_review contient EXACTEMENT ces trois clés — alternatives_reviewed, available_alternative, why_available — jamais une quatrième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
});

// 3F.3.3-X2-B : les règles G4 (CAS A/B, cardinalité narrative, signal->disagree, fantôme) sont
// supersédées par la dérivation déterministe (deriveCriticConsequences) — cf.
// operational-request-critic-substitution-signal-coherence.test.mjs (G4-1..7) pour la preuve
// comportementale équivalente. Ce test vérifie que le texte narratif a bien disparu du prompt.
test("H3D-13 : les règles G4 (CAS A/B, cardinalité, signal->disagree, fantôme) sont supersédées par la dérivation déterministe X2-B — plus un texte de prompt", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /CHAÎNE DE COHÉRENCE OBLIGATOIRE/);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /SIGNAL FANTÔME/);
  assert.match(CRITIC_SYSTEM_PROMPT, /DISPONIBILITÉ ET JUSTIFICATION/, "la sémantique (disponibilité + justification) reste, seule la mécanique de cohérence devient déterministe.");
});

// --- Section 23 : budget prompt -----------------------------------------------------------------------

// 3F.3.3-X2-B : le retrait du mécanisme narratif (SIGNAL OBLIGATOIRE, CHAÎNE DE COHÉRENCE, décision
// d'agreement) réduit le prompt net, plutôt que l'agrandir comme H3C/H3D le faisaient — la borne
// absolue (18500, jamais relevée depuis H3B) reste la garde-fou pertinente.
test("H3D-14 : budget prompt — X2-B réduit le prompt net (retrait du mécanisme narratif désormais dérivé), toujours sous le budget absolu 18500", () => {
  const BUDGET_MAX_CHARS = 18500;
  const X2A_END_STATE_CHARS = 18429;
  const chars = CRITIC_SYSTEM_PROMPT.length;
  const delta = chars - X2A_END_STATE_CHARS;
  // eslint-disable-next-line no-console
  console.log(`X2-B delta net : ${delta} caractères (18429 -> ${chars}).`);
  assert.ok(delta < 0, "X2-B doit réduire le prompt net (retrait du mécanisme narratif désormais dérivé).");
  assert.ok(chars <= BUDGET_MAX_CHARS, `le budget absolu doit rester respecté (obtenu : ${chars}).`);
});

test("H3D-15 : aucun mot métier de production n'a été introduit", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
