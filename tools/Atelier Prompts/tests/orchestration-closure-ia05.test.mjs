/* IA-05 — CLÔTURE DE L'ORCHESTRATION INTELLIGENTE.
 * ============================================================================
 *
 * Ce lot ne construit rien. Il prouve que ce qui a été construit est FERMÉ.
 *
 * « Fermé » veut dire une chose précise, et vérifiable : pour chaque décision
 * du système, il existe exactement UNE autorité, et aucun autre chemin actif ne
 * peut la contourner. Un système où subsisterait un second chemin ne serait pas
 * « presque fermé » — il serait ouvert, et le second chemin déciderait un jour
 * autrement que le premier.
 *
 * Les tests d'ici sont des SENTINELLES DE CLÔTURE. Ils ne décrivent pas l'état
 * actuel : ils échouent si quelqu'un rouvre ce qui a été fermé. C'est leur seule
 * raison d'exister, et c'est ce qui permet aux lots MODE-* de s'appuyer dessus.
 *
 * Une limite est portée explicitement plutôt que masquée : EXEC-PHASE-INSTRUMENT-01.
 * L'unicité de l'exécution est garantie par le garde D'ENTRÉE du cycle, pas par
 * une instrumentation phase par phase à l'intérieur du moteur Architecte — qui
 * est une plage gelée, et que ce lot n'a pas le droit de modifier.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNextOrchestrationAction, ORCHESTRATION_ACTIONS, isKnownOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { createExecutionLifecycle, assertExecutionProvenance, assertOutputProvenance, EXECUTION_PHASES } from '../core/adn/execution-lifecycle.js';
import { loadPilot, loadAnswerQuestion, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const POLICY = lire('core/adn/orchestration-policy.js');
const LIFECYCLE = lire('core/adn/execution-lifecycle.js');

/** Le frontend ÉCRIT À LA MAIN : le bloc runtime généré en est retiré. */
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
/** Le même, prose retirée : une explication n'est pas une implémentation. */
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FRONT_CODE = sansProse(FRONTEND);
/** Une ÉCRITURE : « = » qui n'est ni une comparaison ni une flèche. */
const ecritures = (nom, source = FRONT_CODE) =>
  [...source.matchAll(new RegExp(`(?<![=!<>])\\b${nom}\\s*=(?![=>])`, 'g'))].length;

const C = (e = {}) => ({
  mode: 'architecte', turn: { turn_id: 5, current_turn_id: 5, mode: 'architecte', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null, ...e
});
const READY = { state: 'operational_request_ready' };
const READINESS_OK = { state: 'execution_ready' };
const QG_OK = { status: 'PASS' };
const EXEC_OK = { status: 'success' };
const action = (e) => decideNextOrchestrationAction(C(e)).action;

// =================================================================================================
// §64..§69 — LES PARCOURS DE BOUT EN BOUT
// =================================================================================================

test('T-IA05-01 : demande → OPRIE clarification → la personne est attendue', async () => {
  const h = loadPilot({ deep: async () => clarificationTurn('Pour quel public ?') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.equal(questionShown(h.ctx), 'Pour quel public ?');
  assert.deepEqual(h.spy.executed, [], 'rien n’est exécuté sur une clarification.');
});

test('T-IA05-02 : demande → OPRIE confirmation → la personne est attendue', async () => {
  const h = loadPilot({ deep: async () => confirmationTurn('Un arbitrage a été fait.') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.match(questionShown(h.ctx), /Confirmez-vous \?/);
  assert.deepEqual(h.spy.executed, []);
});

test('T-IA05-03 : READY → Readiness → gate de prompt → exécution → contrôle de sortie', async () => {
  /* Le pilote de tour ouvre la chaîne ; la chaîne elle-même est décidée par la politique. */
  const h = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS');
  assert.equal(h.spy.executed.length, 1);
  const etapes = [
    [{ deep: READY }, 'ENTER_READINESS'],
    [{ deep: READY, readiness: READINESS_OK }, 'RUN_PROMPT_QG'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK }, 'EXECUTE'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK }, 'RUN_OUTPUT_QG'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: QG_OK }, 'SHOW_EXECUTION_RESULT']
  ];
  for (const [ctx, attendu] of etapes) assert.equal(action(ctx), attendu, JSON.stringify(Object.keys(ctx)));
});

test('T-IA05-04/05 : blocked et degraded terminent sans jamais exécuter', async () => {
  for (const [state, attendu, etat] of [['blocked', 'SHOW_BLOCKED', 'blocked'], ['degraded_state', 'SHOW_DEGRADED', 'degraded']]) {
    const h = loadPilot({ deep: async () => arbiterTurn(state, { blocked_reason: 'Motif.' }) });
    await h.pilot.oprieRunTurn('architecte');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, attendu);
    assert.equal(h.spy.gate[h.spy.gate.length - 1].decision.state, etat);
    assert.deepEqual(h.spy.executed, [], state);
  }
});

test('T-IA05-06 : clarification → clarification → confirmation → READY, en quatre tours réels', async () => {
  const suite = [clarificationTurn('Q1 ?'), clarificationTurn('Q2 ?'), confirmationTurn('Motif.'), arbiterTurn('operational_request_ready')];
  let i = 0;
  const h = loadPilot({ deep: async () => { const t = suite[Math.min(i, suite.length - 1)]; i += 1; return t; } });
  const actions = [];
  await h.pilot.oprieRunTurn('architecte');
  actions.push(h.pilot.oprieState.lastOrchestration.action);
  for (let n = 0; n < 3; n += 1) {
    h.ctx.state.answers.push({ question: questionShown(h.ctx), answer: `R${n + 1}` });
    h.ctx.adpState.pendingQuestion = false;
    await h.pilot.oprieRunTurn('architecte');
    actions.push(h.pilot.oprieState.lastOrchestration.action);
  }
  assert.deepEqual(actions, ['WAIT_FOR_USER', 'WAIT_FOR_USER', 'WAIT_FOR_USER', 'ENTER_READINESS']);
  assert.equal(h.spy.deepCalls.length, 4, 'quatre tours OPRIE complets.');
  assert.equal(h.spy.deepCalls[3].body.clarification_history.length, 3, 'et tout l’historique transmis.');
  assert.equal(h.spy.executed.length, 1, 'une seule entrée en exécution, au dernier tour.');
});

test('T-IA05-07 : candidate rapide visible, plan profond autoritaire, réconciliation correcte', async () => {
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Pour quel public ?' }),
    deep: async () => { await delay(90); return clarificationTurn('Quel public ?'); }
  });
  const run = h.pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(questionShown(h.ctx), 'Pour quel public ?', 'la candidate est visible avant le plan profond.');
  await run;
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'KEEP_CURRENT_INTERACTION');
  assert.equal(h.spy.shown.filter((s) => s.id === '#v11-dialogue').length, 1, 'aucun clignotement.');
});

test('T-IA05-08 : le plan rapide échoue, le plan profond conclut quand même', async () => {
  const h = loadPilot({ fast: async () => { throw new Error('KO'); }, deep: async () => clarificationTurn('Q ?') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.equal(questionShown(h.ctx), 'Q ?');
});

test('T-IA05-09 : le plan profond échoue, la candidate n’est jamais promue', async () => {
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Candidate ?' }),
    deep: async () => { await delay(40); throw new Error('KO'); }
  });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.fastInteraction, null);
  assert.deepEqual(h.spy.executed, []);
  assert.equal(h.spy.gate[h.spy.gate.length - 1].decision.state, 'technical');
});

test('T-IA05-10/11/12/13/14/15 : chaque verdict amont produit sa fin, et une seule', () => {
  const cas = [
    [{ deep: READY, readiness: { state: 'blocked' } }, 'STOP_FAIL_CLOSED', 'READINESS_BLOCKED'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: { status: 'FAIL' } }, 'STOP_FAIL_CLOSED', 'PROMPT_QG_FAIL'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: { status: 'technical_error' } }, 'SHOW_EXECUTION_RESULT', 'EXECUTION_TECHNICAL_ERROR'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: { status: 'FAIL' } }, 'SHOW_OUTPUT_QG_FAILURE', 'OUTPUT_QG_FAIL'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: { status: 'INCOMPLETE_VERIFICATION' } }, 'SHOW_EXECUTION_RESULT', 'OUTPUT_QG_INCOMPLETE_VERIFICATION'],
    [{ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: { status: 'PASS_WITH_WARNINGS' } }, 'SHOW_EXECUTION_RESULT', 'OUTPUT_QG_PASS_WITH_WARNINGS']
  ];
  for (const [ctx, act, motif] of cas) {
    const d = decideNextOrchestrationAction(C(ctx));
    assert.equal(d.action, act, JSON.stringify(Object.keys(ctx)));
    assert.equal(d.reason, motif, 'le motif nomme le verdict, il ne le réinterprète pas.');
  }
  /* Les quatre verdicts de sortie restent quatre issues distinctes. */
  const issues = ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL'].map((status) => {
    const d = decideNextOrchestrationAction(C({ deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: { status } }));
    return `${d.action}/${d.reason}`;
  });
  assert.equal(new Set(issues).size, 4);
});

// =================================================================================================
// §79..§85 — CE QUI VIENT DU PASSÉ, ET CE QUI ARRIVE DEUX FOIS
// =================================================================================================

test('T-IA05-16 : une candidate rapide d’un tour dépassé n’écrit rien', async () => {
  const h = loadPilot({
    fast: async () => { await delay(80); return { type: 'ASK_CLARIFICATION', text: 'Dépassée ?' }; },
    deep: async () => { await delay(200); return clarificationTurn(); }
  });
  const run = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await delay(100);
  assert.equal(questionShown(h.ctx), '', 'aucune écriture depuis le tour dépassé.');
  await run.catch(() => {});
});

test('T-IA05-17 : un plan profond d’un tour dépassé n’écrit rien', async () => {
  const h = loadPilot({ deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await ancien;
  assert.deepEqual(h.spy.executed, []);
  assert.equal(h.pilot.oprieState.lastTurn, null);
});

test('T-IA05-18/19 : ni exécution ni contrôle de sortie dépassés ne réécrivent un terminal', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 3 });
  L.applyTerminal(execution_id, { qg_status: 'PASS' });
  const tardif = L.applyTerminal(execution_id, { qg_status: 'FAIL' });
  assert.equal(tardif.allowed, false, 'le premier terminal tient.');
  assert.deepEqual(tardif.terminal, { qg_status: 'PASS' });
  /* Un cycle d'un tour révolu ne franchit plus rien. */
  const ancien = L.begin({ turn_id: 3 }).execution_id;
  assert.equal(L.enterPhase(ancien, 'READINESS', { currentTurnId: 9 }).reason, 'STALE_EXECUTION');
  /* Et un contrôle de sortie ne s'attribue pas à une autre exécution. */
  assert.equal(assertOutputProvenance({ execution_id: 4, output_execution_id: 3 }).allowed, false);
});

test('T-IA05-20/21/22 : rejeu, double clic et rappel dupliqué ne produisent qu’un effet', async () => {
  const h = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 6; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'six rejeux, un effet.');
  /* Double soumission d'un tour : une seule requête. */
  let appels = 0;
  const g = loadPilot({ deep: async () => { appels += 1; await delay(40); return clarificationTurn(); } });
  await Promise.all([g.pilot.oprieRunTurn('architecte'), g.pilot.oprieRunTurn('architecte'), g.pilot.oprieRunTurn('architecte')]);
  assert.equal(appels, 1);
  /* Double réponse : une seule entrée dans l'historique. */
  const a = loadAnswerQuestion({ running: false });
  a.answerQuestion('R');
  a.ctx.oprieState.running = true;
  a.answerQuestion('R');
  assert.equal(a.ctx.state.answers.length, 1);
  assert.equal(a.spy.turns.length, 1);
});

test('T-IA05-23 : après bascule de mode, l’ancien tour n’écrit plus', async () => {
  const h = loadPilot({ deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  h.ctx.adpState.requestedMode = 'rapide';
  await ancien;
  assert.deepEqual(h.spy.executed, []);
  assert.equal(action({ mode: 'rapide', turn: { turn_id: 5, current_turn_id: 5, mode: 'architecte' }, deep: READY }), 'IGNORE_STALE');
});

test('T-IA05-24/25 : Rapide et Architecte traitent un état OPRIE À L’IDENTIQUE', async () => {
  for (const mode of ['rapide', 'architecte']) {
    for (const [state, attendu] of [['clarification_required', 'WAIT_FOR_USER'], ['confirmation_required', 'WAIT_FOR_USER'],
                                    ['operational_request_ready', 'ENTER_READINESS'], ['blocked', 'SHOW_BLOCKED'],
                                    ['degraded_state', 'SHOW_DEGRADED']]) {
      const h = loadPilot({ mode, deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R', blocked_reason: 'B' }) });
      await h.pilot.oprieRunTurn(mode);
      assert.equal(h.pilot.oprieState.lastOrchestration.action, attendu, `${mode} / ${state}`);
    }
  }
});

// =================================================================================================
// §95..§100 — LES SENTINELLES DE CLÔTURE
// =================================================================================================

test('T-IA05-26 : SENTINELLE — aucune source nouvelle n’écrit un état OPRIE', () => {
  /* Si un lot futur ajoute une écriture d'état sémantique dans le frontend, ce test tombe. */
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat), 0, `${etat} ne doit être écrit nulle part dans le frontend.`);
  }
  assert.equal(ecritures('turn\\.state'), 0, 'l’état d’un tour OPRIE n’est jamais réassigné.');
  /* La politique et le cycle n'en écrivent pas davantage. */
  for (const source of [sansProse(POLICY), sansProse(LIFECYCLE)]) {
    assert.doesNotMatch(source, /\.[A-Za-z_$][\w$]*\s*=(?![=>])\s*['"]operational_request_ready/);
    assert.equal(ecritures('operational_request_ready', source), 0);
  }
});

test('T-IA05-27 : SENTINELLE — une seule autorité d’action, un seul site d’appel', () => {
  assert.equal((html.match(/function decideNextOrchestrationAction/g) || []).length, 1,
    'une seule définition de politique embarquée.');
  assert.equal([...FRONT_CODE.matchAll(/decideNextOrchestrationAction\(/g)].length, 1,
    'un seul site d’appel dans tout le frontend.');
  /* La sortie de la politique ne porte jamais d'état. */
  const d = decideNextOrchestrationAction(C({ deep: READY }));
  assert.deepEqual(Object.keys(d).sort(), ['action', 'reason', 'version']);
});

test('T-IA05-28/29/30 : SENTINELLE — Readiness, gate de prompt et gate de sortie restent uniques', () => {
  assert.equal((html.match(/function assessAnalysisReadiness/g) || []).length, 1);
  assert.equal((html.match(/function guardPromptContract/g) || []).length, 1);
  assert.equal((html.match(/function validateOutputAgainstCanonicalContract/g) || []).length, 1);
  /* Leurs adaptateurs frontend DÉLÈGUENT : ils ne rejugent rien. */
  for (const [adaptateur, delegue] of [['function rapideControleQg', 'runtime.guardPromptContract('],
                                        ['function archControleQg', 'runtime.guardPromptContract('],
                                        ['function rapideControleSortie', 'runtime.validateOutputAgainstCanonicalContract('],
                                        ['function archControleSortie', 'runtime.validateOutputAgainstCanonicalContract(']]) {
    const bloc = html.slice(html.indexOf(adaptateur), html.indexOf(adaptateur) + 900);
    assert.ok(bloc.includes(delegue), `${adaptateur} délègue au noyau.`);
  }
});

test('T-IA05-31..35 : SENTINELLE — aucun contournement du pipeline', () => {
  /* READY seul n'exécute pas ; chaque preuve amont retirée referme l'exécution. */
  const complet = { deep: READY, readiness: READINESS_OK, promptQG: QG_OK };
  assert.equal(action(complet), 'EXECUTE');
  for (const retire of [{ deep: { state: 'clarification_required' } }, { readiness: null }, { promptQG: null },
                        { readiness: { state: 'blocked' } }, { promptQG: { status: 'FAIL' } }]) {
    assert.notEqual(action({ ...complet, ...retire }), 'EXECUTE', JSON.stringify(retire));
  }
  /* Aucune candidate rapide n'atteint l'exécution, quel que soit son type. */
  for (const type of ['ACKNOWLEDGE', 'ASK_CLARIFICATION', 'ASK_CONFIRMATION', 'ORIENT_ARCHITECTE', 'WAIT_FOR_DEEP_VALIDATION']) {
    const a = action({ fast: { type, authority: 'candidate' } });
    assert.notEqual(a, 'EXECUTE', type);
    assert.notEqual(a, 'ENTER_READINESS', type);
  }
  /* Et le pilote de tour ne connaît aucune action aval. */
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('IA-04 — LE CYCLE'));
  for (const aval of ['EXECUTE:', 'RUN_PROMPT_QG:', 'RUN_OUTPUT_QG:']) {
    assert.equal(table.includes(aval), false, `${aval} n’a pas sa place dans le pilote de tour.`);
  }
});

test('T-IA05-36/37/38 : SENTINELLE — l’ancien chemin n’existe plus', () => {
  /* CLEAN-01 : cette sentinelle veillait sur trois vestiges inertes. Ils sont retirés ;
     elle veille désormais sur leur absence, ce qui est la même garde en plus fort. */
  assert.equal([...FRONT_CODE.matchAll(/adpResumeAfterClarification/g)].length, 0);
  assert.equal([...FRONT_CODE.matchAll(/adpDecideRapide/g)].length, 0);
  assert.equal([...FRONT_CODE.matchAll(/adnNextConversationAction/g)].length, 0);
  assert.equal(html.includes('conversationQuestionsSimilar'), false, 'le flou hérité est retiré.');
  assert.equal(html.includes('source: "local-prudent"'), false, 'le repli hérité aussi.');
  for (const source of [sansProse(POLICY), sansProse(LIFECYCLE)]) {
    assert.doesNotMatch(source, /conversationQuestionsSimilar|nextConversationAction|local-prudent/);
  }
  const tour = FRONT_CODE.slice(FRONT_CODE.indexOf('function oprieOrchestrationRuntime'), FRONT_CODE.indexOf('function oprieApplyTurn'));
  assert.doesNotMatch(tour, /conversationQuestionsSimilar|nextConversationAction|adpDecideRapide/);
});

test('T-IA05-39/40/41/42 : SENTINELLE — tout ce qui est illisible se ferme', async () => {
  /* Politique absente, puis export partiel. */
  for (const options of [{ noRuntime: true }, { partialPolicy: ['decideNextOrchestrationAction'] },
                         { partialPolicy: ['isKnownOrchestrationAction'] }]) {
    const h = loadPilot({ ...options, deep: async () => arbiterTurn('operational_request_ready') });
    await h.pilot.oprieRunTurn('architecte');
    assert.deepEqual(h.spy.executed, [], JSON.stringify(options));
    assert.equal(h.spy.gate[h.spy.gate.length - 1].decision.state, 'technical');
  }
  /* Action inconnue. */
  const h = loadPilot({ deep: async () => clarificationTurn() });
  await h.pilot.oprieRunTurn('architecte');
  for (const inconnue of [null, { action: 'INVENTÉE' }, { action: 'execute' }]) {
    assert.equal(h.pilot.oprieDriveOrchestration(inconnue, arbiterTurn('operational_request_ready'), 'architecte'), false);
  }
  /* Séquence invalide et contexte contradictoire. */
  assert.equal(action({ outputQG: QG_OK }), 'STOP_FAIL_CLOSED');
  assert.equal(action({ deep: { state: 'inventé' } }), 'STOP_FAIL_CLOSED');
  assert.equal(action({ fast: { type: 'ACKNOWLEDGE', can_execute: true } }), 'STOP_FAIL_CLOSED');
  /* Ordre de phases invalide. */
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  assert.equal(L.enterPhase(execution_id, 'EXECUTION').reason, 'PHASE_SKIPPED');
});

test('T-IA05-43..47 : SENTINELLE — exactement une fois, à chaque étage', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  for (const phase of ['READINESS', 'PROMPT_QG', 'EXECUTION', 'OUTPUT_QG']) {
    assert.equal(L.enterPhase(execution_id, phase).allowed, true, phase);
    assert.equal(L.enterPhase(execution_id, phase).reason, 'PHASE_ALREADY_ENTERED', `${phase} rejouée`);
  }
  assert.equal(L.applyTerminal(execution_id, { k: 1 }).allowed, true);
  assert.equal(L.applyTerminal(execution_id, { k: 2 }).allowed, false, 'un seul rendu terminal.');
  /* Cinq tentatives fournisseur restent UNE exécution logique. */
  const M = createExecutionLifecycle();
  const e2 = M.begin({ turn_id: 2 }).execution_id;
  for (let i = 0; i < 5; i += 1) M.recordProviderAttempt(e2);
  assert.equal(M.describe(e2).provider_attempts, 5);
  assert.equal(M.executionCount, 1);
});

test('T-IA05-48/49/50 : SENTINELLE — aucune boucle, aucun plafond, autant de tours qu’OPRIE en veut', () => {
  const decide = sansProse(POLICY).slice(sansProse(POLICY).indexOf('export function decideNextOrchestrationAction'));
  for (const interdit of [/\bwhile\s*\(/, /\bdo\s*\{/, /\bfor\s*\(/]) {
    assert.doesNotMatch(decide, interdit, `la décision ne boucle pas (${interdit}).`);
  }
  for (const interdit of [/retry/i, /repair/i, /regenerate/i, /\buntil\b/i]) {
    assert.doesNotMatch(sansProse(POLICY), interdit, `aucune reprise sémantique (${interdit}).`);
  }
  for (const interdit of [/minQuestions/i, /maxQuestions/i, /targetQuestions/i, /question_count/i,
                          /adpState\.clarifications\s*[<>]=?\s*\d/]) {
    assert.doesNotMatch(FRONT_CODE, interdit, `aucun plafond de questions (${interdit}).`);
    assert.doesNotMatch(sansProse(POLICY), interdit);
  }
});

// =================================================================================================
// §13/§14 — LA MATRICE DE TRANSITIONS EST COMPLÈTE ET SANS TROU
// =================================================================================================

test('T-IA05-MATRICE : les 16 actions sont atteignables, et aucune n’est implicite', () => {
  const atteintes = new Set();
  const contextes = [
    { deep: { state: 'clarification_required' } }, { deep: { state: 'confirmation_required' } },
    { deep: READY }, { deep: { state: 'blocked' } }, { deep: { state: 'degraded_state' } },
    { deep: READY, readiness: READINESS_OK }, { deep: READY, readiness: READINESS_OK, promptQG: QG_OK },
    { deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK },
    { deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: QG_OK },
    { deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK, outputQG: { status: 'FAIL' } },
    { deep: READY, readiness: { state: 'blocked' } },
    { fast: { type: 'ASK_CLARIFICATION', authority: 'candidate' } },
    { fast: { type: 'ORIENT_ARCHITECTE', authority: 'candidate' } },
    { fast: { type: 'WAIT_FOR_DEEP_VALIDATION', authority: 'candidate' } },
    { deep: { state: 'clarification_required' }, fast: { type: 'ASK_CLARIFICATION', authority: 'candidate' },
      turn: { turn_id: 5, current_turn_id: 5, mode: 'architecte', pending_user_interaction: true } },
    { deep: READY, turn: { turn_id: 2, current_turn_id: 9, mode: 'architecte' } },
    {}
  ];
  for (const ctx of contextes) atteintes.add(action(ctx));
  assert.equal(atteintes.size, ORCHESTRATION_ACTIONS.length,
    `les ${ORCHESTRATION_ACTIONS.length} actions doivent toutes être atteignables (vues : ${atteintes.size}).`);
  for (const a of atteintes) assert.equal(isKnownOrchestrationAction(a), true, a);
  /* Aucune transition implicite : pas de « sinon » permissif, ni dans la politique ni dans le pilote. */
  assert.doesNotMatch(sansProse(POLICY), /default\s*:/);
  const drive = html.slice(html.indexOf('function oprieDriveOrchestration'), html.indexOf('function oprieApplyTurn'));
  assert.doesNotMatch(sansProse(drive), /default\s*:/);
  assert.equal((sansProse(drive).match(/return oprieShowNetworkFailure\(\)/g) || []).length, 2,
    'les deux refus du pilote ferment tous deux le tour.');
});

test('T-IA05-DETERMINISME : la matrice entière est reproductible à l’identique', () => {
  const matrice = () => [
    { deep: { state: 'clarification_required' } }, { deep: READY },
    { deep: READY, readiness: READINESS_OK }, { deep: READY, readiness: READINESS_OK, promptQG: QG_OK },
    { deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: EXEC_OK }
  ].map((c) => `${action(c)}`);
  const attendu = matrice();
  for (let i = 0; i < 30; i += 1) assert.deepEqual(matrice(), attendu, `passage ${i}`);
  assert.deepEqual(attendu, ['WAIT_FOR_USER', 'ENTER_READINESS', 'RUN_PROMPT_QG', 'EXECUTE', 'RUN_OUTPUT_QG']);
});

// =================================================================================================
// §46/§47 — LA LIMITE EST PORTÉE, PAS MASQUÉE
// =================================================================================================

test('T-IA05-LIMITE : EXEC-PHASE-INSTRUMENT-01 est caractérisée, et n’a pas été « corrigée »', () => {
  /* Le cycle Architecte vit DANS une plage gelée : ce lot n'a pas le droit d'y toucher, et n'y a
     pas touché. L'unicité de l'exécution repose donc sur le garde D'ENTRÉE, pas sur un marquage
     phase par phase à l'intérieur du moteur. Dire l'inverse serait revendiquer une preuve absente. */
  const bornes = (a, b) => [html.indexOf(a), html.indexOf(b, html.indexOf(a) + a.length)];
  const [debut, fin] = bornes('function archContexte(){', 'const ARCH_SAUVEGARDE_VERSION=');
  for (const nom of ['archConstruireExecuter', 'archControleQg', 'archControleSortie', 'archCompiler']) {
    const i = html.indexOf('function ' + nom);
    assert.ok(i > debut && i < fin, `${nom} est bien dans la plage gelée.`);
  }
  /* Aucune instrumentation du cycle n'a été insérée dans cette plage. */
  const gelee = html.slice(debut, fin);
  for (const marque of ['enterPhase', 'createExecutionLifecycle', 'applyTerminal', 'recordProviderAttempt']) {
    assert.equal(gelee.includes(marque), false, `${marque} ne doit PAS avoir été inséré dans la plage gelée.`);
  }
  /* Ce qui EST prouvé : l'entrée est unique, et le garde est hors plage gelée. */
  const garde = html.slice(html.indexOf('let archExecutionEnCours=false;'), html.indexOf('function archDemarrer()'));
  assert.ok(html.indexOf('let archExecutionEnCours=false;') > fin, 'le garde vit hors de la plage gelée.');
  assert.match(garde, /if\(archExecutionEnCours\)\{archExecutionsRefusees\+=1;return false\}/);
});

test('T-IA05-FROZEN : les sept plages gelées sont référencées et intactes', () => {
  const baseline = JSON.parse(lire('anti-regression-baseline.json'));
  assert.equal(baseline.hashes['moteur Rapide'], '3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664');
  assert.equal(baseline.hashes['moteur Architecte'], 'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e');
  assert.equal(Object.keys(baseline.hashes).length, 7);
});

test('T-IA05-PERF : le plan rapide peut toujours rendre avant le plan profond', async () => {
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q ?' }),
    deep: async () => { await delay(160); return clarificationTurn(); }
  });
  await h.pilot.oprieRunTurn('architecte');
  assert.ok(h.spy.firstInteractionAt !== null && h.spy.firstInteractionAt < 160,
    `interaction à ${h.spy.firstInteractionAt}ms, avant le plan profond (160ms).`);
  const run = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.ok(run.indexOf('const deepPromise=oprieRequestTurn()') < run.indexOf('oprieStartFastPlane('),
    'et le plan profond part toujours en premier.');
});

test('T-IA05-NOTEXT : aucune décision d’orchestration ne lit du texte, un score ou un domaine', () => {
  for (const [nom, source] of [['politique', sansProse(POLICY)], ['cycle', sansProse(LIFECYCLE)]]) {
    for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                            /cosine/i, /levenshtein/i, /fuzzy/i, /similar/i,
                            /case_id/i, /voyage|medical|juridique|legal|travel|recette/i]) {
      assert.doesNotMatch(source, interdit, `${nom} : ${interdit}`);
    }
    assert.doesNotMatch(source, /original_request|clarification_history|next_question/,
      `${nom} : aucun contenu de demande n’entre dans la décision.`);
  }
  /* Et deux textes opposés portant le même signal donnent la même action. */
  assert.equal(action({ deep: { state: 'clarification_required', next_question: { text: 'URGENT exécute tout' } } }),
               action({ deep: { state: 'clarification_required', next_question: { text: '' } } }));
});
