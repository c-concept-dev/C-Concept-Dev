/* DEEP-INTERACTION-EARLY-STOP-01 — ON POSE LA QUESTION DÈS QU'ELLE EST PROUVÉE.
 * ============================================================================
 *
 * Le pipeline instruisait toutes les issues avant d'en poser une seule. Il s'arrête désormais dès
 * qu'une cible, lue DANS L'ORDRE DE PRIORITÉ de l'Analyste, est prouvée dernier recours.
 *
 * CE QUE LA CONCURRENCE PEUT CHANGER : combien de travail spéculatif était déjà en vol.
 * CE QU'ELLE NE PEUT JAMAIS CHANGER : ce qu'Atelier décide. Les tests B et A le gravent.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runCriticBatchedPipeline, LADDER_ALTERNATIVE_VALUES as FAMILLES
} from '../workers/shared/operational-request-core.js';

const CANDIDAT = Object.freeze({ objective: 'O', expected_deliverable: 'D',
  secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [],
  delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] });

/* Une famille pleinement retenable : le Gate l'accepte, la question n'est donc PAS dernier recours. */
const familleRetenable = () => ({ applicable: true, preserves_objective: true, requires_user_reserved_choice: false,
  contradicts_known_facts: false, produces_complete_deliverable: true, justification: 'alternative réellement disponible' });
/* Une famille écartée : aucune substitution possible. */
const familleEcartee = (motif) => ({ applicable: false, preserves_objective: false, requires_user_reserved_choice: false,
  contradicts_known_facts: false, produces_complete_deliverable: false, justification: motif });

const candidatesDernierRecours = () => Object.fromEntries(FAMILLES.map((f) => [f, familleEcartee(`${f} inapplicable ici`)]));
const candidatesSubstituable = () => Object.fromEntries(FAMILLES.map((f, i) => [f, i === 0 ? familleRetenable() : familleEcartee(`${f} inapplicable`)]));

const issue = (id) => ({ id, type: 'missing_information', description: `manque ${id}`, impact: 'material', recommended_treatment: 'question' });
const analyste = (n) => ({ operational_request_candidate: CANDIDAT, provenance_records: [],
  issues: Array.from({ length: n }, (_, i) => issue(`issue${i + 1}`)),
  question_candidates: [], confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false,
    strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false } });

const CAPABILITY = Object.freeze({ fixedOverheadUnits: 0, perTargetUnits: 1, maxUnitsPerBatch: 1000,
  maxTargetsPerBatch: 1, unitsForTarget: () => 1 });
const GLOBAL_OK = () => ({ operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: '' });

/* Exécute le pipeline en injectant, par issue_id, la sortie de batch voulue. `emis` enregistre
   l'ordre réel des appels de batch — c'est lui qui prouve qu'aucune vague ne part après l'arrêt. */
async function tour({ n, parIssue, concurrency }) {
  const emis = [];
  const telemetry = {};
  const resultat = await runCriticBatchedPipeline(
    { original_request: 'O.', clarification_history: [], analyst_output: analyste(n), previous_vetoes: [], capability: CAPABILITY },
    {
      concurrency, telemetry,
      executeGlobal: async () => GLOBAL_OK(),
      executeBatch: async ({ issueIds }) => {
        emis.push(...issueIds);
        const sortie = {};
        for (const id of issueIds) {
          const plan = parIssue[id];
          if (plan === 'invalide') { sortie[id] = { candidates: 'structure invalide' }; continue; }
          if (plan === 'erreur') throw new Error(`panne fournisseur sur ${id}`);
          sortie[id] = { candidates: plan === 'dernier_recours' ? candidatesDernierRecours() : candidatesSubstituable() };
        }
        return sortie;
      }
    }
  ).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));
  return { emis, telemetry, ...resultat };
}

// --- A / B : LA CONCURRENCE NE CHANGE PAS CE QU'ATELIER DÉCIDE -----------------------------------

test('T-ESO01-A : concurrency=1, cible 1 dernier recours -> un seul batch émis', async () => {
  const t = await tour({ n: 3, parIssue: { issue1: 'dernier_recours', issue2: 'dernier_recours', issue3: 'dernier_recours' }, concurrency: 1 });
  assert.ok(t.ok, 'le tour doit aboutir');
  assert.deepEqual(t.emis, ['issue1'], 'aucune vague nouvelle après la preuve');
  assert.equal(t.telemetry.early_stop, true);
  assert.equal(t.telemetry.early_stop_reason, 'FIRST_PRIORITY_LAST_RESORT_CONFIRMED');
  assert.equal(t.telemetry.early_stop_issue_id, 'issue1');
  assert.deepEqual(t.telemetry.not_executed_targets, ['issue2', 'issue3']);
  assert.equal(t.telemetry.not_executed_reason, 'NOT_EXECUTED_EARLY_STOP');
  assert.equal(t.telemetry.coverage_complete, false);
});

test('T-ESO01-B : concurrency=2 lance un batch spéculatif — RÉSULTAT GOUVERNÉ IDENTIQUE à A', async () => {
  const plan = { issue1: 'dernier_recours', issue2: 'dernier_recours', issue3: 'dernier_recours' };
  const a = await tour({ n: 3, parIssue: plan, concurrency: 1 });
  const b = await tour({ n: 3, parIssue: plan, concurrency: 2 });
  assert.deepEqual(b.emis, ['issue1', 'issue2'], 'la vague bornée part à deux, jamais plus');
  assert.equal(b.emis.length <= 2, true, 'CONCURRENCY_MAY_ONLY_ADD_ALREADY_IN_FLIGHT_SPECULATIVE_CALLS');
  assert.deepEqual(b.telemetry.speculative_targets, ['issue2'], 'issue2 est spéculative, jamais autoritaire');
  assert.deepEqual(b.telemetry.not_executed_targets, ['issue3']);
  /* L'INVARIANT CONSERVÉ : SEQUENTIAL_FINAL_GOVERNED_RESULT == CONCURRENT_FINAL_GOVERNED_RESULT. */
  assert.deepEqual(b.r, a.r, 'la concurrence ne change pas ce qu’Atelier décide');
  assert.deepEqual(b.telemetry.reviewed_targets, a.telemetry.reviewed_targets, 'même couverture autoritaire');
});

// --- C / D : L'ORDRE DE PRIORITÉ COMMANDE ---------------------------------------------------------

test('T-ESO01-C : cible 1 substituable, cible 2 dernier recours -> la gagnante est la cible 2', async () => {
  const t = await tour({ n: 3, parIssue: { issue1: 'substituable', issue2: 'dernier_recours', issue3: 'dernier_recours' }, concurrency: 1 });
  assert.ok(t.ok);
  assert.deepEqual(t.emis, ['issue1', 'issue2'], 'on continue tant que la question reste substituable');
  assert.equal(t.telemetry.early_stop_issue_id, 'issue2');
  assert.deepEqual(t.telemetry.reviewed_targets, ['issue1', 'issue2'], 'la couverture autoritaire va jusqu’à la gagnante');
  assert.deepEqual(t.telemetry.not_executed_targets, ['issue3']);
});

test('T-ESO01-D : cible 1 invalide -> AUCUN arrêt sur la cible 2, même dernier recours', async () => {
  /* Une priorité supérieure non résolue bloque la conclusion. Le tour échoue proprement au lieu
     de conclure sur une cible de rang inférieur. */
  const t = await tour({ n: 3, parIssue: { issue1: 'invalide', issue2: 'dernier_recours', issue3: 'dernier_recours' }, concurrency: 1 });
  assert.equal(t.ok, false, 'une revue prioritaire invalide reste gouvernée, jamais contournée');
  assert.notEqual(t.telemetry.early_stop_issue_id, 'issue2', 'la cible 2 ne peut pas conclure à la place de la cible 1');
});

// --- E : UN ÉCHEC SPÉCULATIF NE DÉGRADE RIEN ------------------------------------------------------

test('T-ESO01-E : cible 1 prouvée, cible 2 spéculative en panne -> la clarification est conservée', async () => {
  const t = await tour({ n: 3, parIssue: { issue1: 'dernier_recours', issue2: 'erreur', issue3: 'dernier_recours' }, concurrency: 2 });
  assert.ok(t.ok, 'un échec de priorité inférieure ne dégrade pas une clarification déjà établie');
  assert.equal(t.telemetry.early_stop_issue_id, 'issue1');
  assert.deepEqual(t.telemetry.reviewed_targets, ['issue1'], 'la sortie autoritaire ignore la spéculative en panne');
});

// --- F / G / H : CE QUI NE BOUGE PAS --------------------------------------------------------------

test('T-ESO01-F : aucune cible dernier recours -> couverture complète historique', async () => {
  const t = await tour({ n: 3, parIssue: { issue1: 'substituable', issue2: 'substituable', issue3: 'substituable' }, concurrency: 1 });
  assert.ok(t.ok);
  assert.deepEqual(t.emis, ['issue1', 'issue2', 'issue3'], 'sans preuve, tout est instruit comme avant');
  assert.equal(t.telemetry.early_stop, false);
  assert.equal(t.telemetry.coverage_complete, true);
  assert.deepEqual(t.telemetry.not_executed_targets, []);
});

test('T-ESO01-G : aucune issue material+question -> chemin READY inchangé, aucun batch', async () => {
  const t = await tour({ n: 0, parIssue: {}, concurrency: 2 });
  assert.ok(t.ok);
  assert.deepEqual(t.emis, [], 'aucun batch quand rien n’est à réviser');
  assert.equal(t.telemetry.early_stop, false);
  assert.equal(t.telemetry.coverage_complete, true);
});

test('T-ESO01-H : aucune vague nouvelle n’est jamais lancée après la décision d’arrêt', async () => {
  for (const limite of [1, 2]) {
    const t = await tour({ n: 6, parIssue: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`issue${i + 1}`, 'dernier_recours'])), concurrency: limite });
    assert.equal(t.emis.length, limite, `NO_NEW_CALLS_AFTER_EARLY_STOP_DECISION (limite=${limite})`);
    assert.equal(t.telemetry.batches_launched, limite);
    assert.equal(t.telemetry.batches_planned, 6);
  }
});
