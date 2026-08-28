import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExecutionEnvelope,
  projectToRapide,
  projectToArchitecte,
  projectToAtelier,
  validateLegacyLockMapping,
  createAdapterAuditView
} from '../core/adn/index.js';

function provider(route='rapide') {
  return {
    source: 'groq',
    decision: {
      etat_demande: 'exploitable',
      route,
      confiance: 'haute',
      raison_interne: route === 'rapide' ? 'direct' : 'prepare',
      question: null
    }
  };
}

test('buildExecutionEnvelope construit état, verrous, routage et contrat', () => {
  const env = buildExecutionEnvelope({
    request: 'Produire exactement 3 éléments en JSON.',
    provider_result: provider('rapide'),
    intent: { deliverable: 'liste JSON', explicit_constraints: ['exactement 3 éléments'] },
    quantities: [{ target: 'éléments', unit: 'éléments', exact: 3 }],
    output: { format: 'json' },
    checks: [{ type: 'deterministic', rule: 'JSON valide.' }]
  });
  assert.equal(env.routing.route, 'rapide');
  assert.equal(env.contract.execution_policy.execute_now, true);
  assert.ok(env.contract.locks.some((x) => x.id === 'format'));
  assert.ok(env.contract.locks.some((x) => x.id === 'volume'));
  assert.equal(env.contract.adn_summary.techniques.final_injunction, true);
});

test('fallback provider sans preuve de préparation route Rapide', () => {
  const env = buildExecutionEnvelope({
    request: 'Rédiger une réponse utilisable.',
    provider_result: { source: 'local-prudent', decision: { etat_demande:'exploitable', route:'architecte', confiance:'moyenne', raison_interne:'fallback', question:null } }
  });
  assert.equal(env.routing.route, 'rapide');
  assert.equal(env.routing.mode, 'structural-fallback');
});

test('fallback provider avec préparation prouvée route Architecte', () => {
  const env = buildExecutionEnvelope({
    request: 'Construire une décision multi-critères.',
    provider_result: { source: 'local-prudent', decision: { etat_demande:'exploitable', route:'architecte', confiance:'moyenne', raison_interne:'fallback', question:null } },
    preparation_signals: [{ id:'constraint_arbitration', reason:'Contraintes en tension.' }]
  });
  assert.equal(env.routing.route, 'architecte');
});

test('projection Rapide conserve contrat et mapping legacy', () => {
  const env = buildExecutionEnvelope({
    request: 'Produire 2 items.',
    provider_result: provider('rapide'),
    intent: { deliverable:'liste' },
    quantities: [{ target:'items', unit:'items', exact:2 }]
  });
  const p = projectToRapide(env, { material:'abc' });
  assert.equal(p.engine, 'rapide');
  assert.ok(p.legacy_lock_ids.includes('volume'));
  assert.equal(p.material, 'abc');
});

test('projection Architecte transporte le contexte contractuel sans réécrire le moteur', () => {
  const env = buildExecutionEnvelope({
    request: 'Établir une stratégie avec arbitrages.',
    provider_result: provider('architecte'),
    obligations: [{ text:'Comparer les options', source:'user' }],
    preparation_signals: [{ id:'strategy_design', reason:'Stratégie à concevoir.' }]
  });
  const p = projectToArchitecte(env, { preferences:'Concis' });
  assert.equal(p.engine, 'architecte');
  assert.equal(p.contract_context.obligations.length, 1);
  assert.equal(p.preferences, 'Concis');
});

test('projection Atelier reste volontaire', () => {
  const env = buildExecutionEnvelope({ request:'Créer un contenu.', provider_result:provider('rapide') });
  const p = projectToAtelier(env);
  assert.equal(p.engine, 'atelier');
  assert.equal(p.user_controlled, true);
});

test('mapping des 13 verrous historiques est complet', () => {
  const map = validateLegacyLockMapping();
  assert.equal(Object.keys(map).length, 13);
  assert.equal(map.final_check, 'controle');
  assert.equal(map.scope, 'perimetre');
});

test('vue audit expurgée ne contient pas la demande brute', () => {
  const env = buildExecutionEnvelope({ request:'Secret utilisateur', provider_result:provider('rapide') });
  const audit = createAdapterAuditView(env);
  assert.equal('request' in audit, false);
  assert.equal(audit.route, 'rapide');
});

test('aucun champ métier dans une enveloppe générique', () => {
  const env = buildExecutionEnvelope({ request:'Produire un résultat.', provider_result:provider('rapide') });
  const serialized = JSON.stringify(env);
  for (const forbidden of ['travel_budget','cv_job','medical_context','computer_type']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
