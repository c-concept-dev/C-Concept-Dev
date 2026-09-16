/* V2.2.1-E2 — DES TESTS ONT ÉTÉ RETIRÉS DE CE FICHIER, ET VOICI LEUR CLASSEMENT.
 *
 * Ils éprouvaient le DECISION PROVIDER HISTORIQUE : sa chaîne de fournisseurs, son comportement
 * fail-closed, son entrée minimale, son validateur de sortie lexical. Le réaudit indépendant a
 * relevé que ce décideur embarquait une stop-list, des règles lexicales et un seuil de similarité
 * — du hardcoding décisionnel au sens de la Directive Maître.
 *
 * L'audit de reachability de E2 a établi qu'il n'avait plus AUCUN appelant dans le produit : sa
 * seule voie d'accès était deux expositions `window`, consommées par un banc d'évaluation. Sa
 * dernière responsabilité — refuser une question qui répète une clarification déjà posée —
 * appartient depuis longtemps au plan canonique (`isRepeatedSolicitation`, ALREADY_ANSWERED).
 *
 * Ces tests sont donc classés HISTORICAL_IMPLEMENTATION_CONTRACT : ils protégeaient fidèlement un
 * chemin qui n'existe plus. Ils ont été retirés AVEC lui, et non affaiblis pour survivre. Ce qui
 * reste dans ce fichier éprouve des invariants toujours vivants.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

// =================================================================================================
// FC-01a — SUPPRESSION DU FAIL-OPEN local-prudent.
//
// Avant ce lot, lorsque les DEUX fournisseurs Decision échouaient, le navigateur appelait
// adpFallbackLocal() et fabriquait {etat_demande:'exploitable', route:'architecte'} : une panne
// technique devenait une autorisation d'exécuter. Le frontend prononçait un jugement sur une demande
// qu'aucun fournisseur n'avait analysée.
//
// Après FC-01a : une indisponibilité technique reste une indisponibilité technique. Aucune route,
// aucune exécution, aucun état fabriqué — la demande de l'utilisateur est conservée telle quelle et
// il peut relancer.
//
// Hors périmètre, explicitement : l'exécution du livrable via la clé Anthropic du navigateur
// (BYO_KEY_BROWSER, décision propriétaire) n'est pas touchée par ce lot.
// =================================================================================================

const REASONS = {
  clarification: 'La demande n’est pas encore suffisamment exploitable ; une clarification à forte valeur d’information est nécessaire.',
  rapide: 'La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.',
  architecte: 'La demande est exploitable mais nécessite une structuration ou des arbitrages préalables.'
};
const decision = (etat_demande, route, question = null) => ({
  etat_demande, route, confiance: 'haute',
  raison_interne: etat_demande === 'clarification_necessaire' ? REASONS.clarification : REASONS[route],
  question
});

const failNetwork = async () => { throw new TypeError('network'); };
const ask = (provider, input = { demande: 'Rédige une note de synthèse.', materiau_present: false, mode_demande: 'rapide' }) =>
  provider.askDecisionProvider(input);

// --- FC01A-1 / 2 : les chemins nominaux sont INCHANGÉS ---------------------------------------------

test('FC01A-7 : une erreur technique neutre est rendue, sans route et sans exécution', () => {
  assert.match(html, /const ADP_TECHNICAL_FAILURE_UI=Object\.freeze\(/);
  assert.match(html, /Impossible d’analyser la demande pour le moment\./);
  assert.match(html, /Votre demande est conservée\. Vous pouvez réessayer\./);
  // CLEAN-01 : adpShowTechnicalFailure était le JUMEAU HÉRITÉ de ce rendu, sans appelant depuis
  // que oprieRunTurn porte l'échec technique. Il est retiré ; l'invariant est désormais porté par
  // le rendu RÉELLEMENT atteint, ce qui le renforce au lieu de l'affaiblir.
  assert.match(html, /function oprieShowNetworkFailure\(\)\{\s*adpState\.pendingQuestion=false;if\(!oprieKeepFailedDialogue\(\)\)show\(null\);\s*v11ShowRapidGate\(ADP_TECHNICAL_FAILURE_UI\);/);
  // Les trois points d'entrée traitent l'échec sans jamais router.
  // FC-01b : les trois points d'entrée passent désormais par oprieRunTurn, qui rend lui-même l'échec
  // technique. Le rendu reste garanti, en un seul endroit au lieu de trois — l'invariant (aucun point
  // d'entrée ne peut router sur un échec) est renforcé, pas affaibli.
  // PERF-04 : le pilote unique a gagné un garde de tour (un échec d'un tour dépassé ne rend plus
  // rien). L'invariant vérifié ici est inchangé et désormais porté sur le CORPS de la fonction au
  // lieu d'une ligne littérale : l'échec technique est rendu, et ce chemin ne route ni n'exécute.
  const pilote = html.slice(html.indexOf('async function oprieRunTurn'), html.indexOf('const ADP_TECHNICAL_FAILURE_UI'));
  assert.ok(pilote.length > 0, 'le pilote unique doit exister.');
  assert.match(pilote, /catch\(error\)\{[\s\S]*?oprieShowNetworkFailure\(\)/,
    'le pilote unique rend l’échec technique sans jamais router.');
  for (const routage of [/adpRunRapide/, /adpEnterArchitecte/, /oprieEnterExecution/]) {
    assert.doesNotMatch(pilote, routage, `le pilote ne doit jamais router (${routage}) : seul oprieApplyTurn le peut, sur un état OPRIE.`);
  }
  assert.match(html, /\.ui-rapid-gate\[data-state="technical"\]/, 'l’état technique doit être visible.');
});

test('FC01A-8 : le message d’erreur ne nomme aucun fournisseur, aucun statut, aucune cause inventée', () => {
  const start = html.indexOf('const ADP_TECHNICAL_FAILURE_UI');
  const block = html.slice(start, html.indexOf('function v11SwitchToArchitecteFromRapid'));
  for (const forbidden of [/workers[- ]?ai/i, /groq/i, /anthropic/i, /openai/i, /provider/i, /fournisseur/i, /http/i, /retry/i, /\b\d{3}\b/, /token/i, /sk-/]) {
    assert.doesNotMatch(block, forbidden, `le message ne doit pas exposer ${forbidden}.`);
  }
});

// --- FC01A-10 / 11 : hors périmètre strictement préservé ----------------------------------------------

test('FC01A-10 : l’exécution BYO-key Anthropic est INCHANGÉE (hors périmètre, décision propriétaire)', () => {
  assert.match(html, /fetch\('https:\/\/api\.anthropic\.com\/v1\/messages'/, 'le moteur d’exécution reste intact.');
  assert.match(html, /https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.match(html, /'x-api-key':cle/);
  assert.match(html, /id="accueil-cle"/);
  assert.match(html, /id="api-cle"/);
});

test('FC01A-11 : aucune modification d’OPRIE, du backend ni de core/adn depuis ce lot', () => {
  for (const file of ['workers/shared/operational-request-core.js', 'workers/shared/operational-request-orchestrator.js',
                      'workers/shared/provider-ha.js', 'workers/groq/src/index.js',
                      'core/adn/operational-request-state.js',
                      'core/adn/routing-engine.js', 'core/adn/execution-readiness.js']) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  // FC-01b câble désormais OPRIE : cette assertion, propre à FC-01a, devient son inverse.
  assert.ok(html.includes('/operational-request'), 'FC-01b câble OPRIE comme autorité de readiness.');
});

// --- FC01A-12 : hygiène ---------------------------------------------------------------------------------

test('FC01A-12 : aucun hardcoding métier introduit par ce lot', () => {
  const start = html.indexOf('/* FC-01a :');
  const block = html.slice(start, start + 3000);
  for (const forbidden of [/case_id/i, /fixture/i, /corpus/i, /\bItalie\b/i, /\bvoyage\b/i]) {
    assert.doesNotMatch(block, forbidden, String(forbidden));
  }
});

// --- Le second fail-open, désormais inatteignable --------------------------------------------------------

test('FC01A-UNREACHABLE : le repli « local proportionné » du miroir Conversation Orchestrator n’est plus atteignable', () => {
  // Ce repli (state:"execution_ready" quand provider_available=false) appartient au miroir navigateur
  // de core/adn/conversation-orchestrator.js — GELÉ, hors périmètre, donc non modifié ici. Il n'est
  // atteignable que si un providerResult porte source:'local-prudent'. Or plus AUCUN code ne produit
  // cette valeur : le seul producteur était adpFallbackLocal, supprimée.
  // CLEAN-01 : « inatteignable » est devenu « absent ». Le miroir portait le seul fail-open
  // restant de cette famille ; il est retiré du produit avec son module. La garde consommatrice
  // d'engine-adapters demeure, parce que la valeur reste un mot légal du contrat de fil.
  assert.equal(html.includes('source: "local-prudent"'), false, 'le repli est retiré du produit.');
  const producers = html.match(/source:\s*'local-prudent'/g) || [];
  assert.deepEqual(producers, [], 'et personne ne le produit.');
  assert.match(html, /source !== 'local-prudent'/, 'la garde d’engine-adapters reste en place.');
});
