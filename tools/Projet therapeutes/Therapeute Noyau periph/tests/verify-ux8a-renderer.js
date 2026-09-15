const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const FIXTURES = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/fixtures';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

function load(name) { return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8')); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  console.log('=== 0. rendererModeByDocumentKind + adocGetRendererMode exposés ===');
  const modeInfo = await page.evaluate(() => ({
    rendererModeByDocumentKind: window.rendererModeByDocumentKind,
    ficheMode: window.adocGetRendererMode('fiche'),
    carrouselMode: window.adocGetRendererMode('carrousel'),
    tableauMode: window.adocGetRendererMode('tableau'),
    hasRenderFn: typeof window.adocRenderClinicalDocument === 'function',
  }));
  console.log(modeInfo);

  const ficheType = load('fixture-fiche-type.json');
  const ficheTypeSnap = load('fixture-fiche-type.sourcesnapshot.json');
  const ficheLongue = load('fixture-fiche-longue.json');
  const ficheLongueSnap = load('fixture-fiche-longue.sourcesnapshot.json');
  const carrousel = load('fixture-carrousel-type.json');
  const carrouselSnap = load('fixture-carrousel-type.sourcesnapshot.json');

  console.log('=== 1. Rendu fiche-type ===');
  const r1 = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return { htmlLength: result.html.length, qc: result.qc, blockCount: (doc.blocks || []).length, hasHeading: result.html.includes('<h1'), hasTable: result.html.includes('<table'), hasCallout: result.html.includes('adoc-sc-callout') };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(r1);

  console.log('=== 2. Rendu fiche-longue ===');
  const r2 = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return { htmlLength: result.html.length, qc: result.qc, blockCount: (doc.blocks || []).length };
  }, { doc: ficheLongue, snap: ficheLongueSnap });
  console.log(r2);

  console.log('=== 3. Rendu carrousel-type (structure imbriquée card > blocks[]) ===');
  const r3 = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return { htmlLength: result.html.length, qc: result.qc, cardCount: (doc.blocks || []).length, cardMatches: (result.html.match(/adoc-sc-card"/g) || []).length };
  }, { doc: carrousel, snap: carrouselSnap });
  console.log(r3);

  console.log('=== 4. QC bloquant réel — citation invalide (référence un citationId inexistant) ===');
  const r4 = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.blocks[1].citationIds = ['citation-does-not-exist'];
    bad.blocks[1].validation = { citationLinks: [{ citationId: 'citation-does-not-exist', claimText: 'x', claimSupport: 'pass' }] };
    const result = await window.adocRenderClinicalDocument(bad, snap);
    return { blocking: result.qc.blocking, exportAllowed: result.qc.exportAllowed, linkStatus: result.validatedDoc.blocks[1].validation.citationLinks[0].claimSupport };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(r4);
  console.log('citation invalide bien dégradée à needs-review ET export bloqué:', r4.linkStatus === 'needs-review' && r4.exportAllowed === false);

  console.log('=== 5. QC bloquant réel — contenu tronqué ===');
  const r5 = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.blocks[2].content.text = bad.blocks[2].content.text.slice(0, -1).replace(/[.!?…»"”]?$/, '') + ' et donc';
    const result = await window.adocRenderClinicalDocument(bad, snap);
    return { blocking: result.qc.blocking, exportAllowed: result.qc.exportAllowed };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(r5);

  console.log('=== 6. QC bloquant réel — image informative sans texte alternatif ===');
  // Note (pré-existant, hors périmètre UX-8A.2) : depuis le durcissement du schéma en
  // UX-8A.1 (if imageRef:string then imageAlt requis non vide), un imageAlt manquant sur
  // card.content est désormais rejeté par ajv AVANT même d'atteindre le contrôle qualité
  // explicite — les deux couches convergent vers le même refus, juste à des étages
  // différents. On tolère les deux issues ici plutôt que de crasher le process.
  const r6 = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.blocks[0].content.imageRef = 'img-01.png';
    bad.blocks[0].content.imageAlt = null;
    try {
      const result = await window.adocRenderClinicalDocument(bad, snap);
      return { rejectedBy: 'qc', blocking: result.qc.blocking, exportAllowed: result.qc.exportAllowed };
    } catch (e) {
      return { rejectedBy: 'schema', message: e.message };
    }
  }, { doc: carrousel, snap: carrouselSnap });
  console.log(r6);

  console.log('=== 7. rendererModeByDocumentKind : tableau/script/liens refusés par le moteur canonique (legacy) ===');
  const r7 = await page.evaluate(async ({ doc }) => {
    const asTableau = JSON.parse(JSON.stringify(doc));
    asTableau.documentKind = 'tableau';
    try {
      await window.adocRenderClinicalDocument(asTableau, null);
      return { threw: false };
    } catch (e) {
      return { threw: true, message: e.message };
    }
  }, { doc: ficheType });
  console.log(r7);

  // Screenshots for the change report
  await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    document.body.innerHTML = '<div style="max-width:700px;margin:40px auto;">' + result.html + '</div>';
  }, { doc: ficheType, snap: ficheTypeSnap });
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + '/ux8a-pilot-fiche.png', fullPage: true });

  await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    document.body.innerHTML = '<div style="max-width:1100px;margin:40px auto;">' + result.html + '</div>';
  }, { doc: carrousel, snap: carrouselSnap });
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + '/ux8a-pilot-carrousel.png', fullPage: true });

  console.log('=== errors ===', errors);
  await browser.close();
})();
