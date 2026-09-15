// Item 57c, Lot 2 — TEST DÉDIÉ : police/couleur/taille PAR BLOC (heading/paragraph), en plus de
// l'édition directe du texte déjà livrée (Lot 1, hash ecb201d2...9344c9c).
//
// Régression #5 (VIGILANCE) : preuve avec un vrai RECHARGEMENT DE PAGE sur les deux moteurs — un
// simple test en mémoire masquerait un défaut de re-sérialisation du style (obstacle prioritaire
// de ce lot : art.html ne contenait, avant ce lot, aucun mécanisme pour reporter l'attribut
// style= de l'élément lui-même — seul innerHTML était synchronisé par le Lot 1).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function mockToolResponseSSE(input) {
  const inputJson = JSON.stringify(input);
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
    + sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}

const LEGACY_HTML = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;}</style></head><body>'
  + '<h1>Titre original du carrousel</h1>'
  + '<p>Paragraphe original.</p>'
  + '<ul><li>Item liste (jamais concerné par le style de bloc ce lot)</li></ul>'
  + '</body></html>';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function baseRoutes(page, opts) {
  const captured = { createBody: null };
  page.route('**/*', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.endsWith('/clinical-documents') && req.method() === 'POST') {
      captured.createBody = JSON.parse(req.postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions')) {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ version_id: 'v2' }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) });
        return;
      }
      if (body.includes('"name":"emit_block_correction"')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_block_correction', input: { text: 'Corrigé par IA.', items: ['Corrigé par IA.'], headers: [], rows: [] } }] }) });
        return;
      }
      if (body.includes('"max_tokens":200')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (opts.structured && body.includes('"type":"tool","name":"emit_fiche_document"')) {
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE(opts.structuredDoc) });
        return;
      }
      if (body.includes('"max_tokens":16000')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: opts.intent, clinical_intent: 'production', output_format: opts.outputFormat, audience_type: 'praticien', registre: 'clinique', topic_summary: 'Test', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
  return captured;
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ LEGACY ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const captured = baseRoutes(page, { structured: false, intent: 'carrousel', outputFormat: 'html' });

    await page.goto('file://' + FILE);
    await page.click('#format-carousel');
    await page.fill('#clinical-question', 'Fais-moi un carrousel sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocGenerationEngine === 'legacy-html')[0]);
    await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
    await page.waitForTimeout(200);

    // ── Sélection du heading, panneau de style présent avec les bons contrôles ──
    await page.click('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
    await page.waitForSelector('.cc-block-edit-panel');
    const controlsInfo = await page.evaluate(() => {
      const wrap = document.querySelector('.cc-block-style-controls');
      if (!wrap) return null;
      return {
        hasFontSelect: !!wrap.querySelector('select:nth-of-type(1)'),
        hasColorInput: !!wrap.querySelector('input[type="color"]'),
        hasSizeSelect: !!wrap.querySelectorAll('select').length === 2,
        hasResetBtn: [...wrap.querySelectorAll('button')].some(b => b.textContent.includes('Réinitialiser')),
      };
    });
    log('[legacy] 1a. Le panneau de style (police/couleur/taille) apparaît sur un heading', !!controlsInfo, controlsInfo);
    log('[legacy] 1b. Contient un sélecteur de police', controlsInfo && controlsInfo.hasFontSelect, null);
    log('[legacy] 1c. Contient un sélecteur de couleur natif', controlsInfo && controlsInfo.hasColorInput, null);
    log('[legacy] 1d. Contient le bouton Réinitialiser', controlsInfo && controlsInfo.hasResetBtn, null);

    // ── Le style de bloc n'apparaît PAS sur la liste (hors périmètre ce lot) ──
    const ulSel = await page.evaluate(() => document.querySelector('#cc-ws-doc-card ul[data-cc-legacy-block-id]').getAttribute('data-cc-legacy-block-id'));
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${ulSel}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    const ulHasStyle = await page.evaluate(() => !!document.querySelector('.cc-block-style-controls'));
    log('[legacy] 1e. Aucun panneau de style sur la liste (hors périmètre du lot)', !ulHasStyle, null);

    // ── Retour sur le heading : applique police + couleur + taille ──
    await page.click('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
    await page.waitForSelector('.cc-block-style-controls');
    await page.selectOption('.cc-block-style-controls select >> nth=0', 'inter-lora');
    await page.fill('.cc-block-style-controls input[type="color"]', '#112233');
    await page.dispatchEvent('.cc-block-style-controls input[type="color"]', 'change');
    await page.selectOption('.cc-block-style-controls select >> nth=1', 'large');

    const liveStyle = await page.evaluate(() => {
      const h1 = document.querySelector('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
      const cs = getComputedStyle(h1);
      return { fontFamily: cs.fontFamily, color: cs.color, fontSize: h1.style.fontSize, styleAttr: h1.getAttribute('style') };
    });
    log('[legacy] 2a. La police choisie (Lora, titre de la paire inter-lora) est appliquée EN DIRECT', liveStyle.fontFamily.toLowerCase().includes('lora'), liveStyle);
    log('[legacy] 2b. La couleur choisie est appliquée EN DIRECT', liveStyle.color === 'rgb(17, 34, 51)', liveStyle);
    log('[legacy] 2c. La taille "Grand" (1.25em) est appliquée EN DIRECT', liveStyle.fontSize === '1.25em', liveStyle);

    const fontLinkPresent = await page.evaluate(() => !!document.head.querySelector('link[href*="Lora"]'));
    log('[legacy] 2d. Le lien Google Fonts de la police choisie est chargé dans la page hôte (aperçu immédiat)', fontLinkPresent, null);

    // ── Le bouton "Corriger ce passage" (IA) sur la liste reste pleinement fonctionnel,
    // et NE DOIT JAMAIS effacer le style en attente sur le heading (obstacle prioritaire du lot,
    // même mécanisme de synchronisation étendu que le Lot 1) ──
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${ulSel}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction((k) => window._adocArtifacts[k].html.includes('Corrigé par IA'), storeKey, { timeout: 10000 });
    const styleAfterOtherCorrection = await page.evaluate(() => {
      const h1 = document.querySelector('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
      return h1 ? h1.getAttribute('style') : null;
    });
    log('[legacy] 3a. Le style du heading SURVIT à une correction IA confirmée sur un AUTRE bloc (obstacle prioritaire résolu)', !!(styleAfterOtherCorrection && styleAfterOtherCorrection.indexOf('rgb(17, 34, 51)') !== -1 || styleAfterOtherCorrection && styleAfterOtherCorrection.indexOf('17, 34, 51') !== -1), styleAfterOtherCorrection);

    // ── Sauvegarde ──
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    const savedHtml = captured.createBody && captured.createBody.document.html;
    log('[legacy] 4a. La sauvegarde a bien été envoyée', !!savedHtml, null);
    log('[legacy] 4b. Le HTML envoyé contient le style appliqué sur le heading (couleur)', savedHtml && (savedHtml.includes('17, 34, 51') || savedHtml.includes('#112233')), savedHtml && savedHtml.slice(0, 400));
    log('[legacy] 4c. Le HTML envoyé contient le lien Google Fonts de la police choisie (persistance)', savedHtml && savedHtml.includes('Lora'), null);
    log('[legacy] 4d. Aucune erreur JS sur tout le scénario', errors.length === 0, errors);

    // ── RECHARGEMENT DE PAGE — reconstruit depuis ce qui a été RÉELLEMENT envoyé ──
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    await page2.waitForTimeout(200);
    const reopened = await page2.evaluate((savedHtmlArg) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened'] = {
        name: 'Carrousel ACT', html: savedHtmlArg, fmt: 'html', _adocGenerationEngine: 'legacy-html',
        _adocDocumentKind: 'carrousel', _adocLegacySourceSnapshot: { sourceSnapshotId: 'x', entries: [] },
        _adocCapabilities: { workspace: true, persist: true, legacyBlockEditing: true, blockEditing: false, export: true },
      };
      return window.adocOpenWorkspace('reopened').then(() => {
        const h1 = document.querySelector('#cc-ws-doc-card h1');
        const cs = h1 ? getComputedStyle(h1) : null;
        return {
          fontFamily: cs && cs.fontFamily, color: cs && cs.color,
          // Legacy : adocSanitizeLegacyHtmlForWorkspace aplatit head+body dans #cc-ws-doc-card —
          // le <link> n'est donc plus littéralement dans document.head après réouverture, mais
          // reste bien traité par le navigateur où qu'il soit dans le document (mécanisme déjà
          // établi par LOT 11) : on cherche ici n'importe où dans le document, pas seulement head.
          fontLinkPresent: !!document.querySelector('link[href*="Lora"]'),
        };
      });
    }, savedHtml);
    log('[legacy] 5a. APRÈS RECHARGEMENT DE PAGE — la police choisie est bien réappliquée', reopened.fontFamily && reopened.fontFamily.toLowerCase().includes('lora'), reopened);
    log('[legacy] 5b. APRÈS RECHARGEMENT DE PAGE — la couleur choisie est bien réappliquée', reopened.color === 'rgb(17, 34, 51)', null);
    log('[legacy] 5c. APRÈS RECHARGEMENT DE PAGE — la police se charge réellement (lien présent dans le document rouvert)', reopened.fontLinkPresent, null);
    log('[legacy] 5d. Aucune erreur JS après rechargement', errors2.length === 0, errors2);
    await page2.close();
  }

  // ═══════════════════════════════ STRUCTURÉ ═══════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const structuredDoc = {
      title: 'Fiche structurée test', purpose: 'supervision', audience: 'clinicien',
      blocks: [
        { type: 'heading', text: 'Titre structuré original', level: 1, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
        { type: 'paragraph', text: 'Paragraphe structuré original.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
        { type: 'callout', text: 'Encadré (hors périmètre ce lot).', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: [] },
      ],
    };
    const captured = baseRoutes(page, { structured: true, structuredDoc, intent: 'fiche', outputFormat: 'html' });

    await page.goto('file://' + FILE);
    await page.fill('#clinical-question', 'Fais-moi une fiche sur ACT');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 15000 });
    const storeKey = await page.evaluate(() => Object.entries(window._adocArtifacts).find(([, a]) => a._adocStructuredDoc)[0]);
    await page.evaluate((k) => window.adocOpenWorkspace(k), storeKey);
    await page.waitForTimeout(200);

    await page.click('.adoc-sc-heading');
    await page.waitForSelector('.cc-block-edit-panel');
    const hasStyleStructured = await page.evaluate(() => !!document.querySelector('.cc-block-style-controls'));
    log('[structuré] 1a. Le panneau de style apparaît sur un heading', hasStyleStructured, null);

    await page.evaluate(() => document.querySelector('.adoc-sc-callout').click());
    await page.waitForSelector('.cc-block-edit-panel');
    const calloutHasStyle = await page.evaluate(() => !!document.querySelector('.cc-block-style-controls'));
    log('[structuré] 1b. Aucun panneau de style sur le callout (hors périmètre)', !calloutHasStyle, null);

    await page.click('.adoc-sc-heading');
    await page.waitForSelector('.cc-block-style-controls');
    await page.selectOption('.cc-block-style-controls select >> nth=0', 'public-merriweather');
    await page.fill('.cc-block-style-controls input[type="color"]', '#334455');
    await page.dispatchEvent('.cc-block-style-controls input[type="color"]', 'change');
    await page.selectOption('.cc-block-style-controls select >> nth=1', 'small');

    const modelStyle = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[0].style, storeKey);
    log('[structuré] 2a. block.style (fontPairId) écrit directement dans le modèle', modelStyle && modelStyle.fontPairId === 'public-merriweather', modelStyle);
    log('[structuré] 2b. block.style.color écrit dans le modèle', modelStyle && modelStyle.color === '#334455', null);
    log('[structuré] 2c. block.style.fontSize écrit dans le modèle', modelStyle && modelStyle.fontSize === 'small', null);

    const liveStructStyle = await page.evaluate(() => {
      const h1 = document.querySelector('.adoc-sc-heading');
      const cs = getComputedStyle(h1);
      return { fontFamily: cs.fontFamily, color: cs.color, fontSize: h1.style.fontSize };
    });
    log('[structuré] 3a. La police (Merriweather, titre de la paire) est appliquée EN DIRECT', liveStructStyle.fontFamily.toLowerCase().includes('merriweather'), liveStructStyle);
    log('[structuré] 3b. La couleur est appliquée EN DIRECT', liveStructStyle.color === 'rgb(51, 68, 85)', null);
    log('[structuré] 3c. La taille "Petit" (0.85em) est appliquée EN DIRECT', liveStructStyle.fontSize === '0.85em', null);

    const fontLinkStructured = await page.evaluate(() => !!document.head.querySelector('link[href*="Merriweather"]'));
    log('[structuré] 3d. Le lien Google Fonts de la police choisie est chargé dans la page hôte', fontLinkStructured, null);

    // ── Réinitialiser retire tout le style en un geste ──
    await page.click('.cc-block-style-controls button:has-text("Réinitialiser")');
    const afterReset = await page.evaluate((k) => ({
      model: window._adocArtifacts[k]._adocStructuredDoc.blocks[0].style,
      domStyle: document.querySelector('.adoc-sc-heading').getAttribute('style'),
    }), storeKey);
    log('[structuré] 4a. Réinitialiser retire block.style du modèle', afterReset.model === undefined, afterReset);
    log('[structuré] 4b. Réinitialiser retire le style visuel du DOM', !afterReset.domStyle || afterReset.domStyle === '', null);

    // Ré-applique un style réel pour la suite du test (persistance).
    await page.selectOption('.cc-block-style-controls select >> nth=0', 'karla-playfair');

    // ── La correction IA (callout) reste pleinement fonctionnelle, sans conflit ──
    await page.evaluate(() => document.querySelector('.adoc-sc-callout').click());
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[2].content.text === 'Corrigé par IA.', storeKey, { timeout: 10000 });
    const styleSurvivedOtherCorrection = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[0].style, storeKey);
    log('[structuré] 5a. La correction IA (callout) fonctionne toujours sans conflit', true, null);
    log('[structuré] 5b. Le style du heading SURVIT à une correction IA confirmée sur un AUTRE bloc', styleSurvivedOtherCorrection && styleSurvivedOtherCorrection.fontPairId === 'karla-playfair', styleSurvivedOtherCorrection);

    // ── Sauvegarde ──
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    const savedBody = captured.createBody;
    const savedJSON = JSON.stringify(savedBody && savedBody.document);
    log('[structuré] 6a. La sauvegarde a bien été envoyée', !!savedBody, null);
    log('[structuré] 6b. Le contenu envoyé contient le style choisi (fontPairId)', savedJSON.includes('karla-playfair'), null);
    log('[structuré] 6c. Le contenu envoyé contient TOUJOURS la correction IA du callout (aucune régression croisée)', savedJSON.includes('Corrigé par IA.'), null);
    log('[structuré] 6d. Aucune erreur JS sur tout le scénario', errors.length === 0, errors);

    // ── "RECHARGEMENT" structuré : reconstruit un artefact frais à partir du _adocStructuredDoc
    // persisté (équivalent d'une réouverture, le structuré n'ayant pas de art.html autonome) et
    // vérifie que le rendu ET le chargement de police fonctionnent depuis zéro, PAS seulement au
    // moment de l'application initiale (obstacle : le lien Google Fonts vit dans document.head,
    // jamais persisté lui-même — seul le fontPairId l'est, cf. adocRenderBlockHTML).
    await page.close();
    const page3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors3 = []; page3.on('pageerror', e => errors3.push(e.message));
    await page3.route('**/*', route => route.continue());
    await page3.goto('file://' + FILE);
    await page3.waitForTimeout(200);
    const persistedDoc = savedBody.document.clinicalDocument || savedBody.document;
    const reopenedStruct = await page3.evaluate((doc) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened2'] = {
        name: 'Fiche', fmt: 'html', _adocStructuredDoc: doc, _adocDocumentKind: 'fiche',
        _adocCapabilities: { workspace: true, persist: true, blockEditing: true, export: true },
      };
      return window.adocOpenWorkspace('reopened2').then(() => {
        const h1 = document.querySelector('.adoc-sc-heading');
        return {
          styleAttr: h1 && h1.getAttribute('style'),
          fontLinkPresent: !!document.head.querySelector('link[href*="Playfair"]'),
        };
      });
    }, persistedDoc);
    log('[structuré] 7a. APRÈS "RECHARGEMENT" — le style persisté (fontPairId) est bien réappliqué au rendu', reopenedStruct.styleAttr && reopenedStruct.styleAttr.indexOf('Playfair') !== -1, reopenedStruct);
    log('[structuré] 7b. APRÈS "RECHARGEMENT" — la police se charge depuis zéro (lien injecté par adocRenderBlockHTML, pas seulement au moment du choix initial)', reopenedStruct.fontLinkPresent, null);
    log('[structuré] 7c. Aucune erreur JS après réouverture (schéma AJV valide avec le nouveau champ style)', errors3.length === 0, errors3);
    await page3.close();
  }

  console.log('=== Résultats — Item 57c Lot 2 : police/couleur/taille par bloc ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
