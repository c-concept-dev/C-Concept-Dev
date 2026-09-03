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
  assert.match(WORKER, /executeFast: \(snapshot, fastEnv\) => runFastInteractionWithHaChain\(snapshot, fastEnv\)/,
    'elle passe par la chaîne HA de PERF-03A, telle quelle.');
  const bloc = WORKER.slice(WORKER.indexOf('export default {'));
  assert.doesNotMatch(bloc, /Promise\.race|hedge/i, 'aucune course, aucun appel dédoublé.');
  assert.match(WORKER, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/,
    'l’ordre de bascule est INCHANGÉ.');
});

test('T-P04-EP10 : /operational-request conserve son contrat à l’octet près', () => {
  assert.match(WORKER, /if \(new URL\(request\.url\)\.pathname === "\/operational-request"\) \{/);
  assert.match(WORKER, /executeRole: \(role, roleInput\) => runRoleWithHaChain\(role, roleInput, env\)/);
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
