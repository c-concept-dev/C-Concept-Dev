import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput } from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-S4 : la preuve empirique post-S3 (sentinelle sentinel-b01b-substitution, smoke Groq réel)
// a montré que S3 corrige bien l'OMISSION (le Critic produit désormais une revue par target), mais
// que le Critic conclut encore les six alternatives à false pour les 4 issues, alors qu'un contre-
// audit sémantique indépendant juge plusieurs alternatives réellement disponibles pour chacune. Le
// diagnostic retenu : le prompt ne définissait jamais explicitement reasonably_available, laissant
// le Critic interpréter implicitement "l'alternative peut-elle produire la VRAIE valeur manquante ?"
// au lieu de "l'alternative permet-elle de poursuivre utilement le travail sans demander
// immédiatement à l'utilisateur ?". S4 ajoute exclusivement cette définition et la calibration des
// six alternatives au CRITIC_SYSTEM_PROMPT — aucune structure, aucun schema, aucun validator, aucun
// scorer n'est modifié. Ce fichier ne teste que le texte du prompt (statiquement) et le contrat
// existant (validateur/scorer, tous deux inchangés) sur des fixtures génériques, jamais un mot
// métier de production (Italie, voyage, budget, dates, durée, tourisme, case-12,
// sentinel-b01b-substitution).

// --- Section 29 : le principe central (pas besoin de résoudre définitivement) --------------------

test("S4-1 : le prompt affirme explicitement qu'une alternative n'a jamais besoin de résoudre définitivement l'inconnue pour être disponible", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /n'a JAMAIS besoin d'être définitive, certaine, optimale, de résoudre entièrement l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais seulement parce qu'elle ne détermine pas la vraie valeur manquante/);
});

// --- Section 30 : progression utile sans question immédiate ---------------------------------------

test("S4-2 : le prompt définit reasonably_available=true par la notion de progression utile sans demande immédiate à l'utilisateur", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /reasonably_available=true/);
  assert.match(CRITIC_SYSTEM_PROMPT, /reasonably_available=false uniquement si l'alternative ne permet réellement aucune progression utile/);
});

// --- Section 31 : estimate recalibré ---------------------------------------------------------------

test("S4-3 : estimate est défini comme approximation/hypothèse de travail, jamais présentée comme le fait utilisateur réel", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /estimate=true si une valeur, une plage ou une hypothèse approximative peut servir de base de travail utile, explicitement présentée comme une estimation/);
  assert.match(CRITIC_SYSTEM_PROMPT, /une estimation n'a jamais besoin d'être la vraie valeur utilisateur/);
});

// --- Section 32 : scenario recalibré ----------------------------------------------------------------

test("S4-4 : scenario est défini comme disponible précisément quand le contexte exact n'est pas connu", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /scenario=true si plusieurs variantes plausibles permettent d'avancer malgré l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /un scenario ne suppose jamais que le contexte exact soit déjà connu/);
  assert.match(CRITIC_SYSTEM_PROMPT, /représenter plusieurs contextes possibles/);
});

// --- Section 33 : condition recalibrée --------------------------------------------------------------

test("S4-5 : condition permet une réponse utile sous conditions sans résoudre immédiatement l'inconnue", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /condition=true si une partie du travail peut être formulée sous la forme si X → \.\.\., sinon → \.\.\., à ajuster lorsque l'information sera connue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /l'inconnue peut rester non résolue tout en permettant dès maintenant une réponse conditionnelle utile/);
});

// --- Section 34 : leave_unknown, le point le plus mal compris --------------------------------------

test("S4-6 : leave_unknown signifie garder l'inconnue ouverte et continuer ce qui peut être fait malgré elle, jamais qu'elle disparaît", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown=true si l'inconnue peut rester explicitement ouverte sans empêcher la production d'un premier travail utile/);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown ne signifie jamais que l'inconnue disparaît/);
  assert.match(CRITIC_SYSTEM_PROMPT, /elle est conservée comme inconnue pendant que le reste avance/);
});

// --- Section 35 : decide recalibré --------------------------------------------------------------------

test("S4-7 : decide est une option de travail réversible, jamais présentée comme un fait utilisateur réel", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /decide=true si le système peut raisonnablement retenir, pour avancer, une option de travail réversible, explicite et jamais présentée comme un fait utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /decide n'est jamais l'invention d'un fait personnel présenté comme réel/);
});

// --- Section 9 (recalibration research, non-régression du principe C1 côté Analyste ≠ ici Critic) --

test("S4 : research reste restreint aux sources externes pertinentes, jamais une préférence personnelle de l'utilisateur", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /research=true uniquement si l'information manquante peut réellement être obtenue ou approximée par une source externe pertinente/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais pour "rechercher" une préférence strictement personnelle que seul l'utilisateur peut fournir/);
});

// --- Section 16 : pas de biais inverse --------------------------------------------------------------

test("S4-biais : le prompt interdit explicitement le biais inverse (tout disponible par défaut) autant que le biais initial", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais toutes vraies par défaut \(aucune des six n'est automatiquement disponible\), jamais toutes fausses par défaut/);
  // 3F.3.3-X2-B : question_is_last_resort n'est plus nommé dans le prompt (dérivé).
  assert.match(CRITIC_SYSTEM_PROMPT, /Une question reste pleinement légitime et attendue chaque fois que les six alternatives sont réellement incapables de permettre une quelconque progression utile/);
  // Propriété négative : aucune règle de disponibilité automatique et inconditionnelle par nom d'alternative.
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /leave_unknown est toujours disponible/i);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /scenario est toujours disponible/i);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /toujours\s+disagree/i);
});

// --- Section 39 : aucun mot métier de production dans le fichier partagé ---------------------------

test("S4-8 : le fichier de production partagé ne contient aucun mot métier (Italie, voyage, budget, tourisme, case-12, sentinelle)", () => {
  const sharedCorePath = fileURLToPath(new URL("../workers/shared/operational-request-core.js", import.meta.url));
  const sharedCoreSource = fs.readFileSync(sharedCorePath, "utf8");
  assert.doesNotMatch(sharedCoreSource, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});

// --- Fixtures génériques : construction --------------------------------------------------------------

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function allFalseAlternatives() {
  return Object.fromEntries(LADDER.map((treatment) => [treatment, { reasonably_available: false, reason: `Aucune progression utile identifiée via ${treatment} compte tenu des données reçues.` }]));
}

function alternativesWithOneAvailable(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: treatment === availableTreatment ? `${treatment} permet une progression utile provisoire sur ce point.` : `${treatment} ne permet aucune progression utile ici.` }
  ]));
}

function lastResortReview(issueId) {
  return { issue_id: issueId, alternatives_reviewed: allFalseAlternatives(), question_is_last_resort: true, available_alternative: null };
}

function availableReview(issueId, alternative) {
  return { issue_id: issueId, alternatives_reviewed: alternativesWithOneAvailable(alternative), question_is_last_resort: false, available_alternative: alternative };
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
  return { id, type: "missing_information", description: "Une information nécessaire au livrable n'est pas fournie et aucune alternative ne permet d'avancer utilement.", impact: "material", substitutable: false, recommended_treatment: "question", kind: null };
}

// --- Section 36 : une vraie question dernier recours reste structurellement valide ------------------

test("S4-9 : six alternatives false + question_is_last_resort=true + agree reste structurellement valide (vraie question dernier recours protégée)", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({ question_substitution_review: [lastResortReview("ISSUE-1")] });
  const result = validateCriticOutput(output);
  assert.equal(result.question_substitution_review[0].question_is_last_resort, true);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "S4 ne doit jamais rendre impossible une vraie question dernier recours.");
});

// --- Section 37 : plusieurs questions légitimes simultanées, aucun plafond -------------------------

test("S4-10 : plusieurs targets concluent chacune six alternatives false -> plusieurs last_resort=true, aucun signal, agree accepté", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1"), materialQuestionIssue("ISSUE-2"), materialQuestionIssue("ISSUE-3"), materialQuestionIssue("ISSUE-4")] };
  const output = minimalCriticOutput({
    question_substitution_review: [lastResortReview("ISSUE-1"), lastResortReview("ISSUE-2"), lastResortReview("ISSUE-3"), lastResortReview("ISSUE-4")]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true, "plusieurs questions légitimes simultanées ne doivent jamais, à elles seules, faire échouer le score — aucun plafond quantitatif.");
});

// --- Section 38 : fixture S4-compliant générique — une alternative réellement disponible ------------

test("S4-11 : une issue avec estimate raisonnablement disponible -> signal, disagree, score pass (recalibration effective)", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("ISSUE-1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("ISSUE-1", "estimate")]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

test("S4-12 : une issue avec scenario raisonnablement disponible -> signal, disagree, score pass", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("ISSUE-1", "scenario")],
    illegitimate_question_found: [illegitimateFinding("ISSUE-1", "scenario")]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

test("S4-13 : une issue avec leave_unknown raisonnablement disponible -> signal, disagree, score pass", () => {
  const analystOutput = { issues: [materialQuestionIssue("ISSUE-1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("ISSUE-1", "leave_unknown")],
    illegitimate_question_found: [illegitimateFinding("ISSUE-1", "leave_unknown")]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});
