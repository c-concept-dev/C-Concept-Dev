const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const browser = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    const calls = [];
    await page.route('https://**/*', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        if (body?.payload?.tool_choice?.name === 'emit_block_correction') {
          calls.push(body.payload);
          return route.fulfill({ json: { content: [{ type: 'tool_use', name: 'emit_block_correction', input: {
            text: 'Un nouveau paragraphe qui prolonge le raisonnement clinique.', items: [], headers: [], rows: []
          } }] } });
        }
      }
      return route.fulfill({ body: '', contentType: 'application/javascript' });
    });
    await page.goto('file://' + ROOT + '/studio-clinique.html');
    await page.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('assistdoc-screen')?.classList.add('active'); });
    for (const kind of ['presentation', 'carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const d = doc(kind);
      const blocks = ['presentation', 'carrousel'].includes(kind) ? d.blocks[0].content.blocks : d.blocks;
      blocks[1].content.text = 'Nouveau paragraphe.';
      blocks.push({ id: 'after', type: 'paragraph', content: { text: 'Contexte clinique suivant.' }, citationIds: [], validation: {} });
      const key = 'draft-' + kind;
      assert.equal(await open(page, d, key), true, kind);
      await page.locator('#p1').click();
      await page.getByRole('button', { name: 'Rédiger ce paragraphe', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmer', exact: true }).waitFor();
      const call = calls.at(-1);
      assert.match(call.messages[0].content, /Introduction/);
      assert.match(call.messages[0].content, /Contexte clinique suivant/);
      assert.match(call.messages[0].content, /PARAGRAPHE À RÉDIGER/);
      assert.equal(await page.locator('#p1 [data-cc-editor-leaf]').innerText(), 'Nouveau paragraphe.', 'aucune écriture avant confirmation');
      await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
      assert.match(await page.locator('#p1').innerText(), /Un nouveau paragraphe/);
      await page.locator('#cc-ws-undo-btn').click();
      assert.match(await page.locator('#p1').innerText(), /Nouveau paragraphe/);
    }
    await page.evaluate(async () => {
      _adocArtifacts.legacyDraft = { name: 'Ancien document', html: '<!doctype html><html><body><h2>Avant clinique</h2><p>Nouveau paragraphe.</p><p>Après clinique.</p></body></html>',
        _adocGenerationEngine: 'legacy-html', _adocDocumentKind: 'fiche', _adocCapabilities: { workspace: true, legacyBlockEditing: true, persist: true } };
      await adocOpenWorkspace('legacyDraft');
    });
    await page.locator('#cc-ws-doc-card p').first().click();
    await page.getByRole('button', { name: 'Rédiger ce paragraphe', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmer', exact: true }).waitFor();
    const call = calls.at(-1);
    assert.match(call.messages[0].content, /Avant clinique/);
    assert.match(call.messages[0].content, /Après clinique/);
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
    assert.match(await page.locator('#cc-ws-doc-card').innerText(), /Un nouveau paragraphe/);
    await page.locator('#cc-ws-undo-btn').click();
    assert.match(await page.locator('#cc-ws-doc-card').innerText(), /Nouveau paragraphe/);
    console.log('PASS rédaction contextualisée et annulation : 6 types structurés + legacy');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
