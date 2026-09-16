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
  assert.match(P, /ne demandez rien/, 'la sortie sans question est nommée');
  assert.match(P, /WAIT_FOR_DEEP_VALIDATION/, 'et le type qui la porte est nommé');
  /* V2.1.2 — LA SECONDE ASSERTION A CHANGÉ DE CIBLE, SUR PREUVE. Elle épinglait « Si la demande nomme
   * déjà ce qu'il faut produire et sa forme, elle est exploitable : ne demandez rien ». Mesuré sur les
   * essais réels du propriétaire : pour « préparer une intervention de vingt minutes pour un groupe de
   * collègues », cette phrase suffisait à faire taire le plan rapide — la production ÉTAIT nommée — et
   * le plan profond posait ensuite, en vingt-deux secondes, la question qui manquait vraiment (le
   * niveau du public). La règle épinglée produisait donc le défaut. Ce qui est asservi désormais est
   * l'inverse exact, et c'est un test d'impact, pas une catégorie. */
  assert.match(P, /Que la demande nomme déjà ce qu'il faut produire ne rend pas exploitable tout le reste/,
    'nommer la production ne clôt pas la clarification');
  assert.match(P, /TEST DE MATÉRIALITÉ/, 'et ce qui tranche est l’impact sur ce qui sera produit');
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
  /* V2.1.2 — L'INVARIANT SURVIT, SA FORME A ÉTÉ INVALIDÉE PAR LA MESURE.
   *
   * Cette règle était énoncée comme une EXCLUSION PAR CATÉGORIE : « N'est jamais déterminant… une
   * préférence, un profil, un budget, un ton, un contexte d'usage… ». Sur les essais réels du
   * propriétaire, ces catégories couvraient exactement les variables qui changeaient le plus le
   * résultat — le niveau de connaissance d'un public, la modalité de participation d'un groupe. Le
   * plan rapide se taisait donc, et le plan profond posait la question dix-sept à quarante-cinq
   * secondes plus tard. Une catégorie ne peut pas décider de la matérialité : seul l'impact peut.
   *
   * L'invariant — une information seulement utile ne déclenche pas de question — reste asservi ici,
   * par le test qui l'exprime sans le fausser. */
  assert.match(P, /Si non, ne la\s+posez pas, même si l'information manque/,
    'une information ne se demande pas au seul motif qu’elle manque');
  assert.match(P, /Ne jugez JAMAIS par catégorie/, 'et la catégorie ne décide plus');
  assert.match(P, /deux préférences de goût, elles, donnent la même chose autrement colorée/,
    'le contre-exemple reste énoncé : ce qui ne fait que colorer ne se demande pas');
  assert.equal(/N'est jamais déterminant ce qui ne fait que colorer/.test(P), false,
    'et l’ancienne exclusion par catégorie a disparu');
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
  /* V2.1 — HISTORICAL_IMPLEMENTATION_CONTRACT. Cette ligne épinglait « jamais plus d'une », le
     quota par conversation du lot BETA-04. Il protégeait une doctrine qui n'existe plus : à l'époque,
     une question du plan rapide n'arrêtait PAS le plan profond. Depuis, le court-circuit IA-04
     arrête le tour et le plan rapide EST la boucle de clarification ; mesuré sur le dialogue réel du
     propriétaire, le quota faisait produire toutes les questions suivantes par le plan profond, en
     ~25 s chacune. L'invariant réel — l'exigence monte, et rien d'acquis n'est redemandé — reste
     asservi par les trois assertions ci-dessus et par celle qui suit. */
  assert.match(P, /cette information est\s+TRAITÉE/,
    'une réponse « je ne sais pas » ou une délégation ferme définitivement le point');
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
  assert.deepEqual(Object.keys(objet).sort(),
    ['demande', 'historique_clarifications', 'materiau_fourni', 'reponse_courante'],
    'ces champs exactement : rien par quoi une conversation antérieure pourrait entrer');
  /* `materiau_fourni` porte une PRÉSENCE et rien de plus : un booléen ne peut transporter ni titre,
     ni extrait, ni longueur du document de la personne. */
  assert.equal(typeof objet.materiau_fourni, 'boolean', 'une présence, jamais un contenu');
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
  /* V2.2.1-D2F1 — TROIS CHAMPS, ET L'INVARIANT EST LE MÊME.
     Le plan rapide écrit ses propres questions ; il doit donc dire ce qu'elles interrogent, comme
     le plan profond le fait pour les siennes. `question_focus` n'est PAS un champ d'autorité : il
     ne prononce aucun état, n'ouvre aucune route, n'autorise aucune exécution — ce que les
     assertions suivantes continuent de vérifier. */
  /* TARGETED-FIX-POST-CODEX-01 — un quatrième champ nommé, l'identité du manque. Le contre-audit a
     démontré qu'une question rapide répondue laissait l'historique sans identité : une reformulation
     ultérieure du même manque n'était alors plus reconnue. Le schéma reste clos et incapable de
     porter un état — c'est ce que cette assertion garde, et cela n'a pas changé. */
  assert.deepEqual(FAST_INTERACTION_JSON_SCHEMA.required, ['type', 'text', 'question_focus', 'missing_determinant_id'],
    'le plan rapide reste physiquement incapable de porter un état');
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.properties.type.enum], [...FAST_INTERACTION_TYPES],
    'l’énumération du schéma reste celle du plan, sans type libre');
});

/* ==========================================================================
 * T-03B-09 — AUCUN LEXIQUE DE DOMAINE, AUCUN SEUIL
 * ======================================================================= */

test('T-03B-09 : la consigne ne contient ni mot de domaine ni seuil chiffré', () => {
  /* TEST_BUG corrigé en V2.1 : sans limite de mot, « train » matchait à l'intérieur de
     « con-train-te » — un mot de CATÉGORIE, employé par toute la doctrine. Le test visait le moyen de
     transport ; il refusait un mot du vocabulaire générique. Les limites rétablissent son intention,
     et le contrôle reste strict : « le train et l'avion » serait toujours refusé. */
  for (const domaine of ['malaga', 'voyage', 'présentation', 'cadeau', 'repas', 'budget personnel',
                         'photosynthèse', 'train', 'avion', 'séjour', 'diapositive']) {
    assert.equal(new RegExp(`\\b${domaine}\\b`, 'i').test(P), false, `« ${domaine} » n’a rien à faire dans le protocole`);
  }
  /* Et la preuve que le contrôle mord encore. */
  assert.equal(new RegExp('\\btrain\\b', 'i').test('comparer le train et l’avion'), true);
  assert.equal(/\b\d+\s*(jour|mot|élément|question|paragraphe|paragraphes)\b/i.test(P), false,
    'aucun seuil chiffré : seul le protocole est décrit');
  /* Le critère reste énoncé comme un test à appliquer, non comme une préférence. */
  assert.match(P, /appliquez ce test, et lui seul/, 'un seul test, explicitement unique');
});
