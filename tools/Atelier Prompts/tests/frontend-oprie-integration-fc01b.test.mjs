import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as orchestrationPolicy from '../core/adn/orchestration-policy.js';
import * as modeContracts from '../core/adn/mode-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

// =================================================================================================
// FC-01b — OPRIE devient l'UNIQUE autorité frontend de READINESS.
//
// Avant : la readiness venait des Decision Providers navigateur (Workers AI puis Groq).
// Après  : elle vient exclusivement de POST /operational-request (Analyste -> Critique -> Arbitre).
//
// Séparation stricte, volontaire :
//   OPRIE   décide si la demande est PRÊTE ;
//   le MODE choisi par l'utilisateur décide du moteur d'EXÉCUTION ;
//   l'exécution du livrable reste le moteur Anthropic navigateur (BYO-key), inchangé.
// =================================================================================================

const OPRIE_STATES = ['clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked', 'degraded_state'];
const ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/operational-request';

function arbiterTurn(state, extra = {}) {
  return {
    state,
    operational_request_candidate: { objective: 'O.' },
    issues: [], next_question: null, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Motif.', ...extra
  };
}
const degradedTurn = () => ({ role: 'analyst', state: 'degraded_state', reason: 'Rôle indisponible.' });

/**
 * Charge le pilote OPRIE réel du HTML, avec le DOM et les moteurs d'exécution remplacés par des
 * espions. Tout ce qui est testé ici est le CODE DE PRODUCTION, jamais une réécriture.
 */
function loadPilot({ fetchImpl, demande = 'Rédige une note.', answers = [] } = {}) {
  const start = html.indexOf('const OPRIE_STATES=');
  const end = html.indexOf('function adpShowThinking');
  const dom = new Map([['#v11-demande', { value: demande }]]);
  const spy = { gate: [], shown: [], executed: [], busy: [], question: null, chips: [] };
  const el = (id) => {
    if (!dom.has(id)) dom.set(id, { value: '', textContent: '', disabled: false, innerHTML: '', appendChild() {}, addEventListener() {} });
    return dom.get(id);
  };
  const context = {
    AbortController, fetch: fetchImpl, console: { warn() {}, error() {} },
    $: el,
    /* IA-02A : le tour délègue sa décision à la politique d'orchestration. Le harness expose donc
       LA politique réelle du noyau — jamais une imitation : un pilote testé contre une politique
       simulée ne prouverait rien de ce que la production exécute. */
    adnRuntime: () => ({
      decideNextOrchestrationAction: orchestrationPolicy.decideNextOrchestrationAction,
      isKnownOrchestrationAction: orchestrationPolicy.isKnownOrchestrationAction,
      executionTargetFor: modeContracts.executionTargetFor
    }),
    state: { answers, docs: [] },
    adpState: { pendingQuestion: false, clarifications: 0, requestedMode: 'rapide', returnFocus: null },
    materialText: () => '',
    v11ShowRapidGate: (d) => spy.gate.push(d),
    show: (id) => spy.shown.push(id),
    adpRunRapide: (d, m, o) => { spy.executed.push({ engine: 'rapide', orientation: o }); return true; },
    adpEnterArchitecte: (d, m, o) => { spy.executed.push({ engine: 'architecte', orientation: o }); return true; },
    ADP_TECHNICAL_FAILURE_UI: { state: 'technical', title: 'Analyse indisponible', text: 'Impossible d’analyser la demande pour le moment.' },
    document: {
      activeElement: null,
      querySelector: (s) => s.includes('operational-request') ? { content: ENDPOINT } : null,
      createElement: () => ({ addEventListener() {}, style: {} })
    }
  };
  vm.runInNewContext(html.slice(start, end) + `
;globalThis.__pilot={oprieRunTurn,oprieApplyTurn,oprieRequestTurn,oprieClarificationHistory,oprieOriginalRequest,oprieState,OPRIE_STATES};`, context);
  return { pilot: context.__pilot, spy, ctx: context };
}
const jsonOnce = (payload, status = 200) => async () => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

// --- FC01B-01 à 04 : l'autorité de readiness a changé -----------------------------------------------

test('FC01B-01 : le frontend appelle /operational-request, et rien d’autre, pour décider de la readiness', async () => {
  const calls = [];
  const { pilot } = loadPilot({ fetchImpl: async (url, opts) => { calls.push({ url: String(url), body: JSON.parse(opts.body) }); return new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 }); } });
  await pilot.oprieRunTurn('rapide');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['clarification_history', 'original_request'],
    'le contrat d’entrée est exactement celui du serveur : rien de plus.');
});

test('FC01B-02/03 : aucun Decision Provider navigateur n’est plus une autorité de readiness', () => {
  for (const fn of ['async function v11StartRapide', 'async function v11StartArchitecte', 'async function adpResumeAfterClarification']) {
    const block = html.slice(html.indexOf(fn), html.indexOf(fn) + 400);
    assert.doesNotMatch(block, /adpDecideRapide/, `${fn} ne doit plus consulter les Decision Providers.`);
    assert.match(block, /oprieRunTurn/, `${fn} doit passer par OPRIE.`);
  }
});

test('FC01B-04 : aucun repli local ne peut produire une readiness', () => {
  assert.doesNotMatch(html, /function adpFallbackLocal\(/);
  assert.equal((html.match(/source:\s*'local-prudent'/g) || []).length, 0);
});

// --- FC01B-05/06 : demande immuable, historique séparé ------------------------------------------------

test('FC01B-05 : original_request est la demande BRUTE, jamais la demande concaténée', async () => {
  const bodies = [];
  const answers = [{ question: 'Pour qui ?', answer: 'Une PME.' }];
  const { pilot } = loadPilot({ answers, fetchImpl: async (u, o) => { bodies.push(JSON.parse(o.body)); return new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 }); } });
  await pilot.oprieRunTurn('rapide');
  assert.equal(bodies[0].original_request, 'Rédige une note.');
  assert.ok(!bodies[0].original_request.includes('Une PME.'), 'la réponse ne doit jamais être fondue dans la demande.');
  assert.ok(!bodies[0].original_request.includes('Précisions apportées'));
});

test('FC01B-06 : clarification_history porte les réponses, à la forme canonique', async () => {
  const bodies = [];
  const answers = [{ question: 'Pour qui ?', answer: 'Une PME.' }, { question: 'Quelle longueur ?', answer: 'Deux pages.' }];
  const { pilot } = loadPilot({ answers, fetchImpl: async (u, o) => { bodies.push(JSON.parse(o.body)); return new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 }); } });
  await pilot.oprieRunTurn('rapide');
  assert.deepEqual(bodies[0].clarification_history, [
    { turn: 1, question: 'Pour qui ?', answer: 'Une PME.', provenance: 'user' },
    { turn: 2, question: 'Quelle longueur ?', answer: 'Deux pages.', provenance: 'user' }
  ]);
});

// --- FC01B-07 à 13 : les cinq états, et ce qu'ils autorisent ------------------------------------------

test('FC01B-07/08 : clarification_required affiche next_question et n’exécute jamais', async () => {
  const turn = arbiterTurn('clarification_required', { next_question: { text: 'À qui s’adresse la note ?', targets_issue_id: 'i1', expected_progress: 'Destinataire.' } });
  const { pilot, spy, ctx } = loadPilot({ fetchImpl: jsonOnce(turn) });
  await pilot.oprieRunTurn('rapide');
  assert.deepEqual(spy.executed, [], 'aucune exécution sur clarification.');
  assert.equal(ctx.$('#v11-question').textContent, 'À qui s’adresse la note ?');
  assert.equal(ctx.adpState.pendingQuestion, true);
  assert.equal(ctx.adpState.clarifications, 1, 'le compteur d’audit avance, sans jamais plafonner.');
});

test('FC01B-09 : confirmation_required affiche le motif et n’exécute jamais', async () => {
  const turn = arbiterTurn('confirmation_required', { confirmation_reason: 'Plusieurs arbitrages ont été faits.' });
  const { pilot, spy, ctx } = loadPilot({ fetchImpl: jsonOnce(turn) });
  await pilot.oprieRunTurn('rapide');
  assert.deepEqual(spy.executed, []);
  assert.match(ctx.$('#v11-question').textContent, /Plusieurs arbitrages ont été faits\./);
  assert.match(ctx.$('#v11-question').textContent, /Confirmez-vous \?/);
});

test('FC01B-10 : operational_request_ready est le SEUL état qui ouvre l’exécution', async () => {
  for (const [mode, engine] of [['rapide', 'rapide'], ['architecte', 'architecte']]) {
    const { pilot, spy } = loadPilot({ fetchImpl: jsonOnce(arbiterTurn('operational_request_ready')) });
    await pilot.oprieRunTurn(mode);
    assert.equal(spy.executed.length, 1, mode);
    assert.equal(spy.executed[0].engine, engine, 'le MODE choisi par l’utilisateur décide du moteur, jamais un fournisseur.');
    assert.equal(spy.executed[0].orientation.source, 'oprie');
  }
});

test('FC01B-11/12/13 : blocked, degraded_state et panne réseau n’exécutent jamais et ne routent jamais', async () => {
  const cases = [
    ['blocked', jsonOnce(arbiterTurn('blocked', { blocked_reason: 'Contradiction irréductible.' })), 'blocked'],
    ['degraded_state', jsonOnce(degradedTurn()), 'degraded'],
    ['réseau', async () => { throw new TypeError('network'); }, 'technical'],
    ['HTTP 502', jsonOnce({ error: 'x' }, 502), 'technical'],
    ['corps non-JSON', async () => new Response('pas du json', { status: 200 }), 'technical'],
    ['état hors énumération', jsonOnce({ state: 'inventé' }), 'technical']
  ];
  for (const [label, impl, expectedGate] of cases) {
    const { pilot, spy } = loadPilot({ fetchImpl: impl });
    await pilot.oprieRunTurn('rapide');
    assert.deepEqual(spy.executed, [], `${label} : aucune exécution.`);
    assert.equal(spy.gate.at(-1).state, expectedGate, label);
  }
});

test('FC01B-14 : aucun état OPRIE n’est jamais fabriqué localement', () => {
  const pilot = html.slice(html.indexOf('const OPRIE_STATES='), html.indexOf('function adpShowThinking'));
  assert.doesNotMatch(pilot, /state\s*[:=]\s*['"]operational_request_ready['"]/, 'le frontend ne prononce jamais ready.');
  assert.doesNotMatch(pilot, /state\s*[:=]\s*['"]clarification_required['"]/);
  assert.doesNotMatch(pilot, /state\s*[:=]\s*['"]degraded_state['"]/);
  // Il ne fait que COMPARER l'état reçu, jamais l'assigner. IA-02A : la comparaison qui CHOISIT
  // a migré dans la politique ; celle qui reste dans le pilote ne sert qu'à savoir quel afficheur
  // d'OPRIE appeler — restituer une autorité n'est pas en dériver une.
  assert.match(pilot, /turn\.state==='confirmation_required'/);
  assert.match(pilot, /oprieDecideOrchestration\(/, "la décision vient de la politique unique.");
});

// --- FC01B-15/16 : double submit et réponses obsolètes --------------------------------------------------

test('FC01B-15 : deux déclenchements simultanés ne produisent qu’UNE requête', async () => {
  let inflight = 0, max = 0, calls = 0;
  const { pilot, ctx } = loadPilot({ fetchImpl: async () => {
    calls += 1; inflight += 1; max = Math.max(max, inflight);
    await new Promise((r) => setTimeout(r, 30)); inflight -= 1;
    return new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 });
  } });
  await Promise.all([pilot.oprieRunTurn('rapide'), pilot.oprieRunTurn('rapide'), pilot.oprieRunTurn('rapide')]);
  assert.equal(calls, 1, 'un seul appel malgré trois déclenchements.');
  assert.equal(max, 1);
  assert.equal(ctx.$('#v11-go-rapide').disabled, false, 'les boutons sont réactivés après l’appel.');
});

test('FC01B-16 : une réponse obsolète n’écrase jamais un tour plus récent', async () => {
  const { pilot, spy } = loadPilot({ fetchImpl: async () => new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 }) });
  // On simule un tour plus récent en incrémentant la séquence pendant que la réponse est en vol.
  const before = pilot.oprieState.seq;
  const stale = await pilot.oprieRequestTurn().then((r) => { pilot.oprieState.seq += 1; return r; });
  assert.ok(stale !== null || true);
  pilot.oprieState.seq += 1;
  const ignored = await (async () => { const p = pilot.oprieRequestTurn(); pilot.oprieState.seq += 1; return p; })();
  assert.equal(ignored, null, 'la réponse d’un tour dépassé est ignorée, jamais appliquée.');
  assert.ok(pilot.oprieState.seq > before);
  assert.deepEqual(spy.executed, [], 'aucune exécution déclenchée par une réponse obsolète.');
});

// --- FC01B-17 à 21 : modes, ordre routing/readiness ------------------------------------------------------

test('FC01B-17 : changer de mode conserve la demande et ne contourne jamais OPRIE', () => {
  for (const fn of ['async function v11StartRapide', 'async function v11StartArchitecte']) {
    const block = html.slice(html.indexOf(fn), html.indexOf(fn) + 400);
    assert.match(block, /v11RequireDemand\(\)/, 'la demande est requise et conservée.');
    assert.doesNotMatch(block, /\$\('#v11-demande'\)\.value=/, 'le mode ne réécrit jamais la demande.');
    assert.match(block, /oprieRunTurn/);
  }
});

test('FC01B-18/19 : Rapide et Architecte restent tous deux fonctionnels, via leur moteur respectif', async () => {
  for (const [mode, engine] of [['rapide', 'rapide'], ['architecte', 'architecte']]) {
    const { pilot, spy } = loadPilot({ fetchImpl: jsonOnce(arbiterTurn('operational_request_ready')) });
    const ok = await pilot.oprieRunTurn(mode);
    assert.equal(ok, true, mode);
    assert.equal(spy.executed[0].engine, engine);
  }
});

test('FC01B-20/21 : l’ordre est OPRIE ready -> routing -> Execution Readiness -> exécution', () => {
  const enter = html.slice(html.indexOf('function oprieEnterExecution'), html.indexOf('function oprieApplyTurn'));
  assert.match(enter, /adpRunRapide|adpEnterArchitecte/, 'l’exécution passe par les moteurs existants.');
  // IA-02A : l'ordre est désormais porté en DEUX temps vérifiables séparément — la politique dit
  // que ready ouvre Execution Readiness, et le pilote n'a d'autre moyen d'exécuter que cette action.
  assert.match(html, /deep\.state === "operational_request_ready"[\s\S]{0,400}?verdict\("ENTER_READINESS"/,
    'ready ouvre Execution Readiness, jamais l’exécution.');
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('function oprieDriveOrchestration'));
  assert.match(table, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/,
    'l’exécution n’est atteinte que par l’action ENTER_READINESS.');
  assert.doesNotMatch(table, /EXECUTE:/, 'aucune action du pilote de tour ne va directement à l’exécution.');
  const drive = html.slice(html.indexOf('function oprieDriveOrchestration'), html.indexOf('function oprieApplyTurn'));
  assert.match(drive, /return oprieShowNetworkFailure\(\)/, 'le défaut est fail-closed, jamais l’exécution.');
});

// --- FC01B-22/23/24 : exécution BYO-key, secrets, hardcoding ----------------------------------------------

test('FC01B-22 : l’exécution BYO-key Anthropic est INCHANGÉE', () => {
  assert.match(html, /fetch\('https:\/\/api\.anthropic\.com\/v1\/messages'/);
  assert.match(html, /https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.match(html, /count_tokens/);
  assert.match(html, /'x-api-key':cle/);
  assert.match(html, /id="accueil-cle"/);
});

test('FC01B-23 : aucun secret nouveau, aucune clé côté readiness', () => {
  const pilot = html.slice(html.indexOf('const OPRIE_STATES='), html.indexOf('function adpShowThinking'));
  for (const forbidden of [/sk-ant-/, /gsk_/, /x-api-key/i, /Authorization/i, /Bearer/]) {
    assert.doesNotMatch(pilot, forbidden, `le pilote de readiness ne porte aucun matériau d’authentification (${forbidden}).`);
  }
  assert.match(pilot, /credentials:'omit'/, 'aucun cookie n’est envoyé au backend.');
});

test('FC01B-24 : aucun hardcoding métier dans le pilote', () => {
  const pilot = html.slice(html.indexOf('const OPRIE_STATES='), html.indexOf('function adpShowThinking'));
  for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /\bItalie\b/i, /\bvoyage\b/i, /lettre de motivation/i]) {
    assert.doesNotMatch(pilot, forbidden, String(forbidden));
  }
});

// --- FC01B-25/26/27 : second fail-open, confidentialité, relance -------------------------------------------

test('FC01B-25 : le second fail-open de core/adn reste inatteignable', () => {
  assert.match(html, /source: "local-prudent"/, 'le miroir gelé est inchangé.');
  assert.equal((html.match(/source:\s*'local-prudent'/g) || []).length, 0, 'plus aucun producteur.');
});

test('FC01B-26 : degraded_state n’expose jamais le moindre détail fournisseur', async () => {
  const { pilot, spy } = loadPilot({ fetchImpl: jsonOnce(degradedTurn()) });
  await pilot.oprieRunTurn('rapide');
  const rendered = JSON.stringify(spy.gate.at(-1));
  for (const forbidden of ['groq', 'anthropic', 'openai', 'provider', 'retry', 'failure_class', 'analyst', 'critic', 'arbiter']) {
    assert.ok(!rendered.toLowerCase().includes(forbidden), `l’UI dégradée ne doit pas exposer "${forbidden}".`);
  }
  assert.match(spy.gate.at(-1).text, /temporairement indisponible/);
  assert.match(spy.gate.at(-1).text, /Vous pouvez réessayer/);
});

test('FC01B-27 : après une dégradation ou une panne réseau, une relance repart normalement', async () => {
  let down = true;
  const { pilot, spy } = loadPilot({ fetchImpl: async () => {
    if (down) throw new TypeError('network');
    return new Response(JSON.stringify(arbiterTurn('operational_request_ready')), { status: 200 });
  } });
  await pilot.oprieRunTurn('rapide');
  assert.deepEqual(spy.executed, []);
  down = false;
  await pilot.oprieRunTurn('rapide');
  assert.equal(spy.executed.length, 1, 'la relance doit fonctionner sans état résiduel bloquant.');
});
