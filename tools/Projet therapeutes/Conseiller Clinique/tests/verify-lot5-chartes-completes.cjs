// Lot 5 : parcours visible de choix d'une charte importée, avec faux Worker local.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const kits = [
  { id: '00000000-0000-4000-8000-000000000001', version: 1, name: 'Charte interne', colors: { primary: '#102f31', accent: '#9b4e36', background: '#f6f2ea', text: '#273331' }, typography: { headingFont: 'Georgia', bodyFont: 'Arial' } },
  { id: '11111111-1111-4111-8111-111111111111', version: 1, name: 'Charte importée peu contrastée', sourceType: 'pdf', colors: { primary: '#bbbbbb', accent: '#cccccc', background: '#ffffff', text: '#eeeeee' }, typography: { headingFont: 'Sinthya', bodyFont: 'Arial' } },
];
const doc = {
  schemaVersion: 1, documentId: 'lot5-doc', versionId: 'lot5-v1', previousVersionId: null,
  requestId: 'lot5-request', sourceSnapshotId: 'lot5-snapshot', createdAt: '2026-10-21T10:00:00Z',
  language: 'fr', status: 'draft', title: 'Charte de test', purpose: 'test', audience: 'praticien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [], deepDives: [],
  blocks: [{ id: 'slide-01', type: 'card', content: { title: 'Diapositive', imageRef: null, imageAlt: null,
    blocks: [{ id: 'p1', type: 'paragraph', content: { text: 'Un contenu intact.' }, citationIds: [], validation: {} }] } }],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
};

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const writes = [];
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', (route) => {
      const request = route.request();
      const url = request.url();
      if (request.method() !== 'GET') writes.push(request.method() + ' ' + url);
      if (url.startsWith('file:')) return route.continue();
      if (/\/brand-kits$/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: kits }) });
      if (/\/brand-kits\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kits.find((k) => url.endsWith(k.id))) });
      return route.abort();
    });
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocOpenStructuredReThemePanel === 'function');
    await page.evaluate((d) => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.lot5 = { name: d.title, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: d };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'lot5' });
      window._adocBrandKits = null;
    }, doc);
    assert.equal(await page.evaluate(() => window.adocOpenWorkspace('lot5')), true);
    await page.evaluate(() => window.adocOpenStructuredReThemePanel('lot5'));
    await page.waitForFunction(() => !document.getElementById('cc-retheme-chartes')?.textContent.includes('Chargement'));
    const blocksBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window._adocArtifacts.lot5._adocStructuredDoc.blocks)));
    const writesBefore = writes.length;
    const panel = page.locator('#cc-legacy-retheme-body');
    assert.match(await panel.innerText(), /Thèmes rapides/);
    assert.match(await panel.innerText(), /Chartes complètes/);
    assert.match(await panel.innerText(), /Charte interne/);
    assert.match(await panel.innerText(), /Charte importée peu contrastée/);
    await panel.getByRole('button', { name: /Charte importée peu contrastée/ }).click();
    await page.waitForFunction(() => document.getElementById('cc-legacy-retheme-body')?.textContent.includes('Aperçu avec'));
    assert.match(await panel.innerText(), /Contraste .*sous le seuil AA/);
    assert.match(await panel.innerText(), /Confirmer/);
    assert.equal(await page.evaluate(() => window._adocArtifacts.lot5._adocRenderManifestOverride || null), null, 'pas appliqué avant confirmation');
    await panel.getByRole('button', { name: /Confirmer/ }).click();
    await page.waitForFunction(() => document.getElementById('cc-ws-save-status')?.textContent.includes('Modifications non sauvegardées'));
    await page.waitForFunction(() => document.getElementById('cc-ws-font-warning-banner')?.textContent.includes('Sinthya'), null, { timeout: 5000 });
    assert.match(await page.locator('#cc-ws-font-warning-banner').innerText(), /Sinthya/);
    const result = await page.evaluate(() => ({
      kit: window._adocArtifacts.lot5._adocRenderManifestOverride?.brandKitRef?.id,
      doc: window._adocArtifacts.lot5._adocStructuredDoc,
    }));
    assert.equal(result.kit, kits[1].id);
    assert.deepEqual(result.doc.blocks, blocksBefore, 'le contenu reste identique après le choix de charte');
    const qc = await page.evaluate(() => window.adocRunQualityContract(window._adocArtifacts.lot5._adocStructuredDoc, ['citation-invalide'], [], [], {}));
    assert.equal(qc.exportAllowed, false, 'le contrôle qualité continue de bloquer une citation invalide');
    assert.deepEqual(writes.slice(writesBefore).filter((url) => /\/clinical-documents(?:\/|$)/.test(url)), [],
      'aucune écriture de document due au changement de charte avant Sauvegarder');
    await page.evaluate(() => {
      window._adocArtifacts.legacy = { name: 'Ancien moteur', _adocGenerationEngine: 'legacy-html', html: '<html><body>Essai</body></html>' };
      window._adocWsState.storeKey = 'lot5';
      window.adocOpenLegacyReThemePanel('legacy');
    });
    await page.waitForFunction(() => document.getElementById('cc-legacy-retheme-body')?.textContent.includes('Charte importée peu contrastée'));
    assert.match(await panel.innerText(), /Chartes complètes/);
    assert.match(await panel.innerText(), /Contraste .*sous le seuil AA/);
    console.log('PASS lot 5 : chartes complètes, importée peu contrastée, aperçu, confirmation, état modifié sans sauvegarde.');
  } finally { await browser.close(); }
})().catch((e) => { console.error('ÉCHEC lot 5 :', e); process.exit(1); });
