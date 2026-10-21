const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { ROOT: FIXTURE_ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');
const ROOT = process.env.STUDIO_ROOT || FIXTURE_ROOT;

(async () => {
  const browser = await (process.env.LOT9_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.route('https://**/*', route => route.fulfill({ json: { results: [], items: [], total: 0 } }));
    await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    const d = doc('presentation');
    d.title = 'Narration fidèle';
    const card = d.blocks[0];
    card.content.title = 'Diapositive clinique';
    card.content.blocks = [
      { id: 'n1', type: 'paragraph', content: { text: 'À l’écran seulement' } },
      { id: 'n2', type: 'paragraph', content: { text: 'Deuxième bloc' } },
      { id: 'n3', type: 'paragraph', content: { text: 'Troisième bloc' } }
    ];
    d.blocks.push({ id: 'carte-vide', type: 'card', content: { title: 'Dernière page', blocks: [] } });
    d.narration = [
      { stepId: 'n1', text: 'Bonjour à tous, voici notre première étape.' },
      { stepId: 'n3', text: 'Une pause [pause 2 s] puis une conclusion.' },
      { stepId: 'carte-vide', text: 'La dernière page se raconte.' }
    ];
    const result = await page.evaluate(d => ({
      struct: window.adocStructureNarration(d),
      txt: window.adocTexteNarration(d),
      docx: Array.from(window.adocDocxNarration(d)),
      pdf: Array.from(window.adocPdfNarration(d)),
      publicHtml: window.adocDocumentPourExport(d)
    }), d);
    assert.equal(result.struct.diapositives.length, 2);
    assert.equal(result.txt.includes('À l’écran seulement'), false);
    assert.equal(result.txt.includes('proposition non appliquée'), false);
    assert.equal(result.txt.includes('Bonjour à tous, voici notre première étape.'), true);
    assert.equal(result.txt.includes('(sans narration)'), true);
    assert.equal(result.txt.includes('Une pause [pause 2 s] puis une conclusion.'), true);
    assert.equal(result.txt.includes('estimation indicative'), true);
    assert.equal(result.txt.includes('Total :'), true);
    assert.match(result.txt, /7 mots · 3 s — estimation indicative/);
    assert.match(result.txt, /5 mots · 2 s — estimation indicative/);
    assert.match(result.txt, /Total : 17 mots · 7 s — estimation indicative/);
    assert.equal(result.publicHtml.narration, undefined);
    assert.equal(await page.evaluate(d => window.adocStructureNarration(d), doc('carrousel')), null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot9-'));
    try {
      const docx = path.join(tmp, 'narration.docx'), pdf = path.join(tmp, 'narration.pdf');
      fs.writeFileSync(docx, Buffer.from(result.docx)); fs.writeFileSync(pdf, Buffer.from(result.pdf));
      const word = execFileSync('python3', ['-c', 'from zipfile import ZipFile; from xml.etree import ElementTree as E; import sys; x=E.fromstring(ZipFile(sys.argv[1]).read("word/document.xml")); print(" ".join((n.text or "") for n in x.iter() if n.tag.endswith("}t")))', docx], { encoding: 'utf8' });
      const pdfText = execFileSync('python3', ['-c', 'from pypdf import PdfReader; import sys; r=PdfReader(sys.argv[1]); print(" ".join(p.extract_text() for p in r.pages))', pdf], { encoding: 'utf8' });
      for (const [name, body] of [['Word', word], ['PDF', pdfText]]) {
        for (const marker of ['Narration fidèle', 'Diapositive clinique', 'Bonjour à tous', '(sans narration)', 'Dernière page', 'Total :'])
          assert.ok(body.includes(marker), name + ' manque ' + marker);
        assert.ok(!body.includes('À l’écran seulement'), name + ' mêle texte projeté et narration');
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    assert.equal(await open(page, doc('presentation')), true);
    await page.evaluate(() => window.adocWsMenuToggle('export'));
    for (const id of ['cc-ws-narration-txt-btn', 'cc-ws-narration-word-btn', 'cc-ws-narration-pdf-btn'])
      assert.equal(await page.locator('#' + id).isVisible(), true, id);
    for (const [id, ext] of [['cc-ws-narration-txt-btn', 'txt'], ['cc-ws-narration-word-btn', 'docx'], ['cc-ws-narration-pdf-btn', 'pdf']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#' + id).evaluate(el => el.click())]);
      assert.match(download.suggestedFilename(), new RegExp('^narration-\\d{4}-\\d{2}-\\d{2}\\.' + ext + '$'));
    }
    const [repeat] = await Promise.all([page.waitForEvent('download'), page.locator('#cc-ws-narration-txt-btn').evaluate(el => el.click())]);
    assert.match(repeat.suggestedFilename(), /^narration-\d{4}-\d{2}-\d{2}-2\.txt$/);
    assert.equal(await open(page, doc('carrousel'), 'test-carrousel'), true);
    await page.evaluate(() => window.adocWsMenuToggle('export'));
    for (const id of ['cc-ws-narration-txt-btn', 'cc-ws-narration-word-btn', 'cc-ws-narration-pdf-btn'])
      assert.equal(await page.locator('#' + id).isVisible(), false, id + ' caché pour Carrousel');
    console.log('PASS lot 9 narration fidèle TXT Word PDF');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
