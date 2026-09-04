/* PERF-REAL-01D — ON NE PEUT PAS CADENCER CE QU'ON N'A PAS.
 * ============================================================================
 *
 * Le lot supposait qu'un mécanisme de contrôle de débit validé attendait d'être
 * raccordé au chemin Fast. Il n'attend rien : M-03 n'a pas de budget proactif,
 * il le refuse par doctrine écrite, et sa seule autre capacité — la concurrence
 * bornée — s'applique à un LOT. Le chemin Fast traite une requête.
 *
 * CE QUE LE LOT A TROUVÉ À LA PLACE. Les en-têtes de Groq déclarent 8 000 jetons
 * par minute. Le banc en demande environ 14 000. Les 429 ne sont pas un défaut à
 * lisser : c'est la réponse correcte d'un fournisseur à une demande supérieure à
 * la capacité souscrite. Aucun stimulateur ne crée de jetons — il déplacerait
 * l'attente avant l'appel, ce que le lot exclut lui-même comme succès.
 *
 * CE QUE CES TESTS FONT. Ils constatent l'état réel du contrôle de débit, ils
 * verrouillent tout ce qui n'a pas bougé, et ils vérifient que l'observation
 * ajoutée n'est lue par aucune décision. Ils n'attestent aucune optimisation :
 * il n'y en a pas eu.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createRateWindow, resolveProviderConcurrency, PROVIDER_TECHNICAL_CAPABILITIES,
  DEFAULT_PROVIDER_MAX_INFLIGHT, PROVIDER_MAX_INFLIGHT_CEILING
} from '../workers/shared/provider-rate-control.js';
import { FAILOVER_ELIGIBLE_CLASSES, FAILURE_CLASSES } from '../workers/shared/provider-ha.js';
import {
  DECISION_PROVIDER_ORDER, GROQ_PRODUCTION_RETRY_DEFAULTS, createGroqRateLimitPacer
} from '../workers/groq/src/index.js';
import { createTurnSnapshot, validateFastInteraction, FAST_FORBIDDEN_AUTHORITY_FIELDS }
  from '../workers/shared/fast-interactive-plane.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const D = JSON.parse(lire('evaluation/perf-real-01/results-01d.json'));
const C = JSON.parse(lire('evaluation/perf-real-01/results-01c.json'));
const B = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
const WORKER = lire('workers/groq/src/index.js');
const M03 = lire('workers/shared/provider-rate-control.js');
const RAPPORT = lire('docs/PERF-REAL-01-REPORT.md');

// =================================================================================================
// §4 à §6 — L'AUDIT, ET CE QU'IL TROUVE
// =================================================================================================

test('T-PERFREAL01D-01 : le chemin Fast est raccordé au M-03 canonique — et ce raccord est inerte', () => {
  /* Le stimulateur est bien créé sur l'adaptateur Fast, et `before()` est attendu. */
  assert.match(WORKER, /pacer: createGroqRateLimitPacer\(\)/);
  assert.match(WORKER, /if \(pacer\) await pacer\.before\(\);/);
  assert.equal(D.audit_controle_debit.fast_avant, 'CONNECTED_BUT_INERT');
  assert.equal(D.audit_controle_debit.fast_apres, 'CONNECTED_BUT_INERT');
  /* Mais rien ne l'alimente : `recordWaitMs` n'a AUCUN appelant de production. */
  const appels = [...WORKER.matchAll(/\.recordWaitMs\(/g)].length;
  const definition = [...WORKER.matchAll(/recordWaitMs\(waitMs\) \{/g)].length;
  assert.equal(appels - definition, 0, 'aucun appel, seulement la définition qui délègue');
  assert.equal(D.audit_controle_debit.consommateurs_actuels.recordWaitMs,
    'AUCUN appel de production — la fenetre n est jamais repoussee, nulle part');
  /* La mesure le confirme : 0 ms d'attente de contrôle de débit sur 48 échantillons. */
  assert.equal(D.officiel.rate_control_wait_total_ms, 0);
  for (const e of D.echantillons) assert.equal(e.rate_control_wait_ms, 0);
});

test('T-PERFREAL01D-02 : il n’existe qu’une autorité de débit, et elle est partagée', () => {
  assert.match(M03, /LA source unique d'un nombre d'appels simultanés/);
  assert.equal([...M03.matchAll(/export function resolveProviderConcurrency/g)].length, 1);
  assert.equal([...M03.matchAll(/export function createRateWindow/g)].length, 1);
  /* Le worker importe, il ne réimplémente pas. */
  assert.match(WORKER, /import \{ createRateWindow, resolveProviderConcurrency \} from "\.\.\/\.\.\/shared\/provider-rate-control\.js"/);
  assert.equal(/let nextAvailableAt|const window = \{/.test(WORKER), false,
    'RATE_CONTROL_AUTHORITY_SOURCE_COUNT = 1');
});

test('T-PERFREAL01D-03 : aucun limiteur propre au plan rapide n’a été créé', () => {
  assert.equal(D.optimisation.appliquee, false, 'FAST_SECONDARY_RATE_LIMITER_COUNT = 0');
  /* Le stimulateur du Fast est celui de tout le monde, construit par la même fabrique. */
  const fabriques = [...WORKER.matchAll(/createGroqRateLimitPacer\(/g)].length;
  assert.ok(fabriques >= 3, 'la même fabrique sert le Fast et les pipelines batchés');
  assert.equal(/createFastRateLimiter|fastRateWindow|FAST_RATE/.test(WORKER), false);
  /* Et M-03 dit pourquoi il n'a pas de budget proactif. */
  assert.match(M03, /Aucun quota commercial\./);
  assert.match(M03, /reviendrait à inventer le contrat commercial d'une API qu'on n'a pas lu/);
  assert.match(M03, /Aucun espacement temporel fictif\./);
  assert.equal(PROVIDER_TECHNICAL_CAPABILITIES.groq.rate_protection, 'per_request_retry_after',
    'pour Groq, la protection déclarée par M-03 EST la reprise 429 mesurée en 01C');
});

test('T-PERFREAL01D-04 : aucun délai propre au banc, à un scénario ou à un domaine', () => {
  const bloc = WORKER.slice(WORKER.indexOf('export const FAST_INTERACTION_ADAPTERS'),
    WORKER.indexOf('export const DECISION_PROVIDER_ORDER'));
  for (const nombre of ['700', '750', '2750', '2000', '3000']) {
    assert.equal(new RegExp(`sleep\\(\\s*${nombre}`).test(bloc), false,
      `BENCHMARK_SPECIFIC_DELAY : ${nombre} ms absent du chemin Fast`);
  }
  assert.equal(/setTimeout\(|sleep\(\d/.test(bloc), false, 'aucune attente écrite en dur');
  /* SCENARIO/DOMAIN_SPECIFIC_RATE_RULE_COUNT = 0 : rien ne dépend de la demande. */
  for (const mot of ['SIMPLE', 'VAGUE', 'RICHE', 'scenario', 'classe_demande']) {
    assert.equal(bloc.includes(mot), false, `aucune règle liée à ${mot}`);
  }
});

// =================================================================================================
// §13 à §15 — LE MÉCANISME, EXÉCUTÉ
// =================================================================================================

test('T-PERFREAL01D-05 : la jointure Fast → contrôle de débit → fournisseur, exécutée', async () => {
  /* On exécute la vraie fabrique, avec une horloge et une attente sous contrôle :
     `before()` est bien consulté, et il n'attend que ce qu'on lui a déclaré. */
  const attentes = [];
  const pacer = createGroqRateLimitPacer({ sleepFn: async (ms) => { attentes.push(ms); } });
  await pacer.before();
  assert.deepEqual(attentes, [], 'fenêtre vierge : aucune attente — c’est l’état de production');
  pacer.recordWaitMs(1234);
  await pacer.before();
  assert.equal(attentes.length, 1, 'une fois alimentée, la fenêtre attend');
  assert.ok(attentes[0] > 1000 && attentes[0] <= 1234, `attente déclarée honorée (${attentes[0]} ms)`);
  /* EXECUTED_RATE_CONTROL_PROOF : le mécanisme fonctionne. Ce qui manque en
     production n'est pas le mécanisme, c'est ce qui devrait l'alimenter. */
  assert.equal(D.audit_controle_debit.gap_type, 'CONTRACT');
});

test('T-PERFREAL01D-06 : une rafale est régulée, sans attendre réellement', async () => {
  /* Horloge et sommeil injectés : la rafale est simulée, la suite reste instantanée. */
  let horloge = 0;
  const ordre = [];
  const window = createRateWindow({ now: () => horloge, sleepFn: async (ms) => { horloge += ms; ordre.push(ms); } });
  window.recordWaitMs(500);
  await Promise.all([1, 2, 3, 4].map(async (n) => { await window.reserve(); ordre.push(`part-${n}`); }));
  /* La réservation est sérialisée : un seul part à la fois, jamais quatre ensemble. */
  const departs = ordre.filter((x) => typeof x === 'string');
  assert.deepEqual(departs, ['part-1', 'part-2', 'part-3', 'part-4']);
  assert.ok(ordre.indexOf(500) < ordre.indexOf('part-1'), 'la fenêtre est franchie avant le premier départ');
  assert.equal(ordre.filter((x) => typeof x === 'number' && x > 0).length, 1,
    'RATE_CONTROL_PREVENTS_UNBOUNDED_BURST = YES : une seule attente, pas quatre en parallèle');
  /* La concurrence bornée existe et reste sûre, mais elle s’applique à un LOT. */
  assert.equal(resolveProviderConcurrency('groq'), 2);
  assert.equal(resolveProviderConcurrency('inconnu'), DEFAULT_PROVIDER_MAX_INFLIGHT);
  assert.ok(PROVIDER_MAX_INFLIGHT_CEILING >= 2);
  assert.match(D.audit_controle_debit.gap, /le chemin Fast traite une requete unique par invocation, il n y a rien a borner/);
});

// =================================================================================================
// §12 — TOUT CE QUI N'A PAS BOUGÉ
// =================================================================================================

test('T-PERFREAL01D-07/08/09 : Retry-After, marge et nombre de reprises inchangés', () => {
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750, 'RETRY_MARGIN_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2, 'MAX_RETRIES_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.defaultBackoffMs, 30000);
  /* RETRY_AFTER_POLICY_CHANGED = NO : la lecture de l'en-tête est intacte. */
  assert.match(WORKER, /export function parseRetryAfterMs\(response\)/);
  assert.match(WORKER, /const retryAfterMs = parseRetryAfterMs\(response\) \?\? parseRetryDelayFromBody\(raw\) \?\? defaultBackoffMs;/);
  /* Et la mesure le confirme, d'une façon que 01C n'avait pas pu voir : cette
     série porte DEUX attentes, 2 750 et 1 750 ms. Groq n'annonce donc pas toujours
     la même chose — 2 000 ms ou 1 000 ms selon l'ampleur du dépassement. Ce qui
     est invariant, et c'est ce qui compte ici, c'est la marge : chaque attente
     vaut exactement l'annonce du fournisseur plus les 750 ms du worker. */
  const attentes = [...new Set(D.echantillons.filter((e) => e.rate_limit_seen).map((e) => e.retry_after_ms))].sort();
  assert.deepEqual(attentes, [1750, 2750]);
  for (const attente of attentes) {
    const annonce = attente - GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs;
    assert.equal(annonce % 1000, 0, `l’annonce est un nombre entier de secondes : ${annonce} ms`);
    assert.ok(annonce > 0);
  }
});

test('T-PERFREAL01D-10/11/12 : ordre, repli et délais d’expiration inchangés', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO');
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.length, 5, 'FAILOVER_POLICY_CHANGED = NO');
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000, 'TIMEOUT_POLICY_CHANGED = NO');
  /* Et la série entière est restée sur groq, au premier essai. */
  assert.equal(D.attribution.groq_count, 48);
  assert.equal(D.attribution.attempt_index_0, 48);
  assert.equal(D.attribution.failover_sample_count, 0);
});

test('T-PERFREAL01D-13 : le plan rapide n’écrit toujours aucune autorité', () => {
  const snap = createTurnSnapshot({ turn_id: 1, original_request: 'Explique la photosynthèse.' });
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, snap).ok,
      false, `FAST_AUTHORITY_WRITES : ${champ} = 0`);
  }
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, snap);
  assert.equal(v.interaction.can_mark_ready, false);
  assert.equal(v.interaction.can_route, false);
  assert.equal(v.interaction.can_execute, false);
  assert.equal(D.officiel.schema_invalid_success_count, 0);
  assert.equal(D.officiel.programming_error_count, 0);
});

test('T-PERFREAL01D-14 : le budget déclaré est relevé, et lu par personne', () => {
  /* L'observation ajoutée est metadata seule : six en-têtes, aucun branchement. */
  for (const champ of ['declared_limit_tokens', 'declared_remaining_tokens', 'declared_reset_tokens',
                       'declared_limit_requests', 'declared_remaining_requests', 'declared_reset_requests']) {
    assert.ok(WORKER.includes(champ), `${champ} relevé`);
  }
  assert.equal(/if\s*\(\s*declared_|declared_remaining_tokens\s*[<>]/.test(WORKER), false,
    'aucune décision ne lit le budget déclaré');
  assert.equal([...WORKER.matchAll(/enTeteDebit\(/g)].length, 6, 'six lectures, une par en-tête');
  assert.match(WORKER, /const enTeteDebit = \(nom\) => \{/);
  /* Et ce qu'il déclare est la cause finale : 8 000 jetons par minute pour ~14 000 demandés. */
  assert.equal(D.budget_declare_par_le_fournisseur.limit_tokens_par_minute, 8000);
  assert.equal(D.budget_declare_par_le_fournisseur.remaining_tokens_min, 52);
  assert.equal(D.budget_declare_par_le_fournisseur.remaining_requests_fin, 934,
    'la contrainte n’est pas le nombre de requêtes');
  assert.match(D.cause_finale, /Aucun stimulateur ne cree de jetons/);
});

test('T-PERFREAL01D-15 : l’artefact frontend n’a pas bougé', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc', 'CANONICAL_HTML_CHANGED = NO');
});

test('T-PERFREAL01D-16 : les seuils officiels n’ont pas bougé, et le verdict en découle', () => {
  assert.deepEqual(D.seuils_inchanges,
    { p50_prefere_ms: 2000, p95_contractuel_ms: 3000, degrade_max_ms: 5000, echec_contrat_ms: 10000 });
  assert.deepEqual(D.seuils_inchanges, {
    p50_prefere_ms: B.seuils.p50_prefere_ms, p95_contractuel_ms: B.seuils.p95_contractuel_ms,
    degrade_max_ms: B.seuils.degrade_max_ms, echec_contrat_ms: B.seuils.echec_contrat_ms
  }, 'identiques à ceux figés avant la première mesure');
  /* Le verdict est calculé, pas décidé. */
  const p95 = D.officiel.ttfi_p95_ms;
  assert.equal(D.verdict.classification, p95 <= 3000 ? 'PASS' : (p95 <= 5000 ? 'DEGRADED' : 'FAIL'));
  assert.equal(D.verdict.classification, 'DEGRADED');
  assert.equal(D.verdict.interactive_p95_contract_met, false);
  assert.equal(D.verdict.rate_limit_optimization_effective, false);
  /* Et l'optimisation n'a pas eu lieu : 429 en hausse, pas en baisse. */
  assert.ok(D.comparaison_01c['429_apres'] > D.comparaison_01c['429_avant'],
    'RATE_LIMIT_OPTIMIZATION_EFFECTIVE = NO — 21 contre 14');
  assert.equal(D.optimisation.appliquee, false);
  assert.match(RAPPORT, /PERF_REAL_01D_PERFORMANCE_GATE     = FAIL/);
  /* Les deux populations restent disjointes : le péage est binaire. */
  assert.ok(D.sans_reprise.max < D.avec_reprise.min,
    `sans reprise max ${D.sans_reprise.max} < avec reprise min ${D.avec_reprise.min}`);
  assert.equal(C.optimisation_effectuee, false, 'et 01C n’avait rien optimisé non plus');
});
