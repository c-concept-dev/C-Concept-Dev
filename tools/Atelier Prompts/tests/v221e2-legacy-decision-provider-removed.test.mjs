/* ATELIER PROMPTS V2.2.1-E2 — LE DÉCIDEUR HISTORIQUE A QUITTÉ L'ARTEFACT.
 * ============================================================================
 *
 * CE QUE LE RÉAUDIT INDÉPENDANT A TROUVÉ, ET QUE MES SCANS AVAIENT MANQUÉ.
 *
 * Toute la série D2 a cherché le hardcoding décisionnel dans `solicitation-policy.js`, et l'y a
 * effectivement fermé. Mais le scan était CENTRÉ sur ce fichier. L'artefact livré contenait, dans
 * une tout autre région, un décideur complet hérité du lot 10G :
 *
 *   adpMotsQuestion()          — découpe en mots, pour comparer deux questions
 *   adpQuestionsSimilaires()   — appariement flou, seuil de similarité >= 0.7
 *   adpDecisionValide()        — validateur de sortie, règles lexicales
 *   askDecisionProvider()      — transport vers /decision
 *
 * AUDIT DE REACHABILITY (§3). La chaîne était close et suspendue à un seul point :
 *   adpMotsQuestion ← adpQuestionsSimilaires ← adpDecisionValide ← adpAskEndpoint ← askDecisionProvider
 * et `askDecisionProvider` n'avait AUCUN appelant dans le produit. Sa seule voie d'accès était deux
 * expositions globales — `window.askDecisionProvider` et `window.__ADAPTIVE_DECISION_PIPELINE_10G__` —
 * consommées par un banc d'évaluation, jamais par un parcours utilisateur.
 *
 * POURQUOI SUPPRIMER PLUTÔT QUE DÉBRANCHER. Une exposition globale est une surface publique de
 * l'artefact livré : n'importe quoi peut l'appeler. Livrer un décideur lexical accessible, c'est
 * livrer du hardcoding décisionnel, que le produit l'appelle ou non. Et sa dernière responsabilité
 * — refuser une question qui répète une clarification déjà posée — appartient depuis longtemps au
 * plan canonique : `isRepeatedSolicitation`, verdict ALREADY_ANSWERED.
 *
 * CE FICHIER EMPÊCHE SON RETOUR, dans les sources ET dans l'artefact généré.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessSolicitation } from '../workers/shared/solicitation-policy.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const bundle = fs.readFileSync(new URL('../core/adn/browser-runtime.generated.js', import.meta.url), 'utf8');
/* Le code RÉELLEMENT exécuté de l'artefact : commentaires retirés. */
const executed = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DISPARUS = ['adpMotsQuestion', 'adpQuestionsSimilaires', 'adpDecisionValide', 'askDecisionProvider',
                  'adpAskEndpoint', 'adpTexteQuestion', 'adpNormaliserQuestion', 'adpQuestionsPrecedentes',
                  'adpEndpointValide', 'adpDecisionTechnicalFailure',
                  '__ADAPTIVE_DECISION_PIPELINE_10G__', 'ADP10G', 'ADP_REASONS', 'ADP_ADN_RUNTIME_VERSION'];

test('V221E2-01 : le décideur historique a disparu de l’artefact livré', () => {
  for (const symbole of DISPARUS) {
    assert.equal(html.includes(symbole), false, `${symbole} est revenu dans l’artefact`);
  }
});

test('V221E2-02 : il a disparu des sources et du runtime compilé, pas seulement de l’HTML', () => {
  for (const symbole of DISPARUS) {
    assert.equal(bundle.includes(symbole), false, `${symbole} est revenu dans le runtime compilé`);
  }
  /* Les sources de production non plus : le bundle est généré, il ne s'écrit pas à la main. */
  for (const chemin of ['../workers/shared/solicitation-policy.js', '../workers/shared/operational-request-orchestrator.js',
                        '../core/adn/operational-request-state.js']) {
    const src = fs.readFileSync(new URL(chemin, import.meta.url), 'utf8');
    for (const symbole of DISPARUS) assert.equal(src.includes(symbole), false, `${symbole} dans ${chemin}`);
  }
});

test('V221E2-03 : aucun décideur n’est plus exposé globalement', () => {
  /* Les trois enveloppes gelées sont les seules ; celle du décideur historique a disparu. */
  const handles = [...new Set([...executed.matchAll(/window\.(__[A-Z0-9_]+__)\s*=/g)].map((m) => m[1]))].sort();
  assert.deepEqual(handles, ['__ARCHITECTE_V10__', '__QUALITE_V10__', '__V11_ROUTER__']);
  /* Et aucun des symboles retirés n'est exposé, sous quelque forme que ce soit. */
  for (const symbole of DISPARUS) {
    assert.equal(new RegExp(`window\\.[A-Za-z_.]*${symbole}`).test(executed), false, symbole);
  }
  /* NOTE HONNÊTE : l'artefact expose par ailleurs des fonctions utilitaires sur `window`
     (configuration de fournisseur, tarifs, proportions). Elles ne décident aucune sémantique de
     demande, et ce lot ne les traite pas — les énumérer ici serait prétendre les avoir auditées. */
});

test('V221E2-04 : l’appariement flou du décideur historique a disparu — et ce qui reste est NOMMÉ', () => {
  /* Sa signature exacte, telle que relevée par le réaudit : un ratio de mots communs comparé à un
     seuil, dans la chaîne adp*. Elle n'existe plus. */
  for (const symbole of ['adpMotsQuestion', 'adpQuestionsSimilaires']) {
    assert.equal(executed.includes(symbole), false, symbole);
  }
  /* V2.2.1-E3 a fermé les deux appariements que E2 avait trouvés hors périmètre et épinglés ici :
     celui de la porte de readiness ADN, et celui du validateur de la route /decision. Le compte
     descend donc de deux à zéro, et ce test l'y maintient. */
  const seuils = [...executed.matchAll(/common\s*\/\s*Math\.min\([^)]*\)\s*>=\s*0?\.\d+/g)];
  assert.equal(seuils.length, 0, 'plus aucun appariement flou dans l’artefact');
  assert.equal(executed.includes('function questionsSimilar('), false);
  assert.equal(executed.includes('function questionsAreTooSimilar('), false);
});

test('V221E2-05 : la responsabilité retirée est tenue par le plan canonique', () => {
  /* Le décideur historique refusait une question répétant une clarification déjà posée. C'est
     exactement ce que le verdict ALREADY_ANSWERED fait — sans appariement flou, et sans seuil :
     la comparaison canonique est structurelle, pas lexicale. */
  const question = 'Depuis quelle ville partez-vous ?';
  const historique = [{ question, answer: 'Lyon' }];
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: question }, historique), 'ALREADY_ANSWERED');
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: question }, []), 'ALLOW');
});

test('V221E2-06 : E1 reste intact — le plan rapide ne décide toujours aucune maturité', () => {
  assert.equal(html.includes('canonical_decision'), false);
  assert.equal(html.includes('fastSemanticType'), false);
  assert.equal(html.includes('oprieCanonicalDecision'), false);
});
