import test from "node:test";
import assert from "node:assert/strict";

import { CRITIC_SYSTEM_PROMPT, validateCriticOutput } from "../workers/shared/operational-request-core.js";
import { scoreCriticOutput } from "../evaluation/lot10g3b3f3/score-role-outputs.mjs";

// 3F.3.3-H3 : preuve empirique décisive — le dernier smoke Critic-only (sentinelle
// sentinel-b01b-substitution) a été refusé par Groq AVANT toute génération : HTTP 413,
// rate_limit_exceeded, model=openai/gpt-oss-20b, TPM limit=8000, requested=8549. Aucune conclusion
// sur G4/B-01B n'est possible tant que la requête dépasse le budget du provider. Diagnostic retenu :
// CRITIC_SYSTEM_PROMPT a grossi à chaque lot (S3, S4, G3, G4), chaque lot ajoutant du texte de façon
// purement additive sans jamais retirer les formulations devenues redondantes des lots précédents —
// en particulier : (1) MISSION point 5 répétait, dans une prose narrative, exactement la même
// conséquence review→signal que la section CHAÎNE DE COHÉRENCE OBLIGATOIRE (G4) et la même
// cardinalité que FORME DE question_review_targets (S3) ; (2) INTERDICTIONS répétait l'interdiction
// de available_alternative_reason déjà couverte intégralement par CLÉS EXACTES (G3) ; (3) le rappel
// "MISSION point 8 (agreement=disagree)" était réexpliqué en toutes lettres à l'intérieur de la
// CHAÎNE DE COHÉRENCE alors qu'une référence suffit ; (4) plusieurs clauses narratives (point 1, la
// clôture du point 8, la clôture de CLÉS EXACTES) restataient une idée déjà exprimée ailleurs dans le
// même prompt. H3 retire exclusivement cette redondance textuelle : aucune règle n'a disparu, aucune
// règle n'a changé de sens, aucune règle nouvelle n'a été introduite — chaque substring vérifié par
// les tests S1/S2/S3/S4/G3/G4 existants (106 assertions littérales au total, réparties sur 13
// fichiers) reste présent tel quel dans le prompt, et tous ces fichiers de test restent verts sans
// aucune modification. Aucun mot métier de production (Italie, voyage, budget, dates, durée,
// sentinel) n'apparaît dans les changements.

// --- Section 18 : mesure avant/après, déterministe, comparée à une borne documentée ---------------

// Mesure exacte de CRITIC_SYSTEM_PROMPT AVANT H3, prise sur le commit candidat G4
// (58e2c2d fix(critic): enforce substitution signal coherence, baseline officielle H3
// 09304890e3797fa961e1ae81c334d094b4bcf2b1) : chars=22090, bytes=22688, words=2942, lignes=96.
// Documentée ici en dur car ce commit n'est plus le HEAD courant une fois H3 committé — cf. mission
// §18, "si le baseline G4 n'est plus directement accessible dans le test runtime, comparer contre
// une borne maximale documentée".
const G4_BASELINE_CHARS = 22090;
const G4_BASELINE_BYTES = 22688;
const G4_BASELINE_WORDS = 2942;

test("H3-1 : mesure déterministe avant/après — réduction absolue et relative de CRITIC_SYSTEM_PROMPT", () => {
  const chars = CRITIC_SYSTEM_PROMPT.length;
  const bytes = Buffer.byteLength(CRITIC_SYSTEM_PROMPT, "utf8");
  const words = CRITIC_SYSTEM_PROMPT.split(/\s+/).filter(Boolean).length;
  const reductionChars = G4_BASELINE_CHARS - chars;
  const reductionPct = (100 * reductionChars) / G4_BASELINE_CHARS;
  // eslint-disable-next-line no-console
  console.log(`H3 compaction : ${G4_BASELINE_CHARS} -> ${chars} chars (-${reductionChars}, -${reductionPct.toFixed(1)}%), ${G4_BASELINE_BYTES} -> ${bytes} bytes, ${G4_BASELINE_WORDS} -> ${words} mots.`);
  assert.ok(chars < G4_BASELINE_CHARS, "le prompt doit être strictement plus court qu'à l'état G4.");
  assert.ok(reductionChars >= 1500, `réduction absolue attendue >= 1500 caractères (obtenu : ${reductionChars}).`);
  assert.ok(bytes < G4_BASELINE_BYTES, "la taille en octets doit également diminuer.");
  assert.ok(words < G4_BASELINE_WORDS, "le nombre de mots doit également diminuer.");
});

// --- Section 19 : budget statique, avec marge, jamais serré au caractère près ----------------------

test("H3-2 : CRITIC_SYSTEM_PROMPT reste sous un budget statique strictement inférieur à G4, avec marge", () => {
  // 3F.3.3-H3B : borne abaissée par rapport à H3 (20500) suite à une seconde passe de compaction
  // (glue non testée retirée autour des clauses porteuses S4/G3/G4, sans toucher un seul test
  // historique — cf. operational-request-critic-prompt-compaction-h3b.test.mjs pour la mesure
  // détaillée avant/après H3B). Choisie à partir de la mesure réelle post-H3B (~17800 caractères),
  // avec une marge d'environ 700 caractères, tout en restant très strictement sous G4 (22090).
  const BUDGET_MAX_CHARS = 18500;
  assert.ok(BUDGET_MAX_CHARS < G4_BASELINE_CHARS, "la borne elle-même doit être strictement inférieure à G4.");
  assert.ok(CRITIC_SYSTEM_PROMPT.length <= BUDGET_MAX_CHARS, `CRITIC_SYSTEM_PROMPT doit rester sous ${BUDGET_MAX_CHARS} caractères (obtenu : ${CRITIC_SYSTEM_PROMPT.length}).`);
});

// --- Section 20 : invariants S3 préservés ------------------------------------------------------------

// 3F.3.3-X2-A : question_substitution_review est désormais un objet keyed-by-issue_id — assertions
// mises à jour à contenu équivalent (cf. commentaire jumeau dans
// operational-request-critic-prompt-compaction-h3b.test.mjs).
test("H3-3 : les invariants S3 (question_review_targets, une clé par target, cardinalité) restent présents", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /question_review_targets est un TABLEAU fourni dans l'entrée de ce tour, précalculé mécaniquement/);
  assert.match(CRITIC_SYSTEM_PROMPT, /le nombre de targets qu'elle contient fixe exactement le nombre de clés attendu dans question_substitution_review/);
  assert.match(CRITIC_SYSTEM_PROMPT, /nombre de clés attendu dans question_substitution_review est exactement égal au nombre d'éléments/i);
  assert.match(CRITIC_SYSTEM_PROMPT, /Si question_review_targets est vide.{0,200}question_substitution_review est alors absent de votre réponse/is);
});

// --- Section 21 : invariants S4 préservés ------------------------------------------------------------

test("H3-4 : les invariants S4 (progression utile, resolve/continue, six alternatives, anti-biais) restent présents", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /poursuivre utilement le travail sans demander immédiatement l'information à l'utilisateur/);
  assert.match(CRITIC_SYSTEM_PROMPT, /n'a JAMAIS besoin d'être définitive, certaine, optimale, de résoudre entièrement l'inconnue/);
  assert.match(CRITIC_SYSTEM_PROMPT, /resolve the unknown/);
  assert.match(CRITIC_SYSTEM_PROMPT, /continue productively despite the unknown/);
  for (const alternative of ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"]) {
    assert.match(CRITIC_SYSTEM_PROMPT, new RegExp(alternative), `${alternative} doit rester présent littéralement.`);
  }
  assert.match(CRITIC_SYSTEM_PROMPT, /jamais toutes vraies par défaut \(aucune des six n'est automatiquement disponible\), jamais toutes fausses par défaut/);
});

// --- Section 22 : invariants G3 préservés ------------------------------------------------------------

// 3F.3.3-X2-A : trois clés désormais (issue_id est la clé de l'objet, plus un champ de la valeur).
test("H3-5 : les invariants G3 (exact keys — désormais alternatives_reviewed/available_alternative/why_available —, no extra property, available_alternative_reason interdit) restent présents", () => {
  assert.match(CRITIC_SYSTEM_PROMPT, /chaque valeur de question_substitution_review contient EXACTEMENT ces trois clés — alternatives_reviewed, available_alternative, why_available — jamais une quatrième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /alternatives_reviewed contient EXACTEMENT ces six clés — research, decide, estimate, scenario, condition, leave_unknown — jamais une septième/);
  assert.match(CRITIC_SYSTEM_PROMPT, /Chaque alternative individuelle \(chacune des six\) contient EXACTEMENT ces deux clés — reasonably_available, reason — jamais une autre/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez JAMAIS available_alternative_reason/);
  assert.match(CRITIC_SYSTEM_PROMPT, /N'ajoutez jamais available_alternative_reason, ni aucune autre clé absente du schéma, à question_substitution_review/);
});

// --- Section 23 : invariants G4 supersédés par X2-B ----------------------------------------------------

// 3F.3.3-X2-B : les invariants G4 (CAS A/B, cardinalité N->N, signal->disagree, pas de fantôme) sont
// désormais garantis par deriveCriticConsequences (workers/shared/operational-request-core.js),
// jamais par un texte de prompt — cf. operational-request-critic-substitution-signal-coherence.test.mjs.
test("H3-6 : les invariants G4 (CAS A/B, cardinalité N->N, signal->disagree, pas de fantôme) sont supersédés par la dérivation déterministe X2-B", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /CHAÎNE DE COHÉRENCE OBLIGATOIRE/);
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /SIGNAL FANTÔME/);
  assert.match(CRITIC_SYSTEM_PROMPT, /DISPONIBILITÉ ET JUSTIFICATION/);
});

// --- Section 24/25 : contrat local (fixtures génériques, aucun mot métier) --------------------------

const LADDER = ["research", "decide", "estimate", "scenario", "condition", "leave_unknown"];

function alternativesReviewed(availableTreatment) {
  return Object.fromEntries(LADDER.map((treatment) => [
    treatment,
    { reasonably_available: treatment === availableTreatment, reason: `Évaluation structurelle de ${treatment} compte tenu des données reçues.` }
  ]));
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

test("H3-7 : une sortie valide (alternative true, last_resort=false, signal correspondant, disagree) reste validator+scorer PASS après compaction", () => {
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

test("H3-8 : les rejets existants (extra property, mauvais issue_id, signal manquant, agreement incohérent) restent actifs après compaction", () => {
  // extra property
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [{ ...availableReview("issue1", "estimate"), available_alternative_reason: "en trop" }],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  })), TypeError);
  // signal manquant (omission)
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: []
  })), /aucune entrée correspondante n'existe dans illegitimate_question_found/);
  // mauvais issue_id
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "disagree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue2", "estimate")]
  })), /sans revue correspondante dans question_substitution_review/);
  // agreement incohérent
  assert.throws(() => validateCriticOutput(minimalCriticOutput({
    agreement: "agree",
    question_substitution_review: [availableReview("issue1", "estimate")],
    illegitimate_question_found: [illegitimateFinding("issue1", "estimate")]
  })), /agreement=agree exige illegitimate_question_found vide/);
});

// --- Section 27 : aucun mot métier introduit ----------------------------------------------------------

test("H3-9 : aucun mot métier de production n'a été introduit par la compaction", () => {
  assert.doesNotMatch(CRITIC_SYSTEM_PROMPT, /case-12|italie|voyage|budget|tourisme|hébergement|sentinel-b01b-substitution/i);
});
