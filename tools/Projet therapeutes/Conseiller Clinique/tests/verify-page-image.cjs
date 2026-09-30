// Illustration d'une page d'approfondissement — de la requête jusqu'au fichier exporté.
//
// Trois choses que ce test protège, et qu'aucune lecture ne garantit :
//   — le PLAFOND de 260 px, mesuré sur une vraie image : au-delà, une page courte se met à défiler
//     sur un portable, et une page illustrée doit se lire d'un seul coup d'œil ;
//   — l'ANGLE MORT de l'embarquement : adocCollectExportImageQueries ne parcourait que doc.blocks.
//     Sans les pages, chaque image de page d'un export retomberait sur l'aplat gris EN SILENCE ;
//   — le graphe d'export : la porte y part, donc ses fonctions de rendu aussi.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-page-image.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AVEC = { id: 'n1', title: 'Page illustrée', imageQuery: 'therapist office chairs',
  imageAlt: 'Deux fauteuils face à face', paragraphs: ['Un paragraphe.', '- Une puce.'] };
const SANS = { id: 'n2', title: 'Page sans image', imageQuery: '', imageAlt: '',
  paragraphs: ['Un raisonnement en prose, que rien n\'illustrerait utilement.'] };
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'v', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Image de page', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [{ id: 'c1', type: 'card', citationIds: [], validation: {},
    content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      { id: 'p1', type: 'paragraph', content: { text: 'Un texte ici.' }, citationIds: [], validation: {},
        deepDiveLinks: [{ text: 'Un texte', targetId: 'n1' }] }] } }],
  deepDives: [AVEC, SANS],
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pageimg-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocDeepDiveImageHTML === 'function');

    // ── 1. LA REQUÊTE DEVIENT UNE RÉFÉRENCE, JAMAIS UNE URL NI UN TEXTE VISIBLE ─────────────
    const h = await page.evaluate(e => window.adocDeepDiveImageHTML(e), AVEC);
    assert.match(h, /data-pexels="therapist office chairs"/, 'la requête doit devenir une référence : ' + h);
    assert.match(h, /alt="Deux fauteuils face à face"/, 'imageAlt doit porter le texte alternatif');
    assert.ok(!/src=/.test(h), 'aucune URL ne doit être posée ici : la résolution est différée');
    assert.equal(await page.evaluate(e => window.adocDeepDiveImageHTML(e), SANS), '',
      'une page sans imageQuery ne produit RIEN — jamais un élément vide');
    console.log('PASS 1/6  requête → référence différée ; page sans image : aucun élément.');

    // ── 2. LE PLAFOND EST CELUI QUI A ÉTÉ MESURÉ ───────────────────────────────────────────
    // Valeur portée par une ASSERTION et non par un commentaire seul : 300 px ou 45 % feraient
    // défiler une page de 4 paragraphes dès 1280×800, mesuré.
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    const geo = await page.evaluate(async () => {
      window.adocPresentOpenDeepDive('n1');
      await new Promise(r => setTimeout(r, 400));
      const i = document.querySelector('.cc-ws-present-door-illus');
      if (!i) return null;
      const cs = getComputedStyle(i);
      return { maxHeight: cs.maxHeight, objectFit: cs.objectFit, objectPosition: cs.objectPosition,
               largeur: Math.round(i.getBoundingClientRect().width) };
    });
    assert.ok(geo, 'l\'illustration doit être rendue dans la porte');
    assert.equal(geo.maxHeight, '260px', 'plafond mesuré : ' + geo.maxHeight);
    assert.equal(geo.objectFit, 'cover', 'recadrage, jamais déformation');
    assert.match(geo.objectPosition, /15%/, 'position mesurée : ' + geo.objectPosition);
    console.log('PASS 2/6  plafond 260 px, recadrage cover, position 15 % — appliqués dans la porte.');

    // ── 3. UNE PAGE SANS IMAGE N'EN A AUCUNE ───────────────────────────────────────────────
    const sans = await page.evaluate(async () => {
      window.adocPresentDeepDiveHome();
      await new Promise(r => setTimeout(r, 300));
      window.adocPresentOpenDeepDive('n2');
      await new Promise(r => setTimeout(r, 400));
      return { illus: document.querySelectorAll('.cc-ws-present-door-illus').length,
               ouverte: document.getElementById('cc-ws-present-door').classList.contains('open') };
    });
    assert.equal(sans.ouverte, true);
    assert.equal(sans.illus, 0, 'aucune illustration sur une page qui n\'en demande pas');
    console.log('PASS 3/6  page sans imageQuery : aucune illustration, porte ouverte normalement.');

    // ── 4. L'ANGLE MORT DE L'EMBARQUEMENT EST FERMÉ ────────────────────────────────────────
    // adocCollectExportImageQueries ne parcourait que doc.blocks. Ce test échoue si quelqu'un
    // retire les pages de son périmètre — et personne ne s'en apercevrait autrement avant qu'un
    // export livre des aplats gris.
    const requetes = await page.evaluate(d => window.adocCollectExportImageQueries(d).map(r => r.q), DOC);
    assert.ok(requetes.includes('therapist office chairs'),
      'la requête d\'une PAGE doit être collectée pour l\'embarquement : ' + JSON.stringify(requetes));
    const alt = await page.evaluate(d => (window.adocCollectExportImageQueries(d)
      .find(r => r.q === 'therapist office chairs') || {}).alt, DOC);
    assert.equal(alt, 'Deux fauteuils face à face',
      'le texte alternatif doit suivre : c\'est le repli lisible si le téléchargement échoue');
    console.log('PASS 4/6  embarquement : la requête d\'une page est collectée, avec son texte alternatif.');

    // ── 5. LE DICTIONNAIRE EMBARQUÉ COUVRE LA PAGE ─────────────────────────────────────────
    const res = await page.evaluate(async d => {
      const r = await window.adocResolveImagesForExport(d, { workerUrl: 'https://exemple', delaiMs: 0,
        fetchPhoto: async (w, q) => { throw Object.assign(new Error('/fetch-image 404'), { status: 404 }); } });
      return { cles: Object.keys(r.images), replis: Object.values(r.images).filter(v => v.startsWith('data:image/svg')).length };
    }, DOC);
    assert.ok(res.cles.includes('therapist office chairs'),
      'la requête de page doit figurer dans le dictionnaire — sinon l\'ouverture repartirait sur le réseau');
    assert.equal(res.replis, res.cles.length, 'toutes les requêtes ratées portent leur repli');
    console.log('PASS 5/6  dictionnaire d\'export : ' + res.cles.length + ' entrée(s), page comprise.');

    // ── 6. EXPORT RÉELLEMENT CONSTRUIT, OUVERT, ET PAGE OUVERTE ────────────────────────────
    const html = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    assert.ok(html.includes('function adocDeepDiveImageHTML'), 'la fonction de rendu doit être embarquée');
    const fichier = path.join(dossier, 'p.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errExp = [];
    exp.on('pageerror', e => errExp.push(e.message));
    await exp.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'), null, { timeout: 60000 });
    const dans = await exp.evaluate(async () => {
      window.adocPresentOpenDeepDive('n1');
      await new Promise(r => setTimeout(r, 600));
      const i = document.querySelector('.cc-ws-present-door-illus');
      return { illus: !!i, maxHeight: i ? getComputedStyle(i).maxHeight : null,
               ouverte: document.getElementById('cc-ws-present-door').classList.contains('open') };
    });
    assert.equal(dans.ouverte, true, 'la porte doit s\'ouvrir dans l\'export');
    assert.equal(dans.illus, true, 'l\'illustration doit être rendue dans l\'export');
    assert.equal(dans.maxHeight, '260px', 'le plafond doit s\'appliquer dans l\'export aussi');
    assert.deepEqual(errExp, [], 'erreur dans l\'export : ' + errExp.join(' | '));
    await exp.close();
    console.log('PASS 6/6  export construit, ouvert, page ouverte : illustration rendue, 0 ReferenceError.');

    // ── 7 — LE CHEMIN RÉEL DE GÉNÉRATION : la conversion doit REPORTER l'illustration ──────────
    // C'est l'assertion qui manquait, et son absence a laissé passer un défaut de production entier :
    // adocConvertDeepDives ne reportait ni imageQuery ni imageAlt, si bien qu'aucune page issue d'une
    // VRAIE génération ne pouvait s'illustrer. Les tests 1 à 6 forgeaient des documents portant déjà
    // imageQuery et ne traversaient donc jamais la conversion. Tout test d'un champ de deepDives doit
    // passer par ici, jamais seulement par un document fabriqué à la main.
    const atelier2 = await browser.newPage();
    await atelier2.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier2.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await atelier2.waitForFunction(() => typeof window.adocConvertDeepDives === 'function');
    const conv = await atelier2.evaluate(() => {
      const brut = [
        { id: 'n1', title: 'Illustrée', imageQuery: 'therapist office chairs', imageAlt: 'Un cabinet 🙂',
          paragraphs: ['Un paragraphe assez long pour être conservé.'], deepDiveLinks: [] },
        { id: 'n2', title: 'Sans image', imageQuery: '', imageAlt: '',
          paragraphs: ['Un paragraphe assez long pour être conservé.'], deepDiveLinks: [] },
      ];
      const out = window.adocConvertDeepDives(brut);
      return { avec: out[0], sans: out[1],
        htmlAvec: window.adocDeepDiveImageHTML(out[0]), htmlSans: window.adocDeepDiveImageHTML(out[1]) };
    });
    assert.equal(conv.avec.imageQuery, 'therapist office chairs',
      "adocConvertDeepDives DOIT reporter imageQuery — sans quoi aucune page réellement générée ne s'illustre");
    assert.equal(conv.avec.imageAlt, 'Un cabinet',
      'imageAlt est reporté ET passé par adocStripEmoji, comme tout texte visible de ce document');
    assert.ok(/data-pexels="therapist office chairs"/.test(conv.htmlAvec),
      "l'illustration doit être rendue à partir du document CONVERTI, pas seulement d'un document forgé");
    assert.ok(!('imageQuery' in conv.sans),
      "une page sans requête n'emporte AUCUNE clé vide — même principe additif que deepDiveLinks");
    assert.equal(conv.htmlSans, '', 'une page sans requête ne produit rien');
    await atelier2.close();
    console.log("PASS 7/8  adocConvertDeepDives reporte imageQuery/imageAlt (et rien quand il n'y a rien).");

    // ── 8 — LE COURS EN PUZZLE : l'assemblage repasse par la conversion, et reperdait tout ─────────
    const atelier3 = await browser.newPage();
    await atelier3.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier3.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await atelier3.waitForFunction(() => typeof window.adocAssembleCourse === 'function');
    const assemble = await atelier3.evaluate(() => {
      const doc = { documentKind: 'presentation', title: 'M1', citations: [],
        blocks: [{ id: 'c1', type: 'card', content: { title: 'D', imageRef: null, imageAlt: null,
          blocks: [{ id: 'p1', type: 'paragraph', content: { text: 'T' }, citationIds: [], validation: {},
            deepDiveLinks: [{ text: 'T', targetId: 'n1' }] }] } }],
        deepDives: [{ id: 'n1', title: 'Illustrée', imageQuery: 'therapist office chairs',
          imageAlt: 'Un cabinet', paragraphs: ['Un paragraphe assez long pour être conservé.'] }] };
      const out = window.adocAssembleCourse([{ id: 'm1', doc: doc, snapshot: { entries: [] } }],
        { courseId: 'c', titre: 'Cours', modules: [{ id: 'm1', titre: 'Module 1' }] },
        { ids: { documentId: 'd', versionId: 'v', createdAt: '2026-01-01', requestId: 'r' } });
      return (out.doc.deepDives || [])[0] || {};
    });
    assert.equal(assemble.imageQuery, 'therapist office chairs',
      "un cours assemblé DOIT garder l'illustration de chaque page — adocAssembleCourse reconstruit les pages et les reperdait");
    await atelier3.close();
    console.log("PASS 8/8  cours assemblé : l'illustration survit à adocAssembleCourse.");

    assert.deepEqual(erreurs, [], 'erreurs de page : ' + erreurs.join(' | '));
    console.log('\nTOUT PASSE — 8/8, aucun appel réseau.');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
