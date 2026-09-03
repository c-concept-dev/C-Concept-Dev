/* M-03 — CONTRÔLE DE DÉBIT CONSCIENT DE LA CONCURRENCE, PUIS ACTIVATION
 * ============================================================================
 *
 * M-02 avait construit l'exécuteur, prouvé l'indépendance du groupe, mesuré le
 * gain — et refusé d'activer. La raison n'était pas la prudence de principe :
 * c'était un constat. Ce lot lève ce constat, et rien d'autre.
 *
 * CE QUE L'AUDIT A CORRIGÉ DANS MON PROPRE DIAGNOSTIC M-02 : le stimulateur
 * Groq n'est pas, aujourd'hui, une protection active qu'on affaiblirait. La
 * correction R2.1 l'a rendu délibérément inerte — `recordWaitMs` n'est plus
 * jamais alimenté, et `before()` est « un no-op systématique ». La VRAIE
 * protection de Groq est `fetchGroqWithRetry`, qui honore 429/Retry-After PAR
 * REQUÊTE, sans état partagé : elle était donc déjà sûre sous concurrence.
 *
 * Le risque était donc latent, pas actif : si une fenêtre venait un jour à être
 * alimentée, N appels simultanés la liraient ensemble, attendraient le même
 * instant et partiraient ensemble — la protection deviendrait un point de
 * rafale exactement là où elle protège. M-03 ferme ce risque AVANT d'activer,
 * plutôt qu'après l'avoir observé.
 *
 * CE QUI N'EST PAS INVENTÉ : aucun quota. Le dépôt dit `rpm_budget: null`,
 * « non contraint empiriquement à ce jour ». Rendre une protection consciente
 * de la concurrence, c'est BORNER les appels simultanés — pas ajouter un délai
 * qu'aucune donnée ne justifie.
 *
 * LA VALEUR : 2. Le pas minimal au-dessus du séquentiel, retenu parce qu'aucune
 * preuve ne justifie davantage. Le benchmark de M-02 était meilleur à 4 ; ce
 * n'est pas une raison, et 4 n'a donc pas été retenu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PROVIDER_MAX_INFLIGHT,
  PROVIDER_MAX_INFLIGHT_CEILING,
  PROVIDER_TECHNICAL_CAPABILITIES,
  createRateWindow,
  normalizeMaxInflight,
  resolveProviderConcurrency
} from '../workers/shared/provider-rate-control.js';
import { runBounded } from '../workers/shared/bounded-concurrency.js';
import { runCriticBatchedPipeline, LADDER_ALTERNATIVE_VALUES } from '../workers/shared/operational-request-core.js';
import {
  DECISION_PROVIDER_ORDER,
  createGroqRateLimitPacer,
  decideWithGroq,
  decideWithHaChain,
  runCriticWithGroqFanOut,
  runCriticWithAnthropic
} from '../workers/groq/src/index.js';
import { DECISION_REASONS } from '../workers/shared/decision-core.js';
import { FAILURE_CLASSES, failureClassOf } from '../workers/shared/provider-ha.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTERS_SRC = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const RATE_SRC = fs.readFileSync(path.join(root, 'workers/shared/provider-rate-control.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(root, 'workers/shared/operational-request-core.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- fixtures du pipeline batché ---------------------------------------- */
const LADDER = [...LADDER_ALTERNATIVE_VALUES];
const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };
const ISSUES = ['issue1', 'issue2', 'issue3', 'issue4', 'issue5', 'issue6', 'issue7', 'issue8'];

const candidateFor = (t, a) => ({ treatment: t, available: a, substitution_value: a ? 'v' : '', justification: 'j', residual_risk: a ? 'faible' : '', blocking_reason: a ? '' : 'x', confidence: a ? 'haute' : 'basse' });
const candidatesEntry = () => ({ candidates: Object.fromEntries(LADDER.map((t) => [t, candidateFor(t, t === LADDER[0])])) });
const analystOutputFixture = (ids) => ({
  operational_request_candidate: { objective: 'x', expected_deliverable: '', secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
  provenance_records: [{ field: 'objective', value: 'x', provenance: 'explicit_user_statement' }],
  issues: ids.map((id) => ({ id, type: 'missing_information', description: 'd', impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null })),
  question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
});
const globalOutputFixture = () => ({ operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] }, vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: '' });

async function pipeline({ concurrency, delai = () => 0, echecs = new Set() } = {}) {
  const journal = []; let enVol = 0, maxEnVol = 0;
  const sortie = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      concurrency,
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (e) => {
        enVol += 1; maxEnVol = Math.max(maxEnVol, enVol);
        journal.push(`${e.batchIndex}/${e.groupIndex}`);
        try {
          await attendre(delai(e.batchIndex));
          if (echecs.has(e.batchIndex)) throw new Error(`échec ${e.batchIndex}`);
          return Object.fromEntries(e.issueIds.map((id) => [id, candidatesEntry()]));
        } finally { enVol -= 1; }
      }
    }
  );
  return { sortie, journal, maxEnVol };
}

/* ---- fixtures provider --------------------------------------------------- */
const INPUT = { demande: 'Prépare un plan.', materiau_present: false, mode_demande: 'rapide' };
const CLES = { GROQ_API_KEY: 'gsk_SECRET', ANTHROPIC_API_KEY: 'sk-ant-SECRET', 'OPenAI-API': 'sk-proj-SECRET' };
const decision = () => ({ etat_demande: 'exploitable', route: 'rapide', confiance: 'haute', raison_interne: DECISION_REASONS.rapide, question: null });
const groqOk = (p) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(p) } }] });
const anthropicOk = (p) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'decision_provider', input: p }] });
const providerOf = (u) => (String(u).includes('groq') ? 'groq' : String(u).includes('anthropic') ? 'anthropic' : String(u).includes('openai') ? 'openai' : 'unknown');

function withProviders(t, handlers) {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    const provider = providerOf(url);
    calls.push(provider);
    assert.ok(handlers[provider], `appel inattendu : ${provider}`);
    return handlers[provider](options, calls.filter((n) => n === provider).length);
  };
  return calls;
}
function withCapturedConsole(t) {
  const log = console.log, err = console.error;
  console.log = () => {}; console.error = () => {};
  t.after(() => { console.log = log; console.error = err; });
}

/* ======================================================================== *
 * §40 — LE CONTRÔLEUR DE DÉBIT
 * ======================================================================== */

test('T-M03-01 la réservation est déterministe et n’attend rien sans contrainte connue', async () => {
  const sommeils = [];
  const window = createRateWindow({ sleepFn: async (ms) => { sommeils.push(ms); } });
  await window.reserve();
  await window.reserve();
  assert.deepEqual(sommeils, [], 'sans fenêtre connue, aucune attente inventée');
  assert.equal(window.nextAvailableAt, 0);
});

test('T-M03-02 des réservations concurrentes ne franchissent pas la fenêtre ensemble', async () => {
  const franchissements = [];
  let enSection = 0, maxEnSection = 0;
  const window = createRateWindow({
    sleepFn: async (ms) => { enSection += 1; maxEnSection = Math.max(maxEnSection, enSection); await attendre(Math.min(ms, 12)); enSection -= 1; }
  });
  window.recordWaitMs(30);
  await Promise.all([0, 1, 2, 3].map(async (i) => { await window.reserve(); franchissements.push(i); }));
  assert.equal(maxEnSection, 1, 'un seul appel à la fois dans la section critique');
  assert.deepEqual(franchissements, [0, 1, 2, 3], 'et l’ordre d’arrivée est respecté');
});

test('T-M03-03 la section critique ne couvre jamais la durée réseau', () => {
  const code = sansCommentaires(RATE_SRC);
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'request(']) {
    assert.equal(code.includes(interdit), false, `la fenêtre ne connaît aucun réseau : ${interdit}`);
  }
  /* Et l'adaptateur ne tient aucun verrou pendant l'appel : `before()` retourne
     avant le fetch, et rien n'est libéré après. */
  const adaptateurs = sansCommentaires(ADAPTERS_SRC);
  assert.ok(adaptateurs.includes('if (pacer) await pacer.before();'), 'la réservation précède, et ne survit pas à, la requête');
  assert.equal(/pacer\.(release|after)\(/.test(adaptateurs), false, 'aucun verrou n’enjambe le vol réseau');
});

test('T-M03-04 chaque fournisseur a son propre état de débit', async () => {
  const a = createRateWindow({ sleepFn: async () => {} });
  const b = createRateWindow({ sleepFn: async () => {} });
  a.recordWaitMs(5000);
  assert.equal(b.nextAvailableAt, 0, 'la fenêtre de l’un ne touche jamais celle de l’autre');
  assert.ok(a.nextAvailableAt > 0);
  /* Et chaque exécution de pipeline crée son propre stimulateur. */
  assert.ok(sansCommentaires(ADAPTERS_SRC).includes('createGroqRateLimitPacer({ sleepFn: retryOverrides.sleepFn })'));
});

test('T-M03-05 une configuration de concurrence invalide retombe sur un défaut sûr', () => {
  for (const mauvaise of [0, -1, 1.5, NaN, Infinity, '2', null, undefined, PROVIDER_MAX_INFLIGHT_CEILING + 1]) {
    assert.equal(normalizeMaxInflight(mauvaise), DEFAULT_PROVIDER_MAX_INFLIGHT, String(mauvaise));
  }
  assert.equal(DEFAULT_PROVIDER_MAX_INFLIGHT, 1, 'le défaut sûr est le comportement séquentiel');
  assert.equal(resolveProviderConcurrency('fournisseur_inconnu'), 1);
  assert.equal(resolveProviderConcurrency(undefined), 1);
});

test('T-M03-06 aucune concurrence non bornée n’est atteignable', () => {
  const code = sansCommentaires(RATE_SRC);
  assert.equal(/Infinity|Number\.MAX/.test(code), false, 'aucune borne infinie');
  assert.equal(/tasks\.length|taskCount/.test(code), false, 'la limite ne vaut jamais le nombre de tâches');
  for (const provider of Object.keys(PROVIDER_TECHNICAL_CAPABILITIES)) {
    const limite = resolveProviderConcurrency(provider);
    assert.ok(limite >= 1 && limite <= PROVIDER_MAX_INFLIGHT_CEILING, `${provider} : ${limite}`);
  }
});

test('T-M03-07 aucune tâche n’est affamée par la sérialisation de la fenêtre', async () => {
  const window = createRateWindow({ sleepFn: async (ms) => attendre(Math.min(ms, 3)) });
  window.recordWaitMs(10);
  const vues = [];
  await Promise.all(Array.from({ length: 25 }, (_, i) => window.reserve().then(() => vues.push(i))));
  assert.equal(vues.length, 25, 'toutes les réservations aboutissent');
  assert.deepEqual(vues, Array.from({ length: 25 }, (_, i) => i), 'dans l’ordre, sans famine');
});

test('T-M03-08 toutes les tâches en file démarrent ou échouent explicitement', async () => {
  const verdicts = await runBounded(
    Array.from({ length: 30 }, (_, i) => async () => { if (i % 5 === 0) throw new Error('boum'); return i; }),
    { concurrency: resolveProviderConcurrency('groq') }
  );
  assert.equal(verdicts.length, 30);
  assert.equal(verdicts.filter((v) => v === undefined).length, 0);
  assert.equal(verdicts.filter((v) => v.status === 'rejected').length, 6);
});

/* ======================================================================== *
 * §41 — GROQ
 * ======================================================================== */

test('T-M03-09 la stimulation existante est préservée à l’identique en série', async () => {
  const sommeils = [];
  const pacer = createGroqRateLimitPacer({ sleepFn: async (ms) => { sommeils.push(ms); } });
  await pacer.before();
  assert.deepEqual(sommeils, [], 'aucune attente avant toute information connue');
  pacer.recordWaitMs(1000);
  await pacer.before();
  assert.equal(sommeils.length, 1, 'puis exactement une attente, du reliquat');
  assert.ok(sommeils[0] > 0 && sommeils[0] <= 1000);
});

test('T-M03-10 des réservations Groq concurrentes sont sérialisées, jamais simultanées', async () => {
  let enSection = 0, max = 0;
  const pacer = createGroqRateLimitPacer({ sleepFn: async (ms) => { enSection += 1; max = Math.max(max, enSection); await attendre(Math.min(ms, 8)); enSection -= 1; } });
  pacer.recordWaitMs(25);
  await Promise.all([pacer.before(), pacer.before(), pacer.before(), pacer.before()]);
  assert.equal(max, 1, 'T-M03-13/14 : la protection n’est jamais franchie par plusieurs appels ensemble');
});

test('T-M03-11 un 429 reste une limite de débit, jamais une erreur de schéma', async (t) => {
  withCapturedConsole(t);
  withProviders(t, { groq: () => Response.json({ error: { code: 'rate_limit_exceeded', message: 'slow down' } }, { status: 429 }), anthropic: () => anthropicOk(decision()) });
  const resultat = await decideWithHaChain(INPUT, { ...CLES }, { });
  assert.equal(resultat.etat_demande, 'exploitable', 'la chaîne bascule, comme avant');
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.ok(code.includes('429'), 'la classification 429 demeure');
  assert.equal(/429[^\n]*STRUCTURED_OUTPUT/.test(code), false, 'un 429 n’est jamais reclassé en défaut de structure');
});

test('T-M03-12 la fenêtre partagée est mise à jour sans perte sous concurrence', async () => {
  const window = createRateWindow({ sleepFn: async () => {}, now: () => 1000 });
  window.recordWaitMs(500);
  const premier = window.nextAvailableAt;
  window.recordWaitMs(0);
  window.recordWaitMs(NaN);
  window.recordWaitMs(-10);
  assert.equal(window.nextAvailableAt, premier, 'seule une contrainte réelle repousse la fenêtre');
  window.recordWaitMs(800);
  assert.equal(window.nextAvailableAt, 1800);
});

test('T-M03-13 la concurrence ne contourne pas la protection par requête de Groq', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  /* La vraie protection de Groq est PAR REQUÊTE, sans état partagé : elle est
     donc intacte quel que soit le nombre d'appels simultanés. */
  assert.ok(code.includes('fetchGroqWithRetry'), 'la reprise 429/Retry-After par requête demeure');
  assert.ok(code.includes('GROQ_PRODUCTION_RETRY_DEFAULTS'), 'ses paramètres sont inchangés');
  assert.equal(PROVIDER_TECHNICAL_CAPABILITIES.groq.rate_protection, 'per_request_retry_after');
});

test('T-M03-14 la fenêtre n’a pas été supprimée pour gagner de la vitesse', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.ok(code.includes('createGroqRateLimitPacer'), 'le stimulateur existe toujours');
  assert.ok(code.includes('await pacer.before()'), 'et il est toujours consulté avant chaque appel');
  assert.ok(sansCommentaires(RATE_SRC).includes('recordWaitMs'), 'la fenêtre reste alimentable');
});

/* ======================================================================== *
 * §42–§43 — ANTHROPIC ET OPENAI
 * ======================================================================== */

test('T-M03-15 la concurrence Anthropic est bornée par sa capacité déclarée', async () => {
  const limite = resolveProviderConcurrency('anthropic');
  assert.equal(limite, PROVIDER_TECHNICAL_CAPABILITIES.anthropic.max_inflight);
  const { maxEnVol } = await pipeline({ concurrency: limite, delai: () => 8 });
  assert.ok(maxEnVol <= limite, `MAX_INFLIGHT_OBSERVED = ${maxEnVol} <= ${limite}`);
});

test('T-M03-16 aucun ralentissement fictif n’a été ajouté à Anthropic', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  const bloc = code.slice(code.indexOf('async function callAnthropicMessages'), code.indexOf('export async function decideWithAnthropic'));
  for (const interdit of ['sleep(', 'setTimeout', 'throttle', 'delay(']) {
    assert.equal(bloc.includes(interdit), false, `aucun espacement inventé : ${interdit}`);
  }
  assert.equal(PROVIDER_TECHNICAL_CAPABILITIES.anthropic.rate_protection, 'bounded_inflight_only');
});

test('T-M03-17 un 429 Anthropic reste traité par la politique existante', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.ok(code.includes('classifyProviderHttpStatus'), 'la classification partagée demeure');
  /* La même fonction classe les trois fournisseurs : aucun mapping propre à l’un. */
  assert.equal((code.match(/classifyProviderHttpStatus\(response\.status\)/g) || []).length, 3);
});

test('T-M03-18 la sémantique de repli d’Anthropic est inchangée', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: { message: 'boom' } }, { status: 500 }),
    anthropic: () => anthropicOk(decision())
  });
  await decideWithHaChain(INPUT, CLES);
  assert.deepEqual(calls, ['groq', 'anthropic'], 'ordre et transitions inchangés');
});

test('T-M03-19 la concurrence OpenAI est bornée par sa capacité déclarée', async () => {
  const limite = resolveProviderConcurrency('openai');
  assert.equal(limite, PROVIDER_TECHNICAL_CAPABILITIES.openai.max_inflight);
  const { maxEnVol } = await pipeline({ concurrency: limite, delai: () => 8 });
  assert.ok(maxEnVol <= limite);
});

test('T-M03-20 aucun ralentissement fictif n’a été ajouté à OpenAI', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  const bloc = code.slice(code.indexOf('async function callOpenAiChatCompletion'), code.indexOf('export async function decideWithOpenAI'));
  for (const interdit of ['sleep(', 'throttle', 'delay(']) {
    assert.equal(bloc.includes(interdit), false, `aucun espacement inventé : ${interdit}`);
  }
});

test('T-M03-21 aucun quota commercial n’a été inventé', () => {
  const code = sansCommentaires(RATE_SRC);
  for (const invente of ['rpm', 'rps', 'requestsPerMinute', 'tokensPerMinute', 'burst', 'quota']) {
    assert.equal(code.toLowerCase().includes(invente.toLowerCase()), false, `quota inventé : ${invente}`);
  }
  assert.ok(ADAPTERS_SRC.includes('rpm_budget: null'), 'le dépôt dit toujours qu’aucun RPM n’est connu');
});

test('T-M03-22 la sémantique de repli d’OpenAI est inchangée', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, {
    groq: () => Response.json({ error: {} }, { status: 500 }),
    anthropic: () => Response.json({ error: {} }, { status: 500 }),
    openai: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(decision()) } }] })
  });
  await decideWithHaChain(INPUT, CLES);
  assert.deepEqual(calls, ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
});

/* ======================================================================== *
 * §44–§45 — L'ACTIVATION, ET SEULEMENT ELLE
 * ======================================================================== */

test('T-M03-23 la concurrence de production du groupe approuvé est réellement > 1', async () => {
  const limite = resolveProviderConcurrency('groq');
  assert.ok(limite > 1, `PRODUCTION_CONCURRENCY_LIMIT = ${limite}`);
  const { maxEnVol, journal } = await pipeline({ concurrency: limite, delai: () => 10 });
  assert.ok(maxEnVol > 1, `MAX_INFLIGHT_OBSERVED = ${maxEnVol}`);
  assert.ok(maxEnVol <= limite);
  assert.ok(journal.length >= 2, 'plusieurs batches sont bien planifiés');
});

test('T-M03-24 seul le groupe approuvé par M-02 reçoit une concurrence', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  const activations = code.match(/concurrency:\s*resolveProviderConcurrency\("(\w+)"\)/g) || [];
  assert.equal(activations.length, 3, 'trois adaptateurs Critic, un par fournisseur — et rien d’autre');
  /* Aucune autre limite n'apparaît nulle part. */
  assert.equal(/concurrency:\s*\d/.test(code), false, 'aucun littéral de concurrence');
  assert.equal(/concurrency:\s*(?!resolveProviderConcurrency)/.test(code.replace(/concurrency:\s*resolveProviderConcurrency/g, '')), false);
});

test('T-M03-25 le Critic global reste un préalable strict', () => {
  const code = sansCommentaires(CORE_SRC);
  const corps = code.slice(code.indexOf('export async function runCriticBatchedPipeline('));
  const iGlobal = corps.indexOf('await executeGlobal(');
  const iBounded = corps.indexOf('await runBounded(');
  assert.ok(iGlobal > -1 && iBounded > iGlobal, 'le global précède toujours les batches');
});

test('T-M03-26 Analyst → Critic → Arbiter reste strictement séquentiel', () => {
  const orch = fs.readFileSync(path.join(root, 'workers/shared/operational-request-orchestrator.js'), 'utf8');
  assert.equal(/Promise\.(all|allSettled|race)/.test(sansCommentaires(orch)), false);
  assert.equal(/concurrency/.test(sansCommentaires(orch)), false, 'aucune concurrence entre rôles');
});

test('T-M03-27 aucun autre groupe dynamique n’a été activé par inadvertance', () => {
  const code = sansCommentaires(CORE_SRC);
  assert.equal((code.match(/runBounded\(/g) || []).length, 1, 'un seul point de concurrence dans le noyau');
  assert.equal(/Promise\.all\(/.test(code), false, 'et aucun Promise.all direct');
});

/* ======================================================================== *
 * §46–§48 — DÉTERMINISME, ÉCHEC PARTIEL, ISOLATION
 * ======================================================================== */

test('T-M03-28 l’ordre canonique survit à un ordre d’arrivée désordonné', async () => {
  const serie = await pipeline({ concurrency: 1 });
  const desordre = await pipeline({ concurrency: resolveProviderConcurrency('groq'), delai: (i) => (i === 0 ? 40 : 2) });
  assert.deepEqual(desordre.sortie.question_substitution_review, serie.sortie.question_substitution_review);
});

test('T-M03-29 la référence séquentielle égale le résultat concurrent', async () => {
  const serie = await pipeline({ concurrency: 1 });
  for (const limite of [2, resolveProviderConcurrency('groq'), PROVIDER_MAX_INFLIGHT_CEILING]) {
    const concurrent = await pipeline({ concurrency: limite, delai: (i) => (i * 11) % 17 });
    assert.deepEqual(concurrent.sortie, serie.sortie, `SEQUENTIAL_REFERENCE_EQUALS_CONCURRENT (L=${limite})`);
    assert.equal(concurrent.journal.length, serie.journal.length, 'même nombre d’appels');
  }
});

test('T-M03-30 toutes les tâches restent tentées avant l’échec', async () => {
  const reference = (await pipeline({ concurrency: 1 })).journal.length;
  let tentees = 0;
  const erreur = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      concurrency: resolveProviderConcurrency('groq'),
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async () => { tentees += 1; throw new Error('échec'); }
    }
  ).then(() => null, (e) => e);
  assert.equal(tentees, reference, 'aucune tâche n’est sautée sous concurrence');
  assert.equal(erreur.technical_state, 'partial_failure');
});

test('T-M03-31 la forme de l’échec partiel est inchangée', async () => {
  const erreur = await pipeline({ concurrency: resolveProviderConcurrency('groq'), echecs: new Set([0]) }).then(() => null, (e) => e);
  assert.ok(erreur);
  assert.equal(erreur.technical_state, 'partial_failure');
  for (const champ of ['batchFailures', 'succeededBatchCount', 'totalBatchCount']) {
    assert.ok(Object.prototype.hasOwnProperty.call(erreur, champ), champ);
  }
  for (const echec of erreur.batchFailures) {
    assert.deepEqual(Object.keys(echec).sort(), ['batchIndex', 'error', 'familyGroup', 'groupIndex', 'issueIds']);
  }
});

test('T-M03-32 une sortie structurée invalide ne peut jamais entrer dans l’agrégation', async () => {
  const erreur = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      concurrency: resolveProviderConcurrency('groq'),
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (e) => (e.batchIndex === 0 ? '{"tronqu' : Object.fromEntries(e.issueIds.map((id) => [id, candidatesEntry()])))
    }
  ).then(() => null, (e) => e);
  assert.ok(erreur, 'INVALID_STRUCTURED_OUTPUT_CAN_ENTER_AGGREGATION = NO');
  assert.equal(erreur.technical_state, 'partial_failure');
});

test('T-M03-33 l’échec d’une tâche ne fait pas basculer les autres de fournisseur', async (t) => {
  withCapturedConsole(t);
  /* Trois appels de décision indépendants : seul le deuxième bascule. */
  let groqAppels = 0;
  const calls = withProviders(t, {
    groq: () => { groqAppels += 1; return groqAppels === 2 ? Response.json({ error: {} }, { status: 500 }) : groqOk(decision()); },
    anthropic: () => anthropicOk(decision())
  });
  await decideWithHaChain(INPUT, CLES);
  await decideWithHaChain(INPUT, CLES);
  await decideWithHaChain(INPUT, CLES);
  assert.deepEqual(calls, ['groq', 'groq', 'anthropic', 'groq'],
    'seule la tâche en échec bascule ; les autres restent sur Groq');
});

/* ======================================================================== *
 * §49 — TOUJOURS AUCUNE COURSE
 * ======================================================================== */

test('T-M03-34 une même tâche logique n’exécute jamais deux fournisseurs en parallèle', () => {
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(RATE_SRC);
  assert.equal(/Promise\.race/.test(code), false, 'PROVIDER_RACING_PATHS = 0');
  assert.ok(sansCommentaires(ADAPTERS_SRC).includes('runProviderChain'), 'la chaîne ordonnée demeure');
});

test('T-M03-35 aucune requête doublée en espoir de rapidité', () => {
  const code = (sansCommentaires(ADAPTERS_SRC) + sansCommentaires(RATE_SRC)).toLowerCase();
  for (const interdit of ['hedge', 'speculative', 'firsttorespond', 'racewith']) {
    assert.equal(code.includes(interdit), false, `HEDGED_REQUEST_PATHS : ${interdit}`);
  }
});

test('T-M03-36 aucun choix de modèle ni de fournisseur n’est sémantique', () => {
  const code = sansCommentaires(RATE_SRC);
  for (const interdit of ['model', 'prompt', 'schema', 'case_id', 'quality', 'better']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `SEMANTIC_MODEL_SHOPPING : ${interdit}`);
  }
});

/* ======================================================================== *
 * §51–§54 — CE QUI N'A PAS BOUGÉ
 * ======================================================================== */

test('T-M03-A01 le contrôle de débit n’écrit aucun état OPRIE, route ou readiness', () => {
  const code = sansCommentaires(RATE_SRC);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'degraded_state', 'route', 'readiness', 'execution_ready']) {
    assert.equal(code.includes(interdit), false, interdit);
  }
});

test('T-M03-A02 le contrôle de débit ne touche à aucun des deux gates', () => {
  for (const gate of ['validatePromptAgainstCanonicalContract', 'validateOutputAgainstCanonicalContract', 'prompt-contract-gate', 'output-compliance-gate']) {
    assert.equal(RATE_SRC.includes(gate), false, gate);
  }
});

test('T-M03-A03 aucune nouvelle taxonomie d’erreur n’a été créée pour le débit', () => {
  const code = ADAPTERS_SRC + RATE_SRC;
  for (const interdit of ['OPRIE_RATE_LIMITED', 'QG_RATE_LIMITED', 'READY_RATE_LIMITED']) {
    assert.equal(code.includes(interdit), false, interdit);
  }
  assert.ok(Object.values(FAILURE_CLASSES).includes('technical_failover'), 'la taxonomie existante demeure');
});

test('T-M03-A04 la politique de reprise et les délais sont inchangés', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.ok(code.includes('GROQ_PRODUCTION_RETRY_DEFAULTS'));
  assert.ok(code.includes('DECISION_GROQ_RETRY_POLICY'));
  assert.ok(code.includes('ROLE_GROQ_RETRY_POLICIES'));
  const rate = sansCommentaires(RATE_SRC);
  /* Le contrôle de débit NOMME la protection existante de Groq
     (`per_request_retry_after`) sans jamais en implémenter une : il ne contient
     ni boucle de reprise, ni compteur de tentative, ni recul progressif. */
  for (const mecanisme of ['attempt', 'maxRetries', 'backoff', 'timeout', 'AbortController', 'fetchWith']) {
    assert.equal(rate.includes(mecanisme), false, `mécanisme absent du contrôle de débit : ${mecanisme}`);
  }
  assert.equal(/retry\s*[({]|retries\s*[-+]/.test(rate), false, 'aucune reprise implémentée ici');
  assert.ok(rate.includes('per_request_retry_after'), 'la protection existante est nommée, jamais dupliquée');
});

test('T-M03-A05 une seule source de vérité pour la capacité et la concurrence', () => {
  assert.ok(RATE_SRC.includes('PROVIDER_TECHNICAL_CAPABILITIES'));
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(CORE_SRC);
  assert.equal(/max_inflight\s*[:=]\s*\d/.test(code), false, 'DUPLICATE_RATE_LIMIT_CONFIGS = 0');
  assert.equal((RATE_SRC.match(/max_inflight:/g) || []).length, 3, 'une entrée par fournisseur, au même endroit');
});

test('T-M03-A06 aucune dépendance runtime n’a été ajoutée', () => {
  assert.equal(/^import .* from ["'][^.]/m.test(RATE_SRC), false, 'NEW_RUNTIME_DEPENDENCIES = 0');
});

test('T-M03-37 le nombre logique d’appels et les tentatives nominales sont inchangés', async (t) => {
  withCapturedConsole(t);
  const calls = withProviders(t, { groq: () => groqOk(decision()) });
  await decideWithGroq(INPUT, CLES);
  assert.deepEqual(calls, ['groq'], 'un appel logique, une tentative nominale');
  const serie = await pipeline({ concurrency: 1 });
  const production = await pipeline({ concurrency: resolveProviderConcurrency('groq') });
  assert.equal(production.journal.length, serie.journal.length);
  assert.deepEqual([...production.journal].sort(), [...serie.journal].sort());
});

test('T-M03-38 la valeur retenue est le pas minimal, pas le meilleur benchmark', () => {
  for (const provider of ['groq', 'anthropic', 'openai']) {
    assert.equal(resolveProviderConcurrency(provider), 2,
      'aucune preuve ne justifie davantage : le pas minimal au-dessus du séquentiel est retenu');
  }
  assert.equal(RATE_SRC.includes('max_inflight: 4'), false, 'la valeur du benchmark M-02 n’a pas été reprise');
});
