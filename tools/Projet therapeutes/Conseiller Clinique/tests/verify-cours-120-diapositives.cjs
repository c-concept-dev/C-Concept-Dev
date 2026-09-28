// Cours en puzzle — un cours de 120 diapositives, ASSEMBLÉ, EXPORTÉ, puis réellement ouvert et
// cliqué. Aucun appel au modèle : le document est forgé par ce test, de façon déterministe.
//
// Ce qu'il mesure, et qui n'était qu'une estimation jusqu'ici : le poids du fichier exporté, le
// temps d'ouverture, le temps pour atteindre la dernière diapositive et pour ouvrir le sommaire.
// Ce qu'il protège : qu'un sommaire de 132 entrées reste utilisable, que la navigation tienne, et
// qu'aucune fonction interne n'ait été oubliée du graphe d'export — seul un fichier réellement
// ouvert le dit.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-cours-120-diapositives.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULES = 12, PAR_MODULE = 10;
const IDS = { documentId: 'cours-120', versionId: 'cours-120-v1', createdAt: '2026-01-01T00:00:00Z', requestId: 'req-120' };
const sha256 = t => 'sha256:' + crypto.createHash('sha256').update(t).digest('hex');
// ~1 640 caractères par diapositive : la densité MESURÉE sur une génération réelle (39 366
// caractères pour 24 diapositives). Un test à 200 caractères ne dirait rien du poids réel.
const pave = (graine, n) => {
  let t = '';
  while (t.length < n) t += 'Le travail clinique sur ' + graine + ' engage une lecture du lien, de ses ruptures et de ses reprises. ';
  return t.slice(0, n);
};

function forgerModule(n) {
  // 60 % de passages partagés : c'est ce que produisent des modules d'un même cours interrogeant
  // la même bibliothèque, et c'est ce qui rend le dédoublonnage indispensable.
  const passages = ['commun-1', 'commun-2', 'commun-3', 'propre-' + n];
  const entries = passages.map((p, i) => ({
    sourceSnapshotEntryId: 'entry-' + (i + 1), sourceType: 'library', sourceId: 'livre-' + p,
    passageId: p, exactText: 'Passage ' + p, contentChecksum: sha256('Passage ' + p),
    book: 'Livre ' + p, author: 'Auteur', locator: { page: 10 + i, section: null },
    retrievedAt: '2026-01-01T00:00:00Z',
  }));
  const citations = passages.map((p, i) => ({
    citationId: 'citation-' + (i + 1), sourceSnapshotEntryId: 'entry-' + (i + 1), displayLabel: 'Livre ' + p + ', p. ' + (10 + i) }));
  const cards = [];
  for (let c = 1; c <= PAR_MODULE; c++) {
    const cite = citations[c % citations.length].citationId;
    const blocs = [
      { id: 'paragraph-' + c, type: 'paragraph', content: { text: pave('le module ' + n, 900) },
        citationIds: [cite], validation: { citationLinks: [{ citationId: cite, claimText: 'Affirmation.', claimSupport: 'pending' }] } },
    ];
    // Mélange réel de types : une liste plate ne mesurerait pas le coût du rendu.
    if (c % 4 === 1) blocs.push({ id: 'list-' + c, type: 'list', content: { items: [pave('un axe', 200), pave('un autre', 200), pave('un troisième', 200)], ordered: false }, citationIds: [], validation: {} });
    if (c % 4 === 2) blocs.push({ id: 'callout-' + c, type: 'callout', content: { text: pave('un point de vigilance', 500), visualRole: 'info' }, citationIds: [], validation: {} });
    if (c % 4 === 3) blocs.push({ id: 'quote-' + c, type: 'quote', content: { text: pave('une citation clinique', 400) }, citationIds: [], validation: {} });
    if (c === PAR_MODULE) blocs.push({ id: 'questionnaire-' + c, type: 'questionnaire', content: {
        questions: [{ text: 'Question A ?', options: [{ text: 'Souvent', points: 0 }, { text: 'Rarement', points: 2 }] },
                    { text: 'Question B ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] }],
        profiles: [{ label: 'Bas', minScore: 0, maxScore: 1, interpretation: 'Rien de notable.' },
                   { label: 'Élevé', minScore: 2, maxScore: 4, interpretation: 'À explorer.' }],
        allowTwoPartners: false }, citationIds: [], validation: {} });
    if (c === 1) blocs.push({ id: 'heading-' + c, type: 'heading', content: { text: 'Notion clé du module ' + n, level: 2 },
      citationIds: [], validation: {}, deepDiveLinks: [{ text: 'Notion clé du module ' + n, targetId: 'dd-a' }] });
    cards.push({ id: 'card-' + String(c).padStart(2, '0'), type: 'card',
      content: { title: 'Module ' + n + ' — diapositive ' + c, imageRef: null, imageAlt: null, blocks: blocs },
      citationIds: [], validation: {} });
  }
  return { id: 'm' + n, snapshot: { sourceSnapshotId: 's' + n, entries },
    doc: { schemaVersion: 1, documentId: 'm' + n, versionId: 'm' + n + '-v1', previousVersionId: null,
      requestId: 'r' + n, sourceSnapshotId: 's' + n, createdAt: '2026-01-01T00:00:00Z', language: 'fr',
      status: 'draft', title: 'Module ' + n, purpose: 'Objectif', audience: 'clinicien',
      documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
      blocks: cards, citations,
      validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
      deepDives: [
        { id: 'dd-a', title: 'Page A — module ' + n, paragraphs: [{ text: pave('la page A', 700), deepDiveLinks: [{ text: 'la page A', targetId: 'dd-b' }] }] },
        { id: 'dd-b', title: 'Page B — module ' + n, paragraphs: [pave('la page B', 700)] },
      ] } };
}
const PLAN = { courseId: 'c-120', titre: 'Cours complet en 12 modules',
  modules: Array.from({ length: MODULES }, (_, i) => ({ id: 'm' + (i + 1), titre: 'Module ' + (i + 1), notionsCles: ['notion ' + (i + 1)], dureeMinutes: 15 })) };

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocAssembleCourse === 'function');

    const modules = Array.from({ length: MODULES }, (_, i) => forgerModule(i + 1));
    const t0 = Date.now();
    const r = await page.evaluate(([m, p, o]) => window.adocAssembleCourse(m, p, o), [modules, PLAN, { ids: IDS }]);
    const msAssemblage = Date.now() - t0;
    assert.equal(r.doc.blocks.length, MODULES + MODULES * PAR_MODULE, '12 en-têtes + 120 diapositives');
    assert.equal(r.snapshot.entries.length, 3 + MODULES, '3 passages communs + 12 propres');
    assert.equal(r.rapport.entreesDedoublonnees, MODULES * 4 - (3 + MODULES), 'doublons écartés');
    const v = await page.evaluate(d => window.adocValidateSchema('clinicalDocument', d), r.doc);
    assert.equal(!!v.valid, true, 'document de 132 diapositives invalide : ' + JSON.stringify((v.errors || []).slice(0, 4)));
    console.log('PASS 1/8  assemblage : ' + r.doc.blocks.length + ' diapositives, ' + r.doc.deepDives.length
      + ' pages, ' + r.snapshot.entries.length + ' entrées (' + r.rapport.entreesDedoublonnees + ' doublons écartés), '
      + msAssemblage + ' ms, document valide.');

    // ── EXPORT RÉEL ───────────────────────────────────────────────────────────────────────────
    const fichier = path.join(os.tmpdir(), 'cc-cours-120.html');
    const tExport = Date.now();
    const html = await page.evaluate(d => window.adocBuildStandalonePresentationHTML(d), r.doc);
    fs.writeFileSync(fichier, html, 'utf8');
    const msExport = Date.now() - tExport;
    const ko = Math.round(fs.statSync(fichier).size / 1024);

    // Garde-fou onclick, sur un document qui exerce TOUS les types de bloc produits.
    const appeles = new Set();
    for (const m of html.matchAll(/onclick="window\.(\w+)\(/g)) appeles.add(m[1]);
    const manquants = [...appeles].filter(n => !html.includes('window.' + n + ' ='));
    assert.deepEqual(manquants, [], 'onclick sans fonction exportée : ' + manquants.join(', '));
    console.log('PASS 2/8  export écrit : ' + ko + ' Ko en ' + msExport + ' ms ; garde-fou onclick sur '
      + appeles.size + ' fonction(s), toutes exportées.');

    const exp = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const expErreurs = [];
    exp.on('pageerror', e => expErreurs.push(e.message));
    const tOuvre = Date.now();
    await exp.goto('file://' + fichier);
    await exp.waitForSelector('#cc-ws-present-slide-inner .adoc-sc-card');
    const msOuverture = Date.now() - tOuvre;
    console.log('PASS 3/8  fichier ouvert et première diapositive rendue en ' + msOuverture + ' ms.');

    // ── SOMMAIRE GROUPÉ ───────────────────────────────────────────────────────────────────────
    await exp.evaluate(() => { document.getElementById('cc-login-screen')?.remove(); document.getElementById('cc-workspace')?.classList.add('open'); });
    const tToc = Date.now();
    await exp.evaluate(() => window.adocPresentToggleToc());
    await exp.waitForFunction(() => !document.getElementById('cc-ws-present-toc')?.hidden);
    const msToc = Date.now() - tToc;
    const toc = await exp.evaluate(() => ({
      titres: [...document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-titre')].map(e => e.textContent),
      entrees: document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-item').length,
      pages: document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-dive').length,
      premierIdx: document.querySelector('#cc-ws-present-toc .cc-ws-present-toc-item').dataset.idx,
      dernierNum: [...document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-item:not(.cc-ws-present-toc-dive) .cc-ws-present-toc-num')].pop().textContent,
    }));
    assert.equal(toc.titres.filter(t => /^Module /.test(t)).length, MODULES, 'un intitulé par module');
    assert.equal(toc.entrees - toc.pages, MODULES + MODULES * PAR_MODULE, 'toutes les diapositives listées');
    assert.equal(toc.dernierNum, String(MODULES + MODULES * PAR_MODULE), 'numérotation GLOBALE conservée');
    assert.equal(toc.pages, MODULES * 2, 'les pages d\'approfondissement restent listées');
    console.log('PASS 4/8  sommaire groupé : 12 intitulés, ' + toc.entrees + ' entrées, numérotation globale jusqu\'à '
      + toc.dernierNum + ', ouvert en ' + msToc + ' ms.');

    // ── CLIC SUR UN MODULE ────────────────────────────────────────────────────────────────────
    const tSaut = Date.now();
    await exp.evaluate(() => {
      const t = [...document.querySelectorAll('#cc-ws-present-toc .cc-ws-present-toc-titre')].find(e => e.textContent === 'Module 12');
      t.nextElementSibling.click();
    });
    await exp.waitForFunction(() => (document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card-title')?.textContent || '').includes('Module 12'));
    const msSaut = Date.now() - tSaut;
    console.log('PASS 5/8  clic sur « Module 12 » dans le sommaire : diapositive atteinte en ' + msSaut + ' ms.');

    // ── DERNIÈRE DIAPOSITIVE ──────────────────────────────────────────────────────────────────
    const tFin = Date.now();
    await exp.evaluate(n => window.adocPresentGoTo(n - 1), MODULES + MODULES * PAR_MODULE);
    await exp.waitForFunction(() => (document.getElementById('cc-ws-present-counter')?.textContent || '').startsWith('132 /'));
    const msFin = Date.now() - tFin;
    console.log('PASS 6/8  diapositive 132 atteinte en ' + msFin + ' ms.');

    // ── NAVIGATION AUX FLÈCHES ────────────────────────────────────────────────────────────────
    await exp.bringToFront();
    for (let i = 0; i < 3; i++) await exp.keyboard.press('ArrowLeft');
    await exp.waitForTimeout(500);
    const compteur = await exp.evaluate(() => document.getElementById('cc-ws-present-counter').textContent);
    assert.match(compteur, /^1(29|30|31|32) \//, 'les flèches doivent reculer ; compteur : ' + compteur);
    console.log('PASS 7/8  navigation aux flèches depuis la fin : compteur « ' + compteur + ' ».');

    // ── APPROFONDISSEMENT, RECULER, PAGE MAÎTRE ───────────────────────────────────────────────
    await exp.evaluate(() => window.adocPresentGoTo(1));
    await exp.waitForTimeout(400);
    const avant = await exp.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    await exp.evaluate(() => document.querySelector('#cc-ws-present-door .adoc-sc-deepdive-chip').click());
    await exp.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Page B'));
    await exp.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][0].click());
    await exp.waitForFunction(() => (document.querySelector('.cc-ws-present-door-title')?.textContent || '').includes('Page A'));
    await exp.evaluate(() => [...document.querySelectorAll('.cc-ws-present-door-btn')][1].click());
    await exp.waitForFunction(() => !document.getElementById('cc-ws-present-door')?.classList.contains('open'));
    assert.equal(await exp.evaluate(() => document.getElementById('cc-ws-present-slide-inner').innerHTML), avant,
      'la diapositive doit rester intacte byte pour byte');
    assert.deepEqual(expErreurs, [], 'aucune erreur dans le fichier exporté : ' + expErreurs.join(' | '));
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + erreurs.join(' | '));
    console.log('PASS 8/8  approfondissement, Reculer, Page maître DANS L\'EXPORT ; diapositive intacte ; 0 erreur.');

    console.log('\n  ── MESURES ──');
    console.log('  assemblage           : ' + msAssemblage + ' ms');
    console.log('  construction export  : ' + msExport + ' ms');
    console.log('  poids du fichier     : ' + ko + ' Ko (sans images)');
    console.log('  ouverture            : ' + msOuverture + ' ms');
    console.log('  sommaire             : ' + msToc + ' ms');
    console.log('  saut au module 12    : ' + msSaut + ' ms');
    console.log('  diapositive 132      : ' + msFin + ' ms');
    console.log('\nPASS verify-cours-120-diapositives — 8/8.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
