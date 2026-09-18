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
import { FAST_INTERACTION_JSON_SCHEMA, FAST_INTERACTION_TRANSPORT_FIELDS } from '../workers/shared/fast-interactive-plane.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const MODULE = fs.readFileSync(path.join(root, 'workers/shared/fast-interaction-endpoint.js'), 'utf8');

const ORIGIN = 'https://atelier.example';
const env = { ALLOWED_ORIGINS: ORIGIN };
const body = (extra = {}) => ({ turn_id: 1, original_request: 'Rédige une note.', clarification_history: [], current_answer: null, canonical_version: 0, ...extra });
const post = (payload, { origin = ORIGIN, method = 'POST', url = `https://w.dev${FAST_INTERACTION_PATHNAME}` } = {}) =>
  new Request(url, { method, headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) });

/* RUNTIME-01 — la sortie de référence porte les TROIS champs que le schéma déclare depuis D2F1.
   Elle décrivait un fournisseur conforme au contrat d'avant ; elle décrit maintenant un
   fournisseur conforme au contrat actuel. Le fait déclaré est celui qu'une question sur la
   situation de la personne appelle — il est écrit ici, jamais déduit du texte. */
const ok = async () => ({ type: 'ASK_CLARIFICATION', text: 'Pour quel public ?', question_focus: 'problem_or_user_context', missing_determinant_id: 'public_vise' });

/* T-P04-EP01 — CE TEST A ÉTÉ RÉÉCRIT PAR RUNTIME-01, ET IL FAUT DIRE POURQUOI.
 *
 * CE QU'IL AFFIRMAIT : `Object.keys(json).sort() === ['text', 'type']` — « la réponse ne peut
 * porter que le type et le texte ».
 *
 * L'INVARIANT QU'IL CROYAIT TENIR ÉTAIT JUSTE : la porte réseau ne doit rien laisser sortir qui
 * puisse se lire comme une permission. CE QU'IL EN AVAIT FAIT NE L'ÉTAIT PLUS : il avait gelé le
 * CONTENU du contrat d'alors — deux champs — au lieu de la RÈGLE — le contrat, et rien que lui.
 * Quand V2.2.1-D2F1 a ajouté `question_focus` au schéma, ce test n'est pas devenu faux tout de
 * suite : il est devenu un verrou sur l'implémentation d'avant, et il aurait fait échouer la
 * correction de son propre défaut.
 *
 * CE QUE LE RUNTIME A MESURÉ. Sur le Worker réellement servi, cinq ASK_CLARIFICATION réelles ont
 * rendu zéro `question_focus`. Le fait était produit et validé, puis perdu à la dernière marche.
 * Le garde méta-question de D2F1, qui échoue FERMÉ sans fait déclaré, ne s'exécutait donc jamais
 * sur le plan rapide. Douze tests verts ici n'avaient rien vu, parce qu'aucun ne suivait la VALEUR
 * jusqu'au corps JSON — celui-ci comptait les clés.
 *
 * CLASSEMENT : HISTORICAL_IMPLEMENTATION_CONTRACT. Il est remplacé par l'invariant réel, qui se
 * formule sans citer un nombre de champs : ce qui sort est exactement le contrat déclaré. La preuve
 * de transport bout en bout, elle, vit dans tests/runtime01-fast-question-focus-transport.test.mjs.
 */
test('T-P04-EP01 : la réponse porte exactement le contrat déclaré — ni un champ de moins, ni un de plus', async () => {
  const res = await handleFastInteractionRequest(post(body()), env, { executeFast: ok });
  assert.equal(res.status, 200);
  const json = await res.json();
  /* L'invariant est énoncé PAR LE SCHÉMA, pas par une liste recopiée ici : le jour où le contrat
     canonique change encore, ce test suit le contrat au lieu de s'y opposer. */
  /* FAST-SPURIOUS-CLARIFICATION-FIX-01 — ce qui sort est le contrat de TRANSPORT : le schéma moins la citation qui fonde la question, qui a servi au garde et porte les mots de la personne. */
  assert.deepEqual(Object.keys(json).sort(), [...FAST_INTERACTION_TRANSPORT_FIELDS].sort(),
    'ce qui sort est le contrat déclaré, et rien qui ressemble à une permission.');
  assert.equal(json.type, 'ASK_CLARIFICATION');
  /* Et la sortie du fournisseur portait bien ce fait : il est arrivé jusqu’ici. */
  assert.equal(json.question_focus, 'problem_or_user_context');
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
  /* BETA-04 : l'appel porte en plus le `log` estampillé au cf-ray. Ce n'est pas une politique de
     fournisseur — l'ordre résolu est inchangé — c'est ce qui rend un refus de schéma rapide
     rattachable à son invocation. Il l'était pour le plan profond, pas pour le plan rapide. */
  assert.match(WORKER, /executeFast: \(snapshot, fastEnv\) => runFastInteractionWithHaChain\(snapshot, fastEnv, \{ order: resolveFastProviderOrder\(fastEnv\), log \}\)/,
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
     outil de mesure d'opérateur, exactement comme celui du plan rapide : l'ORDRE DÉCLARÉ
     des trois rôles reste ce qui s'exécute en production, et les deux lignes suivantes
     le prouvent plutôt que de le supposer.

     DEEP-PROVIDER-ROUTING-FINAL-01 — cet ordre déclaré ne contient plus qu'Anthropic. Le
     câblage vérifié ici est inchangé : c'est toujours resolveRoleProviderOrder(env) qui le
     fournit à la route, et c'est précisément pour cela que le changement de fournisseur n'a
     demandé aucune retouche de cette ligne. */
  /* OBSERVABILITY-COMPLETENESS-01 — LE LITTÉRAL A CHANGÉ, LE CONTRAT NON, À NOUVEAU.
     La route reçoit désormais aussi le `log` estampillé de l'orchestrateur (pour que les
     événements provider_ha_* portent l'invocation_id) et un résolveur de modèle. Ce que
     CETTE ligne protégeait — l'ordre vient de resolveRoleProviderOrder(env), jamais d'un
     littéral en dur — est vérifié exactement comme avant, et les trois assertions
     suivantes le prouvent indépendamment du câblage d'observabilité. */
  /* V2.1.4 — l'ordre est désormais résolu PAR RÔLE : le plan Core a le sien, le trio historique garde
     le sien. Le contrat de la route, lui, est inchangé — ce qui est asservi ici est le câblage, et il
     passe toujours par la même chaîne HA et le même orchestrateur. */
  assert.match(WORKER, /executeRole: \(role, roleInput, options\) => runRoleWithHaChain\(role, roleInput, env, \{\s*order: resolveProviderOrderForRole\(role, env\),/);
  assert.match(WORKER, /resolveModel: \(provider\) => resolveRoleProviderModel\(provider, env\)/,
    'le modèle réellement utilisé est rendu observable, sans être choisi ici.');
  assert.deepEqual(resolveRoleProviderOrder({}), ["anthropic"],
    'sans variable, l\'ordre des rôles est exactement celui de production.');
  assert.deepEqual(resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: "ha" }), ["anthropic"],
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
