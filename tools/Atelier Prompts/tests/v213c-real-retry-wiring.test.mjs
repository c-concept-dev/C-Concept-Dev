/* ATELIER PROMPTS V2.1.3-CORRECTION — LE VRAI BOUTON, LE VRAI ÉCOUTEUR, LES VRAIS FETCHS.
 * ============================================================================
 *
 * POURQUOI CE FICHIER EXISTE. Le lot V2.1.3 a été déclaré vert sur ses tests, et le navigateur réel a
 * prouvé le contraire : après un échec du plan profond, le clic sur « Réessayer l'analyse » rappelait
 * `/fast-interaction`. Mes tests ne pouvaient pas le voir, et la raison est structurelle :
 *
 *   - ils vérifiaient des PROPRIÉTÉS DE SOURCE (des expressions régulières sur le HTML) et le
 *     comportement de modules isolés ;
 *   - le harnais frontend existant (PERF-04) n'exécute QUE le bloc pilote, découpé entre
 *     `const OPRIE_STATES=` et `function v11SwitchToArchitecteFromRapid` ;
 *   - or `answerQuestion` et l'écouteur du bouton vivent EN DEHORS de ce bloc.
 *
 * Aucun test n'exerçait donc la chaîne clic → écouteur → handler → fetch. C'est exactement le type de
 * test qui manquait, et c'est celui-ci.
 *
 * CE QU'IL EXÉCUTE. Le code de production, découpé dans l'artefact : le bloc pilote, la fonction
 * `answerQuestion`, et la LIGNE D'ÉCOUTE elle-même, extraite du HTML et jamais retapée. Le réseau est
 * intercepté ; tout le reste est le produit.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as fastPlane from '../workers/shared/fast-interactive-plane.js';
import * as canonicalMapping from '../core/adn/oprie-canonical-mapping.js';
import * as orchestrationPolicy from '../core/adn/orchestration-policy.js';
import * as modeContracts from '../core/adn/mode-contracts.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const FAST_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/fast-interaction';
const OPRIE_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/operational-request';

/** Découpe un intervalle du produit, et échoue bruyamment si l'ancre a bougé. */
function tranche(debut, fin, quoi) {
  const a = html.indexOf(debut);
  const b = html.indexOf(fin, a + debut.length);
  assert.ok(a >= 0 && b > a, `V213C : ${quoi} introuvable dans l'artefact (ancre déplacée ?)`);
  return html.slice(a, b);
}

/* La LIGNE D'ÉCOUTE du bouton, extraite telle quelle : c'est elle qui relie le clic au handler. */
const LIGNE_ECOUTE = (html.match(/\$\('#v11-answer-continue'\)\.addEventListener\('click',[^\n]*\);/) || [])[0];

/* Un tour d'Arbitre à la forme exacte attendue par le pilote. */
const tour = (state, extra = {}) => ({
  state,
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'Une note de cadrage.' },
  issues: [], next_question: null, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'Motif.', ...extra
});

/**
 * Charge le produit : bloc pilote + `answerQuestion` + la ligne d'écoute réelle.
 * `deep` est une file de réponses successives du plan profond.
 */
function chargerProduit({ fast, deep, answers, demande = 'Une demande technique pour le harnais.' }) {
  const reseau = [];
  const horsBloc = [];
  const ecouteurs = new Map();
  const dom = new Map();
  const el = (id) => {
    if (!dom.has(id)) {
      dom.set(id, {
        value: '', textContent: '', disabled: false, innerHTML: '',
        addEventListener(type, handler) { ecouteurs.set(`${id}:${type}`, handler); },
        click() { const h = ecouteurs.get(`${id}:click`); if (h) return h(); },
        focus() {}, appendChild() {}
      });
    }
    return dom.get(id);
  };
  const json = (payload, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

  let indexProfond = 0;
  const contexte = {
    AbortController, Date, setTimeout, clearTimeout, performance: { now: () => Date.now() },
    console: { warn() {}, error() {}, log() {} },
    fetch: async (url, opts) => {
      const cible = String(url);
      reseau.push(cible === FAST_ENDPOINT ? 'FAST' : cible === OPRIE_ENDPOINT ? 'CORE' : cible);
      if (cible === FAST_ENDPOINT) return json(fast);
      if (cible === OPRIE_ENDPOINT) {
        const reponse = deep[Math.min(indexProfond, deep.length - 1)];
        indexProfond += 1;
        return json(reponse);
      }
      throw new Error(`point d'entrée inattendu : ${cible}`);
    },
    $: el,
    state: { answers, docs: [], dialogueRequest: null, exchangeId: null },
    adpState: { pendingQuestion: false, clarifications: 0, requestedMode: 'rapide', returnFocus: null },
    materialText: () => '',
    toast() {},
    show() {}, renderFiles() {},
    v11ShowRapidGate() {},
    v11AbandonGovernedTurn() {},
    /* Les fonctions que le bloc pilote appelle mais qui vivent ailleurs dans la page. Elles sont
       ENREGISTRÉES plutôt que muettes : si la reprise en déclenchait une qu'elle ne doit pas
       déclencher, le test le verrait. */
    adpRunRapide(...args) { horsBloc.push(['adpRunRapide', args.length]); },
    adpEnterArchitecte(...args) { horsBloc.push(['adpEnterArchitecte', args.length]); },
    adpEnterAtelier(...args) { horsBloc.push(['adpEnterAtelier', args.length]); },
    beginExchange() { horsBloc.push(['beginExchange', 0]); },
    v11SwitchToArchitecteFromRapid() { horsBloc.push(['v11SwitchToArchitecteFromRapid', 0]); },
    adnRuntime: () => ({
      createTurnSnapshot: fastPlane.createTurnSnapshot,
      validateFastInteraction: fastPlane.validateFastInteraction,
      projectInteractionForMode: fastPlane.projectInteractionForMode,
      reconcileFastWithDeep: fastPlane.reconcileFastWithDeep,
      createTurnCoordinator: fastPlane.createTurnCoordinator,
      decideNextOrchestrationAction: orchestrationPolicy.decideNextOrchestrationAction,
      isKnownOrchestrationAction: orchestrationPolicy.isKnownOrchestrationAction,
      executionTargetFor: modeContracts.executionTargetFor,
      mapOprieToCanonicalContract: canonicalMapping.mapOprieToCanonicalContract,
      validateCanonicalContract: canonicalMapping.validateCanonicalContract
    }),
    document: { querySelector: (sel) => (sel.includes('operational-request') ? { content: OPRIE_ENDPOINT }
      : sel.includes('fast-interaction') ? { content: FAST_ENDPOINT } : null) },
    window: {}
  };
  contexte.globalThis = contexte;

  const source = [
    tranche('const OPRIE_STATES=', 'function v11SwitchToArchitecteFromRapid', 'bloc pilote'),
    tranche('function answerQuestion(answer){', 'function v11ForgetDialogue(){', 'handler de réponse'),
    LIGNE_ECOUTE
  ].join('\n');
  vm.runInNewContext(source, contexte);
  /* La demande est renseignée comme elle l'est à l'écran : sans elle, l'instantané rapide est
     invalide et le plan rapide sort AVANT son appel — ce qui rendrait le harnais aveugle. */
  el('#v11-demande').value = demande;
  return { contexte, reseau, horsBloc, bouton: el('#v11-answer-continue'), el };
}

/* ==========================================================================
 * V213C-01 / 02 / 16 — LE VRAI BOUTON, ET CE QU'IL APPELLE
 * ======================================================================= */

test('V213C-01 : le bouton « Réessayer l’analyse » existe, et son écouteur est unique', () => {
  assert.match(html, /<button type="button"[^>]*id="v11-answer-continue"/, 'le bouton existe dans le DOM');
  assert.match(html, /\$\('#v11-answer-continue'\)\.textContent='Réessayer l’analyse';/,
    'et c’est bien lui qui porte le libellé de reprise');
  assert.ok(LIGNE_ECOUTE, 'sa ligne d’écoute est trouvable');
  assert.equal((html.match(/\$\('#v11-answer-continue'\)\.addEventListener/g) || []).length, 1,
    'un seul écouteur : pas de second chemin caché');
});

test('V213C-02 / V213C-16 : le handler de reprise n’emprunte pas le chemin normal de tour', () => {
  const handler = tranche('function answerQuestion(answer){', 'function v11ForgetDialogue(){', 'handler');
  const branche = handler.slice(0, handler.indexOf('answer=String(answer||\'\').trim()'));
  assert.match(branche, /oprieRunTurn\([^)]*\{coreOnly:true\}\)/,
    'la reprise passe par la voie « plan profond seul »');
  /* Et la voie normale — celle qui commence par le plan rapide — n’est pas dans cette branche. */
  assert.equal(/oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)(?!,)/.test(branche), false,
    'aucun appel au tour normal depuis la reprise technique');
});

/* ==========================================================================
 * V213C-03 / 04 / 14 / 15 — LA PREUVE PAR LE RÉSEAU
 * ======================================================================= */

test('V213C-03 / V213C-14 / V213C-15 : READY → CORE en échec → clic réel → CORE seul', async () => {
  const { contexte, reseau, bouton } = chargerProduit({
    fast: { type: 'ACKNOWLEDGE', text: 'Bien reçu.' },
    deep: [tour('degraded_state'), tour('operational_request_ready')],
    answers: [{ question: 'Combien de temps cela doit-il couvrir ?', answer: 'quatre unités' }]
  });

  /* Un tour normal : le plan rapide accuse réception, le plan profond échoue. */
  await contexte.oprieRunTurn('rapide');
  assert.deepEqual(reseau, ['FAST', 'CORE'], 'le tour normal appelle les deux plans');

  /* La reprise est armée par le PRODUIT lui-même, par le chemin de panne réel — pas par le test.
     `oprieState` est déclaré en `const` dans l'artefact, donc inatteignable de l'extérieur : la preuve
     passe par ce que la personne VOIT, à savoir le libellé du bouton. C'est une meilleure preuve. */
  assert.equal(bouton.textContent, 'Réessayer l’analyse', 'l’écran propose la reprise');
  const avant = reseau.length;

  /* LE CLIC RÉEL, sur le vrai bouton, par le vrai écouteur. */
  await bouton.click();

  const apres = reseau.slice(avant);
  assert.deepEqual(apres, ['CORE'], 'la reprise n’appelle QUE le plan profond');
  assert.equal(apres.includes('FAST'), false, 'fast_calls_after_ready = 0');
  assert.deepEqual(reseau, ['FAST', 'CORE', 'CORE'], 'séquence complète attendue');
});

test('V213C-04 : deux clics de reprise n’appellent jamais le plan rapide', async () => {
  const { contexte, reseau, bouton } = chargerProduit({
    fast: { type: 'ACKNOWLEDGE', text: 'Bien reçu.' },
    deep: [tour('degraded_state'), tour('degraded_state'), tour('operational_request_ready')],
    answers: [{ question: 'Quel volume attendez-vous ?', answer: 'environ mille' }]
  });
  await contexte.oprieRunTurn('rapide');
  for (let i = 0; i < 2; i += 1) {
    assert.equal(bouton.textContent, 'Réessayer l’analyse', `tentative ${i + 1} : la reprise est offerte`);
    await bouton.click();
  }
  assert.deepEqual(reseau, ['FAST', 'CORE', 'CORE', 'CORE'], 'un seul appel rapide, trois profonds');
  assert.equal(reseau.filter((x) => x === 'FAST').length, 1);
});

/* ==========================================================================
 * V213C-05 / 06 / 07 / 08 — CE QUE LA REPRISE NE TOUCHE PAS
 * ======================================================================= */

test('V213C-05 / 06 / 07 / 08 : demande, historique et tour conversationnel sont intacts', async () => {
  const answers = [
    { question: 'Combien de temps cela doit-il couvrir ?', answer: 'cinq unités' },
    { question: 'Quel volume total prévoyez-vous ?', answer: 'mille deux cents' }
  ];
  const avantJSON = JSON.stringify(answers);
  const { contexte, reseau, bouton } = chargerProduit({
    fast: { type: 'ACKNOWLEDGE', text: 'Bien reçu.' },
    deep: [tour('degraded_state'), tour('operational_request_ready')],
    answers, demande: 'Une demande technique inchangée.'
  });
  await contexte.oprieRunTurn('rapide');
  await bouton.click();

  assert.equal(JSON.stringify(contexte.state.answers), avantJSON, 'l’historique est byte-équivalent');
  assert.equal(contexte.$('#v11-demande').value, 'Une demande technique inchangée.', 'la demande est intacte');
  assert.equal(contexte.state.answers.length, 2, 'aucune clarification ajoutée');
  /* Aucun tour CONVERSATIONNEL n'est créé : l'historique n'a pas bougé, et c'est cela qui définit un
     tour de dialogue. Le numéro de séquence technique, lui, est interne au produit. */
  assert.deepEqual(reseau, ['FAST', 'CORE', 'CORE']);
});

/* ==========================================================================
 * V213C-09 / 10 / 11 — SUCCÈS, ÉCHEC PERSISTANT, ET LE SÉMANTIQUE
 * ======================================================================= */

test('V213C-09 : une reprise qui réussit reprend le pipeline', async () => {
  const { contexte, reseau, bouton } = chargerProduit({
    fast: { type: 'ACKNOWLEDGE', text: 'Bien reçu.' },
    deep: [tour('degraded_state'), tour('operational_request_ready')],
    answers: [{ question: 'Quel délai ?', answer: 'deux semaines' }]
  });
  await contexte.oprieRunTurn('rapide');
  assert.equal(bouton.textContent, 'Réessayer l’analyse');
  await bouton.click();
  assert.deepEqual(reseau, ['FAST', 'CORE', 'CORE'], 'la reprise a bien appelé le plan profond');
});

test('V213C-10 / V213C-11 : un échec conserve la reprise ; une clarification n’est pas une panne', async () => {
  const { contexte, reseau, bouton } = chargerProduit({
    fast: { type: 'ACKNOWLEDGE', text: 'Bien reçu.' },
    deep: [tour('degraded_state'), tour('degraded_state')],
    answers: [{ question: 'Quel délai ?', answer: 'deux semaines' }]
  });
  await contexte.oprieRunTurn('rapide');
  await bouton.click();
  assert.deepEqual(reseau, ['FAST', 'CORE', 'CORE']);
  /* Après un second échec, la reprise reste offerte : la personne peut réessayer encore, et elle le
     voit — le libellé du bouton n'a pas changé. */
  assert.equal(bouton.textContent, 'Réessayer l’analyse', 'le bouton de reprise survit à l’échec');
  /* Et une clarification sémantique, elle, désarme la reprise technique : ce n'est pas une panne. */
  const clarif = html.slice(html.indexOf('function oprieAsk('), html.indexOf('function oprieAsk(') + 300);
  assert.match(clarif, /oprieState\.retryTurn=false;/);
});

/* ==========================================================================
 * V213C-12 / 13 — LA LATENCE D'ÉCHEC N'EST PAS DOUBLÉE
 * ======================================================================= */

test('V213C-12 / V213C-13 : aucune reprise interne du fournisseur profond', () => {
  const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
  assert.equal(/REPRISE_ROLE_MAX|avecRepriseQuandLaChaineEstSeule/.test(worker), false,
    'la reprise interne ajoutée en V2.1.3 a été retirée');
  /* V2.1.4 — le relevé « une tentative » a été remplacé par une télémétrie PAR TENTATIVE, parce que
     la chaîne Core en compte désormais deux fournisseurs. L'invariant, lui, est le même et il est
     asservi ici : aucun fournisseur n'est JAMAIS rejoué. */
  assert.match(worker, /event: "core_attempt"/);
  assert.match(worker, /event: "core_chain_result"/);
  /* Un échec fournisseur rend UNE tentative, pas deux séquentielles : c'est ce qui a fait passer un
     échec de 19–22 s à 44,6 s en bêta réelle. */
  const chemin = worker.slice(worker.indexOf('function releveDeChaineProfonde'),
    worker.indexOf('function roleFromPathname'));
  assert.equal(/while \(true\)|for \(let tentative/.test(chemin), false, 'aucune boucle sur le chemin profond');
  assert.match(chemin, /core_attempt_count: tentatives\.length/);
});

/* ==========================================================================
 * V213C-17 à V213C-20 — CE QUI N'A PAS BOUGÉ
 * ======================================================================= */

test('V213C-17 / 18 / 19 / 20 : JSON 3.4, ADN, compilateur, autorités', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`));
  }
  /* La voie de reprise n'écrit aucune autorité, et ne crée aucun état durable. */
  const tourCode = tranche('async function oprieRunTurn(', 'const deepPromise=oprieRequestTurn(seq)', 'tour');
  assert.equal(/canonicalContract=|lastTurn=|readiness=/.test(tourCode), false);
});
