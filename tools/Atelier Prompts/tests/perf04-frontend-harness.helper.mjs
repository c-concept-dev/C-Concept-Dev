/* PERF-04 — HARNESS DU PILOTE FRONTEND RÉEL.
 * ============================================================================
 *
 * Ce harness n'imite pas le pilote : il EXÉCUTE le code de production découpé
 * dans le HTML, avec le DOM et les moteurs d'exécution remplacés par des
 * espions horodatés. Le noyau du plan rapide n'est pas simulé non plus — ce
 * sont les fonctions réelles de PERF-03A qui sont injectées dans `adnRuntime`,
 * exactement comme le build les expose au navigateur.
 *
 * Ce qui est simulé, et seulement cela : le réseau (les deux points d'entrée)
 * et le DOM. Tout le reste est le produit.
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as fastPlane from '../workers/shared/fast-interactive-plane.js';
import * as orchestrationPolicy from '../core/adn/orchestration-policy.js';
import * as modeContracts from '../core/adn/mode-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

export const OPRIE_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/operational-request';
export const FAST_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/fast-interaction';

/** Un tour OPRIE complet, à la forme exacte que l'Arbitre produit. */
export function arbiterTurn(state, extra = {}) {
  return {
    state,
    operational_request_candidate: { objective: 'O.' },
    issues: [], next_question: null, confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'Motif.', ...extra
  };
}
export const clarificationTurn = (text = 'Quel est le public visé ?') =>
  arbiterTurn('clarification_required', { next_question: { text } });
export const confirmationTurn = (reason = 'Un arbitrage a été fait.') =>
  arbiterTurn('confirmation_required', { confirmation_reason: reason });

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

/**
 * @param {object} options
 *   fast  : (body) => interaction rapide, ou une Response, ou un throw (panne).
 *   deep  : (body) => tour OPRIE, ou une Response, ou un throw (panne).
 *   mode  : mode demandé par défaut.
 *   noFastEndpoint : retire la meta du plan rapide (plan rapide non configuré).
 *   noRuntime      : rend le noyau PERF-03A indisponible.
 */
export function loadPilot({ fast, deep, demande = 'Rédige une note de cadrage.', answers = [], mode = 'architecte',
                            noFastEndpoint = false, noRuntime = false, partialPolicy = null } = {}) {
  const start = html.indexOf('const OPRIE_STATES=');
  const end = html.indexOf('function v11SwitchToArchitecteFromRapid');
  if (start < 0 || end < 0) throw new Error('PERF-04 : bloc pilote introuvable dans le HTML.');

  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const spy = {
    gate: [], shown: [], executed: [], busy: [], asks: [],
    fastCalls: [], deepCalls: [], fastResolvedAt: null, firstFeedbackAt: null, firstInteractionAt: null
  };
  const dom = new Map([['#v11-demande', { value: demande, textContent: '' }]]);
  const el = (id) => {
    if (!dom.has(id)) dom.set(id, { value: '', textContent: '', disabled: false, innerHTML: '', appendChild() {}, addEventListener() {}, focus() {} });
    return dom.get(id);
  };

  /* partialPolicy : liste des noms d'export à RETIRER, pour éprouver un module à moitié chargé. */
  const absents = Array.isArray(partialPolicy) ? partialPolicy : [];
  const runtime = noRuntime ? null : {
    createTurnSnapshot: fastPlane.createTurnSnapshot,
    validateFastInteraction: fastPlane.validateFastInteraction,
    projectInteractionForMode: fastPlane.projectInteractionForMode,
    reconcileFastWithDeep: fastPlane.reconcileFastWithDeep,
    createTurnCoordinator: fastPlane.createTurnCoordinator,
    /* IA-02A/IA-02B : la politique réelle, jamais une imitation, et sa SURFACE COMPLÈTE —
       le pilote exige les deux fonctions, un export partiel doit fermer le tour. */
    decideNextOrchestrationAction: orchestrationPolicy.decideNextOrchestrationAction,
    isKnownOrchestrationAction: orchestrationPolicy.isKnownOrchestrationAction,
    /* MODE-01 : la destination d'exécution vient du contrat de mode réel. */
    executionTargetFor: modeContracts.executionTargetFor
  };
  for (const nom of absents) delete runtime[nom];

  async function fetchImpl(url, opts) {
    const target = String(url);
    const body = JSON.parse(opts.body);
    if (target === FAST_ENDPOINT) {
      spy.fastCalls.push({ at: at(), body });
      if (typeof fast !== 'function') return jsonResponse({ error: 'not_configured' }, 503);
      const out = await fast(body, { at, signal: opts.signal });
      spy.fastResolvedAt = at();
      return out instanceof Response ? out : jsonResponse(out);
    }
    if (target === OPRIE_ENDPOINT) {
      spy.deepCalls.push({ at: at(), body });
      if (typeof deep !== 'function') return jsonResponse(arbiterTurn('operational_request_ready'));
      const out = await deep(body, { at, signal: opts.signal });
      return out instanceof Response ? out : jsonResponse(out);
    }
    throw new Error(`PERF-04 : point d'entrée inattendu ${target}`);
  }

  const context = {
    AbortController, fetch: fetchImpl, Date, setTimeout, performance: { now: () => Date.now() - t0 },
    console: { warn() {}, error() {} },
    $: el,
    state: { answers, docs: [] },
    adpState: { pendingQuestion: false, clarifications: 0, requestedMode: mode, returnFocus: null },
    materialText: () => '',
    adnRuntime: () => { if (!runtime) throw new Error('runtime indisponible'); return runtime; },
    v11ShowRapidGate: (d) => {
      spy.gate.push({ at: at(), decision: d });
      if (d && spy.firstFeedbackAt === null) spy.firstFeedbackAt = at();
    },
    show: (id) => {
      spy.shown.push({ at: at(), id });
      if (id === '#v11-dialogue' && spy.firstInteractionAt === null) spy.firstInteractionAt = at();
    },
    adpRunRapide: (d, m, o) => { spy.executed.push({ at: at(), engine: 'rapide', orientation: o }); return true; },
    adpEnterArchitecte: (d, m, o) => { spy.executed.push({ at: at(), engine: 'architecte', orientation: o }); return true; },
    ADP_TECHNICAL_FAILURE_UI: { state: 'technical', title: 'Analyse indisponible', text: 'Impossible d’analyser la demande pour le moment.' },
    document: {
      activeElement: null,
      querySelector: (s) => {
        if (s.includes('atelier-operational-request')) return { content: OPRIE_ENDPOINT };
        if (s.includes('atelier-fast-interaction')) return noFastEndpoint ? null : { content: FAST_ENDPOINT };
        return null;
      },
      createElement: () => ({ addEventListener() {}, style: {} })
    }
  };
  /* oprieSetBusy écrit sur les boutons : on trace chaque bascule pour prouver
     que la saisie redevient disponible sans attendre le plan profond. */
  vm.runInNewContext(html.slice(start, end) + `
;globalThis.__pilot={oprieRunTurn,oprieApplyTurn,oprieRequestTurn,oprieState,oprieStartFastPlane,
  oprieRenderFastInteraction,oprieReconcileFast,oprieFastRuntime,oprieFastSnapshot,oprieSetBusy,
  oprieDriveOrchestration,oprieDecideOrchestration,oprieTurnContext,ORCHESTRATION_DRIVER,
  FAST_ENDPOINT,FAST_SOLICITING_TYPES,OPRIE_STATES};`, context);
  const pilot = context.__pilot;
  const setBusy = pilot.oprieSetBusy;
  context.oprieSetBusy = (b) => { spy.busy.push({ at: at(), busy: !!b }); return setBusy(b); };
  return { pilot, spy, ctx: context, el, at };
}

/** Le bouton principal est-il utilisable ? C'est la seule mesure d'« entrée disponible ». */
export const inputEnabled = (ctx) => ctx.$('#v11-answer-continue').disabled === false;
export const questionShown = (ctx) => String(ctx.$('#v11-question').textContent || '');

/** p50 / p95 / max sur un échantillon — jamais une moyenne (PERF-04 §55). */
export function percentiles(samples) {
  const xs = [...samples].sort((a, b) => a - b);
  if (!xs.length) return { p50: null, p95: null, max: null, count: 0 };
  const pick = (p) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
  return { p50: pick(50), p95: pick(95), max: xs[xs.length - 1], count: xs.length };
}
/** Classification PERF-04 §54 — déterministe, sans zone grise. */
export function classify(p95, sampleCount, { minimumSample = 20 } = {}) {
  if (p95 === null || sampleCount < minimumSample) return 'NOT_PROVEN';
  if (p95 <= 3000) return 'COMPLIANT';
  if (p95 <= 5000) return 'DEGRADED';
  return 'NON_CONFORMING';
}

/* ------------------------------------------------------------------------ *
 * IA-03 — CHARGEMENT DE answerQuestion, LE CHEMIN RÉEL D'UNE RÉPONSE.
 *
 * Cette fonction vit hors du bloc pilote et ne peut donc pas être chargée par
 * loadPilot. On la charge SEULE, telle qu'elle est écrite en production, avec
 * ses dépendances remplacées par des espions : ce qui est éprouvé reste le code
 * du produit, jamais une reconstitution.
 * ------------------------------------------------------------------------ */
export function loadAnswerQuestion({ running = false, pendingQuestion = true, question = 'Q ?' } = {}) {
  const source = html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll()'));
  const spy = { turns: [], exchanges: [], toasts: [] };
  const dom = new Map([['#v11-question', { textContent: question }],
                       ['#v11-exchange-status', { className: '', innerHTML: '' }]]);
  const context = {
    state: { answers: [] },
    adpState: { pendingQuestion, requestedMode: 'architecte' },
    oprieState: { running, seq: 1 },
    $: (id) => { if (!dom.has(id)) dom.set(id, { textContent: '', value: '', className: '', innerHTML: '' }); return dom.get(id); },
    toast: (m) => spy.toasts.push(m),
    syncLegacy: () => {},
    beginExchange: () => spy.exchanges.push(true),
    oprieRunTurn: (mode) => { spy.turns.push(mode); return true; },
    adpTexteQuestion: (t) => String(t || '').toLowerCase()
  };
  vm.runInNewContext(source + '\n;globalThis.__aq=answerQuestion;', context);
  return { answerQuestion: context.__aq, spy, ctx: context };
}
