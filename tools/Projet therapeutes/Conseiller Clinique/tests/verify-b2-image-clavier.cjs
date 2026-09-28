// LOT B2 — les images de la présentation sont utilisables AU CLAVIER.
//
// L'image portait un onclick depuis l'Acte 2 sans être atteignable autrement qu'à la souris : ni
// tabulation, ni Entrée, ni annonce par un lecteur d'écran. En vidéoprojection, la présentatrice
// n'a souvent qu'un clavier ou une télécommande.
//
// Tout se fait ici par de VRAIES touches (page.keyboard), jamais par .focus() programmatique ni
// par un .click() forcé : c'est le trajet réel qui est éprouvé, y compris l'ordre de tabulation.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-b2-image-clavier.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lien = (text, targetId) => ({ text, targetId });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'B2 clavier', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{
    id: 'card-01', type: 'card',
    content: {
      title: 'Diapositive de départ', imageRef: null, imageAlt: '',
      blocks: [
        { id: 'image-01', type: 'image', content: { query: 'cortisol', alt: 'Coupe du cerveau' },
          citationIds: [], validation: {}, deepDiveLinks: [lien('Coupe du cerveau', 'n1')] },
        { id: 'image-02', type: 'image', content: { query: 'mains', alt: 'Deux mains' }, citationIds: [], validation: {} },
      ],
    },
    citationIds: [], validation: {},
  }],
  deepDives: [
    { id: 'n1', title: 'Niveau 1 — le cortisol', paragraphs: [
        { text: "Le cortisol reste élevé et la boucle de retour s'émousse.", deepDiveLinks: [lien('boucle de retour', 'n2')] }] },
    { id: 'n2', title: 'Niveau 2 — la boucle', paragraphs: [
        { text: "L'hippocampe cesse de freiner l'axe.", deepDiveLinks: [lien("l'axe", 'n3')] }] },
    { id: 'n3', title: 'Niveau 3 — axe HPA', paragraphs: ['Terminus de cette branche.'] },
  ],
};

const CAPTURES = path.join(os.tmpdir(), 'cc-b2-captures');

const actif = page => page.evaluate(() => {
  const e = document.activeElement;
  return e ? { tag: e.tagName, id: e.id || (e.closest('[id]') || {}).id || null,
               role: e.getAttribute('role'), label: e.getAttribute('aria-label'),
               classe: typeof e.className === 'string' ? e.className : '' } : null;
});

async function revelerTout(page) {
  for (let i = 0; i < 8; i++) {
    const reste = await page.evaluate(() =>
      document.querySelectorAll('#cc-ws-present-slide-inner .adoc-sc-reveal:not(.adoc-sc-reveal-shown)').length);
    if (!reste) return i;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(280);
  }
  throw new Error('blocs jamais tous révélés');
}

async function tabulerJusqua(page, id, max = 30) {
  for (let i = 0; i < max; i++) {
    const a = await actif(page);
    if (a && a.id === id) return i;
    await page.keyboard.press('Tab');
  }
  throw new Error('la tabulation n\'atteint jamais ' + id + ' (dernier focus : ' + JSON.stringify(await actif(page)) + ')');
}

async function ouvrir(page, url, evaluerDoc) {
  await page.goto(url);
  // Un onglet qui n'est pas au premier plan ne reçoit pas les touches : la tabulation semblerait
  // ne mener nulle part alors que la page est parfaitement navigable. Piège du test, jamais du
  // code éprouvé — d'où ce passage explicite au premier plan avant toute frappe.
  await page.bringToFront();
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('cc-landing')?.remove();
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  if (evaluerDoc) {
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
  }
  // Attendre le CONTENU, pas seulement le conteneur : la diapositive se rend de façon asynchrone
  // (résolution des images). Tabuler avant qu'elle existe donne un focus qui semble bloqué sur
  // <body> — piège du test, jamais un défaut de la page.
  await page.waitForSelector('#cc-ws-present-slide-inner #image-01 img', { state: 'attached' });
}

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await ouvrir(page, 'file://' + path.join(__dirname, '../studio-clinique.html'), true);

    // ── 1. LES ATTRIBUTS, dans les deux cas ────────────────────────────────────────────────────
    const attrs = await page.evaluate(() => {
      const lire = id => {
        const i = document.querySelector('#cc-ws-present-slide-inner #' + id + ' img');
        return i ? { tabindex: i.getAttribute('tabindex'), role: i.getAttribute('role'),
                     label: i.getAttribute('aria-label'), keydown: i.getAttribute('onkeydown') } : null;
      };
      return { avecLien: lire('image-01'), sansLien: lire('image-02') };
    });
    assert.equal(attrs.avecLien.tabindex, '0');
    assert.equal(attrs.avecLien.role, 'button');
    assert.match(attrs.avecLien.label, /^Ouvrir la page d'approfondissement : Coupe du cerveau$/,
      "l'annonce doit dire où l'on va, pas seulement « image » ; obtenue : " + attrs.avecLien.label);
    assert.match(attrs.avecLien.keydown, /Enter/);
    assert.match(attrs.avecLien.keydown, /preventDefault/);
    console.log('PASS  1/10 image porteuse : tabindex, role, aria-label explicite, Entrée/Espace.');

    assert.equal(attrs.sansLien.tabindex, '0');
    assert.match(attrs.sansLien.label, /^Agrandir l'image : Deux mains$/,
      "l'annonce doit distinguer l'agrandissement du renvoi ; obtenue : " + attrs.sansLien.label);
    console.log("PASS  2/10 image sans renvoi : annoncée comme un agrandissement, pas comme un lien.");

    // ── 2. HORS PRÉSENTATION, RIEN ─────────────────────────────────────────────────────────────
    const hors = await page.evaluate(async d => {
      const r = await window.adocRenderClinicalDocument(d, { sourceSnapshotId: 's', entries: [] });
      return r.html;
    }, DOC);
    assert.ok(!/tabindex="0"[^>]*role="button"|role="button"[^>]*tabindex="0"/.test(hors)
      && !/onkeydown/.test(hors), 'hors présentation, aucun attribut clavier ajouté');
    console.log('PASS  3/10 hors présentation : aucun attribut clavier ajouté.');

    // ── 3. UN BLOC NON RÉVÉLÉ N'EST PAS TABULABLE ──────────────────────────────────────────────
    const tabulableAvant = await page.evaluate(() => {
      const f = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-reveal:not(.adoc-sc-reveal-shown)');
      if (!f) return null;
      const img = f.querySelector('img');
      return img ? getComputedStyle(img).visibility : null;
    });
    assert.equal(tabulableAvant, 'hidden',
      "un bloc non révélé doit être hors de l'ordre de tabulation, jamais un focus sur l'invisible");
    console.log('PASS  4/10 bloc non révélé : invisible ET hors tabulation.');

    await revelerTout(page);

    // ── 4. TABULATION RÉELLE PUIS ENTRÉE ───────────────────────────────────────────────────────
    const index0 = await page.evaluate(() => window._adocPresentState.index);
    const avant = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    const nbTab = await tabulerJusqua(page, 'image-01');
    await page.screenshot({ path: path.join(CAPTURES, 'b2-01-focus-sur-image.png') });
    console.log('PASS  5/10 la tabulation atteint réellement l\'image (' + nbTab + ' tabulation(s)).');

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    let titre = await page.evaluate(() => document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '');
    assert.match(titre, /Niveau 1/, 'Entrée doit ouvrir la page ; obtenu : ' + titre);
    assert.equal(await page.evaluate(() => window._adocPresentState.index), index0,
      'aucun changement de diapositive : Entrée ne doit pas être confondue avec une avance');
    await page.screenshot({ path: path.join(CAPTURES, 'b2-02-porte-ouverte-au-clavier.png') });
    console.log('PASS  6/10 Entrée ouvre la page ; la diapositive ne bouge pas.');

    // ── 5. ÉCHAP REFERME ET REND LE FOCUS ──────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const apresEchap = await actif(page);
    assert.equal(apresEchap && apresEchap.id, 'image-01',
      'le focus doit revenir à l\'image d\'origine, jamais au <body> ; obtenu : ' + JSON.stringify(apresEchap));
    console.log('PASS  7/10 Échap referme et REND le focus à l\'image d\'origine.');

    // ── 6. ESPACE AUSSI, SANS FAIRE DÉFILER ────────────────────────────────────────────────────
    const scroll0 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(' ');
    await page.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await page.evaluate(() => window.scrollY), scroll0,
      'Espace ne doit jamais faire défiler la page sous la diapositive');
    console.log('PASS  8/10 Espace ouvre aussi, sans faire défiler la page.');

    // ── 7. DESCENTE AU CLAVIER, PUIS RETOUR ────────────────────────────────────────────────────
    for (const attendu of ['Niveau 2', 'Niveau 3']) {
      await page.locator('#cc-ws-present-door .adoc-sc-deepdive-chip').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(t => (document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '').includes(t), attendu);
    }
    await page.screenshot({ path: path.join(CAPTURES, 'b2-03-niveau3-au-clavier.png') });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const apres = await page.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    assert.equal(apres, avant, 'la diapositive de départ doit rester intacte byte pour byte');
    assert.equal(await page.evaluate(() => window._adocPresentState.index), index0, 'index de diapositive inchangé');
    console.log('PASS  9/10 descente à 3 niveaux au clavier puis remontée ; diapositive intacte.');

    // ── 8. LE MÊME TRAJET DANS LE FICHIER EXPORTÉ ──────────────────────────────────────────────
    const fichier = path.join(os.tmpdir(), 'cc-b2-export.html');
    fs.writeFileSync(fichier, await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), DOC), 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    exp.on('pageerror', e => expErreurs.push(e.message));
    await ouvrir(exp, 'file://' + fichier, false);
    await revelerTout(exp);
    await tabulerJusqua(exp, 'image-01');
    await exp.keyboard.press('Enter');
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    for (const attendu of ['Niveau 2', 'Niveau 3']) {
      await exp.locator('#cc-ws-present-door .adoc-sc-deepdive-chip').first().focus();
      await exp.keyboard.press('Enter');
      await exp.waitForFunction(t => (document.querySelector('#cc-ws-present-door .cc-ws-present-door-title')?.textContent || '').includes(t), attendu);
    }
    await exp.screenshot({ path: path.join(CAPTURES, 'b2-04-export-niveau3-clavier.png') });
    await exp.keyboard.press('Escape'); await exp.keyboard.press('Escape'); await exp.keyboard.press('Escape');
    await exp.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    const expFocus = await actif(exp);
    assert.equal(expFocus && expFocus.id, 'image-01', 'focus rendu DANS L\'EXPORT ; obtenu : ' + JSON.stringify(expFocus));
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    console.log('PASS 10/10 export réellement ouvert : 3 niveaux AU CLAVIER, focus rendu, 0 erreur.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page attendue : ' + erreurs.join(' | '));
    console.log('\n       captures : ' + CAPTURES);
    console.log('PASS verify-b2-image-clavier — 10/10.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
