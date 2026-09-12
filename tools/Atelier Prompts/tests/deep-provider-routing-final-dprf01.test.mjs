/* DEEP-PROVIDER-ROUTING-FINAL-01 — LA DÉCISION EXISTAIT, LE RUNTIME NE L'APPLIQUAIT PAS.
 * ============================================================================
 *
 * « FAST = GROQ ONLY, DEEP = ANTHROPIC ONLY » était acté depuis plusieurs lots. Le runtime, lui,
 * appelait toujours Groq en premier sur le plan profond. ANTHROPIC-DEEP-CAPACITY-01 l'a mesuré :
 * six tours sans épinglage, ANTHROPIC_NATIVE = 0/6. Tout ce qui avait été qualifié aux portes 2 et
 * 3 l'avait donc été sous un épinglage que la production n'appliquait pas.
 *
 * CE QUE CES TESTS PROTÈGENT. Non pas qu'un fournisseur soit « meilleur » — aucune règle sémantique
 * ne dépend d'un fournisseur, et ce lot n'en introduit aucune — mais qu'un plan qualifié sur un
 * modèle ne parte pas silencieusement sur un autre. Un repli de plan profond changerait de juge au
 * milieu du procès.
 *
 * ET SI ANTHROPIC TOMBE, LA CHAÎNE SE FERME. Elle ne bascule pas, elle ne fabrique pas de READY :
 * elle rend degraded_state. C'est le dernier test du fichier, et c'est le plus important.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLE_PROVIDER_ORDER, FAST_PROVIDER_ORDER, DECISION_PROVIDER_ORDER,
  resolveRoleProviderOrder, resolveFastProviderOrder, runRoleWithHaChain, ANTHROPIC_MODEL
} from '../workers/groq/src/index.js';
import { runOperationalRequestTurn } from '../workers/shared/operational-request-orchestrator.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = fs.readFileSync(path.join(racine, 'workers/groq/src/index.js'), 'utf8');

/* T-DPRF01-01 — LE CONTRAT FINAL, PLAN PAR PLAN. */
test('T-DPRF01-01 : Fast = Groq seul, Deep = Anthropic seul', () => {
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic']);
  assert.ok(Object.isFrozen(ROLE_PROVIDER_ORDER));
  assert.equal(ANTHROPIC_MODEL, 'claude-sonnet-4-6');
  /* La route /decision garde son propre ordre : autre plan, hors de ce contrat. */
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
});

/* T-DPRF01-02 — LE PLAN PROFOND NE CONNAÎT PLUS NI GROQ NI OPENAI. */
test('T-DPRF01-02 : aucun repli Deep vers Groq ou OpenAI', () => {
  assert.equal(ROLE_PROVIDER_ORDER.includes('groq'), false);
  assert.equal(ROLE_PROVIDER_ORDER.includes('openai'), false);
  assert.equal(ROLE_PROVIDER_ORDER.length, 1);
  /* La constante elle-même, dans la source : la garde tient même si l'export change de forme. */
  assert.match(WORKER, /export const ROLE_PROVIDER_ORDER = Object\.freeze\(\["anthropic"\]\);/);
});

/* T-DPRF01-03 — SANS AUCUN ÉPINGLAGE, LE RUNTIME CHOISIT ANTHROPIC. */
test('T-DPRF01-03 : la résolution par défaut ne dépend d’aucune variable de mesure', () => {
  assert.deepEqual([...resolveRoleProviderOrder({})], ['anthropic'], 'env vide');
  assert.deepEqual([...resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: 'ha' })], ['anthropic'], 'chaîne HA');
  assert.deepEqual([...resolveRoleProviderOrder(undefined)], ['anthropic'], 'env absent');
  /* Le plan rapide reste résolu séparément, et reste Groq. */
  assert.deepEqual([...resolveFastProviderOrder({})], ['groq']);
});

/* T-DPRF01-04 — L'ÉPINGLAGE DE MESURE NE PEUT PLUS DÉTOURNER LE PLAN PROFOND. */
test('T-DPRF01-04 : un épinglage vers Groq ou OpenAI est refusé, pas silencieusement appliqué', () => {
  assert.deepEqual([...resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: 'anthropic' })], ['anthropic']);
  for (const interdit of ['groq', 'openai']) {
    assert.throws(() => resolveRoleProviderOrder({ DEEP_BENCH_PROVIDER: interdit }),
      /DEEP_BENCH_PROVIDER invalide/, `${interdit} refusé`);
  }
});

/* T-DPRF01-05 — AUCUN APPEL FOURNISSEUR HORS ANTHROPIC SUR LE CHEMIN RÉEL. */
test('T-DPRF01-05 : les trois rôles n’atteignent qu’anthropic.com', async () => {
  for (const role of ['analyst', 'critic', 'arbiter']) {
    const hotes = []; const vrai = globalThis.fetch;
    globalThis.fetch = async (url) => { hotes.push(new URL(String(url)).host); throw new Error('capture'); };
    try {
      await runRoleWithHaChain(role, { original_request: 'x', clarification_history: [],
        material_context: { present: false, deep_content_available: false },
        analyst_output: { operational_request_candidate: {}, provenance_records: [], issues: [] },
        critic_output: { agreement: 'agree' }, previous_vetoes: [] },
        { ANTHROPIC_API_KEY: 'sk-ant-FAUX', GROQ_API_KEY: 'gsk_FAUX', 'OPenAI-API': 'sk-FAUX' },
        { log: () => {} });
    } catch { /* la capture des hôtes est le seul but */ }
    finally { globalThis.fetch = vrai; }
    assert.ok(hotes.length > 0, `${role} : au moins un appel`);
    for (const h of hotes) assert.equal(h, 'api.anthropic.com', `${role} n’appelle qu’Anthropic`);
    assert.equal(hotes.some((h) => /groq|openai/.test(h)), false, `${role} : ni Groq ni OpenAI`);
  }
});

/* T-DPRF01-06 — ANTHROPIC INDISPONIBLE : LA CHAÎNE SE FERME, ELLE NE BASCULE PAS.
 *
 * Harnais contrôlé — aucun incident réel provoqué chez le fournisseur. */
test('T-DPRF01-06 : une panne Anthropic rend degraded_state, jamais un READY fabriqué', async () => {
  const hotes = []; const vrai = globalThis.fetch;
  globalThis.fetch = async (url) => { hotes.push(new URL(String(url)).host); throw new Error('anthropic indisponible'); };
  let resultat = null;
  try {
    resultat = await runOperationalRequestTurn(
      { original_request: 'Extrais le numéro de dossier du matériau disponible.', clarification_history: [],
        material_context: { present: true, deep_content_available: true },
        material_content: ['NUMERO_DOSSIER = ZX-4821'] },
      { executeRole: (role, input) => runRoleWithHaChain(role, input,
          { ANTHROPIC_API_KEY: 'sk-ant-FAUX', GROQ_API_KEY: 'gsk_FAUX', 'OPenAI-API': 'sk-FAUX' },
          { order: resolveRoleProviderOrder({}), log: () => {} }),
        log: () => {} });
  } finally { globalThis.fetch = vrai; }

  assert.ok(resultat, 'un résultat contractuel est rendu');
  assert.equal(resultat.state, 'degraded_state', 'fail-closed');
  assert.notEqual(resultat.state, 'operational_request_ready', 'aucun READY fabriqué');
  /* Et surtout : la panne n’a déclenché aucune bascule. */
  assert.equal(hotes.every((h) => h === 'api.anthropic.com'), true, 'aucun autre fournisseur contacté');
  assert.equal(hotes.some((h) => /groq|openai/.test(h)), false, 'ni Groq ni OpenAI en repli');
});

/* T-DPRF01-07 — AUCUNE RÈGLE SÉMANTIQUE NE DÉPEND D'UN FOURNISSEUR. */
test('T-DPRF01-07 : le routage nomme des fournisseurs, la sémantique jamais', () => {
  const coeur = fs.readFileSync(path.join(racine, 'workers/shared/operational-request-core.js'), 'utf8');
  const orch = fs.readFileSync(path.join(racine, 'workers/shared/operational-request-orchestrator.js'), 'utf8');
  for (const [nom, src] of [['core', coeur], ['orchestrateur', orch]]) {
    for (const p of ['groq', 'anthropic', 'openai']) {
      assert.equal(new RegExp(`if\\s*\\([^)]*["']${p}["']`).test(src), false,
        `${nom} : aucun branchement sémantique sur ${p}`);
    }
  }
});
