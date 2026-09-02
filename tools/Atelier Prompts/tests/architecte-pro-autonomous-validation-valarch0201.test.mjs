/* VALIDATION-ADN-ARCH-02-01 — ONGLET ARCHITECTE PRO EN USAGE AUTONOME
 * ============================================================================
 *
 * CE QUE CE FICHIER FIGE
 *
 *   1. Le compilateur reste inaccessible sans contrat canonique — dans TOUS les
 *      cas, y compris ceux où la tentation d'un repli serait la plus forte.
 *   2. Aucune voie ne permet de fabriquer localement une readiness, un état
 *      `operational_request_ready` ou un `executability.state = exploitable`.
 *   3. Le refus est EXPLICITE et désigne le chemin canonique existant (§18).
 *   4. Les métriques de source de ADN-ARCH-02 restent intactes.
 *
 * CE QUE CE FICHIER NE FIGE PAS
 *
 *   Le CONTRAT PRODUIT de l'onglet Architecte Pro autonome. Les preuves d'UI
 *   montrent un parcours autonome complet (5 étapes numérotées, dont une route
 *   « sans clé API »), et la ROADMAP exige ARCHITECTE_HISTORICAL_BEHAVIOR_PRESERVED.
 *   Le rétablir suppose de faire passer l'onglet par OPRIE — donc de rendre
 *   réseau-dépendante une route aujourd'hui hors ligne. C'est une DÉCISION
 *   PRODUIT, pas une décision d'implémentation : elle est explicitement remontée,
 *   et aucune architecture n'est improvisée ici.
 *
 * AUCUNE MODIFICATION DE PRODUCTION : le HTML est lu, jamais réécrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeArchSemanticSourceCount, canonicalToArchProjectionInput } from '../core/adn/arch-canonical-enrichment.js';
import { createArchitecteHarness, analyseFixture, enrichedContractFixture, arbiterFixture } from './archcompiler-harness.helper.mjs';
import { productionSlice } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const DEMANDE = 'Demande saisie directement dans l’onglet Architecte Pro.';
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Couche de compilation Architecte, commentaires retirés. */
const compilerLayer = () => stripComments(productionSlice('let archContratCanonique=', 'function archEnvoyerVersQualite('));
/** CODE Architecte, commentaires retirés. Les deux constantes de texte gelées
 *  (ARCH_SCHEMA, ARCH_SYSTEM) en sont exclues : ce sont des prompts destinés au
 *  LLM, où « exploitable » est du français ordinaire et non un état de readiness.
 *  La borne `const ARCH_LOCAL_FIELDS=` est celle que le frozen guard utilise
 *  déjà comme fin de ARCH_SYSTEM. */
const architecteBlock = () => stripComments(productionSlice('const ARCH_LOCAL_FIELDS=', '<script id="v11-controller">'));

/* ==========================================================================
 * T-VALARCH02-01 — PARCOURS GUIDÉ AVEC CONTRAT : LA COMPILATION FONCTIONNE
 * ======================================================================= */

test('T-VALARCH02-01 Architecte guidé, contrat canonique présent → la compilation aboutit', () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  const contrat = enrichedContractFixture(harness, { demande: DEMANDE, arbiter: arbiterFixture() });

  const prompt = harness.compiler(contrat);
  assert.ok(prompt.length > 0, 'le prompt professionnel est bien produit');
  assert.match(prompt, /^## RÔLE/, 'le prompt compilé est complet');
  assert.equal(harness.sortieDOM, prompt);

  /* Le contrat reste appliqué : recompiler depuis l'onglet, sans réanalyse,
     fonctionne — c'est exactement l'usage « guidé puis expert ». */
  assert.ok(harness.contratCanonique, 'le contrat appliqué persiste');
  assert.equal(harness.compiler(), prompt, 'le bouton « Compiler » de l’onglet réutilise le même contrat');
});

/* ==========================================================================
 * T-VALARCH02-02 — AUTONOME SANS CANONICAL : AUCUN REPLI POSSIBLE
 * ======================================================================= */

test('T-VALARCH02-02 Architecte autonome sans contrat → aucun repli sur archAnalyse n’est possible', () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  /* Parcours autonome exact : l'analyse est importée par le chemin de production
     (validation incluse), et RIEN d'autre n'est fourni. */
  assert.equal(harness.importer(analyseFixture()), true, 'l’analyse autonome reste acceptée');
  assert.ok(harness.analyse, 'archAnalyse est bien renseignée');
  assert.equal(harness.contratCanonique, null, 'une nouvelle analyse périme tout contrat appliqué');

  assert.equal(harness.compiler(), '', 'aucun prompt n’est produit');
  assert.equal(harness.sortieDOM, '', 'aucun prompt partiel n’est laissé dans le DOM');

  /* Le repli est structurellement impossible, pas seulement absent : le corps du
     compilateur ne contient aucune lecture de archAnalyse. */
  assert.equal(/\barchAnalyse\b/.test(compilerLayer()), false, 'RAW_ARCH_FALLBACK_ALLOWED = NO');
});

/* ==========================================================================
 * T-VALARCH02-03 — AUCUNE READINESS FABRIQUÉE LOCALEMENT
 * ======================================================================= */

test('T-VALARCH02-03 Architecte autonome ne peut fabriquer aucune readiness', () => {
  const bloc = architecteBlock();
  /* Aucune VALEUR de readiness n'existe dans le bloc : ni l'état exécutable,
     ni les états de dialogue. Une readiness ne peut donc pas y être écrite. */
  /* ADN-ARCH-02-B1 : l'onglet LIT désormais l'issue d'un tour OPRIE pour orienter
     la personne. Il ne PRODUIT toujours aucune valeur de readiness — aucune des
     valeurs qui autorisent ou qualifient une exécution n'existe dans son code. */
  for (const valeur of ['operational_request_ready', 'exploitable', 'clarification_necessaire',
    'clarification_required', 'confirmation_required', 'degraded_state', 'execution_ready']) {
    assert.equal(bloc.includes(`'${valeur}'`), false, `le bloc Architecte ne produit jamais la valeur ${valeur}`);
    assert.equal(bloc.includes(`"${valeur}"`), false, `le bloc Architecte ne produit jamais la valeur ${valeur}`);
  }
  /* Aucun CONSTRUCTEUR de contrat canonique n'y est écrit ni appelé directement :
     l'onglet passe par le composeur du noyau, qui enchaîne les primitives existantes. */
  for (const producteur of ['mapOprieToCanonicalContract', 'canonical_base', 'oprie_state',
    'buildExecutionEnvelope', 'oprieBuildCanonicalContract', 'validateCanonicalContract']) {
    assert.equal(bloc.includes(producteur), false, `le bloc Architecte ne fabrique aucun contrat (${producteur})`);
  }
  assert.match(bloc, /runtime\.buildArchitecteContractFromTurn\(/, 'il délègue au composeur du noyau');
  /* `executability` n'y apparaît qu'en LECTURE de la projection — jamais en écriture. */
  const ecritures = [
    ...(bloc.match(/executability(?:\.[\w$]+)*\s*=(?![=>])/g) || []),
    ...(bloc.match(/executability\s*:/g) || [])
  ];
  assert.deepEqual(ecritures, [], 'executability n’est jamais écrite côté Architecte');
  assert.ok(bloc.includes('p.executability.remaining_unknowns'), 'elle n’est lue que via la projection du contrat');
  /* Et aucun objet fabriqué à la main ne franchit la garde de forme canonique. */
  for (const faux of [
    { executability: { oprie_state: 'operational_request_ready', state: 'exploitable' } },
    { intent: { objective: 'X' }, executability: { state: 'exploitable' } },
    { original_request: 'X', intent: {}, executability: { oprie_state: 'inventé' } }
  ]) {
    assert.equal(canonicalToArchProjectionInput(faux), null, 'une readiness fabriquée est refusée');
    assert.equal(activeArchSemanticSourceCount(faux), 0);
  }
});

/* ==========================================================================
 * T-VALARCH02-04 — LE COMPILATEUR N'ACCEPTE PAS UNE ANALYSE BRUTE
 * ======================================================================= */

test('T-VALARCH02-04 Architecte autonome ne peut pas appeler le compilateur avec archAnalyse', () => {
  const analyse = analyseFixture();
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyse);

  /* Les trois formes d'appel qu'un chemin autonome pourrait tenter. */
  assert.equal(harness.compiler(analyse), '', 'analyse 3.4 passée comme contrat');
  assert.equal(harness.compiler(harness.analyse), '', 'archAnalyse du moteur passée comme contrat');
  assert.equal(harness.compiler({ ...analyse, executability: { oprie_state: 'operational_request_ready', state: 'exploitable' } }), '',
    'analyse déguisée en contrat');
  assert.equal(harness.sortieDOM, '', 'aucune de ces tentatives ne produit quoi que ce soit');
});

/* ==========================================================================
 * T-VALARCH02-05 — UX FAIL-CLOSED EXPLICITE (§18)
 * ======================================================================= */

test('T-VALARCH02-05 le refus est explicite, non technique, et désigne le chemin canonique', () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  harness.compiler();
  const message = harness.statutDOM;

  assert.ok(message.length > 0, 'un message est affiché');
  assert.match(message, /parcours guidé/, 'il nomme le chemin canonique existant');
  assert.match(message, /Préparer une demande/, 'il nomme l’action concrète à faire');
  assert.match(message, /restent disponibles/, 'il dit ce qui n’est PAS perdu');
  /* Pas de jargon interne : la personne ne doit pas avoir à connaître l'ADN. */
  for (const jargon of ['canonique', 'canonical', 'OPRIE', 'enrichedContract', 'archAnalyse', 'readiness', 'null']) {
    assert.equal(message.includes(jargon), false, `message cryptique : ${jargon}`);
  }
  /* Le message est UNIQUE : une seule constante, partagée. */
  assert.equal((HTML.match(/const ARCH_MESSAGE_CONTRAT_REQUIS=/g) || []).length, 1);
  assert.match(compilerLayer(), /archEtat\(ARCH_MESSAGE_CONTRAT_REQUIS,'alerte'\)/);
});

/* ==========================================================================
 * T-VALARCH02-06 — SI UNE VOIE CANONIQUE AUTONOME EXISTE, ELLE PASSE PAR LE CONTRAT
 * ======================================================================= */

test('T-VALARCH02-06 aucune voie canonique autonome n’existe aujourd’hui ; toute voie future devra passer par le contrat', () => {
  /* CONSTAT MESURÉ, pas supposé : le bloc Architecte n'a aucun accès à OPRIE. */
  const bloc = architecteBlock();
  assert.equal(bloc.includes('oprieRunTurn'), false, 'aucune voie OPRIE depuis l’onglet');
  assert.equal(bloc.includes('OPRIE_ENDPOINT'), false, 'aucun endpoint OPRIE atteignable depuis l’onglet');
  assert.equal(bloc.includes('oprieState'), false, 'aucun accès à l’état OPRIE depuis l’onglet');

  /* AUTONOMOUS_CANONICAL_PATH_EXISTS = NO. Le jour où un lot l'ouvrira, il devra
     franchir cette même porte : `appliquerContrat` puis `compiler(contrat)`.
     La porte est déjà là, testée, et n'accepte qu'un contrat canonique. */
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  assert.equal(harness.appliquerContrat(analyseFixture()), true,
    'appliquerContrat accepte l’objet, mais ne le rend pas compilable pour autant');
  assert.equal(harness.compiler(), '', 'seule la FORME canonique ouvre la compilation');

  const contrat = enrichedContractFixture(harness, { demande: DEMANDE });
  assert.equal(harness.appliquerContrat(contrat), true);
  assert.ok(harness.compiler().length > 0, 'un contrat canonique enrichi, lui, compile');
});

/* ==========================================================================
 * T-VALARCH02-07 — MÉTRIQUES DE SOURCE INCHANGÉES
 * ======================================================================= */

test('T-VALARCH02-07 ARCH_GLOBAL_ACTIVE_SEMANTIC_SOURCE_COUNT reste 1', () => {
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyseFixture());
  const contrat = enrichedContractFixture(harness, { demande: DEMANDE });

  assert.equal(activeArchSemanticSourceCount(contrat), 1);
  assert.equal(activeArchSemanticSourceCount(analyseFixture()), 0);
  assert.equal(activeArchSemanticSourceCount(null), 0);

  const layer = compilerLayer();
  assert.equal(/\barchAnalyse\b/.test(layer), false, 'ARCH_COMPILER_RAW_ARCHANALYSE_READS = 0');
  for (const bloc of ['.comprehension', '.evaluation', '.strategie', '.livrable', '.verification', '.apprentissage']) {
    /* ADN-QG-01 — resserrement identique : `verification_status` est un champ du
       contrat canonique, pas une lecture brute du bloc 3.4. */
    assert.equal(new RegExp('\\' + bloc + '\\b(?!_)').test(layer), false, `aucune lecture brute ${bloc}`);
  }
});

/* ==========================================================================
 * T-VALARCH02-08 — AUCUNE RÉGRESSION D'AUTORITÉ OPRIE
 * ======================================================================= */

test('T-VALARCH02-08 OPRIE reste seule autorité de readiness, et Architecte ne pose aucune question', () => {
  /* Les deux chemins actifs continuent de valider AVANT de compiler. */
  for (const [nom, slice] of [
    ['PATH_A', productionSlice('async function beginApiAnalysis', 'function compositeDemand')],
    ['PATH_B', productionSlice('function useAnalysis', 'function showQuestion')]
  ]) {
    assert.ok(slice.indexOf('adnValidatePostOprie') < slice.indexOf('api.compiler('), `${nom} : validation avant compilation`);
    assert.match(slice, /if\(stopSignals\.length\)/, `${nom} : arrêt fail-closed conservé`);
    assert.match(slice, /api\.compiler\(enrichment&&enrichment\.contract\)/, `${nom} : contrat enrichi conservé`);
  }
  /* Architecte ne pose aucune question et ne décide d'aucun état. */
  const layer = compilerLayer();
  for (const interdit of ['questions_a_poser', 'next_question', 'showQuestion', 'execution_ready',
    'clarification', 'confirm(']) {
    assert.equal(layer.includes(interdit), false, `ARCH_CAN_ASK_DIRECT_QUESTION = NO (${interdit})`);
  }
  /* L'ancienne readiness Architecte reste sans appelant (DEFER → CLEAN-01). */
  const callers = (HTML.match(/adnAssessArchitecteReadiness/g) || []).length;
  assert.equal(callers, 1, 'adnAssessArchitecteReadiness reste défini et jamais appelé');
});
