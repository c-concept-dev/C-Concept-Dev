/* MODE-04 — LE COMPORTEMENT EFFECTIF DU MODE ATELIER.
 * ============================================================================
 *
 * Atelier est un ESPACE DE COMPOSITION MANUELLE. Cette suite éprouve exactement
 * cela : qu'il assemble un prompt que la personne emporte, et qu'il ne devienne
 * jamais — ni par un champ, ni par une enveloppe, ni par une bascule — une
 * autorité que le pipeline gouverné consulterait.
 *
 * Deux faits sont mesurés et DITS, plutôt que maquillés :
 *
 *   Atelier écrit `adpState.lastEnvelope`, un champ PARTAGÉ dont l'unique
 *   lecteur — adnCompactContractForArchitecte(), via makeEnvelope() — est
 *   gouverné. MODE-03 a fermé l'entrée Architecte ; ce lot ferme l'entrée
 *   Rapide, restée asymétrique. L'invariant ne tient plus par absence de
 *   lecteur, mais par structure.
 *
 *   La vue Atelier expose UN point d'appel fournisseur : « Compter
 *   précisément » (#btn-compter-exact → compterTokensExact). Il compte des
 *   jetons. Il ne produit aucun livrable, n'écrit aucun état sémantique et
 *   exige une clé et un clic. Prétendre zéro serait faux ; le caractériser est
 *   ce qui rend le zéro d'EXÉCUTION opposable.
 *
 * Le défaut fermé par ce lot : Rapide et Architecte se protègent d'eux-mêmes —
 * oprieRunTurn refuse un second tour tant que le premier court. Atelier n'a
 * aucune machinerie de tour, et n'en aura pas : il entrait donc sans que le
 * tour en vol l'apprenne, et ce tour atterrissait ensuite par-dessus quelqu'un
 * qui compose déjà ailleurs.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  MODE_CONTRACTS, contractFor, executionTargetFor, usesGovernedPipeline, modesOfClass
} from '../core/adn/mode-contracts.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (debut, fin) => { const a = html.indexOf(debut); return html.slice(a, html.indexOf(fin, a + debut.length)); };
/* Le frontend SANS le bloc runtime généré : ce qui est écrit à la main, et lui seul. */
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);

const ATELIER_ENTREE = sansProse(tranche('function v11StartAtelier()', 'window.askDecisionProvider'));
const ATELIER_GENERER = sansProse(tranche('function generer(){', 'function afficherDiagnostic('));
const ATELIER_CHEMIN = ATELIER_ENTREE + '\n' + ATELIER_GENERER;
const ATELIER_VUE = tranche('<section class="vue atelier-v115" id="vue-generation"', '<section class="vue legacy-v115" id="vue-dictee"');
const ROUTEUR = sansProse(tranche('window.__V11_ROUTER__', 'function init()'));
const RUN_RAPIDE = sansProse(tranche('function adpRunRapide(', 'async function v11StartRapide'));
const ENTER_ARCH = sansProse(tranche('function adpEnterArchitecte(', 'async function adpDecideRapide'));
const MAKE_ENVELOPE = sansProse(tranche('function makeEnvelope(){', 'function blobDownload('));

/** Nombre d'AFFECTATIONS d'un nom — une lecture n'est pas une écriture. */
const ecritures = (nom, src = FRONT_CODE) =>
  [...src.matchAll(new RegExp(`(?<![=!<>])\\b${nom.replace(/\./g, '\\.')}\\s*=(?![=>])`, 'g'))].length;
/** Nombre de SITES D'APPEL d'un symbole. */
const appels = (nom, src) => [...src.matchAll(new RegExp(`\\b${nom}\\s*\\(`, 'g'))].length;

/* ------------------------------------------------------------------------ *
 * HARNESS — LA FRONTIÈRE DE BASCULE RÉELLE.
 *
 * Le routeur et ses deux gardes vivent hors du bloc pilote : on les charge
 * DANS le contexte du pilote déjà chargé, tels qu'ils sont écrits en
 * production. Ce qui est éprouvé reste le code du produit ; seuls les trois
 * points d'entrée de mode sont remplacés par des témoins, parce qu'ils
 * touchent le DOM et n'appartiennent pas à la question posée ici.
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
    '\n;globalThis.__routeur=window.__V11_ROUTER__;globalThis.__abandon=v11AbandonGovernedTurn;' +
    'globalThis.__famille=v11ModeUsesGovernedPipeline;', h.ctx);
  return { ...h, entrees, routeur: h.ctx.__routeur, abandon: h.ctx.__abandon, famille: h.ctx.__famille };
}
/** Un tour profond LENT, qui expose le signal d'annulation qu'il a reçu. */
function tourLent(sonde) {
  return async (body, { signal }) => { sonde.signal = signal; await delay(120); return arbiterTurn('operational_request_ready'); };
}

// =================================================================================================
// §59 — LE CONTRAT : UNE SEULE SOURCE, ET RIEN DE PLUS QUE LE MESURÉ
// =================================================================================================

test('T-MODE04-01/02 : Atelier tient son contrat depuis la source unique, classé composition manuelle', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1,
    'une seule table embarquée dans le produit.');
  const c = contractFor('atelier');
  assert.equal(c.modeClass, 'manual_composition');
  assert.equal(usesGovernedPipeline('atelier'), false);
  assert.deepEqual([...modesOfClass('manual_composition')], ['atelier']);
  assert.deepEqual([...modesOfClass('governed_execution')], ['rapide', 'architecte']);
});

test('T-MODE04-03/04 : Atelier n’exécute nulle part et ne produit aucun livrable gouverné', () => {
  const c = contractFor('atelier');
  assert.equal(executionTargetFor('atelier'), null, 'aucune destination d’exécution.');
  assert.equal(c.allowsExecution, false);
  assert.equal(c.executionTarget, null);
  assert.equal(c.producesFinalDeliverable, false);
  assert.equal(c.manualComposition, true);
  /* La table est gelée : personne ne lui prête une exécution à chaud. */
  assert.throws(() => { MODE_CONTRACTS.atelier.allowsExecution = true; }, TypeError);
});

test('T-MODE04-05 : aucune politique Atelier fantôme', () => {
  for (const fantome of ['ATELIER_CONFIG', 'ATELIER_POLICY', 'ATELIER_ENGINE', 'ATELIER_BEHAVIOR',
                         'ATELIER_READY', 'atelierPolicy', 'atelierContract', 'atelierReadiness',
                         'atelierMode', 'ATELIER_OPTIONS']) {
    assert.equal(FRONT_CODE.includes(fantome), false, `${fantome} ne doit pas exister.`);
  }
  /* Et aucune branche sémantique propre à Atelier : les deux seules occurrences
     du littéral de mode sont les branches du routeur d'entrée. */
  assert.equal([...FRONT_CODE.matchAll(/mode==='atelier'/g)].length, 1);
  assert.equal(FRONT_CODE.includes("route:'atelier'"), false, 'Atelier n’est jamais une route.');
  assert.equal(FRONT_CODE.includes("sem.route==='atelier'"), false);
});

// =================================================================================================
// §60 — LE PIPELINE GOUVERNÉ N'EST PAS SUR LE CHEMIN D'ATELIER
// =================================================================================================

test('T-MODE04-06..15 : le parcours Atelier n’appelle aucun étage gouverné', () => {
  /* Le chemin mesuré : l'entrée du mode, puis l'assemblage réel du prompt. */
  for (const interdit of [
    'oprieRunTurn', 'oprieRequestTurn', 'oprieApplyTurn', 'oprieEnterExecution', 'oprieState',
    'decideNextOrchestrationAction', 'adnNextConversationAction', 'oprieDecideOrchestration',
    'assessAnalysisReadiness', 'adnAssessArchitecteReadiness', 'adnReadinessInstruction',
    'guardPromptContract', 'adnGuardPromptContract',
    'archControleSortie', 'adnOutputCompliance',
    'executionTargetFor', 'oprieBuildCanonicalContract', 'canonicalContract',
    'createExecutionLifecycle', 'oprieBeginExecutionCycle',
    'appelFournisseur', 'askDecisionProvider', 'beginApiAnalysis',
    'oprieStartFastPlane', 'oprieRequestFastInteraction', 'projectInteractionForMode'
  ]) {
    assert.equal(ATELIER_CHEMIN.includes(interdit), false, `Atelier n’appelle pas ${interdit}.`);
  }
  /* Et le contrat dit exactement la même chose, champ par champ. */
  const c = contractFor('atelier');
  assert.equal(c.usesGovernedPipeline, false);
  assert.equal(c.usesOrchestrationPolicy, false);
  assert.equal(c.usesFastPlane, false);
  assert.equal(c.usesDeepPlane, false);
});

test('T-MODE04-06b : le parcours Atelier assemble, et c’est tout ce qu’il fait', () => {
  assert.match(ATELIER_GENERER, /const ctx = contexte\(demande, format, niveau\)/);
  assert.match(ATELIER_GENERER, /const prompt = assembler\(ctx, actifs\)/);
  assert.match(ATELIER_GENERER, /\$\('#sortie'\)\.textContent = prompt/);
  assert.match(ATELIER_ENTREE, /ouvrirVue\('generation'\)/);
  /* Aucun réseau sur ce chemin : ni transport direct, ni transport indirect. */
  assert.doesNotMatch(ATELIER_CHEMIN, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
});

// =================================================================================================
// §61 — L'ÉTAT LOCAL D'ATELIER : PRÉSENT, NOMMÉ, SANS AUTORITÉ
// =================================================================================================

test('T-MODE04-16/17 : l’« exploitable » local d’Atelier n’est pas un état OPRIE', () => {
  /* Il existe — le masquer serait mentir — et il est fabriqué localement. */
  assert.match(ATELIER_ENTREE, /adnManualEnvelope\(d,mat,'rapide'\)/);
  assert.match(sansProse(tranche('function adnManualEnvelope(', 'function adnQuantitiesFromRapid(')),
    /etat_demande:'exploitable'/, 'la valeur est écrite en clair, pas dérivée.');
  /* Aucun des cinq états OPRIE n'est écrit par le chemin Atelier. */
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'blocked', 'degraded_state', 'execution_ready']) {
    assert.equal(ATELIER_CHEMIN.includes(etat), false, `${etat} n’apparaît pas dans Atelier.`);
    assert.equal(ecritures(etat, ATELIER_CHEMIN), 0);
  }
});

test('T-MODE04-18..20 : l’« exploitable » local ne déclenche ni readiness, ni route, ni exécution', () => {
  /* La preuve est structurelle : la politique d'orchestration ne connaît que
     les cinq états d'OPRIE, et « exploitable » n'en fait pas partie. */
  const contexte = (state) => ({
    mode: 'rapide', turn: { turn_id: 1, current_turn_id: 1, mode: 'rapide', pending_user_interaction: false },
    fast: null, deep: { state }, readiness: null, promptQG: null, execution: null, outputQG: null
  });
  const attendu = decideNextOrchestrationAction(contexte('operational_request_ready')).action;
  assert.equal(attendu, 'ENTER_READINESS', 'seul un état OPRIE ouvre la readiness.');
  const local = decideNextOrchestrationAction(contexte('exploitable'));
  assert.notEqual(local.action, 'ENTER_READINESS', '« exploitable » n’ouvre rien.');
  /* Et le mode qui le porte n'a de toute façon aucune destination. */
  assert.equal(executionTargetFor('atelier'), null);
});

// =================================================================================================
// §62 — L'ENVELOPPE PARTAGÉE : QUI ÉCRIT, QUI LIT
// =================================================================================================

test('T-MODE04-21 : l’unique lecteur gouverné de lastEnvelope est nommé, et il n’y en a qu’un', () => {
  /* Le champ est partagé. Le dire précisément est ce qui permet de le garder. */
  /* CLEAN-01 : l'ancien chemin (adpDecideRapide) écrivait aussi ce champ ; il est retiré. */
  assert.equal(ecritures('adpState.lastEnvelope'), 6,
    'remise à zéro, effacement Architecte, pose Architecte, effacement Rapide, pose Rapide, Atelier.');
  const lecteurs = [...FRONT_CODE.matchAll(/=\s*adpState\.lastEnvelope\b/g)].length;
  assert.equal(lecteurs, 1, 'un seul lecteur : adnCompactContractForArchitecte.');
  assert.match(sansProse(tranche('function adnCompactContractForArchitecte(', 'function adnAssessArchitecteReadiness(')),
    /const env=adpState\.lastEnvelope/);
  assert.match(MAKE_ENVELOPE, /adnCompactContractForArchitecte\(\)/, 'et il n’est consommé que là.');
});

test('T-MODE04-22/23 : entrer en Architecte efface l’enveloppe AVANT de la reconstruire', () => {
  /* Garde MODE-03, conservée : aucune réintroduction d’un repli sur l’ancienne. */
  const avant = ENTER_ARCH.indexOf('adpState.lastEnvelope=null');
  const apres = ENTER_ARCH.indexOf('adpState.lastEnvelope=envelope');
  assert.ok(avant > -1 && apres > avant, 'l’effacement précède la reconstruction.');
  assert.ok(ENTER_ARCH.indexOf('try{') > avant, 'et il est HORS du try : un échec ne laisse rien.');
});

test('T-MODE04-24 : entrer en Rapide efface aussi — l’asymétrie est fermée', () => {
  /* Défaut fermé par MODE-04 : l’affinage n’écrit l’enveloppe que s’il aboutit.
     Sur échec, la valeur PRÉCÉDENTE — dont l’enveloppe locale d’Atelier —
     restait en place. L’invariant tenait par absence de lecteur sur ce chemin,
     pas par structure. */
  const efface = RUN_RAPIDE.indexOf('adpState.lastEnvelope=null');
  const ecrit = RUN_RAPIDE.indexOf('adpState.lastEnvelope=refined');
  const tentative = RUN_RAPIDE.indexOf('try{');
  assert.ok(efface > -1, 'l’entrée Rapide efface l’enveloppe partagée.');
  assert.ok(efface < ecrit, 'et elle l’efface avant de la réécrire.');
  assert.ok(efface < tentative, 'hors du try : un échec d’affinage ne laisse rien.');
  assert.match(RUN_RAPIDE, /adpState\.lastProjection=null/, 'la projection suit l’enveloppe.');
});

test('T-MODE04-25 : aucun résidu d’un autre mode n’entre dans le tour OPRIE', () => {
  const requete = sansProse(tranche('async function oprieRequestTurn()', 'function oprieSetBusy'));
  assert.match(requete, /original_request:oprieOriginalRequest\(\),clarification_history:oprieClarificationHistory\(\)/);
  assert.doesNotMatch(requete, /lastEnvelope|lastProjection|etat\.prompt|archAnalyse/,
    'le tour ne lit que la demande et son historique.');
});

// =================================================================================================
// §63 — LA BASCULE VERS ATELIER PÉRIME LE TOUR GOUVERNÉ EN VOL
// =================================================================================================

test('T-MODE04-26 : entrer en Atelier périme le tour en vol, et le tour n’atterrit pas', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  assert.equal(h.pilot.oprieState.running, true, 'un tour court bien.');
  const seq = h.pilot.oprieState.seq;

  h.routeur.start('atelier');

  assert.deepEqual(h.entrees, ['atelier'], 'la personne entre bien en Atelier.');
  assert.equal(h.pilot.oprieState.seq, seq + 1, 'le numéro de tour a avancé : le tour est périmé.');
  assert.equal(sonde.signal.aborted, true, 'et son transport est annulé.');
  await enVol;
  assert.deepEqual(h.spy.executed, [], 'le tour périmé n’exécute aucun moteur.');
});

test('T-MODE04-27 : un tour périmé rend le verrou, sinon le pipeline resterait fermé', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.routeur.start('atelier');
  assert.equal(h.pilot.oprieState.running, false, 'le verrou de tour est relâché tout de suite.');
  assert.equal(h.spy.busy.at(-1).busy, false, 'et la saisie redevient disponible.');
  await enVol;
  /* La preuve utile : un tour SUIVANT peut réellement partir. */
  await h.pilot.oprieRunTurn('rapide');
  assert.equal(h.spy.deepCalls.length, 2, 'le pipeline reste ouvert après la bascule.');
  assert.equal(h.spy.executed.length, 1, 'et c’est le nouveau tour qui exécute, pas l’ancien.');
});

test('T-MODE04-28 : un tour périmé ne laisse aucune sollicitation ouverte', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  h.ctx.adpState.pendingQuestion = true;
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  h.routeur.start('atelier');
  assert.equal(h.ctx.adpState.pendingQuestion, false, 'plus rien n’est proposé, l’état cesse de l’affirmer.');
  assert.equal(h.pilot.oprieState.fastInteraction, null, 'et aucune candidate rapide ne survit.');
  await enVol;
});

test('T-MODE04-29 : les modes gouvernés ne sont pas périmés — ils se protègent déjà eux-mêmes', async () => {
  const sonde = {};
  const h = chargerRouteur({ mode: 'rapide', deep: tourLent(sonde) });
  const enVol = h.pilot.oprieRunTurn('rapide');
  await delay(20);
  const seq = h.pilot.oprieState.seq;
  h.routeur.start('rapide');
  h.routeur.start('architecte');
  assert.deepEqual(h.entrees, ['rapide', 'architecte']);
  assert.equal(h.pilot.oprieState.seq, seq, 'aucun tour gouverné n’est interrompu par une entrée gouvernée.');
  assert.equal(h.pilot.oprieState.running, true, 'le verrou de tour tient toujours.');
  await enVol;
});

test('T-MODE04-30 : sans tour en vol, la bascule ne touche à rien', () => {
  const h = chargerRouteur({ mode: 'rapide' });
  const avant = { seq: h.pilot.oprieState.seq, running: h.pilot.oprieState.running };
  assert.equal(h.abandon(), false, 'rien à périmer, rien n’est fait.');
  h.routeur.start('atelier');
  assert.equal(h.pilot.oprieState.seq, avant.seq);
  assert.equal(h.pilot.oprieState.running, avant.running);
  assert.deepEqual(h.entrees, ['atelier']);
});

test('T-MODE04-31 : la famille du mode vient de la table, jamais d’une liste écrite ici', () => {
  const h = chargerRouteur({ mode: 'rapide' });
  assert.equal(h.famille('rapide'), true);
  assert.equal(h.famille('architecte'), true);
  assert.equal(h.famille('atelier'), false);
  assert.match(ROUTEUR, /runtime\.usesGovernedPipeline\(mode\)/, 'la table est lue, pas redérivée.');
  assert.doesNotMatch(ROUTEUR, /'atelier'\s*===|===\s*'atelier'\s*\?/, 'aucune liste de modes en dur.');
});

test('T-MODE04-32 : table injoignable — on ne périme rien plutôt que de deviner', () => {
  const h = chargerRouteur({ mode: 'rapide', noRuntime: true });
  assert.equal(h.famille('atelier'), true, 'faute de contrat, on ne coupe aucun tour légitime.');
});

// =================================================================================================
// §64 — LES BASCULES, DANS LES DEUX SENS
// =================================================================================================

test('T-MODE04-33..36 : un tour d’un autre mode n’est jamais appliqué après bascule', () => {
  /* La politique refuse déjà un tour dont le mode n'est plus le courant : la
     péremption par numéro de tour et ce refus disent la même chose. */
  for (const ancien of ['rapide', 'architecte']) {
    const d = decideNextOrchestrationAction({
      mode: 'atelier', turn: { turn_id: 7, current_turn_id: 7, mode: ancien, pending_user_interaction: false },
      fast: null, deep: { state: 'operational_request_ready' },
      readiness: null, promptQG: null, execution: null, outputQG: null
    });
    assert.equal(d.action, 'IGNORE_STALE', `un tour ${ancien} ne s’applique pas en Atelier.`);
    assert.equal(d.reason, 'MODE_SWITCHED');
  }
});

test('T-MODE04-37/38 : la demande et les documents survivent à la bascule', () => {
  const reset = tranche('function resetModePresentation(', 'function setMode(');
  assert.match(reset, /On conserve volontairement #v11-demande/, 'la conservation est explicite…');
  assert.doesNotMatch(reset, /#v11-demande'\)[^;]*\.value\s*=/, '…et rien n’efface la demande.');
  assert.doesNotMatch(reset, /state\.docs\s*=/, 'ni les documents.');
  /* Et l'entrée en Atelier REPORTE la demande au lieu de la perdre. */
  assert.match(ATELIER_ENTREE, /if\(ad\)\{ad\.value=d;/, 'la demande est reportée dans Atelier.');
  assert.match(ATELIER_ENTREE, /if\(am\)\{am\.value=mat;/, 'le matériau aussi.');
});

test('T-MODE04-39..41 : un seul mode visible, aucun résidu gouverné actif', () => {
  const set = sansProse(tranche('function setMode(', 'function currentMode()'));
  assert.match(set, /classList\.toggle\('is-active',active\)/, 'un seul mode actif.');
  assert.match(set, /setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(set, /resetModePresentation\(mode\)/);
  const reset = sansProse(tranche('function resetModePresentation(', 'function setMode('));
  for (const panneau of ['#ui-rapid-result', '#ui-rapid-gate', '#v11-api-progress', '#v11-exchange',
                         '#v11-dialogue', '#v11-ready']) {
    assert.ok(reset.includes(panneau), `${panneau} est masqué à la bascule.`);
  }
});

// =================================================================================================
// §65 — AUCUNE ÉCRITURE D'AUTORITÉ
// =================================================================================================

test('T-MODE04-42..46 : Atelier n’écrit aucune autorité — sémantique, readiness, QG, route, canonique', () => {
  for (const champ of ['oprieState', 'canonicalContract', 'enrichedContract', 'lastOrchestration',
                       'concludedTurn', 'executionId', 'rapideDernierePublication']) {
    assert.equal(ecritures(champ, ATELIER_CHEMIN), 0, `Atelier n’écrit pas ${champ}.`);
  }
  /* Le contrat canonique n'est posé qu'au SEUL endroit gouverné du produit. */
  assert.equal([...FRONT_CODE.matchAll(/oprieState\.canonicalContract\s*=/g)].length, 1);
  assert.equal(ATELIER_CHEMIN.includes('etat_demande'), false, 'et aucun état de demande n’y est écrit.');
});

test('T-MODE04-47 : Atelier ne crée aucune requête opérationnelle canonique', () => {
  for (const canonique of ['buildCanonicalContract', 'oprieBuildCanonicalContract', 'adnCanonicalEnvelope',
                           'buildExecutionEnvelope', 'contractForContractualization']) {
    assert.equal(ATELIER_CHEMIN.includes(canonique), false, `Atelier n’appelle pas ${canonique}.`);
  }
});

// =================================================================================================
// §66/§67 — LE PROMPT LOCAL, ET SES SORTIES
// =================================================================================================

test('T-MODE04-48/49 : le prompt d’Atelier est local, et n’est pas présenté comme un livrable gouverné', () => {
  /* Il a un contrat — celui du prompt historique — et cette autorité est LOCALE. */
  assert.match(ATELIER_GENERER, /etat\.contrat = contratDuPrompt\(ctx, actifs\)/);
  assert.equal(ATELIER_GENERER.includes('adnCompactContractForArchitecte'), false);
  assert.equal(ATELIER_GENERER.includes('guardPromptContract'), false, 'aucun gate de prompt opposable ici.');
  /* Et il est rendu comme un prompt à emporter, pas comme un résultat d'exécution. */
  assert.match(ATELIER_VUE, /id="sortie"[^>]*aria-label="Prompt final prêt à copier"/);
});

test('T-MODE04-50..52 : chaque sortie d’Atelier est manuelle, et aucune n’exécute', () => {
  const sorties = sansProse(tranche("$('#btn-export-txt').addEventListener", "/* Éditeur */"));
  for (const action of ["$('#btn-export-txt')", "$('#btn-copier')", "$('#btn-export-json')",
                        "$('#btn-version')", "$('#btn-vers-editeur')"]) {
    assert.ok(sorties.includes(action), `${action} est bien une action explicite.`);
  }
  assert.match(sorties, /telecharger\('prompt-' \+ Date\.now\(\) \+ '\.txt', etat\.prompt\)/);
  assert.match(sorties, /copier\(etat\.prompt, 'Prompt'\)/);
  /* Aucune de ces sorties ne franchit la frontière : ni fournisseur, ni tour, ni gate. */
  for (const interdit of ['appelFournisseur', 'envoyerApi', 'oprieRunTurn', 'beginExchange',
                          'beginApiAnalysis', 'archConstruireExecuter', 'fetch(']) {
    assert.equal(sorties.includes(interdit), false, `une sortie Atelier n’appelle pas ${interdit}.`);
  }
});

test('T-MODE04-PROVIDER : le seul point fournisseur de la vue Atelier compte des jetons, et rien d’autre', () => {
  /* Mesuré et dit : la vue Atelier expose UN bouton qui joint un fournisseur.
     Le masquer pour annoncer zéro serait faux. Ce qui compte est ce qu'il fait. */
  const boutons = [...ATELIER_VUE.matchAll(/id="(btn-[a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(boutons.includes('btn-compter-exact'), 'le bouton existe bien dans la vue Atelier.');
  const compter = sansProse(tranche('async function compterTokensExact(){', '/* ------'));
  assert.match(compter, /compterTokens\(\{cle, corps:corpsCompte\}\)/, 'il compte des jetons.');
  assert.match(compter, /etat\.mesures\.tokensExact = d\.input_tokens/, 'et n’écrit qu’une mesure.');
  /* Il ne produit aucun livrable et n'écrit aucune autorité. */
  for (const interdit of ['etat.prompt =', 'etat.contrat', 'oprieState', 'adpState',
                          'readiness', 'qg_status', 'route']) {
    assert.equal(compter.includes(interdit), false, `le comptage n’écrit pas ${interdit}.`);
  }
  /* Et l'exécution réelle vit dans un AUTRE onglet, derrière une action distincte. */
  assert.equal(ATELIER_VUE.includes('btn-api-envoyer'), false, 'l’envoi direct n’est pas dans la vue Atelier.');
});

// =================================================================================================
// §69 — L'ANCIEN CHEMIN N'ACTIVE AUCUNE GOUVERNANCE POUR ATELIER
// =================================================================================================

test('T-MODE04-53/54 : l’ancien chemin conversationnel n’est consulté par aucun chemin Atelier', () => {
  assert.equal(ATELIER_CHEMIN.includes('nextConversationAction'), false);
  assert.equal(ATELIER_CHEMIN.includes('adpDecideRapide'), false);
  assert.equal(ROUTEUR.includes('adpDecideRapide'), false, 'le routeur non plus.');
  /* Le routeur ne connaît aucun état sémantique — il ne route que des modes. */
  for (const etat of ['operational_request_ready', 'clarification_required', 'degraded_state']) {
    assert.equal(ROUTEUR.includes(etat), false, `le routeur ne connaît pas ${etat}.`);
  }
});

// =================================================================================================
// §56/§57/§58 — NI FLOU, NI SEUIL, NI DOMAINE
// =================================================================================================

test('T-MODE04-NOHEURISTIQUE : le lot n’introduit ni flou, ni seuil, ni domaine', () => {
  const ajouts = ROUTEUR + '\n' + RUN_RAPIDE;
  for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                          /cosine/i, /levenshtein/i, /fuzzy/i, /similar/i,
                          /voyage|medical|juridique|travel/i]) {
    assert.doesNotMatch(ajouts, interdit, `aucun ${interdit} introduit.`);
  }
  assert.equal(appels('Math.random', ajouts), 0, 'et rien d’aléatoire.');
});

test('T-MODE04-SECRET : aucune clé, aucun secret sur le chemin Atelier ni dans le lot', () => {
  for (const fuite of ['api-cle', 'v11-api-key', 'obtenirCleFournisseur', 'sk-', 'Bearer ']) {
    assert.equal(ATELIER_ENTREE.includes(fuite), false, `${fuite} n’apparaît pas à l’entrée d’Atelier.`);
    assert.equal(ROUTEUR.includes(fuite), false, `${fuite} n’apparaît pas dans le routeur.`);
  }
  /* La télémétrie du tour périmé ne porte qu'un nom d'événement. */
  assert.match(ROUTEUR, /oprieMark\('turn_abandoned_mode_switch'\)/);
});
