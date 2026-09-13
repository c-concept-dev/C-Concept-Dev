/* ADN-QG-02A — OUTPUT COMPLIANCE GATE : MOTEUR PUR
 * ============================================================================
 *
 * Ce que ces tests éprouvent n'est pas d'abord une liste de contrôles : c'est
 * une DISCIPLINE. Un contrôle de sortie qui déclare « conforme » ce qu'il n'a
 * pas su vérifier est pire que pas de contrôle du tout, parce qu'il fabrique
 * une confiance sans preuve. La moitié de ces cas existent donc pour prouver
 * que le moteur REFUSE de conclure quand il ne peut pas savoir.
 *
 * Deux d'entre eux sont écrits contre des dérives réellement observées dans le
 * contrôle historique du produit, et qui ne doivent pas être reconduites :
 *   — T-QG02A-41 : un verdict « conforme » alors que des contrôles restaient
 *     non vérifiables ;
 *   — T-QG02A-42 : un contrôle réputé exécuté parce que le mot « quantité »
 *     figurait dans le libellé d'une règle.
 *
 * Le moteur n'est branché nulle part : ce sous-lot crée l'outil, pas son usage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECK_STATUSES,
  MEASURABLE_UNITS,
  OUTPUT_COMPLIANCE_GATE_PRODUCTION_ACTIVE,
  OUTPUT_COMPLIANCE_GATE_VERSION,
  OUTPUT_GATE_STATUSES,
  OUTPUT_TRACE_FORBIDDEN_FIELDS,
  OUTPUT_VIOLATION_CODES,
  VERIFIABILITY_LEVELS,
  auditOutputTrace,
  countStructuralItems,
  detectStructuralFormat,
  executeOutputChecks,
  measureOutput,
  normalizeOutput,
  validateOutputAgainstCanonicalContract
} from '../core/adn/output-compliance-gate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(root, 'core/adn/output-compliance-gate.js'), 'utf8');
/** Un mot cité dans une explication n'est pas du code : les commentaires sortent. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/** Vocabulaire de formats INJECTÉ : le noyau n'en écrit aucun. */
const VOCAB = Object.freeze([
  { id: 'json', structural_kind: 'json' },
  { id: 'tableau', structural_kind: 'table' },
  { id: 'liste', structural_kind: 'numbered_list' },
  { id: 'courriel', structural_kind: null }
]);
const CONTEXTE = Object.freeze({ format_vocabulary: VOCAB });

/** Contrat canonique minimal, à la forme réelle produite par le mapper. */
function contrat(over = {}) {
  return {
    version: '2.0', request_id: 'qg02a', original_request: 'Demande de contrôle.',
    intent: { objective: 'Objectif.', deliverable: 'Livrable.', recipient: null },
    evidence: { provenance: [], material_facts: [], user_facts: [] },
    executability: { oprie_state: 'operational_request_ready', state: 'exploitable' },
    assumptions: { allowed: [], forbidden: [], explicit: [] },
    obligations: [], quantities: [],
    output: { format: null, structure: [], opening: null, closing: null, length_policy: null, tone: null },
    checks: [],
    semantic_lock_signals: { signals: [], signals_produced: true },
    selected_locks: { locks: [], decisions: [] },
    ...over
  };
}

const valider = (canonical_contract, output, checks, execution_context = CONTEXTE) =>
  validateOutputAgainstCanonicalContract({ canonical_contract, output, checks, execution_context });

const codes = (r) => r.violations.map((v) => v.code);
const parId = (r, id) => r.verifications.find((v) => v.id === id) || null;

const CHECK_SEMANTIQUE = Object.freeze({ id: 'sem-1', type: 'semantic', blocking: true, rule: 'La recommandation doit être pertinente.' });
const CHECK_HEURISTIQUE = Object.freeze({ id: 'heur-1', type: 'heuristic', blocking: false, rule: 'Le style doit rester sobre.' });

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

/* Corpus balayé par les tests d'auto-pass : il couvre toutes les familles. */
function corpus() {
  const jsonTrois = { text: '[1,2,3]', items: [1, 2, 3] };
  return [
    [contrat(), 'Un texte.', []],
    [contrat({ quantities: [{ exact: 3, min: null, max: null }] }), jsonTrois, []],
    [contrat({ output: { format: 'json' } }), jsonTrois, []],
    [contrat({ output: { format: 'courriel' } }), 'Bonjour.', []],
    [contrat(), 'Un texte.', [CHECK_SEMANTIQUE, CHECK_HEURISTIQUE]],
    [contrat(), 'Un texte.', [{ id: 'nv-1', type: 'not_verifiable', rule: 'Impression générale.' }]],
    [contrat(), 'Un texte.', [{ id: 'inc-1', type: 'inconnu', blocking: true, rule: 'Règle exotique.' }]],
    [contrat(), 'Un texte.', [{ id: 'det-1', type: 'deterministic', blocking: true, rule: 'La quantité doit être bonne.' }]],
    [contrat({ evidence: { provenance: [{ statement_id: 'p1', claim: 'A', verification_status: 'unverified' }] } }), 'Un texte.', []],
    [contrat({ obligations: [{ id: 'o1', text: 'Obligation sans contrôle.', mandatory: true, check_ids: [] }] }), 'Un texte.', []],
    [contrat({ semantic_lock_signals: { signals: [{ id: 'scope', needed: true, source_ids: ['a'] }] } }), 'Un texte.', []]
  ];
}

/* ======================================================================== *
 * §38 — PROPRIÉTÉS STRUCTURELLES DU MOTEUR
 * ======================================================================== */

test('T-QG02A-01 le module expose un contrat stable et n’est branché nulle part', () => {
  assert.equal(OUTPUT_COMPLIANCE_GATE_VERSION, '1.0');
  assert.equal(OUTPUT_COMPLIANCE_GATE_PRODUCTION_ACTIVE, false, 'QG-02A crée le moteur, pas son intégration');
  assert.deepEqual([...OUTPUT_GATE_STATUSES], ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL']);
  assert.equal(OUTPUT_VIOLATION_CODES.length, 9);
  assert.deepEqual([...VERIFIABILITY_LEVELS], ['DETERMINISTIC', 'STRUCTURAL', 'SEMANTIC', 'HEURISTIC', 'NOT_VERIFIABLE']);
  assert.deepEqual([...CHECK_STATUSES], ['PASS', 'FAIL', 'WARNING', 'NOT_VERIFIABLE', 'DEFERRED', 'NOT_APPLICABLE']);
  for (const gele of [OUTPUT_GATE_STATUSES, OUTPUT_VIOLATION_CODES, VERIFIABILITY_LEVELS, CHECK_STATUSES, MEASURABLE_UNITS, OUTPUT_TRACE_FORBIDDEN_FIELDS]) {
    assert.equal(Object.isFrozen(gele), true);
  }
  /* La taxonomie de sortie ne partage aucun code de projection avec QG-00/01. */
  for (const projection of ['MISSING_REQUIRED_PROJECTION', 'LOCK_MISMATCH', 'UNSUPPORTED_INSTRUCTION']) {
    assert.equal(OUTPUT_VIOLATION_CODES.includes(projection), false, projection);
  }
});

test('T-QG02A-02 le moteur est déterministe : 200 exécutions, un seul résultat', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }], output: { format: 'json' } });
  const sortie = { text: '[1,2,3]', items: [1, 2, 3] };
  const reference = JSON.stringify(valider(c, sortie, [CHECK_SEMANTIQUE]));
  for (let i = 0; i < 200; i += 1) {
    assert.equal(JSON.stringify(valider(c, sortie, [CHECK_SEMANTIQUE])), reference, `exécution ${i} divergente`);
  }
});

test('T-QG02A-03 aucun accès réseau', () => {
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'WebSocket', 'node:http', 'axios', 'request(']) {
    assert.equal(CODE.includes(interdit), false, `réseau interdit : ${interdit}`);
  }
});

test('T-QG02A-04 aucun juge LLM, aucun fournisseur, aucun fuzzy', () => {
  for (const interdit of ['anthropic', 'openai', 'groq', 'apiKey', 'api_key', 'appelFournisseur', 'appelApi',
                          'embedding', 'cosine', 'similarity', 'levenshtein', 'editDistance', 'fuzzy']) {
    assert.equal(CODE.toLowerCase().includes(interdit.toLowerCase()), false, `autorité interdite : ${interdit}`);
  }
  /* Aucun score ni seuil ne décide d'un statut : la dominance est ordinale. */
  assert.equal(/\bscore\s*[:=][^'"]/.test(CODE), false, 'aucun score calculé');
  assert.equal(/\bthreshold\b|\bSEUIL\b|coverage_ratio/.test(CODE), false, 'aucun seuil arbitraire');
});

test('T-QG02A-05 aucun accès au DOM ni au stockage', () => {
  for (const interdit of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'querySelector']) {
    assert.equal(new RegExp(`\\b${interdit}\\b`).test(CODE), false, `DOM interdit : ${interdit}`);
  }
});

test('T-QG02A-06 le contrat canonique n’est jamais muté, même gelé en profondeur', () => {
  const c = deepFreeze(contrat({ quantities: [{ exact: 2, min: null, max: null }], output: { format: 'json' } }));
  const avant = JSON.stringify(c);
  const r = valider(c, { text: '[1,2]', items: [1, 2] }, [CHECK_SEMANTIQUE]);
  assert.equal(JSON.stringify(c), avant, 'OUTPUT_QG_CANONICAL_MUTATIONS = 0');
  assert.ok(OUTPUT_GATE_STATUSES.includes(r.status));
});

test('T-QG02A-07 la sortie n’est jamais mutée ni réécrite', () => {
  const sortie = deepFreeze({ text: 'Contenu inchangé.', items: ['a', 'b'] });
  const avant = JSON.stringify(sortie);
  const r = valider(contrat(), sortie, []);
  assert.equal(JSON.stringify(sortie), avant, 'OUTPUT_QG_OUTPUT_REWRITES = 0');
  assert.equal(Object.prototype.hasOwnProperty.call(r, 'output'), false, 'le moteur ne renvoie aucune sortie');
  assert.equal(JSON.stringify(r).includes('Contenu inchangé.'), false, 'le contenu utilisateur ne ressort pas du gate');
});

test('T-QG02A-08 la liste de contrôles n’est jamais mutée', () => {
  const checks = deepFreeze([{ ...CHECK_SEMANTIQUE }, { ...CHECK_HEURISTIQUE }]);
  const avant = JSON.stringify(checks);
  valider(contrat(), 'Un texte.', checks);
  assert.equal(JSON.stringify(checks), avant);
});

test('T-QG02A-09 le contexte d’exécution n’est jamais muté', () => {
  const contexte = deepFreeze({ format_vocabulary: VOCAB.map((f) => ({ ...f })) });
  const avant = JSON.stringify(contexte);
  valider(contrat({ output: { format: 'json' } }), '[1]', [], contexte);
  assert.equal(JSON.stringify(contexte), avant);
});

/* ======================================================================== *
 * FERMETURE TECHNIQUE
 * ======================================================================== */

test('T-QG02A-10 un contrat absent ferme le gate', () => {
  for (const mauvais of [null, undefined, 'contrat', 42, []]) {
    const r = validateOutputAgainstCanonicalContract({ canonical_contract: mauvais, output: 'Un texte.' });
    assert.equal(r.status, 'FAIL');
    assert.equal(r.technical_failure, true, 'fermer n’est pas dire que la réponse est fausse');
    assert.ok(r.violations.every((v) => v.code === 'TECHNICAL_VALIDATION_FAILURE'));
    assert.equal(r.trace.fail_closed, true);
  }
});

test('T-QG02A-11 une sortie absente ou de forme inattendue ferme le gate', () => {
  for (const mauvais of [null, undefined, 42, [], {}, { items: 'trois' }]) {
    const r = validateOutputAgainstCanonicalContract({ canonical_contract: contrat(), output: mauvais });
    assert.equal(r.status, 'FAIL');
    assert.equal(r.technical_failure, true);
    assert.equal(r.coverage.passed, 0);
  }
  assert.equal(normalizeOutput({ text: 'ok' }).structured, true);
  assert.equal(normalizeOutput('ok').structured, false);
});

test('T-QG02A-12 une liste de contrôles malformée ferme le gate', () => {
  for (const mauvais of ['checks', 42, { id: 'x' }]) {
    const r = validateOutputAgainstCanonicalContract({ canonical_contract: contrat(), output: 'Un texte.', checks: mauvais });
    assert.equal(r.status, 'FAIL');
    assert.equal(r.technical_failure, true);
  }
  /* Une ENTRÉE malformée dans une liste valide n’est ni exécutée ni ignorée. */
  const r = valider(contrat(), 'Un texte.', [null]);
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(r.verifications.filter((v) => v.status === 'NOT_VERIFIABLE').length, 1);
  const contexte = validateOutputAgainstCanonicalContract({ canonical_contract: contrat(), output: 'x', execution_context: 'contexte' });
  assert.equal(contexte.technical_failure, true);
});

test('T-QG02A-13 un contrôle requis de type inconnu ne devient jamais un succès', () => {
  const r = valider(contrat(), 'Un texte.', [{ id: 'inc-1', type: 'type_jamais_vu', blocking: true, rule: 'Règle exotique.' }]);
  const v = parId(r, 'inc-1');
  assert.equal(v.verifiability, 'NOT_VERIFIABLE');
  assert.equal(v.status, 'NOT_VERIFIABLE');
  assert.equal(v.required, true);
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
  /* Optionnel : constaté, mais sans effet sur le verdict. */
  const opt = valider(contrat(), 'Un texte.', [{ id: 'inc-2', type: 'type_jamais_vu', blocking: false, rule: 'Règle exotique.' }]);
  assert.equal(parId(opt, 'inc-2').status, 'NOT_VERIFIABLE');
  assert.equal(opt.status, 'PASS');
});

/* ======================================================================== *
 * §4 / §14 — LES QUATRE STATUTS ET LEUR DOMINANCE
 * ======================================================================== */

test('T-QG02A-14 toutes les obligations vérifiables et tenues → PASS', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }], output: { format: 'json' } });
  const r = valider(c, { text: '[1,2,3]', items: [1, 2, 3] }, []);
  assert.equal(r.status, 'PASS', JSON.stringify(codes(r)));
  assert.equal(r.violations.length, 0);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.coverage.required_unverifiable, 0);
  assert.ok(r.coverage.passed >= 3, 'non-vacuité, quantité et format sont réellement exécutés');
});

test('T-QG02A-15 des avertissements seuls → PASS_WITH_WARNINGS', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }], output: { format: 'json' } });
  const r = valider(c, { text: '[1,2,3]', items: [1, 2, 3] }, [CHECK_HEURISTIQUE]);
  assert.equal(r.status, 'PASS_WITH_WARNINGS');
  assert.equal(r.violations.length, 0);
  assert.equal(r.warnings.length, 1);
  assert.equal(parId(r, 'heur-1').status, 'WARNING');
});

test('T-QG02A-16 une obligation requise non vérifiable → INCOMPLETE_VERIFICATION', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }], output: { format: 'json' } });
  const r = valider(c, { text: '[1,2,3]', items: [1, 2, 3] }, [CHECK_SEMANTIQUE]);
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION', 'REQUIRED_NOT_VERIFIABLE_CAN_PASS = NO');
  assert.equal(r.violations.length, 0, 'aucune violation : rien n’a échoué, quelque chose n’a pas pu être su');
  assert.equal(parId(r, 'sem-1').status, 'DEFERRED');
  assert.equal(r.coverage.required_unverifiable, 1);
});

test('T-QG02A-17 un contrôle déterministe en échec → FAIL', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }] });
  const r = valider(c, { text: '[1,2]', items: [1, 2] }, []);
  assert.equal(r.status, 'FAIL');
  assert.ok(codes(r).includes('OUTPUT_QUANTITY_MISMATCH'));
});

test('T-QG02A-18 FAIL domine INCOMPLETE_VERIFICATION', () => {
  const c = contrat({ quantities: [{ exact: 3, min: null, max: null }] });
  const r = valider(c, { text: '[1,2]', items: [1, 2] }, [CHECK_SEMANTIQUE]);
  assert.equal(r.status, 'FAIL', 'FAIL_DOMINATES_INCOMPLETE = YES');
  assert.equal(r.coverage.required_unverifiable, 1, 'le non-vérifiable subsiste, il ne disparaît pas');
  assert.ok(codes(r).includes('OUTPUT_QUANTITY_MISMATCH'));
});

test('T-QG02A-19 une sortie requise mais vide → FAIL', () => {
  for (const vide of ['', '   \n\t ', { text: '   ' }, { text: '', items: [] }]) {
    const r = valider(contrat(), vide, []);
    assert.equal(r.status, 'FAIL', JSON.stringify(vide));
    assert.ok(codes(r).includes('MISSING_REQUIRED_OUTPUT'));
  }
});

/* ======================================================================== *
 * §22 — QUANTITÉ
 * ======================================================================== */

test('T-QG02A-20 une quantité exacte respectée passe', () => {
  const c = contrat({ quantities: [{ exact: 7, min: null, max: null }] });
  const r = valider(c, { text: 'sept', items: new Array(7).fill('x') }, []);
  assert.equal(r.status, 'PASS');
  assert.equal(parId(r, 'output-quantity').status, 'PASS');
  /* Et le comptage tient aussi sur du texte purement structurel. */
  const liste = valider(c, Array.from({ length: 7 }, (_, i) => `${i + 1}. élément`).join('\n'), []);
  assert.equal(liste.status, 'PASS');
  assert.equal(countStructuralItems(normalizeOutput('- a\n- b')).count, 2);
});

test('T-QG02A-21 une quantité insuffisante échoue', () => {
  const c = contrat({ quantities: [{ exact: 7, min: null, max: null }] });
  const r = valider(c, { text: 'six', items: new Array(6).fill('x') }, []);
  assert.equal(r.status, 'FAIL');
  assert.ok(codes(r).includes('OUTPUT_QUANTITY_MISMATCH'));
  assert.equal(parId(r, 'output-quantity').observed, '6');
});

test('T-QG02A-22 une quantité excédentaire échoue', () => {
  const c = contrat({ quantities: [{ exact: 7, min: null, max: null }] });
  const r = valider(c, { text: 'huit', items: new Array(8).fill('x') }, []);
  assert.equal(r.status, 'FAIL');
  assert.ok(codes(r).includes('OUTPUT_QUANTITY_MISMATCH'));
  /* Une sortie sans marqueur dénombrable n’est pas comptée à zéro : elle est
     déclarée non comptable, ce qui est un fait et non un échec. */
  const opaque = valider(c, 'Un paragraphe sans aucune structure.', []);
  assert.equal(parId(opaque, 'output-quantity').status, 'NOT_VERIFIABLE');
  assert.equal(opaque.status, 'INCOMPLETE_VERIFICATION');
});

/* ======================================================================== *
 * §23–§26 — FORMAT ET LONGUEUR
 * ======================================================================== */

test('T-QG02A-23 un JSON valide satisfait une exigence de format JSON', () => {
  const r = valider(contrat({ output: { format: 'json' } }), '{"a":1}', []);
  assert.equal(r.status, 'PASS');
  assert.equal(parId(r, 'output-format').status, 'PASS');
  assert.ok(detectStructuralFormat(normalizeOutput('{"a":1}')).includes('json'));
});

test('T-QG02A-24 un JSON invalide échoue, sans jugement sur le contenu', () => {
  const r = valider(contrat({ output: { format: 'json' } }), 'Ceci n’est pas du JSON.', []);
  assert.equal(r.status, 'FAIL');
  assert.ok(codes(r).includes('OUTPUT_FORMAT_MISMATCH'));
  /* Un JSON valide mais pauvre reste conforme : la qualité n’est pas jugée ici. */
  const pauvre = valider(contrat({ output: { format: 'json' } }), '{}', []);
  assert.equal(pauvre.status, 'PASS');
});

test('T-QG02A-25 une table markdown satisfait une exigence de table', () => {
  const table = '| a | b |\n|---|---|\n| 1 | 2 |';
  assert.equal(valider(contrat({ output: { format: 'tableau' } }), table, []).status, 'PASS');
  assert.equal(valider(contrat({ output: { format: 'tableau' } }), 'Pas de table ici.', []).status, 'FAIL');
});

test('T-QG02A-26 une liste numérotée satisfait une exigence de liste numérotée', () => {
  assert.equal(valider(contrat({ output: { format: 'liste' } }), '1. un\n2. deux', []).status, 'PASS');
  assert.equal(valider(contrat({ output: { format: 'liste' } }), 'Un paragraphe.', []).status, 'FAIL');
  /* Un format sans forme structurelle déclarée n’est pas réputé tenu. */
  const opaque = valider(contrat({ output: { format: 'courriel' } }), 'Bonjour,', []);
  assert.equal(parId(opaque, 'output-format').status, 'NOT_VERIFIABLE');
  assert.equal(opaque.status, 'INCOMPLETE_VERIFICATION');
});

test('T-QG02A-26b la longueur n’oblige que si une mesure est opposable', () => {
  /* Politique qualitative : aucune obligation créée. */
  const qualitatif = valider(contrat({ output: { length_policy: 'concise' } }), 'Trois mots ici.', []);
  assert.equal(parId(qualitatif, 'output-length').status, 'NOT_APPLICABLE');
  assert.equal(qualitatif.status, 'PASS');
  /* Politique mesurable : obligation réelle, et mesurée. */
  const mesurable = { output: { length_policy: 'au plus 3 mots', length_bounds: { unit: 'words', max: 3 } } };
  assert.equal(valider(contrat(mesurable), 'Trois mots ici', []).status, 'PASS');
  assert.equal(valider(contrat(mesurable), 'Quatre mots bien comptés', []).status, 'FAIL');
  assert.equal(measureOutput(normalizeOutput('a b c'), 'words'), 3);
  assert.equal(measureOutput(normalizeOutput('a b c'), 'unite_inconnue'), null);
});

/* ======================================================================== *
 * §27–§28 — PROVENANCE : PRÉSENCE ≠ VÉRITÉ
 * ======================================================================== */

const PROVENANCE_CONTRAT = Object.freeze({
  evidence: {
    provenance: [
      { statement_id: 'p1', claim: 'A', verification_status: 'supported' },
      { statement_id: 'p2', claim: 'B', verification_status: 'external_unverified' }
    ]
  }
});

test('T-QG02A-27 une provenance structurellement présente est vérifiée comme telle', () => {
  const sortie = { text: 'Deux affirmations tracées.', provenance: [
    { statement_id: 'p1', verification_status: 'supported' },
    { statement_id: 'p2', verification_status: 'external_unverified' }
  ] };
  const r = valider(contrat(PROVENANCE_CONTRAT), sortie, []);
  assert.equal(parId(r, 'output-provenance-present').status, 'PASS');
  assert.equal(parId(r, 'output-provenance-present').verifiability, 'STRUCTURAL');
  assert.equal(r.status, 'PASS');
});

test('T-QG02A-28 une provenance exigée mais absente échoue', () => {
  const r = valider(contrat(PROVENANCE_CONTRAT), { text: 'Aucune trace.', provenance: [] }, []);
  assert.equal(r.status, 'FAIL');
  assert.ok(codes(r).includes('PROVENANCE_REQUIREMENT_FAILED'));
  /* Sur une sortie non structurée, la présence n’est pas décidable : elle est
     déclarée non vérifiable, jamais présumée acquise ni présumée manquante. */
  const brut = valider(contrat(PROVENANCE_CONTRAT), 'Un texte libre.', []);
  assert.equal(parId(brut, 'output-provenance-present').status, 'NOT_VERIFIABLE');
  assert.equal(brut.status, 'INCOMPLETE_VERIFICATION');
});

test('T-QG02A-29 la véracité d’une source n’est jamais présentée comme vérifiée', () => {
  const sortie = { text: 'Tracé.', provenance: [
    { statement_id: 'p1', verification_status: 'supported' },
    { statement_id: 'p2', verification_status: 'external_unverified' }
  ] };
  const r = valider(contrat(PROVENANCE_CONTRAT), sortie, []);
  const verite = parId(r, 'output-provenance-truth');
  assert.ok(verite, 'la limite est déclarée, pas passée sous silence');
  assert.equal(verite.verifiability, 'NOT_VERIFIABLE');
  assert.notEqual(verite.status, 'PASS', 'PROVENANCE_TRUTH_FAKE_PASS = NO');
  assert.equal(verite.required, false, 'une limite déclarée ne bloque pas un verdict par elle-même');
  assert.ok(r.unverifiable.some((u) => u.id === 'output-provenance-truth'));
});

test('T-QG02A-30 un statut non vérifié ne peut jamais être présenté comme vérifié', () => {
  const promu = { text: 'Tracé.', provenance: [
    { statement_id: 'p1', verification_status: 'supported' },
    { statement_id: 'p2', verification_status: 'verified' }
  ] };
  const r = valider(contrat(PROVENANCE_CONTRAT), promu, []);
  assert.equal(r.status, 'FAIL', 'VERIFICATION_STATUS_UPGRADED doit être détecté');
  assert.equal(parId(r, 'output-provenance-status').status, 'FAIL');
  assert.ok(codes(r).includes('PROVENANCE_REQUIREMENT_FAILED'));
});

/* ======================================================================== *
 * §17–§18 / §33 — CE QUI NE SE VÉRIFIE PAS ICI
 * ======================================================================== */

test('T-QG02A-31 une exigence qualitative n’est jamais tenue pour acquise', () => {
  const r = valider(contrat(), 'Un texte.', [CHECK_HEURISTIQUE]);
  const v = parId(r, 'heur-1');
  assert.equal(v.verifiability, 'HEURISTIC');
  assert.equal(v.status, 'WARNING');
  assert.equal(v.blocking, false, 'un contrôle indicatif ne bloque jamais');
  assert.equal(r.status, 'PASS_WITH_WARNINGS');
});

test('T-QG02A-32 l’exactitude factuelle n’est pas vérifiable ici', () => {
  const factuel = { id: 'fact-1', type: 'semantic', blocking: true, rule: 'Les chiffres cités doivent être exacts.' };
  const r = valider(contrat(), 'Le chiffre est 42.', [factuel]);
  assert.equal(parId(r, 'fact-1').status, 'DEFERRED');
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
});

test('T-QG02A-33 la pertinence n’est pas vérifiable ici', () => {
  const r = valider(contrat(), 'Une recommandation quelconque.', [CHECK_SEMANTIQUE]);
  assert.equal(parId(r, 'sem-1').verifiability, 'SEMANTIC');
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
  /* Le périmètre relève de la même limite, et le dit. */
  const scope = valider(contrat({ semantic_lock_signals: { signals: [{ id: 'scope', needed: true, source_ids: ['a', 'b'] }] } }), 'Un texte.', []);
  assert.equal(parId(scope, 'output-scope').status, 'NOT_VERIFIABLE');
  assert.equal(scope.status, 'INCOMPLETE_VERIFICATION');
});

test('T-QG02A-34 vérifiable + non vérifiable → INCOMPLETE, jamais PASS', () => {
  const c = contrat({
    quantities: [{ exact: 7, min: null, max: null }],
    output: { format: 'json' },
    ...PROVENANCE_CONTRAT
  });
  const sortie = {
    text: JSON.stringify(new Array(7).fill('x')),
    items: new Array(7).fill('x'),
    provenance: [
      { statement_id: 'p1', verification_status: 'supported' },
      { statement_id: 'p2', verification_status: 'external_unverified' }
    ]
  };
  const r = valider(c, sortie, [CHECK_SEMANTIQUE]);
  assert.equal(parId(r, 'output-quantity').status, 'PASS');
  assert.equal(parId(r, 'output-format').status, 'PASS');
  assert.equal(parId(r, 'output-provenance-present').status, 'PASS');
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION', 'MIXED_VERIFIABLE_AND_SEMANTIC_BECOMES_INCOMPLETE = YES');
  assert.equal(r.violations.length, 0);
});

test('T-QG02A-35 aucun contrôle sémantique ne passe automatiquement', () => {
  let semantiquesPasses = 0;
  for (const [c, sortie, checks] of corpus()) {
    for (const v of valider(c, sortie, checks).verifications) {
      if (v.verifiability === 'SEMANTIC' && v.status === 'PASS') semantiquesPasses += 1;
    }
  }
  assert.equal(semantiquesPasses, 0, 'SEMANTIC_CHECKS_AUTO_PASSED = 0');
});

test('T-QG02A-36 aucun contrôle heuristique ne passe automatiquement', () => {
  let heuristiquesPasses = 0;
  for (const [c, sortie, checks] of corpus()) {
    for (const v of valider(c, sortie, checks).verifications) {
      if (v.verifiability === 'HEURISTIC' && v.status === 'PASS') heuristiquesPasses += 1;
    }
  }
  assert.equal(heuristiquesPasses, 0, 'HEURISTIC_CHECKS_AUTO_PASSED = 0');
});

test('T-QG02A-37 aucun contrôle non vérifiable ne passe automatiquement', () => {
  let nonVerifiablesPasses = 0;
  for (const [c, sortie, checks] of corpus()) {
    for (const v of valider(c, sortie, checks).verifications) {
      if (v.verifiability === 'NOT_VERIFIABLE' && v.status === 'PASS') nonVerifiablesPasses += 1;
    }
  }
  assert.equal(nonVerifiablesPasses, 0, 'NOT_VERIFIABLE_CHECKS_AUTO_PASSED = 0');
});

test('T-QG02A-38 aucun chemin ne peut fabriquer un faux succès', () => {
  /* La garde est posée au point de construction : elle ne dépend d’aucune
     branche, et une écriture future qui l’oublierait lèverait plutôt que de
     laisser passer un faux succès. */
  assert.throws(
    () => executeOutputChecks({
      canonical_contract: {}, normalized: normalizeOutput('x'),
      checks: [{ id: 'piege', type: 'semantic', blocking: true, rule: 'r' }],
      format_vocabulary: []
    }) && (() => { throw new Error('non atteint'); })(),
    /non atteint/
  );
  /* Balayage : aucun PASS n’existe hors des deux niveaux vérifiables ici. */
  let fauxSucces = 0;
  for (const [c, sortie, checks] of corpus()) {
    for (const v of valider(c, sortie, checks).verifications) {
      if (v.status === 'PASS' && !['DETERMINISTIC', 'STRUCTURAL'].includes(v.verifiability)) fauxSucces += 1;
    }
  }
  assert.equal(fauxSucces, 0, 'FAKE_PASS_PATHS = 0');
  /* Et un statut PASS global exige zéro obligation requise non vérifiable. */
  for (const [c, sortie, checks] of corpus()) {
    const r = valider(c, sortie, checks);
    if (r.status === 'PASS') assert.equal(r.coverage.required_unverifiable, 0);
  }
});

test('T-QG02A-39 le moteur observe : il ne répare, ne complète et ne relance rien', () => {
  for (const interdit of ['repair', 'regenerate', 'appendMissing', 'normalizeSemantic', 'retry', 'relance']) {
    assert.equal(CODE.toLowerCase().includes(interdit.toLowerCase()), false, `réparation interdite : ${interdit}`);
  }
  const sortie = { text: 'Sortie non conforme.', items: ['a'] };
  const r = valider(contrat({ quantities: [{ exact: 3, min: null, max: null }] }), sortie, []);
  assert.equal(r.status, 'FAIL');
  assert.equal(sortie.items.length, 1, 'la sortie n’a pas été complétée');
  assert.equal(sortie.text, 'Sortie non conforme.');
});

test('T-QG02A-40 le moteur n’appelle aucun fournisseur et la trace reste sobre', () => {
  const r = valider(contrat({ quantities: [{ exact: 1, min: null, max: null }] }), { text: 'a', items: ['a'] }, [CHECK_SEMANTIQUE]);
  const audit = auditOutputTrace(r.trace);
  assert.equal(audit.readiness_fields, 0, 'OUTPUT_TRACE_READINESS_FIELDS = 0');
  assert.equal(audit.route_fields, 0, 'OUTPUT_TRACE_ROUTE_FIELDS = 0');
  assert.equal(audit.inferred_semantic_fields, 0, 'OUTPUT_TRACE_INFERRED_SEMANTIC_FIELDS = 0');
  assert.equal(audit.entry_count, r.verifications.length);
  /* La trace est stable entre deux exécutions indépendantes. */
  const bis = valider(contrat({ quantities: [{ exact: 1, min: null, max: null }] }), { text: 'a', items: ['a'] }, [CHECK_SEMANTIQUE]);
  assert.equal(JSON.stringify(r.trace), JSON.stringify(bis.trace));
});

/* ======================================================================== *
 * §39–§40 — LES DEUX DÉRIVES OBSERVÉES, ÉCRITES COMME GARDES
 * ======================================================================== */

test('T-QG02A-41 des contrôles non vérifiables ne peuvent jamais produire un verdict conforme', () => {
  /* Le contrôle historique du produit affiche « conforme » dès qu’aucun
     contrôle n’a échoué, même lorsque plusieurs sont restés hors de portée.
     Le nouveau moteur ne reproduit pas cette conclusion. */
  const familles = [
    [CHECK_SEMANTIQUE],
    [{ id: 'nv-1', type: 'not_verifiable', blocking: true, rule: 'Impression générale.' }],
    [{ id: 'inc-1', type: 'inconnu', blocking: true, rule: 'Règle exotique.' }],
    [{ id: 'det-1', type: 'deterministic', blocking: true, rule: 'Une règle sans mesure.' }]
  ];
  for (const checks of familles) {
    const r = valider(contrat(), 'Une sortie plausible et non vide.', checks);
    assert.notEqual(r.status, 'PASS', `${checks[0].type} ne doit jamais produire PASS`);
    assert.notEqual(r.status, 'PASS_WITH_WARNINGS', `${checks[0].type} ne doit pas être requalifié en simple avertissement`);
    assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
    assert.ok(r.coverage.required_unverifiable > 0);
  }
  /* Un contrôle non vérifiable NON requis, lui, ne bloque rien : la règle vise
     la certification abusive, pas l’exhaustivité. */
  const optionnel = valider(contrat(), 'Une sortie.', [{ id: 'nv-2', type: 'not_verifiable', blocking: false, rule: 'Ressenti.' }]);
  assert.equal(optionnel.status, 'PASS');
});

test('T-QG02A-42 un mot dans un libellé ne vaut pas contrôle exécuté', () => {
  /* Dérive observée : un contrôle réputé exécuté parce que sa règle contenait
     le mot « quantité ». Ici, seule une MESURE rend un contrôle exécutable. */
  const parLeMot = { id: 'det-mot', type: 'deterministic', blocking: true, rule: 'La quantité de recommandations doit être correcte.' };
  const r = valider(contrat(), '- a\n- b\n- c', [parLeMot]);
  const v = parId(r, 'det-mot');
  assert.equal(v.verifiability, 'NOT_VERIFIABLE', 'TEXT_KEYWORD_CAN_FAKE_DETERMINISTIC_PASS = NO');
  assert.equal(v.status, 'NOT_VERIFIABLE');
  assert.equal(r.status, 'INCOMPLETE_VERIFICATION');
  assert.equal(CODE.includes("includes('quantit"), false, 'aucune reconnaissance lexicale de règle');
  assert.equal(/rule\s*\.\s*includes|rule\s*\.\s*match|\/quantit/i.test(CODE), false);

  /* Le MÊME contrôle, doté d’une mesure, devient réellement exécutable. */
  const parLaMesure = { ...parLeMot, measure: { unit: 'items', exact: 3 } };
  const mesure = valider(contrat(), '- a\n- b\n- c', [parLaMesure]);
  assert.equal(parId(mesure, 'det-mot').status, 'PASS');
  assert.equal(parId(mesure, 'det-mot').verifiability, 'DETERMINISTIC');
  assert.equal(mesure.status, 'PASS');
  const rate = valider(contrat(), '- a\n- b', [parLaMesure]);
  assert.equal(rate.status, 'FAIL');
});
