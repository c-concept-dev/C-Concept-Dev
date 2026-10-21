const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

(async () => {
  const repo = path.resolve(ROOT, '../../..');
  const rel = 'tools/Projet therapeutes/Conseiller Clinique/';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot7-baseline-'));
  for (const file of ['studio-clinique.html', 'studio-clinique-core.js']) {
    fs.writeFileSync(path.join(tmp, file), execFileSync('git', ['show', 'eab3aa9f:' + rel + file], { cwd: repo, maxBuffer: 10 * 1024 * 1024 }));
  }
  for (const file of ['vendor', 'atelier-images.js', 'narration-ia.js']) fs.symlinkSync(path.join(ROOT, file), path.join(tmp, file));
  const browser = await chromium.launch();
  try {
    async function render(root, d) {
      const page = await browser.newPage();
      await page.route('https://**/*', r => r.fulfill({ json: { results: [], items: [], total: 0 } }));
      await page.goto('file://' + root + '/studio-clinique.html');
      assert.equal(await open(page, d), true);
      const html = await page.locator('.adoc-sc-doc').first().evaluate(el => {
        const clone = el.cloneNode(true);
        // Le lot ajoute un accès clavier aux images dans l'éditeur. Ces attributs UI
        // ne font pas partie du document persistant ni de son rendu visuel.
        clone.querySelectorAll('[aria-label^="Options de la photo"], [aria-label="Options de la couverture"]').forEach(image => {
          image.removeAttribute('tabindex');
          image.removeAttribute('role');
          image.removeAttribute('aria-label');
        });
        // Les croix de suppression du lot suivant sont également un contrôle de
        // l'espace de travail, absent du document persisté et de ses exports.
        clone.querySelectorAll('.cc-block-delete, .cc-image-resize-handle, .cc-flow-resize-handle, .adoc-sc-nested-resize-handle, .adoc-sc-card-resize-handle').forEach(button => button.remove());
        return clone.outerHTML;
      });
      await page.close(); return html;
    }
    for (const kind of ['presentation', 'carrousel', 'fiche', 'tableau', 'script', 'liens']) {
      const d = doc(kind);
      if (kind === 'presentation' || kind === 'carrousel') {
        d.blocks[0].content.imageRef = 'image clinique'; d.blocks[0].content.imageAlt = 'Image clinique';
        d.blocks[0].content.blocks.push({ id: 'image-' + kind, type: 'image', content: { query: 'photographie', alt: 'Photographie' }, citationIds: [], validation: {} });
      } else d.blocks.unshift({ id: 'cover-' + kind, type: 'image', content: { query: 'photo', alt: 'Couverture' }, citationIds: [], validation: {} });
      const actual = await render(ROOT, d), expected = await render(tmp, d);
      if (actual !== expected) {
        let at = 0;
        while (at < actual.length && actual[at] === expected[at]) at++;
        assert.fail(kind + ' ancien document modifié à l’octet ' + at + '\nActuel : ' + actual.slice(Math.max(0, at - 80), at + 180) + '\nAvant : ' + expected.slice(Math.max(0, at - 80), at + 180));
      }
    }
    console.log('PASS lot 7 : six rendus historiques identiques après retrait des attributs interactifs de l’éditeur');
  } finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
