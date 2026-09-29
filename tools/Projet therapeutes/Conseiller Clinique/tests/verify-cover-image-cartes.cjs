// STUDIO CLINIQUE — Couverture d'image pour les cartes/diapositives (Carrousel ET Présentation)
// Preuve réelle en navigateur (Playwright), captures d'écran incluses (même exigence que le
// correctif visuel : une simple présence de data-pexels/`imageRef` ne suffit jamais à prouver
// qu'une image apparaît réellement — il faut la RÉSOLUTION réelle (src) + une capture d'écran).
//
// Génère un document via le point d'entrée direct déjà établi (window.adocRunGenerationPipeline,
// même convention que les Lots précédents — jamais un appel réel à l'API Anthropic), avec un mock
// de GET /fetch-image (mécanisme adocResolveImages, déjà existant et éprouvé) pour que la requête
// Pexels stockée dans imageRef soit réellement résolue en URL, exactement comme pour le bloc image
// inline (aucun second mécanisme).
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
  const input = JSON.stringify({ title: 'Présentation — couverture', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_cover_pres', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}
function carrouselSSE(cards) {
  const input = JSON.stringify({ title: 'Carrousel — couverture', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_cover_carr', name: 'emit_carrousel_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-cover-image';
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

    // Deux cartes AVEC couverture (requêtes distinctes, pour vérifier que chacune reçoit SA
    // propre image, jamais une seule requête répétée) + une carte SANS couverture (régression —
    // coverImageQuery/coverImageAlt vides, comme émettrait le modèle quand aucune image ne
    // convient : imageRef doit rester null, aucune balise <img> ne doit apparaître).
    const carrouselCards = [
      { title: 'Le sommeil et le stress', coverImageQuery: 'sleep and stress', coverImageAlt: 'Illustration du sommeil perturbé par le stress', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu carte 1.' })] },
      { title: 'La respiration diaphragmatique', coverImageQuery: 'diaphragmatic breathing', coverImageAlt: 'Illustration de la respiration diaphragmatique', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu carte 2.' })] },
      { title: 'Tableau récapitulatif chiffré', coverImageQuery: '', coverImageAlt: '', blocks: [flatBlock({ type: 'paragraph', text: 'Carte volontairement sans couverture (sujet chiffré).' })] },
    ];
    const presentationCards = [
      { title: 'Le stress chronique', coverImageQuery: 'chronic stress illustration', coverImageAlt: 'Illustration du stress chronique', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu diapositive 1.' })] },
      { title: 'La régulation émotionnelle', coverImageQuery: 'emotional regulation', coverImageAlt: 'Illustration de la régulation émotionnelle', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu diapositive 2.' })] },
    ];

    // Mock GET /fetch-image (mécanisme adocResolveImages existant) — renvoie une URL DÉRIVÉE de la
    // requête reçue, pour vérifier que CHAQUE carte/diapositive reçoit bien SA PROPRE image (jamais
    // la même URL réutilisée par accident).
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

    async function generate(text, plan, sseBody, typingId) {
      currentSSE = sseBody;
      await page.evaluate(async ({ text, plan, typingId }) => {
        const area = document.getElementById('adoc-messages');
        const el = document.createElement('div'); el.id = typingId; el.innerHTML = '<div class="adoc-bubble"></div>';
        area.appendChild(el);
        const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
        await window.adocRunGenerationPipeline(text, plan, typingId, 'https://clone-proxy.test.local', precomputedRag);
      }, { text, plan, typingId });
      return page.evaluate(() => Object.keys(window._adocArtifacts || {}).slice(-1)[0]);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 1. CARROUSEL — génération + ouverture, vérification réelle de la résolution des couvertures.
    // ══════════════════════════════════════════════════════════════════════
    const carrKey = await generate(
      'Fais-moi un carrousel sur la gestion du stress, avec des images de couverture.',
      { needs_rag: true, documentKind: 'carrousel', intent: 'chat', audience_type: 'praticien', _formatClarityResolved: true },
      carrouselSSE(carrouselCards), 'typing-cover-1'
    );
    assert.ok(carrKey, 'un artefact Carrousel doit avoir été créé');
    const openCarrOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), carrKey);
    assert.equal(openCarrOk, true, 'adocOpenWorkspace doit réussir pour ce document carrousel');

    const carrCovers = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-carrousel > .adoc-sc-card'));
      return cards.map((c) => {
        const img = c.querySelector('.adoc-sc-card-img');
        return { title: c.querySelector('.adoc-sc-card-title')?.textContent, hasImg: !!img, src: img ? img.src : null, alt: img ? img.getAttribute('alt') : null, hasDataPexels: img ? img.hasAttribute('data-pexels') : false };
      });
    });
    assert.equal(carrCovers.length, 3, 'les 3 cartes doivent être présentes');
    assert.equal(carrCovers[0].hasImg, true, 'carte 1 (avec coverImageQuery) doit porter une couverture');
    assert.ok(carrCovers[0].src && carrCovers[0].src.startsWith('https://images.pexels.test/'), 'la couverture de la carte 1 doit être une URL RÉELLEMENT résolue (jamais un data-pexels non résolu)');
    assert.equal(carrCovers[0].hasDataPexels, false, 'data-pexels doit avoir été retiré après résolution (mécanisme adocResolveImages existant)');
    assert.equal(carrCovers[0].alt, 'Illustration du sommeil perturbé par le stress');
    assert.equal(carrCovers[1].hasImg, true, 'carte 2 (avec coverImageQuery) doit porter une couverture');
    assert.ok(carrCovers[1].src && carrCovers[1].src !== carrCovers[0].src, 'carte 2 doit recevoir SA PROPRE image, jamais la même que la carte 1');
    assert.equal(carrCovers[2].hasImg, false, 'RÉGRESSION — carte SANS coverImageQuery ne doit porter AUCUNE balise <img> de couverture (imageRef:null reste un cas valide)');
    console.log('PASS 1/5 — Carrousel : couverture réellement résolue sur les 2 cartes concernées, propre à chacune ; aucune image sur la carte sans couverture.');

    const carrScreenshotPath = path.join(outDir, '1-carrousel-couvertures.png');
    await page.screenshot({ path: carrScreenshotPath, fullPage: false });
    console.log('CAPTURE — ' + carrScreenshotPath);

    // ══════════════════════════════════════════════════════════════════════
    // 2. PRÉSENTATION — même vérification, DEUX diapositives, TOUTES DEUX avec couverture (ici,
    //    aucune carte de régression sans couverture n'est nécessaire : déjà prouvée côté Carrousel,
    //    même fonction partagée adocResolveCardCoverFields, jamais une seconde logique).
    // ══════════════════════════════════════════════════════════════════════
    const presKey = await generate(
      'Prépare un exposé sur le stress chronique, avec des images de couverture par diapositive.',
      { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
      presentationSSE(presentationCards), 'typing-cover-2'
    );
    assert.ok(presKey, 'un artefact Présentation doit avoir été créé');
    const openPresOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), presKey);
    assert.equal(openPresOk, true, 'adocOpenWorkspace doit réussir pour ce document presentation');

    const presCovers = await page.evaluate(() => {
      const slides = Array.from(document.querySelectorAll('#cc-ws-doc-card .adoc-sc-presentation-slide'));
      return slides.map((s) => {
        const img = s.querySelector('.adoc-sc-card-img');
        return { title: s.querySelector('.adoc-sc-card-title')?.textContent, hasImg: !!img, src: img ? img.src : null, alt: img ? img.getAttribute('alt') : null };
      });
    });
    assert.equal(presCovers.length, 2, 'les 2 diapositives doivent être présentes');
    for (const c of presCovers) {
      assert.equal(c.hasImg, true, 'diapositive "' + c.title + '" doit porter une couverture réelle');
      assert.ok(c.src && c.src.startsWith('https://images.pexels.test/'), 'la couverture doit être une URL réellement résolue');
    }
    assert.notEqual(presCovers[0].src, presCovers[1].src, 'les 2 diapositives doivent recevoir des images DISTINCTES');
    console.log('PASS 2/5 — Présentation : couverture réellement résolue sur les 2 diapositives, chacune avec sa propre image.');

    const presScreenshotPath = path.join(outDir, '2-presentation-couvertures.png');
    await page.screenshot({ path: presScreenshotPath, fullPage: false });
    console.log('CAPTURE — ' + presScreenshotPath);

    // ══════════════════════════════════════════════════════════════════════
    // 3. Même mécanisme de résolution que le bloc image inline — vérifié en confirmant que la
    //    requête effectivement envoyée à /fetch-image est bien celle de coverImageQuery, jamais
    //    une requête transformée par un second mécanisme.
    // ══════════════════════════════════════════════════════════════════════
    assert.ok(fetchImageCalls.includes('sleep and stress'), 'la requête EXACTE coverImageQuery de la carte 1 doit avoir été envoyée à /fetch-image (adocResolveImages, mécanisme existant)');
    assert.ok(fetchImageCalls.includes('diaphragmatic breathing'), 'la requête EXACTE coverImageQuery de la carte 2 doit avoir été envoyée');
    assert.ok(fetchImageCalls.includes('chronic stress illustration'), 'la requête EXACTE coverImageQuery de la diapositive 1 doit avoir été envoyée');
    assert.ok(fetchImageCalls.includes('emotional regulation'), 'la requête EXACTE coverImageQuery de la diapositive 2 doit avoir été envoyée');
    console.log('PASS 3/5 — Résolution confirmée via le MÊME mécanisme /fetch-image (adocResolveImages) que le bloc image inline, jamais un second mécanisme.');

    // ══════════════════════════════════════════════════════════════════════
    // 4. RÉGRESSION — un document Carrousel existant SANS aucune couverture (imageRef:null sur
    //    toutes les cartes) doit continuer à s'afficher normalement, sans erreur ni balise cassée.
    // ══════════════════════════════════════════════════════════════════════
    const legacyCards = [
      { title: 'Carte historique 1', blocks: [flatBlock({ type: 'paragraph', text: 'Contenu sans coverImageQuery du tout (document généré avant ce lot — champ absent, jamais halte).' })] },
    ];
    const legacyKey = await generate(
      'Fais-moi un carrousel simple.',
      { needs_rag: true, documentKind: 'carrousel', intent: 'chat', audience_type: 'praticien', _formatClarityResolved: true },
      carrouselSSE(legacyCards), 'typing-cover-3'
    );
    assert.ok(legacyKey, 'un artefact doit avoir été créé même sans coverImageQuery dans le raw');
    const openLegacyOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), legacyKey);
    assert.equal(openLegacyOk, true, 'RÉGRESSION — un document sans coverImageQuery/coverImageAlt du tout dans le raw doit continuer à s\'ouvrir normalement');
    const legacyHasImg = await page.evaluate(() => !!document.querySelector('#cc-ws-doc-card .adoc-sc-card-img'));
    assert.equal(legacyHasImg, false, 'RÉGRESSION — aucune balise <img> de couverture ne doit apparaître quand coverImageQuery est absent du raw (imageRef:null reste un cas valide au rendu)');
    console.log('PASS 4/5 — RÉGRESSION — document sans coverImageQuery dans le raw continue de s\'afficher normalement (imageRef:null, aucune balise cassée).');

    // ══════════════════════════════════════════════════════════════════════
    // 5. Aucune erreur JS non gérée pendant tout le scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario de couverture d\'image');
    console.log('PASS 5/5 — Aucune erreur JS non gérée.');

    console.log('\nTOUS LES TESTS DE COUVERTURE D\'IMAGE PASSENT (5/5)');
    console.log('Captures d\'écran enregistrées dans : ' + outDir);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
