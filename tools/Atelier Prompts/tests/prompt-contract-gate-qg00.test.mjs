/* ADN-QG-00 — PROMPT CONTRACT GATE : PROTOTYPE PUR, NON BRANCHÉ
 * ============================================================================
 *
 * Ce lot ne branche rien. Il établit et prouve une FRONTIÈRE qui n'existait
 * pas : personne, jusqu'ici, ne comparait le prompt produit au contrat
 * canonique qui l'avait produit.
 *
 * Les contrats utilisés ici sont RÉELS : ils sortent du mapper OPRIE et de
 * l'enrichisseur Rapide de production. Le gate est donc éprouvé sur les
 * structures effectivement présentes dans le pipeline, jamais sur des objets
 * inventés pour l'occasion. La seule exception est la sentinelle Architecte,
 * dont le contrat est façonné à la main aux formes documentées de
 * l'enrichisseur ARCH (provenance, hypothèses interdites, signal de périmètre)
 * pour éviter de dépendre d'une analyse Architecte complète dans un test unitaire.
 *
 * DETTE ASSUMÉE ET DÉCLARÉE : la trace de projection est construite ici, côté
 * appelant. Les compilateurs Rapide et Architecte ne l'émettent pas encore.
 * C'est exactement ce que ADN-QG-01 doit fermer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GATE_MODES,
  GATE_STATUSES,
  REQUIREMENT_STATUSES,
  VIOLATION_CODES,
  buildProjectionTrace,
  collectCanonicalRequirements,
  validatePromptAgainstCanonicalContract
} from '../core/adn/prompt-contract-gate.js';
/* ADN-QG-02D — la conformité de SORTIE a une source unique. Le prototype que
   QG-00 avait esquissé ici est supprimé ; ce test éprouve désormais le moteur
   réel, avec les mêmes attentes et sans rien relâcher. */
import {
  OUTPUT_GATE_STATUSES,
  OUTPUT_VIOLATION_CODES,
  validateOutputAgainstCanonicalContract
} from '../core/adn/output-compliance-gate.js';
import { enrichRapidCanonicalContract } from '../core/adn/rapide-canonical-enrichment.js';
import { ADAPTIVE_LOCK_IDS } from '../core/adn/adaptive-lock-selector.js';
import { canonicalFrom, oprieReadyTurn } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_SOURCE = path.join(root, 'core/adn/prompt-contract-gate.js');
const clone = (v) => JSON.parse(JSON.stringify(v));

const VOCABULAIRE = Object.freeze([
  { id: 'liste', name: 'Liste à puces', markers: ['liste', 'puces'], verifiable: true },
  { id: 'tableau', name: 'Tableau comparatif', markers: ['tableau'], verifiable: true },
  { id: 'json', name: 'JSON', markers: ['json'], verifiable: true, patterns: [{ pattern: '\\bjson\\b', bonus: 8 }] }
]);
const UNITES = 'items?|elements?|idees?|points?|options?|exemples?|etapes?|champs?';

function baseFor(original_request, candidat = {}) {
  return canonicalFrom(oprieReadyTurn({
    operational_request_candidate: {
      objective: 'Objectif validé.', expected_deliverable: 'Un livrable nommé.',
      secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [],
      confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [],
      assumptions_allowed: [], remaining_unknowns: [], ...candidat
    }
  }), { request_id: 'qg-00', original_request });
}

/** Contrat Rapide RÉEL : mapper de production + enrichisseur de production. */
const contratRapide = (demande, options = {}, candidat = {}) =>
  enrichRapidCanonicalContract(baseFor(demande, candidat),
    { format_vocabulary: VOCABULAIRE, counting_units: UNITES, ...options }).contract;

/** Valeur projetée FIDÈLE d'une exigence — la projection parfaite de référence.
 *  C'est le fixture de test ; le gate, lui, ne fabrique jamais ces valeurs. */
function valeurFidele(req) {
  const e = req.expectation || {};
  switch (req.key) {
    case 'quantity': return { exact: e.exact, min: e.min, max: e.max };
    case 'format': return { format: e.format };
    case 'plan': return { section_count: e.section_count };
    case 'role': return { role: e.role };
    case 'recipient': return { recipient: e.recipient };
    case 'length': return { length_policy: e.length_policy };
    case 'opening_closing': return { opening: e.opening, closing: e.closing };
    case 'data': return { delimited: true };
    case 'provenance': return { total: e.total, unverified: e.unverified };
    case 'assumptions': return { forbidden_count: e.forbidden_count };
    case 'scope':
    case 'forbidden': return { constraint_count: e.constraint_count };
    default: return { covered: true };
  }
}

/** Projection FIDÈLE et COMPLÈTE : le point de départ de toute injection de perte. */
function traceFidele(contract) {
  const entries = collectCanonicalRequirements(contract)
    .filter((r) => r.status !== 'NOT_APPLICABLE')
    .map((r) => ({ key: r.key, present: true, rendered: `[${r.key}]`, source: 'test_projection', value: valeurFidele(r) }));
  return buildProjectionTrace(entries, { request_id: contract.request_id });
}

/** Verrous que l'ADN aurait sélectionnés pour couvrir les exigences du contrat. */
function verrousFideles(contract) {
  const ids = new Set(collectCanonicalRequirements(contract)
    .filter((r) => r.status === 'REQUIRED' && r.lock_id).map((r) => r.lock_id));
  return ADAPTIVE_LOCK_IDS.filter((id) => ids.has(id)).map((id) => ({ id, selected: true }));
}

/** Retire une entrée de la trace : c'est ainsi qu'une PERTE est simulée. */
const sansEntree = (trace, key) => ({ ...trace, entries: trace.entries.filter((e) => e.key !== key) });
/** Altère la valeur projetée d'une entrée. */
const avecValeur = (trace, key, value) => ({
  ...trace, entries: trace.entries.map((e) => (e.key === key ? { ...e, value: { ...e.value, ...value } } : e))
});

const gate = (contract, prompt, trace, locks, mode) => validatePromptAgainstCanonicalContract({
  canonical_contract: contract, prompt,
  selected_locks: locks || verrousFideles(contract),
  projection_trace: trace || traceFidele(contract),
  ...(mode ? { mode } : {})
});

const codes = (resultat) => resultat.violations.map((v) => v.code);

function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

/** Source sans commentaires : un mot cité dans une explication n'est pas du code. */
function sourceSansCommentaires() {
  return fs.readFileSync(GATE_SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

const PROMPT_NEUTRE = 'Produis le livrable demandé en respectant le contrat établi.';

/* ======================================================================== *
 * T-QG00-01 à 05 — PROPRIÉTÉS STRUCTURELLES DU GATE
 * ======================================================================== */

test('T-QG00-01 le gate est déterministe : 200 exécutions, un seul résultat', () => {
  const contract = contratRapide('Donne exactement 7 exemples sous forme de liste.');
  const trace = traceFidele(contract);
  const locks = verrousFideles(contract);
  const reference = JSON.stringify(gate(contract, 'Donne exactement 7 exemples.', trace, locks));
  for (let i = 0; i < 200; i += 1) {
    assert.equal(JSON.stringify(gate(contract, 'Donne exactement 7 exemples.', trace, locks)), reference,
      `exécution ${i} divergente : le gate ne serait pas déterministe`);
  }
  assert.ok(GATE_STATUSES.includes(JSON.parse(reference).status));
});

test('T-QG00-02 aucun accès réseau : ni fetch, ni http, ni provider', () => {
  const src = sourceSansCommentaires();
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'WebSocket', 'require(\'node:http', 'node:https', 'axios']) {
    assert.equal(src.includes(interdit), false, `le gate ne doit contenir aucun appel réseau : ${interdit}`);
  }
  for (const provider of ['anthropic', 'openai', 'groq', 'apiKey', 'api_key', 'appelerProvider']) {
    assert.equal(src.toLowerCase().includes(provider.toLowerCase()), false, `aucun provider ne doit apparaître : ${provider}`);
  }
});

test('T-QG00-03 aucun juge LLM, aucun fuzzy, aucun embedding, aucun seuil arbitraire', () => {
  const src = sourceSansCommentaires();
  for (const interdit of ['embedding', 'cosine', 'similarity', 'levenshtein', 'editDistance', 'fuzzy', 'minLength', 'MIN_LENGTH', 'minTokens', 'threshold', 'SEUIL']) {
    assert.equal(src.toLowerCase().includes(interdit.toLowerCase()), false, `logique interdite détectée : ${interdit}`);
  }
  /* Le ratio de couverture n'existe pas : la suffisance ne se score pas. */
  assert.equal(/coverage_ratio|score\s*[><=]/.test(src), false, 'aucun score ni ratio ne doit décider du statut');
  /* ADN-QG-01 — l'état de branchement du gate n'est plus une propriété de QG-00 :
     ce lot-ci l'a délibérément fait passer à true. La propriété est désormais
     vérifiée par la suite QG-01, à laquelle elle appartient. */
});

test('T-QG00-04 le contrat canonique n’est jamais muté, même gelé en profondeur', () => {
  const contract = deepFreeze(contratRapide('Fais un tableau comparatif de 4 options.'));
  const avant = JSON.stringify(contract);
  const resultat = gate(contract, PROMPT_NEUTRE);
  assert.equal(JSON.stringify(contract), avant, 'QG_CANONICAL_MUTATIONS doit valoir 0');
  assert.ok(GATE_STATUSES.includes(resultat.status));
  /* Les exigences dérivées sont de nouveaux objets, jamais des alias du contrat. */
  const reqs = collectCanonicalRequirements(contract);
  assert.equal(reqs.some((r) => r === contract.output || r === contract.quantities), false);
});

test('T-QG00-05 le prompt n’est jamais réécrit ni retourné modifié', () => {
  const contract = contratRapide('Donne une liste de 5 idées.');
  const prompt = 'Un prompt strictement inchangé.';
  const resultat = gate(contract, prompt);
  assert.equal(prompt, 'Un prompt strictement inchangé.');
  assert.equal(Object.prototype.hasOwnProperty.call(resultat, 'prompt'), false,
    'le gate ne renvoie aucun prompt : il ne peut donc pas en proposer une réécriture');
  assert.equal(JSON.stringify(resultat).includes(prompt), false, 'QG_PROMPT_REWRITES doit valoir 0');
});

/* ======================================================================== *
 * T-QG00-06 à 11 — COUVERTURE NOMINALE ET PERTES DÉTECTÉES
 * ======================================================================== */

test('T-QG00-06 sentinelles Rapide : 6 cas réels projetés fidèlement passent', () => {
  const cas = [
    { nom: 'simple', demande: 'Rédige une note de synthèse.', prompt: 'Rédige une note de synthèse.' },
    { nom: 'liste', demande: 'Donne une liste de 5 idees.', prompt: 'Donne une liste de 5 idées.' },
    { nom: 'tableau', demande: 'Construis un tableau comparatif.', prompt: 'Construis un tableau comparatif.' },
    { nom: 'materiau', demande: 'Analyse le texte fourni.', prompt: 'Analyse le matériau délimité ci-dessous.', options: { material: 'Texte source à analyser.' } },
    { nom: 'exact', demande: 'Donne exactement 7 exemples.', prompt: 'Donne exactement 7 exemples.' },
    { nom: 'code', demande: 'json 3 champs', prompt: 'JSON. 3 champs.' }
  ];
  const echecs = [];
  for (const c of cas) {
    const contract = contratRapide(c.demande, c.options || {});
    const resultat = gate(contract, c.prompt);
    if (resultat.status !== 'PASS') echecs.push(`${c.nom}: ${resultat.status} ${JSON.stringify(codes(resultat))}`);
  }
  assert.deepEqual(echecs, [], 'RAPIDE_SENTINEL_FAILURES doit valoir 0');
  assert.equal(cas.length, 6, 'RAPIDE_SENTINEL_CASES = 6');
});

test('T-QG00-07 une projection requise perdue fait échouer le gate', () => {
  const contract = contratRapide('Construis un tableau comparatif de 4 options.');
  const complet = gate(contract, PROMPT_NEUTRE);
  assert.equal(complet.status, 'PASS', 'la projection fidèle doit passer avant toute injection');
  const ampute = gate(contract, PROMPT_NEUTRE, sansEntree(traceFidele(contract), 'format'));
  assert.equal(ampute.status, 'FAIL');
  assert.ok(codes(ampute).includes('MISSING_REQUIRED_PROJECTION'));
  assert.ok(ampute.coverage.satisfied < complet.coverage.satisfied);
});

test('T-QG00-08 une quantité exacte fidèlement projetée passe', () => {
  const contract = contratRapide('Donne exactement 7 exemples.');
  const quantite = collectCanonicalRequirements(contract).find((r) => r.key === 'quantity');
  assert.equal(quantite.status, 'REQUIRED', 'la demande porte bien une quantité canonique');
  assert.equal(quantite.expectation.exact, 7);
  const resultat = gate(contract, 'Donne exactement 7 exemples, ni plus ni moins.');
  assert.equal(resultat.status, 'PASS', JSON.stringify(codes(resultat)));
});

test('T-QG00-09 une borne dans le prompt contredit une exigence d’exactitude', () => {
  const contract = contratRapide('Donne exactement 7 exemples.');
  for (const variante of ['Donne au moins 7 exemples.', 'Donne entre 7 et 12 exemples.', 'Fournis un minimum de 7 exemples.']) {
    const resultat = gate(contract, variante);
    assert.equal(resultat.status, 'FAIL', `« ${variante} » doit être détecté comme contradictoire`);
    assert.ok(codes(resultat).includes('CONTRADICTORY_INSTRUCTION'), variante);
  }
  /* Quantité absente de la projection : mécanisme distinct, code distinct. */
  const sansQuantite = gate(contract, 'Donne exactement 7 exemples.', avecValeur(traceFidele(contract), 'quantity', { exact: null }));
  assert.ok(codes(sansQuantite).includes('QUANTITY_MISMATCH'));
});

test('T-QG00-10 le format est vérifié par la trace structurée, pas par le mot du prompt', () => {
  const contract = contratRapide('Construis un tableau comparatif.');
  /* Le mot « tableau » absent du prompt ne suffit pas à faire échouer : c'est la
     trace qui fait foi. Sans quoi le gate deviendrait un lecteur de texte. */
  const resultat = gate(contract, 'Produis le livrable convenu.');
  assert.equal(resultat.status, 'PASS', JSON.stringify(codes(resultat)));
  /* Inversement, le mot présent ne sauve pas une projection perdue. */
  const perdu = gate(contract, 'Construis un tableau comparatif.', sansEntree(traceFidele(contract), 'format'));
  assert.equal(perdu.status, 'FAIL');
});

test('T-QG00-11 un format projeté différent du contrat est détecté', () => {
  const contract = contratRapide('Construis un tableau comparatif.');
  const resultat = gate(contract, PROMPT_NEUTRE, avecValeur(traceFidele(contract), 'format', { format: 'liste' }));
  assert.equal(resultat.status, 'FAIL');
  assert.ok(codes(resultat).includes('FORMAT_MISMATCH'));
});

/* ======================================================================== *
 * T-QG00-12 à 19 — FAMILLES CONTRACTUELLES
 * ======================================================================== */

test('T-QG00-12 matériau : la délimitation et le verrou data sont exigés ensemble', () => {
  const contract = contratRapide('Analyse le texte fourni.', { material: 'Matériau utilisateur.' });
  const data = collectCanonicalRequirements(contract).find((r) => r.key === 'data');
  assert.equal(data.status, 'REQUIRED');
  assert.equal(data.lock_id, 'data');
  assert.equal(gate(contract, PROMPT_NEUTRE).status, 'PASS');
  /* Le gate CONSTATE l'absence du verrou ; il ne le sélectionne jamais lui-même. */
  const sansVerrou = gate(contract, PROMPT_NEUTRE, null, verrousFideles(contract).filter((l) => l.id !== 'data'));
  assert.equal(sansVerrou.status, 'FAIL');
  assert.ok(codes(sansVerrou).includes('LOCK_MISMATCH'));
  assert.equal(JSON.stringify(sansVerrou).includes('"selected":true'), false, 'QG_LOCK_SELECTION_WRITES = 0');
});

test('T-QG00-13 un matériau projeté sans délimitation fait échouer le gate', () => {
  const contract = contratRapide('Analyse le texte fourni.', { material: 'Matériau utilisateur.' });
  const nonDelimite = gate(contract, PROMPT_NEUTRE, avecValeur(traceFidele(contract), 'data', { delimited: false }));
  assert.equal(nonDelimite.status, 'FAIL');
  assert.ok(codes(nonDelimite).includes('MISSING_REQUIRED_PROJECTION'));
  const absent = gate(contract, PROMPT_NEUTRE, sansEntree(traceFidele(contract), 'data'));
  assert.equal(absent.status, 'FAIL');
});

test('T-QG00-14 contrat nu : aucun champ absent ne crée d’obligation artificielle', () => {
  const contract = contratRapide('Rédige une note.');
  const reqs = collectCanonicalRequirements(contract);
  for (const cle of ['recipient', 'opening_closing', 'length', 'provenance', 'assumptions', 'scope', 'forbidden', 'role']) {
    const req = reqs.find((r) => r.key === cle);
    assert.equal(req.status, 'NOT_APPLICABLE', `${cle} absent du contrat doit valoir NOT_APPLICABLE`);
  }
  const resultat = gate(contract, 'Une note.');
  assert.equal(resultat.status, 'PASS', JSON.stringify(codes(resultat)));
  assert.equal(resultat.violations.length, 0, 'FALSE_POSITIVE_FAILURES doit valoir 0');
  assert.ok(REQUIREMENT_STATUSES.includes('NOT_APPLICABLE'));
});

test('T-QG00-15 un destinataire établi devient une exigence de projection', () => {
  const base = contratRapide('Rédige une note.');
  const contract = clone(base);
  contract.intent.recipient = 'comité de direction';
  const req = collectCanonicalRequirements(contract).find((r) => r.key === 'recipient');
  assert.equal(req.status, 'REQUIRED');
  assert.equal(gate(contract, PROMPT_NEUTRE).status, 'PASS');
  const perdu = gate(contract, PROMPT_NEUTRE, sansEntree(traceFidele(contract), 'recipient'));
  assert.equal(perdu.status, 'FAIL');
  assert.ok(codes(perdu).includes('MISSING_REQUIRED_PROJECTION'));
});

test('T-QG00-16 hypothèses interdites : le gate exige leur projection, jamais leur choix', () => {
  const contract = clone(contratRapide('Rédige une note.'));
  contract.assumptions.forbidden = [
    { text: 'Ne pas supposer un budget.', source: 'arch_analysis', origin_field: 'strategie.hypotheses_interdites[0]' },
    { text: 'Ne pas supposer une échéance.', source: 'arch_analysis', origin_field: 'strategie.hypotheses_interdites[1]' }
  ];
  const req = collectCanonicalRequirements(contract).find((r) => r.key === 'assumptions');
  assert.equal(req.expectation.forbidden_count, 2);
  assert.equal(gate(contract, PROMPT_NEUTRE).status, 'PASS');
  const ampute = gate(contract, PROMPT_NEUTRE, avecValeur(traceFidele(contract), 'assumptions', { forbidden_count: 1 }));
  assert.equal(ampute.status, 'FAIL');
  assert.ok(codes(ampute).includes('ASSUMPTION_MISMATCH'));
  /* Le gate n'a produit aucune hypothèse : il n'en connaît que le nombre. */
  assert.equal(JSON.stringify(ampute).includes('budget'), false);
});

test('T-QG00-17 provenance : une affirmation non vérifiée ne peut jamais devenir vérifiée', () => {
  const contract = clone(contratRapide('Rédige une note.'));
  contract.evidence.provenance = [
    { statement_id: 'arch-prov-0', claim: 'A', source_type: 'arch_analysis', source_ref: null, verification_status: 'unverified' },
    { statement_id: 'arch-prov-1', claim: 'B', source_type: 'arch_analysis', source_ref: null, verification_status: 'verified' }
  ];
  const req = collectCanonicalRequirements(contract).find((r) => r.key === 'provenance');
  assert.deepEqual({ total: req.expectation.total, unverified: req.expectation.unverified }, { total: 2, unverified: 1 });
  assert.equal(gate(contract, PROMPT_NEUTRE).status, 'PASS');
  const requalifie = gate(contract, PROMPT_NEUTRE, avecValeur(traceFidele(contract), 'provenance', { unverified: 0 }));
  assert.equal(requalifie.status, 'FAIL');
  assert.ok(codes(requalifie).includes('PROVENANCE_MISMATCH'));
});

test('T-QG00-18 périmètre : sentinelle Architecte format + longueur + scope + provenance', () => {
  const contract = clone(contratRapide('Rédige une note.'));
  contract.execution_role = 'analyste';
  contract.output.format = 'tableau';
  contract.output.length_policy = 'concise';
  contract.evidence.provenance = [
    { statement_id: 'arch-prov-0', claim: 'A', source_type: 'arch_analysis', source_ref: null, verification_status: 'unverified' }
  ];
  contract.semantic_lock_signals.signals = [
    ...contract.semantic_lock_signals.signals.filter((s) => s.id !== 'scope'),
    { id: 'scope', needed: true, reason: 'Des éléments sont retirés du périmètre.', priority: 'mandatory', source: 'runtime',
      source_ids: ['compilation.composants_ecartes[0]', 'compilation.composants_ecartes[1]'], associated_checks: [] }
  ];
  const resultat = gate(contract, PROMPT_NEUTRE);
  assert.equal(resultat.status, 'PASS', `ARCHITECTE_SENTINEL_FAILURES doit valoir 0 : ${JSON.stringify(codes(resultat))}`);
  for (const cle of ['format', 'length', 'scope', 'provenance', 'role']) {
    assert.equal(collectCanonicalRequirements(contract).find((r) => r.key === cle).status, 'REQUIRED', cle);
  }
  const perdu = gate(contract, PROMPT_NEUTRE, avecValeur(traceFidele(contract), 'scope', { constraint_count: 1 }));
  assert.equal(perdu.status, 'FAIL');
  assert.ok(codes(perdu).includes('SCOPE_MISMATCH'));
});

test('T-QG00-19 contrôles : couverture exigée, exécution différée, non vérifiable jamais PASS', () => {
  const contract = contratRapide('Donne exactement 7 exemples sous forme de liste.');
  const bloquants = contract.checks.filter((c) => c.blocking);
  assert.ok(bloquants.length > 0, 'le contrat Rapide porte au moins un contrôle bloquant');
  assert.equal(gate(contract, 'Donne exactement 7 exemples.').status, 'PASS');
  const sansControle = gate(contract, 'Donne exactement 7 exemples.', sansEntree(traceFidele(contract), `check:${bloquants[0].id}`));
  assert.equal(sansControle.status, 'FAIL');
  assert.ok(codes(sansControle).includes('MISSING_CHECK'));

  /* §35 — prototype de conformité de sortie, taxonomie DISTINCTE. */
  const sortie = validateOutputAgainstCanonicalContract({
    canonical_contract: contract,
    output: { format: contract.output.format, items: new Array(7).fill('x') },
    checks: [
      ...contract.checks,
      { id: 'sem-0', type: 'semantic', blocking: true, rule: 'Cohérence argumentative.' },
      { id: 'heur-0', type: 'heuristic', blocking: false, rule: 'Qualité de style.' },
      { id: 'nv-0', type: 'not_verifiable', blocking: false, rule: 'Impression générale.' }
    ]
  });
  assert.ok(OUTPUT_GATE_STATUSES.includes(sortie.status));
  assert.equal(sortie.status, 'INCOMPLETE_VERIFICATION', 'NOT_VERIFIABLE ne devient JAMAIS PASS');
  /* ADN-QG-02D — mêmes faits, lus dans le vocabulaire du moteur unique. Aucune
     attente n'est relâchée : un contrôle sémantique reste différé, deux
     contrôles restent hors de portée, et les déterministes sont bien exécutés. */
  assert.equal(sortie.coverage.deferred, 1, 'le contrôle sémantique est différé, jamais exécuté');
  assert.equal(sortie.coverage.not_verifiable, 2);
  assert.ok(sortie.coverage.verifiable_here >= 1, 'les contrôles déterministes, eux, sont réellement exécutés');
  assert.equal(sortie.verifications.filter((v) => v.verifiability === 'SEMANTIC' && v.status === 'PASS').length, 0);
  assert.equal(OUTPUT_VIOLATION_CODES.includes('MISSING_REQUIRED_PROJECTION'), false,
    'les deux taxonomies ne partagent aucun code de projection');
});

/* ======================================================================== *
 * T-QG00-20 à 24 — CONTRADICTIONS, FERMETURE, ABSENCE DE SEUIL
 * ======================================================================== */

test('T-QG00-20 une instruction sans appui canonique est signalée', () => {
  const contract = contratRapide('Rédige une note.');
  assert.equal(collectCanonicalRequirements(contract).find((r) => r.key === 'recipient').status, 'NOT_APPLICABLE');
  const trace = buildProjectionTrace([
    ...traceFidele(contract).entries,
    { key: 'recipient', present: true, rendered: '[recipient]', source: 'test_projection', value: { recipient: 'inventé' } }
  ]);
  const resultat = gate(contract, PROMPT_NEUTRE, trace);
  assert.equal(resultat.status, 'FAIL');
  assert.ok(codes(resultat).includes('UNSUPPORTED_INSTRUCTION'));
  const detail = resultat.violations.find((v) => v.code === 'UNSUPPORTED_INSTRUCTION');
  assert.equal(detail.requirement_id, 'recipient');
});

test('T-QG00-21 doublons : identiques = avertissement, contradictoires = échec', () => {
  const contract = contratRapide('Construis un tableau comparatif.');
  const base = traceFidele(contract);
  const format = base.entries.find((e) => e.key === 'format');

  const identique = gate(contract, PROMPT_NEUTRE, buildProjectionTrace([...base.entries, { ...format }]));
  assert.equal(identique.status, 'PASS_WITH_WARNINGS');
  assert.equal(identique.violations.length, 0);
  assert.equal(identique.warnings[0].code, 'DUPLICATE_CONFLICTING_INSTRUCTION');

  const contradictoire = gate(contract, PROMPT_NEUTRE,
    buildProjectionTrace([...base.entries, { ...format, value: { format: 'liste' } }]));
  assert.equal(contradictoire.status, 'FAIL');
  assert.ok(codes(contradictoire).includes('DUPLICATE_CONFLICTING_INSTRUCTION'));
});

test('T-QG00-22 entrée invalide : fermeture, jamais de repli sur PASS', () => {
  const contract = contratRapide('Rédige une note.');
  const valide = { canonical_contract: contract, prompt: PROMPT_NEUTRE, selected_locks: verrousFideles(contract), projection_trace: traceFidele(contract) };
  const invalides = [
    { ...valide, canonical_contract: null },
    { ...valide, prompt: '' },
    { ...valide, prompt: 42 },
    { ...valide, selected_locks: 'role,format' },
    { ...valide, projection_trace: null },
    { ...valide, projection_trace: { entries: 'aucune' } },
    { ...valide, mode: 'permissif' },
    undefined
  ];
  for (const entree of invalides) {
    const resultat = validatePromptAgainstCanonicalContract(entree);
    assert.equal(resultat.status, 'FAIL', `entrée invalide non fermée : ${JSON.stringify(entree && Object.keys(entree))}`);
    assert.ok(resultat.violations.every((v) => v.code === 'TECHNICAL_VALIDATION_FAILURE'));
    assert.equal(resultat.trace.fail_closed, true);
    assert.equal(resultat.coverage.satisfied, 0);
  }
  assert.equal(validateOutputAgainstCanonicalContract({}).status, 'FAIL', 'le prototype de sortie ferme aussi');
  assert.equal(validateOutputAgainstCanonicalContract({}).violations[0].code, 'TECHNICAL_VALIDATION_FAILURE');
  assert.deepEqual(GATE_MODES, ['strict', 'audit']);
  assert.equal(VIOLATION_CODES.length, 14);
});

test('T-QG00-23 un prompt court mais complet passe : aucun seuil de longueur', () => {
  const contract = contratRapide('json 3 champs');
  const court = 'JSON. 3 champs.';
  const resultat = gate(contract, court);
  assert.equal(resultat.status, 'PASS', `SHORT_COMPLETE_PROMPT_CAN_PASS : ${JSON.stringify(codes(resultat))}`);
  assert.ok(court.length < 20, 'le prompt éprouvé est effectivement très court');
  /* Le même contrat, projeté fidèlement, passe quelle que soit la longueur. */
  const long = gate(contract, `${court} ${'Précision additionnelle. '.repeat(400)}`);
  assert.equal(long.status, 'PASS', 'la longueur n’influence jamais le statut');
  assert.equal(resultat.coverage.satisfied, long.coverage.satisfied);
});

test('T-QG00-24 un prompt long mais incomplet échoue : la taille ne vaut pas couverture', () => {
  const contract = contratRapide('Construis un tableau comparatif de 4 options.');
  const long = `${'Texte de remplissage abondant et parfaitement inutile. '.repeat(300)}`;
  assert.ok(long.length > 5000);
  const resultat = gate(contract, long, sansEntree(traceFidele(contract), 'format'));
  assert.equal(resultat.status, 'FAIL', 'LONG_INCOMPLETE_PROMPT_CAN_FAIL');
  assert.ok(codes(resultat).includes('MISSING_REQUIRED_PROJECTION'));
  /* Et le prompt long, complet cette fois, passe : aucune pénalité de taille. */
  assert.equal(gate(contract, long).status, 'PASS');
});
