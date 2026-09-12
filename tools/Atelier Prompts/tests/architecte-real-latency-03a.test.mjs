/* 03A — OÙ LE TEMPS EST DÉPENSÉ, ET POURQUOI LE COURT-CIRCUIT NE SE DÉCLENCHE JAMAIS.
 * ============================================================================
 *
 * Mesure réelle, « je veux préparer un voyage a malaga fin novembre », mode architecte,
 * 3 runs contre les endpoints déployés :
 *
 *   plan rapide   407 · 671 · 546 ms   →  type = ACKNOWLEDGE   (3/3)
 *   plan profond  117 732 · 115 713 · 122 717 ms  →  clarification_required (3/3)
 *   traitement local  0 ms
 *
 * Le plan profond représente 99,5 % du temps, et il rend une QUESTION —
 * « Combien de jours dure votre séjour à Malaga ? » — que le plan rapide savait poser en 0,6 s.
 *
 * IA-04 (lot 1D-N) avait construit le court-circuit : si le plan rapide sollicite, le plan profond
 * ne part pas. Il fonctionne. Il ne se déclenche jamais, parce que le plan rapide ne sollicite
 * jamais : ACKNOWLEDGE sur 6 demandes /6, dont quatre délibérément incomplètes.
 *
 * Cette suite fige la contradiction entre deux artefacts de production, pour qu'elle ne puisse pas
 * redevenir invisible. Elle ne la corrige pas : ce que le plan rapide a le droit de proposer est un
 * choix de contrat conversationnel, pas un réglage.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAST_INTERACTION_SYSTEM_PROMPT } from '../workers/groq/src/index.js';
import { FAST_INTERACTION_TYPES } from '../workers/shared/fast-interactive-plane.js';
import { OPERATIONAL_REQUEST_ROLE_SEQUENCE } from '../workers/shared/operational-request-orchestrator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(root, 'atelier-prompts-v11.5-lot10g-decision-provider.html'), 'utf8');

/** Les types qui arrêtent le tour, lus dans le produit et non redéclarés ici. */
const SOLLICITANTS = (() => {
  const i = HTML.indexOf('const FAST_SOLICITING_TYPES=Object.freeze([');
  assert.notEqual(i, -1, 'FAST_SOLICITING_TYPES introuvable');
  const bloc = HTML.slice(i, HTML.indexOf(']);', i));
  return bloc.match(/'([A-Z_]+)'/g).map((s) => s.replace(/'/g, ''));
})();

test('T-03A-01 : le court-circuit ne s’arme que sur une sollicitation', () => {
  assert.deepEqual(SOLLICITANTS, ['ASK_CLARIFICATION', 'ASK_CONFIRMATION'],
    'ce sont les deux seuls types qui évitent le plan profond');
  /* Et c'est bien cette liste que le tour consulte pour ne PAS escalader. */
  const i = HTML.indexOf('if(projected&&FAST_SOLICITING_TYPES.indexOf(projected.type)!==-1){');
  assert.notEqual(i, -1, 'la condition d’arrêt du tour doit rester adossée à cette liste');
  assert.match(HTML.slice(i, i + 400), /deep_not_started/,
    'et marquer explicitement que le plan profond n’a pas démarré');
});

test('T-03A-02 [CARACTÉRISATION — ANOMALIE ATTENDUE À ÉVOLUER] le plan rapide est instruit de ne pas demander', () => {
  /* C'est la cause mesurée : on demande au plan rapide d'éviter la question, alors que la question
     est la SEULE chose qui évite deux minutes de plan profond. Les deux artefacts se contredisent. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /dernier recours, jamais le premier/,
    'CURRENT_BEHAVIOR : la consigne décourage explicitement la question');
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /n'appelle pas automatiquement une question/,
    'CURRENT_BEHAVIOR : et rappelle six voies alternatives avant elle');
  /* Mesuré : ACKNOWLEDGE 6/6, donc escalade 6/6. Ce test échouera le jour où la consigne changera,
     et c'est le signal attendu. */
  assert.equal(SOLLICITANTS.includes('ACKNOWLEDGE'), false,
    'ACKNOWLEDGE n’arrête pas le tour : la consigne et le court-circuit sont incompatibles');
});

test('T-03A-03 : le plan rapide peut proposer des types que le contrat ne connaît pas', () => {
  /* Établi au lot 1D-M : le CDC §7 n'autorise que ASK_ONE_QUESTION, CONTINUE_WITH_DEEP_VALIDATION
     et TECHNICAL_STOP. La consigne en propose deux de plus, dont celui qui est revenu 6/6. */
  for (const hors of ['ACKNOWLEDGE', 'ORIENT_ARCHITECTE']) {
    assert.ok(FAST_INTERACTION_TYPES.includes(hors), `${hors} existe dans l’implémentation`);
    assert.match(FAST_INTERACTION_SYSTEM_PROMPT, new RegExp(hors),
      `CURRENT_BEHAVIOR : ${hors} est proposé au modèle`);
    assert.equal(SOLLICITANTS.includes(hors), false, `${hors} conduit à l’escalade`);
  }
});

test('T-03A-04 : le coût du plan profond est structurel — trois rôles, séquentiels, inconditionnels', () => {
  assert.deepEqual([...OPERATIONAL_REQUEST_ROLE_SEQUENCE], ['analyst', 'critic', 'arbiter'],
    'mesuré : /analyst seul = 27,6 s ; les trois = 116 à 123 s');
  const src = fs.readFileSync(path.join(root, 'workers/shared/operational-request-orchestrator.js'), 'utf8');
  const i = src.indexOf('for (const role of OPERATIONAL_REQUEST_ROLE_SEQUENCE) {');
  assert.notEqual(i, -1, 'la boucle de rôles doit rester identifiable');
  const boucle = src.slice(i, i + 3000);
  assert.match(boucle, /await executeRole\(/,
    'chaque rôle est attendu avant le suivant : aucune parallélisation possible, critic dépend d’analyst');
  assert.equal(/if\s*\([^)]*\)\s*continue\s*;/.test(boucle.slice(0, 200)), false,
    'aucun rôle n’est sauté : la séquence est inconditionnelle');
});

test('T-03A-05 : un tour n’ouvre qu’une requête profonde — aucun double appel OPRIE', () => {
  /* Le compte d'appels est la grandeur à protéger : 1 rapide + au plus 1 profond par tour. */
  const i = HTML.indexOf('async function oprieRunTurn(');
  /* Bornes concrètes et uniques : les méta-tests exigent que chaque tranche mesure une région
     réellement présente dans le produit, jamais un motif générique. */
  const corps = HTML.slice(i, HTML.indexOf('function v11SwitchToArchitecteFromRapid(decision){', i));
  const profonds = (corps.match(/oprieRequestTurn\(/g) || []).length;
  const rapides = (corps.match(/oprieStartFastPlane\(/g) || []).length;
  assert.equal(profonds, 1, 'une seule ouverture du plan profond dans le tour');
  assert.equal(rapides, 1, 'un seul appel au plan rapide dans le tour');
  assert.match(corps, /if\(oprieState\.running\)return false/,
    'et un tour déjà en cours refuse une seconde entrée');
});
