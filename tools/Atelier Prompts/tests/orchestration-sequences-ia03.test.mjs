/* IA-03 — SÉQUENCES MULTI-ÉTAPES.
 * ============================================================================
 *
 * Une conversation réelle n'est pas un tour : c'est une suite de tours. Cette
 * suite éprouve ce que la suite ajoute au tour isolé — et rien d'autre.
 *
 *   LA CAUSALITÉ. Chaque réponse ouvre un tour NEUF ; aucune ne modifie
 *   rétroactivement le précédent, aucune ne rejoue une étape déjà franchie.
 *
 *   LE REJEU. Une action appartient à un tour. L'appliquer deux fois ne produit
 *   pas deux fois la même chose : ENTER_READINESS exécuterait deux fois, et
 *   WAIT_FOR_USER effacerait ce que la personne est en train d'écrire.
 *
 *   LE PASSÉ. Un résultat d'un tour révolu est écarté — en silence, sans erreur
 *   affichée, sans réinitialiser la conversation.
 *
 * IA-03 ne décide jamais QUAND une demande est prête : OPRIE le décide. Ce lot
 * garantit seulement que l'ordre et la causalité tiennent sur la durée.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNextOrchestrationAction, ORCHESTRATION_ACTIONS } from '../core/adn/orchestration-policy.js';
import { loadPilot, loadAnswerQuestion, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = fs.readFileSync(path.join(root, 'core/adn/orchestration-policy.js'), 'utf8');
const DRIVER = html.slice(html.indexOf('const ORCHESTRATION_POLICY_REQUIRED_SURFACE='), html.indexOf('function oprieApplyTurn'));
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();

/** Un pilote dont le plan profond rend une suite de tours, un par appel. */
function pilotSequence(turns, { mode = 'architecte', fast } = {}) {
  let i = 0;
  return loadPilot({ mode, fast, deep: async () => { const t = turns[Math.min(i, turns.length - 1)]; i += 1; return t; } });
}
/** Rejoue le geste réel : la personne répond, ce qui ouvre le tour suivant. */
async function repondre(h, texte = 'Ma réponse.') {
  h.ctx.state.answers.push({ question: questionShown(h.ctx), answer: texte });
  h.ctx.adpState.pendingQuestion = false;
  return h.pilot.oprieRunTurn(h.ctx.adpState.requestedMode);
}
const ready = { state: 'operational_request_ready' };
const ctxPolicy = (extra = {}) => ({
  mode: 'architecte', turn: { turn_id: 4, current_turn_id: 4, mode: 'architecte', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null, ...extra
});

// =================================================================================================
// §72 — LES SÉQUENCES PRINCIPALES
// =================================================================================================

test('T-IA03-01 : clarification → réponse → tour neuf', async () => {
  const h = pilotSequence([clarificationTurn('Pour quel public ?'), clarificationTurn('Quel format ?')]);
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  const tour1 = h.pilot.oprieState.seq;
  await repondre(h, 'Des soignants.');
  assert.ok(h.pilot.oprieState.seq > tour1, 'la réponse ouvre un tour NEUF, elle ne modifie pas l’ancien.');
  assert.equal(h.spy.deepCalls.length, 2, 'chaque tour est un appel OPRIE complet.');
  assert.deepEqual(h.spy.deepCalls[1].body.clarification_history,
    [{ turn: 1, question: 'Pour quel public ?', answer: 'Des soignants.', provenance: 'user' }],
    'la réponse voyage dans l’historique, jamais dans la demande.');
});

test('T-IA03-02 : confirmation → réponse → tour neuf', async () => {
  const h = pilotSequence([confirmationTurn('Un arbitrage a été fait.'), arbiterTurn('operational_request_ready')]);
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  await repondre(h, 'Je confirme');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS');
  assert.equal(h.spy.executed.length, 1, 'et l’exécution s’ouvre APRÈS confirmation, jamais avant.');
});

test('T-IA03-03/04 : clarification ↔ confirmation, dans les deux sens', async () => {
  for (const suite of [[clarificationTurn('Q ?'), confirmationTurn('Motif.')],
                       [confirmationTurn('Motif.'), clarificationTurn('Q ?')]]) {
    const h = pilotSequence(suite);
    await h.pilot.oprieRunTurn('architecte');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
    await repondre(h);
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
    assert.deepEqual(h.spy.executed, [], 'aucune exécution sur ces deux tours.');
    assert.equal(h.ctx.adpState.pendingQuestion, true, 'exactement une sollicitation reste ouverte.');
  }
});

test('T-IA03-05/06 : clarification puis READY, confirmation puis READY', async () => {
  for (const premier of [clarificationTurn('Q ?'), confirmationTurn('Motif.')]) {
    const h = pilotSequence([premier, arbiterTurn('operational_request_ready')]);
    await h.pilot.oprieRunTurn('architecte');
    await repondre(h);
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS',
      'READY ouvre Execution Readiness — jamais l’exécution directe.');
    assert.equal(h.spy.executed.length, 1);
  }
});

test('T-IA03-07/08 : clarification puis blocked, puis degraded', async () => {
  for (const [second, action, etat] of [[arbiterTurn('blocked', { blocked_reason: 'Info manquante.' }), 'SHOW_BLOCKED', 'blocked'],
                                        [arbiterTurn('degraded_state'), 'SHOW_DEGRADED', 'degraded']]) {
    const h = pilotSequence([clarificationTurn('Q ?'), second]);
    await h.pilot.oprieRunTurn('architecte');
    assert.equal(h.ctx.adpState.pendingQuestion, true);
    await repondre(h);
    assert.equal(h.pilot.oprieState.lastOrchestration.action, action);
    assert.equal(h.ctx.adpState.pendingQuestion, false, 'l’ancienne question est retirée.');
    assert.equal(h.spy.gate[h.spy.gate.length - 1].decision.state, etat);
    assert.deepEqual(h.spy.executed, []);
  }
});

test('T-IA03-09 : la chaîne complète READY → Readiness → QG → exécution → contrôle de sortie', () => {
  const etapes = [
    [{ deep: ready }, 'ENTER_READINESS'],
    [{ deep: ready, readiness: { state: 'execution_ready' } }, 'RUN_PROMPT_QG'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' } }, 'EXECUTE'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'success' } }, 'RUN_OUTPUT_QG'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'success' }, outputQG: { status: 'PASS' } }, 'SHOW_EXECUTION_RESULT']
  ];
  for (const [contexte, attendu] of etapes) {
    assert.equal(decideNextOrchestrationAction(ctxPolicy(contexte)).action, attendu, JSON.stringify(Object.keys(contexte)));
  }
});

test('T-IA03-10 : une Readiness non concluante arrête la séquence', () => {
  for (const state of ['contractualization', 'clarification_required', 'blocked']) {
    const d = decideNextOrchestrationAction(ctxPolicy({ deep: ready, readiness: { state } }));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', state);
    assert.equal(d.reason, `READINESS_${state.toUpperCase()}`, 'le verdict est nommé, jamais réinterprété.');
  }
});

// =================================================================================================
// §73 — QG, EXÉCUTION, CONTRÔLE DE SORTIE
// =================================================================================================

const jusquQg = { deep: ready, readiness: { state: 'execution_ready' } };
const execute = { ...jusquQg, promptQG: { status: 'PASS' }, execution: { status: 'success' } };

test('T-IA03-11 : un gate de prompt en échec arrête, sans reprise sémantique', () => {
  const d = decideNextOrchestrationAction(ctxPolicy({ ...jusquQg, promptQG: { status: 'FAIL' } }));
  assert.equal(d.action, 'STOP_FAIL_CLOSED');
  assert.equal(d.reason, 'PROMPT_QG_FAIL');
  assert.doesNotMatch(POLICY, /retry|repair|correction/i, 'aucune reprise sémantique n’existe.');
});

test('T-IA03-12 : une erreur technique d’exécution est préservée telle quelle', () => {
  const d = decideNextOrchestrationAction(ctxPolicy({ ...jusquQg, promptQG: { status: 'PASS' }, execution: { status: 'technical_error' } }));
  assert.equal(d.action, 'SHOW_EXECUTION_RESULT');
  assert.equal(d.reason, 'EXECUTION_TECHNICAL_ERROR', 'l’erreur n’est ni convertie ni masquée.');
});

test('T-IA03-13/14/15 : le verdict de sortie est restitué, jamais réinterprété', () => {
  assert.equal(decideNextOrchestrationAction(ctxPolicy({ ...execute, outputQG: { status: 'FAIL' } })).action, 'SHOW_OUTPUT_QG_FAILURE');
  assert.equal(decideNextOrchestrationAction(ctxPolicy({ ...execute, outputQG: { status: 'INCOMPLETE_VERIFICATION' } })).reason, 'OUTPUT_QG_INCOMPLETE_VERIFICATION');
  assert.equal(decideNextOrchestrationAction(ctxPolicy({ ...execute, outputQG: { status: 'PASS_WITH_WARNINGS' } })).reason, 'OUTPUT_QG_PASS_WITH_WARNINGS');
  /* Et côté produit, le mot « conforme » reste réservé à deux statuts. */
  assert.match(html, /verdict\.status==='PASS'\|\|verdict\.status==='PASS_WITH_WARNINGS'/);
});

// =================================================================================================
// §74 — CE QUI VIENT DU PASSÉ
// =================================================================================================

test('T-IA03-16 : un plan profond ancien, arrivé après une réponse, est écarté', async () => {
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
    deep: async () => { await delay(140); return arbiterTurn('operational_request_ready'); }
  });
  const tour1 = h.pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(questionShown(h.ctx), 'Q rapide ?');
  h.ctx.state.answers.push({ question: 'Q rapide ?', answer: 'R' });
  h.ctx.adpState.pendingQuestion = false;
  h.pilot.oprieState.seq += 1;                      // le tour 2 s'ouvre
  await tour1;
  assert.deepEqual(h.spy.executed, [], 'le READY du tour dépassé n’a rien exécuté.');
  assert.equal(h.pilot.oprieState.lastTurn, null, 'et n’a même pas été enregistré.');
  assert.deepEqual(h.ctx.state.answers, [{ question: 'Q rapide ?', answer: 'R' }], 'la réponse survit intacte.');
});

test('T-IA03-17 : une candidate rapide arrivée après le plan profond ne réaffiche rien', async () => {
  const h = loadPilot({
    fast: async () => { await delay(120); return { type: 'ASK_CLARIFICATION', text: 'Candidate tardive ?' }; },
    deep: async () => { await delay(20); return arbiterTurn('operational_request_ready'); }
  });
  await h.pilot.oprieRunTurn('architecte');
  const apresDeep = { question: questionShown(h.ctx), executions: h.spy.executed.length };
  await delay(140);
  assert.equal(questionShown(h.ctx), apresDeep.question, 'la candidate tardive n’a rien réaffiché.');
  assert.equal(h.spy.executed.length, apresDeep.executions);
  assert.equal(h.pilot.oprieState.fastInteraction, null);
});

test('T-IA03-18/19/20 : ni action, ni blocked, ni ready d’un tour révolu ne peuvent agir', () => {
  for (const extra of [{ deep: ready }, { deep: { state: 'blocked' } }, { deep: { state: 'clarification_required' } }]) {
    const d = decideNextOrchestrationAction({ ...ctxPolicy(extra), turn: { turn_id: 2, current_turn_id: 9, mode: 'architecte' } });
    assert.equal(d.action, 'IGNORE_STALE', JSON.stringify(extra));
  }
  /* Et un changement de mode suffit à rendre l'ancienne action inapplicable. */
  const modeChange = decideNextOrchestrationAction({
    ...ctxPolicy({ deep: ready }), mode: 'rapide', turn: { turn_id: 4, current_turn_id: 4, mode: 'architecte' }
  });
  assert.equal(modeChange.action, 'IGNORE_STALE');
  assert.equal(modeChange.reason, 'MODE_SWITCHED');
});

test('T-IA03-STALE-SILENCIEUX : un résultat dépassé n’ouvre AUCUNE erreur utilisateur', async () => {
  const h = loadPilot({ deep: async () => { await delay(100); return arbiterTurn('operational_request_ready'); } });
  const tour1 = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  const avant = h.spy.gate.length;
  await tour1;
  const nouveaux = h.spy.gate.slice(avant).map((g) => g.decision && g.decision.state);
  assert.equal(nouveaux.includes('technical'), false, 'aucune erreur technique affichée.');
  assert.equal(nouveaux.includes('blocked'), false, 'aucun blocage affiché.');
  assert.deepEqual(h.ctx.state.answers, [], 'la conversation n’est pas réinitialisée.');
});

// =================================================================================================
// §75 — LE REJEU
// =================================================================================================

test('T-IA03-21 : la même action, sur le même tour, ne produit qu’UN effet', async () => {
  const h = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 5; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'cinq rejeux, un seul effet.');
  const supprimes = h.pilot.oprieState.telemetry.filter((m) => m.event === 'orchestration_replay_suppressed');
  assert.equal(supprimes.length, 5, 'et chaque doublon est tracé, jamais perdu.');
});

test('T-IA03-22/23/24/25 : l’entrée dans la chaîne d’exécution est appliquée exactement une fois', async () => {
  const h = loadPilot({ deep: async () => clarificationTurn() });
  await h.pilot.oprieRunTurn('architecte');
  const turn = arbiterTurn('operational_request_ready');
  for (let i = 0; i < 4; i += 1) h.pilot.oprieDriveOrchestration({ action: 'ENTER_READINESS', reason: 'X' }, turn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'ENTER_READINESS — et donc Readiness, QG et exécution — n’est franchie qu’une fois.');
  /* Les étages aval ne sont jamais appliqués par le pilote de tour : ils ne peuvent pas s’y rejouer. */
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('/* ====\n * IA-03'));
  for (const aval of ['RUN_PROMPT_QG:', 'EXECUTE:', 'RUN_OUTPUT_QG:']) {
    assert.equal(table.includes(aval), false, `${aval} n’a pas sa place dans le pilote de tour.`);
  }
});

test('T-IA03-26 : une même candidate rapide n’est pas affichée deux fois', async () => {
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
    deep: async () => { await delay(120); return clarificationTurn('Q rapide ?'); }
  });
  const run = h.pilot.oprieRunTurn('architecte');
  await delay(30);
  const candidate = h.pilot.oprieState.fastInteraction;
  const avant = h.spy.shown.filter((s) => s.id === '#v11-dialogue').length;
  h.pilot.oprieRenderFastInteraction(candidate, h.pilot.oprieState.seq);
  h.pilot.oprieRenderFastInteraction(candidate, h.pilot.oprieState.seq);
  assert.equal(h.spy.shown.filter((s) => s.id === '#v11-dialogue').length, avant,
    'une interaction déjà ouverte ne se réouvre pas.');
  await run;
});

test('T-IA03-27 : WAIT_FOR_USER rejouée n’efface pas ce que la personne écrit', async () => {
  const h = loadPilot({ deep: async () => clarificationTurn('Pour quel public ?') });
  await h.pilot.oprieRunTurn('architecte');
  h.ctx.$('#v11-answer').value = 'Je suis en train d’écrire…';
  const turn = clarificationTurn('Pour quel public ?');
  for (let i = 0; i < 3; i += 1) h.pilot.oprieDriveOrchestration({ action: 'WAIT_FOR_USER', reason: 'X' }, turn, 'architecte');
  assert.equal(h.ctx.$('#v11-answer').value, 'Je suis en train d’écrire…',
    'la saisie survit — c’est exactement ce que le rejeu détruisait.');
});

// =================================================================================================
// §76 — LES ÉVÉNEMENTS EN DOUBLE
// =================================================================================================

test('T-IA03-28 : double soumission d’un tour — une seule requête', async () => {
  let appels = 0;
  const h = loadPilot({ deep: async () => { appels += 1; await delay(50); return clarificationTurn(); } });
  await Promise.all([h.pilot.oprieRunTurn('architecte'), h.pilot.oprieRunTurn('architecte'), h.pilot.oprieRunTurn('architecte')]);
  assert.equal(appels, 1, 'trois clics, un seul tour.');
});

test('T-IA03-29/30 : double réponse — une seule entrée dans l’historique, un seul tour', () => {
  /* answerQuestion est le chemin réel ; on l'exécute tel quel. */
  const a = loadAnswerQuestion({ running: false, question: 'Pour quel public ?' });
  a.answerQuestion('Des soignants.');
  assert.equal(a.spy.turns.length, 1, 'le premier clic ouvre un tour.');
  assert.equal(a.ctx.state.answers.length, 1);
  a.ctx.oprieState.running = true;                 // le tour né du premier clic démarre
  a.answerQuestion('Des soignants.');
  assert.equal(a.ctx.state.answers.length, 1, 'la réponse n’entre pas DEUX fois dans l’historique.');
  assert.equal(a.spy.turns.length, 1, 'et aucun second tour n’est ouvert.');
  assert.deepEqual(a.spy.exchanges, [], 'surtout : le second clic ne part pas dans l’échange manuel.');
});

test('T-IA03-31 : une promesse résolue deux fois ne produit pas deux effets', async () => {
  const h = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  const turn = h.pilot.oprieState.lastTurn;
  await Promise.all([
    Promise.resolve().then(() => h.pilot.oprieApplyTurn(turn, 'architecte')),
    Promise.resolve().then(() => h.pilot.oprieApplyTurn(turn, 'architecte'))
  ]);
  assert.equal(h.spy.executed.length, 1, 'deux rappels concurrents, un seul effet.');
});

test('T-IA03-32 : un écouteur d’événement dupliqué ne peut pas doubler l’exécution', async () => {
  const h = loadPilot({ deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  const turn = h.pilot.oprieState.lastTurn;
  for (let i = 0; i < 10; i += 1) h.pilot.oprieDriveOrchestration({ action: 'ENTER_READINESS', reason: 'X' }, turn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'dix déclenchements, une exécution.');
});

// =================================================================================================
// §77 — PLUSIEURS CLARIFICATIONS SONT LÉGITIMES
// =================================================================================================

test('T-IA03-33/34 : autant de clarifications qu’OPRIE en demande, sans plafond', async () => {
  const h = pilotSequence([clarificationTurn('Q1 ?'), clarificationTurn('Q2 ?'), clarificationTurn('Q3 ?'),
                           clarificationTurn('Q4 ?'), clarificationTurn('Q5 ?'), arbiterTurn('operational_request_ready')]);
  await h.pilot.oprieRunTurn('architecte');
  for (let i = 0; i < 5; i += 1) await repondre(h, `R${i + 1}`);
  assert.equal(h.spy.deepCalls.length, 6, 'six tours, aucun plafond.');
  assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS');
  assert.equal(h.ctx.state.answers.length, 5, 'les cinq réponses sont conservées, distinctes.');
  assert.equal(h.spy.deepCalls[5].body.clarification_history.length, 5, 'et toutes transmises.');
  /* Aucun compteur ne plafonne : le compteur d'audit existant ne décide rien. */
  assert.doesNotMatch(FRONTEND, /adpState\.clarifications\s*[<>]=?\s*\d/, 'aucun seuil de questions.');
  assert.doesNotMatch(POLICY, /clarifications|question_count|max_questions/i);
});

test('T-IA03-35/36 : aucune boucle automatique — la politique rend UN pas', () => {
  const decide = POLICY.slice(POLICY.indexOf('export function decideNextOrchestrationAction'));
  for (const interdit of [/\bwhile\s*\(/, /\bdo\s*\{/, /\bfor\s*\(/]) {
    assert.doesNotMatch(decide, interdit, `la décision ne boucle pas (${interdit}).`);
  }
  /* Et le pilote n'enchaîne pas : il applique, puis rend la main. */
  const drive = html.slice(html.indexOf('function oprieDriveOrchestration'), html.indexOf('function oprieApplyTurn'));
  assert.doesNotMatch(drive, /while|oprieRunTurn|oprieApplyTurn|oprieDecideOrchestration\(/,
    'aucune relance automatique depuis le pilote.');
  /* Un même tour, une même action, sans entrée nouvelle : le second passage est supprimé. */
  assert.match(DRIVER, /oprieActionAlreadyApplied\(oprieState\.seq,action\)/);
});

// =================================================================================================
// §78 — LES MODES
// =================================================================================================

test('T-IA03-37/38/39/40/41 : aucun mode ne réinterprète un état OPRIE, sur toute la séquence', async () => {
  for (const mode of ['rapide', 'architecte']) {
    const h = pilotSequence([clarificationTurn('Q ?'), confirmationTurn('Motif.'), arbiterTurn('operational_request_ready')], { mode });
    await h.pilot.oprieRunTurn(mode);
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER', `${mode} / clarification`);
    await repondre(h, 'R1');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER', `${mode} / confirmation`);
    await repondre(h, 'Je confirme');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS', `${mode} / ready`);
    assert.equal(h.spy.executed[0].engine, mode, 'le mode décide du MOTEUR, jamais de la readiness.');
  }
});

test('T-IA03-42 : une action de l’ancien mode ne peut pas agir après bascule', async () => {
  const h = loadPilot({ deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  h.ctx.adpState.requestedMode = 'rapide';
  await ancien;
  assert.deepEqual(h.spy.executed, [], 'l’ancien tour Architecte n’a rien exécuté dans le nouveau mode.');
  assert.equal(h.ctx.adpState.requestedMode, 'rapide');
});

// =================================================================================================
// §79 — AUCUNE AUTORITÉ NOUVELLE
// =================================================================================================

test('T-IA03-43..48 : IA-03 n’écrit aucune autorité', () => {
  /* Le registre d'application est la seule mémoire ajoutée : il ne porte que des métadonnées. */
  const registre = html.slice(html.indexOf('const ORCHESTRATION_EFFECTLESS_ACTIONS='), html.indexOf('function oprieDriveOrchestration'));
  for (const interdit of [/operational_request_ready/, /clarification_required/, /confirmation_required/,
                          /degraded_state/, /\broute\b/, /readiness/i, /canonical/i, /guardPromptContract/,
                          /validateOutputAgainstCanonicalContract/]) {
    assert.doesNotMatch(registre, interdit, `le registre ne doit rien savoir de ${interdit}.`);
  }
  /* Il ne contient QUE trois champs, et aucun n'est sémantique. */
  assert.match(registre, /\{turn_id:turnId,action:action,applied:true\}/);
  /* Et la politique reste inchangée par ce lot. */
  assert.doesNotMatch(POLICY, /appliedActions|replay/i, 'la protection de rejeu est technique, hors politique.');
});

test('T-IA03-NOFSM : aucune seconde machine d’état sémantique n’a été créée', () => {
  const registre = html.slice(html.indexOf('const ORCHESTRATION_EFFECTLESS_ACTIONS='), html.indexOf('function oprieDriveOrchestration'));
  const etats = ['clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked', 'degraded_state', 'execution_ready'];
  for (const etat of etats) assert.equal(registre.includes(etat), false, `${etat} n’est pas redéclaré.`);
  /* Le seul vocabulaire ajouté est celui d'une ACTION appliquée ou non. */
  assert.match(registre, /applied:true/);
  assert.equal((html.match(/function decideNextOrchestrationAction/g) || []).length, 1, 'toujours une seule politique.');
});

// =================================================================================================
// §80 — LES PORTES DU PIPELINE, SUR LA DURÉE
// =================================================================================================

test('T-IA03-49..54 : aucune porte ne peut être sautée, à aucun moment de la séquence', () => {
  const cas = [
    [{ deep: ready, promptQG: { status: 'PASS' } }, 'PROMPT_QG_WITHOUT_READINESS'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, execution: { status: 'success' } }, 'EXECUTION_WITHOUT_PROMPT_QG'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'FAIL' }, execution: { status: 'success' } }, 'EXECUTION_WITHOUT_PROMPT_QG'],
    [{ deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, outputQG: { status: 'PASS' } }, 'OUTPUT_QG_WITHOUT_EXECUTION'],
    [{ deep: { state: 'clarification_required' }, readiness: { state: 'execution_ready' } }, 'READINESS_WITHOUT_OPRIE_READY'],
    [{ readiness: { state: 'execution_ready' } }, 'READINESS_WITHOUT_OPRIE_READY']
  ];
  for (const [extra, motif] of cas) {
    const d = decideNextOrchestrationAction(ctxPolicy(extra));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', JSON.stringify(extra));
    assert.equal(d.reason, motif);
  }
  /* Une candidate rapide ne peut jamais atteindre l'exécution, quelle que soit la séquence. */
  for (const type of ['ACKNOWLEDGE', 'ASK_CLARIFICATION', 'ORIENT_ARCHITECTE']) {
    const d = decideNextOrchestrationAction(ctxPolicy({ fast: { type, authority: 'candidate' } }));
    assert.notEqual(d.action, 'EXECUTE', type);
    assert.notEqual(d.action, 'ENTER_READINESS', type);
  }
  /* Et un READY d'un tour dépassé n'ouvre pas Execution Readiness. */
  const stale = decideNextOrchestrationAction({ ...ctxPolicy({ deep: ready }), turn: { turn_id: 1, current_turn_id: 6, mode: 'architecte' } });
  assert.equal(stale.action, 'IGNORE_STALE');
});

// =================================================================================================
// §81 / §82 — L'ANCIEN RESTE INERTE, L'INCOHÉRENT SE FERME
// =================================================================================================

test('T-IA03-55/56/57 : rien d’inerte n’a été réactivé', () => {
  assert.equal([...FRONTEND.matchAll(/adpResumeAfterClarification/g)].length, 1, 'toujours sans appelant.');
  assert.equal([...FRONTEND.matchAll(/adpDecideRapide/g)].length, 2, 'toujours définition + handle.');
  assert.equal([...FRONTEND.matchAll(/adnNextConversationAction/g)].length, 2, 'toujours définition + appel legacy.');
  const legacy = fs.readFileSync(path.join(root, 'core/adn/conversation-orchestrator.js'), 'utf8');
  assert.match(legacy, /conversationQuestionsSimilar/, 'le flou hérité existe toujours…');
  assert.doesNotMatch(DRIVER, /conversationQuestionsSimilar|nextConversationAction|local-prudent/, '…et reste hors du pilote.');
  assert.doesNotMatch(POLICY, /conversationQuestionsSimilar|nextConversationAction|local-prudent/);
});

test('T-IA03-58/59/60 : séquence invalide, action inconnue, signaux contradictoires — fermeture', async () => {
  /* Séquence structurellement impossible. */
  assert.equal(decideNextOrchestrationAction(ctxPolicy({ outputQG: { status: 'PASS' } })).action, 'STOP_FAIL_CLOSED');
  /* Contexte incohérent. */
  for (const mauvais of [ctxPolicy({ deep: { state: 'inventé' } }), ctxPolicy({ readiness: { state: 'inventé' } }),
                          ctxPolicy({ fast: { type: 'ACKNOWLEDGE', can_execute: true } })]) {
    assert.equal(decideNextOrchestrationAction(mauvais).action, 'STOP_FAIL_CLOSED');
  }
  /* Action inconnue au pilote. */
  const h = loadPilot({ deep: async () => clarificationTurn() });
  await h.pilot.oprieRunTurn('architecte');
  const avant = h.spy.executed.length;
  for (const inconnue of [{ action: 'INVENTÉE' }, { action: 'execute' }, null]) {
    assert.equal(h.pilot.oprieDriveOrchestration(inconnue, arbiterTurn('operational_request_ready'), 'architecte'), false);
  }
  assert.equal(h.spy.executed.length, avant);
});

// =================================================================================================
// §89 — LE SPLIT RAPIDE / PROFOND SURVIT AUX SÉQUENCES
// =================================================================================================

test('T-IA03-PERF : sur plusieurs tours, le plan rapide rend toujours avant le plan profond', async () => {
  let i = 0;
  const suite = [clarificationTurn('Q1 ?'), clarificationTurn('Q2 ?'), arbiterTurn('operational_request_ready')];
  const h = loadPilot({
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: `Candidate ${i + 1} ?` }),
    deep: async () => { await delay(130); const t = suite[Math.min(i, suite.length - 1)]; i += 1; return t; }
  });
  const run = h.pilot.oprieRunTurn('architecte');
  await delay(40);
  assert.ok(h.spy.firstInteractionAt !== null && h.spy.firstInteractionAt < 130,
    `interaction rendue à ${h.spy.firstInteractionAt}ms, avant le plan profond (130ms).`);
  await run;
  const runSource = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.ok(runSource.indexOf('const deepPromise=oprieRequestTurn()') < runSource.indexOf('oprieStartFastPlane('),
    'le plan profond part toujours en premier.');
});

test('T-IA03-DETERMINISME : une même séquence structurée rend toujours les mêmes actions', () => {
  const sequence = [{ deep: { state: 'clarification_required' } }, { deep: { state: 'confirmation_required' } },
                    { deep: ready }, { deep: ready, readiness: { state: 'execution_ready' } },
                    { deep: ready, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' } }];
  const attendu = sequence.map((e) => decideNextOrchestrationAction(ctxPolicy(e)).action);
  for (let n = 0; n < 20; n += 1) {
    assert.deepEqual(sequence.map((e) => decideNextOrchestrationAction(ctxPolicy(e)).action), attendu, `passage ${n}`);
  }
  assert.deepEqual(attendu, ['WAIT_FOR_USER', 'WAIT_FOR_USER', 'ENTER_READINESS', 'RUN_PROMPT_QG', 'EXECUTE']);
  for (const a of attendu) assert.ok(ORCHESTRATION_ACTIONS.includes(a));
});
