import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput, deriveCriticConsequences } from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-G4 : le smoke réel post-G3 (sentinelle sentinel-b01b-substitution) a montré que G3 a bien
// résolu le défaut JSON strict (HTTP 400 disparu, le JSON atteint désormais le validateur), mais que
// le Critic ne tire pas systématiquement, pour chaque issue où il vient lui-même de conclure
// reasonably_available=true / question_is_last_resort=false, la conséquence contractuelle attendue :
// un signal correspondant dans illegitimate_question_found, avec agreement="disagree". Le validateur
// a détecté ce défaut correctement (json_error : "aucune entrée correspondante n'existe dans
// illegitimate_question_found") — il n'a donc jamais été contourné ni affaibli. Le problème n'est ni
// sémantique (S4 reste inchangé), ni JSON syntaxique (G3 reste inchangé), ni un défaut de contrat
// (le validateur applique déjà cette cohérence) : c'est une adhérence comportementale insuffisamment
// impérative dans le prompt. G4 ajoute donc exclusivement une section explicite, labellisée CAS A /
// CAS B, au CRITIC_SYSTEM_PROMPT — aucune structure, aucun schema, aucun validateur, aucun scorer
// n'est modifié. Ce fichier prouve le nouveau texte de prompt et documente, sans les corriger
// (hors périmètre G4), les invariants déjà couverts et le seul écart réel trouvé dans le validateur
// existant (absence de détection de doublon exact au sein de illegitimate_question_found — mission
// §35 : ne jamais modifier le validateur pour combler cet écart, seulement le rapporter).

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

function illegitimateFinding(issueId, alternative, overrides = {}) {
  return { issue_id: issueId, available_alternative: alternative, why_available: `Justification structurelle : ${alternative} permettait une progression utile pour ${issueId}.`, ...overrides };
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

// 3F.3.3-X2-B, levier D : la CHAÎNE DE COHÉRENCE OBLIGATOIRE (CAS A/CAS B, SIGNAL OBLIGATOIRE,
// OMISSION/CONTRADICTION/SIGNAL FANTÔME, décision d'agreement) que G4 ajoutait au prompt est
// entièrement retirée — le LLM ne produit plus question_is_last_resort, illegitimate_question_found
// ni agreement : deriveCriticConsequences (workers/shared/operational-request-core.js) les calcule
// mécaniquement à partir de alternatives_reviewed/available_alternative/why_available (que le LLM
// fournit toujours) et de vetoes/semantic_drift_detected/missed_material_issues. G4-1 à G4-7
// vérifient désormais ces propriétés au niveau de la fonction de dérivation elle-même : OMISSION et
// SIGNAL FANTÔME deviennent structurellement IMPOSSIBLES à produire (il n'existe plus de deuxième
// structure susceptible de diverger), plutôt que des erreurs détectées a posteriori par le
// validateur. G4-8 à G4-15 (validateCriticOutput direct, sortie déjà normalisée) restent inchangés
// et continuent de documenter le comportement du validateur, lui-même non modifié par X2-B.

function rawReview(issueId, alternative, whyAvailable) {
  return { [issueId]: { alternatives_reviewed: alternativesReviewed(alternative), available_alternative: alternative, why_available: alternative ? whyAvailable ?? `Justification structurelle : ${alternative} permettait une progression utile pour ${issueId}.` : null } };
}

function rawCriticOutput(overrides = {}) {
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

test("G4-1 : une revue non-last-resort produit toujours exactement un signal correspondant dans illegitimate_question_found dérivé (OMISSION structurellement impossible)", () => {
  const raw = rawCriticOutput({ question_substitution_review: rawReview("issue1", "estimate") });
  const derived = deriveCriticConsequences(raw);
  assert.equal(derived.illegitimate_question_found.length, 1);
  assert.equal(derived.illegitimate_question_found[0].issue_id, "issue1");
  assert.equal(derived.illegitimate_question_found[0].available_alternative, "estimate");
});

test("G4-2 : illegitimate_question_found dérivé non vide implique toujours agreement=disagree ; vide et tout le reste propre implique agree", () => {
  const withSignal = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: rawReview("issue1", "estimate") }));
  assert.equal(withSignal.agreement, "disagree");
  const withoutSignal = deriveCriticConsequences(rawCriticOutput({ question_substitution_review: rawReview("issue1", null) }));
  assert.equal(withoutSignal.agreement, "agree");
});

test("G4-3 : la cardinalité N revues non-last-resort -> N signaux est garantie par construction (boucle sur les revues réellement présentes)", () => {
  const raw = rawCriticOutput({
    question_substitution_review: {
      ...rawReview("issue1", "estimate"),
      ...rawReview("issue2", "scenario"),
      ...rawReview("issue3", null),
      ...rawReview("issue4", "research")
    }
  });
  const derived = deriveCriticConsequences(raw);
  assert.equal(derived.illegitimate_question_found.length, 3, "issue1/issue2/issue4 disponibles -> 3 signaux ; issue3 last-resort -> aucun.");
  assert.deepEqual(derived.illegitimate_question_found.map((f) => f.issue_id).sort(), ["issue1", "issue2", "issue4"]);
});

test("G4-4 : chaque signal dérivé désigne exactement l'issue_id de sa revue source, jamais un regroupement", () => {
  const raw = rawCriticOutput({ question_substitution_review: { ...rawReview("issue1", "estimate"), ...rawReview("issue2", "scenario") } });
  const derived = deriveCriticConsequences(raw);
  const byId = new Map(derived.illegitimate_question_found.map((f) => [f.issue_id, f]));
  assert.equal(byId.get("issue1").available_alternative, "estimate");
  assert.equal(byId.get("issue2").available_alternative, "scenario");
});

test("G4-5 : la CONTRADICTION (non-last-resort sans signal) est structurellement impossible à produire — le signal est dérivé de la même revue, jamais une structure séparée", () => {
  const raw = rawCriticOutput({ question_substitution_review: rawReview("issue1", "estimate") });
  const derived = deriveCriticConsequences(raw);
  // Il n'existe aucun moyen d'obtenir available_alternative non-null sans que le signal correspondant
  // soit également présent : les deux proviennent de la même boucle, sur la même entrée source.
  assert.equal(derived.question_substitution_review[0].available_alternative, "estimate");
  assert.equal(derived.illegitimate_question_found.length, 1);
});

test("G4-6 : le SIGNAL FANTÔME (signal pour une issue last-resort) est structurellement impossible — aucun signal n'est créé si question_is_last_resort dérivé est vrai", () => {
  const raw = rawCriticOutput({ question_substitution_review: rawReview("issue1", null) });
  const derived = deriveCriticConsequences(raw);
  assert.equal(derived.question_substitution_review[0].question_is_last_resort, true);
  assert.equal(derived.illegitimate_question_found.length, 0);
});

test("G4-7 : deriveCriticConsequences ne redéfinit jamais QUAND une alternative est disponible — alternatives_reviewed traverse la dérivation inchangé, aucun biais sémantique S4", () => {
  const alternatives = alternativesReviewed("estimate");
  const raw = rawCriticOutput({ question_substitution_review: { issue1: { alternatives_reviewed: alternatives, available_alternative: "estimate", why_available: "x" } } });
  const derived = deriveCriticConsequences(raw);
  assert.deepEqual(derived.question_substitution_review[0].alternatives_reviewed, alternatives, "alternatives_reviewed doit traverser la dérivation strictement inchangé (aucun jugement recalculé).");
});

// --- Section 32 : ZERO SIGNAL sur une review non-last-resort -> invalid (déjà couvert par le validateur) ---

test("G4-8 : une review non-last-resort sans signal correspondant (illegitimate_question_found=[]) est rejetée par le validateur existant (OMISSION, déjà couvert, non modifié)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: []
  });
  assert.throws(() => validateCriticOutput(output), /question_substitution_review : la revue de issue1 conclut qu'une alternative est disponible.*mais aucune entrée correspondante n'existe dans illegitimate_question_found/);
});

// --- Section 33 : le signal correspondant fait passer le validateur ------------------------------------

test("G4-9 : la même sortie complétée par le signal correspondant passe le validateur et le scorer", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Section 34 : signal sur la mauvaise issue -> rejeté (déjà couvert par le validateur) ---------------

test("G4-10 : un signal ciblant une issue différente de la revue non-last-resort est rejeté (déjà couvert, non modifié)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), /illegitimate_question_found référence issue2 sans revue correspondante dans question_substitution_review/);
});

// --- Section 35 : doublon de signal pour la même issue — ÉCART DOCUMENTÉ, validateur NON modifié --------

test("G4-11 : ÉCART DOCUMENTÉ (hors périmètre G4, validateur non modifié) — deux signaux identiques pour la même issue non-last-resort ne sont PAS rejetés par le validateur actuel", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate"), illegitimateFinding("issue1", "estimate")]
  });
  // Ce test documente fidèlement le comportement ACTUEL (aucune assertion de rejet dans
  // validateCriticOutput sur les issue_id en double au sein de illegitimate_question_found, à la
  // différence de question_substitution_review qui, lui, l'interdit explicitement). Mission §35 :
  // ne jamais modifier le validateur pour combler cet écart en G4 — seulement le rapporter.
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 2, "comportement actuel : le doublon passe ; ceci n'est PAS une assertion de correction, seulement une preuve de l'écart existant, rapporté sans modification du validateur.");
});

// --- Section 36 : signal fantôme sur une review last_resort=true -> rejeté (déjà couvert) ----------------

test("G4-12 : un signal ciblant une issue dont la revue conclut question_is_last_resort=true est rejeté (déjà couvert par le validateur, non modifié)", () => {
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("issue1")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), /dont la revue conclut pourtant question_is_last_resort=true \(question légitime\)/);
});

// --- Section 37 : contradiction signal non vide + agreement=agree -> rejeté (déjà couvert) ----------------

test("G4-13 : illegitimate_question_found non vide avec agreement=agree est rejeté (déjà couvert par le validateur, non modifié)", () => {
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  assert.throws(() => validateCriticOutput(output), /agreement=agree exige illegitimate_question_found vide/);
});

// --- Section 38 : toutes last-resort, agree, pass ----------------------------------------------------------

test("G4-14 : toutes les issues concluent last_resort=true, aucun signal, agree -> validateur et scorer pass", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2"), materialQuestionIssue("issue3"), materialQuestionIssue("issue4")] };
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [lastResortReview("issue1"), lastResortReview("issue2"), lastResortReview("issue3"), lastResortReview("issue4")],
    illegitimate_question_found: []
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Section 39 : cas mixte — une last_resort=true, une last_resort=false -----------------------------

test("G4-15 : cas mixte (une last_resort=true, une last_resort=false) — signal uniquement pour la non-last-resort, disagree, pass", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("issue1"), availableReview("issue2", "scenario")],
    illegitimate_question_found: [illegitimateFinding("issue2", "scenario")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  assert.equal(result.illegitimate_question_found[0].issue_id, "issue2");
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});
