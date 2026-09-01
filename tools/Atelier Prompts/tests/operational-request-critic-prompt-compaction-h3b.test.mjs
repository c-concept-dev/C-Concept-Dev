import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput } from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-H3B : continuation strictement technique de H3. Preuve empirique décisive — le smoke réel
// post-H3 (sentinelle sentinel-b01b-substitution) est passé de "Requested 8549 tokens" (pré-H3) à
// "Requested 8086 tokens" (post-H3), pour une limite provider de 8000 : gain réel de 463 tokens, il
// manquait seulement 86 tokens pour franchir la limite. H3B vise une marge réelle (cible <= 7500,
// minimum acceptable <= 7700), jamais 7999.
//
// Diagnostic retenu (avant code) : H3 avait déjà retiré toute la redondance de PHRASES ENTIÈRES
// (restatements complets d'une même règle à deux endroits). Il restait cependant, à l'intérieur même
// des clauses porteuses S3/S4/G3/G4, de la glue non testée — des mots de liaison, parenthèses
// explicatives et queues de phrase qu'aucune des 106 assertions littérales existantes ne couvre
// (chaque assertion ne pinant qu'un FRAGMENT de phrase, jamais la phrase entière). En cartographiant
// précisément la frontière exacte de chaque assertion existante contre le texte réel du prompt, il a
// été possible de retirer cette glue interne sans qu'un seul test préexistant n'ait besoin d'être
// modifié : toutes les clauses porteuses listées dans la mission (S3 cardinalité, S4 définition +
// six calibrations + anti-biais, G3 clés exactes + interdiction available_alternative_reason, G4
// CAS A/CAS B/CORRESPONDANCE ET CARDINALITÉ/AGREEMENT) restent représentées par les MÊMES fragments
// littéraux exacts qu'avant H3B — seule la prose qui les relie a été resserrée. Le seul test
// historique modifié est le budget statique H3-2 (borne numérique abaissée, geste explicitement
// prévu par la mission H3B §11 — jamais une perte de couverture, seulement un seuil plus strict).
// Aucun mot métier de production n'est introduit.

// Mesure exacte de CRITIC_SYSTEM_PROMPT à la fin de H3 (589ddcb refactor(critic): compact prompt for
// provider budget, baseline officielle H3B 4c1360ed309935da2b7ce7c90dd133de944effd1) : chars=19929,
// bytes=20449, words=2634. Documentée en dur pour la même raison qu'en H3 (§18) : ce commit n'est
// plus le HEAD une fois H3B committé.
const H3_END_STATE_CHARS = 19929;
const H3_END_STATE_BYTES = 20449;
const H3_END_STATE_WORDS = 2634;

// Ratio empirique observé par la mission (§12) entre réduction de caractères et gain réel de tokens
// Groq lors du smoke H3 : -2161 caractères -> -463 tokens, soit ~4,67 caractères / token économisé.
const H3_CHARS_PER_TOKEN_OBSERVED = 2161 / 463;

test("H3B-1 : mesure déterministe avant/après — réduction absolue et relative depuis la fin de H3", () => {
  const chars = CRITIC_SYSTEM_PROMPT.length;
  const bytes = Buffer.byteLength(CRITIC_SYSTEM_PROMPT, "utf8");
  const words = CRITIC_SYSTEM_PROMPT.split(/\s+/).filter(Boolean).length;
  const reductionChars = H3_END_STATE_CHARS - chars;
  const reductionPct = (100 * reductionChars) / H3_END_STATE_CHARS;
  const estimatedTokenGain = reductionChars / H3_CHARS_PER_TOKEN_OBSERVED;
  // eslint-disable-next-line no-console
  console.log(`H3B compaction : ${H3_END_STATE_CHARS} -> ${chars} chars (-${reductionChars}, -${reductionPct.toFixed(1)}%), ${H3_END_STATE_BYTES} -> ${bytes} bytes, ${H3_END_STATE_WORDS} -> ${words} mots, gain tokens estimé (ratio H3 observé) ≈ ${estimatedTokenGain.toFixed(0)}.`);
  assert.ok(chars < H3_END_STATE_CHARS, "le prompt doit être strictement plus court qu'à la fin de H3.");
  assert.ok(reductionChars >= 1500, `réduction supplémentaire attendue >= 1500 caractères par rapport à H3 (obtenu : ${reductionChars}).`);
  assert.ok(bytes < H3_END_STATE_BYTES, "la taille en octets doit également diminuer.");
  assert.ok(words < H3_END_STATE_WORDS, "le nombre de mots doit également diminuer.");
});

// --- Clauses porteuses S3 : présentes, fragments littéraux inchangés depuis avant H3B ---------------

// 3F.3.3-X2-A : question_substitution_review est désormais un objet keyed-by-issue_id (cardinalité
// structurelle, cf. buildQuestionSubstitutionReviewSchema), plus un tableau d'entrées comptées
// narrativement — les assertions ci-dessous sont mises à jour pour la nouvelle formulation, à
// contenu équivalent (même lien à question_review_targets, même absence structurelle quand vide).
test("H3B-2 : les clauses porteuses S3 (une clé par target, cardinalité exacte) restent représentées", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /question_review_targets est un TABLEAU fourni dans l'entrée de ce tour, précalculé mécaniquement/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le nombre de targets qu'elle contient fixe exactement le nombre de clés attendu dans question_substitution_review/);
  assert.match(CRITIC_SYSTEM_PROMPT, /nombre de clés attendu dans question_substitution_review est exactement égal au nombre d'éléments/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /Si question_review_targets est vide.{0,200}question_substitution_review est alors absent de votre réponse/is);
  assert.match(CRITIC_SYSTEM_PROMPT, /une clé exactement par élément de question_review_targets/);
  assert.match(CRITIC_SYSTEM_PROMPT, /interdit mécaniquement toute clé absente de question_review_targets ou manquante par rapport à lui/);
});

// --- Clauses porteuses S4 : définition + six calibrations + anti-biais --------------------------------

test("H3B-3 : les clauses porteuses S4 (définition, resolve/continue, six alternatives, anti-biais) restent représentées", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /n'a JAMAIS besoin d'être définitive, certaine, optimale, de résoudre entièrement l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /reasonably_available=false uniquement si l'alternative ne permet réellement aucune progression utile/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais seulement parce qu'elle ne détermine pas la vraie valeur manquante/);
  for (const alternative of ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"]) {
    assert.match(CRITIC_SYSTEM_PROMPT, new RegExp(alternative), `${alternative} doit rester présent littéralement.`);
  }
  assert.match(CRITIC_SYSTEM_PROMPT, /research=true uniquement si l'information manquante peut réellement être obtenue ou approximée par une source externe pertinente/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais pour "rechercher" une préférence strictement personnelle que seul l'utilisateur peut fournir/);
  assert.match(CRITIC_SYSTEM_PROMPT, /decide=true si le système peut raisonnablement retenir, pour avancer, une option de travail réversible, explicite et jamais présentée comme un fait utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /decide n'est jamais l'invention d'un fait personnel présenté comme réel/);
  assert.match(CRITIC_SYSTEM_PROMPT, /estimate=true si une valeur, une plage ou une hypothèse approximative peut servir de base de travail utile, explicitement présentée comme une estimation/);
  assert.match(CRITIC_SYSTEM_PROMPT, /une estimation n'a jamais besoin d'être la vraie valeur utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /scenario=true si plusieurs variantes plausibles permettent d'avancer malgré l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /un scenario ne suppose jamais que le contexte exact soit déjà connu/);
  assert.match(CRITIC_SYSTEM_PROMPT, /représenter plusieurs contextes possibles/);
  assert.match(CRITIC_SYSTEM_PROMPT, /condition=true si une partie du travail peut être formulée sous la forme si X → \.\.\., sinon → \.\.\., à ajuster lorsque l'information sera connue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /l'inconnue peut rester non résolue tout en permettant dès maintenant une réponse conditionnelle utile/);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown=true si l'inconnue peut rester explicitement ouverte sans empêcher la production d'un premier travail utile/);
  assert.match(CRITIC_SYSTEM_PROMPT, /leave_unknown ne signifie jamais que l'inconnue disparaît/);
  assert.match(CRITIC_SYSTEM_PROMPT, /elle est conservée comme inconnue pendant que le reste avance/);
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais toutes vraies par défaut \(aucune des six n'est automatiquement disponible\), jamais toutes fausses par défaut/);
  // 3F.3.3-X2-B : question_is_last_resort n'est plus nommé dans le prompt (dérivé) — la garantie
  // sémantique équivalente ("une question reste légitime si les six alternatives échouent") demeure.
  assert.match(CRITIC_SYSTEM_PROMPT, /Une question reste pleinement légitime et attendue chaque fois que les six alternatives sont réellement incapables de permettre une quelconque progression utile/);
});

// --- Clauses porteuses G3 : exact keys + interdiction available_alternative_reason -------------------

// 3F.3.3-X2-A : issue_id devient la clé de l'objet (plus un champ de la valeur) — la liste "clés
// exactes" passe de quatre à trois.
test("H3B-4 : les clauses porteuses G3 (exact keys — désormais alternatives_reviewed/available_alternative/why_available —, available_alternative_reason interdit, routage justification) restent représentées", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /chaque valeur de question_substitution_review contient EXACTEMENT ces trois clés — alternatives_reviewed, available_alternative, why_available — jamais une quatrième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /alternatives_reviewed contient EXACTEMENT ces six clés — research, decide, estimate, scenario, condition, leave_unknown — jamais une septième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Chaque alternative individuelle \(chacune des six\) contient EXACTEMENT ces deux clés — reasonably_available, reason — jamais une autre/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
  assert.match(CRITIC_SYSTEM_PROMPT, /l'explication de pourquoi une alternative est disponible vit exclusivement dans alternatives_reviewed\.<alternative>\.reason, jamais ailleurs, jamais dupliquée dans un champ séparé/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le reason déjà présent dans alternatives_reviewed\.<alternative correspondante>\.reason est la seule et unique explication de la disponibilité de cette alternative/);
  assert.match(CRITIC_SYSTEM_PROMPT, /why_available porte une justification distincte, propre à la question elle-même/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez jamais available_alternative_reason, ni aucune autre clé absente du schéma, à question_substitution_review/);
});

// --- Clauses porteuses G4 : CAS A/B, cardinalité N->N, signal->disagree, pas de fantôme --------------

// 3F.3.3-X2-B : les clauses porteuses G4 (CAS A/B, cardinalité narrative, signal->disagree, pas de
// fantôme) sont entièrement supersédées par deriveCriticConsequences — cf.
// operational-request-critic-substitution-signal-coherence.test.mjs (G4-1..7) pour la preuve
// comportementale. Ce test vérifie que le texte narratif a disparu et que la sémantique
// (disponibilité + justification) demeure.
test("H3B-5 : les clauses G4 (CAS A/B, cardinalité, signal->disagree, pas de fantôme) sont supersédées par la dérivation déterministe X2-B", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /CHAÎNE DE COHÉRENCE OBLIGATOIRE/);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /SIGNAL FANTÔME/);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /Décidez agreement en dernier/);
  assert.match(CRITIC_SYSTEM_PROMPT, /DISPONIBILITÉ ET JUSTIFICATION/);
});

// --- Comportement local inchangé (mission §10) : mêmes acceptations/rejets qu'avant H3B --------------

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

test("H3B-6 : extra field toujours rejeté", () => {
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [{ ...availableReview("issue1", "estimate"), available_alternative_reason: "en trop" }],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  })), TypeError);
});

test("H3B-7 : missing signal (omission) toujours rejeté", () => {
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: []
  })), /aucune entrée correspondante n'existe dans illegitimate_question_found/);
});

test("H3B-8 : wrong issue signal toujours rejeté", () => {
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  })), /sans revue correspondante dans question_substitution_review/);
});

test("H3B-9 : phantom signal toujours rejeté", () => {
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("issue1")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  })), /dont la revue conclut pourtant question_is_last_resort=true \(question légitime\)/);
});

test("H3B-10 : valid substitution output toujours accepté (validator + scorer pass)", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

test("H3B-11 : all-last-resort toujours accepté (validator + scorer pass)", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2")] };
  const output = minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [lastResortReview("issue1"), lastResortReview("issue2")],
    illegitimate_question_found: []
  });
  validateCriticOutput(output);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

test("H3B-12 : mixed case toujours accepté (signal uniquement pour la non-last-resort, disagree, pass)", () => {
  const analystOutput = { issues: [materialQuestionIssue("issue1"), materialQuestionIssue("issue2")] };
  const output = minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [lastResortReview("issue1"), availableReview("issue2", "scenario")],
    illegitimate_question_found: [illegitimateFinding("issue2", "scenario")]
  });
  const result = validateCriticOutput(output);
  assert.equal(result.illegitimate_question_found.length, 1);
  const score = scoreCriticOutput(output, {}, { analyst_output: analystOutput });
  assert.equal(score.pass, true);
});

// --- Aucun mot métier introduit -----------------------------------------------------------------------

test("H3B-13 : aucun mot métier de production n'a été introduit par la compaction H3B", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
