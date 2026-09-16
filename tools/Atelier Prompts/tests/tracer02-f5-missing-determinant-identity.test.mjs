/* TRACER-REMEDIATION-02 · F5 — UN MANQUE A UNE IDENTITÉ ; UNE QUESTION N'EN EST QUE LA FORMULATION.
 * ============================================================================
 *
 * CE QUE LA CAMPAGNE PRODUIT A MESURÉ. Sur la politique de conservation des données, l'autorité a
 * demandé « Dans quelle juridiction votre application opère-t-elle principalement ? », puis au tour
 * suivant la même chose augmentée de deux exemples : « … — Union européenne (RGPD), États-Unis
 * (HIPAA) ? ». Deux textes, un seul manque, et la personne sollicitée deux fois pour la même chose.
 *
 * POURQUOI RIEN NE LE VOYAIT. `isRepeatedSolicitation` compare une IDENTITÉ TEXTUELLE normalisée —
 * un choix délibéré de V2.2.1-E3, et il reste juste : deux formulations différentes SONT
 * différentes, et prétendre le contraire exigerait un appariement flou que la gouvernance interdit.
 * Le défaut n'était donc pas la comparaison : c'était son OBJET. On comparait des phrases là où il
 * fallait comparer des manques.
 *
 * CE QUI A ÉTÉ AJOUTÉ. Un fait, produit par l'autorité qui décide déjà du reste du tour :
 * `missing_determinant_id` nomme CE QUI manque. Il est porté par la question, conservé dans
 * clarification_history, et consulté par la politique de répétition. La comparaison reste une
 * ÉGALITÉ STRICTE — aucun seuil, aucun embedding, aucun synonyme, aucune distance.
 *
 * CE QUI N'A PAS CHANGÉ. La comparaison textuelle subsiste, et elle sert encore deux fois : sur un
 * historique écrit avant ce lot, qui ne porte aucune identité, et sur une question reposée mot pour
 * mot. Ce lot ajoute une clé de lecture, il n'en retire aucune.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isRepeatedSolicitation, assessSolicitation } from '../workers/shared/solicitation-policy.js';
import { validateQuestionCandidate, ARBITER_JSON_SCHEMA } from '../workers/shared/operational-request-core.js';
import { appendClarificationTurn, createOriginalRequestRecord } from '../core/adn/operational-request-state.js';
import { CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';

const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const JURIDICTION_1 = 'Dans quelle juridiction votre application opère-t-elle principalement ?';
const JURIDICTION_2 = 'Dans quelle juridiction votre application opère-t-elle principalement — Union européenne (RGPD), États-Unis (HIPAA) ?';
const historique = (id) => [{ turn: 1, question: JURIDICTION_1, answer: 'Je ne sais pas encore.',
  provenance: 'user', ...(id ? { missing_determinant_id: id } : {}) }];

/* ==========================================================================
 * F5-01 / 02 — MÊME MANQUE, AUTRE FORMULATION
 * ======================================================================= */

test('T-F5-01 : même manque, formulation différente — la sollicitation n’est pas rejouée', () => {
  assert.equal(isRepeatedSolicitation(JURIDICTION_2, historique('applicable_jurisdiction'), 'applicable_jurisdiction'), true);
  assert.equal(assessSolicitation(
    { type: 'ASK_CLARIFICATION', text: JURIDICTION_2, missing_determinant_id: 'applicable_jurisdiction' },
    historique('applicable_jurisdiction')), 'ALREADY_ANSWERED');
});

test('T-F5-02 : manque différent — la sollicitation reste autorisée', () => {
  const autre = 'Quelles catégories de données conservez-vous ?';
  assert.equal(isRepeatedSolicitation(autre, historique('applicable_jurisdiction'), 'data_categories'), false);
  assert.equal(assessSolicitation(
    { type: 'ASK_CLARIFICATION', text: autre, missing_determinant_id: 'data_categories' },
    historique('applicable_jurisdiction')), 'ALLOW');
});

test('T-F5-03 : le TEXTE n’est jamais l’identité — même texte, manque déclaré différent', () => {
  /* La formulation est identique au tour précédent : c'est le contrôle historique, conservé, qui
     l'attrape. L'identité ne l'affaiblit pas, elle s'y ajoute. */
  assert.equal(isRepeatedSolicitation(JURIDICTION_1, historique('applicable_jurisdiction'), 'data_categories'), true);
});

/* ==========================================================================
 * F5-04 — L'IDENTITÉ TRAVERSE LE TOUR ET SE CONSERVE
 * ======================================================================= */

test('T-F5-04 : la question porte l’identité, et l’historique la conserve', () => {
  const q = validateQuestionCandidate({
    text: JURIDICTION_1, targets_issue_id: 'I1', expected_progress: 'x',
    question_focus: 'problem_or_user_context', missing_determinant_id: 'applicable_jurisdiction'
  });
  assert.equal(q.missing_determinant_id, 'applicable_jurisdiction');

  const record = appendClarificationTurn(
    createOriginalRequestRecord('Rédige la politique de conservation.'),
    { question: JURIDICTION_1, answer: 'Union européenne.', missing_determinant_id: q.missing_determinant_id });
  assert.equal(record.clarification_history[0].missing_determinant_id, 'applicable_jurisdiction');
  assert.equal(record.clarification_history[0].turn, 1);
});

test('T-F5-05 : lecture tolérante — un historique antérieur, sans identité, reste valide', () => {
  const ancien = createOriginalRequestRecord('x');
  const sansIdentite = appendClarificationTurn(ancien, { question: 'Quelle date ?', answer: 'Demain.' });
  assert.equal('missing_determinant_id' in sansIdentite.clarification_history[0], false);
  /* Et la comparaison textuelle continue d'y fonctionner. */
  assert.equal(isRepeatedSolicitation('Quelle date ?', sansIdentite.clarification_history, 'due_date'), true);
});

test('T-F5-06 : le champ est REQUIS du modèle, toléré absent du validateur', () => {
  assert.equal(ARBITER_JSON_SCHEMA.properties.next_question.required.includes('missing_determinant_id'), true);
  /* Une question écrite avant ce lot reste lisible, et son identité vaut null. */
  const q = validateQuestionCandidate({ text: 'Quelle date ?', targets_issue_id: 'I1', expected_progress: 'x' });
  assert.equal(q.missing_determinant_id, null);
});

/* ==========================================================================
 * F5-07 — AUCUN FLOU N'EST REVENU
 * ======================================================================= */

test('T-F5-07 : la comparaison reste une égalité — aucun seuil, aucun embedding, aucun synonyme', () => {
  const source = lire('../workers/shared/solicitation-policy.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of ['levenshtein', 'jaccard', 'cosine', 'embedding', 'fuzzy', 'stemming', 'synonym', 'similarity']) {
    assert.equal(new RegExp(interdit, 'i').test(source), false, `« ${interdit} » est revenu`);
  }
  assert.equal(/common\s*\/\s*Math\.min\(/.test(source), false, 'aucun ratio de recouvrement');
  /* Une identité proche n'est PAS la même identité : aucune tolérance n'est accordée. */
  assert.equal(isRepeatedSolicitation('Autre question ?', historique('applicable_jurisdiction'), 'applicable_jurisdictions'), false);
  assert.equal(isRepeatedSolicitation('Autre question ?', historique('applicable_jurisdiction'), 'APPLICABLE_JURISDICTION'), false);
});

test('T-F5-08 : la consigne dit à l’autorité de stabiliser l’identité, pas de la dériver du texte', () => {
  assert.match(CORE_SYSTEM_PROMPT, /missing_determinant_id NOMME CE QUI MANQUE, jamais la question/);
  assert.match(CORE_SYSTEM_PROMPT, /RÉEMPLOYEZ EXACTEMENT LE MÊME identifiant tant que la MÊME chose manque/);
  assert.match(CORE_SYSTEM_PROMPT, /Changez d'identifiant dès que l'inconnue change/);
});
