/* OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01 — IL VOYAIT LA REVENDICATION, PAS LE FAIT.
 * ============================================================================
 *
 * Depuis OPRIE-INPUT-AVAILABILITY-FIELD-01, le candidat porte available_inputs — « le numéro de
 * dossier, présent dans le matériau transmis » — avec la provenance user_provided_material.
 * L'Arbitre recevait cette affirmation, et rien pour la vérifier : il l'écartait comme
 * invérifiable, seize fois sur trente, pendant que l'Analyste et le Critique s'accordaient.
 *
 * LE MANQUE ÉTAIT À DEUX ÉTAGES, ET C'EST PLUS PROFOND QUE POUR LE CRITIQUE. L'orchestrateur ne
 * passait pas material_context à l'entrée du rôle Arbitre, ET makeArbiterUserMessage ne l'émettait
 * pas. Les deux devaient bouger.
 *
 * DEUX BOOLÉENS, PAS UN OCTET DE PLUS. Sa question n'est pas de lire le matériau — il ne le lira
 * jamais — mais de savoir si l'affirmation de l'Analyste est vérifiable.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeArbiterUserMessage, makeCriticGlobalUserMessage, ARBITER_SYSTEM_PROMPT } from '../workers/shared/operational-request-core.js';
import { runRoleWithAnthropic, runRoleWithGroq, runRoleWithOpenAI } from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const ORCH = lire('workers/shared/operational-request-orchestrator.js');

const CANDIDAT = Object.freeze({ objective: 'Restituer le numéro de dossier',
  expected_deliverable: 'Le numéro de dossier, restitué tel quel', secondary_objectives: [],
  confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
  external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [],
  available_inputs: ['le numéro de dossier, présent dans le matériau transmis'] });
const ANALYSTE = Object.freeze({ operational_request_candidate: CANDIDAT,
  provenance_records: [{ field: 'available_inputs', value: 'le numéro de dossier, présent dans le matériau transmis',
    provenance: 'user_provided_material' }],
  issues: [], question_candidates: [], confirmation_signals: {} });
const ENTREE = Object.freeze({ original_request: 'Extrais le numéro de dossier du matériau disponible.',
  clarification_history: [], material_context: { present: true, deep_content_available: true },
  material_content: ['NUMERO_DOSSIER = ZX-4821'], analyst_output: ANALYSTE, critic_output: { agreement: 'agree' } });

async function corpsProduction(executer, entree = ENTREE) {
  const corps = []; const vrai = globalThis.fetch;
  globalThis.fetch = async (_u, init) => { corps.push(init && init.body ? String(init.body) : null); throw new Error('capture'); };
  try { await executer('arbiter', { ...entree }, { ANTHROPIC_API_KEY: 'sk-ant-FAUX', GROQ_API_KEY: 'gsk_FAUX', 'OPenAI-API': 'sk-FAUX' }); }
  catch { /* la capture est le seul but */ }
  finally { globalThis.fetch = vrai; }
  const j = JSON.parse(corps.filter(Boolean)[0]);
  const m = (j.messages || []).find((x) => x.role === 'user');
  return { brut: j, message: JSON.parse(typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content)) };
}

/* T-AMCD01-01 — LE CHEMIN RÉEL EST CELUI QU'ON CROIT, ET IL EST UNIQUE. */
test('T-AMCD01-01 : l’Arbitre passe par l’adaptateur générique, sans batch', () => {
  const worker = lire('workers/groq/src/index.js');
  assert.match(worker, /const isCritic = role === "critic";/);
  assert.match(worker, /: \(\) => GENERIC_ROLE_ADAPTERS\[name\]\(role, input, env\)/);
  /* Pas de pipeline batché pour l'Arbitre : un seul constructeur à corriger. */
  assert.equal(/ARBITER_PIPELINES/.test(worker), false);
});

/* T-AMCD01-02 — LE MANQUE ÉTAIT À DEUX ÉTAGES, LES DEUX SONT COMBLÉS. */
test('T-AMCD01-02 : orchestrateur et constructeur portent désormais le contexte', () => {
  assert.match(ORCH, /return \{ \.\.\.base, analyst_output: outputs\.analyst, critic_output: outputs\.critic, material_context \};/);
  const o = JSON.parse(makeArbiterUserMessage(ENTREE));
  assert.deepEqual(Object.keys(o), ['original_request', 'clarification_history', 'material_context', 'analyst_output', 'critic_output']);
  assert.deepEqual(o.material_context, { present: true, deep_content_available: true });
  /* Absent, il vaut unknown — jamais false par défaut, comme partout ailleurs. */
  const sans = JSON.parse(makeArbiterUserMessage({ original_request: 'x', analyst_output: ANALYSTE, critic_output: {} }));
  assert.deepEqual(sans.material_context, { present: 'unknown', deep_content_available: 'unknown' });
});

/* T-AMCD01-03/04/05 — LES TROIS VALEURS TRAVERSENT, SANS CONVERSION. */
test('T-AMCD01-03/04/05 : true, false et unknown se propagent au corps réel', async () => {
  for (const attendu of [true, false, 'unknown']) {
    const { message } = await corpsProduction(runRoleWithAnthropic,
      { ...ENTREE, material_context: { present: true, deep_content_available: attendu } });
    assert.deepEqual(message.material_context, { present: true, deep_content_available: attendu },
      `deep_content_available = ${JSON.stringify(attendu)}`);
  }
});

/* T-AMCD01-06/07 — CE QUE L'ARBITRE DOIT POUVOIR RECOUPER. */
test('T-AMCD01-06/07 : available_inputs et la provenance lui sont visibles', async () => {
  const { message } = await corpsProduction(runRoleWithAnthropic);
  assert.deepEqual(message.analyst_output.operational_request_candidate.available_inputs,
    ['le numéro de dossier, présent dans le matériau transmis']);
  assert.match(JSON.stringify(message.analyst_output.provenance_records), /user_provided_material/);
  /* Les trois éléments du recoupement sont là ensemble : disponibilité, intrant, provenance. */
  assert.equal(message.material_context.deep_content_available, true);
});

/* T-AMCD01-08 — AUCUN CONTENU BRUT, MÊME QUAND L'ENTRÉE EN PORTE. */
test('T-AMCD01-08 : le matériau ne franchit pas la porte de l’Arbitre', async () => {
  const { brut, message } = await corpsProduction(runRoleWithAnthropic);
  assert.equal(JSON.stringify(brut).includes('NUMERO_DOSSIER'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(message, 'material_content'), false);
  assert.deepEqual(Object.keys(message.material_context).sort(), ['deep_content_available', 'present']);
  /* Et le Critique n'en reçoit pas davantage. */
  const critique = JSON.parse(makeCriticGlobalUserMessage(ENTREE));
  assert.equal(JSON.stringify(critique).includes('NUMERO_DOSSIER'), false);
});

/* T-AMCD01-09 — VÉRIFIÉ SUR LE CORPS ÉMIS PAR LES TROIS FOURNISSEURS. */
test('T-AMCD01-09 : la livraison ne dépend d’aucun fournisseur', async () => {
  for (const [nom, executer] of [['anthropic', runRoleWithAnthropic], ['groq', runRoleWithGroq], ['openai', runRoleWithOpenAI]]) {
    const { message } = await corpsProduction(executer);
    assert.deepEqual(message.material_context, { present: true, deep_content_available: true }, nom);
    assert.ok(message.analyst_output.operational_request_candidate.available_inputs.length, nom);
  }
});

/* T-AMCD01-10 — AUCUNE RÈGLE SÉMANTIQUE AJOUTÉE : ON LIVRE, ON N'INSTRUIT PAS. */
test('T-AMCD01-10 : le prompt de l’Arbitre n’a pas été touché', () => {
  assert.equal(/material_context|available_inputs|user_provided_material/.test(ARBITER_SYSTEM_PROMPT), false,
    'aucune règle nouvelle — ce lot vérifie d’abord si le contexte seul suffit');
  /* La trace est metadata seule, et vit dans l'orchestrateur, seul journal worker autorisé. */
  assert.match(ORCH, /event: "arbiter_material_context_observation"/);
  assert.match(ORCH, /arbiter_available_inputs_present: disponibles\.length > 0/);
  assert.match(ORCH, /arbiter_material_provenance_present: provenances\.some\(\(record\) => record\.provenance === "user_provided_material"\)/);
  const trace = ORCH.slice(ORCH.indexOf('event: "arbiter_material_context_observation"'), ORCH.indexOf('if (role === "critic")'));
  assert.equal(/material_content/.test(trace), false, 'RAW_CONTENT_LOGGING_COUNT = 0');
});
