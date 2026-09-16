/* FINAL-TARGETED-FIX — UNE QUESTION AFFICHÉE EST CELLE QUI A ÉTÉ ÉCRITE.
 * ============================================================================
 *
 * LE DÉFAUT, REPRODUIT AVANT D'ÊTRE CORRIGÉ. `reduceQuestionDeterministically` intervenait APRÈS
 * la sortie de l'autorité. Devant « Quel est le premier paramètre et le second ? », elle coupait à
 * la coordination et rendait « Quel est le premier paramètre ? ». Le texte changeait ; les
 * métadonnées, elles, ne changeaient pas. Le tour partait donc avec :
 *
 *   texte affiché        « Quel est le premier paramètre ? »
 *   missing_determinant  celui de la question ENTIÈRE
 *   expected_progress    la progression de la question ENTIÈRE
 *
 * DISPLAYED_TEXT != DISPLAYED_IDENTITY. La personne répondait à une question, le système créditait
 * la réponse à une autre, et la protection contre la répétition tenait pour satisfait un manque que
 * personne n'avait interrogé.
 *
 * POURQUOI LA COUPURE NE POUVAIT PAS ÊTRE « RÉPARÉE ». Recalculer les métadonnées sur le fragment
 * supposerait de décider, hors autorité et après coup, quel manque ce fragment interroge : une
 * seconde autorité sémantique, que l'architecture interdit. La seule correction possible était donc
 * le retrait.
 *
 * L'INVARIANT TENU ICI — NO POST-GENERATION SEMANTIC TRUNCATION. Après sortie de l'autorité, une
 * question est acceptée telle quelle, remplacée par UNE AUTRE QUESTION COMPLÈTE du même tour, ou
 * refusée. Aucun mécanisme local ne réécrit son texte.
 *
 * CE QUE CE FICHIER NE FAIT PAS. Il n'assouplit aucun refus : les questions employées ci-dessous
 * restent NON AFFICHABLES, exactement comme avant. Seule la sanction change — refus au lieu de
 * coupure — et le prix est assumé : le tour est déclaré inexploitable plutôt qu'affiché de travers.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  guardDisplayedQuestion, guardFastInteraction, isAtomicQuestion,
  DISPLAY_VERDICTS, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../core/adn/browser-runtime.generated.js', import.meta.url), 'utf8');
const artefact = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

const q = (text, { focus = 'problem_or_user_context', id = null, issue = 'I1', progress = 'p' } = {}) =>
  ({ text, targets_issue_id: issue, expected_progress: progress, question_focus: focus, missing_determinant_id: id });

const tour = (principale) => ({
  state: 'clarification_required',
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'D.' },
  objective_nature: 'production', request_focus: 'user_problem_or_goal', output_format: null,
  issues: [
    { id: 'I1', type: 'missing_information', description: 'd1', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null },
    { id: 'I2', type: 'missing_information', description: 'd2', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null }
  ],
  next_question: principale, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'r'
});

/* Le cas EXACT du contre-audit, employé comme entrée, jamais comme sortie attendue. */
const DEUX_DETERMINANTS = 'Quel est le premier paramètre et le second ?';

/* ==========================================================================
 * T-TRUNC-01 — LE CAS DU CONTRE-AUDIT N'EST PLUS COUPÉ
 * ======================================================================= */

test('T-TRUNC-01 : une question à deux déterminants n’est jamais tronquée localement', () => {
  const garde = guardDisplayedQuestion(DEUX_DETERMINANTS, {});
  /* Le refus est inchangé — c'est bien une question non affichable. */
  assert.equal(isAtomicQuestion(DEUX_DETERMINANTS), false);
  assert.equal(garde.verdict, 'NOT_DISPLAYABLE');
  /* Et il ne reste AUCUN fragment : ni la tête interrogative, ni un sous-ensemble du texte. */
  assert.equal(garde.text, null, 'aucun texte fabriqué par la frontière');
  /* La preuve la plus forte est structurelle : le verdict « réduit » n'existe plus. */
  assert.deepEqual(DISPLAY_VERDICTS, ['ALLOW', 'REPLACED', 'NOT_DISPLAYABLE']);
  assert.equal(DISPLAY_VERDICTS.includes('REDUCED'), false);
  /* Et le mécanisme lui-même a disparu des trois formes livrées de la politique — le CODE, pas les
     commentaires : la pierre tombale qui explique le retrait porte encore le nom, et c'est voulu. */
  const codeSeul = (source) => source.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const [nom, source] of [['module', politique], ['runtime généré', runtime], ['artefact servi', artefact]]) {
    assert.equal(/reduceQuestionDeterministically/.test(codeSeul(source)), false,
      `la réduction ne subsiste pas dans ${nom}`);
  }
});

/* ==========================================================================
 * T-TRUNC-02 / 03 — CE QUI REMPLACE LA COUPURE
 * ======================================================================= */

test('T-TRUNC-02 : une candidate complète du même tour est affichée à sa place', () => {
  const entiere = q('Quelle est la donnée manquante ?', { id: 'manque_b', issue: 'I2', progress: 'débloque I2' });
  const rendu = applyDisplayGuardToTurn(tour(q(DEUX_DETERMINANTS, { id: 'manque_a' })),
    { question_candidates: [entiere] }, () => {});
  /* Ce qui est montré est la candidate ENTIÈRE, mot pour mot. */
  assert.equal(rendu.next_question.text, entiere.text);
  /* Et rien du texte refusé ne survit dans ce qui est montré. */
  assert.equal(rendu.next_question.text.includes('premier paramètre'), false);
  assert.equal(rendu.state, 'clarification_required', 'l’état reste celui de l’autorité');
});

test('T-TRUNC-03 : sans candidate affichable, le tour est déclaré inexploitable', () => {
  /* C'est le prix assumé du retrait : un échec nommé, plutôt qu'une demi-question affichée. */
  assert.throws(() => applyDisplayGuardToTurn(
    tour(q(DEUX_DETERMINANTS, { id: 'manque_a' })), { question_candidates: [] }),
    (e) => e.code === 'turn_contractually_unusable' && e.status === 502);
  /* Une candidate elle-même non affichable ne sauve rien : elle n'est pas coupée non plus. */
  assert.throws(() => applyDisplayGuardToTurn(
    tour(q(DEUX_DETERMINANTS, { id: 'manque_a' })),
    { question_candidates: [q('Quel est le troisième paramètre et le quatrième ?', { id: 'manque_c' })] }),
    (e) => e.code === 'turn_contractually_unusable');
});

/* ==========================================================================
 * T-TRUNC-04 — TEXTE ET IDENTITÉ DÉCRIVENT LA MÊME QUESTION
 * ======================================================================= */

test('T-TRUNC-04 : le texte affiché et son identité viennent du même objet, toujours', () => {
  /* LE DÉFAUT MESURÉ : un texte coupé repartait avec les métadonnées de la question entière. La
     garantie est désormais structurelle — sur les deux issues qui affichent, l'objet montré est un
     objet que l'autorité a produit en entier, jamais un assemblage. */
  const principale = q('Quelle est la donnée manquante ?', { id: 'manque_a', issue: 'I1', progress: 'débloque I1' });
  const accepte = applyDisplayGuardToTurn(tour(principale), { question_candidates: [] }, () => {});
  assert.deepEqual(accepte.next_question, principale, 'acceptée : l’objet entier, inchangé');

  const entiere = q('Quel élément reste à préciser ?', { id: 'manque_b', issue: 'I2', progress: 'débloque I2' });
  const remplace = applyDisplayGuardToTurn(tour(q(DEUX_DETERMINANTS, { id: 'manque_a' })),
    { question_candidates: [entiere] }, () => {});
  /* Les CINQ champs se déplacent ensemble : aucun ne reste celui de la question refusée. */
  for (const champ of ['text', 'missing_determinant_id', 'expected_progress', 'question_focus', 'targets_issue_id']) {
    assert.equal(remplace.next_question[champ], entiere[champ], `${champ} est celui de la candidate montrée`);
  }
  assert.notEqual(remplace.next_question.missing_determinant_id, 'manque_a',
    'l’identité de la question refusée ne survit pas à sa substitution');
});

/* ==========================================================================
 * T-TRUNC-05 — LE PLAN RAPIDE SUIT LA MÊME RÈGLE
 * ======================================================================= */

test('T-TRUNC-05 : le plan rapide ne rend jamais un texte réduit privé de ses faits', () => {
  /* La branche retirée rendait `{ type, text }` : deux champs, là où le contrat en compte quatre.
     Le texte coupé repartait donc sans `question_focus` ni `missing_determinant_id` — et le garde
     méta, qui échoue FERMÉ sans fait déclaré, ne s'exécutait plus sur ce chemin. */
  const snap = createTurnSnapshot({ turn_id: 1, original_request: 'Je veux préparer un déplacement.' });
  const refusee = { type: 'ASK_CLARIFICATION', text: DEUX_DETERMINANTS,
    question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_a' };
  assert.deepEqual(guardFastInteraction(refusee, snap), SILENT_INTERACTION,
    'le plan rapide se tait plutôt que de couper');

  /* Et ce qu'il laisse passer sort INTACT : même objet, mêmes faits, aucun appauvrissement. */
  const acceptee = { type: 'ASK_CLARIFICATION', text: 'Quelle est la donnée manquante ?',
    question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_a' };
  assert.deepEqual(guardFastInteraction(acceptee, snap), acceptee);

  /* La garantie structurelle : la composition rapide n'a plus que ces deux issues. */
  const composition = politique.slice(politique.indexOf('export function guardFastInteraction'),
    politique.indexOf('export function guardDisplayedQuestion'));
  assert.equal(/REDUCED/.test(composition), false);
  assert.equal(/garde\.text/.test(composition), false, 'le chemin rapide ne lit plus aucun texte réécrit');
});

/* ==========================================================================
 * T-TRUNC-06 — CE QUI EST ENTIER LE RESTE
 * ======================================================================= */

test('T-TRUNC-06 : un choix à l’intérieur d’UNE dimension reste entier', () => {
  /* Le retrait ne durcit pas la mesure d'atomicité : une question qui propose des valeurs pour une
     SEULE inconnue n'a jamais été multi-dimension, et elle passe intacte — deux-points compris. */
  const choixUneDimension = 'Quel jour préférez-vous : lundi, mardi ou mercredi ?';
  assert.equal(isAtomicQuestion(choixUneDimension), true);
  assert.deepEqual(guardDisplayedQuestion(choixUneDimension, {}),
    { verdict: 'ALLOW', text: choixUneDimension });
  /* Le deux-points était l'un des points de coupure de l'ancien mécanisme : il ne coupe plus rien. */
  const rendu = applyDisplayGuardToTurn(tour(q(choixUneDimension, { id: 'manque_jour' })),
    { question_candidates: [] }, () => {});
  assert.equal(rendu.next_question.text, choixUneDimension, 'affichée telle qu’elle a été écrite');
});

/* ==========================================================================
 * T-TRUNC-07 — DEUX MANQUES RÉELS : REFUS OU SUBSTITUTION, JAMAIS COUPURE
 * ======================================================================= */

test('T-TRUNC-07 : une question qui porte réellement deux manques n’a que deux issues', () => {
  const deuxManques = 'Quel est votre budget et la durée du séjour ?';
  assert.equal(isAtomicQuestion(deuxManques), false, 'le défaut est toujours mesuré');
  assert.equal(guardDisplayedQuestion(deuxManques, {}).text, null, 'et il n’est pas rattrapé');

  /* Issue 1 — le refus. */
  assert.throws(() => applyDisplayGuardToTurn(tour(q(deuxManques, { id: 'manque_a' })),
    { question_candidates: [] }), (e) => e.code === 'turn_contractually_unusable');

  /* Issue 2 — une autre question complète de l'autorité, et elle seule. */
  const entiere = q('Quel élément reste à préciser ?', { id: 'manque_b', issue: 'I2', progress: 'débloque I2' });
  const rendu = applyDisplayGuardToTurn(tour(q(deuxManques, { id: 'manque_a' })),
    { question_candidates: [entiere] }, () => {});
  assert.equal(rendu.next_question.text, entiere.text);
  /* Aucun fragment du texte refusé n'atteint l'écran, sous aucune forme. */
  for (const fragment of ['Quel est votre budget', 'la durée du séjour']) {
    assert.equal(rendu.next_question.text.includes(fragment), false, `« ${fragment} » n’est pas affiché`);
  }
});
