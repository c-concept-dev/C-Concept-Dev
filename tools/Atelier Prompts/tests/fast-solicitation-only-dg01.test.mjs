/* 01D-G — LE PLAN RAPIDE NE PARLE PLUS QUE POUR DEMANDER.
 * ============================================================================
 *
 * Ce que cette suite éprouve tient en une phrase : un accusé de réception écrit
 * par le fournisseur ne peut plus atteindre l'écran.
 *
 * Pourquoi cela méritait un changement. Le bandeau d'analyse est affiché quand
 * le tour commence, avant même que le plan rapide existe. Un ACKNOWLEDGE ne
 * faisait donc que remplacer une phrase générique par une phrase de modèle, sous
 * le même titre — et la mesure a montré ce que coûtait cet échange : la phrase
 * générique ne promet rien, celle du modèle promettait de traiter un document
 * qui n'existait pas.
 *
 * Ce qui N'A PAS changé, et que ces tests gardent : le fournisseur produit
 * toujours son accusé de réception, la validation le contrôle toujours, la
 * télémétrie le voit toujours. Il cesse seulement d'être montré. Et une vraie
 * question reste rendue aussi vite qu'avant.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAST_FORBIDDEN_AUTHORITY_FIELDS,
  createTurnSnapshot,
  projectInteractionForMode,
  validateFastInteraction
} from '../workers/shared/fast-interactive-plane.js';
import { loadPilot, arbiterTurn, clarificationTurn, delay, questionShown } from './perf04-frontend-harness.helper.mjs';

const snapshot = () => createTurnSnapshot({ turn_id: 1, original_request: 'Une demande.' });
const projete = (type, text, mode) =>
  projectInteractionForMode(validateFastInteraction({ type, text }, snapshot()).interaction, mode);

/* La phrase exacte mesurée en 1D-C, celle qui promettait un travail sur un matériau absent.
   Elle n'est pas une règle : c'est la preuve, citée telle qu'elle a été observée. */
const PROMESSE_MESUREE = 'Je vais corriger les fautes du document et vous le renvoyer.';

test('T-DG01-A une clarification reste une clarification en Rapide', () => {
  assert.equal(projete('ASK_CLARIFICATION', 'Quel public ?', 'rapide').type, 'ASK_CLARIFICATION');
});

test('T-DG01-B une clarification reste une clarification en Architecte', () => {
  assert.equal(projete('ASK_CLARIFICATION', 'Quel public ?', 'architecte').type, 'ASK_CLARIFICATION');
});

test('T-DG01-C une confirmation reste une confirmation en Rapide', () => {
  assert.equal(projete('ASK_CONFIRMATION', 'Confirmez-vous ?', 'rapide').type, 'ASK_CONFIRMATION');
});

test('T-DG01-D une confirmation reste une confirmation en Architecte', () => {
  assert.equal(projete('ASK_CONFIRMATION', 'Confirmez-vous ?', 'architecte').type, 'ASK_CONFIRMATION');
});

test('T-DG01-E un accusé de réception retombe sur le silence en Rapide', () => {
  const p = projete('ACKNOWLEDGE', PROMESSE_MESUREE, 'rapide');
  assert.equal(p.type, 'WAIT_FOR_DEEP_VALIDATION');
  assert.equal(p.projected_from, 'ACKNOWLEDGE', 'la provenance reste tracée : on retire un affichage, pas une trace');
});

test('T-DG01-F un accusé de réception retombe sur le silence en Architecte', () => {
  const p = projete('ACKNOWLEDGE', PROMESSE_MESUREE, 'architecte');
  assert.equal(p.type, 'WAIT_FOR_DEEP_VALIDATION');
  assert.equal(p.projected_from, 'ACKNOWLEDGE');
});

test('T-DG01-G un mode qui ne converse pas garde son orientation', () => {
  assert.equal(projete('ASK_CLARIFICATION', 'Quel public ?', 'atelier').type, 'ORIENT_ARCHITECTE');
  assert.equal(projete('ASK_CONFIRMATION', 'Confirmez-vous ?', 'atelier').type, 'ORIENT_ARCHITECTE');
});

test('T-DG01-H une projection ne confère aucune autorité', () => {
  const p = projete('ACKNOWLEDGE', 'Demande reçue.', 'rapide');
  assert.equal(p.authority, 'candidate');
  assert.equal(p.can_execute, false);
  assert.equal(p.can_mark_ready, false);
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(p, champ), false,
      `${champ} reste hors de portée du plan rapide`);
  }
});

test('T-DG01-I côté client, un accusé de réception ne produit aucun affichage et le plan profond poursuit', async () => {
  const { pilot, spy, ctx } = loadPilot({
    mode: 'rapide',
    demande: 'Corrige les fautes du document ci-joint.',
    fast: async () => ({ type: 'ACKNOWLEDGE', text: PROMESSE_MESUREE }),
    deep: async () => { await delay(20); return clarificationTurn('Quel document souhaitez-vous corriger ?'); }
  });
  await pilot.oprieRunTurn('rapide');
  await delay(60);

  const textes = spy.gate.filter((g) => g.decision).map((g) => String(g.decision.text || ''));
  assert.equal(textes.includes(PROMESSE_MESUREE), false,
    'la promesse mesurée ne doit atteindre aucun bandeau');
  assert.equal(questionShown(ctx).includes(PROMESSE_MESUREE), false,
    'ni aucune question');
  /* Le bandeau d'analyse, lui, a bien été montré : le retrait ne crée aucun silence. */
  assert.equal(spy.gate.some((g) => g.decision && g.decision.state === 'thinking'), true,
    'le bandeau d’analyse reste affiché');
  assert.equal(spy.deepCalls.length >= 1, true, 'le plan profond a bien été lancé');
});

test('T-DG01-J côté client, une vraie question reste rendue', async () => {
  const { pilot, spy, ctx } = loadPilot({
    mode: 'rapide',
    demande: 'Fais-moi un texte très court mais parfaitement exhaustif.',
    fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Préférez-vous la brièveté ou l’exhaustivité ?' }),
    deep: async () => { await delay(80); return arbiterTurn('operational_request_ready'); }
  });
  await pilot.oprieRunTurn('rapide');
  await delay(40);

  assert.equal(questionShown(ctx), 'Préférez-vous la brièveté ou l’exhaustivité ?',
    'la question rapide s’affiche toujours');
  assert.equal(spy.firstInteractionAt !== null && spy.firstInteractionAt < 80, true,
    'et elle s’affiche sans attendre le plan profond');
});

test('T-DG01-K la règle est une projection de type à type, sans lecture du texte', () => {
  /* Deux textes opposés, même type : la sortie doit être la même. Si un mot avait été
     lu quelque part, ce test le montrerait. */
  const a = projete('ACKNOWLEDGE', 'Je prends note.', 'rapide');
  const b = projete('ACKNOWLEDGE', PROMESSE_MESUREE, 'rapide');
  assert.equal(a.type, b.type);
  assert.equal(a.type, 'WAIT_FOR_DEEP_VALIDATION');
});
