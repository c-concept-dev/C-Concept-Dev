/* TARGETED-FIX-B1-ONLY — QUAND LA QUESTION PRINCIPALE EST REFUSÉE, IL DOIT RESTER QUELQUE CHOSE.
 * ============================================================================
 *
 * CE QU'EST B1. Un tour peut se terminer en `turn_contractually_unusable` : l'autorité prononce
 * `clarification_required`, la frontière refuse la question — à raison — et aucune des candidates
 * du même tour n'est affichable non plus. La personne reçoit alors un échec rejouable au lieu d'une
 * question. Mesuré à 7 tours sur 30 lors d'une campagne synthétique.
 *
 * CE QUE CE LOT NE FAIT PAS, ET C'EST L'ESSENTIEL. Il ne relâche AUCUN refus. Une question méta
 * reste refusée, une question multiple reste refusée, un manque déjà sollicité reste refusé. Rendre
 * B1 plus rare en affichant de mauvaises questions serait échanger un défaut visible contre un
 * défaut invisible — exactement l'inverse de ce que les lots précédents ont construit.
 *
 * CE QU'IL CORRIGE : LA PRODUCTION DES CANDIDATES, ET ELLE SEULE.
 *
 *   1. LE CONTRAT LES EN EMPÊCHAIT. `question_candidates` déclarait `additionalProperties: false`
 *      sans `missing_determinant_id`. L'autorité ne POUVAIT donc pas attacher à une candidate
 *      l'identité du manque qu'elle vise — alors que `next_question` la porte, que la frontière la
 *      lit sur les candidates, et qu'une candidate substituée décrit désormais la question entière.
 *      Champ consommé, structurellement impossible à produire : toute question de remplacement
 *      repartait sans identité, et la protection contre la répétition retombait, pour tout le reste
 *      du dialogue, sur l'égalité de texte.
 *
 *   2. LA CONSIGNE NE DISAIT PAS À QUOI ELLES SERVENT. Elle les décrivait comme une liste de
 *      questions non substituables, en autorisant « ou aucune » et en mettant en garde contre le
 *      remplissage. Rien n'indiquait qu'une candidate est CE QUI SERA MONTRÉ si la principale est
 *      refusée — ni qu'en l'absence de candidate affichable, le tour est perdu.
 *
 * CE FICHIER ÉPROUVE LES DEUX MOITIÉS : que la frontière sait se rabattre quand une alternative
 * existe, et qu'elle refuse toujours quand aucune ne vaut.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { CORE_JSON_SCHEMA, CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { validateQuestionCandidate } from '../workers/shared/operational-request-core.js';

const q = (text, { focus = 'problem_or_user_context', id = null, issue = 'I1', progress = 'p' } = {}) =>
  ({ text, targets_issue_id: issue, expected_progress: progress, question_focus: focus, missing_determinant_id: id });

/* Une demande qui EXPOSE une situation : une question sur la forme du résultat y est méta. */
const tour = (principale, { requestFocus = 'user_problem_or_goal' } = {}) => ({
  state: 'clarification_required',
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'D.' },
  objective_nature: 'production', request_focus: requestFocus, output_format: null,
  issues: [
    { id: 'I1', type: 'missing_information', description: 'd1', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null },
    { id: 'I2', type: 'missing_information', description: 'd2', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null }
  ],
  next_question: principale, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'r'
});

const META = 'Quel format souhaitez-vous pour le résultat ?';
const MULTIPLE = 'Quel est le premier paramètre et le second ?';

/* ==========================================================================
 * T-B1-01 — REFUSÉE, MAIS UNE ALTERNATIVE EXISTE
 * ======================================================================= */

test('T-B1-01 : question principale refusée, alternative valide disponible — l’alternative est montrée', () => {
  const alternative = q('Quelle est la donnée manquante ?', { id: 'manque_b', issue: 'I2', progress: 'débloque I2' });
  const rendu = applyDisplayGuardToTurn(tour(q(META, { focus: 'output_specification', id: 'manque_forme' })),
    { question_candidates: [alternative] }, () => {});
  assert.equal(rendu.next_question.text, alternative.text);
  assert.equal(rendu.state, 'clarification_required', 'l’état reste celui de l’autorité');
});

/* ==========================================================================
 * T-B1-02 — MANQUE DÉJÀ SOLLICITÉ, SECOND MANQUE ENCORE OUVERT
 * ======================================================================= */

test('T-B1-02 : le manque principal a déjà été sollicité, un second reste ouvert — c’est lui qui part', () => {
  const historique = [{ turn: 1, question: 'Une formulation antérieure ?', answer: 'sa réponse',
    provenance: 'user', missing_determinant_id: 'manque_a' }];
  const rendu = applyDisplayGuardToTurn(
    tour(q('Autre formulation du même manque ?', { id: 'manque_a' })),
    { question_candidates: [
      q('Encore une autre formulation du même manque ?', { id: 'manque_a' }),
      q('Une question sur le second manque ?', { id: 'manque_b', issue: 'I2' })
    ] }, () => {}, historique);
  assert.equal(rendu.next_question.text, 'Une question sur le second manque ?');
  assert.equal(rendu.next_question.missing_determinant_id, 'manque_b',
    'la candidate retenue vise bien un manque encore ouvert');
});

/* ==========================================================================
 * T-B1-03 — PRINCIPALE NON ATOMIQUE, CANDIDATE ATOMIQUE
 * ======================================================================= */

test('T-B1-03 : question principale multiple, candidate atomique disponible — la candidate est montrée', () => {
  const rendu = applyDisplayGuardToTurn(tour(q(MULTIPLE, { id: 'manque_a' })),
    { question_candidates: [q('Quel est le premier paramètre ?', { id: 'manque_a' })] }, () => {});
  assert.equal(rendu.next_question.text, 'Quel est le premier paramètre ?');
  /* Et rien n’a été tronqué : le texte montré est celui que l’autorité a écrit. */
  assert.equal(rendu.next_question.text.includes(' et '), false);
});

/* ==========================================================================
 * T-B1-04 — AUCUNE CANDIDATE VALIDE : LA GARDE NE CÈDE PAS
 * ======================================================================= */

test('T-B1-04 : toutes les candidates invalides — la sortie reste contractuellement inexploitable', () => {
  const journal = [];
  assert.throws(() => applyDisplayGuardToTurn(
    tour(q(META, { focus: 'output_specification', id: 'manque_forme' })),
    { question_candidates: [
      q('Quel format attendez-vous exactement ?', { focus: 'output_specification', id: 'manque_forme' }),
      q(MULTIPLE, { id: 'manque_b' })
    ] }, (e) => journal.push(e)),
    (erreur) => erreur.code === 'turn_contractually_unusable',
    'aucune alternative n’est fabriquée pour éviter l’échec');
  const releve = journal.find((e) => e && e.event === 'turn_contractually_unusable');
  assert.equal(releve.candidates_available, 2, 'le relevé dit combien l’autorité en avait produit');
});

/* ==========================================================================
 * T-B1-05 — L'IDENTITÉ DE LA CANDIDATE SURVIT AU REMPLACEMENT
 * ======================================================================= */

test('T-B1-05 : la candidate retenue décrit la question ENTIÈRE, sans rien hériter de la refusée', () => {
  const alternative = q('Quelle est la donnée manquante ?',
    { id: 'manque_b', issue: 'I2', progress: 'débloque I2', focus: 'problem_or_user_context' });
  const principale = q(META, { focus: 'output_specification', id: 'manque_forme', issue: 'I1', progress: 'débloque I1' });
  const rendu = applyDisplayGuardToTurn(tour(principale), { question_candidates: [alternative] }, () => {});
  const r = rendu.next_question;
  assert.equal(r.text, alternative.text);
  assert.equal(r.missing_determinant_id, 'manque_b');
  assert.equal(r.targets_issue_id, 'I2');
  assert.equal(r.expected_progress, 'débloque I2');
  assert.equal(r.question_focus, 'problem_or_user_context');
  for (const champ of ['missing_determinant_id', 'targets_issue_id', 'expected_progress', 'question_focus'])
    assert.notEqual(r[champ], principale[champ], `${champ} ne vient pas de la question refusée`);
});

/* ==========================================================================
 * T-B1-06 — UNE CANDIDATE DÉJÀ RÉPONDUE EST REFUSÉE COMME LES AUTRES
 * ======================================================================= */

test('T-B1-06 : une candidate qui redemande un manque déjà satisfait est écartée', () => {
  const historique = [{ turn: 1, question: 'Une question antérieure ?', answer: 'sa réponse',
    provenance: 'user', missing_determinant_id: 'manque_b' }];
  const rendu = applyDisplayGuardToTurn(
    tour(q(META, { focus: 'output_specification', id: 'manque_forme' })),
    { question_candidates: [
      q('Reformulation du manque déjà satisfait ?', { id: 'manque_b' }),
      q('Une question sur un troisième manque ?', { id: 'manque_c', issue: 'I2' })
    ] }, () => {}, historique);
  assert.equal(rendu.next_question.missing_determinant_id, 'manque_c',
    'la candidate déjà satisfaite est sautée, pas affichée');
});

/* ==========================================================================
 * T-B1-07 — CE QUI EST SUBSTITUABLE N'A PAS À DEVENIR UNE CANDIDATE
 * ======================================================================= */

test('T-B1-07 : la consigne exclut les inconnues substituables et interdit de remplir la liste', () => {
  /* La règle est générique et vit chez l’autorité : ce test vérifie qu’elle est ÉNONCÉE, pas qu’un
     sujet donné produise zéro question — aucune fixture métier n’entre ici. */
  assert.match(CORE_SYSTEM_PROMPT, /une inconnue substituable n'y a pas sa place/);
  assert.match(CORE_SYSTEM_PROMPT, /N'en fabriquez aucune pour remplir la liste/);
  assert.match(CORE_SYSTEM_PROMPT, /il vaut mieux aucune candidate qu'une question que vous ne poseriez pas vous-même/);
});

/* ==========================================================================
 * LA CAUSE STRUCTURELLE, ET LA CONSIGNE QUI LA DOUBLE
 * ======================================================================= */

test('T-B1-08 : le contrat permet enfin à une candidate de nommer le manque qu’elle vise', () => {
  const items = CORE_JSON_SCHEMA.properties.question_candidates.items;
  assert.equal(items.additionalProperties, false, 'le contrat reste clos');
  assert.equal(items.required.includes('missing_determinant_id'), true, 'et il exige désormais l’identité');
  assert.deepEqual(Object.keys(items.properties).sort(),
    ['expected_progress', 'missing_determinant_id', 'question_focus', 'targets_issue_id', 'text']);
  /* Le validateur l’accepte, et il l’acceptait déjà : c’est le schéma d’outil qui l’interdisait. */
  const v = validateQuestionCandidate({ text: 'Q ?', targets_issue_id: 'I1', expected_progress: 'p',
    question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_a' });
  assert.equal(v.missing_determinant_id, 'manque_a');
});

test('T-B1-09 : la consigne dit à l’autorité ce que ses candidates deviennent', () => {
  assert.match(CORE_SYSTEM_PROMPT, /c'est UNE DE CES CANDIDATES qui sera montrée/);
  assert.match(CORE_SYSTEM_PROMPT, /s'il n'y en a aucune d'affichable, le tour est perdu/);
  assert.match(CORE_SYSTEM_PROMPT, /elle vise un manque DIFFÉRENT — jamais la même chose reformulée/);
  assert.match(CORE_SYSTEM_PROMPT, /missing_determinant_id compris/);
  /* Aucun domaine n’entre dans cette consigne. */
  for (const mot of ['voyage', 'budget', 'londres', 'recrutement', 'santé'])
    assert.equal(new RegExp(`\\b${mot}\\b`, 'i').test(CORE_SYSTEM_PROMPT), false, `aucun domaine (${mot})`);
});

test('T-B1-10 : aucun refus n’a été assoupli pour rendre B1 plus rare', () => {
  /* Une question méta, sans candidate de secours, reste refusée. */
  assert.throws(() => applyDisplayGuardToTurn(
    tour(q(META, { focus: 'output_specification', id: 'manque_forme' })), { question_candidates: [] }),
    (e) => e.code === 'turn_contractually_unusable', 'refus maintenu : question méta');

  /* UNE QUESTION MULTIPLE N'EST JAMAIS MONTRÉE TELLE QUELLE — mais elle n'est pas toujours refusée :
     la réduction déterministe, antérieure à ces lots, en garde la tête interrogative et abandonne ce
     qui l'encombre. Ce mécanisme n'a PAS été touché ici, et ce test dit ce qu'il fait vraiment
     plutôt que ce qu'on aimerait qu'il fasse : ce qui est affiché ne porte qu'une dimension. */
  const reduite = applyDisplayGuardToTurn(tour(q(MULTIPLE, { id: 'manque_a' })), { question_candidates: [] });
  assert.notEqual(reduite.next_question.text, MULTIPLE, 'la question multiple n’est pas montrée telle quelle');
  assert.equal(/\s+et\s+/.test(reduite.next_question.text), false, 'ce qui est montré ne porte qu’un manque');
  const historique = [{ turn: 1, question: 'Déjà posée ?', answer: 'r', provenance: 'user', missing_determinant_id: 'manque_a' }];
  assert.throws(() => applyDisplayGuardToTurn(tour(q('Autrement formulée ?', { id: 'manque_a' })),
    { question_candidates: [] }, () => {}, historique),
    (e) => e.code === 'turn_contractually_unusable', 'refus maintenu : manque déjà sollicité');
});
