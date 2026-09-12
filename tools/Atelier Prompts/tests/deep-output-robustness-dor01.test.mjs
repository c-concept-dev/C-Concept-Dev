/* DEEP-OUTPUT-ROBUSTNESS-01 — UN TOUR NE DOIT JAMAIS DISPARAÎTRE SANS ÉTAT.
 * ============================================================================
 *
 * DEEP-HAIKU-FIT-01 a mesuré, sur huit tours réels, deux tours terminés en HTTP 502 avec
 * semantic_state = null : ni READY, ni clarification, ni degraded_state. Aucun état OPRIE du tout.
 * La cause n'était pas que le validateur ait eu tort — il avait raison de refuser une sortie de
 * Critique global amputée de ses champs racine. La cause était l'ÉTIQUETTE de ce refus.
 *
 * L'ASYMÉTRIE, EN UNE PHRASE. L'Analyste et l'Arbitre traversent parseRoleOutput, qui étiquette
 * tout refus de leur validateur en STRUCTURED_OUTPUT_INVALID : la classe est éligible au repli, la
 * chaîne s'épuise proprement, et le tour finit en degraded_state gouverné — c'est exactement ce
 * qu'on a observé quand l'Arbitre omettait `reason`. Le Critique batché, lui, n'a jamais eu cette
 * enveloppe : son refus final sortait NU, devenait programming_error (« défaut de NOTRE code »),
 * et le fail-closed le renvoyait en 502 sans état.
 *
 * CE QUE CE FICHIER GARDE. Que le refus est le même refus — mêmes sorties refusées, mêmes messages,
 * aucun champ rendu facultatif — et que seule son étiquette a changé. Et, symétriquement, qu'un
 * défaut qui est le NÔTRE reste nu, bruyant, et jamais déguisé en faute du modèle.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runCriticBatchedPipeline, validateDegradedRoleResult, createDegradedRoleResult,
  validateCriticOutput
} from '../workers/shared/operational-request-core.js';
import { FAILURE_CLASSES, failureClassOf, isFailoverEligible } from '../workers/shared/provider-ha.js';

const CANDIDAT = Object.freeze({ objective: 'Restituer le numéro de dossier', expected_deliverable: 'Le numéro de dossier',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [],
  delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] });
const ANALYSTE = Object.freeze({ operational_request_candidate: CANDIDAT,
  provenance_records: [{ field: 'expected_deliverable', value: 'ZX-4821', provenance: 'user_provided_material' }],
  issues: [], question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false,
    strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false } });
/* Capability de découpage : exigée par computeBatchPlan même quand aucune cible n'existe. Valeurs
   neutres — aucun batch n'est planifié ici, elles ne servent qu'à satisfaire la validation. */
const CAPABILITY = Object.freeze({ fixedOverheadUnits: 0, perTargetUnits: 1, maxUnitsPerBatch: 1000,
  maxTargetsPerBatch: 1, unitsForTarget: () => 1 });
const ENTREE = Object.freeze({ original_request: 'Extrais le numéro de dossier du matériau disponible.',
  clarification_history: [], material_context: { present: true, deep_content_available: true },
  analyst_output: ANALYSTE, previous_vetoes: [], capability: CAPABILITY });

/* ANALYSTE ne porte aucune issue material+question : questionReviewTargets est vide, le plan de
   batch aussi, et executeBatch n'est jamais appelé. Le seul appel fournisseur du tour est donc
   l'appel global — exactement la configuration des deux tours perdus (C5 et C6). */
const SANS_BATCH = { executeBatch: async () => { throw new Error('aucun batch ne doit être appelé'); } };

/* Les deux formes réellement observées en campagne. C5 : un seul champ racine sur sept. C6 : tous
   les champs sauf `vetoes`. Ni l'une ni l'autre n'est fabriquée pour ce test. */
const GLOBAL_C5 = Object.freeze({ operational_request_candidate_review: {
  unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] } });
const GLOBAL_C6 = Object.freeze({
  agreement: 'agree',
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  semantic_drift_detected: false, semantic_drift_notes: [],
  significant_stakes: false, significant_stakes_reason: '',
  illegitimate_question_found: []
});

async function refus(globalOutput) {
  try {
    await runCriticBatchedPipeline({ ...ENTREE }, { ...SANS_BATCH, executeGlobal: async () => globalOutput });
  } catch (error) { return error; }
  throw new assert.AssertionError({ message: 'la sortie invalide aurait dû être refusée' });
}

function leve(fn) {
  try { fn(); } catch (e) { return e; }
  throw new assert.AssertionError({ message: 'aucun refus levé' });
}

// --- 1. LE TOUR NE DISPARAÎT PLUS -------------------------------------------------------------

test('T-DOR01-01 : un Critique global amputé est refusé, et le refus est marqué', async () => {
  for (const [nom, sortie] of [['C5 un seul champ racine', GLOBAL_C5], ['C6 vetoes manquant', GLOBAL_C6]]) {
    const e = await refus(sortie);
    assert.ok(e instanceof TypeError, `${nom} : la sortie invalide doit être refusée`);
    assert.equal(e.output_contract_violation, true,
      `${nom} : le refus doit être imputé au fournisseur, pas à notre code`);
  }
});

test('T-DOR01-02 : le message du refus est celui du validateur, inchangé', async () => {
  for (const sortie of [GLOBAL_C5, GLOBAL_C6]) {
    assert.equal((await refus(sortie)).message, 'CriticOutput contient des champs inattendus ou manquants.');
  }
});

/* C'est LE test du lot. Avant correction, cette erreur arrivait nue chez tagCriticPipelineFailure :
   failureClassOf la lisait programming_error, isFailoverEligible répondait false, la chaîne
   fail-closed, et le tour sortait en 502 sans état. Le marqueur est la seule chose qui manquait
   pour que le classificateur la traduise en STRUCTURED_OUTPUT_INVALID — classe éligible, donc
   chaîne épuisée proprement, donc degraded_state gouverné. */
test('T-DOR01-03 : le marqueur ouvre la classe éligible au repli, jamais un état fabriqué', async () => {
  const e = await refus(GLOBAL_C5);
  assert.equal(failureClassOf(e), FAILURE_CLASSES.PROGRAMMING_ERROR,
    'le marqueur n’est pas une classe : il est lu par tagCriticPipelineFailure, qui seul étiquette');
  assert.equal(e.output_contract_violation, true);
  assert.ok(isFailoverEligible(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID),
    'la classe cible doit rester éligible au repli');
  assert.equal(e.state, undefined, 'aucun état n’est fabriqué par le refus');
  assert.equal(e.operational_request_candidate, undefined, 'aucun candidat n’est fabriqué');
});

// --- 2. CE QUI NE DOIT PAS BOUGER --------------------------------------------------------------

test('T-DOR01-04 : aucun contrat relâché — une sortie complète passe toujours', async () => {
  const complet = { ...GLOBAL_C6, vetoes: [] };
  const sortie = await runCriticBatchedPipeline({ ...ENTREE }, { ...SANS_BATCH, executeGlobal: async () => complet });
  assert.equal(sortie.agreement, 'agree');
  assert.deepEqual(sortie.vetoes, []);
});

test('T-DOR01-05 : un défaut qui est le NÔTRE reste nu', () => {
  /* validateDegradedRoleResult examine un objet que NOTRE code vient de construire
     (createDegradedRoleResult). Son refus ne doit jamais porter le marqueur : le déguiser en faute
     du modèle transformerait un bug interne en dégradation silencieuse. */
  const e = leve(() => validateDegradedRoleResult({ role: 'critic', state: 'degraded_state' }));
  assert.ok(e instanceof TypeError);
  assert.notEqual(e.output_contract_violation, true);
  /* Et le chemin nominal de cette même fonction reste intact. */
  assert.equal(validateDegradedRoleResult(createDegradedRoleResult('critic', 'chaîne épuisée')).state, 'degraded_state');
});

test('T-DOR01-06 : validateCriticOutput appelé seul reste nu — le marqueur est posé au pipeline', () => {
  /* La portée est stricte : c'est l'enveloppe de runCriticBatchedPipeline qui impute au
     fournisseur, parce que c'est là qu'on sait d'où vient la donnée. Le validateur, lui, ne le
     sait pas et ne doit pas le prétendre. */
  const e = leve(() => validateCriticOutput(GLOBAL_C5));
  assert.ok(e instanceof TypeError);
  assert.notEqual(e.output_contract_violation, true);
});

// --- 3. LA PREUVE SUR LE CHEMIN QUE LE PRODUIT EMPRUNTE ----------------------------------------

/* Les tests ci-dessus prouvent l'étiquette. Celui-ci prouve la CONSÉQUENCE : sur le vrai chemin
   HTTP, le tour aboutit désormais à un état gouverné au lieu de disparaître. C'est la reproduction
   exacte de C6 (Critique global omettant `vetoes`), l'un des deux tours perdus en campagne. */
const ORIGINE = 'https://atelier.example.com';
const ENV = { ALLOWED_ORIGINS: ORIGINE, ANTHROPIC_API_KEY: 'clef-de-test' };
const repond = (charge, nom) => Response.json({
  stop_reason: 'tool_use', content: [{ type: 'tool_use', name: nom, input: charge }],
  usage: { input_tokens: 100, output_tokens: 262 }
});
const GLOBAL_COMPLET = () => ({ ...GLOBAL_C6, vetoes: [] });

test('T-DOR01-07 : sur le chemin HTTP réel, le tour dégrade au lieu de disparaître', async (t) => {
  const journal = console.log, erreurs = console.error;
  console.log = () => {}; console.error = () => {};
  const vraiFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = vraiFetch; console.log = journal; console.error = erreurs; });

  globalThis.fetch = async (_url, options) => {
    const nom = JSON.parse(options.body).tools[0].name;
    if (nom === 'oprie_analyst') return repond(ANALYSTE, nom);
    if (nom === 'critic_global') { const g = GLOBAL_COMPLET(); delete g.vetoes; return repond(g, nom); }
    return repond({ agreement: 'agree' }, nom);
  };

  const { default: worker } = await import('../workers/groq/src/index.js');
  const reponse = await worker.fetch(new Request('https://worker.example/operational-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGINE },
    body: JSON.stringify({ original_request: 'O.', clarification_history: [] })
  }), ENV);
  const corps = await reponse.json();

  assert.equal(reponse.status, 200, 'plus de 502 sans état OPRIE');
  assert.equal(corps.state, 'degraded_state', 'un état gouverné, fail-closed');
  assert.equal(corps.role, 'critic');
  assert.deepEqual(Object.keys(corps).sort(), ['reason', 'role', 'state'], 'DegradedRoleResult canonique');
  const brut = JSON.stringify(corps);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(brut.includes(interdit), false, `aucun verdict fabriqué : ${interdit}`);
  }
});
