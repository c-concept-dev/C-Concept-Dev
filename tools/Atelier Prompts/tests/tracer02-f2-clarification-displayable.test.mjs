/* TRACER-REMEDIATION-02 · F2 — UN ÉTAT QUI EXIGE UNE QUESTION EN FOURNIT UNE, OU N'EXISTE PAS.
 * ============================================================================
 *
 * CE QUE LE PRODUIT DÉPLOYÉ A RENDU. Sur « Occupe-toi de la communication interne du déménagement,
 * tu sais mieux que moi ce qu'il faut », une fois sur six : HTTP 200, `state` valant
 * clarification_required, deux inconnues déclarées, et `next_question` à
 * `{text:null, targets_issue_id:null, expected_progress:null}` — la signature littérale de la
 * branche NOT_DISPLAYABLE de la frontière d'affichage. La personne recevait un état qui réclame une
 * réponse, et rien à quoi répondre.
 *
 * LE GARDE AVAIT RAISON. La demande délègue explicitement la forme du résultat
 * (`request_focus = user_problem_or_goal`), et l'autorité avait proposé une question demandant à la
 * personne de définir ce que nous devons produire (`question_focus = output_specification`). C'est
 * exactement la question que V2.2.1-D2F1 a construit le garde pour retirer. Il n'a pas failli : il
 * a fait son travail, puis laissé l'état réclamer ce qu'il venait d'enlever.
 *
 * CE QUI EST CORRIGÉ. La combinaison interdite ne sort plus. `validateArbiterOutput` interdit depuis
 * toujours « clarification_required sans next_question » ; la frontière la produisait quand même,
 * après validation, et personne ne revalidait derrière elle.
 *
 * CE QUI N'EST PAS FAIT, ET NE DOIT PAS L'ÊTRE. Aucune question n'est fabriquée. Aucun état n'est
 * décidé par la frontière — ni prêt, ni bloqué : la readiness reste à l'autorité. Ce qui est tenté
 * avant d'abandonner est ce que l'autorité a elle-même produit, dans l'ordre où elle l'a classé.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { validateArbiterOutput } from '../workers/shared/operational-request-core.js';

/** Un tour d'autorité complet, à la forme exacte que le contrat impose. */
const tour = (etat, question, extra = {}) => ({
  state: etat,
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'Une note.' },
  objective_nature: 'production',
  /* La demande expose une situation : une question qui interroge la FORME y est méta. */
  request_focus: 'user_problem_or_goal',
  output_format: null,
  issues: [{ id: 'I1', type: 'missing_information', description: 'Le contexte manque.',
    impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null }],
  next_question: question,
  confirmation_reason: etat === 'confirmation_required' ? 'Un arbitrage a été fait.' : null,
  blocked_reason: etat === 'blocked' ? 'Aucune question ne permet de progresser.' : null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'r', ...extra
});
const question = (text, focus) => ({ text, targets_issue_id: 'I1', expected_progress: 'p', question_focus: focus });
const SANS_QUESTION = { text: null, targets_issue_id: null, expected_progress: null, question_focus: null };

const META = 'Quel format souhaitez-vous pour le livrable ?';
const UTILE = 'Quelle est la date prévue du déménagement ?';
const UTILE_2 = 'Quel est le site d’arrivée ?';

/* ==========================================================================
 * F2-01 / 02 — LA PREMIÈRE CANDIDATE, PUIS LES AUTRES, DANS L'ORDRE DE L'AUTORITÉ
 * ======================================================================= */

test('T-F2-01 : une question affichable passe telle quelle', () => {
  const rendu = applyDisplayGuardToTurn(tour('clarification_required', question(UTILE, 'problem_or_user_context')), {});
  assert.equal(rendu.next_question.text, UTILE);
  assert.equal(rendu.state, 'clarification_required');
});

test('T-F2-02 : la première refusée, la frontière prend la suivante que l’AUTORITÉ a produite', () => {
  /* L'ordre est celui du contrat — les candidates sont classées par valeur informationnelle
     décroissante. La frontière ne les réordonne pas et n'en choisit aucune par son texte. */
  const rendu = applyDisplayGuardToTurn(
    tour('clarification_required', question(META, 'output_specification')),
    { question_candidates: [
      { ...question(META, 'output_specification') },
      { ...question(UTILE, 'problem_or_user_context') },
      { ...question(UTILE_2, 'problem_or_user_context') }
    ] });
  assert.equal(rendu.next_question.text, UTILE, 'la première AFFICHABLE de la liste, pas la dernière');
  assert.equal(rendu.state, 'clarification_required', 'l’état reste celui de l’autorité');
});

/* ==========================================================================
 * F2-03 — QUAND RIEN N'EST AFFICHABLE
 * ======================================================================= */

test('T-F2-03 : aucune candidate affichable — la sortie est déclarée inexploitable, jamais rendue', () => {
  const journal = [];
  assert.throws(() => applyDisplayGuardToTurn(
    tour('clarification_required', question(META, 'output_specification')),
    { question_candidates: [question(META, 'output_specification')] },
    (e) => journal.push(e)
  ), (erreur) => {
    assert.equal(erreur.status, 502);
    assert.equal(erreur.code, 'turn_contractually_unusable');
    return true;
  });
  const releve = journal.find((e) => e && e.event === 'turn_contractually_unusable');
  assert.ok(releve, 'l’abandon est journalisé, avec sa raison');
  assert.equal(releve.reason, 'CLARIFICATION_WITHOUT_DISPLAYABLE_QUESTION');
  assert.equal(releve.candidates_available, 1);
});

test('T-F2-04 : CLARIFICATION_WITHOUT_QUESTION = 0 — la combinaison interdite ne sort plus', () => {
  /* Le contrat du système l'interdisait déjà ; la frontière la produisait APRÈS validation. Ce test
     ferme l'écart en revalidant ce que la frontière rend. */
  for (const candidates of [[], [question(META, 'output_specification')]]) {
    let rendu = null;
    try { rendu = applyDisplayGuardToTurn(
      tour('clarification_required', question(META, 'output_specification')),
      { question_candidates: candidates }); } catch { /* refus attendu */ }
    if (rendu) {
      assert.notEqual(rendu.next_question.text, null,
        'un tour rendu ne peut pas réclamer une clarification sans la poser');
      assert.doesNotThrow(() => validateArbiterOutput(rendu),
        'ce que la frontière rend satisfait le validateur du système');
    }
  }
});

/* ==========================================================================
 * F2-05 — LES AUTRES ÉTATS NE SONT PAS TOUCHÉS
 * ======================================================================= */

test('T-F2-05 : prêt et bloqué n’exigent aucune question, et n’en reçoivent aucune', () => {
  for (const etat of ['operational_request_ready', 'blocked', 'confirmation_required']) {
    const rendu = applyDisplayGuardToTurn(tour(etat, SANS_QUESTION), {});
    assert.equal(rendu.next_question.text, null, `${etat} : aucune question n’est fabriquée`);
    assert.equal(rendu.state, etat, `${etat} : l’état est rendu tel quel`);
  }
});

test('T-F2-06 : la frontière ne décide toujours aucune readiness', () => {
  const source = applyDisplayGuardToTurn.toString();
  for (const etat of ['operational_request_ready', 'blocked', 'degraded_state', 'confirmation_required']) {
    assert.equal(source.includes(`"${etat}"`), false, `la frontière ne nomme pas ${etat}`);
    assert.equal(source.includes(`'${etat}'`), false, `la frontière ne nomme pas ${etat}`);
  }
});
