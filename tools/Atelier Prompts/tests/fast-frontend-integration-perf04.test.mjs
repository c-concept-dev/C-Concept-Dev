/* PERF-04 — LE PLAN RAPIDE BRANCHÉ SUR LE FRONTEND RÉEL.
 * ============================================================================
 *
 * Ce que cette suite éprouve n'est pas « le plan rapide fonctionne » — PERF-03A
 * l'a déjà établi sur le noyau. Elle éprouve la seule chose que le branchement
 * ajoute, et la seule qui puisse casser la gouvernance :
 *
 *   qu'un affichage précoce ne devienne JAMAIS une décision,
 *   qu'un tour révolu n'écrase JAMAIS le tour courant,
 *   et qu'aucune deuxième question ne puisse apparaître.
 *
 * Les mesures de performance sont faites sur le chemin frontend RÉEL, avec un
 * réseau simulé. Elles mesurent donc ce que le frontend coûte — jamais ce que
 * le fournisseur coûte, qui n'est pas mesurable sans lui.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  html, loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay,
  inputEnabled, questionShown, percentiles, classify, FAST_ENDPOINT, OPRIE_ENDPOINT
} from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Le bloc PERF-04 tel qu'il vit en production : c'est lui qu'on scanne. */
const PERF04_BLOCK = html.slice(html.indexOf('const FAST_ENDPOINT='), html.indexOf('function oprieSetBusy(busy){'));
const RUN_TURN = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
const APPLY_TURN = html.slice(html.indexOf('function oprieApplyTurn'), html.indexOf('/* Un clic = un tour.'));

const askClarification = (text = 'Pour quel public ?') => ({ type: 'ASK_CLARIFICATION', text });
const acknowledge = (text = 'Bien reçu, j’examine votre demande.') => ({ type: 'ACKNOWLEDGE', text });
/* IA-04 : une candidate affichée SANS solliciter. Depuis que ASK_ONE_QUESTION arrête le tour,
   c'est la seule forme qui met une candidate à l'écran ET laisse le plan profond partir — donc la
   seule qui permet encore d'éprouver la réconciliation depuis le pilote. */
const orientArchitecte = (text = 'Le parcours guidé conviendrait mieux.') => ({ type: 'ORIENT_ARCHITECTE', text });

// =================================================================================================
// §65 — LE CŒUR : DEUX PLANS, UN TOUR, UNE SEULE AUTORITÉ
// =================================================================================================

test('T-P04-01 : soumettre déclenche le plan profond', async () => {
  const { pilot, spy } = loadPilot({ deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.deepCalls.length, 1, 'le plan profond part à chaque tour.');
  assert.equal(spy.deepCalls[0].body.original_request, 'Rédige une note de cadrage.');
  /* OPRIE-MATERIAL-CONTEXT-02 — UN TROISIÈME CHAMP, ET UN SEUL. PERF-04 n'ajoutait
     rien au contrat du plan profond, et c'est toujours vrai de PERF-04. Ce qui a
     changé vient d'ailleurs : le contexte matériau, champ OPTIONNEL dont l'absence
     vaut "unknown". L'assertion continue de garder ce qu'elle gardait — que le plan
     rapide n'ajoute rien — en énumérant exactement les champs légaux. */
  assert.deepEqual(Object.keys(spy.deepCalls[0].body).sort(),
    ['clarification_history', 'material_context', 'original_request'],
    'le contrat du plan profond ne porte que ses champs déclarés.');
});

test('T-P04-02 : soumettre déclenche le plan rapide, sur le même tour', async () => {
  const { pilot, spy } = loadPilot({ fast: async () => acknowledge(), deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 1);
  assert.equal(spy.fastCalls[0].body.turn_id, spy.deepCalls.length && pilot.oprieState.seq,
    'les deux plans portent le MÊME numéro de tour.');
  assert.equal(spy.fastCalls[0].body.original_request, spy.deepCalls[0].body.original_request,
    'les deux plans partent du même instantané, jamais de deux lectures d’état différentes.');
});

test('T-P04-03 : l’interaction rapide est rendue AVANT que le plan profond ait répondu', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification(),
    deep: async () => { await delay(120); return clarificationTurn(); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.ok(spy.firstInteractionAt !== null, 'une interaction exploitable a bien été affichée.');
  assert.ok(spy.firstInteractionAt < 120, `l’affichage (${spy.firstInteractionAt}ms) précède la réponse profonde (120ms).`);
  assert.equal(questionShown(ctx), 'Pour quel public ?');
});

test('T-P04-04 : un échec du plan rapide n’empêche jamais le plan profond', async () => {
  for (const panne of [
    async () => { throw new Error('réseau coupé'); },
    async () => new Response('', { status: 502 }),
    async () => ({ type: 'ASK_CLARIFICATION' }),                       // schéma incomplet
    async () => ({ type: 'INVENTÉ', text: 'x' }),                      // type inconnu
    async () => ({ type: 'ASK_CLARIFICATION', text: '   ' })           // texte vide
  ]) {
    const { pilot, spy } = loadPilot({ fast: panne, deep: async () => clarificationTurn('Question profonde ?') });
    await pilot.oprieRunTurn('architecte');
    assert.equal(spy.deepCalls.length, 1, 'le plan profond part malgré l’échec rapide.');
    assert.equal(pilot.oprieState.lastTurn.state, 'clarification_required', 'et son résultat est appliqué.');
  }
});

test('T-P04-05 : un échec du plan profond ne promeut JAMAIS la candidate rapide', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => orientArchitecte(),
    deep: async () => { await delay(30); throw new Error('panne profonde'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.deepEqual(spy.executed, [], 'aucune exécution : la candidate ne devient pas une autorité par défaut.');
  assert.equal(pilot.oprieState.fastInteraction, null, 'la candidate ne survit pas à l’échec profond.');
  const dernier = spy.gate[spy.gate.length - 1].decision;
  assert.equal(dernier.state, 'technical', 'la politique fail-closed existante est suivie telle quelle.');
});

test('T-P04-06 : la candidate rapide ne porte aucune autorité', async () => {
  const { pilot } = loadPilot({ fast: async () => askClarification(), deep: async () => { await delay(50); return clarificationTurn(); } });
  const run = pilot.oprieRunTurn('architecte');
  await delay(20);
  const candidate = pilot.oprieState.fastInteraction;
  assert.ok(candidate, 'la candidate existe pendant le tour.');
  assert.equal(candidate.authority, 'candidate');
  assert.equal(candidate.can_execute, false);
  assert.equal(candidate.can_route, false);
  assert.equal(candidate.can_mark_ready, false);
  for (const interdit of ['state', 'route', 'operational_request_ready', 'degraded_state', 'routing']) {
    assert.equal(Object.prototype.hasOwnProperty.call(candidate, interdit), false,
      `la candidate ne peut pas porter « ${interdit} ».`);
  }
  await run;
});

test('T-P04-07 : l’exécution finale reste conditionnée à operational_request_ready', async () => {
  for (const state of ['clarification_required', 'confirmation_required', 'blocked', 'degraded_state']) {
    const { pilot, spy } = loadPilot({ fast: async () => orientArchitecte(), deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R', blocked_reason: 'B' }) });
    await pilot.oprieRunTurn('architecte');
    assert.deepEqual(spy.executed, [], `${state} n’exécute jamais, même avec une candidate rapide affichée.`);
  }
  const { pilot, spy } = loadPilot({ fast: async () => orientArchitecte(), deep: async () => arbiterTurn('operational_request_ready') });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.executed.length, 1, 'seul operational_request_ready ouvre l’exécution.');
  assert.equal(spy.executed[0].orientation.source, 'oprie', 'et l’orientation vient d’OPRIE, jamais du plan rapide.');
});

test('T-P04-08 : la saisie est disponible dès la question rapide, sans attendre le plan profond', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification(),
    deep: async () => { await delay(150); return clarificationTurn(); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(40);
  assert.equal(inputEnabled(ctx), true, 'la saisie est ouverte alors que le plan profond tourne encore.');
  assert.equal(pilot.oprieState.running, false, 'le tour n’est plus verrouillé : une réponse peut démarrer le tour suivant.');
  await run;
});

test('T-P04-09 : le plan profond en arrière-plan ne reverrouille jamais la saisie', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification(),
    deep: async () => { await delay(120); return clarificationTurn(); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(30);
  const liberationRapide = spy.busy.findIndex((b) => b.busy === false);
  assert.ok(liberationRapide >= 0, 'la saisie a été libérée pendant le tour.');
  await run;
  assert.equal(inputEnabled(ctx), true, 'elle le reste après le retour du plan profond.');
  assert.equal(spy.busy.filter((b) => b.busy === true).length, 1, 'le verrou n’est posé qu’une fois par tour.');
});

test('T-P04-10 : aucun double état de chargement n’est présenté', async () => {
  const { pilot, spy } = loadPilot({ fast: async () => askClarification(), deep: async () => { await delay(60); return clarificationTurn(); } });
  await pilot.oprieRunTurn('architecte');
  const thinking = spy.gate.filter((g) => g.decision && g.decision.state === 'thinking');
  assert.ok(thinking.length <= 2, `au plus un bandeau d’analyse puis son remplacement (vu : ${thinking.length}).`);
  const titres = new Set(thinking.map((t) => t.decision.title));
  assert.equal(titres.size, 1, 'un seul libellé d’attente : les deux plans ne sont pas montrés comme deux phases.');
});

// =================================================================================================
// §66 — RÉCONCILIATION
// =================================================================================================

/* IA-04 — CE TEST GARDAIT UNE ABSENCE DE CLIGNOTEMENT ; IL GARDE MAINTENANT SA CAUSE.
 *
 * Il éprouvait DEEP_CONFIRMS_FAST : le plan profond arrivait sur une question rapide déjà lue, et la
 * politique refusait de la réafficher. Depuis IA-04, une question rapide arrête le tour : aucun plan
 * profond n'arrive derrière, et le clignotement est impossible pour une raison plus forte qu'une
 * politique — il n'y a rien qui puisse arriver. DEEP_CONFIRMS_FAST reste éprouvé là où il vit, sur
 * le noyau (fast-interactive-plane-perf03a : reconcileFastWithDeep et runInteractiveTurn). */
test('T-P04-11 : une question rapide est affichée UNE fois, et rien ne peut la réafficher', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification('Pour quel public ?'),
    deep: async () => { await delay(60); return clarificationTurn('Quel est le public visé ?'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.deepCalls.length, 0, 'aucune escalade : la question rapide suffisait.');
  const dialogues = spy.shown.filter((s) => s.id === '#v11-dialogue');
  assert.equal(dialogues.length, 1, 'la modale n’est ouverte qu’UNE fois : aucun clignotement.');
  assert.equal(questionShown(ctx), 'Pour quel public ?', 'la question déjà lue reste celle affichée.');
  assert.equal(pilot.oprieState.lastReconciliation, null, 'rien à réconcilier : le plan profond n’a pas parlé.');
});

test('T-P04-12 : quand le plan profond diverge, la candidate est invalidée et OPRIE est rendu', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => orientArchitecte(),
    deep: async () => { await delay(50); return confirmationTurn('Deux contraintes ont été arbitrées.'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.lastReconciliation.outcome, 'DEEP_SUPERSEDES_FAST');
  assert.equal(pilot.oprieState.fastInteraction, null, 'la candidate cesse d’exister.');
  assert.match(questionShown(ctx), /Deux contraintes ont été arbitrées\./, 'c’est le texte d’OPRIE qui est affiché.');
});

test('T-P04-13 : blocked remplace la candidate rapide', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => orientArchitecte(),
    deep: async () => { await delay(40); return arbiterTurn('blocked', { blocked_reason: 'Information non substituable manquante.' }); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null);
  const dernier = spy.gate[spy.gate.length - 1].decision;
  assert.equal(dernier.state, 'blocked');
  assert.deepEqual(spy.executed, []);
});

test('T-P04-14 : operational_request_ready remplace une question rapide en attente', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => orientArchitecte(),
    deep: async () => { await delay(60); return arbiterTurn('operational_request_ready'); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(25);
  assert.equal(pilot.oprieState.fastInteraction !== null, true, 'une candidate rapide est bien affichée.');
  await run;
  assert.equal(pilot.oprieState.fastInteraction, null, 'elle cesse d’exister sous l’état autoritaire.');
  assert.equal(spy.executed.length, 1, 'et l’exécution s’ouvre sur l’état d’OPRIE.');
});

test('T-P04-15 : un plan profond obsolète n’écrit jamais dans l’interface courante', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification(),
    deep: async ({ turn_id } = {}, { at } = {}) => { await delay(100); return arbiterTurn('operational_request_ready'); }
  });
  const premier = pilot.oprieRunTurn('architecte');
  await delay(20);
  /* Un tour plus récent s'ouvre pendant que le premier plan profond est encore en vol. */
  pilot.oprieState.seq += 1;
  const avant = spy.executed.length;
  await premier;
  assert.equal(spy.executed.length, avant, 'le résultat du tour dépassé n’a rien exécuté.');
  assert.equal(pilot.oprieState.lastTurn, null, 'et n’a même pas été enregistré comme dernier tour.');
});

test('T-P04-16 : une interaction rapide obsolète n’écrit jamais dans l’interface courante', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => { await delay(80); return askClarification('Question du tour dépassé ?'); },
    deep: async () => { await delay(200); return clarificationTurn(); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(20);
  pilot.oprieState.seq += 1;                       // un tour plus récent s'ouvre
  await delay(100);
  assert.equal(questionShown(ctx), '', 'aucune question du tour dépassé n’a été affichée.');
  assert.equal(pilot.oprieState.fastInteraction, null);
  await run.catch(() => {});
});

test('T-P04-17 : un tour ancien ne peut pas écrire par-dessus un nouveau mode', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification(),
    deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); }
  });
  const ancien = pilot.oprieRunTurn('architecte');
  await delay(20);
  /* L'utilisateur bascule en Rapide : un nouveau tour s'ouvre. */
  pilot.oprieState.seq += 1;
  ctx.adpState.requestedMode = 'rapide';
  await ancien;
  assert.deepEqual(spy.executed, [], 'le tour Architecte dépassé n’a rien exécuté dans le mode Rapide.');
  assert.equal(ctx.adpState.requestedMode, 'rapide', 'et n’a pas restauré son propre mode.');
});

test('T-P04-18 : une seule sollicitation peut être en attente à la fois', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification('Question rapide ?'),
    deep: async () => { await delay(60); return clarificationTurn('Question profonde ?'); }
  });
  await pilot.oprieRunTurn('architecte');
  const dialogues = spy.shown.filter((s) => s.id === '#v11-dialogue');
  assert.ok(dialogues.length <= 1, `au plus une modale ouverte par tour (vu : ${dialogues.length}).`);
  assert.equal(ctx.adpState.pendingQuestion, true, 'exactement une question reste en attente.');
});

// =================================================================================================
// §67 — RAPIDE : AUCUNE BOUCLE DE DIALOGUE
// =================================================================================================

/* ATELIER-RAPIDE-CONVERSATIONAL-FIX-01 — RAPIDE CONVERSE DÉSORMAIS.
   L'invariant R1 « Rapide ne converse pas » transformait une clarification en orientation, et la
   question n'arrivait qu'avec le plan profond — 503 ms de disponible, ~92 s d'attente mesurés.
   La règle est levée. Ce qui reste gardé, et que ces tests vérifient toujours : le plan rapide
   n'acquiert AUCUNE autorité, et la projection existe toujours pour les modes qui ne conversent
   pas — Atelier compose à la main et n'ouvre pas de tour gouverné. */
test('T-P04-19 : en Rapide, une clarification rapide pose la question tout de suite', async () => {
  const { pilot, spy, ctx } = loadPilot({
    mode: 'rapide',
    fast: async () => askClarification('Pour quel public ?'),
    deep: async () => { await delay(60); return arbiterTurn('operational_request_ready'); }
  });
  await pilot.oprieRunTurn('rapide');
  const dialogues = spy.shown.filter((s) => s.id === '#v11-dialogue');
  assert.equal(dialogues.length, 1, 'la modale de dialogue s’ouvre en Rapide.');
  assert.equal(questionShown(ctx), 'Pour quel public ?', 'et c’est la question du plan rapide qui s’affiche.');
});

test('T-P04-20 : en Rapide, une clarification RESTE une clarification', async () => {
  const { pilot, spy } = loadPilot({
    mode: 'rapide',
    fast: async () => askClarification('Pour quel public ?'),
    deep: async () => { await delay(80); return arbiterTurn('operational_request_ready'); }
  });
  const run = pilot.oprieRunTurn('rapide');
  await delay(30);
  const candidate = pilot.oprieState.fastInteraction;
  assert.equal(candidate.type, 'ASK_CLARIFICATION', 'la clarification reste une clarification en Rapide.');
  assert.equal(candidate.authority, 'candidate', 'et elle n’acquiert aucune autorité pour autant.');
  await run;
});

test('T-P04-21 : l’orientation ne touche ni la demande ni l’historique', async () => {
  const answers = [{ question: 'Q1 ?', answer: 'R1' }];
  const { pilot, spy, ctx } = loadPilot({
    mode: 'rapide', answers,
    fast: async () => acknowledge(),
    deep: async () => { await delay(50); return arbiterTurn('operational_request_ready'); }
  });
  await pilot.oprieRunTurn('rapide');
  assert.equal(ctx.$('#v11-demande').value, 'Rédige une note de cadrage.', 'la demande originale est intacte.');
  assert.deepEqual(ctx.state.answers, answers, 'l’historique de clarification est intact.');
  assert.deepEqual(spy.deepCalls[0].body.clarification_history,
    [{ turn: 1, question: 'Q1 ?', answer: 'R1', provenance: 'user' }],
    'et il a bien été transmis au plan profond, sous sa forme canonique.');
});

test('T-P04-22 : en Rapide, le plan rapide seul n’exécute jamais', async () => {
  const { pilot, spy } = loadPilot({
    mode: 'rapide',
    fast: async () => ({ type: 'ORIENT_ARCHITECTE', text: 'Passez en préparation guidée.' }),
    deep: async () => { await delay(60); return clarificationTurn(); }
  });
  await pilot.oprieRunTurn('rapide');
  assert.deepEqual(spy.executed, [], 'aucune exécution sans operational_request_ready.');
});

test('T-P04-23 : en Rapide, une confirmation rapide est posée comme une question', async () => {
  const { pilot, spy, ctx } = loadPilot({
    mode: 'rapide',
    fast: async () => ({ type: 'ASK_CONFIRMATION', text: 'Confirmez-vous ?' }),
    deep: async () => { await delay(60); return arbiterTurn('operational_request_ready'); }
  });
  const run = pilot.oprieRunTurn('rapide');
  await delay(25);
  assert.equal(pilot.oprieState.fastInteraction.type, 'ASK_CONFIRMATION');
  assert.equal(ctx.adpState.pendingQuestion, true, 'Rapide sollicite désormais, comme Architecte.');
  await run;
});

// =================================================================================================
// §68 — ARCHITECTE : LE DIALOGUE EST PRÉSERVÉ
// =================================================================================================

test('T-P04-24 : en Architecte, la question rapide est réellement affichée', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification('Quel format attendez-vous ?'),
    deep: async () => { await delay(90); return clarificationTurn(); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(questionShown(ctx), 'Quel format attendez-vous ?');
  assert.equal(ctx.adpState.pendingQuestion, true);
  await run;
});

test('T-P04-25 : l’utilisateur peut répondre avant le retour du plan profond', () => {
  /* answerQuestion est le chemin réel de la réponse : il enregistre la question TELLE QU'AFFICHÉE
     — donc la question rapide si c'est elle qu'on a lue — et rouvre un tour OPRIE complet. */
  const answer = html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll()'));
  assert.match(answer, /state\.answers\.push\(\{question:\$\('#v11-question'\)\.textContent,answer\}\)/,
    'la question enregistrée est celle qui a été affichée : la provenance ne peut pas diverger.');
  assert.match(answer, /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/,
    'répondre rouvre un tour OPRIE complet — jamais une décision locale.');
});

test('T-P04-26 : un plan profond ancien ne peut pas effacer une réponse plus récente', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification('Pour quel public ?'),
    deep: async () => { await delay(140); return clarificationTurn('Question du tour 1 ?'); }
  });
  const tour1 = pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(questionShown(ctx), 'Pour quel public ?');
  /* L'utilisateur répond : la réponse entre dans l'historique et un tour 2 s'ouvre. */
  ctx.state.answers.push({ question: ctx.$('#v11-question').textContent, answer: 'Des soignants.' });
  ctx.adpState.pendingQuestion = false;
  pilot.oprieState.seq += 1;
  await tour1;
  assert.deepEqual(ctx.state.answers, [{ question: 'Pour quel public ?', answer: 'Des soignants.' }],
    'la réponse survit intacte au retour du tour dépassé.');
  assert.equal(pilot.oprieState.lastTurn, null, 'le tour dépassé n’a rien appliqué.');
});

test('T-P04-27 : jamais deux questions successives dans un même tour', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => askClarification('Question rapide ?'),
    deep: async () => { await delay(70); return clarificationTurn('Question profonde ?'); }
  });
  await pilot.oprieRunTurn('architecte');
  const questions = spy.shown.filter((s) => s.id === '#v11-dialogue').length;
  assert.equal(questions, 1, 'une seule ouverture de dialogue pour un tour.');
});

test('T-P04-28 : la réconciliation est toujours tranchée par OPRIE', async () => {
  /* IA-04 : une candidate SOLLICITANTE arrête le tour — aucun plan profond ne vient donc la
     réconcilier depuis le pilote, et DEEP_CONFIRMS_FAST n'y est plus atteignable. Il reste éprouvé
     sur le noyau (perf03a). Ce qui reste vrai ICI, et que ce test garde : quel que soit l'état,
     l'état qui fait foi est TOUJOURS celui d'OPRIE, et la candidate cesse d'exister. */
  const cas = [
    ['clarification_required', 'ORIENT_ARCHITECTE', 'DEEP_SUPERSEDES_FAST'],
    ['confirmation_required', 'ORIENT_ARCHITECTE', 'DEEP_SUPERSEDES_FAST'],
    ['operational_request_ready', 'ORIENT_ARCHITECTE', 'DEEP_SUPERSEDES_FAST'],
    ['blocked', 'ORIENT_ARCHITECTE', 'DEEP_SUPERSEDES_FAST'],
    ['degraded_state', 'ORIENT_ARCHITECTE', 'DEEP_SUPERSEDES_FAST']
  ];
  for (const [state, fastType, attendu] of cas) {
    const { pilot } = loadPilot({
      fast: async () => ({ type: fastType, text: 'Texte.' }),
      deep: async () => { await delay(30); return arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R', blocked_reason: 'B' }); }
    });
    await pilot.oprieRunTurn('architecte');
    assert.equal(pilot.oprieState.lastReconciliation.outcome, attendu, `${state} + ${fastType}`);
    assert.equal(pilot.oprieState.lastReconciliation.authoritative_state, state,
      'l’état qui fait foi est TOUJOURS celui d’OPRIE.');
  }
});

// =================================================================================================
// §69 — AUTORITÉ : LE PLAN RAPIDE N'ÉCRIT RIEN
// =================================================================================================

test('T-P04-29 : le plan rapide n’écrit jamais dans l’état OPRIE', () => {
  for (const interdit of [/oprieState\.canonicalContract\s*=/, /oprieState\.enrichedContract\s*=/, /oprieState\.lastTurn\s*=/]) {
    assert.doesNotMatch(PERF04_BLOCK, interdit, `le bloc PERF-04 ne doit jamais écrire ${interdit}.`);
  }
});

test('T-P04-30 : aucune écriture de readiness', () => {
  assert.doesNotMatch(PERF04_BLOCK, /operational_request_ready/, 'le bloc PERF-04 ne nomme même pas l’état exploitable.');
  assert.doesNotMatch(PERF04_BLOCK, /\bready\b/i);
});

test('T-P04-31 : aucune écriture de route', () => {
  assert.doesNotMatch(PERF04_BLOCK, /route\s*[:=]/, 'aucune route n’est décidée dans le plan rapide.');
  assert.doesNotMatch(PERF04_BLOCK, /adpRunRapide|adpEnterArchitecte|v11SwitchToArchitecteFromRapid/,
    'le plan rapide n’appelle aucun moteur d’exécution.');
});

test('T-P04-32 : aucune écriture de degraded_state', () => {
  assert.doesNotMatch(PERF04_BLOCK, /degraded_state/);
});

test('T-P04-33 : aucun contournement d’Execution Readiness', () => {
  assert.doesNotMatch(PERF04_BLOCK, /assessAnalysisReadiness|buildFinalExecutionDirective|buildExecutionReadinessInstruction/);
});

test('T-P04-34 : aucun contournement du gate de prompt', () => {
  assert.doesNotMatch(PERF04_BLOCK, /guardPromptContract|validatePromptAgainstCanonicalContract|validateOutputAgainstCanonicalContract/);
});

test('T-P04-35 : le plan rapide ne déclenche aucune exécution finale', () => {
  assert.doesNotMatch(PERF04_BLOCK, /oprieEnterExecution|beginExchange|adpContinueArchitecte/);
  /* IA-02A : l'exécution reste atteinte NOMMÉMENT, mais par une action d'orchestration explicite
     plutôt que par un branchement inline. Le plan rapide ne peut produire aucune de ces deux choses. */
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('function oprieDriveOrchestration'));
  assert.match(table, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/,
    'seule l’action ENTER_READINESS atteint l’exécution.');
  assert.doesNotMatch(PERF04_BLOCK, /ORCHESTRATION_DRIVER|oprieDriveOrchestration/,
    'le plan rapide n’a aucun accès à la table d’application.');
});

// =================================================================================================
// §70 — SENTINELLES HOSTILES
// =================================================================================================

test('T-P04-36 : un plan rapide qui tente d’injecter READY n’a aucun effet', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'ok', state: 'operational_request_ready' }),
    deep: async () => clarificationTurn()
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null, 'la sortie hostile est refusée par le schéma, jamais rendue.');
  assert.deepEqual(spy.executed, []);
});

test('T-P04-37 : un plan rapide qui tente d’imposer une route n’a aucun effet', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ORIENT_ARCHITECTE', text: 'ok', route: 'architecte' }),
    deep: async () => clarificationTurn()
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null);
  assert.deepEqual(spy.executed, []);
});

test('T-P04-38 : un plan rapide qui tente d’imposer degraded/blocked n’a aucun effet autoritaire', async () => {
  for (const hostile of [
    { type: 'ACKNOWLEDGE', text: 'ok', degraded_state: true },
    { type: 'ACKNOWLEDGE', text: 'ok', blocked_reason: 'stop' },
    { type: 'ACKNOWLEDGE', text: 'ok', authority: 'authoritative' },
    { type: 'ACKNOWLEDGE', text: 'ok', can_execute: true }
  ]) {
    const { pilot, spy } = loadPilot({ fast: async () => hostile, deep: async () => clarificationTurn('Q ?') });
    await pilot.oprieRunTurn('architecte');
    assert.equal(pilot.oprieState.fastInteraction, null, `${JSON.stringify(hostile)} doit être refusé.`);
    assert.equal(pilot.oprieState.lastTurn.state, 'clarification_required', 'et l’état rendu reste celui d’OPRIE.');
  }
});

test('T-P04-39 : un texte rapide qui prétend exécuter n’exécute rien', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'ACKNOWLEDGE', text: 'J’exécute maintenant votre demande et je produis le livrable.' }),
    deep: async () => { await delay(40); return clarificationTurn(); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.deepEqual(spy.executed, [], 'un texte n’est jamais une permission : rien n’est exécuté.');
  assert.equal(spy.fastCalls.length, 1);
});

// =================================================================================================
// §71 — ÉCHECS
// =================================================================================================

test('T-P04-40 : timeout rapide — aucune question n’est fabriquée', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async (_b, { signal }) => { await delay(300); throw new Error('timeout'); },
    deep: async () => { await delay(40); return arbiterTurn('operational_request_ready'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(questionShown(ctx), '', 'aucune question locale n’est inventée.');
  assert.equal(spy.executed.length, 1, 'le plan profond a conclu normalement.');
});

test('T-P04-41 : refus rapide (502) — aucune question n’est fabriquée', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => new Response(JSON.stringify({ error: 'FAST_SCHEMA_ERROR' }), { status: 502 }),
    deep: async () => clarificationTurn('Question profonde ?')
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null);
  assert.equal(questionShown(ctx), 'Question profonde ?', 'seule la question d’OPRIE est posée.');
});

test('T-P04-42 : schéma rapide invalide — refus, jamais réparation', async () => {
  for (const invalide of [null, [], 'texte', {}, { type: 'ACKNOWLEDGE' }, { text: 'x' }, { type: 'ACKNOWLEDGE', text: '' }]) {
    const { pilot } = loadPilot({ fast: async () => invalide, deep: async () => clarificationTurn('Q ?') });
    await pilot.oprieRunTurn('architecte');
    assert.equal(pilot.oprieState.fastInteraction, null, `${JSON.stringify(invalide)} ne doit produire aucune interaction.`);
  }
});

test('T-P04-43 : panne profonde APRÈS affichage rapide — la politique fail-closed s’applique', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => orientArchitecte(),
    deep: async () => { await delay(60); throw new Error('panne'); }
  });
  const run = pilot.oprieRunTurn('architecte');
  await delay(25);
  assert.equal(pilot.oprieState.fastInteraction !== null, true, 'la candidate rapide était bien affichée.');
  await run;
  assert.equal(pilot.oprieState.fastInteraction, null, 'elle est retirée : rien ne survit à une panne.');
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical');
  assert.deepEqual(spy.executed, []);
});

test('T-P04-44 : échec des DEUX plans — fermeture, jamais promotion', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => { throw new Error('rapide KO'); },
    deep: async () => { throw new Error('profond KO'); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(pilot.oprieState.fastInteraction, null);
  assert.deepEqual(spy.executed, []);
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical');
});

// =================================================================================================
// §72 — MESURES
// =================================================================================================

test('T-P04-45 : le retour visuel au clic est mesuré, et ne dépend d’aucun réseau', async () => {
  const echantillon = [];
  for (let i = 0; i < 30; i += 1) {
    const { pilot, spy } = loadPilot({
      fast: async () => { await delay(50); return askClarification(); },
      deep: async () => { await delay(80); return clarificationTurn(); }
    });
    const run = pilot.oprieRunTurn('architecte');
    echantillon.push(spy.firstFeedbackAt);
    await run;
  }
  const p = percentiles(echantillon);
  assert.equal(p.count, 30);
  assert.ok(p.p95 !== null && p.p95 < 100, `le retour au clic doit rester sous 100 ms (p95 mesuré : ${p.p95} ms).`);
  assert.ok(echantillon.every((v) => v !== null), 'un retour visuel est produit à CHAQUE tour.');
});

test('T-P04-46 : le délai réception→affichage du plan rapide est mesuré séparément du fournisseur', async () => {
  const echantillon = [];
  for (let i = 0; i < 30; i += 1) {
    const latenceFournisseur = 40;
    const { pilot, spy } = loadPilot({
      fast: async () => { await delay(latenceFournisseur); return askClarification(); },
      deep: async () => { await delay(300); return clarificationTurn(); }
    });
    const run = pilot.oprieRunTurn('architecte');
    await delay(latenceFournisseur + 20);
    assert.ok(spy.fastResolvedAt !== null && spy.firstInteractionAt !== null);
    echantillon.push(spy.firstInteractionAt - spy.fastResolvedAt);
    await run;
  }
  const p = percentiles(echantillon);
  assert.ok(p.p95 <= 200, `réception→affichage doit rester sous 200 ms (p95 : ${p.p95} ms).`);
  assert.ok(p.max < 300, `même au pire (max : ${p.max} ms).`);
});

test('T-P04-47 : le TTFI ne compte JAMAIS un indicateur d’attente comme une interaction', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => { await delay(60); return askClarification(); },
    deep: async () => { await delay(200); return clarificationTurn(); }
  });
  await pilot.oprieRunTurn('architecte');
  assert.ok(spy.firstFeedbackAt < spy.firstInteractionAt,
    'le bandeau d’attente arrive avant l’interaction — et n’est pas comptabilisé comme elle.');
  const attente = spy.gate.find((g) => g.decision && g.decision.state === 'thinking');
  assert.ok(attente, 'un indicateur d’attente existe bien.');
  assert.ok(attente.at < spy.firstInteractionAt, 'il précède strictement l’interaction exploitable.');
});

test('T-P04-48 : le plan profond n’est jamais dans le chemin critique du TTFI', async () => {
  const mesures = [];
  for (const deepMs of [100, 400, 900]) {
    const { pilot, spy } = loadPilot({
      fast: async () => { await delay(30); return askClarification(); },
      deep: async () => { await delay(deepMs); return clarificationTurn(); }
    });
    const run = pilot.oprieRunTurn('architecte');
    await delay(80);
    mesures.push({ deepMs, ttfi: spy.firstInteractionAt });
    await run;
  }
  for (const m of mesures) {
    assert.ok(m.ttfi !== null && m.ttfi < 100,
      `TTFI ${m.ttfi} ms indépendant d’un plan profond à ${m.deepMs} ms.`);
  }
  const ecart = Math.max(...mesures.map((m) => m.ttfi)) - Math.min(...mesures.map((m) => m.ttfi));
  assert.ok(ecart < 60, `le TTFI ne suit pas la latence profonde (écart mesuré : ${ecart} ms).`);
});

test('T-P04-49 : p50/p95/max sont calculés sur l’échantillon, jamais une moyenne', () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000];
  const p = percentiles(xs);
  assert.equal(p.count, 10);
  assert.equal(p.p50, 50);
  assert.equal(p.p95, 1000, 'le p95 retient la queue — une moyenne l’aurait dissoute.');
  assert.equal(p.max, 1000);
  const moyenne = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.notEqual(p.p95, moyenne, 'p95 et moyenne ne peuvent pas être confondus.');
  assert.deepEqual(percentiles([]), { p50: null, p95: null, max: null, count: 0 }, 'aucun chiffre inventé sur zéro mesure.');
});

test('T-P04-50 : la classification de performance est déterministe et refuse le faux PASS', () => {
  assert.equal(classify(2999, 30), 'COMPLIANT');
  assert.equal(classify(3000, 30), 'COMPLIANT');
  assert.equal(classify(3001, 30), 'DEGRADED');
  assert.equal(classify(5000, 30), 'DEGRADED');
  assert.equal(classify(5001, 30), 'NON_CONFORMING');
  assert.equal(classify(1200, 2), 'NOT_PROVEN', 'un échantillon insuffisant ne peut pas produire un PASS.');
  assert.equal(classify(null, 100), 'NOT_PROVEN', 'aucune mesure ne peut pas produire un PASS.');
});

// =================================================================================================
// §87 / §88 / §94 / §98 / §99 — UNICITÉ, ABSENCE DE REPLI LOCAL, HYGIÈNE
// =================================================================================================

test('T-P04-SINGLE : il n’existe qu’UNE implémentation du plan rapide', () => {
  const source = fs.readFileSync(path.join(root, 'workers/shared/fast-interactive-plane.js'), 'utf8');
  for (const regle of ['function validateFastInteraction', 'function reconcileFastWithDeep', 'function projectInteractionForMode']) {
    assert.equal(source.includes(regle), true, `${regle} vit dans le noyau.`);
    assert.doesNotMatch(PERF04_BLOCK, new RegExp(regle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${regle} ne doit PAS être redéfinie dans le HTML.`);
  }
  assert.match(PERF04_BLOCK, /runtime\.validateFastInteraction\(/, 'le frontend appelle le noyau.');
  assert.match(PERF04_BLOCK, /runtime\.projectInteractionForMode\(/);
  assert.match(PERF04_BLOCK, /runtime\.reconcileFastWithDeep\(/);
});

test('T-P04-NOFALLBACK : sans point d’entrée rapide, le parcours profond est celui d’avant PERF-04', async () => {
  const { pilot, spy, ctx } = loadPilot({
    noFastEndpoint: true,
    fast: async () => askClarification(),
    deep: async () => clarificationTurn('Question profonde ?')
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 0, 'aucun appel rapide n’est tenté.');
  assert.equal(pilot.oprieState.fastInteraction, null, 'et surtout : aucune question locale n’est fabriquée.');
  assert.equal(questionShown(ctx), 'Question profonde ?', 'le parcours profond est intact.');
});

test('T-P04-NOFALLBACK-2 : sans noyau, il n’y a ni plan rapide ni orchestration — le tour se ferme', async () => {
  /* IA-02A a fait de la politique d'orchestration une dépendance DURE du tour, au même titre que
     le gate de prompt l'est de l'exécution. Un noyau absent ne dégrade donc pas le parcours : il
     le ferme. C'est le prix, assumé, de n'avoir qu'UNE politique — un repli inline en serait une
     seconde, et déciderait un jour autrement que celle du noyau. */
  const { pilot, spy, ctx } = loadPilot({
    noRuntime: true,
    fast: async () => askClarification(),
    deep: async () => clarificationTurn('Question profonde ?')
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 0, 'aucun appel rapide n’est tenté.');
  assert.equal(pilot.oprieState.fastInteraction, null, 'aucune question locale n’est fabriquée.');
  assert.equal(questionShown(ctx), '', 'et aucune question n’est posée sans politique pour la décider.');
  assert.deepEqual(spy.executed, [], 'surtout : rien n’est exécuté.');
  assert.equal(spy.gate[spy.gate.length - 1].decision.state, 'technical', 'le tour se ferme, proprement.');
});

test('T-P04-SEC : aucun secret, aucune clé, aucun texte utilisateur dans la télémétrie', async () => {
  const { pilot } = loadPilot({ fast: async () => askClarification('Pour quel public ?'), deep: async () => clarificationTurn() });
  await pilot.oprieRunTurn('architecte');
  const marks = pilot.oprieState.telemetry;
  assert.ok(marks.length > 0, 'la télémétrie est bien collectée.');
  const serialise = JSON.stringify(marks);
  for (const interdit of [/sk-/, /api[_-]?key/i, /Bearer/i, /Rédige une note/, /Pour quel public/, /groq/i, /anthropic/i, /openai/i]) {
    assert.doesNotMatch(serialise, interdit, `la télémétrie ne doit jamais contenir ${interdit}.`);
  }
  const attendus = ['event', 'at', 'turn_id', 'mode'];
  for (const m of marks) for (const k of attendus) assert.ok(k in m, `chaque marque porte ${k}.`);
});

test('T-P04-NOHARDCODE : aucun hardcoding métier, aucun appariement flou introduit', () => {
  for (const interdit of [/case_id/, /embedding/i, /cosine/i, /levenshtein/i, /fuzzy/i, /similarit/i, /Promise\.race/, /hedge/i]) {
    assert.doesNotMatch(PERF04_BLOCK, interdit, `le bloc PERF-04 ne doit contenir ${interdit}.`);
  }
});

/* IA-04 — LE VERROU HISTORIQUE EST REMPLACÉ PAR LE CONTRAT QU'IL CONTREDISAIT.
 *
 * Ce test affirmait « le plan profond part le premier, dans le source lui-même ». C'était un contrat
 * d'implémentation, pas un invariant produit : aucun document de gouvernance ne l'énonce, et IA-04
 * dit l'inverse — le plan profond est une escalade, déclenchée par CONTINUE_WITH_DEEP_VALIDATION.
 * La couverture n'est pas retirée : elle passe du TEXTE au COMPORTEMENT, et devient les trois
 * invariants de déclenchement, mesurés en nombre d'appels. */
test('T-P04-TRIGGER-1 : une question rapide est affichée, et n’escalade pas', async () => {
  const { pilot, spy, ctx } = loadPilot({
    fast: async () => askClarification('Pour quel public ?'),
    deep: async () => clarificationTurn()
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 1, 'un appel rapide.');
  assert.equal(spy.deepCalls.length, 0, 'ZÉRO appel profond : l’escalade n’était pas méritée.');
  assert.equal(questionShown(ctx), 'Pour quel public ?', 'et la question est bien posée.');
});

test('T-P04-TRIGGER-2 : quand le plan rapide n’a rien à demander, le plan profond escalade', async () => {
  const { pilot, spy } = loadPilot({
    fast: async () => ({ type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.' }),
    deep: async () => clarificationTurn()
  });
  await pilot.oprieRunTurn('architecte');
  assert.equal(spy.fastCalls.length, 1);
  assert.equal(spy.deepCalls.length, 1, 'UN appel profond : ni zéro, ni deux.');
});

test('T-P04-TRIGGER-3 : un échec technique du plan rapide escalade, fail-closed', async () => {
  for (const panne of [async () => { throw new Error('réseau'); },
                       async () => new Response('{}', { status: 502 }),
                       async () => ({ type: 'PAS_UN_TYPE', text: 'x' })]) {
    const { pilot, spy } = loadPilot({ fast: panne, deep: async () => clarificationTurn() });
    await pilot.oprieRunTurn('architecte');
    assert.equal(spy.deepCalls.length, 1, 'le plan profond reprend la main sur tout échec rapide.');
  }
});

test('T-P04-TRIGGER-4 : le pilote n’attend JAMAIS le plan profond pour afficher', () => {
  assert.doesNotMatch(RUN_TURN.slice(0, RUN_TURN.indexOf('oprieStartFastPlane(')),
    /await\s+deepPromise/, 'aucune attente du plan profond avant que le plan rapide ait parlé.');
  assert.ok(RUN_TURN.indexOf('await oprieStartFastPlane(') < RUN_TURN.indexOf('oprieRequestTurn(seq)'),
    'le plan rapide parle, PUIS l’escalade est décidée.');
});
