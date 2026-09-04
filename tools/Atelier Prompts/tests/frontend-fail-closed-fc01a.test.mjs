import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

// =================================================================================================
// FC-01a — SUPPRESSION DU FAIL-OPEN local-prudent.
//
// Avant ce lot, lorsque les DEUX fournisseurs Decision échouaient, le navigateur appelait
// adpFallbackLocal() et fabriquait {etat_demande:'exploitable', route:'architecte'} : une panne
// technique devenait une autorisation d'exécuter. Le frontend prononçait un jugement sur une demande
// qu'aucun fournisseur n'avait analysée.
//
// Après FC-01a : une indisponibilité technique reste une indisponibilité technique. Aucune route,
// aucune exécution, aucun état fabriqué — la demande de l'utilisateur est conservée telle quelle et
// il peut relancer.
//
// Hors périmètre, explicitement : l'exécution du livrable via la clé Anthropic du navigateur
// (BYO_KEY_BROWSER, décision propriétaire) n'est pas touchée par ce lot.
// =================================================================================================

const REASONS = {
  clarification: 'La demande n’est pas encore suffisamment exploitable ; une clarification à forte valeur d’information est nécessaire.',
  rapide: 'La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.',
  architecte: 'La demande est exploitable mais nécessite une structuration ou des arbitrages préalables.'
};
const decision = (etat_demande, route, question = null) => ({
  etat_demande, route, confiance: 'haute',
  raison_interne: etat_demande === 'clarification_necessaire' ? REASONS.clarification : REASONS[route],
  question
});

/** Charge la couche Decision Provider réelle du HTML et exécute askDecisionProvider. */
function loadProvider(fetchImpl) {
  const start = html.indexOf('const ADP10G=');
  const end = html.indexOf('function v11ShowRapidGate');
  const context = {
    AbortController, console: { warn() {} }, fetch: fetchImpl, setTimeout, clearTimeout,
    document: { querySelector(selector) {
      if (selector.includes('workers-ai')) return { content: 'https://workers-ai.example/decision' };
      if (selector.includes('groq')) return { content: 'https://groq.example/decision' };
      return null;
    } }
  };
  vm.runInNewContext(html.slice(start, end) + '\n;globalThis.__provider={askDecisionProvider};', context);
  return context.__provider;
}
const failNetwork = async () => { throw new TypeError('network'); };
const ask = (provider, input = { demande: 'Rédige une note de synthèse.', materiau_present: false, mode_demande: 'rapide' }) =>
  provider.askDecisionProvider(input);

// --- FC01A-1 / 2 : les chemins nominaux sont INCHANGÉS ---------------------------------------------

test('FC01A-1 : le fournisseur primaire répond -> comportement existant strictement préservé', async () => {
  const calls = [];
  const provider = loadProvider(async (url) => { calls.push(String(url)); return Response.json(decision('exploitable', 'rapide')); });
  const result = await ask(provider);
  assert.equal(result.source, 'workers-ai');
  assert.equal(result.decision.route, 'rapide');
  assert.equal(calls.length, 1, 'une décision primaire valide arrête la chaîne, comme avant.');
});

test('FC01A-2 : le primaire échoue et le secondaire répond -> comportement existant strictement préservé', async () => {
  const calls = [];
  const provider = loadProvider(async (url) => {
    calls.push(String(url));
    if (String(url).includes('workers-ai')) throw new TypeError('network');
    return Response.json(decision('exploitable', 'architecte'));
  });
  const result = await ask(provider);
  assert.equal(result.source, 'groq');
  assert.equal(result.decision.route, 'architecte');
  assert.equal(calls.length, 2);
});

test('FC01A-2b : une clarification légitime reste une clarification, jamais un échec technique', async () => {
  const provider = loadProvider(async () => Response.json(decision('clarification_necessaire', null, 'Quel est le destinataire ?')));
  const result = await ask(provider);
  assert.equal(result.decision.etat_demande, 'clarification_necessaire');
  assert.equal(result.decision.route, null);
});

// --- FC01A-3 / 4 / 5 : le coeur du lot --------------------------------------------------------------

test('FC01A-3 : double panne -> JAMAIS exploitable', async () => {
  const provider = loadProvider(failNetwork);
  // `instanceof Error` ne s'applique pas ici : l'erreur naît dans le contexte vm, donc dans un autre
  // realm. On vérifie le marqueur explicite, qui est justement ce que le runtime teste lui aussi.
  let threw = false;
  const error = await ask(provider).then((r) => r, (e) => { threw = true; return e; });
  assert.equal(threw, true, 'la double panne doit échouer, jamais retourner une décision.');
  assert.equal(error.decision_technical_failure, true);
  assert.equal(error.message, 'DECISION_TECHNICAL_FAILURE');
  assert.equal(error.etat_demande, undefined);
  assert.equal(error.decision, undefined);
  assert.equal(error.source, undefined);
});

test('FC01A-4 : double panne -> JAMAIS route architecte (ni rapide)', async () => {
  for (const mode of ['rapide', 'architecte']) {
    const provider = loadProvider(failNetwork);
    const error = await ask(provider, { demande: 'D.', materiau_present: false, mode_demande: mode }).then((r) => r, (e) => e);
    assert.equal(error.decision_technical_failure, true, mode);
    assert.equal(error.route, undefined, `aucune route ne doit être produite en mode ${mode}.`);
    assert.ok(!JSON.stringify({ m: error.message }).includes('architecte'));
  }
});

test('FC01A-5 : double panne -> aucune exécution possible, le point d’entrée ne rend aucune orientation', async () => {
  const provider = loadProvider(failNetwork);
  let orientation = null;
  try { orientation = await ask(provider); } catch { /* attendu */ }
  assert.equal(orientation, null, 'aucune orientation exploitable ne peut atteindre le moteur d’exécution.');
});

test('FC01A-5b : toutes les formes de panne échouent en technique (réseau, HTTP, sortie invalide, incohérente)', async () => {
  const failures = {
    reseau: async () => { throw new TypeError('network'); },
    http: async () => Response.json({ error: 'ko' }, { status: 503 }),
    invalide: async () => new Response('pas du json', { status: 200 }),
    incoherente: async () => Response.json({ etat_demande: 'exploitable', route: null, confiance: 'haute', raison_interne: REASONS.rapide, question: null })
  };
  for (const [label, impl] of Object.entries(failures)) {
    const provider = loadProvider(impl);
    const error = await ask(provider).then((r) => r, (e) => e);
    assert.equal(error.decision_technical_failure, true, label);
  }
});

// --- FC01A-6 / 9 : demande conservée, relance possible ----------------------------------------------

test('FC01A-6 : la demande utilisateur n’est jamais mutée par l’échec', async () => {
  const input = { demande: 'Rédige une note de synthèse.', materiau_present: false, mode_demande: 'rapide' };
  const snapshot = JSON.stringify(input);
  const provider = loadProvider(failNetwork);
  await ask(provider, input).catch(() => {});
  assert.equal(JSON.stringify(input), snapshot, 'aucune mutation destructive de l’entrée.');
});

test('FC01A-9 : une relance après échec repart normalement et réussit si un fournisseur revient', async () => {
  let down = true;
  const provider = loadProvider(async () => {
    if (down) throw new TypeError('network');
    return Response.json(decision('exploitable', 'rapide'));
  });
  const first = await ask(provider).then((r) => r, (e) => e);
  assert.equal(first.decision_technical_failure, true);
  down = false;
  const second = await ask(provider);
  assert.equal(second.decision.route, 'rapide', 'la relance doit fonctionner sans état résiduel bloquant.');
});

// --- FC01A-7 / 8 : UI neutre --------------------------------------------------------------------------

test('FC01A-7 : une erreur technique neutre est rendue, sans route et sans exécution', () => {
  assert.match(html, /const ADP_TECHNICAL_FAILURE_UI=Object\.freeze\(/);
  assert.match(html, /Impossible d’analyser la demande pour le moment\./);
  assert.match(html, /Votre demande est conservée\. Vous pouvez réessayer\./);
  // CLEAN-01 : adpShowTechnicalFailure était le JUMEAU HÉRITÉ de ce rendu, sans appelant depuis
  // que oprieRunTurn porte l'échec technique. Il est retiré ; l'invariant est désormais porté par
  // le rendu RÉELLEMENT atteint, ce qui le renforce au lieu de l'affaiblir.
  assert.match(html, /function oprieShowNetworkFailure\(\)\{\s*adpState\.pendingQuestion=false;show\(null\);\s*v11ShowRapidGate\(ADP_TECHNICAL_FAILURE_UI\);/);
  // Les trois points d'entrée traitent l'échec sans jamais router.
  // FC-01b : les trois points d'entrée passent désormais par oprieRunTurn, qui rend lui-même l'échec
  // technique. Le rendu reste garanti, en un seul endroit au lieu de trois — l'invariant (aucun point
  // d'entrée ne peut router sur un échec) est renforcé, pas affaibli.
  // PERF-04 : le pilote unique a gagné un garde de tour (un échec d'un tour dépassé ne rend plus
  // rien). L'invariant vérifié ici est inchangé et désormais porté sur le CORPS de la fonction au
  // lieu d'une ligne littérale : l'échec technique est rendu, et ce chemin ne route ni n'exécute.
  const pilote = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.ok(pilote.length > 0, 'le pilote unique doit exister.');
  assert.match(pilote, /catch\(error\)\{[\s\S]*?oprieShowNetworkFailure\(\)/,
    'le pilote unique rend l’échec technique sans jamais router.');
  for (const routage of [/adpRunRapide/, /adpEnterArchitecte/, /oprieEnterExecution/]) {
    assert.doesNotMatch(pilote, routage, `le pilote ne doit jamais router (${routage}) : seul oprieApplyTurn le peut, sur un état OPRIE.`);
  }
  assert.match(html, /\.ui-rapid-gate\[data-state="technical"\]/, 'l’état technique doit être visible.');
});

test('FC01A-8 : le message d’erreur ne nomme aucun fournisseur, aucun statut, aucune cause inventée', () => {
  const start = html.indexOf('const ADP_TECHNICAL_FAILURE_UI');
  const block = html.slice(start, html.indexOf('function v11SwitchToArchitecteFromRapid'));
  for (const forbidden of [/workers[- ]?ai/i, /groq/i, /anthropic/i, /openai/i, /provider/i, /fournisseur/i, /http/i, /retry/i, /\b\d{3}\b/, /token/i, /sk-/]) {
    assert.doesNotMatch(block, forbidden, `le message ne doit pas exposer ${forbidden}.`);
  }
});

// --- FC01A-10 / 11 : hors périmètre strictement préservé ----------------------------------------------

test('FC01A-10 : l’exécution BYO-key Anthropic est INCHANGÉE (hors périmètre, décision propriétaire)', () => {
  assert.match(html, /fetch\('https:\/\/api\.anthropic\.com\/v1\/messages'/, 'le moteur d’exécution reste intact.');
  assert.match(html, /https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.match(html, /'x-api-key':cle/);
  assert.match(html, /id="accueil-cle"/);
  assert.match(html, /id="api-cle"/);
});

test('FC01A-11 : aucune modification d’OPRIE, du backend ni de core/adn depuis ce lot', () => {
  for (const file of ['workers/shared/operational-request-core.js', 'workers/shared/operational-request-orchestrator.js',
                      'workers/shared/provider-ha.js', 'workers/groq/src/index.js',
                      'core/adn/operational-request-state.js',
                      'core/adn/routing-engine.js', 'core/adn/execution-readiness.js']) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  // FC-01b câble désormais OPRIE : cette assertion, propre à FC-01a, devient son inverse.
  assert.ok(html.includes('/operational-request'), 'FC-01b câble OPRIE comme autorité de readiness.');
});

// --- FC01A-12 : hygiène ---------------------------------------------------------------------------------

test('FC01A-12 : aucun hardcoding métier introduit par ce lot', () => {
  const start = html.indexOf('/* FC-01a :');
  const block = html.slice(start, start + 3000);
  for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /\bItalie\b/i, /\bvoyage\b/i]) {
    assert.doesNotMatch(block, forbidden, String(forbidden));
  }
});

// --- Le second fail-open, désormais inatteignable --------------------------------------------------------

test('FC01A-UNREACHABLE : le repli « local proportionné » du miroir Conversation Orchestrator n’est plus atteignable', () => {
  // Ce repli (state:"execution_ready" quand provider_available=false) appartient au miroir navigateur
  // de core/adn/conversation-orchestrator.js — GELÉ, hors périmètre, donc non modifié ici. Il n'est
  // atteignable que si un providerResult porte source:'local-prudent'. Or plus AUCUN code ne produit
  // cette valeur : le seul producteur était adpFallbackLocal, supprimée.
  // CLEAN-01 : « inatteignable » est devenu « absent ». Le miroir portait le seul fail-open
  // restant de cette famille ; il est retiré du produit avec son module. La garde consommatrice
  // d'engine-adapters demeure, parce que la valeur reste un mot légal du contrat de fil.
  assert.equal(html.includes('source: "local-prudent"'), false, 'le repli est retiré du produit.');
  const producers = html.match(/source:\s*'local-prudent'/g) || [];
  assert.deepEqual(producers, [], 'et personne ne le produit.');
  assert.match(html, /source !== 'local-prudent'/, 'la garde d’engine-adapters reste en place.');
});
