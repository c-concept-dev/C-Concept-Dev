/* PERF-REAL-01F — UN 429 N'EST PAS UNE PANNE, C'EST UNE CAPACITÉ QUI DIT NON.
 * ============================================================================
 *
 * 01C a prouvé que la queue de latence du plan rapide était entièrement payée en
 * attentes Retry-After. 01D et 01E ont montré qu'on ne pouvait ni cadencer ni
 * réduire pour y échapper. Reste une capacité de repli que le produit possède
 * déjà et n'utilisait pas : Anthropic, puis OpenAI.
 *
 * LE CHANGEMENT TIENT EN UN PLAFOND. `maxRetryWaitMs = 0` sur le seul chemin
 * rapide : toute attente annoncée dépasse le plafond, la reprise est abandonnée
 * sans dormir, et la chaîne HA existante bascule dans son ordre inchangé. Ni
 * maxRetries, ni le Retry-After, ni la marge de 750 ms, ni les classes
 * d'éligibilité ne bougent. Decision, Analyste, Critique et Arbitre gardent
 * leurs plafonds mesurés à l'octet près.
 *
 * ET UNE DISTINCTION DANS LA TÉLÉMÉTRIE. Un fournisseur qui annonce sa limite
 * fonctionne. Le compter comme une panne fausserait toute lecture de sa
 * fiabilité : CAPACITY_SIGNAL et FAILURE sont donc deux issues distinctes, et
 * ces tests interdisent de les additionner.
 *
 * CE QU'IL FAUT SAVOIR SUR CE PLAFOND. Les quatre autres sont dérivés d'une
 * latence de bascule MESURÉE. Celui-ci ne l'est pas : la latence Anthropic du
 * plan rapide n'a jamais été observée, faute d'un 429 qui déclenche la bascule.
 * C'est une décision produit prise en amont de la mesure — et ce lot produit
 * précisément la mesure qui permettra de la confirmer ou de la recalibrer.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  runProviderChain, FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES, tagFailure, isFailoverEligible, failureClassOf
} from '../workers/shared/provider-ha.js';
import {
  createTurnSnapshot, validateFastInteraction, FAST_FORBIDDEN_AUTHORITY_FIELDS
} from '../workers/shared/fast-interactive-plane.js';
import {
  FAST_GROQ_RETRY_POLICY, DECISION_GROQ_RETRY_POLICY, ROLE_GROQ_RETRY_POLICIES,
  shouldRetrySameProviderOnCapacitySignal, fastCapacityRetryThresholdMs,
  GROQ_PRODUCTION_RETRY_DEFAULTS, DECISION_PROVIDER_ORDER, FAST_INTERACTION_ADAPTERS,
  fetchGroqWithRetry, MODEL
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const WORKER = lire('workers/groq/src/index.js');

/** Une réponse 429 qui annonce son délai, comme Groq le fait réellement. */
const reponse429 = (secondes) => new Response('{"error":{"message":"rate limit"}}', {
  status: 429, headers: { 'retry-after': String(secondes) }
});

// =================================================================================================
// §1 à §4 — LA NOUVELLE RÈGLE, ET CE QU'ELLE N'EST PAS
// =================================================================================================

test('T-PERFREAL01F-01 : un 429 avec Retry-After abandonne la reprise sans dormir', async () => {
  const dormi = [];
  const appels = [];
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { appels.push(String(url)); return reponse429(2); };
  try {
    await assert.rejects(
      () => fetchGroqWithRetry('https://exemple.test', { method: 'POST' },
        { ...FAST_GROQ_RETRY_POLICY, sleepFn: async (ms) => { dormi.push(ms); } }),
      (erreur) => {
        assert.equal(erreur.error_kind, 'http_429');
        assert.equal(erreur.exhausted, true);
        assert.equal(erreur.wait_too_long, true, 'abandon parce que l’attente dépasse le plafond');
        assert.equal(erreur.retries, 0, 'aucune reprise n’a été tentée');
        assert.equal(erreur.rate_limited_wait_ms, 0, 'aucune attente n’a été payée');
        assert.equal(erreur.announced_wait_ms, 2000 + GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs,
          'le délai annoncé est relevé — c’est l’attente évitée');
        return true;
      });
  } finally { globalThis.fetch = vraiFetch; }
  assert.deepEqual(dormi, [], 'SAME_PROVIDER_429_RETRY_BEFORE_FAILOVER = 0');
  assert.equal(appels.length, 1, 'un seul appel réseau : pas de seconde tentative');
});

test('T-PERFREAL01F-02 : un signal de capacité n’est pas une panne, et la télémétrie les sépare', () => {
  const bloc = WORKER.slice(WORKER.indexOf('if (retryExhaustedError?.exhausted === true)'),
    WORKER.indexOf('const errorName = String(retryExhaustedError?.name'));
  assert.match(bloc, /provider_outcome: "CAPACITY_SIGNAL"/);
  assert.match(bloc, /capacity_signal: true/);
  const transport = WORKER.slice(WORKER.indexOf('event: "groq_transport_error"') - 60,
    WORKER.indexOf('event: "groq_transport_error"') + 160);
  assert.match(transport, /provider_outcome: "FAILURE"/);
  assert.match(transport, /capacity_signal: false/);
  assert.match(WORKER, /event: "groq_usage_observation",\s*\n\s*provider_outcome: "SUCCESS",\s*\n\s*capacity_signal: false/);
  /* Les trois issues existent, et elles sont distinctes. */
  const issues = [...WORKER.matchAll(/provider_outcome: "([A-Z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(issues)].sort(), ['CAPACITY_SIGNAL', 'FAILURE', 'SUCCESS']);
});

test('T-PERFREAL01F-03 : un 429 Groq fait basculer vers Anthropic, qui répond', async () => {
  /* PREUVE EXÉCUTÉE de la chaîne : le premier fournisseur signale sa capacité,
     le suivant est appelé, et il sert. */
  const essayes = [];
  const journal = [];
  const resultat = await runProviderChain({
    role: 'fast_interaction',
    log: (e) => journal.push(e),
    providers: DECISION_PROVIDER_ORDER.map((name) => ({
      name,
      execute: async () => {
        essayes.push(name);
        if (name === 'groq') {
          throw tagFailure(Object.assign(new Error('Groq HTTP 429'), { error_kind: 'http_429', exhausted: true }),
            FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: 'groq' });
        }
        return { type: 'ACKNOWLEDGE', text: 'Je prends note.' };
      }
    }))
  });
  assert.deepEqual(essayes, ['groq', 'anthropic'], 'GROQ_TO_ANTHROPIC');
  assert.deepEqual(Object.keys(resultat).sort(), ['text', 'type']);
  const bascule = journal.find((e) => e.event === 'provider_ha_fallback');
  assert.equal(bascule.fallback_from, 'groq');
  assert.equal(bascule.fallback_to, 'anthropic', 'FAILOVER_TARGET explicite');
  assert.equal(bascule.failure_class, FAILURE_CLASSES.TECHNICAL_FAILOVER, 'FAILOVER_TRIGGER observable');
});

test('T-PERFREAL01F-04 : aucune attente du même fournisseur avant la bascule', () => {
  /* PERF-REAL-01G a remplacé le plafond fixe par un SEUIL configuré, mais le
     contrat que ce test garde est inchangé : à seuil 0 — la valeur par défaut, et
     celle que 01F a déployée — aucun délai annoncé n'est jamais attendu. */
  assert.deepEqual({ ...FAST_GROQ_RETRY_POLICY }, { maxRetryWaitMs: 0 });
  assert.equal(fastCapacityRetryThresholdMs({}), 0, 'le défaut reste la bascule immédiate');
  assert.equal(shouldRetrySameProviderOnCapacitySignal(1000, 0), false);
  assert.equal(shouldRetrySameProviderOnCapacitySignal(2000, 0), false);
  /* La politique ne s'applique QU'au plan rapide. */
  const adaptateurs = WORKER.slice(WORKER.indexOf('export const FAST_INTERACTION_ADAPTERS'),
    WORKER.indexOf('export async function runFastInteractionWithHaChain'));
  assert.equal([...adaptateurs.matchAll(/retryOverrides: fastGroqRetryPolicy\(env\)/g)].length, 1,
    'un seul adaptateur — le transport Groq du plan rapide');
  assert.equal(DECISION_GROQ_RETRY_POLICY.maxRetryWaitMs, 3000, 'Decision garde son plafond mesuré');
  assert.deepEqual(ROLE_GROQ_RETRY_POLICIES,
    { analyst: { maxRetryWaitMs: 16000 }, critic: { maxRetryWaitMs: 26000 }, arbiter: { maxRetryWaitMs: 17000 } });
});

test('T-PERFREAL01F-05/14 : ordre des fournisseurs et seuils inchangés', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO, PRIMARY_PROVIDER_CHANGED = NO');
  assert.deepEqual(Object.keys(FAST_INTERACTION_ADAPTERS).sort(), ['anthropic', 'groq', 'openai']);
  assert.equal(MODEL, 'openai/gpt-oss-20b');
  /* Ni maxRetries, ni la marge, ni le délai d'expiration n'ont bougé. */
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.maxRetries, 2);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs, 750);
  assert.equal(GROQ_PRODUCTION_RETRY_DEFAULTS.timeoutMs, 8000);
  const B = JSON.parse(lire('evaluation/perf-real-01/results-01b.json'));
  assert.deepEqual(B.seuils, { p50_prefere_ms: 2000, p95_contractuel_ms: 3000,
    degrade_max_ms: 5000, echec_contrat_ms: 10000, note: 'figes avant la mesure, inchanges apres' });
});

test('T-PERFREAL01F-06/24 : une erreur de programmation ne fait toujours pas basculer', async () => {
  const essayes = [];
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction', log: () => {},
    providers: DECISION_PROVIDER_ORDER.map((name) => ({
      name, execute: async () => { essayes.push(name); throw new Error('execute is not a function'); }
    }))
  }), (e) => { assert.equal(failureClassOf(e), FAILURE_CLASSES.PROGRAMMING_ERROR); return true; });
  assert.deepEqual(essayes, ['groq'], 'PROGRAMMING_ERROR_FAILOVER_COUNT = 0');
  assert.equal(isFailoverEligible(FAILURE_CLASSES.PROGRAMMING_ERROR), false);
  assert.equal(FAILOVER_ELIGIBLE_CLASSES.length, 5, 'la liste d’éligibilité est inchangée');
});

// =================================================================================================
// §13, §20, §21 — LA MÉTRIQUE CONTREFACTUELLE, ET CE QUE LE LOT NE FAIT PAS
// =================================================================================================

test('T-PERFREAL01F-07/08/18 : l’attente évitée est nommée pour ce qu’elle est', () => {
  const bloc = WORKER.slice(WORKER.indexOf('if (retryExhaustedError?.exhausted === true)'),
    WORKER.indexOf('const errorName = String(retryExhaustedError?.name'));
  assert.match(bloc, /attente_evitee_ms/);
  assert.match(bloc, /CONTREFACTUELLE — c'est le délai\s*\n\s*que l'ancien contrat aurait payé, jamais une latence observée/);
  /* Elle ne vaut le délai annoncé QUE lorsque l'abandon fut immédiat ; sinon zéro. */
  assert.match(bloc, /attente_evitee_ms: retryExhaustedError\.wait_too_long === true/);
  assert.match(bloc, /: 0,/);
  /* Et elle est distincte de l'attente réellement payée. */
  assert.match(bloc, /rate_limited_wait_ms: retryExhaustedError\.rate_limited_wait_ms/);
  /* GROQ_RELIABILITY_FAILURE_COUNT ne doit jamais absorber les signaux de capacité :
     les deux champs existent séparément et ne sont jamais additionnés dans la source. */
  assert.equal(/capacity_signal\s*\+|signal.*\+.*failure/i.test(WORKER), false);
});

test('T-PERFREAL01F-12/13 : aucune sélection sémantique, aucun équilibrage de charge', () => {
  const chaine = lire('workers/shared/provider-ha.js');
  /* La chaîne ne lit pas ce qu'elle transmet, ne compare pas, ne rejoue pas un succès. */
  assert.match(chaine, /il ne lit jamais le résultat d'une tentative réussie/);
  assert.match(chaine, /il ne compare jamais deux résultats entre eux/);
  /* SEMANTIC / CONTENT / SCENARIO / DOMAIN_BASED_PROVIDER_SELECTION_COUNT = 0 */
  /* On regarde le CODE, pas la prose : « classe d'échec » apparaît légitimement
     dans les commentaires de la chaîne, et ce n'est pas une sélection. */
  const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const adaptateurs = sansProse(WORKER.slice(WORKER.indexOf('export const FAST_INTERACTION_ADAPTERS'),
    WORKER.indexOf('export const DECISION_PROVIDER_ORDER')));
  /* Les trois adaptateurs reçoivent le MÊME instantané et le MÊME schéma : aucun
     ne lit le contenu de la demande pour décider quoi que ce soit. */
  assert.equal([...adaptateurs.matchAll(/makeFastInteractionUserMessage\(snapshot\)/g)].length, 3);
  assert.equal(/snapshot\.(original_request|clarification_history)\s*[.[]/.test(adaptateurs), false,
    'aucun adaptateur n’inspecte le contenu de la demande');
  /* FAST-CAPACITY-ADMISSION-01 — UNE BRANCHE EST APPARUE, ET ELLE EST TECHNIQUE.
     Le souvenir du délai annoncé se prend au seul endroit où l'erreur d'origine
     existe encore, ce qui impose de distinguer le fournisseur qui l'a émise. Ce que
     cette preuve doit interdire n'a jamais été « toute branche » mais « toute branche
     qui lit la demande » : on vérifie donc que chaque condition ne compare qu'un NOM
     de fournisseur ou une décision d'admission, jamais un contenu. */
  const conditions = [...adaptateurs.matchAll(/\bif\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
  for (const condition of conditions) {
    assert.match(condition, /^(name === "(groq|anthropic|openai)"|!admission\.admise|jusqua !== null)$/,
      `condition non technique dans le chemin rapide : ${condition}`);
  }
  assert.equal(/snapshot|original_request|clarification_history|domaine|mode/.test(conditions.join(' ')), false,
    'aucune condition ne regarde la demande, son domaine ou son mode');
  /* Aucun équilibrage : pas de tirage, pas de rotation, pas d'appel double. */
  for (const interdit of ['Math.random', 'round-robin', 'roundRobin', 'hedge', 'Promise.race',
                          'Promise.any', 'weighted']) {
    assert.equal(WORKER.includes(interdit), false, `aucun ${interdit}`);
  }
  assert.match(WORKER, /const providers = order\.map\(\(name\) => \(\{/, 'l’ordre déclaré, et rien d’autre');
});

// =================================================================================================
// §17 à §19, §25 — LES INVARIANTS DU PLAN RAPIDE
// =================================================================================================

test('T-PERFREAL01F-09 : le plan rapide n’écrit toujours aucune autorité', () => {
  const snap = createTurnSnapshot({ turn_id: 1, original_request: 'Explique la photosynthèse.' });
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, snap).ok,
      false, `FAST_AUTHORITY_WRITES : ${champ} = 0`);
  }
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, snap);
  assert.equal(v.interaction.can_mark_ready, false);
  assert.equal(v.interaction.can_route, false);
  assert.equal(v.interaction.can_execute, false);
});

test('T-PERFREAL01F-10 : une chaîne épuisée ferme, y compris après un signal de capacité', async () => {
  const essayes = [];
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction', log: () => {},
    providers: DECISION_PROVIDER_ORDER.map((name) => ({
      name,
      execute: async () => {
        essayes.push(name);
        throw tagFailure(new Error(name === 'groq' ? 'Groq HTTP 429' : '503'),
          FAILURE_CLASSES.TECHNICAL_FAILOVER, { provider: name });
      }
    }))
  }), (e) => { assert.equal(e.all_providers_failed, true); return true; });
  assert.deepEqual(essayes, ['groq', 'anthropic', 'openai'], 'GROQ→ANTHROPIC→OPENAI, puis fermeture');
  /* FALSE_READY_COUNT = 0 : rien n’est fabriqué à la sortie d’une chaîne épuisée. */
  const endpoint = lire('workers/shared/fast-interaction-endpoint.js');
  assert.match(endpoint, /Aucune\n \* interaction n'est jamais fabriquée ici pour avoir quelque chose à rendre\./);
});

test('T-PERFREAL01F-11 : une bascule plus longue ne rend pas une candidate périmée acceptable', () => {
  const ancien = createTurnSnapshot({ turn_id: 5, original_request: 'Explique la photosynthèse.' });
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, ancien);
  assert.equal(v.interaction.turn_id, 5, 'la candidate porte le tour dont elle vient');
  /* La garde de péremption du navigateur est indépendante de la durée du repli. */
  assert.match(lire('atelier-prompts-v11.5-lot10g-decision-provider.html'),
    /if\(seq!==oprieState\.seq\)\{oprieMark\('fast_discarded_stale'\);return null\}/);
});

test('T-PERFREAL01F-19 : la mesure réelle, et ce qu’elle dit du plafond choisi', () => {
  const F = JSON.parse(lire('evaluation/perf-real-01/results-01f.json'));
  /* Le mécanisme a fait exactement ce qu'on lui demandait. */
  assert.equal(F.couverture.provider, '48/48');
  assert.equal(F.bascules.capacity_failover_count, 8);
  assert.equal(F.bascules.groq_to_anthropic, 8);
  assert.equal(F.attentes.actual_retry_wait_total_ms, 0, 'aucune attente payée');
  assert.equal(F.fournisseurs.groq.same_provider_429_retry, 0);
  /* Un signal de capacité n'est jamais compté comme une panne. */
  assert.equal(F.fournisseurs.groq.failure, 0, 'GROQ_RELIABILITY_FAILURE_COUNT = 0');
  assert.equal(F.fournisseurs.groq.capacity_signal, 8);
  assert.equal(F.fournisseurs.anthropic.failure, 0);
  /* PREMIÈRE MESURE RÉELLE D'ANTHROPIC sur le plan rapide — 8 points seulement :
     le p95 y vaut le maximum, la médiane est ce qui tranche. */
  assert.equal(F.fournisseurs.anthropic.ttfi.count, 8);
  assert.equal(F.fournisseurs.anthropic.ttfi.min, 1769.9);
  assert.equal(F.fournisseurs.anthropic.ttfi.p50, 3435.9);
  assert.equal(F.fournisseurs.groq.ttfi.p50, 343.4, 'Groq seul reste excellent');
  /* LA RÈGLE DU PROJET, APPLIQUÉE : attendre n'a de sens que si l'attente annoncée
     est inférieure au coût de la bascule. 2 750 ms annoncés contre 3 436 ms de
     bascule : attendre était le meilleur choix, et le contrat de ce lot est dominé. */
  const attenteAnnoncee = 2000 + GROQ_PRODUCTION_RETRY_DEFAULTS.safetyMarginMs;
  assert.ok(attenteAnnoncee < F.fournisseurs.anthropic.ttfi.p50,
    `${attenteAnnoncee} ms d’attente contre ${F.fournisseurs.anthropic.ttfi.p50} ms de bascule`);
  assert.equal(F.verdict.capacity_failover_effective, false);
  assert.equal(F.verdict.interactive_p95_contract_met, false);
  assert.ok(F.officiel.ttfi_p95_ms > F.comparaison_01d.p95_avant, 'le p95 s’est dégradé, et on le dit');
  /* Et rien n'a été réoptimisé après coup : le plafond déployé vaut toujours 0. */
  assert.deepEqual({ ...FAST_GROQ_RETRY_POLICY }, { maxRetryWaitMs: 0 });
});

test('T-PERFREAL01F-15/16/17 : artefact intact, observation sans secret, transition explicite', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc', 'CANONICAL_HTML_CHANGED = NO');
  /* Aucun secret, aucun contenu utilisateur dans les journaux ajoutés. */
  for (const motif of [/sk-[A-Za-z0-9]{16,}/, /gsk_[A-Za-z0-9]{20,}/, /BEGIN [A-Z ]*PRIVATE KEY/]) {
    assert.equal(motif.test(WORKER), false);
  }
  assert.equal(/console\.(log|warn|error)\([^)]*(apiKey|api_key|token|secret|password)/i.test(WORKER), false);
  assert.equal(/console\.(log|error)\([^)]*(systemPrompt|userMessage|original_request)/.test(WORKER), false);
  /* Chaque transition de fournisseur porte sa cause : la chaîne la journalise. */
  const chaine = lire('workers/shared/provider-ha.js');
  assert.match(chaine, /log\(\{ event: "provider_ha_fallback", role, fallback_from: name, fallback_to: next\.name, failure_class \}\)/);
});
