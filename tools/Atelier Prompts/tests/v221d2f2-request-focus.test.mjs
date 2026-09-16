/* ATELIER PROMPTS V2.2.1-D2F2 — LE DERNIER MOT DEVINÉ A QUITTÉ LA PRODUCTION.
 * ============================================================================
 *
 * CE QUE CE LOT FERME. L'audit Sol avait nommé un blocker P1 : du vocabulaire décisionnel dans
 * solicitation-policy.js. Sept lots ont été nécessaires, et aucun n'a pu conclure sur une
 * supposition — chacun n'a avancé qu'en mesurant ce que le précédent avait cru.
 *
 *   D2   la suppression frontale rouvrait un défaut réel : recul.
 *   D2A  l'identité de l'inconnue n'arbitre pas la classe méta : piste close.
 *   D2B  le garde ne marquait RIEN sur huit sorties réelles ; cause trouvée, réparée, garde devenu
 *        mesurablement utile — 3 captures que rien d'autre n'attrape.
 *   D2C  aucune donnée canonique existante ne pouvait remplacer le reliquat.
 *   D2D  `objective_nature` : le signal C cesse de deviner la moitié de son travail.
 *   D2E  audit — les quatre vocabulaires lisaient LE SUJET DE LA QUESTION, quand l'état canonique
 *        ne décrit que L'INCONNUE VISÉE. Deux faits manquaient.
 *   D2F1 `question_focus` : les signaux A et B cessent de deviner. Trois motifs partent.
 *
 * CE QUE CE LOT FAIT. `request_focus` — ce sur quoi porte la demande — ferme le second fait manquant
 * de D2E. Le dernier motif lexical décisionnel, INTERROGE_LA_PRODUCTION, n'a plus de consommateur et
 * a été supprimé. Le texte de la demande n'atteint plus aucun garde : la signature elle-même
 * l'interdit désormais.
 *
 * POURQUOI DEUX FAITS ET NON UN. Mesuré : sur trois demandes qui interrogent littéralement la
 * production, `objective_nature` vaut « other » les trois fois. Reprendre un contenu pour le
 * disposer autrement, et DEMANDER comment le disposer, sont deux choses — et un seul champ ne
 * pouvait pas porter les deux.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  requestIsAboutItsOwnForm, isMetaOutputQuestion, guardDisplayedQuestion, guardFastInteraction,
  guardFastSolicitation, assessSolicitation, isAtomicQuestion, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { REQUEST_FOCUS_VALUES, QUESTION_FOCUS_VALUES } from '../core/adn/operational-request-state.js';
import { ARBITER_OUTPUT_FIELDS, validateArbiterOutput } from '../workers/shared/operational-request-core.js';
import { CORE_OUTPUT_FIELDS, CORE_JSON_SCHEMA, CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { FAST_INTERACTION_JSON_SCHEMA } from '../workers/shared/fast-interactive-plane.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { CANDIDATE_FIELDS, createEmptyCandidate } from '../core/adn/operational-request-state.js';

/* TARGETED-FIX-POST-CODEX-01 — le contrat du plan rapide compte un QUATRIÈME champ nommé :
   l'identité du manque. Le contre-audit a démontré qu'une question rapide répondue laissait
   l'historique sans identité, si bien qu'une reformulation ultérieure du même manque par le plan
   profond n'était plus reconnue. L'invariant gardé ici est inchangé — le schéma reste clos et
   incapable de porter un état ; il s'allonge d'un fait produit par la même décision. */

const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const logique = source.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
const FORME = 'output_form_or_specification';
const PROBLEME = 'user_problem_or_goal';
const NOTRE_SORTIE = 'output_specification';

/* ==========================================================================
 * D2F2-01 — L'AUTORITÉ PRODUIT LE FAIT, AU NIVEAU DU TOUR
 * ======================================================================= */

test('V221D2F2-01 : le fait est produit par l’autorité existante, et vit au niveau du tour', () => {
  assert.deepEqual([...REQUEST_FOCUS_VALUES], ['output_form_or_specification', 'user_problem_or_goal', 'other']);
  assert.equal(ARBITER_OUTPUT_FIELDS.includes('request_focus'), true);
  assert.equal(CORE_OUTPUT_FIELDS.includes('request_focus'), true);
  assert.deepEqual(CORE_JSON_SCHEMA.properties.request_focus, { type: 'string', enum: [...REQUEST_FOCUS_VALUES] });
  /* Il ne descend PAS dans le candidat : il n'entre donc ni dans assessProvenance, ni dans
     diffCandidates, ni dans le domaine de ProvenanceRecord.field. */
  assert.equal(CANDIDATE_FIELDS.includes('request_focus'), false);
  /* Le plan rapide n'est pas touché : il reste à trois champs, et ne porte pas ce fait. */
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['missing_determinant_id', 'question_focus', 'text', 'type']);
});

test('V221D2F2-01b : lecture tolérante, écriture stricte — comme available_inputs avant lui', () => {
  const tour = {
    state: 'clarification_required', operational_request_candidate: createEmptyCandidate(), issues: [],
    next_question: { text: 'Depuis quelle ville partez-vous ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: 'problem_or_user_context' },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r'
  };
  assert.equal(validateArbiterOutput(tour).request_focus, null, 'absent : « non dit », jamais fatal');
  assert.equal(validateArbiterOutput({ ...tour, request_focus: FORME }).request_focus, FORME);
  assert.throws(() => validateArbiterOutput({ ...tour, request_focus: 'formatage' }),
    /request_focus invalide/, 'présent mais hors vocabulaire : refusé');
});

/* ==========================================================================
 * D2F2-02 / 03 — LE SIGNAL C NE LIT PLUS QUE DES FAITS
 * ======================================================================= */

test('V221D2F2-02 : le signal C décide sur deux faits canoniques, et sur rien d’autre', () => {
  assert.equal(requestIsAboutItsOwnForm({ requestFocus: FORME }), true);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'transformation' }), true);
  assert.equal(requestIsAboutItsOwnForm({ requestFocus: PROBLEME }), false);
  assert.equal(requestIsAboutItsOwnForm({ requestFocus: 'other' }), false);
  assert.equal(requestIsAboutItsOwnForm({}), false, 'sans fait : échec fermé');
  /* La signature ne reçoit plus de texte : la régression lexicale est devenue impossible. */
  assert.equal(requestIsAboutItsOwnForm('Sous quelle forme dois-je rendre ce document ?'), false,
    'un texte passé à la place des faits ne vaut rien');
});

test('V221D2F2-03 : le dernier motif lexical décisionnel a quitté le module', () => {
  assert.equal(source.includes('INTERROGE_LA_PRODUCTION'), false, 'plus aucun consommateur, donc supprimé');
  for (const disparu of ['NOMS_DE_PRODUCTION', 'VERBES_D_OBTENTION', 'VARIABLES_DU_PROBLEME']) {
    assert.equal(source.includes(disparu), false, `${disparu} : parti en D2F1`);
  }
});

/* ==========================================================================
 * D2F2-04 à 08 — LES CINQ CLASSES, MESURÉES SUR LE VRAI PRODUCTEUR
 * ======================================================================= */

test('V221D2F2-04 : le cas propriétaire — nommer un livrable n’exempte toujours rien', () => {
  /* Mesuré : « J'ai besoin d'un document pour ma réunion. » → request_focus = user_problem_or_goal,
     objective_nature = production. Aucun des deux n'exempte. */
  const question = 'Quel type de contenu doit être inclus dans ce document ?';
  assert.equal(isMetaOutputQuestion(question,
    { requestFocus: PROBLEME, objectiveNature: 'production', questionFocus: NOTRE_SORTIE }), true);
});

test('V221D2F2-05 : la classe transformation garde son exemption', () => {
  /* Mesuré : « Je veux convertir ce texte dans un autre format. » → transformation
     ET output_form_or_specification. Chacun des deux suffit. */
  assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?',
    { objectiveNature: 'transformation', questionFocus: NOTRE_SORTIE }), false);
});

test('V221D2F2-06 : une demande qui porte explicitement sur la forme est exemptée par le fait', () => {
  /* Ce sont les trois demandes que D2E avait isolées : INTERROGE_LA_PRODUCTION en était le SEUL
     discriminant, et `objective_nature` valait « other » pour les trois. Mesuré après ce lot, le
     producteur rend output_form_or_specification sur les trois. */
  for (const nature of ['other', 'production', null]) {
    assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?',
      { requestFocus: FORME, objectiveNature: nature, questionFocus: NOTRE_SORTIE }), false,
      `exemptée par le seul fait de la demande (nature=${nature})`);
  }
});

test('V221D2F2-07 : une demande ordinaire sur un problème n’exempte rien', () => {
  /* Mesuré : « Je veux préparer un déplacement. » et « Améliore la performance de mon
     application. » → user_problem_or_goal les deux fois. */
  assert.equal(isMetaOutputQuestion('Quel type de résultat attendez-vous ?',
    { requestFocus: PROBLEME, questionFocus: NOTRE_SORTIE }), true);
  assert.equal(assessSolicitation(
    { type: 'ASK_CLARIFICATION', text: 'Quel type de résultat attendez-vous ?', question_focus: NOTRE_SORTIE },
    [], false, { requestFocus: PROBLEME }), 'META_OUTPUT_QUESTION');
});

test('V221D2F2-08 : « other » est une réponse normale, et n’exempte pas', () => {
  assert.equal(requestIsAboutItsOwnForm({ requestFocus: 'other' }), false);
  assert.equal(isMetaOutputQuestion('Quel type de résultat attendez-vous ?',
    { requestFocus: 'other', questionFocus: NOTRE_SORTIE }), true);
});

/* ==========================================================================
 * D2F2-09 — PLUS AUCUNE DÉCISION LEXICALE DANS LA PRODUCTION
 * ======================================================================= */

test('V221D2F2-09 : les motifs restants comptent des formes, aucun ne nomme quoi que ce soit', () => {
  const motifs = source.match(/^const ([A-Z_]+) = \//gmu) || [];
  assert.equal(motifs.length, 5, 'neuf avant D2F1, cinq après D2F2');
  /* Les cinq sont grammaticaux : interrogatifs, coordination, verbe inversé, ajout d'un besoin,
     parenthèse énumérante. Aucun ne porte de vocabulaire de domaine ni de production. */
  for (const forme of ['INTERROGATIFS', 'COORDINATION', 'VERBE_INVERSE', 'AJOUTE_UN_BESOIN', 'PARENTHESE_ENUMERANTE']) {
    assert.equal(source.includes(forme), true, forme);
  }
  /* Et aucune décision sémantique ne se prend plus sur du texte : les trois prédicats de sens ne
     reçoivent que des faits. */
  for (const nom of ['questionTargetsOwnOutput', 'questionAsksConcreteVariable', 'requestIsAboutItsOwnForm']) {
    const i = logique.indexOf(`export function ${nom}(`);
    const corps = logique.slice(i, logique.indexOf('\n}', i));
    assert.equal(/minuscule\(|\.test\(/u.test(corps), false, `${nom} ne lit aucun texte`);
  }
  /* Aucun mot de domaine, nulle part dans la logique exécutée. */
  for (const mot of ['voyage', 'lisbonne', 'budget', 'réunion', 'document', 'format', 'livrable']) {
    assert.equal(new RegExp(`\\b${mot}`, 'iu').test(logique), false, `« ${mot} »`);
  }
});

/* ==========================================================================
 * D2F2-10 — RIEN DE CE QUI ÉTAIT PROTÉGÉ NE L'EST MOINS
 * ======================================================================= */

test('V221D2F2-10 : les 3 captures uniques de D2B sont toujours là', () => {
  for (const texte of ['Quel type de contenu doit être inclus dans ce document ?',
                       'Quel type de résultat attendez-vous ?',
                       'Quel type de résultat attendez-vous — un rapport ou une note ?']) {
    assert.equal(isAtomicQuestion(texte), true, 'la forme ne la refuse pas');
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: NOTRE_SORTIE }), true);
    assert.deepEqual(guardFastSolicitation(
      { type: 'ASK_CLARIFICATION', text: texte, question_focus: NOTRE_SORTIE }, {}), SILENT_INTERACTION);
  }
  /* Et question_focus est intact : les deux valeurs restent exclusives. */
  assert.deepEqual([...QUESTION_FOCUS_VALUES], ['problem_or_user_context', 'output_specification', 'other']);
});

test('V221D2F2-11 : les trois faits traversent la frontière profonde, portés par le tour', () => {
  const tour = (requestFocus) => Object.freeze({
    state: 'clarification_required', objective_nature: 'production', request_focus: requestFocus,
    next_question: Object.freeze({ text: 'Sous quel format souhaitez-vous la sortie ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: NOTRE_SORTIE }),
    operational_request_candidate: Object.freeze({ a: 1 }), issues: Object.freeze([]), reason: 'r'
  });
  assert.equal(applyDisplayGuardToTurn(tour(FORME), { question_candidates: [] }, () => {})
    .next_question.text, 'Sous quel format souhaitez-vous la sortie ?', 'la demande porte sur la forme : elle passe');
  /* TRACER-REMEDIATION-02 · F2 — même refus, autre conséquence : le tour n'est plus rendu amputé,
     il est déclaré contractuellement inexploitable. Voir tests/tracer02-f2-…. */
  assert.throws(() => applyDisplayGuardToTurn(tour(PROBLEME), { question_candidates: [] }, () => {}),
    (e) => e.code === 'turn_contractually_unusable',
    'elle n’y porte pas : refusée, et rien n’est fabriqué');
  /* Le plan rapide, lui, ne porte aucun de ces deux faits : il échoue fermé. */
  assert.deepEqual(guardFastInteraction(
    { type: 'ASK_CLARIFICATION', text: 'Sous quel format souhaitez-vous la sortie ?', question_focus: NOTRE_SORTIE }, {}),
    SILENT_INTERACTION);
});

test('V221D2F2-12 : la consigne définit le fait sans nommer aucun domaine', () => {
  const i = CORE_SYSTEM_PROMPT.indexOf('9. request_focus');
  const consigne = CORE_SYSTEM_PROMPT.slice(i, CORE_SYSTEM_PROMPT.indexOf('\n', i));
  for (const valeur of REQUEST_FOCUS_VALUES) assert.ok(consigne.includes(valeur), valeur);
  /* Elle dit explicitement ce qu'il ne faut pas confondre — c'est la mesure de D2E, écrite. */
  assert.match(consigne, /Ne confondez pas ce champ avec objective_nature/u);
  for (const mot of ['markdown', 'pdf', 'rapport', 'tableau', 'voyage', 'facture']) {
    assert.equal(new RegExp(`\\b${mot}`, 'iu').test(consigne), false, `« ${mot} »`);
  }
});
