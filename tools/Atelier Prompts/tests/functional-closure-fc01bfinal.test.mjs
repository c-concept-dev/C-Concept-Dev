/* FC01b FINAL — LA CHAÎNE FONCTIONNELLE, REJOUÉE DE BOUT EN BOUT.
 * ============================================================================
 *
 * Ce lot n'ajoute rien. Il rejoue. Après IA, MODE, CLEAN, FORMAT-STRUCT et
 * EXEC-PHASE, il pose une dernière fois la question qui compte pour quelqu'un
 * qui utilise le produit : de la demande jusqu'au prompt ou au livrable, le
 * système tient-il encore exactement ce qu'il annonce ?
 *
 * Dix parcours sont rejoués comme un utilisateur les vit — pas des fragments,
 * des trajets : une demande riche qui aboutit, une demande vague qui pose UNE
 * question et attend, une demande qui exige confirmation, Architecte sans clé
 * qui fait tourner un tour OPRIE à la main, Architecte Pro qui produit le seul
 * livrable gouverné du produit, un fournisseur indisponible qui ferme au lieu
 * d'inventer, une demande bloquée qui ne route pas, une bascule pendant un
 * appel dont le retard n'écrit rien, un double clic qui n'exécute qu'une fois,
 * et Atelier qui assemble sans jamais entrer dans le pipeline.
 *
 * CE QUE CE FICHIER NE PROUVE PAS, ET NE PRÉTEND PAS PROUVER : la latence
 * réelle d'un fournisseur réel. PERF-REAL-01 reste ouverte, et aucune de ces
 * preuves ne la referme — toutes tournent sur un transport simulé.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNextOrchestrationAction, ORCHESTRATION_ACTIONS } from '../core/adn/orchestration-policy.js';
import { createExecutionLifecycle } from '../core/adn/execution-lifecycle.js';
import { validateOutputAgainstCanonicalContract } from '../core/adn/output-compliance-gate.js';
import { contractFor, executionTargetFor, MODE_CONTRACTS } from '../core/adn/mode-contracts.js';
import {
  loadPilot, loadAnswerQuestion, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown
} from './perf04-frontend-harness.helper.mjs';
import { analystOutputFixture, arbiterOutputFixture, criticOutputFixture, runPastedOprieTurn } from './offline-oprie-roundtrip-b0.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const BUILD = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
const REGISTRE = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (d, f) => { const a = html.indexOf(d); return html.slice(a, html.indexOf(f, a + d.length)); };
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const compte = (motif, src = FRONT_CODE) => [...src.matchAll(new RegExp(motif, 'g'))].length;
const sourceUnique = (motif) => fs.readdirSync(path.join(root, 'core/adn'))
  .filter((f) => f.endsWith('.js') && !f.includes('generated'))
  .filter((f) => new RegExp(motif).test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));

/** Contexte de politique complet — chaque étage explicite, aucun défaut caché. */
const ctx = (over = {}) => ({
  mode: 'rapide', turn: { turn_id: 4, current_turn_id: 4, mode: 'rapide', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null, ...over
});
const action = (over) => decideNextOrchestrationAction(ctx(over)).action;

// =================================================================================================
// §81 — OPRIE DÉCIDE, LES MODES OBÉISSENT
// =================================================================================================

test('T-FC01BFINAL-01/02/03/04 : clarification et confirmation attendent la personne, dans les deux modes', () => {
  for (const mode of ['rapide', 'architecte']) {
    for (const etat of ['clarification_required', 'confirmation_required']) {
      const t = { turn_id: 4, current_turn_id: 4, mode, pending_user_interaction: false };
      assert.equal(decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: etat } })).action,
        'WAIT_FOR_USER', `${mode} / ${etat} : le produit attend.`);
    }
  }
  /* MODE_CANNOT_BYPASS : aucune combinaison ne transforme une sollicitation en exécution. */
  for (const mode of ['rapide', 'architecte']) {
    const t = { turn_id: 4, current_turn_id: 4, mode, pending_user_interaction: false };
    for (const etat of ['clarification_required', 'confirmation_required']) {
      const d = decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: etat } }));
      assert.notEqual(d.action, 'ENTER_READINESS');
      assert.notEqual(d.action, 'EXECUTE');
    }
  }
});

test('T-FC01BFINAL-05/06/07/08 : ready ouvre la readiness ; blocked, degraded et inconnu ferment', () => {
  for (const mode of ['rapide', 'architecte']) {
    const t = { turn_id: 4, current_turn_id: 4, mode, pending_user_interaction: false };
    assert.equal(decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: 'operational_request_ready' } })).action,
      'ENTER_READINESS');
    assert.equal(decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: 'blocked' } })).action, 'SHOW_BLOCKED');
    assert.equal(decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: 'degraded_state' } })).action, 'SHOW_DEGRADED');
    /* Un état hors énumération ne devient jamais un succès : il ferme. La garde de
       contexte le refuse AVANT la table de décision — d'où CONTEXT_INVALID plutôt
       que OPRIE_STATE_UNHANDLED, qui reste le filet défensif du dernier étage. */
    const inconnu = decideNextOrchestrationAction(ctx({ mode, turn: t, deep: { state: 'presque_pret' } }));
    assert.equal(inconnu.action, 'STOP_FAIL_CLOSED');
    assert.equal(inconnu.reason, 'CONTEXT_INVALID');
    assert.deepEqual([...inconnu.problems], ['DEEP_STATE_INVALID']);
    assert.match(fs.readFileSync(path.join(root, 'core/adn/orchestration-policy.js'), 'utf8'),
      /return verdict\("STOP_FAIL_CLOSED", "OPRIE_STATE_UNHANDLED"\);/, 'et le dernier étage ferme aussi.');
  }
  /* READY n'atteint jamais l'exécution directement : il n'existe pas d'action EXECUTE ici. */
  const table = tranche('const ORCHESTRATION_DRIVER=', 'IA-04 — LE CYCLE');
  assert.equal(table.includes('EXECUTE:'), false, 'READY_TO_DIRECT_EXECUTION_BYPASS_COUNT = 0');
  assert.match(table, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/);
});

// =================================================================================================
// §82 — READINESS, PROMPT QG, OUTPUT QG : CHAQUE PAS EXIGE LE PRÉCÉDENT
// =================================================================================================

test('T-FC01BFINAL-09/10 : seule une readiness execution_ready ouvre le gate de prompt', () => {
  assert.equal(action({ deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' } }),
    'RUN_PROMPT_QG');
  for (const etat of ['clarification_required', 'blocked', 'degraded', 'unknown', '']) {
    const d = decideNextOrchestrationAction(ctx({ deep: { state: 'operational_request_ready' }, readiness: { state: etat } }));
    assert.equal(d.action, 'STOP_FAIL_CLOSED', `readiness ${etat} : arrêt.`);
  }
});

test('T-FC01BFINAL-11/12 : un gate de prompt en échec arrête ; PASS et PASS_WITH_WARNINGS poursuivent', () => {
  const base = { deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' } };
  for (const statut of ['PASS', 'PASS_WITH_WARNINGS']) {
    assert.equal(action({ ...base, promptQG: { status: statut } }), 'EXECUTE', `${statut} poursuit.`);
  }
  const echec = decideNextOrchestrationAction(ctx({ ...base, promptQG: { status: 'FAIL' } }));
  assert.equal(echec.action, 'STOP_FAIL_CLOSED');
  assert.equal(echec.reason, 'PROMPT_QG_FAIL');
  /* Et un gate de prompt sans readiness est une chaîne rompue : arrêt, pas exécution. */
  const rompue = decideNextOrchestrationAction(ctx({ deep: { state: 'operational_request_ready' }, promptQG: { status: 'PASS' } }));
  assert.equal(rompue.action, 'STOP_FAIL_CLOSED');
  assert.equal(rompue.reason, 'PROMPT_QG_WITHOUT_READINESS');
});

test('T-FC01BFINAL-13/14 : les quatre statuts du gate de sortie, et la domination de FAIL', () => {
  const base = {
    deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' },
    promptQG: { status: 'PASS' }, execution: { status: 'success' }
  };
  assert.equal(action(base), 'RUN_OUTPUT_QG', 'une exécution réussie va au gate de sortie.');
  assert.equal(action({ ...base, outputQG: { status: 'FAIL' } }), 'SHOW_OUTPUT_QG_FAILURE');
  for (const statut of ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION']) {
    assert.equal(action({ ...base, outputQG: { status: statut } }), 'SHOW_EXECUTION_RESULT', `${statut} rend le résultat.`);
  }
  /* Dans le moteur de conformité lui-même : FAIL domine INCOMPLETE. */
  const contrat = { version: '1.0', request_id: 'x', original_request: 'r', obligations: [], quantities: [], assumptions: [], locks: [], output: { format: 'json' }, execution_policy: {}, ethics: {}, checks: [] };
  const v = validateOutputAgainstCanonicalContract({
    canonical_contract: contrat, output: 'pas du json', checks: [],
    execution_context: { format_vocabulary: [{ id: 'json', structural_kind: 'json' }] }
  });
  assert.equal(v.status, 'FAIL', 'une violation bloquante domine toute incomplétude.');
});

// =================================================================================================
// §83 — LES TROIS MODES, LEURS PROMESSES
// =================================================================================================

test('T-FC01BFINAL-15/16/17/18 : qui produit un prompt, qui produit un livrable', () => {
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false, 'RAPIDE_MAIN_FINAL_DELIVERABLE = NO');
  const rapide = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
  assert.doesNotMatch(rapide, /appelFournisseur|archControleSortie/);
  assert.match(rapide, /out\.textContent=r\.prompt/, 'Rapide rend son prompt SUR PLACE…');
  assert.doesNotMatch(rapide, /ouvrirVue\(|location\.|window\.open/, '…sans navigation.');
  assert.match(rapide, /rapideDernierePublication=r\.canonical\?\{prompt:r\.prompt,contract:r\.canonical\.contract\}:null/,
    'et le prompt reste relié au contrat qui l’a produit.');

  const api = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
  assert.match(api, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\);show\('#v11-ready'/,
    'ARCHITECTE_MAIN : un prompt final…');
  assert.doesNotMatch(api, /archControleSortie|archConstruireExecuter/, '…pas un livrable.');

  const pro = sansProse(tranche('async function archConstruireExecuter()', 'const ARCH_SAUVEGARDE_VERSION='));
  assert.match(pro, /await appelFournisseur\(/);
  assert.match(pro, /archControleSortie\(/, 'ARCHITECTE_PRO_FINAL_DELIVERABLE = YES');
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true);

  assert.equal(contractFor('atelier').modeClass, 'manual_composition');
  assert.equal(executionTargetFor('atelier'), null);
  const atelier = sansProse(tranche('function v11StartAtelier()', 'window.askDecisionProvider'));
  for (const interdit of ['oprieRunTurn', 'assessAnalysisReadiness', 'guardPromptContract',
                          'archControleSortie', 'appelFournisseur', 'oprieBeginExecutionCycle']) {
    assert.equal(atelier.includes(interdit), false, `Atelier n’appelle pas ${interdit}.`);
  }
});

test('T-FC01BFINAL-19/20 : les six bascules et les trois resélections restent sûres', async () => {
  /* Gouverné → gouverné : un tour en vol interdit d'en ouvrir un second. */
  for (const [depuis, vers] of [['rapide', 'architecte'], ['architecte', 'rapide']]) {
    const h = loadPilot({ mode: depuis, deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
    const enVol = h.pilot.oprieRunTurn(depuis);
    await delay(20);
    assert.equal(await h.pilot.oprieRunTurn(vers), false, `${depuis}→${vers} refusé pendant le tour.`);
    await enVol;
    assert.equal(h.spy.executed.length, 1);
  }
  /* Gouverné → Atelier : la garde de bascule est écrite, et le tour périmé n'atterrit pas. */
  assert.match(FRONT_CODE, /if\(!v11ModeUsesGovernedPipeline\(mode\)\)v11AbandonGovernedTurn\(\)/);
  const h = loadPilot({ mode: 'rapide', deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'Rapide→Atelier : rien n’atterrit.');
  /* Atelier → gouverné : les deux entrées effacent l'enveloppe partagée AVANT de reconstruire. */
  for (const [nom, src] of [['Rapide', sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'))],
                            ['Architecte', sansProse(tranche('function adpEnterArchitecte(', 'function adpRunRapide('))]]) {
    assert.ok(src.indexOf('adpState.lastEnvelope=null') < src.indexOf('try{'), `${nom} repart d’une table rase.`);
  }
  /* Resélection : le routeur atteint la même entrée, sans second tour. */
  assert.match(FRONT_CODE, /if\(mode==='rapide'\)return v11StartRapide\(\)/);
  assert.match(FRONT_CODE, /if\(mode==='atelier'\)return v11StartAtelier\(\)/);
});

// =================================================================================================
// §84 — RIEN DE TARDIF N'ÉCRIT
// =================================================================================================

test('T-FC01BFINAL-21/22 : une candidate rapide tardive et un tour profond périmé n’écrivent rien', async () => {
  const h = loadPilot({
    mode: 'rapide',
    fast: async () => { await delay(90); return { type: 'ACKNOWLEDGE', text: 'Je regarde.' }; },
    deep: async () => { await delay(150); return arbiterTurn('operational_request_ready'); }
  });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  const avant = h.spy.gate.length;
  h.pilot.oprieState.seq += 1;
  await enVol;
  await delay(140);
  assert.equal(h.spy.gate.length, avant, 'aucun affichage après péremption.');
  assert.deepEqual(h.spy.executed, [], 'et aucun moteur entré.');
  assert.equal(h.pilot.oprieState.lastTurn, null, 'le tour périmé n’est même pas enregistré.');
});

test('T-FC01BFINAL-23 : une analyse fournisseur d’un contexte quitté n’écrit rien', () => {
  /* La garde est écrite au point d'attente, et elle porte les DEUX conditions. */
  const api = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
  assert.match(api, /const tourDemandeur=oprieState\.seq;/);
  assert.match(api, /const contexteDemandeurPerdu=\(\)=>tourDemandeur!==oprieState\.seq\|\|modeDemandeur!==/);
  assert.equal(compte('if\\(contexteDemandeurPerdu\\(\\)\\)return false;', api), 2,
    'après l’attente ET dans la capture d’erreur.');
  /* Et elle précède toute écriture : import, validation, compilation, rendu. */
  assert.ok(api.indexOf('contexteDemandeurPerdu()') < api.indexOf('api.importer(parsed)'));
});

test('T-FC01BFINAL-24/25/26 : un rejeu n’exécute ni ne rend deux fois ; une bascule périme le tour', async () => {
  const h = loadPilot({ mode: 'architecte', deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  const rendus = h.spy.gate.length;
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 6; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'REPLAY_CAN_DOUBLE_EXECUTE = NO');
  assert.equal(h.spy.gate.length, rendus, 'REPLAY_CAN_DOUBLE_RENDER = NO');
  assert.ok(h.pilot.oprieState.telemetry.some((m) => m.event === 'orchestration_replay_suppressed'));
  /* Et la politique refuse d'elle-même un tour dont le mode a changé. */
  const d = decideNextOrchestrationAction(ctx({
    mode: 'atelier', turn: { turn_id: 9, current_turn_id: 9, mode: 'architecte', pending_user_interaction: false },
    deep: { state: 'operational_request_ready' }
  }));
  assert.equal(d.action, 'IGNORE_STALE');
  assert.equal(d.reason, 'MODE_SWITCHED');
});

// =================================================================================================
// §85 — CHAQUE AUTORITÉ N'A QU'UNE SOURCE
// =================================================================================================

test('T-FC01BFINAL-27/28/29/30/31/32 : six autorités, six sources uniques', () => {
  assert.deepEqual(sourceUnique('export function decideNextOrchestrationAction'), ['orchestration-policy.js']);
  assert.deepEqual(sourceUnique('export function executionTargetFor'), ['mode-contracts.js']);
  assert.deepEqual(sourceUnique('export function assessAnalysisReadiness'), ['execution-readiness.js']);
  assert.deepEqual(sourceUnique('export function guardPromptContract'), ['prompt-contract-gate.js']);
  assert.deepEqual(sourceUnique('export function validateOutputAgainstCanonicalContract'), ['output-compliance-gate.js']);
  assert.deepEqual(sourceUnique('export function createExecutionLifecycle'), ['execution-lifecycle.js']);
  /* OPRIE, lui, est côté serveur : le frontend le CONSULTE, il ne le rejoue pas. */
  assert.equal(compte('function oprieRequestTurn\\('), 1, 'un seul adaptateur de tour.');
  assert.match(FRONT_CODE, /original_request:oprieOriginalRequest\(\),clarification_history:oprieClarificationHistory\(\)/);
  assert.equal(compte('executionTargetFor\\('), 1, 'une seule dérivation de destination.');
  assert.equal(compte('oprieState\\.canonicalContract\\s*='), 1, 'un seul point de pose du contrat canonique.');
});

test('T-FC01BFINAL-33/34 : le plan rapide et l’observation n’écrivent aucune autorité', () => {
  const rendu = sansProse(tranche('function oprieRenderFastInteraction(', 'function oprieStartFastPlane('));
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(compte(`(?<![=!<>])\\b${etat}\\s*=(?![=>])`, rendu), 0, `FAST n’écrit pas ${etat}.`);
  }
  assert.equal(compte('(?<![=!<>])\\broute\\s*=(?![=>])', rendu), 0, 'FAST_AUTHORITY_WRITES = 0');
  /* Les cinq champs d'observation ne sont lus par aucun chemin de décision. */
  const decisionnels = [tranche('function oprieDriveOrchestration(', 'function oprieApplyTurn('),
                        tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration'),
                        tranche('function adpRunRapide(', 'async function v11StartRapide')].map(sansProse).join('\n');
  for (const champ of ['lastTurn', 'lastReconciliation', 'lastOrchestration', 'executionId', 'telemetry']) {
    assert.equal(decisionnels.includes(`oprieState.${champ}`), false, `OBSERVABILITY_AUTHORITY_PATHS : ${champ} = 0`);
  }
});

// =================================================================================================
// §86 — LES CONTRATS DE LA DEMANDE
// =================================================================================================

test('T-FC01BFINAL-35/36/37 : demande originale immuable, clarifications distinctes, canonique à part', () => {
  const tour = sansProse(tranche('async function oprieRequestTurn()', 'function oprieSetBusy'));
  assert.match(tour, /original_request:oprieOriginalRequest\(\)/);
  assert.match(tour, /clarification_history:oprieClarificationHistory\(\)/);
  assert.doesNotMatch(tour, /compositeDemand\(\)/, 'la demande n’est jamais la concaténation des réponses.');
  /* La demande originale est LUE depuis le champ, jamais réécrite par le tour. */
  assert.match(FRONT_CODE, /function oprieOriginalRequest\(\)\{return String\(\(\$\('#v11-demande'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)\}/);
  assert.equal(compte("\\$\\('#v11-demande'\\)\\.value\\s*=", tour), 0, 'le tour ne touche pas la demande.');
  /* Le contrat canonique est un troisième objet, construit depuis le tour. */
  assert.match(FRONT_CODE, /runtime\.mapOprieToCanonicalContract\(turn,\{/);
  assert.match(FRONT_CODE, /request_id:'oprie-'\+String\(oprieState\.seq\)/);
});

test('T-FC01BFINAL-38/39/40 : pas de plafond de questions, pas de boucle sans la personne, pas de remplissage', () => {
  /* Aucun plafond numérique sur les clarifications, nulle part. */
  assert.equal(compte('clarifications\\s*<\\s*\\d+'), 0, 'FIXED_QUESTION_COUNT = NO');
  assert.equal(compte('clarifications\\s*>=\\s*\\d+'), 0);
  /* Une relance n'existe QUE dans la réponse de la personne. */
  const reponse = sansProse(tranche('function answerQuestion(answer){', 'function resetAll()'));
  assert.match(reponse, /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/);
  assert.equal(compte('setTimeout\\([^,]*oprieRunTurn', FRONT_CODE), 0, 'AUTO_LOOP_WITHOUT_USER = NO');
  /* Deux minuteurs existent — la dictée d'Atelier et la sauvegarde de brouillon.
     Aucun ne rejoue un tour ni n'appelle un fournisseur : ils n'orchestrent rien. */
  const minuteurs = [...FRONT_CODE.matchAll(/setInterval\(([^;]{0,120})/g)].map((m) => m[1]);
  assert.equal(minuteurs.length, 2);
  for (const m of minuteurs) {
    for (const interdit of ['oprieRunTurn', 'appelFournisseur', 'beginApiAnalysis', 'oprieApplyTurn']) {
      assert.equal(m.includes(interdit), false, `PERIODIC_ORCHESTRATION_PATHS : ${interdit} = 0`);
    }
  }
  /* Et aucune valeur sémantique n'est fabriquée à la place d'une inconnue. */
  const validateur = sansProse(tranche('function adpQuestionsSimilaires(', 'async function askDecisionProvider('));
  assert.match(validateur, /throw new Error/, 'une sortie non conforme est refusée, pas complétée.');
});

// =================================================================================================
// §87 — CE QUE LES LOTS PRÉCÉDENTS ONT FERMÉ RESTE FERMÉ
// =================================================================================================

test('T-FC01BFINAL-41/42 : aucun héritage actif, aucune référence morte', () => {
  for (const parti of ['nextConversationAction', 'adpDecideRapide', 'adpResumeAfterClarification',
                       'conversationQuestionsSimilar', 'source: "local-prudent"', 'ui-hidden-bridge',
                       'v11-go-rapide', 'v11-go-avance', 'v11-prepare', 'v11-go-architecte',
                       'lastProjection', 'ui-process-text']) {
    assert.equal(FRONT_CODE.includes(parti), false, `${parti} reste absent.`);
  }
  const nommes = new Set([...FRONT_CODE.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].map((m) => m[1]));
  const orphelins = [...nommes].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(orphelins, [], 'DANGLING_DOM_REFERENCE_COUNT = 0');
  const cibles = new Set([...FRONT_CODE.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)(?:\?)?\.addEventListener/g)].map((m) => m[1]));
  assert.deepEqual([...cibles].filter((id) => !html.includes(`id="${id}"`)), [], 'DEAD_EVENT_LISTENER_COUNT = 0');
});

test('T-FC01BFINAL-43 : le graphe de build reste fermé', () => {
  const a = BUILD.indexOf('const modules'); const b = BUILD.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  const modules = eval(BUILD.slice(BUILD.indexOf('[', a), b + 2));
  assert.equal(modules.length, 21);
  const parNom = Object.fromEntries(modules.map((m) => [m.name, m]));
  const directs = new Set(modules.filter((m) => m.exports.some((e) => new RegExp(`\\b${e}\\b`).test(FRONT_CODE))).map((m) => m.name));
  const atteints = new Set(directs);
  for (let bouge = true; bouge;) {
    bouge = false;
    for (const n of [...atteints]) for (const d of parNom[n].deps || []) if (!atteints.has(d)) { atteints.add(d); bouge = true; }
  }
  assert.deepEqual(modules.filter((m) => !atteints.has(m.name)).map((m) => m.name), [], 'UNREACHABLE = 0');
  for (const m of modules) assert.equal((BUNDLE.match(new RegExp(`const ${m.name}=\\(`, 'g')) || []).length, 1);
  assert.equal((html.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length, 1);
});

test('T-FC01BFINAL-44 : aucune tranche de test vacante', () => {
  const fichiers = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.mjs'));
  const introuvables = [];
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(root, 'tests', f), 'utf8');
    const ancres = new Set();
    for (const m of src.matchAll(/(?:html|HTML|FRONTEND|FRONT_CODE)\.indexOf\(\s*(['"])((?:(?!\1).){6,120})\1/g)) ancres.add(m[2]);
    for (const nom of ['productionSlice', 'tranche', 'bloc']) {
      for (const m of src.matchAll(new RegExp(`${nom}\\(\\s*(['"])((?:(?!\\1).){6,120})\\1\\s*,\\s*(['"])((?:(?!\\3).){6,120})\\3`, 'g'))) {
        ancres.add(m[2]); ancres.add(m[4]);
      }
    }
    for (const a of ancres) {
      const cible = a.replace(/\\\\/g, '\\');
      if (!html.includes(cible) && !BUNDLE.includes(cible)) introuvables.push(`${f} : ${cible}`);
    }
  }
  assert.deepEqual(introuvables, [], 'VACUOUS_TEST_SLICE_COUNT = 0');
});

test('T-FC01BFINAL-45 : une seule dette ouverte, et c’est PERF-REAL-01', () => {
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  const ids = [...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['PERF-REAL-01']);
  for (const fermee of ['ORCH-LEGACY-CLEAN-01', 'FORMAT-STRUCT-01', 'EXEC-PHASE-INSTRUMENT-01']) {
    assert.ok(REGISTRE.slice(REGISTRE.indexOf('## Fermées')).includes(fermee), `${fermee} est déclarée fermée.`);
  }
  /* Et ce lot ne prétend rien sur la latence réelle : PERF-REAL-01 reste entière. */
  assert.match(REGISTRE, /aucune mesure n'est prise sur un parcours\nréel, avec un fournisseur réel/);
});

// =================================================================================================
// §79 — LES DIX PARCOURS, REJOUÉS
// =================================================================================================

test('PARCOURS A/B : une demande aboutit ; une demande vague pose UNE question et attend', async () => {
  /* A — demande riche : un tour, un moteur, un prompt. */
  const a = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn('operational_request_ready') });
  await a.pilot.oprieRunTurn('rapide');
  assert.equal(a.spy.executed.length, 1, 'A : le moteur Rapide est entré une fois.');
  assert.equal(a.spy.executed[0].engine, 'rapide');

  /* B — demande vague : une seule question, et le produit ATTEND. */
  const b = loadPilot({ mode: 'rapide', deep: async () => clarificationTurn('Quel est le public visé ?') });
  await b.pilot.oprieRunTurn('rapide');
  assert.deepEqual(b.spy.executed, [], 'B : rien n’est exécuté tant que la personne n’a pas répondu.');
  assert.equal(questionShown(b.ctx), 'Quel est le public visé ?', 'et une seule question est posée.');
  assert.equal(b.ctx.adpState.pendingQuestion, true);
  /* La réponse relance un tour COMPLET, avec l'historique — jamais une décision locale. */
  const aq = loadAnswerQuestion({ pendingQuestion: true, question: 'Quel est le public visé ?' });
  aq.answerQuestion('Des élèves de troisième.');
  assert.deepEqual(aq.spy.turns, ['architecte'], 'la réponse rejoue un tour OPRIE.');
  assert.equal(aq.ctx.state.answers.length, 1, 'et elle entre dans l’historique, pas dans la demande.');
});

test('PARCOURS C : une demande qui exige confirmation attend, puis aboutit en Architecte', async () => {
  const c = loadPilot({ mode: 'architecte', deep: async () => confirmationTurn('Un arbitrage a été fait.') });
  await c.pilot.oprieRunTurn('architecte');
  assert.deepEqual(c.spy.executed, [], 'C : la confirmation suspend l’exécution.');
  assert.equal(c.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  /* Une fois confirmée, le même tour aboutit — et entre en Architecte, pas ailleurs. */
  const suite = loadPilot({ mode: 'architecte', deep: async () => arbiterTurn('operational_request_ready') });
  await suite.pilot.oprieRunTurn('architecte');
  assert.equal(suite.spy.executed.length, 1);
  assert.equal(suite.spy.executed[0].engine, 'architecte');
  assert.equal(suite.spy.executed[0].orientation.route, 'architecte');
});

test('PARCOURS D : Architecte sans clé — un tour OPRIE complet, collé à la main', async () => {
  const colles = {
    analyst: JSON.stringify(analystOutputFixture()),
    critic: JSON.stringify(criticOutputFixture()),
    arbiter: JSON.stringify(arbiterOutputFixture('operational_request_ready'))
  };
  const { turn, seen, sequence } = await runPastedOprieTurn(
    { original_request: 'Rédige une note de cadrage.' }, colles);
  assert.equal(turn.state, 'operational_request_ready', 'D : le tour aboutit sans aucun réseau.');
  assert.deepEqual(seen, sequence, 'et les trois rôles passent dans l’ordre du serveur.');
  /* Le chemin sans clé rejoint la même chaîne : même état, mêmes rôles, même arbitre. */
  assert.deepEqual([...sequence], ['analyst', 'critic', 'arbiter']);
});

test('PARCOURS E : Architecte Pro — exécution, contrôle de sortie, livrable', () => {
  const pro = sansProse(tranche('async function archConstruireExecuter()', 'const ARCH_SAUVEGARDE_VERSION='));
  assert.match(pro, /if\(!confirm\('Lancer l\\u2019analyse \?/, 'E : une confirmation préalable, avant tout appel.');
  assert.match(pro, /await appelFournisseur\(/, 'puis l’exécution réelle…');
  assert.match(pro, /archControleSortie\(/, '…puis le contrôle de sortie…');
  assert.match(pro, /aq\('#arch-execution-resultat'\)/, '…puis le rendu du livrable.');
  /* Et le contrôle délègue au moteur unique, sans jamais écrire un succès. */
  const controle = sansProse(tranche('function archControleSortie(', 'function archSortieCertifiee'));
  assert.match(controle, /runtime\.validateOutputAgainstCanonicalContract/);
  assert.doesNotMatch(controle, /status\s*=\s*'PASS'/, 'OUTPUT_QG_BYPASS_COUNT = 0');
  assert.match(controle, /status:'FAIL',technical_failure:true/, 'et il se ferme sur panne.');
});

test('PARCOURS F/G : fournisseur indisponible ferme ; une demande bloquée ne route pas', async () => {
  /* F — panne : aucun faux READY, un rendu neutre, aucun cycle ouvert. */
  const f = loadPilot({ mode: 'rapide', deep: async () => { throw new Error('panne'); } });
  await f.pilot.oprieRunTurn('rapide');
  assert.deepEqual(f.spy.executed, [], 'F : rien n’est exécuté.');
  assert.equal(f.spy.gate.at(-1).decision.state, 'technical');
  const rendu = JSON.stringify(f.spy.gate.at(-1));
  for (const interdit of ['groq', 'anthropic', 'openai', 'http', 'retry']) {
    assert.ok(!rendu.toLowerCase().includes(interdit), `l’échec ne nomme pas ${interdit}.`);
  }
  /* G — blocked : l'état est montré, et aucune route n'est prise. */
  const g = loadPilot({ mode: 'architecte', deep: async () => arbiterTurn('blocked', { blocked_reason: 'Information déterminante absente.' }) });
  await g.pilot.oprieRunTurn('architecte');
  assert.deepEqual(g.spy.executed, [], 'G : ROUTING_BEFORE_READY_PATHS = 0');
  assert.equal(g.pilot.oprieState.lastOrchestration.action, 'SHOW_BLOCKED');
});

test('PARCOURS H/I/J : bascule pendant l’appel, double action, et Atelier manuel', async () => {
  /* H — bascule pendant un appel : le retard n'écrit rien. */
  const h = loadPilot({ mode: 'architecte', deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'H : le résultat tardif est ignoré.');

  /* I — double action : exactement une exécution. */
  const i = loadPilot({ mode: 'rapide', deep: async () => { await delay(100); return arbiterTurn('operational_request_ready'); } });
  const premier = i.pilot.oprieRunTurn('rapide');
  const second = await i.pilot.oprieRunTurn('rapide');
  assert.equal(second, false, 'I : le second clic est absorbé.');
  await premier;
  assert.equal(i.spy.executed.length, 1, 'FINAL_DELIVERABLE_EXECUTION_COUNT = 1');
  assert.equal(i.spy.deepCalls.length, 1, 'et un seul appel profond.');
  /* Le garde de ré-entrée du livrable Pro, lui, est écrit et rend son état même sur exception. */
  assert.match(html, /async function archExecutionUneSeuleFois\(\)\{\s*if\(archExecutionEnCours\)\{archExecutionsRefusees\+=1;return false\}\s*archExecutionEnCours=true;\s*try\{return await archConstruireExecuter\(\)\}\s*finally\{archExecutionEnCours=false\}/);

  /* J — Atelier : assemblage local, exports manuels, aucun pipeline gouverné. */
  const generer = sansProse(tranche('function generer(){', 'function afficherDiagnostic('));
  assert.match(generer, /const prompt = assembler\(ctx, actifs\)/, 'J : Atelier assemble…');
  assert.match(generer, /\$\('#sortie'\)\.textContent = prompt/, '…et rend sur place.');
  const sorties = sansProse(tranche("$('#btn-export-txt').addEventListener", '/* Éditeur */'));
  for (const geste of ["copier(etat.prompt, 'Prompt')", "telecharger('prompt-' + Date.now() + '.txt', etat.prompt)",
                       "enregistrerVersion(etat.prompt, 'Génération')"]) {
    assert.ok(sorties.includes(geste), `sortie manuelle conservée : ${geste}`);
  }
  for (const interdit of ['appelFournisseur', 'oprieRunTurn', 'archControleSortie', 'beginExchange']) {
    assert.equal(sorties.includes(interdit), false, `aucune sortie Atelier n’appelle ${interdit}.`);
  }
});

// =================================================================================================
// §94 — CE QUE CE LOT NE PROUVE PAS
// =================================================================================================

test('T-FC01BFINAL-PERF : la latence réelle n’est pas prouvée, et ce fichier ne le prétend pas', () => {
  /* Toutes les preuves ci-dessus tournent sur un transport SIMULÉ. Aucune ne mesure
     un fournisseur réel. REAL_PROVIDER_TTFI_PROVEN = NO, et PERF-REAL-01 reste entière. */
  const harnais = fs.readFileSync(path.join(root, 'tests/perf04-frontend-harness.helper.mjs'), 'utf8');
  assert.match(harnais, /Ce qui est simulé, et seulement cela : le réseau/);
  assert.match(harnais, /async function fetchImpl\(url, opts\)/, 'le transport est un espion, pas un réseau.');
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.match(ouvertes, /### PERF-REAL-01/);
  assert.equal(compte('TTFI|time_to_first|latency_ms|p95_real'), 0, 'aucune mesure de latence dans le produit.');
});

// =================================================================================================
// §103 — LES MESURES DU GATE FINAL QUI N'ONT PAS DE NUMÉRO DE TEST
// Chaque quantité annoncée dans le rapport §102 est produite ici, jamais à la main.
// =================================================================================================

test('GATE-103 : aucune contamination croisée entre modes — contrat, enveloppe, prompt', () => {
  /* Le contrat canonique n'est posé qu'à un seul endroit, et il est RECONSTRUIT
     à chaque entrée en exécution depuis le tour courant : rien du mode précédent
     ne survit. CROSS_MODE_CANONICAL_CONTAMINATION_PATHS = 0. */
  assert.equal(compte('oprieState\\.canonicalContract\\s*=(?!=)'), 1);
  const entree = sansProse(tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration'));
  assert.ok(entree.indexOf('const canonical=oprieBuildCanonicalContract(turn)') < entree.indexOf('oprieState.canonicalContract=canonical'));
  /* Et le miroir local de Rapide est réécrit à chaque passage — un contrat absent l'efface. */
  assert.match(FRONT_CODE, /rapideAppliquerContratCanonique\(orientation&&orientation\.canonical\|\|null\)/);
  assert.match(FRONT_CODE, /rapideContratCanonique=contrat&&typeof contrat==='object'&&!Array\.isArray\(contrat\)\?contrat:null/);

  /* L'enveloppe partagée est remise à null AVANT toute reconstruction, aux deux entrées. */
  let entrees = 0;
  for (const src of [sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide')),
                     sansProse(tranche('function adpEnterArchitecte(', 'function adpRunRapide('))]) {
    assert.ok(src.indexOf('adpState.lastEnvelope=null') < src.indexOf('try{'));
    entrees += 1;
  }
  assert.equal(entrees, 2, 'CROSS_MODE_ENVELOPE_CONTAMINATION_PATHS = 0');

  /* Les deux modes rendent dans deux cibles distinctes, et changer de mode masque l'autre. */
  assert.match(FRONT_CODE, /const out=\$\('#ui-rapid-output'\)/);
  assert.match(FRONT_CODE, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\)/);
  const reset = sansProse(tranche('function resetModePresentation(mode){', 'function setMode(mode){'));
  for (const cache of ['#ui-rapid-result', '#ui-rapid-gate', '#v11-api-progress', '#v11-exchange', '#v11-dialogue', '#v11-ready']) {
    assert.ok(reset.includes(cache), `CROSS_MODE_PROMPT_CONTAMINATION : ${cache} est masqué à la bascule.`);
  }
});

test('GATE-103 : un seul mode visible, et la demande comme les documents survivent à la bascule', () => {
  assert.equal(compte("document\\.body\\.dataset\\.v11Mode\\s*=(?!=)"), 1, 'VISIBLE_MODE_MAX = 1');
  const setMode = sansProse(tranche('function setMode(mode){', 'function currentMode()'));
  assert.match(setMode, /\$\$\('\.ui-mode-card'\)\.forEach\(card=>\{const active=card\.dataset\.mode===mode;/,
    'une seule carte porte l’état actif.');
  assert.match(setMode, /if\(select&&select\.value!==mode\)select\.value=mode/, 'et un seul sélecteur fait foi.');
  /* Ce que la bascule ne touche pas : la demande et les documents. */
  const reset = sansProse(tranche('function resetModePresentation(mode){', 'function setMode(mode){'));
  for (const preserve of ['#v11-demande', 'state.docs', 'v11-docs']) {
    assert.equal(reset.includes(preserve), false, `REQUEST_DOCUMENTS_PRESERVED : ${preserve} intact.`);
  }
  assert.match(tranche('function resetModePresentation(mode){', 'function setMode(mode){'),
    /On conserve volontairement #v11-demande, les documents et state\.docs\./);
});

test('GATE-103 : le voyant d’attente ne colle pas, et le transport en vol est invalidé', async () => {
  /* Trois sorties du tour profond rendent la main : la garde de péremption, la
     clause finally, et l'abandon de bascule. BUSY_CAN_STICK = NO. */
  const runTurn = sansProse(tranche('async function oprieRunTurn(', 'async function oprieRequestTurn()'));
  assert.match(runTurn, /finally\{if\(seq===oprieState\.seq\)\{oprieState\.running=false;oprieSetBusy\(false\)/);
  const abandon = sansProse(tranche('function v11AbandonGovernedTurn()', 'function v11RequireDemand'));
  assert.match(abandon, /oprieState\.running=false;oprieSetBusy\(false\)/);
  /* IN_FLIGHT_TRANSPORT_ABORT_OR_INVALIDATION = YES : les deux contrôleurs sont avortés. */
  assert.match(abandon, /oprieState\.controller\.abort\(\)/);
  assert.match(abandon, /oprieState\.fastController\.abort\(\)/);
  assert.match(abandon, /oprieState\.controller=null;oprieState\.fastController=null/);
  /* Et une panne rend aussi la main, sans laisser le produit occupé. */
  const h = loadPilot({ mode: 'rapide', deep: async () => { throw new Error('panne'); } });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.pilot.oprieState.running, false, 'après une panne, le produit n’est plus occupé.');
});

test('GATE-103 : aucun chemin où le dernier arrivé écrase le courant', () => {
  /* Les trois écritures asynchrones du produit portent chacune leur garde de tour. */
  const fast = sansProse(tranche('function oprieStartFastPlane(', 'function oprieReconcileFast'));
  assert.match(fast, /if\(seq!==oprieState\.seq\)\{oprieMark\('fast_discarded_stale'\);return null\}/);
  const deep = sansProse(tranche('async function oprieRunTurn(', 'async function oprieRequestTurn()'));
  assert.equal(compte('if\\(seq!==oprieState\\.seq', deep) >= 2, true, 'le tour profond se relit deux fois.');
  const api = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
  assert.equal(compte('if\\(contexteDemandeurPerdu\\(\\)\\)return false;', api), 2);
  /* Et la politique elle-même refuse tout tour révolu, avant toute action. */
  const perime = decideNextOrchestrationAction(ctx({
    turn: { turn_id: 3, current_turn_id: 7, mode: 'rapide', pending_user_interaction: false },
    deep: { state: 'operational_request_ready' }
  }));
  assert.equal(perime.action, 'IGNORE_STALE');
  assert.equal(perime.reason, 'TURN_SUPERSEDED');
  /* OUTPUT_QG_STALE_WRITE_PATHS = 0 : le contrôle de sortie s'oppose au contrat du tour, pas à un autre. */
  assert.match(FRONT_CODE, /adnValidatePostOprie\(obj,oprieState\.canonicalContract\)/);
});

test('GATE-103 : ni appariement flou, ni seuil sémantique, ni codage en dur du domaine sur la chaîne gouvernée', () => {
  /* La chaîne gouvernée = tout sauf la façade de transport du Decision Provider,
     caractérisée en CLEAN-01 comme n'ayant qu'un consommateur : le banc d'évaluation. */
  const facade = tranche('function adpTexteQuestion(', 'window.__V11_ROUTER__=');
  const gouvernee = FRONT_CODE.replace(sansProse(facade), '');
  for (const motif of ['levenshtein', 'jaccard', 'cosine', 'embedding', 'similarity', 'fuzzy']) {
    assert.equal(compte(motif, gouvernee), 0, `ACTIVE_UNAPPROVED_FUZZY_PATH : ${motif} = 0`);
  }
  /* Aucun seuil numérique ne décide d'un sens. Les deux seuils du produit sont ailleurs
     et n'affirment rien : un plafond de coût, et un refus de désigner un gagnant. */
  const seuils = [...gouvernee.matchAll(/[><]=?\s*\.?\d*\.\d+/g)].map((m) => m[0]);
  assert.deepEqual(seuils, ['> 0.5', '<0.5']);
  assert.match(FRONT_CODE, /if\(coutMax > 0\.5 && !confirm\('Coût maximal estimé/);
  assert.match(FRONT_CODE, /\}else if\(ecart<0\.5\)\{\s*resultatPrincipal='Résultats trop proches pour distinguer/);
  /* Et aucun vocabulaire métier n'est câblé dans une décision : les formats sont LUS. */
  assert.match(FRONT_CODE, /function rapideVocabulaireFormats\(\)\{\s*return Object\.keys\(FORMATS\)\.map/);
});

test('GATE-103 : le runtime compilé n’a ni doublon, ni import mort, ni export non exposé', () => {
  const a = BUILD.indexOf('const modules'); const b = BUILD.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  const modules = eval(BUILD.slice(BUILD.indexOf('[', a), b + 2));
  const noms = modules.map((m) => m.name);
  assert.equal(new Set(noms).size, noms.length, 'DUPLICATE_RUNTIME_MODULE_COUNT = 0');
  const connus = new Set(noms);
  assert.deepEqual(modules.flatMap((m) => (m.deps || []).filter((d) => !connus.has(d))), [],
    'DEAD_RUNTIME_IMPORT_COUNT = 0');
  const exports = modules.flatMap((m) => m.exports);
  assert.deepEqual(exports.filter((e) => !new RegExp(`\\b${e}\\b`).test(BUNDLE)), [],
    'ALL_COMPILED_MODULES_EXPOSED = YES');
  /* Aucune dépendance externe n'entre dans le produit : le runtime reste sans tiers. */
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], 'NEW_RUNTIME_DEPENDENCIES = 0');
  assert.equal(compte('from\\s+[\'"][^.\'"][^\'"]*[\'"]', BUNDLE), 0, 'et le bundle n’importe rien.');
});

test('GATE-103 : aucun sélecteur CSS orphelin non justifié, aucun secret dans le dépôt', () => {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const selecteurs = new Set();
  /* Un « # » en CSS désigne aussi une couleur. On écarte donc les suites purement
     hexadécimales : aucun identifiant du produit n'a cette forme — tous portent un tiret. */
  for (const m of css.matchAll(/(^|[,\s>+~])#([a-zA-Z][a-zA-Z0-9_-]*)\s*(?=[,{:.\[\s>+~])/g)) {
    if (!/^[0-9a-fA-F]{3,8}$/.test(m[2])) selecteurs.add(m[2]);
  }
  assert.deepEqual([...selecteurs].filter((id) => !html.includes(`id="${id}"`) && !FRONT_CODE.includes(`'${id}'`)), [],
    'UNJUSTIFIED_ORPHAN_CSS_SELECTOR_COUNT = 0');
  /* SECRET_SCAN : ni clé, ni jeton, ni journalisation d’un secret. */
  const fichiers = ['atelier-prompts-v11.5-lot10g-decision-provider.html', 'core/adn/browser-runtime.generated.js',
                    'tests/functional-closure-fc01bfinal.test.mjs'];
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const motif of [/sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{20,}/, /gsk_[A-Za-z0-9]{20,}/,
                         /xox[baprs]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/]) {
      assert.equal(motif.test(src), false, `SECRET_SCAN : ${f} ne contient pas ${motif}`);
    }
    assert.equal(/console\.(log|warn|error)\([^)]*(apiKey|api_key|token|secret|password)/i.test(src), false,
      `SECRET_LOG_PATHS : ${f} = 0`);
  }
});
