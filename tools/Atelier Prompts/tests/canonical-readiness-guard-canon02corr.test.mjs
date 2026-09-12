/* CORRECTION-ADN-CANON-02-01 — GARDE CENTRALE DE READINESS
 * ============================================================================
 *
 * Invariant : quand un Canonical Base Contract est présent, il est l'UNIQUE
 * source de readiness. Aucune décision, route, valeur legacy, valeur par défaut
 * ni mode ne peut la promouvoir ni la démoter.
 *
 * Choix explicite : FAIL CLOSED sur contradiction, dans les DEUX sens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  mapOprieToCanonicalContract,
  validateCanonicalEnvelopeConvergence,
  assertCanonicalReadinessInvariant,
  activeReadinessSourceCount,
  CANONICAL_READINESS_MATRIX,
  OPRIE_STATES
} from '../core/adn/oprie-canonical-mapping.js';
import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = 'DEMANDE_BRUTE_GARDE';

function turn(state = 'operational_request_ready', overrides = {}) {
  return {
    state,
    operational_request_candidate: {
      objective: 'OBJECTIF_GARDE', expected_deliverable: 'LIVRABLE_GARDE',
      secondary_objectives: ['SEC_GARDE'], confirmed_constraints: ['CON_GARDE'],
      confirmed_priorities: ['PRI_GARDE'], confirmed_preferences: ['PRE_GARDE'],
      delegated_decisions: ['DEL_GARDE'], external_facts_to_research: ['EXT_GARDE'],
      assumptions_allowed: ['ASS_GARDE'], remaining_unknowns: ['UNK_GARDE'],
      ...(overrides.candidate || {})
    },
    issues: overrides.issues || [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'RAISON_GARDE'
  };
}

const baseFor = (state) => mapOprieToCanonicalContract(turn(state), { request_id: 'req-garde', original_request: ORIGINAL });
const provider = (etat, route) => ({ source: 'none', decision: { etat_demande: etat, route, confiance: 'haute', raison_interne: 'test', question: null } });
const coherent = (state) => state === 'operational_request_ready' ? provider('exploitable', 'rapide') : provider('clarification_necessaire', null);

/* ==========================================================================
 * MATRICE DES QUATRE ÉTATS
 * ======================================================================= */

test('T-CANON02-CORR-01 READY → exploitable, route autorisée', () => {
  const base = baseFor('operational_request_ready');
  assert.equal(CANONICAL_READINESS_MATRIX.operational_request_ready.state, 'exploitable');
  assert.equal(CANONICAL_READINESS_MATRIX.operational_request_ready.route_allowed, true);

  for (const route of ['rapide', 'architecte']) {
    const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', route) });
    assert.equal(envelope.state.executability.state, 'exploitable');
    assert.equal(envelope.routing.route, route);
  }
});

for (const [id, state] of [['02', 'clarification_required'], ['03', 'confirmation_required'], ['04', 'blocked']]) {
  test(`T-CANON02-CORR-${id} ${state} → non exploitable, route null`, () => {
    const base = baseFor(state);
    assert.equal(CANONICAL_READINESS_MATRIX[state].state, 'clarification_necessaire');
    assert.equal(CANONICAL_READINESS_MATRIX[state].route_allowed, false);

    const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: coherent(state) });
    assert.notEqual(envelope.state.executability.state, 'exploitable');
    assert.equal(envelope.routing.route, null);
  });
}

test('T-CANON02-CORR-01b la matrice couvre exactement les quatre états OPRIE', () => {
  assert.deepEqual(Object.keys(CANONICAL_READINESS_MATRIX).sort(), [...OPRIE_STATES].sort());
  const executables = Object.entries(CANONICAL_READINESS_MATRIX).filter(([, r]) => r.state === 'exploitable');
  assert.deepEqual(executables.map(([k]) => k), ['operational_request_ready'],
    'un seul état est exploitable');
});

/* ==========================================================================
 * IMPOSSIBILITÉ DE PROMOUVOIR
 * ======================================================================= */

test('T-CANON02-CORR-05 base non prête + décision « ready » → fail closed', () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    const base = baseFor(state);
    assert.throws(
      () => buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'architecte') }),
      /Garde readiness/,
      `${state} : une décision « exploitable » doit être refusée`
    );
  }
});

test('T-CANON02-CORR-06 base non prête + route active → fail closed', () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    for (const route of ['rapide', 'architecte']) {
      assert.throws(
        () => buildExecutionEnvelope({ canonical_base: baseFor(state), provider_result: provider('clarification_necessaire', route) }),
        /interdit toute route active/,
        `${state} + route ${route}`
      );
    }
  }
});

test('T-CANON02-CORR-06b base non prête SANS décision : le repli ne promeut plus', () => {
  /* fallbackDecision() promeut en `exploitable` + route `rapide`. Il doit être
     structurellement hors d'atteinte quand une base canonique est présente. */
  for (const state of ['clarification_required', 'confirmation_required', 'blocked']) {
    const envelope = buildExecutionEnvelope({ canonical_base: baseFor(state) });
    assert.notEqual(envelope.state.executability.state, 'exploitable', `${state} : aucun repli promotionnel`);
    assert.equal(envelope.routing.route, null);
  }
});

test('T-CANON02-CORR-07 valeurs legacy « exploitable » ne promeuvent pas', () => {
  const base = baseFor('blocked');
  assert.throws(
    () => buildExecutionEnvelope({
      canonical_base: base,
      provider_result: provider('exploitable', 'rapide'),
      executability: { critical_missing: [] },
      intent: { objective: 'LEGACY_READY' }
    }),
    /Garde readiness/
  );
});

test('T-CANON02-CORR-08 base prête + legacy « bloqué » → aucune démotion silencieuse', () => {
  const base = baseFor('operational_request_ready');
  /* Le choix est FAIL CLOSED, symétrique de la promotion : une contradiction
     d'appelant n'est jamais arbitrée en silence, dans aucun sens. */
  assert.throws(
    () => buildExecutionEnvelope({ canonical_base: base, provider_result: provider('clarification_necessaire', null) }),
    /la base impose exploitable/
  );
});

test('T-CANON02-CORR-08b une base exploitable sans route est refusée, jamais devinée', () => {
  assert.throws(
    () => buildExecutionEnvelope({ canonical_base: baseFor('operational_request_ready'), provider_result: provider('exploitable', null) }),
    /exige une route fournie par la couche de routage/
  );
});

/* ==========================================================================
 * MATRICE SYSTÉMATIQUE — 4 ÉTATS × 3 DÉCISIONS × 3 ROUTES
 * ======================================================================= */

test('T-CANON02-CORR-MATRIX aucune combinaison ne produit de promotion illégitime', () => {
  const decisionStates = [null, 'exploitable', 'clarification_necessaire'];
  const routes = [null, 'rapide', 'architecte'];
  let combinations = 0;
  let promotions = 0;

  for (const oprieState of OPRIE_STATES) {
    const base = baseFor(oprieState);
    const expected = CANONICAL_READINESS_MATRIX[oprieState];

    for (const etat of decisionStates) {
      for (const route of routes) {
        combinations += 1;
        const providerResult = etat === null ? undefined : provider(etat, route);
        let envelope = null;
        try {
          envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: providerResult });
        } catch {
          continue; // fail closed : acceptable
        }
        /* Si l'enveloppe est produite, elle DOIT refléter la base. */
        assert.equal(envelope.state.executability.state, expected.state,
          `${oprieState} / decision=${etat} / route=${route} : état non conforme`);
        if (!expected.route_allowed) {
          assert.equal(envelope.routing.route, null, `${oprieState} : route active interdite`);
        }
        if (envelope.state.executability.state === 'exploitable' && oprieState !== 'operational_request_ready') {
          promotions += 1;
        }
      }
    }
  }

  assert.equal(combinations, 36, '4 états × 3 décisions × 3 routes');
  assert.equal(promotions, 0, 'CANONICAL_READINESS_PROMOTION_POSSIBLE = NO');
});

/* ==========================================================================
 * IMMUTABILITÉ
 * ======================================================================= */

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('T-CANON02-CORR-09 la base est immuable avant/après construction', () => {
  const base = deepFreeze(baseFor('operational_request_ready'));
  const before = JSON.stringify(base);

  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'architecte') });

  assert.equal(JSON.stringify(base), before, 'la base d’origine est inchangée');
  assert.equal(JSON.stringify(envelope.canonical_base), before, 'la base attachée est un clone fidèle');
  assert.notEqual(envelope.canonical_base, base, 'clone, pas référence : aucune mutation ultérieure possible');
});

test('T-CANON02-CORR-10 le routing ne modifie pas la base', () => {
  const base = baseFor('operational_request_ready');
  const before = JSON.stringify(base);

  const rapide = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });
  const architecte = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'architecte') });

  assert.equal(JSON.stringify(base), before);
  assert.equal(JSON.stringify(rapide.canonical_base), JSON.stringify(architecte.canonical_base));
  assert.notEqual(rapide.routing.route, architecte.routing.route);
});

test('T-CANON02-CORR-11 la normalisation de décision ne modifie pas la base', () => {
  const base = baseFor('operational_request_ready');
  const before = JSON.stringify(base);

  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });

  assert.equal(JSON.stringify(base), before);
  assert.equal(envelope.canonical_base.executability.oprie_state, 'operational_request_ready');
  /* Le bloc decision appartient à l'enveloppe, jamais à la base. */
  assert.equal('decision' in envelope.canonical_base, false);
  assert.ok(envelope.contract.decision, 'la décision vit dans le contrat aval');
});

/* ==========================================================================
 * SOURCE UNIQUE ET ABSENCE DE SECONDE DÉRIVATION
 * ======================================================================= */

test('T-CANON02-CORR-12 ACTIVE_READINESS_SOURCE_COUNT = 1 avec une base canonique', () => {
  assert.equal(activeReadinessSourceCount(baseFor('operational_request_ready')), 1);
  assert.equal(activeReadinessSourceCount(baseFor('blocked')), 1);
  assert.equal(activeReadinessSourceCount(null), 0, 'sans base, la garde ne s’applique pas');
  assert.equal(activeReadinessSourceCount({}), 0);
});

test('T-CANON02-CORR-12b READINESS_AUTHORITY_COUNT_WITH_CANONICAL_BASE = 1 — garde durable', () => {
  const adapters = fs.readFileSync(path.join(root, 'core/adn/engine-adapters.js'), 'utf8');
  const builder = adapters.slice(adapters.indexOf('export function buildExecutionEnvelope'), adapters.indexOf('function baseProjection'));

  /* Une seule expression décide de l'état quand la base existe. */
  const guardCalls = (builder.match(/assertCanonicalReadinessInvariant\(/g) || []).length;
  assert.equal(guardCalls, 1, 'une seule invocation de la garde');
  assert.match(builder, /attachedBase !== null\s*\?\s*assertCanonicalReadinessInvariant/,
    'le repli legacy est mutuellement exclusif de la garde');
  /* fallbackDecision reste accessible, mais seulement hors chemin canonique. */
  assert.match(builder, /:\s*\(provider\.available \? provider\.decision : fallbackDecision\(provider_result\)\)/);
});

test('T-CANON02-CORR-13 un signal sémantique ne peut pas changer la readiness', () => {
  const base = baseFor('blocked');
  assert.ok(base.semantic_lock_signals.signals.length > 0, 'des signaux existent sur cette base');

  const envelope = buildExecutionEnvelope({ canonical_base: base });
  assert.notEqual(envelope.state.executability.state, 'exploitable');

  /* Injecter des signaux legacy supplémentaires ne change rien. */
  const withSignals = buildExecutionEnvelope({
    canonical_base: base,
    semantic_lock_signals: [{ id: 'scope', needed: true, reason: 'signal injecté', priority: 'mandatory', source: 'user' }]
  });
  assert.notEqual(withSignals.state.executability.state, 'exploitable');
  assert.equal(withSignals.routing.route, null);
});

test('T-CANON02-CORR-14 un verrou sélectionné ne peut pas changer la readiness', () => {
  const base = baseFor('confirmation_required');
  const envelope = buildExecutionEnvelope({ canonical_base: base });

  assert.ok(envelope.locks.decisions.length === 13, 'l’ADN a bien décidé pour les treize verrous');
  assert.notEqual(envelope.state.executability.state, 'exploitable');
  assert.equal(envelope.canonical_base.executability.oprie_state, 'confirmation_required');
  assert.deepEqual(envelope.canonical_base.selected_locks.locks, []);
});

test('T-CANON02-CORR-15 aucune contamination sémantique legacy', () => {
  const base = baseFor('operational_request_ready');
  const envelope = buildExecutionEnvelope({
    canonical_base: base,
    provider_result: provider('exploitable', 'rapide'),
    request: 'REQ_LEGACY',
    intent: { objective: 'OBJ_LEGACY', deliverable: 'LIV_LEGACY', explicit_constraints: ['CON_LEGACY'] },
    evidence: { user_facts: [{ text: 'FAIT_LEGACY' }] },
    executability: { critical_missing: ['CRIT_LEGACY'] },
    assumptions: ['ASS_LEGACY'],
    obligations: [{ text: 'OBL_LEGACY' }],
    output: { format: 'FMT_LEGACY' },
    checks: [{ id: 'CHK_LEGACY', type: 'manual', target: 'x', rule: 'y', blocking: false }]
  });
  assert.equal(JSON.stringify(envelope).includes('_LEGACY'), false, 'LEGACY_SEMANTIC_CONTAMINATION_COUNT = 0');
});

/* ==========================================================================
 * INTÉGRITÉ DE LA BASE ATTACHÉE
 * ======================================================================= */

test('T-CANON02-CORR-16 les faits externes restent entiers dans la base', () => {
  const base = baseFor('operational_request_ready');
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });

  assert.deepEqual(envelope.canonical_base.evidence.external_facts.map((f) => f.description), ['EXT_GARDE']);
  assert.equal(envelope.canonical_base.evidence.external_facts[0].status, 'to_research');
});

test('T-CANON02-CORR-17 la provenance reste intégralement disponible dans la base', () => {
  const base = baseFor('operational_request_ready');
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });
  const attached = envelope.canonical_base;

  for (const collection of ['secondary_objectives', 'explicit_constraints', 'priorities', 'preferences', 'delegated_decisions']) {
    for (const item of attached.intent[collection]) assert.equal(item.source, 'oprie', collection);
  }
  for (const item of attached.assumptions.allowed) assert.equal(item.source, 'oprie');
  for (const item of attached.executability.remaining_unknowns) assert.equal(item.source, 'oprie');
});

test('T-CANON02-CORR-18 env.contract peut être plus pauvre ; canonical_base ne l’est jamais', () => {
  const base = baseFor('operational_request_ready');
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });

  /* ENV_CONTRACT_MAY_BE_LOSSY : la provenance est aplatie côté contrat. */
  const contractConstraints = envelope.contract.intent.explicit_constraints;
  assert.ok(contractConstraints.every((c) => typeof c === 'string'), 'le contrat aplatit en chaînes');

  /* CANONICAL_BASE_MUST_NOT_BE_LOSSY : la base garde la structure tracée. */
  assert.ok(envelope.canonical_base.intent.explicit_constraints.every((c) => typeof c === 'object' && c.source === 'oprie'));

  const verdict = validateCanonicalEnvelopeConvergence(base, envelope);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
  assert.equal(verdict.semantic_loss_count, 0, 'CANONICAL_BASE_SEMANTIC_LOSS_COUNT = 0');
});

test('T-CANON02-CORR-19 déterminisme : même base + mêmes entrées aval → même enveloppe', () => {
  const base = baseFor('operational_request_ready');
  const a = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'architecte') });
  const b = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'architecte') });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('T-CANON02-CORR-20 combinaison de readiness malformée → fail closed', () => {
  const base = baseFor('operational_request_ready');

  const corrupted = JSON.parse(JSON.stringify(base));
  corrupted.executability.state = 'clarification_necessaire'; // incohérent avec ready
  assert.throws(() => buildExecutionEnvelope({ canonical_base: corrupted, provider_result: provider('exploitable', 'rapide') }),
    /impose executability\.state=exploitable/);

  const unevaluated = JSON.parse(JSON.stringify(base));
  unevaluated.executability.evaluated = false;
  assert.throws(() => buildExecutionEnvelope({ canonical_base: unevaluated, provider_result: provider('exploitable', 'rapide') }),
    /base non évaluée/);

  const unknown = JSON.parse(JSON.stringify(base));
  unknown.executability.oprie_state = 'etat_inconnu';
  assert.throws(() => buildExecutionEnvelope({ canonical_base: unknown, provider_result: provider('exploitable', 'rapide') }),
    /Canonical Base Contract requis|état OPRIE invalide/);
});

/* ==========================================================================
 * VALIDATEUR DE CONVERGENCE — CONTRÔLES DE READINESS
 * ======================================================================= */

test('T-CANON02-CORR-CONV le validateur détecte promotion, démotion et mutation', () => {
  const base = baseFor('operational_request_ready');
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: provider('exploitable', 'rapide') });

  const cases = [
    ['promotion', (b, e) => { e.state.executability.state = 'exploitable'; e.canonical_base.executability.oprie_state = 'blocked'; e.canonical_base.executability.state = 'clarification_necessaire'; }, /Readiness promue|oprie_state altéré/],
    ['démotion', (b, e) => { e.state.executability.state = 'clarification_necessaire'; }, /démotée silencieusement/],
    ['route illégitime', (b, e) => { e.canonical_base.executability.oprie_state = 'blocked'; e.canonical_base.executability.state = 'clarification_necessaire'; e.routing.route = 'rapide'; }, /oprie_state altéré|Route active/],
    ['mutation de la base', (b, e) => { e.canonical_base.intent.objective = 'MUTÉ'; }, /diverge de la base|intent\.objective/]
  ];

  for (const [label, mutate, pattern] of cases) {
    const copy = JSON.parse(JSON.stringify(envelope));
    mutate(base, copy);
    const verdict = validateCanonicalEnvelopeConvergence(base, copy);
    assert.equal(verdict.ok, false, `${label} doit être refusé`);
    assert.ok(verdict.problems.some((p) => pattern.test(p)), `${label} : ${JSON.stringify(verdict.problems)}`);
  }
});

/* ==========================================================================
 * CHAÎNE DE BUILD ET RUNTIME NAVIGATEUR
 * ======================================================================= */

test('T-CANON02-CORR-BUILD la garde est présente dans toute la chaîne', () => {
  const sources = {
    'core/adn/oprie-canonical-mapping.js': /export function assertCanonicalReadinessInvariant/,
    'core/adn/engine-adapters.js': /assertCanonicalReadinessInvariant\(attachedBase, provider_result\)/,
    'core/adn/browser-runtime.generated.js': /function assertCanonicalReadinessInvariant/,
    'atelier-prompts-v11.5-lot10g-decision-provider.html': /function assertCanonicalReadinessInvariant/
  };
  for (const [file, pattern] of Object.entries(sources)) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(content, pattern, `${file} : la garde doit être présente`);
  }
});

test('T-CANON02-CORR-BUILD-b le build échoue en code non nul si une insertion obligatoire manque', () => {
  const tool = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
  assert.match(tool, /process\.exit\(1\)/, 'le build doit pouvoir s’interrompre');
  assert.match(tool, /export déclaré mais introuvable/, 'contrôle des exports sur la SOURCE du module');
  assert.match(tool, /dépendance \$\{dep\} non injectée/, 'contrôle des dépendances injectées');
  assert.match(tool, /emittedSegments/, 'le contrôle de dépendance porte sur le segment du module');
});

test('T-CANON02-CORR-RUNTIME la garde protège aussi le runtime navigateur généré', () => {
  const bundle = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(bundle, context);
  const runtime = context.window.__ATELIER_ADN_RUNTIME__;

  assert.equal(typeof runtime.assertCanonicalReadinessInvariant, 'function');
  assert.equal(typeof runtime.activeReadinessSourceCount, 'function');

  /* Promotion impossible, y compris dans le navigateur. */
  const blocked = runtime.mapOprieToCanonicalContract(turn('blocked'), { request_id: 'r', original_request: ORIGINAL });
  assert.throws(
    () => runtime.buildExecutionEnvelope({ canonical_base: blocked, provider_result: provider('exploitable', 'rapide') }),
    /Garde readiness/
  );
  const safe = runtime.buildExecutionEnvelope({ canonical_base: blocked });
  assert.notEqual(safe.state.executability.state, 'exploitable');
  assert.equal(safe.routing.route, null);

  const ready = runtime.mapOprieToCanonicalContract(turn('operational_request_ready'), { request_id: 'r', original_request: ORIGINAL });
  const envelope = runtime.buildExecutionEnvelope({ canonical_base: ready, provider_result: provider('exploitable', 'architecte') });
  assert.equal(envelope.state.executability.state, 'exploitable');
  assert.equal(runtime.activeReadinessSourceCount(ready), 1);
});

test('T-CANON02-CORR-FRONTEND le helper frontend reste cohérent avec la garde centrale', () => {
  const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
  /* ADN-RAPIDE-FEED-00 : la dérivation est devenue UNIQUE et partagée par
     Architecte et Rapide — la tranche auditée commence donc à cette dérivation. */
  const helper = html.slice(html.indexOf('function adnCanonicalProviderResult('), html.indexOf('function adnManualEnvelope('));

  assert.match(helper, /canonicalBase\.executability\.state==='exploitable'/, 'l’état est LU dans la base');
  assert.match(helper, /route:executable\?route:null/, 'aucune route sur une base non exploitable');
  assert.equal(/etat_demande:'exploitable'/.test(helper), false, 'aucune promotion figée');
  assert.match(helper, /function adnCanonicalEnvelope\(/, 'l’enveloppe canonique consomme cette dérivation');
  /* ADN-RAPIDE-01 : deux points de reprise de l'état existent désormais — la
     dérivation partagée Architecte/Rapide de la couche ADN, et celle du moteur
     Rapide canonique. Les DEUX lisent `executability.state`, aucune ne décide. */
  const derivations = html.match(/etat_demande:executable\?'exploitable'/g) || [];
  assert.equal(derivations.length, 2, 'deux reprises d’état, aucune décision locale');
  for (const bloc of [helper, html.slice(html.indexOf('function rapideProjectionCanonique('), html.indexOf('function rapideAppliquerCanoniqueAuContexte('))]) {
    assert.match(bloc, /executability(?:&&[\w.]+)?\.state==='exploitable'/, 'l’état est LU, jamais affirmé');
  }
});
