/* IA-04 — LE CYCLE D'EXÉCUTION.
 * ============================================================================
 *
 * Une exécution logique naît une fois, traverse ses phases dans l'ordre, et se
 * termine une fois. Cette suite éprouve les trois choses qui rendent cette
 * phrase vraie sous contrainte réelle :
 *
 *   UNE TENTATIVE FOURNISSEUR N'EST PAS UNE EXÉCUTION. Reprises 429 et bascule
 *   Groq -> Anthropic -> OpenAI restent le MÊME appel logique. Les compter
 *   autrement ferait payer deux fois et rendrait « exactement une fois »
 *   infalsifiable.
 *
 *   UN RÉSULTAT TARDIF N'EST PAS UN RÉSULTAT. Le premier terminal valide gagne.
 *   Le dernier arrivé n'est pas le plus vrai, seulement le plus lent.
 *
 *   UNE PHASE NE SE SAUTE PAS. Franchir une porte sans la traverser n'est pas
 *   aller plus vite.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  EXECUTION_LIFECYCLE_VERSION, EXECUTION_PHASES, LIFECYCLE_REFUSALS,
  createExecutionLifecycle, assertExecutionProvenance, assertOutputProvenance
} from '../core/adn/execution-lifecycle.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = fs.readFileSync(path.join(root, 'core/adn/execution-lifecycle.js'), 'utf8');
/* Les scans d'interdiction portent sur le CODE : une prose qui explique ce que le module ne fait
   PAS ne doit pas être confondue avec le fait de le faire. */
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MODULE_CODE = sansProse(MODULE);
/** Le corps d'une fonction nommée du module, prose retirée. */
const fonction = (nom) => {
  const i = MODULE_CODE.indexOf(nom);
  return i < 0 ? '' : MODULE_CODE.slice(i, MODULE_CODE.indexOf('\n    },', i) + 1 || MODULE_CODE.length);
};
/* Le CODE du garde, ancré sur sa première instruction : commencer dans le commentaire
   empêcherait d'en retirer la prose, dont le début se trouverait hors de la tranche. */
const GUARD = html.slice(html.indexOf('let archExecutionEnCours=false;'), html.indexOf('function archDemarrer()'));
const CYCLE = html.slice(html.indexOf('IA-04 — LE CYCLE'), html.indexOf('function oprieDriveOrchestration'));

const cyclePolicy = (extra = {}) => ({
  mode: 'architecte', turn: { turn_id: 5, current_turn_id: 5, mode: 'architecte', pending_user_interaction: false },
  fast: null, deep: { state: 'operational_request_ready' }, readiness: null, promptQG: null,
  execution: null, outputQG: null, ...extra
});
/** Le déclencheur Architecte réel, chargé seul avec un moteur espion. */
function loadArchGuard(moteur) {
  const src = html.slice(html.indexOf('let archExecutionEnCours=false;'), html.indexOf('function archDemarrer()'));
  const ctx = { archConstruireExecuter: moteur };
  vm.runInNewContext(src + '\n;globalThis.__g=archExecutionUneSeuleFois;globalThis.__refus=()=>archExecutionsRefusees;', ctx);
  return { lancer: ctx.__g, refus: () => ctx.__refus() };
}

// =================================================================================================
// §62 — LE CYCLE NOMINAL
// =================================================================================================

test('T-IA04-01..05 : le cycle nominal franchit ses cinq phases, dans l’ordre', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 3, canonical_version: '1.0' });
  for (const phase of ['READINESS', 'PROMPT_QG', 'EXECUTION', 'OUTPUT_QG']) {
    assert.equal(L.enterPhase(execution_id, phase).allowed, true, phase);
  }
  assert.equal(L.applyTerminal(execution_id, { qg_status: 'PASS' }).allowed, true);
  const vue = L.describe(execution_id);
  assert.deepEqual([...vue.phases], ['READINESS', 'PROMPT_QG', 'EXECUTION', 'OUTPUT_QG', 'TERMINAL']);
  assert.equal(vue.terminal_applied, true);
  assert.equal(vue.canonical_version, '1.0', 'la version canonique du tour est portée, jamais reconstruite.');
});

test('T-IA04-06/07 : Readiness ou gate de prompt non concluants arrêtent la séquence', () => {
  for (const [extra, motif] of [[{ readiness: { state: 'blocked' } }, 'READINESS_BLOCKED'],
                                 [{ readiness: { state: 'execution_ready' }, promptQG: { status: 'FAIL' } }, 'PROMPT_QG_FAIL']]) {
    const d = decideNextOrchestrationAction(cyclePolicy(extra));
    assert.equal(d.action, 'STOP_FAIL_CLOSED');
    assert.equal(d.reason, motif);
  }
});

test('T-IA04-08 : un échec technique d’exécution est terminal, et reste technique', () => {
  const d = decideNextOrchestrationAction(cyclePolicy({
    readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'technical_error' }
  }));
  assert.equal(d.action, 'SHOW_EXECUTION_RESULT');
  assert.equal(d.reason, 'EXECUTION_TECHNICAL_ERROR');
  /* Une panne réseau ne devient JAMAIS un état sémantique. */
  for (const etat of ['blocked', 'degraded_state', 'clarification_required', 'operational_request_ready']) {
    assert.notEqual(d.reason.toLowerCase(), etat, etat);
  }
});

const execute = { readiness: { state: 'execution_ready' }, promptQG: { status: 'PASS' }, execution: { status: 'success' } };

test('T-IA04-09/10/11/12 : les quatre verdicts de sortie restent distincts', () => {
  const vus = {};
  for (const status of ['PASS', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION', 'FAIL']) {
    const d = decideNextOrchestrationAction(cyclePolicy({ ...execute, outputQG: { status } }));
    vus[status] = `${d.action}/${d.reason}`;
  }
  assert.equal(vus.FAIL, 'SHOW_OUTPUT_QG_FAILURE/OUTPUT_QG_FAIL', 'FAIL ne peut pas devenir un résultat rendu comme les autres.');
  assert.notEqual(vus.PASS, vus.PASS_WITH_WARNINGS, 'les avertissements ne sont pas absorbés dans PASS.');
  assert.notEqual(vus.PASS, vus.INCOMPLETE_VERIFICATION, 'une vérification incomplète n’est pas une réussite.');
  assert.equal(new Set(Object.values(vus)).size, 4, 'les quatre verdicts restent quatre.');
  /* Et côté produit, « conforme » reste réservé à deux statuts. */
  assert.match(html, /verdict\.status==='PASS'\|\|verdict\.status==='PASS_WITH_WARNINGS'/);
});

// =================================================================================================
// §64 — EXACTEMENT UNE FOIS
// =================================================================================================

test('T-IA04-13..16 : chaque phase n’est franchie qu’une fois, même sur rappel dupliqué', () => {
  for (const phase of ['READINESS', 'PROMPT_QG', 'EXECUTION', 'OUTPUT_QG']) {
    const L = createExecutionLifecycle();
    const { execution_id } = L.begin({ turn_id: 1 });
    for (const p of EXECUTION_PHASES.slice(0, EXECUTION_PHASES.indexOf(phase) + 1)) L.enterPhase(execution_id, p);
    const rejeu = L.enterPhase(execution_id, phase);
    assert.equal(rejeu.allowed, false, `${phase} rejouée`);
    assert.equal(rejeu.reason, 'PHASE_ALREADY_ENTERED');
    assert.equal(L.describe(execution_id).phases.filter((p) => p === phase).length, 1);
  }
});

test('T-IA04-17 : le résultat terminal n’est posé qu’une fois — le PREMIER gagne', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  assert.equal(L.applyTerminal(execution_id, { qg_status: 'PASS' }).allowed, true);
  const second = L.applyTerminal(execution_id, { qg_status: 'FAIL' });
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'TERMINAL_ALREADY_APPLIED');
  assert.deepEqual(second.terminal, { qg_status: 'PASS' }, 'et le premier résultat est rendu, intact.');
});

test('T-IA04-18 : une exécution terminée ne peut plus rien franchir', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  L.applyTerminal(execution_id, { qg_status: 'PASS' });
  for (const phase of EXECUTION_PHASES) {
    assert.equal(L.enterPhase(execution_id, phase).reason, 'ALREADY_TERMINAL', phase);
  }
  assert.equal(L.recordProviderAttempt(execution_id).reason, 'ALREADY_TERMINAL');
  assert.equal(L.isCurrent(execution_id, 1), false, 'un cycle terminé n’est plus le cycle courant.');
});

// =================================================================================================
// §65 — UNE TENTATIVE FOURNISSEUR N'EST PAS UNE EXÉCUTION
// =================================================================================================

test('T-IA04-19/20/21 : reprises et bascule restent la MÊME exécution logique', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 2 });
  L.enterPhase(execution_id, 'READINESS'); L.enterPhase(execution_id, 'PROMPT_QG'); L.enterPhase(execution_id, 'EXECUTION');
  /* Deux reprises 429 sur Groq, puis bascule Anthropic, puis OpenAI : cinq tentatives. */
  for (let i = 0; i < 5; i += 1) assert.equal(L.recordProviderAttempt(execution_id).allowed, true);
  assert.equal(L.describe(execution_id).provider_attempts, 5, 'cinq tentatives comptées…');
  assert.equal(L.executionCount, 1, '…pour UNE seule exécution logique.');
  assert.deepEqual([...L.describe(execution_id).phases], ['READINESS', 'PROMPT_QG', 'EXECUTION'],
    'aucune tentative ne rouvre une phase.');
});

test('T-IA04-22 : l’échec de toutes les tentatives donne UN terminal, pas plusieurs', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 2 });
  for (let i = 0; i < 3; i += 1) L.recordProviderAttempt(execution_id);
  assert.equal(L.applyTerminal(execution_id, { technical_failure: true }).allowed, true);
  assert.equal(L.applyTerminal(execution_id, { technical_failure: true }).allowed, false);
  assert.equal(L.describe(execution_id).provider_attempts, 3);
  assert.equal(L.executionCount, 1);
});

test('T-IA04-RETRY-INTACT : aucune politique fournisseur n’a été touchée', () => {
  const worker = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  assert.match(worker, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/,
    'ordre de bascule inchangé.');
  assert.match(worker, /GROQ_PRODUCTION_RETRY_DEFAULTS/, 'politique de reprise Groq inchangée.');
  /* Le module de cycle ne connaît AUCUN fournisseur et n’en pilote aucun. */
  for (const interdit of [/groq/i, /anthropic/i, /openai/i, /fetch/, /retry/i, /timeout/i, /provider_order/]) {
    assert.doesNotMatch(MODULE_CODE, interdit, `le cycle ne doit rien savoir de ${interdit}.`);
  }
});

// =================================================================================================
// §66 — REPRISE UTILISATEUR
// =================================================================================================

test('T-IA04-23/24/25 : une relance explicite crée une NOUVELLE tentative logique', () => {
  const L = createExecutionLifecycle();
  const premier = L.begin({ turn_id: 4 }).execution_id;
  L.applyTerminal(premier, { technical_failure: true });
  const second = L.begin({ turn_id: 4 }).execution_id;
  assert.notEqual(second, premier, 'la relance ne réutilise PAS l’identifiant terminé.');
  assert.equal(L.enterPhase(second, 'READINESS').allowed, true, 'et repart de la première phase.');
  /* L'audit du premier cycle survit intact : une relance n'efface pas ce qui a eu lieu. */
  const vue = L.describe(premier);
  assert.equal(vue.terminal_applied, true);
  assert.deepEqual(vue.phases, Object.freeze(['TERMINAL']));
  assert.equal(L.executionCount, 2, 'deux tentatives distinctes, toutes deux traçables.');
});

test('T-IA04-26 : aucune reprise automatique — la seule boucle est une rétention bornée', () => {
  for (const interdit of [/\bdo\s*\{/, /retry/i, /repair/i, /regenerate/i, /\buntil\b/i]) {
    assert.doesNotMatch(MODULE_CODE, interdit, `le cycle ne doit contenir ${interdit}.`);
  }
  /* Une seule boucle existe : elle borne la rétention du registre. Elle ne réessaie rien, ne rappelle
     personne, et ne peut pas ne pas se terminer — chaque tour retire un enregistrement. */
  const boucles = [...MODULE_CODE.matchAll(/\bwhile\s*\([^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(boucles, ['while (records.length > maxRecords)'], 'une seule boucle, et c’est la rétention.');
  /* Aucune boucle dans les fonctions qui DÉCIDENT. */
  for (const nom of ['enterPhase(', 'applyTerminal(', 'recordProviderAttempt(', 'begin(']) {
    assert.doesNotMatch(fonction(nom), /\bwhile\s*\(|\bdo\s*\{/, `${nom} ne boucle pas.`);
  }
  assert.doesNotMatch(sansProse(GUARD), /while|retry|repair/i, 'le garde d’entrée ne boucle pas non plus.');
});

// =================================================================================================
// §67 — LES COURSES
// =================================================================================================

test('T-IA04-27/28 : succès puis échec tardif, et l’inverse — le premier tient', () => {
  for (const [premier, second] of [[{ qg_status: 'PASS' }, { technical_failure: true }],
                                   [{ technical_failure: true }, { qg_status: 'PASS' }]]) {
    const L = createExecutionLifecycle();
    const { execution_id } = L.begin({ turn_id: 1 });
    L.applyTerminal(execution_id, premier);
    const tardif = L.applyTerminal(execution_id, second);
    assert.equal(tardif.allowed, false, JSON.stringify(second));
    assert.deepEqual(tardif.terminal, premier, 'le résultat conservé est le PREMIER, pas le dernier arrivé.');
  }
});

test('T-IA04-29 : un cycle d’un tour révolu ne peut plus rien franchir', () => {
  const L = createExecutionLifecycle();
  const ancien = L.begin({ turn_id: 3 }).execution_id;
  L.enterPhase(ancien, 'READINESS', { currentTurnId: 3 });
  const apres = L.enterPhase(ancien, 'PROMPT_QG', { currentTurnId: 7 });
  assert.equal(apres.allowed, false);
  assert.equal(apres.reason, 'STALE_EXECUTION');
  assert.equal(L.isCurrent(ancien, 7), false);
});

test('T-IA04-30 : un contrôle de sortie ne peut pas être attribué à une autre exécution', () => {
  assert.equal(assertOutputProvenance({ execution_id: 4, output_execution_id: 4 }).allowed, true);
  const croise = assertOutputProvenance({ execution_id: 4, output_execution_id: 3 });
  assert.equal(croise.allowed, false);
  assert.equal(croise.reason, 'STALE_EXECUTION');
  assert.equal(assertOutputProvenance({ execution_id: 4 }).allowed, false, 'un identifiant manquant ferme.');
});

test('T-IA04-31 : le verrou terminal interdit le dernier-qui-écrit-gagne', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  const resultats = [];
  for (let i = 0; i < 20; i += 1) resultats.push(L.applyTerminal(execution_id, { n: i }));
  assert.equal(resultats.filter((r) => r.allowed).length, 1, 'un seul terminal appliqué sur vingt tentatives.');
  assert.deepEqual(L.describe(execution_id).terminal_applied, true);
});

// =================================================================================================
// §68 — L'ORDRE DES PHASES
// =================================================================================================

test('T-IA04-32/33/34/36 : sauter une phase est refusé, à chaque rang', () => {
  for (let i = 1; i < EXECUTION_PHASES.length; i += 1) {
    const L = createExecutionLifecycle();
    const { execution_id } = L.begin({ turn_id: 1 });
    const saut = L.enterPhase(execution_id, EXECUTION_PHASES[i]);
    assert.equal(saut.allowed, false, `entrer directement en ${EXECUTION_PHASES[i]}`);
    assert.equal(saut.reason, 'PHASE_SKIPPED');
  }
  /* Et sauter une phase au MILIEU d'un cycle est refusé de la même façon. */
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  L.enterPhase(execution_id, 'READINESS');
  assert.equal(L.enterPhase(execution_id, 'EXECUTION').reason, 'PHASE_SKIPPED');
});

test('T-IA04-35 : on ne revient jamais à une phase franchie', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 1 });
  for (const p of ['READINESS', 'PROMPT_QG', 'EXECUTION']) L.enterPhase(execution_id, p);
  assert.equal(L.enterPhase(execution_id, 'READINESS').reason, 'PHASE_ALREADY_ENTERED');
  assert.equal(L.enterPhase(execution_id, 'PROMPT_QG').reason, 'PHASE_ALREADY_ENTERED');
  assert.deepEqual([...L.describe(execution_id).phases], ['READINESS', 'PROMPT_QG', 'EXECUTION']);
});

// =================================================================================================
// §69 — LA PROVENANCE
// =================================================================================================

test('T-IA04-37/39 : l’artefact exécuté doit être celui qui a été contrôlé', () => {
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'p-1', execution_artifact_id: 'p-1' }).allowed, true);
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'p-1', execution_artifact_id: 'p-2' }).allowed, false,
    'contrôler A puis exécuter B ne contrôle rien.');
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'p-1' }).allowed, false);
  assert.equal(assertExecutionProvenance({}).allowed, false);
  /* La comparaison porte sur des IDENTIFIANTS : aucun texte n’est comparé. Le scan vise les DEUX
     fonctions de provenance — ailleurs, `.length` sert à borner un tableau, ce qui n’a rien à voir. */
  const provenance = MODULE_CODE.slice(MODULE_CODE.indexOf('export function assertExecutionProvenance'));
  for (const interdit of [/\.length/, /includes\(/, /similar/i, /fuzzy/i, /\.match\(/, /toLowerCase/]) {
    assert.doesNotMatch(provenance, interdit, `la provenance ne doit pas comparer par ${interdit}.`);
  }
  assert.match(provenance, /qg_artifact_id === execution_artifact_id/, 'égalité stricte d’identifiants.');
});

test('T-IA04-38/41 : chaque résultat terminal est traçable à son tour et à son exécution', () => {
  const L = createExecutionLifecycle();
  const { execution_id } = L.begin({ turn_id: 9, canonical_version: '2.1' });
  L.applyTerminal(execution_id, { qg_status: 'PASS_WITH_WARNINGS' });
  const vue = L.describe(execution_id);
  assert.equal(vue.turn_id, 9);
  assert.equal(vue.execution_id, execution_id);
  assert.equal(vue.canonical_version, '2.1');
  assert.equal(vue.terminal_applied, true);
  assert.equal(L.describe(9999), null, 'un identifiant inconnu ne rend rien plutôt que d’inventer.');
});

test('T-IA04-40 : la version canonique du tour est portée, jamais reconstruite', () => {
  assert.doesNotMatch(MODULE, /canonicalBaseToEnvelopeInput|mapOprieToCanonicalContract|buildAdnState/,
    'le cycle ne reconstruit aucun contrat.');
  assert.match(MODULE, /canonical_version/, 'il la transporte, telle qu’on la lui donne.');
  const enter = html.slice(html.indexOf('function oprieEnterExecution'), html.indexOf('function oprieApplyTurn'));
  assert.match(enter, /oprieBeginExecutionCycle\(oprieState\.seq,canonical&&canonical\.version\|\|null\)/,
    'et le frontend la lit du contrat déjà validé, au seul endroit qui le pose.');
});

// =================================================================================================
// §70 / §73 — TARDIFS ET ÉVÉNEMENTS EN DOUBLE, SUR LE PRODUIT RÉEL
// =================================================================================================

test('T-IA04-42 : une candidate rapide tardive n’entre pas dans un cycle engagé', async () => {
  const h = loadPilot({
    fast: async () => { await delay(110); return { type: 'ASK_CLARIFICATION', text: 'Candidate tardive ?' }; },
    deep: async () => { await delay(20); return arbiterTurn('operational_request_ready'); }
  });
  await h.pilot.oprieRunTurn('architecte');
  const executions = h.spy.executed.length;
  await delay(130);
  assert.equal(h.spy.executed.length, executions, 'la candidate tardive n’a rien relancé.');
  assert.equal(h.ctx.$('#v11-question').textContent, '', 'et n’a rien affiché.');
  const marques = h.pilot.oprieState.telemetry.map((m) => m.event);
  assert.ok(marques.includes('fast_discarded_concluded'), 'son rejet est tracé, pas silencieux.');
});

test('T-IA04-43/44 : un plan profond tardif d’un tour révolu ne relance aucun cycle', async () => {
  const h = loadPilot({ deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await ancien;
  assert.deepEqual(h.spy.executed, [], 'aucun cycle ouvert par le tour dépassé.');
  assert.equal(h.pilot.oprieState.executionId, null, 'et aucune exécution enregistrée.');
});

test('T-IA04-45..50 : le cycle n’écrit AUCUNE autorité', () => {
  const code = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/operational_request_ready/, /clarification_required/, /confirmation_required/,
                          /degraded_state/, /\bblocked\b/, /\broute\b/, /routing/, /execution_ready/,
                          /guardPromptContract/, /validateOutputAgainstCanonicalContract/,
                          /\bPASS\b/, /\bFAIL\b/]) {
    assert.doesNotMatch(code, interdit, `le cycle ne doit rien connaître de ${interdit}.`);
  }
  /* Il ne classe pas non plus le résultat : le terminal lui est DONNÉ. */
  assert.match(code, /record\.terminal = outcome/, 'le résultat est conservé tel quel.');
  assert.doesNotMatch(code, /outcome\.(status|qg_status|technical_failure)/, 'et jamais interprété.');
});

test('T-IA04-51..55 : entrée invalide, incohérente ou inconnue — fermeture', () => {
  const L = createExecutionLifecycle();
  for (const mauvais of [{}, { turn_id: -1 }, { turn_id: 1.5 }, { turn_id: 'x' }, { turn_id: null }]) {
    const r = L.begin(mauvais);
    assert.equal(r.allowed, false, JSON.stringify(mauvais));
    assert.equal(r.reason, 'TURN_ID_INVALID');
  }
  assert.equal(L.enterPhase(999, 'READINESS').reason, 'UNKNOWN_EXECUTION');
  assert.equal(L.recordProviderAttempt(999).reason, 'UNKNOWN_EXECUTION');
  assert.equal(L.applyTerminal(999, {}).reason, 'UNKNOWN_EXECUTION');
  const { execution_id } = L.begin({ turn_id: 1 });
  assert.equal(L.enterPhase(execution_id, 'INVENTÉE').reason, 'PHASE_UNKNOWN');
  assert.equal(L.applyTerminal(execution_id, null).reason, 'OUTCOME_MISSING');
  assert.equal(L.applyTerminal(execution_id, undefined).reason, 'OUTCOME_MISSING');
  /* Tout motif rendu appartient à l'énumération déclarée : aucun n'est inventé. */
  for (const motif of ['UNKNOWN_EXECUTION', 'PHASE_UNKNOWN', 'TURN_ID_INVALID', 'OUTCOME_MISSING']) {
    assert.ok(LIFECYCLE_REFUSALS.includes(motif), motif);
  }
});

// =================================================================================================
// §45 / §73 — LE DÉFAUT RÉEL QUE CE LOT FERME
// =================================================================================================

test('T-IA04-56/57/58 : quatre clics rapprochés n’ouvrent qu’UN cycle d’exécution', async () => {
  /* Défaut mesuré avant correction : archConstruireExecuter n'avait aucun garde de ré-entrée. Ses
     deux confirmations sont modales, mais l'analyse qui s'intercale dure des secondes, pendant
     lesquelles le bouton reste vivant — un second clic ouvrait un second cycle complet, jusqu'à cinq
     appels facturés et une seconde exécution du livrable. */
  let cycles = 0;
  const g = loadArchGuard(async () => { cycles += 1; await delay(60); return true; });
  await Promise.all([g.lancer(), g.lancer(), g.lancer(), g.lancer()]);
  assert.equal(cycles, 1, 'quatre clics, un seul cycle.');
  assert.equal(g.refus(), 3, 'et les trois refus sont comptés, pas perdus.');
});

test('T-IA04-RELANCE : après la fin du cycle, une relance explicite reste possible', async () => {
  let cycles = 0;
  const g = loadArchGuard(async () => { cycles += 1; await delay(20); return true; });
  await g.lancer();
  await g.lancer();
  assert.equal(cycles, 2, 'la personne peut relancer — le garde interdit la ré-entrée, pas la reprise.');
});

test('T-IA04-ECHEC : un cycle qui échoue libère le déclencheur', async () => {
  let cycles = 0;
  const g = loadArchGuard(async () => { cycles += 1; throw new Error('panne fournisseur'); });
  await assert.rejects(() => g.lancer());
  await assert.rejects(() => g.lancer());
  assert.equal(cycles, 2, 'un échec ne condamne pas le bouton : la relance reste ouverte.');
});

test('T-IA04-AUTONOMIE : le garde ne touche PAS l’état OPRIE', () => {
  /* L'onglet Architecte est autonome — T-VALARCH02-06 le vérifie. Faire dépendre son déclencheur
     d'oprieState briserait cette autonomie : l'onglet cesserait de fonctionner seul. */
  assert.doesNotMatch(sansProse(GUARD), /oprieState|oprieMark|oprieRunTurn|OPRIE_ENDPOINT/,
    'le garde est strictement local.');
  assert.match(GUARD, /let archExecutionEnCours=false;/);
  assert.match(GUARD, /try\{return await archConstruireExecuter\(\)\}\s*finally\{archExecutionEnCours=false\}/,
    'le moteur GELÉ est enveloppé, jamais modifié.');
});

// =================================================================================================
// §90 / §91 — UNE SEULE IMPLÉMENTATION, DE CHAQUE CÔTÉ
// =================================================================================================

test('T-IA04-UNIQUE : un seul moteur d’exécution finale, un seul contrôle de sortie', () => {
  assert.equal((html.match(/function archConstruireExecuter\(\)/g) || []).length, 1);
  assert.equal((html.match(/function archControleSortie\(/g) || []).length, 1);
  assert.equal((html.match(/function rapideControleSortie\(/g) || []).length, 1);
  assert.equal((html.match(/function validateOutputAgainstCanonicalContract/g) || []).length, 1,
    'un seul moteur de conformité de sortie, embarqué une fois.');
  assert.equal((html.match(/function createExecutionLifecycle/g) || []).length, 1,
    'un seul registre de cycle.');
  /* Le garde n'est pas un second moteur : il ne fait qu'envelopper. */
  assert.doesNotMatch(GUARD, /appelFournisseur|archCompiler|archControleSortie/,
    'le garde n’exécute rien lui-même.');
});

test('T-IA04-PUR : le module de cycle est pur', () => {
  const code = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of [/fetch\(/, /XMLHttpRequest/, /document\./, /window\./, /localStorage/,
                          /Date\./, /new Date/, /performance\./, /Math\.random/, /setTimeout/,
                          /console\./, /process\./, /^import /m]) {
    assert.doesNotMatch(code, interdit, `le cycle ne doit pas contenir ${interdit}.`);
  }
  /* Deux registres indépendants ne partagent aucun état. */
  const A = createExecutionLifecycle(); const B = createExecutionLifecycle();
  A.begin({ turn_id: 1 }); A.begin({ turn_id: 2 });
  assert.equal(B.executionCount, 0, 'aucun état de module partagé.');
  assert.equal(EXECUTION_LIFECYCLE_VERSION, '1.0');
});

test('T-IA04-RETENTION : le registre est borné et ne fuit pas', () => {
  const L = createExecutionLifecycle({ maxRecords: 5 });
  for (let i = 0; i < 30; i += 1) L.applyTerminal(L.begin({ turn_id: i }).execution_id, { n: i });
  assert.equal(L.executionCount, 5, 'la rétention est bornée.');
  assert.equal(L.lastExecutionId, 30, 'et les identifiants restent monotones, jamais réutilisés.');
});
