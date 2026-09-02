/* ADN-RAPIDE-FEED-00 — LE CONTRAT CANONIQUE ATTEINT LE CHEMIN RAPIDE
 * ============================================================================
 *
 * CE QUE CE LOT FERME
 *
 *   La base canonique existait dans `orientation.canonical` et s'arrêtait là :
 *   l'enveloppe Rapide était bâtie sur des arguments legacy. Elle atteint
 *   désormais l'enveloppe, attachée verbatim, et c'est elle qui gouverne la
 *   readiness — ce qui rend `fallbackDecision()` structurellement inatteignable
 *   sur ce chemin.
 *
 * CE QUE CE LOT NE FERME PAS, ET LE DIT
 *
 *   Les entrées sémantiques de l'état ADN Rapide restent celles du moteur
 *   historique. Les migrer changerait la sélection des verrous, donc le prompt
 *   rendu : c'est le périmètre de ADN-RAPIDE-01. D'ici là,
 *   RAPIDE_ACTIVE_SEMANTIC_SOURCE_COUNT = 2 (TEMPORAIRE), et ce fichier le
 *   mesure plutôt que de le taire.
 *
 * AUCUNE MODIFICATION DE PRODUCTION : le HTML est lu, jamais réécrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExecutionEnvelope, projectToRapide } from '../core/adn/engine-adapters.js';
import {
  OPRIE_STATES,
  isCanonicalBaseContract,
  validateCanonicalContract
} from '../core/adn/oprie-canonical-mapping.js';
import { canonicalFrom, oprieReadyTurn, productionSlice } from './post-oprie-validation-harness.helper.mjs';
import { runRapidePipeline } from './rapide-assembler-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const DEMANDE = 'Explique la différence entre deux approches.';
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Base canonique réelle, produite par le mapper de production. */
function baseFor(state = 'operational_request_ready', { original_request = DEMANDE } = {}) {
  return canonicalFrom(oprieReadyTurn({ state }), { request_id: 'rfeed-00', original_request });
}

/** Orientation telle que `oprieEnterExecution()` la construit pour Rapide. */
function orientationFor(base) {
  return {
    source: 'oprie', route: 'rapide', oprie: { state: base.executability.oprie_state },
    canonical: base, envelope: null, semantic: null, providerResult: null, action: null,
    decision: { state: 'ready' }
  };
}

const decisionOf = (etat, route) => ({
  source: 'none',
  decision: { etat_demande: etat, route, confiance: 'haute', raison_interne: 'test', question: null }
});

/* ==========================================================================
 * T-RFEED-01 / 02 / 03 — LA BASE ARRIVE, ET ARRIVE INTACTE
 * ======================================================================= */

test('T-RFEED-01 la base canonique atteint le chemin Rapide', () => {
  const base = baseFor();
  const avec = runRapidePipeline({ demande: DEMANDE, orientation: orientationFor(base) });

  assert.ok(avec.envelope, 'une enveloppe Rapide est produite');
  assert.ok(avec.envelope.canonical_base, 'RAPIDE_CANONICAL_BASE_AVAILABLE = YES');
  assert.equal(isCanonicalBaseContract(avec.envelope.canonical_base), true);

  /* Sans base — chemin legacy sans tour OPRIE — rien n'est attaché : la
     disponibilité vient de l'amont, jamais d'une fabrication locale. */
  const sans = runRapidePipeline({ demande: DEMANDE });
  assert.equal(sans.envelope.canonical_base, null);
});

test('T-RFEED-02 la base atteint buildExecutionEnvelope par le chemin de production', () => {
  const refine = stripComments(productionSlice('function adnRefineRapidEnvelope(', 'function adnMergeLegacyLocks('));
  assert.match(refine, /orientation&&orientation\.canonical/, 'la base est lue depuis l’orientation');
  assert.match(refine, /canonical_base:canonical/, 'et transmise à l’enveloppe');
  assert.match(refine, /adnCanonicalProviderResult\(canonical,'rapide'\)/, 'la décision en est dérivée');

  const build = stripComments(productionSlice('function adnBuildEnvelope(', 'function adnCanonicalProviderResult('));
  assert.match(build, /canonical_base:extras\.canonical_base\|\|null/, 'adnBuildEnvelope transmet la base');
  assert.match(build, /canonical_semantics:extras\.canonical_semantics!==false/);
});

test('T-RFEED-03 la base survit à l’enveloppe sans la moindre perte sémantique', () => {
  const base = baseFor();
  const avant = JSON.stringify(base);
  const avec = runRapidePipeline({ demande: DEMANDE, orientation: orientationFor(base) });

  /* MISE À JOUR ADN-RAPIDE-01 — CHANGEMENT VOULU : l'enveloppe porte désormais
     le contrat ENRICHI, non la base nue. L'invariant de non-perte, lui, est
     inchangé et se vérifie famille par famille sur ce qui appartient à OPRIE. */
  const attache = avec.envelope.canonical_base;
  for (const chemin of ['original_request', 'intent', 'executability', 'assumptions.allowed',
    'evidence.external_facts', 'selected_locks', 'adn_summary']) {
    const lire = (o) => chemin.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    assert.deepEqual(clone(lire(attache)), clone(lire(base)), `CANONICAL_BASE_SEMANTIC_LOSS = 0 · ${chemin}`);
  }
  assert.equal(JSON.stringify(base), avant, 'la base d’entrée n’est pas mutée');
  assert.notEqual(attache, base, 'l’enveloppe en porte une copie, pas la référence');
  assert.equal(validateCanonicalContract(attache, { original_request: DEMANDE }).ok, true);
});

/* ==========================================================================
 * T-RFEED-04 … 07 — LES QUATRE ÉTATS
 * ======================================================================= */

for (const [id, state] of [['04', 'clarification_required'], ['05', 'confirmation_required'], ['06', 'blocked']]) {
  test(`T-RFEED-${id} ${state} ne peut pas être promu`, () => {
    const base = baseFor(state);
    assert.equal(base.executability.state, 'clarification_necessaire');

    /* Aucune route active n'est possible, et aucune promotion ne l'est non plus. */
    assert.throws(() => buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, material: '', provider_result: decisionOf('exploitable', 'rapide') }), /Garde readiness/);
    assert.throws(() => buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, material: '', provider_result: decisionOf('exploitable', null) }), /Garde readiness/);
    assert.throws(() => buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, material: '', provider_result: decisionOf('clarification_necessaire', 'rapide') }), /interdit toute route active/);

    /* Le seul couple légal est non-exploitable + route nulle. */
    const env = buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, request: DEMANDE, material: '', provider_result: decisionOf('clarification_necessaire', null) });
    assert.equal(env.state.executability.state, 'clarification_necessaire');
    assert.equal(env.routing.route, null, 'aucune route Rapide active sur un non-ready');
  });
}

test('T-RFEED-07 operational_request_ready reste ready, et exige une route', () => {
  const base = baseFor();
  const env = buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, request: DEMANDE, material: '', provider_result: decisionOf('exploitable', 'rapide') });
  assert.equal(env.state.executability.state, 'exploitable');
  assert.equal(env.routing.route, 'rapide');
  assert.equal(env.canonical_base.executability.oprie_state, 'operational_request_ready');
});

/* ==========================================================================
 * T-RFEED-08 / 09 — CONTRADICTIONS LEGACY
 * ======================================================================= */

test('T-RFEED-08 une décision legacy « prête » ne peut pas écraser une clarification canonique', () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    assert.throws(
      () => buildExecutionEnvelope({ canonical_base: baseFor(state), canonical_semantics: false, material: '', provider_result: decisionOf('exploitable', 'rapide') }),
      /Garde readiness/,
      `${state} : aucune promotion par le legacy`
    );
  }
});

test('T-RFEED-09 une décision legacy « clarification » ne peut pas démoter un ready canonique', () => {
  assert.throws(
    () => buildExecutionEnvelope({ canonical_base: baseFor(), canonical_semantics: false, material: '', provider_result: decisionOf('clarification_necessaire', null) }),
    /Garde readiness/,
    'aucune démotion : la contradiction échoue fermé, dans les deux sens'
  );
});

/* ==========================================================================
 * T-RFEED-10 / 11 — ROUTE
 * ======================================================================= */

test('T-RFEED-10 une base non exploitable garde une route nulle', () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    const env = buildExecutionEnvelope({ canonical_base: baseFor(state), canonical_semantics: false, request: DEMANDE, material: '', provider_result: decisionOf('clarification_necessaire', null) });
    assert.equal(env.routing.route, null, state);
  }
});

test('T-RFEED-11 une base exploitable exige une route fournie par la couche de routage', () => {
  assert.throws(
    () => buildExecutionEnvelope({ canonical_base: baseFor(), canonical_semantics: false, material: '', provider_result: decisionOf('exploitable', null) }),
    /exige une route/
  );
  /* Et la route n'est jamais choisie par Rapide : elle vient du mode demandé. */
  const derivation = stripComments(productionSlice('function adnCanonicalProviderResult(', 'function adnCanonicalEnvelope('));
  assert.match(derivation, /route:executable\?route:null/, 'la route est un paramètre, jamais une déduction');
});

/* ==========================================================================
 * T-RFEED-12 — fallbackDecision INATTEIGNABLE
 * ======================================================================= */

test('T-RFEED-12 RAPIDE_CANONICAL_PATH_FALLBACK_DECISION_CALL_COUNT = 0', () => {
  const adapters = fs.readFileSync(path.join(root, 'core/adn/engine-adapters.js'), 'utf8');
  const bloc = stripComments(adapters.slice(adapters.indexOf('const decisionForState'), adapters.indexOf('const state = buildAdnState')));

  /* Structurellement : avec une base, la readiness passe par la garde ; le repli
     n'est atteignable que sur la branche SANS base. */
  assert.match(bloc, /attachedBase !== null\s*\?\s*assertCanonicalReadinessInvariant/);
  assert.match(bloc, /:\s*\(provider\.available \? provider\.decision : fallbackDecision\(provider_result\)\)/);

  /* Comportement : sans fournisseur, le repli promouvrait `exploitable` +
     `rapide`. Avec une base non prête, l'état obtenu reste non exploitable et
     la route reste nulle — la preuve que le repli n'a pas été consulté. */
  for (const state of OPRIE_STATES.filter((s) => s !== 'operational_request_ready')) {
    const env = buildExecutionEnvelope({ canonical_base: baseFor(state), canonical_semantics: false, material: '', provider_result: null });
    assert.equal(env.state.executability.state, 'clarification_necessaire', `${state} : aucune promotion par le repli`);
    assert.equal(env.routing.route, null, `${state} : aucune route promue par le repli`);
  }
  /* Et sur le chemin SANS base, le repli promeut bien — c'est la contre-épreuve
     qui prouve que la différence vient de la base, pas d'un hasard. */
  const sansBase = buildExecutionEnvelope({ request: DEMANDE, material: '', provider_result: null });
  assert.equal(sansBase.state.executability.state, 'exploitable', 'le repli legacy promeut toujours, hors chemin canonique');

  /* Un seul appelant de fallbackDecision, sur la branche sans base : LEGACY_ONLY. */
  const sansCommentaires = stripComments(adapters);
  const appels = (sansCommentaires.match(/fallbackDecision\(/g) || []).length;
  assert.equal(appels, 2, 'une définition et un unique appel, tous deux hors chemin canonique');
});

/* ==========================================================================
 * T-RFEED-13 / 14 — CONTAMINATION ET DEMANDE ORIGINALE
 * ======================================================================= */

test('T-RFEED-13 aucune donnée legacy ne contamine la base canonique attachée', () => {
  const base = baseFor();
  const env = buildExecutionEnvelope({
    canonical_base: base, canonical_semantics: false, material: '', provider_result: decisionOf('exploitable', 'rapide'),
    /* Tentative de contamination sur chaque famille canonique. */
    intent: { objective: 'LEGACY_OBJECTIF', deliverable: 'LEGACY_LIVRABLE', recipient: 'LEGACY_DESTINATAIRE' },
    executability: { state: 'exploitable', critical_missing: [{ description: 'LEGACY_MANQUE' }] },
    assumptions: [{ text: 'LEGACY_HYPOTHESE' }],
    evidence: { user_facts: [{ text: 'LEGACY_FAIT' }] },
    output: { format: 'LEGACY_FORMAT' },
    checks: [{ id: 'x', type: 'manual', target: 'deliverable', rule: 'LEGACY_CHECK', blocking: false }],
    obligations: [{ text: 'LEGACY_OBLIGATION', source: 'user', mandatory: true }],
    quantities: [{ target: 'LEGACY_UNITE', unit: 'LEGACY_UNITE', exact: 99, min: null, max: null }],
    semantic_lock_signals: [{ id: 'scope', needed: true, reason: 'LEGACY_SIGNAL', priority: 'mandatory', source: 'runtime', source_ids: [], associated_checks: [] }]
  });

  const serialise = JSON.stringify(env.canonical_base);
  for (const legacy of ['LEGACY_OBJECTIF', 'LEGACY_LIVRABLE', 'LEGACY_DESTINATAIRE', 'LEGACY_MANQUE',
    'LEGACY_HYPOTHESE', 'LEGACY_FAIT', 'LEGACY_FORMAT', 'LEGACY_CHECK', 'LEGACY_OBLIGATION',
    'LEGACY_UNITE', 'LEGACY_SIGNAL']) {
    assert.equal(serialise.includes(legacy), false, `contamination du canonical : ${legacy}`);
  }
  assert.deepEqual(clone(env.canonical_base), clone(base), 'LEGACY_SEMANTIC_CONTAMINATION_COUNT = 0 sur le canonical');

  /* Et la readiness reste celle de la base, malgré une executability legacy. */
  assert.equal(env.canonical_base.executability.oprie_state, 'operational_request_ready');
});

test('T-RFEED-14 original_request est immuable sur le chemin Rapide', () => {
  const demande = 'Demande originale — « guillemets », tirets — inchangée.';
  const base = baseFor('operational_request_ready', { original_request: demande });
  const avec = runRapidePipeline({ demande, orientation: orientationFor(base) });

  assert.equal(avec.envelope.canonical_base.original_request, demande);
  const env = buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, request: 'UNE AUTRE DEMANDE', material: '', provider_result: decisionOf('exploitable', 'rapide') });
  assert.equal(env.canonical_base.original_request, demande, 'la base garde sa demande, quoi que fournisse l’appelant');
});

/* ==========================================================================
 * T-RFEED-15 — AUCUNE BOUCLE DE QUESTIONS
 * ======================================================================= */

test('T-RFEED-15 RAPIDE_CAN_ASK_QUESTION = NO · RAPIDE_DIALOG_LOOP_COUNT = 0', () => {
  const rapide = stripComments(productionSlice('function adpRunRapide(', 'async function adpResumeAfterClarification('));
  for (const interdit of ['showQuestion', 'oprieAsk', 'next_question', 'questions_a_poser',
    'pendingQuestion=true', 'adnNextConversationAction']) {
    assert.equal(rapide.includes(interdit), false, `Rapide ne pose aucune question (${interdit})`);
  }
  assert.match(rapide, /adpState\.pendingQuestion=false/, 'toute question en attente est refermée');

  const refine = stripComments(productionSlice('function adnRefineRapidEnvelope(', 'function adnMergeLegacyLocks('));
  for (const interdit of ['question', 'clarification_history']) {
    assert.equal(refine.includes(interdit), false, `l’alimentation ne dialogue pas (${interdit})`);
  }
});

/* ==========================================================================
 * T-RFEED-16 / 17 / 18 — AUCUNE PERTE, AUCUN CHANGEMENT DE PROJECTION
 * ======================================================================= */

test('T-RFEED-16 CANONICAL_BASE_SEMANTIC_LOSS = 0 sur toutes les familles', () => {
  const base = baseFor();
  const env = buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, request: DEMANDE, material: '', provider_result: decisionOf('exploitable', 'rapide') });

  /* Les sept familles que la projection vers l'état ADN ne sait pas porter
     restent intégralement lisibles dans la base attachée. */
  for (const chemin of ['intent.secondary_objectives', 'intent.priorities', 'intent.preferences',
    'intent.delegated_decisions', 'executability.remaining_unknowns', 'evidence.external_facts',
    'executability.oprie_state']) {
    const lire = (o) => chemin.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), o);
    assert.deepEqual(clone(lire(env.canonical_base)), clone(lire(base)), chemin);
  }
  assert.deepEqual(Object.keys(clone(env.canonical_base)).sort(), Object.keys(clone(base)).sort());
});

test('T-RFEED-17 [MISE À JOUR ADN-RAPIDE-01] la projection est désormais canonique ; RAPIDE-CHAR-01 la caractérise', () => {
  const cas = [
    'Explique la différence entre deux approches.',
    'Donne 5 idées pour améliorer un processus.',
    'Compare trois options dans un tableau.',
    'Rédige un email de relance.',
    'Écris une fonction qui trie une liste.'
  ];
  for (const demande of cas) {
    const sans = runRapidePipeline({ demande });
    const avec = runRapidePipeline({ demande, orientation: orientationFor(baseFor('operational_request_ready', { original_request: demande })) });

    /* CHANGEMENT VOULU : les verrous viennent maintenant de l'ADN, pas du
       sélecteur historique. Les écarts sont caractérisés par RAPIDE-CHAR-01 ;
       ce qui est figé ICI, c'est que la sélection rendue est bien celle de l'ADN. */
    assert.deepEqual(clone(avec.mergedLocks), clone(avec.projection.legacy_lock_ids),
      `${demande} : les verrous rendus sont ceux de l’ADN`);
    assert.ok(avec.envelope.canonical_base, `${demande} : la base atteint toujours l’enveloppe`);
    assert.ok(sans.promptFinal.length > 0, `${demande} : le chemin legacy reste fonctionnel`);
  }
});

test('T-RFEED-18 le hash gelé du moteur Rapide est strictement inchangé', () => {
  const specs = [['function assemblerRapideAdaptatif(){', 'async function copierRapideAdaptatif'],
    ['function assemblerRapide(){', 'async function copierRapide()']];
  const extrait = specs.map(([debut, fin]) => {
    const a = HTML.indexOf(debut); const b = HTML.indexOf(fin, a + debut.length);
    assert.ok(a !== -1 && b !== -1, 'les bornes du moteur Rapide existent');
    return HTML.slice(a, b);
  }).join('\n<LOT10G-RANGE>\n');

  /* MISE À JOUR ADN-RAPIDE-01 : la bascule canonique modifie, à dessein et une
     seule fois, `assemblerRapideAdaptatif`. Le successeur est audité dans le
     rapport de ce lot ; `assemblerRapide()` reste identique octet pour octet. */
  const successeur = '3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664';
  assert.equal(crypto.createHash('sha256').update(extrait).digest('hex'), successeur,
    'le moteur Rapide correspond exactement au successeur audité');

  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8')).hashes;
  assert.equal(baseline['moteur Rapide'], successeur);
});

/* ==========================================================================
 * T-RFEED-19 / 20 — AUTORITÉ ET SUITE
 * ======================================================================= */

test('T-RFEED-19 OPRIE reste seule autorité de readiness sur le chemin Rapide', () => {
  const refine = stripComments(productionSlice('function adnRefineRapidEnvelope(', 'function adnMergeLegacyLocks('));
  const rapide = stripComments(productionSlice('function adpRunRapide(', 'async function adpResumeAfterClarification('));

  for (const source of [refine, rapide]) {
    for (const interdit of ["'exploitable'", "'operational_request_ready'", 'fallbackDecision',
      'executability=', 'oprie_state']) {
      assert.equal(source.includes(interdit), false, `LOCAL_RAPIDE_READINESS_DERIVATIONS = 0 (${interdit})`);
    }
  }
  /* MISE À JOUR ADN-RAPIDE-01 : deux reprises d'état existent — la dérivation
     partagée de la couche ADN, et celle du moteur Rapide canonique. Les deux
     LISENT `executability.state` ; aucune ne décide. */
  assert.equal((HTML.match(/etat_demande:executable\?'exploitable'/g) || []).length, 2);
  assert.match(stripComments(productionSlice('function adnCanonicalProviderResult(', 'function adnCanonicalEnvelope(')),
    /canonicalBase\.executability\.state==='exploitable'/);
});

test('T-RFEED-20 ADN-RAPIDE-01 pourra consommer ce feed sans recréer la sémantique', () => {
  const base = baseFor();
  const avec = runRapidePipeline({ demande: DEMANDE, orientation: orientationFor(base) });
  const recu = avec.envelope.canonical_base;

  /* Tout ce dont la future projection aura besoin est présent et intact. */
  assert.equal(isCanonicalBaseContract(recu), true);
  for (const famille of ['version', 'request_id', 'original_request', 'intent', 'evidence',
    'executability', 'assumptions', 'obligations', 'quantities', 'output', 'checks',
    'semantic_lock_signals', 'selected_locks', 'adn_summary']) {
    assert.ok(famille in recu, `${famille} disponible pour ADN-RAPIDE-01`);
  }
  assert.deepEqual(clone(recu.selected_locks.locks), [], 'la sélection des verrous reste à l’ADN');

  /* MISE À JOUR ADN-RAPIDE-01 — L'ÉCART EST FERMÉ : l'état ADN dérive
     désormais du contrat canonique, et non plus du moteur historique.
     RAPIDE_ACTIVE_SEMANTIC_SOURCE_COUNT est passé de 2 à 1. */
  assert.equal(avec.envelope.contract.intent.objective, recu.intent.objective,
    'RAPIDE_ACTIVE_SEMANTIC_SOURCE_COUNT = 1 — mesuré, pas supposé');
});

/* ==========================================================================
 * MATRICE 4 × 3 × 3 — AUCUNE PROMOTION, AUCUNE DÉMOTION, AUCUNE ROUTE ILLÉGALE
 * ======================================================================= */

test('T-RFEED-21 [MATRICE] 4 états × 3 décisions × 3 routes : 0 promotion, 0 démotion, 0 route illégale', () => {
  const decisions = ['exploitable', 'clarification_necessaire', null];
  const routes = ['rapide', 'architecte', null];
  let promotions = 0; let demotions = 0; let routesIllegales = 0; let acceptes = 0;

  for (const state of OPRIE_STATES) {
    const base = baseFor(state);
    const executable = state === 'operational_request_ready';
    for (const etat of decisions) {
      for (const route of routes) {
        const provider = etat === null ? null : decisionOf(etat, route);
        let env = null;
        try {
          env = buildExecutionEnvelope({ canonical_base: base, canonical_semantics: false, request: DEMANDE, material: '', provider_result: provider });
        } catch { continue; }
        acceptes += 1;
        const etatObtenu = env.state.executability.state;
        if (!executable && etatObtenu === 'exploitable') promotions += 1;
        if (executable && etatObtenu !== 'exploitable') demotions += 1;
        if (!executable && env.routing.route !== null) routesIllegales += 1;
      }
    }
  }
  assert.equal(promotions, 0, 'PROMOTIONS = 0');
  assert.equal(demotions, 0, 'DEMOTIONS = 0');
  assert.equal(routesIllegales, 0, 'ILLEGAL_NONREADY_ROUTES = 0');
  assert.ok(acceptes > 0, 'des combinaisons légales existent bien');
});

/* ==========================================================================
 * DEUX CHEMINS — avec base, et avec champs legacy encore présents
 * ======================================================================= */

test('T-RFEED-22 [DEUX CHEMINS] la base l’emporte, qu’il reste ou non des champs legacy', () => {
  const base = baseFor();

  /* PATH A — orientation OPRIE standard. */
  const a = runRapidePipeline({ demande: DEMANDE, orientation: orientationFor(base) });
  assert.ok(a.envelope.canonical_base);
  assert.equal(a.envelope.state.executability.state, 'exploitable');

  /* PATH B — une décision fournisseur legacy traîne encore dans l'orientation. */
  const orientationB = { ...orientationFor(base), providerResult: decisionOf('clarification_necessaire', null), semantic: { etat_demande: 'clarification_necessaire' } };
  const b = runRapidePipeline({ demande: DEMANDE, orientation: orientationB });
  assert.ok(b.envelope.canonical_base, 'la base est toujours attachée');
  assert.equal(b.envelope.state.executability.state, 'exploitable', 'la base l’emporte sur le résidu legacy');
  assert.equal(b.envelope.routing.route, 'rapide');
  assert.deepEqual(clone(b.envelope.canonical_base), clone(a.envelope.canonical_base));
});

/* ==========================================================================
 * AUCUN ANCRAGE DE DOMAINE
 * ======================================================================= */

test('T-RFEED-23 DOMAIN_HARDCODING_ADDED = NO', () => {
  const sources = [
    stripComments(fs.readFileSync(path.join(root, 'core/adn/engine-adapters.js'), 'utf8')),
    stripComments(productionSlice('function adnBuildEnvelope(', 'function adnMergeLegacyLocks('))
  ];
  for (const source of sources) {
    for (const interdit of ['case_id', 'embedding', 'fuzzy', 'levenshtein', 'similarity', 'corpus']) {
      assert.equal(source.toLowerCase().includes(interdit), false, `aucun ancrage de domaine (${interdit})`);
    }
    assert.equal(/\btoLowerCase\(\)\s*\.\s*includes\(/.test(source), false, 'aucun appariement de mots-clés');
  }
});
