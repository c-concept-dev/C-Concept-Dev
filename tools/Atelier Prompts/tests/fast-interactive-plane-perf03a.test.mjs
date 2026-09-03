/* PERF-03A — PLAN INTERACTIF RAPIDE ET PLAN DE VALIDATION PROFONDE
 * ============================================================================
 *
 * Le problème n'était pas la lenteur d'un appel : c'était une CAUSALITÉ. Rien
 * ne pouvait s'afficher avant qu'Analyst, Critic et Arbiter aient tous terminé
 * — alors que l'essentiel de ce travail ne sert pas à décider quoi montrer à
 * l'instant même. M-02 et M-03 avaient réduit le coût interne sans toucher à
 * cette dépendance. Ces tests vérifient qu'elle est coupée, et qu'elle l'est
 * SANS déplacer la moindre autorité.
 *
 * CE QUI REND LA SÉPARATION SÛRE, ET QUE CES TESTS PROTÈGENT :
 *
 *   Le plan rapide ne peut pas dépasser son rôle, non par convention mais par
 *   construction : son schéma n'a que deux champs. Un fournisseur qui
 *   renverrait `operational_request_ready` échoue à la validation faute de
 *   place où le mettre. On ne se repose pas sur la discipline d'un modèle ; on
 *   lui retire la possibilité.
 *
 *   Deux plans à vitesses différentes finissent dans le désordre. Un résultat
 *   profond du tour 10 peut arriver après le tour 11 : sans garde, il
 *   écraserait une question à laquelle la personne répond déjà. D'où le tour
 *   immuable, l'identifiant monotone, et le rejet explicite du périmé.
 *
 *   Le mode Rapide ne converse pas — invariant R1, antérieur à ce lot. Une
 *   clarification y devient une orientation : on dit où poursuivre, on n'ouvre
 *   pas un échange que ce mode ne sait pas tenir.
 *
 * CE QUE CE LOT NE PRÉTEND PAS : que le contrat interactif est atteint. Le
 * critère est causal — l'affichage ne dépend plus du plan profond — et non
 * chronométrique. Aucune mesure réelle n'est revendiquée ici.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONVERSATIONAL_MODES,
  FAST_FORBIDDEN_AUTHORITY_FIELDS,
  FAST_INTERACTION_JSON_SCHEMA,
  FAST_INTERACTION_TYPES,
  ONE_NEXT_INTERACTION_MAX,
  RECONCILIATION_OUTCOMES,
  createTurnCoordinator,
  createTurnSnapshot,
  projectInteractionForMode,
  reconcileFastWithDeep,
  runInteractiveTurn,
  validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import {
  DECISION_PROVIDER_ORDER,
  FAST_INTERACTION_ADAPTERS,
  FAST_INTERACTION_SYSTEM_PROMPT,
  runFastInteractionWithHaChain
} from '../workers/groq/src/index.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';
import { resolveProviderConcurrency } from '../workers/shared/provider-rate-control.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAST_SRC = fs.readFileSync(path.join(root, 'workers/shared/fast-interactive-plane.js'), 'utf8');
const ADAPTERS_SRC = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const ORCH_SRC = fs.readFileSync(path.join(root, 'workers/shared/operational-request-orchestrator.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const snapshot = (over = {}) => createTurnSnapshot({ turn_id: 1, original_request: 'Prépare un plan de lancement.', ...over });
const fastOk = (type = 'ASK_CLARIFICATION', texte = 'Quel est le public visé ?') => ({ type, text: texte });
const deepTurn = (state = 'clarification_required', turn_id = 1) => ({ state, turn_id });

/** Exécute un tour complet avec des minuteries déterministes. */
async function tour({ fastMs = 50, deepMs = 500, fast = fastOk(), deep = deepTurn(), mode = 'architecte', coordinator, snap = snapshot() } = {}) {
  const jalons = {};
  const t0 = Date.now();
  const resultat = await runInteractiveTurn({
    snapshot: snap, mode, coordinator,
    executeFast: async () => { await attendre(fastMs); jalons.fastEnd = Date.now() - t0; return typeof fast === 'function' ? fast() : fast; },
    executeDeep: async () => { await attendre(deepMs); jalons.deepEnd = Date.now() - t0; return typeof deep === 'function' ? deep() : deep; },
    onFastInteraction: () => { jalons.render = Date.now() - t0; }
  });
  return { resultat, jalons, total: Date.now() - t0 };
}

/* ======================================================================== *
 * §64 — DEUX PLANS RÉELLEMENT DISTINCTS
 * ======================================================================== */

test('T-P03A-01 le plan rapide et le plan profond sont deux chemins distincts', async () => {
  const { resultat } = await tour({ fastMs: 5, deepMs: 20 });
  assert.ok(resultat.fast_interaction, 'le plan rapide produit une interaction');
  assert.ok(resultat.deep_turn, 'le plan profond produit un tour');
  assert.equal(resultat.fast_interaction.source, 'fast_plane');
  assert.equal(resultat.fast_interaction.authority, 'candidate');
  assert.equal(resultat.deep_turn.state, 'clarification_required');
});

test('T-P03A-02 le plan rapide peut terminer bien avant le plan profond', async () => {
  const { jalons, total } = await tour({ fastMs: 20, deepMs: 300 });
  assert.ok(jalons.render < jalons.deepEnd, `interaction à ${jalons.render} ms, profond à ${jalons.deepEnd} ms`);
  assert.ok(jalons.render < total / 2, 'l’affichage n’attend pas la moitié du tour');
});

test('T-P03A-03 le plan profond s’exécute toujours, même quand le rapide réussit', async () => {
  const { resultat } = await tour({ fastMs: 5, deepMs: 30 });
  assert.equal(resultat.deep_executed, true, 'DEEP_VALIDATION_SKIPPED_ON_FAST_SUCCESS = NO');
  assert.ok(resultat.deep_turn);
  const code = sansCommentaires(FAST_SRC);
  /* Le plan profond est lancé AVANT que le rapide soit attendu : il ne peut pas
     être conditionné à son résultat. */
  const iDeep = code.indexOf('executeDeep(snapshot)');
  const iFast = code.indexOf('await executeFast(snapshot)');
  assert.ok(iDeep > -1 && iFast > iDeep, 'le profond démarre en premier, sans attendre le rapide');
});

test('T-P03A-04 le plan rapide n’écrit aucun état OPRIE', () => {
  const code = sansCommentaires(FAST_SRC);
  /* Deux états OPRIE apparaissent dans le noyau rapide, et deux seulement : ce
     sont les CLÉS de la table de correspondance qui sert à la réconciliation —
     « quel type d'interaction correspondrait à cet état ». C'est une lecture,
     déclarée et gelée. L'assertion vise donc les écritures réelles, hors de
     cette table, et vérifie séparément qu'elle reste en lecture seule. */
  const table = code.slice(code.indexOf('OPRIE_STATE_TO_INTERACTION'), code.indexOf('export function reconcileFastWithDeep'));
  const horsTable = code.replace(table, ' ');
  for (const champ of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked', 'degraded_state']) {
    assert.equal(new RegExp(`${champ}\\s*[:=][^=]`).test(horsTable), false, `FAST_OPRIE_WRITES = 0 : ${champ}`);
  }
  assert.ok(table.includes('Object.freeze('), 'la table de correspondance est gelée');
  assert.equal(/OPRIE_STATE_TO_INTERACTION\s*\[[^\]]*\]\s*=/.test(code), false, 'et jamais écrite');
  /* Aucun état OPRIE n'est produit : la table n'est lue que pour comparer. */
  assert.equal(/(state|authoritative_state)\s*=\s*["']/.test(code), false, 'aucun état littéral assigné');
});

test('T-P03A-05 le plan rapide ne peut pas déclarer une demande prête', () => {
  assert.equal(FAST_INTERACTION_TYPES.includes('READY'), false);
  assert.equal(FAST_INTERACTION_TYPES.includes('EXECUTE'), false);
  const verdict = validateFastInteraction({ type: 'ASK_CLARIFICATION', text: 'q', operational_request_ready: true }, snapshot());
  assert.equal(verdict.ok, false, 'FAST_READY_WRITES = 0');
  assert.equal(verdict.reason, 'FAST_SCHEMA_ERROR');
});

test('T-P03A-06 le plan rapide ne peut pas router', () => {
  const verdict = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'ok', route: 'rapide' }, snapshot());
  assert.equal(verdict.ok, false, 'FAST_ROUTE_WRITES = 0');
  const interaction = validateFastInteraction(fastOk(), snapshot()).interaction;
  assert.equal(interaction.can_route, false);
});

test('T-P03A-07 le plan rapide ne peut pas toucher degraded_state', () => {
  const verdict = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'ok', degraded_state: false }, snapshot());
  assert.equal(verdict.ok, false, 'FAST_DEGRADED_STATE_WRITES = 0');
});

test('T-P03A-08 le plan rapide ne peut pas exécuter, ni appeler l’exécution finale', () => {
  const interaction = validateFastInteraction(fastOk(), snapshot()).interaction;
  assert.equal(interaction.can_execute, false);
  assert.equal(interaction.can_mark_ready, false);
  const code = sansCommentaires(FAST_SRC);
  for (const interdit of ['fetch(', 'appelFournisseur', 'execute(', 'appelApi']) {
    assert.equal(code.includes(interdit), false, `FAST_FINAL_EXECUTION_CALLS = 0 : ${interdit}`);
  }
});

test('T-P03A-09 la sortie rapide est structurée et validée selon M-01', () => {
  assert.equal(FAST_INTERACTION_JSON_SCHEMA.additionalProperties, false, 'schéma strict');
  assert.deepEqual([...FAST_INTERACTION_JSON_SCHEMA.required].sort(), ['text', 'type']);
  assert.deepEqual(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).sort(), ['text', 'type']);
  /* Les trois adaptateurs passent le schéma nativement, avec le durcissement M-01. */
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.equal((code.match(/schemaName: "fast_interaction"/g) || []).length, 3);
});

test('T-P03A-10 la forme rendue au consommateur est indépendante du fournisseur', () => {
  const interaction = validateFastInteraction(fastOk(), snapshot()).interaction;
  assert.deepEqual(Object.keys(interaction).sort(),
    ['authority', 'can_execute', 'can_mark_ready', 'can_route', 'canonical_version', 'interaction_id', 'source', 'text', 'turn_id', 'type']);
  assert.equal(/groq|anthropic|openai/i.test(JSON.stringify(interaction)), false, 'aucun nom de fournisseur ne fuit');
});

/* ======================================================================== *
 * §65–§66 — LE TOUR, ET CE QUI EMPÊCHE LE PASSÉ D'ÉCRASER LE PRÉSENT
 * ======================================================================== */

test('T-P03A-11 les deux plans consomment le même instantané', async () => {
  const snap = snapshot();
  const vus = [];
  await runInteractiveTurn({
    snapshot: snap, mode: 'architecte',
    executeFast: async (s) => { vus.push(s); return fastOk(); },
    executeDeep: async (s) => { vus.push(s); return deepTurn(); }
  });
  assert.equal(vus.length, 2);
  assert.equal(vus[0], vus[1], 'FAST_AND_DEEP_SHARE_TURN_SNAPSHOT = YES — le même objet, pas une copie');
});

test('T-P03A-12 l’instantané est immuable', () => {
  const snap = snapshot({ clarification_history: [{ question: 'q', answer: 'a' }] });
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(Object.isFrozen(snap.clarification_history), true);
  assert.equal(Object.isFrozen(snap.clarification_history[0]), true);
  assert.throws(() => { 'use strict'; snap.original_request = 'autre'; });
});

test('T-P03A-13 l’identifiant de tour est monotone, jamais un horodatage', () => {
  const c = createTurnCoordinator();
  assert.equal(c.openTurn(0), 0);
  assert.equal(c.openTurn(1), 1);
  assert.throws(() => c.openTurn(1), /non monotone/);
  assert.throws(() => c.openTurn(0), /non monotone/);
  assert.throws(() => createTurnSnapshot({ turn_id: Date.now() / 1000.5, original_request: 'x' }), /entier monotone/);
  assert.throws(() => createTurnSnapshot({ turn_id: -1, original_request: 'x' }), /entier monotone/);
});

test('T-P03A-14 la version canonique est portée par le tour et conservée', () => {
  const snap = snapshot({ canonical_version: 7 });
  const interaction = validateFastInteraction(fastOk(), snap).interaction;
  assert.equal(interaction.canonical_version, 7);
  assert.equal(interaction.turn_id, snap.turn_id);
});

test('T-P03A-15 un résultat rapide périmé est écarté, jamais appliqué', async () => {
  const c = createTurnCoordinator();
  c.openTurn(10);
  c.openTurn(11);
  const affiches = [];
  const { resultat } = await tour({
    coordinator: c, snap: snapshot({ turn_id: 10 }), fastMs: 2, deepMs: 5,
    deep: deepTurn('clarification_required', 11)
  });
  assert.equal(resultat.fast_interaction, null, 'STALE_FAST_RESULT_CAN_OVERWRITE_NEWER_TURN = NO');
  assert.equal(c.discardedCount >= 1, true);
  assert.deepEqual(affiches, []);
});

test('T-P03A-16 un résultat profond périmé ne peut pas écraser un tour plus récent', () => {
  const c = createTurnCoordinator();
  c.openTurn(10);
  c.openTurn(11);
  const fast = validateFastInteraction(fastOk(), snapshot({ turn_id: 11 })).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('operational_request_ready', 10), { coordinator: c });
  assert.equal(r.outcome, 'TURN_STALE', 'STALE_DEEP_RESULT_CAN_OVERWRITE_NEWER_TURN = NO');
  assert.equal(r.superseded, false);
  assert.equal(r.display, fast, 'la question en cours reste affichée');
});

test('T-P03A-17 une complétion dans le désordre reste sûre', async () => {
  /* Tour A profond lent (100 ms), tour B rapide (10 ms) : A finit après B. */
  const c = createTurnCoordinator();
  c.openTurn(1);
  const aPromise = tour({ coordinator: c, snap: snapshot({ turn_id: 1 }), fastMs: 2, deepMs: 100, deep: deepTurn('clarification_required', 1) });
  await attendre(15);
  c.openTurn(2);
  const b = await tour({ coordinator: c, snap: snapshot({ turn_id: 2 }), fastMs: 2, deepMs: 20, deep: deepTurn('operational_request_ready', 2) });
  const a = await aPromise;
  assert.equal(b.resultat.fast_interaction.turn_id, 2, 'le tour B a bien produit son interaction');
  assert.equal(a.resultat.reconciliation.outcome, 'TURN_STALE', 'OUT_OF_ORDER_COMPLETION_SAFE = YES');
  assert.equal(c.currentTurnId, 2, 'le coordinateur n’a jamais reculé');
});

/* ======================================================================== *
 * §67 — UNE SEULE INTERACTION, JAMAIS UN QUESTIONNAIRE
 * ======================================================================== */

test('T-P03A-18 au plus une interaction candidate par tour', async () => {
  const { resultat } = await tour({ fastMs: 2, deepMs: 5 });
  assert.equal(ONE_NEXT_INTERACTION_MAX, 1);
  assert.equal(Array.isArray(resultat.fast_interaction), false, 'une interaction, pas une liste');
  assert.equal(typeof resultat.fast_interaction.text, 'string');
});

test('T-P03A-19 un questionnaire est structurellement impossible', () => {
  const verdict = validateFastInteraction({ type: 'ASK_CLARIFICATION', text: ['q1', 'q2'] }, snapshot());
  assert.equal(verdict.ok, false, 'un texte non scalaire est refusé');
  assert.equal(validateFastInteraction({ type: 'ASK_CLARIFICATION', text: 'q', questions: ['a', 'b'] }, snapshot()).ok, false);
});

test('T-P03A-20 aucun nombre de questions fixé, ni minimum ni maximum', () => {
  const code = sansCommentaires(FAST_SRC) + sansCommentaires(ADAPTERS_SRC);
  for (const interdit of ['minQuestions', 'maxQuestions', 'targetQuestionCount', 'questionBudget']) {
    assert.equal(code.includes(interdit), false, interdit);
  }
});

test('T-P03A-21 une inconnue n’appelle pas automatiquement une question', () => {
  /* La consigne du plan rapide reprend la discipline du programme : demander
     reste le dernier recours, jamais le premier. */
  const consigne = FAST_INTERACTION_SYSTEM_PROMPT;
  for (const voie of ['recherchée', 'décidée', 'estimée', 'scénario', 'conditionnée', 'inconnue']) {
    assert.ok(consigne.includes(voie), `voie alternative absente de la consigne : ${voie}`);
  }
  assert.ok(consigne.includes('dernier recours'));
  assert.ok(FAST_INTERACTION_TYPES.includes('WAIT_FOR_DEEP_VALIDATION'), 'ne rien demander est un choix disponible');
});

/* ======================================================================== *
 * §68–§69 — LES DEUX MODES
 * ======================================================================== */

test('T-P03A-22 le mode Rapide n’acquiert aucune boucle de dialogue', async () => {
  const { resultat } = await tour({ mode: 'rapide', fast: fastOk('ASK_CLARIFICATION', 'Quel public ?'), fastMs: 2, deepMs: 5 });
  assert.equal(resultat.fast_interaction.type, 'ORIENT_ARCHITECTE',
    'RAPIDE_DIALOG_LOOP_INTRODUCED = NO — une clarification y devient une orientation');
  assert.equal(resultat.fast_interaction.projected_from, 'ASK_CLARIFICATION');
  assert.deepEqual([...CONVERSATIONAL_MODES], ['architecte']);
});

test('T-P03A-23 une confirmation aussi devient une orientation en Rapide', () => {
  const interaction = validateFastInteraction(fastOk('ASK_CONFIRMATION', 'Confirmez-vous ?'), snapshot()).interaction;
  assert.equal(projectInteractionForMode(interaction, 'rapide').type, 'ORIENT_ARCHITECTE');
  assert.equal(projectInteractionForMode(interaction, 'architecte').type, 'ASK_CONFIRMATION');
});

test('T-P03A-24 un accusé de réception reste tel quel dans les deux modes', () => {
  const interaction = validateFastInteraction(fastOk('ACKNOWLEDGE', 'Demande reçue.'), snapshot()).interaction;
  assert.equal(projectInteractionForMode(interaction, 'rapide').type, 'ACKNOWLEDGE');
  assert.equal(projectInteractionForMode(interaction, 'architecte').type, 'ACKNOWLEDGE');
});

test('T-P03A-25 aucune exécution ne peut reposer sur le seul plan rapide', () => {
  const interaction = validateFastInteraction(fastOk(), snapshot()).interaction;
  assert.equal(interaction.can_execute, false);
  assert.equal(interaction.can_mark_ready, false);
  assert.equal(interaction.authority, 'candidate');
  /* Et la chaîne d'exécution reste gouvernée par les autorités existantes. */
  assert.equal(FAST_SRC.includes('validatePromptAgainstCanonicalContract'), false);
  assert.equal(FAST_SRC.includes('validateOutputAgainstCanonicalContract'), false);
});

test('T-P03A-26 Architecte peut afficher l’interaction rapide, et une seule', async () => {
  const { resultat } = await tour({ mode: 'architecte', fastMs: 2, deepMs: 5 });
  assert.equal(resultat.fast_interaction.type, 'ASK_CLARIFICATION', 'ARCHITECTE_FAST_QUESTION_SUPPORTED = YES');
  assert.equal(resultat.reconciliation.outcome, 'DEEP_CONFIRMS_FAST');
  assert.equal(resultat.reconciliation.display, resultat.fast_interaction, 'une seule question reste affichée');
});

/* ======================================================================== *
 * §70 — LES AUTORITÉS N'ONT PAS BOUGÉ
 * ======================================================================== */

test('T-P03A-27 OPRIE demeure la seule autorité sémantique', () => {
  const code = sansCommentaires(FAST_SRC);
  /* Le plan rapide LIT l'état OPRIE pour se réconcilier ; il n'en écrit aucun. */
  assert.ok(code.includes('deepTurn.state'), 'il lit l’état pour se réconcilier');
  assert.equal(/deepTurn\.state\s*=/.test(code), false, 'il ne l’écrit jamais');
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(Object.keys(FAST_INTERACTION_JSON_SCHEMA.properties).includes(champ), false, champ);
  }
});

test('T-P03A-28 la readiness et le routage restent inchangés', () => {
  const code = sansCommentaires(FAST_SRC);
  assert.equal(/\b(readiness|execution_ready)\s*[:=][^=]/.test(code), false, 'FAST_READINESS_WRITES = 0');
  assert.equal(/\broute\s*[:=][^=]/.test(code), false, 'FAST_ROUTE_WRITES = 0');
});

test('T-P03A-29 aucun des deux gates n’est touché', () => {
  for (const gate of ['prompt-contract-gate', 'output-compliance-gate', 'validatePromptAgainstCanonicalContract', 'validateOutputAgainstCanonicalContract']) {
    assert.equal(FAST_SRC.includes(gate), false, `FAST_QG_MUTATIONS = 0 : ${gate}`);
  }
});

test('T-P03A-30 un état rapide ne devient jamais un état persistant', async () => {
  const { resultat } = await tour({ fastMs: 2, deepMs: 5, deep: deepTurn('operational_request_ready') });
  assert.equal(resultat.reconciliation.authoritative_state, 'operational_request_ready');
  assert.equal(resultat.reconciliation.display, null, 'l’interaction candidate cesse d’être affichée');
  assert.equal(resultat.fast_interaction.authority, 'candidate', 'et n’a jamais changé de statut');
});

/* ======================================================================== *
 * §71 — FAIL-CLOSED : ON N'INVENTE PAS D'INTERACTION
 * ======================================================================== */

test('T-P03A-31 une panne du plan rapide ne fabrique aucune interaction', async () => {
  const { resultat } = await tour({ fast: () => { throw new Error('provider indisponible'); }, fastMs: 1, deepMs: 10 });
  assert.equal(resultat.fast_interaction, null, 'aucune question inventée');
  assert.equal(resultat.fast_failure.reason, 'FAST_PROVIDER_ERROR');
  assert.equal(resultat.deep_executed, true, 'le plan profond continue');
});

test('T-P03A-32 une sortie rapide non conforme ne fabrique aucune interaction', async () => {
  for (const mauvaise of [{}, { type: 'INCONNU', text: 'x' }, { type: 'ACKNOWLEDGE' }, { type: 'ACKNOWLEDGE', text: '   ' }, 'texte libre', null]) {
    const { resultat } = await tour({ fast: mauvaise, fastMs: 1, deepMs: 5 });
    assert.equal(resultat.fast_interaction, null, JSON.stringify(mauvaise));
    assert.ok(['FAST_SCHEMA_ERROR', 'FAST_OUTPUT_INVALID'].includes(resultat.fast_failure.reason));
    assert.equal(resultat.deep_executed, true);
  }
});

test('T-P03A-33 aucun repli sémantique local ne produit un faux succès', () => {
  const code = sansCommentaires(FAST_SRC);
  for (const interdit of ['fallbackQuestion', 'defaultInteraction', 'genericQuestion', 'placeholder']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, interdit);
  }
  /* Un échec ne renvoie jamais une interaction : il renvoie null et une raison. */
  assert.ok(code.includes('fastFailure = {'));
  assert.equal(/fastInteraction\s*=\s*\{/.test(code), false, 'aucune interaction construite à la main');
});

/* ======================================================================== *
 * §72 — RÉCONCILIATION : OPRIE GAGNE, TOUJOURS
 * ======================================================================== */

test('T-P03A-34 quand OPRIE confirme, l’interaction rapide reste valable', () => {
  const fast = validateFastInteraction(fastOk('ASK_CLARIFICATION'), snapshot()).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('clarification_required'));
  assert.equal(r.outcome, 'DEEP_CONFIRMS_FAST');
  assert.equal(r.superseded, false);
  assert.equal(r.display, fast);
});

test('T-P03A-35 quand OPRIE déclare la demande prête, l’interaction rapide tombe', () => {
  const fast = validateFastInteraction(fastOk('ASK_CLARIFICATION'), snapshot()).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('operational_request_ready'));
  assert.equal(r.outcome, 'DEEP_SUPERSEDES_FAST', 'FAST_CAN_OVERRIDE_OPRIE = NO');
  assert.equal(r.superseded, true);
  assert.equal(r.display, null);
  assert.equal(r.authoritative_state, 'operational_request_ready');
});

test('T-P03A-36 quand OPRIE bloque, l’interaction rapide tombe', () => {
  const fast = validateFastInteraction(fastOk('ACKNOWLEDGE', 'Demande reçue.'), snapshot()).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('blocked'));
  assert.equal(r.outcome, 'DEEP_SUPERSEDES_FAST');
  assert.equal(r.authoritative_state, 'blocked');
  /* Le plan rapide ne peut jamais déclarer qu'un contenu n'est pas bloqué. */
  assert.equal(FAST_INTERACTION_TYPES.includes('NOT_BLOCKED'), false);
});

test('T-P03A-37 une orientation rapide cède devant une clarification OPRIE', () => {
  const fast = validateFastInteraction(fastOk('ORIENT_ARCHITECTE', 'Poursuivez dans le parcours guidé.'), snapshot()).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('clarification_required'));
  assert.equal(r.outcome, 'DEEP_SUPERSEDES_FAST');
  assert.equal(r.display, null, 'DOUBLE_QUESTION_PATHS = 0 : une seule chose est affichée');
});

test('T-P03A-38 un état dégradé reste l’affaire d’OPRIE seul', () => {
  const fast = validateFastInteraction(fastOk(), snapshot()).interaction;
  const r = reconcileFastWithDeep(fast, deepTurn('degraded_state'));
  assert.equal(r.authoritative_state, 'degraded_state');
  assert.equal(r.superseded, true);
  assert.deepEqual([...RECONCILIATION_OUTCOMES], ['DEEP_CONFIRMS_FAST', 'DEEP_SUPERSEDES_FAST', 'TURN_STALE']);
});

/* ======================================================================== *
 * §73–§74 / §90–§93 — LES ACQUIS DES LOTS PRÉCÉDENTS
 * ======================================================================== */

test('T-P03A-39 le plan rapide réutilise le transport durci de M-01', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  const bloc = code.slice(code.indexOf('FAST_INTERACTION_ADAPTERS'), code.indexOf('runFastInteractionWithHaChain'));
  for (const appel of ['callGroqChatCompletion', 'callAnthropicMessages', 'callOpenAiChatCompletion']) {
    assert.ok(bloc.includes(appel), `transport M-01 réutilisé : ${appel}`);
  }
  assert.equal(/JSON\.parse\(raw\)/.test(bloc), false, 'aucun transport ad hoc');
});

test('T-P03A-40 le plan rapide réutilise la chaîne HA existante, sans nouvelle politique', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  assert.ok(code.includes('runProviderChain({ role: "fast_interaction"'), 'même moteur de repli');
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'], 'FAILOVER_ORDER_CHANGED = NO');
  assert.deepEqual(Object.keys(FAST_INTERACTION_ADAPTERS), ['groq', 'anthropic', 'openai']);
  assert.equal(/Promise\.race/.test(code), false, 'aucune course entre fournisseurs');
});

test('T-P03A-41 le contrôle de débit de M-03 n’est pas contourné', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  const bloc = code.slice(code.indexOf('FAST_INTERACTION_ADAPTERS'), code.indexOf('runFastInteractionWithHaChain'));
  assert.ok(bloc.includes('createGroqRateLimitPacer()'), 'RATE_CONTROL_BYPASSED = NO');
  assert.equal(resolveProviderConcurrency('groq'), 2, 'M03_CONCURRENCY_CHANGED = NO');
});

test('T-P03A-42 la causalité Analyst → Critic → Arbiter est intacte', () => {
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE], ['analyst', 'critic', 'arbiter']);
  const orch = sansCommentaires(ORCH_SRC);
  assert.equal(/Promise\.(all|allSettled|race)/.test(orch), false, 'ANALYST_CRITIC_ARBITER_CAUSALITY_CHANGED = NO');
  assert.equal(FAST_SRC.includes('analyst'), false, 'le plan rapide ne connaît aucun rôle profond');
});

test('T-P03A-43 aucune logique floue, aucun seuil, aucun mot de domaine', () => {
  const code = sansCommentaires(FAST_SRC);
  for (const interdit of ['embedding', 'cosine', 'fuzzy', 'levenshtein', 'similarity', 'case_id', 'confidence', 'threshold', 'score']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `autorité interdite : ${interdit}`);
  }
  assert.equal(/>\s*0\.[0-9]/.test(code), false, 'aucun seuil numérique décisionnel');
});

test('T-P03A-44 aucune dépendance runtime n’a été ajoutée', () => {
  assert.equal(/^import .* from ["'][^.]/m.test(FAST_SRC), false, 'NEW_RUNTIME_DEPENDENCIES = 0');
});

/* ======================================================================== *
 * §75–§76 / §102 — MESURE MÉCANIQUE, ET CE QU'ELLE NE DIT PAS
 * ======================================================================== */

test('T-P03A-45 l’affichage ne dépend plus causalement du plan profond', async () => {
  /* Géométrie du brief : Analyst 100 + Critic 300 + Arbiter 100 = 500 ms ;
     plan rapide = 50 ms. */
  const { jalons, total } = await tour({ fastMs: 50, deepMs: 500 });
  assert.ok(jalons.render <= 200, `TIME_TO_FIRST_INTERACTION_MS ≈ ${jalons.render}`);
  assert.ok(jalons.deepEnd >= 480, `DEEP_PLANE_WALL_CLOCK_MS ≈ ${jalons.deepEnd}`);
  assert.ok(total >= 480, 'le tour complet attend toujours le plan profond');
  assert.ok(jalons.render < jalons.deepEnd / 2, 'DEEP_REQUIRED_FOR_FIRST_INTERACTION = NO');
});

test('T-P03A-46 aucune conformité interactive n’est revendiquée', () => {
  const code = sansCommentaires(FAST_SRC) + sansCommentaires(ADAPTERS_SRC);
  for (const interdit of ['p95', 'sla', 'interactive_budget', 'under_3s', 'INTERACTIVE_P95_COMPLIANT']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `revendication interdite : ${interdit}`);
  }
  /* Le critère de ce lot est causal, pas chronométrique : le plan profond
     reste intégralement nécessaire à la décision. */
  assert.ok(FAST_SRC.includes('deep_executed'));
});
