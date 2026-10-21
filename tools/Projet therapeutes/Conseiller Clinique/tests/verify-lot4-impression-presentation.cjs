// Lot 4 : le bouton Imprimer reprend le gabarit du PDF, sans commande interactive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { pdfText, comparePieces, extractHtmlPieces, normalizeText } = require('./pdf-text-compare.cjs');

const root = path.join(__dirname, '..');
const sse = events => events.map(x => 'data: ' + JSON.stringify(x)).join('\n\n') + '\n\n';
const input = JSON.stringify({ title: 'Contrôle impression', purpose: 'formation', audience: 'praticien', cards: [
  { title: 'Départ', blocks: [{ type: 'paragraph', text: 'Texte clinique de départ', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '', citationEntryIds: [] }] },
] });
const reply = sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_print_lot4', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
]);

async function fixture(browser) {
  const page = await browser.newPage();
  await page.context().addInitScript(() => {
    window.print = function () { window.__adocPrintInvoked = true; };
  });
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto('file://' + path.join(root, 'studio-clinique.html'));
  let pdfHtml = null;
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    if (url.includes('/browser-rendering/generate-carrousel-pdf')) {
      pdfHtml = route.request().postDataJSON().html;
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%%EOF') });
    }
    if (url.endsWith('/brand-assets/fixture-print-cover')) return route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch (_) {}
    if (body.payload?.tool_choice?.name === 'emit_presentation_document')
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: reply });
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  const key = await page.evaluate(async () => {
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div'); el.id = 'typing-print'; el.innerHTML = '<div class="adoc-bubble"></div>'; area.appendChild(el);
    await window.adocRunGenerationPipeline('Fais une présentation clinique.',
      { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
      'typing-print', 'https://clone-proxy.test.local', { chunks: [{ content: 'Passage clinique.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] });
    return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
  });
  assert.ok(key, 'présentation locale produite');
  await page.evaluate(async key => {
    const art = window._adocArtifacts[key];
    const base = art._adocStructuredDoc.blocks[0];
    const paragraph = base.content.blocks[0];
    const makeCard = (id, title, count) => ({ ...structuredClone(base), id, content: {
      ...structuredClone(base.content), title, imageRef: null, imageAlt: null,
      blocks: Array.from({ length: count }, (_, i) => ({ ...structuredClone(paragraph), id: id + '-p-' + i,
        content: { ...structuredClone(paragraph.content), text: title + ' repère ' + String(i + 1).padStart(3, '0') + ' texte clinique complet.' } })),
    } });
    art._adocStructuredDoc.blocks = [makeCard('print-short', 'Diapositive courte', 1), makeCard('print-middle', 'Diapositive moyenne', 10), makeCard('print-long', 'Diapositive longue', 120)];
    art._adocStructuredDoc.blocks[1].content.imageAssetId = 'fixture-print-cover';
    art._adocStructuredDoc.blocks[1].content.imageAlt = 'Image de couverture imprimée';
    art._adocStructuredDoc.blocks[0].content.blocks.push({ id: 'print-questionnaire', type: 'questionnaire', citationIds: [], validation: {}, content: {
      questions: [
        { text: 'Question imprimée A ?', options: [{ text: 'Réponse A1', points: 0 }, { text: 'Réponse A2', points: 2 }] },
        { text: 'Question imprimée B ?', options: [{ text: 'Réponse B1', points: 0 }, { text: 'Réponse B2', points: 2 }] },
      ],
      profiles: [{ label: 'Profil faible', minScore: 0, maxScore: 2, interpretation: 'Peu marqué.' }, { label: 'Profil élevé', minScore: 3, maxScore: 4, interpretation: 'Marqué.' }],
      allowTwoPartners: false,
    } });
    await window.adocOpenWorkspace(key);
  }, key);
  return { page, getPdfHtml: () => pdfHtml };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot4-'));
  for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch();
    try {
      const { page, getPdfHtml } = await fixture(browser);
      const printBtn = page.locator('#cc-ws-print-presentation-btn');
      assert.equal(await printBtn.count(), 1, name + ' : bouton Imprimer manquant');
      await page.locator('#cc-ws-export-menu-trigger').click();
      assert.equal(await printBtn.isVisible(), true, name + ' : bouton Imprimer masqué');
      await page.evaluate(() => window.adocWsExportCarrouselPDF());
      const pdfHtml = getPdfHtml();
      assert.ok(pdfHtml, name + ' : gabarit PDF absent');
      // L'export précédent peut fermer le menu : reprendre le vrai chemin utilisateur.
      if (await page.locator('#cc-ws-export-menu-trigger').getAttribute('aria-expanded') !== 'true')
        await page.locator('#cc-ws-export-menu-trigger').click();
      const popupPromise = page.waitForEvent('popup');
      await printBtn.click();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      await popup.waitForFunction(() => document.querySelectorAll('.adoc-pdf-page').length === 3);
      await popup.waitForFunction(() => window.__adocPrintInvoked === true);
      const printHtml = await popup.content();
      assert.ok(printHtml.includes('adoc-native-print-pagination'), name + ' : adaptation native de pagination absente');
      const printCss = await popup.evaluate(() => Array.from(document.styleSheets).some(sheet =>
        sheet.ownerNode?.id === 'adoc-native-print-pagination' && sheet.media.mediaText.includes('print')));
      assert.equal(printCss, true, name + ' : règle Safari limitée au support imprimé');
      await popup.emulateMedia({ media: 'print' });
      const printPageStyle = await popup.locator('.adoc-pdf-page').first().evaluate(el => ({
        minHeight: getComputedStyle(el).minHeight,
        width: getComputedStyle(el).width,
        parentWidth: getComputedStyle(el.parentElement).width,
      }));
      assert.equal(printPageStyle.minHeight, '0px', name + ' : hauteur fixe réintroduite');
      assert.equal(printPageStyle.width, printPageStyle.parentWidth, name + ' : largeur non fluide');
      for (const text of ['Diapositive courte repère 001', 'Diapositive longue repère 120'])
        assert.ok(printHtml.includes(text), name + ' : contenu absent du tirage : ' + text);
      assert.ok(printHtml.includes('src="data:image/png;base64,'), name + ' : image privée absente du tirage');
      for (const text of ['Question imprimée A ?', 'Réponse A1', 'Question imprimée B ?', 'Réponse B2'])
        assert.ok(printHtml.includes(text), name + ' : questionnaire incomplet : ' + text);
      assert.equal(await popup.locator('.adoc-sc-questionnaire-submit,.adoc-sc-questionnaire-scale,.adoc-sc-questionnaire-partners').count(), 0,
        name + ' : commande de score ou profil présent dans le tirage');
      assert.equal(await popup.locator('.adoc-sc-questionnaire-option').count(), 4, name + ' : choix de réponse manquant');
      assert.equal(await popup.locator('.adoc-sc-questionnaire button').count(), 0, name + ' : bouton interactif dans le tirage');
      assert.equal(await popup.locator('.adoc-pdf-page').count(), 3, name + ' : une carte source par section imprimable');
      assert.equal(await popup.evaluate(() => {
        const css = getComputedStyle(document.body);
        return css.getPropertyValue('print-color-adjust') === 'exact' || css.getPropertyValue('-webkit-print-color-adjust') === 'exact';
      }), true,
        name + ' : arrière-plans non demandés à l’impression');
      // Le gabarit de pagination et ses ajustements de carte sont partagés avec le PDF Worker.
      const expectedCards = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return Array.from(doc.querySelectorAll('.adoc-pdf-page .adoc-sc-card'), card => ({ id: card.id, zoom: card.style.zoom, text: card.textContent.trim() }));
      }, pdfHtml);
      const actualCards = await popup.locator('.adoc-pdf-page .adoc-sc-card').evaluateAll(cards => cards.map(card => ({ id: card.id, zoom: card.style.zoom, text: card.textContent.trim() })));
      assert.deepEqual(actualCards, expectedCards, name + ' : contenu ou pagination des cartes divergent du PDF Worker');
      if (name === 'Chromium') {
        const pdfPage = await browser.newPage();
        await pdfPage.setContent(pdfHtml, { waitUntil: 'load' });
        const workerPdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
        const printedPdf = await popup.pdf({ preferCSSPageSize: true, printBackground: true });
        const workerPath = path.join(dir, 'worker.pdf'), printedPath = path.join(dir, 'printed.pdf');
        fs.writeFileSync(workerPath, workerPdf); fs.writeFileSync(printedPath, printedPdf);
        const geometry = spawnSync('python3', ['-c',
          'import json,sys;from pypdf import PdfReader;print(json.dumps([[[float(p.mediabox.width),float(p.mediabox.height)] for p in PdfReader(f).pages] for f in sys.argv[1:]]))',
          workerPath, printedPath], { encoding: 'utf8' });
        assert.equal(geometry.status, 0, geometry.stderr);
        const [workerSizes, printedSizes] = JSON.parse(geometry.stdout);
        assert.ok(printedSizes.length >= 3 && printedSizes.length <= workerSizes.length,
          'pagination de l’impression disproportionnée par rapport au PDF Worker');
        assert.ok(printedSizes.every(([w, h]) => Math.abs(w - 841.9) < 3 && Math.abs(h - 595.3) < 3), 'tirage hors A4 paysage');
        const workerText = pdfText(workerPath), printedText = pdfText(printedPath);
        const pieces = await pdfPage.evaluate(extractHtmlPieces);
        assert.deepEqual(comparePieces(printedText, pieces).failures, [], 'impression : bloc perdu ou hors ordre');
        assert.equal(normalizeText(printedText), normalizeText(workerText), 'texte du tirage différent du PDF Worker');
        assert.ok(printedText.split('\f').length <= workerText.split('\f').length,
          'l’impression ne doit pas ajouter de feuilles vides');
      }
      await popup.close();
      console.log('PASS lot 4 ' + name + ' : même gabarit et contenu intégral');
    } finally { await browser.close(); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
