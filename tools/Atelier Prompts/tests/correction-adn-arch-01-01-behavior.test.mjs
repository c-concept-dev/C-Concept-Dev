/* REPRISE-CORRECTION-ADN-ARCH-01-01 — PREUVES COMPORTEMENTALES §11–20 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { ARCH_SIGNAL_POLICY, ARCH_SIGNALS, enrichCanonicalContractFromArchAnalysis, mergePostOprieSignals } from '../core/adn/arch-canonical-enrichment.js';
import { canonicalFrom, coherentAnalysis, loadPostOprieValidator, oprieReadyTurn, productionSlice } from './post-oprie-validation-harness.helper.mjs';
import { ADN_CORE_FILES, ADN_RELEVANT_FILES, declaredTestCount, discoveredTestFiles } from './adn-test-scopes.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');
const BROWSER_RUNTIME = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const PATHS = Object.freeze({
  API: productionSlice('async function beginApiAnalysis', 'function compositeDemand'),
  IMPORT: productionSlice('function useAnalysis', 'function showQuestion')
});
const clone = (value) => JSON.parse(JSON.stringify(value));

const SIGNAL_ANALYSES = Object.freeze({
  CONTRACT_INCONSISTENT() {
    const a = coherentAnalysis();
    a.comprehension.intentions_secondaires = ['Objectif secondaire non validé.'];
    return a;
  },
  EXECUTION_UNSAFE() {
    const a = coherentAnalysis();
    a.comprehension.informations_manquantes = [{ information: 'Donnée déterminante.', bloquant: true, justification: 'Sans elle, exécuter serait non fiable.' }];
    return a;
  },
  MISSING_PROJECTION_DATA() {
    const a = coherentAnalysis();
    a.livrable.nature = '';
    return a;
  },
  TECHNICAL_STOP: coherentAnalysis
});

function makeElement() {
  return {
    value: '', hidden: false, textContent: '', innerHTML: '', className: '',
    focus() {}, scrollIntoView() {}, dispatchEvent() { return true; },
    classList: { add() {}, remove() {}, toggle() {} }, options: [], selectedIndex: 0
  };
}

/* Charge le runtime généré, le stop frontend réel et l'une des deux entrées. */
function createPathHarness(pathName, analysis, { runtimeAvailable = true, oprieState = 'operational_request_ready' } = {}) {
  const elements = new Map();
  const element = (selector) => {
    const key = String(selector);
    if (!elements.has(key)) elements.set(key, makeElement());
    return elements.get(key);
  };
  element('#api-cle').value = 'test-only-key';
  element('#api-modele').value = 'test-model';
  element('#api-max').value = '8000';

  const counters = { compiler: 0, stopRenderer: 0, questionRenderer: 0, showQuestion: 0 };
  const state = { docs: [], answers: [], analysis: null, exchangeId: 'exchange-test', requestName: 'request.json', responseName: 'response.json' };
  const canonicalContract = canonicalFrom(oprieReadyTurn({ state: oprieState }));
  const context = {
    console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, Intl, Promise,
    setTimeout, clearTimeout,
    document: { querySelector: element, body: { classList: { toggle() {} } } },
    Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; } },
    state, adpState: { pendingQuestion: false, requestedMode: 'architecte' },
    oprieState: { canonicalContract, enrichedContract: null }, $: element,
    syncLegacy() {}, show() {}, adnReadinessInstruction() { return ''; },
    adnAppendFinalExecutionDirective(prompt) { return String(prompt); },
    v11ShowRapidGate() { counters.stopRenderer += 1; },
    showQuestion() { counters.showQuestion += 1; },
    humanError() {}, humanValidationError() {}, rotateExchangeAfterMismatch() {},
    requestAnimationFrame(fn) { fn(); }
  };
  context.window = {
    obtenirFournisseurActif: () => 'anthropic', obtenirCleFournisseur: () => 'test-only-key',
    obtenirModeleActif: () => 'test-model',
    appelFournisseur: async () => ({ texte: JSON.stringify(analysis) })
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(BROWSER_RUNTIME, context, { filename: 'atelier:browser-runtime.generated.js' });
  const runtime = context.window.__ATELIER_ADN_RUNTIME__;
  assert.ok(runtime, 'le runtime navigateur généré doit être chargé');
  context.adnRuntime = () => (runtimeAvailable ? runtime : null);
  const api = {
    systeme: 'SYSTEM', schema: {}, analyse: null, contexte: () => ({ demande: 'Demande de test.' }),
    valider: () => [], importer(value) { this.analyse = value; return true; },
    compiler() { counters.compiler += 1; return 'PROMPT_COMPILE'; }
  };
  context.window.__ARCHITECTE_V10__ = api;
  vm.runInContext(productionSlice('function adnEnrichCanonicalWithArch(', 'function adnNextConversationAction('), context, { filename: 'atelier:post-oprie-runtime' });
  vm.runInContext(PATHS[pathName], context, { filename: `atelier:path-${pathName.toLowerCase()}` });
  context.questionRenderer = () => { counters.questionRenderer += 1; };
  return {
    counters, canonicalContract,
    async run() {
      if (pathName === 'API') return vm.runInContext('beginApiAnalysis()', context);
      context.__input = { id_echange: state.exchangeId, ...clone(analysis) };
      return vm.runInContext('useAnalysis(__input)', context);
    }
  };
}

function mergedSignalsFor(analysis) {
  const base = canonicalFrom(oprieReadyTurn());
  const { validate } = loadPostOprieValidator();
  const validation = validate(analysis, base);
  const enrichment = enrichCanonicalContractFromArchAnalysis(base, analysis);
  return { base, enrichment, merged: mergePostOprieSignals(validation.signals, enrichment.signals) };
}

test('§11–16 les quatre signaux arrêtent les deux chemins ; absence de signal compile exactement une fois', async () => {
  for (const pathName of Object.keys(PATHS)) {
    for (const signal of ARCH_SIGNALS) {
      const h = createPathHarness(pathName, SIGNAL_ANALYSES[signal](), { runtimeAvailable: signal !== 'TECHNICAL_STOP' });
      await h.run();
      assert.equal(h.counters.compiler, 0, `${pathName}/${signal}`);
      assert.equal(h.counters.stopRenderer, 1, `${pathName}/${signal}`);
      assert.equal(h.counters.showQuestion + h.counters.questionRenderer, 0, `${pathName}/${signal}`);
    }
    const clear = createPathHarness(pathName, coherentAnalysis());
    await clear.run();
    assert.equal(clear.counters.compiler, 1, `${pathName}/sans signal`);
    assert.equal(clear.counters.stopRenderer, 0, `${pathName}/sans signal`);
  }
});

test('§11–16 chaque défaut produit le signal attendu sans mutation de la base', () => {
  for (const expected of ['CONTRACT_INCONSISTENT', 'EXECUTION_UNSAFE', 'MISSING_PROJECTION_DATA']) {
    const { base, enrichment, merged } = mergedSignalsFor(SIGNAL_ANALYSES[expected]());
    const snapshot = JSON.stringify(base);
    assert.ok(merged.some((s) => s.signal === expected));
    assert.equal(JSON.stringify(base), snapshot);
    assert.equal(JSON.stringify(enrichment.contract.executability), JSON.stringify(base.executability));
  }
  const { base, enrichment, merged } = mergedSignalsFor({ comprehension: {} });
  assert.ok(merged.some((s) => s.signal === 'TECHNICAL_STOP'));
  assert.equal(JSON.stringify(enrichment.contract), JSON.stringify(base));
});

test('§17 return_to_oprie ne permet jamais une question Architecte', async () => {
  for (const pathName of Object.keys(PATHS)) for (const signal of ARCH_SIGNALS) {
    const h = createPathHarness(pathName, SIGNAL_ANALYSES[signal](), { runtimeAvailable: signal !== 'TECHNICAL_STOP' });
    await h.run();
    assert.equal(h.counters.showQuestion + h.counters.questionRenderer, 0);
  }
  assert.equal(ARCH_SIGNAL_POLICY.CONTRACT_INCONSISTENT.return_to_oprie, true);
  assert.equal(ARCH_SIGNAL_POLICY.EXECUTION_UNSAFE.return_to_oprie, true);
});

test('§18 readiness reste identique pour les quatre états OPRIE et les quatre signaux', () => {
  const proof = {
    CONTRACT_INCONSISTENT: ['intent.secondary_objectives', 'comprehension.intentions_secondaires'],
    EXECUTION_UNSAFE: ['executability.critical_missing', 'comprehension.informations_manquantes'],
    MISSING_PROJECTION_DATA: ['intent.deliverable', 'livrable.nature'], TECHNICAL_STOP: [null, 'archAnalyse']
  };
  for (const state of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    const base = canonicalFrom(oprieReadyTurn({ state }));
    const before = JSON.stringify(base.executability);
    for (const signal of ARCH_SIGNALS) {
      const [canonical_field, arch_source_field] = proof[signal];
      const merged = mergePostOprieSignals([{ signal, canonical_field, arch_source_field, detail: 'preuve' }]);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].block_execution, true);
      assert.equal(JSON.stringify(base.executability), before, `${state}/${signal}`);
    }
  }
});

test('§19 preuve instrumentée séparée des chemins API et import fichier', async () => {
  for (const pathName of ['API', 'IMPORT']) {
    const blocked = createPathHarness(pathName, SIGNAL_ANALYSES.EXECUTION_UNSAFE());
    await blocked.run();
    assert.equal(blocked.counters.compiler, 0, `${pathName} bloqué`);
    const clear = createPathHarness(pathName, coherentAnalysis());
    await clear.run();
    assert.equal(clear.counters.compiler, 1, `${pathName} clair`);
  }
});

test('§20 déduplication par triplet, preuves distinctes et ordre déterministe', () => {
  const duplicated = mergedSignalsFor(SIGNAL_ANALYSES.CONTRACT_INCONSISTENT()).merged;
  assert.equal(duplicated.filter((s) => s.signal === 'CONTRACT_INCONSISTENT' && s.canonical_field === 'intent.secondary_objectives' && s.arch_source_field === 'comprehension.intentions_secondaires').length, 1);
  const input = [
    { signal: 'EXECUTION_UNSAFE', canonical_field: 'executability.critical_missing', arch_source_field: 'source.b', detail: 'B' },
    { signal: 'CONTRACT_INCONSISTENT', canonical_field: 'intent.objective', arch_source_field: 'source.a', detail: 'A' },
    { signal: 'CONTRACT_INCONSISTENT', canonical_field: 'intent.deliverable', arch_source_field: 'source.c', detail: 'C' }
  ];
  const distinct = mergePostOprieSignals(input);
  assert.deepEqual(distinct.map((s) => `${s.signal}|${s.canonical_field}|${s.arch_source_field}`), [
    'CONTRACT_INCONSISTENT|intent.objective|source.a',
    'CONTRACT_INCONSISTENT|intent.deliverable|source.c',
    'EXECUTION_UNSAFE|executability.critical_missing|source.b'
  ]);
  assert.equal(JSON.stringify(distinct), JSON.stringify(mergePostOprieSignals(input)));
});

test('§15/§20 signal inconnu ou sans preuve devient TECHNICAL_STOP traçable', () => {
  for (const candidate of [
    { signal: 'UNKNOWN_SIGNAL', canonical_field: 'intent.objective', arch_source_field: 'source' },
    { signal: 'CONTRACT_INCONSISTENT', canonical_field: null, arch_source_field: null }
  ]) {
    const [result] = mergePostOprieSignals([candidate]);
    assert.equal(result.signal, 'TECHNICAL_STOP');
    assert.equal(result.block_execution, true);
    assert.equal(result.return_to_oprie, false);
    assert.match(result.detail, /invalide, converti en arrêt technique/);
    assert.ok(result.arch_source_field);
  }
});

test('§16 une seule infrastructure d’arrêt est active sur les deux chemins', async () => {
  assert.equal((HTML.match(/function adnShowPostOprieStop\(/g) || []).length, 1);
  for (const [pathName, source] of Object.entries(PATHS)) {
    assert.equal((source.match(/adnShowPostOprieStop\(/g) || []).length, 1);
    const h = createPathHarness(pathName, SIGNAL_ANALYSES.CONTRACT_INCONSISTENT());
    await h.run();
    assert.equal(h.counters.stopRenderer, 1, pathName);
  }
});

test('§18/§23 aucun champ OPRIE n’est muté par les deux chemins', async () => {
  for (const pathName of Object.keys(PATHS)) for (const signal of ARCH_SIGNALS) {
    const h = createPathHarness(pathName, SIGNAL_ANALYSES[signal](), { runtimeAvailable: signal !== 'TECHNICAL_STOP' });
    const before = JSON.stringify(h.canonicalContract);
    await h.run();
    assert.equal(JSON.stringify(h.canonicalContract), before, `${pathName}/${signal}`);
  }
});

test('§18–20 scopes, discovery et métriques de sources restent honnêtes', () => {
  assert.equal(ADN_CORE_FILES.length, 12);
  assert.equal(ADN_CORE_FILES.reduce((n, f) => n + declaredTestCount(f), 0), 74);
  assert.equal(ADN_RELEVANT_FILES.length, 15);
  assert.equal(ADN_RELEVANT_FILES.reduce((n, f) => n + declaredTestCount(f), 0), 112);
  assert.ok(discoveredTestFiles().includes('correction-adn-arch-01-01-behavior.test.mjs'));
  const producers = fs.readdirSync(path.join(root, 'core/adn')).filter((f) => f.endsWith('.js') && !f.includes('generated')).filter((f) => /function enrichCanonicalContractFromArchAnalysis/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(producers, ['arch-canonical-enrichment.js']);
  /* ADN-ARCH-02 — la mesure de sources reste honnête, mais le fait mesuré a
     changé : le compilateur ne lit plus archAnalyse. Les commentaires sont
     retirés avant la mesure, sinon une phrase qui NOMME le champ pour dire
     qu'il n'est plus lu compterait comme une lecture. */
  const compiler = productionSlice('function archCompiler(', 'function archEnvoyerVersQualite(')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\barchAnalyse\b/.test(compiler), false,
    'ARCH_COMPILER_RAW_ARCHANALYSE_READS = 0');
  assert.match(compiler, /archProjectionCanonique\(contrat\)/,
    'la seule entrée sémantique du compilateur est la projection du contrat canonique');
  assert.equal(1 + Number(/\barchAnalyse\b/.test(compiler)), 1,
    'ARCH_GLOBAL_ACTIVE_SEMANTIC_SOURCE_COUNT = 1');
  const source = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(/test\.(?:skip|todo)|describe\.(?:skip|todo)/.test(source), false);
});
