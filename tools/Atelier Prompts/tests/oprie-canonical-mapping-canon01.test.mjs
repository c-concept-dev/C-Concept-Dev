/* ADN-CANON-01 — MAPPING OPRIE → CANONICAL EXECUTION CONTRACT
 * ============================================================================
 *
 * Exigences produit. Invariants de gouvernance CDC v1.7 :
 *
 *   OPRIE_TO_CANONICAL_BASE_MAPPING = UNIQUE
 *   CANONICAL_EXECUTABLE <=> OPRIE.state === 'operational_request_ready'
 *   LOCK_SELECTION_AUTHORITY = ADN   (jamais le mapper)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mapOprieToCanonicalContract,
  validateCanonicalContract,
  createCanonicalMappingAuditView,
  CANONICAL_CONTRACT_VERSION,
  OPRIE_STATES,
  OPRIE_EXECUTABLE_STATE,
  OPRIE_TRANSIENT_FIELDS,
  CANONICAL_SOURCES,
  CANONICAL_EVALUATION_MARKERS,
  CANONICAL_BASE_FIELDS,
  isCanonicalBaseContract,
  canonicalBaseToEnvelopeInput
} from '../core/adn/oprie-canonical-mapping.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = 'Ma demande, telle que je l’ai écrite.';
const OPTIONS = { request_id: 'req-1', original_request: ORIGINAL };

function turn(overrides = {}) {
  const candidate = {
    objective: 'Objectif validé par l’Arbitre.',
    expected_deliverable: 'Un livrable explicitement nommé.',
    secondary_objectives: [],
    confirmed_constraints: [],
    confirmed_priorities: [],
    confirmed_preferences: [],
    delegated_decisions: [],
    external_facts_to_research: [],
    assumptions_allowed: [],
    remaining_unknowns: [],
    ...(overrides.operational_request_candidate || {})
  };
  return {
    state: 'operational_request_ready',
    operational_request_candidate: candidate,
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null,
    blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Accord complet entre l’Analyste et le Critique.',
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'operational_request_candidate'))
  };
}

function issue(overrides = {}) {
  return {
    id: 'i1', type: 'missing_information', kind: null, description: 'Description de l’obstacle.',
    impact: 'material', substitutable: false, recommended_treatment: 'question', ...overrides
  };
}

const map = (t, o = OPTIONS) => mapOprieToCanonicalContract(t, o);
const texts = (items) => items.map((item) => item.text);

/* ==========================================================================
 * DEMANDE ORIGINALE ET INTENTION
 * ======================================================================= */

test('T-CANON01-01 original_request est préservée et jamais remplacée par le candidat', () => {
  const contract = map(turn());
  assert.equal(contract.original_request, ORIGINAL);
  assert.notEqual(contract.original_request, contract.intent.objective);

  assert.throws(() => map(turn(), { request_id: 'r', original_request: '   ' }), /demande originale est obligatoire/);
  assert.throws(() => map(turn(), { request_id: '', original_request: ORIGINAL }), /request_id/);
});

test('T-CANON01-02 objective → intent.objective, avec provenance', () => {
  const contract = map(turn({ operational_request_candidate: { objective: 'Comparer trois options.' } }));
  assert.equal(contract.intent.objective, 'Comparer trois options.');
  assert.equal(contract.intent.source, 'oprie');
});

test('T-CANON01-03 expected_deliverable → intent.deliverable', () => {
  const contract = map(turn({ operational_request_candidate: { expected_deliverable: 'Un tableau comparatif.' } }));
  assert.equal(contract.intent.deliverable, 'Un tableau comparatif.');
});

test('T-CANON01-04 secondary_objectives → intent.secondary_objectives', () => {
  const contract = map(turn({ operational_request_candidate: { secondary_objectives: ['S1', 'S2'] } }));
  assert.deepEqual(texts(contract.intent.secondary_objectives), ['S1', 'S2']);
  for (const item of contract.intent.secondary_objectives) assert.equal(item.source, 'oprie');
});

test('T-CANON01-05 confirmed_constraints → intent.explicit_constraints, marquées confirmées', () => {
  const contract = map(turn({ operational_request_candidate: { confirmed_constraints: ['C1', 'C2', 'C3'] } }));
  assert.deepEqual(texts(contract.intent.explicit_constraints), ['C1', 'C2', 'C3']);
  for (const item of contract.intent.explicit_constraints) {
    assert.equal(item.source, 'oprie');
    assert.equal(item.confirmed, true);
    assert.equal(item.evidence_id, null);
  }
});

test('T-CANON01-06 confirmed_priorities → intent.priorities', () => {
  const contract = map(turn({ operational_request_candidate: { confirmed_priorities: ['P1'] } }));
  assert.deepEqual(texts(contract.intent.priorities), ['P1']);
});

test('T-CANON01-07 confirmed_preferences → intent.preferences', () => {
  const contract = map(turn({ operational_request_candidate: { confirmed_preferences: ['Pref1', 'Pref2'] } }));
  assert.deepEqual(texts(contract.intent.preferences), ['Pref1', 'Pref2']);
});

test('T-CANON01-08 delegated_decisions → intent.delegated_decisions', () => {
  const contract = map(turn({ operational_request_candidate: { delegated_decisions: ['D1'] } }));
  assert.deepEqual(texts(contract.intent.delegated_decisions), ['D1']);
});

/* ==========================================================================
 * EVIDENCE, ASSUMPTIONS, UNKNOWNS
 * ======================================================================= */

test('T-CANON01-09 external_facts_to_research reste une LISTE ; le booléen en dérive', () => {
  const contract = map(turn({ operational_request_candidate: { external_facts_to_research: ['F1', 'F2'] } }));

  assert.equal(contract.evidence.external_facts.length, 2);
  assert.deepEqual(contract.evidence.external_facts[0], { description: 'F1', source: 'oprie', status: 'to_research' });
  assert.equal(contract.evidence.external_knowledge_needed, true, 'le booléen est DÉRIVÉ de la liste');

  const empty = map(turn());
  assert.deepEqual(empty.evidence.external_facts, []);
  assert.equal(empty.evidence.external_knowledge_needed, false);
});

test('T-CANON01-09b aucun fait externe n’est jamais marqué vérifié', () => {
  const contract = map(turn({ operational_request_candidate: { external_facts_to_research: ['F'] } }));
  for (const fact of contract.evidence.external_facts) assert.equal(fact.status, 'to_research');
  assert.equal(JSON.stringify(contract).includes('"verified"'), false);
});

test('T-CANON01-10 assumptions_allowed → assumptions.allowed ; forbidden et explicit restent vides', () => {
  const contract = map(turn({ operational_request_candidate: { assumptions_allowed: ['H1', 'H2'] } }));

  assert.deepEqual(texts(contract.assumptions.allowed), ['H1', 'H2']);
  assert.deepEqual(contract.assumptions.forbidden, [], 'forbidden appartient à l’enrichissement Architecte');
  assert.deepEqual(contract.assumptions.explicit, [], 'explicit appartient à l’enrichissement Architecte');
  /* CORRECTION-ADN-CANON-01-01 : aucun marqueur dédié aux hypothèses. L'absence de
     marqueur signifie qu'aucune affirmation d'évaluation n'est faite sur cette famille. */
  assert.equal('extraction_performed' in contract.assumptions, false);
  assert.deepEqual(Object.keys(contract.assumptions).sort(), ['allowed', 'explicit', 'forbidden']);
});

test('T-CANON01-11 remaining_unknowns → executability.remaining_unknowns', () => {
  const contract = map(turn({ operational_request_candidate: { remaining_unknowns: ['U1', 'U2'] } }));
  assert.deepEqual(texts(contract.executability.remaining_unknowns), ['U1', 'U2']);
  assert.equal(contract.executability.source, 'oprie');
});

/* ==========================================================================
 * ISSUES
 * ======================================================================= */

test('T-CANON01-12 issue non substituable et matérielle → critical_missing', () => {
  const contract = map(turn({ issues: [issue({ substitutable: false, impact: 'material' })] }));
  assert.equal(contract.executability.critical_missing.length, 1);
  assert.equal(contract.executability.substitutable_missing.length, 0);
});

test('T-CANON01-13 issue substituable → substitutable_missing', () => {
  const contract = map(turn({ issues: [issue({ id: 'i2', substitutable: true })] }));
  assert.equal(contract.executability.critical_missing.length, 0);
  assert.equal(contract.executability.substitutable_missing.length, 1);
  assert.equal(contract.executability.substitutable_missing[0].demotion_reason, undefined);
});

test('T-CANON01-14 issue non substituable mais non matérielle → rétrogradée AVEC sa raison', () => {
  const contract = map(turn({ issues: [issue({ id: 'i3', substitutable: false, impact: 'non_material' })] }));
  assert.equal(contract.executability.critical_missing.length, 0);
  assert.equal(contract.executability.substitutable_missing.length, 1);
  assert.equal(contract.executability.substitutable_missing[0].demotion_reason, 'non_material',
    'la rétrogradation reste auditable');
});

test('T-CANON01-34 aucun champ d’issue n’est perdu', () => {
  const source = issue({ id: 'i9', type: 'ambiguity', kind: 'constraint_tension', description: 'D', impact: 'material', substitutable: true, recommended_treatment: 'estimate' });
  const contract = map(turn({ issues: [source] }));
  const mapped = contract.executability.substitutable_missing[0];

  for (const key of ['id', 'type', 'kind', 'description', 'impact', 'substitutable', 'recommended_treatment']) {
    assert.deepEqual(mapped[key], source[key], `le champ ${key} est conservé`);
  }
  assert.equal(mapped.source, 'oprie');
});

test('T-CANON01-34b le total des issues est conservé, quelle que soit leur répartition', () => {
  const issues = [
    issue({ id: 'a', substitutable: false, impact: 'material' }),
    issue({ id: 'b', substitutable: true, impact: 'material' }),
    issue({ id: 'c', substitutable: false, impact: 'non_material' }),
    issue({ id: 'd', substitutable: true, impact: 'non_material' })
  ];
  const contract = map(turn({ issues }));
  const total = contract.executability.critical_missing.length + contract.executability.substitutable_missing.length;
  assert.equal(total, issues.length);
});

/* ==========================================================================
 * PRÉSERVATION D'INTENTION ET AUDIT
 * ======================================================================= */

test('T-CANON01-15 intent_preservation est recopié sans réparation', () => {
  const contract = map(turn());
  assert.deepEqual(contract.intent.preservation, {
    objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [], source: 'oprie'
  });

  /* Un bloc dégradé est recopié tel quel : le mapper ne « répare » jamais. */
  const degraded = map(turn({ intent_preservation: { objective_preserved: false, priorities_preserved: true, semantic_equivalence: false, concerns: ['X'] } }));
  assert.equal(degraded.intent.preservation.objective_preserved, false);
  assert.equal(degraded.intent.preservation.semantic_equivalence, false);
  assert.deepEqual(degraded.intent.preservation.concerns, ['X']);
});

test('T-CANON01-16 reason → adn_summary.readiness_rationale, sans autorité', () => {
  const contract = map(turn({ reason: 'Motif d’arbitrage.' }));
  assert.equal(contract.adn_summary.readiness_rationale, 'Motif d’arbitrage.');
  assert.deepEqual(Object.keys(contract.adn_summary).sort(), ['readiness_rationale', 'source']);
});

/* ==========================================================================
 * CHAMPS TRANSITOIRES EXCLUS
 * ======================================================================= */

for (const [id, field, value] of [
  ['17', 'next_question', { text: 'Une question ?', targets_issue_id: 'i1', expected_progress: 'X' }],
  ['18', 'confirmation_reason', 'Un motif de confirmation.'],
  ['19', 'blocked_reason', 'Un motif de blocage.']
]) {
  test(`T-CANON01-${id} ${field} n’entre jamais dans le contrat`, () => {
    const contract = map(turn({ [field]: value, state: field === 'next_question' ? 'operational_request_ready' : 'blocked' }));
    assert.equal(Object.prototype.hasOwnProperty.call(contract, field), false);
    const serialized = JSON.stringify(contract);
    assert.equal(serialized.includes(`"${field}"`), false);
    if (typeof value === 'string') assert.equal(serialized.includes(value), false, 'le texte transitoire ne fuit pas');
  });
}

test('T-CANON01-19b les trois champs transitoires sont déclarés comme tels', () => {
  assert.deepEqual([...OPRIE_TRANSIENT_FIELDS].sort(), ['blocked_reason', 'confirmation_reason', 'next_question']);
});

/* ==========================================================================
 * RECIPIENT
 * ======================================================================= */

test('T-CANON01-20 recipient reste null : rien n’est déduit', () => {
  const contract = map(turn({
    operational_request_candidate: {
      objective: 'Expliquer ceci à des personnes non spécialistes.',
      expected_deliverable: 'Une explication pour un lectorat défini.'
    }
  }));
  assert.equal(contract.intent.recipient, null, 'ADN-RECIPIENT-00 n’est pas implémenté : aucune extraction');
});

/* ==========================================================================
 * ÉTATS OPRIE
 * ======================================================================= */

test('T-CANON01-21 oprie_state est une copie EXACTE, pour les quatre états', () => {
  assert.deepEqual([...OPRIE_STATES], [
    'operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked'
  ]);
  for (const state of OPRIE_STATES) {
    const contract = map(turn({ state }));
    assert.equal(contract.executability.oprie_state, state);
  }
});

test('T-CANON01-22 operational_request_ready → exploitable', () => {
  const contract = map(turn({ state: OPRIE_EXECUTABLE_STATE }));
  assert.equal(contract.executability.state, 'exploitable');
});

for (const [id, state] of [['23', 'confirmation_required'], ['24', 'clarification_required'], ['25', 'blocked']]) {
  test(`T-CANON01-${id} ${state} n’est JAMAIS exploitable`, () => {
    const contract = map(turn({ state }));
    assert.equal(contract.executability.oprie_state, state);
    assert.notEqual(contract.executability.state, 'exploitable');
    assert.equal(contract.executability.state, 'clarification_necessaire');
  });
}

test('T-CANON01-26 les TROIS marqueurs officiels, et eux seuls', () => {
  const contract = map(turn());
  assert.equal(contract.executability.evaluated, true, 'OPRIE a réellement évalué l’exécutabilité');
  assert.equal(contract.evidence.extraction_performed, false, 'OPRIE n’extrait aucun fait');
  assert.equal(contract.semantic_lock_signals.signals_produced, true,
    'la phase de production des signaux a bien été exécutée — indépendamment du fait qu’elle en produise');

  /* Aucun quatrième marqueur, nulle part dans le contrat. */
  const found = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) {
      if (/^(extraction_performed|evaluated|signals_produced)$/.test(k)) found.push(`${path}${path ? '.' : ''}${k}`);
      walk(v, `${path}${path ? '.' : ''}${k}`);
    }
  };
  walk(contract, '');
  assert.deepEqual(found.sort(), [...CANONICAL_EVALUATION_MARKERS].sort());
  assert.equal(found.length, 3);
});

/* ==========================================================================
 * PROPRIÉTÉS DU MAPPER
 * ======================================================================= */

test('T-CANON01-27 déterminisme : même entrée → contrat strictement identique', () => {
  const input = turn({
    operational_request_candidate: { confirmed_constraints: ['C'], assumptions_allowed: ['H'], external_facts_to_research: ['F'] },
    issues: [issue({ recommended_treatment: 'research' })]
  });
  assert.deepEqual(map(input), map(input));
  assert.equal(JSON.stringify(map(input)), JSON.stringify(map(input)));
});

test('T-CANON01-28 le mapper ne dépend d’aucun réseau, DOM, LLM ni fournisseur', async () => {
  const source = fs.readFileSync(path.join(root, 'core/adn/oprie-canonical-mapping.js'), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'document.', 'window.', 'localStorage', 'Math.random', 'Date.now', 'new Date']) {
    assert.equal(source.includes(forbidden), false, `dépendance interdite : ${forbidden}`);
  }
  const module = await import('../core/adn/oprie-canonical-mapping.js');
  assert.equal(typeof module.mapOprieToCanonicalContract, 'function');
});

test('T-CANON01-29 aucun branchement par mode dans le mapper', () => {
  /* On inspecte le CODE, pas les commentaires : la note d'architecture du module
     mentionne légitimement les deux modes pour expliquer pourquoi elle ne les
     distingue pas. Un commentaire n'est pas un branchement. */
  const source = fs.readFileSync(path.join(root, 'core/adn/oprie-canonical-mapping.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['rapide', 'architecte', 'requestedMode', 'mode ===']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `branchement par mode détecté : ${forbidden}`);
  }
  /* Le mapper n'accepte aucun paramètre de mode. `Function.length` s'arrête au
     premier paramètre à valeur par défaut : la signature réelle est
     (arbiterOutput, { request_id, original_request } = {}), soit length === 1. */
  assert.equal(mapOprieToCanonicalContract.length, 1);
  assert.match(source, /function mapOprieToCanonicalContract\(arbiterOutput, \{ request_id, original_request \} = \{\}\)/,
    'aucun troisième paramètre, aucun paramètre de mode');
});

test('T-CANON01-30 Rapide et Architecte reçoivent le MÊME contrat de base', () => {
  const input = turn({
    operational_request_candidate: { confirmed_constraints: ['C1'], confirmed_priorities: ['P1'], assumptions_allowed: ['H1'] },
    issues: [issue()]
  });
  /* Le mapper ne prend aucun mode : le seul contrat possible est le même pour
     les deux parcours. La preuve est l'égalité octet pour octet. */
  const pourRapide = map(input);
  const pourArchitecte = map(input);
  assert.equal(JSON.stringify(pourRapide), JSON.stringify(pourArchitecte));
});

test('T-CANON01-31 le mapper ne sélectionne aucun verrou', () => {
  const contract = map(turn({
    operational_request_candidate: { assumptions_allowed: ['H'], external_facts_to_research: ['F'] },
    issues: [issue({ recommended_treatment: 'research' })]
  }));

  assert.deepEqual(contract.selected_locks.locks, [], 'LOCK_SELECTION_AUTHORITY = ADN');
  assert.deepEqual(contract.selected_locks.decisions, []);
  assert.equal(JSON.stringify(contract).includes('"selected":true'), false);

  /* Des SIGNAUX sont émis, mais un signal n'est pas une sélection. */
  assert.ok(contract.semantic_lock_signals.signals.length > 0);
  for (const signal of contract.semantic_lock_signals.signals) {
    assert.equal('selected' in signal, false);
    assert.equal(signal.needed, true);
  }
});

test('T-CANON01-31b les signaux génériques proviennent d’énumérations fermées, sans logique métier', () => {
  const research = map(turn({ issues: [issue({ recommended_treatment: 'research' })] }));
  assert.deepEqual(research.semantic_lock_signals.signals.map((s) => s.id), ['provenance']);

  for (const treatment of ['estimate', 'scenario', 'condition', 'leave_unknown']) {
    const contract = map(turn({ issues: [issue({ recommended_treatment: treatment })] }));
    assert.deepEqual(contract.semantic_lock_signals.signals.map((s) => s.id), ['assumptions'], treatment);
  }
  for (const treatment of ['decide', 'question']) {
    const contract = map(turn({ issues: [issue({ recommended_treatment: treatment })] }));
    assert.deepEqual(contract.semantic_lock_signals.signals, [], `${treatment} ne produit aucun signal`);
  }

  /* `scope` n'est jamais signalé ici : il exige l'analyse Architecte. */
  const all = map(turn({
    operational_request_candidate: { assumptions_allowed: ['H'], external_facts_to_research: ['F'] },
    issues: [issue({ recommended_treatment: 'research' }), issue({ id: 'i2', recommended_treatment: 'estimate' })]
  }));
  assert.deepEqual([...new Set(all.semantic_lock_signals.signals.map((s) => s.id))].sort(), ['assumptions', 'provenance']);
});

test('T-CANON01-32 aucune valeur par défaut n’est promue en contrainte ou obligation utilisateur', () => {
  const contract = map(turn());
  for (const item of contract.intent.explicit_constraints) assert.equal(item.source, 'oprie');
  assert.deepEqual(contract.obligations, [], 'OPRIE ne produit aucune obligation');
  assert.deepEqual(contract.quantities, [], 'OPRIE ne produit aucune quantité');
  assert.equal(JSON.stringify(contract).includes('"source":"default"'), false);
});

test('T-CANON01-33 une sortie Arbiter malformée échoue fermé', () => {
  for (const bad of [null, undefined, 'texte', 42, [], {}, { state: 'inconnu' }, { state: '' }]) {
    assert.throws(() => map(bad), /ADN-CANON-01/, `entrée ${JSON.stringify(bad)} doit être refusée`);
  }
});

test('T-CANON01-35 aucune valeur synthétique n’est inventée', () => {
  const contract = map(turn());
  assert.equal(contract.intent.recipient, null);
  assert.equal(contract.output.format, null);
  assert.equal(contract.output.tone, null);
  assert.equal(contract.output.length_policy, null);
  assert.deepEqual(contract.output.structure, []);
  assert.deepEqual(contract.evidence.user_facts, []);
  assert.deepEqual(contract.evidence.material_facts, []);
  assert.deepEqual(contract.evidence.deductions, []);
  assert.deepEqual(contract.evidence.provenance, []);
  assert.deepEqual(contract.checks, []);
  assert.equal(contract.executability.confidence, null);
});

/* ==========================================================================
 * VALIDATEUR CANONIQUE
 * ======================================================================= */

test('T-CANON01-VAL un contrat correctement mappé passe la validation', () => {
  const input = turn({
    operational_request_candidate: { confirmed_constraints: ['C1', 'C2'], assumptions_allowed: ['H'], external_facts_to_research: ['F'] },
    issues: [issue(), issue({ id: 'i2', substitutable: true })]
  });
  const verdict = validateCanonicalContract(map(input), { arbiterOutput: input, original_request: ORIGINAL });
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
});

test('T-CANON01-VAL-b le validateur détecte toute perte ou altération', () => {
  const input = turn({ operational_request_candidate: { confirmed_constraints: ['C1', 'C2'], assumptions_allowed: ['H'] }, issues: [issue()] });
  const base = map(input);

  const cases = [
    ['contrainte perdue', (c) => { c.intent.explicit_constraints.pop(); }, /contrainte confirmée/],
    ['hypothèse ajoutée', (c) => { c.assumptions.allowed.push({ text: 'X', source: 'arch_analysis' }); }, /assumptions\.allowed diverge/],
    ['issue perdue', (c) => { c.executability.critical_missing.pop(); }, /issue OPRIE a été perdue/],
    ['préservation réparée', (c) => { c.intent.preservation.objective_preserved = false; }, /preservation\.objective_preserved altéré/],
    ['demande réécrite', (c) => { c.original_request = 'Autre chose.'; }, /original_request altérée/],
    ['état promu', (c) => { c.executability.oprie_state = 'blocked'; }, /Seul operational_request_ready/],
    ['verrou sélectionné', (c) => { c.selected_locks.locks.push('format'); }, /ne sélectionne aucun verrou/],
    ['provenance inventée', (c) => { c.intent.priorities.push({ text: 'P', source: 'inconnue' }); }, /Provenance invalide/],
    ['défaut promu en contrainte', (c) => { c.intent.explicit_constraints.push({ text: 'D', source: 'default' }); }, /valeur par défaut/],
    ['marqueur d’évaluation retiré', (c) => { c.executability.evaluated = false; }, /evaluated doit refléter/]
  ];

  for (const [label, mutate, pattern] of cases) {
    const contract = JSON.parse(JSON.stringify(base));
    mutate(contract);
    const verdict = validateCanonicalContract(contract, { arbiterOutput: input, original_request: ORIGINAL });
    assert.equal(verdict.ok, false, `${label} doit être refusé`);
    assert.ok(verdict.problems.some((p) => pattern.test(p)), `${label} : motif attendu ${pattern} — reçu ${JSON.stringify(verdict.problems)}`);
  }
});

test('T-CANON01-VAL-c le validateur refuse un champ transitoire réintroduit', () => {
  const input = turn();
  const contract = map(input);
  contract.next_question = { text: 'Une question ?' };
  const verdict = validateCanonicalContract(contract, { arbiterOutput: input, original_request: ORIGINAL });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some((p) => p.includes('next_question')));
});

test('T-CANON01-VAL-d le validateur refuse une quantité exacte accompagnée de bornes', () => {
  const input = turn();
  const contract = map(input);
  contract.quantities.push({ target: 'critères', unit: 'critères', exact: 7, min: 7, max: 7, source: 'user_explicit' });
  const verdict = validateCanonicalContract(contract, { arbiterOutput: input, original_request: ORIGINAL });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.problems.some((p) => /exacte ne peut pas porter min ou max/.test(p)));

  const ok = map(input);
  ok.quantities.push({ target: 'critères', unit: 'critères', exact: 7, min: null, max: null, source: 'user_explicit' });
  assert.equal(validateCanonicalContract(ok, { arbiterOutput: input, original_request: ORIGINAL }).ok, true,
    'la forme canonique exact/min/max est supportée');
});

/* ==========================================================================
 * AUTORITÉ ET INTÉGRATION
 * ======================================================================= */

test('T-CANON01-AUTH OPRIE_TO_CANONICAL_MAPPING_AUTHORITY = SINGLE', () => {
  /* Un seul producteur du contrat de base existe dans core/adn. */
  const files = fs.readdirSync(path.join(root, 'core/adn')).filter((f) => f.endsWith('.js') && !f.includes('generated'));
  const producers = files.filter((f) => fs.readFileSync(path.join(root, 'core/adn', f), 'utf8').includes('function mapOprieToCanonicalContract'));
  assert.deepEqual(producers, ['oprie-canonical-mapping.js']);

  /* Et un seul appelant côté frontend, hors bloc de runtime généré — celui-ci
     embarque la source du module et n'est donc pas un point d'appel. */
  const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
  const generatedStart = html.indexOf('/* GENERATED — LOT 10G.3B.3F');
  const generatedEnd = html.indexOf('})(window);', generatedStart);
  const outsideGenerated = html.slice(0, generatedStart) + html.slice(generatedEnd);
  const calls = outsideGenerated.match(/mapOprieToCanonicalContract\(/g) || [];
  assert.equal(calls.length, 1, 'un unique point de production du contrat de base');
});

test('T-CANON01-AUTH-b ARCHITECTE_CANONICAL_BASE_WRITE = NO', () => {
  const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
  const validator = html.slice(html.indexOf('function adnValidatePostOprie('), html.indexOf('const ADN_POST_OPRIE_STOP_UI'));

  /* Le validateur Architecte lit le contrat ; il ne lui écrit jamais rien. */
  assert.ok(validator.includes('canonicalContract'));
  assert.equal(/canonicalContract\.[A-Za-z_.]+\s*=[^=]/.test(validator), false, 'aucune affectation dans le contrat');
  assert.equal(/canonicalContract\.[A-Za-z_.]*\.(push|pop|splice|shift|unshift)\(/.test(validator), false, 'aucune mutation de collection');
});

test('T-CANON01-INT le contrat est produit avant toute divergence de mode', () => {
  const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
  const section = html.slice(html.indexOf('function oprieEnterExecution('), html.indexOf('function oprieApplyTurn('));

  const build = section.indexOf('oprieBuildCanonicalContract(turn)');
  const dispatch = section.indexOf("route==='rapide'?adpRunRapide");
  assert.ok(build > -1 && dispatch > build, 'le contrat est bâti avant l’aiguillage Rapide/Architecte');
  assert.ok(section.includes('canonical,'), 'le contrat est porté dans orientation, identique pour les deux modes');
});

test('T-CANON01-META version, énumérations et vue d’audit', () => {
  assert.equal(CANONICAL_CONTRACT_VERSION, '2.0');
  assert.equal(map(turn()).version, CANONICAL_CONTRACT_VERSION);
  assert.ok(CANONICAL_SOURCES.includes('oprie'));

  const view = createCanonicalMappingAuditView(map(turn({
    operational_request_candidate: { confirmed_constraints: ['C'], assumptions_allowed: ['H'] },
    issues: [issue()]
  })));
  assert.equal(view.oprie_state, 'operational_request_ready');
  assert.equal(view.executable, true);
  assert.equal(view.counts.explicit_constraints, 1);
  assert.equal(view.counts.critical_missing, 1);
  /* La vue d'audit ne contient aucun contenu utilisateur. */
  assert.equal(JSON.stringify(view).includes(ORIGINAL), false);
});

/* ==========================================================================
 * CORRECTION-ADN-CANON-01-01
 * Deux couches formalisées, une seule source de vérité sémantique,
 * et strictement trois marqueurs de gouvernance.
 * ======================================================================= */

import { buildExecutionEnvelope } from '../core/adn/engine-adapters.js';

const PROVIDER = { source: 'none', decision: { etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: 'test', question: null } };

test('T-CANON01-CORR-01 le Canonical Base Contract ne contient aucun routing ni aucune décision', () => {
  const base = map(turn());
  for (const field of ['decision', 'routing', 'execution_policy', 'ethics', 'locks']) {
    assert.equal(field in base, false, `${field} appartient à l'Execution Envelope, pas à la base`);
  }
  assert.equal(JSON.stringify(base).includes('"route"'), false);
  assert.deepEqual(Object.keys(base).sort(), [...CANONICAL_BASE_FIELDS].sort(),
    'la base a exactement les champs déclarés');
});

test('T-CANON01-CORR-02 le mapper ne produit aucune route et n’exige aucune décision', () => {
  const base = map(turn());
  assert.equal(JSON.stringify(base).includes('rapide'), false);
  assert.equal(JSON.stringify(base).includes('architecte'), false);
  /* Le mapper accepte un tour OPRIE seul : aucune décision de routage requise. */
  assert.ok(isCanonicalBaseContract(base));
});

test('T-CANON01-CORR-03 SINGLE_CANONICAL_BASE_SOURCE_OF_TRUTH : l’enveloppe consomme la base', () => {
  const input = turn({
    operational_request_candidate: { objective: 'Objectif canonique.', expected_deliverable: 'Livrable canonique.', confirmed_constraints: ['Contrainte canonique.'], assumptions_allowed: ['Hypothèse canonique.'] }
  });
  const base = map(input);
  const envelope = buildExecutionEnvelope({ canonical_base: base, provider_result: PROVIDER });

  /* Chaque champ sémantique de l'enveloppe PROVIENT de la base, pas d'une
     reconstruction indépendante. La preuve : des valeurs uniques traversent. */
  assert.equal(envelope.contract.original_request, base.original_request);
  assert.equal(envelope.contract.intent.objective, 'Objectif canonique.');
  assert.equal(envelope.contract.intent.deliverable, 'Livrable canonique.');
  assert.deepEqual(envelope.contract.intent.explicit_constraints, ['Contrainte canonique.']);
  /* L'enveloppe stocke les hypothèses en chaînes ; la base les porte tracées.
     La valeur unique traverse : c'est la preuve de la consommation. */
  assert.deepEqual(envelope.contract.assumptions, ['Hypothèse canonique.']);
});

test('T-CANON01-CORR-03b l’enveloppe refuse une base malformée : elle ne reconstruit jamais en silence', () => {
  for (const bad of [{}, { original_request: 'x' }, { original_request: 'x', intent: {}, executability: { oprie_state: 'inconnu' } }]) {
    assert.throws(() => buildExecutionEnvelope({ canonical_base: bad, provider_result: PROVIDER }), /Canonical Base Contract requis/);
  }
});

test('T-CANON01-CORR-04 aucun second constructeur sémantique indépendant', () => {
  const files = fs.readdirSync(path.join(root, 'core/adn')).filter((f) => f.endsWith('.js') && !f.includes('generated'));

  const baseProducers = files.filter((f) => /function mapOprieToCanonicalContract|function buildCanonicalBaseContract/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(baseProducers, ['oprie-canonical-mapping.js'], 'un seul producteur de base canonique');

  const projectors = files.filter((f) => /function canonicalBaseToEnvelopeInput/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(projectors, ['oprie-canonical-mapping.js'], 'une seule projection base → enveloppe');

  /* L'enveloppe importe la projection : elle ne la réimplémente pas. */
  const adapters = fs.readFileSync(path.join(root, 'core/adn/engine-adapters.js'), 'utf8');
  /* L'assertion porte sur le SYMBOLE importé, pas sur la ligne exacte : d'autres
     symboles du même module peuvent légitimement s'y ajouter (la garde readiness
     de CORRECTION-ADN-CANON-02-01, par exemple). */
  assert.match(adapters, /import \{[^}]*\bcanonicalBaseToEnvelopeInput\b[^}]*\} from '\.\/oprie-canonical-mapping\.js'/);
});

test('T-CANON01-CORR-04b le runtime navigateur expose la même passerelle unique', async () => {
  const vm = await import('node:vm');
  const src = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
  const ctx = { window: {}, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const runtime = ctx.window.__ATELIER_ADN_RUNTIME__;

  assert.equal(typeof runtime.mapOprieToCanonicalContract, 'function');
  assert.equal(typeof runtime.canonicalBaseToEnvelopeInput, 'function');

  const base = runtime.mapOprieToCanonicalContract(turn({ operational_request_candidate: { objective: 'Traçable.' } }), { request_id: 'r', original_request: ORIGINAL });
  const envelope = runtime.buildExecutionEnvelope({ canonical_base: base, provider_result: PROVIDER });
  assert.equal(envelope.contract.intent.objective, 'Traçable.', 'la base traverse le runtime navigateur');
});

test('T-CANON01-CORR-05 evidence.extraction_performed est le seul marqueur d’evidence', () => {
  const base = map(turn());
  const markers = Object.keys(base.evidence).filter((k) => /performed|evaluated|produced/.test(k));
  assert.deepEqual(markers, ['extraction_performed']);
  assert.equal(base.evidence.extraction_performed, false);
});

test('T-CANON01-CORR-06 executability.evaluated est le seul marqueur d’executability', () => {
  const base = map(turn());
  const markers = Object.keys(base.executability).filter((k) => /performed|evaluated|produced/.test(k));
  assert.deepEqual(markers, ['evaluated']);
  assert.equal(base.executability.evaluated, true);
});

test('T-CANON01-CORR-07 signals_produced est présent, et distinct de « un signal existe »', () => {
  const withSignals = map(turn({ operational_request_candidate: { assumptions_allowed: ['H'] } }));
  assert.equal(withSignals.semantic_lock_signals.signals_produced, true);
  assert.ok(withSignals.semantic_lock_signals.signals.length > 0);

  const withoutSignals = map(turn());
  assert.equal(withoutSignals.semantic_lock_signals.signals_produced, true,
    'la phase a été exécutée, même sans produire de signal');
  assert.deepEqual(withoutSignals.semantic_lock_signals.signals, []);
});

test('T-CANON01-CORR-08 assumptions.extraction_performed est absent', () => {
  const base = map(turn({ operational_request_candidate: { assumptions_allowed: ['H'] } }));
  assert.equal('extraction_performed' in base.assumptions, false);
  assert.deepEqual(Object.keys(base.assumptions).sort(), ['allowed', 'explicit', 'forbidden']);
});

test('T-CANON01-CORR-09 aucun marqueur d’extraction global ou surnuméraire', () => {
  const base = map(turn());
  assert.equal('extraction_performed' in base, false, 'aucun marqueur global à la racine');

  const found = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) {
      const full = `${path}${path ? '.' : ''}${k}`;
      if (/^(extraction_performed|evaluated|signals_produced)$/.test(k)) found.push(full);
      walk(v, full);
    }
  };
  walk(base, '');
  assert.equal(found.length, 3, 'exactement trois marqueurs dans tout le contrat');
  assert.deepEqual(found.sort(), [...CANONICAL_EVALUATION_MARKERS].sort());
});

test('T-CANON01-CORR-09b le validateur refuse tout marqueur non officiel', () => {
  const input = turn();
  for (const [label, mutate] of [
    ['assumptions', (c) => { c.assumptions.extraction_performed = true; }],
    ['racine', (c) => { c.extraction_performed = true; }],
    ['output', (c) => { c.output.evaluated = true; }],
    ['checks', (c) => { c.checks.push({ id: 'x', signals_produced: true }); }]
  ]) {
    const contract = JSON.parse(JSON.stringify(map(input)));
    mutate(contract);
    const verdict = validateCanonicalContract(contract, { arbiterOutput: input, original_request: ORIGINAL });
    assert.equal(verdict.ok, false, `${label} : un marqueur surnuméraire doit être refusé`);
    assert.ok(verdict.problems.some((p) => /Marqueur d'évaluation non autorisé/.test(p)), label);
  }
});

for (const [id, field] of [['10', 'obligations'], ['11', 'quantities'], ['12', 'checks']]) {
  test(`T-CANON01-CORR-${id} ${field} vide n’implique ni évaluation, ni complétude, ni validation`, () => {
    const base = map(turn());
    assert.deepEqual(base[field], []);
    /* Aucune affirmation d'évaluation n'accompagne la collection vide. */
    assert.equal(`${field}_evaluated` in base, false);
    assert.equal(`${field}_complete` in base, false);
    const serialized = JSON.stringify({ [field]: base[field] });
    for (const claim of ['evaluated', 'complete', 'validated', 'pass']) {
      assert.equal(serialized.includes(claim), false, `${field} ne revendique jamais « ${claim} »`);
    }
  });
}

test('T-CANON01-CORR-12b output incomplet ne revendique aucune évaluation', () => {
  const base = map(turn());
  assert.equal(base.output.format, null);
  assert.equal(base.output.tone, null);
  const markers = Object.keys(base.output).filter((k) => /performed|evaluated|produced|complete|pass/.test(k));
  assert.deepEqual(markers, []);
});

test('T-CANON01-CORR-13 déterminisme conservé après correction', () => {
  const input = turn({ operational_request_candidate: { assumptions_allowed: ['H'], external_facts_to_research: ['F'] }, issues: [issue()] });
  assert.equal(JSON.stringify(map(input)), JSON.stringify(map(input)));

  const base = map(input);
  const a = buildExecutionEnvelope({ canonical_base: base, provider_result: PROVIDER });
  const b = buildExecutionEnvelope({ canonical_base: base, provider_result: PROVIDER });
  assert.equal(JSON.stringify(a.contract), JSON.stringify(b.contract));
});

test('T-CANON01-CORR-14 READINESS reçoit toujours le Canonical Base Contract réel', () => {
  const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
  const build = html.slice(html.indexOf('function oprieBuildCanonicalContract('), html.indexOf('function oprieRequestTurn('));
  assert.match(build, /mapOprieToCanonicalContract/);
  assert.match(build, /validateCanonicalContract/);
  assert.match(build, /if\(!verdict\|\|verdict\.ok!==true\)/, 'fail-closed : un contrat invalide n’est pas porté');

  const calls = html.match(/adnValidatePostOprie\([^)]*oprieState\.canonicalContract\)/g) || [];
  assert.equal(calls.length, 2, 'les deux chemins Architecte reçoivent la base canonique');
});

test('T-CANON01-CORR-15 la signature historique de l’enveloppe reste opérante', () => {
  /* Sans canonical_base, rien ne change : la migration des appelants relève d'ADN-CANON-02. */
  const envelope = buildExecutionEnvelope({ request: 'Demande directe.', provider_result: PROVIDER });
  assert.equal(envelope.contract.original_request, 'Demande directe.');
  assert.ok(envelope.routing);
  assert.ok(envelope.contract.execution_policy);
});
