/* TRACER-REMEDIATION-02 · F4 — UNE QUESTION PORTE UN SEUL MANQUE.
 * ============================================================================
 *
 * CE QUE LA CAMPAGNE PRODUIT A MESURÉ. Deux questions réelles, affichées telles quelles :
 *
 *   « Pouvez-vous m'indiquer le nom du candidat retenu, le nom du candidat non retenu,
 *      l'intitulé du poste et le nom de votre organisation ? »          -> quatre demandes
 *   « Quels sont le prénom, le poste et l'ancienneté de la personne qui part ? » -> trois
 *
 * Le garde d'atomicité existait, et il les a laissées passer. Sa raison était nommée : il ne
 * comptait une énumération que derrière un marqueur de CHOIX OFFERT — un deux-points, ou un « ou ».
 * La liste coordonnée par « et » ne propose rien au choix : elle demande tout en même temps. C'est
 * la forme la plus courante, et c'était l'angle mort.
 *
 * CE QUI A ÉTÉ CORRIGÉ, ET OÙ. En deux endroits, dans cet ordre de responsabilité :
 *
 *   1. L'AUTORITÉ, d'abord. Sa consigne lui dit désormais de choisir le manque le plus déterminant
 *      du tour et de mettre les autres dans question_candidates, un par entrée. C'est elle qui sait
 *      lequel débloque le plus ; aucune frontière ne peut le décider à sa place.
 *   2. LE GARDE, ensuite, comme filet. Il reconnaît la liste coordonnée et le tiret qui introduit
 *      une énumération. Il ne tronque rien : il refuse, et la frontière prend une autre candidate
 *      du même tour.
 *
 * CE QUI N'EST PAS FAIT. Aucune question n'est coupée après coup pour la rendre atomique — couper
 * « A, B et C » en « A » fabriquerait une question dont personne n'est l'auteur. Et rien de ce qui
 * est mesuré ici n'est un mot : ce sont des positions grammaticales, et la borne — trois segments —
 * est celle qui existait déjà.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAtomicQuestion, countTargetedDimensions, guardDisplayedQuestion } from '../workers/shared/solicitation-policy.js';
import { CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';

const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

/* ==========================================================================
 * F4-01 — LES DEUX QUESTIONS RÉELLEMENT MESURÉES
 * ======================================================================= */

test('T-F4-01 : les deux questions multiples mesurées en campagne sont refusées', () => {
  const S14 = "Pouvez-vous m'indiquer le nom du candidat retenu, le nom du candidat non retenu, l'intitulé du poste et le nom de votre organisation ?";
  const S18 = 'Quels sont le prénom, le poste et l’ancienneté de la personne qui part à la retraite ?';
  assert.equal(isAtomicQuestion(S14), false, 'quatre demandes dans une enveloppe');
  assert.equal(isAtomicQuestion(S18), false, 'trois demandes dans une enveloppe');
  /* Ce qui compte est le FRANCHISSEMENT de la borne — deux manques sont deux questions — pas le
     décompte exact, qui dépend de la découpe et n'a aucune valeur d'invariant. */
  assert.ok(countTargetedDimensions(S14) >= 2, 'plusieurs dimensions visées');
  assert.ok(countTargetedDimensions(S18) >= 2, 'plusieurs dimensions visées');
});

test('T-F4-02 : cinq autres formes multi-manques, toutes refusées', () => {
  for (const q of [
    'Quels sont les éléments concrets — jalons atteints, points bloquants, risques, prochaines étapes ?',
    'Pourriez-vous me communiquer les données des incidents — date, description et action corrective ?',
    'Un itinéraire jour par jour, une sélection par thème, une checklist, ou autre chose ?',
    'Quelle est la date, le lieu et le nombre de participants ?',
    'Précisez le public, le ton et la longueur attendue du message ?',
    'Quel est votre budget et la durée du séjour ?',
    'Quelle est la date et le lieu du déménagement ?'
  ]) {
    assert.equal(isAtomicQuestion(q), false, `MULTI_QUESTION_VIOLATION attendue : ${q.slice(0, 50)}…`);
  }
});

/* ==========================================================================
 * F4-03 — CE QUI RESTE UNE SEULE QUESTION, ET DOIT PASSER
 * ======================================================================= */

test('T-F4-03 : une apposition, une incise et deux éléments coordonnés ne sont pas des listes', () => {
  /* Le risque d'un contrôle de forme est de refuser ce qui est légitime. Ces cinq-là passent, et
     c'est aussi important que les refus ci-dessus. */
  for (const q of [
    'Quelle est la date prévue du déménagement ?',
    'Quel est le délai, en semaines, pour ce projet ?',
    'Quel est le nom du stagiaire, celui qui part vendredi ?',
    'Quel est le nom du stagiaire — celui qui part vendredi ?',
    'Depuis quelle ville partez-vous pour ce déplacement professionnel ?',
    'Quel jour préférez-vous : lundi, mardi ou mercredi ?',
  ]) {
    assert.equal(isAtomicQuestion(q), true, `refus injustifié : ${q}`);
  }
});

/* ==========================================================================
 * F4-04 — LA FRONTIÈRE PRÉFÈRE UNE AUTRE CANDIDATE, ELLE NE COUPE PAS
 * ======================================================================= */

test('T-F4-04 : une question multiple est remplacée par une candidate du même tour, jamais tronquée', () => {
  const multiple = 'Quels sont le prénom, le poste et l’ancienneté de la personne qui part ?';
  const garde = guardDisplayedQuestion(multiple, {
    questionFocus: 'problem_or_user_context',
    candidates: [
      { text: multiple, question_focus: 'problem_or_user_context' },
      { text: 'Quel est le prénom de la personne qui part ?', question_focus: 'problem_or_user_context' }
    ]
  });
  assert.equal(garde.verdict, 'REPLACED');
  assert.equal(garde.text, 'Quel est le prénom de la personne qui part ?');
  assert.equal(garde.text.includes(','), false, 'ce qui est montré n’est pas un morceau de la liste');
});

/* ==========================================================================
 * F4-05 — LA RESPONSABILITÉ PREMIÈRE EST CELLE DE L'AUTORITÉ
 * ======================================================================= */

test('T-F4-05 : la consigne de l’autorité lui demande de choisir le manque déterminant', () => {
  assert.match(CORE_SYSTEM_PROMPT, /UNE QUESTION PORTE UN SEUL MANQUE/);
  assert.match(CORE_SYSTEM_PROMPT, /Choisissez le manque le plus déterminant pour ce tour/);
  assert.match(CORE_SYSTEM_PROMPT, /Mettez les autres manques dans question_candidates, un par entrée/);
  /* Et rien n'y fixe un nombre de questions : ce serait un quota, pas un critère. Les candidates
     restent classées par valeur informationnelle, ce qui est exactement l'ordre dans lequel la
     frontière les essaie. */
  assert.match(CORE_SYSTEM_PROMPT, /Ce n'est pas un quota/);
  assert.match(CORE_SYSTEM_PROMPT, /classées par valeur informationnelle décroissante/);
});

test('T-F4-06 : aucun mot de domaine n’est entré dans le contrôle d’atomicité', () => {
  const source = lire('../workers/shared/solicitation-policy.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const debut = source.indexOf('export function countTargetedDimensions');
  const corps = source.slice(debut, source.indexOf('\n}', debut));
  for (const interdit of ['nom', 'poste', 'date', 'budget', 'candidat', 'public', 'format']) {
    assert.equal(new RegExp(`['"\`][^'"\`]*\\b${interdit}\\b`, 'i').test(corps), false,
      `aucun vocabulaire de situation (${interdit})`);
  }
  assert.equal(/0\.\d/.test(corps), false, 'aucun seuil décimal');
});
