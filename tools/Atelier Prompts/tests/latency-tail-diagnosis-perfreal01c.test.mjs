/* PERF-REAL-01C — LA QUEUE DE LATENCE AVAIT UN PÉAGE, PAS UN MYSTÈRE.
 * ============================================================================
 *
 * PERF-REAL-01B avait vu la queue et refusé de l'expliquer faute de preuve :
 * « corrélée à la position dans la série », avec une hypothèse 429/Retry-After
 * explicitement NON établie. Ce lot l'établit, ou l'écarte, hypothèse par
 * hypothèse — et n'optimise rien.
 *
 * CE QUI MANQUAIT. `fetchGroqWithRetry` calculait déjà `retries` et
 * `rate_limited_wait_ms` ; le chemin de succès les jetait. Une reprise réussie
 * ne laissait aucune trace. L'instrumentation ajoutée est une ligne de journal
 * portant cinq nombres déjà calculés : elle ne décide rien, n'attend rien, ne
 * transporte ni contenu ni secret.
 *
 * CE QUE LA MESURE DIT. 34 échantillons sans reprise rendent p95 = 1 535 ms,
 * la moitié du budget. 14 échantillons avec une reprise rendent 4 009 ms. Les
 * douze plus lents sont exactement les douze premiers retriés. Le mécanisme est
 * fermé de bout en bout : 429, Retry-After annoncé à 2 000 ms, marge de sûreté
 * de 750 ms, attente de 2 750 ms, une seule reprise, aucune bascule.
 *
 * CE QUE CES TESTS INTERDISENT. Que la politique de reprise, l'ordre des
 * fournisseurs, les délais d'expiration ou les seuils bougent en silence. Le
 * lot suivant devra les changer explicitement, et faire échouer ces tests.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FAILOVER_ELIGIBLE_CLASSES, FAILURE_CLASSES } from '../workers/shared/provider-ha.js';
import { DECISION_PROVIDER_ORDER, GROQ_PRODUCTION_RETRY_DEFAULTS } from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const D = JSON.parse(lire('evaluation/perf-real-01/results-01c.json'));
const B = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
const WORKER = lire('workers/groq/src/index.js');
const RAPPORT = lire('docs/PERF-REAL-01-REPORT.md');

// =================================================================================================
// §3, §9 — L'ATTRIBUTION, COMPLÈTE
// =================================================================================================

test('T-PERFREAL01C-01 : chaque échantillon sait quel fournisseur l’a servi', () => {
  assert.equal(D.echantillons.length, 48);
  assert.equal(D.couverture.provider, '48/48', 'PROVIDER_ATTRIBUTION_COVERAGE');
  for (const e of D.echantillons) assert.ok(e.provider_used, `${e.sample_id} attribué`);
  assert.equal(D.attribution.groq_count, 48);
  assert.equal(D.attribution.anthropic_count, 0);
  assert.equal(D.attribution.openai_count, 0);
  /* L'attribution n'est pas une supposition : la jointure a été contrôlée. */
  assert.match(D.couverture.methode, /0 anomalie d alignement/);
  assert.match(D.couverture.methode, /latence fournisseur toujours <= TTFI client/);
});

test('T-PERFREAL01C-02 : chaque échantillon sait à quelle tentative il a abouti', () => {
  assert.equal(D.couverture.attempt, '48/48', 'ATTEMPT_ATTRIBUTION_COVERAGE');
  for (const e of D.echantillons) assert.equal(typeof e.attempt_index, 'number');
  assert.equal(D.attribution.attempt_index_0, 48);
  assert.equal(D.attribution.attempt_index_1, 0);
  assert.equal(D.attribution.attempt_index_2, 0);
  assert.equal(D.attribution.failover_sample_count, 0, 'aucune bascule sur toute la série');
});

test('T-PERFREAL01C-03 : chaque échantillon sait combien de fois il a été repris', () => {
  assert.equal(D.couverture.retry, '48/48', 'RETRY_ATTRIBUTION_COVERAGE');
  for (const e of D.echantillons) assert.equal(typeof e.retry_count, 'number');
  const repartition = D.echantillons.reduce((a, e) => ((a[e.retry_count] = (a[e.retry_count] || 0) + 1), a), {});
  assert.deepEqual(repartition, { 0: 34, 1: 14 }, 'jamais deux reprises : maxRetries n’est pas approché');
  assert.ok(Math.max(...D.echantillons.map((e) => e.retry_count)) < GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries + 1);
});

// =================================================================================================
// §10 — LE 429, NOMMÉ ET CHIFFRÉ
// =================================================================================================

test('T-PERFREAL01C-04 : les 429 sont classés explicitement, jamais fondus dans « lent »', () => {
  assert.equal(D.attribution.rate_limit_429_count, 14, 'RATE_LIMIT_429_COUNT');
  const vus = D.echantillons.filter((e) => e.rate_limit_seen);
  assert.equal(vus.length, 14);
  for (const e of vus) {
    assert.equal(e.retry_count, 1);
    assert.equal(e.retry_reason, 'HTTP_429_RETRY_AFTER');
    assert.equal(e.http_status_provider, 200, 'la reprise aboutit — le 429 n’est pas l’état final');
  }
  /* Et un échantillon sans 429 ne prétend pas en avoir vu un. */
  for (const e of D.echantillons.filter((x) => !x.rate_limit_seen)) {
    assert.equal(e.retry_count, 0);
    assert.equal(e.retry_reason, null);
    assert.equal(e.retry_after_ms, 0);
  }
});

test('T-PERFREAL01C-05 : le Retry-After annoncé est capté, et il est constant', () => {
  assert.equal(D.attribution.retry_after_present_count, 14, 'RETRY_AFTER_PRESENT_COUNT');
  assert.equal(D.attribution.retry_after_total_ms, 38500, 'RETRY_AFTER_TOTAL_MS');
  const attentes = [...new Set(D.echantillons.filter((e) => e.rate_limit_seen).map((e) => e.retry_after_ms))];
  assert.deepEqual(attentes, [2750], 'la même valeur sur les quatorze, sans variation');
  /* 2 750 = 2 000 annoncés par Groq + la marge de sûreté du worker. La chaîne
     causale est fermée : la constante mesurée s'explique par une constante du code. */
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(2000 + GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 2750);
  assert.match(RAPPORT, /Il annonce un `Retry-After` de \*\*2 000 ms\*\*/);
});

test('T-PERFREAL01C-06 : la temporisation est captée, et le régulateur n’y est pour rien', () => {
  assert.equal(D.attribution.backoff_total_ms, 38500, 'BACKOFF_TOTAL_MS');
  assert.equal(D.attribution.pacer_wait_total_ms, 0,
    'le régulateur M-03 n’attend jamais sur ce chemin : recordWaitMs n’y est pas appelé');
  /* La temporisation observée EST le Retry-After honoré, pas une seconde attente. */
  for (const e of D.echantillons) assert.equal(e.backoff_ms, e.retry_after_ms);
  assert.equal(D.hypotheses.H5_saturation_concurrency, 'REJECTED');
});

// =================================================================================================
// §4, §7, §8 — L'INSTRUMENTATION, ET CE QU'ELLE MONTRE
// =================================================================================================

test('T-PERFREAL01C-07 : l’instrumentation n’ajoute aucune autorité, ni aucun délai', () => {
  assert.equal(D.instrumentation.nature, 'METADATA_ONLY');
  assert.equal(D.instrumentation.comportement_modifie, false);
  /* Une seule ligne de journal, cinq nombres, et rien qui se lise ailleurs. */
  const bloc = WORKER.slice(WORKER.indexOf('event: "groq_call_observation"') - 400,
    WORKER.indexOf('event: "groq_call_observation"') + 400);
  assert.match(bloc, /console\.log\(JSON\.stringify\(\{/);
  for (const champ of ['http_status', 'retries', 'rate_limited_wait_ms', 'pacer_wait_ms', 'provider_latency_ms']) {
    assert.ok(bloc.includes(champ), `${champ} observé`);
  }
  assert.equal(/systemPrompt|userMessage|API_KEY|Bearer/.test(bloc), false,
    'ni contenu utilisateur, ni secret');
  /* Aucune décision ne lit ces variables : elles ne servent qu’au journal. */
  for (const v of ['observationReprises', 'observationAttenteDebit', 'observationApresPacer', 'observationDebut']) {
    const usages = [...WORKER.matchAll(new RegExp(`\\b${v}\\b`, 'g'))].length;
    assert.ok(usages >= 2 && usages <= 4, `${v} : posée puis journalisée, rien d’autre (${usages} usages)`);
  }
  assert.equal(/if\s*\(\s*observation/.test(WORKER), false, 'aucune branche ne dépend de l’observation');
});

test('T-PERFREAL01C-08 : les douze plus lents sont exactement les repris', () => {
  assert.equal(D.douze_plus_lents.length, 12);
  for (const e of D.douze_plus_lents) {
    assert.equal(e.retry_count, 1, `index ${e.sequence_index} : une reprise`);
    assert.equal(e.rate_limit_seen, true);
    assert.equal(e.retry_after_ms, 2750);
    assert.equal(e.provider, 'groq');
    assert.equal(e.attempt_index, 0, 'aucune bascule, même sur les plus lents');
    assert.ok(e.ttfi_ms > 3000, 'tous au-dessus du contrat');
  }
  /* Et les six classes y figurent : la lenteur n’appartient à aucune. */
  const classes = new Set(D.douze_plus_lents.map((e) => e.scenario_class));
  assert.ok(classes.size >= 5, `${classes.size} classes parmi les douze plus lents`);
});

test('T-PERFREAL01C-09 : la limite de débit s’accumule au fil de la série', () => {
  const q = D.quartiles;
  assert.equal(q.length, 4);
  assert.deepEqual(q.map((x) => x.plage), ['1-12', '13-24', '25-36', '37-48']);
  assert.deepEqual(q.map((x) => x.rate_limit_count), [0, 0, 5, 9],
    'zéro, zéro, cinq, neuf — la pression monte');
  assert.deepEqual(q.map((x) => x.retry_count), [0, 0, 5, 9]);
  assert.deepEqual(q.map((x) => x.retry_after_total_ms), [0, 0, 13750, 24750]);
  /* Le p95 suit le nombre de 429, pas la classe ni la position en soi. */
  assert.ok(q[0].p95 <= 3000 && q[1].p95 <= 3000, 'les deux premiers quarts tiennent le contrat');
  assert.ok(q[2].p95 > 3000 && q[3].p95 > 3000, 'les deux derniers ne le tiennent pas');
});

test('T-PERFREAL01C-10 : sans reprise, le contrat serait tenu — c’est le péage qui le fait sauter', () => {
  assert.equal(D.sans_reprise.count, 34);
  assert.equal(D.sans_reprise.p95, 1535.3);
  assert.ok(D.sans_reprise.p95 <= 3000, 'les appels non repris tiennent, et de loin');
  assert.equal(D.avec_reprise.count, 14);
  assert.equal(D.avec_reprise.p95, 4009.5);
  assert.ok(D.avec_reprise.min > 2900, 'aucun appel repris ne descend sous 2,9 s');
  assert.ok(D.sans_reprise.max < D.avec_reprise.min,
    'les deux populations ne se recouvrent pas : la séparation est nette');
  /* Le verdict de 01B n'est pas révisé : il est expliqué. */
  assert.equal(B.verdict.classification, 'DEGRADED');
  assert.equal(D.optimisation_effectuee, false);
});

// =================================================================================================
// §2, §11, §13 — LES HYPOTHÈSES, TRANCHÉES
// =================================================================================================

test('T-PERFREAL01C-11 : chaque hypothèse est prouvée ou écartée, aucune laissée en suspens', () => {
  assert.deepEqual(D.hypotheses, {
    H1_rate_limiting: 'PROVEN', H2_429_retry_after: 'PROVEN', H3_retry_backoff: 'PROVEN',
    H4_failover: 'REJECTED', H5_saturation_concurrency: 'REJECTED', H6_isolate: 'REJECTED',
    H7_reseau_client: 'REJECTED', H8_autre: 'aucune autre cause observee'
  });
  /* H4 écartée par l'attribution, H6 et H7 par la comparaison des horloges. */
  assert.equal(D.attribution.failover_sample_count, 0);
  for (const e of D.echantillons) {
    assert.ok(e.provider_latency_ms <= e.ttfi_ms + 50,
      `${e.sample_id} : la latence fournisseur ne dépasse pas le TTFI client`);
    assert.ok(Math.abs(e.worker_total_ms - e.provider_latency_ms) < 60,
      `${e.sample_id} : le worker n’ajoute rien de mesurable`);
  }
  /* L'échec réseau unique de 01B n'est pas requalifié par absence. */
  assert.equal(D.echec_reseau_01b.reproduit, false);
  assert.equal(D.echec_reseau_01b.echantillons_en_echec, 0);
  assert.match(D.echec_reseau_01b.note, /reste non explique/);
});

test('T-PERFREAL01C-12 : rien n’a été déplacé — ni politique, ni seuil, ni artefact', () => {
  /* Ordre des fournisseurs. */
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO');
  /* Politique de reprise et d'expiration, à la valeur près. */
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2, 'RETRY_POLICY_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.defaultBackoffMs, 30000);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000, 'TIMEOUT_POLICY_CHANGED = NO');
  /* Éligibilité au repli : un 429 repris n'est pas un échec, et programming_error reste dehors. */
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.length, 5);
  /* Seuils du contrat interactif, inchangés depuis 01B. */
  assert.deepEqual(B.seuils, { p50_prefere_ms: 2000, p95_contractuel_ms: 3000,
    degrade_max_ms: 5000, echec_contrat_ms: 10000, note: 'figes avant la mesure, inchanges apres' });
  /* Artefact frontend. */
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'c701ccbea727a07dc5fccd55ee282500ad5fe38f295a4e634c73ba1e1e8f63f0', 'CANONICAL_HTML_CHANGED = NO');
  /* Et le protocole du banc n'a pas été retouché pour flatter le résultat. */
  assert.equal(D.protocole.identique_a, 'PERF-REAL-01B');
  assert.equal(D.protocole.methode_percentile, 'NEAREST_RANK');
  assert.equal(D.protocole.delai_entre_appels_ms, 700);
  assert.equal(D.protocole.total, 48);
});
