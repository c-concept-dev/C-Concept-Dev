/* MODE-01 — LES CONTRATS DES MODES.
 * ============================================================================
 *
 * Un mode dit COMMENT on accompagne quelqu'un. Il ne dit jamais CE QUI EST VRAI
 * de sa demande. Cette suite éprouve exactement cette frontière.
 *
 * Les trois modes ne sont pas symétriques, et cette suite ne fait pas semblant
 * qu'ils le soient : Rapide et Architecte passent par le pipeline gouverné,
 * Atelier est un assembleur manuel qui n'appelle ni OPRIE, ni gate, ni
 * fournisseur. Lui prêter une gouvernance pour équilibrer la table serait une
 * fausse gouvernance — plus dangereuse que l'asymétrie qu'elle masquerait.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODE_CONTRACTS, MODE_IDS, MODE_CLASSES, EXECUTION_TARGETS, FORBIDDEN_CONTRACT_FIELDS,
  contractFor, executionTargetFor, usesGovernedPipeline, modesOfClass,
  validateModeContracts, createModeContractAuditView, MODE_CONTRACTS_VERSION
} from '../core/adn/mode-contracts.js';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay, html, questionShown } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = fs.readFileSync(path.join(root, 'core/adn/mode-contracts.js'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/* Le code de la table SANS sa liste d'interdiction : nommer un champ interdit est précisément la
   façon de l'interdire, ce n'est pas en porter un. Scanner la liste comme une violation reviendrait
   à reprocher à une serrure de nommer la porte. */
const sansDenylist = (t) => t.replace(/export const FORBIDDEN_CONTRACT_FIELDS = Object\.freeze\(\[[\s\S]*?\]\);/, '');
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);

/** Le corps d'une fonction du frontend, prose retirée. */
const bloc = (debut, fin) => sansProse(html.slice(html.indexOf(debut), html.indexOf(fin)));

// =================================================================================================
// §49 — L'INVENTAIRE, MESURÉ
// =================================================================================================

test('T-MODE01-01 : le contrat Rapide correspond au comportement mesuré', () => {
  const c = contractFor('rapide');
  assert.equal(c.modeClass, 'governed_execution');
  assert.equal(c.usesGovernedPipeline, true);
  assert.equal(c.executionTarget, 'rapide');
  /* Mesure : v11StartRapide passe bien par le tour gouverné. */
  const entree = bloc('async function v11StartRapide', 'async function v11StartArchitecte');
  assert.match(entree, /oprieRunTurn\('rapide'\)/);
  assert.doesNotMatch(entree, /adpRunRapide|appelFournisseur/, 'l’entrée n’exécute rien elle-même.');
});

test('T-MODE01-02 : le contrat Architecte correspond au comportement mesuré', () => {
  const c = contractFor('architecte');
  assert.equal(c.modeClass, 'governed_execution');
  assert.equal(c.executionTarget, 'architecte');
  const entree = bloc('async function v11StartArchitecte', 'function v11StartAtelier');
  assert.match(entree, /oprieRunTurn\('architecte'\)/);
  assert.doesNotMatch(entree, /adpEnterArchitecte|appelFournisseur/);
});

test('T-MODE01-03 : le contrat Atelier correspond au comportement mesuré — et à rien de plus', () => {
  const c = contractFor('atelier');
  assert.equal(c.modeClass, 'manual_composition');
  /* Ces six faits sont MESURÉS sur le code d'Atelier, pas déclarés. */
  const atelier = bloc('function v11StartAtelier()', 'window.askDecisionProvider');
  const generer = sansProse(html.slice(html.indexOf('function generer(){'), html.indexOf('function generer(){') + 2600));
  const chemin = atelier + generer;
  for (const [absent, champ] of [['oprieRunTurn', 'usesGovernedPipeline'],
                                  ['decideNextOrchestrationAction', 'usesOrchestrationPolicy'],
                                  ['oprieStartFastPlane', 'usesFastPlane'],
                                  ['assessAnalysisReadiness', 'usesGovernedPipeline'],
                                  ['guardPromptContract', 'usesGovernedPipeline'],
                                  ['appelFournisseur', 'producesFinalDeliverable']]) {
    assert.equal(chemin.includes(absent), false, `Atelier n’appelle pas ${absent}.`);
    assert.equal(c[champ], false, `donc ${champ} = false.`);
  }
  assert.equal(c.executionTarget, null);
  assert.equal(c.manualComposition, true);
  assert.match(generer, /const prompt = assembler\(ctx, actifs\)/, 'Atelier assemble bien un prompt.');
});

test('T-MODE01-04/05 : une seule source de contrats, aucune politique de mode dupliquée', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1,
    'une seule table embarquée.');
  assert.equal(MODE_IDS.length, 3);
  /* Le frontend ne redérive PLUS la destination d'exécution : il la lit. */
  const enter = bloc('function oprieExecutionTarget', 'function oprieApplyTurn');
  assert.match(enter, /runtime\.executionTargetFor\(requestedMode\)/);
  assert.doesNotMatch(enter, /requestedMode==='architecte'\?'architecte':'rapide'/,
    'la dérivation dupliquée a disparu.');
  assert.equal(validateModeContracts().length, 0, 'et la table elle-même est valide.');
});

// =================================================================================================
// §50 — LE MODE NE RÉINTERPRÈTE JAMAIS OPRIE
// =================================================================================================

test('T-MODE01-06..10 : même état OPRIE, même action, dans les trois modes', async () => {
  const attendu = {
    clarification_required: 'WAIT_FOR_USER', confirmation_required: 'WAIT_FOR_USER',
    operational_request_ready: 'ENTER_READINESS', blocked: 'SHOW_BLOCKED', degraded_state: 'SHOW_DEGRADED'
  };
  for (const mode of MODE_IDS) {
    for (const [state, act] of Object.entries(attendu)) {
      const d = decideNextOrchestrationAction({
        mode, turn: { turn_id: 3, current_turn_id: 3, mode, pending_user_interaction: false },
        fast: null, deep: { state }, readiness: null, promptQG: null, execution: null, outputQG: null
      });
      assert.equal(d.action, act, `${mode} / ${state}`);
    }
  }
  /* Et sur le produit réel, pour les deux modes gouvernés. */
  for (const mode of ['rapide', 'architecte']) {
    for (const [state, act] of [['clarification_required', 'WAIT_FOR_USER'], ['confirmation_required', 'WAIT_FOR_USER']]) {
      const h = loadPilot({ mode, deep: async () => arbiterTurn(state, { next_question: { text: 'Q ?' }, confirmation_reason: 'R' }) });
      await h.pilot.oprieRunTurn(mode);
      assert.equal(h.pilot.oprieState.lastOrchestration.action, act, `${mode} / ${state}`);
      assert.equal(h.ctx.adpState.pendingQuestion, true, `${mode} : la personne est sollicitée.`);
    }
  }
});

test('T-MODE01-SEMANTIQUE : la table ne PEUT PAS porter une règle sémantique', () => {
  /* La garde est structurelle : les champs interdits sont refusés par le validateur. */
  for (const interdit of FORBIDDEN_CONTRACT_FIELDS) {
    const contamine = { rapide: { ...MODE_CONTRACTS.rapide, [interdit]: 'peu importe' } };
    const problemes = validateModeContracts(contamine);
    assert.ok(problemes.some((p) => p.includes(interdit)), `${interdit} doit être refusé.`);
  }
  /* Et aucun contrat réel n'en porte. */
  for (const id of MODE_IDS) {
    for (const interdit of FORBIDDEN_CONTRACT_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(MODE_CONTRACTS[id], interdit), false, `${id}.${interdit}`);
    }
  }
  /* Le module ne nomme aucun état OPRIE, ni aucun verdict de gate. */
  const code = sansProse(MODULE);
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready', 'PASS_WITH_WARNINGS', 'INCOMPLETE_VERIFICATION']) {
    assert.equal(code.includes(etat), false, `la table ne doit pas nommer ${etat}.`);
  }
});

// =================================================================================================
// §51/§52 — PIPELINE GOUVERNÉ, ET ABSENCE DE FAUSSE GOUVERNANCE
// =================================================================================================

test('T-MODE01-11/12 : Rapide et Architecte passent par le pipeline gouverné', async () => {
  for (const mode of ['rapide', 'architecte']) {
    assert.equal(usesGovernedPipeline(mode), true);
    const h = loadPilot({ mode, deep: async () => arbiterTurn('operational_request_ready') });
    await h.pilot.oprieRunTurn(mode);
    assert.equal(h.pilot.oprieState.lastOrchestration.action, 'ENTER_READINESS', mode);
    assert.equal(h.spy.executed.length, 1, mode);
    assert.equal(h.spy.executed[0].engine, MODE_CONTRACTS[mode].executionTarget,
      'et vers le moteur que le contrat désigne, pas un autre.');
  }
});

test('T-MODE01-13..17 : Atelier ne simule NI OPRIE, NI readiness, NI gate, NI exécution', () => {
  const c = contractFor('atelier');
  assert.equal(usesGovernedPipeline('atelier'), false);
  assert.equal(c.allowsExecution, false);
  assert.equal(c.producesFinalDeliverable, false);
  assert.equal(executionTargetFor('atelier'), null, 'aucune destination inventée.');
  /* Le validateur REFUSE qu'un mode manuel se prétende gouverné. */
  for (const champ of ['usesGovernedPipeline', 'usesOrchestrationPolicy', 'usesFastPlane', 'usesDeepPlane',
                       'allowsExecution', 'producesFinalDeliverable']) {
    const menteur = { atelier: { ...MODE_CONTRACTS.atelier, [champ]: true } };
    assert.ok(validateModeContracts(menteur).some((p) => p.includes(`MANUAL_MODE_CLAIMS_${champ}`)),
      `un Atelier qui prétendrait ${champ} doit être refusé.`);
  }
  /* Et une destination sans droit d'exécuter est refusée. */
  assert.ok(validateModeContracts({ atelier: { ...MODE_CONTRACTS.atelier, executionTarget: 'rapide' } })
    .some((p) => p.includes('EXECUTION_TARGET_WITHOUT_EXECUTION')));
});

test('T-MODE01-ATELIER-ENVELOPPE : l’enveloppe locale d’Atelier n’est PAS une readiness', () => {
  /* Fait mesuré et signalé, plutôt que masqué : v11StartAtelier construit une enveloppe ADN pour la
     projection d'audit, et cette enveloppe porte un etat_demande fabriqué localement. Elle n'est
     jamais lue comme une readiness, et n'atteint aucune exécution — mais elle existe, et le contrat
     doit dire pourquoi elle ne compte pas. */
  const atelier = bloc('function v11StartAtelier()', 'window.askDecisionProvider');
  assert.match(atelier, /adnManualEnvelope\(d,mat,'rapide'\)/, 'l’enveloppe locale existe bien.');
  /* CLEAN-02 : elle alimentait AUSSI une projection que personne ne lisait ; celle-ci est
     retirée. L'enveloppe, elle, demeure — et ce test dit toujours pourquoi elle ne compte pas. */
  assert.match(atelier, /adpState\.lastEnvelope=adnManualEnvelope\(d,mat,'rapide'\)/,
    'elle alimente un champ d’audit…');
  assert.doesNotMatch(atelier, /lastProjection|projectToAtelier/, '…et plus aucune projection jetée.');
  assert.doesNotMatch(atelier, /oprieState|canonicalContract|adpRunRapide|adpEnterArchitecte/,
    '…et rien d’autre : elle ne touche ni l’état OPRIE ni aucun moteur.');
  /* Le contrat canonique, lui, n'est posé qu'au seul endroit gouverné. */
  assert.equal([...FRONT_CODE.matchAll(/oprieState\.canonicalContract\s*=/g)].length, 1);
});

// =================================================================================================
// §53 — DESTINATIONS D'EXÉCUTION ET ROUTAGE
// =================================================================================================

test('T-MODE01-18 : aucun mode ne contourne l’autorité de routage', () => {
  /* La destination vient du contrat ; l'entrée en exécution reste sous l'action ENTER_READINESS. */
  const enter = bloc('function oprieExecutionTarget', 'function oprieApplyTurn');
  assert.match(enter, /if\(!route\)\{oprieMark\('execution_target_unknown'/,
    'un mode sans destination ferme le tour au lieu de deviner.');
  const table = html.slice(html.indexOf('const ORCHESTRATION_DRIVER='), html.indexOf('IA-04 — LE CYCLE'));
  assert.match(table, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/);
  assert.equal(table.includes('EXECUTE:'), false);
});

test('T-MODE01-19/20/21 : les destinations sont centralisées, et fidèles', () => {
  assert.equal(executionTargetFor('rapide'), 'rapide');
  assert.equal(executionTargetFor('architecte'), 'architecte');
  assert.equal(executionTargetFor('atelier'), null);
  assert.equal(executionTargetFor('inconnu'), null, 'un mode inconnu ne rend aucune destination.');
  assert.equal(executionTargetFor(undefined), null);
  /* Une seule dérivation dans tout le frontend écrit à la main. */
  assert.equal([...FRONT_CODE.matchAll(/executionTargetFor\(/g)].length, 1);
  for (const t of EXECUTION_TARGETS) assert.ok(['rapide', 'architecte'].includes(t));
});

test('T-MODE01-CIBLE-INCONNUE : un mode sans destination n’exécute rien', async () => {
  const h = loadPilot({ mode: 'atelier', deep: async () => arbiterTurn('operational_request_ready') });
  await h.pilot.oprieRunTurn('atelier');
  assert.deepEqual(h.spy.executed, [], 'un mode manuel poussé dans le tour gouverné n’exécute pas.');
  assert.equal(h.spy.gate[h.spy.gate.length - 1].decision.state, 'technical', 'le tour se ferme.');
  const marques = h.pilot.oprieState.telemetry.map((m) => m.event);
  assert.ok(marques.includes('execution_target_unknown'), 'et le refus est tracé.');
});

// =================================================================================================
// §54/§55 — LE CHANGEMENT DE MODE
// =================================================================================================

test('T-MODE01-22..25 : les bascules supportées, telles que le produit les tient', () => {
  for (const id of MODE_IDS) assert.equal(MODE_CONTRACTS[id].supportsModeSwitch, true);
  /* Le routeur accepte les trois modes, et un seul chemin par mode. */
  const routeur = bloc('window.__V11_ROUTER__', 'function init()');
  assert.match(routeur, /if\(mode==='rapide'\)return v11StartRapide\(\)/);
  assert.match(routeur, /if\(mode==='atelier'\)return v11StartAtelier\(\)/);
  assert.match(routeur, /return v11StartArchitecte\(\)/);
});

test('T-MODE01-26 : après bascule, les résultats de l’ancien mode sont dépassés', async () => {
  const h = loadPilot({ deep: async () => { await delay(110); return arbiterTurn('operational_request_ready'); } });
  const ancien = h.pilot.oprieRunTurn('architecte');
  await delay(20);
  h.pilot.oprieState.seq += 1;
  h.ctx.adpState.requestedMode = 'rapide';
  await ancien;
  assert.deepEqual(h.spy.executed, [], 'l’ancien tour n’exécute pas dans le nouveau mode.');
  const d = decideNextOrchestrationAction({
    mode: 'rapide', turn: { turn_id: 5, current_turn_id: 5, mode: 'architecte' },
    fast: null, deep: { state: 'operational_request_ready' }, readiness: null, promptQG: null, execution: null, outputQG: null
  });
  assert.equal(d.action, 'IGNORE_STALE');
  assert.equal(d.reason, 'MODE_SWITCHED');
});

test('T-MODE01-27/28/29/30 : un seul mode visible, aucun résidu actif, la demande est conservée', () => {
  const set = bloc('function setMode(', 'function currentMode()');
  /* Un seul mode marqué actif : la classe est posée pour tous, vraie pour un seul. */
  assert.match(set, /card\.dataset\.mode===mode.*classList\.toggle\('is-active',active\)/s);
  assert.match(set, /setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(set, /resetModePresentation\(mode\)/, 'et la présentation de l’ancien mode est retirée.');
  /* Le résidu est retiré explicitement, panneau par panneau. */
  const reset = bloc('function resetModePresentation(', 'function setMode(');
  for (const panneau of ['#ui-rapid-result', '#ui-rapid-gate', '#v11-exchange', '#v11-dialogue', '#v11-ready']) {
    assert.ok(reset.includes(panneau), `${panneau} est masqué à la bascule.`);
  }
  /* La demande, elle, est délibérément conservée — caractérisé, pas supposé. */
  assert.match(html.slice(html.indexOf('function resetModePresentation('), html.indexOf('function setMode(')),
    /On conserve volontairement #v11-demande/, 'la conservation est une décision écrite, pas un effet de bord.');
  assert.doesNotMatch(reset, /#v11-demande'\)\.value=/, 'et la demande n’est jamais réécrite.');
});

// =================================================================================================
// §56/§57 — AUCUNE AUTORITÉ PAR MODE
// =================================================================================================

test('T-MODE01-31..35 : aucun mode ne porte d’autorité', () => {
  const code = sansDenylist(sansProse(MODULE));
  /* La table n'écrit rien : aucune affectation de propriété. */
  assert.doesNotMatch(code, /\.[A-Za-z_$][\w$]*\s*=(?![=>])/, 'aucune écriture de propriété.');
  for (const interdit of [/guardPromptContract/, /validateOutputAgainstCanonicalContract/,
                          /assessAnalysisReadiness/, /routeExecution/, /canonical/i, /readiness[A-Z]/]) {
    assert.doesNotMatch(code, interdit, `la table ne doit pas toucher ${interdit}.`);
  }
  /* Et dans le frontend, aucune branche de mode n'écrit un état sémantique. */
  const ecritures = (nom) => [...FRONT_CODE.matchAll(new RegExp(`(?<![=!<>])\\b${nom}\\s*=(?![=>])`, 'g'))].length;
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required',
                      'degraded_state', 'execution_ready']) {
    assert.equal(ecritures(etat), 0, etat);
  }
});

test('T-MODE01-36/37/38 : aucun mode ne choisit son fournisseur', () => {
  const code = sansDenylist(sansProse(MODULE));
  /* La liste d'interdiction, elle, DOIT nommer le fournisseur — c'est ce qui le bannit. */
  assert.ok(FORBIDDEN_CONTRACT_FIELDS.includes('provider'));
  assert.ok(FORBIDDEN_CONTRACT_FIELDS.includes('providerOrder'));
  for (const interdit of [/groq/i, /anthropic/i, /openai/i, /provider/i, /fournisseur/i, /model/i]) {
    assert.doesNotMatch(code, interdit, `la table ne doit rien savoir de ${interdit}.`);
  }
  const worker = fs.readFileSync(path.join(root, 'workers/groq/src/index.js'), 'utf8');
  assert.match(worker, /export const DECISION_PROVIDER_ORDER = Object\.freeze\(\["groq", "anthropic", "openai"\]\)/,
    'ordre de bascule inchangé.');
  assert.match(worker, /GROQ_PRODUCTION_RETRY_DEFAULTS/, 'reprises inchangées.');
});

// =================================================================================================
// §58 — FAST / DEEP, SELON LA RÉALITÉ
// =================================================================================================

test('T-MODE01-39/40/41/42 : Fast et Deep suivent le contrat, mode par mode', async () => {
  for (const mode of ['rapide', 'architecte']) {
    assert.equal(MODE_CONTRACTS[mode].usesFastPlane, true);
    assert.equal(MODE_CONTRACTS[mode].usesDeepPlane, true);
    const h = loadPilot({
      mode,
      fast: async () => ({ type: 'ASK_CLARIFICATION', text: 'Q rapide ?' }),
      deep: async () => { await delay(90); return clarificationTurn('Q profonde ?'); }
    });
    const run = h.pilot.oprieRunTurn(mode);
    await delay(30);
    assert.equal(h.spy.fastCalls.length, 1, `${mode} : le plan rapide est sollicité.`);
    assert.equal(h.spy.deepCalls.length, 1, `${mode} : le plan profond aussi.`);
    await run;
  }
  /* Atelier n'en utilise aucun — et son entrée ne les déclenche pas. */
  assert.equal(MODE_CONTRACTS.atelier.usesFastPlane, false);
  assert.equal(MODE_CONTRACTS.atelier.usesDeepPlane, false);
  const atelier = bloc('function v11StartAtelier()', 'window.askDecisionProvider');
  assert.doesNotMatch(atelier, /oprieStartFastPlane|oprieRequestTurn/);
});

// =================================================================================================
// §59 — L'ANCIEN NE DÉFINIT AUCUN CONTRAT
// =================================================================================================

test('T-MODE01-43/44 : l’ancien chemin ne définit aucune politique de mode active', () => {
  /* CLEAN-01 : les branches de mode héritées vivaient dans adpDecideRapide, inertes.
     L'ancien décideur est retiré : il ne reste plus de chemin à innocenter. */
  assert.equal([...FRONT_CODE.matchAll(/adpDecideRapide/g)].length, 0, 'l’ancien décideur est retiré.');
  assert.equal([...FRONT_CODE.matchAll(/adnNextConversationAction/g)].length, 0);
  /* Et le handle de compatibilité n'expose aucun contrat de mode. */
  const handle = bloc('window.__ADAPTIVE_DECISION_PIPELINE_10G__', 'window.__V11_ROUTER__');
  assert.doesNotMatch(handle, /MODE_CONTRACTS|executionTargetFor|setMode/);
});

// =================================================================================================
// §60..§62 — NI SEUIL, NI FLOU, NI DOMAINE
// =================================================================================================

test('T-MODE01-NOHEURISTIQUE : la table ne contient ni seuil, ni flou, ni domaine', () => {
  const code = sansDenylist(sansProse(MODULE));
  /* Et les mêmes notions sont explicitement bannies par la liste. */
  for (const banni of ['confidence', 'score', 'threshold', 'semanticThreshold']) {
    assert.ok(FORBIDDEN_CONTRACT_FIELDS.includes(banni), `${banni} doit être banni.`);
  }
  for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i, /embedding/i,
                          /cosine/i, /levenshtein/i, /fuzzy/i, /similar/i, /\.length\s*[<>]/,
                          /case_id/i, /voyage|medical|juridique|legal|travel|recette/i]) {
    assert.doesNotMatch(code, interdit, interdit.toString());
  }
  /* Elle est pure : ni réseau, ni DOM, ni horloge, ni état mutable de module. */
  for (const interdit of [/fetch\(/, /document\./, /window\./, /Date\./, /Math\.random/, /^let /m, /console\./]) {
    assert.doesNotMatch(code, interdit, interdit.toString());
  }
});

// =================================================================================================
// §65..§69 — LES COMPTES DE CLÔTURE
// =================================================================================================

test('T-MODE01-COMPTES : une source, aucune duplication, aucune branche sémantique', () => {
  assert.equal((html.match(/const MODE_CONTRACTS = Object\.freeze\(\{/g) || []).length, 1);
  assert.equal(MODE_CLASSES.length, 2);
  assert.deepEqual([...modesOfClass('governed_execution')], ['rapide', 'architecte']);
  assert.deepEqual([...modesOfClass('manual_composition')], ['atelier']);
  /* Les branches de mode ACTIVES sont comptées et classées : aucune n'est sémantique. */
  const actives = [...FRONT_CODE.matchAll(/mode==='(rapide|atelier)'/g)].length;
  assert.equal(actives, 2, 'les deux branches du routeur d’entrée, et rien d’autre.');
  const routeur = bloc('window.__V11_ROUTER__', 'function init()');
  for (const etat of ['operational_request_ready', 'clarification_required', 'blocked', 'degraded_state']) {
    assert.equal(routeur.includes(etat), false, `le routeur ne connaît pas ${etat}.`);
  }
});

test('T-MODE01-AUDIT : la vue d’audit rend le contrat, sans rien y ajouter', () => {
  const vue = createModeContractAuditView('rapide');
  assert.equal(vue.mode, 'rapide');
  assert.equal(vue.version, MODE_CONTRACTS_VERSION);
  assert.equal(vue.executionTarget, 'rapide');
  assert.equal(createModeContractAuditView('inconnu'), null, 'un mode inconnu ne rend rien.');
  assert.equal(contractFor('inconnu'), null);
  assert.equal(contractFor(null), null);
  /* Les contrats sont gelés : personne ne les modifie à chaud. */
  assert.throws(() => { MODE_CONTRACTS.rapide.executionTarget = 'architecte'; }, TypeError);
});
