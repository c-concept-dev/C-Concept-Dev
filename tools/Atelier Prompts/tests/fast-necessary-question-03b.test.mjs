/* 03B — LE PLAN RAPIDE PEUT DEMANDER, QUAND C'EST NÉCESSAIRE ET SEULEMENT ALORS.
 * ============================================================================
 *
 * 03A avait mesuré la cause : la consigne du plan rapide disait « demander une précision est le
 * dernier recours, jamais le premier » et proposait ACKNOWLEDGE en tête. Résultat, ACKNOWLEDGE 6/6,
 * sollicitation 0/6 — et comme le court-circuit du tour ne s'arme que sur une sollicitation, 100 %
 * des tours partaient dans le plan profond, 116 à 123 s, pour finir par poser une question.
 *
 * Ce qui manquait n'était pas une permission mais un CRITÈRE. La consigne énonce désormais une
 * procédure ordonnée dont le test central est : les deux lectures raisonnables les plus éloignées de
 * la demande donneraient-elles des livrables SUBSTANTIELLEMENT DIFFÉRENTS de nature, d'étendue ou de
 * structure — ou le même livrable autrement coloré ?
 *
 * Conformité mesurée sur fournisseur réel, avec le schéma et le message exacts du Worker :
 *   sonnet-5   8/8      haiku-4.5   6/8   (sur-demande sur deux cas de cadrage)
 *
 * Cette suite fige la RÈGLE, pas une latence réseau. Le décompte d'appels — une question rapide
 * n'ouvre aucun plan profond, un silence rapide en ouvre un — est déjà figé par T-DN01-A et
 * T-DN01-B du lot 1D-N ; il n'est pas dupliqué ici.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAST_INTERACTION_SYSTEM_PROMPT, makeFastInteractionUserMessage } from '../workers/groq/src/index.js';
import { FAST_INTERACTION_TYPES, FAST_INTERACTION_JSON_SCHEMA, ONE_NEXT_INTERACTION_MAX } from '../workers/shared/fast-interactive-plane.js';

const P = FAST_INTERACTION_SYSTEM_PROMPT;

/* ==========================================================================
 * T-03B-01 / 02 — LA PROCÉDURE DE DÉCISION EXISTE, ET ELLE EST ORDONNÉE
 * ======================================================================= */

test('T-03B-01 : une demande exploitable ne déclenche aucune question', () => {
  /* La consigne doit dire, explicitement, quoi répondre quand rien de déterminant ne manque. */
  assert.match(P, /ne demandez rien\. Répondez WAIT_FOR_DEEP_VALIDATION/,
    'la sortie sans question doit être nommée, pas laissée à l’interprétation');
  assert.match(P, /Si la demande nomme déjà ce qu'il faut produire et sa\s+forme, elle est exploitable : ne demandez rien/,
    'et le cas « déjà exploitable » doit être tranché sans ambiguïté');
});

test('T-03B-02 : une inconnue déterminante autorise UNE question', () => {
  assert.match(P, /déterminante/i, 'la notion doit être nommée');
  assert.match(P, /Posez UNE seule question/, 'et bornée à une');
  assert.match(P, /Pour savoir si ce recours est atteint/,
    'et le moment où demander devient licite doit être décidable, non laissé au goût du modèle');
  assert.match(P, /ASK_CLARIFICATION/, 'avec le type qui arme le court-circuit');
});

/* ==========================================================================
 * T-03B-03 — UN SEUL CRITÈRE, ET IL DISCRIMINE
 * ======================================================================= */

test('T-03B-03 : le critère est la différence substantielle entre deux lectures', () => {
  /* C'est ce test qui sépare « plan de repas » (1 jour ou 1 mois : livrables différents) de
     « compare le train et l'avion, en tableau, avec avantages, inconvénients et critères »
     (le livrable est déjà nommé et formé ; un trajet précis ne ferait que le colorer). */
  assert.match(P, /deux lectures\s+raisonnables les plus éloignées/,
    'le critère compare deux lectures, il ne juge pas une complétude');
  assert.match(P, /SUBSTANTIELLEMENT DIFFÉRENTES/, 'et exige une différence substantielle');
  assert.match(P, /de nature,\s+d'étendue ou de structure/, 'sur trois dimensions nommées');
  assert.match(P, /ou la même chose autrement colorée/, 'avec le contre-exemple explicite');
  assert.match(P, /celle qui sépare\s+ces deux lectures/,
    'et la question posée doit être celle qui sépare ces deux lectures');
});

/* ==========================================================================
 * T-03B-04 — CE QUI N'EST JAMAIS DÉTERMINANT
 * ======================================================================= */

test('T-03B-04 : une information seulement utile ne déclenche pas de question', () => {
  assert.match(P, /N'est jamais déterminant ce qui ne fait que colorer ce qui est déjà nommé/,
    'la règle doit être énoncée comme une exclusion, non comme une nuance');
  for (const confort of ['préférence', 'profil', 'budget', 'ton', "contexte d'usage",
                         'cas particulier', 'enrichissement', 'personnalisation', 'cadrage plus fin']) {
    assert.ok(P.includes(confort), `« ${confort} » doit figurer parmi les manques non déterminants`);
  }
  /* Et les six voies alternatives restent nommées, mot pour mot : demander n'est pas le seul
     traitement d'une inconnue. C'est la même liste que T-P03A-21 protège depuis le lot PERF-03A. */
  for (const voie of ['recherchée', 'décidée', 'estimée', 'scénario', 'conditionnée', 'inconnue']) {
    assert.ok(P.includes(voie), `la voie « ${voie} » doit rester disponible`);
  }
});

/* ==========================================================================
 * T-03B-05 / 08 — APRÈS RÉPONSE, ET SANS FUITE
 * ======================================================================= */

test('T-03B-05 : après une réponse, l’exigence monte et rien n’est redemandé', () => {
  assert.match(P, /Tenez pour acquises les réponses déjà présentes dans l'historique/,
    'les réponses obtenues sont des acquis');
  assert.match(P, /ne redemandez jamais ce qui y\s+figure, ni une variante de ce qui y figure|ni une variante de ce qui y figure/,
    'y compris sous une formulation voisine — c’est la répétition observée en bêta');
  assert.match(P, /l'exigence monte/, 'et le seuil se durcit après une réponse');
  assert.match(P, /jamais plus d'une/, 'au plus une nouvelle question déterminante');
});

test('T-03B-08 : aucune fuite d’un dialogue antérieur vers le plan rapide', () => {
  /* Le message utilisateur n'expose que la photographie du tour courant : trois champs, et rien
     d'autre. Aucun état global, aucun historique implicite. */
  const message = makeFastInteractionUserMessage({
    original_request: 'Demande B.',
    clarification_history: [{ turn: 1, question: 'Q de B ?', answer: 'R de B', provenance: 'user' }],
    current_answer: null
  });
  const objet = JSON.parse(message);
  assert.deepEqual(Object.keys(objet).sort(), ['demande', 'historique_clarifications', 'reponse_courante'],
    'trois champs exactement : rien par quoi une conversation antérieure pourrait entrer');
  assert.equal(objet.demande, 'Demande B.');
  assert.equal(objet.historique_clarifications.length, 1);
});

/* ==========================================================================
 * T-03B-06 / 07 — DÉCOMPTE D'APPELS : DÉJÀ FIGÉ, NON DUPLIQUÉ
 * ======================================================================= */

test('T-03B-06/07 : le mécanisme d’escalade reste celui que 1D-N a figé', () => {
  /* Une seule interaction par tour, et une énumération fermée : ce sont les deux propriétés qui
     rendent le décompte d'appels vérifiable. Les décomptes eux-mêmes sont éprouvés par
     T-DN01-A (question rapide → deepCalls = 0) et T-DN01-B (silence rapide → deepCalls = 1). */
  assert.equal(ONE_NEXT_INTERACTION_MAX, 1, 'jamais un questionnaire');
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.required, ['type', 'text'],
    'deux champs : le plan rapide reste physiquement incapable de porter un état');
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.properties.type.enum], [...FAST_INTERACTION_TYPES],
    'l’énumération du schéma reste celle du plan, sans type libre');
});

/* ==========================================================================
 * T-03B-09 — AUCUN LEXIQUE DE DOMAINE, AUCUN SEUIL
 * ======================================================================= */

test('T-03B-09 : la consigne ne contient ni mot de domaine ni seuil chiffré', () => {
  for (const domaine of ['malaga', 'voyage', 'présentation', 'cadeau', 'repas', 'budget personnel',
                         'photosynthèse', 'train', 'avion', 'séjour', 'diapositive']) {
    assert.equal(new RegExp(domaine, 'i').test(P), false, `« ${domaine} » n’a rien à faire dans le protocole`);
  }
  assert.equal(/\b\d+\s*(jour|mot|élément|question|paragraphe|paragraphes)\b/i.test(P), false,
    'aucun seuil chiffré : seul le protocole est décrit');
  /* Le critère reste énoncé comme un test à appliquer, non comme une préférence. */
  assert.match(P, /appliquez ce test, et lui seul/, 'un seul test, explicitement unique');
});
