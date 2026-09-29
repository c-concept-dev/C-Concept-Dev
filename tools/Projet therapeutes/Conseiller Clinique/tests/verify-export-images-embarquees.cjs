// Embarquement des images dans l'export autonome — éprouvé SANS aucun appel réseau.
//
// Ce que ce test protège, et qui ne se voit pas en lisant le code : le fichier exporté n'embarque
// PAS des diapositives, il embarque le document en JSON et les rend à l'ouverture. Les références
// d'image n'existent donc nulle part dans le HTML construit — elles n'apparaissent qu'au moment où
// quelqu'un ouvre le fichier. Un embarquement qui parcourrait le HTML produit ne trouverait rien
// et livrerait un cours d'aplats gris sans qu'aucune erreur ne soit levée.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-export-images-embarquees.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const carte = (id, titre, imageRef, alt, blocs) => ({
  id, type: 'card', citationIds: [], validation: {},
  content: { title: titre, imageRef: imageRef, imageAlt: alt, blocks: blocs || [
    { id: 'p-' + id, type: 'paragraph', content: { text: 'Une phrase complète.' }, citationIds: [], validation: {} }] },
});
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Export avec images', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [
    // Deux couvertures avec la MÊME requête : le dédoublonnage se joue ici.
    carte('card-01', 'Première', 'couple therapy session', 'Deux personnes en entretien'),
    carte('card-02', 'Deuxième', 'couple therapy session', 'Deux personnes en entretien'),
    carte('card-03', 'Troisième', 'attachment infant', 'Nourrisson tendant la main'),
    // Requête qui échouera : le repli doit être propre et ne pas emporter les autres.
    carte('card-04', 'Quatrième', 'REQUETE-QUI-ECHOUE', 'Illustration de repli'),
    // Bloc image dans le corps de carte — deuxième des quatre formes.
    carte('card-05', 'Cinquième', null, null, [
      { id: 'img-05', type: 'image', content: { query: 'therapist office', alt: 'Un cabinet' }, citationIds: [], validation: {} }]),
  ],
};
const DOC_SANS_IMAGE = Object.assign({}, DOC, { title: 'Sans image',
  blocks: [carte('card-01', 'Texte seul', null, null)] });

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    const reseau = [];
    await page.route('**/*', route => {
      const u = route.request().url();
      if (/^file:/.test(u)) return route.continue();
      reseau.push(u); return route.abort();
    });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocResolveImagesForExport === 'function');

    // ── Le banc : réseau SIMULÉ. Ce sont les deux seules portes de sortie de l'embarquement ────
    await page.evaluate(() => {
      window.__tel = [];               // téléchargements de CDN réellement tentés
      window.__photos = [];            // appels à /fetch-image réellement tentés
      // Injectée par options, jamais posée sur window : c'est la fonction de MODULE que
      // l'embarquement appelle, et la remplacer sur window ne l'aurait pas interceptée.
      window.__fetchPhoto = async (workerUrl, q) => {
        window.__photos.push(q);
        if (q === 'REQUETE-QUI-ECHOUE') throw new Error('/fetch-image 404');
        return { url: 'https://images.pexels.com/photos/' + encodeURIComponent(q) + '.jpg',
                 photographer: q === 'attachment infant' ? 'Alice Martin' : 'Bob Durand', source: 'Pexels' };
      };
      const vraiFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (typeof url === 'string' && url.startsWith('https://images.pexels.com/')) {
          window.__tel.push(url);
          // Un PNG 1×1 réel : createImageBitmap doit pouvoir le décoder.
          const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
          const bin = atob(b64), arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return { ok: true, status: 200, blob: async () => new Blob([arr], { type: 'image/png' }) };
        }
        return vraiFetch(url, opts);
      };
      window.__opts = (o) => Object.assign({ workerUrl: 'https://exemple', fetchPhoto: window.__fetchPhoto }, o || {});
      window.__construire = (doc, o) => window.adocBuildStandalonePresentationHTML(doc, window.__opts(o));
    });

    // ── 1. LES RÉFÉRENCES SONT TROUVÉES DANS LE RENDU, PAS DANS LE HTML CONSTRUIT ─────────────
    const requetes = await page.evaluate(d => window.adocCollectExportImageQueries(d).map(r => r.q), DOC);
    assert.deepEqual(requetes.sort(), ['REQUETE-QUI-ECHOUE', 'attachment infant', 'couple therapy session', 'therapist office'],
      'les couvertures de carte ET les blocs image doivent être trouvés : ' + JSON.stringify(requetes));
    assert.equal(requetes.length, 4, 'la requête présente sur deux cartes n\'est comptée qu\'une fois');
    console.log('PASS 1/8  collecte : couvertures et blocs image trouvés dans le RENDU, dédoublonnés.');

    // ── 2. UN SEUL TÉLÉCHARGEMENT PAR REQUÊTE ────────────────────────────────────────────────
    const r = await page.evaluate(async d => {
      window.__tel = []; window.__photos = [];
      const res = await window.adocResolveImagesForExport(d, window.__opts());
      return { images: Object.keys(res.images), credits: res.credits, rapport: res.rapport,
               telechargements: window.__tel.length, appelsPhoto: window.__photos.length };
    }, DOC);
    assert.equal(r.appelsPhoto, 4, 'une résolution par requête unique, jamais une par carte');
    assert.equal(r.telechargements, 3, 'trois téléchargements : la 4e requête a échoué avant');
    assert.equal(r.rapport.telecharges, 3);
    assert.equal(r.rapport.requetes, 4);
    console.log('PASS 2/8  dédoublonnage : 5 cartes, 4 requêtes, 3 téléchargements.');

    // ── 3. UN ÉCHEC N'EMPORTE PAS LES AUTRES, ET NE MONTRE JAMAIS LA REQUÊTE ─────────────────
    assert.equal(r.rapport.echecs.length, 1);
    assert.match(r.rapport.echecs[0].cause, /404/, 'la cause réelle est conservée');
    assert.deepEqual(r.images.sort(), ['REQUETE-QUI-ECHOUE', 'attachment infant', 'couple therapy session', 'therapist office'],
      'la requête en échec DOIT figurer dans le cache — sinon l\'ouverture repartirait sur le réseau');
    const repli = await page.evaluate(async d => {
      const res = await window.adocResolveImagesForExport(d, window.__opts());
      return res.images['REQUETE-QUI-ECHOUE'];
    }, DOC);
    assert.match(repli, /^data:image\/svg\+xml/, 'le repli est un aplat SVG, jamais un vide');
    // Le data: n'est PAS décodable en bloc (il porte des « % » littéraux, ex. x="50%") : on
    // compare sur la forme encodée, celle qui est réellement écrite dans le fichier.
    assert.ok(repli.includes(encodeURIComponent('Illustration de repli')),
      'le texte alternatif sert de repli lisible : ' + repli.slice(0, 200));
    assert.ok(!repli.includes('REQUETE-QUI-ECHOUE') && !repli.includes(encodeURIComponent('REQUETE-QUI-ECHOUE')),
      'la REQUÊTE ne doit JAMAIS devenir visible — elle l\'a déjà été devant un public');
    console.log('PASS 3/8  échec isolé : les 3 autres images passent, repli lisible, requête jamais affichée.');

    // ── 4. LES CRÉDITS, GROUPÉS ET DÉDOUBLONNÉS ──────────────────────────────────────────────
    assert.deepEqual(r.credits.map(c => c.auteur), ['Alice Martin', 'Bob Durand'],
      'deux auteurs, triés, jamais un doublon par image');
    console.log('PASS 4/8  crédits : un auteur = une entrée, ordre stable.');

    // ── 5. LE FICHIER EXPORTÉ PORTE SES IMAGES ───────────────────────────────────────────────
    const html = await page.evaluate(d => window.__construire(d), DOC);
    assert.ok(html.includes('window.ADOC_EXPORT_IMAGES = '), 'le dictionnaire doit être écrit dans le fichier');
    assert.ok(html.includes('data:image/'), 'des octets d\'image doivent figurer dans le fichier');
    assert.match(html, /Photographies : Alice Martin, Bob Durand — Pexels\./, 'la mention de crédits doit être présente');
    console.log('PASS 5/8  fichier exporté : dictionnaire écrit, octets présents, crédits mentionnés (' + Math.round(html.length / 1024) + ' Ko).');

    // ── 6. AUCUNE CLÉ DANS LE FICHIER — le test qui doit échouer si une clé fuit ─────────────
    const hex64 = html.match(/\b[0-9a-fA-F]{64}\b/g) || [];
    assert.deepEqual(hex64, [], 'chaîne de 64 caractères hexadécimaux trouvée dans l\'export : ' + hex64.slice(0, 2));
    assert.ok(!/["'][A-Za-z0-9_\-]{40,}["']\s*\)?\s*;?\s*$/m.test(html.split('ADOC_EXPORT_IMAGES')[0]),
      'aucun jeton long ne doit précéder le dictionnaire');
    console.log('PASS 6/8  sécurité : aucune chaîne de 64 caractères hexadécimaux dans le fichier exporté.');

    // ── 7. UN DOCUMENT SANS IMAGE RESTE IDENTIQUE, ET NE TÉLÉCHARGE RIEN ─────────────────────
    const sans = await page.evaluate(async d => {
      window.__tel = []; window.__photos = [];
      const h = await window.__construire(d);
      return { ko: Math.round(h.length / 1024), tel: window.__tel.length, photos: window.__photos.length,
               dictionnaireVide: h.includes('window.ADOC_EXPORT_IMAGES = {};') };
    }, DOC_SANS_IMAGE);
    assert.equal(sans.photos, 0, 'aucun appel de résolution pour un document sans image');
    assert.equal(sans.tel, 0, 'aucun téléchargement — donc aucune latence ajoutée');
    assert.equal(sans.dictionnaireVide, true, 'le dictionnaire est vide, jamais absent');
    console.log('PASS 7/8  document sans image : zéro appel, zéro téléchargement, dictionnaire vide (' + sans.ko + ' Ko).');

    // ── 8. À L'OUVERTURE, LE CACHE PASSE AVANT TOUT RÉSEAU ───────────────────────────────────
    const lecture = await page.evaluate(async () => {
      window.ADOC_EXPORT_IMAGES = { 'une requête': 'data:image/jpeg;base64,AAAA', 'ratée': 'data:image/svg+xml;utf8,<svg/>' };
      let reseauTente = 0;
      const vrai = window.fetch;
      window.fetch = async (...a) => { reseauTente++; return vrai(...a); };
      const html = await window.adocResolveImages(
        '<!DOCTYPE html><html><body><img data-pexels="une requête" alt="a">'
        + '<div data-pexels="ratée" style="height:10px"></div></body></html>');
      window.fetch = vrai;
      const d = new DOMParser().parseFromString(html, 'text/html');
      const r = { reseauTente: reseauTente,
        srcImg: d.querySelector('img').getAttribute('src'),
        fond: d.querySelector('div').getAttribute('style'),
        restantsEnAttente: d.querySelectorAll('[data-pexels]').length };
      delete window.ADOC_EXPORT_IMAGES;
      return r;
    });
    assert.equal(lecture.reseauTente, 0, 'AUCUN appel réseau ne doit partir quand tout est embarqué');
    assert.equal(lecture.srcImg, 'data:image/jpeg;base64,AAAA');
    assert.match(lecture.fond, /data:image\/svg\+xml/, 'le fond aussi est servi depuis le cache');
    assert.equal(lecture.restantsEnAttente, 0, 'aucune référence ne doit rester non résolue');
    console.log('PASS 8/8  ouverture : les deux formes servies depuis le cache, ZÉRO appel réseau.');

    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    // Les requêtes d'OUVERTURE de la page (statistiques de bibliothèque, chartes) sont
    // antérieures à tout ce que ce test fait : seules les portes d'image comptent ici.
    const versImages = reseau.filter(u => /fetch-image|generate-image|pexels|pixabay/.test(u));
    assert.deepEqual(versImages, [], 'appels d\'image réels alors que tout est simulé : ' + versImages.join(', '));
    console.log('\n  Réseau relevé (ouverture de la page uniquement, tout coupé) :\n'
      + reseau.map(u => '    ' + u.replace(/\?.*$/, '')).join('\n'));
    console.log('\nTOUT PASSE — 8/8, réseau simulé, aucun appel réel.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
