/* ATELIER PROMPTS V2.2.1-D2B — LE GARDE MÉTA DISAIT-IL LA VÉRITÉ ?
 * ================================================================================
 *
 * CE QUE D2A AVAIT LAISSÉ OUVERT. D2A a montré que l'identité sémantique d'une clarification ne
 * permet pas de séparer une bonne question d'une question méta : trois cas mesurés portaient
 * l'identité RIGOUREUSEMENT identique `[deliverable_unclear/material/question/sub=false]` pour des
 * légitimités opposées. La piste du contrat d'identité est close. Restait la question que personne
 * n'avait posée : le garde lexical, lui, fonctionne-t-il ?
 *
 * LA MESURE. Sur huit sorties du plan profond réel, le garde méta a marqué ZÉRO question — y
 * compris celles qui appartiennent précisément à la classe qu'il est censé intercepter. Un garde
 * qui ne marque rien n'est pas une protection : c'est une croyance.
 *
 * LA CAUSE, ET ELLE TIENT EN UN CARACTÈRE. `VARIABLES_DU_PROBLEME` reconnaît les interrogatifs de
 * catégorie — combien, quand, à qui, où — pour RATTRAPER une question qui nomme une production tout
 * en demandant une variable du problème. Les formes non accentuées y sont tolérées partout :
 * « a qui », « a quelle date ». Pour « où », cette tolérance s'écrivait `o[ùu]` — et elle
 * reconnaissait donc la conjonction « ou ». Or les énumérations de l'autorité finissent
 * pratiquement toutes par « … ou autre chose ? ». Le rattrapage se déclenchait sur presque tout, et
 * éteignait le garde.
 *
 * POURQUOI LA TOLÉRANCE VALAIT AILLEURS ET PAS ICI. « a qui », « a quelle date » sont suivis d'un
 * second mot qui lève l'ambiguïté. « ou » n'a pas de second mot : sans son accent, ce n'est pas une
 * graphie fautive de l'interrogatif, c'est une AUTRE unité de la langue — et l'une des plus
 * fréquentes du français. La tolérance est retirée pour ce jeton, et pour lui seul.
 *
 * CE QUI N'A PAS ÉTÉ CORRIGÉ, ET POURQUOI C'EST ÉCRIT ICI. Le second défaut mesuré — l'exemption
 * qui désarme le garde dès que la demande NOMME un livrable — reste en place. Voir D2B-05 : toute
 * réparation essayée détruisait un cas légitime que V211-04 protège à juste titre.
 * ============================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isMetaOutputQuestion, questionTargetsOwnOutput, questionAsksConcreteVariable,
  requestIsAboutItsOwnForm, assessSolicitation, isAtomicQuestion, guardFastSolicitation,
  SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';

const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const q = (text) => ({ type: 'ASK_CLARIFICATION', text });

/* ==========================================================================
 * D2B-01 — « OU » N'EST PAS « OÙ » : LA PAIRE MINIMALE
 * ======================================================================= */

test('V221D2B-01 : la classe de défaut « ou » / « où » est devenue impossible', () => {
  /* CE QUE CE LOT AVAIT RÉPARÉ, ET CE QUI EST ARRIVÉ ENSUITE.
   *
   * D2B avait trouvé qu'un motif destiné à l'interrogatif « où » reconnaissait la conjonction
   * « ou », si bien qu'ajouter « — un rapport ou une note ? » à une question méta suffisait à
   * l'innocenter. La réparation a tenu, et elle a rendu le garde mesurablement utile.
   *
   * V2.2.1-D2F1 est allé plus loin que la réparation : le motif lui-même n'existe plus, parce que
   * le garde ne lit plus le texte pour décider. La classe entière de ce défaut — un mot qui en
   * cache un autre — a donc quitté le chemin de production. On le prouve par ce qui reste dans le
   * module, et par le fait que la formulation n'a plus aucun effet sur le verdict. */
  assert.equal(/o\[ùu\]/u.test(source), false, 'le motif fautif a disparu');
  assert.equal(source.includes('VARIABLES_DU_PROBLEME'), false, 'et le motif entier avec lui');
  /* La paire minimale d'origine : deux formulations, un seul fait, un seul verdict. */
  const nue = 'Quel type de résultat attendez-vous ?';
  const avecOu = 'Quel type de résultat attendez-vous — un rapport ou une note ?';
  for (const texte of [nue, avecOu]) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: 'output_specification' }), true,
      'la conjonction n’a plus aucune prise sur le verdict');
  }
});

test('V221D2B-02 : plus aucun vocabulaire ne décide ce que la question interroge', () => {
  /* Les trois motifs qui portaient les signaux A et B ont quitté le module. Ce qui subsiste sert
     soit le fait n°2 (signal C, traité par D2F2), soit les compteurs de FORME, qui ne connaissent
     aucun domaine. */
  for (const disparu of ['NOMS_DE_PRODUCTION', 'VERBES_D_OBTENTION', 'VARIABLES_DU_PROBLEME']) {
    assert.equal(source.includes(disparu), false, `${disparu} a quitté le module`);
  }
  assert.equal((source.match(/^const [A-Z_]+ = \//gmu) || []).length, 5, 'neuf motifs avant D2F1, cinq après D2F2');
});

test('V221D2B-03 : les deux signaux lisent le fait déclaré, et rien d’autre', () => {
  assert.equal(questionAsksConcreteVariable('problem_or_user_context'), true);
  assert.equal(questionAsksConcreteVariable('output_specification'), false);
  assert.equal(questionTargetsOwnOutput('output_specification'), true);
  assert.equal(questionTargetsOwnOutput('problem_or_user_context'), false);
  /* Sans fait, aucun des deux ne se prononce : on échoue fermé. */
  assert.equal(questionTargetsOwnOutput(null), false);
  assert.equal(questionAsksConcreteVariable(null), false);
});

/* ==========================================================================
 * D2B-04 — AUCUN FAUX POSITIF INVERSE
 * ======================================================================= */

test('V221D2B-04 : de bonnes questions contenant naturellement « ou » restent autorisées', () => {
  /* Le risque d'une correction comme celle-ci est de rendre méta des questions qui ne le sont pas.
     Ces quatre-là portent toutes une conjonction, et aucune n'interroge notre production. */
  const bonnes = [
    ['Je veux préparer un déplacement.', 'Partez-vous seul ou accompagné ?'],
    ['Organise une formation interne.', 'La formation se tient-elle en présentiel ou à distance ?'],
    ['Prépare la réunion de service.', 'Souhaitez-vous inviter les prestataires ou seulement les salariés ?'],
    ['Rédige le règlement du tournoi.', 'Le départage se joue-t-il au point ou à la partie ?']
  ];
  for (const [demande, question] of bonnes) {
    assert.equal(isMetaOutputQuestion(question), false, `« ${question} »`);
    assert.equal(assessSolicitation(q(question), [], false, demande), 'ALLOW', `« ${question} »`);
  }
});

/* ==========================================================================
 * D2B-05 — LE DÉFAUT HISTORIQUE : CE QUI EST PROTÉGÉ, ET CE QUI NE L'EST PAS
 * ======================================================================= */

test('V221D2B-05 : la question historique est refusée, y compris dans son contexte réel', () => {
  /* CE TEST ÉPINGLAIT UN ÉCART. IL ÉPINGLE MAINTENANT SA FERMETURE.
   *
   * D2B avait mesuré que la question reçue par le propriétaire n'était PAS refusée dans la demande
   * qui l'avait produite : `requestIsAboutItsOwnForm` exemptait toute demande où figurait un nom de
   * production, et celle-ci contient « document ». La cause était nommée ici, faute de réparation
   * minimale — toute correction lexicale essayée détruisait le cas légitime de V211-04.
   *
   * V2.2.1-D2D a levé la cause sans lexique : la nature de l'objectif est désormais énoncée par
   * l'autorité, et le garde la lit au lieu de la deviner. Nommer un livrable n'exempte plus rien. */
  const question = 'Quel type de contenu doit être inclus dans ce document ?';
  const contexteReel = 'J’ai besoin d’un document pour ma réunion.';
  assert.equal(isMetaOutputQuestion(question, { questionFocus: 'output_specification' }), true, 'jugée seule : refusée');
  assert.equal(isMetaOutputQuestion(question, { objectiveNature: null, questionFocus: 'output_specification' }), true,
    'dans son contexte réel : refusée aussi');
  /* L'exemption ne se déclenche plus sur le seul nom du livrable. */
  assert.equal(requestIsAboutItsOwnForm({}), false, 'nommer un document n’est pas demander une mise en forme');
  assert.equal(questionTargetsOwnOutput('output_specification'), true, 'le signal A lit le fait déclaré');
});


/* ==========================================================================
 * D2B-06 — CE QUE SEUL LE GARDE MÉTA ATTRAPE
 * ======================================================================= */

test('V221D2B-06 : les gardes structurels laissent passer ces questions, le garde méta non', () => {
  /* Le chiffre qui décide du sort du lexique. Ces questions sont ATOMIQUES : une seule
     interrogation, aucune énumération. Tout ce qui compte des formes les accepte. Seul le garde
     méta les refuse — et leur refus est juste, car chacune demande à la personne de concevoir ce
     que nous sommes chargés de produire. */
  const capturesUniques = [
    'Quel type de contenu doit être inclus dans ce document ?',
    'Quel type de résultat attendez-vous ?',
    'Quel type de résultat attendez-vous — un rapport ou une note ?'
  ];
  for (const texte of capturesUniques) {
    assert.equal(isAtomicQuestion(texte), true, `« ${texte} » est atomique : la forme ne la refuse pas`);
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: 'output_specification' }), true,
      `« ${texte} » n’est refusée que par le garde méta`);
    assert.deepEqual(guardFastSolicitation({ ...q(texte), question_focus: 'output_specification' }, {}), SILENT_INTERACTION);
  }
});

/* ==========================================================================
 * D2B-07 — AUCUNE RÈGLE AJOUTÉE
 * ======================================================================= */

test('V221D2B-07 : la correction ne fait que retirer — rien n’a jamais été ajouté au lexique', () => {
  /* D2B interdisait tout nouveau mot ; D2F1 est allé jusqu'au retrait. Six motifs subsistent : un
     seul est décisionnel et lexical (INTERROGE_LA_PRODUCTION, réservé au fait n°2), les cinq autres
     comptent des formes grammaticales et ne connaissent aucun domaine. */
  assert.equal((source.match(/^const [A-Z_]+ = \//gmu) || []).length, 5);
  for (const forme of ['INTERROGATIFS', 'COORDINATION', 'VERBE_INVERSE', 'AJOUTE_UN_BESOIN', 'PARENTHESE_ENUMERANTE']) {
    assert.equal(source.includes(forme), true, `${forme} compte une forme, il ne nomme aucun domaine`);
  }
  assert.match(source, /countInterrogations\(texte\) >= 2/u, 'seuil des interrogations inchangé');
  assert.match(source, /countNamedAlternatives\(texte\) >= 3/u, 'seuil du catalogue inchangé');
});

