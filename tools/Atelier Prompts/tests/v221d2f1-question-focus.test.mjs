/* ATELIER PROMPTS V2.2.1-D2F1 — CE QUE LA QUESTION INTERROGE EST DIT, PLUS DEVINÉ.
 * ============================================================================
 *
 * LE DERNIER PAS D'UNE LONGUE SÉRIE. L'audit Sol avait nommé un blocker P1 : du vocabulaire
 * décisionnel dans solicitation-policy.js. Six lots ont été nécessaires pour le fermer, et chacun
 * n'a pu avancer qu'en mesurant ce que le précédent avait supposé.
 *
 *   D2A  l'identité de l'inconnue n'arbitre pas la classe méta — trois cas portaient la MÊME
 *        identité canonique pour des légitimités opposées.
 *   D2B  le garde méta ne marquait rien sur huit sorties réelles ; cause trouvée et réparée ; il
 *        est alors devenu mesurablement utile — 3 captures que rien d'autre n'attrape.
 *   D2C  le dernier faux négatif venait d'une exemption dérivée d'une classe de mots.
 *   D2D  l'autorité déclare la nature de l'objectif : le signal C cesse de deviner.
 *   D2E  audit — les quatre vocabulaires restants lisent tous LE SUJET DE LA QUESTION, quand l'état
 *        canonique ne décrit que L'INCONNUE VISÉE. Aucun champ ne portait ce fait.
 *
 * CE QUE CE LOT FAIT. L'auteur de la question — le plan profond pour `next_question`, le plan rapide
 * pour la sienne — déclare ce qu'elle interroge. Les signaux A et B, qui étaient les deux faces
 * d'une même approximation, deviennent deux valeurs d'un même champ. Trois motifs de vocabulaire
 * quittent le chemin de production.
 *
 * CE QU'IL NE FAIT PAS. Le fait n°2 de D2E — « la demande porte-t-elle elle-même sur la forme ? » —
 * reste ouvert, et avec lui le dernier motif lexical, INTERROGE_LA_PRODUCTION. C'est le lot D2F2.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  questionTargetsOwnOutput, questionAsksConcreteVariable, isMetaOutputQuestion,
  guardDisplayedQuestion, guardFastInteraction, guardFastSolicitation, assessSolicitation,
  isAtomicQuestion, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import {
  FAST_INTERACTION_JSON_SCHEMA, createTurnSnapshot, validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import { QUESTION_FOCUS_VALUES } from '../core/adn/operational-request-state.js';
import { validateQuestionCandidate, validateArbiterOutput, ARBITER_JSON_SCHEMA } from '../workers/shared/operational-request-core.js';
import { CORE_JSON_SCHEMA, CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { FAST_INTERACTION_SYSTEM_PROMPT } from '../workers/groq/src/index.js';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const logique = source.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
const SITUATION = 'problem_or_user_context';
const NOTRE_SORTIE = 'output_specification';
const snapshot = () => createTurnSnapshot({ turn_id: 1, original_request: 'Je veux préparer un déplacement.' });

/* ==========================================================================
 * D2F1-01 / 02 — LES DEUX AUTEURS TRANSPORTENT LE FAIT
 * ======================================================================= */

test('V221D2F1-01 : une question du plan rapide transporte ce qu’elle interroge', () => {
  const v = validateFastInteraction(
    { type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville partez-vous ?', question_focus: SITUATION }, snapshot());
  assert.equal(v.ok, true);
  assert.equal(v.interaction.question_focus, SITUATION);
  /* Le schéma l'exige du modèle, et refuse tout ce qui n'appartient pas au vocabulaire. */
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required].sort(), ['missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.equal(validateFastInteraction(
    { type: 'ASK_CLARIFICATION', text: 'x', question_focus: 'deliverable' }, snapshot()).reason, 'FAST_SCHEMA_ERROR');
});

test('V221D2F1-02 : une question du plan profond transporte le même fait', () => {
  const q = validateQuestionCandidate({
    text: 'Depuis quelle ville partez-vous ?', targets_issue_id: 'I1',
    expected_progress: 'x', question_focus: SITUATION
  });
  assert.equal(q.question_focus, SITUATION);
  assert.equal(CORE_JSON_SCHEMA.properties.next_question.required.includes('question_focus'), true);
  assert.equal(CORE_JSON_SCHEMA.properties.question_candidates.items.required.includes('question_focus'), true);
  assert.deepEqual([...QUESTION_FOCUS_VALUES], ['problem_or_user_context', 'output_specification', 'other']);
  /* Une valeur hors vocabulaire est refusée, ici comme sur le plan rapide. */
  assert.throws(() => validateQuestionCandidate({
    text: 'x', targets_issue_id: 'I1', expected_progress: 'y', question_focus: 'livrable' }));
});

/* ==========================================================================
 * D2F1-03 / 04 — LES DEUX SIGNAUX NE LISENT PLUS QUE LE FAIT
 * ======================================================================= */

test('V221D2F1-03 : le signal A ne reçoit plus le texte, il ne peut donc plus en juger', () => {
  assert.equal(questionTargetsOwnOutput(NOTRE_SORTIE), true);
  assert.equal(questionTargetsOwnOutput(SITUATION), false);
  assert.equal(questionTargetsOwnOutput('other'), false);
  assert.equal(questionTargetsOwnOutput(null), false, 'sans fait : échec fermé');
  /* La signature elle-même interdit la régression : la fonction ne prend plus de texte. */
  assert.equal(questionTargetsOwnOutput('Quel type de résultat attendez-vous ?'), false,
    'un texte passé à la place du fait ne vaut rien');
});

test('V221D2F1-04 : le signal B lit le même champ, et les deux sont exclusifs par construction', () => {
  assert.equal(questionAsksConcreteVariable(SITUATION), true);
  assert.equal(questionAsksConcreteVariable(NOTRE_SORTIE), false);
  assert.equal(questionAsksConcreteVariable(null), false);
  /* A et B étaient deux approximations de la même chose ; ils sont maintenant deux valeurs d'un
     seul champ, et ne peuvent donc plus se contredire. */
  for (const focus of QUESTION_FOCUS_VALUES) {
    assert.equal(questionTargetsOwnOutput(focus) && questionAsksConcreteVariable(focus), false, focus);
  }
});

/* ==========================================================================
 * D2F1-05 / 06 — LES PROTECTIONS MESURÉES SONT TOUTES CONSERVÉES
 * ======================================================================= */

test('V221D2F1-05 : les 3 captures uniques sont préservées, par le fait et non par les mots', () => {
  const uniques = [
    'Quel type de contenu doit être inclus dans ce document ?',
    'Quel type de résultat attendez-vous ?',
    'Quel type de résultat attendez-vous — un rapport ou une note ?'
  ];
  for (const texte of uniques) {
    assert.equal(isAtomicQuestion(texte), true, 'les gardes de forme la laissent passer');
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: NOTRE_SORTIE }), true, 'seul le garde méta la refuse');
    assert.deepEqual(guardFastSolicitation(
      { type: 'ASK_CLARIFICATION', text: texte, question_focus: NOTRE_SORTIE }, {}), SILENT_INTERACTION);
  }
});

test('V221D2F1-06 : les faux positifs historiques du signal B restent évités', () => {
  /* Ces deux questions nomment une production tout en interrogeant la situation de la personne.
     Le rattrapage lexical les sauvait de justesse ; le fait déclaré les met simplement hors de
     cause, et « livrables » dans la phrase n'a plus aucun effet. */
  for (const texte of ['Combien de personnes vont participer ?',
                       'Où stockez-vous vos livrables actuellement ?',
                       'Combien de documents devez-vous fournir ?']) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: SITUATION }), false, `« ${texte} »`);
    assert.equal(assessSolicitation(
      { type: 'ASK_CLARIFICATION', text: texte, question_focus: SITUATION }, []), 'ALLOW', `« ${texte} »`);
  }
});

/* ==========================================================================
 * D2F1-07 — LE VOCABULAIRE A QUITTÉ LE CHEMIN DE PRODUCTION
 * ======================================================================= */

test('V221D2F1-07 : plus aucun vocabulaire ne décide les signaux A et B', () => {
  for (const disparu of ['NOMS_DE_PRODUCTION', 'VERBES_D_OBTENTION', 'VARIABLES_DU_PROBLEME']) {
    assert.equal(source.includes(disparu), false, `${disparu} a quitté le module, commentaires compris`);
  }
  assert.equal((source.match(/^const [A-Z_]+ = \//gmu) || []).length, 5, 'neuf avant D2F1, cinq après D2F2');
  /* Le seul motif lexical restant sert le signal C, et rien d'autre : deux occurrences, sa
     définition et son unique usage. */
  assert.equal(source.includes('INTERROGE_LA_PRODUCTION'), false);
  /* Aucun vocabulaire n'a été recréé ailleurs, sous un autre nom. */
  for (const corps of [questionTargetsOwnOutput.toString(), questionAsksConcreteVariable.toString()]) {
    assert.equal(/\/.*\|.*\//u.test(corps), false, 'aucune alternative de motif dans ces deux fonctions');
    assert.ok(corps.length < 160, 'ces deux prédicats tiennent désormais en une comparaison');
  }
});

/* ==========================================================================
 * D2F1-08 / 09 / 10 — CE QUI NE DEVAIT PAS BOUGER N'A PAS BOUGÉ
 * ======================================================================= */

test('V221D2F1-08 : une réception sans question reste inchangée, et ne déclare rien', () => {
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Reçu.' }, snapshot());
  assert.equal(v.ok, true);
  assert.equal(v.interaction.question_focus, null, 'rien n’est interrogé, rien n’est déclaré');
  assert.equal(v.interaction.can_mark_ready, false, 'et le plan rapide ne prononce toujours aucun état');
});

test('V221D2F1-09 : une escalade reste une escalade, sans fait à déclarer', () => {
  const v = validateFastInteraction(
    { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Deux exigences s’excluent.', question_focus: null }, snapshot());
  assert.equal(v.ok, true);
  assert.equal(v.interaction.question_focus, null);
  assert.deepEqual(guardFastInteraction(
    { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'x' }, snapshot()), { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'x' });
});

test('V221D2F1-10 : l’absence du champ n’est jamais une erreur — lecture tolérante, écriture stricte', () => {
  /* Le schéma l'exige du MODÈLE ; le validateur tolère son absence, pour que rien de ce qui a été
     écrit avant ce lot ne devienne invalide. Même contrat que available_inputs et objective_nature. */
  assert.equal(validateFastInteraction({ type: 'ASK_CLARIFICATION', text: 'Combien ?' }, snapshot()).interaction.question_focus, null);
  const q = validateQuestionCandidate({ text: 'Combien ?', targets_issue_id: 'I1', expected_progress: 'x' });
  assert.equal(q.question_focus, null);
  /* Et sans fait, la frontière n'accuse rien : elle échoue fermé. */
  assert.equal(isMetaOutputQuestion('Quel type de résultat attendez-vous ?'), false);
  assert.equal(ARBITER_JSON_SCHEMA.properties.next_question.required.includes('question_focus'), true);
});

/* ==========================================================================
 * D2F1-11 — LE FAIT TRAVERSE LA FRONTIÈRE PROFONDE
 * ======================================================================= */

test('V221D2F1-11 : la frontière lit le fait porté par la question elle-même', () => {
  const tour = (focus) => Object.freeze({
    state: 'clarification_required', objective_nature: 'production',
    next_question: Object.freeze({ text: 'Quel type de résultat attendez-vous ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: focus }),
    operational_request_candidate: Object.freeze({ a: 1 }), issues: Object.freeze([]), reason: 'r'
  });
  /* Même texte, même demande : seul le fait déclaré change le verdict. */
  assert.equal(applyDisplayGuardToTurn(tour(SITUATION), { question_candidates: [] }, () => {})
    .next_question.text, 'Quel type de résultat attendez-vous ?');
  /* TRACER-REMEDIATION-02 · F2 — LE REFUS EST INCHANGÉ, CE QU'IL PRODUIT NE L'EST PLUS.
     Ce test affirmait « .next_question.text === null » : la frontière rendait un tour qui réclamait
     une clarification sans la poser. Mesuré en production, la personne recevait un état exigeant une
     réponse et rien à quoi répondre. Le refus lui-même — ce que ce test garde vraiment — est intact ;
     seule sa conséquence a changé : la sortie est déclarée inexploitable au lieu d'être rendue. */
  assert.throws(() => applyDisplayGuardToTurn(tour(NOTRE_SORTIE), { question_candidates: [] }, () => {}),
    (e) => e.code === 'turn_contractually_unusable',
    'refusée, et rien n’est fabriqué à la place — le tour n’est pas rendu');
  /* Une candidate de remplacement est jugée sur SON propre fait, jamais sur celui d'une autre. */
  const remplace = guardDisplayedQuestion('Quel type de résultat attendez-vous ?', {
    questionFocus: NOTRE_SORTIE,
    candidates: [{ text: 'Combien de jours prévoyez-vous ?', question_focus: SITUATION }]
  });
  assert.equal(remplace.verdict, 'REPLACED');
  assert.equal(remplace.text, 'Combien de jours prévoyez-vous ?');
});

/* ==========================================================================
 * D2F1-12 — LES DEUX CONSIGNES DÉFINISSENT LE FAIT, SANS LISTE NI DOMAINE
 * ======================================================================= */

test('V221D2F1-12 : les deux auteurs reçoivent la même définition, générique', () => {
  for (const [nom, consigne] of [['profond', CORE_SYSTEM_PROMPT], ['rapide', FAST_INTERACTION_SYSTEM_PROMPT]]) {
    for (const valeur of QUESTION_FOCUS_VALUES) {
      assert.ok(consigne.includes(valeur), `la consigne ${nom} nomme ${valeur}`);
    }
    /* Elle dit ce qu'il faut juger, et ne nomme aucun domaine ni aucun format. */
    for (const mot of ['markdown', 'pdf', 'rapport', 'tableau', 'voyage', 'facture', 'réunion']) {
      assert.equal(new RegExp(`\\b${mot}`, 'iu').test(consigne), false, `« ${mot} » dans la consigne ${nom}`);
    }
  }
  /* Et le plan rapide ne s'est vu confier aucune responsabilité supplémentaire au passage. */
  for (const interdit of ['READY', 'exécuter', 'livrable', 'Analyste', 'Critique', 'Arbitre']) {
    assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.includes(interdit), false, interdit);
  }
});
