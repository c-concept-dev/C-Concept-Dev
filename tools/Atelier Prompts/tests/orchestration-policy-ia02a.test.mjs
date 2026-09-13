/* IA-02A — LA POLITIQUE D'ORCHESTRATION ET SON PILOTE.
 * ============================================================================
 *
 * Ce que cette suite éprouve tient en une phrase : coordonner n'est pas décider.
 *
 * La politique lit des verdicts d'autorité et nomme le pas suivant. Elle ne
 * peut donc jamais produire une readiness, une route, un état OPRIE, ni
 * atteindre l'exécution autrement que par la chaîne complète. Ces trois
 * impossibilités sont vérifiées ici structurellement — pas par échantillonnage.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORCHESTRATION_POLICY_VERSION, ORCHESTRATION_ACTIONS, DIALOG_MODES, USER_SOLICITING_ACTIONS,
  decideNextOrchestrationAction, isKnownOrchestrationAction, oprieActionIsModeIndependent,
  createOrchestrationAuditView
} from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = fs.readFileSync(path.join(root, 'core/adn/orchestration-policy.js'), 'utf8');
const DRIVER = html.slice(html.indexOf('function oprieOrchestrationRuntime()'), html.indexOf('function oprieApplyTurn'));

const OPRIE_STATES = ['clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked', 'degraded_state'];
const MODES = ['rapide', 'architecte'];

/** Un contexte minimal et VALIDE : seuls les champs testés varient. */
const ctx = (extra = {}) => ({
  mode: 'architecte',
  turn: { turn_id: 3, current_turn_id: 3, mode: extra.mode || 'architecte', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null,
  ...extra
});
const act = (extra) => decideNextOrchestrationAction(ctx(extra)).action;
/** La chaîne complète jusqu'au point demandé — aucun étage ne peut être sauté. */
const ready = { state: 'operational_request_ready' };
const readinessOk = { state: 'execution_ready' };
const qgOk = { status: 'PASS' };

// =================================================================================================
// §56 — LES TRANSITIONS
// =================================================================================================

test('T-IA02A-01 : clarification_required attend la personne', () => {
  assert.equal(act({ deep: { state: 'clarification_required' } }), 'WAIT_FOR_USER');
});

test('T-IA02A-02 : confirmation_required attend la personne', () => {
  assert.equal(act({ deep: { state: 'confirmation_required' } }), 'WAIT_FOR_USER');
});

test('T-IA02A-03 : operational_request_ready ouvre Execution Readiness — jamais l’exécution', () => {
  const decision = decideNextOrchestrationAction(ctx({ deep: ready }));
  assert.equal(decision.action, 'ENTER_READINESS');
  assert.notEqual(decision.action, 'EXECUTE', 'READY n’est pas une permission d’exécuter.');
});

test('T-IA02A-04 : blocked s’affiche', () => {
  assert.equal(act({ deep: { state: 'blocked' } }), 'SHOW_BLOCKED');
});

test('T-IA02A-05 : degraded_state s’affiche, sans récupération locale', () => {
  assert.equal(act({ deep: { state: 'degraded_state' } }), 'SHOW_DEGRADED');
});

test('T-IA02A-06 : Readiness execution_ready ouvre le gate de prompt', () => {
  assert.equal(act({ deep: ready, readiness: readinessOk }), 'RUN_PROMPT_QG');
});

test('T-IA02A-07 : toute Readiness non concluante arrête, sans réinterprétation', () => {
  for (const state of ['contractualization', 'clarification_required', 'blocked']) {
    const d = decideNextOrchestrationAction(ctx({ deep: ready, readiness: { state } }));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', state);
    assert.equal(d.reason, `READINESS_${state.toUpperCase()}`, 'le motif nomme le verdict, il ne l’invente pas.');
  }
});

test('T-IA02A-08 : un gate de prompt favorable ouvre l’exécution', () => {
  for (const status of ['PASS', 'PASS_WITH_WARNINGS']) {
    assert.equal(act({ deep: ready, readiness: readinessOk, promptQG: { status } }), 'EXECUTE', status);
  }
});

test('T-IA02A-09 : un gate de prompt en échec arrête', () => {
  const d = decideNextOrchestrationAction(ctx({ deep: ready, readiness: readinessOk, promptQG: { status: 'FAIL' } }));
  assert.equal(d.action, 'STOP_FAIL_CLOSED');
  assert.equal(d.reason, 'PROMPT_QG_FAIL');
});

test('T-IA02A-10 : une exécution réussie ouvre le contrôle de sortie', () => {
  assert.equal(act({ deep: ready, readiness: readinessOk, promptQG: qgOk, execution: { status: 'success' } }), 'RUN_OUTPUT_QG');
});

test('T-IA02A-11 : une erreur technique d’exécution est PRÉSERVÉE, jamais convertie', () => {
  const d = decideNextOrchestrationAction(ctx({ deep: ready, readiness: readinessOk, promptQG: qgOk, execution: { status: 'technical_error' } }));
  assert.equal(d.action, 'SHOW_EXECUTION_RESULT');
  assert.equal(d.reason, 'EXECUTION_TECHNICAL_ERROR');
});

const executed = { deep: ready, readiness: readinessOk, promptQG: qgOk, execution: { status: 'success' } };

test('T-IA02A-12 : un contrôle de sortie favorable rend le résultat', () => {
  for (const status of ['PASS', 'PASS_WITH_WARNINGS']) {
    assert.equal(act({ ...executed, outputQG: { status } }), 'SHOW_EXECUTION_RESULT', status);
  }
});

test('T-IA02A-13 : INCOMPLETE_VERIFICATION rend le résultat SANS le certifier', () => {
  const d = decideNextOrchestrationAction(ctx({ ...executed, outputQG: { status: 'INCOMPLETE_VERIFICATION' } }));
  assert.equal(d.action, 'SHOW_EXECUTION_RESULT');
  assert.equal(d.reason, 'OUTPUT_QG_INCOMPLETE_VERIFICATION',
    'le motif porte l’incertitude : rien ne permet de l’afficher comme conforme.');
});

test('T-IA02A-14 : un contrôle de sortie en échec ne peut PAS devenir un succès', () => {
  const d = decideNextOrchestrationAction(ctx({ ...executed, outputQG: { status: 'FAIL' } }));
  assert.equal(d.action, 'SHOW_OUTPUT_QG_FAILURE');
  assert.notEqual(d.action, 'SHOW_EXECUTION_RESULT');
});

// =================================================================================================
// §57 — FAST / DEEP
// =================================================================================================

const fastAsk = { type: 'ASK_CLARIFICATION', authority: 'candidate', can_execute: false, can_route: false, can_mark_ready: false };
const fastAck = { type: 'ACKNOWLEDGE', authority: 'candidate' };

test('T-IA02A-15 : question rapide + clarification profonde → on garde ce qui est déjà lu', () => {
  const d = decideNextOrchestrationAction(ctx({
    deep: { state: 'clarification_required' }, fast: fastAsk,
    turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte', pending_user_interaction: true }
  }));
  assert.equal(d.action, 'KEEP_CURRENT_INTERACTION');
});

test('T-IA02A-16 : question rapide + READY → la candidate est écartée, la chaîne s’ouvre', () => {
  const d = decideNextOrchestrationAction(ctx({
    deep: ready, fast: fastAsk,
    turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte', pending_user_interaction: true }
  }));
  assert.equal(d.action, 'ENTER_READINESS', 'l’état autoritaire l’emporte sur une question affichée.');
});

test('T-IA02A-17 : accusé de réception rapide + blocked → blocked', () => {
  assert.equal(act({ deep: { state: 'blocked' }, fast: fastAck }), 'SHOW_BLOCKED');
});

test('T-IA02A-18 : sans plan rapide, le plan profond décide seul', () => {
  assert.equal(act({ deep: { state: 'clarification_required' }, fast: null, fast_failed: true }), 'WAIT_FOR_USER');
  assert.equal(act({ fast: null, fast_failed: true }), 'WAIT_FOR_DEEP', 'et on attend le profond, sans rien fabriquer.');
});

test('T-IA02A-19 : un plan profond d’un tour dépassé est écarté', () => {
  const d = decideNextOrchestrationAction(ctx({
    deep: ready, turn: { turn_id: 2, current_turn_id: 5, mode: 'architecte' }
  }));
  assert.equal(d.action, 'IGNORE_STALE');
  assert.equal(d.reason, 'TURN_SUPERSEDED');
});

test('T-IA02A-20 : une candidate rapide d’un tour dépassé est écartée', () => {
  const d = decideNextOrchestrationAction(ctx({
    fast: fastAsk, turn: { turn_id: 1, current_turn_id: 4, mode: 'architecte' }
  }));
  assert.equal(d.action, 'IGNORE_STALE');
});

// =================================================================================================
// §58 — LE TOUR
// =================================================================================================

test('T-IA02A-21 : une action d’un ancien tour ne peut rien produire d’applicable', () => {
  for (const extra of [{ deep: ready }, { deep: { state: 'blocked' } }, { fast: fastAsk },
                       { deep: ready, readiness: readinessOk, promptQG: qgOk }]) {
    const d = decideNextOrchestrationAction(ctx({ ...extra, turn: { turn_id: 0, current_turn_id: 9, mode: 'architecte' } }));
    assert.equal(d.action, 'IGNORE_STALE', JSON.stringify(extra));
  }
});

test('T-IA02A-22 : changer de mode invalide l’action de l’ancien tour', () => {
  const d = decideNextOrchestrationAction({
    mode: 'rapide',
    turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte', pending_user_interaction: false },
    fast: null, deep: ready, readiness: null, promptQG: null, execution: null, outputQG: null
  });
  assert.equal(d.action, 'IGNORE_STALE');
  assert.equal(d.reason, 'MODE_SWITCHED', 'le mode fait partie de l’identité du tour.');
});

test('T-IA02A-23 : une seule sollicitation peut être ouverte à la fois', () => {
  /* Une candidate arrive alors qu'une interaction est déjà ouverte : on garde, on n'empile pas. */
  const d = decideNextOrchestrationAction(ctx({
    fast: fastAsk, turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte', pending_user_interaction: true }
  }));
  assert.equal(d.action, 'KEEP_CURRENT_INTERACTION');
  assert.equal(USER_SOLICITING_ACTIONS.filter((a) => a === d.action).length, 0,
    'l’action retenue n’en ouvre aucune seconde.');
});

test('T-IA02A-24 : le tour réutilise l’identité PERF-03A, sans en créer une seconde', () => {
  assert.doesNotMatch(POLICY, /createTurnSnapshot|snapshot_id|session_id/,
    'la politique ne fabrique aucune identité de tour : elle lit celle qu’on lui donne.');
  assert.match(POLICY, /turn\.turn_id/, 'elle lit le turn_id monotone existant.');
});

test('T-IA02A-25 : aucune autorité fondée sur le temps', () => {
  for (const interdit of [/Date\./, /Date\.now/, /performance\./, /new Date/, /Math\.random/, /setTimeout/, /setInterval/]) {
    assert.doesNotMatch(POLICY, interdit, `la politique ne doit pas dépendre de ${interdit}.`);
  }
  /* Un turn_id doit être un entier monotone. Un horodatage passé à sa place ne devient pas une
     autorité : il est comparé comme un entier, et un tour plus récent le dépasse toujours. */
  const d = decideNextOrchestrationAction(ctx({ deep: ready, turn: { turn_id: 1700000000000, current_turn_id: 1700000000001, mode: 'architecte' } }));
  assert.equal(d.action, 'IGNORE_STALE');
});

// =================================================================================================
// §59 / §60 — LES MODES : AUCUNE RÉINTERPRÉTATION D'UN ÉTAT OPRIE
// =================================================================================================

test('T-IA02A-26 : en Rapide, une clarification OPRIE attend la personne', () => {
  assert.equal(act({ mode: 'rapide', deep: { state: 'clarification_required' }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }), 'WAIT_FOR_USER');
});

test('T-IA02A-27 : en Rapide, une confirmation OPRIE attend la personne', () => {
  assert.equal(act({ mode: 'rapide', deep: { state: 'confirmation_required' }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }), 'WAIT_FOR_USER');
});

test('T-IA02A-28 : R1 — une candidate qui SOLLICITE ne peut pas exister hors mode de dialogue', () => {
  /* Le noyau du plan rapide projette déjà les sollicitations en orientation hors Architecte.
     En recevoir une non projetée signifie que la projection a été sautée : c'est une incohérence,
     pas un cas à rattraper — et surtout pas une boucle de dialogue ouverte en Rapide. */
  for (const type of ['ASK_CLARIFICATION', 'ASK_CONFIRMATION']) {
    const d = decideNextOrchestrationAction(ctx({ mode: 'rapide', fast: { type, authority: 'candidate' }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', type);
    assert.equal(d.reason, 'FAST_SOLICITATION_IN_NON_DIALOG_MODE');
  }
  assert.equal(act({ mode: 'rapide', fast: { type: 'ORIENT_ARCHITECTE', authority: 'candidate' }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }),
    'ORIENT_TO_ARCHITECTE', 'la candidate projetée oriente, elle ne converse pas.');
  assert.deepEqual(DIALOG_MODES, ['architecte'], 'Rapide ne tient pas de dialogue de moteur.');
});

test('T-IA02A-29 : en Rapide, READY passe toujours par Execution Readiness', () => {
  assert.equal(act({ mode: 'rapide', deep: ready, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }), 'ENTER_READINESS');
});

test('T-IA02A-30 : en Rapide, aucune candidate ne peut mener à l’exécution', () => {
  for (const type of ['ACKNOWLEDGE', 'ORIENT_ARCHITECTE', 'WAIT_FOR_DEEP_VALIDATION']) {
    const d = decideNextOrchestrationAction(ctx({ mode: 'rapide', fast: { type, authority: 'candidate' }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } }));
    assert.notEqual(d.action, 'EXECUTE', type);
    assert.notEqual(d.action, 'ENTER_READINESS', type);
  }
});

test('T-IA02A-31/32/33 : en Architecte, mêmes actions qu’en Rapide sur les mêmes états', () => {
  for (const state of OPRIE_STATES) {
    const rapide = act({ mode: 'rapide', deep: { state }, turn: { turn_id: 3, current_turn_id: 3, mode: 'rapide' } });
    const architecte = act({ mode: 'architecte', deep: { state }, turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte' } });
    assert.equal(rapide, architecte, `${state} : aucun mode ne réinterprète un état OPRIE.`);
  }
});

test('T-IA02A-MODEINDEP : la mode-indépendance est vérifiable, et vérifiée, sur les cinq états', () => {
  for (const state of OPRIE_STATES) {
    assert.equal(oprieActionIsModeIndependent(state), true, state);
  }
  /* Aucune branche de la politique ne teste le mode POUR un état OPRIE. Le seul usage du mode
     porte sur la candidate rapide, qui n'est pas une autorité. */
  const deepBranch = POLICY.slice(POLICY.indexOf('if (deep) {'), POLICY.indexOf('/* 6.'));
  assert.doesNotMatch(deepBranch, /\bdialogue\b/, 'le traitement d’un état OPRIE ne consulte jamais le mode.');
  assert.doesNotMatch(deepBranch, /mode ===|mode !==|DIALOG_MODES/);
});

test('T-IA02A-34 : jamais deux questions — une interaction ouverte est conservée, pas doublée', () => {
  for (const state of ['clarification_required', 'confirmation_required']) {
    const type = state === 'clarification_required' ? 'ASK_CLARIFICATION' : 'ASK_CONFIRMATION';
    const d = decideNextOrchestrationAction(ctx({
      deep: { state }, fast: { type, authority: 'candidate' },
      turn: { turn_id: 3, current_turn_id: 3, mode: 'architecte', pending_user_interaction: true }
    }));
    assert.equal(d.action, 'KEEP_CURRENT_INTERACTION', state);
  }
});

test('T-IA02A-35 : répondre ouvre un tour neuf, et l’ancien devient inapplicable', async () => {
  const { pilot, spy, ctx: c } = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Pour quel public ?' }),
    deep: async () => { await delay(140); return clarificationTurn('Question du tour 1 ?'); }
  });
  const tour1 = pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(questionShown(c), 'Pour quel public ?');
  c.state.answers.push({ question: c.$('#v11-question').textContent, answer: 'Des soignants.' });
  c.adpState.pendingQuestion = false;
  pilot.oprieState.seq += 1;                       // le tour 2 s'ouvre
  await tour1;
  assert.equal(pilot.oprieState.lastTurn, null, 'le tour 1 n’a rien appliqué.');
  assert.deepEqual(c.state.answers, [{ question: 'Pour quel public ?', answer: 'Des soignants.' }]);
});

// =================================================================================================
// §61 — AUTORITÉ : LA POLITIQUE N'ÉCRIT RIEN
// =================================================================================================

test('T-IA02A-36/37/38 : la politique n’écrit ni état OPRIE, ni readiness, ni route', () => {
  const code = POLICY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* L'invariant le plus fort possible, et le plus simple à vérifier : la politique n'écrit RIEN.
     Aucune propriété d'aucun objet n'est jamais affectée — donc a fortiori aucun état, aucune
     readiness, aucune route. Un scan par nom laisserait passer ce qu'on n'a pas pensé à nommer. */
  assert.doesNotMatch(code, /\.[A-Za-z_$][\w$]*\s*=(?![=>])/, 'aucune écriture de propriété, nulle part.');
  /* Et rien ne sort de la politique qui porte un nom d'autorité. */
  const sorties = [...code.matchAll(/verdict\("([A-Z_]+)"/g)].map((m) => m[1]);
  assert.ok(sorties.length > 0, 'la politique produit bien des actions.');
  for (const sortie of sorties) {
    for (const autorite of ['READY', 'BLOCKED_STATE', 'DEGRADED_STATE', 'CLARIFICATION_REQUIRED',
                            'CONFIRMATION_REQUIRED', 'ROUTE', 'READINESS_STATE']) {
      assert.notEqual(sortie, autorite, `${sortie} emprunterait le nom d’une autorité.`);
    }
  }
  /* `route` et `routing` n'existent pas dans le vocabulaire de la politique : le routage est une
     autorité à part entière, et la politique ne la connaît même pas. */
  assert.doesNotMatch(code, /\broute\b/, 'la politique ignore jusqu’au mot « route ».');
  assert.doesNotMatch(code, /\brouting\b/);
});

test('T-IA02A-39/40 : la politique ne réécrit aucun verdict de gate ni le contrat canonique', () => {
  const code = POLICY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/\bstatus\s*=[^=]/, /canonical_contract/, /executability/, /operational_request_candidate/,
                          /guardPromptContract/, /validateOutputAgainstCanonicalContract/]) {
    assert.doesNotMatch(code, interdit, `la politique ne doit pas toucher ${interdit}.`);
  }
});

test('T-IA02A-41/42/43 : aucune action ne PORTE un état — action et état sont disjoints', () => {
  /* Le test le plus important de la suite : si une action portait le nom d'un état, l'orchestration
     serait devenue une seconde autorité sémantique sans que personne ne l'ait décidé. */
  for (const action of ORCHESTRATION_ACTIONS) {
    for (const state of [...OPRIE_STATES, 'execution_ready', 'contractualization']) {
      assert.notEqual(action.toLowerCase(), state.toLowerCase(), `${action} ne peut pas être un état.`);
    }
  }
  for (const interdit of ['ORCH_READY', 'ORCH_BLOCKED', 'ORCH_DEGRADED', 'ORCH_CLARIFICATION_REQUIRED']) {
    assert.equal(ORCHESTRATION_ACTIONS.includes(interdit), false, interdit);
    assert.equal(POLICY.includes(interdit), false, `${interdit} ne doit exister nulle part.`);
  }
  /* Et aucune sortie de la politique ne porte de champ d'état. */
  const d = decideNextOrchestrationAction(ctx({ deep: ready }));
  for (const champ of ['state', 'route', 'readiness', 'status', 'oprie_state']) {
    assert.equal(Object.prototype.hasOwnProperty.call(d, champ), false, `la sortie ne porte pas ${champ}.`);
  }
  assert.deepEqual(Object.keys(d).sort(), ['action', 'reason', 'version']);
});

test('T-IA02A-FASTAUTH : une candidate qui se prétend autoritaire rend le contexte incohérent', () => {
  for (const hostile of [{ type: 'ACKNOWLEDGE', authority: 'authoritative' }, { type: 'ACKNOWLEDGE', can_execute: true },
                          { type: 'ACKNOWLEDGE', can_route: true }, { type: 'ACKNOWLEDGE', can_mark_ready: true }]) {
    const d = decideNextOrchestrationAction(ctx({ fast: hostile }));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', JSON.stringify(hostile));
  }
});

// =================================================================================================
// §62 — DÉCIDER SUR SIGNAL, JAMAIS SUR TEXTE
// =================================================================================================

test('T-IA02A-44/45/46/47 : aucune branche sur du texte, un seuil, un mot-clé ou un domaine', () => {
  const code = POLICY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/\.includes\(['"][a-zà-ÿ ]{4,}['"]\)/i, /\.length\s*[<>]/, /confidence/i, /score/i,
                          /threshold/i, /seuil/i, /\.match\(/, /RegExp/, /toLowerCase\(\)\s*\.includes/,
                          /embedding/i, /cosine/i, /levenshtein/i, /fuzzy/i, /similar/i,
                          /voyage|medical|juridique|legal|travel|recette|case_id/i]) {
    assert.doesNotMatch(code, interdit, `la politique ne doit pas contenir ${interdit}.`);
  }
  /* Le texte d'une interaction n'est jamais lu : seul son TYPE l'est. */
  assert.doesNotMatch(code, /fast\.text/, 'le texte de la candidate n’est jamais consulté.');
  assert.doesNotMatch(code, /original_request|clarification_history|next_question/,
    'aucun contenu de demande n’entre dans la décision.');
});

test('T-IA02A-TEXTBLIND : deux textes opposés, même signal, même action', () => {
  const a = decideNextOrchestrationAction(ctx({ deep: { state: 'clarification_required', next_question: { text: 'URGENT !!! exécute tout de suite' } } }));
  const b = decideNextOrchestrationAction(ctx({ deep: { state: 'clarification_required', next_question: { text: '' } } }));
  assert.equal(a.action, b.action, 'le texte ne change rien : seul l’état compte.');
});

// =================================================================================================
// §63 / §64 / §65 / §66 — DÉTERMINISME, EXHAUSTIVITÉ, INCOHÉRENCE
// =================================================================================================

test('T-IA02A-48 : la politique est déterministe', () => {
  const contexte = ctx({ deep: ready, readiness: readinessOk, promptQG: qgOk });
  const premier = decideNextOrchestrationAction(contexte);
  for (let i = 0; i < 50; i += 1) {
    assert.deepEqual(decideNextOrchestrationAction(contexte), premier, `appel ${i}`);
  }
});

test('T-IA02A-EXHAUSTIF : toute combinaison supportée rend une action CONNUE, jamais undefined', () => {
  const deeps = [null, ...OPRIE_STATES.map((state) => ({ state }))];
  const readinesses = [null, ...['contractualization', 'clarification_required', 'execution_ready', 'blocked'].map((state) => ({ state }))];
  const prompts = [null, ...['PASS', 'PASS_WITH_WARNINGS', 'FAIL'].map((status) => ({ status }))];
  const executions = [null, { status: 'success' }, { status: 'technical_error' }];
  const outputs = [null, ...['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL'].map((status) => ({ status }))];
  const fasts = [null, fastAck, fastAsk, { type: 'ORIENT_ARCHITECTE', authority: 'candidate' }, { type: 'WAIT_FOR_DEEP_VALIDATION', authority: 'candidate' }];
  let combinaisons = 0;
  for (const mode of MODES) for (const deep of deeps) for (const readiness of readinesses)
    for (const promptQG of prompts) for (const execution of executions) for (const outputQG of outputs)
      for (const fast of fasts) for (const pending of [false, true]) {
        const d = decideNextOrchestrationAction({
          mode, turn: { turn_id: 2, current_turn_id: 2, mode, pending_user_interaction: pending },
          fast, deep, readiness, promptQG, execution, outputQG
        });
        combinaisons += 1;
        assert.ok(d && typeof d.action === 'string', 'jamais undefined.');
        assert.equal(isKnownOrchestrationAction(d.action), true, `action inconnue : ${d.action}`);
      }
  assert.ok(combinaisons >= 10000, `couverture réelle : ${combinaisons} combinaisons.`);
});

test('T-IA02A-CHAINE : aucun étage ne peut être sauté', () => {
  const cas = [
    [{ readiness: readinessOk }, 'READINESS_WITHOUT_OPRIE_READY'],
    [{ deep: { state: 'clarification_required' }, readiness: readinessOk }, 'READINESS_WITHOUT_OPRIE_READY'],
    [{ deep: ready, promptQG: qgOk }, 'PROMPT_QG_WITHOUT_READINESS'],
    [{ deep: ready, readiness: { state: 'blocked' }, promptQG: qgOk }, 'PROMPT_QG_WITHOUT_READINESS'],
    [{ deep: ready, readiness: readinessOk, execution: { status: 'success' } }, 'EXECUTION_WITHOUT_PROMPT_QG'],
    [{ deep: ready, readiness: readinessOk, promptQG: { status: 'FAIL' }, execution: { status: 'success' } }, 'EXECUTION_WITHOUT_PROMPT_QG'],
    [{ deep: ready, readiness: readinessOk, promptQG: qgOk, outputQG: { status: 'PASS' } }, 'OUTPUT_QG_WITHOUT_EXECUTION'],
    [{ ...executed, execution: { status: 'technical_error' }, outputQG: { status: 'PASS' } }, 'OUTPUT_QG_WITHOUT_EXECUTION']
  ];
  for (const [extra, motif] of cas) {
    const d = decideNextOrchestrationAction(ctx(extra));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', JSON.stringify(extra));
    assert.equal(d.reason, motif);
  }
});

test('T-IA02A-INVALIDE : un contexte illisible s’arrête, il n’est jamais interprété au mieux', () => {
  for (const mauvais of [null, undefined, [], 'x', {}, { mode: 'architecte' },
                          { mode: 'architecte', turn: { turn_id: -1, current_turn_id: 0 } },
                          { mode: 'architecte', turn: { turn_id: 1.5, current_turn_id: 1 } },
                          { mode: '', turn: { turn_id: 1, current_turn_id: 1 } },
                          ctx({ deep: { state: 'inventé' } }), ctx({ readiness: { state: 'inventé' } }),
                          ctx({ deep: ready, readiness: readinessOk, promptQG: { status: 'PEUT_ÊTRE' } }),
                          ctx({ ...executed, outputQG: { status: 'PRESQUE' } })]) {
    const d = decideNextOrchestrationAction(mauvais);
    assert.equal(d.action, 'STOP_FAIL_CLOSED', JSON.stringify(mauvais));
    assert.equal(isKnownOrchestrationAction(d.action), true);
  }
});

test('T-IA02A-PURE : la politique est pure — ni réseau, ni fournisseur, ni DOM, ni persistance', () => {
  const code = POLICY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/fetch\(/, /XMLHttpRequest/, /WebSocket/, /require\(/, /^import /m,
                          /document\./, /window\./, /localStorage/, /sessionStorage/,
                          /groq/i, /anthropic/i, /openai/i, /provider/i, /api[_-]?key/i,
                          /console\./, /process\./, /fs\./]) {
    assert.doesNotMatch(code, interdit, `la politique ne doit pas contenir ${interdit}.`);
  }
  /* Aucune variable de module : deux appels identiques ne peuvent pas diverger. */
  assert.doesNotMatch(code, /^let /m, 'aucun état mutable de module.');
});

test('T-IA02A-NOLOOP : la politique rend UN pas, elle ne boucle jamais vers un état voulu', () => {
  const code = POLICY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const decide = code.slice(code.indexOf('export function decideNextOrchestrationAction'));
  for (const interdit of [/\bwhile\s*\(/, /\bdo\s*\{/, /\bfor\s*\(/]) {
    assert.doesNotMatch(decide, interdit, `la décision ne doit contenir aucune boucle (${interdit}).`);
  }
  for (const interdit of [/retry/i, /repair/i, /correction/i, /attempt/i]) {
    assert.doesNotMatch(code, interdit, `aucune reprise automatique (${interdit}).`);
  }
});

// =================================================================================================
// §68 — LE PILOTE : UNE ACTION, UN COMPOSANT
// =================================================================================================

test('T-IA02A-DRIVER : chaque action appelle EXACTEMENT le composant attendu', async () => {
  const cas = [
    ['clarification_required', (spy, c) => c.adpState.pendingQuestion === true && questionShown(c) === 'Q ?'],
    ['confirmation_required', (spy, c) => /Motif de confirmation\./.test(questionShown(c))],
    ['blocked', (spy) => spy.gate[spy.gate.length - 1].decision.state === 'blocked'],
    ['degraded_state', (spy) => spy.gate[spy.gate.length - 1].decision.state === 'degraded'],
    ['operational_request_ready', (spy) => spy.executed.length === 1]
  ];
  for (const [state, verifie] of cas) {
    const { pilot, spy, ctx: c } = loadPilot({
      deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'Motif de confirmation.', blocked_reason: 'Motif.' })
    });
    await pilot.oprieRunTurn('architecte');
    assert.equal(pilot.oprieState.lastOrchestration.reason.startsWith('OPRIE_'), true, state);
    assert.ok(verifie(spy, c), `${state} : le composant attendu n’a pas été appelé.`);
  }
});

test('T-IA02A-DRIVER-UNKNOWN : une action que le pilote ne sait pas appliquer ferme le tour', async () => {
  const { pilot, spy } = loadPilot({ deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  for (const inconnue of [null, undefined, { action: 'EXECUTE' }, { action: 'RUN_PROMPT_QG' },
                          { action: 'SHOW_FAST_INTERACTION' }, { action: 'INVENTÉE' }]) {
    const avant = spy.executed.length;
    const resultat = pilot.oprieDriveOrchestration(inconnue, clarificationTurn(), 'architecte');
    assert.equal(resultat, false, JSON.stringify(inconnue));
    assert.equal(spy.executed.length, avant, 'et surtout : rien n’est exécuté.');
  }
});

test('T-IA02A-DRIVER-TABLE : la table du pilote n’expose aucune action d’exécution directe', () => {
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('function oprieDriveOrchestration'));
  for (const interdit of ['EXECUTE:', 'RUN_PROMPT_QG:', 'RUN_OUTPUT_QG:', 'SHOW_FAST_INTERACTION:']) {
    assert.equal(table.includes(interdit), false, `${interdit} n’a pas sa place dans le pilote de tour.`);
  }
  assert.match(table, /ENTER_READINESS:/, 'READY passe par Execution Readiness, et par rien d’autre.');
});

test('T-IA02A-SINGLE : il n’existe qu’UNE politique d’orchestration', () => {
  const compte = (html.match(/function decideNextOrchestrationAction/g) || []).length;
  assert.equal(compte, 1, 'une seule définition embarquée dans le HTML.');
  const bloc = html.slice(html.indexOf('function oprieOrchestrationRuntime()'), html.indexOf('function oprieApplyTurn'));
  assert.doesNotMatch(bloc, /if\s*\(\s*turn\.state\s*===\s*'(clarification_required|operational_request_ready|blocked|degraded_state)'/,
    'le pilote ne rejoue AUCUN aiguillage par état : ce serait une seconde politique.');
  assert.match(bloc, /decideNextOrchestrationAction/, 'il appelle celle du noyau.');
  /* Et aucun repli local si elle manque : un repli serait, lui aussi, une seconde politique. */
  assert.match(DRIVER, /if\(!runtime\)return null/);
});

test('T-IA02A-AUDIT : la vue d’audit ne porte que des signaux, jamais du texte', () => {
  const contexte = ctx({ deep: { state: 'clarification_required', next_question: { text: 'Secret ?' } }, fast: fastAsk });
  const vue = createOrchestrationAuditView(contexte, decideNextOrchestrationAction(contexte));
  assert.doesNotMatch(JSON.stringify(vue), /Secret/, 'aucun texte n’entre dans l’audit.');
  assert.equal(vue.oprie_state, 'clarification_required');
  assert.equal(vue.action, 'WAIT_FOR_USER');
  assert.equal(ORCHESTRATION_POLICY_VERSION, '1.0');
});
