/* CLEAN-01 — LE LEGACY D'ORCHESTRATION, RETIRÉ.
 * ============================================================================
 *
 * Pendant cinq lots, une deuxième machinerie d'orchestration a survécu à côté
 * de la première : un décideur conversationnel hérité, son appariement flou,
 * son repli « local proportionné », un handle qui les exposait, une reprise
 * sans appelant, et trois boutons d'entrée maintenus hors écran par une règle
 * CSS. Chaque lot l'a mesurée inerte, et chaque lot a écrit la même phrase :
 * « retrait = lot CLEAN ».
 *
 * Ce lot est ce retrait. Cette suite ne prouve donc plus une inertie — elle
 * prouve une ABSENCE, ce qui est la même garde en plus fort : un code qui
 * n'existe pas ne peut pas être rebranché par distraction.
 *
 * CE QUI N'EST PAS PARTI, ET POURQUOI :
 *
 *   askDecisionProvider reste. Ce n'est pas une autorité : c'est la couche de
 *   transport du Decision Provider, exécutée par le banc d'évaluation et par
 *   les preuves fail-closed. Le retirer aurait cassé des consommateurs réels.
 *
 *   La valeur « local-prudent » reste un mot légal du contrat de fil
 *   (PROVIDER_SOURCES) et la garde qui la refuse reste en place. Ce qui est
 *   retiré, c'est le seul code qui la PRODUISAIT.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNextOrchestrationAction } from '../core/adn/orchestration-policy.js';
import { loadPilot, arbiterTurn, clarificationTurn, confirmationTurn, delay, html } from './perf04-frontend-harness.helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = fs.readFileSync(path.join(root, 'core/adn/browser-runtime.generated.js'), 'utf8');
const BUILD = fs.readFileSync(path.join(root, 'tools/build-adn-browser-runtime.mjs'), 'utf8');
const sansProse = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tranche = (debut, fin) => { const a = html.indexOf(debut); return html.slice(a, html.indexOf(fin, a + debut.length)); };
const FRONTEND = (() => { const i = html.indexOf('/* GENERATED'); const j = html.indexOf('})(window);', i); return html.slice(0, i) + html.slice(j); })();
const FRONT_CODE = sansProse(FRONTEND);
const compte = (motif, src = FRONT_CODE) => [...src.matchAll(new RegExp(motif, 'g'))].length;

/** Contexte de politique : un même verdict OPRIE, posé dans le mode demandé. */
const ctxPolitique = (mode, deep, extra = {}) => ({
  mode, turn: { turn_id: 3, current_turn_id: 3, mode, pending_user_interaction: false },
  fast: null, deep, readiness: null, promptQG: null, execution: null, outputQG: null, ...extra
});

// =================================================================================================
// §44 — CE QUI DEVAIT PARTIR EST PARTI
// =================================================================================================

test('T-CLEAN01-01 : plus aucun décideur conversationnel hérité, ni source ni bundle', () => {
  assert.equal(fs.existsSync(path.join(root, 'core/adn/conversation-orchestrator.js')), false,
    'le module hérité est retiré du dépôt.');
  for (const symbole of ['nextConversationAction', 'adnNextConversationAction',
                         'CONVERSATION_ORCHESTRATOR_VERSION', 'createConversationAuditEvent',
                         'validateConversationAuditEvent']) {
    assert.equal(html.includes(symbole), false, `${symbole} : plus rien dans le produit.`);
    assert.equal(BUNDLE.includes(symbole), false, `${symbole} : plus rien dans le bundle.`);
    assert.equal(BUILD.includes(symbole), false, `${symbole} : plus rien dans le build.`);
  }
  /* Et l'ancien décideur de mode qui l'appelait n'existe plus non plus. */
  assert.equal(compte('adpDecideRapide'), 0);
  assert.equal(compte('adpRecordConversationAction'), 0);
});

test('T-CLEAN01-02 : plus aucun appariement flou hérité', () => {
  /* Le flou 0.6 vivait dans le module hérité et n'avait aucun consommateur. */
  assert.equal(html.includes('conversationQuestionsSimilar'), false);
  assert.equal(BUNDLE.includes('conversationQuestionsSimilar'), false);
  assert.equal(BUNDLE.includes('>= 0.6'), false, 'son seuil part avec lui.');
  /* Le seul appariement qui subsiste appartient au VALIDATEUR de sortie du
     Decision Provider — il refuse une question qui répète une clarification
     déjà posée. Il ne décide aucun état : il rejette une sortie non conforme. */
  const validateur = sansProse(tranche('function adpQuestionsSimilaires(', 'async function askDecisionProvider('));
  assert.match(validateur, /throw new Error\('La question répète une clarification déjà posée\.'\)/,
    'il rejette, il ne promeut pas.');
  /* Il LIT les valeurs du contrat de fil pour les valider — c'est son travail — mais il
     n'en ÉCRIT aucune : un validateur qui promeut ne valide plus, il décide. */
  for (const etat of ['operational_request_ready', 'execution_ready', 'exploitable', 'route']) {
    assert.equal([...validateur.matchAll(new RegExp(`(?<![=!<>])\\b${etat}\\s*=(?![=>])`, 'g'))].length, 0,
      `le validateur n’écrit pas ${etat}.`);
  }
  for (const moteur of ['oprieRunTurn', 'oprieEnterExecution', 'adpRunRapide', 'adpEnterArchitecte']) {
    assert.equal(validateur.includes(moteur), false, `et n’atteint pas ${moteur}.`);
  }
});

test('T-CLEAN01-03 : plus aucun repli « local proportionné »', () => {
  /* Ce repli promouvait execution_ready quand le fournisseur était indisponible. */
  assert.equal(html.includes('source: "local-prudent"'), false, 'le producteur est retiré.');
  assert.equal(compte("source:\\s*'local-prudent'", html), 0, 'et personne d’autre ne le produit.');
  /* La valeur reste un mot LÉGAL du contrat de fil, et la garde qui la refuse reste. */
  assert.match(html, /PROVIDER_SOURCES = new Set\(\["workers-ai", "groq", "local-prudent", "none", null\]\)/);
  assert.match(html, /source !== 'local-prudent'/);
  /* Et la politique active ne promeut jamais sur panne : elle attend. */
  const surPanne = decideNextOrchestrationAction({ ...ctxPolitique('architecte', null), fast_failed: true });
  assert.equal(surPanne.action, 'WAIT_FOR_DEEP', 'une panne attend, elle ne promeut rien.');
});

test('T-CLEAN01-04 : plus aucune reprise héritée sans appelant', () => {
  assert.equal(compte('adpResumeAfterClarification'), 0);
  /* La reprise RÉELLE — celle qui a un appelant — est intacte : une réponse
     relance un tour OPRIE complet avec le mode courant, sans plafond. */
  const reponse = sansProse(tranche('function answerQuestion(answer){', 'function resetAll()'));
  assert.match(reponse, /oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/);
  assert.doesNotMatch(reponse, /clarifications\s*<\s*\d+/, 'et sans plafond.');
});

test('T-CLEAN01-05 : plus aucune entrée de mode héritée, ni markup ni style ni écouteur', () => {
  for (const id of ['v11-prepare', 'v11-go-rapide', 'v11-go-avance']) {
    assert.equal(html.includes(`id="${id}"`), false, `${id} : markup retiré.`);
    assert.equal(html.includes(`#${id}`), false, `${id} : plus aucune référence.`);
  }
  assert.equal(html.includes('ui-hidden-bridge'), false, 'le pont et sa règle CSS sont retirés.');
  assert.equal(compte("addEventListener\\('click',v11Start"), 0, 'plus aucun écouteur hérité.');
  /* Une seule entrée subsiste, et elle passe par le routeur. */
  assert.match(html, /\$\('#ui-main-action'\)\?\.addEventListener\('click',routeCurrentMode\)/);
  assert.equal(compte('__V11_ROUTER__', html), 3, 'définition, exposition et appel — un seul routeur.');
});

test('T-CLEAN01-06 : plus aucune référence de contrôle sans cible', () => {
  assert.equal(html.includes('v11-go-architecte'), false, 'l’identifiant sans cible est retiré.');
  /* oprieSetBusy ne désarme plus qu'un contrôle, et celui-ci existe. */
  const busy = sansProse(tranche('function oprieSetBusy(', 'function oprieShowAnalysing'));
  assert.match(busy, /const el=\$\('#v11-answer-continue'\);if\(el\)el\.disabled=!!busy/);
  assert.ok(html.includes('id="v11-answer-continue"'));
  /* Tous les identifiants de MODE et d'ORCHESTRATION nommés par le frontend existent
     dans le document. C'est la garde générale que la référence morte violait. */
  const nommes = new Set([...FRONT_CODE.matchAll(/\$\('#([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  const orchestration = [...nommes].filter((id) => /^(v11|ui-mode|ui-main|ui-rapid|arch)/.test(id));
  const orphelins = orchestration.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(orphelins, [], 'aucun identifiant d’orchestration sans élément correspondant.');
  /* CLEAN-01 avait NOMMÉ, sans y toucher, une seconde référence sans cible :
     #ui-process-text. CLEAN-02 l'a traitée — le carrousel entier n'avait aucun élément,
     nulle part. La garde ci-dessous vaut donc maintenant pour tout le frontend. */
  const tousOrphelins = [...nommes].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(tousOrphelins, [], 'plus aucun identifiant nommé sans élément correspondant.');
});

// =================================================================================================
// §22/§29/§30 — UN SEUL CHEMIN D'ORCHESTRATION, ET IL EST LISIBLE
// =================================================================================================

test('T-CLEAN01-07/08 : une politique, un pilote, un traducteur', () => {
  assert.equal((html.match(/const ORCHESTRATION_DRIVER=/g) || []).length, 1, 'une seule table d’application.');
  assert.equal(compte('function oprieDriveOrchestration\\('), 1, 'un seul pilote.');
  assert.equal(compte('function oprieDecideOrchestration\\('), 1, 'une seule interrogation de la politique.');
  assert.equal(compte('decideNextOrchestrationAction'), 2, 'définition du pont + unique appel.');
  /* La politique elle-même vit dans un seul module. */
  const modules = fs.readdirSync(path.join(root, 'core/adn'))
    .filter((f) => f.endsWith('.js') && !f.includes('generated'))
    .filter((f) => /export function decideNextOrchestrationAction/.test(fs.readFileSync(path.join(root, 'core/adn', f), 'utf8')));
  assert.deepEqual(modules, ['orchestration-policy.js']);
});

test('T-CLEAN01-09 : un seul routeur de mode, et il ne décide rien', () => {
  const routeur = sansProse(tranche('window.__V11_ROUTER__', 'function init()'));
  assert.equal(compte('window\\.__V11_ROUTER__=Object\\.freeze', html), 1);
  for (const interdit of ['operational_request_ready', 'clarification_required', 'blocked',
                          'degraded_state', 'execution_ready', 'appelFournisseur',
                          'guardPromptContract', 'archControleSortie', 'oprieEnterExecution']) {
    assert.equal(routeur.includes(interdit), false, `le routeur ne connaît pas ${interdit}.`);
  }
});

// =================================================================================================
// §31/§32/§33 — LES CORRESPONDANCES D'ÉTATS N'ONT PAS BOUGÉ
// =================================================================================================

test('T-CLEAN01-10/11/12 : WAIT_FOR_USER, ENTER_READINESS, blocked et degraded — inchangés', () => {
  /* Le nettoyage ne devait rien changer au comportement. Voici la table, état
     par état, dans les DEUX modes gouvernés. */
  const attendu = [
    ['clarification_required', 'WAIT_FOR_USER'],
    ['confirmation_required', 'WAIT_FOR_USER'],
    ['operational_request_ready', 'ENTER_READINESS'],
    ['blocked', 'SHOW_BLOCKED'],
    ['degraded_state', 'SHOW_DEGRADED']
  ];
  for (const [etat, action] of attendu) {
    for (const mode of ['rapide', 'architecte']) {
      assert.equal(decideNextOrchestrationAction(ctxPolitique(mode, { state: etat })).action, action,
        `${mode} : ${etat} → ${action}`);
    }
  }
  /* Et l'application de ces actions est toujours celle du produit. */
  const table = tranche('const ORCHESTRATION_DRIVER=', 'IA-04 — LE CYCLE');
  assert.match(table, /WAIT_FOR_USER:\(turn\)=>turn&&turn\.state==='confirmation_required'\?oprieShowConfirmation\(turn\):oprieShowClarification\(turn\)/);
  assert.match(table, /ENTER_READINESS:\(turn,requestedMode\)=>oprieEnterExecution\(turn,requestedMode\)/);
  assert.match(table, /SHOW_BLOCKED:\(turn\)=>oprieShowBlocked\(turn\)/);
  assert.match(table, /SHOW_DEGRADED:\(\)=>oprieShowDegraded\(\)/);
});

// =================================================================================================
// §21 — AUCUN CHANGEMENT DE COMPORTEMENT
// =================================================================================================

test('T-CLEAN01-COMPORTEMENT : les trois issues d’un tour se comportent comme avant', async () => {
  /* Prêt → un moteur entre, une seule fois. */
  const pret = loadPilot({ mode: 'rapide', deep: async () => arbiterTurn('operational_request_ready') });
  await pret.pilot.oprieRunTurn('rapide');
  assert.equal(pret.spy.executed.length, 1);

  /* Clarification → une question, aucune exécution. */
  const clar = loadPilot({ mode: 'architecte', deep: async () => clarificationTurn('Quel public ?') });
  await clar.pilot.oprieRunTurn('architecte');
  assert.deepEqual(clar.spy.executed, []);
  assert.equal(clar.ctx.adpState.pendingQuestion, true);

  /* Confirmation → une sollicitation, aucune exécution. */
  const conf = loadPilot({ mode: 'rapide', deep: async () => confirmationTurn('Un arbitrage a été fait.') });
  await conf.pilot.oprieRunTurn('rapide');
  assert.deepEqual(conf.spy.executed, []);
});

test('T-CLEAN01-FAILCLOSED : une panne technique ferme toujours, sans router', async () => {
  const h = loadPilot({ mode: 'rapide', deep: async () => { throw new Error('panne'); } });
  await h.pilot.oprieRunTurn('rapide');
  assert.deepEqual(h.spy.executed, [], 'une panne n’exécute rien.');
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical');
  /* Le rendu neutre est celui qui reste, et il ne nomme personne. */
  const rendu = JSON.stringify(h.spy.gate.at(-1));
  for (const interdit of ['groq', 'anthropic', 'openai', 'http', 'retry']) {
    assert.ok(!rendu.toLowerCase().includes(interdit), `l’échec ne nomme pas ${interdit}.`);
  }
});

// =================================================================================================
// §34/§35 — RIEN N'A ÉTÉ AJOUTÉ EN CHEMIN
// =================================================================================================

test('T-CLEAN01-RIEN-AJOUTÉ : aucun seuil, aucun flou, aucun repli introduits par ce lot', () => {
  const busy = sansProse(tranche('function oprieSetBusy(', 'function oprieShowAnalysing'));
  const facade = sansProse(tranche('window.__ADAPTIVE_DECISION_PIPELINE_10G__', 'window.__V11_ROUTER__'));
  for (const source of [busy, facade]) {
    for (const interdit of [/confidence/i, /\bscore\b/i, /threshold/i, /\bseuil\b/i,
                            /fuzzy/i, /similar/i, /fallback/i, /repli/i, /0\.\d/]) {
      assert.doesNotMatch(source, interdit, String(interdit));
    }
  }
  /* La façade est réduite à ce qui a un consommateur réel. */
  assert.doesNotMatch(facade, /decide:|lastDecision|getAudit|adpState\.audit/);
  assert.match(facade, /askDecisionProvider/);
  assert.match(html, /window\.askDecisionProvider=askDecisionProvider/, 'le transport reste exposé.');
});

test('T-CLEAN01-BUILD : un bloc runtime, un bundle plus court, et rien d’orphelin', () => {
  assert.equal((html.match(/\/\* GENERATED — LOT 10G\.3B\.3F\.[12]/g) || []).length, 1);
  assert.equal((html.match(/\}\)\(window\);/g) || []).length, 1);
  /* Le bundle embarqué est exactement le fichier généré. */
  const embarque = tranche('/* GENERATED — LOT 10G.3B.3F', '})(window);') + '})(window);\n';
  assert.equal(embarque.trim(), BUNDLE.trim());
  /* Chaque module déclaré au build a bien un fichier source. */
  const fichiers = [...BUILD.matchAll(/file: '([^']+)'/g)].map((m) => m[1]);
  for (const f of fichiers) {
    assert.ok(fs.existsSync(path.join(root, 'core/adn', f)) || fs.existsSync(path.join(root, 'workers/shared', f)),
      `${f} : le build ne déclare aucun module fantôme.`);
  }
  assert.equal(fichiers.includes('conversation-orchestrator.js'), false);
});
