/* PERF-REAL-01G — QUATRE SEUILS, AUCUN GAGNANT.
 * ============================================================================
 *
 * 01F avait mesuré que basculer coûte plus cher qu'attendre un délai court. Ce
 * lot cherche le seuil qui départage — dans un jeu FERMÉ de quatre valeurs,
 * décidé avant la première mesure : 0, 1 000, 1 500, 2 000 ms.
 *
 * AUCUNE NE TIENT LE CONTRAT. p95 de 3 261 à 5 020 ms pour un budget de 3 000.
 * La section 29 interdit de retenir la moins mauvaise, et ce fichier verrouille
 * ce refus : aucun seuil n'est promu, le worker est revenu à son défaut déclaré.
 *
 * POURQUOI AUCUN NE PEUT SUFFIRE. Le seuil choisit entre attendre et basculer.
 * Attendre coûte 2 750 ms, basculer coûte de 2,2 à 10,2 s. Les deux branches
 * dépassent le budget dès que Groq sature — le réglage n'a pas d'issue.
 *
 * DEUX LIMITES SONT ENREGISTRÉES ICI PLUTÔT QUE TUES. Un seul délai annoncé
 * (2 000 ms) est apparu, si bien que B et C se sont comportées comme A faute
 * d'occurrence du cas qui les distingue. Et D n'a rencontré aucun 429 : elle n'a
 * jamais exercé le mécanisme qu'elle devait mesurer.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES, isFailoverEligible, runProviderChain } from '../workers/shared/provider-ha.js';
import { createTurnSnapshot, validateFastInteraction, FAST_FORBIDDEN_AUTHORITY_FIELDS } from '../workers/shared/fast-interactive-plane.js';
import {
  shouldRetrySameProviderOnCapacitySignal, fastCapacityRetryThresholdMs, fastGroqRetryPolicy,
  FAST_CAPACITY_THRESHOLD_CANDIDATES, GROQ_PRODUCTION_RETRY_DEFAULTS, DECISION_PROVIDER_ORDER,
  DECISION_GROQ_RETRY_POLICY, ROLE_GROQ_RETRY_POLICIES
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const G = JSON.parse(lire('evaluation/perf-real-01/results-01g.json'));
const WORKER = lire('workers/groq/src/index.js');

// =================================================================================================
// §12, §13, §37 — LE SEUIL, SOURCE UNIQUE ET MÉCANIQUE
// =================================================================================================

test('T-PERFREAL01G-01 : un seul point de décision dans tout le produit', () => {
  assert.equal([...WORKER.matchAll(/export function shouldRetrySameProviderOnCapacitySignal/g)].length, 1,
    'THRESHOLD_AUTHORITY_SOURCE_COUNT = 1');
  assert.equal([...WORKER.matchAll(/shouldRetrySameProviderOnCapacitySignal\(/g)].length, 2,
    'une définition, un appel — le seuil n’est comparé nulle part ailleurs');
  assert.equal([...WORKER.matchAll(/capacityRetryThresholdMs/g)].length >= 3, true);
  /* Et il n'y a pas quatre branches en production : une valeur, lue en configuration. */
  assert.match(WORKER, /export function fastCapacityRetryThresholdMs\(env\)/);
  assert.match(WORKER, /retryOverrides: fastGroqRetryPolicy\(env\)/);
  assert.equal(/if \(threshold === 0\)|switch \(threshold/.test(WORKER), false);
});

test('T-PERFREAL01G-02/03/04 : la décision est déterministe, et porte sur le délai annoncé', () => {
  /* §45 — les six preuves exécutées, une par une. */
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1000, 0), false, 'seuil 0, 1000 → bascule');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1000, 1000), true, 'seuil 1000, 1000 → attendre');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(2000, 1000), false, 'seuil 1000, 2000 → bascule');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1000, 1500), true, 'seuil 1500, 1000 → attendre');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(2000, 1500), false, 'seuil 1500, 2000 → bascule');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(2000, 2000), true, 'seuil 2000, 2000 → attendre');
  /* La comparaison est <=, et elle ignore la marge : 2 000 au seuil 2 000 attend encore. */
  assert.equal(shouldRetrySameProviderOnCapacitySignal(2001, 2000), false);
  assert.equal(G.semantique, 'le seuil porte sur le Retry-After ANNONCE par le fournisseur, jamais sur Retry-After + marge de 750 ms');
  /* Les autres appelants gardent Infinity : tout délai annoncé reste honoré. */
  assert.equal(shouldRetrySameProviderOnCapacitySignal(30000, Infinity), true);
  /* Aucune branche spéciale pour 1000 ou 2000 : la règle s'applique à toute valeur. */
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1234, 1500), true);
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1501, 1500), false);
});

test('T-PERFREAL01G-11 : le jeu de seuils est exactement fermé', () => {
  assert.deepEqual([...FAST_CAPACITY_THRESHOLD_CANDIDATES], [0, 1000, 1500, 2000]);
  assert.deepEqual(G.jeu_ferme, [0, 1000, 1500, 2000]);
  /* Une valeur hors du jeu retombe sur le défaut, jamais sur elle-même. */
  assert.equal(fastCapacityRetryThresholdMs({ FAST_CAPACITY_RETRY_THRESHOLD_MS: '1200' }), 0);
  assert.equal(fastCapacityRetryThresholdMs({ FAST_CAPACITY_RETRY_THRESHOLD_MS: '9999' }), 0);
  assert.equal(fastCapacityRetryThresholdMs({}), 0, 'le défaut est le contrat de 01F');
  for (const v of FAST_CAPACITY_THRESHOLD_CANDIDATES) {
    assert.equal(fastCapacityRetryThresholdMs({ FAST_CAPACITY_RETRY_THRESHOLD_MS: String(v) }), v);
    assert.deepEqual(fastGroqRetryPolicy({ FAST_CAPACITY_RETRY_THRESHOLD_MS: String(v) }),
      { capacityRetryThresholdMs: v });
  }
  /* Le worker déployé porte la valeur par défaut déclarée. */
  assert.match(lire('workers/groq/wrangler.jsonc'), /"FAST_CAPACITY_RETRY_THRESHOLD_MS": "0"/);
});

// =================================================================================================
// §21, §26, §29 — LES QUATRE RUNS, ET LE REFUS DE CHOISIR
// =================================================================================================

test('T-PERFREAL01G-17 : les quatre politiques ont été exécutées au même protocole', () => {
  assert.equal(G.protocole.total_officiel, 192);
  for (const p of ['A', 'B', 'C', 'D']) {
    const r = G.politiques[p];
    assert.equal(r.sample_count, 48, `${p} : 48 échantillons`);
    assert.equal(r.success_count, 48, `${p} : 48 succès`);
    assert.equal(r.schema_invalid_success_count, 0);
    assert.equal(r.programming_error_count, 0);
  }
  assert.equal(G.protocole.methode_percentile, 'NEAREST_RANK');
  assert.equal(G.protocole.silence_avant_chaque_run_ms, 180000);
  assert.equal(G.protocole.meme_code, true, 'même code, seule la valeur de seuil change');
});

test('T-PERFREAL01G-18 : aucune politique ne tient le contrat, et aucune n’est retenue', () => {
  for (const p of ['A', 'B', 'C', 'D']) {
    assert.equal(G.politiques[p].contract_met, false, `${p} échoue`);
    assert.ok(G.politiques[p].ttfi.p95 > 3000, `${p} : p95 ${G.politiques[p].ttfi.p95} > 3000`);
  }
  assert.equal(G.verdict.no_calibration_winner, true, 'NO_CALIBRATION_WINNER = YES');
  assert.equal(G.verdict.candidate_policy, null, 'CANDIDATE_POLICY = NONE');
  assert.equal(G.verdict.confirmation_run_effectue, false, 'pas de confirmation sans candidate');
  assert.match(G.verdict.raison, /interdit de retenir la moins mauvaise comme contrat de production/);
  /* Et la moins mauvaise n'a PAS été promue : le worker est revenu au défaut. */
  assert.equal(fastCapacityRetryThresholdMs({}), 0);
  assert.match(G.deploiements.final, /retour au seuil par defaut declare \(0 ms\)/);
});

test('T-PERFREAL01G-19 : les deux limites de l’expérience sont enregistrées, pas tues', () => {
  /* Un seul délai annoncé est apparu : B et C n'ont pas été départagées de A. */
  assert.deepEqual(G.observation_delais.valeurs_annoncees_rencontrees, [2000]);
  assert.match(G.observation_delais.consequence, /faute d occurrence du cas qui les distingue/);
  assert.equal(G.politiques.B.groq.same_provider_retry_count, 0);
  assert.equal(G.politiques.C.groq.same_provider_retry_count, 0);
  /* D n'a jamais exercé le mécanisme. */
  assert.equal(G.politiques.D.groq.capacity_signal_count, 0);
  assert.equal(G.politiques.D.anthropic.invocation_count, 0);
  assert.match(G.comparabilite.verdict, /D ne l est PAS/);
  /* La télémétrie de budget manquait, et on dit pourquoi. */
  assert.match(G.comparabilite.telemetrie_budget, /avait disparu en 01E lors du renommage des champs/);
  assert.match(G.comparabilite.consequence, /la conclusion ne depend pas de cette limite/);
  /* Elle est rétablie pour la suite. */
  assert.match(WORKER, /budget_restant: budget\.restant/);
  assert.match(WORKER, /RÉGRESSION D'INSTRUMENTATION CORRIGÉE/);
});

test('T-PERFREAL01G-20 : la bascule elle-même dépasse le budget, quel que soit le seuil', () => {
  for (const p of ['A', 'B', 'C']) {
    const a = G.politiques[p].anthropic.ttfi;
    assert.ok(a && a.count > 0, `${p} : Anthropic a été sollicité`);
    assert.ok(a.min > 2000, `${p} : le meilleur cas Anthropic dépasse déjà 2 s (${a.min})`);
  }
  assert.equal(G.anthropic.pire_echantillon_ms, 10239.9);
  assert.match(G.anthropic.lecture, /Aucune politique de seuil ne peut rendre ce cout acceptable/);
  /* Attendre coûte 2 750 ms ; basculer coûte davantage. Les deux branches perdent. */
  const attendre = 2000 + GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs;
  assert.equal(attendre, 2750);
  assert.ok(G.politiques.A.anthropic.ttfi.p50 > attendre, 'basculer est plus lent qu’attendre');
  assert.ok(attendre < 3000 && G.politiques.A.anthropic.ttfi.p50 > 3000,
    'et pourtant attendre seul ne suffit pas non plus, une fois la latence Groq ajoutée');
});

// =================================================================================================
// §5, §10, §39 à §43 — LES INVARIANTS
// =================================================================================================

test('T-PERFREAL01G-05/06 : un signal de capacité n’est pas une panne, et l’erreur de programmation ne bascule pas', async () => {
  for (const p of ['A', 'B', 'C', 'D']) {
    assert.equal(G.politiques[p].groq.failure_count, 0, `${p} : GROQ_FAILURE_COUNT = 0`);
    assert.equal(G.politiques[p].anthropic.failure_count, 0);
  }
  assert.ok(G.politiques.A.groq.capacity_signal_count > 0, 'des signaux de capacité ont bien eu lieu');
  /* Et l'erreur de programmation reste hors du repli. */
  const essayes = [];
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction', log: () => {},
    providers: DECISION_PROVIDER_ORDER.map((name) => ({
      name, execute: async () => { essayes.push(name); throw new Error('bug'); }
    }))
  }));
  assert.deepEqual(essayes, ['groq'], 'PROGRAMMING_ERROR_FAILOVER_COUNT = 0');
  assert.equal(isFailoverEligible(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.length, 5);
});

test('T-PERFREAL01G-07/08/09/10 : ordre, marge, reprises et délais inchangés', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.equal(G.invariants.provider_order_changed, false);
  assert.equal(G.invariants.primary_provider_changed, false);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750, 'RETRY_MARGIN_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2, 'MAX_RETRIES_CHANGED = NO');
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000, 'TIMEOUT_CHANGED = NO');
  /* Les plafonds mesurés des autres appelants sont intacts. */
  assert.equal(DECISION_GROQ_RETRY_POLICY.maxRetryWaitMs, 3000);
  assert.deepEqual(ROLE_GROQ_RETRY_POLICIES,
    { analyst: { maxRetryWaitMs: 16000 }, critic: { maxRetryWaitMs: 26000 }, arbiter: { maxRetryWaitMs: 17000 } });
  assert.deepEqual(G.seuils_contrat, { p50_prefere_ms: 2000, p95_contractuel_ms: 3000,
    degrade_max_ms: 5000, echec_contrat_ms: 10000 });
});

test('T-PERFREAL01G-12/13 : ni sélection sémantique, ni équilibrage, ni autorité', () => {
  const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const decision = sansProse(WORKER.slice(WORKER.indexOf('export function shouldRetrySameProviderOnCapacitySignal'),
    WORKER.indexOf('export const FAST_CAPACITY_THRESHOLD_CANDIDATES')));
  for (const mot of ['snapshot', 'original_request', 'scenario', 'mode', 'demande']) {
    assert.equal(decision.includes(mot), false, `la décision n’accède pas à ${mot}`);
  }
  for (const interdit of ['Math.random', 'roundRobin', 'hedge', 'Promise.race', 'Promise.any']) {
    assert.equal(WORKER.includes(interdit), false, `aucun ${interdit}`);
  }
  assert.equal(G.invariants.semantic_provider_selection_count, 0);
  /* FAST_AUTHORITY_WRITES = 0 */
  const snap = createTurnSnapshot({ turn_id: 1, original_request: 'Explique la photosynthèse.' });
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, snap).ok, false);
  }
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, snap);
  assert.equal(v.interaction.can_mark_ready, false);
  assert.equal(v.interaction.can_route, false);
  assert.equal(v.interaction.can_execute, false);
  assert.equal(G.invariants.fast_authority_writes, 0);
});

test('T-PERFREAL01G-14/15/16 : péremption, faux READY et artefact frontend', () => {
  const ancien = createTurnSnapshot({ turn_id: 5, original_request: 'Explique la photosynthèse.' });
  assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'x' }, ancien).interaction.turn_id, 5);
  assert.equal(G.invariants.stale_fast_visible_write_count, 0);
  assert.equal(G.invariants.false_ready_count, 0);
  assert.equal(G.invariants.schema_invalid_success_count, 0);
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    'c701ccbea727a07dc5fccd55ee282500ad5fe38f295a4e634c73ba1e1e8f63f0', 'CANONICAL_HTML_CHANGED = NO');
});
