/* CONTINUITE-03 — ÉDITER LA DEMANDE N'EST PLUS UNE NOUVELLE DEMANDE
 * ============================================================================
 *
 * CE QUE BETA-04 AVAIT INSTALLÉ. Le gestionnaire `input` de #v11-demande devinait une nouvelle
 * demande à partir d'une frappe : dès que le texte différait de la demande à laquelle le dialogue
 * était attaché, il appelait v11AbandonGovernedTurn() PUIS v11ForgetDialogue() — l'historique de
 * clarification disparaissait sur une faute corrigée comme sur un vrai changement de sujet.
 *
 * CE QUE CONTINUITE-01 A CHANGÉ. La personne dispose d'une action explicite « Nouvelle demande »
 * (deux boutons, une fonction : resetAll) et d'une action « Continuer cette demande ». Deviner n'a
 * plus d'objet ; une supposition ne peut pas fonder un effacement.
 *
 * LA DISTINCTION QUE CE FICHIER PROUVE. Deux choses vivaient dans le même geste :
 *   - annuler un TOUR EN VOL devenu obsolète (transports, numéro de tour, question en attente) —
 *     cela reste, et s'observe ici sur le pilote réel ;
 *   - oublier l'HISTORIQUE DURABLE — cela part. v11ForgetDialogue reste l'unique écrivain de
 *     l'effacement, avec un seul appelant : resetAll.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html, loadPilot, arbiterTurn, clarificationTurn, delay } from './perf04-frontend-harness.helper.mjs';

const tranche = (a, b) => {
  const i = html.indexOf(a); const j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`tranche introuvable : ${a} → ${b}`);
  return html.slice(i, j);
};
const sansProse = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const plain = (v) => JSON.parse(JSON.stringify(v));
const INIT = tranche('function init(){', 'if(document.readyState===');
const KEY = 'atelier.v11.session';

/** Le gestionnaire `input` de #v11-demande, extrait TEL QU'ÉCRIT dans init — jamais réécrit ici. */
const GESTIONNAIRE = (() => {
  const m = sansProse(INIT).match(/\$\('#v11-demande'\)\.addEventListener\('input',(\(\)=>\{[\s\S]*?\n\s*\})\);/);
  if (!m) throw new Error('gestionnaire d’édition introuvable');
  return m[1];
})();

/** Un sessionStorage simulé, pour CONTINUITE-02. */
function faireStockage() {
  const zone = new Map();
  return { zone, coffre: {
    lire(z, k) { return zone.has(k) ? zone.get(k) : null; }, ecrire(z, k, v) { zone.set(k, String(v)); return true; },
    effacer(z, k) { zone.delete(k); }, disponible() { return true; } } };
}

/** La page à froid : reset, continuation, persistance, et le gestionnaire d'édition — code réel, DOM espion. */
function chargerPage({ stockage = faireStockage() } = {}) {
  const source = tranche('function v11ForgetDialogue(){', '/* GENERATED — LOT 10G.3B.3F.2')
    + '\n' + tranche('function show(id,focusTarget){', 'function toast(')
    + '\n' + tranche('function renderFiles(){', 'function looksLikeAnalysis(');
  const spy = { turns: [], toasts: [], shown: [], gate: [], abandons: 0 };
  const dom = new Map();
  const el = (id) => {
    if (!dom.has(id)) dom.set(id, { value: '', textContent: '', hidden: true, placeholder: '', innerHTML: '', dataset: {}, attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, focus() {}, appendChild() {} });
    return dom.get(id);
  };
  const context = {
    state: { docs: [], answers: [], lastRequest: null, analysis: null, exchangeId: null, requestName: 'demande-pour-ia.json', responseName: 'reponse-de-ia.json' },
    oprieState: { running: false, retryTurn: false, turnExplicitUnknownIds: [], pendingDeterminantId: null, seq: 0, controller: null, fastController: null },
    adpState: { pendingQuestion: false, clarifications: 0, lastEnvelope: null, requestedMode: 'architecte', returnFocus: null },
    coffre: stockage.coffre, modeSensible: false,
    $: el, toast: (m) => spy.toasts.push(m), scrollToActive() {}, escapeHtml: (x) => String(x ?? ''),
    document: { createElement: () => ({ className: '', innerHTML: '', querySelector: () => ({ addEventListener() {} }) }) },
    syncLegacy() {}, v11ShowRapidGate: (d) => spy.gate.push(d),
    /* L'abandon RÉEL est éprouvé sur le pilote (T8) ; ici il est espionné, et dit s'il y avait un vol. */
    v11AbandonGovernedTurn() { spy.abandons += 1; const enVol = context.oprieState.running; context.oprieState.running = false; return enVol; },
    oprieRunTurn: (m, o) => { spy.turns.push({ mode: m, options: o || null }); return true; },
    beginExchange() {}, v11ModeUsesGovernedPipeline: () => true,
    window: {}, TextEncoder, Date, JSON, Number, Array, Object
  };
  context.oprieOriginalRequest = () => String(el('#v11-demande').value || '').trim();
  vm.runInNewContext(source + `
;globalThis.__edit=${GESTIONNAIRE};
globalThis.__v11={resetAll,v11ForgetDialogue,v11SessionSave,v11SessionRestore,v11OpenContinuation,v11ChooseContinuation,v11SubmitContinuation,v11ContinueWithoutAddition,v11AddPastedMaterial,show,renderFiles};`, context);
  /* show() est espionné en plus d'être exécuté. */
  const show = context.__v11.show; context.show = (id, f) => { spy.shown.push(id); return show(id, f); };
  return { v: context.__v11, edit: context.__edit, ctx: context, spy, el, stockage,
    brut: () => stockage.zone.get(KEY) ?? null, snap: () => JSON.parse(stockage.zone.get(KEY)) };
}

/* La situation du mandat : une demande, une clarification posée et répondue, un matériau, un prompt. */
function dialogueEtabli(h) {
  h.el('#v11-demande').value = 'Prépare un voyage de dix jours en Italie.';
  h.ctx.state.dialogueRequest = 'Prépare un voyage de dix jours en Italie.';
  h.ctx.state.answers.push({ question: 'Quel est votre budget ?', answer: 'Deux mille euros.', missing_determinant_id: 'budget' });
  h.v.v11AddPastedMaterial('Itinéraire proposé par votre IA.');
  h.el('#v11-final').value = 'PROMPT FINAL';
  h.ctx.show('#v11-ready');
}
/* La frappe : la valeur change, puis le gestionnaire `input` court — une affectation ne le déclenche pas. */
function frapper(h, texte) { h.el('#v11-demande').value = texte; h.edit(); }

/* ==========================================================================
 * T1 → T4 — ÉDITER CONSERVE
 * ======================================================================= */

test('T1 · EDIT_DOES_NOT_FORGET : historique présent, demande modifiée → state.answers intact, aucune purge, aucun tour', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  assert.deepEqual(plain(h.ctx.state.answers), [{ question: 'Quel est votre budget ?', answer: 'Deux mille euros.', missing_determinant_id: 'budget' }], 'l’historique reste');
  assert.equal(h.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.', 'la demande d’attache n’est plus remise à null par une frappe');
  assert.deepEqual(h.spy.turns, [], 'aucune analyse automatique');
  assert.equal(h.spy.abandons, 1, 'l’abandon est demandé — et ne fait rien, rien n’étant en vol');
  assert.deepEqual(h.spy.shown, ['#v11-ready', null], 'le résultat du texte précédent n’est plus présenté comme courant (clôture CONTINUITE-03)');
  assert.equal(h.el('#v11-final').value, 'PROMPT FINAL', 'le TEXTE du prompt déjà produit n’est pas détruit');
  assert.equal(h.el('#v11-ready').hidden, true, 'mais il n’est plus exposé comme résultat courant');
  /* Et dix frappes de plus ne changent rien non plus. */
  for (const t of ['P', 'Pr', 'Pré', 'Prépare un voyage de douze jours en Italie, en train.']) frapper(h, t);
  assert.equal(h.ctx.state.answers.length, 1);
  /* Le tour suivant, lancé EXPLICITEMENT, reçoit la demande courante, l'historique et les matériaux. */
  h.v.v11OpenContinuation(); h.v.v11ChooseContinuation('precision');
  h.el('#v11-continue-text').value = 'Douze jours, donc.'; assert.equal(h.v.v11SubmitContinuation(), true);
  assert.deepEqual(plain(h.spy.turns), [{ mode: 'architecte', options: null }]);
  assert.equal(h.ctx.oprieOriginalRequest(), 'Prépare un voyage de douze jours en Italie, en train.');
  assert.equal(h.ctx.state.answers.length, 2); assert.equal(h.ctx.state.docs.length, 1);
});

test('T2 · EDIT_DOES_NOT_DROP_DOCS : matériau présent, demande modifiée → state.docs intact', () => {
  const h = chargerPage(); dialogueEtabli(h);
  h.ctx.state.docs.push({ name: 'contrat.pdf', type: 'application/pdf', size: 10, text: '', external: true });
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  assert.deepEqual(plain(h.ctx.state.docs).map((d) => d.name), ['Réponse IA — cycle 1.txt', 'contrat.pdf']);
  /* La zone de continuation appartenait au résultat retiré : elle se referme avec lui ; ce qu'elle
     avait ingéré (state.docs) reste. */
  assert.equal(h.el('#v11-continue-panel').hidden, true);
  assert.equal(h.ctx.state.docs.length, 2);
});

test('T3 · EDIT_UPDATES_SESSION : la demande modifiée est photographiée par CONTINUITE-02, avec l’historique', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  h.v.v11SessionSave(); /* ce que la sauvegarde différée de CONTINUITE-02 fait 800 ms après la frappe */
  const s = h.snap();
  assert.equal(s.ui.demande, 'Prépare un voyage de douze jours en Italie.');
  assert.equal(s.state.answers.length, 1); assert.equal(s.state.docs.length, 1);
  assert.equal(s.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  assert.equal(s.ui.finalPrompt, 'PROMPT FINAL');
  assert.match(INIT, /\$\('#v11-demande'\)\.addEventListener\('input',\(\)=>\{clearTimeout\(v11SessionMinuteur\);v11SessionMinuteur=setTimeout\(v11SessionSave,800\)\}\);/);
});

test('T4 · REFRESH_AFTER_EDIT : nouvelle demande et historique restaurés ensemble, sans reset ni duplication', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.'); h.v.v11SessionSave();
  const apres = chargerPage({ stockage: h.stockage });
  assert.equal(apres.v.v11SessionRestore(), true);
  assert.equal(apres.el('#v11-demande').value, 'Prépare un voyage de douze jours en Italie.');
  assert.equal(apres.ctx.state.answers.length, 1); assert.equal(apres.ctx.state.docs.length, 1);
  assert.equal(apres.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.', 'la demande d’attache voyage telle quelle');
  assert.deepEqual(apres.spy.turns, []);
  /* Éditer encore après la reprise : toujours rien d'effacé. */
  frapper(apres, 'Prépare un voyage de douze jours en Italie, en train.');
  assert.equal(apres.ctx.state.answers.length, 1);
});

/* ==========================================================================
 * T5 → T7 — NOUVELLE DEMANDE, ELLE, EFFACE ; ET UN SEUL ÉCRIVAIN
 * ======================================================================= */

test('T5 · NEW_REQUEST_STILL_FORGETS : Nouvelle demande vide tout — runtime et photographie', () => {
  const h = chargerPage(); dialogueEtabli(h); h.v.v11SessionSave();
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  h.v.resetAll();
  assert.deepEqual(plain(h.ctx.state.answers), []); assert.deepEqual(plain(h.ctx.state.docs), []);
  assert.equal(h.ctx.state.dialogueRequest, null); assert.equal(h.el('#v11-demande').value, ''); assert.equal(h.el('#v11-final').value, '');
  assert.equal(h.brut(), null, 'photographie supprimée');
  assert.equal(h.ctx.adpState.pendingQuestion, false); assert.equal(h.ctx.state.exchangeId, null);
});

test('T6 · BOTH_NEW_REQUEST_BUTTONS_PARITY : accueil et panneau final → la même fonction, le même état', () => {
  assert.match(INIT, /\$\('#v11-restart'\)\.addEventListener\('click',resetAll\);/);
  assert.match(INIT, /\$\('#v11-new-request'\)\.addEventListener\('click',resetAll\);/);
  const photo = (h) => JSON.stringify({ a: h.ctx.state.answers, d: h.ctx.state.docs, r: h.ctx.state.dialogueRequest, q: h.el('#v11-demande').value, f: h.el('#v11-final').value, s: h.brut() });
  const a = chargerPage(); dialogueEtabli(a); frapper(a, 'Autre texte.'); a.v.resetAll();
  const b = chargerPage(); dialogueEtabli(b); b.v.v11OpenContinuation(); b.v.resetAll();
  assert.equal(photo(a), photo(b));
});

test('T7 · SINGLE_FORGET_WRITER : v11ForgetDialogue reste l’unique écrivain de state.answers=[] — et n’a plus qu’un appelant', () => {
  assert.equal((html.match(/state\.answers\s*=\s*\[\]/g) || []).length, 1);
  assert.equal((html.match(/function v11ForgetDialogue\(/g) || []).length, 1);
  const appels = [...html.matchAll(/v11ForgetDialogue\(\)/g)].length;
  assert.equal(appels, 2, 'la définition et UN appel');
  assert.match(tranche('function resetAll(){', 'const V11_CONTINUATION_QUESTION='), /v11AbandonGovernedTurn\(\);v11ForgetDialogue\(\);/);
  assert.equal(/v11ForgetDialogue/.test(sansProse(INIT)), false, 'le gestionnaire d’édition n’est plus un appelant');
  /* Le gestionnaire tel qu'écrit : il annule, il n'oublie pas. */
  assert.equal(/v11ForgetDialogue|state\.answers|state\.docs|dialogueRequest\s*=(?!=)/.test(GESTIONNAIRE), false, 'il ne lit ni n’écrit l’historique, les documents, la demande d’attache');
  assert.match(GESTIONNAIRE, /const enVol=v11AbandonGovernedTurn\(\);/);
  assert.match(GESTIONNAIRE, /if\(enVol\|\|question\|\|resultat\)\{/);
  assert.match(GESTIONNAIRE, /v11ShowRapidGate\(resultat\?V11_RESULT_OUTDATED_GATE:null\);/);
});

/* ==========================================================================
 * T8 — ÉDITER PENDANT UN TOUR EN VOL : LE TOUR EST ANNULÉ, L'HISTORIQUE RESTE
 * ======================================================================= */

/** Le pilote réel, augmenté de l'abandon RÉEL (MODE-04) et du gestionnaire d'édition RÉEL. */
function piloteAvecEdition(options) {
  const p = loadPilot(options);
  p.ctx.window = {};
  /* Hors de la tranche pilote : le bandeau (constante réelle, relue dans la page) et la fermeture de la
     zone de continuation (espionnée : elle est éprouvée ailleurs). */
  const constante = html.match(/const V11_RESULT_OUTDATED_GATE=Object\.freeze\(\{[\s\S]*?\}\);/)[0];
  p.ctx.v11CloseContinuation = () => { p.spy.closed = (p.spy.closed || 0) + 1; };
  p.ctx.$('#v11-ready').hidden = true; /* l'état initial de la page : le panneau final est caché */
  vm.runInContext(constante + '\n' + tranche('window.__V11_ROUTER__', 'function init()') + `\n;globalThis.__edit=${GESTIONNAIRE};globalThis.__abandon=v11AbandonGovernedTurn;`, p.ctx);
  return { ...p, edit: p.ctx.__edit, abandon: p.ctx.__abandon };
}

test('T8 · ACTIVE_TURN_EDIT : un tour profond en vol est annulé par l’édition, son résultat n’atterrit jamais — et l’historique durable est intact', async () => {
  const historique = [{ question: 'Quel est votre budget ?', answer: 'Deux mille euros.', missing_determinant_id: 'budget' }];
  const p = piloteAvecEdition({ demande: 'Prépare un voyage de dix jours en Italie.', answers: historique,
    fast: () => ({ type: 'WAIT_FOR_DEEP_VALIDATION', text: 'Rien à demander.', question_focus: null, missing_determinant_id: null, explicit_unknown_determinant_ids: [] }),
    deep: async (_, { signal }) => { await delay(120); if (signal && signal.aborted) throw new Error('aborted'); return arbiterTurn('operational_request_ready'); } });
  const tour = p.pilot.oprieRunTurn('architecte');
  await delay(30);
  assert.equal(p.pilot.oprieState.running, true, 'le plan profond est en vol');
  assert.equal(p.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  const seqAvant = p.pilot.oprieState.seq;
  /* La frappe. */
  p.ctx.$('#v11-demande').value = 'Prépare un voyage de douze jours en Italie.';
  p.edit();
  /* A — le TOUR EN VOL est annulé : numéro avancé, transport avorté, verrou relâché, écran rendu. */
  assert.equal(p.pilot.oprieState.seq, seqAvant + 1, 'le numéro de tour avance : tout résultat portant l’ancien est périmé');
  assert.equal(p.pilot.oprieState.running, false); assert.equal(p.pilot.oprieState.controller, null);
  assert.deepEqual(p.spy.shown.slice(-1).map((x) => x.id), [null], 'retour au composeur');
  assert.equal(p.spy.gate.slice(-1)[0].decision, null, 'le bandeau d’analyse s’efface');
  /* B — l'HISTORIQUE DURABLE, lui, est intact. */
  assert.deepEqual(plain(p.ctx.state.answers), historique);
  assert.equal(p.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  /* Le résultat tardif n'atterrit pas : aucune exécution, aucune question, aucun prompt. */
  await tour; await delay(150);
  assert.deepEqual(p.spy.executed, [], 'le READY de l’ancien tour n’a lancé aucune exécution');
  assert.equal(p.ctx.adpState.pendingQuestion, false);
  assert.deepEqual(plain(p.ctx.state.answers), historique, 'toujours intact après l’atterrissage avorté');
  /* Et un nouveau tour, lancé explicitement, part sur le nouveau texte avec l'historique. */
  const nouveau = piloteAvecEdition({ demande: 'Prépare un voyage de douze jours en Italie.', answers: plain(p.ctx.state.answers), deep: () => arbiterTurn('operational_request_ready') });
  await nouveau.pilot.oprieRunTurn('architecte');
  assert.equal(nouveau.spy.deepCalls[0].body.original_request, 'Prépare un voyage de douze jours en Italie.');
  assert.deepEqual(plain(nouveau.spy.deepCalls[0].body.clarification_history).map((t) => t.answer), ['Deux mille euros.']);
});

test('T8b · PENDING_QUESTION_EDIT : une question en attente, née de l’ancien texte, est retirée par l’édition ; l’historique reste', async () => {
  const historique = [{ question: 'Quel est votre budget ?', answer: 'Deux mille euros.', missing_determinant_id: 'budget' }];
  const p = piloteAvecEdition({ demande: 'Prépare un voyage de dix jours en Italie.', answers: historique,
    fast: () => ({ type: 'ASK_CLARIFICATION', text: 'Combien de voyageurs ?', question_focus: 'problem_or_user_context', missing_determinant_id: 'voyageurs', explicit_unknown_determinant_ids: [] }) });
  await p.pilot.oprieRunTurn('architecte');
  assert.equal(p.ctx.adpState.pendingQuestion, true, 'une question attend une réponse');
  assert.equal(p.spy.deepCalls.length, 0, 'aucun plan profond n’est parti (IA-04)');
  p.ctx.$('#v11-demande').value = 'Prépare un voyage de douze jours en Italie.';
  p.edit();
  assert.equal(p.ctx.adpState.pendingQuestion, false, 'la question, née de l’ancien texte, est retirée');
  assert.deepEqual(p.spy.shown.slice(-1).map((x) => x.id), [null]);
  assert.deepEqual(plain(p.ctx.state.answers), historique, 'rien d’effacé : la réponse déjà donnée reste');
  assert.equal(p.pilot.oprieState.running, false);
  /* Sans rien en vol ni en attente, une frappe de plus ne masque plus rien. */
  const affiches = p.spy.shown.length;
  p.ctx.$('#v11-demande').value = 'Prépare un voyage de douze jours en Italie, en train.'; p.edit();
  assert.equal(p.spy.shown.length, affiches, 'aucun show(null) répété à chaque frappe');
});

/* ==========================================================================
 * T9 — AUCUNE HEURISTIQUE
 * ======================================================================= */

test('T9 · NO_HEURISTIC : rien ne devine plus un changement de sujet — ni délai, ni longueur, ni ressemblance', () => {
  const g = GESTIONNAIRE;
  for (const interdit of ['setTimeout', 'setInterval', 'length', 'includes(', 'startsWith', 'indexOf', 'similar', 'distance', 'levenshtein', 'score', 'ratio', 'RegExp', '.match(', '.test(', 'toLowerCase', 'fetch(', 'appelFournisseur']) {
    assert.equal(g.includes(interdit), false, `« ${interdit} » n’a rien à faire dans le gestionnaire d’édition`);
  }
  assert.equal(/(?<![A-Za-z_$\d])\d/.test(g), false, 'aucun seuil (les identifiants v11 ne sont pas des nombres)');
  /* La seule comparaison est une ÉGALITÉ stricte avec la demande d'attache : elle décide s'il y a
     quelque chose à annuler, jamais s'il faut oublier. */
  assert.match(g, /state\.dialogueRequest===oprieOriginalRequest\(\)/);
  assert.equal((g.match(/===|!==/g) || []).length, 1);
  /* state.dialogueRequest garde ses consommateurs : le garde, le tour qui l'écrit, la photographie. */
  assert.match(html, /state\.dialogueRequest=oprieOriginalRequest\(\);/);
  assert.match(html, /dialogueRequest:texte\(state\.dialogueRequest\)\|\|null/);
  assert.match(html, /state\.dialogueRequest=session\.dialogueRequest;/);
});

/* ==========================================================================
 * CLÔTURE — LE PROMPT FINAL DEVENU OBSOLÈTE APRÈS ÉDITION
 * Règle de validité, dérivée et jamais stockée : demande courante === state.dialogueRequest.
 * ======================================================================= */

const BANDEAU = { state: 'improvable', title: 'Demande modifiée',
  text: 'Le résultat précédent ne correspond plus à cette demande. Préparez à nouveau pour obtenir un prompt à jour : vos réponses et vos documents sont conservés.' };

test('T10 · FINAL_BECOMES_STALE_ON_EDIT : Prompt A puis A → A′ — Prompt A n’est plus le résultat courant, tout le reste est conservé', () => {
  const h = chargerPage(); dialogueEtabli(h);
  assert.equal(h.el('#v11-ready').hidden, false, 'Prompt A est présenté');
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  assert.equal(h.el('#v11-ready').hidden, true, 'le panneau final se retire : Copier et Continuer ne sont plus offerts');
  assert.deepEqual(plain(h.spy.gate.slice(-1)), [BANDEAU], 'la personne sait quoi faire');
  assert.equal(h.ctx.state.answers.length, 1); assert.equal(h.ctx.state.docs.length, 1);
  assert.equal(h.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  assert.deepEqual(h.spy.turns, [], 'aucun tour automatique');
  /* Une seconde frappe ne rejoue rien : plus rien n'est présenté, plus rien à retirer. */
  const affiches = h.spy.shown.length, bandeaux = h.spy.gate.length;
  frapper(h, 'Prépare un voyage de douze jours en Italie, en train.');
  assert.equal(h.spy.shown.length, affiches); assert.equal(h.spy.gate.length, bandeaux);
});

test('T11 · FINAL_TEXT_NOT_REQUIRED_TO_BE_DESTROYED : le texte du prompt reste dans #v11-final, mais n’est plus exposé', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  assert.equal(h.el('#v11-final').value, 'PROMPT FINAL', 'artefact conservé, aucune destruction inutile');
  assert.equal(h.el('#v11-ready').hidden, true, 'le seul chemin vers Copier / Continuer est le panneau, et il est retiré');
  /* Sur les octets : le gestionnaire n'écrit plus dans #v11-final, et le bouton Copier ne lit que le
     panneau final — il n'existe aucun autre accès au texte. */
  assert.equal(/#v11-final/.test(GESTIONNAIRE), false);
  assert.match(INIT, /\$\('#v11-copy-final'\)\.addEventListener\('click',\(\)=>copyText\(\$\('#v11-final'\)\.value\)\);/);
  const pret = html.slice(html.indexOf('id="v11-ready"'), html.indexOf('</section>', html.indexOf('id="v11-ready"')));
  assert.ok(pret.includes('id="v11-final"') && pret.includes('id="v11-copy-final"') && pret.includes('id="v11-continue"'), 'texte, Copier et Continuer vivent tous dans le panneau retiré');
});

test('T12 · REPREPARE_AFTER_EDIT : A → Prompt A → A′ → Préparer → Prompt A′ seul résultat courant, historique disponible', async () => {
  const historique = [{ question: 'Quel est votre budget ?', answer: 'Deux mille euros.', missing_determinant_id: 'budget' }];
  const p = piloteAvecEdition({ demande: 'Prépare un voyage de dix jours en Italie.', answers: historique, deep: () => arbiterTurn('operational_request_ready') });
  await p.pilot.oprieRunTurn('architecte');
  assert.equal(p.ctx.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  assert.equal(p.spy.executed.length, 1, 'Prompt A : le tour a atteint l’exécution');
  /* Le panneau final est présenté (ce que l'exécution fait dans la page) ; puis l'édition. */
  p.ctx.$('#v11-ready').hidden = false; p.ctx.$('#v11-final').value = 'PROMPT A';
  p.ctx.$('#v11-demande').value = 'Prépare un voyage de douze jours en Italie.';
  p.edit();
  assert.deepEqual(p.spy.shown.slice(-1).map((x) => x.id), [null]);
  assert.deepEqual(plain(p.spy.gate.slice(-1)[0].decision), BANDEAU);
  assert.deepEqual(plain(p.ctx.state.answers), historique);
  /* Préparer : le tour ordinaire, sur A′, avec l'historique ; le bandeau cède à l'analyse, puis au résultat. */
  await p.pilot.oprieRunTurn('architecte');
  assert.equal(p.spy.deepCalls.length, 2);
  assert.equal(p.spy.deepCalls[1].body.original_request, 'Prépare un voyage de douze jours en Italie.');
  assert.deepEqual(plain(p.spy.deepCalls[1].body.clarification_history).map((t) => t.answer), ['Deux mille euros.']);
  assert.equal(p.ctx.state.dialogueRequest, 'Prépare un voyage de douze jours en Italie.', 'Prompt A′ est désormais le résultat de la demande courante');
  assert.equal(p.spy.executed.length, 2);
  assert.ok(p.spy.gate.some((g) => g.decision && g.decision.state === 'thinking' && g.at > 0), 'le bandeau « Demande modifiée » a cédé la place à l’analyse');
});

test('T13 · NEW_REQUEST_UNCHANGED : Nouvelle demande reste le reset complet — et repart sans bandeau', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.');
  h.v.resetAll();
  assert.deepEqual(plain(h.ctx.state.answers), []); assert.deepEqual(plain(h.ctx.state.docs), []);
  assert.equal(h.el('#v11-demande').value, ''); assert.equal(h.el('#v11-final').value, ''); assert.equal(h.ctx.state.dialogueRequest, null);
  assert.equal(h.brut(), null);
  assert.deepEqual(h.spy.gate.slice(-1), [null], 'aucun bandeau ne survit à une nouvelle demande');
  assert.match(tranche('function resetAll(){', 'const V11_CONTINUATION_QUESTION='), /v11ShowRapidGate\(null\);\n\}/);
});

test('T14 · CONTINUE_UNCHANGED : sans édition, Prompt A → Continuer cette demande → comportement CONTINUITE-01 intact', () => {
  const h = chargerPage(); dialogueEtabli(h);
  assert.equal(h.el('#v11-ready').hidden, false);
  h.v.v11OpenContinuation(); h.v.v11ChooseContinuation('ai_response');
  h.el('#v11-continue-text').value = 'Réponse de mon IA.'; assert.equal(h.v.v11SubmitContinuation(), true);
  assert.deepEqual(h.spy.turns, [], 'coller n’est pas continuer');
  assert.equal(h.el('#v11-continue-panel').dataset.kind, 'precision');
  h.el('#v11-continue-text').value = 'Ajoute un jour à Rome.'; assert.equal(h.v.v11SubmitContinuation(), true);
  assert.deepEqual(plain(h.spy.turns), [{ mode: 'architecte', options: null }]);
  assert.equal(h.ctx.state.answers.length, 2); assert.equal(h.ctx.state.docs.length, 2);
  assert.equal(h.spy.gate.length, 0, 'aucun bandeau : la demande n’a pas changé');
});

test('T15 · REFRESH_AFTER_EDIT : A′ et l’historique restaurés, Prompt A conservé mais pas présenté comme résultat courant', () => {
  const h = chargerPage(); dialogueEtabli(h);
  frapper(h, 'Prépare un voyage de douze jours en Italie.'); h.v.v11SessionSave();
  const s = h.snap();
  assert.equal(s.ui.finalPrompt, 'PROMPT FINAL'); assert.equal(s.ui.demande, 'Prépare un voyage de douze jours en Italie.'); assert.equal(s.state.dialogueRequest, 'Prépare un voyage de dix jours en Italie.');
  assert.deepEqual(Object.keys(s.ui).sort(), ['continuation', 'demande', 'finalPrompt'], 'aucun champ de validité photographié : elle se dérive');
  assert.equal(h.brut().includes('stale'), false);
  const apres = chargerPage({ stockage: h.stockage });
  assert.equal(apres.v.v11SessionRestore(), true);
  assert.equal(apres.el('#v11-demande').value, 'Prépare un voyage de douze jours en Italie.');
  assert.equal(apres.ctx.state.answers.length, 1); assert.equal(apres.ctx.state.docs.length, 1);
  assert.equal(apres.el('#v11-final').value, 'PROMPT FINAL', 'l’artefact revient');
  assert.equal(apres.el('#v11-ready').hidden, true, 'mais pas comme résultat courant');
  assert.equal(apres.spy.shown.includes('#v11-ready'), false);
  assert.deepEqual(plain(apres.spy.gate.slice(-1)), [BANDEAU]);
  assert.equal(apres.el('#v11-continue-panel').hidden, true);
  /* Et sans édition, la reprise présente le résultat, comme avant. */
  const g = chargerPage(); dialogueEtabli(g); g.v.v11SessionSave();
  const gApres = chargerPage({ stockage: g.stockage }); gApres.v.v11SessionRestore();
  assert.equal(gApres.el('#v11-ready').hidden, false); assert.equal(gApres.spy.gate.length, 0);
});

test('T16 · ACTIVE_TURN_EDIT et T17 · NO_FORGET : les acquis de 08b0107f tiennent', () => {
  assert.match(GESTIONNAIRE, /const enVol=v11AbandonGovernedTurn\(\);/);
  assert.match(GESTIONNAIRE, /const resultat=!\$\('#v11-ready'\)\.hidden;/);
  assert.match(GESTIONNAIRE, /if\(enVol\|\|question\|\|resultat\)\{/);
  assert.equal(/v11ForgetDialogue|state\.answers|state\.docs|dialogueRequest\s*=(?!=)/.test(GESTIONNAIRE), false);
  assert.equal([...html.matchAll(/v11ForgetDialogue\(\)/g)].length, 2, 'la définition et resetAll, seul appelant');
  /* La règle de validité n'est pas un état : aucune propriété nouvelle, ni sur state, ni sur oprieState, ni dans la photographie. */
  for (const interdit of ['promptStale', 'stale', 'dirty', 'outdated:', 'resultValid', 'finalValid']) {
    assert.equal(new RegExp(interdit).test(sansProse(tranche('const V11_SESSION_KEY=', '/* GENERATED — LOT 10G.3B.3F.2'))), false, `${interdit} absent`);
  }
  assert.match(html, /const courant=!session\.dialogueRequest\|\|session\.demande\.trim\(\)===session\.dialogueRequest;/);
});
