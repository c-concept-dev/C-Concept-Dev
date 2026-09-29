// Puces d'une page d'approfondissement, par PRÉFIXE conventionnel.
//
// Forme choisie parce qu'elle coûte ZÉRO octet de grammaire compilée — et la grammaire de l'outil
// Présentation vit au bord de sa taille maximale. Contrepartie assumée : la convention est
// implicite. Ce test fixe donc précisément ce qui EST une puce et ce qui ne l'est pas, pour qu'un
// paragraphe ordinaire ne le devienne jamais par accident.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-page-puces.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = {
  id: 'n1', title: 'Une page',
  paragraphs: [
    'Un paragraphe ordinaire, en prose.',
    '- Première puce',
    '- Deuxième puce',
    'Un paragraphe entre deux listes.',
    '• Puce au marqueur rond',
    '- Puce au tiret, dans la même liste',
    // Les cas qui ne doivent PAS devenir des puces.
    '-30 % des patientes, sans espace après le tiret.',
    '— Dit-elle, tiret cadratin de dialogue.',
    'Un dernier paragraphe.',
  ],
};
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'v', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Puces', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{ id: 'c1', type: 'card', citationIds: [], validation: {},
    content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      { id: 'p1', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {},
        deepDiveLinks: [{ text: 'Un texte', targetId: 'n1' }] }] } }],
  deepDives: [PAGE],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'puces-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocDeepDiveParagraphesHTML === 'function');

    // ── 1. LA FONCTION PURE — ce qui est une puce, et ce qui ne l'est pas ───────────────────
    const html = await page.evaluate(p => window.adocDeepDiveParagraphesHTML(p), PAGE.paragraphs);
    const listes = html.match(/<ul class="cc-ws-present-door-list">[\s\S]*?<\/ul>/g) || [];
    const items = html.match(/<li>/g) || [];
    const paras = html.match(/<p>/g) || [];
    assert.equal(listes.length, 2, 'deux listes séparées par un paragraphe : ' + listes.length);
    assert.equal(items.length, 4, 'quatre puces au total : ' + items.length);
    assert.equal(paras.length, 5, 'cinq paragraphes ordinaires : ' + paras.length);
    console.log('PASS 1/5  regroupement : ' + listes.length + ' listes, ' + items.length
      + ' puces, ' + paras.length + ' paragraphes.');

    // ── 2. LE MARQUEUR EST RETIRÉ DU TEXTE AFFICHÉ ─────────────────────────────────────────
    assert.ok(html.includes('<li>Première puce</li>'), 'le marqueur doit disparaître du rendu');
    assert.ok(html.includes('<li>Puce au marqueur rond</li>'));
    assert.ok(!/<li>\s*[-•]/.test(html), 'aucun marqueur ne doit subsister dans une puce');
    console.log('PASS 2/5  le marqueur « - » ou « • » est retiré du texte affiché.');

    // ── 3. CE QUI NE DOIT PAS DEVENIR UNE PUCE ─────────────────────────────────────────────
    // L'espace après le marqueur est exigée précisément pour ces cas — un paragraphe ordinaire
    // ne doit jamais se transformer en liste par accident.
    assert.ok(html.includes('<p>-30 % des patientes, sans espace après le tiret.</p>'),
      'un tiret sans espace n\'est PAS une puce');
    assert.ok(html.includes('<p>— Dit-elle, tiret cadratin de dialogue.</p>'),
      'un tiret cadratin de dialogue n\'est PAS une puce');
    console.log('PASS 3/5  « -30 % » et « — Dit-elle » restent des paragraphes.');

    // ── 4. UN RENVOI SURVIT DANS UNE PUCE ──────────────────────────────────────────────────
    // Le marqueur est retiré AVANT l'enrichissement : sans cela, un renvoi dont l'expression
    // ouvre le paragraphe ne serait plus retrouvé dans le texte.
    const avecLien = await page.evaluate(() => window.adocDeepDiveParagraphesHTML([
      { text: '- Notion clé de ce passage', deepDiveLinks: [{ text: 'Notion clé', targetId: 'n2' }] }]));
    assert.ok(avecLien.includes('<li>'), 'la puce doit rester une puce');
    assert.ok(/adoc-sc-deepdive-link|adoc-sc-deepdive-chip/.test(avecLien),
      'le renvoi doit survivre dans une puce : ' + avecLien);
    assert.ok(avecLien.includes('Notion clé'), 'l\'expression du renvoi doit être retrouvée');
    console.log('PASS 4/5  un renvoi d\'approfondissement survit à l\'intérieur d\'une puce.');

    // ── 5. DANS UN EXPORT RÉELLEMENT OUVERT, ET CLIQUÉ JUSQU'À LA PORTE ────────────────────
    // adocDeepDiveParagraphesHTML est appelée par adocDeepDivePopulateDoor, elle-même embarquée :
    // sans elle dans engineFnRefs, la première page ouverte lèverait une ReferenceError.
    const construit = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    assert.ok(construit.includes('function adocDeepDiveParagraphesHTML'),
      'la fonction doit être embarquée dans l\'export');
    const fichier = path.join(dossier, 'p.html');
    fs.writeFileSync(fichier, construit, 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errExp = [];
    exp.on('pageerror', e => errExp.push(e.message));
    await exp.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'), null, { timeout: 60000 });
    const dansExport = await exp.evaluate(async () => {
      window.adocPresentOpenDeepDive('n1');
      await new Promise(r => setTimeout(r, 400));
      const t = document.querySelector('.cc-ws-present-door-text');
      return { listes: t.querySelectorAll('ul.cc-ws-present-door-list').length,
               puces: t.querySelectorAll('li').length,
               ouverte: document.getElementById('cc-ws-present-door').classList.contains('open') };
    });
    assert.equal(dansExport.ouverte, true, 'la porte doit s\'ouvrir dans l\'export');
    assert.equal(dansExport.listes, 2, 'les listes doivent être rendues dans l\'export : ' + dansExport.listes);
    assert.equal(dansExport.puces, 4);
    assert.deepEqual(errExp, [], 'erreur dans l\'export : ' + errExp.join(' | '));
    await exp.close();
    console.log('PASS 5/5  export construit, ouvert, porte ouverte : ' + dansExport.listes
      + ' listes et ' + dansExport.puces + ' puces rendues, 0 ReferenceError.');

    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nTOUT PASSE — 5/5, aucun appel réseau.');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
