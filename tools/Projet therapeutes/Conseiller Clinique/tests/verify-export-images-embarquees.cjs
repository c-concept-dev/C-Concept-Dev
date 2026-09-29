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
      // delaiMs:0 — ces assertions n'ont aucune limite de débit à ménager, et attendre 700 ms
      // par requête rendrait la suite inutilisable. L'espacement réel est mesuré à vrai appel.
      window.__opts = (o) => Object.assign({ workerUrl: 'https://exemple', fetchPhoto: window.__fetchPhoto, delaiMs: 0 }, o || {});
      window.__construire = (doc, o) => window.adocBuildStandalonePresentationHTML(doc, window.__opts(o));
    });

    // ── 1. LES RÉFÉRENCES SONT TROUVÉES DANS LE RENDU, PAS DANS LE HTML CONSTRUIT ─────────────
    const requetes = await page.evaluate(d => window.adocCollectExportImageQueries(d).map(r => r.q), DOC);
    assert.deepEqual(requetes.sort(), ['REQUETE-QUI-ECHOUE', 'attachment infant', 'couple therapy session', 'therapist office'],
      'les couvertures de carte ET les blocs image doivent être trouvés : ' + JSON.stringify(requetes));
    assert.equal(requetes.length, 4, 'la requête présente sur deux cartes n\'est comptée qu\'une fois');
    console.log('PASS 1/12 collecte : couvertures et blocs image trouvés dans le RENDU, dédoublonnés.');

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
    console.log('PASS 2/12 dédoublonnage : 5 cartes, 4 requêtes, 3 téléchargements.');

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
    console.log('PASS 3/12 échec isolé : les 3 autres images passent, repli lisible, requête jamais affichée.');

    // ── 4. LES CRÉDITS, GROUPÉS ET DÉDOUBLONNÉS ──────────────────────────────────────────────
    assert.deepEqual(r.credits.map(c => c.auteur), ['Alice Martin', 'Bob Durand'],
      'deux auteurs, triés, jamais un doublon par image');
    console.log('PASS 4/12 crédits : un auteur = une entrée, ordre stable.');

    // ── 5. LE FICHIER EXPORTÉ PORTE SES IMAGES ───────────────────────────────────────────────
    const html = await page.evaluate(d => window.__construire(d), DOC);
    assert.ok(html.includes('window.ADOC_EXPORT_IMAGES = '), 'le dictionnaire doit être écrit dans le fichier');
    assert.ok(html.includes('data:image/'), 'des octets d\'image doivent figurer dans le fichier');
    assert.match(html, /Photographies : Alice Martin, Bob Durand — Pexels\./, 'la mention de crédits doit être présente');
    console.log('PASS 5/12 fichier exporté : dictionnaire écrit, octets présents, crédits mentionnés (' + Math.round(html.length / 1024) + ' Ko).');

    // ── 6. AUCUNE CLÉ DANS LE FICHIER — le test qui doit échouer si une clé fuit ─────────────
    const hex64 = html.match(/\b[0-9a-fA-F]{64}\b/g) || [];
    assert.deepEqual(hex64, [], 'chaîne de 64 caractères hexadécimaux trouvée dans l\'export : ' + hex64.slice(0, 2));
    assert.ok(!/["'][A-Za-z0-9_\-]{40,}["']\s*\)?\s*;?\s*$/m.test(html.split('ADOC_EXPORT_IMAGES')[0]),
      'aucun jeton long ne doit précéder le dictionnaire');
    console.log('PASS 6/12 sécurité : aucune chaîne de 64 caractères hexadécimaux dans le fichier exporté.');

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
    console.log('PASS 7/12 document sans image : zéro appel, zéro téléchargement, dictionnaire vide (' + sans.ko + ' Ko).');

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
    console.log('PASS 8/12 ouverture : les deux formes servies depuis le cache, ZÉRO appel réseau.');


    // ── 9. LES REPRISES SUR 429 — le remède, éprouvé sans attendre ni payer ──────────────────
    // Mesuré le 29/09/2026 : 121 requêtes enchaînées sans pause → 59 refus 429. Le remède est
    // l'espacement plus la reprise. Sans ce test, il ne serait éprouvé que par une campagne payante.
    const reprise = await page.evaluate(async d => {
      const essais = {};
      const fetchPhoto = async (w, q) => {
        essais[q] = (essais[q] || 0) + 1;
        // Deux refus, puis ça passe : exactement le comportement d'une limite de débit.
        if (essais[q] <= 2) { const e = new Error('/fetch-image 429 — rate limited'); e.status = 429; throw e; }
        return { url: 'https://images.pexels.com/photos/' + encodeURIComponent(q) + '.jpg', photographer: 'Zoe', source: 'Pexels' };
      };
      const res = await window.adocResolveImagesForExport(d, {
        workerUrl: 'https://exemple', fetchPhoto: fetchPhoto, delaiMs: 0,
      });
      return { essais: essais, rapport: res.rapport,
               replis: Object.values(res.images).filter(v => v.startsWith('data:image/svg')).length };
    }, DOC);
    assert.equal(reprise.rapport.echecs.length, 0, 'deux 429 puis un succès ne doivent PAS faire échouer : '
      + JSON.stringify(reprise.rapport.echecs));
    assert.equal(reprise.replis, 0, 'aucun repli ne doit subsister après une reprise réussie');
    assert.ok(Object.values(reprise.essais).every(n => n === 3), 'trois tentatives par requête : ' + JSON.stringify(reprise.essais));
    assert.ok(reprise.rapport.reprises >= 8, 'les reprises sont comptées et rapportées : ' + reprise.rapport.reprises);

    // Un 401 ne se réessaie JAMAIS : réessayer une clé refusée ne fait qu'attendre pour rien.
    const sansReprise = await page.evaluate(async d => {
      const essais = {};
      const fetchPhoto = async (w, q) => {
        essais[q] = (essais[q] || 0) + 1;
        const e = new Error('/fetch-image 401 — Unauthorized'); e.status = 401; throw e;
      };
      const res = await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', fetchPhoto, delaiMs: 0 });
      return { essais, echecs: res.rapport.echecs.length };
    }, DOC);
    assert.ok(Object.values(sansReprise.essais).every(n => n === 1),
      'un 401 ne doit être tenté qu\'UNE fois : ' + JSON.stringify(sansReprise.essais));
    assert.equal(sansReprise.echecs, 4, 'les 4 requêtes échouent, proprement');

    // Trois 429 d'affilée : la requête abandonne, avec sa cause RÉELLE conservée.
    const abandon = await page.evaluate(async d => {
      const fetchPhoto = async () => { const e = new Error('/fetch-image 429 — Too Many Requests'); e.status = 429; throw e; };
      const res = await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', fetchPhoto, delaiMs: 0 });
      return res.rapport.echecs;
    }, DOC);
    assert.equal(abandon.length, 4);
    assert.match(abandon[0].cause, /429 — Too Many Requests/, 'le corps de l\'erreur est conservé, pas seulement le code');
    console.log('PASS 9/12 reprises : 429 rejoué jusqu\'au succès, 401 jamais rejoué, abandon avec sa cause réelle.');

    // ── 10. L'ESPACEMENT EST RÉEL ───────────────────────────────────────────────────────────
    const espacement = await page.evaluate(async d => {
      const t = [];
      const fetchPhoto = async (w, q) => { t.push(Date.now());
        return { url: 'https://images.pexels.com/photos/x.jpg', photographer: 'Zoe', source: 'Pexels' }; };
      await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', fetchPhoto, delaiMs: 120 });
      return t.slice(1).map((x, i) => x - t[i]);
    }, DOC);
    assert.ok(espacement.length >= 3, 'plusieurs intervalles doivent être mesurables');
    assert.ok(espacement.every(x => x >= 110), 'chaque requête est espacée de la précédente : ' + JSON.stringify(espacement));
    console.log('PASS 10/12 espacement : ' + JSON.stringify(espacement) + ' ms entre requêtes (consigne 120).');


    // ── 11. QUOTA DU FOURNISSEUR : reconnu, jamais combattu ──────────────────────────────────
    // MESURÉ le 29/09/2026 sur le cours de 12 modules : aucun échec sur les 91 premières requêtes,
    // puis 21 sur les 30 dernières, et le corps de l'erreur disait « Pexels API error (HTTP 429) ».
    // Signature d'un quota horaire épuisé en cours de route, pas d'une rafale. Le réessayer coûte
    // 118 s et 56 requêtes de plus contre un quota déjà à sec, sans en sauver une seule.
    const quota = await page.evaluate(async d => {
      let n = 0; const essais = {};
      const fetchPhoto = async (w, q) => {
        n++; essais[q] = (essais[q] || 0) + 1;
        if (n <= 1) return { url: 'https://images.pexels.com/photos/ok.jpg', photographer: 'Zoe', source: 'Pexels' };
        const e = new Error('/fetch-image 429 — {"error":"Pexels API error (HTTP 429): quota"}');
        e.status = 429; e.quotaExterne = true; throw e;
      };
      const res = await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', fetchPhoto, delaiMs: 0 });
      return { appels: n, essais, rapport: res.rapport };
    }, DOC);
    assert.ok(Object.values(quota.essais).every(x => x === 1),
      'un quota épuisé ne doit JAMAIS être réessayé : ' + JSON.stringify(quota.essais));
    assert.equal(quota.rapport.reprises, 0, 'aucune reprise sur un quota externe');
    assert.equal(quota.rapport.quotaExterneAtteint, true, 'le quota doit être NOMMÉ dans le rapport');
    assert.equal(quota.rapport.quotaAtteintALaRequete, 2, 'et situé à la requête où il commence');
    assert.equal(quota.rapport.echecs.length, 3, 'les 3 requêtes suivantes échouent, proprement');
    assert.ok(quota.rapport.echecs.every(e => e.quotaExterne), 'chaque échec porte sa nature');
    console.log('PASS 11/12 quota externe : reconnu, jamais réessayé, nommé et situé dans le rapport.');

    // ── 12. LE RANG DE CHAQUE ÉCHEC — ce qui distingue une rafale d'un quota ─────────────────
    const rangs = await page.evaluate(async d => {
      const fetchPhoto = async (w, q) => {
        if (q === 'attachment infant') { const e = new Error('/fetch-image 500'); e.status = 500; throw e; }
        return { url: 'https://images.pexels.com/photos/x.jpg', photographer: 'Zoe', source: 'Pexels' };
      };
      const res = await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', fetchPhoto, delaiMs: 0 });
      return res.rapport.echecs;
    }, DOC);
    assert.equal(rangs.length, 1);
    assert.equal(typeof rangs[0].rang, 'number', 'le rang doit être conservé');
    assert.ok(rangs[0].rang >= 1 && rangs[0].rang <= 4, 'rang plausible : ' + rangs[0].rang);
    assert.equal(rangs[0].quotaExterne, false, 'un 500 n\'est pas un quota de fournisseur');
    console.log('PASS 12/12 rang conservé : un échec dispersé se distingue d\'un quota groupé sans archéologie.');


    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    // Les requêtes d'OUVERTURE de la page (statistiques de bibliothèque, chartes) sont
    // antérieures à tout ce que ce test fait : seules les portes d'image comptent ici.
    const versImages = reseau.filter(u => /fetch-image|generate-image|pexels|pixabay/.test(u));
    assert.deepEqual(versImages, [], 'appels d\'image réels alors que tout est simulé : ' + versImages.join(', '));
    console.log('\n  Réseau relevé (ouverture de la page uniquement, tout coupé) :\n'
      + reseau.map(u => '    ' + u.replace(/\?.*$/, '')).join('\n'));
    console.log('\nTOUT PASSE — 12/12, réseau simulé, aucun appel réel.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
