// LOT B5 — le balisage de la porte plein écran n'a plus qu'UNE source.
//
// Il existait en deux exemplaires maintenus à la main : dans studio-clinique.html et dans la
// coquille d'export. Ils avaient déjà divergé — `.cc-ws-present-door-text` n'existait que dans la
// page vivante, si bien qu'un approfondissement exporté n'avait nulle part où s'afficher, et rien
// ne le signalait. Ce test rend cette divergence impossible à réintroduire en silence.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b5-porte-source-unique.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B5 porte', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{ id: 'card-01', type: 'card', content: { title: 'Diapositive', imageRef: null, imageAlt: '', blocks: [
    { id: 'paragraph-01', type: 'paragraph', content: { text: 'Le stress chronique agit.' }, citationIds: [], validation: {},
      deepDiveLinks: [{ text: 'stress chronique', targetId: 'n1' }] }] }, citationIds: [], validation: {} }],
  deepDives: [{ id: 'n1', title: 'Le cortisol', paragraphs: ['Terminus.'] }],
};

// Le navigateur sérialise un attribut booléen en hidden="" quand on relit outerHTML : c'est une
// convention de sérialisation du DOM, jamais une divergence du balisage. On la neutralise, sans
// quoi ce test échouerait sur du bruit et masquerait les vraies divergences qu'il traque.
const normaliser = h => h.replace(/\s+/g, ' ').replace(/=""/g, '').trim();

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    // ── 1. LA SOURCE HTML N'A PLUS DE PORTE EN DUR ─────────────────────────────────────────────
    const source = fs.readFileSync(path.join(__dirname, '../studio-clinique.html'), 'utf8');
    assert.equal((source.match(/id="cc-ws-present-door"/g) || []).length, 0,
      'studio-clinique.html ne doit plus contenir la porte en dur : une seconde copie finirait par diverger');
    console.log('PASS 1/7  studio-clinique.html ne contient plus aucun balisage de porte.');

    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentDoorHTML === 'function');

    // ── 2. ELLE EST POURTANT LÀ, ET UNE SEULE FOIS ─────────────────────────────────────────────
    const etat = await page.evaluate(() => ({
      nombre: document.querySelectorAll('#cc-ws-present-door').length,
      dansOverlay: !!document.querySelector('#cc-ws-present-overlay > #cc-ws-present-door'),
      bouton: !!document.querySelector('#cc-ws-present-door-close'),
      slotTexte: !!document.querySelector('#cc-ws-present-door .cc-ws-present-door-text'),
      slotImage: !!document.querySelector('#cc-ws-present-door img'),
      masquee: !!document.getElementById('cc-ws-present-door')?.hidden,
    }));
    assert.equal(etat.nombre, 1, 'exactement une porte, jamais un doublon d\'identifiant');
    assert.equal(etat.dansOverlay, true, 'la porte doit être injectée DANS l\'overlay de présentation');
    assert.ok(etat.bouton && etat.slotTexte && etat.slotImage, 'les trois éléments internes doivent exister');
    assert.equal(etat.masquee, true, 'la porte doit être masquée au repos');
    console.log('PASS 2/7  injectée exactement une fois, au bon endroit, avec ses trois éléments, masquée.');

    // ── 3. ORDRE DE DÉMARRAGE — le script est chargé AVANT que l'overlay soit analysé ───────────
    const posScript = source.indexOf('src="studio-clinique-core.js"');
    const posOverlay = source.indexOf('id="cc-ws-present-overlay"');
    assert.ok(posScript !== -1 && posOverlay !== -1 && posScript < posOverlay,
      'ce test ne vaut que si le script précède réellement l\'overlay dans le document');
    console.log('PASS 3/7  le script précède l\'overlay dans le document : l\'injection différée est bien nécessaire.');

    // ── 4. MÊME BALISAGE DANS L'EXPORT, AU CARACTÈRE PRÈS ──────────────────────────────────────
    const fichier = path.join(os.tmpdir(), 'cc-b5-export.html');
    const html = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC);
    fs.writeFileSync(fichier, html, 'utf8');
    const attendu = await page.evaluate(() => window.adocPresentDoorHTML());
    assert.ok(normaliser(html).includes(normaliser(attendu)),
      'la coquille d\'export doit contenir EXACTEMENT le balisage produit par la source unique');
    const vivant = await page.evaluate(() => document.getElementById('cc-ws-present-door').outerHTML);
    assert.equal(normaliser(vivant), normaliser(attendu),
      'la page vivante et la source unique doivent coïncider au caractère près');
    console.log('PASS 4/7  page vivante, export et source unique : un seul et même balisage.');

    // ── 5. PAS DE DOUBLE INJECTION DANS L'EXPORT ───────────────────────────────────────────────
    assert.equal((html.match(/id="cc-ws-present-door"[^>]*>/g) || []).length, 1,
      'le fichier exporté ne doit contenir qu\'une porte : la coquille l\'écrit déjà, une injection en plus ferait un doublon');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    exp.on('pageerror', e => expErreurs.push(e.message));
    await exp.goto('file://' + fichier);
    // Depuis la phase 3, un fichier exporté ne s'ouvre PLUS tout seul : il attend le geste
    // « ▶ Démarrer », sans lequel aucun navigateur n'accorde le plein écran à un fichier ouvert
    // au double-clic. Sans effet sur une page live, qui n'a pas cet écran.
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForSelector('#cc-ws-present-slide-inner #paragraph-01');
    assert.equal(await exp.evaluate(() => document.querySelectorAll('#cc-ws-present-door').length), 1,
      'une seule porte DANS L\'EXPORT après chargement complet');
    console.log('PASS 5/7  aucune double injection dans l\'export : une seule porte après chargement.');

    // ── 6. LA FONCTION N'A PAS À ÊTRE EXPORTÉE — vérifié, jamais supposé ───────────────────────
    // Le balisage est produit à la CONSTRUCTION du fichier : rien ne l'appelle à l'exécution
    // dedans. L'absence d'adocPresentDoorHTML du graphe d'export doit donc être sans conséquence,
    // et c'est l'ouverture réelle d'une porte dans l'export qui le prouve, pas un raisonnement.
    assert.equal(await exp.evaluate(() => typeof window.adocPresentDoorHTML), 'undefined',
      'la fonction ne doit PAS être embarquée : elle n\'est jamais appelée à l\'exécution dans l\'export');
    await exp.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const titre = await exp.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '');
    assert.match(titre, /cortisol/, 'la porte doit s\'ouvrir et se remplir DANS L\'EXPORT ; obtenu : ' + titre);
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    console.log('PASS 6/7  absente du graphe d\'export, et la porte s\'ouvre quand même : l\'absence est justifiée.');

    // ── 7. LA PAGE VIVANTE OUVRE AUSSI ─────────────────────────────────────────────────────────
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.evaluate(() => window.adocPresentOpenDeepDive('n1'));
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.match(await page.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || ''), /cortisol/);
    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('PASS 7/7  la porte injectée s\'ouvre et se remplit dans la page vivante.');

    console.log('\nPASS verify-b5-porte-source-unique — 7/7.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
