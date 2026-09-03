/* READINESS-00 — SUPPRESSION DE LA SECONDE AUTORITÉ DE READINESS ARCHITECTE
 * ============================================================================
 *
 * Ces tests sont des EXIGENCES PRODUIT, pas de la caractérisation.
 * Ils énoncent l'invariant de gouvernance CDC v1.7 :
 *
 *     CANONICAL_EXECUTABLE  <=>  OPRIE.state === 'operational_request_ready'
 *
 * Architecte peut READ, COMPARE, VALIDATE, SIGNAL. Jamais MUTATE, jamais
 * décider, jamais poser de question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFragmentBounds,
  loadPostOprieValidator,
  canonicalFrom,
  productionSlice,
  oprieReadyTurn,
  coherentAnalysis
} from './post-oprie-validation-harness.helper.mjs';

const SIGNALS = ['CONTRACT_INCONSISTENT', 'EXECUTION_UNSAFE', 'MISSING_PROJECTION_DATA', 'TECHNICAL_STOP'];

/** Tranche du chemin de production API (clé BYO) et du chemin par fichier. */
const apiPath = () => productionSlice('async function beginApiAnalysis', 'function compositeDemand');
const importedPath = () => productionSlice('function useAnalysis', 'function showQuestion');

test('READINESS-00 — le harnais charge bien le fragment de validation attendu', () => {
  assert.deepEqual(assertFragmentBounds(), []);
});

/* ==========================================================================
 * ÉTATS OPRIE — SEUL operational_request_ready EST EXÉCUTABLE
 * ======================================================================= */

test('T-READINESS-01 OPRIE READY + analyse cohérente → aucun signal, exécution autorisée', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const result = validate(coherentAnalysis(), oprieReadyTurn());

  assert.equal(result.ok, true);
  assert.deepEqual(result.signals, []);
});

for (const [id, state] of [['02', 'confirmation_required'], ['03', 'clarification_required'], ['04', 'blocked']]) {
  test(`T-READINESS-${id} OPRIE ${state} → jamais exécutable`, () => {
    const { validateFromTurn: validate } = loadPostOprieValidator();
    const result = validate(coherentAnalysis(), oprieReadyTurn({ state }));

    assert.equal(result.ok, false, `${state} ne doit jamais autoriser l'exécution`);
    assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
    assert.equal(result.signals[0].canonical_field, 'executability.oprie_state');
    assert.equal(result.signals[0].return_to_oprie, true);
    assert.match(result.signals[0].detail, new RegExp(state));
  });
}

test('T-READINESS-04b un tour OPRIE absent ou malformé n’autorise jamais l’exécution', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  for (const turn of [null, undefined, {}, { state: '' }, { state: 'operational_request_readyy' }, 'operational_request_ready']) {
    const result = validate(coherentAnalysis(), turn);
    assert.equal(result.ok, false, `tour ${JSON.stringify(turn)} ne doit pas autoriser l'exécution`);
    assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
  }
});

/* ==========================================================================
 * CHAMPS OPRIE PROTÉGÉS — SIGNAL, JAMAIS ÉCRITURE
 * ======================================================================= */

test('T-READINESS-05 objectif OPRIE non repris par l’analyse → CONTRACT_INCONSISTENT', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.comprehension.intention_principale = '   ';

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
  assert.equal(result.signals[0].canonical_field, 'intent.objective');
  assert.equal(result.signals[0].return_to_oprie, true);
});

test('T-READINESS-06 nouvel objectif secondaire → CONTRACT_INCONSISTENT, secondary_objectives inchangé', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const turn = oprieReadyTurn();
  const before = JSON.stringify(turn.operational_request_candidate.secondary_objectives);

  const analysis = coherentAnalysis();
  analysis.comprehension.intentions_secondaires = ['Un objectif secondaire non validé.'];

  const result = validate(analysis, turn);
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].canonical_field, 'intent.secondary_objectives');
  assert.equal(JSON.stringify(turn.operational_request_candidate.secondary_objectives), before,
    'le validateur ne doit jamais écrire dans le champ protégé');
});

test('T-READINESS-07 décision autonome non déléguée → CONTRACT_INCONSISTENT, delegated_decisions inchangé', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const turn = oprieReadyTurn();
  const before = JSON.stringify(turn.operational_request_candidate.delegated_decisions);

  const analysis = coherentAnalysis();
  analysis.strategie.pilotage_incertitude.decisions_autonomes = ['Choix non délégué.'];

  const result = validate(analysis, turn);
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].canonical_field, 'intent.delegated_decisions');
  assert.equal(JSON.stringify(turn.operational_request_candidate.delegated_decisions), before);
});

test('T-READINESS-07b hypothèse non autorisée → CONTRACT_INCONSISTENT, assumptions.allowed inchangé', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const turn = oprieReadyTurn();
  const before = JSON.stringify(turn.operational_request_candidate.assumptions_allowed);

  const analysis = coherentAnalysis();
  analysis.strategie.hypotheses_autorisees = ['Hypothèse que personne n’a autorisée.'];

  const result = validate(analysis, turn);
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].canonical_field, 'assumptions.allowed');
  assert.equal(JSON.stringify(turn.operational_request_candidate.assumptions_allowed), before);
});

test('T-READINESS-08 ambiguïté après READY → signal de validation, executability inchangé', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const turn = oprieReadyTurn();
  const snapshot = JSON.stringify(turn);

  const analysis = coherentAnalysis();
  analysis.comprehension.ambiguites = ['Une ambiguïté non cataloguée.'];

  const result = validate(analysis, turn);
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
  assert.equal(result.signals[0].canonical_field, 'executability.substitutable_missing');
  assert.equal(JSON.stringify(turn), snapshot, 'aucune mutation du tour OPRIE');
});

test('T-READINESS-09 inconnue déterminante après READY → EXECUTION_UNSAFE, executability inchangé', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const turn = oprieReadyTurn();
  const snapshot = JSON.stringify(turn);

  const analysis = coherentAnalysis();
  analysis.comprehension.informations_manquantes = [
    { information: 'Donnée déterminante', bloquant: true, justification: 'Change le résultat.' }
  ];

  const result = validate(analysis, turn);
  assert.equal(result.ok, false);
  assert.ok(['EXECUTION_UNSAFE', 'CONTRACT_INCONSISTENT'].includes(result.signals[0].signal));
  assert.equal(result.signals[0].signal, 'EXECUTION_UNSAFE');
  assert.equal(result.signals[0].canonical_field, 'executability.critical_missing');
  assert.equal(JSON.stringify(turn), snapshot);
});

// CORRECTION-READINESS-00-01 : ces deux tests figeaient les jugements de readiness
// Architecte comme déclencheurs bloquants. C'était une autorité indirecte, retirée
// par décision de gouvernance. Ils affirment désormais l'exigence INVERSE : ces
// conclusions ne bloquent plus rien à elles seules.
test('T-READINESS-09b livrable_complet_possible=false ne bloque plus à lui seul', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.livrable_complet_possible = false;

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true, 'une conclusion de readiness Architecte n’est pas une preuve structurelle');
  assert.deepEqual(result.signals, []);
});

test('T-READINESS-09c « questionner » après READY ne produit ni signal ni question', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.action_recommandee = 'questionner';
  analysis.evaluation.questions_a_poser = ['Quelle contrainte s’applique ?'];

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true);
  assert.deepEqual(result.signals, []);
  assert.equal(JSON.stringify(result).includes('Quelle contrainte'), false);
});

/* ==========================================================================
 * MISSING_PROJECTION_DATA ET TECHNICAL_STOP
 * ======================================================================= */

test('T-READINESS-10 donnée de projection manquante → MISSING_PROJECTION_DATA, sans retour OPRIE ni question', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  for (const [mutate, field] of [
    [(a) => { a.livrable.nature = ''; }, 'intent.deliverable'],
    [(a) => { a.livrable.format_technique = ''; }, 'output.format'],
    [(a) => { a.strategie.role_adaptatif.mission = ''; }, null]
  ]) {
    const analysis = coherentAnalysis();
    mutate(analysis);
    const result = validate(analysis, oprieReadyTurn());

    assert.equal(result.ok, false);
    const signal = result.signals.find((s) => s.signal === 'MISSING_PROJECTION_DATA');
    assert.ok(signal, 'un signal MISSING_PROJECTION_DATA est attendu');
    if (field) assert.equal(signal.canonical_field, field);
    assert.equal(signal.return_to_oprie, false, 'ce signal ne remonte pas vers OPRIE par défaut');
  }
});

test('T-READINESS-11 analyse absente ou invalide → TECHNICAL_STOP', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  for (const analysis of [null, undefined, 'texte', 42, []]) {
    const result = validate(analysis, oprieReadyTurn());
    assert.equal(result.ok, false);
    assert.equal(result.signals[0].signal, 'TECHNICAL_STOP');
    assert.equal(result.signals[0].return_to_oprie, false);
  }

  const incomplete = coherentAnalysis();
  delete incomplete.verification;
  const result = validate(incomplete, oprieReadyTurn());
  assert.equal(result.signals[0].signal, 'TECHNICAL_STOP');
  assert.equal(result.signals[0].arch_source_field, 'verification');
});

test('T-READINESS-12 un TECHNICAL_STOP n’est jamais converti en READY par repli local', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  /* Analyse absente ET tour OPRIE absent : le pire cas doit rester fail-closed. */
  const result = validate(null, null);
  assert.equal(result.ok, false);
  assert.equal(result.signals[0].signal, 'TECHNICAL_STOP');
  assert.equal(JSON.stringify(result).includes('execution_ready'), false);
  assert.equal(JSON.stringify(result).includes('operational_request_ready'), false);
});

/* ==========================================================================
 * ABSENCE D'AUTORITÉ SECONDAIRE — PREUVES COMPORTEMENTALES
 * ======================================================================= */

test('T-READINESS-13 le validateur n’émet jamais execution_ready : sa sortie est un booléen et des signaux', () => {
  const { validateFromTurn: validate, SIGNALS: allowed } = loadPostOprieValidator();
  assert.deepEqual(allowed, SIGNALS, 'l’énumération des signaux est close');

  const cases = [
    [coherentAnalysis(), oprieReadyTurn()],
    [coherentAnalysis(), oprieReadyTurn({ state: 'blocked' })],
    [null, oprieReadyTurn()]
  ];
  for (const [analysis, turn] of cases) {
    const result = validate(analysis, turn);
    assert.deepEqual(Object.keys(result).sort(), ['ok', 'signals']);
    assert.equal(typeof result.ok, 'boolean');
    for (const s of result.signals) assert.ok(SIGNALS.includes(s.signal));
    assert.equal(JSON.stringify(result).includes('execution_ready'), false);
  }
});

test('T-READINESS-14 aucun signal ne porte de question, sous aucune forme', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  const divergent = coherentAnalysis();
  divergent.evaluation.action_recommandee = 'questionner';
  divergent.evaluation.questions_a_poser = ['QUESTION_ARCHITECTE'];
  /* Le seul déclencheur valide ici est STRUCTUREL : une information typée bloquante. */
  divergent.comprehension.informations_manquantes = [
    { information: 'INFO_BLOQUANTE', bloquant: true, justification: 'JUSTIF' }
  ];

  const result = validate(divergent, oprieReadyTurn());
  for (const s of result.signals) {
    assert.deepEqual(Object.keys(s).sort(),
      ['arch_source_field', 'canonical_field', 'detail', 'return_to_oprie', 'signal'],
      'la forme du signal est close : aucun champ question, aucun champ state');
  }
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('QUESTION_ARCHITECTE'), false);
  assert.equal(serialized.includes('INFO_BLOQUANTE'), false, 'aucun contenu utilisateur ne fuit dans un signal');
});

test('T-READINESS-15 remaining_candidate_questions ne pilote plus rien sur le chemin de production', () => {
  for (const slice of [apiPath(), importedPath()]) {
    assert.equal(slice.includes('remaining_candidate_questions'), false);
    assert.equal(slice.includes('showQuestion('), false, 'aucune question n’est posée après READY');
    assert.equal(slice.includes("execution_ready"), false, 'aucune décision execution_ready ne subsiste');
    assert.equal(slice.includes('clarification_required'), false);
    assert.equal(slice.includes('adnAssessArchitecteReadiness'), false);
    assert.equal(slice.includes('adnNextConversationAction'), false);
    assert.ok(slice.includes('adnValidatePostOprie'), 'la validation post-OPRIE gouverne le passage');
  }
});

test('T-READINESS-16 return_to_oprie ne déclenche aucune question Architecte', () => {
  const { validateFromTurn: validate, showStop, ui } = loadPostOprieValidator();

  const analysis = coherentAnalysis();
  analysis.comprehension.intentions_secondaires = ['Objectif non validé.'];
  const result = validate(analysis, oprieReadyTurn());

  const signal = result.signals[0];
  assert.equal(signal.return_to_oprie, true);

  const outcome = showStop(result.signals);
  assert.equal(outcome, false, 'l’arrêt est fail-closed : la production ne continue pas');
  assert.equal(ui.gate.length, 1);
  assert.equal(ui.gate[0].state, 'blocked');
  assert.equal(/\?/.test(ui.gate[0].text), false, 'le message d’arrêt ne pose pas de question');
});

test('T-READINESS-16b l’arrêt fail-closed couvre les quatre signaux et n’ouvre jamais de dialogue', () => {
  const { showStop, stopUi, ui } = loadPostOprieValidator();
  assert.deepEqual(Object.keys(stopUi).sort(), [...SIGNALS].sort());

  for (const signal of SIGNALS) {
    const outcome = showStop([{ signal, canonical_field: null, arch_source_field: null, detail: '', return_to_oprie: false }]);
    assert.equal(outcome, false);
  }
  assert.equal(ui.gate.length, SIGNALS.length);
  for (const gate of ui.gate) {
    assert.ok(['blocked', 'technical'].includes(gate.state));
    assert.equal(/\?/.test(gate.text), false);
  }
});

test('T-READINESS-16c un tableau de signaux vide ou inconnu retombe sur un arrêt technique, jamais sur la production', () => {
  const { showStop, ui } = loadPostOprieValidator();
  for (const input of [[], null, undefined, [{ signal: 'INCONNU' }]]) {
    assert.equal(showStop(input), false);
  }
  for (const gate of ui.gate) assert.equal(gate.state, 'technical');
});

/* ==========================================================================
 * NON-RÉGRESSION RAPIDE
 * ======================================================================= */

test('T-READINESS-17 / T-READINESS-18 le mode Rapide reste strictement inchangé', () => {
  /* Rapide n'exécute pas archAnalyse et n'emprunte pas la validation post-OPRIE :
     sa politique R1 est pilotée par oprieApplyTurn, sur les seuls états OPRIE. */
  const rapide = productionSlice('async function v11StartRapide', 'async function v11StartArchitecte');
  assert.equal(rapide.includes('adnValidatePostOprie'), false);
  assert.equal(rapide.includes('archAnalyse'), false);
  assert.ok(rapide.includes("oprieRunTurn('rapide')"));

  /* IA-02A : l'aiguillage des états OPRIE a quitté le corps de oprieApplyTurn pour LA politique
     d'orchestration, embarquée dans le même HTML. Les cinq états y restent traités par un seul
     endroit — l'invariant est inchangé, son domicile a bougé. */
  const policy = productionSlice('function decideNextOrchestrationAction', 'function oprieActionIsModeIndependent');
  for (const state of ['clarification_required', 'confirmation_required', 'blocked', 'degraded_state', 'operational_request_ready']) {
    assert.ok(policy.includes(state) || productionSlice('const ACCEPTED_OPRIE_STATES', 'const ACCEPTED_PROMPT_GATE_STATUSES').includes(state),
      `l'état ${state} reste traité par l'aiguillage unique`);
  }
  const dispatch = productionSlice('function oprieApplyTurn(', 'function oprieRunTurn(');
  assert.equal(dispatch.includes('adnValidatePostOprie'), false,
    'la validation post-OPRIE reste hors du routage des états OPRIE');
  assert.equal(policy.includes('adnValidatePostOprie'), false,
    'et la politique ne la connaît pas davantage');
});

/* ==========================================================================
 * DÉTERMINISME, RÉSEAU, ABSENCE DE HARDCODING MÉTIER
 * ======================================================================= */

test('T-READINESS-19 mêmes entrées → mêmes signaux', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.comprehension.ambiguites = ['A'];
  analysis.livrable.format_technique = '';

  const a = validate(analysis, oprieReadyTurn());
  const b = validate(analysis, oprieReadyTurn());
  assert.deepEqual(a, b);
  assert.ok(a.signals.length >= 2, 'plusieurs signaux peuvent coexister');
});

test('T-READINESS-20 la validation n’introduit aucun appel réseau', () => {
  const { validateFromTurn: validate, network } = loadPostOprieValidator();
  validate(coherentAnalysis(), oprieReadyTurn());
  validate(null, null);
  validate(coherentAnalysis(), oprieReadyTurn({ state: 'blocked' }));
  assert.deepEqual(network, []);
});

test('T-READINESS-21 aucun vocabulaire métier n’est introduit dans la couche de validation', () => {
  const fragment = productionSlice('const ADN_POST_OPRIE_SIGNALS=', 'function adnNextConversationAction(').toLowerCase();
  for (const forbidden of ['juridique', 'médical', 'medical', ' rh ', 'finance', 'voyage', 'neuro', 'recrutement', 'immobilier', 'santé']) {
    assert.equal(fragment.includes(forbidden), false, `terme métier interdit détecté : ${forbidden}`);
  }
  /* Les détections doivent rester structurelles : présence, comptage, énumération. */
  assert.equal(/\.match\(|\.test\(|includes\(['"][a-zà-ÿ]{4,}/.test(fragment), false,
    'aucun appariement de contenu textuel utilisateur');
});

/* ==========================================================================
 * STRUCTURE DU CHEMIN DE PRODUCTION
 * ======================================================================= */

test('T-READINESS-22 ARCHITECTE_SECONDARY_READINESS_AUTHORITY = ABSENT sur les deux chemins', () => {
  for (const [name, slice] of [['API BYO', apiPath()], ['import fichier', importedPath()]]) {
    /* La compilation n'est atteinte qu'après une validation sans signal. */
    const gate = slice.indexOf('adnValidatePostOprie');
    const compile = slice.indexOf('api.compiler(');
    assert.ok(gate > -1 && compile > gate, `${name} : la compilation suit la validation`);
    /* ADN-ARCH-02 : le compilateur ne reçoit que le contrat canonique enrichi. */
    assert.ok(slice.includes('api.compiler(enrichment&&enrichment.contract)'),
      `${name} : la compilation consomme le contrat canonique enrichi`);
    /* CORRECTION-ADN-ARCH-01-01 : l'arrêt porte sur la fusion des signaux. */
    assert.ok(slice.includes('if(stopSignals.length)'), `${name} : arrêt fail-closed avant compilation`);
    assert.ok(slice.indexOf('if(stopSignals.length)') < compile, `${name} : l'arrêt précède la compilation`);
    assert.ok(slice.includes('adnShowPostOprieStop'), `${name} : l'arrêt passe par l'affichage fail-closed`);
  }
});

test('T-READINESS-23 les champs OPRIE protégés sont strictement immuables à la validation', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  /* Analyse maximalement divergente : chaque détection est déclenchée. */
  const analysis = coherentAnalysis();
  analysis.comprehension.intention_principale = '';
  analysis.comprehension.intentions_secondaires = ['X'];
  analysis.comprehension.ambiguites = ['Y'];
  analysis.comprehension.informations_manquantes = [{ information: 'Z', bloquant: true, justification: 'J' }];
  analysis.strategie.hypotheses_autorisees = ['H'];
  analysis.strategie.pilotage_incertitude.decisions_autonomes = ['D'];
  analysis.evaluation.action_recommandee = 'questionner';
  analysis.evaluation.livrable_complet_possible = false;
  analysis.livrable.nature = '';

  const turn = oprieReadyTurn();
  const snapshot = JSON.stringify(turn);
  const analysisSnapshot = JSON.stringify(analysis);

  const result = validate(analysis, turn);

  assert.equal(result.ok, false);
  assert.ok(result.signals.length >= 6, 'toutes les divergences sont signalées');
  assert.equal(JSON.stringify(turn), snapshot, 'le tour OPRIE est inchangé, champ pour champ');
  assert.equal(JSON.stringify(analysis), analysisSnapshot, 'l’analyse est inchangée : le validateur est pur');
});

/* ==========================================================================
 * CORRECTION-READINESS-00-01
 * Les jugements de readiness Architecte n'ont plus aucune autorité bloquante,
 * ni directe ni indirecte. Tout signal bloquant cite un fait structurel.
 * ======================================================================= */

const READINESS_JUDGMENT_FIELDS = ['action_recommandee', 'livrable_complet_possible', 'questions_a_poser'];

test('T-READINESS-30 action_recommandee=questionner seul → aucun signal, aucun blocage', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.action_recommandee = 'questionner';

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true);
  assert.deepEqual(result.signals, []);
});

test('T-READINESS-31 livrable_complet_possible=false seul → aucun signal, aucun blocage', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.livrable_complet_possible = false;

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true);
  assert.deepEqual(result.signals, []);
});

test('T-READINESS-32 questions_a_poser non vide seul → aucun signal, aucune question, aucun retour OPRIE', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.questions_a_poser = ['Une question que personne ne posera.'];

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true);
  assert.deepEqual(result.signals, []);
  assert.equal(JSON.stringify(result).includes('Une question'), false);
});

test('T-READINESS-33 la preuve d’un EXECUTION_UNSAFE est l’information typée, jamais la conclusion', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.livrable_complet_possible = false;
  analysis.comprehension.informations_manquantes = [
    { information: 'Donnée déterminante', bloquant: true, justification: 'Change le résultat.' }
  ];

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, false);
  const unsafe = result.signals.filter((s) => s.signal === 'EXECUTION_UNSAFE');
  assert.equal(unsafe.length, 1, 'un seul signal, issu du fait structurel');
  assert.equal(unsafe[0].arch_source_field, 'comprehension.informations_manquantes');
  for (const s of result.signals) {
    assert.notEqual(s.arch_source_field, 'evaluation.livrable_complet_possible');
  }
});

test('T-READINESS-34 la preuve d’un CONTRACT_INCONSISTENT est le champ protégé, jamais action_recommandee', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.action_recommandee = 'questionner';
  analysis.comprehension.intentions_secondaires = ['Objectif secondaire non validé.'];

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, false);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].signal, 'CONTRACT_INCONSISTENT');
  assert.equal(result.signals[0].canonical_field, 'intent.secondary_objectives');
  assert.equal(result.signals[0].arch_source_field, 'comprehension.intentions_secondaires');
});

test('T-READINESS-35 les trois jugements réunis, sans autre défaut → aucun signal, continuation autorisée', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();
  const analysis = coherentAnalysis();
  analysis.evaluation.action_recommandee = 'questionner';
  analysis.evaluation.livrable_complet_possible = false;
  analysis.evaluation.questions_a_poser = ['Q1', 'Q2'];
  analysis.evaluation.reponse_partielle_possible = true;

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, true, 'aucune conclusion Architecte ne recrée une readiness indirecte');
  assert.deepEqual(result.signals, []);
});

test('T-READINESS-36 ARCH_READINESS_JUDGMENTS_HAVE_BLOCKING_AUTHORITY = NO — individuellement et ensemble', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  const mutations = {
    action_recommandee: (a) => { a.evaluation.action_recommandee = 'arreter'; },
    livrable_complet_possible: (a) => { a.evaluation.livrable_complet_possible = false; },
    questions_a_poser: (a) => { a.evaluation.questions_a_poser = ['Q']; }
  };

  /* Individuellement. */
  for (const [field, mutate] of Object.entries(mutations)) {
    const analysis = coherentAnalysis();
    mutate(analysis);
    const result = validate(analysis, oprieReadyTurn());
    assert.equal(result.ok, true, `${field} ne doit pas bloquer seul`);
    assert.deepEqual(result.signals, [], `${field} ne doit produire aucun signal`);
  }

  /* Ensemble, avec toutes les valeurs de l'énumération action_recommandee. */
  for (const action of ['continuer', 'questionner', 'produire_partiellement', 'arreter']) {
    const analysis = coherentAnalysis();
    analysis.evaluation.action_recommandee = action;
    analysis.evaluation.livrable_complet_possible = false;
    analysis.evaluation.questions_a_poser = ['Q'];
    const result = validate(analysis, oprieReadyTurn());
    assert.equal(result.ok, true, `action_recommandee=${action} ne doit pas bloquer`);
  }
});

test('T-READINESS-37 aucun signal bloquant ne cite un champ de evaluation comme preuve', () => {
  const { validateFromTurn: validate } = loadPostOprieValidator();

  /* Analyse maximalement divergente : chaque déclencheur structurel est armé,
     et les trois jugements de readiness sont présents en même temps. */
  const analysis = coherentAnalysis();
  analysis.comprehension.intention_principale = '';
  analysis.comprehension.intentions_secondaires = ['X'];
  analysis.comprehension.ambiguites = ['Y'];
  analysis.comprehension.informations_manquantes = [{ information: 'Z', bloquant: true, justification: 'J' }];
  analysis.strategie.hypotheses_autorisees = ['H'];
  analysis.strategie.pilotage_incertitude.decisions_autonomes = ['D'];
  analysis.livrable.nature = '';
  analysis.evaluation.action_recommandee = 'questionner';
  analysis.evaluation.livrable_complet_possible = false;
  analysis.evaluation.questions_a_poser = ['Q'];

  const result = validate(analysis, oprieReadyTurn());
  assert.equal(result.ok, false);
  assert.ok(result.signals.length >= 6);

  for (const s of result.signals) {
    assert.equal(String(s.arch_source_field || '').startsWith('evaluation.'), false,
      `un signal cite ${s.arch_source_field} : une conclusion de readiness ne peut pas être une preuve`);
    for (const field of READINESS_JUDGMENT_FIELDS) {
      assert.equal(JSON.stringify(s).includes(field), false, `le signal ne doit pas mentionner ${field}`);
    }
  }
});

test('T-READINESS-38 le validateur ne lit plus aucun champ de evaluation', () => {
  /* Preuve comportementale : faire varier TOUS les champs de `evaluation` ne change
     jamais le résultat, quel que soit l'état par ailleurs. */
  const { validateFromTurn: validate } = loadPostOprieValidator();

  const variants = (base) => {
    const a = coherentAnalysis(base);
    a.evaluation = {
      niveau_risque: 'eleve', justification_risque: 'X',
      connaissance_externe_necessaire: true, actualite_requise: true,
      justification_connaissance: 'X', calcul_requis: true,
      livrable_complet_possible: false, reponse_partielle_possible: true,
      action_recommandee: 'arreter', questions_a_poser: ['Q'], parties_realisables_immediatement: ['P']
    };
    return a;
  };

  const neutre = validate(coherentAnalysis(), oprieReadyTurn());
  const charge = validate(variants(), oprieReadyTurn());
  assert.deepEqual(charge, neutre, 'evaluation.* n’influence plus la validation');

  const divergent = coherentAnalysis();
  divergent.comprehension.ambiguites = ['A'];
  const divergentCharge = variants();
  divergentCharge.comprehension.ambiguites = ['A'];
  assert.deepEqual(validate(divergentCharge, oprieReadyTurn()), validate(divergent, oprieReadyTurn()));
});
