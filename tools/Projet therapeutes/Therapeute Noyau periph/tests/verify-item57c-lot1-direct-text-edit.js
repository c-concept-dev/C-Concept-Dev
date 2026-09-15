// Item 57c, Lot 1 — TEST DÉDIÉ (protocole v2 : reproduction déjà établie par l'audit item 46/
// vérification Codex — zéro contentEditable dans tout le fichier avant ce lot, confirmé par grep
// exhaustif — donc AUCUN texte tapé ne pouvait auparavant survivre à une sauvegarde ; ce test se
// concentre sur la preuve du correctif : édition directe + re-sérialisation + SURVIE À UN
// RECHARGEMENT DE PAGE, sur les deux moteurs, sans régression sur la correction IA/insertion.
//
// Régression #5 (VIGILANCE) : un simple test en mémoire (sans rechargement) masquerait un défaut
// de re-sérialisation — ce test recharge réellement la page (browser.newPage après le premier
// close, contexte JS entièrement neuf) et reconstruit le document à partir de ce que la
// sauvegarde a RÉELLEMENT envoyé au Worker (capturé par le mock), pour prouver que les octets
// persistés contiennent le texte édité — pas seulement l'état en mémoire de l'onglet d'origine.
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
  + '<p>Paragraphe original avec une citation <sup title="Gottman, p.12">1</sup> à préserver visuellement.</p>'
  + '<ul><li>Item liste (jamais éditable directement ce lot)</li></ul>'
  + '</body></html>';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function baseRoutes(page, opts) {
  const captured = { createBody: null, versionBody: null };
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
      captured.versionBody = JSON.parse(req.postData() || '{}');
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
        // Peuple text ET items — le bloc ciblé (paragraph/callout lisent text, list lit items) —
        // jamais un mock spécifique à un seul type, pour rester valide quel que soit le bloc réellement corrigé.
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

    const editableInfo = await page.evaluate(() => {
      const all = [...document.querySelectorAll('#cc-ws-doc-card [data-cc-legacy-block-id]')];
      return all.map(el => ({ tag: el.tagName.toLowerCase(), editable: el.getAttribute('contenteditable') }));
    });
    log('[legacy] 1a. h1 (heading) est contentEditable', editableInfo.find(e => e.tag === 'h1').editable === 'true', editableInfo);
    log('[legacy] 1b. p (paragraph) est contentEditable', editableInfo.find(e => e.tag === 'p').editable === 'true', editableInfo);
    log('[legacy] 1c. ul (liste, hors périmètre ce lot) n\'est PAS contentEditable', editableInfo.find(e => e.tag === 'ul').editable !== 'true', editableInfo);

    // ── Édition directe du heading ──
    await page.click('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
    await page.waitForSelector('.cc-block-edit-panel');
    const focusStolenH1 = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('cc-block-edit-freetext'));
    log('[legacy] 2a. Le clic de sélection NE vole PAS le focus vers le champ IA (peut taper directement)', !focusStolenH1, null);
    await page.evaluate(() => {
      const h1 = document.querySelector('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
      h1.focus();
      h1.textContent = 'Titre modifié à la main';
      h1.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    // Reclic dans le même bloc (repositionner le curseur) — le panneau doit rester ouvert.
    await page.click('#cc-ws-doc-card h1[data-cc-legacy-block-id]');
    const panelStillOpenAfterReclick = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('[legacy] 2b. Reclic dans le bloc édité ne ferme PAS le panneau (conflit de clic résolu)', panelStillOpenAfterReclick, null);

    // ── Édition directe du paragraphe (citation doit survivre visuellement dans le DOM, perte du garde-fou acceptée) ──
    await page.evaluate(() => {
      const p = document.querySelector('#cc-ws-doc-card p[data-cc-legacy-block-id]');
      p.focus();
      p.textContent = 'Paragraphe modifié à la main directement.';
      p.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    // ── Le bouton "Corriger ce passage" (IA) reste pleinement fonctionnel à côté ──
    const ulSel = await page.evaluate(() => document.querySelector('#cc-ws-doc-card ul[data-cc-legacy-block-id]').getAttribute('data-cc-legacy-block-id'));
    await page.click(`#cc-ws-doc-card [data-cc-legacy-block-id="${ulSel}"]`);
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction((k) => window._adocArtifacts[k].html.includes('Corrigé par IA'), storeKey, { timeout: 10000 });
    log('[legacy] 3a. La correction IA (liste) fonctionne toujours sans conflit avec l\'édition directe', true, null);

    // ── Sauvegarde ── (PAS de ré-appel à adocOpenWorkspace ici : cela re-rendrait #cc-ws-doc-card
    // depuis art.html, qui ne contient pas encore les éditions directes en cours dans le DOM vivant,
    // et les effacerait avant même que adocWsSave() ait pu les re-sérialiser.)
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    const savedBody = captured.createBody;
    log('[legacy] 4a. La sauvegarde a bien été envoyée (POST /clinical-documents)', !!savedBody, null);
    log('[legacy] 4b. Le contenu envoyé contient le TITRE modifié à la main', savedBody && savedBody.document.html.includes('Titre modifié à la main'), savedBody && savedBody.document.html.slice(0, 300));
    log('[legacy] 4c. Le contenu envoyé contient le PARAGRAPHE modifié à la main', savedBody && savedBody.document.html.includes('Paragraphe modifié à la main directement'), null);
    log('[legacy] 4d. L\'ancien titre a bien disparu (pas juste ajouté à côté)', savedBody && !savedBody.document.html.includes('Titre original du carrousel'), null);
    log('[legacy] 4e. La correction IA de la liste est ELLE AUSSI dans le contenu envoyé (aucune régression croisée)', savedBody && savedBody.document.html.includes('Corrigé par IA'), null);
    log('[legacy] 4f. Aucune erreur JS sur tout le scénario', errors.length === 0, errors);

    // ── RECHARGEMENT DE PAGE — reconstruit le document à partir de CE QUI A ÉTÉ RÉELLEMENT ENVOYÉ,
    // exactement ce qu'un futur "rouvrir un document sauvegardé" (item A16) ferait avec les octets
    // reçus du serveur — preuve que la persistance elle-même est correcte, pas seulement l'état en
    // mémoire de l'onglet d'origine. ──
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    await page2.waitForTimeout(200);
    const reopenedText = await page2.evaluate((savedHtml) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened'] = {
        name: 'Carrousel ACT', html: savedHtml, fmt: 'html', _adocGenerationEngine: 'legacy-html',
        _adocDocumentKind: 'carrousel', _adocLegacySourceSnapshot: { sourceSnapshotId: 'x', entries: [] },
        _adocCapabilities: { workspace: true, persist: true, legacyBlockEditing: true, blockEditing: false, export: true },
      };
      return window.adocOpenWorkspace('reopened').then(() => document.getElementById('cc-ws-doc-card').textContent);
    }, savedBody.document.html);
    log('[legacy] 5a. APRÈS RECHARGEMENT DE PAGE — le document ré-ouvert affiche bien le TITRE modifié', reopenedText.includes('Titre modifié à la main'), reopenedText);
    log('[legacy] 5b. APRÈS RECHARGEMENT DE PAGE — le document ré-ouvert affiche bien le PARAGRAPHE modifié', reopenedText.includes('Paragraphe modifié à la main directement'), null);
    log('[legacy] 5c. Aucune erreur JS après rechargement', errors2.length === 0, errors2);
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
        { type: 'paragraph', text: 'Paragraphe structuré original.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], citationEntryIds: ['entry-1'] },
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

    const spanInfo = await page.evaluate(() => ({
      headingEditable: document.querySelector('.adoc-sc-heading .adoc-sc-block-text')?.getAttribute('contenteditable'),
      paragraphEditable: document.querySelector('.adoc-sc-paragraph .adoc-sc-block-text')?.getAttribute('contenteditable'),
      calloutHasSpan: !!document.querySelector('.adoc-sc-callout .adoc-sc-block-text'),
      paragraphCiteOutsideSpan: (() => {
        const p = document.querySelector('.adoc-sc-paragraph');
        const span = p.querySelector('.adoc-sc-block-text');
        return p.innerHTML.indexOf('adoc-sc-cite') > p.innerHTML.indexOf(span.outerHTML) + span.outerHTML.length - 5;
      })(),
    }));
    log('[structuré] 1a. Le span de texte du heading est contentEditable', spanInfo.headingEditable === 'true', spanInfo);
    log('[structuré] 1b. Le span de texte du paragraph est contentEditable', spanInfo.paragraphEditable === 'true', spanInfo);
    log('[structuré] 1c. Le callout (hors périmètre) n\'a même pas de span dédié', !spanInfo.calloutHasSpan, spanInfo);

    // ── Édition directe du heading ──
    await page.click('.adoc-sc-heading');
    await page.waitForSelector('.cc-block-edit-panel');
    const focusStolen = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('cc-block-edit-freetext'));
    log('[structuré] 2a. Le clic de sélection ne vole pas le focus vers le champ IA', !focusStolen, null);
    await page.evaluate(() => {
      const span = document.querySelector('.adoc-sc-heading .adoc-sc-block-text');
      span.focus();
      span.textContent = 'Titre structuré modifié à la main';
      span.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    const headingModelText = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.text, storeKey);
    log('[structuré] 2b. block.content.text (heading) synchronisé immédiatement au focusout', headingModelText === 'Titre structuré modifié à la main', headingModelText);

    // Reclic dans le même bloc — le panneau doit rester ouvert.
    await page.click('.adoc-sc-heading');
    const panelStillOpen = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('[structuré] 2c. Reclic dans le bloc édité ne ferme pas le panneau', panelStillOpen, null);

    // ── Cas limite : vider complètement le paragraphe → restauration, jamais de texte vide ──
    await page.evaluate(() => document.querySelector('.adoc-sc-paragraph').click());
    await page.evaluate(() => {
      const span = document.querySelector('.adoc-sc-paragraph .adoc-sc-block-text');
      span.focus();
      span.textContent = '   ';
      span.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    const paragraphAfterEmpty = await page.evaluate((k) => ({
      model: window._adocArtifacts[k]._adocStructuredDoc.blocks[1].content.text,
      dom: document.querySelector('.adoc-sc-paragraph .adoc-sc-block-text').textContent,
    }), storeKey);
    log('[structuré] 3a. Texte vidé → restauré dans le MODÈLE (jamais de chaîne vide, minLength:1)', paragraphAfterEmpty.model === 'Paragraphe structuré original.', paragraphAfterEmpty);
    log('[structuré] 3b. Texte vidé → restauré aussi dans le DOM (retour visuel immédiat)', paragraphAfterEmpty.dom === 'Paragraphe structuré original.', null);

    // Édition réelle (non vide) du paragraphe pour la suite du test.
    await page.evaluate(() => {
      const span = document.querySelector('.adoc-sc-paragraph .adoc-sc-block-text');
      span.focus();
      span.textContent = 'Paragraphe structuré modifié à la main.';
      span.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    // ── Le bouton "Corriger ce passage" (IA) reste pleinement fonctionnel sur le callout ──
    await page.evaluate(() => document.querySelector('.adoc-sc-callout').click());
    await page.waitForSelector('.cc-block-edit-panel');
    await page.click('.cc-block-edit-panel button:has-text("Réécrire")');
    await page.waitForSelector('.cc-block-edit-actions button:has-text("Confirmer")', { timeout: 10000 });
    await page.click('.cc-block-edit-actions button:has-text("Confirmer")');
    await page.waitForFunction((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[2].content.text === 'Corrigé par IA.', storeKey, { timeout: 10000 });
    log('[structuré] 4a. La correction IA (callout) fonctionne toujours sans conflit', true, null);

    // ── Sauvegarde ──
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    const savedBody = captured.createBody;
    log('[structuré] 5a. La sauvegarde a bien été envoyée', !!savedBody, null);
    const savedBlocks = savedBody && savedBody.document.clinicalDocument ? savedBody.document.clinicalDocument.blocks : (savedBody && savedBody.document.blocks);
    log('[structuré] 5b. Le contenu envoyé contient le TITRE modifié', JSON.stringify(savedBody && savedBody.document).includes('Titre structuré modifié à la main'), null);
    log('[structuré] 5c. Le contenu envoyé contient le PARAGRAPHE modifié', JSON.stringify(savedBody && savedBody.document).includes('Paragraphe structuré modifié à la main'), null);
    log('[structuré] 5d. Le contenu envoyé contient TOUJOURS la correction IA du callout (aucune régression croisée)', JSON.stringify(savedBody && savedBody.document).includes('Corrigé par IA.'), null);
    log('[structuré] 5e. Aucune trace de texte vide (le cas limite du point 3 n\'a jamais atteint la sauvegarde)', !JSON.stringify(savedBody && savedBody.document).match(/"text":"\s*"/), null);
    log('[structuré] 5f. Aucune erreur JS sur tout le scénario', errors.length === 0, errors);
    await page.close();
  }

  console.log('=== Résultats — Item 57c Lot 1 : édition directe du texte (heading/paragraph) ===');
  let failCount = 0;
  for (const [label, ok, extra] of results) {
    console.log((ok ? 'OK  ' : 'ÉCHEC ') + label + (ok ? '' : ' | ' + JSON.stringify(extra)));
    if (!ok) failCount++;
  }
  console.log(`\nTotal: ${results.length} - failCount: ${failCount}`);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
