// UX-8B Lot 3 — CORRECTIF glisser-déposer sur "Importer une charte". Preuve réelle par un VRAI
// événement DragEvent/DataTransfer dispatché sur la zone (pas un simple appel direct de la
// fonction de traitement, qui ne prouverait rien sur le preventDefault manquant) : sans le
// correctif, le comportement par défaut du navigateur (ouvrir le fichier) n'est pas empêché —
// dispatchEvent() renvoie alors true (non annulé) au lieu de false. On vérifie aussi, par
// comparaison directe, que la zone de document clinique déjà fonctionnelle a exactement le même
// comportement (même pattern réutilisé, comme demandé).
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';
const REAL_PDF_PAGES = JSON.parse(fs.readFileSync(OUT + '/charte-pdf-pages.json', 'utf-8'));

const BRAND_KIT_1 = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Studio Clinique — pétrole/terracotta (par défaut)', version: 1,
  colors: { primary: '#102F31', accent: '#9B4E36', background: '#F6F2EA', text: '#273331', success: '#2F6E52', warning: '#8A3F29', critical: '#A13327' },
  typography: { headingFont: '"Source Serif 4", Georgia, serif', bodyFont: '"IBM Plex Sans", system-ui, sans-serif' }, status: 'active',
};
const MOCK_ANALYSIS = {
  colors: [{ element: 'color', candidate: 'Pin profond', hexExact: '#173A3B', proposedRole: 'primary', confidence: 0.95, detectionMode: 'text-extraction', requiresConfirmation: false }],
  fonts: [{ element: 'font', candidate: 'Newsreader', proposedRole: 'heading', sizes: '', confidence: 0.9, detectionMode: 'text-extraction', requiresConfirmation: false }],
  toneRules: [], visualProhibitions: [], noBrandDataFound: false,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const pageErrors = [];
  page.on('pageerror', (e) => { errors.push(e.message); pageErrors.push(e.message); });
  // Une navigation vers le PDF déposé (le bug lui-même) déclencherait un vrai changement d'URL —
  // on le détecte explicitement, c'est la manifestation la plus directe du symptôme signalé.
  let navigatedAwayFromApp = false;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && !frame.url().includes('studio-clinique.html') && frame.url() !== 'about:blank') {
      navigatedAwayFromApp = true;
    }
  });

  await page.addInitScript((pages) => {
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({ numPages: pages.length, getPage: async (i) => ({ getTextContent: async () => ({ items: [{ str: pages[i - 1] }] }) }) }) }),
    };
  }, REAL_PDF_PAGES);

  await page.route('**/*', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [BRAND_KIT_1] }) }); return; }
    if (url.endsWith('/brand-kits/analyze') && method === 'POST') { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYSIS) }); return; }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) }); return; }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(400);

  console.log('=== 0. Comparaison — la zone de document clinique existante (référence connue pour fonctionner) ===');
  const clinicalZoneResult = await page.evaluate(() => {
    const zone = document.getElementById('cc-landing-upload-zone');
    const dt = new DataTransfer();
    dt.items.add(new File([new Blob(['x'], { type: 'application/pdf' })], 'doc-clinique-test.pdf', { type: 'application/pdf' }));
    const dragoverEvent = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    const dragoverNotCancelled = zone.dispatchEvent(dragoverEvent);
    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    const dropNotCancelled = zone.dispatchEvent(dropEvent);
    return {
      dragoverDefaultPrevented: !dragoverNotCancelled,
      dropDefaultPrevented: !dropNotCancelled,
    };
  });
  console.log(clinicalZoneResult);
  console.log('=> Référence confirmée : preventDefault() posé sur dragover ET drop de la zone clinique:',
    clinicalZoneResult.dragoverDefaultPrevented && clinicalZoneResult.dropDefaultPrevented);

  console.log('\n=== 1. LE CORRECTIF — vrai DragEvent/DataTransfer sur "Importer une charte" ===');
  const brandKitZoneResult = await page.evaluate(() => {
    const zone = document.getElementById('cc-brandkit-import-zone');
    const dt = new DataTransfer();
    dt.items.add(new File([new Blob(['x'], { type: 'application/pdf' })], 'charte-test.pdf', { type: 'application/pdf' }));
    const dragoverEvent = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    const dragoverNotCancelled = zone.dispatchEvent(dragoverEvent);
    return { dragoverDefaultPrevented: !dragoverNotCancelled };
  });
  console.log(brandKitZoneResult);
  console.log('=> dragover correctement annulé (condition nécessaire pour que "drop" soit lui-même annulable) :', brandKitZoneResult.dragoverDefaultPrevented);

  console.log('\n=== 2. Le "drop" réel est bien capté par la zone (pas ouvert par le navigateur) ===');
  const dropResult = await page.evaluate(async () => {
    const zone = document.getElementById('cc-brandkit-import-zone');
    const dt = new DataTransfer();
    const blob = new Blob(['%PDF-1.4 fake bytes for drop test'], { type: 'application/pdf' });
    const file = new File([blob], 'charte-glisser-depose.pdf', { type: 'application/pdf' });
    dt.items.add(file);
    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    const dropNotCancelled = zone.dispatchEvent(dropEvent);
    return { dropDefaultPrevented: !dropNotCancelled };
  });
  console.log(dropResult);
  await page.waitForSelector('#cc-brandkit-confirm.open', { timeout: 15000 });
  console.log('=> Le fichier déposé a bien déclenché le parcours d\'import réel (modal de confirmation ouverte) :',
    await page.evaluate(() => document.getElementById('cc-brandkit-confirm').classList.contains('open')));
  console.log('=> Aucune navigation du navigateur vers le fichier déposé (symptôme signalé) :', !navigatedAwayFromApp);
  console.log('=> Toujours sur studio-clinique.html :', page.url().includes('studio-clinique.html'));

  await page.screenshot({ path: OUT + '/ux8b-lot3-dragdrop-fix.png', fullPage: true });

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
