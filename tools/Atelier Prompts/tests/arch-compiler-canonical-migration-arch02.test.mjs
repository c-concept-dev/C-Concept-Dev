/* ADN-ARCH-02 — MIGRATION DE archCompiler VERS LE CONTRAT CANONIQUE ENRICHI
 * ============================================================================
 *
 * INVARIANT PROUVÉ ICI :
 *
 *   ARCH_GLOBAL_ACTIVE_SEMANTIC_SOURCE_COUNT = 1
 *   COMPILER_SEMANTIC_SOURCE                 = ENRICHED_CANONICAL_CONTRACT
 *   ARCH_COMPILER_RAW_ARCHANALYSE_READS      = 0
 *
 * archAnalyse n'est plus qu'une ENTRÉE D'ENRICHISSEMENT, en amont. Aucun
 * consommateur sémantique aval ne la lit : ni le compilateur, ni les deux
 * chemins Architecte actifs. Ce que le contrat ne porte pas n'atteint pas le
 * prompt — même si l'analyse le porte, et même si elle le contredit.
 *
 * Ces tests sont des tests d'EXIGENCE, pas de caractérisation.
 * AUCUNE MODIFICATION DE PRODUCTION : le HTML est lu, jamais réécrit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  ARCH_COMPILER_SEMANTIC_SOURCE,
  ARCH_ENRICHABLE_PATHS,
  activeArchSemanticSourceCount,
  canonicalToArchProjectionInput,
  changedPaths,
  enrichCanonicalContractFromArchAnalysis,
  validateArchCanonicalEnrichment
} from '../core/adn/arch-canonical-enrichment.js';
import {
  createArchitecteHarness,
  compileWith,
  analyseFixture,
  arbiterFixture,
  enrichedContractFixture,
  sectionBody,
  sectionTitles,
  hasSection
} from './archcompiler-harness.helper.mjs';
import { canonicalFrom, coherentAnalysis, oprieReadyTurn, productionSlice } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');
const BROWSER_RUNTIME = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const DEMANDE = 'Demande de migration canonique.';
const clone = (v) => JSON.parse(JSON.stringify(v));

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Couche de compilation complète : variable de contrat, projection, surcharges
 *  de présentation et archCompiler lui-même. */
function compilerLayer() {
  return stripComments(productionSlice('let archContratCanonique=', 'function archEnvoyerVersQualite('));
}

/** Corps de archCompiler, commentaires retirés : une phrase qui NOMME un champ
 *  pour dire qu'il n'est plus lu ne doit jamais compter comme une lecture. */
function compilerBody() {
  return productionSlice('function archCompiler(', 'function archEnvoyerVersQualite(')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Contrat canonique enrichi construit par le chemin de production exact. */
function contractFor({ arbiter = arbiterFixture(), analyse = analyseFixture(), demande = DEMANDE } = {}) {
  const harness = createArchitecteHarness({ demande });
  harness.importer(analyse);
  return { harness, contract: enrichedContractFixture(harness, { arbiter, analyse, demande }) };
}

/** Compile avec un contrat éventuellement retouché après enrichissement. */
function compileContract(mutate, { analyse = analyseFixture(), arbiter = arbiterFixture(), demande = DEMANDE, materiau = '', reglages = {}, apercu } = {}) {
  const harness = createArchitecteHarness({ demande, materiau, reglages });
  harness.importer(analyse);
  const contract = enrichedContractFixture(harness, { arbiter, analyse, demande });
  if (typeof mutate === 'function') mutate(contract);
  return { harness, contract, prompt: harness.compiler(contract, apercu) };
}

const candidate = (over) => ({ ...arbiterFixture().operational_request_candidate, ...over });
const withCandidate = (over) => arbiterFixture({ operational_request_candidate: candidate(over) });

/* ==========================================================================
 * HARNAIS DES DEUX CHEMINS ACTIFS — il capture l'ARGUMENT réellement passé
 * à api.compiler(), seul moyen de prouver ce que le compilateur reçoit.
 * ======================================================================= */

const PATHS = Object.freeze({
  API: productionSlice('async function beginApiAnalysis', 'function compositeDemand'),
  IMPORT: productionSlice('function useAnalysis', 'function showQuestion')
});

function makeElement() {
  return {
    value: '', hidden: false, textContent: '', innerHTML: '', className: '',
    focus() {}, scrollIntoView() {}, dispatchEvent() { return true; },
    classList: { add() {}, remove() {}, toggle() {} }, options: [], selectedIndex: 0
  };
}

function createPathHarness(pathName, analysis, { oprieState = 'operational_request_ready' } = {}) {
  const elements = new Map();
  const element = (selector) => {
    const key = String(selector);
    if (!elements.has(key)) elements.set(key, makeElement());
    return elements.get(key);
  };
  element('#api-cle').value = 'test-only-key';

  const calls = { compiler: [], stops: 0 };
  const state = { docs: [], answers: [], analysis: null, exchangeId: 'exchange-test', requestName: 'r.json', responseName: 'p.json' };
  const canonicalContract = canonicalFrom(oprieReadyTurn({ state: oprieState }));
  const network = [];
  const refuse = (kind) => (...args) => { network.push({ kind, arg: String(args[0] ?? '') }); throw new Error(`ADN-ARCH-02 : réseau interdit (${kind}).`); };

  const context = {
    console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, Intl, Promise,
    setTimeout, clearTimeout,
    document: { querySelector: element, body: { classList: { toggle() {} } } },
    Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; } },
    state, adpState: { pendingQuestion: false, requestedMode: 'architecte' },
    oprieState: { canonicalContract, enrichedContract: null }, $: element,
    syncLegacy() {}, show() {}, adnReadinessInstruction() { return ''; },
    adnAppendFinalExecutionDirective(prompt) { return String(prompt); },
    v11ShowRapidGate() { calls.stops += 1; },
    showQuestion() {}, humanError() {}, humanValidationError() {}, rotateExchangeAfterMismatch() {},
    requestAnimationFrame(fn) { fn(); },
    fetch: refuse('fetch')
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
  context.adnRuntime = () => runtime;
  context.window.__ARCHITECTE_V10__ = {
    systeme: 'SYSTEM', schema: {}, analyse: null, contexte: () => ({ demande: DEMANDE }),
    valider: () => [], importer(value) { this.analyse = value; return true; },
    compiler(contrat) { calls.compiler.push(contrat === undefined ? '__AUCUN_ARGUMENT__' : clone(contrat ?? null)); return 'PROMPT_COMPILE'; }
  };
  vm.runInContext(productionSlice('function adnEnrichCanonicalWithArch(', 'function adnNextConversationAction('), context, { filename: 'atelier:post-oprie-runtime' });
  vm.runInContext(PATHS[pathName], context, { filename: `atelier:path-${pathName}` });
  return {
    calls, network, canonicalContract, context,
    async run() {
      if (pathName === 'API') return vm.runInContext('beginApiAnalysis()', context);
      context.__input = { id_echange: state.exchangeId, ...clone(analysis) };
      return vm.runInContext('useAnalysis(__input)', context);
    }
  };
}

/* ==========================================================================
 * T-ARCH02-01 — LE COMPILATEUR CONSOMME LE CONTRAT ENRICHI
 * ======================================================================= */

test('T-ARCH02-01 le compilateur consomme le contrat canonique enrichi, et rien sans lui', () => {
  const { harness, contract } = contractFor();
  assert.equal(harness.api.COMPILER_SEMANTIC_SOURCE, ARCH_COMPILER_SEMANTIC_SOURCE);
  assert.equal(ARCH_COMPILER_SEMANTIC_SOURCE, 'ENRICHED_CANONICAL_CONTRACT');

  const prompt = harness.compiler(contract);
  assert.ok(prompt.length > 0, 'avec contrat : le prompt est compilé');
  assert.equal(harness.contratCanonique !== null, true, 'le contrat appliqué devient la source courante');

  /* Fail-closed : sans contrat, RIEN n'est compilé, et rien n'est écrit. */
  const nu = createArchitecteHarness({ demande: DEMANDE });
  nu.importer(analyseFixture());
  assert.equal(nu.compiler(null), '', 'sans contrat, la compilation est refusée');
  assert.equal(nu.sortieDOM, '', 'aucun prompt partiel n’est laissé dans le DOM');
  assert.match(nu.statutDOM, /parcours guidé/,
    'VALIDATION-ADN-ARCH-02-01 §18 : le refus nomme le chemin canonique existant');
});

/* ==========================================================================
 * T-ARCH02-02 — UNE ANALYSE BRUTE N'EST PAS UN CONTRAT
 * ======================================================================= */

test('T-ARCH02-02 ARCH_COMPILER_CAN_RECEIVE_RAW_ARCHANALYSE = NO : une analyse 3.4 brute est refusée', () => {
  const analyse = analyseFixture();
  const harness = createArchitecteHarness({ demande: DEMANDE });
  harness.importer(analyse);

  assert.equal(canonicalToArchProjectionInput(analyse), null, 'la projection refuse une forme non canonique');
  assert.equal(harness.compiler(analyse), '', 'le compilateur refuse une analyse brute passée à la place du contrat');
  assert.equal(harness.compiler({ intent: { objective: 'X' } }), '', 'un objet de forme approchante est refusé lui aussi');
  assert.equal(activeArchSemanticSourceCount(analyse), 0);
});

/* ==========================================================================
 * T-ARCH02-03 … 15 — CHAQUE FAMILLE VIENT DU CONTRAT
 * ======================================================================= */

test('T-ARCH02-03 l’objectif vient de intent.objective', () => {
  const analyse = analyseFixture();
  analyse.comprehension.intention_principale = 'OBJECTIF_ARCH_CONCURRENT';
  const { prompt } = compileContract(null, { analyse, arbiter: withCandidate({ objective: 'OBJECTIF_CANONIQUE' }) });
  assert.equal(sectionBody(prompt, 'OBJECTIF'), 'OBJECTIF_CANONIQUE');
  assert.doesNotMatch(prompt, /OBJECTIF_ARCH_CONCURRENT/);
});

test('T-ARCH02-04 le livrable vient de intent.deliverable', () => {
  const analyse = analyseFixture();
  analyse.livrable = { ...analyse.livrable, nature: 'NATURE_ARCH_CONCURRENTE' };
  const { prompt } = compileContract(null, { analyse, arbiter: withCandidate({ expected_deliverable: 'LIVRABLE_CANONIQUE' }) });
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Livrable : LIVRABLE_CANONIQUE$/m);
  assert.doesNotMatch(prompt, /NATURE_ARCH_CONCURRENTE/);
});

test('T-ARCH02-05 les contraintes projetées viennent du contrat ; comprehension.contraintes n’atteint jamais le prompt', () => {
  const analyse = analyseFixture();
  analyse.comprehension.contraintes = [{
    contenu: 'CONTRAINTE_ARCH_BRUTE', statut: 'declaration_utilisateur', source: 'demande',
    preuve: { citation: 'Demande de migration canonique.', contexte_avant: null, contexte_apres: null }
  }];
  analyse.strategie.hypotheses_interdites = ['CONTRAINTE_CANONIQUE_INTERDITE'];
  const { prompt } = compileContract(null, { analyse });
  assert.doesNotMatch(prompt, /CONTRAINTE_ARCH_BRUTE/, 'aucune contrainte brute 3.4 n’est projetée');
  assert.equal(sectionBody(prompt, 'HYPOTHÈSES INTERDITES'), '- CONTRAINTE_CANONIQUE_INTERDITE');
});

test('T-ARCH02-06 les hypothèses viennent de assumptions.allowed / forbidden / explicit', () => {
  const analyse = analyseFixture();
  analyse.strategie.hypotheses_autorisees = ['AUTORISEE_ARCH_NON_VALIDEE'];
  analyse.strategie.hypotheses_interdites = ['INTERDITE_CANONIQUE'];
  analyse.strategie.pilotage_incertitude = { decisions_autonomes: [], estimations_a_etiqueter: ['ESTIMATION_CANONIQUE'], inconnues_non_devineables: [] };
  const arbiter = withCandidate({ assumptions_allowed: ['AUTORISEE_CANONIQUE'] });
  const { prompt } = compileContract(null, { analyse, arbiter });

  assert.equal(sectionBody(prompt, 'HYPOTHÈSES AUTORISÉES'), '- AUTORISEE_CANONIQUE');
  assert.equal(sectionBody(prompt, 'HYPOTHÈSES INTERDITES'), '- INTERDITE_CANONIQUE');
  assert.match(sectionBody(prompt, 'DÉCISIONS, ESTIMATIONS ET INCERTITUDES'), /- ESTIMATION_CANONIQUE/);
  assert.doesNotMatch(prompt, /AUTORISEE_ARCH_NON_VALIDEE/, 'une hypothèse non autorisée par la personne n’atteint pas le prompt');
});

test('T-ARCH02-07 le format de sortie vient de output.format', () => {
  const { prompt } = compileContract((c) => { c.output.format = 'FORMAT_CANONIQUE'; });
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Format technique : FORMAT_CANONIQUE$/m);
});

test('T-ARCH02-08 le ton vient de output.tone', () => {
  const { prompt } = compileContract((c) => { c.output.tone = 'TON_CANONIQUE'; });
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Ton : TON_CANONIQUE$/m);
});

test('T-ARCH02-09 la structure attendue vient de output.structure', () => {
  const analyse = analyseFixture();
  analyse.compilation.composants_retenus = [
    { type: 'section', titre: 'SECTION_A', contenu: 'Contenu A.', justification: 'Utile.', fondements: [{ nature: 'deduction', usage: 'structurer', citation: null }] },
    { type: 'section', titre: 'SECTION_B', contenu: 'Contenu B.', justification: 'Utile.', fondements: [{ nature: 'deduction', usage: 'structurer', citation: null }] }
  ];
  const { prompt, contract } = compileContract(null, { analyse });
  assert.deepEqual(contract.output.structure, ['SECTION_A', 'SECTION_B']);
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Plan attendu : SECTION_A · SECTION_B$/m);
});

test('T-ARCH02-10 les quantités viennent de quantities', () => {
  const analyse = analyseFixture();
  analyse.livrable = { ...analyse.livrable, quantites: { min: 3, max: 7, unite: 'points' } };
  const { prompt, contract } = compileContract(null, { analyse });
  assert.deepEqual(clone(contract.quantities[0]), { target: 'points', unit: 'points', exact: null, min: 3, max: 7, source: 'arch_analysis' });
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Quantité : minimum 3 ; maximum 7 points$/m);
});

test('T-ARCH02-11 les contrôles viennent de checks', () => {
  const analyse = analyseFixture();
  analyse.verification.criteres_bloquants = ['CHECK_BLOQUANT_CANONIQUE'];
  analyse.verification.criteres_qualitatifs = ['CHECK_QUALITATIF_CANONIQUE'];
  const { prompt } = compileContract(null, { analyse });
  const body = sectionBody(prompt, 'VÉRIFICATION AVANT ENVOI');
  assert.match(body, /^- CHECK_BLOQUANT_CANONIQUE$/m);
  assert.match(body, /^- CHECK_QUALITATIF_CANONIQUE$/m);
  assert.ok(body.indexOf('CHECK_BLOQUANT_CANONIQUE') < body.indexOf('CHECK_QUALITATIF_CANONIQUE'),
    'l’ordre bloquants puis qualitatifs du contrat est préservé');

  /* Un contrôle retiré du contrat disparaît du prompt : la source est bien le contrat. */
  const retire = compileContract((c) => { c.checks = c.checks.filter((x) => x.rule !== 'CHECK_QUALITATIF_CANONIQUE'); }, { analyse }).prompt;
  assert.doesNotMatch(retire, /CHECK_QUALITATIF_CANONIQUE/);
});

test('T-ARCH02-12 les obligations viennent de obligations', () => {
  const analyse = analyseFixture();
  analyse.verification.criteres_bloquants = ['OBLIGATION_CANONIQUE'];
  const { prompt, contract } = compileContract(null, { analyse });
  assert.equal(contract.obligations.length, 1);
  assert.equal(sectionBody(prompt, 'OBLIGATIONS À RESPECTER'), '- OBLIGATION_CANONIQUE');

  const sansObligation = compileContract((c) => { c.obligations = []; }, { analyse }).prompt;
  assert.equal(hasSection(sansObligation, 'OBLIGATIONS À RESPECTER'), false,
    'le compilateur ne recrée aucune obligation à partir des critères');
});

test('T-ARCH02-13 les règles de provenance viennent de evidence, jamais de evaluation', () => {
  const analyse = analyseFixture();
  analyse.evaluation.connaissance_externe_necessaire = true;
  analyse.evaluation.actualite_requise = true;
  /* La conclusion Architecte seule ne déclenche plus rien. */
  assert.equal(hasSection(compileContract(null, { analyse }).prompt, 'RECHERCHE, ACTUALITÉ ET QUALITÉ DES PREUVES'), false);

  const arbiter = withCandidate({ external_facts_to_research: ['FAIT_EXTERNE_CANONIQUE'] });
  const { prompt, contract } = compileContract(null, { analyse, arbiter });
  assert.equal(contract.evidence.external_knowledge_needed, true);
  const body = sectionBody(prompt, 'RECHERCHE, ACTUALITÉ ET QUALITÉ DES PREUVES');
  assert.match(body, /Citez les sources directement consultées et leur date de consultation\./);

  const frais = compileContract((c) => { c.evidence.freshness_needed = true; }, { analyse, arbiter }).prompt;
  assert.match(sectionBody(frais, 'RECHERCHE, ACTUALITÉ ET QUALITÉ DES PREUVES'), /Elle peut avoir changé/);
});

test('T-ARCH02-14 les signaux de périmètre viennent du contrat, sans aucune détection de texte', () => {
  const analyse = analyseFixture();
  analyse.compilation.composants_ecartes = [{ type: 'section', titre: 'ECARTE', raison: 'Hors périmètre.' }];
  const { prompt, contract } = compileContract(null, { analyse });
  assert.ok(contract.semantic_lock_signals.signals.some((s) => s.id === 'scope'));
  assert.match(sectionBody(prompt, 'CADRAGE SÉMANTIQUE À RESPECTER'), /retirés du périmètre du livrable/);

  /* Retirer le signal du contrat retire la section : aucune reconstruction locale. */
  const sansSignal = compileContract((c) => { c.semantic_lock_signals.signals = []; }, { analyse }).prompt;
  assert.equal(hasSection(sansSignal, 'CADRAGE SÉMANTIQUE À RESPECTER'), false);
});

test('T-ARCH02-15 les signaux de verrou sémantique sont projetés tels quels', () => {
  const { prompt } = compileContract((c) => {
    c.semantic_lock_signals.signals = [{ id: 'scope', needed: true, reason: 'RAISON_SIGNAL_CANONIQUE', priority: 'mandatory', source: 'runtime', source_ids: [], associated_checks: [] }];
  });
  assert.equal(sectionBody(prompt, 'CADRAGE SÉMANTIQUE À RESPECTER'), '- RAISON_SIGNAL_CANONIQUE');
});

/* ==========================================================================
 * T-ARCH02-16 — LA SÉLECTION DES VERROUS RESTE À L'ADN
 * ======================================================================= */

test('T-ARCH02-16 LOCK_SELECTION_AUTHORITY = ADN : le compilateur projette, ne sélectionne pas', () => {
  const { contract } = contractFor();
  assert.deepEqual(contract.selected_locks.locks, [], 'l’enrichissement ne sélectionne aucun verrou');

  const { prompt } = compileContract((c) => {
    c.selected_locks = { locks: [{ id: 'scope', priority: 'mandatory', reason: 'VERROU_SELECTIONNE_PAR_ADN', selected: true }], decisions: [] };
  });
  assert.match(sectionBody(prompt, 'CADRAGE SÉMANTIQUE À RESPECTER'), /VERROU_SELECTIONNE_PAR_ADN/,
    'un verrou déjà sélectionné par l’ADN est projeté');

  const body = compilerBody();
  for (const interdit of ['selectAdaptiveLocks', 'selected=true', 'needed=true']) {
    assert.equal(body.includes(interdit), false, `le compilateur ne contient aucune sélection de verrou (${interdit})`);
  }
});

/* ==========================================================================
 * T-ARCH02-17 / 18 — READINESS ET SIGNAUX BLOQUANTS
 * ======================================================================= */

test('T-ARCH02-17 READINESS_AUTHORITY_REMAINS_OPRIE_ONLY : la compilation ne touche à aucun champ de readiness', () => {
  const { harness, contract } = contractFor();
  const avant = JSON.stringify(contract.executability);
  harness.compiler(contract);
  assert.equal(JSON.stringify(contract.executability), avant, 'executability est strictement inchangée');

  const body = compilerBody();
  for (const interdit of ['execution_ready', 'clarification_required', 'operational_request_ready', 'oprie_state', 'questions_a_poser', 'next_question']) {
    assert.equal(body.includes(interdit), false, `le compilateur ne décide ni ne lit de readiness (${interdit})`);
  }
});

test('T-ARCH02-18 les signaux bloquants arrêtent toujours la compilation sur les deux chemins', async () => {
  const analyses = {
    CONTRACT_INCONSISTENT: () => coherentAnalysis({ comprehension: { ...coherentAnalysis().comprehension, intentions_secondaires: ['Non validé.'] } }),
    EXECUTION_UNSAFE: () => coherentAnalysis({ comprehension: { ...coherentAnalysis().comprehension, informations_manquantes: [{ information: 'Donnée déterminante.', bloquant: true, justification: 'Sans elle, exécuter serait non fiable.' }] } }),
    MISSING_PROJECTION_DATA: () => coherentAnalysis({ livrable: { ...coherentAnalysis().livrable, nature: '' } })
  };
  for (const pathName of Object.keys(PATHS)) {
    for (const [signal, build] of Object.entries(analyses)) {
      const h = createPathHarness(pathName, build());
      await h.run();
      assert.deepEqual(h.calls.compiler, [], `${pathName}/${signal} : aucune compilation`);
      assert.equal(h.calls.stops, 1, `${pathName}/${signal} : un arrêt fail-closed`);
    }
  }
});

/* ==========================================================================
 * T-ARCH02-19 / 20 / 21 — LES DEUX CHEMINS ACTIFS
 * ======================================================================= */

for (const [id, pathName, label] of [['19', 'API', 'PATH_A (analyse API)'], ['20', 'IMPORT', 'PATH_B (analyse importée)']]) {
  test(`T-ARCH02-${id} ${label} passe le contrat canonique enrichi au compilateur`, async () => {
    const h = createPathHarness(pathName, coherentAnalysis());
    await h.run();

    assert.equal(h.calls.compiler.length, 1, 'exactement une compilation');
    const recu = h.calls.compiler[0];
    assert.notEqual(recu, '__AUCUN_ARGUMENT__', 'le compilateur reçoit un argument explicite');
    assert.equal(activeArchSemanticSourceCount(recu), 1, 'l’argument est un contrat canonique exploitable');
    assert.equal(recu.executability.oprie_state, 'operational_request_ready');
    assert.equal(recu.version, h.canonicalContract.version);
    /* C'est bien le contrat ENRICHI, pas la base nue. */
    assert.ok(changedPaths(h.canonicalContract, recu).length > 0, 'l’argument porte l’enrichissement Architecte');
    assert.deepEqual(validateArchCanonicalEnrichment(h.canonicalContract, recu).mutated_oprie_fields, []);
    /* Et surtout : ce n'est pas l'analyse 3.4. */
    assert.equal(recu.version === '3.4', false);
    assert.equal('comprehension' in recu, false);
    assert.deepEqual(h.network, [], 'aucun appel réseau pendant la préparation du contrat');
  });
}

test('T-ARCH02-21 LEGACY_SEMANTIC_CONTAMINATION_COUNT = 0 sur les deux chemins', () => {
  for (const [name, slice] of Object.entries(PATHS)) {
    assert.match(slice, /api\.compiler\(enrichment&&enrichment\.contract\)/,
      `${name} : le seul argument sémantique est le contrat enrichi`);
    assert.equal(/api\.compiler\(\s*\)/.test(slice), false, `${name} : plus aucun appel sans contrat`);
    assert.equal(/api\.compiler\([^)]*analy/i.test(slice), false, `${name} : aucune analyse n’est passée au compilateur`);
  }
});

/* ==========================================================================
 * T-ARCH02-22 / 23 — MÉTRIQUES DE SOURCE
 * ======================================================================= */

test('T-ARCH02-22 ARCH_COMPILER_RAW_ARCHANALYSE_READS = 0', () => {
  const body = compilerBody();
  assert.equal(/\barchAnalyse\b/.test(body), false, 'aucune lecture de archAnalyse dans le compilateur');
  for (const bloc of ['.comprehension', '.evaluation', '.strategie', '.livrable', '.compilation', '.verification', '.apprentissage']) {
    assert.equal(body.includes(bloc), false, `aucune lecture brute du bloc 3.4 ${bloc}`);
  }
});

test('T-ARCH02-23 ARCH_GLOBAL_ACTIVE_SEMANTIC_SOURCE_COUNT = 1', () => {
  const { contract } = contractFor();
  assert.equal(activeArchSemanticSourceCount(contract), 1);
  assert.equal(activeArchSemanticSourceCount(null), 0);
  assert.equal(activeArchSemanticSourceCount(analyseFixture()), 0);

  /* La seule production directe de archAnalyse restante est l'enrichissement,
     plus la validation post-OPRIE : aucune n'est un consommateur AVAL. */
  const amont = ['function enrichCanonicalContractFromArchAnalysis(', 'function adnValidatePostOprie(', 'function adnEnrichCanonicalWithArch('];
  for (const ancre of amont) assert.ok(HTML.includes(ancre), `${ancre} reste la voie d’entrée contrôlée`);
});

/* ==========================================================================
 * T-ARCH02-24 … 26 — PURETÉ
 * ======================================================================= */

test('T-ARCH02-24 le contrat canonique passé au compilateur est strictement immuable', () => {
  const { harness, contract } = contractFor();
  const avant = JSON.stringify(contract);
  harness.compiler(contract);
  assert.equal(JSON.stringify(contract), avant, 'la compilation ne mute jamais son entrée');

  const projection = canonicalToArchProjectionInput(contract);
  projection.objective = 'MUTATION_DE_LA_PROJECTION';
  assert.notEqual(contract.intent.objective, 'MUTATION_DE_LA_PROJECTION', 'la projection est une copie');
});

test('T-ARCH02-25 mêmes entrées → prompt strictement identique', () => {
  const build = () => {
    const analyse = analyseFixture();
    analyse.verification.criteres_bloquants = ['Un critère.'];
    return compileContract(null, { analyse, materiau: 'Matériau stable.', reglages: { destinataire: 'un lectorat défini' } }).prompt;
  };
  const a = build();
  assert.ok(a.length > 0);
  assert.equal(a, build());
});

test('T-ARCH02-26 la compilation est locale : ni réseau, ni fournisseur, ni LLM', () => {
  const analyse = analyseFixture();
  const harness = createArchitecteHarness({ demande: DEMANDE, materiau: 'Matériau.' });
  harness.importer(analyse);
  const prompt = harness.compiler(enrichedContractFixture(harness, { analyse, demande: DEMANDE }));
  assert.ok(prompt.length > 0);
  assert.deepEqual(harness.network, [], 'aucun fetch/XHR/WebSocket pendant la compilation');

  const module = fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8');
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'appelFournisseur', 'Math.random', 'Date.now']) {
    assert.equal(module.includes(interdit), false, `la projection reste pure (${interdit})`);
  }
});

/* ==========================================================================
 * T-ARCH02-27 … 29 — FIDÉLITÉ DE PROJECTION
 * ======================================================================= */

test('T-ARCH02-27 une quantité exacte est projetée comme exacte, sans être convertie en bornes', () => {
  const { prompt } = compileContract((c) => {
    c.quantities = [{ target: 'critères', unit: 'critères', exact: 7, min: null, max: null, source: 'user_explicit' }];
  });
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Quantité : exactement 7 critères$/m);
  assert.doesNotMatch(prompt, /minimum 7/);
});

test('T-ARCH02-28 un contrôle qualitatif reste qualitatif et ne devient jamais une obligation', () => {
  const analyse = analyseFixture();
  analyse.verification.criteres_qualitatifs = ['CRITERE_QUALITATIF'];
  analyse.verification.elements_non_verifiables = ['ELEMENT_NON_VERIFIABLE'];
  const { prompt, contract } = compileContract(null, { analyse });

  const qualitatif = contract.checks.find((c) => c.rule === 'CRITERE_QUALITATIF');
  assert.equal(qualitatif.type, 'heuristic');
  assert.equal(qualitatif.blocking, false);
  assert.deepEqual(contract.obligations, [], 'aucun contrôle non bloquant n’est promu en obligation');
  assert.equal(hasSection(prompt, 'OBLIGATIONS À RESPECTER'), false);
  assert.match(sectionBody(prompt, 'VÉRIFICATION AVANT ENVOI'), /^- CRITERE_QUALITATIF$/m);

  const nonVerifiable = contract.checks.find((c) => c.rule === 'ELEMENT_NON_VERIFIABLE');
  assert.equal(nonVerifiable.type, 'not_verifiable');
  assert.doesNotMatch(prompt, /ELEMENT_NON_VERIFIABLE/,
    'un élément non vérifiable n’est jamais présenté comme un contrôle réalisable');
});

test('T-ARCH02-29 un fait externe reste non vérifié, et aucune provenance n’est promue', () => {
  const analyse = analyseFixture();
  analyse.comprehension.declarations = [{
    contenu: 'FAIT_EXTERNE', statut: 'connaissance_externe_non_verifiee', source: 'aucune', preuve: null
  }];
  analyse.verification.controle_provenance = [{ affirmation: 'AFFIRMATION', statut: 'connaissance_externe_non_verifiee', justification: 'Hors demande.' }];
  const { contract, prompt } = compileContract(null, { analyse });

  for (const fait of contract.evidence.external_unverified) assert.equal(fait.verification_status, 'unverified');
  for (const p of contract.evidence.provenance) assert.notEqual(p.verification_status, 'verified');
  assert.ok(contract.evidence.external_unverified.length > 0, 'le fait externe est bien porté par le contrat');
  assert.ok(contract.evidence.provenance.length > 0, 'la provenance est bien portée par le contrat');
  assert.doesNotMatch(prompt, /FAIT_EXTERNE/, 'le compilateur ne réintroduit aucun fait non vérifié comme établi');
});

/* ==========================================================================
 * T-ARCH02-30 — SURCHARGE DE PRÉSENTATION
 * ======================================================================= */

test('T-ARCH02-30 une surcharge manuelle change la présentation et JAMAIS la sémantique', () => {
  const analyse = analyseFixture();
  analyse.verification.criteres_bloquants = ['OBLIGATION_INTOUCHABLE'];
  const arbiter = withCandidate({ objective: 'OBJECTIF_INTOUCHABLE', expected_deliverable: 'LIVRABLE_INTOUCHABLE', assumptions_allowed: ['HYPOTHESE_INTOUCHABLE'] });

  const apercu = {
    format: 'FORMAT_SURCHARGE', ton: 'TON_SURCHARGE', longueur: 'LONGUEUR_SURCHARGE', structure: 'PLAN_SURCHARGE',
    /* Tentatives sémantiques : toutes doivent être ignorées. */
    objective: 'OBJECTIF_PIRATE', deliverable: 'LIVRABLE_PIRATE', assumptions: ['HYPOTHESE_PIRATE'],
    obligations: ['OBLIGATION_PIRATE'], checks: ['CHECK_PIRATE'], readiness: 'execution_ready',
    delegated_decisions: ['DECISION_PIRATE'], quantities: [{ exact: 99 }]
  };
  const { prompt } = compileContract(null, { analyse, arbiter, apercu });
  const format = sectionBody(prompt, 'FORMAT DE SORTIE');

  assert.match(format, /^- Format technique : FORMAT_SURCHARGE$/m);
  assert.match(format, /^- Ton : TON_SURCHARGE$/m);
  assert.match(format, /^- Longueur indicative : LONGUEUR_SURCHARGE$/m);
  assert.match(format, /^- Plan attendu : PLAN_SURCHARGE$/m);

  assert.equal(sectionBody(prompt, 'OBJECTIF'), 'OBJECTIF_INTOUCHABLE');
  assert.match(format, /^- Livrable : LIVRABLE_INTOUCHABLE$/m);
  assert.equal(sectionBody(prompt, 'HYPOTHÈSES AUTORISÉES'), '- HYPOTHESE_INTOUCHABLE');
  assert.equal(sectionBody(prompt, 'OBLIGATIONS À RESPECTER'), '- OBLIGATION_INTOUCHABLE');
  for (const pirate of ['OBJECTIF_PIRATE', 'LIVRABLE_PIRATE', 'HYPOTHESE_PIRATE', 'OBLIGATION_PIRATE', 'CHECK_PIRATE', 'DECISION_PIRATE', '99']) {
    assert.equal(prompt.includes(pirate), false, `la surcharge ne peut pas injecter ${pirate}`);
  }
});

/* ==========================================================================
 * §43 — ANALYSE HOSTILE
 * ======================================================================= */

test('T-ARCH02-31 [ADVERSARIAL] une analyse hostile ne contamine aucune famille du prompt', () => {
  const analyse = analyseFixture();
  analyse.comprehension.intention_principale = 'HOSTILE_OBJECTIF';
  analyse.comprehension.intentions_secondaires = ['HOSTILE_SECONDAIRE'];
  analyse.comprehension.informations_manquantes = [{ information: 'HOSTILE_MANQUE', bloquant: false, justification: 'Non bloquante.' }];
  analyse.evaluation.action_recommandee = 'questionner';
  analyse.evaluation.questions_a_poser = ['HOSTILE_QUESTION ?'];
  analyse.evaluation.livrable_complet_possible = false;
  analyse.evaluation.connaissance_externe_necessaire = true;
  analyse.evaluation.actualite_requise = true;
  analyse.strategie.hypotheses_autorisees = ['HOSTILE_HYPOTHESE'];
  analyse.strategie.pilotage_incertitude = { decisions_autonomes: ['HOSTILE_DECISION'], estimations_a_etiqueter: [], inconnues_non_devineables: ['HOSTILE_INCONNUE'] };
  analyse.livrable = { nature: 'HOSTILE_LIVRABLE', format_technique: 'json', quantites: { min: 42, max: 42, unite: 'HOSTILE_UNITE' }, ton: 'HOSTILE_TON', longueur_indicative: 'HOSTILE_LONGUEUR' };

  const arbiter = withCandidate({
    objective: 'OFFICIEL_OBJECTIF', expected_deliverable: 'OFFICIEL_LIVRABLE',
    delegated_decisions: [], assumptions_allowed: [], remaining_unknowns: []
  });

  /* Le contrat OFFICIEL est construit sur une analyse cohérente ; l'analyse
     hostile est ensuite importée dans le moteur, mais n'a plus aucune voie. */
  const harness = createArchitecteHarness({ demande: DEMANDE });
  const officiel = enrichedContractFixture(harness, { arbiter, analyse: analyseFixture(), demande: DEMANDE });
  officiel.output.tone = 'OFFICIEL_TON';
  officiel.output.format = 'OFFICIEL_FORMAT';
  harness.importer(analyse);
  const prompt = harness.compiler(officiel);

  assert.equal(sectionBody(prompt, 'OBJECTIF'), 'OFFICIEL_OBJECTIF');
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Livrable : OFFICIEL_LIVRABLE$/m);
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Ton : OFFICIEL_TON$/m);
  assert.match(sectionBody(prompt, 'FORMAT DE SORTIE'), /^- Format technique : OFFICIEL_FORMAT$/m);
  for (const hostile of ['HOSTILE_OBJECTIF', 'HOSTILE_SECONDAIRE', 'HOSTILE_MANQUE', 'HOSTILE_QUESTION',
    'HOSTILE_HYPOTHESE', 'HOSTILE_DECISION', 'HOSTILE_INCONNUE', 'HOSTILE_LIVRABLE', 'HOSTILE_UNITE',
    'HOSTILE_TON', 'HOSTILE_LONGUEUR', 'minimum 42', 'maximum 42']) {
    assert.equal(prompt.includes(hostile), false, `contamination détectée : ${hostile}`);
  }
});

/* ==========================================================================
 * §44 — MATRICE DE CONTAMINATION : canonique A vs analyse B
 * ======================================================================= */

test('T-ARCH02-32 pour chaque famille migrée, la valeur canonique A l’emporte et la valeur brute B disparaît', () => {
  const familles = [
    ['objective', (a) => { a.comprehension.intention_principale = 'B_OBJECTIF'; }, (c) => { c.intent.objective = 'A_OBJECTIF'; }, 'A_OBJECTIF', 'B_OBJECTIF'],
    ['deliverable', (a) => { a.livrable = { ...a.livrable, nature: 'B_LIVRABLE' }; }, (c) => { c.intent.deliverable = 'A_LIVRABLE'; }, 'A_LIVRABLE', 'B_LIVRABLE'],
    ['output.format', (a) => { a.livrable = { ...a.livrable, format_technique: 'json' }; }, (c) => { c.output.format = 'A_FORMAT'; }, 'A_FORMAT', '"json"'],
    ['output.tone', (a) => { a.livrable = { ...a.livrable, ton: 'B_TON' }; }, (c) => { c.output.tone = 'A_TON'; }, 'A_TON', 'B_TON'],
    ['output.length_policy', (a) => { a.livrable = { ...a.livrable, longueur_indicative: 'B_LONGUEUR' }; }, (c) => { c.output.length_policy = 'A_LONGUEUR'; }, 'A_LONGUEUR', 'B_LONGUEUR'],
    ['assumptions.forbidden', (a) => { a.strategie.hypotheses_interdites = ['B_INTERDITE']; }, (c) => { c.assumptions.forbidden = [{ text: 'A_INTERDITE', source: 'arch_analysis', origin_field: 'x' }]; }, 'A_INTERDITE', 'B_INTERDITE'],
    ['checks', (a) => { a.verification.criteres_qualitatifs = ['B_CHECK']; }, (c) => { c.checks = [{ id: 'a', type: 'heuristic', target: 'deliverable', rule: 'A_CHECK', blocking: false, source: 'arch_analysis', arch_source_field: 'x', obligation_ids: [] }]; }, 'A_CHECK', 'B_CHECK'],
    ['obligations', (a) => { a.verification.criteres_bloquants = ['B_OBLIGATION']; }, (c) => { c.obligations = [{ id: 'a', text: 'A_OBLIGATION', source: 'arch_analysis', promoted_from: 'x', mandatory: true, check_ids: [] }]; c.checks = []; }, 'A_OBLIGATION', 'B_OBLIGATION'],
    ['quantities', (a) => { a.livrable = { ...a.livrable, quantites: { min: 11, max: 11, unite: 'B_UNITE' } }; }, (c) => { c.quantities = [{ target: 'A_UNITE', unit: 'A_UNITE', exact: 5, min: null, max: null, source: 'user_explicit' }]; }, 'A_UNITE', 'B_UNITE']
  ];
  let contamination = 0;
  for (const [famille, mutateAnalyse, mutateContrat, attendu, interdit] of familles) {
    const analyse = analyseFixture();
    mutateAnalyse(analyse);
    const { prompt } = compileContract(mutateContrat, { analyse });
    assert.ok(prompt.includes(attendu), `${famille} : la valeur canonique A doit être projetée`);
    if (prompt.includes(interdit)) contamination += 1;
  }
  assert.equal(contamination, 0, 'LEGACY_SEMANTIC_CONTAMINATION_COUNT = 0');
});

/* ==========================================================================
 * §35–36 — PARITÉ DE PROJECTION
 * ======================================================================= */

test('T-ARCH02-33 [PARITÉ] la structure du prompt est conservée sur neuf cas représentatifs', () => {
  const SOCLE = ['DEMANDE ORIGINALE', 'FORMAT DE SORTIE', 'VÉRIFICATION AVANT ENVOI'];
  const cas = {
    simple: {},
    vague: { arbiter: withCandidate({ objective: '', expected_deliverable: '' }) },
    complexe: {
      arbiter: withCandidate({ assumptions_allowed: ['H.'], delegated_decisions: ['D.'], remaining_unknowns: ['U.'], external_facts_to_research: ['F.'] }),
      analyse: (() => { const a = analyseFixture(); a.verification.criteres_bloquants = ['C.']; return a; })()
    },
    contraintes_explicites: { arbiter: arbiterFixture({ operational_request_candidate: candidate({ confirmed_constraints: ['Contrainte confirmée.'] }) }) },
    quantite_exacte: { mutate: (c) => { c.quantities = [{ target: 'points', unit: 'points', exact: 4, min: null, max: null, source: 'user_explicit' }]; } },
    hypotheses_interdites: { analyse: (() => { const a = analyseFixture(); a.strategie.hypotheses_interdites = ['Interdite.']; return a; })() },
    provenance: { arbiter: withCandidate({ external_facts_to_research: ['Fait externe.'] }) },
    output_ton_format: { mutate: (c) => { c.output.tone = 'sobre'; c.output.format = 'markdown'; } },
    scope_exclusion: { analyse: (() => { const a = analyseFixture(); a.compilation.composants_ecartes = [{ type: 'section', titre: 'X', raison: 'Hors périmètre.' }]; return a; })() }
  };

  const diffs = [];
  for (const [nom, options] of Object.entries(cas)) {
    const { prompt } = compileContract(options.mutate, { analyse: options.analyse || analyseFixture(), arbiter: options.arbiter || arbiterFixture() });
    const titres = sectionTitles(prompt);
    for (const requis of SOCLE) {
      if (!titres.includes(requis)) diffs.push(`${nom} : section ${requis} manquante`);
    }
    /* Aucune section ne peut apparaître deux fois : le compilateur ne duplique rien. */
    if (new Set(titres).size !== titres.length) diffs.push(`${nom} : section dupliquée`);
    /* Aucune section vide : ce que le contrat ne porte pas n'est pas émis. */
    for (const titre of titres) {
      if (!sectionBody(prompt, titre)) diffs.push(`${nom} : section vide ${titre}`);
    }
  }
  assert.deepEqual(diffs, [], 'UNEXPECTED_PROMPT_DIFFS = 0');
});

/* ==========================================================================
 * §38 — MATRICE DE CONSOMMATION DES CHAMPS CANONIQUES
 * ======================================================================= */

test('T-ARCH02-34 [MATRICE] chaque famille canonique déclarée projetée l’est réellement', () => {
  const { contract } = contractFor();
  const projection = canonicalToArchProjectionInput(contract);

  /* PROJETÉ — la projection expose la famille au compilateur. */
  for (const famille of ['objective', 'deliverable', 'role', 'output', 'quantities', 'assumptions',
    'obligations', 'checks', 'executability', 'evidence', 'semantic_lock_signals', 'selected_locks',
    'delegated_decisions', 'preferences']) {
    assert.ok(famille in projection, `${famille} doit être exposé par la projection`);
  }
  /* IGNORÉ — exposé mais volontairement non rendu dans le prompt aujourd'hui.
     La perte est déclarée ici, elle n'est jamais silencieuse. */
  for (const famille of ['secondary_objectives', 'priorities', 'explicit_constraints', 'recipient',
    'original_request', 'request_id']) {
    assert.ok(famille in projection, `${famille} reste disponible pour un lot ultérieur`);
  }
  /* La projection n'invente jamais : aucune valeur hors du contrat. */
  assert.equal(projection.objective, contract.intent.objective);
  assert.equal(projection.deliverable, contract.intent.deliverable);
  assert.equal(projection.semantic_source, ARCH_COMPILER_SEMANTIC_SOURCE);
});

/* ==========================================================================
 * §49 / §50 — AUCUN HARDCODING, CHAÎNE DE BUILD INTACTE
 * ======================================================================= */

test('T-ARCH02-35 DOMAIN_HARDCODING_ADDED = NO', () => {
  const sources = [
    stripComments(fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8')),
    compilerLayer()
  ];
  for (const source of sources) {
    for (const interdit of ['case_id', 'embedding', 'fuzzy', 'levenshtein', 'similarity', 'corpus', 'metier', 'domaine']) {
      assert.equal(source.toLowerCase().includes(interdit), false, `aucun ancrage de domaine (${interdit})`);
    }
    assert.equal(/\btoLowerCase\(\)\s*\.\s*includes\(/.test(source), false, 'aucun appariement de mots-clés métier');
  }
  /* execution_role est une recopie structurelle, jamais une reformulation. */
  assert.ok(ARCH_ENRICHABLE_PATHS.includes('execution_role'));
});

test('T-ARCH02-36 la chaîne de build expose la projection au navigateur', () => {
  const build = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
  for (const nom of ['canonicalToArchProjectionInput', 'activeArchSemanticSourceCount', 'ARCH_COMPILER_SEMANTIC_SOURCE']) {
    assert.ok(build.includes(`'${nom}'`), `${nom} doit être exporté par le build`);
    assert.ok(BROWSER_RUNTIME.includes(nom), `${nom} doit être présent dans le bundle généré`);
    assert.ok(HTML.includes(nom), `${nom} doit être présent dans le runtime embarqué du HTML`);
  }
  assert.match(compilerLayer(), /window\.__ATELIER_ADN_RUNTIME__[\s\S]*canonicalToArchProjectionInput/,
    'le compilateur utilise l’unique implémentation de projection du noyau');
});

/* ==========================================================================
 * §52 — CARTE DES CONSOMMATEURS APRÈS MIGRATION
 * ======================================================================= */

test('T-ARCH02-37 [CARTE] aucun consommateur aval actif ne lit archAnalyse comme source sémantique', () => {
  const consommateurs = {
    /* nom : [tranche de production, lecture brute autorisée ?] */
    archCompiler: [compilerBody(), false],
    adnCompactContractForArchitecte: [productionSlice('function adnCompactContractForArchitecte(', 'function adnAssessArchitecteReadiness('), false],
    canonicalToArchProjectionInput: [fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8').slice(
      fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8').indexOf('export function canonicalToArchProjectionInput'),
      fs.readFileSync(path.join(root, 'core/adn/arch-canonical-enrichment.js'), 'utf8').indexOf('export function activeArchSemanticSourceCount')
    ), false]
  };
  for (const [nom, [slice, autorise]] of Object.entries(consommateurs)) {
    const nettoye = slice.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/\barchAnalyse\b/.test(nettoye), autorise, `${nom} : lecture brute de archAnalyse`);
  }
  /* adnCompactContractForArchitecte est PROJECTION-ONLY sur le contrat ADN. */
  const compact = productionSlice('function adnCompactContractForArchitecte(', 'function adnAssessArchitecteReadiness(');
  assert.match(compact, /adpState\.lastEnvelope/, 'sa source est l’enveloppe, dérivée de la base canonique');
  assert.equal(/comprehension|strategie|livrable\b/.test(compact), false, 'elle ne reconstruit aucune sémantique 3.4');
});
