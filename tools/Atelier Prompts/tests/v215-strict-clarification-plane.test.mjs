/* ATELIER PROMPTS V2.1.5 — LA CLARIFICATION SE TERMINE DANS LE PLAN RAPIDE.
 * ============================================================================
 *
 * CE QUE L'USAGE RÉEL A MONTRÉ. Plus de deux cents secondes pour une demande simple, sans qu'aucune
 * reprise manuelle soit nécessaire : le plan rapide rendait le silence au premier tour, le plan
 * profond posait la question (21,9 s), puis — après que le plan rapide eut déclaré la demande prête —
 * le plan profond rouvrait une clarification (59,7 s), puis encore un tour (18,9 s).
 *
 * LA CAUSE, MESURÉE ET NON SUPPOSÉE. Le relevé `fast_decision` du lot précédent ne montre JAMAIS
 * `MODEL_RETURNED_WAIT` sur ces demandes : le modèle propose une question à chaque fois. C'est le
 * verdict `MULTIPLE_QUESTIONS` qui la faisait taire, et le silence envoyait le tour au plan profond.
 *
 *   Lisbonne     : ASK proposé → MULTIPLE_QUESTIONS → rattrapage réussi → ASK
 *   Présentation : ASK proposé → MULTIPLE_QUESTIONS → rattrapage réussi → ASK
 *   Réunion      : ASK proposé → MULTIPLE_QUESTIONS → rattrapage refusé → WAIT → plan profond
 *
 * L'ASYMÉTRIE QUI EN ÉTAIT LA RACINE. La frontière d'affichage sait COUPER une question qui porte deux
 * besoins, depuis BETA-04, sans rien inventer. Le plan rapide, lui, ne savait que refuser. La mesure
 * la plus pauvre décidait donc la dépense la plus lourde. Les deux mesures sont désormais une seule.
 *
 * CE QUE CE FICHIER VÉRIFIE. Qu'une question réductible est réduite au lieu d'être tue ; que ce qui ne
 * se répare pas se tait toujours ; et que le plan profond n'est plus un moteur de clarification.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  guardFastInteraction, guardFastSolicitation, assessSolicitation, isAtomicQuestion,
  isMetaOutputQuestion, SILENT_INTERACTION, SOLICITING_TYPES
} from '../workers/shared/solicitation-policy.js';
import { createTurnSnapshot } from '../workers/shared/fast-interactive-plane.js';
import { CORE_SYSTEM_PROMPT } from '../workers/shared/core-first-plane.js';
import { FAST_INTERACTION_SYSTEM_PROMPT, ROLE_PROVIDER_ORDER, CORE_PROVIDER_ORDER, resolveProviderOrderForRole } from '../workers/groq/src/index.js';
import * as fastPlane from '../workers/shared/fast-interactive-plane.js';
import * as canonicalMapping from '../core/adn/oprie-canonical-mapping.js';
import * as orchestrationPolicy from '../core/adn/orchestration-policy.js';
import * as modeContracts from '../core/adn/mode-contracts.js';

const html = fs.readFileSync(new URL('../atelier-prompts-v11.5-lot10g-decision-provider.html', import.meta.url), 'utf8');
const politique = fs.readFileSync(new URL('../workers/shared/solicitation-policy.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../workers/groq/src/index.js', import.meta.url), 'utf8');
const orchestrateur = fs.readFileSync(new URL('../workers/shared/operational-request-orchestrator.js', import.meta.url), 'utf8');

const q = (texte) => ({ type: 'ASK_CLARIFICATION', text: texte });
const snap = (demande, historique = []) => createTurnSnapshot({
  turn_id: historique.length + 1, original_request: demande, clarification_history: historique
});

/* Les trois demandes du propriétaire, employées comme ENTRÉES de fixture, jamais comme sorties
   attendues. Aucun test ci-dessous n'affirme le texte d'une question. */
const LISBONNE = 'Je veux préparer un voyage à Lisbonne au printemps.';
const PRESENTATION = 'Je veux préparer une présentation de 20 minutes sur l’intelligence artificielle pour mes collègues.';
const REUNION = 'Je veux organiser une réunion d’équipe pour améliorer la communication entre mes collaborateurs.';

/* ==========================================================================
 * V215-01 / 03 — UNE QUESTION RÉDUCTIBLE EST RÉDUITE, PAS TUE
 * ======================================================================= */

test('V215-01 : une question à deux besoins devient UNE question, au lieu d’un silence', () => {
  /* C'est exactement ce que le modèle a produit sur les trois demandes réelles. */
  for (const demande of [LISBONNE, PRESENTATION, REUNION]) {
    const deuxBesoins = q('Quel est le budget approximatif et combien de temps cela doit-il durer ?');
    /* L'ancienne mesure la refusait… */
    assert.equal(assessSolicitation(deuxBesoins, [], false, demande), 'MULTIPLE_QUESTIONS');
    assert.deepEqual(guardFastSolicitation(deuxBesoins, snap(demande)), SILENT_INTERACTION);
    /* …la composition la RÉDUIT, et le tour reste dans le plan rapide. */
    const rendu = guardFastInteraction(deuxBesoins, snap(demande));
    assert.equal(rendu.type, 'ASK_CLARIFICATION', 'le plan rapide parle');
    assert.notEqual(rendu.text, deuxBesoins.text, 'la question a été coupée');
    assert.equal(isAtomicQuestion(rendu.text), true, 'et ce qui sort est atomique');
    /* La réduction COUPE : chaque mot vient de la question d'origine. */
    for (const mot of rendu.text.replace(/\s*\?$/u, '').split(/\s+/u)) {
      assert.ok(deuxBesoins.text.includes(mot), `« ${mot} » vient de la proposition du modèle`);
    }
  }
});

test('V215-03 : plusieurs tours de clarification restent dans le plan rapide', () => {
  let historique = [];
  for (const [question, reponse] of [['Combien de temps cela doit-il durer ?', 'deux heures'],
                                     ['Quel budget prévoyez-vous ?', 'mille deux cents euros'],
                                     ['À quelle date cela doit-il être prêt ?', 'début mars']]) {
    const rendu = guardFastInteraction(q(question), snap(LISBONNE, historique));
    assert.equal(rendu.type, 'ASK_CLARIFICATION', `tour ${historique.length + 1} : le plan rapide parle`);
    historique = [...historique, { turn: historique.length + 1, question, answer: reponse, provenance: 'user' }];
  }
  assert.equal(historique.length, 3, 'trois tours, aucun appel profond entre eux');
});

/* ==========================================================================
 * V215-09 / 10 / 11 — CE QUI NE SE RÉPARE PAS SE TAIT TOUJOURS
 * ======================================================================= */

test('V215-04 : un manque qui n’est pas de forme n’est jamais « réparé »', () => {
  /* Une question méta, une question déjà répondue, un matériau déjà fourni : trois refus qui ne se
     réduisent pas, parce que le défaut n'est pas dans la forme. */
  assert.deepEqual(guardFastInteraction({ ...q('Quel type de résultat souhaitez-vous obtenir ?'), question_focus: 'output_specification' }, snap(LISBONNE)),
    SILENT_INTERACTION, 'une question méta se tait');
  const dejaPosee = 'Combien de temps cela doit-il durer ?';
  const histo = [{ turn: 1, question: dejaPosee, answer: 'deux heures', provenance: 'user' }];
  assert.deepEqual(guardFastInteraction(q(dejaPosee), snap(LISBONNE, histo)), SILENT_INTERACTION,
    'une question déjà répondue se tait');
  const avecMateriau = createTurnSnapshot({ turn_id: 1, original_request: 'Corrige ce texte.', material_present: true });
  assert.deepEqual(guardFastInteraction(q('Quel texte souhaitez-vous que je corrige ?'), avecMateriau),
    SILENT_INTERACTION, 'un matériau fourni fait taire la demande de matériau');
  /* Et le repli générique de la frontière n’est JAMAIS employé sur le chemin rapide. */
  const composition = politique.slice(politique.indexOf('export function guardFastInteraction'),
    politique.indexOf('export function guardDisplayedQuestion'));
  assert.equal(/SAFE_FALLBACK_QUESTION/.test(composition), false,
    'fabriquer une question sur le chemin rapide serait inventer un besoin');
  assert.match(composition, /if \(garde\.verdict === 'REDUCED'\)/);
});

test('V215-09 / V215-10 / V215-11 : aucun domaine, aucun slot, aucune autorité nouvelle', () => {
  const code = politique.split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');
  for (const domaine of ['voyage', 'lisbonne', 'hébergement', 'itinéraire', 'réunion', 'présentation',
                         'collaborateur', 'auditoire', 'infirmi', 'budget', 'durée']) {
    assert.equal(new RegExp(`\\b${domaine}`, 'i').test(code), false, `« ${domaine} » interdit dans le garde`);
  }
  assert.equal(/SLOTS|QUESTIONS_PAR|SCENARIOS|QUESTIONNAIRE|DOMAINES/i.test(politique), false);
  /* La composition ne crée aucune autorité : elle appelle deux fonctions qui existaient déjà. */
  const composition = politique.slice(politique.indexOf('export function guardFastInteraction'),
    politique.indexOf('export function guardDisplayedQuestion'));
  assert.match(composition, /assessSolicitation\(/);
  assert.match(composition, /guardDisplayedQuestion\(/);
  assert.equal(/class |new Map|new Set|globalThis|let etat|state =/.test(composition), false,
    'aucun état, aucune machine, aucun registre');
});

/* ==========================================================================
 * V215-12 / 13 — LE SILENCE RESTE POSSIBLE, ET IL SE JUSTIFIE
 * ======================================================================= */

test('V215-12 / V215-13 : le silence reste atteignable, et son motif est observable', () => {
  /* Un type non sollicitant traverse : le plan rapide n'est pas forcé de parler. */
  const attente = { type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Validation approfondie nécessaire.' };
  assert.deepEqual(guardFastInteraction(attente, snap(LISBONNE)), attente);
  /* Une question irréductible se tait. « Quoi ? » ne conviendrait pas comme exemple : elle est pauvre,
     mais formellement atomique — le garde juge la FORME, jamais la qualité. Un catalogue sans tête
     interrogative récupérable, en revanche, ne se réduit pas. */
  const irreductible = q('Itinéraire, recommandations, liste de contrôle, ou autre chose ?');
  assert.equal(isAtomicQuestion(irreductible.text), false);
  assert.deepEqual(guardFastInteraction(irreductible, snap(LISBONNE)), SILENT_INTERACTION);
  assert.match(worker, /core_escalation_reason: silence \? \(refuse \? `GUARD_\$\{refus\.verdict\}` : "MODEL_RETURNED_WAIT"\) : null/,
    'le motif du silence est enregistré, et il distingue le modèle du garde');
  /* V2.2 A RETIRÉ LA REVENDICATION, PAS LE COMPORTEMENT. Cette consigne affirmait « VOUS TERMINEZ LA
     CLARIFICATION » : c'était le plan rapide se déclarant propriétaire de la fin du dialogue, ce que
     l'orchestration V2.2 lui refuse. Ce qui subsiste est l'obligation d'appliquer la doctrine
     MAINTENANT au lieu de la déléguer — la même retenue, sans la revendication d'autorité. */
  assert.equal(FAST_INTERACTION_SYSTEM_PROMPT.includes('VOUS TERMINEZ LA CLARIFICATION'), false,
    'le plan rapide ne se déclare plus propriétaire de la fin de la clarification');
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /La doctrine ci-dessous n'est pas la vôtre/);
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /Demander une précision est le dernier recours, jamais le premier/);
  /* Et WAIT reste réservé aux cas réellement profonds, nommés depuis V2.1.2. */
  assert.match(FAST_INTERACTION_SYSTEM_PROMPT, /WAIT_FOR_DEEP_VALIDATION est EXCEPTIONNEL/);
});

/* ==========================================================================
 * V215-06 / 07 — LE PLAN PROFOND NE ROUVRE PLUS LA CLARIFICATION
 * ======================================================================= */

test('V215-06 / V215-07 : le Core contractualise, et sa consigne le lui dit', () => {
  assert.match(CORE_SYSTEM_PROMPT, /VOTRE PLACE DANS LE PARCOURS/);
  assert.match(CORE_SYSTEM_PROMPT, /Quand vous êtes\s+appelé, cette phase est terminée/);
  assert.match(CORE_SYSTEM_PROMPT, /clarification_required reste possible, mais il est EXCEPTIONNEL/);
  assert.match(CORE_SYSTEM_PROMPT, /Une information simplement absente\s+n'en est pas un cas/);
  /* Les voies de substitution sont nommées : décider, estimer, scénariser, conditionner, laisser. */
  for (const voie of ['décidez-la', 'estimez-la', 'par scénario', 'conditionnez-la', 'explicitement inconnue']) {
    assert.ok(CORE_SYSTEM_PROMPT.includes(voie), `« ${voie} » reste une issue offerte au Core`);
  }
  /* Le contrat technique n'a PAS été amputé : `clarification_required` demeure un état légitime, et
     une incohérence grave reste exprimable par `blocked`. Ce lot rend le chemin exceptionnel, il ne
     le supprime pas. */
  assert.match(CORE_SYSTEM_PROMPT, /- blocked :/);
  /* Et la réouverture est RELEVÉE, pour que la règle soit vérifiable au lieu d'être supposée. */
  assert.match(orchestrateur, /event: "core_clarification_after_ready"/);
  assert.match(orchestrateur, /state: resultat\.turn\.state/);
  assert.match(orchestrateur, /clarification_history_length:/);
  const bloc = orchestrateur.slice(orchestrateur.indexOf('event: "core_clarification_after_ready"') - 900,
    orchestrateur.indexOf('event: "core_clarification_after_ready"') + 400);
  assert.equal(/next_question\.text|\.text\b/.test(bloc), false, 'aucun texte de question journalisé');
  /* Et le relevé ne fait pas de l'orchestrateur une seconde autorité : il rapporte l'état prononcé,
     il ne le nomme pas (ORCH01-21b). C'est la lecture du journal qui conclut à la réouverture. */
  const sansCommentaires = orchestrateur.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(sansCommentaires.includes('clarification_required'), false,
    'le relevé ne nomme aucun état : seule l’autorité les prononce');
});

/* ==========================================================================
 * V215-17 / 18 — CE QUI EST GELÉ PAR LES LOTS PRÉCÉDENTS
 * ======================================================================= */

test('V215-17 : la haute disponibilité du Core (V2.1.4) est intacte', () => {
  assert.deepEqual([...CORE_PROVIDER_ORDER], ['anthropic', 'openai']);
  assert.deepEqual([...ROLE_PROVIDER_ORDER], ['anthropic'], 'le trio historique reste inchangé');
  assert.deepEqual([...resolveProviderOrderForRole('core', {})], ['anthropic', 'openai']);
  assert.deepEqual([...resolveProviderOrderForRole('analyst', {})], ['anthropic']);
  assert.equal(/REPRISE_ROLE_MAX|avecRepriseQuandLaChaineEstSeule/.test(worker), false,
    'aucune reprise du même fournisseur');
});

test('V215-18 : la reprise manuelle reste « plan profond seul »', () => {
  assert.match(html, /return oprieRunTurn\(adpState\.requestedMode\|\|'rapide',\{coreOnly:true\}\);/);
  const tour = html.slice(html.indexOf('async function oprieRunTurn('), html.indexOf('const deepPromise=oprieRequestTurn(seq)'));
  assert.equal((tour.match(/oprieStartFastPlane\(/g) || []).length, 1);
  assert.match(tour, /if\(coreOnly\)\{/);
});

/* ==========================================================================
 * V215-19 / 20 / 21 / 22 — LE CONTRAT RICHE ET LES ACQUIS
 * ======================================================================= */

test('V215-19 / 20 / 21 / 22 : JSON 3.4, ADN, compilateur et acquis BETA intacts', () => {
  assert.match(html, /"\$id":"analyse-llm-v3-4"/);
  assert.match(html, /"version":\{"type":"string","const":"3\.4"\}/);
  for (const section of ['comprehension', 'evaluation', 'strategie', 'livrable', 'compilation',
                         'verification', 'apprentissage']) {
    assert.match(html, new RegExp(`"${section}"`));
  }
  /* Acquis BETA-04 : un seul écrivain de remise à zéro, la touche Entrée, la reprise après panne. */
  assert.equal((html.match(/function v11ForgetDialogue\(/g) || []).length, 1);
  assert.equal((html.match(/state\.answers\s*=\s*\[\]/g) || []).length, 1);
  assert.match(html, /key\s*===?\s*'Enter'/);
  assert.match(html, /function oprieKeepFailedDialogue\(/);
});

/* ==========================================================================
 * V215-02 / 05 / 08 / 14 — LE FLUX RÉEL, SUR L'ARTEFACT SERVI
 *
 * Ce harnais exécute le code de production découpé dans l'artefact — le bloc pilote, `answerQuestion`
 * et la ligne d'écoute du bouton — et intercepte les fetchs. Il répond à la seule question qui
 * compte : dans quel ORDRE les deux points d'entrée sont-ils appelés ?
 * ======================================================================= */

function tranche(debut, fin, quoi) {
  const a = html.indexOf(debut);
  const b = html.indexOf(fin, a + debut.length);
  assert.ok(a >= 0 && b > a, `V215 : ${quoi} introuvable dans l'artefact`);
  return html.slice(a, b);
}
const LIGNE_ECOUTE = (html.match(/\$\('#v11-answer-continue'\)\.addEventListener\('click',[^\n]*\);/) || [])[0];
const FAST_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/fast-interaction';
const OPRIE_ENDPOINT = 'https://atelier-decision-groq.11drumboy11.workers.dev/operational-request';

const tourProfond = (state, extra = {}) => ({
  state,
  operational_request_candidate: { objective: 'O.', expected_deliverable: 'Un plan structuré.' },
  issues: [], next_question: null, confirmation_reason: null, blocked_reason: null,
  intent_preservation: { objective_preserved: true, priorities_preserved: true, semantic_equivalence: true, concerns: [] },
  reason: 'Motif.', ...extra
});

/** Joue un dialogue complet : le plan rapide pose N questions, puis accuse réception. */
function jouerDialogue({ demande, questions, deep }) {
  const reseau = [];
  const ecouteurs = new Map();
  const dom = new Map();
  const el = (id) => {
    if (!dom.has(id)) {
      dom.set(id, { value: '', textContent: '', disabled: false, innerHTML: '',
        addEventListener(t, h) { ecouteurs.set(`${id}:${t}`, h); },
        click() { const h = ecouteurs.get(`${id}:click`); if (h) return h(); },
        focus() {}, appendChild() {} });
    }
    return dom.get(id);
  };
  const json = (p, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { 'content-type': 'application/json' } });
  let indexQuestion = 0;
  let indexProfond = 0;
  const horsBloc = [];
  const contexte = {
    AbortController, Date, setTimeout, clearTimeout, performance: { now: () => Date.now() },
    console: { warn() {}, error() {}, log() {} },
    fetch: async (url) => {
      const cible = String(url);
      if (cible === FAST_ENDPOINT) {
        reseau.push('FAST');
        const suivante = questions[indexQuestion];
        indexQuestion += 1;
        return json(suivante
          ? { type: 'ASK_CLARIFICATION', text: suivante }
          : { type: 'ACKNOWLEDGE', text: 'Bien reçu.' });
      }
      if (cible === OPRIE_ENDPOINT) {
        reseau.push('CORE');
        const r = deep[Math.min(indexProfond, deep.length - 1)];
        indexProfond += 1;
        return json(r);
      }
      throw new Error(`point d'entrée inattendu : ${cible}`);
    },
    $: el,
    state: { answers: [], docs: [], dialogueRequest: null },
    adpState: { pendingQuestion: false, clarifications: 0, requestedMode: 'rapide', returnFocus: null },
    materialText: () => '', toast() {}, show() {}, renderFiles() {},
    v11ShowRapidGate() {}, v11AbandonGovernedTurn() {},
    adpRunRapide(...a) { horsBloc.push(['adpRunRapide', a.length]); },
    adpEnterArchitecte(...a) { horsBloc.push(['adpEnterArchitecte', a.length]); },
    adpEnterAtelier(...a) { horsBloc.push(['adpEnterAtelier', a.length]); },
    beginExchange() { horsBloc.push(['beginExchange', 0]); },
    v11SwitchToArchitecteFromRapid() { horsBloc.push(['v11SwitchToArchitecteFromRapid', 0]); },
    syncLegacy(...a) { horsBloc.push(['syncLegacy', a.length]); },
    adpCancelClarification() { horsBloc.push(['adpCancelClarification', 0]); },
    adpContinueArchitecte() { horsBloc.push(['adpContinueArchitecte', 0]); },
    compositeDemand: () => 'demande composite',
    v11ShowExchange() {}, updateExchangeStatus() {},
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
    document: {
      querySelector: (s) => (s.includes('operational-request') ? { content: OPRIE_ENDPOINT }
        : s.includes('fast-interaction') ? { content: FAST_ENDPOINT } : null),
      /* `oprieAsk` construit les puces de réponse : sans `createElement`, il lève, le plan rapide est
         réputé muet et le tour escalade — ce qui masquerait précisément le défaut mesuré. */
      createElement: () => ({ textContent: '', className: '', type: '', dataset: {},
        addEventListener() {}, appendChild() {}, setAttribute() {} })
    },
    window: {}
  };
  contexte.globalThis = contexte;
  vm.runInNewContext([
    tranche('const OPRIE_STATES=', 'function v11SwitchToArchitecteFromRapid', 'bloc pilote'),
    tranche('function answerQuestion(answer){', 'function v11ForgetDialogue(){', 'handler de réponse'),
    LIGNE_ECOUTE
  ].join('\n'), contexte);
  el('#v11-demande').value = demande;
  /* Le clic enchaîne le tour suivant sans l'attendre : on laisse la micro-tâche se terminer. */
  const laisserFinir = () => new Promise((resoudre) => setTimeout(resoudre, 0));
  return { contexte, reseau, horsBloc, el, laisserFinir, bouton: el('#v11-answer-continue') };
}

test('V215-02 / V215-05 / V215-08 / V215-14 : le flux réel appelle FAST jusqu’à READY, puis CORE une fois', async () => {
  const h = jouerDialogue({
    demande: LISBONNE,
    questions: ['Combien de temps cela doit-il durer ?',
                'Quel budget total prévoyez-vous ?',
                'Depuis quelle ville partez-vous ?'],
    deep: [tourProfond('operational_request_ready')]
  });
  /* Le flux réel : UN démarrage, puis chaque réponse enchaîne le tour suivant d'elle-même. */
  await h.contexte.oprieRunTurn('rapide');
  for (let i = 0; i < 3; i += 1) {
    h.el('#v11-answer').value = `réponse ${i + 1}`;
    await h.bouton.click();
    await h.laisserFinir();
  }

  /* AUCUN appel profond avant l'accusé de réception. */
  const avantAccuse = h.reseau.slice(0, h.reseau.lastIndexOf('FAST') + 1);
  assert.equal(avantAccuse.includes('CORE'), false, 'core_called_before_ready = false');
  /* Et exactement UN appel profond, à la fin. */
  assert.equal(h.reseau.filter((x) => x === 'CORE').length, 1, 'un seul appel profond nominal');
  assert.equal(h.reseau[h.reseau.length - 1], 'CORE', 'et il vient après la readiness');
  /* Le nombre de questions rapides est celui du dialogue, pas un de plus. */
  assert.equal(h.reseau.filter((x) => x === 'FAST').length, 4, 'trois questions, puis l’accusé');
  assert.equal(h.contexte.state.answers.length, 3, 'les trois réponses ont bien été portées au dossier');
  /* La séquence interdite n’apparaît nulle part. */
  assert.equal(h.reseau.join(',').includes('CORE,FAST'), false,
    'jamais FAST → CORE → FAST : le plan profond n’est pas un moteur de clarification');
});

test('V215-15 / V215-16 : présentation et réunion n’appellent aucun plan profond avant la readiness', async () => {
  for (const demande of [PRESENTATION, REUNION]) {
    const h = jouerDialogue({
      demande,
      questions: ['Quel est le niveau de connaissance de votre auditoire ?'],
      deep: [tourProfond('operational_request_ready')]
    });
    await h.contexte.oprieRunTurn('rapide');
    h.el('#v11-answer').value = 'une réponse';
    await h.bouton.click();
    await h.laisserFinir();
    const avant = h.reseau.slice(0, h.reseau.lastIndexOf('FAST') + 1);
    assert.equal(avant.includes('CORE'), false, `${demande.slice(0, 28)}… : aucun plan profond avant la readiness`);
    assert.equal(h.reseau.filter((x) => x === 'CORE').length, 1, 'un seul appel profond');
    assert.equal(h.reseau[h.reseau.length - 1], 'CORE');
  }
});
