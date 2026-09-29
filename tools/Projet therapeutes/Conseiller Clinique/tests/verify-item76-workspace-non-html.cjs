// STUDIO CLINIQUE — Item 76 construction : preuve réelle en navigateur (Playwright) que l'écran de
// travail s'ouvre désormais pour xlsx/pptx/pdf, que l'édition dégrade "Exporter" en HTML/PDF pour
// xlsx/pptx (Option A, décision produit actée) tout en laissant PDF inchangé (déjà HTML par
// nature), et que le bandeau reflète l'état réel. Même patron que les tests déjà existants de ce
// dossier (verify-hal-integration-dom.cjs) : charge le VRAI fichier via file://, appelle les VRAIES
// fonctions exposées sur window (adocFinalizeGeneration, adocOpenDocPopup, adocEditorMarkDirty,
// adocWsExport), jamais réimplémentées. Le Worker réel (ADOC_WORKER, clone-proxy...workers.dev) est
// inatteignable depuis cette session (réseau sortant bloqué, confirmé plusieurs fois cette
// session) — ses 3 endpoints /generate-xlsx, /generate-pptx, /generate-pdf sont donc interceptés
// via page.route() avec une réponse canned {url, url_preview}, mais tout le CODE exécuté avant et
// après cet appel (extraction du HTML/JSON embarqué, rétention de art.html, gates de capacités,
// écran de travail, dégradation d'export) est le vrai code du fichier.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const REAL_HTML_PATH = 'file://' + path.resolve(
  // Chemin résolu RELATIVEMENT à ce fichier : l'original pointait vers /home/user/…, le disque
  // de la machine où ce test a été écrit. Même ajustement que pour les autres suites du dossier.
  path.join(__dirname, '..', 'studio-clinique.html')
);

function xlsxReply(marker) {
  return `<!DOCTYPE html><html><head><title>T</title>
<script id="xlsx-data" type="application/json">${JSON.stringify({
    headers: ['Approche', 'Indication'],
    rows: [['EMDR', 'Trauma'], ['ICV', 'Attachement']],
  })}<\/script>
</head><body><h1>${marker}</h1><p>Paragraphe distinctif : ${marker}-corps.</p></body></html>`;
}

function pptxReply(marker) {
  return `<!DOCTYPE html><html><head><title>T</title>
<script id="pptx-data" type="application/json">${JSON.stringify([
    { title: 'Slide 1', bullets: ['point A', 'point B'], content: '', image_query: '' },
  ])}<\/script>
</head><body><h1>${marker}</h1><p>Paragraphe distinctif : ${marker}-corps.</p></body></html>`;
}

function pdfReply(marker) {
  return `<!DOCTYPE html><html><head><title>T</title></head><body><h1>${marker}</h1><p>Paragraphe distinctif : ${marker}-corps.</p></body></html>`;
}

function sse(events) {
  return events.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n';
}
function finalTextSSE(text) {
  return sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]);
}

async function withPage(run) {
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}
  );
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    await page.goto(REAL_HTML_PATH);
    await run(page);
  } finally {
    await browser.close();
  }
}

// Même patron EXACT que verify-hal-integration-dom.cjs (déjà existant, jamais réinventé) :
// route toutes les requêtes, laisse passer file:, mock le(s) endpoint(s) Worker par suffixe d'URL,
// et répond au(x) appel(s) Anthropic (body.payload présent) par le texte final fourni — round
// unique, aucun outil utilisé (le modèle a le droit de répondre directement).
async function mockAndRun(page, { text, plan, generateSuffix, generateResponse }) {
  await page.unroute('**/*').catch(() => {});
  const anthropicCalls = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    if (generateSuffix && url.endsWith(generateSuffix)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(generateResponse) });
    }
    if (body.payload) {
      anthropicCalls.push(body.payload);
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: finalTextSSE(text) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const storeKeysBefore = await page.evaluate(() => Object.keys(window._adocArtifacts || {}));
  await page.evaluate(async (plan) => {
    const typingId = 'typing-item76-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const area = document.getElementById('adoc-messages');
    const el = document.createElement('div');
    el.id = typingId;
    el.innerHTML = '<div class="adoc-bubble"></div>';
    area.appendChild(el);
    window.__adocItem76TypingId = typingId;
    await window.adocRunGenerationPipeline('Demande de test item 76.', plan, typingId, 'https://clone-proxy.test.local', null);
  }, plan);
  const storeKeysAfter = await page.evaluate(() => Object.keys(window._adocArtifacts || {}));
  const newKey = storeKeysAfter.find((k) => !storeKeysBefore.includes(k));
  return { newKey, anthropicCallCount: anthropicCalls.length };
}

(async () => {
  await withPage(async (page) => {
    console.log('=== SCÉNARIO XLSX ===');
    const { newKey: xlsxKey } = await mockAndRun(page, {
      text: xlsxReply('MARQUEUR-XLSX'),
      plan: { needs_rag: false, intent: 'chat', _formatClarityResolved: true, output_format: 'xlsx', topic_summary: 'Test xlsx' },
      generateSuffix: '/generate-xlsx',
      generateResponse: { url: 'https://fake.worker/out/test.xlsx', url_preview: 'https://fake.worker/out/test.xlsx' },
    });
    assert.ok(xlsxKey, 'un artefact xlsx doit avoir été créé (pipeline complet réel : adocRunGenerationPipeline → adocFinalizeGeneration)');

    const xlsxState = await page.evaluate((key) => {
      const art = window._adocArtifacts[key];
      return {
        fmt: art.fmt,
        hasHtml: typeof art.html === 'string' && art.html.length > 0,
        htmlContainsMarker: (art.html || '').includes('MARQUEUR-XLSX'),
        workspaceCap: !!(art._adocCapabilities && art._adocCapabilities.workspace),
        engine: art._adocGenerationEngine,
        url: art.url,
      };
    }, xlsxKey);
    console.log('État artefact xlsx après génération :', xlsxState);
    assert.equal(xlsxState.fmt, 'xlsx', 'fmt doit rester xlsx (jamais réécrit)');
    assert.ok(xlsxState.hasHtml, 'art.html (chaîne) doit être retenu, pas seulement un blobUrl');
    assert.ok(xlsxState.htmlContainsMarker, 'le HTML retenu doit être le VRAI HTML généré (marqueur présent)');
    assert.ok(xlsxState.workspaceCap, 'ITEM 76 : _adocCapabilities.workspace doit être true pour xlsx');
    assert.equal(xlsxState.engine, 'legacy-html', 'generationEngine doit être legacy-html pour ce chemin');
    console.log('PASS — xlsx : capacité workspace accordée, HTML réel retenu.\n');

    // Ouverture réelle de l'écran de travail (adocOpenDocPopup, le VRAI point d'entrée unique).
    await page.evaluate((key) => window.adocOpenDocPopup(key), xlsxKey);
    const wsOpenState = await page.evaluate(() => ({
      wsStoreKey: window._adocWsState && window._adocWsState.storeKey,
      docCardHtml: document.getElementById('cc-ws-doc-card') ? document.getElementById('cc-ws-doc-card').innerHTML : null,
      bannerHidden: document.getElementById('cc-ws-legacy-banner') ? document.getElementById('cc-ws-legacy-banner').hidden : null,
      bannerText: document.getElementById('cc-ws-legacy-banner-text') ? document.getElementById('cc-ws-legacy-banner-text').innerHTML : null,
    }));
    console.log('État écran de travail après ouverture xlsx :', { wsStoreKey: wsOpenState.wsStoreKey, bannerHidden: wsOpenState.bannerHidden, bannerText: wsOpenState.bannerText, docCardHasGrid: (wsOpenState.docCardHtml || '').includes('data-cc-xlsx-grid') });
    assert.equal(wsOpenState.wsStoreKey, xlsxKey, 'ITEM 76 : adocOpenWorkspace doit avoir été appelé (jamais le popup iframe)');
    // ITEM 63c (mise à jour de ce test) — pour xlsx SEULEMENT, le corps HTML du modèle
    // (MARQUEUR-XLSX) est désormais REMPLACÉ par la grille déterministe rendue depuis
    // art.xlsxData (jamais le corps HTML éventuel du modèle pour ce format, cf. rapport
    // d'investigation) — le marqueur ne doit PLUS apparaître, la grille doit être présente à la
    // place. Preuve détaillée de la grille dans verify-item63c-xlsx-grid.cjs.
    assert.ok(!(wsOpenState.docCardHtml || '').includes('MARQUEUR-XLSX'), 'ITEM 63c : le corps HTML du modèle ne doit plus être affiché pour xlsx (remplacé par la grille)');
    assert.ok((wsOpenState.docCardHtml || '').includes('data-cc-xlsx-grid'), 'ITEM 63c : la grille déterministe doit être affichée à la place');
    assert.equal(wsOpenState.bannerHidden, false, 'le bandeau legacy doit être visible');
    assert.ok(/fichier Excel/.test(wsOpenState.bannerText) && /aucune modification/.test(wsOpenState.bannerText), 'AVANT édition : le bandeau doit mentionner le fichier Excel réel, pas encore de dégradation');
    console.log('PASS — xlsx : écran de travail ouvert avec le vrai contenu, bandeau pré-édition correct.\n');

    // Export AVANT édition — doit rendre le VRAI fichier xlsx (art.url), pas du HTML.
    const preEditDownload = await page.evaluate(() => new Promise((resolve) => {
      const origClick = HTMLAnchorElement.prototype.click;
      let captured = null;
      HTMLAnchorElement.prototype.click = function () { captured = { href: this.href, download: this.download }; };
      Promise.resolve(window.adocWsExport()).then(() => {
        HTMLAnchorElement.prototype.click = origClick;
        resolve(captured);
      });
    }));
    console.log('Résultat clic Exporter (AVANT édition) :', preEditDownload);
    assert.ok(preEditDownload, 'Exporter doit déclencher un téléchargement');
    assert.equal(preEditDownload.href, 'https://fake.worker/out/test.xlsx', 'AVANT édition : Exporter doit livrer le VRAI fichier xlsx (art.url), jamais une dégradation HTML');
    console.log('PASS — xlsx : Exporter avant édition livre le vrai fichier xlsx.\n');

    // adocEditorMarkDirty n'est pas exposée sur window (closure interne, déclenchée par de
    // nombreux points d'interaction UI réels — frappe, mise en forme, confirmation de correction
    // IA — dont la simulation fidèle exigerait de mocker un second appel Anthropic hors du
    // périmètre de CE test, qui porte sur les CONSÉQUENCES de _adocEverEdited=true, pas sur le
    // mécanisme (trivial, une ligne, déjà relu) qui le pose. On pose donc directement le drapeau,
    // exactement comme le ferait adocEditorMarkDirty, puis on rouvre l'écran de travail
    // (adocOpenWorkspace, exposée, vrai point d'entrée) pour forcer le même rafraîchissement du
    // bandeau (adocUpdateSaveStatusUI) qu'une édition réelle déclencherait.
    await page.evaluate((key) => { window._adocArtifacts[key]._adocEverEdited = true; }, xlsxKey);
    await page.evaluate((key) => window.adocOpenWorkspace(key), xlsxKey);
    const postEditFlag = await page.evaluate((key) => window._adocArtifacts[key]._adocEverEdited, xlsxKey);
    assert.equal(postEditFlag, true, '_adocEverEdited doit rester à true');

    const postEditBanner = await page.evaluate(() => document.getElementById('cc-ws-legacy-banner-text').innerHTML);
    console.log('Bandeau APRÈS édition :', postEditBanner);
    assert.ok(/modifié depuis sa génération/.test(postEditBanner) && /fichier Excel/.test(postEditBanner), 'APRÈS édition : le bandeau doit annoncer la dégradation et rester lié au fichier Excel d\'origine');

    // ITEM 63c (mise à jour de ce test, comportement changé pour xlsx SEULEMENT) — l'Option A
    // (dégradation HTML) ne s'applique plus à un xlsx édité : la grille éditable régénère
    // désormais un VRAI fichier .xlsx à jour (cf. adocWsExport, adocFetchRegeneratedXlsx). Preuve
    // détaillée (édition réelle de la grille + inspection du contenu régénéré) dans le test dédié
    // verify-item63c-xlsx-grid.cjs — ce test-ci se limite à vérifier que /generate-xlsx est
    // rappelé et que le fichier retourné (jamais .html) est bien celui téléchargé.
    let regeneratePayload = null;
    await page.route('**/generate-xlsx', async (route) => {
      regeneratePayload = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://fake.worker/out/test-regenere.xlsx', url_preview: 'https://fake.worker/out/test-regenere.xlsx' }) });
    });
    const postEditDownload = await page.evaluate(() => new Promise((resolve) => {
      const origClick = HTMLAnchorElement.prototype.click;
      let captured = null;
      HTMLAnchorElement.prototype.click = function () { captured = { download: this.download, href: this.href }; };
      Promise.resolve(window.adocWsExport()).then(() => {
        HTMLAnchorElement.prototype.click = origClick;
        resolve(captured);
      });
    }));
    console.log('Résultat clic Exporter (APRÈS édition) :', postEditDownload);
    assert.ok(postEditDownload, 'Exporter doit toujours déclencher un téléchargement après édition');
    assert.ok(postEditDownload.download.endsWith('.xlsx'), 'ITEM 63c : APRÈS édition d\'un xlsx, Exporter régénère un VRAI .xlsx, jamais une dégradation HTML');
    assert.equal(postEditDownload.href, 'https://fake.worker/out/test-regenere.xlsx', 'le lien téléchargé doit être le fichier RÉGÉNÉRÉ (nouveau art.url), pas l\'ancien');
    assert.ok(regeneratePayload && regeneratePayload.content && Array.isArray(regeneratePayload.content.sheets) && regeneratePayload.content.sheets[0].headers.length === 2, '/generate-xlsx doit avoir été rappelé avec un payload réel {content:{sheets}}, même contrat que la génération initiale');
    console.log('PASS — xlsx : ITEM 63c vérifié — édition régénère un vrai fichier xlsx (jamais de dégradation HTML pour ce format), bandeau à jour.\n');
  });

  await withPage(async (page) => {
    console.log('=== SCÉNARIO PPTX (abrégé, même mécanisme) ===');
    const { newKey: pptxKey } = await mockAndRun(page, {
      text: pptxReply('MARQUEUR-PPTX'),
      plan: { needs_rag: false, intent: 'chat', _formatClarityResolved: true, output_format: 'pptx', topic_summary: 'Test pptx' },
      generateSuffix: '/generate-pptx',
      generateResponse: { url: 'https://fake.worker/out/test.pptx', url_preview: 'https://fake.worker/out/test.pptx' },
    });
    assert.ok(pptxKey, 'un artefact pptx doit avoir été créé');
    const state = await page.evaluate((key) => {
      const art = window._adocArtifacts[key];
      return { hasHtml: (art.html || '').includes('MARQUEUR-PPTX'), workspaceCap: !!(art._adocCapabilities && art._adocCapabilities.workspace) };
    }, pptxKey);
    assert.ok(state.hasHtml, 'art.html réel retenu pour pptx');
    assert.ok(state.workspaceCap, 'workspace accordé pour pptx');
    await page.evaluate((key) => window.adocOpenDocPopup(key), pptxKey);
    const opened = await page.evaluate(() => window._adocWsState.storeKey);
    assert.equal(opened, pptxKey, 'écran de travail ouvert pour pptx');
    // Même raison que pour xlsx : drapeau posé directement, exactement comme adocEditorMarkDirty.
    await page.evaluate((key) => { window._adocArtifacts[key]._adocEverEdited = true; }, pptxKey);
    const postEditDownload = await page.evaluate(() => new Promise((resolve) => {
      const origClick = HTMLAnchorElement.prototype.click;
      let captured = null;
      HTMLAnchorElement.prototype.click = function () { captured = { download: this.download }; };
      Promise.resolve(window.adocWsExport()).then(() => { HTMLAnchorElement.prototype.click = origClick; resolve(captured); });
    }));
    assert.ok(postEditDownload.download.endsWith('.html'), 'pptx : dégradation HTML après édition');
    console.log('PASS — pptx : ouverture + dégradation post-édition confirmées.\n');
  });

  await withPage(async (page) => {
    console.log('=== SCÉNARIO PDF (aucune dégradation attendue, déjà HTML par nature) ===');
    const { newKey: pdfKey } = await mockAndRun(page, {
      text: pdfReply('MARQUEUR-PDF'),
      plan: { needs_rag: false, intent: 'chat', _formatClarityResolved: true, output_format: 'pdf', topic_summary: 'Test pdf' },
      generateSuffix: '/generate-pdf',
      generateResponse: { url: 'https://fake.worker/out/test.pdf', url_preview: 'https://fake.worker/out/test.pdf' },
    });
    assert.ok(pdfKey, 'un artefact pdf doit avoir été créé');
    const state = await page.evaluate((key) => {
      const art = window._adocArtifacts[key];
      return { hasHtml: (art.html || '').includes('MARQUEUR-PDF'), workspaceCap: !!(art._adocCapabilities && art._adocCapabilities.workspace) };
    }, pdfKey);
    assert.ok(state.hasHtml, 'art.html réel retenu pour pdf (chemin de succès, pas seulement le fallback)');
    assert.ok(state.workspaceCap, 'workspace accordé pour pdf');
    await page.evaluate((key) => window.adocOpenDocPopup(key), pdfKey);
    const opened = await page.evaluate(() => window._adocWsState.storeKey);
    assert.equal(opened, pdfKey, 'écran de travail ouvert pour pdf');
    // AVANT édition : pdf n'est pas dans _ADOC_REAL_FILE_FMTS → export = HTML directement, sans
    // avoir besoin d'une édition préalable pour "dégrader" quoi que ce soit (rien à dégrader).
    const download = await page.evaluate(() => new Promise((resolve) => {
      const origClick = HTMLAnchorElement.prototype.click;
      let captured = null;
      HTMLAnchorElement.prototype.click = function () { captured = { download: this.download }; };
      Promise.resolve(window.adocWsExport()).then(() => { HTMLAnchorElement.prototype.click = origClick; resolve(captured); });
    }));
    assert.ok(download.download.endsWith('.html'), 'pdf : Exporter livre du HTML dès le départ, sans changement de comportement lié à ce lot');
    console.log('PASS — pdf : ouverture confirmée, export HTML inchangé (aucune dégradation nécessaire).\n');
  });

  console.log('=== TOUS LES SCÉNARIOS RÉELS SONT PASSÉS ===');
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
