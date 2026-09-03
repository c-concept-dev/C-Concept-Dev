/* IA-02B — FERMETURE DES CHEMINS D'ORCHESTRATION DU RUNTIME.
 * ============================================================================
 *
 * IA-02A a construit une politique unique. Cette suite éprouve la seule chose
 * qui reste à prouver : qu'elle est le SEUL chemin actif, et qu'aucun ancien
 * chemin ne peut plus décider une transition à sa place.
 *
 * La différence est capitale. Une politique unique dont un chemin parallèle
 * subsisterait ne serait pas « presque » unique : elle serait une politique
 * parmi deux, et la seconde déciderait un jour autrement. Ces tests sont donc
 * des SENTINELLES — ils échouent si quelqu'un rouvre un contournement, y
 * compris par inadvertance.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORCHESTRATION_ACTIONS, decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = fs.readFileSync(path.join(root, 'core/adn/orchestration-policy.js'), 'utf8');
const LEGACY = fs.readFileSync(path.join(root, 'core/adn/conversation-orchestrator.js'), 'utf8');

/** Le HTML sans le bloc runtime généré : c'est le code frontend écrit à la main. */
const FRONTEND = (() => {
  const i = html.indexOf('/* GENERATED');
  const j = html.indexOf('})(window);', i);
  return html.slice(0, i) + html.slice(j);
})();
/* Le pilote ENTIER, déclaration de surface exigée comprise. */
const DRIVER = html.slice(html.indexOf('const ORCHESTRATION_POLICY_REQUIRED_SURFACE='), html.indexOf('function oprieApplyTurn'));
const TURN_TABLE = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('const ORCHESTRATION_TURN_ACTIONS='));

/** Les 7 actions que le contexte d'un tour peut réellement produire. */
const TURN_ACTIONS = ['WAIT_FOR_USER', 'KEEP_CURRENT_INTERACTION', 'SHOW_BLOCKED', 'SHOW_DEGRADED',
                      'ENTER_READINESS', 'IGNORE_STALE', 'STOP_FAIL_CLOSED'];

// =================================================================================================
// §55 — TOUS LES CHEMINS RUNTIME PASSENT PAR LA POLITIQUE
// =================================================================================================

/** Un tour complet, avec traçage de l'action réellement décidée. */
async function tour({ deep, mode = 'architecte', fast } = {}) {
  const h = loadPilot({ deep, fast, mode });
  await h.pilot.oprieRunTurn(mode);
  return h;
}

test('T-IA02B-01 : le tour principal de l’interface passe par la politique', async () => {
  const { pilot } = await tour({ deep: async () => clarificationTurn('Q ?') });
  assert.ok(pilot.oprieState.lastOrchestration, 'une décision d’orchestration a bien été prise.');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.equal(pilot.oprieState.lastOrchestration.version, '1.0', 'et elle vient de LA politique.');
});

test('T-IA02B-02 : la reprise après clarification repasse par la politique', async () => {
  const { pilot, spy, ctx } = loadPilot({ deep: async () => clarificationTurn('Q1 ?') });
  await pilot.oprieRunTurn('architecte');
  const premiere = pilot.oprieState.lastOrchestration;
  /* La personne répond : answerQuestion enregistre et relance oprieRunTurn — donc la politique. */
  ctx.state.answers.push({ question: 'Q1 ?', answer: 'R1' });
  ctx.adpState.pendingQuestion = false;
  await pilot.oprieRunTurn('architecte');
  assert.notEqual(pilot.oprieState.lastOrchestration, premiere, 'un second tour a bien été décidé.');
  assert.equal(spy.deepCalls.length, 2, 'chaque reprise est un tour OPRIE complet.');
  assert.match(html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll()')),
    /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/, 'et la reprise ne court-circuite jamais le tour.');
});

test('T-IA02B-03 : la reprise après confirmation repasse par la politique', async () => {
  const { pilot, ctx } = loadPilot({ deep: async () => confirmationTurn('Un arbitrage a été fait.') });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.match(questionShown(ctx), /Confirmez-vous \?/);
  ctx.state.answers.push({ question: questionShown(ctx), answer: 'Je confirme' });
  ctx.adpState.pendingQuestion = false;
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.version, '1.0');
});

test('T-IA02B-04 : un changement de mode ouvre un tour qui repasse par la politique', async () => {
  const { pilot } = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS');
  await pilot.oprieRunTurn('rapide');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS');
  assert.equal(pilot.oprieState.requestedMode, 'rapide');
});

test('T-IA02B-05 : la réconciliation Fast/Deep passe par la politique, pas par une logique parallèle', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Pour quel public ?' }),
    deep: async () => { await delay(60); return clarificationTurn('Quel public ?'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'KEEP_CURRENT_INTERACTION');
  assert.equal(pilot.oprieState.lastOrchestration.reason, 'DEEP_CONFIRMS_FAST_CLARIFICATION_REQUIRED');
  const dialogues = spy.shown.filter((s) => s.id === '#v11-dialogue');
  assert.equal(dialogues.length, 1, 'et la conservation est une DÉCISION, pas un effet de bord.');
});

test('T-IA02B-06 : tout résultat profond est appliqué via la politique', async () => {
  for (const [state, action] of [['clarification_required', 'WAIT_FOR_USER'], ['confirmation_required', 'WAIT_FOR_USER'],
                                  ['blocked', 'SHOW_BLOCKED'], ['degraded_state', 'SHOW_DEGRADED'],
                                  ['operational_request_ready', 'ENTER_READINESS']]) {
    const { pilot } = await tour({ deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R', blocked_reason: 'B' }) });
    assert.equal(pilot.oprieState.lastOrchestration.action, action, state);
  }
});

test('T-IA02B-07/08/09/10 : les transitions aval sont décidées par la politique, jamais déduites', () => {
  /* Ces quatre étages ne naissent pas d'un contexte de tour : ils exigent un verdict d'autorité que
     seule la politique sait lire. On éprouve donc la politique elle-même, là où ils vivent. */
  const base = { mode: 'architecte', turn: { turn_id: 1, current_turn_id: 1 }, fast: null,
                 deep: { state: 'operational_request_ready' }, readiness: null, promptQG: null, execution: null, outputQG: null };
  assert.equal(decideNextOrchestrationAction({ ...base, readiness: { state: 'execution_ready' } }).action, 'RUN_PROMPT_QG');
  assert.equal(decideNextOrchestrationAction({ ...base, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' } }).action, 'EXECUTE');
  assert.equal(decideNextOrchestrationAction({ ...base, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'success' } }).action, 'RUN_OUTPUT_QG');
  assert.equal(decideNextOrchestrationAction({ ...base, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'success' }, outputQG: { status: 'PASS' } }).action, 'SHOW_EXECUTION_RESULT');
});

// =================================================================================================
// §56 — DISPONIBILITÉ DE LA POLITIQUE, ET FERMETURE EN SON ABSENCE
// =================================================================================================

test('T-IA02B-11 : la politique est embarquée dans le navigateur, exactement une fois', () => {
  assert.equal((html.match(/function decideNextOrchestrationAction/g) || []).length, 1);
  const generated = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
  assert.equal((generated.match(/function decideNextOrchestrationAction/g) || []).length, 1);
  assert.match(generated, /decideNextOrchestrationAction,/, 'et elle est exposée sur l’agrégat runtime.');
});

test('T-IA02B-12 : aucun chemin worker n’a besoin de la politique', () => {
  const workers = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) workers.push(f);
  } };
  walk(path.join(root, 'workers'));
  for (const f of workers) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /orchestration-policy|decideNextOrchestrationAction/,
      `${path.basename(f)} : le serveur n’orchestre pas de tour d’interface.`);
  }
  assert.ok(workers.length > 0, 'des fichiers worker existent bien.');
});

test('T-IA02B-13 : politique absente → le tour se ferme, sans jamais rien décider', async () => {
  const { pilot, spy, ctx } = loadPilot({ noRuntime: true, deep: async () => arbiterTurn('operational_request_ready') });
  await pilot.oprieRunTurn('architecte');
  assert.deepEqual(spy.executed, [], 'aucune exécution.');
  assert.equal(questionShown(ctx), '', 'aucune question.');
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical');
});

test('T-IA02B-14 : export PARTIEL → le tour se ferme aussi', async () => {
  /* Un module à moitié chargé répond, mais on ne sait pas avec quoi. La surface est exigée entière. */
  for (const absent of ['decideNextOrchestrationAction', 'isKnownOrchestrationAction']) {
    const { pilot, spy } = loadPilot({ partialPolicy: [absent], deep: async () => arbiterTurn('operational_request_ready') });
    await pilot.oprieRunTurn('architecte');
    assert.deepEqual(spy.executed, [], `sans ${absent}, rien ne s’exécute.`);
    assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical', absent);
  }
  assert.match(DRIVER, /ORCHESTRATION_POLICY_REQUIRED_SURFACE=Object\.freeze\(\['decideNextOrchestrationAction','isKnownOrchestrationAction'\]\)/,
    'la surface exigée est déclarée, pas implicite.');
});

test('T-IA02B-15 : action inconnue → fermeture, et jamais un effet métier', async () => {
  const { pilot, spy } = loadPilot({ deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  const avant = spy.executed.length;
  for (const inconnue of [null, undefined, {}, { action: null }, { action: 'INVENTÉE' },
                          { action: 'execute' }, { action: 'ENTER_READINESS ' }]) {
    assert.equal(pilot.oprieDriveOrchestration(inconnue, arbiterTurn('operational_request_ready'), 'architecte'), false,
      JSON.stringify(inconnue));
    assert.equal(spy.executed.length, avant, 'rien n’est exécuté.');
  }
});

// =================================================================================================
// §57 — L'ANCIEN CHEMIN : PRÉSENT, CARACTÉRISÉ, INACTIF
// =================================================================================================

test('T-IA02B-16 : nextConversationAction n’est atteignable par AUCUN chemin d’interface', () => {
  assert.match(LEGACY, /export function nextConversationAction/, 'la fonction existe toujours (retrait = lot CLEAN).');
  /* Son unique consommateur frontend est adnNextConversationAction, appelé par adpDecideRapide. */
  const appelants = [...FRONTEND.matchAll(/adnNextConversationAction\(/g)].length;
  assert.equal(appelants, 2, 'une définition et un unique appel : adpDecideRapide.');
  /* adpDecideRapide n'est atteignable que par un handle de compatibilité, jamais par l'interface. */
  const usages = [...FRONTEND.matchAll(/adpDecideRapide/g)].length;
  assert.equal(usages, 2, 'une définition et une exposition de compatibilité, rien d’autre.');
  assert.match(FRONTEND, /decide:adpDecideRapide/, 'la seule référence restante est le handle.');
  /* Et aucun écouteur d'événement, aucun routeur, ne le nomme. */
  for (const entree of ['v11StartRapide', 'v11StartArchitecte', 'v11StartAtelier', 'routeCurrentMode', 'answerQuestion']) {
    const bloc = FRONTEND.slice(FRONTEND.indexOf(`function ${entree}`), FRONTEND.indexOf(`function ${entree}`) + 900);
    assert.doesNotMatch(bloc, /adpDecideRapide|adnNextConversationAction/, `${entree} n’emprunte pas l’ancien chemin.`);
  }
});

test('T-IA02B-17 : l’ancien chemin ne peut pas se substituer à la politique active', () => {
  /* Preuve structurelle : il n'écrit aucun des états sur lesquels le tour s'appuie. */
  const decide = FRONTEND.slice(FRONTEND.indexOf('async function adpDecideRapide'), FRONTEND.indexOf('function adpRunRapide'));
  for (const interdit of [/oprieState\./, /oprieApplyTurn/, /oprieDriveOrchestration/, /oprieDecideOrchestration/,
                          /adpRunRapide\(/, /adpEnterArchitecte\(/, /oprieEnterExecution/]) {
    assert.doesNotMatch(decide, interdit, `l’ancien chemin ne touche pas ${interdit}.`);
  }
  assert.doesNotMatch(decide, /canonicalContract/, 'et ne pose aucun contrat canonique.');
});

test('T-IA02B-18 : le handle de compatibilité ne peut pas altérer le tour courant', async () => {
  const { pilot, ctx } = loadPilot({ deep: async () => clarificationTurn('Q ?') });
  await pilot.oprieRunTurn('architecte');
  const avant = { orchestration: pilot.oprieState.lastOrchestration, tour: pilot.oprieState.lastTurn, seq: pilot.oprieState.seq };
  /* Le handle est gelé et n'expose aucun moyen d'écrire dans oprieState. */
  assert.match(FRONTEND, /window\.__ADAPTIVE_DECISION_PIPELINE_10G__=Object\.freeze\(\{/, 'le handle est gelé.');
  const bloc = FRONTEND.slice(FRONTEND.indexOf('window.__ADAPTIVE_DECISION_PIPELINE_10G__'), FRONTEND.indexOf('window.__V11_ROUTER__'));
  assert.doesNotMatch(bloc, /oprieState|oprieRunTurn|oprieApplyTurn/, 'il n’expose rien du tour.');
  assert.deepEqual({ orchestration: pilot.oprieState.lastOrchestration, tour: pilot.oprieState.lastTurn, seq: pilot.oprieState.seq }, avant);
});

test('T-IA02B-19 : l’appariement flou hérité n’est consulté par aucun chemin actif', () => {
  assert.match(LEGACY, /conversationQuestionsSimilar/, 'le flou existe toujours dans l’ancien module.');
  assert.match(LEGACY, />= 0\.6/, 'avec son seuil historique.');
  /* Aucun chemin du tour ne le nomme, ni directement ni via le runtime. */
  assert.doesNotMatch(DRIVER, /conversationQuestionsSimilar|nextConversationAction/);
  assert.doesNotMatch(POLICY, /conversationQuestionsSimilar|nextConversationAction|0\.6/);
  const tourBloc = FRONTEND.slice(FRONTEND.indexOf('async function oprieRunTurn'), FRONTEND.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.doesNotMatch(tourBloc, /conversationQuestionsSimilar|Similar|previous_questions/);
});

test('T-IA02B-20 : le repli « local-prudent » reste inatteignable', () => {
  assert.match(LEGACY, /local-prudent/, 'le repli existe toujours dans l’ancien module.');
  /* Il ne peut être atteint que par nextConversationAction, que le tour n'appelle jamais. */
  assert.doesNotMatch(DRIVER, /local-prudent/);
  assert.doesNotMatch(POLICY, /local-prudent/);
  /* Et la politique ne rend JAMAIS un état exploitable sur panne : elle ferme. */
  const surPanne = decideNextOrchestrationAction({
    mode: 'architecte', turn: { turn_id: 1, current_turn_id: 1 }, fast: null, deep: null,
    readiness: null, promptQG: null, execution: null, outputQG: null, fast_failed: true
  });
  assert.equal(surPanne.action, 'WAIT_FOR_DEEP', 'une panne rapide attend, elle ne promeut rien.');
});

// =================================================================================================
// §58 — LE PILOTE COUVRE TOUTES LES ACTIONS, SANS SILENCE
// =================================================================================================

test('T-IA02B-21 : chaque action connue est soit appliquée, soit explicitement hors contexte', async () => {
  const { pilot, spy } = loadPilot({ deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  const table = Object.keys(pilot.ORCHESTRATION_DRIVER);
  assert.deepEqual(table.sort(), [...TURN_ACTIONS].sort(), 'la table du tour est exactement celle attendue.');
  for (const action of ORCHESTRATION_ACTIONS) {
    const applicable = table.includes(action);
    const avant = spy.executed.length;
    const r = pilot.oprieDriveOrchestration({ action, reason: 'TEST' }, clarificationTurn('Q ?'), 'architecte');
    if (!applicable) {
      assert.equal(r, false, `${action} est hors contexte de tour et doit fermer.`);
      assert.equal(spy.executed.length, avant, `${action} ne doit produire aucun effet métier.`);
    }
  }
  assert.equal(table.length + 9, ORCHESTRATION_ACTIONS.length, '7 actions de tour, 9 structurellement hors contexte.');
});

test('T-IA02B-22 : aucune action n’est silencieusement ignorée — chaque refus est tracé', async () => {
  const { pilot } = loadPilot({ deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  const avant = pilot.oprieState.telemetry.length;
  pilot.oprieDriveOrchestration({ action: 'EXECUTE', reason: 'TEST' }, clarificationTurn(), 'architecte');
  pilot.oprieDriveOrchestration({ action: 'INVENTÉE' }, clarificationTurn(), 'architecte');
  const nouvelles = pilot.oprieState.telemetry.slice(avant).map((m) => m.event);
  assert.ok(nouvelles.includes('orchestration_out_of_context'), 'une action hors contexte est tracée comme telle.');
  assert.ok(nouvelles.includes('orchestration_unknown_action'), 'une action inconnue est tracée séparément.');
});

test('T-IA02B-23 : le défaut du pilote est la fermeture, jamais la continuation', () => {
  assert.doesNotMatch(DRIVER, /default\s*:/, 'aucun cas par défaut permissif.');
  const drive = html.slice(html.indexOf('function oprieDriveOrchestration'), html.indexOf('function oprieApplyTurn'));
  assert.equal((drive.match(/return oprieShowNetworkFailure\(\)/g) || []).length, 2,
    'les deux refus — action inconnue et action hors contexte — ferment tous deux le tour.');
  assert.doesNotMatch(drive, /return true|continue|oprieEnterExecution/, 'aucun refus ne poursuit.');
});

// =================================================================================================
// §59 — PROVENANCE DE L'EXÉCUTION
// =================================================================================================

test('T-IA02B-24/25/26 : EXECUTE exige les TROIS preuves amont, ensemble', () => {
  const base = { mode: 'architecte', turn: { turn_id: 1, current_turn_id: 1 }, fast: null,
                 readiness: null, promptQG: null, execution: null, outputQG: null };
  const complet = { ...base, deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' } };
  assert.equal(decideNextOrchestrationAction(complet).action, 'EXECUTE', 'la chaîne complète ouvre l’exécution.');
  /* Retirer n'importe laquelle des trois preuves la referme. */
  assert.notEqual(decideNextOrchestrationAction({ ...complet, deep: { state: 'clarification_required' } }).action, 'EXECUTE');
  assert.notEqual(decideNextOrchestrationAction({ ...complet, readiness: { state: 'blocked' } }).action, 'EXECUTE');
  assert.notEqual(decideNextOrchestrationAction({ ...complet, promptQG: { status: 'FAIL' } }).action, 'EXECUTE');
  assert.notEqual(decideNextOrchestrationAction({ ...complet, readiness: null }).action, 'EXECUTE');
  assert.notEqual(decideNextOrchestrationAction({ ...complet, promptQG: null }).action, 'EXECUTE');
});

test('T-IA02B-27 : un READY profond ne peut pas exécuter directement', async () => {
  const { pilot, spy } = await tour({ deep: async () => arbiterTurn('operational_request_ready') });
  assert.equal(pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS',
    'READY ouvre Execution Readiness — il n’exécute pas.');
  assert.equal(spy.executed[0].engine, 'architecte', 'et l’entrée se fait par le moteur, sous contrat.');
  /* La table du tour ne connaît même pas l'action EXECUTE. */
  assert.doesNotMatch(TURN_TABLE, /EXECUTE:/);
});

test('T-IA02B-28 : aucune candidate rapide ne peut mener à l’exécution', async () => {
  for (const type of ['ACKNOWLEDGE', 'ASK_CLARIFICATION', 'ORIENT_ARCHITECTE', 'WAIT_FOR_DEEP_VALIDATION']) {
    const { pilot, spy } = loadPilot({
      fast: async () => ({ type, text: 'Texte.' }),
      deep: async () => { await delay(40); return clarificationTurn(); }
    });
    await pilot.oprieRunTurn('architecte');
    assert.deepEqual(spy.executed, [], type);
  }
});

test('T-IA02B-29/30 : le contrat canonique n’est posé QUE par l’entrée sous readiness', () => {
  /* Sentinelle de provenance : une seule ligne du produit écrit oprieState.canonicalContract, et
     elle vit dans oprieEnterExecution, atteignable par la seule action ENTER_READINESS. */
  const ecritures = [...FRONTEND.matchAll(/oprieState\.canonicalContract\s*=/g)].length;
  assert.equal(ecritures, 1, 'une seule écriture du contrat canonique dans tout le frontend.');
  const enter = FRONTEND.slice(FRONTEND.indexOf('function oprieEnterExecution'), FRONTEND.indexOf('function oprieOrchestrationRuntime'));
  assert.match(enter, /oprieState\.canonicalContract=canonical/, 'et elle est dans oprieEnterExecution.');
  assert.match(TURN_TABLE, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/);
  /* Et le gate de prompt Rapide ne peut pas être sauté quand un contrat exploitable existe. */
  assert.match(html, /if\(!p&&rapideContratCanonique&&rapideContratCanonique\.executability&&rapideContratCanonique\.executability\.state==='exploitable'\)\{signaler\(QG_MESSAGE_INDISPONIBLE/,
    'un contrat exploitable qui n’ouvre pas la voie canonique BLOQUE la publication.');
});

// =================================================================================================
// §60 / §61 — ÉCHECS ET TOURS DÉPASSÉS
// =================================================================================================

test('T-IA02B-31 : plan rapide en échec, plan profond conclut — via la politique', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => { throw new Error('KO'); },
    deep: async () => clarificationTurn('Q profonde ?')
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  assert.equal(spy.deepCalls.length, 1);
});

test('T-IA02B-32 : plan rapide réussi, plan profond en échec — aucune promotion', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
    deep: async () => { await delay(40); throw new Error('KO'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null);
  assert.deepEqual(spy.executed, []);
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical');
});

test('T-IA02B-33 : les deux en échec — fermeture', async () => {
  const { pilot, spy } = loadPilot({ fast: async () => { throw new Error('a'); }, deep: async () => { throw new Error('b'); } });
  await pilot.oprieRunTurn('architecte');
  assert.deepEqual(spy.executed, []);
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical');
});

test('T-IA02B-34 : une panne réseau ne produit aucun repli sémantique', async () => {
  const { pilot, spy, ctx } = loadPilot({ deep: async () => new Response('', { status: 503 }) });
  await pilot.oprieRunTurn('architecte');
  assert.deepEqual(spy.executed, []);
  assert.equal(questionShown(ctx), '', 'aucune question fabriquée.');
  assert.equal(pilot.oprieState.lastTurn, null, 'aucun tour appliqué.');
});

test('T-IA02B-35 : une relance technique ne fabrique aucune action métier', async () => {
  let appels = 0;
  const { pilot, spy } = loadPilot({
    deep: async () => { appels += 1; return appels === 1 ? new Response('', { status: 503 }) : clarificationTurn('Q ?'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastTurn, null, 'la panne n’a rien décidé.');
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER', 'la relance repasse par la politique.');
  assert.equal(appels, 2, 'la relance a bien refait un tour complet, sans mémoire d’action.');
});

test('T-IA02B-36/37/38/39 : tout ce qui vient d’un tour dépassé est écarté sans écrire', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => { await delay(70); return { type: 'ASK_CLARIFICATION', text: 'Q dépassée ?' }; },
    deep: async () => { await delay(140); return arbiterTurn('operational_request_ready'); }
  });
  const ancien = pilot.oprieRunTurn('architecte');
  await delay(20);
  pilot.oprieState.seq += 1;                 // un tour plus récent s'ouvre
  ctx.adpState.requestedMode = 'rapide';     // et le mode change
  await delay(120);
  await ancien;
  assert.equal(questionShown(ctx), '', 'aucune question du tour dépassé.');
  assert.deepEqual(spy.executed, [], 'aucune exécution du tour dépassé.');
  assert.equal(pilot.oprieState.lastTurn, null, 'aucun tour appliqué.');
  /* Et la politique elle-même écarte explicitement, elle ne lève pas. */
  const stale = decideNextOrchestrationAction({
    mode: 'rapide', turn: { turn_id: 1, current_turn_id: 7, mode: 'architecte' },
    fast: null, deep: { state: 'operational_request_ready' }, readiness: null, promptQG: null, execution: null, outputQG: null
  });
  assert.equal(stale.action, 'IGNORE_STALE');
  assert.equal(pilot.ORCHESTRATION_DRIVER.IGNORE_STALE(), false, 'et son application n’a aucun effet.');
});

// =================================================================================================
// §62 — LE CONTRAT DE MODE
// =================================================================================================

test('T-IA02B-40/41/42/43/44 : aucun mode ne réinterprète un état OPRIE', async () => {
  for (const mode of ['rapide', 'architecte']) {
    for (const [state, attendu] of [['clarification_required', 'WAIT_FOR_USER'], ['confirmation_required', 'WAIT_FOR_USER']]) {
      const { pilot, ctx } = loadPilot({
        mode,
        deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'Motif.' })
      });
      await pilot.oprieRunTurn(mode);
      assert.equal(pilot.oprieState.lastOrchestration.action, attendu, `${mode} / ${state}`);
      assert.equal(ctx.adpState.pendingQuestion, true, `${mode} / ${state} : la personne est bien sollicitée.`);
    }
  }
});

// =================================================================================================
// §63 — LES COMPTES
// =================================================================================================

test('T-IA02B-45 : il n’existe qu’UNE politique active', () => {
  const definitions = [...html.matchAll(/function decideNextOrchestrationAction/g)].length;
  assert.equal(definitions, 1);
  const appels = [...FRONTEND.matchAll(/decideNextOrchestrationAction\(/g)].length;
  assert.equal(appels, 1, 'un unique site d’appel dans tout le frontend écrit à la main.');
  assert.match(DRIVER, /runtime\.decideNextOrchestrationAction\(context\)/);
});

test('T-IA02B-46 : zéro contournement actif — aucun aiguillage par état hors politique', () => {
  /* Toute décision de transition doit passer par la politique. On cherche donc, dans le frontend
     écrit à la main, un aiguillage sur un état OPRIE qui CHOISIRAIT la suite. */
  const tourBloc = FRONTEND.slice(FRONTEND.indexOf('function oprieOrchestrationRuntime'), FRONTEND.indexOf('/* Un clic = un tour.'));
  const aiguillages = [...tourBloc.matchAll(/if\s*\(\s*turn\.state\s*===/g)].length;
  assert.equal(aiguillages, 0, 'le pilote ne rejoue aucun aiguillage par état.');
  /* La seule lecture d'état restante sert à choisir un AFFICHEUR, pas une transition. */
  const lectures = [...tourBloc.matchAll(/turn\.state\s*===\s*'[a-z_]+'/g)].map((m) => m[0]);
  assert.deepEqual(lectures, ["turn.state==='confirmation_required'"],
    'une seule lecture d’état subsiste, et elle ne choisit qu’un afficheur.');
});

test('T-IA02B-47 : zéro chemin d’orchestration hérité actif', () => {
  /* Les trois vestiges connus sont présents mais inertes : on le prouve, on ne le suppose pas. */
  const vestiges = {
    'adpResumeAfterClarification': 1,   // définition seule : aucun appelant
    'adpDecideRapide': 2,               // définition + handle de compatibilité
    'adnNextConversationAction': 2      // définition + unique appel depuis adpDecideRapide
  };
  for (const [nom, attendu] of Object.entries(vestiges)) {
    assert.equal([...FRONTEND.matchAll(new RegExp(nom, 'g'))].length, attendu, `${nom} : occurrences`);
  }
  /* Aucun écouteur d'événement ne les branche. */
  const init = FRONTEND.slice(FRONTEND.indexOf("$('#v11-answer-continue')"), FRONTEND.indexOf("$('#v11-answer-continue')") + 3000);
  assert.doesNotMatch(init, /adpDecideRapide|adnNextConversationAction|adpResumeAfterClarification/);
});

// =================================================================================================
// §64 — LE VERDICT DE SORTIE NE PEUT PAS DEVENIR UN SUCCÈS
// =================================================================================================

test('T-IA02B-48/49/50 : le contrôle de sortie est restitué, jamais réinterprété', () => {
  const base = { mode: 'architecte', turn: { turn_id: 1, current_turn_id: 1 }, fast: null,
                 deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' },
                 promptQG: { status: 'PASS' }, execution: { status: 'success' } };
  assert.equal(decideNextOrchestrationAction({ ...base, outputQG: { status: 'FAIL' } }).action, 'SHOW_OUTPUT_QG_FAILURE');
  const incomplet = decideNextOrchestrationAction({ ...base, outputQG: { status: 'INCOMPLETE_VERIFICATION' } });
  assert.equal(incomplet.reason, 'OUTPUT_QG_INCOMPLETE_VERIFICATION', 'l’incertitude reste nommée.');
  const avertissements = decideNextOrchestrationAction({ ...base, outputQG: { status: 'PASS_WITH_WARNINGS' } });
  assert.equal(avertissements.reason, 'OUTPUT_QG_PASS_WITH_WARNINGS', 'les avertissements ne sont pas effacés.');
  /* Et côté produit, le mot « conforme » reste réservé à deux statuts. */
  assert.match(html, /function qgSortieCertifie\(verdict\)\{\s*return !!verdict&&!verdict\.technical_failure&&\(verdict\.status==='PASS'\|\|verdict\.status==='PASS_WITH_WARNINGS'\)/);
});

// =================================================================================================
// §65 / §66 — DÉTERMINISME ET NON-RÉGRESSION PERF
// =================================================================================================

test('T-IA02B-PROP : même contexte structuré, même action — sur toutes les actions connues', () => {
  const vus = new Set();
  const deeps = [null, 'clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked', 'degraded_state'];
  for (const mode of ['rapide', 'architecte']) for (const d of deeps) for (const pending of [false, true]) {
    const c = { mode, turn: { turn_id: 2, current_turn_id: 2, mode, pending_user_interaction: pending },
                fast: null, deep: d ? { state: d } : null, readiness: null, promptQG: null, execution: null, outputQG: null };
    const premier = decideNextOrchestrationAction(c);
    for (let i = 0; i < 10; i += 1) assert.deepEqual(decideNextOrchestrationAction(c), premier);
    vus.add(premier.action);
  }
  assert.ok(vus.size >= 5, `plusieurs actions distinctes couvertes : ${[...vus].join(', ')}`);
});

test('T-IA02B-PERF : le plan rapide rend toujours avant le plan profond', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
    deep: async () => { await delay(150); return clarificationTurn(); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.ok(spy.firstInteractionAt !== null && spy.firstInteractionAt < 150,
    `l’interaction est rendue à ${spy.firstInteractionAt}ms, avant le plan profond (150ms).`);
  /* Et le plan profond part toujours avant que le plan rapide n'existe. */
  const run = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.ok(run.indexOf('const deepPromise=oprieRequestTurn()') < run.indexOf('oprieStartFastPlane('));
});

test('T-IA02B-NOCOPY : aucune copie de la politique dans le frontend', () => {
  /* Les seules actions nommées dans le frontend écrit à la main sont les 7 clés de la table. */
  for (const action of ORCHESTRATION_ACTIONS) {
    const attendu = TURN_ACTIONS.includes(action) ? 1 : 0;
    const vu = [...FRONTEND.matchAll(new RegExp(`\\b${action}\\b`, 'g'))].length;
    assert.equal(vu, attendu, `${action} : ${vu} occurrence(s) dans le frontend, attendu ${attendu}.`);
  }
  assert.doesNotMatch(FRONTEND, /ORCHESTRATION_ACTIONS\s*=/, 'l’énumération n’est pas recopiée.');
});
