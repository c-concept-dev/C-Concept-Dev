/* ADN-ARCH-01 — ENRICHISSEMENT ARCHITECTE DU CANONICAL BASE CONTRACT
 * ============================================================================
 *
 * Invariant central : TOUT CHAMP ALIMENTÉ PAR OPRIE EST EN LECTURE SEULE.
 * Architecte peut READ · COMPARE · VALIDATE · SIGNAL. Jamais WRITE, REMOVE,
 * OVERRIDE ni ADD dans un champ OPRIE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { mapOprieToCanonicalContract, OPRIE_STATES } from '../core/adn/oprie-canonical-mapping.js';
import {
  enrichCanonicalContractFromArchAnalysis,
  validateArchCanonicalEnrichment,
  validateArchSignals,
  createArchEnrichmentAuditView,
  changedPaths,
  ARCH_ENRICHABLE_PATHS,
  ARCH_SIGNALS,
  DECLARATION_STATUS_MAP,
  PROVENANCE_STATUS_MAP,
  COMPONENT_TYPES
} from '../core/adn/arch-canonical-enrichment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const ORIGINAL = 'DEMANDE_ORIGINALE_ARCH01';

function turn(state = 'operational_request_ready', candidate = {}) {
  return {
    state,
    operational_request_candidate: {
      objective: 'OBJ_OPRIE', expected_deliverable: 'LIV_OPRIE',
      secondary_objectives: ['SEC_OPRIE'], confirmed_constraints: ['CON_OPRIE'],
      confirmed_priorities: ['PRI_OPRIE'], confirmed_preferences: ['PRE_OPRIE'],
      delegated_decisions: ['DEL_OPRIE'], external_facts_to_research: ['EXT_OPRIE'],
      assumptions_allowed: ['ASS_OPRIE'], remaining_unknowns: ['UNK_OPRIE'],
      ...candidate
    },
    issues: [],
    next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'RAISON_OPRIE'
  };
}

const baseFor = (state = 'operational_request_ready', candidate = {}) =>
  mapOprieToCanonicalContract(turn(state, candidate), { request_id: 'req-arch01', original_request: ORIGINAL });

/** Analyse 3.4 neutre et cohérente avec le tour ci-dessus. */
function analysis(overrides = {}) {
  const base = {
    version: '3.4',
    comprehension: {
      intention_principale: 'Produire le livrable.',
      intentions_secondaires: ['SEC_OPRIE'], declarations: [], contraintes: [],
      ambiguites: [], informations_manquantes: []
    },
    evaluation: {
      niveau_risque: 'faible', justification_risque: 'x',
      connaissance_externe_necessaire: false, actualite_requise: false,
      justification_connaissance: 'x', calcul_requis: false,
      livrable_complet_possible: true, reponse_partielle_possible: false,
      action_recommandee: 'continuer', questions_a_poser: [], parties_realisables_immediatement: []
    },
    strategie: {
      capacites_necessaires: [], hypotheses_autorisees: ['ASS_OPRIE'], hypotheses_interdites: [],
      role_adaptatif: { intitule: 'spécialiste', mission: 'produire', competences: ['c'], limites: ['l'] },
      niveau_architecture: 'standard', justification_niveau: 'x',
      pilotage_incertitude: { decisions_autonomes: ['DEL_OPRIE'], estimations_a_etiqueter: [], inconnues_non_devineables: ['UNK_OPRIE'] }
    },
    livrable: { nature: 'un livrable', format_technique: 'texte', quantites: null, ton: 'neutre', longueur_indicative: 'courte' },
    compilation: { composants_retenus: [], composants_ecartes: [] },
    verification: { criteres_bloquants: [], criteres_qualitatifs: [], elements_non_verifiables: [], controle_provenance: [] },
    apprentissage: { preferences_applicables: [], preference_proposable: null }
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && !Array.isArray(base[k]) ? { ...base[k], ...v } : v;
  }
  return out;
}

const declaration = (contenu, statut) => ({ contenu, statut, source: 'demande', preuve: null });
const enrich = (base = baseFor(), a = analysis()) => enrichCanonicalContractFromArchAnalysis(base, a);

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const c of Object.values(value)) deepFreeze(c); }
  return value;
}

/* ==========================================================================
 * IMMUTABILITÉ ET PROTECTION DES CHAMPS OPRIE
 * ======================================================================= */

test('T-ARCH01-01 la base d’entrée est strictement immuable', () => {
  const base = deepFreeze(baseFor());
  const before = JSON.stringify(base);
  const { contract } = enrich(base, analysis());

  assert.equal(JSON.stringify(base), before, 'la base d’entrée est inchangée');
  assert.notEqual(contract, base, 'le contrat enrichi est un nouvel objet');
});

const PROTECTED = [
  ['02', 'original_request', (c) => c.original_request],
  ['02b', 'intent.objective', (c) => c.intent.objective],
  ['03', 'intent.deliverable', (c) => c.intent.deliverable],
  ['04', 'intent.secondary_objectives', (c) => c.intent.secondary_objectives],
  ['05', 'intent.priorities', (c) => c.intent.priorities],
  ['06', 'intent.preferences', (c) => c.intent.preferences],
  ['07', 'intent.delegated_decisions', (c) => c.intent.delegated_decisions],
  ['08', 'intent.explicit_constraints', (c) => c.intent.explicit_constraints],
  ['09', 'intent.preservation', (c) => c.intent.preservation],
  ['10', 'executability.oprie_state', (c) => c.executability.oprie_state],
  ['11', 'executability.state', (c) => c.executability.state],
  ['12', 'executability.critical_missing', (c) => c.executability.critical_missing],
  ['13', 'executability.substitutable_missing', (c) => c.executability.substitutable_missing],
  ['14', 'executability.remaining_unknowns', (c) => c.executability.remaining_unknowns],
  ['15', 'assumptions.allowed', (c) => c.assumptions.allowed]
];

for (const [id, label, read] of PROTECTED) {
  test(`T-ARCH01-${id} ${label} est protégé`, () => {
    const base = baseFor();
    /* Analyse hostile : elle tente de peupler chaque famille correspondante. */
    const hostile = analysis({
      comprehension: {
        intention_principale: 'AUTRE_OBJECTIF', intentions_secondaires: ['SEC_OPRIE', 'SEC_ARCH'],
        declarations: [declaration('FAIT', 'declaration_utilisateur')],
        contraintes: [declaration('CON_ARCH', 'declaration_utilisateur')],
        ambiguites: ['AMB_ARCH'], informations_manquantes: [{ information: 'INFO', bloquant: true, justification: 'j' }]
      },
      strategie: {
        ...analysis().strategie,
        hypotheses_autorisees: ['ASS_OPRIE', 'ASS_ARCH'],
        pilotage_incertitude: { decisions_autonomes: ['DEL_OPRIE', 'DEL_ARCH'], estimations_a_etiqueter: ['EST'], inconnues_non_devineables: ['UNK_OPRIE', 'UNK_ARCH'] }
      },
      livrable: { nature: 'AUTRE_LIVRABLE', format_technique: 'json', quantites: { min: 9, max: 9, unite: 'x' }, ton: 'autre', longueur_indicative: 'autre' }
    });

    const { contract } = enrich(base, hostile);
    assert.deepEqual(read(contract), read(base), `${label} doit rester identique`);
    assert.equal(JSON.stringify(contract).includes('AUTRE_OBJECTIF'), false, 'aucun objectif concurrent n’est écrit');
    assert.equal(JSON.stringify(contract.intent).includes('_ARCH'), false, 'aucun ajout Architecte dans intent');
  });
}

test('T-ARCH01-41b OPRIE_OWNED_CANONICAL_FIELDS_MUTATED_BY_ARCH = 0 — garde générique', () => {
  const base = baseFor();
  const hostile = analysis({
    comprehension: { intention_principale: 'X', intentions_secondaires: ['A', 'B', 'C'], declarations: [declaration('F', 'declaration_utilisateur')], ambiguites: ['A1', 'A2'], informations_manquantes: [{ information: 'I', bloquant: true, justification: 'j' }] },
    strategie: { ...analysis().strategie, hypotheses_autorisees: ['H1', 'H2'], hypotheses_interdites: ['HI'], pilotage_incertitude: { decisions_autonomes: ['D1', 'D2'], estimations_a_etiqueter: ['E'], inconnues_non_devineables: ['U1', 'U2'] } }
  });
  const { contract } = enrich(base, hostile);

  /* Approche générique : tout chemin modifié doit appartenir à la liste blanche. */
  const written = changedPaths(base, contract);
  const illegal = written.filter((p) => !ARCH_ENRICHABLE_PATHS.some((a) => p === a || p.startsWith(`${a}.`)));
  assert.deepEqual(illegal, [], 'aucune écriture hors des chemins enrichissables');

  const verdict = validateArchCanonicalEnrichment(base, contract, hostile);
  assert.deepEqual(verdict.mutated_oprie_fields, []);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
});

/* ==========================================================================
 * DIAGNOSTIC SANS ÉCRITURE
 * ======================================================================= */

test('T-ARCH01-16 objectif secondaire identique → aucun signal, aucune écriture', () => {
  const { contract, signals } = enrich(baseFor(), analysis());
  assert.deepEqual(signals.filter((s) => s.canonical_field === 'intent.secondary_objectives'), []);
  assert.deepEqual(contract.intent.secondary_objectives, baseFor().intent.secondary_objectives);
});

for (const [id, label, mutate, field] of [
  ['17', 'nouvel objectif secondaire', (a) => { a.comprehension.intentions_secondaires = ['SEC_OPRIE', 'NOUVEAU']; }, 'intent.secondary_objectives'],
  ['18', 'décision autonome non déléguée', (a) => { a.strategie.pilotage_incertitude.decisions_autonomes = ['DEL_OPRIE', 'NOUVELLE']; }, 'intent.delegated_decisions'],
  ['19', 'ambiguïté hors contrat OPRIE', (a) => { a.comprehension.ambiguites = ['AMBIGUE']; }, 'executability.substitutable_missing'],
  ['19b', 'hypothèse non autorisée', (a) => { a.strategie.hypotheses_autorisees = ['ASS_OPRIE', 'NON_AUTORISEE']; }, 'assumptions.allowed'],
  ['19c', 'inconnue hors contrat OPRIE', (a) => { a.strategie.pilotage_incertitude.inconnues_non_devineables = ['UNK_OPRIE', 'NOUVELLE']; }, 'executability.remaining_unknowns']
]) {
  test(`T-ARCH01-${id} ${label} → CONTRACT_INCONSISTENT, sans écriture`, () => {
    const base = baseFor();
    const a = analysis();
    mutate(a);
    const { contract, signals } = enrich(base, a);

    const signal = signals.find((s) => s.canonical_field === field);
    assert.ok(signal, `un signal sur ${field} est attendu`);
    assert.equal(signal.signal, 'CONTRACT_INCONSISTENT');
    assert.equal(signal.return_to_oprie, true);

    const read = field.split('.').reduce((acc, k) => acc[k], contract);
    const expected = field.split('.').reduce((acc, k) => acc[k], base);
    assert.deepEqual(read, expected, `${field} reste inchangé`);
  });
}

test('T-ARCH01-20 information bloquante → EXECUTION_UNSAFE, executability inchangée', () => {
  const base = baseFor();
  const a = analysis();
  a.comprehension.informations_manquantes = [{ information: 'DÉTERMINANTE', bloquant: true, justification: 'j' }];
  const { contract, signals } = enrich(base, a);

  const unsafe = signals.find((s) => s.signal === 'EXECUTION_UNSAFE');
  assert.ok(unsafe);
  assert.equal(unsafe.arch_source_field, 'comprehension.informations_manquantes');
  assert.deepEqual(contract.executability, base.executability);
});

for (const [id, label, mutate] of [
  ['21', 'action_recommandee seul', (a) => { a.evaluation.action_recommandee = 'questionner'; }],
  ['22', 'livrable_complet_possible=false seul', (a) => { a.evaluation.livrable_complet_possible = false; }],
  ['23', 'questions_a_poser seul', (a) => { a.evaluation.questions_a_poser = ['Q']; }]
]) {
  test(`T-ARCH01-${id} ${label} → aucun signal`, () => {
    const a = analysis();
    mutate(a);
    const { signals } = enrich(baseFor(), a);
    /* READINESS-00 : les jugements de readiness Architecte n'ont aucune autorité. */
    assert.equal(signals.some((s) => String(s.arch_source_field || '').startsWith('evaluation.')), false,
      `aucun signal ne peut citer evaluation.* : ${JSON.stringify(signals)}`);
  });
}

/* ==========================================================================
 * EVIDENCE ET PROVENANCE
 * ======================================================================= */

test('T-ARCH01-24 traduction des énumérations d’evidence, valeur par valeur', () => {
  const a = analysis();
  a.comprehension.declarations = Object.keys(DECLARATION_STATUS_MAP).map((statut, i) => declaration(`CONTENU_${i}`, statut));
  const { contract, signals } = enrich(baseFor(), a);

  assert.deepEqual(contract.evidence.user_facts.map((f) => f.text), ['CONTENU_0']);
  assert.deepEqual(contract.evidence.material_facts.map((f) => f.text), ['CONTENU_1']);
  assert.deepEqual(contract.evidence.deductions.map((f) => f.text), ['CONTENU_2']);
  assert.deepEqual(contract.evidence.external_unverified.map((f) => f.text), ['CONTENU_3']);
  /* preference_confirmee appartient à intent.preferences, sous autorité OPRIE. */
  assert.equal(JSON.stringify(contract).includes('CONTENU_4'), false);
  assert.deepEqual(signals, []);
});

test('T-ARCH01-24b une valeur hors énumération n’est jamais acceptée en silence', () => {
  const a = analysis();
  a.comprehension.declarations = [declaration('X', 'statut_inconnu')];
  a.verification.controle_provenance = [{ affirmation: 'A', statut: 'statut_inconnu', justification: 'j' }];
  const { contract, signals } = enrich(baseFor(), a);

  /* CORRECTION-ADN-ARCH-01-01 : une valeur hors énumération viole le schéma 3.4.
     C'est un défaut technique de production d'analyse, pas une divergence de
     contrat — donc TECHNICAL_STOP, qui bloque et autorise un nouvel essai. */
  assert.equal(signals.filter((s) => s.signal === 'TECHNICAL_STOP' && /hors énumération/.test(s.detail)).length, 2);
  assert.deepEqual(contract.evidence.user_facts, []);
  assert.deepEqual(contract.evidence.provenance, []);
});

test('T-ARCH01-24c les statuts de provenance sont traduits par bijection', () => {
  const a = analysis();
  a.verification.controle_provenance = Object.keys(PROVENANCE_STATUS_MAP).map((statut, i) => ({ affirmation: `AFF_${i}`, statut, justification: 'j' }));
  const { contract } = enrich(baseFor(), a);

  assert.deepEqual(contract.evidence.provenance.map((p) => p.verification_status), Object.values(PROVENANCE_STATUS_MAP));
  for (const entry of contract.evidence.provenance) assert.equal(entry.source_type, 'arch_analysis');
});

test('T-ARCH01-25 / T-ARCH01-26 un fait externe VÉRIFIÉ ne peut jamais être fabriqué', () => {
  const a = analysis();
  a.comprehension.declarations = [declaration('EXTERNE', 'connaissance_externe_non_verifiee')];
  a.verification.controle_provenance = [{ affirmation: 'A', statut: 'connaissance_externe_non_verifiee', justification: 'j' }];
  const { contract } = enrich(baseFor(), a);

  assert.equal(contract.evidence.external_unverified[0].verification_status, 'unverified');
  assert.equal(contract.evidence.provenance[0].verification_status, 'external_unverified');
  assert.equal(JSON.stringify(contract).includes('"verified"'), false);
  /* Le schéma 3.4 ne contient AUCUN statut de vérification : c'est une limite de
     la source, pas du mapping. */
  assert.equal(Object.values(PROVENANCE_STATUS_MAP).includes('verified'), false);
});

test('T-ARCH01-24d evidence.extraction_performed ne bascule que pour la famille evidence', () => {
  const base = baseFor();
  assert.equal(base.evidence.extraction_performed, false);
  const { contract } = enrich(base, analysis());
  assert.equal(contract.evidence.extraction_performed, true, 'la phase evidence a réellement été exécutée');
  /* Aucun marqueur d'extraction n'apparaît ailleurs. */
  assert.equal('extraction_performed' in contract.assumptions, false);
  assert.equal('extraction_performed' in contract, false);
});

/* ==========================================================================
 * ASSUMPTIONS
 * ======================================================================= */

test('T-ARCH01-27 / T-ARCH01-28 / T-ARCH01-29 forbidden et explicit enrichis, allowed intact', () => {
  const base = baseFor();
  const a = analysis();
  a.strategie.hypotheses_interdites = ['INTERDITE_1', 'INTERDITE_2'];
  a.strategie.pilotage_incertitude.estimations_a_etiqueter = ['ESTIMATION_1'];

  const { contract } = enrich(base, a);
  assert.deepEqual(contract.assumptions.forbidden.map((x) => x.text), ['INTERDITE_1', 'INTERDITE_2']);
  assert.deepEqual(contract.assumptions.explicit.map((x) => x.text), ['ESTIMATION_1']);
  assert.equal(contract.assumptions.explicit[0].label, 'estimation', 'une estimation reste étiquetée comme telle');
  assert.deepEqual(contract.assumptions.allowed, base.assumptions.allowed, 'allowed reste sous autorité OPRIE');
  for (const item of [...contract.assumptions.forbidden, ...contract.assumptions.explicit]) {
    assert.equal(item.source, 'arch_analysis');
    assert.ok(item.origin_field);
  }
});

/* ==========================================================================
 * SCOPE — STRUCTUREL UNIQUEMENT
 * ======================================================================= */

test('T-ARCH01-30 le signal scope naît d’une structure, jamais d’un mot', () => {
  const withExclusion = analysis({
    compilation: { composants_retenus: [], composants_ecartes: [{ type: 'contrainte', titre: 'T', raison: 'hors périmètre' }] }
  });
  const { contract } = enrich(baseFor(), withExclusion);
  const scope = contract.semantic_lock_signals.signals.find((s) => s.id === 'scope');
  assert.ok(scope, 'un composant écarté produit le signal scope');
  assert.deepEqual(scope.source_ids, ['compilation.composants_ecartes[0]']);

  const withProhibition = analysis({
    compilation: {
      composants_retenus: [{ type: 'interdiction', titre: 'T', contenu: 'c', justification: 'j', fondements: [{ nature: 'deduction', usage: 'u', citation: null }] }],
      composants_ecartes: []
    }
  });
  const second = enrich(baseFor(), withProhibition).contract;
  assert.ok(second.semantic_lock_signals.signals.find((s) => s.id === 'scope'));
  assert.ok(second.semantic_lock_signals.signals.find((s) => s.id === 'forbidden'));
});

test('T-ARCH01-31 / T-ARCH01-45b aucun mot de domaine ne produit d’effet structurel', () => {
  const domains = ['médical', 'juridique', 'finance', 'RH', 'voyage', 'neuroatypie', 'immobilier'];
  const withWords = analysis({
    comprehension: {
      ...analysis().comprehension,
      intention_principale: domains.join(' '),
      declarations: domains.map((w) => declaration(w, 'declaration_utilisateur'))
    },
    compilation: {
      composants_retenus: domains.map((w) => ({ type: 'section', titre: w, contenu: w, justification: w, fondements: [{ nature: 'deduction', usage: 'u', citation: null }] })),
      composants_ecartes: []
    }
  });
  const { contract } = enrich(baseFor(), withWords);

  /* Aucun signal scope : aucun composant n'est écarté ni de type interdiction. */
  assert.equal(contract.semantic_lock_signals.signals.some((s) => s.id === 'scope'), false,
    'un vocabulaire de domaine ne déclenche aucun signal structurel');

  /* Le module lui-même ne contient aucun vocabulaire métier. */
  const source = fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8').toLowerCase();
  for (const word of ['médical', 'medical', 'juridique', 'finance', ' rh ', 'voyage', 'neuro', 'recrutement']) {
    assert.equal(source.includes(word), false, `terme métier interdit : ${word}`);
  }
  assert.equal(/\.match\(|fuzzy|levenshtein|embedding/.test(source), false, 'aucun appariement approximatif');
});

/* ==========================================================================
 * SORTIE, QUANTITÉS, CONTRÔLES
 * ======================================================================= */

test('T-ARCH01-32 / T-ARCH01-33 / T-ARCH01-34 la sortie est enrichie sans écraser une autorité supérieure', () => {
  const base = baseFor();
  const a = analysis();
  a.livrable = { nature: 'un livrable', format_technique: 'markdown', quantites: null, ton: 'formel', longueur_indicative: 'détaillée' };
  a.compilation.composants_retenus = [
    { type: 'section', titre: 'SECTION_A', contenu: 'c', justification: 'j', fondements: [{ nature: 'deduction', usage: 'u', citation: null }] },
    { type: 'section', titre: 'SECTION_B', contenu: 'c', justification: 'j', fondements: [{ nature: 'deduction', usage: 'u', citation: null }] }
  ];

  const { contract } = enrich(base, a);
  assert.equal(contract.output.format, 'markdown');
  assert.equal(contract.output.tone, 'formel');
  assert.equal(contract.output.length_policy, 'détaillée');
  assert.deepEqual(contract.output.structure, ['SECTION_A', 'SECTION_B']);
  assert.deepEqual(contract.output.sources, { format: 'arch_analysis', tone: 'arch_analysis', length_policy: 'arch_analysis', structure: 'arch_analysis' });

  /* intent.deliverable n'est JAMAIS touché : la nature du livrable est OPRIE. */
  assert.equal(contract.intent.deliverable, base.intent.deliverable);
});

test('T-ARCH01-33b une valeur déjà établie par une autorité supérieure n’est pas écrasée', () => {
  const base = baseFor();
  base.output.format = 'FORMAT_USER';
  base.output.tone = 'TON_USER';
  const a = analysis();
  a.livrable.format_technique = 'json';
  a.livrable.ton = 'autre';

  const { contract } = enrich(base, a);
  assert.equal(contract.output.format, 'FORMAT_USER', 'USER/DERIVED prime sur ARCH');
  assert.equal(contract.output.tone, 'TON_USER');
});

test('T-ARCH01-35 / T-ARCH01-36 quantités : précédence respectée, exact et bornes exclusifs', () => {
  const a = analysis();
  a.livrable.quantites = { min: 3, max: 7, unite: 'points' };
  const { contract } = enrich(baseFor(), a);

  assert.equal(contract.quantities.length, 1);
  assert.deepEqual(contract.quantities[0], { target: 'points', unit: 'points', exact: null, min: 3, max: 7, source: 'arch_analysis' });
  assert.equal(contract.quantities[0].exact, null, 'le schéma 3.4 ne porte pas d’exactitude : ARCH n’en fabrique pas');

  /* Une quantité d'autorité supérieure existe déjà : ARCH est écartée, avec signal. */
  const withUser = baseFor();
  withUser.quantities = [{ target: 'critères', unit: 'critères', exact: 7, min: null, max: null, source: 'user_explicit' }];
  const second = enrich(withUser, a);
  assert.deepEqual(second.contract.quantities, withUser.quantities, 'USER l’emporte');
  /* CORRECTION-ADN-ARCH-01-01 : la précédence est un résultat NORMAL. Depuis que
     tout signal bloque, en émettre un ici arrêterait un cas légitime. La trace
     est portée par `quantities[].source`, qui nomme l'autorité retenue. */
  assert.deepEqual(second.signals, [], 'une précédence respectée n’est pas un incident');
  assert.equal(second.contract.quantities[0].source, 'user_explicit');
});

test('T-ARCH01-CHECKS un critère qualitatif ne devient jamais déterministe', () => {
  const a = analysis();
  a.verification = { criteres_bloquants: ['BLOQUANT'], criteres_qualitatifs: ['QUALITATIF'], elements_non_verifiables: ['NON_VERIFIABLE'], controle_provenance: [] };
  const { contract } = enrich(baseFor(), a);

  const byRule = new Map(contract.checks.map((c) => [c.rule, c]));
  assert.equal(byRule.get('BLOQUANT').type, 'semantic');
  assert.equal(byRule.get('BLOQUANT').blocking, true);
  assert.equal(byRule.get('QUALITATIF').type, 'heuristic');
  assert.equal(byRule.get('QUALITATIF').blocking, false);
  assert.equal(byRule.get('NON_VERIFIABLE').type, 'not_verifiable');
  assert.equal(contract.checks.some((c) => c.type === 'deterministic'), false,
    'aucun critère textuel ne devient un contrôle déterministe');
});

test('T-ARCH01-OBLIG la promotion en obligation exige un check bloquant, et reste tracée', () => {
  const a = analysis();
  a.verification.criteres_bloquants = ['EXIGENCE'];
  a.verification.criteres_qualitatifs = ['SOUHAIT'];
  const { contract } = enrich(baseFor(), a);

  assert.equal(contract.obligations.length, 1, 'seul le critère bloquant est promu');
  assert.equal(contract.obligations[0].text, 'EXIGENCE');
  assert.equal(contract.obligations[0].mandatory, true);
  assert.equal(contract.obligations[0].promoted_from, 'verification.criteres_bloquants[0]');
  assert.equal(contract.obligations[0].check_ids.length, 1);

  /* Sans critère bloquant, aucune obligation n'est inventée. */
  assert.deepEqual(enrich(baseFor(), analysis()).contract.obligations, []);
});

/* ==========================================================================
 * SIGNAUX ET VERROUS
 * ======================================================================= */

test('T-ARCH01-37 / T-ARCH01-38 les signaux n’ont jamais valeur de sélection', () => {
  const a = analysis({ compilation: { composants_retenus: [], composants_ecartes: [{ type: 'contrainte', titre: 'T', raison: 'r' }] } });
  const { contract } = enrich(baseFor(), a);

  assert.ok(contract.semantic_lock_signals.signals.length > 0);
  assert.equal(contract.semantic_lock_signals.signals_produced, true);
  for (const s of contract.semantic_lock_signals.signals) {
    assert.equal('selected' in s, false);
    assert.equal(s.needed, true);
    assert.ok(s.reason.length > 0);
  }
  assert.deepEqual(contract.selected_locks.locks, [], 'LOCK_SELECTION_AUTHORITY = ADN');
  assert.deepEqual(contract.selected_locks.decisions, []);
});

test('T-ARCH01-39 / T-ARCH01-40 tout signal bloquant porte une preuve ; un signal inconnu est refusé', () => {
  const a = analysis();
  a.comprehension.intentions_secondaires = ['SEC_OPRIE', 'AUTRE'];
  a.comprehension.informations_manquantes = [{ information: 'I', bloquant: true, justification: 'j' }];
  const { signals } = enrich(baseFor(), a);

  assert.ok(signals.length > 0);
  for (const s of signals) {
    assert.ok(ARCH_SIGNALS.includes(s.signal));
    assert.ok(s.canonical_field || s.arch_source_field, 'BLOCKING_SIGNAL_HAS_STRUCTURAL_PROOF');
  }
  assert.equal(validateArchSignals(signals).ok, true);

  /* Un cinquième type ou un signal sans preuve est refusé. */
  assert.equal(validateArchSignals([{ signal: 'AUTRE_SIGNAL', canonical_field: 'x', detail: '' }]).ok, false);
  assert.equal(validateArchSignals([{ signal: 'CONTRACT_INCONSISTENT', canonical_field: null, arch_source_field: null, detail: '' }]).ok, false);
  assert.equal(validateArchSignals([{ signal: 'CONTRACT_INCONSISTENT', canonical_field: 'x', detail: '', question: 'Q' }]).ok, false);
});

/* ==========================================================================
 * READINESS ET QUESTIONS
 * ======================================================================= */

test('T-ARCH01-42 / T-ARCH01-43 ARCH_CAN_CHANGE_READINESS = NO, sur les quatre états', () => {
  for (const state of OPRIE_STATES) {
    const base = baseFor(state);
    const hostile = analysis({
      evaluation: { ...analysis().evaluation, action_recommandee: 'arreter', livrable_complet_possible: false, questions_a_poser: ['Q'] }
    });
    const { contract } = enrich(base, hostile);

    assert.equal(contract.executability.oprie_state, base.executability.oprie_state, state);
    assert.equal(contract.executability.state, base.executability.state, state);
    assert.equal(contract.executability.evaluated, base.executability.evaluated, state);
    assert.deepEqual(contract.executability, base.executability, `${state} : executability entièrement inchangée`);
  }
});

test('T-ARCH01-43b ARCH_CAN_ASK_POST_OPRIE_QUESTION = NO', () => {
  const a = analysis();
  a.evaluation.action_recommandee = 'questionner';
  a.evaluation.questions_a_poser = ['QUESTION_INTERDITE'];
  const { contract, signals } = enrich(baseFor(), a);

  const serialized = JSON.stringify({ contract, signals });
  assert.equal(serialized.includes('QUESTION_INTERDITE'), false, 'aucune question ne transite');
  assert.equal(serialized.includes('next_question'), false);
  for (const s of signals) assert.equal('question' in s, false);
});

test('T-ARCH01-44 la garde core anti-promotion reste opérante après enrichissement', async () => {
  const { buildExecutionEnvelope } = await import('../core/adn/engine-adapters.js');
  const base = baseFor('blocked');
  const { contract } = enrich(base, analysis());

  assert.throws(
    () => buildExecutionEnvelope({ canonical_base: contract, provider_result: { source: 'none', decision: { etat_demande: 'exploitable', route: 'architecte', confiance: 'haute', raison_interne: 'x', question: null } } }),
    /Garde readiness/,
    'un contrat enrichi non exploitable ne peut toujours pas être promu'
  );
  const safe = buildExecutionEnvelope({ canonical_base: contract });
  assert.notEqual(safe.state.executability.state, 'exploitable');
});

/* ==========================================================================
 * ADVERSARIAL COMPLET
 * ======================================================================= */

test('T-ARCH01-ADV analyse hostile totale : 0 mutation OPRIE, signaux structurés', () => {
  const base = baseFor();
  const snapshot = JSON.stringify(base);

  const hostile = analysis({
    comprehension: {
      intention_principale: 'OBJECTIF_PIRATE',
      intentions_secondaires: ['SEC_OPRIE', 'SEC_PIRATE'],
      declarations: [declaration('FAIT_PIRATE', 'declaration_utilisateur')],
      contraintes: [declaration('CONTRAINTE_PIRATE', 'declaration_utilisateur')],
      ambiguites: ['AMBIGUITE_PIRATE'],
      informations_manquantes: [{ information: 'BLOQUANT_PIRATE', bloquant: true, justification: 'j' }]
    },
    evaluation: { ...analysis().evaluation, action_recommandee: 'questionner', livrable_complet_possible: false, questions_a_poser: ['QUESTION_PIRATE'] },
    strategie: {
      ...analysis().strategie,
      hypotheses_autorisees: ['ASS_OPRIE', 'ASS_PIRATE'],
      pilotage_incertitude: { decisions_autonomes: ['DEL_OPRIE', 'DEL_PIRATE'], estimations_a_etiqueter: [], inconnues_non_devineables: ['UNK_OPRIE', 'UNK_PIRATE'] }
    },
    livrable: { nature: 'LIVRABLE_PIRATE', format_technique: 'json', quantites: null, ton: 't', longueur_indicative: 'l' }
  });

  const { contract, signals } = enrich(base, hostile);

  assert.equal(JSON.stringify(base), snapshot, 'la base d’entrée est intacte');
  const verdict = validateArchCanonicalEnrichment(base, contract, hostile);
  assert.deepEqual(verdict.mutated_oprie_fields, [], 'OPRIE_FIELDS_MUTATED = 0');
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));

  /* Aucune valeur pirate n'atteint un champ OPRIE. */
  assert.equal(JSON.stringify(contract.intent).includes('PIRATE'), false);
  assert.equal(JSON.stringify(contract.executability).includes('PIRATE'), false);
  assert.equal(JSON.stringify(contract.assumptions.allowed).includes('PIRATE'), false);
  assert.equal(JSON.stringify(contract).includes('QUESTION_PIRATE'), false);

  /* Mais les divergences sont toutes signalées, avec preuve. */
  const fields = signals.map((s) => s.canonical_field);
  for (const expected of ['intent.secondary_objectives', 'intent.delegated_decisions', 'assumptions.allowed', 'executability.substitutable_missing', 'executability.remaining_unknowns']) {
    assert.ok(fields.includes(expected), `divergence non signalée : ${expected}`);
  }
  assert.ok(signals.some((s) => s.signal === 'EXECUTION_UNSAFE'));
  assert.equal(validateArchSignals(signals).ok, true);
});

/* ==========================================================================
 * PROPRIÉTÉS DE L'ENRICHISSEUR
 * ======================================================================= */

test('T-ARCH01-41 déterminisme : même entrée → même sortie', () => {
  const base = baseFor();
  const a = analysis({ compilation: { composants_retenus: [], composants_ecartes: [{ type: 'contrainte', titre: 'T', raison: 'r' }] } });
  assert.equal(JSON.stringify(enrich(base, a)), JSON.stringify(enrich(base, a)));
});

test('T-ARCH01-42b ni réseau, ni LLM, ni DOM, ni fournisseur, ni branchement de mode', () => {
  const source = fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'document.', 'window.', 'localStorage', 'Math.random', 'Date.now', 'https://', 'anthropic', 'openai', 'groq']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['rapide', 'architecte ===', 'requestedMode']) {
    assert.equal(code.toLowerCase().includes(forbidden.toLowerCase()), false, `branchement de mode : ${forbidden}`);
  }
});

test('T-ARCH01-TECH une analyse illisible produit TECHNICAL_STOP et laisse le contrat intact', () => {
  const base = baseFor();
  for (const bad of [null, undefined, 'texte', 42, [], {}, { comprehension: {} }]) {
    const { contract, signals } = enrichCanonicalContractFromArchAnalysis(base, bad);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].signal, 'TECHNICAL_STOP');
    assert.equal(JSON.stringify(contract), JSON.stringify(base), 'le contrat sort inchangé');
  }
  assert.throws(() => enrichCanonicalContractFromArchAnalysis(null, analysis()), /Canonical Base Contract requis/);
});

test('T-ARCH01-AUDIT la vue d’audit ne contient aucun contenu utilisateur', () => {
  const base = baseFor();
  const { contract, signals } = enrich(base, analysis());
  const view = createArchEnrichmentAuditView(base, contract, signals);

  assert.equal(view.readiness_unchanged, true);
  assert.deepEqual(view.mutated_oprie_fields, []);
  assert.deepEqual(Object.keys(view.signal_counts).sort(), [...ARCH_SIGNALS].sort());
  assert.equal(JSON.stringify(view).includes(ORIGINAL), false);
  assert.equal(JSON.stringify(view).includes('OBJ_OPRIE'), false);
});

/* ==========================================================================
 * INTÉGRATION ET SOURCE UNIQUE
 * ======================================================================= */

test('T-ARCH01-INT le chemin Architecte enrichit après la validation post-OPRIE', () => {
  const builder = HTML.slice(HTML.indexOf('function adnEnrichCanonicalWithArch('), HTML.indexOf('/* READINESS-00 — VALIDATION POST-OPRIE.'));
  assert.match(builder, /enrichCanonicalContractFromArchAnalysis/);
  assert.match(builder, /validateArchCanonicalEnrichment/);
  assert.match(builder, /oprieState\.enrichedContract=result\.contract/);

  /* Les deux chemins Architecte enrichissent ; l'autorité de blocage reste au
     validateur post-OPRIE, conformément à READINESS-00. */
  const calls = HTML.match(/adnEnrichCanonicalWithArch\(/g) || [];
  assert.equal(calls.length, 3, 'une définition + deux appels');

  for (const [name, slice] of [
    ['API', HTML.slice(HTML.indexOf('async function beginApiAnalysis'), HTML.indexOf('function compositeDemand'))],
    ['import', HTML.slice(HTML.indexOf('function useAnalysis'), HTML.indexOf('function showQuestion'))]
  ]) {
    assert.ok(slice.indexOf('adnValidatePostOprie') < slice.indexOf('adnEnrichCanonicalWithArch'),
      `${name} : la validation post-OPRIE précède l'enrichissement`);
  }
});

test('T-ARCH01-45 ARCH_ACTIVE_SEMANTIC_SOURCE_COUNT = 1 sur le chemin enrichi', () => {
  const producers = fs.readdirSync(path.join(root, 'core/adn'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /function enrichCanonicalContractFromArchAnalysis/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(producers, ['arch-canonical-enrichment.js'], 'un seul enrichisseur');

  const builder = HTML.slice(HTML.indexOf('function adnEnrichCanonicalWithArch('), HTML.indexOf('/* READINESS-00 — VALIDATION POST-OPRIE.'));
  assert.match(builder, /const base=oprieState\.canonicalContract/, 'la source est le contrat canonique, jamais archAnalyse seule');
});

test('T-ARCH01-37b l’ancienne readiness Architecte n’a plus aucun site d’appel', () => {
  /* READINESS-00 a retiré l'autorité ; ADN-ARCH-01 vérifie qu'aucun nouveau
     consommateur ne l'a rebranchée. La fonction subsiste, inerte : son retrait
     appartient à un lot de nettoyage, pas à celui-ci. */
  const occurrences = HTML.match(/adnAssessArchitecteReadiness/g) || [];
  assert.equal(occurrences.length, 1, 'une définition, zéro appel');
  assert.match(HTML, /function adnAssessArchitecteReadiness\(/);
});

test('T-ARCH01-36 adnCompactContractForArchitecte reste une projection en lecture seule', () => {
  const start = HTML.indexOf('function adnCompactContractForArchitecte()');
  const body = HTML.slice(start, HTML.indexOf('function adnAssessArchitecteReadiness'));
  assert.match(body, /const env=adpState\.lastEnvelope/);
  /* Aucune écriture : ni affectation dans un état partagé, ni readiness dérivée. */
  assert.equal(/oprieState\.|adpState\.[a-zA-Z]+\s*=/.test(body), false, 'aucune écriture d’état');
  assert.equal(body.includes('enrichCanonicalContractFromArchAnalysis'), false);
  assert.equal(body.includes('archAnalyse'), false);
});

test('T-ARCH01-RUNTIME l’enrichissement fonctionne dans le runtime navigateur généré', () => {
  const bundle = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(bundle, context);
  const runtime = context.window.__ATELIER_ADN_RUNTIME__;

  assert.equal(typeof runtime.enrichCanonicalContractFromArchAnalysis, 'function');
  assert.equal(typeof runtime.validateArchCanonicalEnrichment, 'function');

  const base = runtime.mapOprieToCanonicalContract(turn(), { request_id: 'r', original_request: ORIGINAL });
  const a = analysis();
  a.strategie.hypotheses_interdites = ['INTERDITE_RUNTIME'];
  const result = runtime.enrichCanonicalContractFromArchAnalysis(base, a);

  assert.deepEqual(result.contract.assumptions.forbidden.map((x) => x.text), ['INTERDITE_RUNTIME']);
  /* Objets issus d'un autre realm : la comparaison passe par la sérialisation. */
  assert.equal(JSON.stringify(result.contract.assumptions.allowed), JSON.stringify(base.assumptions.allowed));
  const verdict = runtime.validateArchCanonicalEnrichment(base, result.contract, a);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.problems));
  assert.equal(verdict.mutated_oprie_fields.length, 0);
});

test('T-ARCH01-RAPIDE le chemin Rapide reste intact', () => {
  const rapide = HTML.slice(HTML.indexOf('function adpRunRapide('), HTML.indexOf('function v11StartAtelier('));
  assert.equal(rapide.includes('adnEnrichCanonicalWithArch'), false);
  assert.equal(rapide.includes('archAnalyse'), false);
  assert.match(rapide, /adnRefineRapidEnvelope\(r,orientation,materiau\)/);
});
