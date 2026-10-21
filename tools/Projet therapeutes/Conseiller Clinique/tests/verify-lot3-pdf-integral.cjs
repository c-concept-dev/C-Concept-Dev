// Lot 3 : le vrai gabarit envoyé au Worker doit produire un PDF A4 paysage lisible en entier.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { pdfText, normalizeText, comparePieces, extractHtmlPieces } = require('./pdf-text-compare.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot3-'));
const sse = (events) => events.map(x => 'data: ' + JSON.stringify(x)).join('\n\n') + '\n\n';
const input = JSON.stringify({ title: 'Contrôle PDF intégral', purpose: 'formation', audience: 'praticien', cards: [
  { title: 'Point de départ', blocks: [{ type: 'paragraph', text: 'Point de départ clinique', level: 2, visualRole: 'info', items: [], ordered: false, imageQuery: '', imageAlt: '', quizOptions: [], quizCorrectIndex: 0, quizExplanation: '', citationEntryIds: [] }] },
] });
const reply = sse([
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_pdf_lot3', name: 'emit_presentation_document' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: input } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  { type: 'message_stop' },
]);
const allLines = ['Court contrôle des fissures', ...Array.from({ length: 10 }, (_, i) => 'Moyen repère ' + String(i + 1).padStart(2, '0')),
  ...Array.from({ length: 120 }, (_, i) => 'Long repère ' + String(i + 1).padStart(3, '0'))];

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dialogs = [];
    page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    let html = null;
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('file:')) return route.continue();
      if (url.includes('/browser-rendering/generate-carrousel-pdf')) {
        html = route.request().postDataJSON().html;
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%%EOF') });
      }
      if (url.includes('/brand-assets/fixture-cover')) return route.fulfill({ status: 200, contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
      if (url.endsWith('/brand-kits/font-kit')) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'font-kit', sourceType: 'font', sourceAssetId: 'font-fixture', typography: { headingFont: 'Sinthya', bodyFont: 'IBM Plex Sans' } }) });
      if (url.endsWith('/brand-assets/font-fixture')) return route.fulfill({ status: 200, contentType: 'font/ttf', body: Buffer.from('font-fixture-bytes') });
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch (_) {}
      if (body.payload?.tool_choice?.name === 'emit_presentation_document')
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: reply });
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    const key = await page.evaluate(async () => {
      const area = document.getElementById('adoc-messages');
      const el = document.createElement('div'); el.id = 'typing-pdf'; el.innerHTML = '<div class="adoc-bubble"></div>'; area.appendChild(el);
      await window.adocRunGenerationPipeline('Fais une présentation clinique.',
        { needs_rag: true, documentKind: 'presentation', intent: 'chat', duree_minutes: 6, audience_type: 'praticien', _formatClarityResolved: true },
        'typing-pdf', 'https://clone-proxy.test.local', { chunks: [{ content: 'Passage clinique.', book_title: 'Livre', author: 'Auteur', page_number: 1, _score: 0.9 }] });
      return Object.keys(window._adocArtifacts || {}).slice(-1)[0];
    });
    assert.ok(key, 'présentation locale générée');
    const state = await page.evaluate(async ({ key, lines }) => {
      const art = window._adocArtifacts[key], base = art._adocStructuredDoc.blocks[0];
      const baseParagraph = base.content.blocks[0];
      const makeCard = (id, title, content) => ({ ...structuredClone(base), id, content: {
        ...structuredClone(base.content), title, imageRef: null, imageAlt: null,
        blocks: content.map((text, i) => ({ ...structuredClone(baseParagraph), id: id + '-p-' + i,
          content: { ...structuredClone(baseParagraph.content), text } })),
      } });
      art._adocStructuredDoc.blocks = [
        makeCard('pdf-court', 'Diapositive courte', lines.slice(0, 1)),
        makeCard('pdf-moyen', 'Diapositive moyenne', lines.slice(1, 11)),
        makeCard('pdf-long', 'Diapositive longue', lines.slice(11)),
      ];
      art._adocStructuredDoc.blocks.forEach(card => { delete card.content.imageAssetId; });
      art._adocStructuredDoc.blocks[1].content.imageAssetId = 'fixture-cover';
      art._adocStructuredDoc.blocks[1].content.imageAlt = 'Couverture de test';
      const opened = await window.adocOpenWorkspace(key);
      await window.adocWsExportCarrouselPDF();
      return { opened, kind: art._adocStructuredDoc.documentKind, blocks: art._adocStructuredDoc.blocks.length,
        button: document.getElementById('cc-ws-export-pdf-carrousel-btn')?.hidden };
    }, { key, lines: allLines });
    assert.ok(html?.includes('Long repère 120'), 'HTML PDF réel capturé avec la fin de la longue diapositive : ' + JSON.stringify({ state, dialogs }));
    assert.ok(html.includes('src="data:image/png;base64,'), 'image privée embarquée avant envoi au Worker PDF');
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(html, { waitUntil: 'load' });
    await pdfPage.evaluate(() => document.fonts.ready);
    const loadedFonts = await pdfPage.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
    assert.ok(loadedFonts.includes('IBM Plex Sans') && loadedFonts.includes('Source Serif 4'),
      'les polices de charte doivent se charger avant impression : ' + loadedFonts.join(', '));
    if (process.env.ADOC_LOT3_DEBUG) console.log('fonts debug', await pdfPage.evaluate(() => ({links:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href),root:getComputedStyle(document.documentElement).getPropertyValue('--adoc-sc-body-font'),computed:getComputedStyle(document.querySelector('.adoc-sc-card')).fontFamily,loaded:[...document.fonts].map(x=>({family:x.family,status:x.status}))})));
    const zooms = await pdfPage.locator('.adoc-pdf-page .adoc-sc-card').evaluateAll(cards => cards.map(x => Number(x.style.zoom || 1)));
    assert.equal(zooms.length, 3, 'trois cartes dans le gabarit PDF');
    assert.equal(zooms[0], 1, 'la diapositive courte ne doit pas être réduite');
    assert.ok(zooms[2] >= 0.7 && zooms[2] < 1, 'la carte longue doit être réduite entre 70 et 100 %, reçu : ' + zooms[2]);
    assert.ok(html.includes('fonts.googleapis.com/css2?family='), 'lien Google Fonts des polices de la charte dans le HTML PDF');
    const pdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
    const pdfPath = path.join(dir, 'lot3.pdf'); fs.writeFileSync(pdfPath, pdf);
    if (process.env.ADOC_LOT3_PDF_PATH) fs.writeFileSync(process.env.ADOC_LOT3_PDF_PATH, pdf);
    const py = spawnSync('python3', ['-c', `from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages],'texts':[p.extract_text() or '' for p in r.pages]}))`, pdfPath], { encoding: 'utf8' });
    assert.equal(py.status, 0, py.stderr);
    const result = JSON.parse(py.stdout);
    assert.ok(result.sizes.every(([w, h]) => Math.abs(w - 841.9) < 3 && Math.abs(h - 595.3) < 3),
      'chaque feuille doit être A4 paysage, reçu : ' + JSON.stringify(result.sizes));
    assert.ok(result.texts.every((t, i) => t.trim().length > 0),
      'aucune feuille blanche à cause d’une couverture surdimensionnée : ' + result.texts.map((t, i) => t.trim() ? '' : i+1).filter(Boolean).join(','));
    // pypdf perd parfois les ligatures « fi » dans les polices incorporées ; Poppler lit le
    // texte, puis le même comparateur sert au contrôle du PDF réel, bloc par bloc et dans l'ordre.
    const full = pdfText(pdfPath);
    const htmlPieces = await pdfPage.evaluate(extractHtmlPieces);
    assert.deepEqual(comparePieces(full, htmlPieces).failures, [],
      'un bloc du HTML PDF manque ou apparaît hors ordre');
    const comparison = comparePieces(full, allLines.map((text, i) => ({ kind: 'paragraph', slide: i < 1 ? 1 : i < 11 ? 2 : 3, block: i + 1, text, minChars: 0 })));
    assert.deepEqual(comparison.failures, [], 'ligne absente ou hors ordre dans le PDF : ' + JSON.stringify(comparison.failures));
    assert.equal(comparison.compared, allLines.length, 'chaque bloc de texte doit être comparé');
    const normalized = normalizeText(full);
    for (const line of allLines) {
      const needle = normalizeText(line);
      assert.equal(normalized.split(needle).length - 1, 1, 'ligne répétée ou coupée dans le PDF : ' + line);
    }
    assert.ok(full.split('\f').filter(t => t.includes('Long repère')).length >= 2,
      'la longue diapositive doit continuer sur au moins deux feuilles');
    // Une police de charte absente de Google et sans fichier de police n'est pas tue.
    html = null;
    await page.evaluate(async () => {
      const original = window.adocRenderClinicalDocument;
      window.adocRenderClinicalDocument = async (...args) => {
        const rendered = await original(...args);
        rendered.tokens = structuredClone(rendered.tokens);
        rendered.tokens.typography.headingFontFamily = 'Sinthya';
        return rendered;
      };
      try { await window.adocWsExportCarrouselPDF(); }
      finally { window.adocRenderClinicalDocument = original; }
    });
    assert.ok(html?.includes('--adoc-sc-heading-font:Georgia, serif'), 'repli explicite de la police indisponible dans le PDF');
    assert.ok(dialogs.some(text => text.includes('Sinthya') && text.includes('Georgia')),
      'message visible sur la substitution de police');
    // Si la charte possède réellement son fichier font lisible par GET, les octets sont intégrés.
    html = null; dialogs.length = 0;
    await page.evaluate(async (key) => {
      const art = window._adocArtifacts[key]; art._adocBrandKitId = 'font-kit';
      const original = window.adocRenderClinicalDocument;
      window.adocRenderClinicalDocument = async (...args) => {
        const rendered = await original(...args);
        rendered.tokens = structuredClone(rendered.tokens);
        rendered.tokens.typography.headingFontFamily = 'Sinthya';
        return rendered;
      };
      try { await window.adocWsExportCarrouselPDF(); }
      finally { window.adocRenderClinicalDocument = original; delete art._adocBrandKitId; }
    }, key);
    assert.ok(html?.includes('@font-face{font-family:"Sinthya";src:url(data:font/ttf;base64,'),
      'fichier de police de charte embarqué dans le HTML PDF');
    assert.ok(!dialogs.some(text => text.includes('remplacée par Georgia')),
      'aucun avertissement de substitution si le fichier de police est embarqué');
    const buttonAfterAvailableFont = await page.locator('#cc-ws-export-pdf-carrousel-btn').evaluate(el => ({
      label: el.querySelector('span')?.textContent, title: el.getAttribute('title') || '' }));
    // Lot A : le libellé normal précise désormais qu'il s'agit des diapositives.
    // L'assertion garde le contrôle de restauration après disparition de l'avertissement.
    assert.equal(buttonAfterAvailableFont.label, 'Exporter en PDF (diapositives)', 'le libellé d’avertissement doit disparaître après un export sans remplacement');
    assert.equal(buttonAfterAvailableFont.title, '', 'l’infobulle de remplacement doit disparaître après un export sans remplacement');
    console.log('PASS lot 3 : A4 paysage, ' + result.sizes.length + ' pages, ' + allLines.length + ' lignes conservées');
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
