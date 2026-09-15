// 57c/57f — investigation souligné/barré + mise en forme partielle. Ce script documente l'ÉTAT
// ACTUEL (aucun code modifié dans ce lot) : reproduction réelle, DOM inspecté, des scénarios
// listés comme obligatoires par le prompt, plus les scénarios supplémentaires qui ont servi à
// écarter des hypothèses avant de conclure. AUCUN bug reproduit — voir le rapport pour le détail.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

async function setup(page, mockStructured) {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: '{"total_books":0,"total_chunks":0,"by_approach":[]}' }); return; }
    if (url.includes('/brand-kits')) { route.fulfill({ status: 200, contentType: 'application/json', body: '{"brand_kits":[]}' }); return; }
    if (mockStructured && (url.includes('clone-proxy') || url.includes('workers.dev'))) {
      const inputJson = JSON.stringify({ title: 'Fiche de test', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Un paragraphe structure de test pour la mise en forme partielle.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] });
      const events = [
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ];
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n' });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
}

function injectLegacyDoc(page, key, html) {
  return page.evaluate(({ key, html }) => {
    window.openAssistDoc(); document.getElementById('cc-landing').style.display = 'none';
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      html, fmt: 'html', name: 'x', blobUrl: URL.createObjectURL(new Blob([html], { type: 'text/html' })),
      _adocGenerationEngine: 'legacy-html', _adocDocumentKind: 'fiche',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: false, blockEditing: false, legacyBlockEditing: true, transform: false, export: true, qualityControlledExport: false },
      _adocLegacySourceSnapshot: { sourceSnapshotId: 'snap-1', entries: [] },
    };
    return key;
  }, { key, html });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // LEGACY, scope "Tout le bloc" — souligné seul, barré seul, ensemble, rechargement
  // ══════════════════════════════════════════════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await setup(page, false);
    const html = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;}</style></head><body><p>Un paragraphe de test pour la mise en forme.</p></body></html>';
    const storeKey = await injectLegacyDoc(page, 'legacy-block', html);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(300);
    await page.click('#cc-ws-doc-card p');
    await page.waitForTimeout(200);

    await page.click('[data-editor-action="underline"]');
    await page.waitForTimeout(150);
    let s = await page.evaluate(() => getComputedStyle(document.querySelector('#cc-ws-doc-card p')).textDecorationLine);
    log('1a. Souligné seul (legacy, bloc entier) — ligne calculée contient "underline"', s.includes('underline'));

    await page.click('[data-editor-action="underline"]');
    await page.waitForTimeout(150);
    s = await page.evaluate(() => getComputedStyle(document.querySelector('#cc-ws-doc-card p')).textDecorationLine);
    log('1b. Re-clic Souligné retire la ligne (toggle off)', s === 'none');

    await page.click('[data-editor-action="strike"]');
    await page.waitForTimeout(150);
    s = await page.evaluate(() => getComputedStyle(document.querySelector('#cc-ws-doc-card p')).textDecorationLine);
    log('2a. Barré seul (legacy, bloc entier) — ligne calculée contient "line-through"', s.includes('line-through'));

    await page.click('[data-editor-action="underline"]');
    await page.waitForTimeout(150);
    s = await page.evaluate(() => getComputedStyle(document.querySelector('#cc-ws-doc-card p')).textDecorationLine);
    log('3a. Souligné + Barré ensemble — les deux lignes présentes simultanément', s.includes('underline') && s.includes('line-through'));

    // Gras/italique/couleur/police/taille non affectés par ce qui précède
    await page.click('[data-editor-action="bold"]');
    await page.click('[data-editor-action="italic"]');
    await page.waitForTimeout(150);
    const style1 = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#cc-ws-doc-card p')); return { fw: cs.fontWeight, fs: cs.fontStyle, dec: cs.textDecorationLine }; });
    log('4a. Gras applique bien fontWeight 700 sans perturber souligné+barré déjà actifs', style1.fw === '700' && style1.dec.includes('underline') && style1.dec.includes('line-through'));
    log('4b. Italique applique bien fontStyle italic sans perturber le reste', style1.fs === 'italic');

    // Rechargement complet de la page — persistance réelle via art.html (source de vérité legacy)
    const artHtmlBefore = await page.evaluate((sk) => window._adocArtifacts[sk].html, storeKey);
    await page.close();
    const page2 = await browser.newPage();
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await setup(page2, false);
    await injectLegacyDoc(page2, storeKey, artHtmlBefore);
    await page2.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page2.waitForTimeout(300);
    const sAfterReload = await page2.evaluate(() => { const p = document.querySelector('#cc-ws-doc-card p'); return p ? getComputedStyle(p).textDecorationLine : null; });
    log('5a. Souligné+Barré survivent à un "rechargement" (art.html ré-ouvert dans une page neuve)', sAfterReload && sAfterReload.includes('underline') && sAfterReload.includes('line-through'));
    log('1-5. Aucune erreur JS', errors.length === 0 && errors2.length === 0);
    await page2.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // LEGACY, scope "Texte sélectionné" — mise en forme partielle (point 2)
  // ══════════════════════════════════════════════════════════════════════
  {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await setup(page, false);
    const html = '<!DOCTYPE html><html><head><style>:root{--mer:#1f5053;--deep:#102f31;}</style></head><body><p>Un paragraphe de test pour la mise en forme partielle.</p></body></html>';
    const storeKey = await injectLegacyDoc(page, 'legacy-selection', html);
    await page.evaluate((sk) => window.adocOpenWorkspace(sk), storeKey);
    await page.waitForTimeout(300);
    await page.click('#cc-ws-doc-card p');
    await page.waitForTimeout(200);
    await page.selectOption('[data-editor-scope]', 'selection');
    await page.waitForTimeout(100);
    await page.dblclick('#cc-ws-doc-card p', { position: { x: 40, y: 8 } });
    await page.waitForTimeout(100);
    const selectedWord = await page.evaluate(() => window.getSelection().toString());
    await page.click('[data-editor-action="underline"]');
    await page.waitForTimeout(150);
    const html1 = await page.evaluate(() => document.querySelector('#cc-ws-doc-card p').innerHTML);
    log('6a. Un mot précis a bien été sélectionné (double-clic)', selectedWord.length > 0);
    log('6b. SEUL le mot sélectionné porte le souligné, jamais tout le bloc (mécanisme de plage déjà existant)', html1.includes('<span style="text-decoration: underline;">' + selectedWord + '</span>') && !html1.startsWith('<span style="text-decoration: underline;">Un'));
    log('6c. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  console.log('=== Résultats — 57c/57f : état actuel souligné/barré + formatage partiel ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
