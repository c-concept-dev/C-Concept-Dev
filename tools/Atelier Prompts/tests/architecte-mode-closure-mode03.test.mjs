/* MODE-03 — LE COMPORTEMENT EFFECTIF DU MODE ARCHITECTE.
 * ============================================================================
 *
 * Architecte promet un accompagnement plus riche. Cette suite vérifie que la
 * richesse ne se paie NI en autorité (OPRIE reste seul maître des cinq états),
 * NI en gouvernance (Readiness et gates restent sur le chemin).
 *
 * Un fait mesuré, et dit sans le maquiller : le parcours PRINCIPAL du mode
 * s'arrête sur un PROMPT FINAL, comme Rapide. Le livrable et son contrôle de
 * sortie existent bien — mais dans l'onglet Architecte Pro, atteint par une
 * action distincte de la personne. Le contrat dit que le mode DISPOSE d'un
 * chemin de livrable ; il ne dit pas que le parcours principal en produit un.
 *
 * Un défaut fermé par ce lot : une entrée Architecte en échec laissait survivre
 * l'enveloppe d'un AUTRE mode, que la requête envoyée à l'IA aurait embarquée.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_CONTRACTS, contractFor, executionTargetFor, usesGovernedPipeline } from '../core/adn/mode-contracts.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { createExecutionLifecycle, assertExecutionProvenance, assertOutputProvenance } from '../core/adn/execution-lifecycle.js';
import { loadPilot, loadAnswerQuestion, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const ENTER_ARCH = sansProse(html.slice(html.indexOf('function adpEnterArchitecte('), html.indexOf('function adpRunRapide(')));
const ARCH_EXEC = sansProse(html.slice(html.indexOf('async function archConstruireExecuter()'), html.indexOf('const ARCH_SAUVEGARDE_VERSION=')));
const API_ANALYSE = sansProse(html.slice(html.indexOf('async function beginApiAnalysis()'), html.indexOf('async function beginExchange()')));
const ecritures = (nom, src = FRONT_CODE) => [...src.matchAll(new RegExp(`(?<![=!<>])\\b${nom}\\s*=(?![=>])`, 'g'))].length;

const A = (e = {}) => ({
  mode: 'architecte', turn: { turn_id: 6, current_turn_id: 6, mode: 'architecte', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null, ...e
});
const act = (e) => decideNextOrchestrationAction(A(e)).action;
const READY = { state: 'operational_request_ready' };
const READINESS_OK = { state: 'execution_ready' };
const QG_OK = { status: 'PASS' };

// =================================================================================================
// §74 — LE CONTRAT
// =================================================================================================

test('T-MODE03-01/02/03 : Architecte tient son contrat depuis la source unique', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  assert.equal(contractFor('architecte').modeClass, 'governed_execution');
  assert.equal(usesGovernedPipeline('architecte'), true);
  assert.equal(executionTargetFor('architecte'), 'architecte');
  assert.equal([...FRONT_CODE.matchAll(/executionTargetFor\(/g)].length, 1, 'une seule dérivation.');
});

test('T-MODE03-04 : aucun contrat Architecte fantôme', () => {
  for (const fantome of ['ARCHITECTE_CONFIG', 'ARCHITECTE_POLICY', 'ARCHITECTE_OPTIONS',
                         'ARCHITECTE_BEHAVIOR', 'architectePolicy', 'architecteContract']) {
    assert.equal(FRONT_CODE.includes(fantome), false, `${fantome} ne doit pas exister.`);
  }
});

test('T-MODE03-05 : Architecte ne porte aucune autorité sémantique', () => {
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat, ENTER_ARCH), 0, `${etat} dans adpEnterArchitecte`);
    assert.equal(ecritures(etat, ARCH_EXEC), 0, `${etat} dans archConstruireExecuter`);
  }
  assert.doesNotMatch(ENTER_ARCH, /decideNextOrchestrationAction|assessAnalysisReadiness/);
});

// =================================================================================================
// §75 — LE DIALOGUE
// =================================================================================================

test('T-MODE03-06/07 : clarification et confirmation attendent la personne', async () => {
  for (const [state, texte] of [['clarification_required', 'Pour quel public ?'], ['confirmation_required', 'Un arbitrage a été fait.']]) {
    const h = loadPilot({ mode: 'architecte', deep: async () => arbiterTurn(state, { next_question: { text: texte }, confirmation_reason: texte }) });
    await h.pilot.oprieRunTurn('architecte');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER', state);
    assert.equal(h.ctx.adpState.pendingQuestion, true);
    assert.deepEqual(h.spy.executed, []);
  }
});

test('T-MODE03-08/09 : autant de clarifications qu’OPRIE en demande, sans plafond', async () => {
  const suite = [clarificationTurn('Q1 ?'), clarificationTurn('Q2 ?'), clarificationTurn('Q3 ?'),
                 confirmationTurn('Motif.'), arbiterTurn('operational_request_ready')];
  let i = 0;
  const h = loadPilot({ mode: 'architecte', deep: async () => { const t = suite[Math.min(i, suite.length - 1)]; i += 1; return t; } });
  const actions = [];
  await h.pilot.oprieRunTurn('architecte');
  actions.push(h.pilot.oprieState.lastOrchestration.action);
  for (let n = 0; n < 4; n += 1) {
    h.ctx.state.answers.push({ question: questionShown(h.ctx), answer: `R${n + 1}` });
    h.ctx.adpState.pendingQuestion = false;
    await h.pilot.oprieRunTurn('architecte');
    actions.push(h.pilot.oprieState.lastOrchestration.action);
  }
  assert.deepEqual(actions, ['WAIT_FOR_USER', 'WAIT_FOR_USER', 'WAIT_FOR_USER', 'WAIT_FOR_USER', 'ENTER_READINESS']);
  assert.equal(h.spy.deepCalls.length, 5, 'cinq tours OPRIE complets.');
  assert.equal(h.spy.deepCalls[4].body.clarification_history.length, 4);
  for (const interdit of [/minQuestions/i, /maxQuestions/i, /targetQuestions/i, /questionCount/i,
                          /adpState\.clarifications\s*[<>]=?\s*\d/]) {
    assert.doesNotMatch(FRONT_CODE, interdit, interdit.toString());
  }
});

test('T-MODE03-10 : aucune boucle sémantique dans un même tour', () => {
  const drive = sansProse(html.slice(html.indexOf('function oprieDriveOrchestration'), html.indexOf('function oprieApplyTurn')));
  assert.doesNotMatch(drive, /while|oprieRunTurn|oprieApplyTurn/, 'le pilote applique puis rend la main.');
  assert.doesNotMatch(ENTER_ARCH, /while\s*\(|for\s*\(.*ready/i);
  /* Et une même action sur un même tour ne produit qu’un effet. */
  assert.match(drive, /oprieActionAlreadyApplied\(oprieState\.seq,action\)/);
});

test('T-MODE03-11/12 : répondre ou confirmer ouvre un tour NEUF', () => {
  const answer = sansProse(html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll()')));
  assert.match(answer, /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/, 'la réponse rouvre un tour complet.');
  assert.doesNotMatch(answer, /adpEnterArchitecte|adpRunRapide|appelFournisseur/, 'jamais une exécution directe.');
  const gardePos = answer.indexOf('if(oprieState.running)return;');
  assert.ok(gardePos >= 0 && gardePos < answer.indexOf('state.answers.push'));
});

// =================================================================================================
// §76 — FAST / DEEP
// =================================================================================================

test('T-MODE03-13 : la candidate rapide reste non autoritaire en Architecte', async () => {
  const h = loadPilot({ mode: 'architecte', fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
                        deep: async () => { await delay(80); return clarificationTurn('Q profonde ?'); } });
  const run = h.pilot.oprieRunTurn('architecte');
  await delay(25);
  const c = h.pilot.oprieState.fastInteraction;
  assert.equal(c.authority, 'candidate');
  assert.equal(c.can_execute, false);
  assert.equal(c.can_mark_ready, false);
  await run;
  assert.deepEqual(h.spy.executed, []);
});

test('T-MODE03-14/15 : panne rapide → le profond conclut ; panne profonde → rien n’est promu', async () => {
  const a = loadPilot({ mode: 'architecte', fast: async () => { throw new Error('KO'); }, deep: async () => clarificationTurn('Q ?') });
  await a.pilot.oprieRunTurn('architecte');
  assert.equal(a.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  const b = loadPilot({ mode: 'architecte', fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'x' }),
                        deep: async () => { await delay(40); throw new Error('KO'); } });
  await b.pilot.oprieRunTurn('architecte');
  assert.equal(b.pilot.oprieState.fastInteraction, null);
  assert.deepEqual(b.spy.executed, []);
});

test('T-MODE03-16/17 : candidate tardive et profond dépassé n’écrivent rien', async () => {
  const h = loadPilot({ mode: 'architecte',
    fast: async () => { await delay(110); return { type: 'ASK_CLARIFICATION', text: 'Tardive ?' }; },
    deep: async () => { await delay(20); return arbiterTurn('operational_request_ready'); } });
  await h.pilot.oprieRunTurn('architecte');
  const execs = h.spy.executed.length;
  await delay(130);
  assert.equal(h.spy.executed.length, execs);
  assert.ok(h.pilot.oprieState.telemetry.map((m) => m.event).includes('fast_discarded_concluded'));
  /* Et un profond d'un tour révolu est écarté. */
  assert.equal(decideNextOrchestrationAction({ ...A({ deep: READY }), turn: { turn_id: 2, current_turn_id: 9, mode: 'architecte' } }).action, 'IGNORE_STALE');
});

// =================================================================================================
// §77/§78 — READINESS ET GATE DE PROMPT
// =================================================================================================

test('T-MODE03-18..23 : la chaîne ne se saute à aucun étage', () => {
  assert.equal(act({ deep: READY }), 'ENTER_READINESS');
  assert.equal(act({ deep: READY, promptQG: QG_OK }), 'STOP_FAIL_CLOSED', 'pas de QG sans Readiness.');
  assert.equal(act({ deep: READY, readiness: READINESS_OK }), 'RUN_PROMPT_QG');
  for (const state of ['blocked', 'clarification_required', 'contractualization']) {
    assert.equal(act({ deep: READY, readiness: { state } }), 'STOP_FAIL_CLOSED', state);
  }
  assert.equal(act({ deep: READY, readiness: READINESS_OK, promptQG: QG_OK }), 'EXECUTE');
  assert.equal(act({ deep: READY, readiness: READINESS_OK, promptQG: { status: 'FAIL' } }), 'STOP_FAIL_CLOSED');
});

test('T-MODE03-24 : l’artefact contrôlé est celui qui est exécuté', () => {
  /* Dans le moteur : archCompiler() rend le prompt ET l'a soumis au gate ; c'est CE prompt qui est
     exécuté, et le contrat est capturé au même instant. */
  assert.match(ARCH_EXEC, /const prompt=archCompiler\(\);/);
  assert.match(ARCH_EXEC, /const contratExecute=archContratCanonique;/);
  assert.match(ARCH_EXEC, /contenuUtilisateur:prompt/, 'le prompt compilé est celui envoyé…');
  assert.match(ARCH_EXEC, /archControleSortie\(contratExecute,r\.texte\)/, '…et opposé au contrat capturé.');
  /* Le corps du compilateur est long : on borne sur son gate, pas sur une longueur devinée. */
  const compile = html.slice(html.indexOf('function archCompiler'), html.indexOf('function archSauver'));
  assert.match(compile, /archDerniereTraceQg=archTraceNative\(qgTrace,contrat\)/, 'la trace est native…');
  assert.match(compile, /const qgVerdict=archControleQg\(contrat,out,/, '…et le gate porte sur le prompt compilé.');
  /* La provenance est vérifiable structurellement. */
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'p1', execution_artifact_id: 'p1' }).allowed, true);
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'p1', execution_artifact_id: 'p2' }).allowed, false);
});

// =================================================================================================
// §79 — L'EXÉCUTION
// =================================================================================================

test('T-MODE03-25/26/27 : un seul moteur, une seule exécution, malgré les rappels', () => {
  assert.equal((html.match(/async function archConstruireExecuter\(\)/g) || []).length, 1);
  /* Le garde d'entrée IA-04 : quatre déclenchements, un cycle. */
  const garde = sansProse(html.slice(html.indexOf('let archExecutionEnCours=false;'), html.indexOf('function archDemarrer()')));
  assert.match(garde, /if\(archExecutionEnCours\)\{archExecutionsRefusees\+=1;return false\}/);
  assert.match(garde, /try\{return await archConstruireExecuter\(\)\}\s*finally\{archExecutionEnCours=false\}/);
  /* Et le registre de cycle interdit un second terminal. */
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  assert.equal(L.applyTerminal(execution_id, { k: 1 }).allowed, true);
  assert.equal(L.applyTerminal(execution_id, { k: 2 }).allowed, false);
});

test('T-MODE03-28/29/30 : reprises et bascule restent la même exécution ; aucun choix de fournisseur', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  for (let i = 0; i < 5; i += 1) L.recordProviderAttempt(execution_id);
  assert.equal(L.describe(execution_id).provider_attempts, 5);
  assert.equal(L.executionCount, 1, 'cinq tentatives, une exécution logique.');
  /* Le moteur n'énumère aucun fournisseur : il prend celui qui est actif. */
  assert.match(ARCH_EXEC, /obtenirFournisseurActif\(\)/);
  assert.doesNotMatch(ARCH_EXEC, /DECISION_PROVIDER_ORDER|\['groq'|"groq"/, 'aucune liste de fournisseurs ici.');
  const worker = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  assert.match(worker, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
});

test('T-MODE03-PROVIDER-SITES : les sites d’appel fournisseur du parcours sont dénombrés', () => {
  /* Le moteur Architecte n'appelle le fournisseur qu'UNE fois pour le livrable. */
  assert.equal((ARCH_EXEC.match(/await appelFournisseur\(/g) || []).length, 1);
  /* L'analyse, elle, est un autre appel logique, dans un autre bloc. */
  assert.equal((API_ANALYSE.match(/await window\.appelFournisseur\(/g) || []).length, 1);
});

// =================================================================================================
// §80 — LA SORTIE
// =================================================================================================

test('T-MODE03-31/32 : un succès passe par le contrôle de sortie, sur SON résultat', () => {
  const base = { deep: READY, readiness: READINESS_OK, promptQG: QG_OK };
  assert.equal(act({ ...base, execution: { status: 'success' } }), 'RUN_OUTPUT_QG');
  assert.equal(act({ ...base, outputQG: QG_OK }), 'STOP_FAIL_CLOSED', 'pas de contrôle sans exécution.');
  /* Dans le moteur : le contrôle porte sur r.texte, le résultat de CET appel. */
  assert.match(ARCH_EXEC, /const r=await appelFournisseur\([\s\S]{0,400}?archControleSortie\(contratExecute,r\.texte\)/);
  assert.equal(assertOutputProvenance({ execution_id: 3, output_execution_id: 3 }).allowed, true);
  assert.equal(assertOutputProvenance({ execution_id: 3, output_execution_id: 2 }).allowed, false);
});

test('T-MODE03-33..37 : les quatre verdicts restent distincts, et l’échec technique ferme', () => {
  const base = { deep: READY, readiness: READINESS_OK, promptQG: QG_OK, execution: { status: 'success' } };
  const vus = {};
  for (const status of ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL']) {
    const d = decideNextOrchestrationAction(A({ ...base, outputQG: { status } }));
    vus[status] = `${d.action}/${d.reason}`;
  }
  assert.equal(vus.FAIL, 'SHOW_OUTPUT_QG_FAILURE/OUTPUT_QG_FAIL');
  assert.equal(new Set(Object.values(vus)).size, 4);
  /* Côté produit : « conforme » n’est prononcé que sur deux statuts, et une panne du gate ferme. */
  assert.match(html, /function archSortieCertifiee/);
  const certif = html.slice(html.indexOf('function archSortieCertifiee'), html.indexOf('function archSortieCertifiee') + 300);
  assert.match(certif, /PASS_WITH_WARNINGS/);
  const controle = html.slice(html.indexOf('function archControleSortie('), html.indexOf('function archControleSortie(') + 900);
  assert.match(controle, /technical_failure:true/, 'une panne du gate produit un échec technique…');
  assert.doesNotMatch(controle, /status:'PASS'/, '…jamais un PASS supposé.');
  assert.equal((html.match(/function validateOutputAgainstCanonicalContract/g) || []).length, 1);
});

// =================================================================================================
// §81 — LE TERMINAL
// =================================================================================================

test('T-MODE03-38..42 : un seul rendu terminal, aucun dernier-qui-écrit-gagne', () => {
  /* Le moteur rend le résultat UNE fois par cycle, et le garde d'entrée empêche un second cycle. */
  assert.equal((ARCH_EXEC.match(/zone\.textContent=r\.texte/g) || []).length, 1);
  assert.equal((ARCH_EXEC.match(/archEtat\(archMessageSortie\(verdictSortie\)/g) || []).length, 1);
  /* Toute panne fournisseur reste technique : rien n'est fabriqué. */
  assert.match(ARCH_EXEC, /catch\(err\)\{[\s\S]{0,300}?archEtat\('Échec de l\\u2019exécution/);
  assert.doesNotMatch(ARCH_EXEC, /archControleSortie\([^)]*\)\s*;\s*}\s*catch/, 'aucun contrôle sur une sortie absente.');
  /* Et le verrou terminal du registre interdit la réécriture. */
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 2 });
  L.applyTerminal(execution_id, { qg_status: 'PASS' });
  const tardif = L.applyTerminal(execution_id, { technical_failure: true });
  assert.equal(tardif.allowed, false);
  assert.deepEqual(tardif.terminal, { qg_status: 'PASS' });
});

// =================================================================================================
// §82/§83 — LES BASCULES ET LA CONTAMINATION
// =================================================================================================

test('T-MODE03-43..46 : venir en Architecte, et en repartir, est sûr', async () => {
  const routeur = sansProse(html.slice(html.indexOf('window.__V11_ROUTER__'), html.indexOf('function init()')));
  assert.match(routeur, /return v11StartArchitecte\(\)/);
  const h = loadPilot({ mode: 'architecte', deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  h.ctx.adpState.requestedMode = 'rapide';
  await ancien;
  assert.deepEqual(h.spy.executed, [], 'l’ancien tour Architecte n’exécute pas dans le nouveau mode.');
  const d = decideNextOrchestrationAction({ ...A({ deep: READY }), mode: 'atelier', turn: { turn_id: 6, current_turn_id: 6, mode: 'architecte' } });
  assert.equal(d.reason, 'MODE_SWITCHED');
});

test('T-MODE03-47..50 : demande et documents survivent ; un seul mode visible ; aucun résidu', () => {
  const reset = html.slice(html.indexOf('function resetModePresentation('), html.indexOf('function setMode('));
  assert.match(reset, /On conserve volontairement #v11-demande/);
  assert.doesNotMatch(sansProse(reset), /state\.docs\s*=|#v11-demande'\)\.value=/);
  /* Les panneaux mutuellement exclusifs sont TOUS masqués : la liste de reset couvre celle de show. */
  /* On compare l'ensemble RÉELLEMENT masqué par show() — son tableau de panneaux — et non toute
     mention d'identifiant : #v11-start-card et #v11-demande y sont des cibles de DÉFILEMENT, pas
     des panneaux à cacher. Les confondre reprocherait au reset de ne pas masquer la demande, que
     le produit conserve délibérément. */
  const showBody = html.slice(html.indexOf('function show(id,focusTarget){'), html.indexOf('function toast('));
  const masquesParShow = JSON.parse(showBody.slice(showBody.indexOf('['), showBody.indexOf(']') + 1).replace(/'/g, '"'));
  assert.deepEqual(masquesParShow, ['#v11-api-progress', '#v11-exchange', '#v11-dialogue', '#v11-ready']);
  const resetList = new Set((reset.match(/#(v11|ui-rapid)-[a-z-]+/g) || []));
  for (const p of masquesParShow) assert.ok(resetList.has(p), `${p} doit être masqué à la bascule.`);
  assert.ok(resetList.has('#ui-rapid-result') && resetList.has('#ui-rapid-gate'), 'et les panneaux Rapide aussi.');
  const set = sansProse(html.slice(html.indexOf('function setMode('), html.indexOf('function currentMode()')));
  assert.match(set, /classList\.toggle\('is-active',active\)/);
});

test('T-MODE03-51/52 : l’enveloppe fabriquée d’Atelier ne peut PAS contaminer Architecte', () => {
  /* Défaut mesuré et fermé : le catch laissait survivre l'enveloppe du mode précédent — celle
     d'Atelier porte un etat_demande fabriqué, et makeEnvelope() la lit pour composer la requête
     envoyée à l'IA. On efface AVANT de tenter. */
  assert.match(ENTER_ARCH, /adpState\.lastEnvelope=null;/, 'l’entrée Architecte repart d’une table rase.');
  const posEfface = ENTER_ARCH.indexOf('adpState.lastEnvelope=null');
  const posTry = ENTER_ARCH.indexOf('try{');
  assert.ok(posEfface < posTry, 'et l’effacement précède la tentative, pas l’inverse.');
  /* La requête OPRIE, elle, n'a jamais porté que la demande et l'historique. */
  const req = sansProse(html.slice(html.indexOf('async function oprieRequestTurn()'), html.indexOf('function oprieSetBusy')));
  assert.match(req, /original_request:oprieOriginalRequest\(\),clarification_history:oprieClarificationHistory\(\)/);
  assert.doesNotMatch(req, /lastEnvelope|lastProjection|etat_demande/);
  /* Et le mode Atelier ne peut pas déclencher une exécution Architecte. */
  assert.equal(executionTargetFor('atelier'), null);
});

// =================================================================================================
// §84/§85 — AUTORITÉS ET ANCIEN CHEMIN
// =================================================================================================

test('T-MODE03-53..56 : Architecte n’écrit aucune autorité', () => {
  for (const src of [ENTER_ARCH, ARCH_EXEC, API_ANALYSE]) {
    for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                        'degraded_state', 'execution_ready']) {
      assert.equal(ecritures(etat, src), 0, etat);
    }
    assert.equal(ecritures('route', src), 0);
  }
  /* Le validateur post-OPRIE SIGNALE, il ne décide pas — et l'analyse s'arrête s'il signale. */
  assert.match(API_ANALYSE, /adnValidatePostOprie\(obj,oprieState\.canonicalContract\)/);
  assert.match(API_ANALYSE, /if\(stopSignals\.length\)\{show\(null,'#v11-demande'\);return adnShowPostOprieStop\(stopSignals\)\}/);
});

test('T-MODE03-57/58 : l’ancien chemin ne définit aucune politique Architecte active', () => {
  /* CLEAN-01 : l'ancien chemin est retiré ; l'absence remplace l'inertie. */
  assert.equal([...FRONT_CODE.matchAll(/adnNextConversationAction/g)].length, 0);
  assert.doesNotMatch(ENTER_ARCH, /adnNextConversationAction|adpDecideRapide|conversationQuestionsSimilar/);
  assert.doesNotMatch(ARCH_EXEC, /adnNextConversationAction|conversationQuestionsSimilar/);
  assert.equal(html.includes('source: "local-prudent"'), false, 'le repli hérité est retiré…');
  assert.doesNotMatch(ENTER_ARCH + ARCH_EXEC, /local-prudent/, '…et n’a jamais touché Architecte.');
});

// =================================================================================================
// §86/§87 — AIDES ET LIMITE ASSUMÉE
// =================================================================================================

test('T-MODE03-59/60 : aucun contrôle d’aide actif purement cosmétique', () => {
  /* CLEAN-02 : la « visée des porteurs réels » vivait dans cibleAide — une fonction que
     PERSONNE n'appelait. Elle est retirée. Ce qui reste est le gestionnaire délégué, lui
     bien branché, et c'est lui que ce test mesure désormais. */
  assert.equal((html.match(/class="[^"]*aide-btn[^"]*"/g) || []).length, 0, 'aucun bouton d’aide statique.');
  assert.equal(FRONT_CODE.includes('cibleAide'), false, 'plus de viseur inutilisé.');
  const aides = FRONT_CODE.slice(FRONT_CODE.indexOf('function brancherAides()'), FRONT_CODE.indexOf('function brancherAides()') + 1400);
  assert.match(aides, /closest\('\.aide-btn'\)/, 'le gestionnaire délégué vise le bouton d’aide.');
  assert.match(aides, /addEventListener\('focusin'/, 'et il est réellement branché.');
});

test('T-MODE03-61 : EXEC-PHASE-INSTRUMENT-01 reste ouverte, et rien n’a été injecté dans la plage gelée', () => {
  const debut = html.indexOf('function archContexte(){');
  const fin = html.indexOf('const ARCH_SAUVEGARDE_VERSION=', debut);
  const gelee = html.slice(debut, fin);
  for (const nom of ['archConstruireExecuter', 'archControleQg', 'archControleSortie', 'archCompiler']) {
    assert.ok(html.indexOf('function ' + nom) > debut && html.indexOf('function ' + nom) < fin, `${nom} est gelé.`);
  }
  for (const marque of ['enterPhase', 'createExecutionLifecycle', 'applyTerminal', 'recordProviderAttempt',
                        'executionTargetFor', 'decideNextOrchestrationAction']) {
    assert.equal(gelee.includes(marque), false, `${marque} n’a PAS été injecté dans la plage gelée.`);
  }
  /* Ce qui est prouvé reste l'unicité de l'ENTRÉE, hors plage gelée. */
  assert.ok(html.indexOf('let archExecutionEnCours=false;') > fin);
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8'));
  assert.equal(baseline.hashes['moteur Architecte'], 'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e');
});

// =================================================================================================
// CE QUE LE PARCOURS PRODUIT VRAIMENT — dit sans le maquiller
// =================================================================================================

test('T-MODE03-LIVRABLE : le parcours principal s’arrête au PROMPT ; le livrable est une action distincte', () => {
  /* Mesuré : l'entrée du mode conduit à l'échange, puis — avec clé — à une analyse fournisseur qui
     se termine sur un PROMPT FINAL affiché. Aucun livrable, aucun contrôle de sortie sur ce chemin. */
  assert.match(ENTER_ARCH, /return adpContinueArchitecte\(\)/);
  assert.match(API_ANALYSE, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\);show\('#v11-ready'/);
  assert.doesNotMatch(API_ANALYSE, /archControleSortie|archConstruireExecuter/,
    'le parcours principal ne produit pas de livrable.');
  /* Le livrable existe, mais derrière une action distincte de la personne. */
  assert.match(html, /aq\('#arch-construire-executer'\)\.addEventListener\('click',archExecutionUneSeuleFois\)/);
  assert.match(ARCH_EXEC, /await appelFournisseur\(/);
  assert.match(ARCH_EXEC, /archControleSortie\(/);
  /* Le contrat dit que le mode DISPOSE d'un chemin de livrable — ce qui est vrai, et distingue
     réellement Architecte de Rapide. */
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true);
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false);
});

test('T-MODE03-NOHEURISTIQUE : aucun flou, seuil ou domaine sur le parcours Architecte', () => {
  for (const src of [ENTER_ARCH, API_ANALYSE]) {
    for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                            /cosine/i, /levenshtein/i, /fuzzy/i, /case_id/i,
                            /voyage|medical|juridique|travel|recette/i]) {
      assert.doesNotMatch(src, interdit, interdit.toString());
    }
  }
});
