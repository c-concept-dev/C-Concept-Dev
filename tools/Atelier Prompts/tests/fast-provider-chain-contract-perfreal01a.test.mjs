/* PERF-REAL-01A — UN MOT, ET LE PLAN RAPIDE ATTEINT ENFIN UN FOURNISSEUR.
 * ============================================================================
 *
 * PERF-REAL-01 n'a rien pu mesurer : `runFastInteractionWithHaChain` construisait
 * ses entrées de chaîne sous la clé `run`, tandis que `runProviderChain` les lit
 * sous `execute`. Le premier appel levait « execute is not a function », classé
 * programming_error — délibérément non éligible au repli, parce qu'un défaut de
 * contrat n'est pas une panne de fournisseur. La chaîne s'arrêtait avant Groq.
 *
 * CE LOT NE FAIT QUE CELA : renommer la clé. Les deux autres appelants de la
 * chaîne — décision, rôles — employaient déjà `execute` ; c'est le contrat
 * canonique, et c'est l'appelant fautif qui s'y conforme. Aucun alias de
 * compatibilité n'est ajouté : deux noms pour une même chose recréeraient
 * exactement l'ambiguïté qui a coûté ce silence.
 *
 * ET SURTOUT, IL CHANGE LA NATURE DE LA PREUVE. Ce qui avait manqué n'était pas
 * un test de plus, c'était un test qui EXÉCUTE. Les preuves de PERF-03A et
 * PERF-04 cherchaient le texte `runProviderChain({ role: "fast_interaction"`
 * dans la source ; il y était, et le produit ne fonctionnait pas. Ici, la
 * jointure est appelée pour de bon, avec des adaptateurs sous contrôle : un nom
 * de clé faux ne peut plus passer.
 *
 * CE FICHIER NE MESURE PAS. Six appels réels ne sont pas un échantillon.
 * PERF-REAL-01 reste ouverte, et aucun p95 n'est prononcé ici.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  runProviderChain, FAILURE_CLASSES, FAILOVER_ELIGIBLE_CLASSES, failureClassOf, tagFailure, isFailoverEligible
} from '../workers/shared/provider-ha.js';
import { createTurnSnapshot, validateFastInteraction, FAST_INTERACTION_TYPES, FAST_FORBIDDEN_AUTHORITY_FIELDS }
  from '../workers/shared/fast-interactive-plane.js';
import {
  DECISION_PROVIDER_ORDER,
  FAST_PROVIDER_ORDER, FAST_INTERACTION_ADAPTERS, runFastInteractionWithHaChain
} from '../workers/groq/src/index.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const WORKER = lire('workers/groq/src/index.js');
const CHAINE = lire('workers/shared/provider-ha.js');
const SMOKE = JSON.parse(lire('evaluation/perf-real-01/smoke-01a.json'));
const RAPPORT = lire('docs/PERF-REAL-01-REPORT.md');
const REGISTRE = lire('docs/OPEN-DEBTS.md');
const JOINTURE = WORKER.slice(WORKER.indexOf('export async function runFastInteractionWithHaChain'),
  WORKER.indexOf('export const DECISION_PROVIDER_ORDER'));
const instantane = () => createTurnSnapshot({ turn_id: 1, original_request: 'Explique la photosynthèse en trois phrases.' });

// =================================================================================================
// §3 à §6 — LA CAUSE, LE CONTRAT, LA CORRECTION
// =================================================================================================

test('T-PERFREAL01A-01 : la panne d’origine se rejoue encore, à l’identique', async () => {
  /* Une entrée construite sous une clé que la chaîne ne lit pas : premier appel,
     première levée, aucun adaptateur atteint. C'est ce que la production a fait. */
  let atteints = 0;
  await assert.rejects(() => runProviderChain({
    role: 'fast_interaction',
    providers: DECISION_PROVIDER_ORDER.map((name) => ({ name, run: async () => { atteints += 1; return {}; } })),
    log: () => {}
  }), (erreur) => {
    assert.match(erreur.message, /execute is not a function/);
    assert.equal(failureClassOf(erreur), FAILURE_CLASSES.PROGRAMMING_ERROR);
    return true;
  });
  assert.equal(atteints, 0, 'la chaîne s’arrête avant le premier fournisseur');
});

test('T-PERFREAL01A-02 : l’adaptateur rapide emploie le contrat canonique', () => {
  assert.match(CHAINE, /const \{ name, execute \} = providers\[index\];/,
    'PROVIDER_CHAIN_ENTRY_EXECUTOR_FIELD = execute');
  assert.match(CHAINE, /const result = await execute\(\);/);
  assert.match(JOINTURE, /providers = order\.map\(\(name\) => \(\{\s*name,\s*execute: async \(\) =>/,
    'FAST_ADAPTER_FIELD_AFTER = execute');
  /* Le contrat est canonique parce que TOUS les appelants l'emploient, pas parce
     qu'on l'a décrété : décision et rôles le faisaient déjà avant ce lot. */
  assert.equal((WORKER.match(/runProviderChain\(\{/g) || []).length, 3, 'trois appelants, une seule chaîne');
  assert.match(WORKER, /return runProviderChain\(\{ role: "fast_interaction", providers/);
  assert.match(WORKER, /execute: \(\) => DECISION_ADAPTERS\[name\]/, 'la décision emploie execute');
  assert.match(WORKER, /execute: isCritic/, 'les rôles emploient execute');
  assert.equal((WORKER.match(/^\s*execute:/gm) || []).length, 3, 'trois constructions, un seul nom de champ');
});

test('T-PERFREAL01A-03 : la jointure, EXÉCUTÉE, entre réellement dans les trois adaptateurs', async () => {
  /* LA PREUVE QUI MANQUAIT. On n'inspecte pas du texte : on appelle la fonction du
     produit, sans aucune clé configurée, et on lit qui a été essayé.
     `config_unavailable` n'est produite qu'à L'INTÉRIEUR d'un adaptateur, par le
     `tagFailure` qui constate le secret absent — la chaîne, elle, ne sait pas
     fabriquer cette classe. Voir les trois y figurer prouve donc que le corps des
     trois adaptateurs a été atteint. Avec la clé fautive, `attempts` ne contenait
     qu'une entrée, en programming_error, produite par la chaîne elle-même. */
  /* FAST-CAPACITY-ADMISSION-01 — L'ORDRE PAR DÉFAUT DU PLAN RAPIDE EST DEVENU
     ["groq"], parce que les deux autres fournisseurs échouent le contrat interactif
     même au repos. La JOINTURE, elle, n'a pas changé d'un octet : c'est elle que
     cette preuve garde, et on la lui fait traverser en passant l'ordre explicitement.
     Le défaut de production est vérifié séparément, en T-PERFREAL01A-06. */
  const erreur = await runFastInteractionWithHaChain(instantane(), {},
    { order: ['groq', 'anthropic', 'openai'], log: () => {} })
    .then(() => null, (e) => e);
  assert.ok(erreur, 'sans clé, la chaîne finit par fermer');
  assert.equal(erreur.name, 'ProviderChainError');
  assert.deepEqual(erreur.attempts, [
    { provider: 'groq', failure_class: 'config_unavailable' },
    { provider: 'anthropic', failure_class: 'config_unavailable' },
    { provider: 'openai', failure_class: 'config_unavailable' }
  ], 'EXECUTED_FAST_PROVIDER_JOIN_PROOF = YES');
  assert.equal(erreur.all_providers_failed, true);
  assert.equal(erreur.attempts.some((a) => a.failure_class === 'programming_error'), false);
  /* Et la clé fautive, si elle revenait, se verrait immédiatement ici : une seule
     tentative, classée par la chaîne et non par l'adaptateur. */
  assert.equal(FAST_INTERACTION_ADAPTERS.groq.length >= 1, true, 'les adaptateurs restent des fonctions');
});

test('T-PERFREAL01A-04 : aucun alias de compatibilité entre run et execute', () => {
  assert.equal(/\brun:\s*(async\s*)?\(/.test(JOINTURE), false, 'la clé fautive a disparu');
  /* La chaîne ne lit qu'un champ, et n'en accepte aucun autre en repli. */
  assert.equal(/providers\[index\]\.run\b/.test(CHAINE), false);
  assert.equal(/\.execute\s*\|\|\s*[a-z]/.test(CHAINE), false, 'SHADOW_EXECUTOR_ALIAS_COUNT = 0');
  assert.equal(/execute\s*=\s*[a-z]+\.run\b/.test(CHAINE), false);
  /* Et une entrée sans execute échoue franchement, elle n'est pas rattrapée. */
  return assert.rejects(() => runProviderChain({
    role: 'fast_interaction', providers: [{ name: 'groq', runner: async () => ({}) }], log: () => {}
  }), /execute is not a function/);
});

// =================================================================================================
// §7 à §9 — CE QUE LA CORRECTION N'A PAS DÉPLACÉ
// =================================================================================================

test('T-PERFREAL01A-05 : programming_error reste hors du repli', () => {
  assert.equal(isFailoverEligible(FAILURE_CLASSES.PROGRAMMING_ERROR), false,
    'PROGRAMMING_ERROR_FAILOVER_ELIGIBLE = NO');
  assert.deepEqual([...FAILOVER_ELIGIBLE_CLASSES], [
    FAILURE_CLASSES.TECHNICAL_RETRYABLE, FAILURE_CLASSES.TECHNICAL_FAILOVER,
    FAILURE_CLASSES.CONFIG_UNAVAILABLE, FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID,
    FAILURE_CLASSES.REQUEST_REJECTED
  ], 'la liste d’éligibilité est inchangée — le bug n’a pas été masqué en l’élargissant');
  assert.equal(isFailoverEligible(FAILURE_CLASSES.SEMANTIC_VALID), false);
  assert.equal(isFailoverEligible(FAILURE_CLASSES.CONTRACT_ERROR), false);
});

test('T-PERFREAL01A-06 : l’ordre des fournisseurs est intact, et la chaîne le parcourt', async () => {
  assert.deepEqual([...DECISION_PROVIDER_ORDER], ['groq', 'anthropic', 'openai'],
    'PROVIDER_ORDER_CHANGED = NO');
  /* Sans aucune clé configurée, la jointure corrigée traverse maintenant les trois
     fournisseurs — chacun en config_unavailable — puis ferme. Avant, elle mourait au premier. */
  /* FAST-CAPACITY-ADMISSION-01 : le plan rapide a désormais son ordre PROPRE, réduit
     à Groq. DECISION_PROVIDER_ORDER — /decision et les trois rôles OPRIE — reste
     inchangé, et c'est ce que l'assertion ci-dessus continue de garder. */
  assert.deepEqual([...FAST_PROVIDER_ORDER], ['groq'],
    'le plan rapide ne bascule plus vers un fournisseur qui échoue son contrat');
  const journal = [];
  await assert.rejects(() => runFastInteractionWithHaChain(instantane(), {},
    { order: ['groq', 'anthropic', 'openai'], log: (e) => journal.push(e) }));
  const tentes = journal.filter((e) => e.event === 'provider_ha_attempt').map((e) => e.provider);
  assert.deepEqual(tentes, ['groq', 'anthropic', 'openai']);
  assert.deepEqual([...new Set(journal.filter((e) => e.event === 'provider_ha_failure').map((e) => e.failure_class))],
    ['config_unavailable']);
  assert.equal(journal.some((e) => e.event === 'provider_ha_exhausted'), true, 'puis elle ferme');
  assert.equal(journal.some((e) => e.failure_class === 'programming_error'), false,
    'FAST_JOIN_PROGRAMMING_ERROR_COUNT = 0');
});

test('T-PERFREAL01A-07 : le plan rapide reste candidat, sans aucune autorité', () => {
  const snap = instantane();
  for (const champ of FAST_FORBIDDEN_AUTHORITY_FIELDS) {
    const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.', [champ]: true }, snap);
    assert.equal(v.ok, false, `FAST_AUTHORITY_WRITES : ${champ} = 0`);
  }
  const v = validateFastInteraction({ type: 'ACKNOWLEDGE', text: 'Je regarde.' }, snap);
  assert.equal(v.interaction.can_mark_ready, false, 'FAST_CAN_FINALIZE_READY = NO');
  assert.equal(v.interaction.can_route, false, 'FAST_CAN_ROUTE = NO');
  assert.equal(v.interaction.can_execute, false, 'FAST_CAN_EXECUTE = NO');
  assert.equal(v.interaction.authority, 'candidate');
});

// =================================================================================================
// §15 à §18 — CE QUE LA PRODUCTION A RÉPONDU, POUR DE VRAI
// =================================================================================================

test('T-PERFREAL01A-08 : /decision n’a pas régressé', () => {
  assert.match(RAPPORT, /\| `\/decision` après réparation \| \*\*200\*\*/);
  /* La route de décision emploie la même chaîne, sous la même clé, depuis toujours. */
  assert.match(WORKER, /providers: order\.map\(\(name\) => \(\{\s*name,\s*execute: \(\) => DECISION_ADAPTERS\[name\]\(input, env, \{ contract \}\)/);
});

test('T-PERFREAL01A-09 : /fast-interaction atteint un vrai fournisseur', () => {
  assert.equal(SMOKE.resultat, 'BLOQUANT_LEVE');
  assert.equal(SMOKE.fournisseur_atteint, 'groq', 'FAST_PROVIDER_USED');
  assert.match(SMOKE.preuve_fournisseur, /provider_ha_success role=fast_interaction provider=groq attempt_index=0/);
  assert.equal(SMOKE.agregats_smoke_seulement.succes_http_200, 6, 'REAL_FAST_SMOKE_SUCCESS_COUNT = 6');
  assert.equal(SMOKE.echantillons.length, 6, 'REAL_FAST_SMOKE_COUNT = 6');
  assert.deepEqual([...new Set(SMOKE.echantillons.map((e) => e.status))], [200]);
  assert.deepEqual([...new Set(SMOKE.echantillons.map((e) => e.error_class))], [null]);
  assert.equal(SMOKE.version_deployee, '6ecc4c97-0d54-4c11-a32a-43e0ac802df9');
});

test('T-PERFREAL01A-10 : chaque réponse réelle respecte le schéma à deux champs', () => {
  const classes = SMOKE.echantillons.map((e) => e.scenario_class).sort();
  assert.deepEqual(classes, ['A_SIMPLE', 'B_VAGUE', 'C_RICHE', 'D_CONFIRMATION', 'E_ORIENTATION', 'F_DIFFICILE']);
  for (const e of SMOKE.echantillons) {
    assert.deepEqual(e.champs, ['text', 'type'], `${e.sample_id} : deux champs, pas un de plus`);
    assert.equal(e.deux_champs, true);
    assert.equal(e.texte_non_vide, true);
    assert.ok(FAST_INTERACTION_TYPES.includes(e.candidate_type), `${e.sample_id} : type ${e.candidate_type} autorisé`);
  }
  assert.equal(SMOKE.agregats_smoke_seulement.schema_deux_champs, 6, 'FAST_SCHEMA_VALID = YES');
  /* Aucune réponse ne porte de champ d'autorité : le schéma ne peut pas en transporter. */
  for (const e of SMOKE.echantillons) {
    for (const interdit of FAST_FORBIDDEN_AUTHORITY_FIELDS) assert.equal(e.champs.includes(interdit), false);
  }
});

test('T-PERFREAL01A-11 : plus aucune erreur de jointure, ni en local ni en production', () => {
  assert.equal(SMOKE.echantillons.filter((e) => e.error_class === 'fast_interaction_failure').length, 0);
  assert.equal(SMOKE.agregats_smoke_seulement.succes_http_200, SMOKE.echantillons.length);
  /* Et le rapport porte la cause identifiée, résolue, avec son déploiement. */
  assert.match(RAPPORT, /BLOCKER\s*=\s*RESOLVED/);
  assert.match(RAPPORT, /ROOT_CAUSE\s*=\s*run \/ execute contract mismatch/);
  assert.match(RAPPORT, /REPAIR_DEPLOYMENT_ID\s*=\s*6ecc4c97-0d54-4c11-a32a-43e0ac802df9/);
  assert.match(RAPPORT, /REAL_FAST_PROVIDER_SMOKE\s*=\s*PASS/);
});

// =================================================================================================
// §19, §25 — LES LIMITES QUE CE LOT NE FRANCHIT PAS
// =================================================================================================

test('T-PERFREAL01A-12 : l’artefact frontend n’a pas bougé', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '6be95369eaf3611bc72b7d5d7972ffbb6a1f19c8901355c58da171b4274eccde', 'CANONICAL_HTML_CHANGED = NO');
});

test('T-PERFREAL01A-13 : le worker déployé est le candidat local, et il est traçable', () => {
  assert.equal(SMOKE.version_precedente, '6bdbe2ec-2910-427f-b013-59fa7152cf4a');
  assert.equal(SMOKE.version_deployee, '6ecc4c97-0d54-4c11-a32a-43e0ac802df9');
  assert.equal(SMOKE.worker, 'atelier-decision-groq');
  /* La source locale porte bien la correction qui a été envoyée. */
  assert.match(JOINTURE, /execute: async \(\) => \{/);
  assert.match(WORKER, /PERF-REAL-01A — LE CHAMP S'APPELLE `execute`, ET C'EST TOUT CE QUI A CHANGÉ\./);
});

test('T-PERFREAL01A-14 : PERF-REAL-01 reste ouverte — six appels ne sont pas une mesure', () => {
  assert.equal(SMOKE.benchmark_officiel_effectue, false, 'OFFICIAL_TTFI_BENCHMARK_PERFORMED = NO');
  assert.match(SMOKE.avertissement, /six appels ne sont pas une mesure/);
  assert.equal(SMOKE.echantillons.length < 30, true);
  /* Aucun agrégat n'est nommé p50 ou p95 : ce fichier ne prononce pas de verdict. */
  const noms = Object.keys(SMOKE.agregats_smoke_seulement);
  assert.deepEqual(noms.filter((n) => /p50|p95/.test(n)), []);
  /* Le registre officiel compte toujours une dette ouverte, et c'est celle-là. */
  const ouvertes = REGISTRE.slice(REGISTRE.indexOf('## Ouvertes'), REGISTRE.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.match(ouvertes, /le bloquant est levé/);
  assert.match(RAPPORT, /- `PERF-REAL-01` = \*\*OPEN\*\*/);
});
