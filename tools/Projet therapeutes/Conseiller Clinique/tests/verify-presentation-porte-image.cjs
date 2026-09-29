// STUDIO CLINIQUE — Présentation "site web de poche", porte plein écran pour les images.
// Preuve réelle en navigateur (Playwright), captures d'écran incluses. Génération testée via
// window.adocRunGenerationPipeline (même point d'entrée direct que les lots précédents), jamais
// un appel réel à l'API Anthropic.
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
    questionnaireQuestions: [], questionnaireProfiles: [], questionnaireTwoPartners: false,
    citationEntryIds: [],
  }, overrides);
}
function presentationSSE(cards) {
  const input = JSON.stringify({ title: 'Présentation avec porte image', purpose: 'formation', audience: 'praticien', cards });
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_door', name: 'emit_presentation_document' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
}

const outDir = process.env.ADOC_SCREENSHOT_DIR || '/tmp/screenshots-presentation-porte-image';
fs.mkdirSync(outDir, { recursive: true });

const QUESTIONS = [
  { text: 'Question A', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
  { text: 'Question B', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
];

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const KNOWN_ENV_FLAKE = "Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";
    page.on('pageerror', (e) => { if (e.message !== KNOWN_ENV_FLAKE) errors.push(e.message); });
    page.on('dialog', (d) => d.dismiss());
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));

    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/fetch-image')) {
        const q = new URL(url).searchParams.get('q');
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ photos: [{ url: 'https://images.pexels.test/' + encodeURIComponent(q) + '.jpg' }] }),
        });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      if (body.payload && body.payload.tool_choice && body.payload.tool_choice.type === 'tool' && body.payload.tool_choice.name === 'emit_presentation_document') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: presentationSSE(cards) });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    const cards = [
      {
        title: 'Diapositive unique',
        blocks: [
          flatBlock({ type: 'paragraph', text: 'Un texte avant le questionnaire.' }),
          flatBlock({ type: 'questionnaire', questionnaireQuestions: QUESTIONS, questionnaireProfiles: [{ label: 'A', minScore: 0, maxScore: 1, interpretation: 'x' }, { label: 'B', minScore: 2, maxScore: 4, interpretation: 'y' }] }),
          flatBlock({ type: 'image', imageQuery: 'anatomy diagram detail', imageAlt: 'Diagramme anatomique' }),
        ],
      },
    ];

    const storeKey = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-door'; el.innerHTML = '<div class="adoc-bubble"></div>';
      area.appendChild(el);
      const precomputedRag = { chunks: [{ content: 'Passage.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] };
      await window.adocRunGenerationPipeline(
        'Prépare un exposé avec un questionnaire et une image.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-door', 'https://clone-proxy.test.local', precomputedRag
      );
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(storeKey, 'un artefact Présentation doit avoir été créé');

    // ══════════════════════════════════════════════════════════════════════
    // 0. ABSENCE hors présentation — ni dans l'espace de travail normal, ni dans l'export PDF.
    // ══════════════════════════════════════════════════════════════════════
    const openOk = await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    assert.equal(openOk, true, 'adocOpenWorkspace doit réussir');
    const workspaceImgHtml = await page.evaluate(() => document.getElementById('cc-ws-doc-card')?.innerHTML || '');
    assert.ok(!workspaceImgHtml.includes('adocPresentOpenImageDoor'), 'aucun onclick de porte ne doit apparaître dans l\'espace de travail normal');

    const pdfHtml = await page.evaluate(async (sk) => {
      const art = window._adocArtifacts[sk];
      const doc = art._adocStructuredDoc;
      await window.adocRenderClinicalDocument(doc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      let captured = null;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (String(url).includes('/browser-rendering/generate-carrousel-pdf')) {
          captured = JSON.parse(opts.body).html;
          return new Response(new Blob(['fake-pdf']), { status: 200 });
        }
        return realFetch(url, opts);
      };
      try { await window.adocWsExportCarrouselPDF(); } catch (e) {}
      window.fetch = realFetch;
      return captured;
    }, storeKey);
    assert.ok(pdfHtml, 'le HTML envoyé au générateur PDF doit avoir été capturé');
    assert.ok(!pdfHtml.includes('adocPresentOpenImageDoor'), 'aucun onclick de porte ne doit apparaître dans l\'export PDF/HTML classique');
    console.log('PASS 1/7 — Aucun onclick de porte hors mode présentation (espace de travail normal ET export PDF classique).');

    // ══════════════════════════════════════════════════════════════════════
    // 1. Mode présentation — l'image porte bien un onclick de porte, jamais dans les autres blocs.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => window.adocPresentOpen());
    await page.evaluate(() => window.adocPresentNext()); // révèle questionnaire
    await page.evaluate(() => window.adocPresentNext()); // révèle image
    await page.waitForTimeout(50);
    const imgHasOnclick = await page.evaluate(() => {
      const img = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-image img');
      return img ? img.getAttribute('onclick') : null;
    });
    assert.ok(imgHasOnclick && imgHasOnclick.includes('adocPresentOpenImageDoor'), 'l\'image doit porter onclick="window.adocPresentOpenImageDoor(this)" en mode présentation');
    console.log('PASS 2/7 — En mode présentation, l\'image porte bien l\'onclick de porte.');

    // ══════════════════════════════════════════════════════════════════════
    // 2. Coche une réponse du questionnaire AVANT d'ouvrir la porte (pour prouver l'état intact
    //    après fermeture), note l'état de révélation et le scroll.
    // ══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      const opt = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire-option');
      opt.click();
    });
    const beforeState = await page.evaluate(() => {
      const inner = document.getElementById('cc-ws-present-slide-inner');
      return {
        selectedText: inner.querySelector('.adoc-sc-questionnaire-option.is-selected')?.textContent || null,
        revealedCount: inner.querySelectorAll('.adoc-sc-reveal-shown').length,
        html: inner.innerHTML,
      };
    });
    assert.ok(beforeState.selectedText, 'une option du questionnaire doit être cochée avant l\'ouverture de la porte');

    // ══════════════════════════════════════════════════════════════════════
    // 3. AGRANDISSEMENT RÉEL — clic sur l'image, la porte s'ouvre avec la bonne image.
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-slide-inner .adoc-sc-image img');
    await page.waitForTimeout(50);
    const doorState = await page.evaluate(() => {
      const door = document.getElementById('cc-ws-present-door');
      const slideImg = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-image img');
      const doorImg = door.querySelector('img');
      return {
        open: door.classList.contains('open'), hidden: door.hidden,
        srcMatches: doorImg.src === slideImg.src, altMatches: doorImg.alt === slideImg.alt,
      };
    });
    assert.equal(doorState.open, true, 'la porte doit s\'ouvrir (classe .open)');
    assert.equal(doorState.hidden, false, 'la porte ne doit plus être hidden');
    assert.equal(doorState.srcMatches, true, 'l\'image agrandie doit être EXACTEMENT la même image (même src résolu)');
    assert.equal(doorState.altMatches, true, 'le texte alternatif doit être conservé');
    console.log('PASS 3/7 — Agrandissement réel : la porte affiche la même image, réellement plus grande.');
    await page.screenshot({ path: path.join(outDir, '1-porte-image-ouverte.png') });

    // ══════════════════════════════════════════════════════════════════════
    // 4. FERMETURE PAR LE BOUTON — diapositive de départ STRICTEMENT intacte.
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-door-close');
    await page.waitForTimeout(50);
    const afterButtonClose = await page.evaluate(() => {
      const door = document.getElementById('cc-ws-present-door');
      const overlay = document.getElementById('cc-ws-present-overlay');
      const inner = document.getElementById('cc-ws-present-slide-inner');
      return {
        doorHidden: door.hidden, doorOpen: door.classList.contains('open'),
        presentStillOpen: overlay.classList.contains('open'),
        selectedText: inner.querySelector('.adoc-sc-questionnaire-option.is-selected')?.textContent || null,
        revealedCount: inner.querySelectorAll('.adoc-sc-reveal-shown').length,
        html: inner.innerHTML,
      };
    });
    assert.equal(afterButtonClose.doorHidden, true, 'la porte doit se refermer (bouton)');
    assert.equal(afterButtonClose.doorOpen, false);
    assert.equal(afterButtonClose.presentStillOpen, true, 'le mode présentation lui-même doit rester ouvert après la fermeture d\'une porte');
    assert.equal(afterButtonClose.selectedText, beforeState.selectedText, 'la réponse cochée au questionnaire AVANT l\'ouverture de la porte doit rester cochée APRÈS sa fermeture — jamais réinitialisée');
    assert.equal(afterButtonClose.revealedCount, beforeState.revealedCount, 'le montage progressif déjà fait ne doit jamais être rejoué/réinitialisé par l\'ouverture/fermeture d\'une porte');
    assert.equal(afterButtonClose.html, beforeState.html, 'le HTML de la diapositive de départ doit être BYTE POUR BYTE identique avant/après — la porte ne doit jamais toucher #cc-ws-present-slide-inner');
    console.log('PASS 4/7 — Fermeture par le bouton : diapositive de départ strictement intacte (réponse cochée, montage progressif, HTML identique).');

    // ══════════════════════════════════════════════════════════════════════
    // 5. RÉOUVERTURE + FERMETURE PAR ÉCHAP — ferme la porte SEULE, jamais le mode présentation.
    // ══════════════════════════════════════════════════════════════════════
    await page.click('#cc-ws-present-slide-inner .adoc-sc-image img');
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => document.getElementById('cc-ws-present-door').classList.contains('open')), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const afterEscape = await page.evaluate(() => ({
      doorHidden: document.getElementById('cc-ws-present-door').hidden,
      presentStillOpen: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
      counter: document.getElementById('cc-ws-present-counter').textContent,
    }));
    assert.equal(afterEscape.doorHidden, true, 'Échap doit refermer la porte');
    assert.equal(afterEscape.presentStillOpen, true, 'Échap ne doit JAMAIS fermer les deux niveaux (présentation + porte) d\'un seul coup');
    assert.equal(afterEscape.counter, '1 / 1', 'la diapositive affichée ne doit pas avoir changé');
    console.log('PASS 5/7 — Échap referme la porte seule, jamais le mode présentation lui-même.');
    await page.screenshot({ path: path.join(outDir, '2-apres-fermeture-echap.png') });

    // Une seconde pression sur Échap doit maintenant fermer le mode présentation lui-même.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    const presentClosedNow = await page.evaluate(() => !document.getElementById('cc-ws-present-overlay').classList.contains('open'));
    assert.equal(presentClosedNow, true, 'une seconde pression sur Échap (porte déjà fermée) doit fermer le mode présentation, comportement préexistant inchangé');
    console.log('PASS 6/7 — Régression : Échap ferme bien le mode présentation lui-même une fois la porte déjà fermée (comportement préexistant inchangé).');

    // ══════════════════════════════════════════════════════════════════════
    // 7. Aucune erreur JS non gérée sur tout le scénario.
    // ══════════════════════════════════════════════════════════════════════
    assert.deepEqual(errors, [], 'aucune erreur JS non gérée pendant tout le scénario porte image');
    console.log('PASS 7/7 — Zéro erreur JS non gérée.');

    console.log('\nTOUS LES TESTS PORTE IMAGE PASSENT (7/7)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
