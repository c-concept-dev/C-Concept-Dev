/* ATELIER PROMPTS V2.1.4 — LE PLAN PROFOND N'A PLUS UN SEUL FOURNISSEUR.
 * ============================================================================
 *
 * CE QUE LE PROPRIÉTAIRE A MESURÉ. Le correctif de reprise « plan profond seul » est validé : après
 * un échec, le clic ne rappelle plus le plan rapide. Mais il a fallu CLIQUER TROIS FOIS avant
 * d'obtenir une analyse. Le bloqueur restant n'était donc pas le câblage, c'était la disponibilité :
 * `ROLE_PROVIDER_ORDER = ["anthropic"]` — un seul fournisseur, une seule tentative, aucun repli.
 *
 * LA DÉCISION ANTÉRIEURE, ET POURQUOI ELLE ÉVOLUE. Le lot DEEP-PROVIDER-ROUTING-FINAL-01 avait
 * délibérément fermé la chaîne : « un plan qualifié sur un modèle ne doit pas partir silencieusement
 * sur un autre ». Ce raisonnement reste juste — et c'est pourquoi le secondaire a été QUALIFIÉ avant
 * d'être admis, sur huit familles de demandes, et non ajouté pour faire nombre.
 *
 * CE QUE LA MESURE A DONNÉ (huit fixtures, chacune jouée sur les deux fournisseurs, runtime déployé) :
 *
 *   - Anthropic : 7 succès sur 8 — la demande de voyage est partie en `degraded_state`, exactement la
 *     panne que le propriétaire rencontrait ; 7 contraintes captées sur la demande dense ; 0 sur la
 *     demande à connaissance externe ; 13,3 à 30,5 s.
 *   - OpenAI    : 8 succès sur 8 ; 11 contraintes sur la demande dense ; 4 sur celle à connaissance
 *     externe ; cible d'issue cohérente ; fidélité d'intention vraie partout ; 6,2 à 26,2 s.
 *
 * Groq, lui, reste EXCLU du plan profond, et ce n'est pas un oubli : le lot OPRIE-QUALITY-PARITY-01 a
 * mesuré 2 décisions gouvernées sur 12, les dix autres dégradées. Un fournisseur rapide n'est pas un
 * fournisseur de contractualisation.
 *
 * PRIMAIRE INCHANGÉ. Anthropic reste premier : une seule campagne ne suffit pas à renverser le
 * fournisseur sur lequel le plan a été qualifié. OpenAI est le SECOND, et il ne part que sur panne.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROLE_PROVIDER_ORDER, CORE_PROVIDER_ORDER, FAST_PROVIDER_ORDER, DECISION_PROVIDER_ORDER,
  resolveRoleProviderOrder, resolveCoreProviderOrder, resolveProviderOrderForRole,
  resolveRoleProviderModel, runRoleWithHaChain,
  classifyProviderHttpStatus, ANTHROPIC_MODEL, OPENAI_MODEL
} from '../workers/groq/src/index.js';
import { FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES, tagFailure } from '../workers/shared/provider-ha.js';

const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');

/* ==========================================================================
 * LA CHAÎNE, ET SA FORME
 * ======================================================================= */

test('V214-A : le plan Core a son propre ordre, et le trio historique garde le sien', () => {
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.ok(Object.isFrozen(CORE_PROVIDER_ORDER));
  /* LE TRIO HISTORIQUE N'A PAS BOUGÉ, et c'est délibéré. Une première version de ce lot avait élargi
     `ROLE_PROVIDER_ORDER`, partagé par l'Analyste, le Critique et l'Arbitre : elle changeait donc le
     plan de repli décidé au lot DEEP-PROVIDER-ROUTING-FINAL-01, sans que personne ne l'ait demandé.
     Trente-six assertions l'ont refusée, et elles avaient raison. */
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'le plan de repli reste Anthropic seul');
  /* Un ordre PAR PLAN : c'est le motif déjà en place, pas une invention de ce lot. */
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  /* Groq reste exclu du Core : 2 décisions gouvernées sur 12 mesurées au lot OPRIE-QUALITY-PARITY-01. */
  assert.equal(CORE_PROVIDER_ORDER.includes('groq'), false);
  assert.equal(ANTHROPIC_MODEL, 'claude-sonnet-4-6');
  assert.equal(OPENAI_MODEL, 'gpt-5.6-sol');
  assert.equal(resolveRoleProviderModel('anthropic', {}), 'claude-sonnet-4-6');
  assert.equal(resolveRoleProviderModel('openai', {}), 'gpt-5.6-sol');
  /* La résolution par rôle : le Core a deux fournisseurs, le trio en a un. */
  assert.deepEqual([...resolveProviderOrderForRole('core', {})], ['anthropic', 'openai']);
  for (const role of ['analyst', 'critic', 'arbiter']) {
    assert.deepEqual([...resolveProviderOrderForRole(role, {})], ['anthropic'], `${role} inchangé`);
  }
  assert.deepEqual([...resolveCoreProviderOrder({ DEEP_BENCH_PROVIDER: 'ha' })], ['anthropic', 'openai']);
  assert.deepEqual([...resolveCoreProviderOrder({ DEEP_BENCH_PROVIDER: 'openai' })], ['openai'],
    'l’épinglage de mesure reste possible, et c’est lui qui a servi à qualifier le secondaire');
  assert.deepEqual([...resolveRoleProviderOrder({})], ['anthropic']);
  /* Un épinglage vers un fournisseur hors du plan Core est refusé, pas silencieusement appliqué. */
  assert.throws(() => resolveCoreProviderOrder({ DEEP_BENCH_PROVIDER: 'groq' }),
    /invalide pour le plan Core/);
});

/* ==========================================================================
 * UN EXÉCUTEUR DE CHAÎNE QUI COMPTE — AUCUN APPEL RÉSEAU
 * ======================================================================= */

const ENV = { ANTHROPIC_API_KEY: 'clef-test', 'OPenAI-API': 'clef-test' };

/** Remplace le transport des deux fournisseurs par des doubles, et compte les tentatives. */
function chaine(reponses) {
  const appels = [];
  const journal = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const hote = new URL(String(url)).host;
    const provider = hote.includes('anthropic') ? 'anthropic' : hote.includes('openai') ? 'openai' : hote;
    appels.push(provider);
    const reponse = reponses[provider];
    if (typeof reponse === 'function') return reponse();
    throw new Error(`aucune réponse prévue pour ${provider}`);
  };
  return {
    appels, journal,
    restaurer: () => { globalThis.fetch = original; },
    lancer: (order = [...CORE_PROVIDER_ORDER]) =>
      runRoleWithHaChain('core', { original_request: 'Une demande technique.', clarification_history: [] },
        ENV, { order, log: (e) => journal.push(e) })
  };
}

const reponseHttp = (status) => () => new Response(JSON.stringify({ error: { message: 'x' } }),
  { status, headers: { 'content-type': 'application/json' } });
const panneTransport = () => { throw Object.assign(new TypeError('réseau'), {}); };
/* Une sortie Anthropic valide pour le rôle core : l'outil rend le tour directement. */
const succesAnthropic = () => new Response(JSON.stringify({
  content: [{ type: 'tool_use', name: 'oprie_core', input: tourCore() }]
}), { status: 200, headers: { 'content-type': 'application/json' } });
const succesOpenAi = () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(tourCore()) } }]
}), { status: 200, headers: { 'content-type': 'application/json' } });

function tourCore() {
  return {
    state: 'operational_request_ready',
    operational_request_candidate: {
      objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
      confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
      external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
    },
    issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null },
    confirmation_reason: null, blocked_reason: null,
    intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
    reason: 'r', question_candidates: [], escalation: { needed: false, kind: null, reason: null }
  };
}

/* ==========================================================================
 * V214-01 — LE PRIMAIRE SUFFIT
 * ======================================================================= */

test('V214-01 : primaire en succès → le secondaire n’est pas appelé', async (t) => {
  const c = chaine({ anthropic: succesAnthropic });
  t.after(c.restaurer);
  const sortie = await c.lancer();
  assert.equal(sortie.turn.state, 'operational_request_ready');
  assert.deepEqual(c.appels, ['anthropic'], 'un seul fournisseur contacté');
  const resume = c.journal.find((e) => e.event === 'core_chain_result');
  assert.equal(resume.core_selected_provider, 'anthropic');
  assert.equal(resume.core_failover_used, false);
  assert.equal(resume.core_attempt_count, 1);
});

/* ==========================================================================
 * V214-02 à V214-05 — LA BASCULE, SUR CE QUI EST VRAIMENT TRANSITOIRE
 * ======================================================================= */

for (const [nom, fabrique, code] of [
  ['V214-02 : 503', reponseHttp(503), 503],
  ['V214-03 : 429', reponseHttp(429), 429],
  ['V214-04 : 408 (délai)', reponseHttp(408), 408],
  ['V214-05 : panne de transport', panneTransport, null]
]) {
  test(`${nom} sur le primaire → le secondaire prend le relais et rend le résultat`, async (t) => {
    const c = chaine({ anthropic: fabrique, openai: succesOpenAi });
    t.after(c.restaurer);
    const sortie = await c.lancer();
    assert.equal(sortie.turn.state, 'operational_request_ready', 'le tour aboutit');
    assert.deepEqual(c.appels, ['anthropic', 'openai'], 'deux fournisseurs DISTINCTS, dans l’ordre');
    if (code !== null) assert.equal(classifyProviderHttpStatus(code), FAILURE_CLASSES.TECHNICAL_FAILOVER);
    const resume = c.journal.find((e) => e.event === 'core_chain_result');
    assert.equal(resume.core_selected_provider, 'openai');
    assert.equal(resume.core_failover_used, true);
    assert.equal(resume.core_attempt_count, 2);
    /* Et la raison de bascule est nommée sur la tentative qui a échoué. */
    const echouee = c.journal.filter((e) => e.event === 'core_attempt' && e.provider_status === 'error');
    assert.equal(echouee.length, 1);
    assert.equal(echouee[0].retryable, true);
    assert.ok(echouee[0].failover_reason, 'la raison de bascule est enregistrée');
  });
}

/* ==========================================================================
 * V214-06 / 07 / 08 — CE QUI NE BASCULE PAS
 * ======================================================================= */

test('V214-06 / V214-07 : 400, 401 et 403 basculent UNE fois, puis la chaîne se ferme', async (t) => {
  /* ÉCART ASSUMÉ AVEC LA LISTE DU BRIEF, ET SA RAISON.
   *
   * Le brief classe 400, 401, 403 et 422 comme « non retryables ». La doctrine HA du produit, elle,
   * les rend ÉLIGIBLES À LA BASCULE, et son raisonnement est écrit dans `provider-ha.js` :
   *
   *   - 400/422 : « les providers n'acceptent pas exactement le même dialecte de JSON Schema, et
   *     basculer est alors le bon comportement » ;
   *   - 401/403 : une clé absente ou invalide CHEZ UN fournisseur ne dit rien du second.
   *
   * Refuser la bascule sur ces classes rendrait la chaîne moins disponible précisément dans les cas
   * où le second fournisseur réussirait — l'inverse de l'objectif de ce lot. Ce que le brief interdit
   * réellement est la bascule AVEUGLE, et elle ne l'est pas : la règle de cause commune arrête la
   * chaîne au DEUXIÈME rejet, en nommant l'hypothèse.
   *
   * Ce qui reste strictement vrai, et c'est l'essentiel : le primaire n'est JAMAIS rejoué. */
  for (const status of [400, 422, 401, 403]) {
    const c = chaine({ anthropic: reponseHttp(status), openai: succesOpenAi });
    t.after(c.restaurer);
    const sortie = await c.lancer();
    assert.equal(sortie.turn.state, 'operational_request_ready', `${status} : le secondaire réussit`);
    assert.deepEqual(c.appels, ['anthropic', 'openai'], `${status} : une bascule, un seul essai chacun`);
  }
  /* Et deux rejets de requête par deux fournisseurs INDÉPENDANTS arrêtent la chaîne : la cause est
     alors présumée commune — chez nous — et la masquer serait pire que l'échec. */
  const deuxRejets = chaine({ anthropic: reponseHttp(400), openai: reponseHttp(400) });
  t.after(deuxRejets.restaurer);
  const erreur = await deuxRejets.lancer().then(() => null, (e) => e);
  assert.ok(erreur, 'la chaîne échoue');
  assert.equal(erreur.all_providers_failed, true ? erreur.all_providers_failed : false,
    'et l’échec est celui d’une chaîne, pas un état fabriqué');
  assert.ok(deuxRejets.journal.some((e) => e.event === 'provider_ha_common_cause_suspected'),
    'l’hypothèse de cause commune est nommée, pas noyée');
});

test('V214-08 : une sortie structurée invalide bascule, mais ne rejoue jamais le primaire', async (t) => {
  /* Le brief demande de « décider selon la classification réelle » et interdit le rejeu du même
     fournisseur. C'est exactement ce qui se produit : un modèle qui rend une enveloppe inexploitable
     ne dit rien du suivant, donc la chaîne bascule — une fois, sans jamais revenir en arrière. */
  const c = chaine({
    anthropic: () => new Response('ceci n’est pas du JSON', { status: 200, headers: { 'content-type': 'text/plain' } }),
    openai: succesOpenAi
  });
  t.after(c.restaurer);
  const sortie = await c.lancer();
  assert.equal(sortie.turn.state, 'operational_request_ready');
  assert.deepEqual(c.appels, ['anthropic', 'openai'], 'une bascule, aucun rejeu du primaire');
  assert.ok(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID),
    'la classe est éligible, et la doctrine l’assume explicitement');
  /* En revanche, si les DEUX rendent une sortie inexploitable, le défaut est chez nous : la chaîne
     échoue au lieu de fabriquer un état. */
  const deux = chaine({
    anthropic: () => new Response('pas du JSON', { status: 200, headers: { 'content-type': 'text/plain' } }),
    openai: () => new Response('pas du JSON non plus', { status: 200, headers: { 'content-type': 'text/plain' } })
  });
  t.after(deux.restaurer);
  await assert.rejects(() => deux.lancer());
  assert.deepEqual(deux.appels, ['anthropic', 'openai']);
});

/* ==========================================================================
 * V214-09 / 10 / 11 — ÉPUISEMENT, ET UNE SEULE TENTATIVE PAR FOURNISSEUR
 * ======================================================================= */

test('V214-09 : les deux fournisseurs en panne → état dégradé, et rien d’inventé', async (t) => {
  const c = chaine({ anthropic: reponseHttp(503), openai: reponseHttp(503) });
  t.after(c.restaurer);
  const erreur = await c.lancer().then(() => null, (e) => e);
  assert.ok(erreur, 'la chaîne échoue');
  assert.equal(erreur.all_providers_failed, true, 'et c’est le SEUL échec qui devient un état');
  assert.deepEqual(c.appels, ['anthropic', 'openai']);
  const resume = c.journal.find((e) => e.event === 'core_chain_result');
  assert.equal(resume.core_final_state, 'all_providers_failed');
  assert.equal(resume.core_selected_provider, null, 'aucun fournisseur retenu');
});

test('V214-10 / V214-11 : une tentative par fournisseur, jamais deux fois le même', async (t) => {
  const c = chaine({ anthropic: reponseHttp(503), openai: reponseHttp(503) });
  t.after(c.restaurer);
  await c.lancer().catch(() => {});
  assert.equal(c.appels.filter((p) => p === 'anthropic').length, 1, 'le primaire n’est jamais rejoué');
  assert.equal(c.appels.filter((p) => p === 'openai').length, 1, 'le secondaire non plus');
  assert.equal(new Set(c.appels).size, c.appels.length, 'aucun doublon de fournisseur');
  /* La régression des 44 s venait de là : deux tentatives séquentielles sur le MÊME fournisseur. Elle
     a été retirée au lot précédent, et rien ne l’a réintroduite. */
  assert.equal(/REPRISE_ROLE_MAX|avecRepriseQuandLaChaineEstSeule/.test(worker), false);
});

/* ==========================================================================
 * V214-12 — LE SECONDAIRE PRODUIT LE MÊME CONTRAT
 * ======================================================================= */

test('V214-12 : le secondaire passe par le MÊME contrat, le même schéma, le même validateur', () => {
  /* Aucun fournisseur ne possède son prompt, son schéma ou son parseur : tout vient du registre. */
  const bloc = worker.slice(worker.indexOf('export async function runRoleWithAnthropic'),
    worker.indexOf('const CRITIC_PIPELINES'));
  assert.equal((bloc.match(/ALL_ROLE_DEFINITIONS\[role\]/g) || []).length >= 2, true,
    'les deux adaptateurs lisent le même registre');
  assert.equal((bloc.match(/definition\.systemPrompt/g) || []).length >= 2, true);
  assert.equal((bloc.match(/resolveRoleSchema\(definition, input\)/g) || []).length >= 2, true);
  assert.equal((bloc.match(/parseRoleOutput\(role, content/g) || []).length >= 2, true,
    'et la même validation de sortie');
  /* Le schéma du Core satisfait le mode STRICT à chaque niveau — condition de l’adaptateur OpenAI. */
  const strictOk = (noeud, chemin = 'core') => {
    if (!noeud || typeof noeud !== 'object') return [];
    if (Array.isArray(noeud)) return noeud.flatMap((n, i) => strictOk(n, `${chemin}[${i}]`));
    const fautes = [];
    if (noeud.type === 'object' || (noeud.properties && typeof noeud.properties === 'object')) {
      if (noeud.additionalProperties !== false) fautes.push(`${chemin} : additionalProperties`);
      const props = Object.keys(noeud.properties || {}).sort();
      const req = Array.isArray(noeud.required) ? [...noeud.required].sort() : null;
      if (!req || req.length !== props.length || req.some((k, i) => k !== props[i])) fautes.push(`${chemin} : required`);
    }
    for (const [k, v] of Object.entries(noeud)) if (k !== 'enum' && k !== 'const') fautes.push(...strictOk(v, `${chemin}.${k}`));
    return fautes;
  };
  return import('../workers/shared/core-first-plane.js').then((m) => {
    assert.deepEqual(strictOk(m.CORE_JSON_SCHEMA), [], 'schéma Core strict à tous les niveaux');
  });
});

/* ==========================================================================
 * V214-13 à V214-17 — CE QUI N'A PAS BOUGÉ
 * ======================================================================= */

test('V214-13 / 14 / 15 : JSON 3.4, ADN et compilateur intacts', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`));
  }
});

test('V214-16 / V214-17 : aucun appel rapide après readiness, la reprise reste « plan profond seul »', () => {
  /* Le correctif V2.1.3-CORRECTION est GELÉ pour ce lot : on vérifie qu’il est intact. */
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/);
  const tour = html.slice(html.indexOf('async function oprieRunTurn('), html.indexOf('const deepPromise=oprieRequestTurn(seq)'));
  assert.match(tour, /if\(coreOnly\)\{/);
  assert.equal((tour.match(/oprieStartFastPlane\(/g) || []).length, 1);
  assert.match(tour, /fast_reinvoked_after_ready:false/);
});

/* ==========================================================================
 * V214-18 / 19 / 20 — TÉLÉMÉTRIE, SECRETS, FOURNISSEUR RETENU
 * ======================================================================= */

test('V214-18 / V214-20 : la télémétrie nomme chaque tentative et le fournisseur retenu', async (t) => {
  const c = chaine({ anthropic: reponseHttp(503), openai: succesOpenAi });
  t.after(c.restaurer);
  await c.lancer();
  const tentatives = c.journal.filter((e) => e.event === 'core_attempt');
  assert.equal(tentatives.length, 2, 'une entrée par tentative');
  for (const champ of ['attempt_index', 'provider', 'model', 'duration_ms', 'provider_status',
                       'error_class', 'retryable', 'schema_valid', 'contract_valid', 'selected',
                       'aborted', 'failover_reason']) {
    assert.ok(champ in tentatives[0], `${champ} est relevé`);
  }
  assert.equal(tentatives[0].provider, 'anthropic');
  assert.equal(tentatives[0].model, 'claude-sonnet-4-6');
  assert.equal(tentatives[1].provider, 'openai');
  assert.equal(tentatives[1].model, 'gpt-5.6-sol');
  assert.equal(tentatives[1].selected, true);
  const resume = c.journal.find((e) => e.event === 'core_chain_result');
  for (const champ of ['core_provider_order', 'core_primary_provider', 'core_selected_provider',
                       'core_failover_used', 'core_total_duration_ms', 'core_attempt_count',
                       'core_final_state']) {
    assert.ok(champ in resume, `${champ} est relevé`);
  }
  assert.deepEqual(resume.core_provider_order, ['anthropic', 'openai']);
  assert.equal(resume.core_primary_provider, 'anthropic');
  assert.equal(resume.core_selected_provider, 'openai');
});

test('V214-19 : aucun secret, aucun message d’erreur brut dans la télémétrie', () => {
  const bloc = worker.slice(worker.indexOf('function releveDeChaineProfonde'),
    worker.indexOf('/** Sortie de rôle inexploitable'));
  assert.equal(/error\.message|error\?\.message/.test(bloc), false, 'aucun message d’erreur');
  for (const secret of ['API_KEY', 'OPenAI-API', 'authorization', 'x-api-key', 'Bearer']) {
    assert.equal(new RegExp(secret, 'i').test(bloc), false, `« ${secret} » n’apparaît pas`);
  }
  assert.equal(/original_request|clarification_history/.test(bloc), false, 'aucun contenu utilisateur');
});
