// Q7/Q9 : une charte et une image restent en mémoire, puis une seule version naît au clic Sauvegarder.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');
const backend = require(path.resolve(__dirname, '../../../../Worker/tests/clinical-documents-sqlite.cjs'))();
const host = 'https://studio-lot2.local';
(async () => {
  const browser = await chromium.launch();
  const route = async r => {
    const q = r.request(), u = new URL(q.url());
    if (q.resourceType() === 'script') return r.fulfill({ body: '', contentType: 'application/javascript' });
    if (u.pathname.startsWith('/clinical-documents')) {
      const rep = await backend.respond(q.url(), q.method(), q.postData());
      return r.fulfill({ status: rep.status, body: await rep.text(), contentType: 'application/json' });
    }
    return r.fulfill({ json: { results: [], items: [], total: 0 } });
  };
  const context = async () => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(h => { localStorage.setItem('workerUrl', h); localStorage.setItem('workerApiKey', 'lot2-local'); }, host);
    await ctx.route('https://**/*', route);
    const page = await ctx.newPage();
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.waitForFunction(() => typeof window.adocWsSave === 'function');
    return { ctx, page };
  };
  const count = id => backend.db.prepare('SELECT COUNT(*) AS n FROM clinical_document_versions WHERE document_id = ?').get(id).n;
  try {
    const a = await context();
    const d = doc(); d.blocks[0].content.imageRef = 'ocean landscape'; d.blocks[0].content.imageAlt = 'Océan';
    assert.equal(await open(a.page, d), true);
    await a.page.evaluate(() => window.adocWsSave());
    const id = await a.page.evaluate(() => window._adocArtifacts['test-doc']._adocClinicalDocumentId);
    assert.ok(id); assert.equal(count(id), 1);
    await a.page.evaluate(() => window.adocApplyTheme('test-doc', 'encre'));
    assert.equal(count(id), 1, 'le thème ne crée aucune version');
    assert.equal(await a.page.locator('#cc-ws-save-status').textContent(), 'Modifications non sauvegardées');
    await a.page.evaluate(() => window.adocWsSave());
    assert.equal(count(id), 2, 'le clic Sauvegarder crée une seule nouvelle version');
    const b = await context();
    assert.equal(await b.page.evaluate(id => window.adocOpenSavedClinicalDocument(id), id), true);
    assert.equal(await b.page.locator('#cc-ws-brandkit').textContent(), 'Encre — académique sobre');
    assert.equal(await b.page.locator('.adoc-sc-card-img').count(), 1);
    await b.page.locator('.adoc-sc-card-img').click();
    await b.page.evaluate(() => window.adocRemoveCardImage());
    await b.page.waitForFunction(() => document.querySelectorAll('.adoc-sc-card-img').length === 0);
    assert.equal(count(id), 2, 'retirer la couverture ne crée aucune version');
    assert.equal(await b.page.locator('#cc-ws-save-status').textContent(), 'Modifications non sauvegardées');
    await b.page.evaluate(() => window.adocWsSave());
    assert.equal(count(id), 3);
    const c = await context();
    assert.equal(await c.page.evaluate(id => window.adocOpenSavedClinicalDocument(id), id), true);
    assert.equal(await c.page.locator('.adoc-sc-card-img').count(), 0);
    assert.equal(await c.page.locator('#cc-ws-brandkit').textContent(), 'Encre — académique sobre');
    assert.deepEqual(backend.db.prepare('PRAGMA foreign_key_check').all(), []);
    console.log('PASS charte + couverture : 1 version initiale, zéro écriture automatique, une version par clic, relecture vierge identique');
    await a.ctx.close(); await b.ctx.close(); await c.ctx.close();
  } finally { await browser.close(); backend.db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
