/* OPRIE-CRITIC-MATERIAL-CONTEXT-DELIVERY-01 — LE TEST QUI MANQUAIT, SUR LE CHEMIN QUI COMPTE.
 * ============================================================================
 *
 * OPRIE-MATERIAL-CONTEXT-02 a fait porter material_context au message du Critique. Un test l'a
 * vérifié, et il passait. OPRIE-MATERIAL-PROVENANCE-02 a écrit une règle d'ancrage conditionnée à
 * material_context.deep_content_available. Un test l'a vérifié, et il passait.
 *
 * Les deux testaient `makeCriticUserMessage` — le constructeur du chemin SIMPLE, que
 * `/operational-request` n'emprunte jamais. Le rôle Critique est TOUJOURS routé vers
 * CRITIC_PIPELINES, donc vers le pipeline batché et `makeCriticGlobalUserMessage`, qui n'émettait
 * pas ce champ. La règle était inerte en production, et 11 vetos sur 16 s'expliquaient par là.
 *
 * CE FICHIER TESTE LE CHEMIN RÉELLEMENT EMPRUNTÉ. Un test qui passe sur un chemin mort ne prouve
 * rien : c'est la leçon que ces assertions gravent.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeCriticGlobalUserMessage, makeCriticUserMessage, runCriticBatchedPipeline,
  CRITIC_GLOBAL_SYSTEM_PROMPT, CRITIC_SYSTEM_PROMPT, SUBSTITUTION_REVIEW_SYSTEM_PROMPT,
  makeSubstitutionReviewBatchUserMessage
} from '../workers/shared/operational-request-core.js';
import { runCriticWithAnthropic, runCriticWithGroq, runCriticWithOpenAI } from '../workers/groq/src/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');

const CANDIDAT = Object.freeze({ objective: 'Restituer le numéro de dossier', expected_deliverable: 'Le numéro de dossier',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [],
  delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] });
const ANALYSTE = Object.freeze({ operational_request_candidate: CANDIDAT,
  provenance_records: [{ field: 'expected_deliverable', value: 'ZX-4821', provenance: 'user_provided_material' }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false,
    strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false } });
const ENTREE = Object.freeze({ original_request: 'Extrais le numéro de dossier du matériau disponible.',
  clarification_history: [], material_context: { present: true, deep_content_available: true },
  analyst_output: ANALYSTE, previous_vetoes: [] });

/* Capture le corps RÉELLEMENT émis par le pipeline de production d'un fournisseur. */
async function corpsProduction(executer) {
  const corps = []; const vrai = globalThis.fetch;
  globalThis.fetch = async (_u, init) => { corps.push(init && init.body ? String(init.body) : null); throw new Error('capture'); };
  try { await executer({ ...ENTREE }, { ANTHROPIC_API_KEY: 'sk-ant-FAUX', GROQ_API_KEY: 'gsk_FAUX', 'OPenAI-API': 'sk-FAUX' }); }
  catch { /* la capture est le seul but */ }
  finally { globalThis.fetch = vrai; }
  return corps.filter(Boolean).map((b) => JSON.parse(b));
}
const messageUtilisateur = (corps) => {
  const m = (corps.messages || []).find((x) => x.role === 'user');
  return typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '');
};

/* T-CMCD01-01 — LE CONSTRUCTEUR DU CHEMIN DE PRODUCTION PORTE LE CHAMP. */
test('T-CMCD01-01 : makeCriticGlobalUserMessage émet material_context', () => {
  const o = JSON.parse(makeCriticGlobalUserMessage(ENTREE));
  assert.deepEqual(Object.keys(o), ['original_request', 'clarification_history', 'material_context', 'analyst_output', 'previous_vetoes']);
  assert.deepEqual(o.material_context, { present: true, deep_content_available: true });
  /* Absent, il vaut unknown — jamais false par défaut, exactement comme sur le chemin simple. */
  const sans = JSON.parse(makeCriticGlobalUserMessage({ original_request: 'x', analyst_output: ANALYSTE }));
  assert.deepEqual(sans.material_context, { present: 'unknown', deep_content_available: 'unknown' });
});

/* T-CMCD01-02 — LES DEUX CONSTRUCTEURS NE DIVERGENT PLUS SUR CE CHAMP. */
test('T-CMCD01-02 : chemin simple et chemin batché portent le même contexte', () => {
  const simple = JSON.parse(makeCriticUserMessage(ENTREE));
  const batche = JSON.parse(makeCriticGlobalUserMessage(ENTREE));
  assert.deepEqual(batche.material_context, simple.material_context,
    'la divergence qui rendait la règle d’ancrage inerte est refermée');
});

/* T-CMCD01-03 — LE PIPELINE TRANSMET LE CHAMP À L'ÉTAPE QUI PORTE LA RÈGLE. */
test('T-CMCD01-03 : runCriticBatchedPipeline passe material_context à l’étape globale', async () => {
  let vuGlobal = null; let vuBatch = null;
  /* On n'observe que ce que le pipeline TRANSMET : la validation de la sortie du Critique n'est
     pas le sujet ici, et une sortie factice la ferait échouer après la capture. */
  try {
    await runCriticBatchedPipeline({ ...ENTREE, capability: { fixedOverheadUnits: 100, perTargetUnits: 10, maxUnitsPerBatch: 1000, unitsForTarget: () => 10, maxTargetsPerBatch: 4 } }, {
      executeGlobal: async (entree) => { vuGlobal = entree; return {}; },
      executeBatch: async (entree) => { vuBatch = entree; return {}; },
      concurrency: 1
    });
  } catch { /* la capture précède la validation */ }
  assert.ok(vuGlobal, 'l’étape globale a bien été appelée');
  assert.deepEqual(vuGlobal.material_context, { present: true, deep_content_available: true });
  /* La review de substitution ne le reçoit pas : aucune de ses règles ne l’emploie. */
  if (vuBatch) assert.equal(Object.prototype.hasOwnProperty.call(vuBatch, 'material_context'), false);
});

/* T-CMCD01-03B — LES TROIS VALEURS DE DISPONIBILITÉ TRAVERSENT, ET LA TRACE LES NOMME. */
test('T-CMCD01-03B : true, false et unknown se propagent au Critique global', async () => {
  for (const attendu of [{ present: true, deep_content_available: true },
                         { present: true, deep_content_available: false },
                         { present: 'unknown', deep_content_available: 'unknown' }]) {
    const o = JSON.parse(makeCriticGlobalUserMessage({ ...ENTREE, material_context: attendu }));
    assert.deepEqual(o.material_context, attendu, JSON.stringify(attendu));
  }
  /* La preuve tour par tour vit dans l'orchestrateur, seul journal worker autorisé à être
     embarqué : la placer dans le core en aurait créé un second, ce que T-CLEAN03-10 refuse. */
  const orch = lire('workers/shared/operational-request-orchestrator.js');
  assert.match(orch, /event: "critic_global_material_context_observation"/);
  assert.match(orch, /critic_global_material_context_present: material_context \? material_context\.present : null/);
  assert.match(orch, /critic_global_deep_content_available: material_context \? material_context\.deep_content_available : null/);
  assert.equal(orch.includes('material_content_bytes: Array.isArray(material_content)'), true, 'la trace matériau existante est intacte');
});

/* T-CMCD01-04 — LES TROIS FOURNISSEURS, SUR LE CORPS RÉELLEMENT ÉMIS. */
test('T-CMCD01-04 : material_context atteint le fournisseur, quel qu’il soit', async () => {
  for (const [nom, executer] of [['anthropic', runCriticWithAnthropic], ['groq', runCriticWithGroq], ['openai', runCriticWithOpenAI]]) {
    const corps = await corpsProduction(executer);
    assert.ok(corps.length > 0, `${nom} : un corps a été construit`);
    const message = messageUtilisateur(corps[0]);
    const o = JSON.parse(message);
    assert.deepEqual(o.material_context, { present: true, deep_content_available: true }, `${nom}`);
    assert.match(JSON.stringify(o.analyst_output.provenance_records), /user_provided_material/, `${nom}`);
  }
});

/* T-CMCD01-05 — AUCUN CONTENU BRUT, NULLE PART. */
test('T-CMCD01-05 : le Critique gagne la disponibilité, jamais le matériau', async () => {
  const avecContenu = { ...ENTREE, material_content: ['NUMERO_DOSSIER = ZX-4821'] };
  const o = JSON.parse(makeCriticGlobalUserMessage(avecContenu));
  assert.equal(Object.prototype.hasOwnProperty.call(o, 'material_content'), false);
  assert.equal(JSON.stringify(o).includes('NUMERO_DOSSIER'), false);
  /* Et sur le corps réel des trois fournisseurs. */
  const corps = await corpsProduction(runCriticWithAnthropic);
  assert.equal(JSON.stringify(corps[0]).includes('NUMERO_DOSSIER'), false);
  /* material_context ne contient que deux booléens de disponibilité. */
  assert.deepEqual(Object.keys(o.material_context).sort(), ['deep_content_available', 'present']);
});

/* T-CMCD01-06 — LA RÈGLE D'ANCRAGE DEVIENT APPLICABLE, SANS AVOIR ÉTÉ RETOUCHÉE. */
test('T-CMCD01-06 : la règle existante n’a pas bougé, sa condition est désormais évaluable', () => {
  for (const [nom, prompt] of [['batché', CRITIC_GLOBAL_SYSTEM_PROMPT], ['simple', CRITIC_SYSTEM_PROMPT]]) {
    assert.match(prompt, /l'une des trois sources contractuelles du tour : original_request, clarification_history, ou le matériau transmis à l'Analyste/, nom);
    assert.match(prompt, /lorsque material_context\.deep_content_available vaut true/, nom);
    /* Le contrôle de cohérence n'est pas devenu une exemption. */
    assert.match(prompt, /Cela ne vous demande aucune confiance aveugle/, nom);
    assert.match(prompt, /Une provenance user_provided_material alors que material_context indique deep_content_available false ou "unknown" est incohérente/, nom);
  }
  /* La condition porte sur un champ que le prompt batché reçoit maintenant vraiment. */
  const o = JSON.parse(makeCriticGlobalUserMessage(ENTREE));
  assert.equal(o.material_context.deep_content_available, true);
});

/* T-CMCD01-07 — LA REVIEW DE SUBSTITUTION RESTE HORS PÉRIMÈTRE, ET C'EST DÉLIBÉRÉ. */
test('T-CMCD01-07 : la review de substitution est inchangée', () => {
  const o = JSON.parse(makeSubstitutionReviewBatchUserMessage({ ...ENTREE, batchTargets: [] }));
  assert.equal(Object.prototype.hasOwnProperty.call(o, 'material_context'), false);
  /* Son prompt ne porte aucune règle d’ancrage ni de provenance matériau : rien n’y emploierait le champ. */
  assert.equal(/material_context|user_provided_material/.test(SUBSTITUTION_REVIEW_SYSTEM_PROMPT), false);
});
