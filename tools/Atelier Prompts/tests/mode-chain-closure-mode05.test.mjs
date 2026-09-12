/* MODE-05 — LA CHAÎNE DES MODES, FERMÉE TRANSVERSALEMENT.
 * ============================================================================
 *
 * Les quatre lots précédents ont fermé chaque mode CHEZ LUI. Celui-ci pose la
 * seule question qui restait : les trois forment-ils UN système, ou trois
 * systèmes qui se croisent ?
 *
 * Ce que cette suite éprouve, et qui n'appartient à aucun mode isolé :
 *
 *   UNE SEULE TABLE de contrats, trois modes, deux familles, et un mode
 *   inconnu qui ne devient jamais l'un des trois par défaut.
 *
 *   LES SIX BASCULES et les trois resélections : aucun résultat d'un contexte
 *   quitté ne peut reprendre l'écran du contexte courant.
 *
 *   UN SEUL ÉCRIVAIN par autorité — OPRIE décide, la politique applique, et
 *   aucun mode ne réinterprète l'un des cinq états.
 *
 * DÉFAUT FERMÉ PAR CE LOT. L'analyse fournisseur d'Architecte — beginApiAnalysis
 * — était le SEUL écrivain asynchrone du parcours gouverné lié ni au tour ni au
 * mode. Le plan profond et le plan rapide se périment par numéro de tour ; cet
 * appel-là durait plusieurs secondes puis écrivait state.analysis, #v11-final et
 * show('#v11-ready') sans demander si quelqu'un l'attendait encore. `show()`
 * masquant les quatre autres panneaux, le dernier arrivé gagnait l'écran.
 *
 * CE QUI N'EST PAS PRÉTENDU FERMÉ ICI. `etat.prompt` reste une case partagée de
 * l'espace avancé, écrite par les trois vues de cet espace. Ce n'est pas la
 * frontière des trois modes, et cette suite le caractérise au lieu de le
 * maquiller. (CLEAN-02 lui a depuis donné un propriétaire explicite — l'espace
 * avancé — et a prouvé qu'il n'entre dans aucun tour gouverné. Ce n'est donc
 * plus une dette : c'est un état partagé assumé, et nommé.)
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODE_CONTRACTS, MODE_IDS, MODE_CLASSES, EXECUTION_TARGETS, FORBIDDEN_CONTRACT_FIELDS,
  contractFor, executionTargetFor, usesGovernedPipeline, modesOfClass, validateModeContracts
} from '../core/adn/mode-contracts.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay, html } from './perf04-frontend-harness.helper.mjs';
import { canonicalFrom, coherentAnalysis, oprieReadyTurn, productionSlice } from './post-oprie-validation-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_RUNTIME = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (debut, fin) => { const a = html.indexOf(debut); return html.slice(a, html.indexOf(fin, a + debut.length)); };
/* Le frontend écrit à la main : le bloc runtime généré en est retiré, sinon on
   compterait deux fois ce qui n'existe qu'une fois. */
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);

const ROUTEUR = sansProse(tranche('window.__V11_ROUTER__', 'function init()'));
const API_ANALYSE = sansProse(tranche('async function beginApiAnalysis()', 'function compositeDemand'));
const RUN_RAPIDE = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
const ENTER_ARCH = sansProse(tranche('function adpEnterArchitecte(', 'function adpRunRapide('));
const ATELIER_ENTREE = sansProse(tranche('function v11StartAtelier()', 'window.askDecisionProvider'));
const RESET_PRESENTATION_BRUT = tranche('function resetModePresentation(', 'function setMode(');
const RESET_PRESENTATION = sansProse(RESET_PRESENTATION_BRUT);
const SET_MODE = sansProse(tranche('function setMode(', 'function currentMode()'));
const ARCH_EXEC = sansProse(tranche('async function archConstruireExecuter()', 'const ARCH_SAUVEGARDE_VERSION='));
const TOUR = sansProse(tranche('function oprieBuildBody()', 'function oprieSetBusy'));
const PLAN_RAPIDE = sansProse(tranche('function oprieStartFastPlane(', 'function oprieReconcileFast('));

const ecritures = (nom, src = FRONT_CODE) =>
  [...src.matchAll(new RegExp(`(?<![=!<>])\\b${nom.replace(/\./g, '\\.')}\\s*=(?![=>])`, 'g'))].length;

/* ------------------------------------------------------------------------ *
 * HARNESS 1 — LA FRONTIÈRE DE BASCULE RÉELLE (routeur + gardes de mode).
 * ------------------------------------------------------------------------ */
function chargerRouteur(options = {}) {
  const h = loadPilot(options);
  const socle = h.ctx.adnRuntime;
  h.ctx.adnRuntime = () => Object.assign({}, socle(), { usesGovernedPipeline });
  const entrees = [];
  h.ctx.window = {};
  h.ctx.v11StartRapide = () => { entrees.push('rapide'); return true; };
  h.ctx.v11StartArchitecte = () => { entrees.push('architecte'); return true; };
  h.ctx.v11StartAtelier = () => { entrees.push('atelier'); return true; };
  vm.runInContext(tranche('window.__V11_ROUTER__', 'function init()') +
    '\n;globalThis.__routeur=window.__V11_ROUTER__;globalThis.__abandon=v11AbandonGovernedTurn;', h.ctx);
  return { ...h, entrees, routeur: h.ctx.__routeur, abandon: h.ctx.__abandon };
}
const tourLent = (sonde) => async (body, { signal }) => {
  sonde.signal = signal; await delay(120); return arbiterTurn('operational_request_ready');
};

/* ------------------------------------------------------------------------ *
 * HARNESS 2 — L'ANALYSE FOURNISSEUR RÉELLE (beginApiAnalysis de production).
 *
 * `pendantAppel` s'exécute PENDANT l'attente du fournisseur : c'est la seule
 * façon honnête de simuler quelqu'un qui change de contexte au milieu.
 * ------------------------------------------------------------------------ */
function chargerAnalyse({ pendantAppel = () => {}, mode = 'architecte' } = {}) {
  const elements = new Map();
  const trace = { show: [], compile: 0 };
  const element = (selector) => {
    const cle = String(selector);
    if (!elements.has(cle)) {
      elements.set(cle, { value: '', hidden: false, textContent: '', innerHTML: '', className: '',
        focus() {}, scrollIntoView() {}, dispatchEvent() { return true; },
        classList: { add() {}, remove() {}, toggle() {} }, options: [], selectedIndex: 0 });
    }
    return elements.get(cle);
  };
  element('#api-cle').value = 'test-only-key';
  element('#api-modele').value = 'test-model';
  element('#api-max').value = '8000';
  element('#ui-mode-select').value = mode;

  const state = { docs: [], answers: [], analysis: null, exchangeId: 'x', requestName: 'q.json', responseName: 'r.json' };
  const contexte = {
    console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, Intl, Promise, setTimeout, clearTimeout,
    document: { querySelector: element, body: { classList: { toggle() {} } } },
    Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; } },
    state, adpState: { pendingQuestion: false, requestedMode: 'architecte' },
    oprieState: { seq: 7, canonicalContract: canonicalFrom(oprieReadyTurn()), enrichedContract: null },
    $: element,
    syncLegacy() {}, show: (id) => trace.show.push(id),
    adnReadinessInstruction: () => '', adnAppendFinalExecutionDirective: (p) => String(p),
    v11ShowRapidGate() {}, showQuestion() {}, humanError() {}, humanValidationError() {},
    rotateExchangeAfterMismatch() {}, requestAnimationFrame(fn) { fn(); }
  };
  contexte.window = {
    obtenirFournisseurActif: () => 'anthropic', obtenirCleFournisseur: () => 'test-only-key',
    obtenirModeleActif: () => 'test-model',
    appelFournisseur: async () => { pendantAppel(contexte, element); return { texte: JSON.stringify(coherentAnalysis()) }; }
  };
  contexte.globalThis = contexte; contexte.self = contexte;
  vm.createContext(contexte);
  vm.runInContext(BROWSER_RUNTIME, contexte, { filename: 'atelier:browser-runtime.generated.js' });
  const runtime = contexte.window.__ATELIER_ADN_RUNTIME__;
  contexte.adnRuntime = () => runtime;
  contexte.window.__ARCHITECTE_V10__ = {
    systeme: 'SYSTEM', schema: {}, analyse: null, contexte: () => ({ demande: 'Demande de contrôle.' }),
    valider: () => [], importer(v) { this.analyse = v; return true; },
    compiler() { trace.compile += 1; return 'PROMPT_COMPILE'; }
  };
  vm.runInContext(productionSlice('function adnEnrichCanonicalWithArch(', 'function adnReadinessInstruction('), contexte);
  vm.runInContext(productionSlice('async function beginApiAnalysis', 'function compositeDemand'), contexte);
  return { trace, state, ctx: contexte, element, run: () => vm.runInContext('beginApiAnalysis()', contexte) };
}

/** Contexte de politique : un même verdict OPRIE, posé dans le mode demandé. */
const ctxPolitique = (mode, deep, extra = {}) => ({
  mode, turn: { turn_id: 3, current_turn_id: 3, mode, pending_user_interaction: false },
  fast: null, deep, readiness: null, promptQG: null, execution: null, outputQG: null, ...extra
});

// =================================================================================================
// §103 — LA MATRICE DES CONTRATS
// =================================================================================================

test('T-MODE05-01/02/03 : trois modes, une seule table, deux familles', () => {
  assert.equal(MODE_IDS.length, 3);
  assert.deepEqual([...MODE_IDS], ['rapide', 'architecte', 'atelier']);
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1,
    'une seule implémentation embarquée — et elle vient de core/adn/mode-contracts.js.');
  assert.equal(modesOfClass('governed_execution').length, 2);
  assert.equal(modesOfClass('manual_composition').length, 1);
  assert.deepEqual([...MODE_CLASSES], ['governed_execution', 'manual_composition']);
  assert.deepEqual([...EXECUTION_TARGETS], ['rapide', 'architecte']);
});

test('T-MODE05-04 : un mode inconnu n’hérite de rien et n’exécute rien', () => {
  for (const inconnu of ['expert', 'pro', '', null, undefined, 'RAPIDE', 'atelier ']) {
    assert.equal(contractFor(inconnu), null, `${String(inconnu)} n’a pas de contrat.`);
    assert.equal(executionTargetFor(inconnu), null, `${String(inconnu)} n’a pas de destination.`);
    assert.equal(usesGovernedPipeline(inconnu), false);
  }
  /* Et le frontend ferme le tour au lieu de deviner une destination. */
  const enter = sansProse(tranche('function oprieExecutionTarget', 'function oprieApplyTurn'));
  assert.match(enter, /if\(!route\)\{oprieMark\('execution_target_unknown'/);
  assert.match(enter, /return oprieShowNetworkFailure\(\)/);
});

test('T-MODE05-05 : aucun champ de contrat ne peut réinterpréter OPRIE', () => {
  for (const banni of ['readinessDialogue', 'engineDialogueLoop', 'readyPolicy', 'clarificationPolicy',
                       'confirmationPolicy', 'readinessPolicy', 'semanticThreshold', 'oprieState',
                       'canonicalContract', 'qgPolicy', 'providerOrder', 'provider']) {
    assert.ok(FORBIDDEN_CONTRACT_FIELDS.includes(banni), `${banni} doit rester banni.`);
  }
  for (const id of MODE_IDS) {
    const menteur = { [id]: { ...MODE_CONTRACTS[id], readinessDialogue: true } };
    assert.ok(validateModeContracts(menteur).some((p) => p.includes('FORBIDDEN_FIELD_readinessDialogue')));
  }
  assert.deepEqual(validateModeContracts(), [], 'la table réelle, elle, est valide.');
});

test('T-MODE05-06 : aucun contrat de mode fantôme, dans aucun des trois modes', () => {
  for (const prefixe of ['RAPIDE', 'ARCHITECTE', 'ATELIER']) {
    for (const suffixe of ['_CONFIG', '_POLICY', '_OPTIONS', '_BEHAVIOR', '_ENGINE', '_CONTRACT']) {
      assert.equal(FRONT_CODE.includes(prefixe + suffixe), false, `${prefixe}${suffixe} ne doit pas exister.`);
    }
  }
  for (const camel of ['rapidePolicy', 'architectePolicy', 'atelierPolicy',
                       'rapideContract', 'architecteContract', 'atelierContract',
                       'modePolicy', 'modeBehavior', 'modeOptions', 'requestedModeTable']) {
    assert.equal(FRONT_CODE.includes(camel), false, `${camel} ne doit pas exister.`);
  }
});

// =================================================================================================
// §104 — LA MATRICE DES LIVRABLES, DITE COMME LE CODE LA TIENT
// =================================================================================================

test('T-MODE05-07..10 : qui produit un livrable final, et par quel chemin', () => {
  /* Rapide s'arrête sur un prompt — mesuré en MODE-02, et le contrat le dit. */
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false);
  assert.doesNotMatch(RUN_RAPIDE, /appelFournisseur|archControleSortie/, 'aucun livrable sur le chemin Rapide.');
  /* Architecte : le parcours PRINCIPAL s'arrête aussi sur un prompt… */
  assert.match(API_ANALYSE, /\$\('#v11-final'\)\.value=adnAppendFinalExecutionDirective\(prompt\);show\('#v11-ready'/);
  assert.doesNotMatch(API_ANALYSE, /archControleSortie|archConstruireExecuter/);
  /* …et le livrable vit derrière une action DISTINCTE, dans l'onglet Pro. */
  assert.match(html, /aq\('#arch-construire-executer'\)\.addEventListener\('click',archExecutionUneSeuleFois\)/);
  assert.match(ARCH_EXEC, /await appelFournisseur\(/);
  assert.match(ARCH_EXEC, /archControleSortie\(/);
  assert.equal(MODE_CONTRACTS.architecte.producesFinalDeliverable, true, 'le mode DISPOSE d’un chemin de livrable.');
  /* Atelier : aucun, nulle part. */
  assert.equal(MODE_CONTRACTS.atelier.producesFinalDeliverable, false);
  assert.doesNotMatch(ATELIER_ENTREE, /appelFournisseur|archControleSortie|beginApiAnalysis/);
});

// =================================================================================================
// §105 — LES SIX BASCULES
// =================================================================================================

test('T-MODE05-11/13 : entre modes gouvernés, un tour en vol interdit d’en ouvrir un second', async () => {
  for (const [depuis, vers] of [['rapide', 'architecte'], ['architecte', 'rapide']]) {
    const sonde = {};
    const h = chargerRouteur({ mode: depuis, deep: tourLent(sonde) });
    const enVol = h.pilot.oprieRunTurn(depuis);
    await delay(20);
    const seq = h.pilot.oprieState.seq;
    assert.equal(await h.pilot.oprieRunTurn(vers), false, `${depuis}→${vers} : le second tour est refusé.`);
    assert.equal(h.pilot.oprieState.seq, seq, 'et aucun numéro de tour n’a été consommé.');
    assert.equal(h.spy.deepCalls.length, 1, 'un seul appel profond : pas de tour dupliqué.');
    await enVol;
    assert.equal(h.spy.executed.length, 1, 'le tour d’origine s’applique à SON mode, une seule fois.');
  }
});

test('T-MODE05-12/14 : gouverné → Atelier périme le tour, et rien n’atterrit après', async () => {
  for (const depuis of ['rapide', 'architecte']) {
    const sonde = {};
    const h = chargerRouteur({ mode: depuis, deep: tourLent(sonde) });
    const enVol = h.pilot.oprieRunTurn(depuis);
    await delay(20);
    const seq = h.pilot.oprieState.seq;
    h.routeur.start('atelier');
    assert.equal(h.pilot.oprieState.seq, seq + 1, `${depuis}→atelier : le tour est périmé.`);
    assert.equal(sonde.signal.aborted, true, 'et son transport est annulé.');
    await enVol;
    assert.deepEqual(h.spy.executed, [], 'aucun moteur n’est entré après la bascule.');
    assert.deepEqual(h.entrees, ['atelier']);
  }
});

test('T-MODE05-15/16 : Atelier → gouverné repart d’un contexte propre', () => {
  /* Les deux entrées gouvernées effacent l'enveloppe partagée AVANT de la
     reconstruire : l'enveloppe locale d'Atelier ne peut donc en survivre aucune. */
  for (const [nom, src, pose] of [['Rapide', RUN_RAPIDE, 'adpState.lastEnvelope=refined'],
                                  ['Architecte', ENTER_ARCH, 'adpState.lastEnvelope=envelope']]) {
    const efface = src.indexOf('adpState.lastEnvelope=null');
    assert.ok(efface > -1, `${nom} efface l’enveloppe partagée.`);
    assert.ok(efface < src.indexOf(pose), `${nom} l’efface avant de la reposer.`);
    assert.ok(efface < src.indexOf('try{'), `${nom} l’efface hors du try : un échec ne laisse rien.`);
    assert.doesNotMatch(src, /lastProjection/, `${nom} : plus de projection partagée.`);
  }
  /* Et l'entrée gouvernée passe par un tour OPRIE complet, jamais par un état repris. */
  assert.match(sansProse(tranche('async function v11StartRapide()', 'async function v11StartArchitecte')), /oprieRunTurn\('rapide'\)/);
  assert.match(sansProse(tranche('async function v11StartArchitecte()', 'function v11StartAtelier')), /oprieRunTurn\('architecte'\)/);
  assert.doesNotMatch(TOUR, /lastEnvelope|lastProjection|etat\.prompt/, 'le tour ne lit aucun résidu de mode.');
});

// =================================================================================================
// §106 — LES TROIS RESÉLECTIONS
// =================================================================================================

test('T-MODE05-17/18 : resélectionner un mode gouverné ne duplique ni tour ni appel', async () => {
  for (const mode of ['rapide', 'architecte']) {
    const sonde = {};
    const h = chargerRouteur({ mode, deep: tourLent(sonde) });
    const enVol = h.pilot.oprieRunTurn(mode);
    await delay(20);
    assert.equal(await h.pilot.oprieRunTurn(mode), false, 'le second clic est absorbé.');
    await enVol;
    assert.equal(h.spy.deepCalls.length, 1, 'un seul appel profond.');
    assert.equal(h.spy.fastCalls.length, 1, 'un seul appel rapide.');
    assert.equal(h.spy.executed.length, 1, 'un seul moteur entré.');
  }
});

test('T-MODE05-19 : resélectionner Atelier ne crée aucun second contexte', () => {
  const h = chargerRouteur({ mode: 'rapide' });
  h.routeur.start('atelier');
  h.routeur.start('atelier');
  assert.deepEqual(h.entrees, ['atelier', 'atelier'], 'deux entrées, la même vue.');
  assert.equal(h.pilot.oprieState.running, false);
  assert.equal(h.spy.deepCalls.length, 0, 'Atelier n’ouvre aucun tour, jamais.');
  assert.equal(h.spy.fastCalls.length, 0);
});

// =================================================================================================
// §107/§108 — CE QUI SURVIT, ET CE QUI DOIT DISPARAÎTRE
// =================================================================================================

test('T-MODE05-20/21 : la demande et les documents survivent aux six bascules', () => {
  /* Une seule fonction gouverne la présentation de TOUTES les bascules : ce qu'elle
     conserve est donc conservé partout, et ce qu'elle masque est masqué partout. */
  assert.match(RESET_PRESENTATION_BRUT, /On conserve volontairement #v11-demande/,
    'la conservation est écrite, pas déduite.');
  assert.doesNotMatch(RESET_PRESENTATION, /#v11-demande'\)[^;]*\.value\s*=/, 'la demande n’est jamais effacée.');
  assert.equal(ecritures('state.docs', RESET_PRESENTATION), 0, 'les documents non plus.');
  assert.equal(ecritures('state.answers', RESET_PRESENTATION), 0, 'l’historique de clarification non plus.');
  /* L'entrée Atelier REPORTE la demande au lieu de la perdre. */
  assert.match(ATELIER_ENTREE, /if\(ad\)\{ad\.value=d;/);
  assert.match(ATELIER_ENTREE, /if\(am\)\{am\.value=mat;/);
});

test('T-MODE05-22..26 : un seul mode visible, et aucun résidu du précédent', () => {
  assert.match(SET_MODE, /classList\.toggle\('is-active',active\)/);
  assert.match(SET_MODE, /setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(SET_MODE, /resetModePresentation\(mode\)/, 'toute bascule passe par le même nettoyage.');
  /* Résultat, chargement, dialogue, échange, prompt final : tous masqués. */
  for (const panneau of ['#ui-rapid-result', '#ui-rapid-gate', '#v11-api-progress',
                         '#v11-exchange', '#v11-dialogue', '#v11-ready']) {
    assert.ok(RESET_PRESENTATION.includes(panneau), `${panneau} est masqué à la bascule.`);
  }
  /* La modale de clarification est l'un de ces panneaux, pas un septième. */
  assert.match(html, /<div class="v11-stage v11-clarification-modal" id="v11-dialogue"/);
  /* Et le sélecteur affiche le mode réellement choisi — il ne ment pas. */
  assert.match(SET_MODE, /if\(select&&select\.value!==mode\)select\.value=mode/);
});

// =================================================================================================
// §109 — LES ÉCRIVAINS ASYNCHRONES, UN PAR UN
// =================================================================================================

test('T-MODE05-27 : une candidate rapide tardive ne peut pas reprendre l’écran', async () => {
  /* Trois gardes indépendants, chacun mesuré dans le code réel du plan rapide. */
  assert.match(PLAN_RAPIDE, /if\(seq!==oprieState\.seq\)\{oprieMark\('fast_discarded_stale'\)/);
  const rendu = sansProse(tranche('function oprieRenderFastInteraction(', 'function oprieStartFastPlane('));
  assert.match(rendu, /if\(oprieState\.concludedTurn===seq\)\{oprieMark\('fast_discarded_concluded'\)/);
  assert.match(rendu, /if\(adpState\.pendingQuestion\)\{oprieMark\('fast_discarded_pending'\)/);
  /* Et sur un tour périmé par une bascule, la candidate ne s'affiche pas. */
  const h = chargerRouteur({ mode: 'rapide', fast: async () => { await delay(80); return { type: 'ACKNOWLEDGE', text: 'Je regarde.' }; },
                             deep: async () => { await delay(150); return arbiterTurn('operational_request_ready'); } });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  const avant = h.spy.gate.length;
  h.routeur.start('atelier');
  await enVol;
  await delay(120);
  assert.equal(h.spy.gate.length, avant, 'aucun affichage après la bascule.');
});

test('T-MODE05-28 : un tour profond périmé n’écrit jamais par-dessus le courant', async () => {
  assert.match(TOUR, /const seq=\+\+oprieState\.seq/);
  assert.equal((TOUR.match(/if\(seq!==oprieState\.seq\)return null/g) || []).length, 3,
    'le numéro est revérifié après chaque await du transport.');
  assert.match(TOUR, /if\(oprieState\.controller\)oprieState\.controller\.abort\(\)/);
  const sonde = {};
  const h = chargerRouteur({ mode: 'architecte', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.routeur.start('atelier');
  await enVol;
  assert.deepEqual(h.spy.executed, []);
  assert.equal(h.pilot.oprieState.lastTurn, null, 'le tour périmé n’est même pas enregistré.');
});

test('T-MODE05-29 : une analyse fournisseur d’un contexte quitté n’écrit plus rien', async () => {
  /* Contrôle : sans bascule, l'analyse aboutit normalement. */
  const nominal = chargerAnalyse();
  await nominal.run();
  assert.equal(nominal.trace.compile, 1, 'le parcours nominal compile bien.');
  assert.ok(nominal.trace.show.includes('#v11-ready'), 'et rend son prompt.');
  assert.ok(nominal.ctx.window.__ARCHITECTE_V10__.analyse, 'et pose son analyse dans le seul magasin qui la porte.');

  /* Le tour a changé pendant l'appel : plus rien n'est écrit. */
  const tourChange = chargerAnalyse({ pendantAppel: (ctx) => { ctx.oprieState.seq += 1; } });
  assert.equal(await tourChange.run(), false);
  assert.equal(tourChange.trace.compile, 0, 'rien n’est compilé.');
  assert.equal(tourChange.trace.show.includes('#v11-ready'), false, 'rien n’est affiché.');
  assert.equal(tourChange.ctx.window.__ARCHITECTE_V10__.analyse, null, 'et aucune analyse n’est importée.');

  /* Le mode affiché a changé pendant l'appel : idem. */
  const modeChange = chargerAnalyse({ pendantAppel: (ctx, el) => { el('#ui-mode-select').value = 'atelier'; } });
  assert.equal(await modeChange.run(), false);
  assert.equal(modeChange.trace.compile, 0);
  assert.equal(modeChange.trace.show.includes('#v11-ready'), false);
  assert.equal(modeChange.ctx.window.__ARCHITECTE_V10__.analyse, null);
});

test('T-MODE05-30 : le livrable Pro écrit dans son propre onglet, sous garde de cycle', () => {
  /* Le chemin Pro ne touche AUCUN panneau du shell v11 : il ne peut donc pas
     reprendre l'écran d'un autre mode, quelle que soit sa durée. */
  for (const panneau of ['#v11-ready', '#v11-final', '#v11-exchange', '#v11-dialogue',
                         '#ui-rapid-result', '#v11-api-progress']) {
    assert.equal(ARCH_EXEC.includes(panneau), false, `le chemin Pro n’écrit pas ${panneau}.`);
  }
  assert.match(ARCH_EXEC, /aq\('#arch-execution-resultat'\)/, 'il rend dans sa propre zone.');
  /* Et il est gardé à l'entrée contre toute ré-entrée — garde IA-04. */
  assert.match(html, /function archExecutionUneSeuleFois\(\)/);
  assert.match(html, /aq\('#arch-construire-executer'\)\.addEventListener\('click',archExecutionUneSeuleFois\)/);
});

test('T-MODE05-31 : le verrou de tour ne peut pas rester collé après une bascule', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'architecte', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  assert.equal(h.pilot.oprieState.running, true);
  h.routeur.start('atelier');
  assert.equal(h.pilot.oprieState.running, false, 'le verrou tombe à la bascule…');
  assert.equal(h.spy.busy.at(-1).busy, false, '…et la saisie redevient disponible.');
  await enVol;
  /* La preuve utile : le pipeline repart. Sans cela, le `finally` du tour périmé
     — dont le numéro n'est plus le courant — l'aurait fermé pour toujours. */
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.deepCalls.length, 2);
  assert.equal(h.spy.executed.length, 1, 'et seul le nouveau tour exécute.');
});

// =================================================================================================
// §110 — LES ÉTATS PARTAGÉS
// =================================================================================================

test('T-MODE05-32 : aucune enveloppe ne peut entrer dans le mode d’un autre', () => {
  /* Sept écritures, UNE lecture, et cette lecture est précédée d'un effacement
     sur les deux entrées gouvernées : aucune enveloppe étrangère n'est atteignable. */
  /* CLEAN-01 : l'ancien décideur écrivait aussi ce champ ; il est retiré. */
  assert.equal(ecritures('adpState.lastEnvelope'), 6);
  assert.equal([...FRONT_CODE.matchAll(/=\s*adpState\.lastEnvelope\b/g)].length, 1);
  assert.match(sansProse(tranche('function adnCompactContractForArchitecte(', 'function adnEnrichCanonicalWithArch(')),
    /const env=adpState\.lastEnvelope/, 'le lecteur unique est nommé.');
  assert.match(sansProse(tranche('function makeEnvelope(){', 'function blobDownload(')),
    /adnCompactContractForArchitecte\(\)/, 'et consommé au seul endroit gouverné.');
  for (const src of [RUN_RAPIDE, ENTER_ARCH]) assert.ok(src.includes('adpState.lastEnvelope=null'));
});

test('T-MODE05-33 : lastProjection n’existe plus — elle n’était lue par personne', () => {
  /* MODE-05 l'avait mesurée : six écritures, zéro lecture. CLEAN-02 l'a retirée.
     Un état qu'on écrit sans jamais le lire ne peut plus mentir s'il n'existe pas. */
  assert.equal(ecritures('adpState.lastProjection'), 0);
  assert.equal(FRONT_CODE.includes('lastProjection'), false);
  assert.equal(FRONT_CODE.includes('projectToAtelier'), false, 'la projection Atelier partait avec elle.');
});

test('T-MODE05-34/36 : le contrat canonique et l’historique n’ont chacun qu’une source', () => {
  assert.equal([...FRONT_CODE.matchAll(/oprieState\.canonicalContract\s*=/g)].length, 1,
    'le contrat canonique est posé au seul endroit gouverné.');
  assert.match(sansProse(tranche('function oprieEnterExecution(', 'function oprieDecideOrchestration')),
    /const canonical=oprieBuildCanonicalContract\(turn\);\s*oprieState\.canonicalContract=canonical/,
    'et avant toute divergence de mode.');
  /* La demande originale et l'historique de clarification : une lecture, une source. */
  assert.equal((FRONT_CODE.match(/function oprieOriginalRequest\(\)/g) || []).length, 1);
  assert.equal((FRONT_CODE.match(/function oprieClarificationHistory\(\)/g) || []).length, 1);
  assert.match(TOUR, /original_request:oprieOriginalRequest\(\),clarification_history:oprieClarificationHistory\(\)/);
});

test('T-MODE05-35 : l’état local d’Atelier ne devient jamais autorité', () => {
  const local = decideNextOrchestrationAction(ctxPolitique('rapide', { state: 'exploitable' }));
  assert.notEqual(local.action, 'ENTER_READINESS', '« exploitable » n’ouvre aucune readiness.');
  assert.equal(contractFor('atelier').allowsExecution, false);
  assert.equal(executionTargetFor('atelier'), null);
  assert.equal(ATELIER_ENTREE.includes('oprieState'), false, 'et Atelier n’écrit aucun état de tour.');
});

// =================================================================================================
// §111/§112 — L'AUTORITÉ EST UNIQUE, ET LES MODES NE LA REDÉFINISSENT PAS
// =================================================================================================

test('T-MODE05-37..40 : aucun mode ne possède d’autorité sémantique propre', () => {
  for (const [nom, src] of [['Rapide', RUN_RAPIDE], ['Architecte', ENTER_ARCH],
                            ['analyse Architecte', API_ANALYSE], ['Atelier', ATELIER_ENTREE]]) {
    for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                        'degraded_state', 'execution_ready']) {
      assert.equal(ecritures(etat, src), 0, `${nom} n’écrit pas ${etat}.`);
    }
    assert.equal(ecritures('route', src), 0, `${nom} n’écrit aucune route.`);
  }
  /* La destination d'exécution est LUE, une seule fois, depuis la table. */
  assert.equal([...FRONT_CODE.matchAll(/executionTargetFor\(/g)].length, 1);
  assert.equal(FRONT_CODE.includes('routeExecution('), false,
    'le moteur de routage ADN reste dans le runtime, hors du chemin de mode.');
});

test('T-MODE05-41..44 : un même verdict OPRIE produit la même décision dans les deux modes gouvernés', () => {
  const cas = [
    ['clarification_required', 'WAIT_FOR_USER'],
    ['confirmation_required', 'WAIT_FOR_USER'],
    ['operational_request_ready', 'ENTER_READINESS'],
    ['blocked', 'SHOW_BLOCKED'],
    ['degraded_state', 'SHOW_DEGRADED']
  ];
  for (const [etat, attendu] of cas) {
    const r = decideNextOrchestrationAction(ctxPolitique('rapide', { state: etat })).action;
    const a = decideNextOrchestrationAction(ctxPolitique('architecte', { state: etat })).action;
    assert.equal(r, attendu, `Rapide : ${etat} → ${attendu}`);
    assert.equal(a, attendu, `Architecte : ${etat} → ${attendu}`);
    assert.equal(r, a, `${etat} : les deux modes reçoivent la MÊME décision.`);
  }
  /* Et le pilote applique la table — il ne rebranche rien par mode. */
  const table = tranche('const ORCHESTRATION_DRIVER=', 'IA-04 — LE CYCLE');
  assert.equal(table.includes("==='rapide'"), false, 'aucune branche de mode dans la table d’application.');
  assert.equal(table.includes("==='architecte'"), false);
});

// =================================================================================================
// §113/§114 — PLANS ET FOURNISSEURS
// =================================================================================================

test('T-MODE05-45..48 : les plans rapide et profond suivent la famille du mode, et ne décident rien', () => {
  for (const mode of ['rapide', 'architecte']) {
    assert.equal(MODE_CONTRACTS[mode].usesFastPlane, true);
    assert.equal(MODE_CONTRACTS[mode].usesDeepPlane, true);
  }
  assert.equal(MODE_CONTRACTS.atelier.usesFastPlane, false);
  assert.equal(MODE_CONTRACTS.atelier.usesDeepPlane, false);
  assert.doesNotMatch(ATELIER_ENTREE, /oprieStartFastPlane|oprieRequestTurn/);
  /* Le plan rapide ne porte aucun état : il ne peut donc rien décider. */
  const rendu = sansProse(tranche('function oprieRenderFastInteraction(', 'function oprieStartFastPlane('));
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat, rendu), 0, `le plan rapide n’écrit pas ${etat}.`);
  }
  assert.equal(ecritures('route', rendu), 0);
  assert.equal(ecritures('oprieState.canonicalContract', rendu), 0);
});

test('T-MODE05-49..52 : les chemins fournisseur sont dénombrés, et aucun ne choisit son fournisseur', () => {
  assert.equal((API_ANALYSE.match(/await window\.appelFournisseur\(/g) || []).length, 1, 'analyse Architecte : un.');
  assert.equal((ARCH_EXEC.match(/await appelFournisseur\(/g) || []).length, 1, 'livrable Pro : un.');
  assert.equal(RUN_RAPIDE.includes('appelFournisseur'), false, 'Rapide principal : aucun.');
  assert.equal(ATELIER_ENTREE.includes('appelFournisseur'), false, 'Atelier : aucun.');
  /* L'ordre des fournisseurs est une donnée gelée, jamais une décision de mode. */
  const worker = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  assert.match(worker, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/);
  for (const src of [RUN_RAPIDE, ENTER_ARCH, ATELIER_ENTREE, ROUTEUR]) {
    assert.equal(src.includes('DECISION_PROVIDER_ORDER'), false, 'aucun mode ne réordonne les fournisseurs.');
  }
});

// =================================================================================================
// §115 — LE ROUTEUR CHOISIT UN MODE, ET RIEN D'AUTRE
// =================================================================================================

test('T-MODE05-53..56 : le routeur sélectionne, il ne décide pas', () => {
  assert.match(ROUTEUR, /if\(mode==='rapide'\)return v11StartRapide\(\)/);
  assert.match(ROUTEUR, /if\(mode==='atelier'\)return v11StartAtelier\(\)/);
  assert.match(ROUTEUR, /return v11StartArchitecte\(\)/);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                          'blocked', 'degraded_state', 'execution_ready',
                          'guardPromptContract', 'assessAnalysisReadiness', 'archControleSortie',
                          'appelFournisseur', 'oprieBuildCanonicalContract', 'canonicalContract',
                          'oprieEnterExecution', 'adpRunRapide', 'adpEnterArchitecte']) {
    assert.equal(ROUTEUR.includes(interdit), false, `le routeur ne connaît pas ${interdit}.`);
  }
  /* Sa seule question est la FAMILLE du mode, et il la lit dans la table. */
  assert.match(ROUTEUR, /runtime\.usesGovernedPipeline\(mode\)/);
});

// =================================================================================================
// §116/§117/§118 — LES DÉFAUTS DÉJÀ FERMÉS LE RESTENT
// =================================================================================================

test('T-MODE05-57/58 : régression MODE-02 — Rapide ne promet pas de livrable, et son prompt reste opposable', () => {
  assert.equal(MODE_CONTRACTS.rapide.producesFinalDeliverable, false);
  assert.match(RUN_RAPIDE, /rapideDernierePublication=r\.canonical\?\{prompt:r\.prompt,contract:r\.canonical\.contract\}:null/,
    'le couple {prompt rendu, contrat} est posé sur le prompt RÉELLEMENT affiché.');
  const pose = RUN_RAPIDE.indexOf('rapideDernierePublication=');
  const affiche = RUN_RAPIDE.indexOf("out.textContent=r.prompt");
  assert.ok(pose > -1 && affiche > pose, 'le lien précède l’affichage du prompt qu’il engage.');
});

test('T-MODE05-59 : régression MODE-03 — une reconstruction Architecte en échec ne réutilise rien', () => {
  const efface = ENTER_ARCH.indexOf('adpState.lastEnvelope=null');
  const essai = ENTER_ARCH.indexOf('try{');
  const attrape = ENTER_ARCH.indexOf('}catch(error){');
  assert.ok(efface > -1 && efface < essai, 'l’effacement est HORS du try.');
  assert.ok(ENTER_ARCH.indexOf('adpState.lastEnvelope=envelope') > essai, 'la pose est DANS le try.');
  assert.ok(attrape > essai, 'et l’échec retombe donc sur un état vide.');
});

test('T-MODE05-60/61 : régressions MODE-04 — la bascule périme, et Rapide efface', async () => {
  assert.match(ROUTEUR, /if\(!v11ModeUsesGovernedPipeline\(mode\)\)v11AbandonGovernedTurn\(\)/);
  assert.match(ROUTEUR, /oprieState\.seq\+=1/);
  assert.match(ROUTEUR, /oprieState\.running=false;oprieSetBusy\(false\)/);
  assert.ok(RUN_RAPIDE.indexOf('adpState.lastEnvelope=null') < RUN_RAPIDE.indexOf('try{'));
  /* Et rien de tout cela n'est simplement écrit : la bascule le fait vraiment. */
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  assert.equal(h.abandon(), true, 'un tour en vol est bien périmé…');
  assert.equal(h.abandon(), false, '…et une seconde fois ne périme rien de plus.');
  await enVol;
  assert.deepEqual(h.spy.executed, []);
});

// =================================================================================================
// §119 — LA BASCULE RÉPÉTÉE, SANS ATTENDRE LES CALLBACKS
// =================================================================================================

test('T-MODE05-62..65 : sept bascules enchaînées — le dernier mode gagne, sans dernier écrivain', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(15);
  const seqInitial = h.pilot.oprieState.seq;
  /* Rapide → Architecte → Atelier → Architecte → Rapide → Atelier → Rapide. */
  for (const mode of ['architecte', 'atelier', 'architecte', 'rapide', 'atelier', 'rapide']) h.routeur.start(mode);
  assert.deepEqual(h.entrees, ['architecte', 'atelier', 'architecte', 'rapide', 'atelier', 'rapide'],
    'chaque bascule atteint sa propre entrée, aucune n’est avalée.');
  /* Deux entrées en Atelier : deux péremptions au plus, jamais une par bascule. */
  assert.ok(h.pilot.oprieState.seq > seqInitial, 'le contexte initial est périmé.');
  assert.ok(h.pilot.oprieState.seq <= seqInitial + 2, 'et il n’est pas périmé une fois par clic.');
  await enVol;
  await delay(30);
  assert.deepEqual(h.spy.executed, [], 'aucun callback ancien ne reprend l’interface.');
  assert.equal(h.spy.deepCalls.length, 1, 'et aucune bascule n’a ouvert un tour de plus.');
});

test('T-MODE05-STRESS-REPONSE : une réponse d’un contexte quitté ne s’applique pas au nouveau', async () => {
  const h = chargerRouteur({ mode: 'architecte', deep: async () => clarificationTurn('Quel public ?') });
  await h.pilot.oprieRunTurn('architecte');
  assert.equal(h.ctx.adpState.pendingQuestion, true, 'une question est ouverte.');
  h.routeur.start('atelier');
  assert.equal(h.ctx.adpState.pendingQuestion, false, 'la bascule referme la sollicitation.');
  /* La politique refuse aussi, indépendamment, un tour dont le mode a changé. */
  for (const ancien of ['rapide', 'architecte']) {
    const d = decideNextOrchestrationAction({ ...ctxPolitique('atelier', { state: 'operational_request_ready' }),
      turn: { turn_id: 9, current_turn_id: 9, mode: ancien, pending_user_interaction: false } });
    assert.equal(d.action, 'IGNORE_STALE');
    assert.equal(d.reason, 'MODE_SWITCHED');
  }
});

test('T-MODE05-REJEU : une action à effet ne s’applique qu’une fois par tour', () => {
  const pilote = sansProse(tranche('function oprieDriveOrchestration(', 'function oprieApplyTurn('));
  assert.match(pilote, /if\(oprieActionAlreadyApplied\(oprieState\.seq,action\)\)/);
  assert.match(pilote, /oprieMark\('orchestration_replay_suppressed'/);
  assert.match(pilote, /oprieRecordAppliedAction\(oprieState\.seq,action\)/);
  /* Et le cycle d'exécution ne s'ouvre qu'à un seul endroit du produit. */
  assert.equal([...FRONT_CODE.matchAll(/oprieBeginExecutionCycle\(/g)].length, 2, 'définition + appel unique.');
});

// =================================================================================================
// §120 — AUCUN CHEMIN PARALLÈLE, AUCUNE AUTORITÉ EN DOUBLE
// =================================================================================================

test('T-MODE05-66/67 : une seule entrée de mode, et plus aucune entrée héritée', () => {
  /* Un seul contrôle lance un mode, et il passe par le routeur. */
  assert.match(html, /\$\('#ui-main-action'\)\?\.addEventListener\('click',routeCurrentMode\)/);
  assert.match(sansProse(tranche('function routeCurrentMode(', 'document.addEventListener')),
    /router\.start\(currentMode\(\)\)/);
  /* CLEAN-01 : le pont d'entrées héritées était hors interface par CSS et par ARIA.
     Il n'est plus caché — il n'existe plus : markup, style et écouteurs compris. */
  assert.equal(html.includes('ui-hidden-bridge'), false, 'le pont hérité est retiré.');
  for (const id of ['v11-prepare', 'v11-go-rapide', 'v11-go-avance']) {
    assert.equal(html.includes(`id="${id}"`), false, `${id} : plus de markup.`);
  }
  assert.equal([...FRONT_CODE.matchAll(/addEventListener\('click',v11Start/g)].length, 0,
    'plus aucun écouteur hérité ne lance un mode.');
});
test('T-MODE05-68/69 : aucune table de contrats en double, aucune dérivation de destination en double', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  assert.equal((html.match(/function executionTargetFor\(mode\)/g) || []).length, 1);
  assert.equal([...FRONT_CODE.matchAll(/executionTargetFor\(/g)].length, 1);
  assert.doesNotMatch(FRONT_CODE, /requestedMode==='architecte'\?'architecte':'rapide'/,
    'la destination n’est jamais redérivée par un ternaire de mode.');
  /* Les deux seules branches de mode actives sont celles du routeur d'entrée. */
  assert.equal([...FRONT_CODE.matchAll(/mode==='(rapide|atelier)'/g)].length, 2);
});

test('T-MODE05-CONTROLE-MORT : plus aucune référence de contrôle sans cible', () => {
  /* MODE-05 avait mesuré, et nommé, une référence morte : oprieSetBusy désarmait un
     identifiant qui n'a jamais existé dans le document. CLEAN-01 l'a retirée, avec
     celle du pont hérité. Ne reste que la cible réelle. */
  assert.equal(html.includes('v11-go-architecte'), false, 'la référence sans cible est retirée.');
  const busy = sansProse(tranche('function oprieSetBusy(', 'function oprieShowAnalysing'));
  assert.match(busy, /const el=\$\('#v11-answer-continue'\);if\(el\)el\.disabled=!!busy/);
  assert.ok(html.includes('id="v11-answer-continue"'), 'et cette cible, elle, existe.');
});
test('T-MODE05-70..72 : un seul bloc runtime, une seule table compilée, build reproductible', () => {
  assert.equal((html.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length, 1);
  assert.equal((html.match(/\}\)\(window\);/g) || []).length, 1);
  /* La table de contrats n'existe qu'une fois dans le HTML complet — donc pas
     une copie dans le runtime compilé et une autre écrite à la main. */
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  assert.equal((BROWSER_RUNTIME.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  /* Et le bloc embarqué est bien celui du fichier généré, à l'octet près. */
  const embarque = tranche('/* GENERATED — LOT 10G.3B.3F', '})(window);') + '})(window);\n';
  assert.equal(embarque.trim(), BROWSER_RUNTIME.trim(), 'HTML et runtime généré ne divergent pas.');
});

// =================================================================================================
// §56/§57/§58 — NI FLOU, NI SEUIL, NI DOMAINE
// =================================================================================================

test('T-MODE05-NOHEURISTIQUE : le lot n’introduit ni flou, ni seuil, ni domaine', () => {
  for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                          /cosine/i, /levenshtein/i, /fuzzy/i, /similar/i, /case_id/i,
                          /voyage|medical|juridique|travel/i]) {
    assert.doesNotMatch(API_ANALYSE, interdit, `analyse Architecte : aucun ${interdit}.`);
    assert.doesNotMatch(ROUTEUR, interdit, `routeur : aucun ${interdit}.`);
  }
  assert.equal(API_ANALYSE.includes('Math.random'), false);
});
