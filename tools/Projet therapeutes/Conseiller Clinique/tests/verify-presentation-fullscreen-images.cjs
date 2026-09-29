// STUDIO CLINIQUE — Présentation, mode plein écran : correctif "images jamais résolues".
// Preuve réelle en navigateur (Playwright), captures d'écran incluses (même exigence que les
// correctifs visuels précédents de ce chantier : un simple "aucune erreur" ne suffit jamais, il
// faut une résolution réelle vérifiée, src par src).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function flatBlock(overrides) {
  return Object.assign({
    type: 'paragraph', text: '', level: 2, visualRole: 'info', items: [], ordered: false,
    imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '',
    citationEntryIds: [],
  }, overrides);
}
function presentationSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation — images plein écran', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_fs_img', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-presentation-fullscreen-images';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    const fetchImageCalls = [];
    let currentSSE = null;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/fetch-image')) {
        const q = new URL(url).searchParams.get('q');
        fetchImageCalls.push(q);
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/' + encodeURIComponent(q) + '.jpg' }] }),
        });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: currentSSE });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const cards = [
      {
        title: 'Diapositive 1 — couverture ET image inline',
        coverImageQuery: 'chronic stress cover', coverImageAlt: 'Couverture stress chronique',
        blocks: [
          flatBlock({ type: 'heading', text: 'Le stress chronique', level: 2 }),
          flatBlock({ type: 'image', imageQuery: 'stress management inline', imageAlt: 'Illustration inline' }),
          flatBlock({ type: 'paragraph', text: 'Contenu de la diapositive 1.' }),
        ],
      },
      {
        title: 'Diapositive 2 — couverture',
        coverImageQuery: 'emotional regulation cover', coverImageAlt: 'Couverture régulation émotionnelle',
        blocks: [flatBlock({ type: 'paragraph', text: 'Contenu de la diapositive 2.' })],
      },
    ];

    currentSSE = presentationSSE(cards);
    const storeKey = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-fs-img'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline(
        'Prépare un exposé sur le stress chronique, avec des images.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-fs-img', 'https://clone-proxy.test.local', precomputedRag
      );
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(storeKey, 'un artefact Présentation doit avoir été créé');
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir');

    // ══════════════════════════════════════════════════════════════════════
    // 1. Ouverture du plein écran (adocPresentOpen, maintenant ASYNC) — 1er point d'injection.
    // ══════════════════════════════════════════════════════════════════════
    const t0 = Date.now();
    await page.evaluate(() => window.adocPresentOpen());
    const openElapsedMs = Date.now() - t0;

    const slide1Images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('#cc-ws-present-slide-inner img'));
      return imgs.map((img) => ({ src: img.src, hasDataPexels: img.hasAttribute('data-pexels'), alt: img.getAttribute('alt') }));
    });
    assert.equal(slide1Images.length, 2, 'la diapositive 1 doit porter 2 <img> (couverture + inline)');
    for (const img of slide1Images) {
      assert.ok(img.src && img.src.startsWith('https://images.pexels.test/'),
        'chaque image de la diapositive 1 doit avoir un src RÉELLEMENT résolu (jamais data-pexels non résolu) — obtenu: ' + img.src);
      assert.equal(img.hasDataPexels, false, 'data-pexels doit avoir été retiré après résolution');
    }
    console.log('PASS 1/4 — Ouverture (adocPresentOpen) : couverture ET image inline réellement résolues sur la diapositive 1 (résolution en ' + openElapsedMs + 'ms).');
    assert.ok(openElapsedMs < 5000, 'RÉGRESSION PERFORMANCE — la résolution ne doit introduire aucun ralentissement perceptible (obtenu: ' + openElapsedMs + 'ms, mock réseau instantané)');

    const screenshot1Path = path.join(outDir, '1-plein-ecran-ouverture-images-resolues.png');
    await page.screenshot({ path: screenshot1Path, fullPage: false });
    console.log('CAPTURE — ' + screenshot1Path);

    // ══════════════════════════════════════════════════════════════════════
    // 2. Navigation vers la diapositive 2 (adocPresentGoToInternal, via adocPresentNext) — 2e point
    //    d'injection. La diapositive 1 n'a que 3 blocs de révélation (heading/image/paragraph) —
    //    2 "Suivant" épuisent la révélation progressive, un 3e fait avancer vers la diapositive 2.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentNext()); // révèle bloc 2 (image)
    await page.waitForTimeout(30);
    await page.evaluate(() => window.adocPresentNext()); // révèle bloc 3 (paragraph)
    await page.waitForTimeout(30);
    const t1 = Date.now();
    await page.evaluate(() => window.adocPresentNext()); // avance vers la diapositive 2
    await page.waitForTimeout(400); // transition 260ms + résolution
    const navElapsedMs = Date.now() - t1;

    const counterText = await page.evaluate(() => document.getElementById('cc-ws-present-counter').textContent);
    assert.equal(counterText, '2 / 2', 'la navigation doit bien avoir atteint la diapositive 2');

    const slide2Images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('#cc-ws-present-slide-inner img'));
      return imgs.map((img) => ({ src: img.src, hasDataPexels: img.hasAttribute('data-pexels') }));
    });
    assert.equal(slide2Images.length, 1, 'la diapositive 2 doit porter 1 <img> (couverture)');
    assert.ok(slide2Images[0].src && slide2Images[0].src.startsWith('https://images.pexels.test/'),
      'la couverture de la diapositive 2 doit être RÉELLEMENT résolue après navigation — obtenu: ' + slide2Images[0].src);
    assert.equal(slide2Images[0].hasDataPexels, false);
    console.log('PASS 2/4 — Navigation (adocPresentGoToInternal) : couverture réellement résolue sur la diapositive 2 après navigation (' + navElapsedMs + 'ms).');
    assert.ok(navElapsedMs < 5000, 'RÉGRESSION PERFORMANCE — la navigation ne doit introduire aucun ralentissement perceptible (obtenu: ' + navElapsedMs + 'ms)');

    const screenshot2Path = path.join(outDir, '2-plein-ecran-navigation-images-resolues.png');
    await page.screenshot({ path: screenshot2Path, fullPage: false });
    console.log('CAPTURE — ' + screenshot2Path);

    // ══════════════════════════════════════════════════════════════════════
    // 3. Chaque image a bien reçu SA PROPRE requête (jamais une requête générique répétée).
    // ══════════════════════════════════════════════════════════════════════
    assert.ok(fetchImageCalls.includes('chronic stress cover'), 'la requête de couverture de la diapositive 1 doit avoir été envoyée');
    assert.ok(fetchImageCalls.includes('stress management inline'), 'la requête de l\'image inline doit avoir été envoyée');
    assert.ok(fetchImageCalls.includes('emotional regulation cover'), 'la requête de couverture de la diapositive 2 doit avoir été envoyée');
    console.log('PASS 3/4 — Chaque image a reçu sa propre requête de résolution, jamais une requête générique partagée.');

    // ══════════════════════════════════════════════════════════════════════
    // 4. Aucune erreur JS non gérée pendant tout le scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario');
    console.log('PASS 4/4 — Aucune erreur JS non gérée.');

    console.log('\nTOUS LES TESTS DU CORRECTIF IMAGES PLEIN ÉCRAN PASSENT (4/4)');
    console.log('Captures d\'écran enregistrées dans : ' + outDir);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
