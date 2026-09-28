// Le repli d'image ne doit JAMAIS afficher la requête de recherche.
//
// Constaté sur un export réel : la première diapositive projetait, en grand et en anglais,
// « couple therapy session warm light therap » — la requête Pexels, c'est-à-dire un rouage interne
// destiné à une API, jamais à un public. Cela arrive dès que l'image ne peut pas être obtenue :
// hors session, la clé manque, /fetch-image refuse, et le repli s'affiche.
//
// Deux replis légitimes : le texte alternatif (français, écrit par le modèle, déjà obligatoire dès
// qu'une image existe), sinon un aplat neutre SANS AUCUN TEXTE.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-repli-image.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const REQUETE_A = 'couple therapy session warm light therapist office';
const REQUETE_B = 'brain scan cortisol stress response';
const ALT_A = "Un couple en séance, lumière chaude";

const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z',
  language: 'fr', status: 'draft', title: 'Repli image', purpose: 'p', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{
    id: 'card-01', type: 'card',
    content: { title: 'Diapositive', imageRef: REQUETE_A, imageAlt: ALT_A, blocks: [
      { id: 'paragraph-01', type: 'paragraph', content: { text: 'Un texte.' }, citationIds: [], validation: {} },
      // Alt VIDE : cas du repli nu. Le schéma l'interdit en principe, mais un document ancien ou
      // importé peut le porter, et le repli ne doit alors rien afficher du tout.
      { id: 'image-01', type: 'image', content: { query: REQUETE_B, alt: '' }, citationIds: [], validation: {} },
    ] },
    citationIds: [], validation: {},
  }],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    // Toute sortie réseau est coupée : c'est EXACTEMENT la situation hors session, et c'est elle
    // qui déclenche le repli. Rien n'est simulé — la résolution échoue pour de bon.
    await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.evaluate(() => document.getElementById('cc-login-screen')?.remove());
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForSelector('#cc-ws-present-slide-inner .adoc-sc-card-img', { state: 'attached' });
    await page.waitForTimeout(1500);

    const vu = await page.evaluate(() => {
      const lire = sel => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const src = e.getAttribute('src') || '';
        const m = src.match(/<text[^>]*>([^<]*)<\/text>/);
        return { src, alt: e.getAttribute('alt'), texteAffiche: m ? decodeURIComponent(m[1]) : null,
                 resteUneRequete: /data-pexels/.test(e.outerHTML) };
      };
      return { couverture: lire('#cc-ws-present-slide-inner .adoc-sc-card-img'),
               bloc: lire('#cc-ws-present-slide-inner #image-01 img'),
               htmlEntier: document.getElementById('cc-ws-present-slide-inner').innerHTML };
    });

    // ── 1. LA REQUÊTE N'APPARAÎT NULLE PART ────────────────────────────────────────────────────
    assert.ok(!vu.htmlEntier.includes(REQUETE_A) && !vu.htmlEntier.includes(REQUETE_B),
      'la requête de recherche ne doit apparaître NULLE PART dans le rendu');
    assert.ok(!(vu.couverture.texteAffiche || '').includes('therapy'),
      'le repli de la couverture ne doit pas afficher la requête ; obtenu : ' + vu.couverture.texteAffiche);
    console.log('PASS 1/4  la requête n\'apparaît nulle part dans la diapositive rendue.');

    // ── 2. LE TEXTE ALTERNATIF FRANÇAIS EST AFFICHÉ ────────────────────────────────────────────
    assert.equal(vu.couverture.texteAffiche, ALT_A,
      'le repli doit afficher le texte alternatif français ; obtenu : ' + vu.couverture.texteAffiche);
    console.log('PASS 2/4  le repli affiche le texte alternatif : « ' + vu.couverture.texteAffiche + ' ».');

    // ── 3. SANS TEXTE ALTERNATIF, UN APLAT NU ──────────────────────────────────────────────────
    assert.equal(vu.bloc.texteAffiche, null,
      'sans texte alternatif, le repli ne doit afficher AUCUN texte ; obtenu : ' + vu.bloc.texteAffiche);
    assert.ok(!/<text/.test(vu.bloc.src), 'aucun élément <text> dans l\'aplat nu');
    assert.ok(/<rect/.test(vu.bloc.src), 'l\'aplat doit tout de même exister visuellement');
    console.log('PASS 3/4  sans texte alternatif : aplat neutre, aucun texte.');

    // ── 4. LE TEXTE ALTERNATIF RESTE SUR L'ÉLÉMENT, pour les lecteurs d'écran ──────────────────
    assert.equal(vu.couverture.alt, ALT_A, 'l\'attribut alt doit rester intact');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 4/4  l\'attribut alt reste intact pour les lecteurs d\'écran.');

    console.log('\nPASS verify-repli-image — 4/4.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
