/* MODE-02 — LE COMPORTEMENT EFFECTIF DU MODE RAPIDE.
 * ============================================================================
 *
 * Rapide promet l'immédiateté. Cette suite vérifie que la promesse est tenue
 * SANS être payée par la gouvernance : le parcours reste soumis à OPRIE, à
 * Execution Readiness et au gate de prompt, et n'invente aucune sémantique.
 *
 * Deux écarts mesurés ont été fermés par ce lot, et sont épinglés ici :
 *
 *   LE CONTRAT AFFIRMAIT UN LIVRABLE QUE LE PARCOURS NE PRODUIT PAS. Rapide
 *   rend un PROMPT sur place ; le livrable naît ailleurs. `true` était faux.
 *
 *   LE PROMPT DU PARCOURS PRINCIPAL N'ÉTAIT OPPOSABLE À AUCUN CONTRAT. La voie
 *   historique posait le couple {prompt, contrat} ; la voie principale ne le
 *   posait pas — une sortie issue de ce prompt ne pouvait donc être vérifiée.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE_CONTRACTS, contractFor, executionTargetFor, usesGovernedPipeline } from '../core/adn/mode-contracts.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, loadAnswerQuestion, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const RUN_RAPIDE = sansProse(html.slice(html.indexOf('function adpRunRapide('), html.indexOf('async function adpResumeAfterClarification')));
const ecritures = (nom, src = FRONT_CODE) => [...src.matchAll(new RegExp(`(?<![=!<>])\\b${nom}\\s*=(?![=>])`, 'g'))].length;

const R = (e = {}) => ({
  mode: 'rapide', turn: { turn_id: 4, current_turn_id: 4, mode: 'rapide', pending_user_interaction: false },
  fast: null, deep: null, readiness: null, promptQG: null, execution: null, outputQG: null, ...e
});
const act = (e) => decideNextOrchestrationAction(R(e)).action;

// =================================================================================================
// §62 — CONTRAT ET ENTRÉE
// =================================================================================================

test('T-MODE02-01/02/03 : Rapide tient son contrat depuis la source unique', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  assert.equal(contractFor('rapide').modeClass, 'governed_execution');
  assert.equal(usesGovernedPipeline('rapide'), true);
  assert.equal(executionTargetFor('rapide'), 'rapide');
  /* La destination est LUE, jamais redérivée dans le frontend. */
  assert.equal([...FRONT_CODE.matchAll(/executionTargetFor\(/g)].length, 1);
  assert.doesNotMatch(FRONT_CODE, /requestedMode==='architecte'\?'architecte':'rapide'/);
});

test('T-MODE02-04 : aucun contrat Rapide fantôme', () => {
  for (const fantome of ['RAPIDE_CONFIG', 'RAPIDE_OPTIONS', 'RAPIDE_POLICY', 'RAPIDE_BEHAVIOR',
                         'rapidePolicy', 'rapideContract', 'rapideMode']) {
    assert.equal(FRONT_CODE.includes(fantome), false, `${fantome} ne doit pas exister.`);
  }
});

test('T-MODE02-05 : Rapide ne porte aucune autorité sémantique', () => {
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat), 0, etat);
    assert.equal(ecritures(etat, RUN_RAPIDE), 0, `${etat} dans adpRunRapide`);
  }
  /* Le moteur Rapide ne rejuge ni readiness, ni gate : il les traverse. */
  assert.doesNotMatch(RUN_RAPIDE, /assessAnalysisReadiness|guardPromptContract|decideNextOrchestrationAction/);
});

// =================================================================================================
// §63 — L'IMMÉDIATETÉ, MESURÉE
// =================================================================================================

test('T-MODE02-06 : choisir Rapide n’active qu’un seul mode visible', () => {
  const set = sansProse(html.slice(html.indexOf('function setMode('), html.indexOf('function currentMode()')));
  assert.match(set, /classList\.toggle\('is-active',active\)/, 'un seul actif, les autres désactivés.');
  assert.match(set, /setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(set, /resetModePresentation\(mode\)/);
});

test('T-MODE02-07/08 : la présentation de l’ancien mode est retirée au passage en Rapide', () => {
  const reset = sansProse(html.slice(html.indexOf('function resetModePresentation('), html.indexOf('function setMode(')));
  /* Panneaux Architecte et Atelier explicitement masqués. */
  for (const panneau of ['#v11-exchange', '#v11-dialogue', '#v11-ready', '#v11-api-progress',
                         '#ui-rapid-result', '#ui-rapid-gate']) {
    assert.ok(reset.includes(panneau), `${panneau} est masqué à la bascule.`);
  }
  assert.match(reset, /document\.body\.dataset\.v11Mode=mode/, 'et le mode actif est marqué sur le document.');
});

test('T-MODE02-09/10/11 : la demande et les documents survivent au passage en Rapide', () => {
  const reset = html.slice(html.indexOf('function resetModePresentation('), html.indexOf('function setMode('));
  assert.match(reset, /On conserve volontairement #v11-demande/,
    'la conservation est une décision écrite, pas un effet de bord.');
  assert.doesNotMatch(sansProse(reset), /#v11-demande'\)\.value=/, 'la demande n’est jamais réécrite…');
  assert.doesNotMatch(sansProse(reset), /state\.docs\s*=/, '…et les documents ne sont jamais vidés.');
  /* Seul resetAll les efface, et il n'est pas appelé par une bascule de mode. */
  const set = sansProse(html.slice(html.indexOf('function setMode('), html.indexOf('function currentMode()')));
  assert.doesNotMatch(set, /resetAll\(\)/);
});

test('T-MODE02-12 : aucune étape de confirmation de mode superflue', () => {
  /* Un clic sur l'action principale part directement au tour : pas de « confirmez votre mode ». */
  const route = sansProse(html.slice(html.indexOf('function routeCurrentMode()'), html.indexOf('function routeCurrentMode()') + 300));
  assert.match(route, /router\.start\(currentMode\(\)\)/);
  assert.doesNotMatch(route, /confirm\(|prompt\(/, 'aucune confirmation intercalée.');
  const entree = sansProse(html.slice(html.indexOf('async function v11StartRapide'), html.indexOf('async function v11StartArchitecte')));
  assert.doesNotMatch(entree, /confirm\(|ouvrirVue\(/, 'ni confirmation, ni navigation avant le tour.');
  assert.match(entree, /oprieRunTurn\('rapide'\)/);
});

test('T-MODE02-RENDU : le résultat Rapide est rendu SUR PLACE, sans navigation', () => {
  assert.match(RUN_RAPIDE, /\$\('#ui-rapid-output'\)/, 'le prompt est rendu dans le parcours courant.');
  assert.match(RUN_RAPIDE, /box\.hidden=false/);
  assert.doesNotMatch(RUN_RAPIDE, /ouvrirVue\(|location\.|window\.open|href\s*=/,
    'aucune navigation vers un autre écran.');
});

// =================================================================================================
// §64 — LES BASCULES
// =================================================================================================

test('T-MODE02-13/14 : venir en Rapide depuis Architecte ou Atelier est sûr', () => {
  const routeur = sansProse(html.slice(html.indexOf('window.__V11_ROUTER__'), html.indexOf('function init()')));
  assert.match(routeur, /if\(mode==='rapide'\)return v11StartRapide\(\)/);
  /* Et aucun état d'un autre mode n'entre dans le tour : le tour ne lit que la demande. */
  const req = sansProse(html.slice(html.indexOf('async function oprieRequestTurn()'), html.indexOf('function oprieSetBusy')));
  assert.match(req, /original_request:oprieOriginalRequest\(\),clarification_history:oprieClarificationHistory\(\)/);
  assert.doesNotMatch(req, /adpState\.lastEnvelope|lastProjection|archAnalyse/,
    'aucun résidu Atelier ou Architecte n’entre dans OPRIE.');
});

test('T-MODE02-15/16 : quitter Rapide rend ses résultats dépassés', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  h.ctx.adpState.requestedMode = 'architecte';
  await ancien;
  assert.deepEqual(h.spy.executed, [], 'l’ancien tour Rapide n’exécute pas dans le nouveau mode.');
  const d = decideNextOrchestrationAction({
    mode: 'atelier', turn: { turn_id: 4, current_turn_id: 4, mode: 'rapide' },
    fast: null, deep: { state: 'operational_request_ready' }, readiness: null, promptQG: null, execution: null, outputQG: null
  });
  assert.equal(d.action, 'IGNORE_STALE');
  assert.equal(d.reason, 'MODE_SWITCHED');
});

// =================================================================================================
// §65/§66 — OPRIE EN RAPIDE, ET L'ORIENTATION
// =================================================================================================

test('T-MODE02-17..22 : Rapide n’interprète aucun état OPRIE à sa façon', async () => {
  const attendu = { clarification_required: 'WAIT_FOR_USER', confirmation_required: 'WAIT_FOR_USER',
                    operational_request_ready: 'ENTER_READINESS', blocked: 'SHOW_BLOCKED', degraded_state: 'SHOW_DEGRADED' };
  for (const [state, a] of Object.entries(attendu)) {
    assert.equal(act({ deep: { state } }), a, `politique / ${state}`);
    const h = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R', blocked_reason: 'B' }) });
    await h.pilot.oprieRunTurn('rapide');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, a, `produit / ${state}`);
  }
});

test('T-MODE02-23/24 : en Rapide, clarification et confirmation NE forcent PAS Architecte', async () => {
  for (const [state, texte] of [['clarification_required', 'Pour quel public ?'], ['confirmation_required', 'Un arbitrage a été fait.']]) {
    const h = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn(state, { next_question: { text: texte }, confirmation_reason: texte }) });
    await h.pilot.oprieRunTurn('rapide');
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER', state);
    assert.equal(h.ctx.adpState.pendingQuestion, true, 'la personne est sollicitée, sur place.');
    assert.deepEqual(h.spy.executed, [], 'et rien n’est routé vers un autre moteur.');
    assert.notEqual(h.pilot.oprieState.lastOrchestration.action, 'ORIENT_TO_ARCHITECTE');
  }
});

test('T-MODE02-25 : ORIENT_TO_ARCHITECTE ne peut naître que d’une candidate, jamais d’OPRIE', () => {
  /* Seul contexte légitime : une candidate rapide déjà projetée en orientation, SANS verdict OPRIE. */
  assert.equal(act({ fast: { type: 'ORIENT_ARCHITECTE', authority: 'candidate' } }), 'ORIENT_TO_ARCHITECTE');
  /* Dès qu'OPRIE a parlé, l'orientation ne peut plus l'emporter. */
  for (const state of ['clarification_required', 'confirmation_required', 'operational_request_ready', 'blocked', 'degraded_state']) {
    assert.notEqual(act({ deep: { state }, fast: { type: 'ORIENT_ARCHITECTE', authority: 'candidate' } }),
      'ORIENT_TO_ARCHITECTE', state);
  }
});

// =================================================================================================
// §67 — FAST ET DEEP EN RAPIDE
// =================================================================================================

test('T-MODE02-26 : la candidate rapide reste non autoritaire', async () => {
  const h = loadPilot({ mode: 'rapide', fast: async () => ({ type: 'ORIENT_ARCHITECTE', text: 'Orientation.' }),
                        deep: async () => { await delay(70); return clarificationTurn('Q ?'); } });
  const run = h.pilot.oprieRunTurn('rapide');
  await delay(25);
  const c = h.pilot.oprieState.fastInteraction;
  assert.equal(c.authority, 'candidate');
  assert.equal(c.can_execute, false);
  assert.equal(c.can_mark_ready, false);
  await run;
  assert.deepEqual(h.spy.executed, []);
});

test('T-MODE02-27/28 : panne rapide → le profond conclut ; panne profonde → rien n’est promu', async () => {
  const a = loadPilot({ mode: 'rapide', fast: async () => { throw new Error('KO'); }, deep: async () => clarificationTurn('Q ?') });
  await a.pilot.oprieRunTurn('rapide');
  assert.equal(a.pilot.oprieState.lastOrchestration.action, 'WAIT_FOR_USER');
  const b = loadPilot({ mode: 'rapide', fast: async () => ({ type: 'ORIENT_ARCHITECTE', text: 'x' }),
                        deep: async () => { await delay(40); throw new Error('KO'); } });
  await b.pilot.oprieRunTurn('rapide');
  assert.equal(b.pilot.oprieState.fastInteraction, null);
  assert.deepEqual(b.spy.executed, []);
});

test('T-MODE02-29/30 : candidate tardive et profond dépassé n’écrivent rien', async () => {
  const h = loadPilot({ mode: 'rapide',
    fast: async () => { await delay(110); return { type: 'ORIENT_ARCHITECTE', text: 'Tardive.' }; },
    deep: async () => { await delay(20); return arbiterTurn('operational_request_ready'); } });
  await h.pilot.oprieRunTurn('rapide');
  const execs = h.spy.executed.length;
  await delay(130);
  assert.equal(h.spy.executed.length, execs, 'la candidate tardive n’a rien relancé.');
  assert.ok(h.pilot.oprieState.telemetry.map((m) => m.event).includes('fast_discarded_concluded'));
});

// =================================================================================================
// §68 — LE PIPELINE GOUVERNÉ N'EST PAS CONTOURNÉ
// =================================================================================================

test('T-MODE02-31/32 : Rapide ne saute ni Readiness ni le gate de prompt', () => {
  assert.equal(act({ deep: { state: 'operational_request_ready' } }), 'ENTER_READINESS');
  assert.equal(act({ deep: { state: 'operational_request_ready' }, promptQG: { status: 'PASS' } }), 'STOP_FAIL_CLOSED');
  assert.equal(act({ promptQG: { status: 'PASS' } }), 'STOP_FAIL_CLOSED');
  assert.equal(act({ deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' } }), 'RUN_PROMPT_QG');
  /* Et le moteur Rapide bloque la publication si un contrat exploitable n'ouvre pas la voie canonique. */
  assert.match(html, /if\(!p&&rapideContratCanonique&&rapideContratCanonique\.executability&&rapideContratCanonique\.executability\.state==='exploitable'\)\{signaler\(QG_MESSAGE_INDISPONIBLE/);
});

test('T-MODE02-33/34 : une seule exécution Rapide, et aucune boucle de dialogue en aval', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 5; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'rapide');
  assert.equal(h.spy.executed.length, 1, 'cinq rejeux, une exécution.');
  /* Le moteur Rapide ne pose aucune question : R1, en aval du routage. */
  assert.doesNotMatch(RUN_RAPIDE, /oprieAsk|adpShowQuestion|pendingQuestion=true|#v11-dialogue/);
  assert.match(RUN_RAPIDE, /adpState\.pendingQuestion=false/, 'il referme au contraire toute sollicitation.');
});

test('T-MODE02-35 : après un succès, le contrôle de sortie est la suite obligée', () => {
  const base = { deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' } };
  assert.equal(act({ ...base, execution: { status: 'success' } }), 'RUN_OUTPUT_QG');
  assert.equal(act({ ...base, execution: { status: 'success' }, outputQG: { status: 'PASS' } }), 'SHOW_EXECUTION_RESULT');
  /* Sauter l'exécution pour aller au contrôle de sortie est refusé. */
  assert.equal(act({ ...base, outputQG: { status: 'PASS' } }), 'STOP_FAIL_CLOSED');
});

test('T-MODE02-PUBLICATION : le prompt rendu par le parcours Rapide est opposable à son contrat', () => {
  /* Défaut mesuré et fermé par ce lot : la voie PRINCIPALE affichait un prompt sans poser le couple
     {prompt, contrat}. Une sortie issue de ce prompt ne pouvait donc être opposée à aucun contrat —
     le contrôle de conformité rendait null, faute de lien. */
  assert.match(RUN_RAPIDE, /rapideDernierePublication=r\.canonical\?\{prompt:r\.prompt,contract:r\.canonical\.contract\}:null/,
    'le parcours Rapide pose désormais le lien.');
  /* Le lien porte le prompt RÉELLEMENT rendu : il est posé APRÈS l'affinage, pas avant. */
  const posLien = RUN_RAPIDE.indexOf('rapideDernierePublication=');
  const posAffinage = RUN_RAPIDE.indexOf('adnRefineRapidEnvelope');
  const posRendu = RUN_RAPIDE.indexOf("$('#ui-rapid-output')");
  assert.ok(posAffinage < posLien && posLien < posRendu,
    'le lien est posé entre l’affinage et le rendu — donc sur le texte que la personne verra.');
  /* Sans contrat canonique, aucun lien n'est fabriqué : on ne certifie pas ce qu'on ne peut opposer. */
  assert.match(RUN_RAPIDE, /r\.canonical\?/, 'pas de contrat, pas de lien.');
});

// =================================================================================================
// §69 — LES VERDICTS DE SORTIE RESTENT DISTINCTS
// =================================================================================================

test('T-MODE02-36..39 : les quatre verdicts de sortie restent quatre', () => {
  const base = { deep: { state: 'operational_request_ready' }, readiness: { state: 'execution_ready' },
                 promptQG: { status: 'PASS' }, execution: { status: 'success' } };
  const vus = {};
  for (const status of ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL']) {
    const d = decideNextOrchestrationAction(R({ ...base, outputQG: { status } }));
    vus[status] = `${d.action}/${d.reason}`;
  }
  assert.equal(vus.FAIL, 'SHOW_OUTPUT_QG_FAILURE/OUTPUT_QG_FAIL');
  assert.equal(new Set(Object.values(vus)).size, 4);
  /* Et « conforme » reste réservé à deux statuts, côté produit. */
  assert.match(html, /function qgSortieCertifie\(verdict\)\{\s*return !!verdict&&!verdict\.technical_failure&&\(verdict\.status==='PASS'\|\|verdict\.status==='PASS_WITH_WARNINGS'\)/);
});

// =================================================================================================
// §70 — LES ÉVÉNEMENTS EN DOUBLE
// =================================================================================================

test('T-MODE02-40/41/42 : double soumission, double réponse, question unique', async () => {
  let appels = 0;
  const h = loadPilot({ mode: 'rapide', deep: async () => { appels += 1; await delay(40); return clarificationTurn('Q ?'); } });
  await Promise.all([h.pilot.oprieRunTurn('rapide'), h.pilot.oprieRunTurn('rapide'), h.pilot.oprieRunTurn('rapide')]);
  assert.equal(appels, 1, 'trois clics, un tour.');
  assert.equal(h.spy.shown.filter((s) => s.id === '#v11-dialogue').length, 1, 'une seule question ouverte.');
  const a = loadAnswerQuestion({ running: false });
  a.answerQuestion('R');
  a.ctx.oprieState.running = true;
  a.answerQuestion('R');
  assert.equal(a.ctx.state.answers.length, 1, 'la réponse n’entre pas deux fois.');
  assert.equal(a.spy.turns.length, 1);
});

test('T-MODE02-43 : le repli beginExchange corrigé en IA-03 n’est pas revenu', () => {
  const answer = sansProse(html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function resetAll()')));
  assert.match(answer, /if\(oprieState\.running\)return;/, 'le garde de ré-entrée est en place…');
  const gardePos = answer.indexOf('if(oprieState.running)return;');
  const pushPos = answer.indexOf('state.answers.push');
  assert.ok(gardePos < pushPos, '…et il sort AVANT d’écrire dans l’historique.');
  assert.match(answer, /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/);
});

// =================================================================================================
// §71/§72 — AIDES ET AUTORITÉS
// =================================================================================================

test('T-MODE02-44/45 : aucun contrôle d’aide cosmétique sur le parcours Rapide', () => {
  /* Mesure : aucun bouton d'aide statique n'existe dans le DOM, et le gestionnaire est délégué —
     il n'y a donc aucun contrôle visible inerte à corriger sur ce parcours. */
  assert.equal((html.match(/class="[^"]*aide-btn[^"]*"/g) || []).length, 0,
    'aucun bouton d’aide statique.');
  assert.match(FRONT_CODE, /aide-btn/, 'le gestionnaire délégué existe bien…');
  assert.match(FRONT_CODE, /closest\('label\.etiquette, \.cle, \.famille-tete/, '…et vise des porteurs réels.');
});

test('T-MODE02-46..50 : Rapide n’écrit aucune autorité et ne choisit aucun fournisseur', () => {
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat, RUN_RAPIDE), 0, etat);
  }
  assert.equal(ecritures('route', RUN_RAPIDE), 0, 'aucune route dérivée dans le moteur Rapide.');
  for (const interdit of [/appelFournisseur/, /groq/i, /anthropic/i, /openai/i, /DECISION_PROVIDER_ORDER/]) {
    assert.doesNotMatch(RUN_RAPIDE, interdit, `le parcours Rapide ne doit pas contenir ${interdit}.`);
  }
  const worker = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  assert.match(worker, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
});

// =================================================================================================
// CE QUE CE LOT A CORRIGÉ, ÉPINGLÉ
// =================================================================================================

test('T-MODE02-CONTRAT-CORRIGE : le contrat dit ce que le parcours produit réellement', () => {
  /* Rapide entre bien dans la chaîne gouvernée, mais rend un PROMPT : il n'appelle aucun
     fournisseur et ne fabrique aucun livrable. Le contrat l'affirmait à tort. */
  assert.equal(MODE_CONTRACTS.rapide.allowsExecution, true, 'il entre bien dans la chaîne…');
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false, '…mais ne produit pas le livrable.');
  assert.doesNotMatch(RUN_RAPIDE, /appelFournisseur/, 'mesure : aucun appel fournisseur.');
  /* Architecte, lui, en produit un — l'asymétrie est réelle et assumée. */
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true);
  const arch = html.slice(html.indexOf('async function archConstruireExecuter()'), html.indexOf('const ARCH_SAUVEGARDE_VERSION='));
  assert.match(arch, /appelFournisseur\(/);
  assert.match(arch, /archControleSortie\(contratExecute,r\.texte\)/);
});

test('T-MODE02-NOHEURISTIQUE : aucun flou, aucun seuil, aucun domaine sur le parcours Rapide', () => {
  for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                          /cosine/i, /levenshtein/i, /fuzzy/i, /case_id/i,
                          /voyage|medical|juridique|legal|travel|recette/i]) {
    assert.doesNotMatch(RUN_RAPIDE, interdit, interdit.toString());
  }
});
