/* TARGETED-FIX-POST-CODEX-01 — CE QUE LE CONTRE-AUDIT A DÉMONTRÉ, ET CE QUI L'EMPÊCHE DE REVENIR.
 * ============================================================================
 *
 * Quatre défauts ont été reproduits par un auditeur indépendant sur la version déployée. Aucun
 * n'était visible depuis les suites existantes, et deux venaient de corrections précédentes mal
 * raccordées — ce qui vaut d'être dit : une correction qui passe ses propres tests peut être
 * inerte, et c'est exactement ce qui s'était produit.
 *
 *   1. LE PLAN RAPIDE NE NOMMAIT PAS CE QUI MANQUE. Son schéma portait trois champs. Une question
 *      rapide répondue laissait donc l'historique sans identité, et une reformulation ultérieure du
 *      même manque par le plan profond redevenait invisible. Mesuré en usage réel : cinq questions
 *      sur six venaient de ce plan.
 *
 *   2. LE SECOURS TEXTUEL ÉTAIT DÉBRANCHÉ. La frontière profonde appelait le détecteur de
 *      répétition avec une chaîne VIDE : il sortait aussitôt. Même une question reposée MOT POUR
 *      MOT passait, dès lors qu'aucune identité n'accompagnait l'historique.
 *
 *   3. LE REMPLACEMENT MENTAIT. Quand le garde substituait une candidate, l'appelant recollait son
 *      TEXTE sur l'objet question d'origine : on affichait une question sur une dimension sous
 *      l'identité d'une autre. Tout ce qui dépend de cette identité désignait alors autre chose que
 *      ce que la personne lisait.
 *
 *   4. L'ATOMICITÉ COMPTAIT LA SURFACE. Des virgules et des « et », avec une borne à trois. Deux
 *      contre-exemples renversent ce compte dans les deux sens — un choix de valeurs refusé à tort,
 *      une conjonction de deux dimensions acceptée à tort.
 *
 * Ce fichier ne garde AUCUNE formulation de question et AUCUN domaine : ce qu'il éprouve est la
 * mécanique, sur des cas construits pour elle.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isAtomicQuestion, countTargetedDimensions, guardDisplayedQuestion, isRepeatedSolicitation
} from '../workers/shared/solicitation-policy.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import {
  FAST_INTERACTION_JSON_SCHEMA, validateFastInteraction, createTurnSnapshot
} from '../workers/shared/fast-interactive-plane.js';
import { handleFastInteractionRequest, FAST_INTERACTION_PATHNAME } from '../workers/shared/fast-interaction-endpoint.js';
import { OPRIE_CLARIFICATION_DOCTRINE } from '../workers/shared/operational-request-core.js';

const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const question = (text, { focus = 'problem_or_user_context', id = null, issue = 'I1' } = {}) =>
  ({ text, targets_issue_id: issue, expected_progress: 'p', question_focus: focus, missing_determinant_id: id });

const tour = (q, { requestFocus = 'user_problem_or_goal' } = {}) => ({
  state: 'clarification_required',
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'D.' },
  objective_nature: 'production', request_focus: requestFocus, output_format: null,
  issues: [{ id: 'I1', type: 'missing_information', description: 'd', impact: 'material',
    substitutable: false, recommended_treatment: 'question', kind: null }],
  next_question: q, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'r'
});

/* ==========================================================================
 * T1 — LE PLAN RAPIDE NOMME CE QUI MANQUE, ET CELA TRAVERSE
 * ======================================================================= */

test('T1 : le plan rapide déclare l’identité du manque, et la porte réseau la transporte', async () => {
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.required.includes('missing_determinant_id'), true,
    'le champ est EXIGÉ du modèle');
  const v = validateFastInteraction(
    { type: 'ASK_CLARIFICATION', text: 'Q ?', question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_a' },
    createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
  assert.equal(v.interaction.missing_determinant_id, 'manque_a');

  const res = await handleFastInteractionRequest(
    new Request(`https://w.dev${FAST_INTERACTION_PATHNAME}`, {
      method: 'POST', headers: { Origin: 'https://a.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn_id: 1, original_request: 'x', clarification_history: [], current_answer: null, canonical_version: 0 })
    }),
    { ALLOWED_ORIGINS: 'https://a.test' },
    { executeFast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q ?', question_focus: 'problem_or_user_context', missing_determinant_id: 'manque_a' }) });
  const json = await res.json();
  assert.deepEqual(Object.keys(json).sort(), ['explicit_unknown_determinant_ids', 'missing_determinant_id', 'question_focus', 'text', 'type']);
  assert.equal(json.missing_determinant_id, 'manque_a');
  /* Lecture tolérante : un fournisseur qui l’omet ne casse rien, l’identité vaut null. */
  const sans = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Reçu.' },
    createTurnSnapshot({ turn_id: 1, original_request: 'x' }));
  assert.equal(sans.interaction.missing_determinant_id, null);
});

test('T1b : un manque posé par le plan RAPIDE, reformulé par le plan profond, est reconnu', () => {
  /* Le défaut exact : la question venait du plan rapide, l’historique n’en gardait rien, et le plan
     profond redemandait la même chose autrement. */
  const historique = [{ turn: 1, question: 'Première formulation ?', answer: 'sa réponse',
    provenance: 'user', missing_determinant_id: 'manque_a' }];
  assert.throws(() => applyDisplayGuardToTurn(
    tour(question('Seconde formulation, tout autre texte ?', { id: 'manque_a' })),
    { question_candidates: [] }, () => {}, historique),
    (e) => e.code === 'turn_contractually_unusable',
    'le même manque ne repart pas sous une autre formulation');
});

/* ==========================================================================
 * T2 — LE SECOURS TEXTUEL, SANS IDENTITÉ
 * ======================================================================= */

test('T2 : sans identité, une question reposée MOT POUR MOT est refusée', () => {
  const historique = [{ turn: 1, question: 'Exactement la même question ?', answer: 'sa réponse', provenance: 'user' }];
  assert.equal('missing_determinant_id' in historique[0], false, 'historique antérieur, sans identité');
  assert.throws(() => applyDisplayGuardToTurn(
    tour(question('Exactement la même question ?', { id: null })),
    { question_candidates: [] }, () => {}, historique),
    (e) => e.code === 'turn_contractually_unusable');
});

test('T2b : le secours reste une ÉGALITÉ — un texte différent sans identité passe', () => {
  const historique = [{ turn: 1, question: 'Une question ?', answer: 'sa réponse', provenance: 'user' }];
  const rendu = applyDisplayGuardToTurn(
    tour(question('Une autre question, sur autre chose ?', { id: null })),
    { question_candidates: [] }, () => {}, historique);
  assert.equal(rendu.next_question.text, 'Une autre question, sur autre chose ?');
  /* Aucune ressemblance n’est évaluée. La comparaison normalise la casse et la ponctuation — deux
     écritures du MÊME texte restent le même texte — mais elle s’arrête là : un mot de plus, et ce
     n’est plus la même question. C’est une égalité, pas une distance. */
  assert.equal(isRepeatedSolicitation('Une question ?!', historique, null), true, 'même texte, ponctuation près');
  assert.equal(isRepeatedSolicitation('Une question précise ?', historique, null), false, 'un mot de plus : autre question');
});

/* ==========================================================================
 * T3 — LE REMPLACEMENT REND UNE QUESTION COHÉRENTE
 * ======================================================================= */

test('T3 : texte affiché et identité affichée décrivent le MÊME manque', () => {
  /* La question principale est méta : elle sera refusée. La candidate porte un autre manque. */
  const principale = question('Quel format souhaitez-vous pour le livrable ?',
    { focus: 'output_specification', id: 'manque_forme', issue: 'I1' });
  const remplaçante = { text: 'Quelle est la donnée manquante ?', targets_issue_id: 'I2',
    expected_progress: 'autre progression', question_focus: 'problem_or_user_context',
    missing_determinant_id: 'manque_b' };
  const rendu = applyDisplayGuardToTurn(tour(principale), { question_candidates: [remplaçante] }, () => {});
  const q = rendu.next_question;
  assert.equal(q.text, remplaçante.text);
  assert.equal(q.missing_determinant_id, 'manque_b', 'l’identité suit le texte, elle ne reste pas en arrière');
  assert.equal(q.targets_issue_id, 'I2', 'l’inconnue visée est celle de la candidate');
  assert.equal(q.expected_progress, 'autre progression');
  assert.equal(q.question_focus, 'problem_or_user_context');
  /* Aucun champ de la question refusée ne survit à la substitution. */
  assert.notEqual(q.missing_determinant_id, principale.missing_determinant_id);
  assert.notEqual(q.targets_issue_id, principale.targets_issue_id);
});

/* ==========================================================================
 * T4 / T5 — ATOMICITÉ SÉMANTIQUE
 * ======================================================================= */

test('T4 : un choix de VALEURS sur une seule dimension reste une seule question', () => {
  for (const q of [
    'Quel jour préférez-vous : lundi, mardi ou mercredi ?',
    'Préférez-vous la première option ou la seconde ?',
    'Quel est le délai, en semaines, pour ce projet ?',
    'Quelle est la date — jour et mois ?'
  ]) {
    assert.equal(isAtomicQuestion(q), true, `refus injustifié : ${q}`);
    assert.ok(countTargetedDimensions(q) < 2, `une seule dimension : ${q}`);
  }
});

test('T5 : une conjonction de DEUX dimensions n’est pas une seule question', () => {
  for (const q of [
    'Quel est votre budget et la durée du séjour ?',
    'Quelle est la date et le lieu de l’événement ?',
    'Quels sont le premier élément, le deuxième et le troisième ?',
    'Quels sont les points — le premier, le deuxième, le troisième, le quatrième ?'
  ]) {
    assert.equal(isAtomicQuestion(q), false, `devrait être refusée : ${q}`);
    assert.ok(countTargetedDimensions(q) >= 2, `plusieurs dimensions : ${q}`);
  }
});

test('T5b : le critère porte sur les dimensions, pas sur la ponctuation', () => {
  const source = lire('../workers/shared/solicitation-policy.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(source.includes('countEnumeratedSegments'), false, 'le compte de segments a disparu');
  const debut = source.indexOf('export function countTargetedDimensions');
  const corps = source.slice(debut, source.indexOf('\n}', debut));
  assert.equal(/0\.\d/.test(corps), false, 'aucun seuil décimal');
  for (const mot of ['budget', 'date', 'lieu', 'jour', 'durée', 'public', 'format'])
    assert.equal(new RegExp(`['"\`][^'"\`]*\\b${mot}\\b`, 'i').test(corps), false, `aucun vocabulaire (${mot})`);
});

/* ==========================================================================
 * T6 — MATÉRIALITÉ N'EST PAS NON-SUBSTITUABILITÉ
 * ======================================================================= */

test('T6 : la doctrine sépare ce qui ouvre une question de ce qui la justifie', () => {
  /* Le cas humain qui a motivé ce lot — une demande courte, six questions — n'est PAS encodé ici :
     ce test ne dit pas « zéro question » pour un sujet donné. Il vérifie la règle générique dont
     l'absence produisait ce comportement. */
  const d = OPRIE_CLARIFICATION_DOCTRINE;
  assert.match(d, /il OUVRE la question, il ne la justifie pas/);
  assert.match(d, /Être matériel et être non substituable sont deux choses distinctes/);
  assert.match(d, /les TROIS conditions tiennent ensemble/);
  assert.match(d, /AU NIVEAU D'ENGAGEMENT DEMANDÉ/);
  assert.match(d, /Si plusieurs inconnues restent matérielles mais toutes substituables, PRODUISEZ/);
  /* Et la contrepartie, sans laquelle la règle deviendrait une licence d'inventer. */
  assert.match(d, /là où l'arbitrage appartient vraiment à la personne, ne l'inventez jamais/);
  /* Aucun domaine n'entre dans la doctrine. */
  for (const mot of ['voyage', 'londres', 'hébergement', 'transport', 'recrutement', 'santé'])
    assert.equal(new RegExp(`\\b${mot}\\b`, 'i').test(d), false, `aucun domaine (${mot})`);
});

/* ==========================================================================
 * T7 / T8 / T9 — NON-RÉGRESSION
 * ======================================================================= */

test('T7 : F1 — aucune dérivation lexicale du format n’est revenue', () => {
  const enrichissement = lire('../core/adn/rapide-canonical-enrichment.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(enrichissement.includes('deriveFormatFromRequest'), false);
  assert.equal(/markers/.test(enrichissement), false);
  const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');
  assert.match(html, /if\(rapideContratCanonique\)return RAPIDE_FORMAT_NEUTRE/,
    'le détecteur historique reste muet sous contrat');
});

test('T8 : F2 — un état exigeant une clarification en fournit une, ou la sortie est refusée', () => {
  const rendu = applyDisplayGuardToTurn(tour(question('Une question affichable ?', { id: 'manque_a' })), {});
  assert.equal(rendu.next_question.text, 'Une question affichable ?');
  assert.throws(() => applyDisplayGuardToTurn(
    tour(question('Quel format souhaitez-vous ?', { focus: 'output_specification', id: 'manque_forme' })),
    { question_candidates: [] }),
    (e) => e.code === 'turn_contractually_unusable');
});

test('T9 : F5 — profond→profond, la reformulation du même manque reste reconnue', () => {
  const historique = [{ turn: 1, question: 'Formulation initiale ?', answer: 'réponse',
    provenance: 'user', missing_determinant_id: 'manque_c' }];
  assert.equal(isRepeatedSolicitation('Toute autre formulation ?', historique, 'manque_c'), true);
  assert.equal(isRepeatedSolicitation('Toute autre formulation ?', historique, 'manque_d'), false);
  /* Une identité PROCHE n’est pas la même identité : aucune tolérance. */
  assert.equal(isRepeatedSolicitation('Autre ?', historique, 'manque_c '), true, 'espaces tolérés');
  assert.equal(isRepeatedSolicitation('Autre ?', historique, 'manque_cc'), false);
});

/* ==========================================================================
 * T10 — LE CHEMIN ARCHITECTE PREND SA FORME DU CONTRAT
 * ======================================================================= */

test('T10 : Architecte prend la forme du contrat, jamais d’un score de mots', () => {
  const arch = lire('../core/adn/arch-canonical-enrichment.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(arch, /setIfAbsent\('format', text\(livrable\.format_technique\)/,
    'la forme vient du livrable déclaré par l’analyse');
  for (const interdit of ['markers', 'indices', 'deriveFormat', 'normalizeRequestText'])
    assert.equal(arch.includes(interdit), false, `aucune dérivation lexicale (${interdit})`);
  /* Et le compilateur Architecte ne consulte aucun détecteur de format. */
  const html = lire('../atelier-prompts-v11.5-lot10g-decision-provider.html');
  const debut = html.indexOf('function archCompiler');
  let prof = 0, i = debut, ouvert = false;
  while (i < html.length) {
    if (html[i] === '{') { prof += 1; ouvert = true; } else if (html[i] === '}') { prof -= 1; if (ouvert && prof === 0) break; }
    i += 1;
  }
  const corps = html.slice(debut, i + 1);
  assert.equal(corps.includes('detecterFormat'), false, 'aucun détecteur lexical dans archCompiler');
  assert.equal(corps.includes('Volume attendu'), false, 'aucune quantité non sourcée');
});
