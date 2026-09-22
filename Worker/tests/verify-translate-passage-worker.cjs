// STUDIO CLINIQUE — Nouveau chantier : brique de traduction isolée (@cf/meta/m2m100-1.2b) —
// vérification Worker réelle (fonction extraite TEXTUELLEMENT de index.js, jamais réimplémentée).
// Seule la frontière réseau/modèle (env.AI.run) est mockée — toute la logique de la route
// (validation, résolution de source_lang par défaut, vérification de forme de réponse, codes
// d'erreur) est exécutée réellement.
//
// Réserve honnête (documentée dans le code lui-même, cf. Worker/index.js) : aucun appel réel au
// modèle @cf/meta/m2m100-1.2b n'a pu être fait depuis ce bac à sable (aucun outil d'exécution
// Workers AI disponible dans cette session — seule la documentation Cloudflare et l'accès D1 en
// lecture ont pu être vérifiés réellement, cf. rapport). Ce test prouve donc la ROBUSTESSE de la
// route face à toute forme de réponse (y compris une forme inattendue ou une exception), pas la
// qualité de traduction réelle du modèle — qui reste à valider par un appel réel de votre côté.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `Bornes introuvables : "${startMarker}" → "${endMarker}"`);
  return source.slice(start, end);
}
const translateCode = extract('async function handleTranslatePassage(', 'async function handleGeneratePresentation(');

function loadHandler(code, env) {
  const context = vm.createContext({
    Response, Request, env,
    __name() {},
    jsonErr: (message, status) => new Response(JSON.stringify({ error: message }), { status }),
    json: (obj) => new Response(JSON.stringify(obj)),
  });
  vm.runInContext(code, context);
  return context;
}
function req(body) {
  return new Request('https://test.local/translate-passage', { method: 'POST', body: JSON.stringify(body) });
}

(async () => {
  // ── 1. Cas nominal : réponse bien formée du modèle → succès, forme exacte {translated_text,
  //      source_lang, target_lang} ──
  let capturedInput = null;
  const envOk = {
    AI: { async run(model, input) {
      capturedInput = { model, input };
      return { translated_text: '[traduction simulée]' };
    } },
  };
  const ctxOk = loadHandler(translateCode, envOk);
  const resOk = await ctxOk.handleTranslatePassage(req({ text: 'Some real English passage.', source_lang: 'en', target_lang: 'fr' }), envOk);
  assert.equal(resOk.status, 200, `Attendu 200, obtenu ${resOk.status}`);
  const dataOk = await resOk.json();
  assert.deepEqual(dataOk, { translated_text: '[traduction simulée]', source_lang: 'en', target_lang: 'fr' });
  assert.equal(capturedInput.model, '@cf/meta/m2m100-1.2b', 'le modèle appelé doit être exactement @cf/meta/m2m100-1.2b');
  console.log('PASS 1/9 — cas nominal : réponse bien formée du modèle → 200, forme exacte {translated_text, source_lang, target_lang}');

  // ── 2. source_lang/target_lang transmis TELS QUELS, jamais transformés (réserve documentée :
  //      l'ambiguïté de format des codes de langue dans la doc Cloudflare n'est pas résolue ici,
  //      cette route ne devine jamais) ──
  // JSON.stringify plutôt que assert.deepEqual : `capturedInput.input` est un objet construit
  // DANS le contexte vm (réalm distinct) — sa comparaison structurelle directe avec un littéral
  // du réalm principal déclenche un faux échec de assert.deepEqual (prototypes distincts entre
  // réalms), pas un vrai défaut de la route. JSON.stringify est agnostique au réalm.
  assert.equal(JSON.stringify(capturedInput.input), JSON.stringify({ text: 'Some real English passage.', source_lang: 'en', target_lang: 'fr' }), 'text/source_lang/target_lang doivent être transmis identiques à env.AI.run, sans transformation');
  console.log('PASS 2/9 — source_lang/target_lang transmis tels quels à env.AI.run, aucune transformation ni supposition de format');

  // ── 3. source_lang omis → défaut "en" appliqué ET reflété dans la réponse (jamais un défaut
  //      silencieux non rapporté à l'appelant) ──
  const envDefault = { AI: { async run(model, input) { return { translated_text: 'ok' }; } } };
  const ctxDefault = loadHandler(translateCode, envDefault);
  const resDefault = await ctxDefault.handleTranslatePassage(req({ text: 'Text without source_lang.', target_lang: 'fr' }), envDefault);
  const dataDefault = await resDefault.json();
  assert.equal(dataDefault.source_lang, 'en', 'source_lang omis doit défaut à "en" (documenté par Cloudflare), et être rapporté dans la réponse');
  console.log('PASS 3/9 — source_lang omis : défaut "en" appliqué ET rapporté explicitement dans la réponse');

  // ── 4. text manquant → 400, jamais un appel au modèle ──
  let modelCalled = false;
  const envNoText = { AI: { async run() { modelCalled = true; return { translated_text: 'x' }; } } };
  const ctxNoText = loadHandler(translateCode, envNoText);
  const resNoText = await ctxNoText.handleTranslatePassage(req({ target_lang: 'fr' }), envNoText);
  assert.equal(resNoText.status, 400);
  assert.equal(modelCalled, false, 'text manquant ne doit JAMAIS déclencher un appel au modèle');
  console.log('PASS 4/9 — text manquant refusé (400), avant tout appel au modèle');

  // ── 5. target_lang manquant → 400, jamais un appel au modèle ──
  modelCalled = false;
  const envNoTarget = { AI: { async run() { modelCalled = true; return { translated_text: 'x' }; } } };
  const ctxNoTarget = loadHandler(translateCode, envNoTarget);
  const resNoTarget = await ctxNoTarget.handleTranslatePassage(req({ text: 'Some text.' }), envNoTarget);
  assert.equal(resNoTarget.status, 400);
  assert.equal(modelCalled, false, 'target_lang manquant ne doit JAMAIS déclencher un appel au modèle');
  console.log('PASS 5/9 — target_lang manquant refusé (400), avant tout appel au modèle');

  // ── 6. JSON invalide → 400 ──
  const envBadJson = { AI: { async run() { return { translated_text: 'x' }; } } };
  const ctxBadJson = loadHandler(translateCode, envBadJson);
  const reqBadJson = new Request('https://test.local/translate-passage', { method: 'POST', body: '{not json' });
  const resBadJson = await ctxBadJson.handleTranslatePassage(reqBadJson, envBadJson);
  assert.equal(resBadJson.status, 400);
  console.log('PASS 6/9 — corps JSON invalide refusé (400)');

  // ── 7. env.AI absent → 500 explicite (binding manquant), jamais une exception non gérée ──
  const envNoAI = {};
  const ctxNoAI = loadHandler(translateCode, envNoAI);
  const resNoAI = await ctxNoAI.handleTranslatePassage(req({ text: 'Some text.', target_lang: 'fr' }), envNoAI);
  assert.equal(resNoAI.status, 500);
  const dataNoAI = await resNoAI.json();
  assert.ok(dataNoAI.error.includes('AI'), `message d'erreur attendu mentionnant le binding AI manquant, obtenu : "${dataNoAI.error}"`);
  console.log('PASS 7/9 — binding env.AI absent refusé explicitement (500), jamais une exception non gérée');

  // ── 8. Le modèle lève une exception (panne réelle simulée) → 502 explicite, jamais un texte
  //      "traduit" affiché comme un succès ──
  const envThrows = { AI: { async run() { throw new Error('modèle temporairement indisponible'); } } };
  const ctxThrows = loadHandler(translateCode, envThrows);
  const resThrows = await ctxThrows.handleTranslatePassage(req({ text: 'Some text.', target_lang: 'fr' }), envThrows);
  assert.equal(resThrows.status, 502);
  const dataThrows = await resThrows.json();
  assert.ok(dataThrows.error.includes('modèle temporairement indisponible'), `message d'erreur attendu incluant celui du modèle, obtenu : "${dataThrows.error}"`);
  console.log('PASS 8/9 — exception du modèle capturée explicitement (502), jamais un texte traduit silencieusement faux affiché comme un succès');

  // ── 9. Le modèle renvoie une forme INATTENDUE (jamais vue en doc — champ absent, vide, ou
  //      structure différente) → 502 explicite, jamais un texte vide ou undefined affiché comme
  //      une traduction réussie. Couvre exactement la réserve documentée : le nom exact du champ
  //      de sortie (translated_text) n'a pas pu être confirmé au-delà de la convention observée
  //      sur les autres modèles Workers AI — cette vérification protège contre le cas où il
  //      s'avérerait différent en conditions réelles. ──
  for (const badResponse of [{}, { translated_text: '' }, { translated_text: null }, { result: 'ailleurs' }, null]) {
    const envBadShape = { AI: { async run() { return badResponse; } } };
    const ctxBadShape = loadHandler(translateCode, envBadShape);
    const resBadShape = await ctxBadShape.handleTranslatePassage(req({ text: 'Some text.', target_lang: 'fr' }), envBadShape);
    assert.equal(resBadShape.status, 502, `réponse modèle inattendue (${JSON.stringify(badResponse)}) devrait être refusée (502), obtenu ${resBadShape.status}`);
  }
  console.log('PASS 9/9 — toute forme de réponse inattendue du modèle (champ absent, vide, null, ou structure différente) refusée explicitement (502), jamais un texte vide affiché comme une traduction réussie');

  console.log('\nTOUS LES TESTS TRANSLATE-PASSAGE WORKER PASSENT (9/9)');
})().catch((e) => {
  console.error('ÉCHEC:', e);
  process.exitCode = 1;
});
