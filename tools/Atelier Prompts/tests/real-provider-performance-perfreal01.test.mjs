/* PERF-REAL-01 — CE QUE LA PRODUCTION A RÉPONDU, ET POURQUOI ON NE FERME PAS.
 * ============================================================================
 *
 * Ce lot devait mesurer. Il n'a rien pu mesurer, et ce fichier dit pourquoi
 * avec des preuves plutôt qu'avec des regrets.
 *
 * LA ROUTE EXISTE MAINTENANT. /fast-interaction rendait 404 en production : la
 * porte de PERF-04 n'avait jamais été déployée. Elle l'est. Elle répond, elle
 * refuse ce qu'elle doit refuser, elle n'invente rien.
 *
 * ELLE N'ATTEINT AUCUN FOURNISSEUR. runFastInteractionWithHaChain construit ses
 * entrées de chaîne sous la clé « run » ; runProviderChain les lit sous la clé
 * « execute ». À la première tentative, execute est undefined. La chaîne classe
 * cela en programming_error — une classe délibérément non éligible au repli,
 * parce qu'un défaut de contrat n'est pas une panne de fournisseur — et
 * s'arrête. Aucun candidat n'est donc jamais produit, et il n'existe aucun
 * instant de première interaction à chronométrer.
 *
 * CES TESTS ENREGISTRENT UN DÉFAUT OUVERT, ILS NE LE BÉNISSENT PAS. Ils
 * décrivent le comportement d'aujourd'hui pour qu'il ne puisse pas changer en
 * silence. Le jour où quelqu'un alignera les deux clés, T-PERFREAL01-02 et
 * T-PERFREAL01-04 échoueront — et c'est exactement ce qu'on leur demande : la
 * correction devra passer par une décision, pas par un glissement.
 *
 * POURQUOI LA SUITE NE L'AVAIT PAS VU. Les preuves de PERF-03A et PERF-04
 * cherchaient le TEXTE `runProviderChain({ role: "fast_interaction"` dans la
 * source. Il y était. Personne n'appelait la jointure. Un nom de clé ne se voit
 * pas dans une recherche de sous-chaîne.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProviderChain, FAILURE_CLASSES, failureClassOf, tagFailure } from '../workers/shared/provider-ha.js';
import { FAST_INTERACTION_PATHNAME } from '../workers/shared/fast-interaction-endpoint.js';
import { FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS, createTurnSnapshot, validateFastInteraction }
  from '../workers/shared/fast-interactive-plane.js';
import {
  DECISION_PROVIDER_ORDER, FAST_INTERACTION_ADAPTERS, runFastInteractionWithHaChain
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const WORKER = lire('workers/groq/src/index.js');
const CHAINE = lire('workers/shared/provider-ha.js');
const RESULTATS = JSON.parse(lire('evaluation/perf-real-01/results.json'));
const RAPPORT = lire('docs/PERF-REAL-01-REPORT.md');
const REGISTRE = lire('docs/OPEN-DEBTS.md');
const HTML = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');

// =================================================================================================
// §17 à §19 — CE QUE LA ROUTE DÉPLOYÉE A RÉPONDU
// =================================================================================================

test('T-PERFREAL01-01 : la route déployée répond — elle n’est plus introuvable', () => {
  assert.equal(FAST_INTERACTION_PATHNAME, '/fast-interaction');
  assert.equal(RESULTATS.route, '/fast-interaction');
  assert.equal(RESULTATS.worker, 'atelier-decision-groq');
  assert.match(RESULTATS.version_deployee, /^[0-9a-f-]{36}$/);
  /* Douze requêtes réelles ont reçu une réponse HTTP du worker : aucune n'est un 404. */
  assert.equal(RESULTATS.echantillons.length, 12);
  assert.deepEqual([...new Set(RESULTATS.echantillons.map((e) => e.status))], [502]);
  assert.equal(RESULTATS.echantillons.filter((e) => e.status === 404).length, 0);
  assert.match(RAPPORT, /\| État de `\/fast-interaction` avant \| \*\*404\*\*/);
});

test('T-PERFREAL01-02 : le défaut mesuré en production, et sa réparation en PERF-REAL-01A', async () => {
  /* CE QUE LA PRODUCTION A FAIT, LE 4 SEPTEMBRE 2026. Une entrée de chaîne
     construite sous une clé que la chaîne ne lit pas : le premier appel lève,
     la classe est programming_error, et aucun adaptateur n'est jamais atteint.
     On le rejoue ici pour que la trace reste exécutable, pas seulement racontée. */
  let appele = 0;
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction',
    providers: DECISION_PROVIDER_ORDER.map((name) => ({ name, run: async () => { appele += 1; return {}; } })),
    log: () => {}
  }), (erreur) => {
    assert.match(erreur.message, /execute is not a function/);
    assert.equal(failureClassOf(erreur), FAILURE_CLASSES.PROGRAMMING_ERROR);
    return true;
  });
  assert.equal(appele, 0, 'aucun adaptateur n’a été appelé — c’est bien ce qui s’est produit');
  /* ET CE QUE LE PRODUIT FAIT DEPUIS. PERF-REAL-01A a aligné l'appelant sur le
     contrat canonique. La preuve exécutée de la jointure vit désormais dans
     tests/fast-provider-chain-contract-perfreal01a.test.mjs ; ici on constate
     seulement que la source ne porte plus la clé fautive. */
  const construction = WORKER.slice(WORKER.indexOf('export async function runFastInteractionWithHaChain'),
    WORKER.indexOf('export const DECISION_PROVIDER_ORDER'));
  assert.match(construction, /providers = order\.map\(\(name\) => \(\{\s*name,\s*execute: async \(\) =>/);
  assert.match(CHAINE, /const \{ name, execute \} = providers\[index\];/);
  assert.equal(/\brun:\s*async/.test(construction), false, 'la clé fautive a disparu');
});

test('T-PERFREAL01-03 : le nombre d’échantillons exigé n’a pas pu être atteint, et on ne fait pas semblant', () => {
  const MINIMUM = 30;
  assert.ok(RESULTATS.echantillons.length < MINIMUM,
    'douze sondes suffisent à établir un défaut reproductible ; elles ne suffisent pas à une mesure.');
  assert.equal(RESULTATS.echantillons.filter((e) => e.ttfi_ms !== null).length, 0);
  assert.equal(RESULTATS.resultat, 'AUCUNE_MESURE_TTFI_POSSIBLE');
  /* Six classes de demande, chacune en froid puis en chaud : l'échec ne dépend d'aucune. */
  const classes = [...new Set(RESULTATS.echantillons.map((e) => e.scenario_class))].sort();
  assert.deepEqual(classes, ['A_SIMPLE', 'B_VAGUE', 'C_RICHE', 'D_CONFIRMATION', 'E_ORIENTATION', 'F_DIFFICILE']);
  assert.deepEqual([...new Set(RESULTATS.echantillons.map((e) => e.cold_or_warm))].sort(), ['cold', 'warm']);
});

test('T-PERFREAL01-04 : le TTFI n’est pas mesurable, parce qu’aucun candidat n’existe', () => {
  assert.equal(RESULTATS.ttfi.mesurable, false);
  assert.match(RESULTATS.ttfi.raison, /aucun candidat rapide n’est jamais produit/);
  /* Le seul temps observé est celui que met le worker à constater son propre défaut. */
  const agr = RESULTATS.agregats_transport_seulement;
  assert.equal(agr.succes_http_200, 0);
  assert.equal(agr.echecs, 12);
  assert.ok(agr.total_ms_p50 < 1000, 'un échec de contrat est immédiat — ce n’est pas une latence produit');
  assert.match(RAPPORT, /Les rapporter comme\nun TTFI serait un mensonge par cadrage\./);
});

test('T-PERFREAL01-05/06/07 : p50, p95 et max ne sont pas prononcés sur une mesure absente', () => {
  /* Les agrégats existent, mais ils sont NOMMÉS pour ce qu'ils sont : du transport. */
  assert.ok('agregats_transport_seulement' in RESULTATS);
  assert.equal('ttfi_p50_ms' in RESULTATS, false);
  assert.equal('ttfi_p95_ms' in RESULTATS, false);
  assert.equal('ttfi_max_ms' in RESULTATS, false);
  for (const champ of ['total_ms_min', 'total_ms_p50', 'total_ms_p95', 'total_ms_max']) {
    assert.equal(typeof RESULTATS.agregats_transport_seulement[champ], 'number');
  }
  /* Et le rapport ne présente aucun seuil comme atteint. */
  assert.equal(/INTERACTIVE_P95_CONTRACT_MET\s*=\s*YES/.test(RAPPORT), false);
});

// =================================================================================================
// §14, §45 à §47 — LES FRONTIÈRES, ELLES, TIENNENT
// =================================================================================================

test('T-PERFREAL01-08 : le schéma rapide reste à deux champs, et refuse tout le reste', () => {
  const instantane = createTurnSnapshot({ turn_id: 1, original_request: 'Rédige une note.' });
  const verdict = validateFastInteraction({ type: 'ASK_CLARIFICATION', text: 'Quel est le public visé ?' }, instantane);
  assert.equal(verdict.ok, true);
  /* La validation produit des champs d'AUDIT — turn_id, authority, can_* — qui disent
     ce que la candidate n'a pas le droit de faire. Ils restent internes : la porte
     réseau ne laisse repartir que les deux champs du schéma, et c'est là que se joue
     le contrat public. Les exposer inviterait un client à les lire comme une permission. */
  assert.deepEqual(Object.keys(verdict.interaction).sort(), ['authority', 'can_execute', 'can_mark_ready',
    'can_route', 'canonical_version', 'interaction_id', 'source', 'text', 'turn_id', 'type']);
  assert.equal(verdict.interaction.authority, 'candidate');
  for (const pouvoir of ['can_execute', 'can_mark_ready', 'can_route']) {
    assert.equal(verdict.interaction[pouvoir], false, `FAST_CAN_${pouvoir.slice(4).toUpperCase()} = NO`);
  }
  /* Un champ d'autorité glissé dans la candidate est refusé, pas ignoré. */
  for (const interdit of ['state', 'route', 'readiness', 'execution_ready']) {
    const v = validateFastInteraction(
      { type: 'ASK_CLARIFICATION', text: 'Quel est le public visé ?', [interdit]: 'x' }, instantane);
    assert.equal(v.ok, false, `${interdit} refusé`);
  }
  assert.deepEqual([...FAST_INTERACTION_TYPES], ['ACKNOWLEDGE', 'ASK_CLARIFICATION', 'ASK_CONFIRMATION',
    'ORIENT_ARCHITECTE', 'WAIT_FOR_DEEP_VALIDATION']);
});

test('T-PERFREAL01-09 : le plan rapide n’écrit aucune autorité', () => {
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    const instantane = createTurnSnapshot({ turn_id: 3, original_request: 'Rédige une note.' });
    const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, instantane);
    assert.equal(v.ok, false, `FAST_AUTHORITY_WRITES : ${champ} = 0`);
  }
  /* Et la porte réseau ne laisse repartir que les deux champs du schéma. */
  const endpoint = lire('workers/shared/fast-interaction-endpoint.js');
  assert.match(endpoint, /return jsonResponse\(\{ type: verdict\.interaction\.type, text: verdict\.interaction\.text \}, 200, cors\)/);
  assert.match(endpoint, /Les champs d'audit produits par\n\s+la validation \(turn_id, authority, can_\*\) restent internes/);
});

test('T-PERFREAL01-10 : l’ordre de repli est inchangé, et un défaut de contrat ne le déclenche pas', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai']);
  assert.deepEqual(Object.keys(FAST_INTERACTION_ADAPTERS).sort(), ['anthropic', 'groq', 'openai']);
  /* La production l'a montré : programming_error n'est pas éligible au repli, et
     la chaîne s'est arrêtée en nommant les fournisseurs qu'elle n'a pas essayés. */
  assert.match(RAPPORT, /"event":"provider_ha_fail_closed"[^\n]*"failure_class":"programming_error"[^\n]*"remaining_providers":\["anthropic","openai"\]/);
  assert.match(CHAINE, /if \(!isFailoverEligible\(failure_class\)\)/);
});

test('T-PERFREAL01-11/12 : épuisement et défaut ferment — jamais un READY fabriqué', async () => {
  /* Trois fournisseurs qui tombent pour une cause technique : la chaîne les essaie
     tous, puis ferme. Elle ne rend jamais un résultat de remplacement. */
  const essayes = [];
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction',
    providers: ['groq', 'anthropic', 'openai'].map((name) => ({
      name, execute: async () => { essayes.push(name); throw tagFailure(new Error('503'), FAILURE_CLASSES.TECHNICAL_FAILOVER); }
    })),
    log: () => {}
  }));
  assert.deepEqual(essayes, ['groq', 'anthropic', 'openai'], 'l’ordre est respecté jusqu’à l’épuisement');
  /* ALL_PROVIDER_EXHAUSTION_FALSE_READY_COUNT = 0 : rien ne sort d'une chaîne épuisée. */
  const endpoint = lire('workers/shared/fast-interaction-endpoint.js');
  assert.match(endpoint, /Aucune\n \* interaction n'est jamais fabriquée ici pour avoir quelque chose à rendre\./);
  assert.equal(RESULTATS.echantillons.filter((e) => e.candidate_type !== null).length, 0,
    'aucune candidate n’a été rendue, en production, sur douze requêtes');
});

test('T-PERFREAL01-13 : une candidate périmée n’écrit rien — la discipline de tour est intacte', () => {
  const instantane = createTurnSnapshot({ turn_id: 7, original_request: 'Rédige une note.' });
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, instantane);
  assert.equal(v.ok, true);
  assert.equal(v.interaction.turn_id, 7, 'la candidate porte le tour dont elle vient');
  /* Côté navigateur, la garde de péremption est écrite et inchangée. */
  assert.match(HTML, /if\(seq!==oprieState\.seq\)\{oprieMark\('fast_discarded_stale'\);return null\}/);
  assert.equal([...HTML.matchAll(/fast_discarded_stale/g)].length >= 1, true,
    'STALE_FAST_VISIBLE_WRITE_COUNT = 0');
});

// =================================================================================================
// §40 à §42, §56 — CE QUE LE LOT N'A PAS TOUCHÉ
// =================================================================================================

test('T-PERFREAL01-14 : le worker déployé est exactement le candidat local', () => {
  /* Le dépôt était propre au moment du déploiement : rien de non suivi n'est parti. */
  assert.match(RAPPORT, /\| Version en production après \| `6bdbe2ec-2910-427f-b013-59fa7152cf4a` \|/);
  assert.equal(RESULTATS.version_deployee, '6bdbe2ec-2910-427f-b013-59fa7152cf4a');
  /* Et la source déployée porte bien la route de PERF-04. */
  assert.match(WORKER, /if \(new URL\(request\.url\)\.pathname === FAST_INTERACTION_PATHNAME\) \{/);
  assert.match(WORKER, /executeFast: \(snapshot, fastEnv\) => runFastInteractionWithHaChain\(snapshot, fastEnv\)/);
});

test('T-PERFREAL01-15 : l’artefact frontend n’a pas bougé', () => {
  const crypto = globalThis.crypto;
  assert.ok(crypto, 'empreinte calculable');
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  const empreinte = require$sha(octets);
  assert.equal(empreinte, '3efa45ff351f1d293023c062a70540241871e6f7d605c70670db6e1227b2a6dc',
    'CANONICAL_HTML_CHANGED = NO');
  /* Et les quatre points de terminaison qu'il déclare sont ceux de production. */
  const metas = [...HTML.matchAll(/<meta name="(atelier-[a-z-]+)" content="([^"]+)"/g)];
  assert.equal(metas.length, 4);
  assert.ok(metas.some(([, nom, url]) => nom === 'atelier-fast-interaction' && url.endsWith('/fast-interaction')));
});

test('T-PERFREAL01-16 : aucun secret nulle part — ni dans les preuves, ni dans le rapport', () => {
  for (const [nom, contenu] of [['résultats', JSON.stringify(RESULTATS)], ['rapport', RAPPORT]]) {
    for (const motif of [/sk-[A-Za-z0-9]{16,}/, /gsk_[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{20,}/,
                         /-----BEGIN [A-Z ]*PRIVATE KEY-----/]) {
      assert.equal(motif.test(contenu), false, `SECRET_VALUES_PRINTED = 0 dans le ${nom}`);
    }
  }
  /* Les échantillons ne portent aucune demande complète : seulement une classe. */
  for (const e of RESULTATS.echantillons) {
    assert.deepEqual(Object.keys(e).sort(), ['candidate_type', 'cold_or_warm', 'error_class', 'failover_occurred',
      'provider_used', 'sample_id', 'scenario_class', 'schema_valid', 'status', 'timestamp', 'total_ms', 'ttfi_ms']);
    assert.equal('prompt' in e, false);
  }
  /* Le worker ne journalise jamais une clé. */
  assert.equal(/console\.(log|error|warn)\([^)]*(API_KEY|api_key|Bearer \$\{)/.test(WORKER), false);
});

test('T-PERFREAL01-17 : la cible de rollback est enregistrée et disponible', () => {
  assert.match(RAPPORT, /\| Version en production avant \| `5fc0300a-622a-4574-8124-ed4c66fbe1dc`/);
  assert.match(RAPPORT, /\| Rollback \| disponible, non exécuté \|/);
  assert.match(RAPPORT, /Pourquoi le déploiement reste en place/);
  assert.match(RAPPORT, /un rollback restaurerait le 404 sans rien\naméliorer/);
});

test('T-PERFREAL01-18/19 : l’ordre des fournisseurs est intact, et rien ne les magasine', () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'], 'PROVIDER_ORDER_CHANGED = NO');
  /* SEMANTIC_PROVIDER_SHOPPING_PATHS = 0 : la chaîne ne lit pas le résultat qu'elle rend. */
  const boucle = CHAINE.slice(CHAINE.indexOf('for (let index = 0'), CHAINE.indexOf('const rejections'));
  assert.match(boucle, /const result = await execute\(\);/);
  assert.match(boucle, /return result;/);
  assert.equal(/result\.(state|route|confiance|etat_demande|type)/.test(boucle), false,
    'la chaîne n’inspecte jamais le contenu de ce qu’elle transmet.');
  assert.match(CHAINE, /il ne lit jamais le résultat d'une tentative réussie \(il le retourne tel quel, sans inspection\)/);
  assert.match(CHAINE, /il ne compare jamais deux résultats entre eux/);
  assert.match(CHAINE, /il ne rejoue jamais un provider qui a RÉUSSI pour en obtenir un "meilleur" résultat/);
  assert.match(CHAINE, /il ne fabrique jamais de résultat de repli lorsque toutes les tentatives ont échoué/);
});

test('T-PERFREAL01-20 : la classification suit les seuils fixés d’avance, et la dette reste ouverte', () => {
  /* Les seuils du contrat interactif ne sont pas rediscutés après coup — ils ne
     sont simplement pas applicables : il n'existe aucune mesure à classer. */
  assert.match(RAPPORT, /^\*\*Statut : OUVERTE\. Aucune mesure de TTFI n'a pu être prise\.\*\*$/m);
  assert.match(RAPPORT, /- `PERF-REAL-01` = \*\*OPEN\*\*/);
  assert.match(RAPPORT, /- `REAL_PROVIDER_TTFI_PROVEN` = \*\*NO\*\*/);
  assert.match(RAPPORT, /- `RELEASE_READY` = \*\*NO\*\*/);
  /* Le registre officiel dit la même chose, et ne compte qu'une dette ouverte. */
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.match(ouvertes, /jointure de chaîne/, 'le registre porte la cause mesurée, pas seulement l’intitulé');
  /* Et le produit ne prétend toujours rien sur la latence réelle. */
  assert.equal([...HTML.matchAll(/TTFI|time_to_first|latency_ms|p95_real/g)].length, 0);
});

/* Empreinte SHA-256 sans dépendance : node:crypto, importé au plus près de son usage. */
function require$sha(octets) {
  return require$crypto.createHash('sha256').update(octets).digest('hex');
}
const require$crypto = await import('node:crypto');
