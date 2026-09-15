// Item 66 — correctif : art.html ne doit plus JAMAIS être pollué par les spans d'édition
// cc-text-run/cc-legacy-edit-text, quel que soit le chemin (sauvegarde standard, reteintage),
// tout en préservant : (a) le contenu réellement édité, (b) l'édition directe encore fonctionnelle
// après réouverture, (c) aucun impact sur le moteur structuré (fonction exclusivement legacy).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function sseLine(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function simpleTextSSE(text) {
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 10 } } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
function mockToolResponseSSE(toolName, input) {
  const inputJson = JSON.stringify(input);
  return sseLine({ type: 'message_start', message: { usage: { input_tokens: 50 } } })
    + sseLine({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: toolName, input: {} } })
    + sseLine({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } })
    + sseLine({ type: 'content_block_stop', index: 0 })
    + sseLine({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } })
    + sseLine({ type: 'message_stop' }) + 'data: [DONE]\n\n';
}
const LEGACY_HTML = '<!DOCTYPE html><html><body><h1>Titre du document</h1><p>Premier paragraphe de test, jamais édité.</p></body></html>';
const structuredFiche = {
  title: 'Fiche structurée témoin', purpose: 'fiche', audience: 'clinicien', category: 'Test',
  blocks: [{ type: 'paragraph', text: 'Texte structuré de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }],
};

let savedBodies = [];
function baseRoutes(page, { emitFicheFails } = {}) {
  page.route('**/*', route => {
    const req = route.request(); const url = req.url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) }); return; }
    if (url.includes('/d1-query')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ content: 'Passage clinique test.', book_title: 'Ouvrage', author: 'Auteur', page_number: 3 }] }) }); return; }
    if (url.includes('/clinical-documents') && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); savedBodies.push(b);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v-' + savedBodies.length }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const body = req.postData() || '';
      if (body.includes('evaluate_clarity')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'tool_use', name: 'evaluate_clarity', input: { status: 'ready', understood_so_far: '', missing: [], question: '', quick_replies: [], assumptions_if_proceeding: [] } }] }) }); return; }
      if (!emitFicheFails && body.includes('"type":"tool","name":"emit_fiche_document"')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: mockToolResponseSSE('emit_fiche_document', structuredFiche) }); return; }
      if (/"max_tokens":200(?!\d)/.test(body)) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE('ok') }); return; }
      if (body.includes('"stream":true')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: simpleTextSSE(LEGACY_HTML) }); return; }
      const plan = { needs_rag: true, searches: [{ terms: ['test'], term_match: 'any', authors: [], approaches: [], limit: 10 }], vector_angles: [], approach_filter: null, intent: 'fiche', clinical_intent: 'production', output_format: 'html', audience_type: 'praticien', registre: 'clinique', topic_summary: 'Test', deep_scan: false, max_tokens: 2000 };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(plan) }] }) });
      return;
    }
    route.continue();
  });
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════ 1. Sauvegarde standard SANS édition — plus aucune pollution ═══════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    savedBodies = [];
    baseRoutes(page, { emitFicheFails: true }); // force le repli legacy, garanti et réaliste
    await page.goto('file://' + FILE);
    await page.click('#format-summary');
    await page.fill('#clinical-question', 'Rédige un petit texte de test sur la TCC');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const before = await page.evaluate(() => { const [key, a] = Object.entries(window._adocArtifacts)[0]; return { key, htmlHasSpan: (a.html || '').includes('cc-text-run') }; });
    log('1a. Génération legacy obtenue, art.html propre avant toute ouverture', !before.htmlHasSpan, before);
    await page.evaluate((k) => window.adocOpenWorkspace(k), before.key);
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(400);
    const after = await page.evaluate((k) => { const a = window._adocArtifacts[k]; return { html: a.html, hasSpan: (a.html || '').includes('cc-text-run') || (a.html || '').includes('cc-legacy-edit-text') }; }, before.key);
    log('1b. Sauvegarde standard SANS édition : art.html ne contient plus AUCUN span d\'édition', !after.hasSpan, after.html);
    log('1c. Le contenu persisté côté serveur ne contient pas le span non plus', savedBodies.length > 0 && !JSON.stringify(savedBodies[0].document || {}).includes('cc-text-run'), savedBodies[0]);
    // Deuxième sauvegarde : toujours propre, pas de régression d'idempotence introduite par le fix.
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(400);
    const afterSecond = await page.evaluate((k) => (window._adocArtifacts[k].html || '').includes('cc-text-run'), before.key);
    log('1d. Deuxième sauvegarde consécutive : toujours aucune pollution', !afterSecond, afterSecond);
    log('2. Aucune erreur JS (scénario sauvegarde standard)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════ 3. Édition RÉELLE d'un bloc — le contenu édité doit être préservé, jamais le span ═══════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    savedBodies = [];
    baseRoutes(page, { emitFicheFails: true });
    await page.goto('file://' + FILE);
    await page.click('#format-summary');
    await page.fill('#clinical-question', 'Rédige un petit texte de test sur la TCC');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art = await page.evaluate(() => { const [key] = Object.entries(window._adocArtifacts)[0]; return { key }; });
    await page.evaluate((k) => window.adocOpenWorkspace(k), art.key);

    // Clique sur le paragraphe pour le sélectionner/l'éditer, tape un texte nouveau.
    await page.click('#cc-ws-doc-card p');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Texte réellement édité par la thérapeute.');
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(400);

    const result = await page.evaluate((k) => { const a = window._adocArtifacts[k]; return { html: a.html, hasSpan: (a.html || '').includes('cc-text-run') || (a.html || '').includes('cc-legacy-edit-text') }; }, art.key);
    log('3a. Le texte réellement tapé est bien présent dans art.html après sauvegarde', result.html.includes('Texte réellement édité par la thérapeute.'), result.html);
    log('3b. art.html ne contient AUCUN span d\'édition malgré une vraie édition de contenu', !result.hasSpan, result.html);
    log('3c. Le contenu persisté côté serveur reflète bien le texte édité, sans span', savedBodies.length > 0 && JSON.stringify(savedBodies[savedBodies.length - 1].document || {}).includes('Texte réellement édité') && !JSON.stringify(savedBodies[savedBodies.length - 1].document || {}).includes('cc-text-run'), savedBodies[savedBodies.length - 1]);

    // Réouverture (simule une reprise de session) : l'édition directe doit toujours fonctionner
    // normalement (le fix ne doit pas casser le mécanisme de wrap() sur un art.html désormais propre).
    await page.evaluate(() => window.adocCloseWorkspace());
    await page.evaluate((k) => window.adocOpenWorkspace(k), art.key);
    const reopenState = await page.evaluate(() => {
      const p = document.querySelector('#cc-ws-doc-card p');
      return { text: p ? p.textContent : null, hasLeafSpan: !!(p && p.querySelector('[data-cc-editor-leaf]')) };
    });
    log('3d. Après réouverture, le texte édité est bien réaffiché', reopenState.text === 'Texte réellement édité par la thérapeute.', reopenState);
    log('3e. Après réouverture, le mécanisme d\'édition directe (span leaf) est toujours posé normalement', reopenState.hasLeafSpan, reopenState);

    // Re-édite une deuxième fois après réouverture, pour prouver que le fix ne bloque jamais un
    // second cycle d'édition (le point le plus probable pour une régression silencieuse).
    await page.click('#cc-ws-doc-card p');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Deuxième édition, après réouverture.');
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(400);
    const secondEdit = await page.evaluate((k) => { const a = window._adocArtifacts[k]; return { html: a.html, hasSpan: (a.html || '').includes('cc-text-run') }; }, art.key);
    log('3f. Deuxième cycle d\'édition (après réouverture) : contenu correct, toujours aucune pollution', secondEdit.html.includes('Deuxième édition, après réouverture.') && !secondEdit.hasSpan, secondEdit);

    log('4. Aucune erreur JS (scénario édition réelle)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════ 5. Reteintage (adocConfirmLegacyRetheme) — chemin suspecté à l'origine ═══════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    savedBodies = [];
    baseRoutes(page, { emitFicheFails: true });
    await page.goto('file://' + FILE);
    await page.click('#format-summary');
    await page.fill('#clinical-question', 'Rédige un petit texte de test sur la TCC');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocGenerationEngine === 'legacy-html'), { timeout: 20000 });
    const art = await page.evaluate(() => { const [key] = Object.entries(window._adocArtifacts)[0]; return { key }; });

    // Simule directement la confirmation de reteintage (le chemin de sélection de couleur n'est
    // pas le sujet ici — seul le mécanisme de persistance après reteintage est en cause).
    const rethemeResult = await page.evaluate(async (k) => {
      const art = window._adocArtifacts[k];
      window._adocLegacyReThemeCandidate = { storeKey: k, html: art.html, brandKitName: null, fontLabel: null };
      await window.adocConfirmLegacyRetheme();
      const a = window._adocArtifacts[k];
      return { html: a.html, hasSpan: (a.html || '').includes('cc-text-run') };
    }, art.key);
    log('5a. Après adocConfirmLegacyRetheme (chemin suspecté à l\'origine), art.html ne contient aucun span', !rethemeResult.hasSpan, rethemeResult.html);
    log('5b. Le contenu persisté après reteintage ne contient pas le span non plus', savedBodies.length > 0 && !JSON.stringify(savedBodies[savedBodies.length - 1].document || {}).includes('cc-text-run'), savedBodies[savedBodies.length - 1]);
    log('6. Aucune erreur JS (scénario reteintage)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════ 7. Non-régression — moteur structuré totalement épargné par ce correctif ═══════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    savedBodies = [];
    baseRoutes(page, { emitFicheFails: false });
    await page.goto('file://' + FILE);
    await page.click('#format-summary');
    await page.fill('#clinical-question', 'Fais-moi une fiche synthèse sur la TCC');
    await page.click('#clinical-home-form button[type="submit"]');
    await page.waitForFunction(() => Object.values(window._adocArtifacts || {}).some(a => a._adocStructuredDoc), { timeout: 20000 });
    const art = await page.evaluate(() => { const [key, a] = Object.entries(window._adocArtifacts)[0]; return { key, engine: a._adocGenerationEngine }; });
    log('7a. Génération structurée confirmée (scénario de non-régression)', art.engine === 'structured', art);
    await page.evaluate((k) => window.adocOpenWorkspace(k), art.key);
    await page.click('.adoc-sc-cover-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Titre structuré édité');
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(400);
    const structResult = await page.evaluate((k) => {
      const a = window._adocArtifacts[k];
      return { title: a._adocStructuredDoc.title, hasContentTextRun: JSON.stringify(a._adocStructuredDoc).includes('cc-text-run') };
    }, art.key);
    log('7b. Édition de bannière structurée toujours fonctionnelle (non affectée par ce correctif legacy-only)', structResult.title === 'Titre structuré édité', structResult);
    log('7c. Le document structuré n\'a jamais contenu de span cc-text-run (mécanisme totalement disjoint)', !structResult.hasContentTextRun, structResult);
    log('8. Aucune erreur JS (non-régression structuré)', errors.length === 0, errors);
    await page.close();
  }

  // ═══════════════════ 9. Régression #6 — pas de duplication introduite par le correctif ═══════════════════
  {
    const fs = require('fs');
    const src = fs.readFileSync(FILE, 'utf8');
    function countDecl(name) { return (src.match(new RegExp('function ' + name + '\\s*\\(', 'g')) || []).length; }
    log('9a. adocEditorStripRuntime — une seule déclaration', countDecl('adocEditorStripRuntime') === 1, countDecl('adocEditorStripRuntime'));
    log('9b. adocEditorSyncLegacy — une seule déclaration, non dupliquée par ce correctif', countDecl('adocEditorSyncLegacy') === 1, countDecl('adocEditorSyncLegacy'));
    log('9c. adocEditorSyncStructured — non touchée, une seule déclaration (mécanisme structuré disjoint intact)', countDecl('adocEditorSyncStructured') === 1, countDecl('adocEditorSyncStructured'));
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 66 CORRECTIF ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
