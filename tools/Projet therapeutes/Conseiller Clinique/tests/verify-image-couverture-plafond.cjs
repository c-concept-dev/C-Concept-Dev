// Plafond de l'image de couverture — le chiffre central de ce lot, éprouvé sur un document RÉEL.
//
// Ce que ce test protège : sans plafond, 120 diapositives sur 132 débordaient, et TOUTES avaient une
// image. La cause n'était ni le format 4:3, ni la densité du texte, mais une image qui prenait 80 %
// de la hauteur de la diapositive. Le jour où quelqu'un retire `max-height` de ADOC_CARD_IMG_CSS
// pour « laisser respirer les images », ce test doit tomber.
//
// Chaque diapositive est ouverte par adocPresentGoTo(i) — JAMAIS par simulation de flèche :
// ArrowRight épuise d'abord la révélation progressive et ne visite donc pas toutes les diapositives.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-image-couverture-plafond.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

// Document forgé reproduisant la géométrie mesurée : une image de couverture dont la hauteur
// naturelle vaut 1,6 fois moins que sa largeur (le format que rend la banque d'images), plus du
// texte. L'image est embarquée en data: — le test ne touche jamais au réseau.
const imgLarge = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="%23789"/></svg>');
const bloc = (id, t) => ({ id, type: 'paragraph', content: { text: t }, citationIds: [], validation: {} });
const carte = (i, avecImage) => ({
  id: 'card-' + String(i).padStart(2, '0'), type: 'card', citationIds: [], validation: {},
  content: {
    title: 'Diapositive ' + i, imageAlt: avecImage ? 'Une illustration' : null,
    imageRef: avecImage ? 'illustration' : null,
    blocks: [bloc('p1-' + i, 'Premier paragraphe de cette diapositive, assez long pour occuper '
        + 'plusieurs lignes une fois mis en page dans la largeur de la carte.'),
      bloc('p2-' + i, 'Deuxième paragraphe, de longueur comparable, afin que la diapositive ait '
        + 'une densité représentative de ce que produit réellement le générateur.'),
      bloc('p3-' + i, 'Troisième paragraphe pour approcher la densité médiane mesurée de trois blocs.')],
  },
});
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Plafond image', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  // 10 avec image, 4 sans — même proportion que le cours réel mesuré (118 / 14).
  blocks: [...Array.from({ length: 10 }, (_, i) => carte(i + 1, true)),
           ...Array.from({ length: 4 }, (_, i) => carte(i + 11, false))],
};

// Relève l'état de CHAQUE diapositive : débordement, hauteur d'image, géométrie de chaque bloc.
const RELEVE = `async (n) => {
  const res = [];
  for (let i = 0; i < n; i++) {
    window.adocPresentGoTo(i);
    // 320 ms, et ce n'est pas une marge de confort : la transition de diapositive dure 260 ms
    // (.cc-ws-present-slide-inner{transition:… 260ms}) et le DOM ne bascule qu'à la fin. MESURÉ :
    // à 110 ms, UNE SEULE diapositive sur 14 était celle demandée ; à 320 ms, les 14. Toute mesure
    // plus rapide relève la diapositive PRÉCÉDENTE et donne des comptes faux sans rien signaler.
    await new Promise(r => setTimeout(r, 320));
    const o = document.querySelector('.cc-ws-present-slide-outer');
    const c = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
    if (!o || !c) { res.push(null); continue; }
    const img = c.querySelector('img.adoc-sc-card-img');
    const geo = [...c.querySelectorAll('p, h2, h3')].map(e => {
      const b = e.getBoundingClientRect(); return Math.round(b.top) + ',' + Math.round(b.height); }).join('|');
    res.push({ boite: Math.round(o.getBoundingClientRect().height),
      deborde: c.scrollHeight > c.clientHeight, ecart: Math.max(0, c.scrollHeight - c.clientHeight),
      avecImage: !!img, hauteurImage: img ? Math.round(img.getBoundingClientRect().height) : 0,
      objectFit: img ? getComputedStyle(img).objectFit : null,
      objectPosition: img ? getComputedStyle(img).objectPosition : null, geo });
  }
  return res;
}`;

async function ouvrirEtRelever(browser, url, prep, cssAnnulation) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  // Depuis la phase 3, un fichier exporté attend le geste « ▶ Démarrer » et ne s'ouvre plus
  // seul. Sans effet sur une page live, qui n'a pas cet écran.
  await page.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
  if (prep) await prep(page);
  await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'), null, { timeout: 60000 });
  // L'annulation du plafond sert de CONTRE-PREUVE : elle doit faire réapparaître le débordement.
  if (cssAnnulation) { await page.addStyleTag({ content: cssAnnulation }); await page.waitForTimeout(200); }
  const r = await page.evaluate(new Function('return (' + RELEVE + ')')(), DOC.blocks.length);
  await page.close();
  return { r: r.filter(Boolean), erreurs };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const APP = 'file://' + path.join(__dirname, '../studio-clinique.html');
  const prepLive = async (page) => {
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    // #cc-workspace est display:none sans .open : sans cette ligne la boîte mesure 0×0 et TOUTE la
    // mesure est vide de sens. Constaté, puis diagnostiqué par la chaîne d'ancêtres.
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
  };
  try {
    // ── 1. LE CHIFFRE CENTRAL, EN DIRECT ─────────────────────────────────────────────────────
    const apres = await ouvrirEtRelever(browser, APP, prepLive, null);
    const avecImg = apres.r.filter(x => x.avecImage), sansImg = apres.r.filter(x => !x.avecImage);
    assert.equal(avecImg.length, 10);
    assert.equal(sansImg.length, 4);
    const debordent = apres.r.filter(x => x.deborde).length;
    assert.equal(debordent, 0, debordent + ' diapositive(s) débordent encore : '
      + JSON.stringify(apres.r.filter(x => x.deborde).map(x => x.ecart)));
    console.log('PASS 1/6  en direct : 0 diapositive sur ' + apres.r.length + ' ne déborde, image comprise.');

    // ── 2. CONTRE-PREUVE — sans le plafond, le débordement REVIENT ───────────────────────────
    // Sans elle, ce test passerait tout aussi bien si le document forgé était simplement trop
    // léger pour déborder : il ne prouverait rien du tout.
    const avant = await ouvrirEtRelever(browser, APP, prepLive,
      '.adoc-sc-card-img{max-height:none !important;object-fit:fill !important}');
    const debAvant = avant.r.filter(x => x.deborde);
    assert.ok(debAvant.length >= 10, 'sans plafond, les diapositives à image doivent déborder : '
      + debAvant.length + ' seulement');
    assert.ok(debAvant.every(x => x.avecImage), 'seules celles qui ont une image doivent déborder');
    const hAvant = avant.r.find(x => x.avecImage).hauteurImage;
    const hApres = avecImg[0].hauteurImage;
    assert.ok(hApres < hAvant * 0.6, 'l\'image doit être nettement réduite : ' + hAvant + ' → ' + hApres + ' px');
    console.log('PASS 2/6  contre-preuve : sans plafond ' + debAvant.length + '/' + avant.r.length
      + ' débordent ; image ' + hAvant + ' → ' + hApres + ' px (' + Math.round(100 * hApres / avecImg[0].boite) + ' % de la boîte).');

    // ── 3. LES DIAPOSITIVES SANS IMAGE NE BOUGENT PAS D'UN PIXEL ─────────────────────────────
    const sansAvant = avant.r.filter(x => !x.avecImage);
    sansImg.forEach((x, i) => {
      assert.equal(x.geo, sansAvant[i].geo, 'diapositive sans image ' + i + ' : géométrie modifiée');
      assert.equal(x.deborde, false);
    });
    console.log('PASS 3/6  les ' + sansImg.length + ' diapositives SANS image sont inchangées au pixel près.');

    // ── 4. LE RECADRAGE EST CELUI QUI A ÉTÉ MESURÉ ──────────────────────────────────────────
    assert.equal(avecImg[0].objectFit, 'cover', 'recadrage, jamais déformation');
    // Mesuré sur 6 formats × 4 positions de sujet : le défaut « center » ne laisse voir le centre
    // du sujet que dans 11 cas sur 24, contre 22 sur 24 à 15 %.
    assert.match(avecImg[0].objectPosition, /15%/, 'position : ' + avecImg[0].objectPosition);
    assert.ok(avecImg.every(x => x.hauteurImage <= x.boite * 0.46),
      'aucune image ne dépasse 45 % (+ arrondi) de la hauteur de diapositive');
    assert.ok(avecImg.every(x => x.hauteurImage >= x.boite * 0.38),
      'l\'image reste PRÉSENTE, jamais réduite à un bandeau : ' + avecImg.map(x => x.hauteurImage).join(','));
    console.log('PASS 4/6  recadrage cover + position 15 % ; image à ' + Math.round(100 * hApres / avecImg[0].boite) + ' % de la boîte.');

    // ── 5. LE CSS EST BIEN PARTAGÉ : L'EXPORT EN BÉNÉFICIE AUSSI ────────────────────────────
    // Vérifié sur un export RÉELLEMENT construit et ouvert, jamais supposé depuis le fait que la
    // constante est partagée.
    const atelier = await browser.newPage();
    await atelier.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier.goto(APP);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    await atelier.close();
    const fs = require('node:fs'), os = require('node:os');
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'plafond-img-'));
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const exp = await ouvrirEtRelever(browser, 'file://' + fichier, null, null);
    assert.equal(exp.r.filter(x => x.deborde).length, 0, 'l\'export doit bénéficier du même plafond');
    assert.equal(exp.r.find(x => x.avecImage).objectFit, 'cover');
    assert.match(exp.r.find(x => x.avecImage).objectPosition, /15%/);
    assert.deepEqual(exp.erreurs, [], 'erreurs dans l\'export : ' + exp.erreurs.join(' | '));
    fs.rmSync(dossier, { recursive: true, force: true });
    console.log('PASS 5/6  export RÉELLEMENT construit et ouvert : même plafond, 0 débordement, 0 erreur.');

    // ── 6. AUCUNE FONCTION AJOUTÉE AU GRAPHE D'EXPORT ───────────────────────────────────────
    // Ce lot est du CSS pur : le garde-fou onclick doit rester vert sans qu'on ait rien à y ajouter.
    const appeles = new Set();
    for (const m of html.matchAll(/onclick="window\.(\w+)\(/g)) appeles.add(m[1]);
    const manquants = [...appeles].filter(n => !html.includes('window.' + n + ' ='));
    assert.deepEqual(manquants, [], 'onclick sans fonction exportée : ' + manquants.join(', '));
    console.log('PASS 6/6  garde-fou onclick : ' + appeles.size + ' fonction(s), toutes exportées ; aucune ajoutée.');

    assert.deepEqual(apres.erreurs, [], 'erreurs de page : ' + apres.erreurs.join(' | '));
    console.log('\nTOUT PASSE — 6/6, aucun appel réseau.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
