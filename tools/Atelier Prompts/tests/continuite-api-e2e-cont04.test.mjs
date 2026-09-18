/* CONTINUITE-04 — MODE API BOUT-EN-BOUT : EXÉCUTER LE PROMPT FINAL, RAPPORTER LA RÉPONSE COMME MATÉRIAU
 * ============================================================================
 *
 * AVANT. En mode API, beginApiAnalysis automatisait l'analyse (appel #1, JSON structuré), la
 * validation, l'enrichissement et la compilation — et s'arrêtait à show('#v11-ready'). La personne
 * copiait le prompt, l'exécutait ailleurs, revenait, collait la réponse.
 *
 * APRÈS. Un appel #2 par le MÊME transport (appelFournisseur), même fournisseur, même modèle, le
 * prompt final tel quel, message système neutre déjà employé par le produit, sans schéma. La réponse
 * est montrée, puis ingérée par la MÊME fonction que le collage manuel (v11AddPastedMaterial). Aucun
 * tour OPRIE ne part de lui-même. Péremption par les primitives existantes ; échec = repli manuel.
 *
 * Ce fichier exécute le code de la page, découpé, avec transport, DOM et stockage remplacés par des
 * espions. Le transport est espionné à sa frontière exacte : window.appelFournisseur.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { html, loadPilot, arbiterTurn, delay } from './perf04-frontend-harness.helper.mjs';

const tranche = (a, b) => {
  const i = html.indexOf(a); const j = html.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`tranche introuvable : ${a} → ${b}`);
  return html.slice(i, j);
};
const sansProse = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const plain = (v) => JSON.parse(JSON.stringify(v));
const KEY = 'atelier.v11.session';
const INIT = tranche('function init(){', 'if(document.readyState===');
const EXECUTION = tranche('const V11_EXECUTION_SYSTEM=', 'async function beginApiAnalysis(){');
const ANALYSE = tranche('async function beginApiAnalysis(){', 'function compositeDemand(){');

function faireStockage() {
  const zone = new Map();
  return { zone, coffre: { lire(z, k) { return zone.has(k) ? zone.get(k) : null; }, ecrire(z, k, v) { zone.set(k, String(v)); return true; }, effacer(z, k) { zone.delete(k); }, disponible() { return true; } } };
}

/**
 * La page en mode API : analyse (code réel), exécution (code réel), continuation, persistance, reset.
 * `reponses` : ce que le transport rend, appel après appel — une chaîne, une fonction (async), ou une Error.
 */
function chargerModeApi({ reponses = [], stockage = faireStockage(), sensible = false, demande = 'Rédige un plan de migration en trois étapes.' } = {}) {
  const source = tranche('function v11ForgetDialogue(){', '/* GENERATED — LOT 10G.3B.3F.2')
    + '\n' + tranche('function show(id,focusTarget){', 'function toast(')
    + '\n' + tranche('function renderFiles(){', 'function looksLikeAnalysis(')
    + '\n' + EXECUTION + '\n' + ANALYSE;
  const spy = { appels: [], marks: [], toasts: [], shown: [], scrolled: [], stops: 0, turns: [], gate: [] };
  const dom = new Map();
  const el = (id) => {
    if (!dom.has(id)) dom.set(id, { value: '', textContent: '', hidden: true, placeholder: '', innerHTML: '', dataset: {}, attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, focus() {}, appendChild() {} });
    return dom.get(id);
  };
  el('#v11-demande').value = demande; el('#api-max').value = '8000'; el('#ui-mode-select').value = 'architecte';
  let n = 0;
  const context = {
    state: { docs: [], answers: [], lastRequest: null, analysis: null, exchangeId: null, requestName: 'demande-pour-ia.json', responseName: 'reponse-de-ia.json', dialogueRequest: demande },
    oprieState: { running: false, retryTurn: false, turnExplicitUnknownIds: [], pendingDeterminantId: null, seq: 7, controller: null, fastController: null, canonicalContract: { version: 'c' } },
    adpState: { pendingQuestion: false, clarifications: 0, lastEnvelope: null, requestedMode: 'architecte', returnFocus: null },
    coffre: stockage.coffre, modeSensible: sensible,
    $: el, toast: (m) => spy.toasts.push(m), scrollToActive: (a, b) => spy.scrolled.push([a, b]), escapeHtml: (x) => String(x ?? ''),
    document: { createElement: () => ({ className: '', innerHTML: '', querySelector: () => ({ addEventListener() {} }) }) },
    syncLegacy() {}, v11ShowRapidGate: (d) => spy.gate.push(d),
    oprieRunTurn: (m, o) => { spy.turns.push({ mode: m, options: o || null }); return true; },
    beginExchange() {}, v11ModeUsesGovernedPipeline: () => true,
    oprieMark: (e, d) => spy.marks.push({ event: e, detail: d || null }), oprieSetBusy() {}, adnRuntime: () => ({ usesGovernedPipeline: () => true }),
    adnReadinessInstruction: () => 'READINESS', adnValidatePostOprie: () => ({ ok: true, signals: [], divergences: [] }), adnRetenirValidationPostOprie() {},
    adnEnrichCanonicalWithArch: () => ({ contract: { enriched: true }, signals: [] }), adnMergePostOprieSignals: (a, b) => [...(a || []), ...(b || [])],
    adnShowPostOprieStop: () => { spy.stops += 1; return false; }, adnAppendFinalExecutionDirective: (p) => p + '\n\n## DIRECTIVE FINALE',
    AbortController, TextEncoder, Date, JSON, Number, Array, Object, String,
    window: {
      __ARCHITECTE_V10__: { systeme: 'SYSTEME ANALYSE', schema: { type: 'object' }, contexte: () => ({ demande }), valider: () => [], importer: () => true, analyse: null, compiler: () => 'PROMPT FINAL COMPILÉ' },
      obtenirFournisseurActif: () => 'anthropic', obtenirCleFournisseur: () => 'sk-ant-SECRET-KEY', obtenirModeleActif: (f) => (f === 'architecte-livrable' ? 'modele-configure' : 'modele-configure'),
      appelFournisseur: async (params) => {
        const rang = n++; spy.appels.push({ rang, params: { ...params, cle: params.cle ? '<clé transmise>' : null, signal: !!params.signal } });
        const r = reponses[Math.min(rang, reponses.length - 1)];
        if (typeof r === 'function') return r(params);
        if (r instanceof Error) throw r;
        return { texte: r };
      }
    }
  };
  context.oprieOriginalRequest = () => String(el('#v11-demande').value || '').trim();
  context.oprieState.canonicalContract = { c: 1 };
  vm.runInNewContext(source + `
;globalThis.__v11={beginApiAnalysis,v11ExecuteFinalPromptViaApi,v11ExecutionStatus,resetAll,v11AddPastedMaterial,v11OpenContinuation,v11ChooseContinuation,
  v11SubmitContinuation,v11ContinueWithoutAddition,v11CloseContinuation,v11SessionSave,v11SessionRestore,show,renderFiles,V11_EXECUTION_SYSTEM};`, context);
  const show = context.__v11.show; context.show = (id, f) => { spy.shown.push(id); return show(id, f); };
  return { v: context.__v11, ctx: context, spy, el, stockage, brut: () => stockage.zone.get(KEY) ?? null, snap: () => JSON.parse(stockage.zone.get(KEY)) };
}
const ANALYSE_JSON = JSON.stringify({ version: '3.4', comprehension: {}, evaluation: {}, strategie: {}, compilation: {} });

/* ==========================================================================
 * T1 → T3 — DEUX APPELS, UN TRANSPORT, LE SECOND SANS SCHÉMA
 * ======================================================================= */

test('T1 · API_ANALYSIS_THEN_EXECUTION : appel #1 structuré → compilation → appel #2 texte, prompt final tel quel', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan en trois étapes.'] });
  await h.v.beginApiAnalysis();
  assert.equal(h.spy.appels.length, 2);
  const [a1, a2] = h.spy.appels.map((a) => a.params);
  assert.equal(a1.schema.type, 'object'); assert.equal(a1.effort, 'high'); assert.match(a1.systeme, /^SYSTEME ANALYSE/);
  assert.equal(h.el('#v11-final').value, 'PROMPT FINAL COMPILÉ\n\n## DIRECTIVE FINALE');
  assert.equal(a2.contenuUtilisateur, 'PROMPT FINAL COMPILÉ\n\n## DIRECTIVE FINALE', 'le prompt final, directive comprise, tel quel');
  assert.equal(a2.systeme, 'Répondez directement et complètement au prompt suivant.', 'le message système neutre que le produit emploie déjà');
  assert.equal(h.v.V11_EXECUTION_SYSTEM, a2.systeme);
  assert.match(html, /systeme:'Répondez directement et complètement au prompt suivant\.',contenuUtilisateur:prompt\}\);/, 'même phrase qu’Architecte Pro : aucune consigne nouvelle');
  assert.ok(h.spy.shown.indexOf('#v11-ready') >= 0 && h.spy.shown.indexOf('#v11-api-progress') < h.spy.shown.indexOf('#v11-ready'));
});

test('T2 · SAME_PROVIDER_ABSTRACTION : les deux appels passent par appelFournisseur, même fournisseur, même modèle, même clé lue par la mécanique existante', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Réponse.'] });
  await h.v.beginApiAnalysis();
  const [a1, a2] = h.spy.appels.map((a) => a.params);
  assert.equal(a1.fournisseur, 'anthropic'); assert.equal(a2.fournisseur, 'anthropic');
  assert.equal(a1.modele, 'modele-configure'); assert.equal(a2.modele, 'modele-configure', 'la finalité « livrable » résout sur le même réglage');
  assert.equal(a1.cle, '<clé transmise>'); assert.equal(a2.cle, '<clé transmise>');
  assert.equal(a1.maxTokens, a2.maxTokens);
  assert.equal(a2.signal, true, 'l’appel #2 est annulable');
  /* Aucun transport parallèle, aucun fetch direct, aucun nom de fournisseur ni de modèle en dur. */
  const code = sansProse(EXECUTION);
  assert.equal(/fetch\(|XMLHttpRequest|api\.anthropic|openai|groq|claude-|gpt-/i.test(code), false);
  assert.match(code, /window\.appelFournisseur\(\{fournisseur,cle,modele,maxTokens:max,systeme:V11_EXECUTION_SYSTEM,contenuUtilisateur:prompt,signal:controller\.signal\}\)/);
  assert.match(sansProse(ANALYSE), /obtenirModeleActif\('architecte-livrable'\)/);
});

test('T3 · NO_JSON_SCHEMA_ON_EXECUTION : l’appel #2 ne demande ni schéma, ni effort, ni JSON, ni échange', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Réponse libre.'] });
  await h.v.beginApiAnalysis();
  const a2 = h.spy.appels[1].params;
  assert.equal('schema' in a2, false); assert.equal('effort' in a2, false); assert.equal('prefill' in a2, false);
  const code = sansProse(EXECUTION);
  for (const interdit of ['schema', 'JSON.parse', 'extractCandidate', 'exchangeId', 'makeEnvelope', 'api.valider', 'api.importer', 'useAnalysis', 'id_echange']) {
    assert.equal(code.includes(interdit), false, `${interdit} absent de l’exécution`);
  }
});

/* ==========================================================================
 * T4 → T8 — INGESTION CANONIQUE, MATÉRIAU, PAS DE TOUR AUTOMATIQUE, AFFICHAGE, SUITE
 * ======================================================================= */

test('T4 · API_RESPONSE_USES_CANONICAL_INGESTION : la même fonction que le collage manuel, et aucune autre', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await h.v.beginApiAnalysis();
  assert.deepEqual(plain(h.ctx.state.docs), [{ name: 'Réponse IA — cycle 1.txt', type: 'text/plain', size: Buffer.byteLength('Voici le plan.'), text: 'Voici le plan.', external: false }]);
  const code = sansProse(EXECUTION);
  assert.match(code, /const doc=v11AddPastedMaterial\(texte\);/);
  assert.equal((code.match(/state\.docs/g) || []).length, 0, 'l’exécution n’écrit jamais state.docs elle-même');
  assert.equal((html.match(/function v11AddPastedMaterial\(/g) || []).length, 1, 'une seule primitive d’ingestion');
  assert.equal(/state\.answers/.test(code), false, 'jamais une parole de la personne');
});

test('T5 · API_RESPONSE_BECOMES_MATERIAL : au tour suivant, la réponse voyage dans material_content, pas dans l’historique', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Je recommande PostgreSQL.'] });
  await h.v.beginApiAnalysis();
  const p = loadPilot({ demande: 'Rédige un plan de migration en trois étapes.', deep: () => arbiterTurn('operational_request_ready') });
  for (const d of plain(h.ctx.state.docs)) p.ctx.state.docs.push(d);
  p.ctx.window = { __ATELIER_ADN_RUNTIME__: { TRANSPORT_LIMITS: { analyst: 16384 } } }; p.ctx.TextEncoder = TextEncoder;
  await p.pilot.oprieRunTurn('architecte');
  const corps = p.spy.deepCalls[0].body;
  assert.deepEqual(plain(corps.material_content), ['Je recommande PostgreSQL.']);
  assert.deepEqual(plain(corps.material_context), { present: true, deep_content_available: true });
  assert.deepEqual(plain(corps.clarification_history), []);
  assert.equal(corps.original_request.includes('PostgreSQL'), false);
});

test('T6 · NO_AUTO_OPRIE_AFTER_RESPONSE : la réponse reçue n’est pas un tour suivant', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Réponse.'] });
  await h.v.beginApiAnalysis();
  assert.deepEqual(h.spy.turns, [], 'aucun oprieRunTurn');
  assert.equal(h.spy.appels.length, 2, 'aucun troisième appel');
  const code = sansProse(EXECUTION);
  assert.equal(/oprieRunTurn|beginExchange|v11ContinueTurn|v11SubmitContinuation|v11ContinueWithoutAddition/.test(code), false);
  /* L'écran est celui d'après un collage : zone ouverte, réponse prise en compte, réanalyse sans ajout offerte. */
  assert.equal(h.el('#v11-continue-panel').hidden, false);
  assert.equal(h.el('#v11-continue-panel').dataset.kind, 'precision');
  assert.equal(h.el('#v11-continue-panel').dataset.ingested, 'Réponse IA — cycle 1.txt');
  assert.equal(h.el('#v11-continue-analyse-only').hidden, false);
});

test('T7 · RESPONSE_VISIBLE : la réponse est montrée sous le prompt, copiable, et retirée avec le panneau', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await h.v.beginApiAnalysis();
  assert.equal(h.el('#v11-execution').hidden, false);
  assert.equal(h.el('#v11-execution-output').value, 'Voici le plan.'); assert.equal(h.el('#v11-execution-output').hidden, false);
  assert.equal(h.el('#v11-copy-execution').hidden, false);
  assert.match(h.el('#v11-execution-status').textContent, /^Réponse reçue et prise en compte \(Réponse IA — cycle 1\.txt\)/);
  assert.equal(h.el('#v11-final').value, 'PROMPT FINAL COMPILÉ\n\n## DIRECTIVE FINALE', 'le prompt reste consultable');
  /* Le motif : dans le panneau final, sous le prompt, avant la zone de continuation. Pas un chat. */
  const pret = html.slice(html.indexOf('id="v11-ready"'), html.indexOf('</section>', html.indexOf('id="v11-ready"')));
  const ordre = ['id="v11-final"', 'id="v11-copy-final"', 'id="v11-execution"', 'id="v11-execution-output"', 'id="v11-copy-execution"', 'id="v11-continue-panel"'].map((x) => pret.indexOf(x));
  assert.ok(ordre.every((i, k) => i >= 0 && (k === 0 || i > ordre[k - 1])));
  assert.match(pret, /<textarea id="v11-execution-output" aria-label="[^"]+" readonly hidden><\/textarea>/);
  assert.match(INIT, /\$\('#v11-copy-execution'\)\.addEventListener\('click',\(\)=>copyText\(\$\('#v11-execution-output'\)\.value\)\);/);
  /* Quitter le panneau final retire la réponse ; un prompt suivant repart sans elle. */
  h.ctx.show('#v11-dialogue');
  assert.equal(h.el('#v11-execution').hidden, true);
  for (const jargon of ['OPRIE', 'material_content', 'provenance', 'canonique', 'readiness']) {
    assert.equal(new RegExp(`\\b${jargon}\\b`).test(pret.slice(pret.indexOf('id="v11-execution"'), pret.indexOf('id="v11-continue-panel"')).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/id="[^"]*"/g, '')), false, `« ${jargon} » absent de l’écran`);
  }
});

test('T8 · CONTINUE_AFTER_API_RESPONSE : une précision ensuite → UN seul tour, avec la réponse ingérée et l’historique', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await h.v.beginApiAnalysis();
  h.el('#v11-continue-text').value = 'Ajoute une étape de test.';
  assert.equal(h.v.v11SubmitContinuation(), true);
  assert.deepEqual(plain(h.spy.turns), [{ mode: 'architecte', options: null }]);
  assert.deepEqual(plain(h.ctx.state.answers).map((a) => a.answer), ['Ajoute une étape de test.']);
  assert.deepEqual(plain(h.ctx.state.docs).map((d) => d.name), ['Réponse IA — cycle 1.txt']);
  /* Ou la réanalyse sans ajout, explicite. */
  const g = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await g.v.beginApiAnalysis();
  assert.equal(g.v.v11ContinueWithoutAddition(), true);
  assert.equal(g.spy.turns.length, 1); assert.deepEqual(plain(g.ctx.state.answers), []);
});

/* ==========================================================================
 * T9 → T12 — ÉCHECS, VIDE, PÉREMPTION, NOUVELLE DEMANDE
 * ======================================================================= */

test('T9 · API_FAILURE_FALLBACK : l’appel #2 échoue → le prompt reste affiché et copiable, la session intacte, le repli manuel dit', async () => {
  const erreur = Object.assign(new Error('HTTP 529'), { message_utilisateur: 'Surcharge côté fournisseur.' });
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, erreur] });
  await h.v.beginApiAnalysis();
  assert.equal(h.el('#v11-ready').hidden, false); assert.equal(h.el('#v11-final').value, 'PROMPT FINAL COMPILÉ\n\n## DIRECTIVE FINALE');
  assert.deepEqual(plain(h.ctx.state.docs), [], 'aucun matériau fabriqué');
  assert.match(h.el('#v11-execution-status').textContent, /^Votre IA n’a pas répondu \(Surcharge côté fournisseur\.\)\. Le prompt reste copiable : exécutez-le vous-même, puis collez la réponse avec « Continuer cette demande »\./);
  assert.equal(h.el('#v11-execution-output').hidden, true);
  assert.deepEqual(h.spy.toasts, [], 'aucune exception brute');
  assert.equal(h.ctx.oprieState.controller, null, 'le contrôleur est relâché');
  /* Le collage manuel reste le repli : même fonction, même résultat. */
  h.v.v11OpenContinuation(); h.v.v11ChooseContinuation('ai_response'); h.el('#v11-continue-text').value = 'Réponse collée à la main.'; h.v.v11SubmitContinuation();
  assert.equal(h.ctx.state.docs[0].name, 'Réponse IA — cycle 1.txt');
  /* Timeout / annulation côté transport : même repli. */
  const t = chargerModeApi({ reponses: [ANALYSE_JSON, Object.assign(new Error('timeout'), { message_utilisateur: 'Délai dépassé.' })] });
  await t.v.beginApiAnalysis();
  assert.match(t.el('#v11-execution-status').textContent, /Délai dépassé/); assert.deepEqual(plain(t.ctx.state.docs), []);
  /* Les relevés disent le type d'appel et l'issue, jamais un texte. */
  const marks = h.spy.marks.map((m) => m.event);
  assert.deepEqual(marks, ['api_execution_start', 'api_execution_end']);
  assert.equal(JSON.stringify(h.spy.marks).includes('PROMPT FINAL'), false);
  assert.equal(h.spy.marks[1].detail.ok, false);
});

test('T10 · EMPTY_RESPONSE : une réponse vide ne devient pas un matériau', async () => {
  for (const vide of ['', '   \n', null, undefined]) {
    const h = chargerModeApi({ reponses: [ANALYSE_JSON, (typeof vide === 'string') ? vide : () => ({ texte: vide })] });
    await h.v.beginApiAnalysis();
    assert.deepEqual(plain(h.ctx.state.docs), [], `vide : ${JSON.stringify(vide)}`);
    assert.match(h.el('#v11-execution-status').textContent, /réponse vide/);
    assert.equal(h.el('#v11-continue-panel').hidden, true, 'rien n’a été ingéré : la zone n’annonce rien');
    assert.equal(h.spy.marks.slice(-1)[0].detail.reason, 'empty');
  }
});

test('T11 · STALE_REQUEST_ABORT : la demande est modifiée pendant l’appel #2 → l’appel est avorté, la réponse tardive ignorée', async () => {
  let resoudre; const tardive = new Promise((r) => { resoudre = r; });
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, (params) => new Promise((res, rej) => {
    params.signal.addEventListener('abort', () => rej(Object.assign(new Error('Annulé.'), { message_utilisateur: 'Annulé.' })));
    tardive.then(() => res({ texte: 'Réponse arrivée trop tard.' }));
  })] });
  const analyse = h.v.beginApiAnalysis();
  await delay(10);
  assert.notEqual(h.ctx.oprieState.controller, null, 'l’appel #2 est en vol, sous le contrôleur du tour');
  /* L'édition : ce que fait le gestionnaire CONTINUITE-03, par la primitive d'abandon RÉELLE. */
  vm.runInContext(tranche('window.__V11_ROUTER__', 'function init()') + ';globalThis.__abandon=v11AbandonGovernedTurn;', h.ctx);
  h.el('#v11-demande').value = 'Rédige un plan de migration en QUATRE étapes.';
  assert.equal(h.ctx.__abandon(), true, 'il y avait quelque chose en vol');
  resoudre();
  await analyse; await delay(10);
  assert.deepEqual(plain(h.ctx.state.docs), [], 'la réponse tardive n’a rien écrit');
  assert.deepEqual(h.spy.marks.map((m) => m.event).filter((e) => e.startsWith('api_')), ['api_execution_start', 'api_execution_discarded']);
  assert.equal(h.el('#v11-continue-panel').hidden, true);
  /* Même sans abandon explicite, une réponse qui arrive après une édition est ignorée par la règle
     de CONTINUITE-03 (demande courante ≠ demande du prompt). */
  let res2; const g = chargerModeApi({ reponses: [ANALYSE_JSON, () => new Promise((r) => { res2 = r; })] });
  const a2 = g.v.beginApiAnalysis(); await delay(10);
  g.el('#v11-demande').value = 'Autre demande.';
  res2({ texte: 'Trop tard.' }); await a2;
  assert.deepEqual(plain(g.ctx.state.docs), []);
  assert.equal(g.spy.marks.slice(-1)[0].event, 'api_execution_discarded');
});

test('T12 · NEW_REQUEST_DURING_EXECUTION : Nouvelle demande pendant l’appel #2 → abort, aucune injection tardive, état vierge', async () => {
  let res; const h = chargerModeApi({ reponses: [ANALYSE_JSON, (params) => new Promise((r, rej) => { params.signal.addEventListener('abort', () => rej(new Error('Annulé.'))); res = r; })] });
  const analyse = h.v.beginApiAnalysis(); await delay(10);
  /* resetAll passe par l'abandon réel du tour : il avorte le contrôleur. */
  vm.runInContext(tranche('window.__V11_ROUTER__', 'function init()') + ';', h.ctx);
  h.v.resetAll();
  await analyse; await delay(10);
  assert.deepEqual(plain(h.ctx.state.docs), []); assert.deepEqual(plain(h.ctx.state.answers), []);
  assert.equal(h.el('#v11-demande').value, ''); assert.equal(h.el('#v11-final').value, '');
  assert.equal(h.brut(), null);
  assert.equal(h.spy.marks.slice(-1)[0].event, 'api_execution_discarded');
  /* Et si le transport n'honorait pas l'abandon, la réponse arriverait quand même trop tard : ignorée. */
  let res2; const g = chargerModeApi({ reponses: [ANALYSE_JSON, () => new Promise((r) => { res2 = r; })] });
  const a2 = g.v.beginApiAnalysis(); await delay(10);
  vm.runInContext(tranche('window.__V11_ROUTER__', 'function init()') + ';', g.ctx);
  g.v.resetAll(); res2({ texte: 'Réponse fantôme.' }); await a2;
  assert.deepEqual(plain(g.ctx.state.docs), []); assert.equal(g.el('#v11-execution-output').value, '');
});

/* ==========================================================================
 * T13 → T16 — SESSION, MODE SENSIBLE, SECRETS, PARITÉ
 * ======================================================================= */

test('T13 · SESSION_RESTORE_API_RESPONSE : la réponse ingérée est photographiée comme une réponse collée, restaurée une seule fois', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await h.v.beginApiAnalysis();
  const s = h.snap();
  assert.deepEqual(s.state.docs, [{ name: 'Réponse IA — cycle 1.txt', type: 'text/plain', size: Buffer.byteLength('Voici le plan.'), text: 'Voici le plan.', external: false }]);
  assert.deepEqual(s.ui.continuation, { open: true, kind: 'precision', ingested: 'Réponse IA — cycle 1.txt' });
  assert.deepEqual(Object.keys(s).sort(), ['saved_at', 'state', 'ui', 'version'], 'schéma v1 inchangé');
  const apres = chargerModeApi({ stockage: h.stockage });
  assert.equal(apres.v.v11SessionRestore(), true);
  assert.equal(apres.ctx.state.docs.length, 1);
  assert.equal(apres.el('#v11-continue-panel').dataset.ingested, 'Réponse IA — cycle 1.txt');
  assert.deepEqual(apres.spy.appels, [], 'la reprise n’exécute rien');
  assert.deepEqual(apres.spy.turns, []);
});

test('T14 · SENSITIVE_MODE_NON_REGRESSION : sous mode sensible, l’appel #2 suit la politique existante et rien n’est photographié', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'], sensible: true });
  await h.v.beginApiAnalysis();
  assert.equal(h.spy.appels.length, 2, 'le mode API reste celui que le produit autorise déjà (aucune confirmation nouvelle ici)');
  assert.equal(h.ctx.state.docs.length, 1, 'la réponse est un matériau en mémoire vive');
  assert.equal(h.brut(), null, 'aucune photographie sous mode sensible');
  assert.equal(JSON.stringify(h.spy.marks).includes('Voici le plan.'), false, 'aucun relevé ne porte la réponse');
});

test('T15 · NO_SECRET_PERSISTENCE : la clé n’atteint ni state.docs, ni la photographie, ni l’écran, ni les relevés', async () => {
  const h = chargerModeApi({ reponses: [ANALYSE_JSON, 'Voici le plan.'] });
  await h.v.beginApiAnalysis();
  const tout = JSON.stringify({ docs: h.ctx.state.docs, snap: h.brut(), statut: h.el('#v11-execution-status').textContent, sortie: h.el('#v11-execution-output').value, marks: h.spy.marks, panel: h.el('#v11-continue-panel').dataset });
  assert.equal(tout.includes('SECRET'), false);
  const code = sansProse(EXECUTION);
  assert.equal(/api-cle|v11-api-key|atelier\.cle|sessionStorage|localStorage|console\./.test(code), false);
  assert.match(sansProse(ANALYSE), /window\.obtenirCleFournisseur\(fournisseur\)/, 'la clé vient de la mécanique existante');
});

test('T16 · MANUAL_API_PARITY : même texte, même forme dans state.docs, même nom, même écran, que la réponse arrive par l’API ou par collage', async () => {
  const texte = 'Réponse identique des deux côtés.';
  const api = chargerModeApi({ reponses: [ANALYSE_JSON, texte] });
  await api.v.beginApiAnalysis();
  const manuel = chargerModeApi();
  manuel.el('#v11-final').value = 'PROMPT'; manuel.ctx.show('#v11-ready');
  manuel.v.v11OpenContinuation(); manuel.v.v11ChooseContinuation('ai_response');
  manuel.el('#v11-continue-text').value = texte; manuel.v.v11SubmitContinuation();
  assert.deepEqual(plain(api.ctx.state.docs), plain(manuel.ctx.state.docs));
  assert.deepEqual(plain(api.ctx.state.answers), plain(manuel.ctx.state.answers));
  const zone = (h) => ({ hidden: h.el('#v11-continue-panel').hidden, kind: h.el('#v11-continue-panel').dataset.kind, ingested: h.el('#v11-continue-panel').dataset.ingested, seul: h.el('#v11-continue-analyse-only').hidden, aide: h.el('#v11-continue-help').textContent });
  assert.deepEqual(zone(api), zone(manuel));
  assert.deepEqual(api.snap().state.docs, manuel.snap().state.docs);
  assert.deepEqual(api.snap().ui.continuation, manuel.snap().ui.continuation);
});
