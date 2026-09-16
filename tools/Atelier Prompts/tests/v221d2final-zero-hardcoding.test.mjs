/* ATELIER PROMPTS V2.2.1-D2 FINAL — PLUS AUCUN GARDE N'ÉCRIT DE QUESTION.
 * ============================================================================
 *
 * CE QUE CE LOT FERME. L'audit Sol avait nommé un blocker P1 : du hardcoding décisionnel dans
 * solicitation-policy.js. Quatre lots ont été nécessaires, et aucun n'a pu conclure seul.
 *
 *   D2  a tenté la suppression frontale et a dû reculer : elle rouvrait un défaut réel.
 *   D2A a prouvé que l'identité sémantique d'une clarification ne peut pas arbitrer la classe méta —
 *       trois cas mesurés portaient une identité RIGOUREUSEMENT identique pour des légitimités
 *       opposées. Piste close.
 *   D2B a mesuré que le garde méta ne marquait RIEN sur huit sorties profondes réelles, a trouvé la
 *       cause — la conjonction « ou » déclenchait le signal destiné à l'interrogatif « où » — et l'a
 *       réparée. Le garde est alors devenu mesurablement utile : 3 captures que rien d'autre
 *       n'attrape, parce qu'elles sont parfaitement atomiques.
 *   D2C a démontré que le dernier faux négatif venait d'une exemption dérivée d'une classe de mots,
 *       et qu'aucune donnée canonique existante ne pouvait la remplacer.
 *   D2D a fait produire ce fait par l'autorité — `objective_nature` — au niveau du tour.
 *
 * CE QUE CE FICHIER VÉRIFIE. Que le chemin de production ne contient plus de question fabriquée, que
 * le signal C ne consulte plus aucune classe de mots, et que les protections réellement démontrées
 * sont toutes encore là.
 *
 * CE QUI RESTE, ET POURQUOI — MIS À JOUR PAR V2.2.1-D2F1. À la clôture de D2 FINAL, quatre motifs
 * de vocabulaire servaient encore les signaux A et B, et le lot les avait conservés parce qu'ils
 * portaient une protection mesurée. D2F1 a fermé cette dette autrement : l'auteur de la question
 * déclare désormais ce qu'elle interroge, et trois de ces motifs ont quitté le module. Le dernier,
 * INTERROGE_LA_PRODUCTION, ne sert plus que le signal C, réservé au lot D2F2.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  guardDisplayedQuestion, guardFastSolicitation, guardFastInteraction, assessSolicitation,
  isMetaOutputQuestion, isAtomicQuestion, requestIsAboutItsOwnForm, questionAsksConcreteVariable,
  DISPLAY_VERDICTS, SILENT_INTERACTION
} from '../workers/shared/solicitation-policy.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { loadPilot, arbiterTurn, clarificationTurn, questionShown } from './perf04-frontend-harness.helper.mjs';

const source = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
/* La LOGIQUE EXÉCUTÉE, commentaires retirés : c'est elle seule que ce lot contraint. */
const logique = source.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
const q = (text) => ({ type: 'ASK_CLARIFICATION', text });

/* ==========================================================================
 * D2F-01 — AUCUNE QUESTION PRÊTE À AFFICHER DANS LE RUNTIME
 * ======================================================================= */

test('V221D2F-01 : aucune constante de question ne peut remplacer une sortie OPRIE', () => {
  assert.equal(source.includes('SAFE_FALLBACK_QUESTION'), false, 'la constante a quitté le module');
  assert.equal(html.includes('SAFE_FALLBACK_QUESTION'), false, 'et le bundle navigateur');
  assert.equal(DISPLAY_VERDICTS.includes('FALLBACK_SAFE'), false);
  assert.equal(DISPLAY_VERDICTS.includes('NOT_DISPLAYABLE'), true);
  /* Aucune chaîne interrogative constante ne subsiste dans la logique exécutée. Une question
     fabriquée se reconnaît à ceci : une littérale qui se termine par un point d'interrogation. */
  const litterales = logique.match(/'[^']*\?\s*'/gu) || [];
  assert.deepEqual(litterales, [], `aucune question constante : ${litterales.join(' | ')}`);
});

/* ==========================================================================
 * D2F-02 — LE SIGNAL C EST CANONIQUE, ET SANS LEXIQUE
 * ======================================================================= */

test('V221D2F-02 : seule la nature de l’objectif décide l’exemption', () => {
  const demande = 'J’ai besoin d’un document pour ma réunion.';
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'transformation' }), true);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'production' }), false);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'other' }), false);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: null }), false, 'champ absent : échec fermé');
  /* Et la fonction elle-même ne consulte plus la classe de mots. */
  const corps = logique.slice(logique.indexOf('export function requestIsAboutItsOwnForm'));
  assert.equal(corps.slice(0, corps.indexOf('\n}')).includes('NOMS_DE_PRODUCTION'), false);
});

/* ==========================================================================
 * D2F-03 / D2F-04 — LES DEUX CAS QUI ONT CONDUIT TOUT LE TRAVAIL
 * ======================================================================= */

test('V221D2F-03 : nommer un livrable n’exempte plus rien', () => {
  const question = 'Quel type de contenu doit être inclus dans ce document ?';
  const contexte = 'J’ai besoin d’un document pour ma réunion.';
  /* Mesuré en réel : cette demande reçoit « production » ou « other », jamais « transformation ». */
  for (const nature of [null, 'production', 'other']) {
    assert.equal(isMetaOutputQuestion(question, { objectiveNature: nature, questionFocus: 'output_specification' }), true, `nature=${nature}`);
  }
  assert.notEqual(guardDisplayedQuestion(question,
    { questionFocus: 'output_specification' }).verdict, 'ALLOW');
});

test('V221D2F-04 : la classe transformation garde son exemption, sans règle sur les mots', () => {
  const demande = 'Je veux convertir ce texte dans un autre format.';
  assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?', { objectiveNature: 'transformation', questionFocus: 'output_specification' }), false);
  /* Aucune règle ne nomme la conversion, ni un format particulier, dans la logique exécutée. */
  for (const mot of ['convertir', 'conversion', 'reformater', 'markdown', 'pdf', 'docx', 'traduire']) {
    assert.equal(new RegExp(mot, 'iu').test(logique), false, `« ${mot} » n’a rien à faire dans la logique`);
  }
});

/* ==========================================================================
 * D2F-05 — UNE CANDIDATE INUTILISABLE NE PRODUIT JAMAIS UNE AUTRE QUESTION
 * ======================================================================= */

test('V221D2F-05 : sans rien de récupérable, la frontière constate — elle n’écrit pas', () => {
  const catalogue = 'Itinéraire, recommandations, checklist, ou autre chose ?';
  const garde = guardDisplayedQuestion(catalogue, {});
  assert.equal(garde.verdict, 'NOT_DISPLAYABLE');
  assert.equal(garde.text, null, 'FIXED_FALLBACK_USED = NO');
  /* Sur le plan rapide, l'issue existante est le silence — donc l'escalade. */
  assert.deepEqual(guardFastInteraction(q(catalogue), {}), SILENT_INTERACTION);
  /* Sur le plan profond, TRACER-REMEDIATION-02 · F2 : le tour ne part plus amputé. Il partait avec
     ses trois champs à null tout en réclamant une clarification — la personne recevait un état
     exigeant une réponse et rien à quoi répondre. La sortie est désormais déclarée
     contractuellement inexploitable, et le client la traite par son chemin d'échec existant. */
  const tour = Object.freeze({
    state: 'clarification_required', objective_nature: 'production',
    next_question: Object.freeze({ text: catalogue, targets_issue_id: 'I1', expected_progress: 'x' }),
    operational_request_candidate: Object.freeze({ a: 1 }), issues: Object.freeze([]), reason: 'r'
  });
  assert.throws(() => applyDisplayGuardToTurn(tour, { question_candidates: [] }, () => {}),
    (e) => e.status === 502 && e.code === 'turn_contractually_unusable');
  /* Et le client sait déjà traiter ce cas, depuis toujours, sans question fabriquée : une réponse
     non-OK lève l'échec technique nommé, rejouable. */
  assert.match(html, /if\(!response\.ok\)throw oprieTechnicalFailure\(\)/);
});

test('V221D2F-05b : une candidate du même tour est toujours préférée à l’absence', () => {
  /* SUPPRIMER n'est pas RENONCER : quand le tour porte déjà une question atomique, c'est elle qui
     s'affiche. Le chemin sans texte est le dernier recours, pas le premier. */
  const garde = guardDisplayedQuestion('Itinéraire, recommandations, checklist, ou autre chose ?',
    { candidates: [{ text: 'Combien de jours prévoyez-vous de rester ?' }] });
  assert.equal(garde.verdict, 'REPLACED');
  assert.equal(garde.text, 'Combien de jours prévoyez-vous de rester ?');
});

/* ==========================================================================
 * D2F-06 / D2F-07 — CE QUI A ÉTÉ DÉMONTRÉ UTILE RESTE PROTÉGÉ
 * ======================================================================= */

test('V221D2F-06 : les 3 captures uniques du garde méta sont intactes', () => {
  const uniques = [
    'Quel type de contenu doit être inclus dans ce document ?',
    'Quel type de résultat attendez-vous ?',
    'Quel type de résultat attendez-vous — un rapport ou une note ?'
  ];
  for (const texte of uniques) {
    assert.equal(isAtomicQuestion(texte), true, 'la forme seule ne la refuse pas');
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: 'output_specification' }), true, 'seul le garde méta la refuse');
    assert.deepEqual(guardFastSolicitation({ ...q(texte), question_focus: 'output_specification' }, {}), SILENT_INTERACTION);
  }
});

test('V221D2F-07 : la classe de défaut « ou » / « où » ne peut plus exister', () => {
  /* D2B avait réparé un motif qui confondait la conjonction et l'interrogatif. D2F1 a supprimé le
     motif : le garde ne lit plus le texte, donc aucun mot ne peut plus en cacher un autre. */
  assert.equal(/o\[ùu\]/u.test(source), false);
  assert.equal(source.includes('VARIABLES_DU_PROBLEME'), false, 'le motif entier a disparu');
  for (const texte of ['Quel type de résultat attendez-vous ?',
                       'Quel type de résultat attendez-vous — un rapport ou une note ?']) {
    assert.equal(isMetaOutputQuestion(texte, { questionFocus: 'output_specification' }), true,
      'la formulation n’a plus aucune prise sur le verdict');
  }
});


/* ==========================================================================
 * D2F-08 — CE QUI RESTE DANS LA LOGIQUE EXÉCUTÉE, ET SA JUSTIFICATION
 * ======================================================================= */

test('V221D2F-08 : il ne reste aucun vocabulaire décidant ce qu’une question interroge', () => {
  /* Trois motifs portaient les signaux A et B. V2.2.1-D2F1 les a retirés : l'auteur de la question
     déclare désormais ce qu'elle interroge, et le garde le lit. Six motifs subsistent — un seul est
     lexical et décisionnel, réservé au fait n°2 (signal C, lot D2F2) ; les cinq autres comptent des
     formes grammaticales. */
  for (const disparu of ['NOMS_DE_PRODUCTION', 'VERBES_D_OBTENTION', 'VARIABLES_DU_PROBLEME']) {
    assert.equal(source.includes(disparu), false, `${disparu} a quitté le module`);
  }
  assert.equal((source.match(/^const [A-Z_]+ = \//gmu) || []).length, 5, 'neuf avant D2F1, cinq après D2F2');
  assert.equal(source.includes('INTERROGE_LA_PRODUCTION'), false,
    'V2.2.1-D2F2 a retiré le dernier motif lexical décisionnel du module');
  /* Et aucun mot de domaine n'est jamais entré dans la logique. */
  for (const mot of ['voyage', 'lisbonne', 'budget', 'réunion', 'tournoi', 'recette', 'facture']) {
    assert.equal(new RegExp(`\\b${mot}`, 'iu').test(logique), false, `« ${mot} »`);
  }
});


/* ==========================================================================
 * D2F-09 / 10 / 11 — LE COMPORTEMENT NOMINAL, BOUT EN BOUT
 * ======================================================================= */

test('V221D2F-09 : un domaine inédit emprunte le chemin nominal, sans règle spéciale', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Rédige le règlement d’un tournoi de pétanque entre trois services, avec départage et clause pluie.',
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'Reçu.' }),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(questionShown(h.ctx), '', 'aucune question de confort');
  assert.equal(h.spy.deepCalls.length, 1);
});

test('V221D2F-10 : une demande créative complète va au bout, sans question ni repli', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Écris une nouvelle de 2000 mots sur un gardien de phare qui découvre une lettre dans une bouteille, ton mélancolique, fin ouverte.',
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'Je prends note.' }),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(questionShown(h.ctx), '');
  /* V2.2.1-E1 — ce contrôle vérifiait que le plan rapide transmettait bien sa décision. La
     gouvernance le lui interdit : il ne décide plus, et le corps n'en porte aucune. L'invariant de
     CE test-ci est ailleurs et reste entier — une demande créative complète va au bout sans qu'on
     lui pose de question de confort ni qu'on lui fabrique un repli. */
  assert.equal('canonical_decision' in h.spy.deepCalls[0].body, false, 'le plan rapide ne décide rien');
});

test('V221D2F-11 : un seul manque déterminant donne une question utile, et pas une question générique', async () => {
  const h = loadPilot({
    mode: 'rapide', demande: 'Je veux préparer un déplacement.',
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Depuis quelle ville partez-vous ?' }),
    deep: async () => clarificationTurn('x')
  });
  await h.pilot.oprieRunTurn('rapide');
  const posee = questionShown(h.ctx);
  assert.equal(posee, 'Depuis quelle ville partez-vous ?', 'la question d’OPRIE, telle quelle');
  assert.equal(/le plus important pour vous/i.test(posee), false, 'aucune question générique injectée');
  assert.equal(h.spy.deepCalls.length, 0, 'la personne répond avant tout plan profond');
});

/* ==========================================================================
 * D2F-12 — LE VERDICT DE SOLLICITATION RESTE COMPLET
 * ======================================================================= */

test('V221D2F-12 : la famille des verdicts est inchangée, et chacun reste atteignable', () => {
  const obtenus = new Set([
    assessSolicitation(q('Depuis quelle ville partez-vous ?'), []),
    assessSolicitation(q('Souhaitez-vous convier : les partenaires, les fournisseurs, les élus, ou les riverains ?'), []),
    assessSolicitation(q('Quel budget et combien de jours ?'), []),
    assessSolicitation(q(''), []),
    assessSolicitation(q('Depuis quelle ville partez-vous ?'), [{ question: 'Depuis quelle ville partez-vous ?', answer: 'Lyon' }]),
    assessSolicitation(q('Depuis quelle ville partez-vous ?'), [], true),
    assessSolicitation({ ...q('Quel type de résultat attendez-vous ?'), question_focus: 'output_specification' }, [])
  ]);
  for (const verdict of ['ALLOW', 'MULTIPLE_QUESTIONS', 'CATALOGUE', 'ALREADY_ANSWERED',
                         'MATERIAL_PRESENT', 'META_OUTPUT_QUESTION', 'EMPTY']) {
    assert.ok(obtenus.has(verdict), `${verdict} reste atteignable`);
  }
});
