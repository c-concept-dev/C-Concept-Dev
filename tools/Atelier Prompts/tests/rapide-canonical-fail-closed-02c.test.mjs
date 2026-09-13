/* 02C — UN CONTRAT CANONIQUE REFUSÉ NE PRODUIT AUCUN PROMPT.
 * ============================================================================
 *
 * Ce que cette suite éprouve : quand `validateCanonicalContract` refuse, le tour s'arrête. Pas de
 * repli, pas d'assemblage, pas de livraison — un refus technique, et rien d'autre.
 *
 * POURQUOI CE LOT A EXISTÉ. `oprieBuildCanonicalContract` convertissait le refus en `null`, et
 * `oprieEnterExecution` poursuivait. La garde censée fermer cette voie, dans le moteur Rapide,
 * testait `rapideContratCanonique` — c'est-à-dire exactement la valeur qui venait d'être annulée :
 * elle ne pouvait donc jamais se déclencher. Mesuré avant correctif : contrat refusé, exécution
 * entrée, `orientation.canonical = null`, aucun Prompt Contract Gate, prompt livré.
 *
 * CE QUI N'EST PAS CHANGÉ ICI : la politique de verrous, la capture des quantités, le contenu du
 * gate, l'ADN, les schémas. Le lot ne fait qu'interdire de continuer après un refus.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPilot, arbiterTurn, delay } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

/** Un tour gouverné qui atteint READY, avec ou sans refus du contrat canonique. */
async function tourPret({ canonicalRejected = false, mode = 'architecte' } = {}) {
  const h = loadPilot({
    mode, canonicalRejected,
    fast: async () => ({ type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.' }),
    deep: async () => arbiterTurn('operational_request_ready')
  });
  await h.pilot.oprieRunTurn(mode);
  await delay(30);
  return h;
}
const dernierBandeau = (h) => (h.spy.gate[h.spy.gate.length - 1] || {}).decision || null;
const marques = (h) => h.pilot.oprieState.telemetry.map((m) => m.event);

test('T-02C-01 : contrat canonique accepté — Rapide poursuit', async () => {
  const h = await tourPret({ mode: 'rapide' });
  assert.ok(h.pilot.oprieState.canonicalContract, 'le contrat canonique est présent');
  assert.equal(h.spy.executed.length, 1, 'l’exécution est bien entrée');
  assert.ok(h.spy.executed[0].orientation.canonical, 'et elle porte le contrat, jamais null');
});

test('T-02C-02 : contrat canonique refusé — Rapide s’arrête', async () => {
  const h = await tourPret({ canonicalRejected: true, mode: 'rapide' });
  assert.equal(h.pilot.oprieState.canonicalContract, null, 'le refus est visible dans l’état');
  assert.equal(h.spy.executed.length, 0, 'et l’exécution n’est JAMAIS entrée');
});

test('T-02C-03 : contrat refusé — aucun prompt n’est produit', async () => {
  const h = await tourPret({ canonicalRejected: true, mode: 'rapide' });
  /* Le pilote de test enregistre l'entrée en exécution : zéro entrée ⇒ aucun assembleur atteint,
     donc aucun prompt. Et rien n'est exposé côté interface. */
  assert.equal(h.spy.executed.length, 0);
  assert.equal(h.ctx.$('#rapide-sortie').textContent, '', 'aucune sortie Rapide n’est écrite');
  assert.equal(h.ctx.$('#v11-question').textContent, '', 'et aucune question n’est affichée');
});

test('T-02C-04 : contrat refusé — aucune livraison', async () => {
  for (const mode of ['rapide', 'architecte']) {
    const h = await tourPret({ canonicalRejected: true, mode });
    assert.deepEqual(h.spy.executed, [], `${mode} : aucune livraison`);
  }
});

test('T-02C-05 : contrat refusé — l’assembleur n’est pas atteint', async () => {
  /* Preuve de chemin : la garde est posée AVANT la branche de route, donc avant tout appel à
     adpRunRapide / adpEnterArchitecte, donc avant tout assembleur. */
  const i = HTML.indexOf('function oprieEnterExecution');
  const bloc = HTML.slice(i, HTML.indexOf('function oprieDecideOrchestration', i));
  const garde = bloc.indexOf("if(!canonical){oprieMark('canonical_contract_refused'");
  const route = bloc.indexOf("route==='rapide'?adpRunRapide(");
  assert.ok(garde > -1, 'la garde existe');
  assert.ok(route > -1, 'la branche de route existe');
  assert.ok(garde < route, 'et la garde précède la route : aucun moteur n’est appelé après un refus');
});

test('T-02C-06 : contrat accepté — le Prompt Contract Gate tourne toujours', async () => {
  const h = await tourPret({ mode: 'rapide' });
  assert.equal(h.spy.executed.length, 1, 'l’exécution est entrée');
  /* Le gate vit dans le moteur Rapide, atteint uniquement quand l'exécution est entrée : le
     vérifier ici serait mesurer le pilote de test. Son fonctionnement réel est éprouvé par
     tests/single-delivered-prompt-02b.test.mjs (r.qg === 'PASS', 8/8). */
  assert.ok(h.spy.executed[0].orientation.canonical, 'avec un contrat opposable au gate');
});

test('T-02C-07 : le refus est observable, jamais silencieux', async () => {
  const h = await tourPret({ canonicalRejected: true, mode: 'rapide' });
  assert.ok(marques(h).includes('canonical_contract_refused'),
    'une marque de télémétrie nomme le refus');
  const g = dernierBandeau(h);
  assert.equal(g && g.state, 'technical', 'et l’interface rend un échec technique, pas un silence');
});

test('T-02C-08 : le refus Architecte reste ce qu’il était — un refus technique sans prompt', async () => {
  const h = await tourPret({ canonicalRejected: true, mode: 'architecte' });
  assert.equal(h.spy.executed.length, 0, 'aucune entrée en Architecte');
  assert.equal((dernierBandeau(h) || {}).state, 'technical', 'refus technique');
  /* Et la primitive de refus propre à Architecte est toujours là, intacte. */
  const roundtrip = fs.readFileSync(path.join(root, 'core/adn/oprie-manual-roundtrip.js'), 'utf8');
  assert.match(roundtrip, /return refuse\('technical', `Contrat canonique refusé :/,
    'buildArchitecteContractFromTurn refuse toujours de son côté');
});

test('T-02C-09 : la garde réutilise les primitives existantes — aucune autorité nouvelle', () => {
  const i = HTML.indexOf('function oprieEnterExecution');
  const bloc = HTML.slice(i, HTML.indexOf('function oprieDecideOrchestration', i));
  assert.match(bloc, /if\(!canonical\)\{oprieMark\('canonical_contract_refused'/,
    'le refus est tracé par oprieMark, primitive déjà utilisée dans cette fonction');
  assert.match(bloc, /return oprieShowNetworkFailure\(\)\}/,
    'et rendu par oprieShowNetworkFailure, celle qu’emploie déjà la destination inconnue');
  /* Aucune nouvelle machine d'état, aucun nouvel état OPRIE, aucun seuil. */
  for (const interdit of [/canonical_state\s*=/, /new\s+Map\(/, /CANONICAL_REFUSAL_[A-Z_]+\s*=/]) {
    assert.doesNotMatch(bloc, interdit, `aucune structure nouvelle (${interdit})`);
  }
});
