/* PERF-04 — LA PORTE RÉSEAU DU PLAN RAPIDE.
 * ============================================================================
 *
 * PERF-03A avait construit le plan rapide et l'avait laissé injoignable. Cette
 * suite éprouve la seule chose que la route ajoute : elle rend le plan rapide
 * atteignable SANS lui donner la moindre autorité, et sans ouvrir un second
 * chemin vers l'orchestration.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAST_INTERACTION_PATHNAME, handleFastInteractionRequest, snapshotFromBody } from '../workers/shared/fast-interaction-endpoint.js';
import { resolveFastProviderOrder, resolveRoleProviderOrder } from '../workers/groq/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const MODULE = fs.readFileSync(path.join(root, 'workers/shared/fast-interaction-endpoint.js'), 'utf8');

const ORIGIN = 'https://atelier.example';
const env = { ALLOWED_ORIGINS: ORIGIN };
const body = (extra = {}) => ({ turn_id: 1, original_request: 'Rédige une note.', clarification_history: [], current_answer: null, canonical_version: 0, ...extra });
const post = (payload, { origin = ORIGIN, method = 'POST', url = `https://w.dev${FAST_INTERACTION_PATHNAME}` } = {}) =>
  new Request(url, { method, headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) });

const ok = async () => ({ type: 'ASK_CLARIFICATION', text: 'Pour quel public ?' });

test('T-P04-EP01 : un instantané valide produit une interaction à DEUX champs, et rien d’autre', async () => {
  const res = await handleFastInteractionRequest(post(body()), env, { executeFast: ok });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(Object.keys(json).sort(), ['text', 'type'],
    'la réponse ne peut porter que le type et le texte : rien qui ressemble à une permission.');
  assert.equal(json.type, 'ASK_CLARIFICATION');
});

test('T-P04-EP02 : les champs d’audit du noyau ne sont JAMAIS exposés au client', async () => {
  const res = await handleFastInteractionRequest(post(body()), env, { executeFast: ok });
  const json = await res.json();
  for (const interne of ['authority', 'can_execute', 'can_route', 'can_mark_ready', 'interaction_id', 'turn_id', 'source', 'canonical_version']) {
    assert.equal(interne in json, false, `${interne} reste interne : l’exposer inviterait un client à le lire comme un droit.`);
  }
});

test('T-P04-EP03 : une sortie fournisseur non conforme est REFUSÉE, jamais réparée', async () => {
  for (const mauvais of [null, {}, { type: 'ASK_CLARIFICATION' }, { text: 'x' }, { type: 'INCONNU', text: 'x' },
                          { type: 'ACKNOWLEDGE', text: '  ' }, { type: 'ACKNOWLEDGE', text: 'x', state: 'operational_request_ready' }]) {
    const res = await handleFastInteractionRequest(post(body()), env, { executeFast: async () => mauvais });
    assert.equal(res.status, 502, `${JSON.stringify(mauvais)} doit être refusé.`);
    const json = await res.json();
    assert.ok(['FAST_SCHEMA_ERROR', 'FAST_OUTPUT_INVALID'].includes(json.error), 'la cause est nommée sans être inventée.');
  }
});

test('T-P04-EP04 : un instantané invalide est refusé en 400, sans valeur par défaut fabriquée', async () => {
  for (const mauvais of [{ turn_id: -1 }, { turn_id: 1.5 }, { turn_id: 'x' }, { original_request: '' }, { canonical_version: -2 }]) {
    const res = await handleFastInteractionRequest(post(body(mauvais)), env, { executeFast: ok });
    assert.equal(res.status, 400, `${JSON.stringify(mauvais)} doit être refusé.`);
    assert.equal((await res.json()).error, 'invalid_turn_snapshot');
  }
  assert.throws(() => snapshotFromBody(null), /objet JSON/);
  assert.throws(() => snapshotFromBody([]), /objet JSON/);
});

test('T-P04-EP05 : la route applique la même discipline de transport que /operational-request', async () => {
  assert.equal((await handleFastInteractionRequest(post(body(), { method: 'GET' }), env, { executeFast: ok })).status, 405);
  assert.equal((await handleFastInteractionRequest(post(body(), { origin: null }), env, { executeFast: ok })).status, 403);
  assert.equal((await handleFastInteractionRequest(post(body(), { origin: 'https://autre.example' }), env, { executeFast: ok })).status, 403);
  assert.equal((await handleFastInteractionRequest(post(body(), { url: 'https://w.dev/autre' }), env, { executeFast: ok })).status, 404);
  assert.equal((await handleFastInteractionRequest(post(body(), { method: 'OPTIONS' }), env, { executeFast: ok })).status, 204);
});

test('T-P04-EP06 : sans plan rapide configuré, la route refuse — elle n’improvise pas', async () => {
  const res = await handleFastInteractionRequest(post(body()), env, {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'fast_interaction_unavailable');
});

test('T-P04-EP07 : une panne fournisseur ne fuit aucun détail interne', async () => {
  const res = await handleFastInteractionRequest(post(body()), env, {
    executeFast: async () => { throw new Error('GROQ 429 sk-secret Retry-After 12'); }
  });
  assert.equal(res.status, 502);
  const texte = JSON.stringify(await res.json());
  for (const interdit of [/groq/i, /anthropic/i, /openai/i, /sk-/, /429/, /retry/i]) {
    assert.doesNotMatch(texte, interdit, `la réponse ne doit pas exposer ${interdit}.`);
  }
});

test('T-P04-EP08 : la route n’orchestre AUCUN rôle et ne double pas /operational-request', () => {
  /* Le scan porte sur le CODE, commentaires retirés : une prose qui explique ce que le module ne
     fait pas ne doit pas être confondue avec le fait de le faire. */
  const code = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/runOperationalRequestTurn/, /executeRole/, /OPERATIONAL_REQUEST_ROLE_SEQUENCE/,
                          /OPRIE_ROLES/, /runRoleWithHaChain/, /operational-request-orchestrator/,
                          /"\/operational-request"/, /handleOperationalRequest/]) {
    assert.doesNotMatch(code, interdit, `la porte du plan rapide ne doit rien savoir de ${interdit}.`);
  }
  /* Les seuls imports autorisés : le transport partagé, et le noyau du plan rapide. */
  const imports = [...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./decision-core.js', './fast-interactive-plane.js'],
    'aucune dépendance vers l’orchestration ne peut entrer ici.');
  assert.match(code, /validateFastInteraction/, 'elle revalide la sortie contre le schéma non-autoritaire.');
});

test('T-P04-EP09 : le worker branche la route sur la chaîne HA EXISTANTE, sans nouvelle politique', () => {
  assert.match(WORKER, /pathname === FAST_INTERACTION_PATHNAME/, 'la route est branchée.');
  /* PERF-NOMINAL-PROVIDER-01 — LE LITTÉRAL A CHANGÉ, LE CONTRAT NON. La route
     reçoit désormais son ORDRE par resolveFastProviderOrder(env), qui rend la
     chaîne de production tant que FAST_BENCH_PROVIDER vaut "ha" — sa valeur
     déclarée. L'épinglage est un outil de mesure d'opérateur, pas une politique
     de bascule : la chaîne HA de PERF-03A reste celle qui s'exécute en
     production, et la ligne suivante le prouve plutôt que de le supposer. */
  assert.match(WORKER, /executeFast: \(snapshot, fastEnv\) => runFastInteractionWithHaChain\(snapshot, fastEnv, \{ order: resolveFastProviderOrder\(fastEnv\) \}\)/,
    'elle passe par la chaîne HA de PERF-03A, dont l\'ordre reste le défaut.');
  /* FAST-CAPACITY-ADMISSION-01 — LE DÉFAUT DU PLAN RAPIDE EST GROQ SEUL. Les deux
     autres fournisseurs échouent le contrat interactif au repos (4 234 et 5 562 ms
     de p95 mesurés) : basculer vers eux produisait une candidate hors contrat, plus
     lentement que de n'en produire aucune. L'ordre de PRODUCTION des rôles et de
     /decision, lui, est inchangé — la ligne suivante le garde. */
  assert.deepEqual(resolveFastProviderOrder({}), ["groq"],
    'sans variable, le plan rapide n’interroge que Groq.');
  assert.deepEqual(resolveFastProviderOrder({ FAST_BENCH_PROVIDER: "ha" }), ["groq"],
    'et "ha" — la valeur déclarée du Worker — rend le même.');
  const bloc = WORKER.slice(WORKER.indexOf('export default {'));
  assert.doesNotMatch(bloc, /Promise\.race|hedge/i, 'aucune course, aucun appel dédoublé.');
  assert.match(WORKER, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/,
    'l’ordre de bascule est INCHANGÉ.');
});

test('T-P04-EP10 : /operational-request conserve son contrat à l’octet près', () => {
  assert.match(WORKER, /if \(new URL\(request\.url\)\.pathname === "\/operational-request"\) \{/);
  /* OPRIE-QUALITY-PARITY-01 — LE LITTÉRAL A CHANGÉ, LE CONTRAT NON. La route reçoit
     désormais son ORDRE par resolveRoleProviderOrder(env), qui rend ROLE_PROVIDER_ORDER
     tant que DEEP_BENCH_PROVIDER vaut "ha" — sa valeur déclarée. L'épinglage est un
     outil de mesure d'opérateur, exactement comme celui du plan rapide : la chaîne HA
     des trois rôles reste ce qui s'exécute en production, et les deux lignes suivantes
     le prouvent plutôt que de le supposer. */
  assert.match(WORKER, /executeRole: \(role, roleInput\) => runRoleWithHaChain\(role, roleInput, env, \{ order: resolveRoleProviderOrder\(env\) \}\)/);
  assert.deepEqual(resolveRoleProviderOrder({}), ["groq", "anthropic", "openai"],
    'sans variable, l\'ordre des rôles est exactement celui de production.');
  assert.deepEqual(resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: "ha" }), ["groq", "anthropic", "openai"],
    'et "ha" — la valeur déclarée du Worker — rend le même.');
  const avantFast = WORKER.indexOf('FAST_INTERACTION_PATHNAME');
  const avantOprie = WORKER.indexOf('"/operational-request"');
  assert.ok(avantFast > 0 && avantOprie > 0, 'les deux routes coexistent.');
});

test('T-P04-EP11 : la route respecte le contrôle de débit et les sorties structurées existants', () => {
  const source = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  const adapters = source.slice(source.indexOf('export const FAST_INTERACTION_ADAPTERS'), source.indexOf('export async function runFastInteractionWithHaChain'));
  assert.match(adapters, /pacer: createGroqRateLimitPacer\(\)/, 'le contrôle de débit M-03 est traversé, pas contourné.');
  assert.match(adapters, /schema: FAST_INTERACTION_JSON_SCHEMA/, 'les sorties structurées M-01 sont exigées.');
  for (const p of ['callGroqChatCompletion', 'callAnthropicMessages', 'callOpenAiChatCompletion']) {
    assert.ok(adapters.includes(p), `${p} : aucun transport nouveau n’est introduit.`);
  }
});

test('T-P04-EP12 : la limite de transport est celle d’une entrée d’Analyste, jamais illimitée', async () => {
  assert.match(MODULE, /TRANSPORT_LIMITS\.analyst/, 'une limite de route explicite est appliquée.');
  const enorme = body({ original_request: 'x'.repeat(20000) });
  const res = await handleFastInteractionRequest(post(enorme), env, { executeFast: ok });
  assert.ok(res.status >= 400, `un corps hors limite est refusé (statut ${res.status}).`);
});
