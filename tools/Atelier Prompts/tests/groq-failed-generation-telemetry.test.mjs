/* GROQ-FAILED-GEN-TELEMETRY — DÉCRIRE UN ÉCHEC SANS LE CITER.
 * ============================================================================
 *
 * CE QUE DEUX ÉCHECS RÉELS ONT COÛTÉ. Le 17/09 à 19:42:45 puis 19:52:03, le plan rapide a reçu
 * `status 400 · code json_validate_failed`, avec pour seul détail : « Failed to generate JSON.
 * Please adjust your prompt. See 'failed_generation' for more details. » Le corps portait bien
 * `failed_generation` — la sortie que le modèle avait tentée — il était lu dans `raw`, et jeté :
 * seuls `error.code` et `error.message` en étaient extraits.
 *
 * CONSÉQUENCE MESURÉE : impossible de savoir quelle clé avait échoué, si la génération était
 * tronquée, ni même si elle était du JSON. Une autopsie complète a dû conclure ROOT_CAUSE_PROVEN=NO
 * faute de cette information, et deux suspects — l'ordre du schéma, la longueur du prompt — sont
 * restés indissociables.
 *
 * POURQUOI ON NE PEUT PAS LE JOURNALISER TEL QUEL. `failed_generation` porte le texte que le modèle
 * écrivait : une question dérivée de la demande, donc potentiellement les mots de la personne. Le
 * `redact` du chemin d'erreur ne couvre que les clés d'API ; il ne protégerait rien ici.
 *
 * CE QUE CE FICHIER ÉPROUVE. Que la description est exacte sur les six formes d'échec qui comptent,
 * et surtout — c'est le test qui décide de la légitimité du lot — qu'AUCUN caractère du contenu
 * n'en ressort, y compris quand on y place délibérément des données sensibles.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeFailedGeneration } from '../workers/groq/src/index.js';

const source = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');

const ATTENDUES = ['explicit_unknown_determinant_ids', 'type', 'text', 'question_focus', 'missing_determinant_id'];

/* ==========================================================================
 * T1 / T2 — ABSENCE, ET SORTIE COMPLÈTE
 * ======================================================================= */

test('T-FGT-01 : sans failed_generation, rien n’est supposé', () => {
  for (const vide of [undefined, null, '']) {
    const d = describeFailedGeneration(vide);
    assert.equal(d.failed_generation_length, null, 'aucune longueur inventée');
    assert.equal(d.failed_generation_json_parseable, null, 'ni vrai ni faux : inconnu');
    assert.equal(d.failed_generation_root_type, null);
    assert.equal(d.failed_generation_probably_truncated, null, 'une troncature indémontrable reste null');
    assert.deepEqual(d.failed_generation_keys_present, []);
  }
  /* `present` distingue « le champ n'existait pas » de « il existait et était vide ». */
  assert.equal(describeFailedGeneration(undefined).failed_generation_present, false);
  assert.equal(describeFailedGeneration('').failed_generation_present, true);
});

test('T-FGT-02 : une sortie complète et valide est décrite exactement', () => {
  const d = describeFailedGeneration(JSON.stringify({
    explicit_unknown_determinant_ids: ['budget'], type: 'ASK_CLARIFICATION',
    text: 'Quel est votre budget ?', question_focus: 'problem_or_user_context',
    missing_determinant_id: 'budget'
  }));
  assert.equal(d.failed_generation_json_parseable, true);
  assert.equal(d.failed_generation_root_type, 'object');
  assert.deepEqual(d.failed_generation_keys_present, ATTENDUES);
  assert.deepEqual(d.failed_generation_expected_keys_missing, []);
  assert.deepEqual(d.failed_generation_unexpected_keys, []);
  assert.equal(d.failed_generation_probably_truncated, false, 'un JSON qui parse n’est pas tronqué');
  assert.deepEqual(d.failed_generation_value_types, {
    explicit_unknown_determinant_ids: 'array', type: 'string', text: 'string',
    question_focus: 'string', missing_determinant_id: 'string'
  });
});

/* ==========================================================================
 * T3 / T4 — CE QUI MANQUE, CE QUI EST EN TROP
 * ======================================================================= */

test('T-FGT-03 : une clé manquante est nommée — c’est ce qui manquait à l’autopsie', () => {
  const d = describeFailedGeneration(JSON.stringify({
    type: 'ASK_CLARIFICATION', text: 'Une question ?', question_focus: null, missing_determinant_id: 'manque_a'
  }));
  assert.deepEqual(d.failed_generation_expected_keys_missing, ['explicit_unknown_determinant_ids']);
  assert.deepEqual(d.failed_generation_keys_present,
    ['type', 'text', 'question_focus', 'missing_determinant_id']);
  /* Un null déclaré est un type, pas une absence : les deux se distinguent. */
  assert.equal(d.failed_generation_value_types.question_focus, 'null');
});

test('T-FGT-04 : une clé inattendue est nommée si sa forme est sûre, comptée sinon', () => {
  const d = describeFailedGeneration(JSON.stringify({
    type: 'ACKNOWLEDGE', text: 'Reçu.', reasoning_trace: 'x', state: 'operational_request_ready'
  }));
  assert.deepEqual(d.failed_generation_unexpected_keys.sort(), ['reasoning_trace', 'state']);
  assert.equal(d.failed_generation_unexpected_keys_unnamed, 0);
  assert.equal(d.failed_generation_value_types.state, 'string');
});

/* ==========================================================================
 * T5 / T6 — TRONCATURE, ET CE QUI N'EN EST PAS UNE
 * ======================================================================= */

test('T-FGT-05 : une troncature est reconnue par la structure, jamais devinée', () => {
  /* Structure restée ouverte. */
  const COUPE = '{"explicit_unknown_determinant_ids":["budget"],"type":"ASK_CLARIFICATION","text":"Quel est';
  const ouvert = describeFailedGeneration(COUPE);
  assert.equal(ouvert.failed_generation_json_parseable, false);
  assert.equal(ouvert.failed_generation_probably_truncated, true);
  /* Chaîne non terminée, détectée en COMPTANT les guillemets — jamais en les conservant. */
  const chaine = describeFailedGeneration('{"type":"ASK_CLARIFICATION","text":"une question sans fin');
  assert.equal(chaine.failed_generation_probably_truncated, true);
  /* Un tableau resté ouvert compte aussi. */
  assert.equal(describeFailedGeneration('{"explicit_unknown_determinant_ids":["a"').failed_generation_probably_truncated, true);
  /* La longueur reste disponible : c’est elle qui dirait un plafond de jetons atteint. */
  /* La longueur est MESURÉE sur l'entrée, jamais recopiée d'une constante : c'est elle qui dirait
     un plafond de jetons atteint, et une valeur écrite à la main s'en écarterait au premier essai. */
  assert.equal(ouvert.failed_generation_length, COUPE.length);
});

test('T-FGT-06 : un JSON invalide mais fermé n’est pas déclaré tronqué', () => {
  /* Le détecteur est CONSERVATEUR : il ne prétend pas reconnaître une troncature qu’il ne peut pas
     démontrer. Une virgule de trop, un JSON équilibré mais fautif, restent `false`. */
  for (const ferme of ['{"type":"ASK_CLARIFICATION",}', '{"type":,"text":"x"}', 'pas du json du tout']) {
    const d = describeFailedGeneration(ferme);
    assert.equal(d.failed_generation_json_parseable, false);
    assert.equal(d.failed_generation_probably_truncated, false, `« ${ferme} » n’est pas tronqué`);
  }
  /* Et une racine qui n’est pas un objet est nommée telle quelle, sans clés inventées. */
  const tableau = describeFailedGeneration('["ASK_CLARIFICATION"]');
  assert.equal(tableau.failed_generation_root_type, 'array');
  assert.deepEqual(tableau.failed_generation_keys_present, []);
  assert.deepEqual(tableau.failed_generation_expected_keys_missing, ATTENDUES);
});

/* ==========================================================================
 * T7 — LE TEST QUI DÉCIDE DE LA LÉGITIMITÉ DU LOT
 * ======================================================================= */

test('T-FGT-07 : aucun caractère du contenu ne sort, même délibérément sensible', () => {
  /* On place dans failed_generation tout ce qui ne doit JAMAIS être journalisé : le texte d'une
     question, un fait de la personne, un identifiant de manque, une clé d'API, et une clé d'objet
     qui reprend les mots de la demande. */
  const SECRETS = ['Quel budget pour votre divorce', 'Marie Dupont', '06 12 34 56 78',
                   'gsk_CECINESTPASUNECLE', 'divorce_budget_mensuel', 'je ne sais pas encore'];
  const sensible = JSON.stringify({
    type: 'ASK_CLARIFICATION',
    text: 'Quel budget pour votre divorce, Marie Dupont ? Rappel : 06 12 34 56 78',
    question_focus: 'problem_or_user_context',
    missing_determinant_id: 'divorce_budget_mensuel',
    explicit_unknown_determinant_ids: ['divorce_budget_mensuel'],
    'je ne sais pas encore': 'gsk_CECINESTPASUNECLE'
  });
  const d = describeFailedGeneration(sensible);
  const serialise = JSON.stringify(d);
  for (const secret of SECRETS) {
    assert.equal(serialise.includes(secret), false, `« ${secret} » ne doit JAMAIS sortir`);
  }
  /* La clé d'objet qui reprend une phrase de la demande n'est pas nommée : elle est COMPTÉE. */
  assert.deepEqual(d.failed_generation_unexpected_keys, [], 'aucune clé en forme de phrase n’est citée');
  assert.equal(d.failed_generation_unexpected_keys_unnamed, 1, 'elle est comptée, jamais citée');
  /* Ce qui sort reste utile : la forme est décrite entièrement. */
  assert.equal(d.failed_generation_json_parseable, true);
  assert.deepEqual(d.failed_generation_keys_present.sort(), [...ATTENDUES].sort());
  assert.equal(d.failed_generation_length, sensible.length);

  /* Et la seule valeur numérique qui sorte est une longueur : elle ne reconstitue aucun texte. */
  for (const valeur of Object.values(d.failed_generation_value_types)) {
    assert.ok(['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined'].includes(valeur),
      'les types sont des types, jamais des valeurs');
  }
});

/* ==========================================================================
 * T8 — LE COMPORTEMENT D'ERREUR EST INCHANGÉ
 * ======================================================================= */

test('T-FGT-08 : le chemin d’erreur ne décide rien de nouveau', () => {
  const bloc = source.slice(source.indexOf('if (!response.ok) {'),
    source.indexOf('let envelope;'));
  /* Le statut rendu, la classification et la levée sont exactement ceux d’avant. */
  assert.match(bloc, /classifyProviderHttpStatus\(response\.status\)/);
  assert.match(bloc, /throw tagFailure\(new Error\(`Groq a répondu \$\{response\.status\}\.`\)/);
  assert.match(bloc, /provider: "groq", status: response\.status/);
  /* La télémétrie est ajoutée au relevé, et elle ne conditionne rien. */
  assert.match(bloc, /describeFailedGeneration\(error\?\.failed_generation\)/);
  assert.equal(/if\s*\(\s*structure/.test(bloc), false, 'aucune décision ne lit la structure');
  assert.equal(/return|retry|order|fallback/.test(bloc.replace(/\/\*[\s\S]*?\*\//g, '')), false,
    'ni reprise, ni repli, ni ordre de fournisseur touchés');
  /* La description est calculée DANS le try : un corps illisible ne fait pas échouer le relevé. */
  const avantRedact = bloc.slice(0, bloc.indexOf('const redact'));
  assert.ok(avantRedact.indexOf('} catch {}') > avantRedact.indexOf('describeFailedGeneration(error?.failed_generation)'),
    'le calcul est protégé par le catch existant');
});

test('T-FGT-09 : la fonction est pure — aucun appel, aucun état, aucune décision', () => {
  const debut = source.indexOf('export function describeFailedGeneration');
  const bloc = source.slice(debut, source.indexOf('async function callGroqChatCompletion', debut));
  for (const interdit of ['fetch(', 'await ', 'console.', 'env.', 'throw ', 'Date.now', 'Math.random']) {
    assert.equal(bloc.includes(interdit), false, `« ${interdit} » n’a rien à faire dans une description`);
  }
  /* Deux appels identiques rendent deux résultats identiques. */
  const entree = '{"type":"ACKNOWLEDGE","text":"x"';
  assert.deepEqual(describeFailedGeneration(entree), describeFailedGeneration(entree));
});
