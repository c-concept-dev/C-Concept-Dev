/* ATELIER PROMPTS V2.2.1-D2D — LA NATURE DE L'OBJECTIF EST DITE, PLUS DEVINÉE.
 * ============================================================================
 *
 * CE QUE LES TROIS LOTS PRÉCÉDENTS ONT ÉTABLI, ET QUI MÈNE ICI.
 *
 *   D2B a réparé le garde méta et l'a mesuré utile : 3 captures que rien d'autre n'attrape. Mais il
 *   restait un faux négatif — la question que le propriétaire a reçue n'était PAS refusée dans son
 *   contexte réel, parce que l'exemption « la demande porte sur sa propre forme » se déclenchait dès
 *   qu'un nom de production figurait dans la demande.
 *
 *   D2C a cherché à corriger cette exemption et a buté sur un fait mesuré : « j'ai besoin d'un
 *   document pour ma réunion » et « je veux convertir ce texte dans un autre format » étaient
 *   classés par LA MÊME règle, sur la même classe de mots. Le premier attend qu'on produise, le
 *   second qu'on reprenne un contenu existant. Aucun raffinement lexical ne pouvait les séparer,
 *   parce que la distinction ne vit pas dans les mots de la demande — elle vit dans l'OBJECTIF.
 *
 * CE QUE CE LOT FAIT. L'autorité sémantique énonce désormais la nature de l'objectif, au niveau du
 * tour, et le garde se contente de la lire. Un garde de forme cesse ainsi de décider d'une question
 * de sens qui ne lui appartenait pas.
 *
 * CE QU'IL NE FAIT PAS. Les autres usages des listes lexicales restent en place — ce lot ne traite
 * que la dépendance du signal C à NOMS_DE_PRODUCTION. Le plan rapide ne transporte pas le fait, et
 * c'est assumé : sans fait, on échoue FERMÉ — aucune exemption, donc au pire un silence et une
 * escalade vers le plan profond, où le fait existe.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  requestIsAboutItsOwnForm, isMetaOutputQuestion, guardDisplayedQuestion
} from '../workers/shared/solicitation-policy.js';
import {
  OBJECTIVE_NATURES, ARBITER_OUTPUT_FIELDS, ARBITER_JSON_SCHEMA, validateArbiterOutput
} from '../workers/shared/operational-request-core.js';
import { CORE_OUTPUT_FIELDS, CORE_JSON_SCHEMA, CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { applyDisplayGuardToTurn } from '../workers/shared/operational-request-orchestrator.js';
import { CANDIDATE_FIELDS, createEmptyCandidate } from '../core/adn/operational-request-state.js';

const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');

/* La demande du propriétaire, inchangée d'un bout à l'autre de ces lots. */
const DEMANDE_PROPRIETAIRE = 'J’ai besoin d’un document pour ma réunion.';
const QUESTION_HISTORIQUE = 'Quel type de contenu doit être inclus dans ce document ?';
/* La demande de V211-04, qui doit garder son exemption. */
const DEMANDE_CONVERSION = 'Je veux convertir ce texte dans un autre format de document.';

/* ==========================================================================
 * D2D-01 — LE CONSOMMATEUR LIT LE FAIT, ET RIEN QUE LE FAIT
 * ======================================================================= */

test('V221D2D-01 : la nature de l’objectif décide seule cette branche du signal C', () => {
  /* La MÊME demande, quatre faits différents. Si un mot de la demande décidait encore, ces quatre
     lignes rendraient la même valeur. */
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'transformation' }), true);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'production' }), false);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'other' }), false);
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: null }), false, 'sans fait : échec fermé');
  /* Et symétriquement, une demande de conversion n'est plus exemptée par ses mots. */
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: null }), false,
    'nommer un livrable n’exempte plus rien');
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'transformation' }), true,
    'l’exemption revient par le fait, jamais par le mot');
});

test('V221D2D-02 : le vocabulaire est fermé, et « other » n’est pas un échec', () => {
  assert.deepEqual([...OBJECTIVE_NATURES], ['production', 'transformation', 'other']);
  /* « other » se comporte exactement comme « production » du point de vue du garde : pas
     d'exemption. Ce n'est pas un repli déguisé vers transformation. */
  assert.equal(requestIsAboutItsOwnForm({ objectiveNature: 'other' }), false);
  /* Une valeur inconnue ne vaut jamais transformation. */
  assert.equal(requestIsAboutItsOwnForm(DEMANDE_CONVERSION, 'TRANSFORMATION'), false);
  assert.equal(requestIsAboutItsOwnForm(DEMANDE_CONVERSION, true), false);
});

/* ==========================================================================
 * D2D-03 — LE CAS PROPRIÉTAIRE EST ENFIN FERMÉ
 * ======================================================================= */

test('V221D2D-03 : la question historique est refusée DANS SON CONTEXTE RÉEL', () => {
  /* C'EST LA LIGNE QUE D2B NE POUVAIT PAS ÉCRIRE. Elle épinglait l'inverse, et nommait la cause.
     La cause est levée : l'exemption ne se déclenche plus sur le seul nom du livrable. */
  const NOTRE_SORTIE = 'output_specification';
  assert.equal(isMetaOutputQuestion(QUESTION_HISTORIQUE, { objectiveNature: null, questionFocus: NOTRE_SORTIE }), true);
  assert.equal(guardDisplayedQuestion(QUESTION_HISTORIQUE,
    { questionFocus: NOTRE_SORTIE }).verdict !== 'ALLOW',
    true, 'elle n’atteint pas l’écran telle quelle');
  /* Mesuré sur le vrai plan profond, en deux passages : cette demande reçoit « other » puis
     « production » — jamais « transformation ». Seul « transformation » exempte, donc les deux
     valeurs observées ferment le défaut, et l'absence de fait le ferme aussi. */
  for (const nature of ['other', 'production', null]) {
    assert.equal(isMetaOutputQuestion(QUESTION_HISTORIQUE, { objectiveNature: nature, questionFocus: NOTRE_SORTIE }), true);
  }
});

test('V221D2D-04 : la protection de V211-04 est conservée, par le fait et non par les mots', () => {
  const question = 'Sous quel format souhaitez-vous la sortie ?';
  assert.equal(isMetaOutputQuestion(question, { objectiveNature: 'transformation', questionFocus: 'output_specification' }), false,
    'quand l’objectif EST la mise en forme, la question sur la forme est le sujet');
  assert.equal(guardDisplayedQuestion(question,
    { objectiveNature: 'transformation', questionFocus: 'output_specification' }).verdict,
    'ALLOW');
});

/* ==========================================================================
 * D2D-05 — LE FAIT TRAVERSE LA FRONTIÈRE D'AFFICHAGE
 * ======================================================================= */

test('V221D2D-05 : la frontière profonde lit la nature portée par le tour', () => {
  const tour = (nature) => Object.freeze({
    state: 'clarification_required',
    objective_nature: nature,
    next_question: Object.freeze({ text: 'Sous quel format souhaitez-vous la sortie ?', targets_issue_id: 'I1', expected_progress: 'x', question_focus: 'output_specification' }),
    operational_request_candidate: Object.freeze({ a: 1 }), issues: Object.freeze([]), reason: 'r'
  });
  /* Même demande, même question : seul le fait porté par le tour change le résultat. */
  const passe = applyDisplayGuardToTurn(tour('transformation'), { question_candidates: [] }, () => {});
  assert.equal(passe.next_question.text, 'Sous quel format souhaitez-vous la sortie ?');
  /* TRACER-REMEDIATION-02 · F2 — le REFUS est inchangé ; ce qu'il produit ne l'est plus. La
     frontière rendait un tour réclamant une clarification sans la poser ; elle déclare désormais la
     sortie contractuellement inexploitable. L'état n'est toujours pas touché : elle ne décide
     aucune readiness, elle constate qu'il n'y a rien à montrer. */
  assert.throws(() => applyDisplayGuardToTurn(tour('production'), { question_candidates: [] }, () => {}),
    (e) => e.code === 'turn_contractually_unusable');
  /* Et la frontière ne nomme toujours aucun état : la readiness reste celle d'OPRIE. */
  const source = applyDisplayGuardToTurn.toString();
  assert.equal(/operational_request_ready|"blocked"|'blocked'/.test(source), false);
});

/* ==========================================================================
 * D2D-06 — LE CONTRAT : OÙ LE FAIT VIT, ET OÙ IL NE VIT PAS
 * ======================================================================= */

test('V221D2D-06 : le fait vit au niveau du TOUR, jamais dans le candidat', () => {
  /* Placé dans le candidat, il serait entré automatiquement dans assessProvenance et dans
     diffCandidates — il aurait donc exigé un enregistrement de provenance à chaque tour, et
     rouvert le contrat stabilisé en V2.1.5.2. Il décrit un objectif, pas l'origine d'une valeur. */
  assert.equal(ARBITER_OUTPUT_FIELDS.includes('objective_nature'), true);
  assert.equal(CORE_OUTPUT_FIELDS.includes('objective_nature'), true);
  assert.equal(CANDIDATE_FIELDS.includes('objective_nature'), false, 'le candidat n’est pas touché');
});

test('V221D2D-07 : le producteur est lié par le schéma, le lecteur survit à l’absence', () => {
  /* Écriture stricte : le schéma forcé impose le champ et son vocabulaire. */
  assert.deepEqual(ARBITER_JSON_SCHEMA.properties.objective_nature, { type: 'string', enum: [...OBJECTIVE_NATURES] });
  assert.equal(ARBITER_JSON_SCHEMA.required.includes('objective_nature'), true);
  assert.equal(CORE_JSON_SCHEMA.required.includes('objective_nature'), true);
  /* Lecture tolérante : un tour sans le champ reste valide, et le fait vaut « non dit ». */
  const tourNu = {
    state: 'clarification_required',
    operational_request_candidate: createEmptyCandidate(), issues: [],
    next_question: { text: 'Depuis quelle ville partez-vous ?', targets_issue_id: 'I1', expected_progress: 'x' },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r'
  };
  assert.equal(validateArbiterOutput(tourNu).objective_nature, null);
  /* Une valeur présente mais hors vocabulaire reste refusée : c'est une violation, pas un silence. */
  assert.throws(() => validateArbiterOutput({ ...tourNu, objective_nature: 'reformatage' }));
});

test('V221D2D-08 : la consigne définit le fait sans aucune liste de verbes ni exemple métier', () => {
  const bloc = CORE_SYSTEM_PROMPT.slice(CORE_SYSTEM_PROMPT.indexOf('8. objective_nature'));
  const consigne = bloc.slice(0, bloc.indexOf('\n'));
  assert.match(consigne, /production/);
  assert.match(consigne, /transformation/);
  assert.match(consigne, /other/);
  /* La consigne dit ce qu'il faut juger — l'objectif — et ce qu'il ne faut pas confondre avec lui. */
  assert.match(consigne, /jamais la présence d['’]un intrant/u);
  /* Et elle ne nomme aucun domaine, aucun format, aucun verbe de transformation. */
  for (const mot of ['convertir', 'reformater', 'markdown', 'pdf', 'rapport', 'tableau', 'traduire', 'résumer']) {
    assert.equal(new RegExp(`\\b${mot}`, 'iu').test(consigne), false, `« ${mot} » n’a rien à faire dans la consigne`);
  }
});

test('V221D2D-09 : le plan rapide n’est pas touché, et son absence de fait échoue fermé', () => {
  /* Aucun fait ne circule sur le chemin rapide : `guardDisplayedQuestion` y est appelé sans lui. */
  /* V2.2.1-D2F1 — le plan rapide transporte désormais ce que sa question interroge, mais toujours
     AUCUNE nature d'objectif : l'exemption du signal C y reste donc fermée. */
  assert.match(politique, /questionFocus: candidate\.question_focus/);
  assert.equal(politique.includes('objectiveNature: snapshot'), false, 'aucune nature d’objectif sur ce chemin');
  /* V2.2.1-D2F2 — et toujours aucun request_focus : sur ce chemin, les deux faits qui pourraient
     exempter sont absents, donc rien n'exempte. */
  assert.equal(isMetaOutputQuestion('Sous quel format souhaitez-vous la sortie ?',
    { questionFocus: 'output_specification' }), true);
  assert.equal(politique.includes('requestFocus: snapshot'), false, 'aucun fait de demande sur ce chemin');
});

test('V221D2D-10 : cette branche du signal C n’emploie plus NOMS_DE_PRODUCTION', () => {
  const corps = politique.slice(politique.indexOf('export function requestIsAboutItsOwnForm'));
  const fin = corps.indexOf('\n}');
  assert.equal(corps.slice(0, fin).includes('NOMS_DE_PRODUCTION'), false,
    'la nature de l’objectif ne se déduit plus d’une classe de mots');
  /* V2.2.1-D2F1 a depuis retiré NOMS_DE_PRODUCTION du module entier : cette branche ne pouvait
     déjà plus y revenir, et la classe de mots elle-même n'existe plus. */
  assert.equal(politique.includes('NOMS_DE_PRODUCTION'), false);
});
