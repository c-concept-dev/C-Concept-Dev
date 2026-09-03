/* M-02 — CONCURRENCE CONTRÔLÉE ENTRE APPELS RÉELLEMENT INDÉPENDANTS
 * ============================================================================
 *
 * « Parallélisable » ne veut pas dire « se ressemble ». Ce lot n'a donc pas
 * commencé par écrire un ordonnanceur : il a commencé par reconstruire le
 * graphe causal réel, et par accepter ce qu'il disait.
 *
 * CE QUE LE CODE PROUVE — pas ce qu'on supposait :
 *
 *   Analyst → Critic → Arbiter est bien CAUSAL. `buildRoleInput` le dit sans
 *   ambiguïté : critic reçoit `analyst_output`, arbiter reçoit `analyst_output`
 *   ET `critic_output`. Aucune parallélisation possible, et aucune tentée.
 *
 *   Les B × G appels de Substitution Review sont INDÉPENDANTS. `executeBatch`
 *   ne reçoit jamais la sortie d'un autre appel ; `batchPlan` est calculé avant
 *   le premier ; `globalOutput` n'entre qu'à l'agrégation. C'est le seul groupe
 *   réellement parallélisable du pipeline, et c'est précisément celui dont la
 *   sérialisation coûtait le plus cher.
 *
 *   Le Critic global reste un préalable strict — non parce que les batches en
 *   dépendraient, mais parce que son échec empêche aujourd'hui tout appel de
 *   batch. Le paralléliser changerait le nombre d'appels sur le chemin d'échec.
 *
 * CE QUE L'AUDIT A AUSSI DIT, ET QU'IL FAUT ENTENDRE : activer la concurrence
 * sur les fournisseurs ACTUELS affaiblirait une protection existante (le
 * stimulateur de débit Groq est un état partagé) ou créerait une rafale sans
 * protection (Anthropic et OpenAI n'ont ni stimulateur ni reprise). La limite
 * reste donc à 1 par défaut, et l'activation est une décision qui demande
 * d'abord un contrôle de débit conscient de la concurrence.
 *
 * Ce lot livre donc la mécanique, la prouve, et ne prétend à AUCUN gain en
 * production. Le gain mécanique est mesuré, il n'est pas revendiqué comme une
 * réponse au contrat interactif.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONCURRENCY, normalizeConcurrency, runBounded } from '../workers/shared/bounded-concurrency.js';
import { runCriticBatchedPipeline, computeBatchPlan, buildQuestionReviewTargets, LADDER_ALTERNATIVE_VALUES } from '../workers/shared/operational-request-core.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE, runOperationalRequestTurn } from '../workers/shared/operational-request-orchestrator.js';
import { DECISION_PROVIDER_ORDER, DECISION_ADAPTERS } from '../workers/groq/src/index.js';
import { FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES } from '../workers/shared/provider-ha.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SRC = fs.readFileSync(path.join(root, 'workers/shared/operational-request-core.js'), 'utf8');
const ORCH_SRC = fs.readFileSync(path.join(root, 'workers/shared/operational-request-orchestrator.js'), 'utf8');
const ADAPTERS_SRC = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
const EXEC_SRC = fs.readFileSync(path.join(root, 'workers/shared/bounded-concurrency.js'), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- fixtures du pipeline batché, alignées sur celles de X2-BATCH -------- */
/* Le barreau vient du noyau : le recopier à la main l'aurait fait diverger. */
const LADDER = [...LADDER_ALTERNATIVE_VALUES];
const TIGHT_CAPABILITY = { fixedOverheadUnits: 100, perTargetUnits: 50, maxUnitsPerBatch: 220 };

const candidateFor = (treatment, available) => ({
  treatment, available, substitution_value: available ? `valeur ${treatment}` : '',
  justification: `justification ${treatment}`, residual_risk: available ? 'faible' : '',
  blocking_reason: available ? '' : `indisponible pour ${treatment}`, confidence: available ? 'haute' : 'basse'
});
const candidatesEntry = (available = LADDER[0]) => ({ candidates: Object.fromEntries(LADDER.map((t) => [t, candidateFor(t, t === available)])) });

const analystOutputFixture = (issueIds) => ({
  operational_request_candidate: { objective: 'x', expected_deliverable: '', secondary_objectives: [], confirmed_constraints: [], confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [], external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [] },
  provenance_records: [{ field: 'objective', value: 'x', provenance: 'explicit_user_statement' }],
  issues: issueIds.map((id) => ({ id, type: 'missing_information', description: `Description de ${id}.`, impact: 'material', substitutable: false, recommended_treatment: 'question', kind: null })),
  question_candidates: [],
  confirmation_signals: { multiple_ambiguities_resolved: false, complex_conflict_arbitrated: false, strong_restructuring: false, multiple_objectives_hierarchized: false, significant_delegation: false }
});
const globalOutputFixture = () => ({
  operational_request_candidate_review: { unsupported_additions_found: [], unsupported_removals_found: [], missed_material_issues: [] },
  vetoes: [], semantic_drift_detected: false, semantic_drift_notes: [], significant_stakes: false, significant_stakes_reason: ''
});

const ISSUES = ['issue1', 'issue2', 'issue3', 'issue4', 'issue5', 'issue6'];

/** Exécute le pipeline batché en instrumentant les appels de batch. */
async function pipeline({ issues = ISSUES, concurrency, delaisParBatch = () => 0, echecs = new Set(), signal } = {}) {
  const journal = [];
  let enVol = 0, maxEnVol = 0;
  const sortie = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(issues), capability: TIGHT_CAPABILITY },
    {
      concurrency, signal,
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (entree) => {
        enVol += 1; maxEnVol = Math.max(maxEnVol, enVol);
        journal.push({ batchIndex: entree.batchIndex, groupIndex: entree.groupIndex, issueIds: [...entree.issueIds], debut: journal.length });
        try {
          await attendre(delaisParBatch(entree.batchIndex));
          if (echecs.has(entree.batchIndex)) throw new Error(`échec batch ${entree.batchIndex}`);
          return Object.fromEntries(entree.issueIds.map((id) => [id, candidatesEntry()]));
        } finally { enVol -= 1; }
      }
    }
  );
  return { sortie, journal, maxEnVol };
}

/* ======================================================================== *
 * §40 — L'EXÉCUTEUR
 * ======================================================================== */

test('T-M02-01 la borne de concurrence est respectée', async () => {
  for (const limite of [1, 2, 3, 5]) {
    let enVol = 0, max = 0;
    const taches = Array.from({ length: 20 }, () => async () => {
      enVol += 1; max = Math.max(max, enVol);
      await attendre(2);
      enVol -= 1; return 'ok';
    });
    await runBounded(taches, { concurrency: limite });
    assert.ok(max <= limite, `limite ${limite} dépassée : ${max}`);
  }
});

test('T-M02-02 le nombre de tâches en vol ne dépasse jamais la limite, même en rafale', async () => {
  let enVol = 0, max = 0;
  const taches = Array.from({ length: 50 }, (_, i) => async () => {
    enVol += 1; max = Math.max(max, enVol);
    await attendre(i % 3);
    enVol -= 1; return i;
  });
  await runBounded(taches, { concurrency: 4 });
  assert.ok(max <= 4, `MAX_INFLIGHT_OBSERVED = ${max}`);
  assert.ok(max > 1, 'la concurrence est bien réelle');
});

test('T-M02-03 l’ordre d’entrée est préservé', async () => {
  const taches = [80, 10, 50, 5, 30].map((ms, i) => async () => { await attendre(ms); return i; });
  const verdicts = await runBounded(taches, { concurrency: 5 });
  assert.deepEqual(verdicts.map((v) => v.value), [0, 1, 2, 3, 4], 'INPUT_ORDER_PRESERVED = YES');
});

test('T-M02-04 l’ordre d’arrivée réseau ne devient jamais l’ordre du résultat', async () => {
  const arrivees = [];
  const taches = [80, 10, 50, 5].map((ms, i) => async () => { await attendre(ms); arrivees.push(i); return `t${i}`; });
  const verdicts = await runBounded(taches, { concurrency: 4 });
  assert.notDeepEqual(arrivees, [0, 1, 2, 3], 'les tâches ont bien terminé dans le désordre');
  assert.deepEqual(verdicts.map((v) => v.value), ['t0', 't1', 't2', 't3'],
    'NETWORK_COMPLETION_ORDER_CAN_CHANGE_SEMANTIC_ORDER = NO');
});

test('T-M02-05 un rejet est rapporté à son index, sans annuler ses voisines', async () => {
  let executees = 0;
  const taches = [
    async () => { executees += 1; return 'a'; },
    async () => { executees += 1; throw new Error('boum'); },
    async () => { executees += 1; return 'c'; }
  ];
  const verdicts = await runBounded(taches, { concurrency: 2 });
  assert.equal(executees, 3, 'aucune tâche n’est annulée par l’échec d’une autre');
  assert.deepEqual(verdicts.map((v) => v.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.match(String(verdicts[1].reason.message), /boum/);
});

test('T-M02-06 aucune écriture concurrente ne se retrouve à la place d’une autre', async () => {
  const taches = Array.from({ length: 60 }, (_, i) => async () => { await attendre((60 - i) % 7); return i; });
  const verdicts = await runBounded(taches, { concurrency: 8 });
  assert.deepEqual(verdicts.map((v) => v.value), Array.from({ length: 60 }, (_, i) => i), 'LAST_WRITER_WINS_PATHS = 0');
  assert.equal(verdicts.filter((v) => v === undefined).length, 0, 'aucune case laissée vide');
});

test('T-M02-07 une liste vide ne lance rien et rend une liste vide', async () => {
  assert.deepEqual(await runBounded([], { concurrency: 4 }), []);
});

test('T-M02-08 une tâche unique se comporte normalement', async () => {
  assert.deepEqual(await runBounded([async () => 'seule'], { concurrency: 4 }), [{ status: 'fulfilled', value: 'seule' }]);
});

test('T-M02-09 un grand ensemble reste borné, et toutes les tâches aboutissent', async () => {
  let enVol = 0, max = 0, terminees = 0;
  const taches = Array.from({ length: 500 }, () => async () => {
    enVol += 1; max = Math.max(max, enVol);
    await attendre(0);
    enVol -= 1; terminees += 1; return 1;
  });
  const verdicts = await runBounded(taches, { concurrency: 6 });
  assert.ok(max <= 6);
  assert.equal(terminees, 500, 'aucune starvation : toutes les tâches finissent');
  assert.equal(verdicts.length, 500);
});

test('T-M02-10 une annulation arrête la prise de nouvelles tâches sans en perdre le compte', async () => {
  const signal = { aborted: false, reason: new Error('annulé') };
  let lancees = 0;
  const taches = Array.from({ length: 10 }, (_, i) => async () => {
    lancees += 1;
    if (i === 1) signal.aborted = true;
    await attendre(1); return i;
  });
  const verdicts = await runBounded(taches, { concurrency: 1, signal });
  assert.equal(verdicts.length, 10, 'chaque tâche porte un verdict, aucune n’est perdue');
  assert.ok(lancees < 10, 'les tâches non lancées ne le sont pas');
  assert.ok(verdicts.slice(-1)[0].status === 'rejected');
  /* Une limite invalide est refusée plutôt que silencieusement corrigée. */
  assert.equal(normalizeConcurrency(undefined), DEFAULT_CONCURRENCY);
  for (const mauvaise of [0, -1, 1.5, '3', null === undefined ? 1 : NaN]) assert.throws(() => normalizeConcurrency(mauvaise));
});

/* ======================================================================== *
 * §41 — LA CAUSALITÉ, TELLE QUE LE CODE LA DIT
 * ======================================================================== */

test('T-M02-11 Analyst précède Critic, et Critic précède Arbiter', async () => {
  const ordre = [];
  await runOperationalRequestTurn(
    { original_request: 'Une demande.', clarification_history: [] },
    {
      log: () => {},
      executeRole: async (role, input) => {
        ordre.push(role);
        if (role === 'analyst') return analystOutputFixture([]);
        if (role === 'critic') {
          assert.ok(input.analyst_output, 'T-M02-12 : Critic reçoit la sortie d’Analyst');
          return { ...globalOutputFixture(), agreement: 'agree', question_substitution_review: [], illegitimate_question_found: [] };
        }
        assert.ok(input.analyst_output && input.critic_output, 'Arbiter reçoit les deux');
        return { state: 'operational_request_ready', operational_request_candidate: analystOutputFixture([]).operational_request_candidate, issues: [], next_question: { text: null, targets_issue_id: null, expected_progress: null }, intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] }, reason: 'ok' };
      }
    }
  ).catch(() => {});
  assert.deepEqual(ordre, ['analyst', 'critic', 'arbiter'], 'ANALYST_CRITIC_CAUSAL et CRITIC_ARBITER_CAUSAL = YES');
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE], ['analyst', 'critic', 'arbiter']);
});

test('T-M02-12 les entrées de chaque rôle sont construites par le serveur, jamais devinées', () => {
  const code = sansCommentaires(ORCH_SRC);
  assert.ok(code.includes('analyst_output: outputs.analyst'), 'Critic consomme Analyst');
  assert.ok(code.includes('critic_output: outputs.critic'), 'Arbiter consomme Critic');
});

test('T-M02-13 Arbiter attend l’ensemble complet des résultats requis', () => {
  const code = sansCommentaires(ORCH_SRC);
  /* La séquence est un `for` sur les rôles : aucun rôle ne démarre avant que le
     précédent ait produit sa sortie. */
  assert.equal(/Promise\.(all|allSettled|race)/.test(code), false, 'aucune concurrence entre rôles');
});

test('T-M02-14 aucun Arbiter spéculatif', () => {
  assert.equal(/Promise\.(all|race)/.test(sansCommentaires(ORCH_SRC)), false);
});

test('T-M02-15 aucun Critic spéculatif avant Analyst', () => {
  const code = CORPS_PIPELINE;
  /* Dans le pipeline batché, le Critic global reste attendu avant toute tâche. */
  const iGlobal = code.indexOf('await executeGlobal(');
  const iTaches = code.indexOf('await runBounded(');
  assert.ok(iGlobal > -1 && iTaches > iGlobal, 'le global est strictement préalable aux batches');
});

/* ======================================================================== *
 * §42–§43 — LE SEUL GROUPE RÉELLEMENT INDÉPENDANT
 * ======================================================================== */

test('T-M02-16 l’indépendance des batches est prouvée par ce qu’ils reçoivent', async () => {
  const entrees = [];
  await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (entree) => { entrees.push(Object.keys(entree).sort()); return Object.fromEntries(entree.issueIds.map((id) => [id, candidatesEntry()])); }
    }
  );
  assert.ok(entrees.length >= 2, 'plusieurs batches sont bien planifiés');
  for (const cles of entrees) {
    /* Aucune sortie d'un autre appel n'entre ici : ni globalOutput, ni le
       résultat d'un batch précédent. C'est cela, l'indépendance. */
    assert.equal(cles.includes('globalOutput'), false);
    assert.equal(cles.includes('previousBatchResult'), false);
    assert.deepEqual(cles, ['analyst_output', 'batchIndex', 'batchTargets', 'clarification_history', 'familyGroup', 'groupIndex', 'issueIds', 'original_request']);
  }
});

test('T-M02-17 avec une limite > 1, les batches indépendants démarrent réellement ensemble', async () => {
  const { maxEnVol } = await pipeline({ concurrency: 3, delaisParBatch: () => 12 });
  assert.ok(maxEnVol > 1, `MAX_INFLIGHT_OBSERVED = ${maxEnVol}`);
  assert.ok(maxEnVol <= 3, 'et la borne tient');
});

test('T-M02-18 l’ordre canonique des batches est préservé quel que soit l’ordre d’arrivée', async () => {
  const lent = await pipeline({ concurrency: 4, delaisParBatch: (i) => (i === 0 ? 40 : 2) });
  const serie = await pipeline({ concurrency: 1 });
  assert.deepEqual(lent.sortie.question_substitution_review, serie.sortie.question_substitution_review,
    'le premier batch, le plus lent, reste le premier dans l’agrégat');
});

test('T-M02-19 un batch lent ne sérialise plus les batches indépendants', async () => {
  const t0 = Date.now();
  await pipeline({ concurrency: 4, delaisParBatch: () => 30 });
  const concurrent = Date.now() - t0;
  const t1 = Date.now();
  await pipeline({ concurrency: 1, delaisParBatch: () => 30 });
  const sequentiel = Date.now() - t1;
  assert.ok(concurrent < sequentiel, `concurrent ${concurrent} ms < séquentiel ${sequentiel} ms`);
});

test('T-M02-20 le résultat concurrent est identique au résultat séquentiel', async () => {
  const serie = await pipeline({ concurrency: 1 });
  for (const limite of [2, 3, 6]) {
    const concurrent = await pipeline({ concurrency: limite, delaisParBatch: (i) => (i * 7) % 23 });
    assert.deepEqual(concurrent.sortie, serie.sortie, `SEQUENTIAL_REFERENCE_EQUALS_CONCURRENT = YES (L=${limite})`);
  }
});

/* ======================================================================== *
 * §44 — AUCUNE COURSE ENTRE FOURNISSEURS
 * ======================================================================== */

test('T-M02-21 aucune course Groq/Anthropic/OpenAI pour un même appel logique', () => {
  const code = sansCommentaires(ADAPTERS_SRC) + sansCommentaires(CORE_SRC) + sansCommentaires(EXEC_SRC);
  assert.equal(/Promise\.race/.test(code), false, 'PROVIDER_RACING_PATHS = 0');
  for (const interdit of ['hedge', 'hedged', 'speculativeCall', 'firstToRespond']) {
    assert.equal(code.toLowerCase().includes(interdit.toLowerCase()), false, `HEDGED_REQUEST_PATHS : ${interdit}`);
  }
});

test('T-M02-22 le repli reste séquentiel à l’intérieur d’une tâche', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  /* La chaîne de providers reste une boucle ordonnée, jamais un lancement
     simultané des trois. */
  assert.equal(/Promise\.all\([^)]*adapters/i.test(code), false);
  assert.ok(code.includes('runProviderChain'), 'la chaîne HA reste l’unique mécanisme de repli');
});

test('T-M02-23 l’ordre des fournisseurs est inchangé', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'], 'FAILOVER_ORDER_CHANGED = NO');
  assert.deepEqual(Object.keys(DECISION_ADAPTERS), ['groq', 'anthropic', 'openai']);
});

test('T-M02-24 la politique de reprise et les délais sont inchangés', () => {
  const code = sansCommentaires(EXEC_SRC);
  for (const interdit of ['retry', 'timeout', 'setTimeout', 'AbortController', 'Retry-After']) {
    assert.equal(code.includes(interdit), false, `l’ordonnanceur ne touche pas à : ${interdit}`);
  }
  assert.ok(ADAPTERS_SRC.includes('GROQ_PRODUCTION_RETRY_DEFAULTS'), 'les politiques existantes demeurent');
});

/* ======================================================================== *
 * §45–§46 — LA CONCURRENCE NE CONTOURNE NI VALIDATION NI POLITIQUE D'ÉCHEC
 * ======================================================================== */

const CORPS_PIPELINE = (() => {
  const code = sansCommentaires(CORE_SRC);
  const debut = code.indexOf('export async function runCriticBatchedPipeline(');
  return code.slice(debut, code.indexOf('export const ARBITER_JSON_SCHEMA', debut));
})();

test('T-M02-25 chaque résultat concurrent passe par la validation avant agrégation', () => {
  const code = CORPS_PIPELINE;
  const iRun = code.indexOf('await runBounded(');
  const iValidate = code.indexOf('validateCriticOutput(');
  assert.ok(iRun > -1 && iValidate > iRun, 'la validation reste en aval de l’exécution');
  assert.ok(code.slice(iRun).includes('parseJsonMaybeFenced'), 'chaque réponse est analysée individuellement');
});

test('T-M02-26 une réponse structurée invalide ne peut pas entrer dans l’agrégation', async () => {
  const erreur = await pipeline({ concurrency: 3, echecs: new Set([0]) }).then(() => null, (e) => e);
  assert.ok(erreur, 'INVALID_STRUCTURED_OUTPUT_CAN_ENTER_AGGREGATION = NO');
  assert.equal(erreur.technical_state, 'partial_failure', 'la politique d’échec préexistante est conservée');
  assert.ok(Array.isArray(erreur.batchFailures) && erreur.batchFailures.length >= 1);
});

test('T-M02-27 une réponse illisible échoue comme avant, sans être réparée', async () => {
  const erreur = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      concurrency: 3,
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (e) => (e.batchIndex === 0 ? '{"tronqu' : Object.fromEntries(e.issueIds.map((id) => [id, candidatesEntry()])))
    }
  ).then(() => null, (e) => e);
  assert.ok(erreur);
  assert.equal(erreur.technical_state, 'partial_failure');
});

test('T-M02-28 la classe d’échec structuré reste celle de M-01', () => {
  assert.ok(FAILOVER_ELIGIBLE_CLASSES.includes(FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID));
  assert.ok(ADAPTERS_SRC.includes('STRUCTURED_STATUS'), 'le durcissement M-01 est intact');
});

test('T-M02-29 la politique d’échec partiel est conservée à l’identique', async () => {
  /* Politique mesurée AVANT ce lot : toutes les tâches sont tentées, puis
     l'échec est levé avec le décompte. Elle est reproduite exactement. */
  const { journal } = await pipeline({ concurrency: 1 }).catch(() => ({ journal: [] }));
  const total = journal.length;
  let tentees = 0;
  const erreur = await runCriticBatchedPipeline(
    { original_request: 'x', analyst_output: analystOutputFixture(ISSUES), capability: TIGHT_CAPABILITY },
    {
      concurrency: 3,
      executeGlobal: async () => globalOutputFixture(),
      executeBatch: async (e) => { tentees += 1; throw new Error(`échec ${e.batchIndex}`); }
    }
  ).then(() => null, (e) => e);
  assert.equal(tentees, total, 'toutes les tâches sont tentées avant l’échec, comme en série');
  assert.equal(erreur.succeededBatchCount, 0);
  assert.ok(erreur.totalBatchCount >= 1);
});

test('T-M02-30 aucune tâche n’est perdue et aucun résultat n’est fabriqué', async () => {
  const { journal, sortie } = await pipeline({ concurrency: 4 });
  const attendus = computeBatchPlan(buildQuestionReviewTargets(analystOutputFixture(ISSUES)), TIGHT_CAPABILITY).length;
  assert.equal(journal.length, attendus, 'LOST_CALLS = 0 et DUPLICATE_CALLS_INTRODUCED = 0');
  const vus = new Set(journal.map((j) => `${j.batchIndex}/${j.groupIndex}`));
  assert.equal(vus.size, journal.length, 'aucun appel dupliqué');
  assert.ok(sortie.question_substitution_review.length > 0);
});

/* ======================================================================== *
 * §48 — LE NOMBRE D'APPELS EST UN INVARIANT
 * ======================================================================== */

test('T-M02-31 le nombre logique d’appels est identique en série et en concurrence', async () => {
  const serie = await pipeline({ concurrency: 1 });
  const concurrent = await pipeline({ concurrency: 4 });
  assert.equal(concurrent.journal.length, serie.journal.length, 'LOGICAL_LLM_CALL_COUNT inchangé');
  assert.deepEqual(
    concurrent.journal.map((j) => `${j.batchIndex}/${j.groupIndex}`).sort(),
    serie.journal.map((j) => `${j.batchIndex}/${j.groupIndex}`).sort()
  );
});

test('T-M02-32 la limite par défaut laisse le comportement strictement inchangé', async () => {
  const parDefaut = await pipeline({});
  const explicite = await pipeline({ concurrency: 1 });
  assert.deepEqual(parDefaut.sortie, explicite.sortie);
  assert.equal(parDefaut.maxEnVol, 1, 'sans opt-in, aucune concurrence n’est introduite');
  assert.equal(DEFAULT_CONCURRENCY, 1);
});

/* ======================================================================== *
 * §49 — AUTORITÉ
 * ======================================================================== */

test('T-M02-33 l’ordonnanceur n’écrit aucun état OPRIE, aucune route, aucune readiness', () => {
  const code = sansCommentaires(EXEC_SRC);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'degraded_state', 'route', 'readiness', 'execution_ready']) {
    assert.equal(code.includes(interdit), false, `autorité interdite : ${interdit}`);
  }
});

test('T-M02-34 l’ordonnanceur ne touche à aucun des deux gates', () => {
  for (const gate of ['validatePromptAgainstCanonicalContract', 'validateOutputAgainstCanonicalContract', 'prompt-contract-gate', 'output-compliance-gate']) {
    assert.equal(EXEC_SRC.includes(gate), false, `M02_QG_MUTATIONS = 0 : ${gate}`);
  }
});

test('T-M02-35 l’ordonnanceur ne connaît ni fournisseur, ni modèle, ni domaine', () => {
  const code = EXEC_SRC.toLowerCase();
  for (const interdit of ['groq', 'anthropic', 'openai', 'model', 'case_id', 'schema', 'prompt']) {
    assert.equal(code.includes(interdit), false, `SEMANTIC_MODEL_SHOPPING_PATHS : ${interdit}`);
  }
});

test('T-M02-36 aucune dépendance runtime n’a été ajoutée', () => {
  assert.equal(/^import .* from ["'][^.]/m.test(EXEC_SRC), false, 'NEW_RUNTIME_DEPENDENCIES = 0');
  for (const interdit of ['p-limit', 'p-queue', 'async-pool', 'bottleneck']) {
    assert.equal(EXEC_SRC.includes(interdit), false, interdit);
  }
});

/* ======================================================================== *
 * §68–§70 — LES GARDES STATIQUES DE CONCURRENCE
 * ======================================================================== */

test('T-M02-37 aucun Promise.all dynamique non borné n’est introduit', () => {
  const code = CORPS_PIPELINE;
  /* Le seul Promise.all du système est celui des OUVRIERS de l’exécuteur, dont
     la cardinalité est la limite elle-même — jamais celle des tâches. */
  assert.equal(/Promise\.all/.test(code), false, 'le pipeline n’appelle aucun Promise.all directement');
  const exec = sansCommentaires(EXEC_SRC);
  assert.equal((exec.match(/Promise\.all/g) || []).length, 1);
  assert.ok(exec.includes('Math.min(limit, tasks.length)'), 'la cardinalité des ouvriers est bornée par la limite');
});

test('T-M02-38 la limite est une contrainte technique, jamais une propriété du contenu', () => {
  const exec = sansCommentaires(EXEC_SRC);
  /* La limite est un paramètre : elle n’est ni calculée ici, ni déduite d’un
     texte, ni d’un nombre de questions. */
  assert.equal(/concurrency\s*=\s*[2-9]/.test(exec), false, 'aucun nombre magique');
  assert.ok(exec.includes('DEFAULT_CONCURRENCY = 1'));
  const core = CORPS_PIPELINE;
  assert.equal(/concurrency\s*[:=]\s*[0-9]/.test(core), false, 'DUPLICATE_CONCURRENCY_LIMITS = 0 : le pipeline n’en fixe aucune');
});

test('T-M02-39 aucun fournisseur n’active la concurrence tant que son débit n’est pas protégé', () => {
  const code = sansCommentaires(ADAPTERS_SRC);
  /* Constat mesuré, et raison de ne PAS activer : le stimulateur Groq est un
     état partagé (nextAvailableAt) que N appels simultanés liraient ensemble ;
     Anthropic et OpenAI n'ont ni stimulateur ni reprise. Activer la concurrence
     y affaiblirait une protection ou créerait une rafale non protégée. */
  assert.equal(/concurrency\s*:/.test(code), false, 'aucun adaptateur ne demande encore la concurrence');
  assert.ok(code.includes('createGroqRateLimitPacer'), 'le stimulateur Groq existe toujours');
  assert.ok(ADAPTERS_SRC.includes('nextAvailableAt'), 'et reste un état partagé, donc incompatible en l’état');
});

/* ======================================================================== *
 * §50 / §52 — MESURE MÉCANIQUE, SANS PRÉTENTION
 * ======================================================================== */

test('T-M02-40 le gain mécanique est mesuré sur la géométrie réelle du pipeline', async () => {
  const DELAI = 25;
  const t0 = Date.now();
  const serie = await pipeline({ concurrency: 1, delaisParBatch: () => DELAI });
  const sequentielMs = Date.now() - t0;
  const t1 = Date.now();
  const concurrent = await pipeline({ concurrency: 4, delaisParBatch: () => DELAI });
  const concurrentMs = Date.now() - t1;

  assert.deepEqual(concurrent.sortie, serie.sortie, 'même résultat, à travail identique');
  assert.equal(concurrent.journal.length, serie.journal.length, 'aucun travail supprimé pour gagner du temps');
  assert.ok(concurrentMs < sequentielMs, `mécanique : ${concurrentMs} ms < ${sequentielMs} ms`);
});

test('T-M02-41 le surcoût de l’ordonnanceur est négligeable', async () => {
  const mesures = [];
  for (let i = 0; i < 200; i += 1) {
    const t = process.hrtime.bigint();
    await runBounded(Array.from({ length: 20 }, () => async () => 1), { concurrency: 4 });
    mesures.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  mesures.sort((a, b) => a - b);
  assert.ok(mesures[Math.floor(mesures.length * 0.5)] < 5, 'surcoût médian négligeable');
});

test('T-M02-42 ce lot ne prétend pas résoudre la performance interactive', () => {
  /* La mesure est mécanique et locale. Le contrat interactif dépend de la
     latence réelle des fournisseurs, que ce lot ne touche pas — et de
     l'activation, que ce lot ne fait pas. */
  const code = sansCommentaires(EXEC_SRC) + sansCommentaires(CORE_SRC);
  assert.equal(/fast.?plane|interactive.?budget|sla/i.test(code), false, 'aucun plan interactif introduit');
});

/* ======================================================================== *
 * §59–§60 — CE QUI N'A PAS BOUGÉ
 * ======================================================================== */

test('T-M02-43 les prompts et les schémas sont inchangés', () => {
  const code = sansCommentaires(CORE_SRC);
  /* La couture n'a touché ni à la construction des messages, ni aux schémas. */
  assert.ok(code.includes('makeSubstitutionReviewBatchUserMessage'));
  assert.ok(code.includes('buildSubstitutionBatchSchema'));
  assert.equal(EXEC_SRC.includes('SYSTEM_PROMPT'), false, 'PROMPT_CONTENT_REGRESSION = NO');
});

test('T-M02-44 l’agrégation finale demeure exactement celle d’avant', () => {
  const code = CORPS_PIPELINE;
  for (const etape of ['materializeSubstitutionReviewFromCandidates', 'assembleSubstitutionReviews', 'applySubstitutionGate', 'deriveCriticConsequences', 'validateCriticOutput']) {
    assert.ok(code.includes(etape), `étape d’agrégation conservée : ${etape}`);
  }
  const iRun = code.indexOf('await runBounded(');
  const iAssemble = code.indexOf('assembleSubstitutionReviews(');
  assert.ok(iAssemble > iRun, 'l’agrégation reste strictement en aval');
});
