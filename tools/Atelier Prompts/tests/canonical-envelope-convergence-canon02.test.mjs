/* ADN-CANON-02 — MIGRATION DES CONSOMMATEURS VERS LE CANONICAL BASE CONTRACT
 * ============================================================================
 *
 * Exigences produit. Architecture officielle CDC v1.7 :
 *
 *   OPRIE → Canonical Base Contract → Execution Envelope
 *
 * La base est l'unique source sémantique pré-routing. L'enveloppe la CONSOMME
 * et y ajoute decision, routing, locks, execution_policy, ethics et adn_summary.
 * Aucun argument legacy ne peut écraser la base quand elle est présente.
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
  CANONICAL_SEMANTIC_FIELDS,
  ACCEPTED_PRESENTATION_LOSSES,
  OPRIE_TRANSIENT_FIELDS
} from '../core/adn/oprie-canonical-mapping.js';
import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const ORIGINAL = 'DEMANDE_BRUTE_ORIGINALE';

/* La décision de routage REFLÈTE l'exploitabilité de la base : une base non
   exploitable n'obtient pas de route, exactement comme le fait le frontend. */
const decisionFor = (base, route) => {
  const executable = base?.executability?.state === 'exploitable';
  return { source: 'none', decision: { etat_demande: executable ? 'exploitable' : 'clarification_necessaire', route: executable ? route : null, confiance: 'haute', raison_interne: 'test', question: null } };
};
const decision = (route) => ({ source: 'none', decision: { etat_demande: 'exploitable', route, confiance: 'haute', raison_interne: 'test', question: null } });

/** Tour OPRIE dont chaque champ porte une valeur UNIQUE et traçable. */
function richTurn(overrides = {}) {
  return {
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'OBJECTIF_UNIQUE',
      expected_deliverable: 'LIVRABLE_UNIQUE',
      secondary_objectives: ['SECONDAIRE_1', 'SECONDAIRE_2'],
      confirmed_constraints: ['CONTRAINTE_1', 'CONTRAINTE_2'],
      confirmed_priorities: ['PRIORITE_1'],
      confirmed_preferences: ['PREFERENCE_1'],
      delegated_decisions: ['DELEGATION_1'],
      external_facts_to_research: ['FAIT_EXTERNE_1', 'FAIT_EXTERNE_2'],
      assumptions_allowed: ['HYPOTHESE_1'],
      remaining_unknowns: ['INCONNUE_1', 'INCONNUE_2'],
      ...(overrides.operational_request_candidate || {})
    },
    issues: [
      { id: 'ISSUE_A', type: 'missing_information', kind: null, description: 'CRITIQUE_1', impact: 'material', substitutable: false, recommended_treatment: 'research' },
      { id: 'ISSUE_B', type: 'ambiguity', kind: null, description: 'SUBSTITUABLE_1', impact: 'material', substitutable: true, recommended_treatment: 'estimate' }
    ],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'RAISON_ARBITRAGE',
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'operational_request_candidate'))
  };
}

const baseFrom = (turn = richTurn()) => mapOprieToCanonicalContract(turn, { request_id: 'req-canon02', original_request: ORIGINAL });
const envelopeFrom = (base, route = 'architecte', extra = {}) => buildExecutionEnvelope({ canonical_base: base, provider_result: decisionFor(base, route), ...extra });

/* ==========================================================================
 * CONSOMMATION ET PRIORITÉ ATOMIQUE
 * ======================================================================= */

test('T-CANON02-01 l’enveloppe consomme la base et la porte intacte', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);

  assert.ok(envelope.canonical_base, 'la base est attachée à l’enveloppe');
  assert.equal(JSON.stringify(envelope.canonical_base), JSON.stringify(base), 'intacte, champ pour champ');
  assert.equal(envelope.contract.intent.objective, 'OBJECTIF_UNIQUE', 'la sémantique traverse jusqu’au contrat');
});

for (const [id, field, legacy, read] of [
  ['02', 'objective', { intent: { objective: 'OBJECTIF_LEGACY' } }, (e) => e.contract.intent.objective],
  ['03', 'deliverable', { intent: { deliverable: 'LIVRABLE_LEGACY' } }, (e) => e.contract.intent.deliverable],
  ['04', 'constraints', { intent: { explicit_constraints: ['CONTRAINTE_LEGACY'] } }, (e) => e.contract.intent.explicit_constraints]
]) {
  test(`T-CANON02-${id} contradiction legacy sur ${field} → la base l’emporte`, () => {
    const base = baseFrom();
    const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: decision('rapide'), ...legacy });

    const serialized = JSON.stringify(envelope);
    assert.equal(serialized.includes('_LEGACY'), false, 'aucune valeur legacy ne pénètre l’enveloppe');
    const value = JSON.stringify(read(envelope));
    assert.equal(value.includes('_LEGACY'), false);
    assert.ok(value.includes('_UNIQUE') || value.includes('CONTRAINTE_1'), 'la valeur canonique est retenue');
  });
}

test('T-CANON02-29 la base gagne ATOMIQUEMENT : aucun champ legacy ne subsiste, quel qu’il soit', () => {
  const base = baseFrom();
  const envelope = buildExecutionEnvelope({
    canonical_base: base,
    provider_result: decision('architecte'),
    request: 'REQUETE_LEGACY',
    intent: { objective: 'OBJ_LEGACY', deliverable: 'LIV_LEGACY', recipient: 'DEST_LEGACY', explicit_constraints: ['CON_LEGACY'] },
    evidence: { user_facts: [{ text: 'FAIT_LEGACY' }] },
    executability: { critical_missing: ['CRIT_LEGACY'], substitutable_missing: ['SUB_LEGACY'] },
    assumptions: ['ASS_LEGACY'],
    obligations: [{ text: 'OBL_LEGACY' }],
    quantities: [{ target: 'QTE_LEGACY', unit: 'x', min: 1, max: 2 }],
    output: { format: 'FORMAT_LEGACY' },
    checks: [{ id: 'CHK_LEGACY', type: 'manual', target: 'x', rule: 'y', blocking: false }],
    semantic_lock_signals: [{ id: 'scope', needed: true, reason: 'SIGNAL_LEGACY', priority: 'mandatory', source: 'user' }]
  });

  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes('_LEGACY'), false,
    'aucune donnée sémantique legacy ne survit quand la base est présente : arbitrage atomique, jamais champ par champ');
});

test('T-CANON02-28 sans base, la signature legacy reste opérante', () => {
  const envelope = buildExecutionEnvelope({ request: 'Demande directe.', provider_result: decision('rapide'), intent: { objective: 'Objectif direct.' } });
  assert.equal(envelope.canonical_base, null, 'aucune base attachée : le chemin transitoire est explicite');
  assert.equal(envelope.contract.original_request, 'Demande directe.');
  assert.equal(envelope.contract.intent.objective, 'Objectif direct.');
});

/* ==========================================================================
 * PRÉSERVATION SÉMANTIQUE — AUCUNE PERTE
 * ======================================================================= */

test('T-CANON02-05 original_request est strictement préservée', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);
  assert.equal(envelope.canonical_base.original_request, ORIGINAL);
  assert.equal(envelope.contract.original_request, ORIGINAL);
  assert.notEqual(envelope.contract.original_request, envelope.contract.intent.objective);
});

test('T-CANON02-05b adversarial : aucun consommateur ne remplace original_request', () => {
  const base = baseFrom();
  const envelope = buildExecutionEnvelope({
    canonical_base: base,
    provider_result: decision('architecte'),
    request: 'REFORMULATION_INTERDITE'
  });
  assert.equal(envelope.contract.original_request, ORIGINAL);
  assert.equal(envelope.canonical_base.original_request, ORIGINAL);
  assert.equal(JSON.stringify(envelope).includes('REFORMULATION_INTERDITE'), false);
});

test('T-CANON02-06 / T-CANON02-19 executability est préservée et jamais recalculée', () => {
  for (const state of ['operational_request_ready', 'confirmation_required', 'clarification_required', 'blocked']) {
    const base = baseFrom(richTurn({ state }));
    const envelope = envelopeFrom(base, 'rapide');

    assert.equal(envelope.canonical_base.executability.oprie_state, state);
    assert.equal(envelope.canonical_base.executability.evaluated, true);
    const executable = state === 'operational_request_ready';
    assert.equal(envelope.canonical_base.executability.state === 'exploitable', executable,
      `${state} : seul operational_request_ready est exploitable`);
  }
});

test('T-CANON02-07 aucun consommateur ne recalcule la readiness', () => {
  const base = baseFrom(richTurn({ state: 'blocked' }));
  const envelope = envelopeFrom(base, 'rapide');
  const verdict = validateCanonicalEnvelopeConvergence(base, envelope);

  assert.equal(envelope.canonical_base.executability.oprie_state, 'blocked');
  assert.equal(verdict.ok, true, 'aucune promotion de readiness détectée');
});

for (const [id, label, pathInBase, expected] of [
  ['08', 'assumptions.allowed', 'assumptions.allowed', ['HYPOTHESE_1']],
  ['09', 'remaining_unknowns', 'executability.remaining_unknowns', ['INCONNUE_1', 'INCONNUE_2']],
  ['10', 'priorities', 'intent.priorities', ['PRIORITE_1']],
  ['11', 'preferences', 'intent.preferences', ['PREFERENCE_1']],
  ['12', 'delegated_decisions', 'intent.delegated_decisions', ['DELEGATION_1']],
  ['13', 'secondary_objectives', 'intent.secondary_objectives', ['SECONDAIRE_1', 'SECONDAIRE_2']]
]) {
  test(`T-CANON02-${id} ${label} traverse sans perte`, () => {
    const base = baseFrom();
    const envelope = envelopeFrom(base);
    const items = pathInBase.split('.').reduce((acc, key) => acc[key], envelope.canonical_base);
    assert.deepEqual(items.map((item) => item.text), expected);
    for (const item of items) assert.equal(item.source, 'oprie');
  });
}

test('T-CANON02-14 intent.preservation traverse sans altération', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);
  assert.deepEqual(envelope.canonical_base.intent.preservation, {
    objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [], source: 'oprie'
  });
});

test('T-CANON02-25 la liste external_facts n’est jamais détruite', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);

  assert.equal(envelope.canonical_base.evidence.external_facts.length, 2);
  assert.deepEqual(envelope.canonical_base.evidence.external_facts.map((f) => f.description), ['FAIT_EXTERNE_1', 'FAIT_EXTERNE_2']);
  assert.equal(envelope.canonical_base.evidence.external_knowledge_needed, true);
  /* contract.evidence n'expose que le booléen : perte de PRÉSENTATION documentée,
     la liste reste entière dans la base attachée. */
  assert.equal(envelope.contract.evidence.external_knowledge_needed, true);
});

test('T-CANON02-26 recipient reste null : aucune heuristique en aval', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);
  assert.equal(envelope.canonical_base.intent.recipient, null);
  assert.equal(envelope.contract.intent.recipient, null);
});

/* ==========================================================================
 * CHAMPS TRANSITOIRES, ROUTING, VERROUS
 * ======================================================================= */

test('T-CANON02-15 aucun champ transitoire de dialogue ne réapparaît en aval', () => {
  const turn = richTurn({ state: 'blocked', blocked_reason: 'MOTIF_BLOCAGE', next_question: { text: 'QUESTION_INTERDITE', targets_issue_id: null, expected_progress: null } });
  const base = baseFrom(turn);
  const envelope = envelopeFrom(base, 'rapide');

  const serialized = JSON.stringify(envelope);
  for (const field of OPRIE_TRANSIENT_FIELDS) {
    assert.equal(serialized.includes(`"${field}"`), false, `${field} ne doit pas figurer dans l’enveloppe`);
  }
  assert.equal(serialized.includes('QUESTION_INTERDITE'), false);
  assert.equal(serialized.includes('MOTIF_BLOCAGE'), false);
});

test('T-CANON02-16 la base est route-free', () => {
  const base = baseFrom();
  assert.equal(JSON.stringify(base).includes('rapide'), false);
  assert.equal(JSON.stringify(base).includes('architecte'), false);
  assert.equal('routing' in base, false);
  assert.equal('decision' in base, false);
});

test('T-CANON02-17 le routing n’altère pas la base', () => {
  const base = baseFrom();
  const snapshot = JSON.stringify(base);

  const rapide = envelopeFrom(base, 'rapide');
  const architecte = envelopeFrom(base, 'architecte');

  assert.equal(JSON.stringify(base), snapshot, 'la base d’origine est inchangée');
  assert.equal(rapide.routing.route, 'rapide');
  assert.equal(architecte.routing.route, 'architecte');
  assert.equal(JSON.stringify(rapide.canonical_base), JSON.stringify(architecte.canonical_base),
    'la base attachée est identique quel que soit le routage');
});

test('T-CANON02-18 la sélection des verrous reste à l’ADN', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);

  assert.deepEqual(envelope.canonical_base.selected_locks.locks, [], 'la base ne sélectionne rien');
  assert.ok(envelope.locks.decisions.length === 13, 'l’ADN décide pour les treize verrous');
  assert.ok(Array.isArray(envelope.locks.locks));
});

test('T-CANON02-19b un signal n’est pas un verrou sélectionné par identité', () => {
  const base = baseFrom();
  const signalIds = base.semantic_lock_signals.signals.map((s) => s.id);
  assert.ok(signalIds.length > 0, 'des signaux existent');

  const envelope = envelopeFrom(base);
  const selected = envelope.locks.locks.map((l) => l.id);

  /* Les signaux sont une ENTRÉE du sélecteur, pas sa sortie : la sélection finale
     résulte des règles ADN, pas d'une copie des identifiants de signaux. */
  const decisions = new Map(envelope.locks.decisions.map((d) => [d.id, d]));
  for (const id of signalIds) {
    assert.ok(decisions.has(id), `le verrou ${id} a bien une décision ADN motivée`);
    assert.ok(decisions.get(id).reason.length > 0);
  }
  assert.notDeepEqual(selected, signalIds, 'la sélection n’est pas la liste des signaux');
});

/* ==========================================================================
 * MÊME BASE POUR LES DEUX MODES
 * ======================================================================= */

test('T-CANON02-20 même entrée OPRIE → même base, et même base dans les deux enveloppes', () => {
  const turn = richTurn();
  const pourRapide = mapOprieToCanonicalContract(turn, { request_id: 'r', original_request: ORIGINAL });
  const pourArchitecte = mapOprieToCanonicalContract(turn, { request_id: 'r', original_request: ORIGINAL });
  assert.equal(JSON.stringify(pourRapide), JSON.stringify(pourArchitecte));

  const envR = envelopeFrom(pourRapide, 'rapide');
  const envA = envelopeFrom(pourArchitecte, 'architecte');

  for (const field of ['intent.objective', 'intent.deliverable', 'executability.oprie_state']) {
    const read = (env) => field.split('.').reduce((acc, k) => acc[k], env.canonical_base);
    assert.equal(read(envR), read(envA), `${field} identique entre les deux modes`);
  }
  assert.equal(JSON.stringify(envR.canonical_base), JSON.stringify(envA.canonical_base));
  assert.notEqual(envR.routing.route, envA.routing.route, 'seul le routage diffère');
});

test('T-CANON02-21 déterminisme : même base + même route → même enveloppe', () => {
  const base = baseFrom();
  const a = envelopeFrom(base, 'architecte');
  const b = envelopeFrom(base, 'architecte');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('T-CANON02-22 une base malformée échoue fermé', () => {
  for (const bad of [{}, { original_request: 'x' }, { original_request: 'x', intent: {}, executability: {} }, 'texte', 42, []]) {
    assert.throws(() => buildExecutionEnvelope({ canonical_base: bad, provider_result: decision('rapide') }), /Canonical Base Contract requis/);
  }
});

/* ==========================================================================
 * VALIDATEUR DE CONVERGENCE
 * ======================================================================= */

test('T-CANON02-23 SEMANTIC_LOSS_COUNT = 0 sur une base riche', () => {
  const base = baseFrom();
  const envelope = envelopeFrom(base);
  const verdict = validateCanonicalEnvelopeConvergence(base, envelope);

  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.semantic_loss_count, 0);
  assert.equal(CANONICAL_SEMANTIC_FIELDS.length, 17, 'dix-sept champs sémantiques sous surveillance');
});

test('T-CANON02-23b le validateur détecte toute perte ou invention', () => {
  const base = baseFrom();
  const cases = [
    ['base non attachée', (e) => { delete e.canonical_base; }, /ne porte pas la base/],
    ['objectif altéré', (e) => { e.canonical_base.intent.objective = 'AUTRE'; }, /intent\.objective/],
    ['priorité perdue', (e) => { e.canonical_base.intent.priorities.pop(); }, /intent\.priorities/],
    ['inconnue perdue', (e) => { e.canonical_base.executability.remaining_unknowns = []; }, /remaining_unknowns/],
    ['fait externe perdu', (e) => { e.canonical_base.evidence.external_facts = []; }, /external_facts/],
    ['contrainte inventée', (e) => { e.contract.intent.explicit_constraints.push('INVENTEE'); }, /Contrainte inventée/],
    ['demande réécrite', (e) => { e.contract.original_request = 'AUTRE'; }, /original_request/],
    ['champ transitoire réinjecté', (e) => { e.contract.next_question = { text: 'Q' }; }, /next_question/]
  ];

  for (const [label, mutate, pattern] of cases) {
    const envelope = JSON.parse(JSON.stringify(envelopeFrom(base)));
    mutate(envelope);
    const verdict = validateCanonicalEnvelopeConvergence(base, envelope);
    assert.equal(verdict.ok, false, `${label} doit être refusé`);
    assert.ok(verdict.problems.some((p) => pattern.test(p)), `${label} : ${JSON.stringify(verdict.problems)}`);
  }
});

test('T-CANON02-24 les pertes de provenance sont classifiées, jamais silencieuses', () => {
  assert.equal(ACCEPTED_PRESENTATION_LOSSES.length, 4);
  const classifications = new Set(ACCEPTED_PRESENTATION_LOSSES.map((l) => l.classification));
  for (const c of classifications) assert.ok(['AUDIT_METADATA_LOSS', 'SAFE_PRESENTATION_LOSS'].includes(c));
  assert.equal(classifications.has('SEMANTIC_LOSS'), false, 'aucune perte sémantique n’est acceptée');
  assert.equal(classifications.has('UNACCEPTABLE_LOSS'), false);
  for (const loss of ACCEPTED_PRESENTATION_LOSSES) {
    assert.ok(loss.field.length > 0 && loss.reason.length > 0, 'chaque perte est nommée et motivée');
  }
});

/* ==========================================================================
 * MIGRATION DES CONSOMMATEURS
 * ======================================================================= */

test('T-CANON02-27 le mapper reste sans branchement de mode', () => {
  const source = fs.readFileSync(path.join(root, 'core/adn/oprie-canonical-mapping.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['rapide', 'architecte', 'requestedMode']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

test('T-CANON02-MIG le chemin Architecte consomme la base canonique', () => {
  const section = HTML.slice(HTML.indexOf('function adpEnterArchitecte('), HTML.indexOf('function adpRunRapide('));
  assert.match(section, /orientation&&orientation\.canonical/, 'la base est lue depuis orientation');
  assert.match(section, /adnCanonicalEnvelope\(canonical,materiau,'architecte'\)/, 'l’enveloppe est bâtie depuis la base');

  const builder = HTML.slice(HTML.indexOf('function adnCanonicalEnvelope('), HTML.indexOf('function adnManualEnvelope('));
  assert.match(builder, /canonical_base:canonicalBase/);
  /* Aucun champ sémantique legacy n'est fourni en parallèle de la base. */
  for (const legacyArg of ['intent:', 'evidence:', 'executability:', 'assumptions:', 'obligations:', 'quantities:', 'output:', 'checks:']) {
    assert.equal(builder.includes(legacyArg), false, `${legacyArg} ne doit pas accompagner canonical_base`);
  }
});

test('T-CANON02-ANTI-SOURCE ACTIVE_CANONICAL_SEMANTIC_SOURCE_COUNT = 1 sur le chemin migré', () => {
  /* Borne serrée sur la seule fonction migrée : adpDecideRapide, chemin legacy
     sans appelant, possède son propre repli et n'entre pas dans ce périmètre. */
  const section = HTML.slice(HTML.indexOf('function adpEnterArchitecte('), HTML.indexOf('async function adpDecideRapide('));

  /* Sur ce chemin, un champ canonique ne peut venir que de la base. Le repli
     manuel n'est atteint QUE si aucune base n'existe — jamais en concurrence. */
  const canonicalUse = (section.match(/adnCanonicalEnvelope\(/g) || []).length;
  const manualUse = (section.match(/adnManualEnvelope\(/g) || []).length;
  assert.equal(canonicalUse, 1, 'un seul constructeur canonique');
  assert.equal(manualUse, 1, 'un seul repli, mutuellement exclusif');
  assert.ok(section.indexOf('adnCanonicalEnvelope(') < section.indexOf('adnManualEnvelope('),
    'la base est tentée en premier ; le repli ne s’applique qu’à défaut');
});

test('T-CANON02-30 aucun appel réseau ni dépendance fournisseur introduits', () => {
  for (const file of ['core/adn/oprie-canonical-mapping.js', 'core/adn/engine-adapters.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'https://', 'anthropic', 'openai', 'groq']) {
      assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `${file} : ${forbidden}`);
    }
  }
});

test('T-CANON02-RUNTIME la migration fonctionne dans le runtime navigateur généré', () => {
  const bundle = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(bundle, context);
  const runtime = context.window.__ATELIER_ADN_RUNTIME__;

  const base = runtime.mapOprieToCanonicalContract(richTurn(), { request_id: 'r', original_request: ORIGINAL });
  const envelope = runtime.buildExecutionEnvelope({
    canonical_base: base,
    provider_result: decisionFor(base, 'architecte')
  });

  assert.ok(envelope.canonical_base, 'la base voyage dans le runtime navigateur');
  assert.equal(envelope.canonical_base.intent.objective, 'OBJECTIF_UNIQUE');
  assert.equal(envelope.contract.original_request, ORIGINAL);

  const verdict = runtime.validateCanonicalEnvelopeConvergence(base, envelope);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
  assert.equal(verdict.semantic_loss_count, 0);
});

test('T-CANON02-RAPIDE le mode Rapide reste inchangé : sa migration relève d’ADN-RAPIDE-01', () => {
  const section = HTML.slice(HTML.indexOf('function adpRunRapide('), HTML.indexOf('function v11StartAtelier('));
  assert.match(section, /adnRefineRapidEnvelope\(r,orientation,materiau\)/, 'le chemin Rapide est inchangé');
  assert.equal(section.includes('adnCanonicalEnvelope('), false, 'aucune migration Rapide dans ce lot');

  const rapide = HTML.slice(HTML.indexOf('async function v11StartRapide'), HTML.indexOf('async function v11StartArchitecte'));
  assert.match(rapide, /oprieRunTurn\('rapide'\)/, 'la politique R1 est intacte');
});
