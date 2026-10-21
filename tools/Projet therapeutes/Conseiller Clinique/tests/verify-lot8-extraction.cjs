const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const { ROOT: FIXTURE_ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');
const ROOT = process.env.STUDIO_ROOT || FIXTURE_ROOT;

(async () => {
  const browser = await (process.env.LOT8_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ json: { results: [], items: [], total: 0 } }));
    await page.goto('file://' + path.join(ROOT, 'studio-clinique.html'));
    const d = doc('presentation');
    d.blocks[0].content.imageRef = 'couverture-clinique';
    d.blocks[0].content.imageAlt = 'Couverture thérapeutique';
    const blocks = d.blocks[0].content.blocks;
    blocks.push({ id: 'a', type: 'callout', content: { text: 'Attention clinique', visualRole: 'info' } });
    blocks.push({ id: 'q', type: 'quote', content: { text: 'Une citation' } });
    blocks.push({ id: 'l', type: 'list', content: { items: ['alpha', 'bêta'], ordered: false } });
    blocks.push({ id: 'i', type: 'image', content: { query: 'photo', alt: 'Photo du couple' } });
    blocks.push({ id: 'v', type: 'video', content: { url: 'https://example.com/v', title: 'Vidéo clinique' } });
    blocks.push({ id: 'quiz', type: 'quiz', content: { question: 'Question clinique ?', options: ['Oui', 'Non'], correctIndex: 0, explanation: 'Explication' } });
    blocks.push({ id: 'questionnaire', type: 'questionnaire', content: { questions: [
      { text: 'Question 1 ?', options: [{ text: 'Jamais', points: 0 }, { text: 'Souvent', points: 2 }] },
      { text: 'Question 2 ?', options: [{ text: 'Parfois', points: 1 }, { text: 'Toujours', points: 3 }] }],
      profiles: [{ label: 'Profil A', interpretation: 'Interprétation', minScore: 0, maxScore: 5 }], allowTwoPartners: false } });
    blocks.push({ id: 't', type: 'table', content: { headers: ['Avant', 'Après'], rows: [['x', 'y']] } });
    blocks.push({ id: 'empty-heading', type: 'heading', content: { text: '' } });
    d.blocks.push({ id: 'vide', type: 'card', content: { title: 'Étape vide', blocks: [] } });
    const output = await page.evaluate(d => ({
      struct: window.adocStructureDesDiapositives(d),
      txt: window.adocTexteDesDiapositives(d),
      hasPdf: typeof window.adocPdfTexteDiapositives === 'function',
      pdf: Array.from(window.adocPdfTexteDiapositives(d)),
      docx: Array.from(window.adocDocxDesDiapositives(d))
    }), d);
    for (const marker of ['Encadré : Attention clinique', 'Citation : Une citation', '[Image : Couverture thérapeutique]', '[Image : Photo du couple]',
      '[Vidéo : Vidéo clinique]', 'Question clinique ?', 'Question 1 ?', 'Jamais', 'Souvent',
      'Avant | Après', '(aucun contenu)']) assert.ok(output.txt.includes(marker), marker);
    assert.ok(output.struct.diapositives[0].elements.some(e => e.genre === 'questionnaire'));
    assert.equal((output.txt.match(/\(aucun contenu\)/g) || []).length, 2, 'étape vide et diapositive vide signalées');
    assert.equal(output.hasPdf, true, 'PDF du texte disponible');
    const normalize = s => String(s).normalize('NFKC').replace(/[\uFB00-\uFB04]/g, x => x.normalize('NFKC'))
      .replace(/\u0000/g, '').replace(/[’']/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/\s/g, '');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot8-'));
    try {
      const pdf = path.join(tmp, 'texte.pdf'), docx = path.join(tmp, 'texte.docx');
      fs.writeFileSync(pdf, Buffer.from(output.pdf));
      fs.writeFileSync(docx, Buffer.from(output.docx));
      if (process.env.LOT8_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.LOT8_EVIDENCE_DIR, { recursive: true });
        fs.copyFileSync(pdf, path.join(process.env.LOT8_EVIDENCE_DIR, 'lot8-texte-validation.pdf'));
        fs.copyFileSync(docx, path.join(process.env.LOT8_EVIDENCE_DIR, 'lot8-texte-validation.docx'));
      }
      let extracted;
      try { extracted = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' }); }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
        // Poppler n'est pas installé sur tous les Mac de développement. La source PDF de ce
        // contrôle est Helvetica sans ligatures ; le rendu visuel est vérifié séparément.
        extracted = execFileSync('python3', ['-c',
          'from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', pdf], { encoding: 'utf8' });
      }
      const wordText = execFileSync('python3', ['-c',
        'from zipfile import ZipFile; from xml.etree import ElementTree as ET; import sys; '
        + 'x=ET.fromstring(ZipFile(sys.argv[1]).read("word/document.xml")); '
        + 'print("\\n".join((n.text or "") for n in x.iter() if n.tag.endswith("}t")))', docx], { encoding: 'utf8' });
      const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
      assert.match(info, /Page size:\s+595 x 842 pts \(A4\)/);
      execFileSync('python3', ['-c',
        'from pypdf import PdfReader; import sys; r=PdfReader(sys.argv[1]); assert all("/Annots" not in p for p in r.pages)', pdf]);
      for (const [format, body] of [['PDF', extracted], ['Word', wordText]]) {
        const norm = normalize(body);
        let previous = -1;
        for (const marker of ['Couverture thérapeutique', 'Attention clinique', 'Une citation', 'alpha', 'bêta',
          'Photo du couple', 'Vidéo clinique', 'Question clinique ?', 'Oui', 'Non', 'Question 1 ?', 'Jamais', 'Souvent',
          'Question 2 ?', 'Parfois', 'Toujours', 'Avant', 'Après', 'Étape vide']) {
          const found = norm.indexOf(normalize(marker), previous + 1);
          assert.ok(found > previous, format + ' manque ou inverse ' + marker);
          previous = found;
        }
        assert.equal(norm.includes(normalize('Profil A')), false, format + ' ne doit pas inclure les profils');
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    assert.equal(await open(page, doc('presentation')), true);
    const button = page.locator('#cc-ws-texte-pdf-btn');
    assert.equal(await button.isVisible(), false, 'entrée cachée tant que menu fermé');
    await page.evaluate(() => window.adocWsMenuToggle('export'));
    assert.equal(await button.isVisible(), true, 'entrée PDF du texte dans Exporter');
    const [download] = await Promise.all([page.waitForEvent('download'), button.evaluate(el => el.click())]);
    assert.match(download.suggestedFilename(), /^texte-des-diapositives-\d{4}-\d{2}-\d{2}.*\.pdf$/);
    console.log('PASS lot 8 extraction exhaustive et PDF du texte disponible');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
