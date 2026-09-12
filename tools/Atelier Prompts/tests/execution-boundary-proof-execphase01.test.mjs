/* EXEC-PHASE-INSTRUMENT-01 — LA FRONTIÈRE D'EXÉCUTION, PROUVÉE ; L'INTÉRIEUR, NON.
 * ============================================================================
 *
 * La dette demandait : les phases internes du moteur Architecte sont-elles
 * observables ? La réponse est NON, et elle n'est pas une opinion — elle
 * découle de deux mécanismes qu'on peut montrer du doigt.
 *
 * PREMIER MÉCANISME — LE GEL. Trois des cinq phases du cycle (PROMPT_QG,
 * EXECUTION, OUTPUT_QG) se produisent à l'intérieur d'UN SEUL appel,
 * `archConstruireExecuter`, situé dans la plage gelée du moteur Architecte. Vu
 * du dehors, ces trois phases sont un seul événement.
 *
 * SECOND MÉCANISME — L'ORDRE STRICT. Le noyau de cycle refuse d'entrer dans une
 * phase qui ne suit pas immédiatement la précédente (`PHASE_SKIPPED`). On ne
 * peut donc pas parcourir la moitié de la machine : soit on traverse les cinq,
 * soit aucune. Instrumenter READINESS depuis le dehors, puis sauter à TERMINAL,
 * est refusé PAR LE NOYAU LUI-MÊME.
 *
 * Les deux ensemble ferment la question : une instrumentation partielle est
 * structurellement impossible, et une instrumentation complète exigerait de
 * modifier une plage gelée. La dette se ferme donc par PREUVE DE FRONTIÈRE, pas
 * par instrumentation — et ce fichier ne prétend rien d'autre.
 *
 * CE QUI EST RÉELLEMENT PROUVÉ, ET QUI SUFFIT À CE DONT LE PRODUIT DÉPEND :
 * le cycle s'ouvre exactement une fois par tour ; un tour périmé ne le rouvre
 * pas ; un rejeu ne le duplique pas ; une bascule de mode ne le duplique pas ;
 * l'exécution réelle porte son propre garde de ré-entrée, hors gel ; l'erreur
 * technique ne se déguise jamais en succès ; et rien de tout cela n'est décidé
 * par l'observation.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXECUTION_PHASES, LIFECYCLE_REFUSALS, createExecutionLifecycle,
  assertExecutionProvenance, assertOutputProvenance
} from '../core/adn/execution-lifecycle.js';
import { loadPilot, arbiterTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIFECYCLE = fs.readFileSync(path.join(root, 'core/adn/execution-lifecycle.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FRONT_CODE = sansProse((() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })());
const compte = (motif, src = FRONT_CODE) => [...src.matchAll(new RegExp(motif, 'g'))].length;

/** Les bornes de la plage gelée Architecte, mesurées et non supposées. */
const GEL = (() => {
  const debut = html.indexOf('function archContexte(){');
  return { debut, fin: html.indexOf('const ARCH_SAUVEGARDE_VERSION=', debut) };
})();
const estGele = (motif) => { const p = html.indexOf(motif); return p > GEL.debut && p < GEL.fin; };

// =================================================================================================
// §4/§12 — UNE SEULE AUTORITÉ DE CYCLE
// =================================================================================================

test('T-EXECPHASE-01 : une seule source de cycle d’exécution, et un seul registre', () => {
  const modules = fs.readdirSync(path.join(root, 'core/adn'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function createExecutionLifecycle/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(modules, ['execution-lifecycle.js'], 'EXECUTION_LIFECYCLE_AUTHORITY_SOURCE_COUNT = 1');
  assert.equal(compte('createExecutionLifecycle\\('), 1, 'le frontend ne crée qu’un registre…');
  assert.match(FRONT_CODE, /if\(!oprieState\.lifecycle\)oprieState\.lifecycle=runtime\.createExecutionLifecycle\(\)/,
    '…et il est mémorisé, jamais recréé à chaque tour.');
  assert.deepEqual([...EXECUTION_PHASES], ['READINESS', 'PROMPT_QG', 'EXECUTION', 'OUTPUT_QG', 'TERMINAL']);
});

test('T-EXECPHASE-09/10 : aucune machine à états parallèle, aucun cycle en double', () => {
  for (const fantome of ['executionStateMachine', 'ExecutionPhase', 'PHASE_STATE', 'currentPhase',
                         'executionPhases', 'lifecycle2', 'secondLifecycle']) {
    assert.equal(html.includes(fantome), false, `${fantome} n’existe pas.`);
  }
  assert.equal(compte('\\.begin\\('), 1, 'un seul point d’ouverture de cycle.');
  assert.equal(compte('oprieBeginExecutionCycle'), 2, 'définition + appel unique.');
  assert.match(FRONT_CODE, /oprieBeginExecutionCycle\(oprieState\.seq,canonical&&canonical\.version\|\|null\)/);
});

// =================================================================================================
// §5 — EXACTEMENT UNE FOIS, ET RIEN NE LE CONTOURNE
// =================================================================================================

test('T-EXECPHASE-02 : le cycle s’ouvre exactement une fois par tour', async () => {
  const cycle = createExecutionLifecycle();
  const premier = cycle.begin({ turn_id: 1, canonical_version: null });
  assert.equal(premier.allowed, true);
  assert.ok(Number.isInteger(premier.execution_id));
  assert.ok(cycle.hasOpenExecution(1), 'le cycle est ouvert pour ce tour…');
  /* Le NOYAU n'interdit pas d'en ouvrir un second : il rend la question posable
     (`hasOpenExecution`) et laisse l'appelant décider. C'est le produit qui
     garantit l'unicité, en n'ayant qu'UN SEUL point d'ouverture — et ce point
     est atteint depuis l'unique endroit qui pose le contrat canonique. */
  assert.equal(compte('\\.begin\\('), 1, 'un seul point d’ouverture dans tout le produit.');
  assert.equal(compte('oprieBeginExecutionCycle\\('), 2, 'définition + appel unique.');
  const enter = sansProse(html.slice(html.indexOf('function oprieEnterExecution('), html.indexOf('function oprieDecideOrchestration')));
  assert.equal([...enter.matchAll(/oprieBeginExecutionCycle\(/g)].length, 1, 'appelé une fois par tour.');
  /* Un tour invalide n'ouvre rien : le noyau ferme plutôt que de deviner. */
  assert.equal(cycle.begin({ turn_id: -1 }).allowed, false);
  assert.equal(cycle.begin({}).reason, 'TURN_ID_INVALID');
});

test('T-EXECPHASE-03 : un rejeu ne peut pas doubler l’exécution', async () => {
  const h = loadPilot({ mode: 'architecte', deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.spy.executed.length, 1);
  for (let i = 0; i < 5; i += 1) h.pilot.oprieApplyTurn(h.pilot.oprieState.lastTurn, 'architecte');
  assert.equal(h.spy.executed.length, 1, 'cinq rejeux, une exécution.');
  assert.ok(h.pilot.oprieState.telemetry.some((m) => m.event === 'orchestration_replay_suppressed'),
    'et le rejeu est absorbé, tracé, jamais rejoué.');
  /* Le garde qui l'assure vit dans le pilote, et il est unique. */
  assert.match(FRONT_CODE, /if\(oprieActionAlreadyApplied\(oprieState\.seq,action\)\)/);
  assert.equal(compte('oprieRecordAppliedAction\\('), 2, 'définition + pose unique.');
});

test('T-EXECPHASE-04 : un rappel périmé ne rouvre aucun cycle', async () => {
  /* Au niveau du noyau : un cycle d'un tour dépassé refuse toute phase. */
  const cycle = createExecutionLifecycle();
  const v = cycle.begin({ turn_id: 3, canonical_version: null });
  const refus = cycle.enterPhase(v.execution_id, 'READINESS', { currentTurnId: 7 });
  assert.equal(refus.allowed, false);
  assert.equal(refus.reason, 'STALE_EXECUTION');
  assert.ok(LIFECYCLE_REFUSALS.includes('STALE_EXECUTION'));
  /* Au niveau du produit : un tour périmé n'entre jamais en exécution. */
  const h = loadPilot({ mode: 'architecte', deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'aucun moteur entré…');
  assert.equal(h.pilot.oprieState.telemetry.filter((m) => m.event === 'execution_cycle_begin').length, 0,
    '…et aucun cycle ouvert.');
});

test('T-EXECPHASE-05 : une bascule de mode ne duplique pas l’exécution', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => { await delay(120); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.pilot.oprieState.seq += 1;          /* ce que fait la bascule vers Atelier */
  h.ctx.adpState.requestedMode = 'atelier';
  await enVol;
  assert.deepEqual(h.spy.executed, []);
  /* Et un nouveau tour ouvre SON cycle, pas celui d'avant. */
  /* Le verrou de tour reste pris quand le numéro a bougé — c'est précisément ce que
     v11AbandonGovernedTurn relâche en production (MODE-04). On l'émule ici, sinon on
     mesurerait le verrou, pas la duplication. */
  h.pilot.oprieState.running = false;
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.executed.length, 1, 'le nouveau tour exécute une fois, et une seule.');
});

// =================================================================================================
// §7/§9 — LE GEL, ET CE QU'IL REND IMPOSSIBLE
// =================================================================================================

test('T-EXECPHASE-11 : trois des cinq phases se produisent DANS la plage gelée', () => {
  assert.ok(GEL.debut > 0 && GEL.fin > GEL.debut, 'la plage gelée Architecte est localisable.');
  /* Les points non gelés — la frontière, instrumentable. */
  for (const dehors of ['function oprieEnterExecution(', 'function oprieBeginExecutionCycle(',
                        'function archExecutionUneSeuleFois()']) {
    assert.equal(estGele(dehors), false, `${dehors} est hors gel.`);
  }
  /* Les points gelés — l'intérieur, hors d'atteinte. */
  for (const dedans of ['async function archConstruireExecuter()', 'function archCompiler(',
                        'function archControleSortie(']) {
    assert.ok(estGele(dedans), `${dedans} est DANS la plage gelée.`);
  }
  /* Et le hash gelé Architecte est celui des lots précédents. */
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'anti-regression-baseline.json'), 'utf8'));
  assert.equal(baseline.hashes['moteur Architecte'],
    'bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e');
});

test('T-EXECPHASE-12 : aucune instrumentation de phase n’est prétendue — et l’ordre strict l’interdit', () => {
  /* LE FAIT : le produit n'entre dans AUCUNE phase, et n'enregistre ni tentative
     fournisseur ni verdict terminal. Le dire est la seule façon de ne pas mentir. */
  assert.equal(compte('enterPhase\\('), 0, 'aucune phase parcourue par le produit.');
  assert.equal(compte('recordProviderAttempt'), 0, 'aucune tentative enregistrée.');
  assert.equal(compte('applyTerminal\\('), 0, 'aucun verdict terminal appliqué par le produit.');
  /* LA RAISON : l'ordre est strict. Entrer dans READINESS puis sauter à TERMINAL
     est refusé PAR LE NOYAU — une instrumentation partielle est donc impossible. */
  const cycle = createExecutionLifecycle();
  const v = cycle.begin({ turn_id: 1, canonical_version: null });
  assert.equal(cycle.enterPhase(v.execution_id, 'READINESS').allowed, true);
  const saut = cycle.enterPhase(v.execution_id, 'TERMINAL');
  assert.equal(saut.allowed, false);
  assert.equal(saut.reason, 'PHASE_SKIPPED');
  assert.match(LIFECYCLE, /if \(index !== derniere \+ 1\) return no\("PHASE_SKIPPED"\)/);
  /* Et le produit ne prétend nulle part le contraire. */
  for (const pretention of ['phase_instrumented', 'phases_observed', 'internal_phase']) {
    assert.equal(html.includes(pretention), false, `aucune prétention « ${pretention} ».`);
  }
});

// =================================================================================================
// §10/§19 — L'OBSERVATION NE DÉCIDE RIEN
// =================================================================================================

test('T-EXECPHASE-08/13 : le cycle et son identifiant n’écrivent aucune autorité', () => {
  /* Le noyau de cycle ne connaît aucun état métier : il ne peut donc en produire aucun. */
  const code = sansProse(LIFECYCLE);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'execution_ready',
                          'readiness', 'route', 'oprie_state']) {
    assert.equal(code.includes(interdit), false, `le noyau de cycle ignore ${interdit}.`);
  }
  /* Il compte des TENTATIVES fournisseur — un entier, sans nom de fournisseur ni verdict. */
  assert.match(code, /provider_attempts: 0/);
  assert.equal(/provider_attempts[^\n]*(groq|anthropic|openai)/i.test(code), false);
  /* Et le verdict terminal lui est DONNÉ : il ne le calcule pas. */
  assert.match(code, /applyTerminal\(executionId, outcome\)/);
  assert.equal(code.includes('qg_status ==='), false, 'il ne juge aucun verdict de gate.');
  assert.equal(EXECUTION_PHASES.some((p) => /READY|BLOCKED|DEGRADED/.test(p)), false,
    'aucune phase ne porte le nom d’un état métier.');
  /* executionId est une identité d'observation : écrite une fois, lue par les preuves. */
  assert.equal(compte('(?<![=!<>])\\boprieState\\.executionId\\s*=(?![=>])'), 1);
  assert.equal(compte('oprieState\\.executionId') - 1, 0, 'aucun code du produit ne le lit.');
  const decision = sansProse(html.slice(html.indexOf('function oprieDriveOrchestration('), html.indexOf('function oprieApplyTurn(')));
  assert.equal(decision.includes('executionId'), false, 'et aucune décision ne s’y réfère.');
});

test('T-EXECPHASE-14 : la trace de cycle est bornée, et ne porte aucun contenu', () => {
  assert.match(LIFECYCLE, /const trim = \(\) => \{ while \(records\.length > maxRecords\) records\.shift\(\); \}/);
  assert.match(LIFECYCLE, /maxRecords = 20/);
  const cycle = createExecutionLifecycle({ maxRecords: 3 });
  const ids = [];
  for (let t = 1; t <= 10; t += 1) {
    const v = cycle.begin({ turn_id: t, canonical_version: null });
    ids.push(v.execution_id);
    cycle.applyTerminal(v.execution_id, { qg_status: 'PASS' });
  }
  /* Les sept plus anciens ont été évincés : la rétention est réellement bornée. */
  assert.equal(cycle.describe(ids[0]), null, 'le plus ancien n’est plus retenu.');
  assert.ok(cycle.describe(ids.at(-1)), 'le plus récent l’est.');
  /* Et un enregistrement ne porte que des métadonnées techniques. */
  const vue = cycle.describe(ids.at(-1));
  for (const champ of Object.keys(vue)) {
    assert.doesNotMatch(champ, /prompt|demande|texte|content|output_text|cle|key/i, `${champ} n’est pas du contenu.`);
  }
  const code = sansProse(LIFECYCLE);
  for (const secret of ['api-cle', 'Bearer', 'x-api-key', 'Authorization']) {
    assert.equal(code.includes(secret), false, `aucun secret dans le noyau de cycle (${secret}).`);
  }
});

// =================================================================================================
// §20/§21/§22 — SUCCÈS, ERREUR, ET LE GATE DE SORTIE
// =================================================================================================

test('T-EXECPHASE-06 : le chemin du livrable passe bien par le contrôle de sortie', () => {
  const pro = sansProse(html.slice(html.indexOf('async function archConstruireExecuter()'), html.indexOf('const ARCH_SAUVEGARDE_VERSION=')));
  assert.match(pro, /await appelFournisseur\(/, 'le livrable appelle bien un fournisseur…');
  assert.match(pro, /archControleSortie\(/, '…et sa sortie passe par le contrôle.');
  /* Une seule autorité de conformité de sortie, comme FORMAT-STRUCT-01 l'a établi. */
  const modules = fs.readdirSync(path.join(root, 'core/adn'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function validateOutputAgainstCanonicalContract/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(modules, ['output-compliance-gate.js'], 'OUTPUT_QG_AUTHORITY_SOURCE_COUNT = 1');
  /* Et la provenance interdit d'opposer une sortie à une AUTRE exécution. */
  assert.equal(assertOutputProvenance({ execution_id: 4, output_execution_id: 4 }).allowed, true);
  const etrangere = assertOutputProvenance({ execution_id: 4, output_execution_id: 5 });
  assert.equal(etrangere.allowed, false, 'une sortie née d’une AUTRE exécution est refusée…');
  assert.equal(etrangere.reason, 'STALE_EXECUTION');
  assert.equal(assertExecutionProvenance({ qg_artifact_id: 'a', execution_artifact_id: 'b' }).allowed, false,
    '…et un prompt exécuté qui n’est pas celui qui a passé le gate, aussi.');
});

test('T-EXECPHASE-07 : une erreur technique ne se déguise jamais en succès', async () => {
  const h = loadPilot({ mode: 'architecte', deep: async () => { throw new Error('panne'); } });
  await h.pilot.oprieRunTurn('architecte');
  assert.deepEqual(h.spy.executed, [], 'aucune exécution…');
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical', '…et l’échec est rendu comme tel.');
  assert.equal(h.pilot.oprieState.telemetry.filter((m) => m.event === 'execution_cycle_begin').length, 0,
    'aucun cycle ouvert sur une panne.');
  /* Le garde de ré-entrée du livrable, lui, est HORS GEL et se referme toujours. */
  assert.match(html, /async function archExecutionUneSeuleFois\(\)\{\s*if\(archExecutionEnCours\)\{archExecutionsRefusees\+=1;return false\}\s*archExecutionEnCours=true;\s*try\{return await archConstruireExecuter\(\)\}\s*finally\{archExecutionEnCours=false\}/,
    'un second clic est refusé, et l’état est rendu même sur exception.');
  /* Le noyau refuse aussi qu'un second verdict terminal écrase le premier. */
  const cycle = createExecutionLifecycle();
  const v = cycle.begin({ turn_id: 1, canonical_version: null });
  assert.equal(cycle.applyTerminal(v.execution_id, { qg_status: 'FAIL' }).allowed, true);
  const second = cycle.applyTerminal(v.execution_id, { qg_status: 'PASS' });
  assert.equal(second.allowed, false, 'un résultat tardif ne réécrit pas le premier.');
  assert.equal(second.reason, 'TERMINAL_ALREADY_APPLIED');
});

// =================================================================================================
// §24/§25/§26 — LES FRONTIÈRES DE MODE NE BOUGENT PAS
// =================================================================================================

test('T-EXECPHASE-BORNES : seul le chemin Pro exécute ; les autres rendent un prompt', () => {
  const rapide = sansProse(html.slice(html.indexOf('function adpRunRapide('), html.indexOf('async function v11StartRapide')));
  assert.doesNotMatch(rapide, /appelFournisseur|archControleSortie|createExecutionLifecycle/);
  const api = sansProse(html.slice(html.indexOf('async function beginApiAnalysis()'), html.indexOf('function compositeDemand')));
  assert.doesNotMatch(api, /archControleSortie|archConstruireExecuter/);
  const atelier = sansProse(html.slice(html.indexOf('function v11StartAtelier()'), html.indexOf('window.askDecisionProvider')));
  assert.doesNotMatch(atelier, /appelFournisseur|archControleSortie|createExecutionLifecycle|oprieBeginExecutionCycle/);
  /* Et le cycle ne s'ouvre qu'au seul endroit qui pose le contrat canonique. */
  assert.equal(compte('oprieState\\.canonicalContract\\s*='), 1);
  const enter = sansProse(html.slice(html.indexOf('function oprieEnterExecution('), html.indexOf('function oprieDecideOrchestration')));
  assert.ok(enter.indexOf('oprieState.canonicalContract=canonical') < enter.indexOf('oprieBeginExecutionCycle('));
});

// =================================================================================================
// §34 — LA DETTE, DANS LE REGISTRE
// =================================================================================================

test('T-EXECPHASE-15 : le registre porte la fermeture, sa méthode et sa limite', () => {
  const registre = fs.readFileSync(path.join(root, 'docs/OPEN-DEBTS.md'), 'utf8');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  const ids = [...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['PERF-REAL-01'], 'une seule dette ouverte demeure.');
  assert.match(registre, /EXEC-PHASE-INSTRUMENT-01 \| EXEC-PHASE-INSTRUMENT-01/, 'fermée par son propre lot.');
  assert.match(registre, /CLOSED_BY_BOUNDARY_PROOF/, 'et la méthode de fermeture est nommée.');
  assert.match(registre, /INTERNAL_ARCHITECTE_PHASES_NOT_INSTRUMENTED_DUE_FROZEN_RANGE/,
    'la limitation est écrite, pas sous-entendue.');
  /* Le registre reste sans autorité : aucun code du produit ne le lit. */
  assert.equal(html.includes('OPEN-DEBTS'), false);
});
