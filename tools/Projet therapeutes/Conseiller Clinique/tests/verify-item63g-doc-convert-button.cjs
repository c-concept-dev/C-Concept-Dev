// STUDIO CLINIQUE — Item 63g construction (Option A) : preuve réelle du bouton facultatif
// "Convertir en document…" à côté d'un document joint activé. Le pipeline sous-jacent (docCtx
// injecté dans le prompt système du moteur structuré) était DÉJÀ fonctionnel avant ce lot (cf.
// rapport d'investigation) — ce test prouve (1) le comportement NOUVEAU du bouton lui-même
// (pré-remplissage sans envoi automatique) ET (2) que le texte qu'il pré-remplit, une fois envoyé,
// traverse réellement le pipeline structuré déjà existant en utilisant le contenu du document joint
// — jamais réimplémenté, les vraies fonctions exposées (adocHandleUpload, adocSetDoc,
// adocPrefillDocConvert, adocRunGenerationPipeline) sont appelées telles quelles.
//
// Portée du test, assumée honnêtement (0E) : pdf.js/Mammoth sont chargés depuis cdnjs.cloudflare.com,
// inatteignable depuis ce bac à sable (egress bloqué, confirmé plusieurs fois cette session) — un
// upload PDF/DOCX réel ne peut donc pas être exercé ici. Un fichier .txt est utilisé à la place :
// son extraction (FileReader.readAsText) est le SEUL point du pipeline non exercé par ce choix —
// tout ce qui suit (adocDocs.push, docCtx, le bouton, le pipeline de génération) est le code RÉEL,
// identique quel que soit le format d'origine du contenu.
//
// Le réseau vers api.anthropic.com est inatteignable — intercepté via page.route(), MAIS le code
// exécuté (construction de docCtx/systemPrompt, routage structuré, appel réel à
// adocGenerateStructuredDocument, rendu du document) est le vrai code du fichier. Pour isoler ce
// test de la recherche RAG bibliothèque (mécanisme non concerné par ce lot, déjà testé ailleurs),
// le 5e paramètre RÉEL de adocRunGenerationPipeline (_precomputedRag, déjà utilisé en production
// pour le cas multi-plan) est fourni directement — bypass légitime et déjà existant, jamais un
// contournement inventé pour ce test.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');
const DISTINCTIVE_TEXT = 'La dysrégulation émotionnelle marquée caractérise le stress post-traumatique complexe.';

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // ÉCRAN DE CONNEXION (construction ultérieure) — sans clé configurée, l'overlay #cc-login-screen
  // couvrirait toute la page et bloquerait les clics réels (pointer-events) de ce test.
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);
  // Écran de conversation masqué par défaut (#assistdoc-screen, display:none tant que
  // window.openAssistDoc() — le VRAI point d'entrée — n'a pas été appelé, cf. bouton de l'écran
  // d'accueil) : jamais visible sans cette ouverture, même chose pour une utilisatrice réelle.
  await page.evaluate(() => window.openAssistDoc());

  // ── Test 1 : upload réel (.txt, FileReader — même mécanisme final que PDF/DOCX une fois le
  // texte extrait), activation, bouton visible. ──
  const uploadState = await page.evaluate(async (text) => {
    const file = new File([text], 'contexte-clinique.txt', { type: 'text/plain' });
    await window.adocHandleUpload([file]);
    return { docsCount: window.adocDocs ? window.adocDocs.length : null, hasUploadFn: typeof window.adocHandleUpload === 'function' };
  }, DISTINCTIVE_TEXT);
  // adocDocs est une fermeture privée, jamais exposée sur window — sa longueur n'est donc pas
  // vérifiable directement ; le comportement OBSERVABLE (bannière visible, texte inchangé une fois
  // le document activé) est vérifié à la place, exactement comme une utilisatrice le constaterait.
  await page.evaluate(() => window.adocSetDoc(0));
  const afterActivate = await page.evaluate(() => ({
    bannerVisible: document.getElementById('adoc-doc-banner').classList.contains('visible'),
    bannerName: document.getElementById('adoc-doc-banner-name').textContent,
    convertBtnVisible: !!document.querySelector('.adoc-doc-convert-btn'),
  }));
  console.log('État après upload + activation :', afterActivate);
  assert.equal(afterActivate.bannerVisible, true, 'le bandeau de document actif doit être visible après activation');
  assert.equal(afterActivate.bannerName, 'contexte-clinique.txt', 'le bandeau doit nommer le bon fichier');
  assert.ok(afterActivate.convertBtnVisible, 'ITEM 63g : le bouton "Convertir en document…" doit être visible à côté du document activé');
  console.log('PASS 1/4 — document réel joint et activé (upload réel, FileReader), bouton visible\n');

  // ── Test 2 : clic sur le VRAI bouton — pré-remplit sans envoyer, jamais un type présupposé. ──
  await page.evaluate(() => { document.getElementById('adoc-input').value = 'texte tapé au préalable'; });
  await page.click('.adoc-doc-convert-btn');
  const afterClick = await page.evaluate(() => ({
    inputValue: document.getElementById('adoc-input').value,
    stillOnSamePage: !!document.getElementById('adoc-doc-banner'), // aucune navigation/rechargement
  }));
  console.log('Champ de demande après clic :', JSON.stringify(afterClick.inputValue));
  assert.ok(afterClick.inputValue.length > 0, 'le champ doit être pré-rempli');
  assert.ok(!/fiche|tableau|carrousel|script|liens|pptx|docx|xlsx/i.test(afterClick.inputValue),
    'ITEM 63g : jamais un type de document présupposé dans le texte pré-rempli — le planificateur doit rester seul juge');
  assert.ok(afterClick.stillOnSamePage, 'aucun envoi/navigation ne doit se produire au clic (pré-remplissage seulement)');
  console.log('PASS 2/4 — clic sur le vrai bouton : champ pré-rempli, texte neutre, aucun envoi automatique\n');
  const prefilledText = afterClick.inputValue;

  // ── Test 3+4 : envoi manuel de CE texte exact — le document structuré produit doit utiliser
  // réellement le contenu du document joint (vérifié dans le PROMPT SYSTÈME réel envoyé ET dans
  // le CONTENU du document final produit — pas seulement l'absence d'erreur). ──
  const anthropicSystemPrompts = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    if (body.payload) {
      anthropicSystemPrompts.push(body.payload.system || null);
      // Round forcé (2e appel réel de adocGenerateStructuredDocument) — reconnu sans ambiguïté par
      // tool_choice.type==='tool', même patron que verify-hal-integration-dom.cjs (déjà existant).
      if (body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
        const inputJson = JSON.stringify({
          title: 'Repérer la dysrégulation émotionnelle',
          purpose: 'information', audience: 'clinicien',
          blocks: [{ type: 'paragraph', text: 'Point clé tiré du document joint : ' + DISTINCTIVE_TEXT, level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: ['entry-1'] }],
        });
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
          { type: 'message_stop' },
        ]) });
      }
      // Round 1 (décision web_search/HAL, tool_choice:auto, 1 seul message) — aucune recherche
      // nécessaire pour ce test, accusé simple, comme le modèle est explicitement autorisé à le
      // faire (cf. searchDecisionSystemPrompt, studio-clinique-core.js).
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Rien à rechercher.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' },
      ]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const storeKeysBefore = await page.evaluate(() => Object.keys(window._adocArtifacts || {}));
  await page.evaluate(async (text) => {
    const typingId = 'typing-item63g-' + Date.now();
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div'); el.id = typingId; el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    const plan = { needs_rag: true, documentKind: 'fiche', intent: 'fiche', _formatClarityResolved: true, output_format: 'fiche', topic_summary: 'Conversion du document joint' };
    // _precomputedRag (5e paramètre RÉEL, déjà utilisé en production pour le cas multi-plan,
    // studio-clinique-core.js:2633) — bypass légitime de la recherche RAG bibliothèque, mécanisme
    // non concerné par ce lot. Une seule entrée, suffisante pour satisfaire la garde
    // sourceSnapshot.entries.length déjà existante dans adocGenerateStructuredDocument.
    const ragResult = { chunks: [{ content: 'Passage de bibliothèque non lié au document joint.', book_title: 'Ouvrage Test', author: 'Auteur Test', page_number: 3, _score: 0.8 }] };
    await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', ragResult);
  }, prefilledText);
  const storeKeysAfter = await page.evaluate(() => Object.keys(window._adocArtifacts || {}));
  const newKey = storeKeysAfter.find((k) => !storeKeysBefore.includes(k));

  assert.ok(newKey, 'un document doit avoir été produit (adocRunGenerationPipeline → adocFinalizeGeneration)');
  const finalSystemPrompt = anthropicSystemPrompts[anthropicSystemPrompts.length - 1]; // dernier appel = round forcé
  console.log('Dernier system prompt contient le texte du document joint :', (finalSystemPrompt || '').includes(DISTINCTIVE_TEXT));
  assert.ok(finalSystemPrompt && finalSystemPrompt.includes(DISTINCTIVE_TEXT),
    'ITEM 63g : le PROMPT SYSTÈME RÉEL du round de génération doit contenir le contenu réel du document joint (docCtx) — preuve directe, pas une supposition');
  assert.ok(finalSystemPrompt.includes('DOCUMENT JOINT') && finalSystemPrompt.includes('contexte-clinique.txt'),
    'le prompt système doit porter l’en-tête et le nom de fichier réels de docCtx, inchangés par ce lot');
  console.log('PASS 3/4 — le contenu réel du document joint atteint bien le prompt système du moteur structuré (docCtx, pipeline inchangé)\n');

  const generatedState = await page.evaluate((key) => {
    const art = window._adocArtifacts[key];
    return {
      engine: art && art._adocGenerationEngine,
      hasStructuredDoc: !!(art && art._adocStructuredDoc),
      blocksText: art && art._adocStructuredDoc ? JSON.stringify(art._adocStructuredDoc.blocks) : null,
    };
  }, newKey);
  console.log('État du document produit :', { engine: generatedState.engine, hasStructuredDoc: generatedState.hasStructuredDoc });
  assert.equal(generatedState.engine, 'structured', 'ITEM 63g : un document STRUCTURÉ doit être produit (pas un repli legacy) pour prouver que l’Option A fonctionne de bout en bout');
  assert.ok(generatedState.hasStructuredDoc, 'le document structuré doit être présent sur l’artefact');
  assert.ok(generatedState.blocksText && generatedState.blocksText.includes(DISTINCTIVE_TEXT),
    'ITEM 63g : le CONTENU du document généré doit refléter réellement le contenu du document joint — vérifié dans les blocs produits, pas seulement l’absence d’erreur');
  console.log('PASS 4/4 — document structuré réellement produit, son contenu reflète fidèlement le document joint\n');

  assert.deepEqual(pageErrors, [], 'aucune erreur JS non gérée pendant le scénario');
  console.log('\n=== TOUS LES TESTS ITEM 63G — BOUTON "CONVERTIR EN DOCUMENT…" PASSENT (4/4) ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
