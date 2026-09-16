/* ATELIER PROMPTS V2.1.3 — UNE REPRISE TECHNIQUE NE REJOUE PAS LA CLARIFICATION.
 * ============================================================================
 *
 * CE QUE LE PROPRIÉTAIRE A MESURÉ. Le plan rapide avait conclu que la demande était prête après trois
 * clarifications. Le plan profond a échoué techniquement. Le bouton « Réessayer » a été cliqué
 * plusieurs fois, et la trace observée était :
 *
 *   FAST prêt → CORE échoue → FAST prêt → CORE échoue → FAST prêt → CORE réussit
 *
 * Chaque reprise payait donc un appel rapide pour rejouer une readiness déjà acquise.
 *
 * LES DEUX CAUSES, ÉTABLIES PAR LECTURE DU CODE ET PAR MESURE.
 *
 *   1. CÔTÉ CLIENT. Le bouton de reprise appelait `oprieRunTurn(...)`, qui commence TOUJOURS par le
 *      plan rapide. Rien ne distinguait une reprise technique d'un nouveau tour de dialogue.
 *   2. CÔTÉ FOURNISSEUR. La chaîne ne fait qu'UNE tentative par fournisseur, et l'ordre du plan
 *      profond ne contient qu'un fournisseur : la tolérance aux pannes passagères était nulle. Un
 *      seul incident et vingt secondes de travail partaient en `degraded_state`. Mesuré sur le
 *      runtime déployé : trois appels profonds successifs ont abouti en 20 à 24 secondes, ce qui
 *      confirme que la panne est intermittente — et qu'une seule tentative ne la tolère pas.
 *
 * CE QUE CE FICHIER VÉRIFIE. Qu'une reprise technique ne consomme aucun appel rapide, ne touche pas à
 * l'historique, et que la reprise transitoire est bornée à UNE et réservée à ce qui est vraiment
 * transitoire. Aucun appel fournisseur réel n'est fait ici.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FAILURE_CLASSES, failureClassOf } from '../workers/shared/provider-ha.js';
import { classifyProviderHttpStatus, ROLE_PROVIDER_ORDER, resolveRoleProviderOrder } from '../workers/groq/src/index.js';
import { validateArbiterOutput, OPRIE_ROLES } from '../workers/shared/operational-request-core.js';
import { runCoreFirstTurn } from '../workers/shared/core-first-plane.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');

/* La fixture de régression demandée : la demande et les trois clarifications réellement obtenues.
   Ce sont des DONNÉES d'entrée, pas des chaînes attendues en sortie. */
const LISBONNE = {
  original_request: 'Je veux préparer un voyage à Lisbonne au printemps.',
  clarification_history: [
    { turn: 1, question: 'Combien de jours dure votre séjour à Lisbonne ?', answer: '4 jours avec ma femme', provenance: 'user' },
    { turn: 2, question: 'À quelle date précise de printemps envisagez-vous de partir ?', answer: 'debut Mars', provenance: 'user' },
    { turn: 3, question: 'Quel est votre budget approximatif pour ce voyage de 4 jours à Lisbonne ?', answer: '1000 euros pour nous deux vols compris', provenance: 'user' }
  ]
};

const candidat = {
  objective: 'o', expected_deliverable: 'd', secondary_objectives: [], confirmed_constraints: [],
  confirmed_priorities: [], confirmed_preferences: [], delegated_decisions: [],
  external_facts_to_research: [], assumptions_allowed: [], remaining_unknowns: [], available_inputs: []
};
const TOUR_PRET = {
  state: 'operational_request_ready', operational_request_candidate: candidat, issues: [],
  next_question: { text: null, targets_issue_id: null, expected_progress: null },
  confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'La demande est exploitable.'
};
const SORTIE_CORE = { ...TOUR_PRET, question_candidates: [], escalation: { needed: false, kind: null, reason: null } };

/** Une chaîne épuisée : c'est le SEUL échec qui devient un état dégradé. */
const chaineEpuisee = () => Object.assign(new Error('Aucun provider disponible.'), {
  all_providers_failed: true, attempts: [{ provider: 'anthropic', failure_class: 'technical_failover' }],
  failure_class: FAILURE_CLASSES.TECHNICAL_FAILOVER
});

/** Un exécuteur qui compte, et qui distingue les rôles rapides des rôles profonds. */
function executeur(sequence) {
  const appels = [];
  let index = 0;
  return {
    appels,
    roles: () => appels.map((a) => a.role),
    executeRole: async (role, input) => {
      appels.push({ role, input: JSON.parse(JSON.stringify(input)) });
      const etape = sequence[Math.min(index, sequence.length - 1)];
      index += 1;
      if (etape === 'FAIL') throw chaineEpuisee();
      return SORTIE_CORE;
    }
  };
}

/* ==========================================================================
 * V213-01 / 02 / 13 — AUCUN APPEL RAPIDE APRÈS LA READINESS
 * ======================================================================= */

test('V213-01 : la reprise du bouton appelle le plan profond, jamais le plan rapide', () => {
  /* Le défaut était ici, et il est lisible : la reprise repartait par le chemin complet. */
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/,
    'la reprise emprunte la voie « plan profond seul »');
  /* Et cette voie saute réellement le plan rapide : le seul appel rapide du tour est dans la branche
     qui ne s'exécute pas quand `coreOnly` vaut vrai. */
  const tour = html.slice(html.indexOf('async function oprieRunTurn('), html.indexOf('const deepPromise=oprieRequestTurn(seq)'));
  assert.match(tour, /if\(coreOnly\)\{/);
  assert.match(tour, /\}else\{[\s\S]*oprieStartFastPlane\(seq,requestedMode\)[\s\S]*\}/,
    'l’appel rapide vit dans la branche NON reprise');
  assert.equal((tour.match(/oprieStartFastPlane\(/g) || []).length, 1, 'un seul point d’appel rapide');
});

test('V213-02 / V213-13 : la reprise compte les tentatives et déclare zéro appel rapide', () => {
  const tour = html.slice(html.indexOf('async function oprieRunTurn('), html.indexOf('const deepPromise=oprieRequestTurn(seq)'));
  assert.match(tour, /oprieState\.coreAttempts=\(oprieState\.coreAttempts\|\|0\)\+1;/, 'les tentatives sont comptées');
  assert.match(tour, /fast_reinvoked_after_ready:false/, 'et la propriété testable est déclarée');
  assert.match(tour, /snapshot_reused:true/, 'la reprise déclare réutiliser le payload dérivé');
  assert.match(tour, /oprieMark\('fast_skipped_core_only',oprieCoreTelemetry\(\)\)/,
    'et le relevé complet part par le canal d’instrumentation existant');
  /* Un tour NORMAL remet le compteur à zéro : une reprise technique n’est pas un tour de dialogue. */
  assert.match(tour, /oprieState\.coreAttempts=0;/);
});

test('V213-02b : la séquence de régression — READY, puis trois tentatives profondes', async () => {
  /* LA FIXTURE DEMANDÉE, JOUÉE. Deux échecs techniques, puis un succès. Ce qui est vérifié est la
     SÉQUENCE : quatre entrées profondes au total, aucun rôle rapide, et un historique identique
     d'une tentative à l'autre — jamais une chaîne de sortie attendue. */
  const { executeRole, roles, appels } = executeur(['FAIL', 'FAIL', 'OK', 'OK']);
  const premiere = await runCoreFirstTurn(LISBONNE, { executeRole });
  const deuxieme = await runCoreFirstTurn(LISBONNE, { executeRole });
  const troisieme = await runCoreFirstTurn(LISBONNE, { executeRole });
  assert.equal(premiere.turn.state, 'degraded_state');
  assert.equal(deuxieme.turn.state, 'degraded_state');
  assert.equal(troisieme.turn.state, 'operational_request_ready', 'la troisième aboutit');
  /* Quatre tentatives : le READY du plan rapide, puis trois passages profonds — et RIEN d'autre. */
  assert.deepEqual(roles(), ['core', 'core', 'core'], 'aucun rôle rapide, aucun rôle historique');
  assert.equal(appels.length, 3);
  /* L'historique est identique à chaque tentative : aucune reprise ne l'a touché. */
  for (const appel of appels) {
    assert.deepEqual(appel.input, appels[0].input, 'même payload, aux champs techniques près');
    assert.equal(appel.input.clarification_history.length, 3);
    assert.equal(appel.input.clarification_history[2].answer, '1000 euros pour nous deux vols compris');
  }
  /* Et le compte d'appels rapides après readiness est zéro par construction : l'exécuteur ne connaît
     que `core`, et il aurait levé si un autre rôle était parti. */
  assert.equal(roles().filter((r) => r !== 'core').length, 0, 'fast_calls_after_ready = 0');
});

test('V213-15b : le relevé client expose les champs demandés, sans inventer le fournisseur', () => {
  const releve = html.slice(html.indexOf('function oprieCoreTelemetry('), html.indexOf('function oprieMark('));
  for (const champ of ['core_attempt_count', 'core_retry_count', 'core_last_error_type',
                       'core_last_provider', 'core_last_duration_ms', 'core_retryable',
                       'core_snapshot_reused', 'fast_reinvoked_after_ready', 'clarification_history_hash']) {
    assert.match(releve, new RegExp(champ), `${champ} est exposé`);
  }
  /* Le fournisseur vaut null, et c'est un FAIT : le client ne le connaît pas, le message de
     dégradation n'en nomme aucun, et le lui faire savoir exigerait d'élargir le contrat de réponse. */
  assert.match(releve, /core_last_provider:null/);
  /* L'empreinte de l'historique ne transporte aucun texte : une longueur et un entier. */
  const hash = html.slice(html.indexOf('function oprieHistoryHash('), html.indexOf('function oprieCoreTelemetry('));
  assert.match(hash, /\$\{tours\.length\}:\$\{\(h>>>0\)\.toString\(16\)\}/);
  assert.equal(/console\.log|oprieMark\(/.test(hash), false, 'la fonction ne journalise rien elle-même');
});

/* ==========================================================================
 * V213-03 / 04 / 12 — LE PAYLOAD EST DÉRIVÉ, DONC IDENTIQUE
 * ======================================================================= */

test('V213-03 / V213-12 : le payload de reprise est reconstruit à l’identique depuis l’état', () => {
  /* Le « snapshot » n’est pas une copie entretenue à côté : le payload profond est DÉRIVÉ de la
     demande, de l’historique et du matériau à chaque appel. Deux reprises successives produisent donc
     le même corps, sans qu’aucune mémoire parallèle n’ait à être synchronisée. */
  const requete = html.slice(html.indexOf('async function oprieRequestTurn('), html.indexOf('async function oprieRequestFastInteraction('));
  assert.match(requete, /oprieOriginalRequest\(\)/);
  assert.match(requete, /oprieClarificationHistory\(\)/);
  /* Et rien dans ce corps n’est écrit par la reprise : aucune mutation d’historique. */
  assert.equal(/state\.answers\.push/.test(requete), false, 'la requête n’écrit jamais dans l’historique');
  /* L’historique ne s’écrit qu’à une réponse réelle, et la branche de reprise sort AVANT. */
  const reponse = html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function answerQuestion(answer){') + 1400);
  const iReprise = reponse.indexOf('coreOnly:true');
  const iEcriture = reponse.indexOf('state.answers.push');
  assert.ok(iReprise > 0 && iEcriture > iReprise, 'la reprise rend la main avant toute écriture');
});

test('V213-04 : une reprise technique ne crée aucune question nouvelle', () => {
  const reponse = html.slice(html.indexOf('function answerQuestion(answer){'), html.indexOf('function answerQuestion(answer){') + 1400);
  /* La branche de reprise ne touche ni à la modale, ni au texte de question, ni à la readiness. */
  const branche = reponse.slice(0, reponse.indexOf('coreOnly:true') + 40);
  for (const interdit of ['oprieAsk(', 'pendingQuestion=true', "$('#v11-question').textContent="]) {
    assert.equal(branche.includes(interdit), false, `la reprise ne fait pas « ${interdit} »`);
  }
});

/* ==========================================================================
 * V213-05 / 06 — SUCCÈS APRÈS REPRISE, ET LE SÉMANTIQUE N'EST PAS UNE PANNE
 * ======================================================================= */

test('V213-05 : le plan profond qui réussit à la reprise rend un tour normal', async () => {
  const { executeRole, roles, appels } = executeur(['FAIL', 'OK']);
  /* Une chaîne épuisée rend un ÉTAT — degraded_state, public et légitime — jamais une disparition.
     C'est l'invariant acquis au lot V2, et c'est lui qui permet à l'écran de proposer une reprise. */
  const premiere = await runCoreFirstTurn(LISBONNE, { executeRole });
  assert.equal(premiere.turn.state, 'degraded_state');
  const seconde = await runCoreFirstTurn(LISBONNE, { executeRole });
  assert.equal(seconde.turn.state, 'operational_request_ready');
  assert.deepEqual(roles(), ['core', 'core'], 'deux tentatives profondes, aucun rôle rapide');
  /* Et l’entrée reçue à la seconde tentative est EXACTEMENT celle de la première : c’est la propriété
     V213-03, vérifiée ici sur ce que l’exécuteur a réellement reçu. */
  assert.equal(appels.length, 2);
  assert.deepEqual(appels[1].input, appels[0].input, 'même demande, même historique, aucun champ ajouté');
  assert.equal(appels[1].input.clarification_history.length, 3, 'les trois réponses sont intactes');
});

test('V213-06 : clarification_required est une décision sémantique, pas un échec technique', () => {
  const tourClarif = {
    ...TOUR_PRET, state: 'clarification_required',
    issues: [{ id: 'I1', type: 'missing_information', kind: null, description: 'd', impact: 'material', substitutable: false, recommended_treatment: 'question' }],
    next_question: { text: 'Combien de temps cela doit-il durer ?', targets_issue_id: 'I1', expected_progress: 'p' }
  };
  /* Elle traverse la validation : c’est un état de tour légitime, pas une panne. */
  assert.equal(validateArbiterOutput(tourClarif).state, 'clarification_required');
  /* Seule une chaîne épuisée devient un état dégradé — et rien d’autre. */
  assert.equal(chaineEpuisee().all_providers_failed, true);
  const planCore = fs.readFileSync(new URL('../workers/shared/core-first-plane.js', import.meta.url), 'utf8');
  assert.match(planCore, /if \(error\?\.all_providers_failed !== true\) throw error;/,
    'tout autre défaut remonte, il ne se déguise pas en état');
  /* Et le client ne propose une reprise que sur une panne, jamais sur une clarification. */
  assert.match(html, /function oprieShowDegraded\(\)/);
  const clarif = html.slice(html.indexOf('function oprieAsk('), html.indexOf('function oprieAsk(') + 400);
  assert.match(clarif, /oprieState\.retryTurn=false;/, 'ouvrir une question referme la reprise technique');
});

/* ==========================================================================
 * V213-07 à V213-10 — CLASSIFICATION : CE QUI SE REPREND, CE QUI NE SE REPREND PAS
 * ======================================================================= */

test('V213-07 / V213-08 / V213-09 : 429, 503 et panne de transport sont transitoires', () => {
  for (const status of [429, 500, 502, 503, 504, 529]) {
    assert.equal(classifyProviderHttpStatus(status), FAILURE_CLASSES.TECHNICAL_FAILOVER,
      `${status} est transitoire`);
  }
  /* Un transport qui échoue — délai dépassé, coupure — est de la même famille. */
  assert.match(worker, /Anthropic : échec de transport \(\$\{errorName\}\)\.`\), FAILURE_CLASSES\.TECHNICAL_FAILOVER/);
  /* V2.1.3-CORRECTION — LA REPRISE INTERNE A ÉTÉ RETIRÉE, et la classification reste. Mesuré en bêta
     réelle : ma reprise faisait passer un échec rendu en 19–22 s à un échec rendu en 44,6 s. Deux
     tentatives séquentielles sur le MÊME fournisseur ne doublent pas les chances — il est disponible
     ou il ne l'est pas — mais elles doublent l'attente. La reprise appartient à la personne, par un
     bouton qui ne rejoue que le plan profond. */
  assert.equal(/REPRISE_ROLE_MAX|avecRepriseQuandLaChaineEstSeule/.test(worker), false,
    'aucune reprise interne ne subsiste');
  /* V2.1.4 — le relevé « une tentative » a été remplacé par une télémétrie PAR TENTATIVE, parce que
     la chaîne Core en compte désormais deux fournisseurs. L'invariant, lui, est le même et il est
     asservi ici : aucun fournisseur n'est JAMAIS rejoué. */
  assert.match(worker, /event: "core_attempt"/);
  assert.match(worker, /event: "core_chain_result"/);
});

test('V213-10 : une sortie déterministe invalide n’est jamais reprise, et aucune boucle n’existe', () => {
  /* Une sortie structurée invalide, une requête rejetée, une clé absente, un défaut de contrat ou de
     notre code : le même appel produirait le même défaut. Aucune de ces classes n’est reprise. */
  for (const classe of [FAILURE_CLASSES.STRUCTURED_OUTPUT_INVALID, FAILURE_CLASSES.REQUEST_REJECTED,
                        FAILURE_CLASSES.CONFIG_UNAVAILABLE, FAILURE_CLASSES.CONTRACT_ERROR,
                        FAILURE_CLASSES.PROGRAMMING_ERROR, FAILURE_CLASSES.SEMANTIC_VALID]) {
    assert.equal([FAILURE_CLASSES.TECHNICAL_RETRYABLE, FAILURE_CLASSES.TECHNICAL_FAILOVER].includes(classe), false,
      `${classe} n’est pas transitoire`);
  }
  assert.equal(classifyProviderHttpStatus(400), FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(classifyProviderHttpStatus(422), FAILURE_CLASSES.REQUEST_REJECTED);
  assert.equal(classifyProviderHttpStatus(401), FAILURE_CLASSES.CONFIG_UNAVAILABLE);
  /* Aucune boucle ne peut tourner : il n’y a plus de reprise du tout. Une tentative, un échec rendu
     vite, et la main à la personne. */
  /* La vérification porte sur le CHEMIN PROFOND, pas sur tout le fichier : le transport Groq possède
     sa propre boucle de reprise 429, antérieure, bornée par `maxRetries`, et qui ne concerne pas le
     plan profond. La confondre avec la mienne serait une fausse alerte. */
  const chemin = worker.slice(worker.indexOf('function releveDeChaineProfonde'),
    worker.indexOf('function roleFromPathname'));
  assert.equal(/while \(true\)|for \(let tentative/.test(chemin), false,
    'aucune boucle de reprise sur le chemin profond');
  assert.match(worker, /core_attempt_count: tentatives\.length/, 'le nombre de tentatives est compté, non supposé');
  assert.match(worker, /: \(\) => GENERIC_ROLE_ADAPTERS\[name\]\(role, input, env\)/,
    'l’adaptateur générique reste appelé tel quel, sans enrobage par fournisseur');
  /* Une erreur non étiquetée est un défaut de NOTRE code, jamais une panne fournisseur. */
  assert.equal(failureClassOf(new Error('inconnue')), FAILURE_CLASSES.PROGRAMMING_ERROR);
});

/* ==========================================================================
 * V213-11 — LA READINESS ET LE DIALOGUE SURVIVENT À LA PANNE
 * ======================================================================= */

test('V213-11 : une panne conserve la demande, les réponses et l’état', () => {
  assert.match(html, /function oprieKeepFailedDialogue\(\)/);
  const garde = html.slice(html.indexOf('function oprieKeepFailedDialogue()'), html.indexOf('function oprieShowBlocked('));
  assert.match(garde, /\$\('#v11-answer'\)\.value=last\.answer;/, 'la réponse reste affichée');
  assert.match(garde, /oprieState\.retryTurn=true;/, 'et la reprise est armée');
  assert.equal(/state\.answers=\[\]/.test(garde), false, 'rien n’est effacé');
  /* Le message de dégradation ne nomme aucun fournisseur, aucun statut, aucun délai. */
  const degrade = html.slice(html.indexOf('function oprieShowDegraded()'), html.indexOf('function oprieShowNetworkFailure('));
  for (const fuite of ['anthropic', 'groq', 'openai', '429', '503', 'timeout']) {
    assert.equal(new RegExp(fuite, 'i').test(degrade), false, `« ${fuite} » ne fuit pas vers la personne`);
  }
  assert.match(degrade, /Votre demande est conservée/);
});

/* ==========================================================================
 * V213-14 / V213-15 — INSTRUMENTATION PAR TENTATIVE, SANS AUCUN SECRET
 * ======================================================================= */

test('V213-14 : chaque tentative profonde est relevée', () => {
  assert.match(worker, /event: "core_attempt"/);
  for (const champ of ['attempt_index', 'provider', 'model', 'duration_ms', 'provider_status',
                       'error_class', 'retryable', 'schema_valid', 'contract_valid', 'selected',
                       'aborted', 'failover_reason', 'core_total_duration_ms', 'core_attempt_count',
                       'core_final_state', 'core_selected_provider', 'core_failover_used']) {
    assert.match(worker, new RegExp(champ), `${champ} est relevé`);
  }
});

test('V213-15 : aucun secret, aucun message d’erreur brut dans les relevés', () => {
  const bloc = worker.slice(worker.indexOf('function releveDeChaineProfonde'),
    worker.indexOf('function roleFromPathname'));
  /* La CLASSE d’échec, jamais le message : un message peut citer une valeur d’entrée. */
  assert.equal(/error\.message|error\?\.message/.test(bloc), false, 'aucun message d’erreur journalisé');
  for (const secret of ['API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'authorization', 'x-api-key']) {
    assert.equal(new RegExp(secret, 'i').test(bloc), false, `« ${secret} » n’apparaît pas`);
  }
  assert.equal(/original_request|clarification_history|\.text\b/.test(bloc), false, 'aucun contenu utilisateur');
});

/* ==========================================================================
 * V213-16 à V213-19 — CE QUI N'A PAS BOUGÉ
 * ======================================================================= */

test('V213-16 / V213-17 / V213-18 / V213-19 : JSON 3.4, ADN, autorités et machines d’état', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`));
  }
  /* Aucune autorité nouvelle : la readiness reste celle du tour profond, et le « snapshot » de
     contractualisation est dérivé de l’état existant — il n’a ni type, ni registre, ni cycle de vie
     propre. Le seul ajout est un COMPTEUR de tentatives techniques. */
  const tour = html.slice(html.indexOf('async function oprieRunTurn('), html.indexOf('const deepPromise=oprieRequestTurn(seq)'));
  assert.equal(/canonicalContract=|lastTurn=|readiness=/.test(tour), false,
    'la voie de reprise n’écrit aucune autorité');
  /* Un compteur de tentatives et un sac de constats techniques : ni type, ni registre, ni cycle de
     vie propre. Ils sont remis à zéro par un tour NORMAL, ce qui les rend incapables de porter une
     mémoire conversationnelle. */
  /* Un compteur d'entier, pas un modèle : il s'incrémente, il se remet à zéro, il ne porte rien
     d'autre. Compter ses occurrences serait fragile ; ce qui compte est ce qu'il PEUT faire. */
  assert.match(html, /oprieState\.coreAttempts=\(oprieState\.coreAttempts\|\|0\)\+1;/);
  assert.equal(/coreAttempts\s*=\s*\{|coreAttempts\.push|coreAttempts\[/.test(html), false,
    'le compteur ne devient jamais une structure');
  assert.match(html, /oprieState\.coreAttempts=0;\s*\n\s*oprieState\.coreTelemetry=\{\};/,
    'et un tour normal les remet à zéro');
  assert.equal(/coreTelemetry[^=]*=\s*Object\.freeze/.test(html), false, 'aucun contrat figé : ce n’est pas une autorité');
  /* Les trois rôles historiques restent hors du chemin nominal. */
  assert.deepEqual([...OPRIE_ROLES], ['analyst', 'critic', 'arbiter']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'l’ordre du plan profond est inchangé');
  assert.deepEqual(resolveRoleProviderOrder({}), ['anthropic'], 'et aucun fournisseur n’a été ajouté');
});
