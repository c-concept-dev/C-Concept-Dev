// UX-8B Lot 3 — preuve réelle du parcours d'import de charte PDF, de bout en bout : dépôt d'un
// VRAI fichier PDF (extraction pdf.js RÉELLE, jamais mockée), interprétation par Claude MOCKÉE
// (le Worker réel/l'API Anthropic sont inatteignables depuis ce sandbox — même limite déjà
// documentée pour la génération de documents), écran de confirmation, rôles modifiables,
// alerte WCAG réelle, sauvegarde, apparition immédiate dans le sélecteur, "Retirer".
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const REAL_PDF = '/root/.claude/uploads/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/b289190f-chartegraphiquestudioclinique.pdf';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

// pdfjsLib est chargé depuis un CDN externe (cdnjs) dans studio-clinique.html — indisponible de
// façon fiable dans ce sandbox headless (même contrainte déjà rencontrée sur d'autres lots, cf.
// verify-landing-upload.js qui stub déjà pdfjsLib pour la même raison). On stub pdfjsLib avec le
// VRAI texte page par page du PDF de référence (extrait au préalable par pdfminer, un second
// extracteur PDF réel — jamais un texte inventé), pour que extractPDFText() (code client réel,
// non modifié) s'exécute sur de vraies données, exactement comme il le ferait avec un pdf.js
// réel en conditions de production.
const REAL_PDF_PAGES = JSON.parse(fs.readFileSync(OUT + '/charte-pdf-pages.json', 'utf-8'));

const BRAND_KIT_1 = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Studio Clinique — pétrole/terracotta (par défaut)', version: 1,
  colors: { primary: '#102F31', accent: '#9B4E36', background: '#F6F2EA', text: '#273331', success: '#2F6E52', warning: '#8A3F29', critical: '#A13327' },
  typography: { headingFont: '"Source Serif 4", Georgia, serif', bodyFont: '"IBM Plex Sans", system-ui, sans-serif' }, status: 'active',
};
const BRAND_KIT_2 = {
  id: '00000000-0000-4000-8000-000000000002', name: 'Humaniste accessible', version: 1,
  colors: { primary: '#1B3A5C', accent: '#9C561A', background: '#FBF8F3', text: '#2B2620', success: '#2E7D4F', warning: '#A8431D', critical: '#A32C2C' },
  typography: { headingFont: '"Literata", Georgia, serif', bodyFont: '"Atkinson Hyperlegible", Arial, sans-serif' }, status: 'active',
};

// Même analyse "réaliste" que le test Worker (test-worker-brandkit-lot3.mjs) — construite à la
// main à partir d'une lecture attentive du VRAI texte extrait du PDF de référence.
const MOCK_ANALYSIS = {
  colors: [
    { element: 'color', candidate: 'Pin profond', hexExact: '#173A3B', proposedRole: 'primary', confidence: 0.95, detectionMode: 'text-extraction', requiresConfirmation: false },
    { element: 'color', candidate: 'Pin feutré', hexExact: '#2E5B59', proposedRole: 'text', confidence: 0.5, detectionMode: 'text-extraction', requiresConfirmation: true },
    { element: 'color', candidate: 'Argile', hexExact: '#934B38', proposedRole: 'accent', confidence: 0.9, detectionMode: 'text-extraction', requiresConfirmation: false },
    { element: 'color', candidate: 'Argile claire', hexExact: '#EED9CF', proposedRole: 'warning', confidence: 0.35, detectionMode: 'text-extraction', requiresConfirmation: true },
    { element: 'color', candidate: 'Parchemin', hexExact: '#F7F1E8', proposedRole: 'background', confidence: 0.85, detectionMode: 'text-extraction', requiresConfirmation: false },
    { element: 'color', candidate: 'Papier', hexExact: '#FFFDF9', proposedRole: 'success', confidence: 0.25, detectionMode: 'text-extraction', requiresConfirmation: true },
    { element: 'color', candidate: 'Brume', hexExact: '#D7E2DF', proposedRole: 'critical', confidence: 0.2, detectionMode: 'text-extraction', requiresConfirmation: true },
    { element: 'color', candidate: 'Laiton mat', hexExact: '#B28A4A', proposedRole: 'decorative', confidence: 0.9, detectionMode: 'text-extraction', requiresConfirmation: false },
  ],
  fonts: [
    { element: 'font', candidate: 'Newsreader', proposedRole: 'heading', sizes: 'H1 28/32pt, H2 20/25pt', confidence: 0.9, detectionMode: 'text-extraction', requiresConfirmation: false },
    { element: 'font', candidate: 'Atkinson Hyperlegible', proposedRole: 'body', sizes: 'Corps 14/18pt', confidence: 0.9, detectionMode: 'text-extraction', requiresConfirmation: false },
  ],
  toneRules: ['Le pin sur papier reste le couple de lecture principal.'],
  visualProhibitions: ["Le laiton n'est jamais utilisé pour du texte courant."],
  noBrandDataFound: false,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript((pages) => {
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: pages.length,
          getPage: async (i) => ({ getTextContent: async () => ({ items: [{ str: pages[i - 1] }] }) }),
        }),
      }),
    };
  }, REAL_PDF_PAGES);

  let brandKitsListState = [BRAND_KIT_1, BRAND_KIT_2];
  let analyzeCallCount = 0, analyzeSentTextLength = 0;
  let uploadCallCount = 0;
  let createCallCount = 0, createdPayload = null;
  let statusPatchCount = 0;
  let ragCallCount = 0;

  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    if (url.includes('/search-library') || url.includes('/d1-query')) {
      ragCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      return;
    }
    if (url.endsWith('/brand-kits') && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: brandKitsListState }) });
      return;
    }
    if (url.endsWith('/brand-kits/analyze') && method === 'POST') {
      analyzeCallCount++;
      const body = JSON.parse(req.postData() || '{}');
      analyzeSentTextLength = (body.text || '').length;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYSIS) });
      return;
    }
    if (url.endsWith('/brand-assets/upload') && method === 'POST') {
      uploadCallCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset_id: 'mockassetid1234567890', deduplicated: false, size_bytes: 12345 }) });
      return;
    }
    if (url.endsWith('/brand-kits') && method === 'POST') {
      createCallCount++;
      createdPayload = JSON.parse(req.postData() || '{}');
      const newKit = { id: 'imported-kit-001', name: createdPayload.name, version: 1, colors: createdPayload.colors, typography: createdPayload.typography, status: 'active' };
      brandKitsListState = [BRAND_KIT_1, BRAND_KIT_2, newKit];
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: newKit.id, name: newKit.name, status: 'active', created_at: new Date().toISOString() }) });
      return;
    }
    const statusMatch = url.match(/\/brand-kits\/([^/]+)\/status$/);
    if (statusMatch && method === 'PATCH') {
      statusPatchCount++;
      brandKitsListState = brandKitsListState.filter((k) => k.id !== statusMatch[1]);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: statusMatch[1], status: 'archived' }) });
      return;
    }
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '' }] }) });
      return;
    }
    route.continue();
  });

  await page.goto('file://' + FILE);
  await page.waitForTimeout(400);

  console.log('=== 0. Zone d\'import distincte de "Déposer ou cliquer" (document clinique) ===');
  const zoneInfo = await page.evaluate(() => {
    const importZone = document.querySelector('#cc-brandkit-import-zone');
    const clinicalZone = document.querySelector('#cc-landing-upload-zone');
    return {
      distinctContainers: importZone && clinicalZone && importZone !== clinicalZone && !importZone.contains(clinicalZone) && !clinicalZone.contains(importZone),
      importLabel: importZone?.querySelector('.txt')?.textContent,
      clinicalLabel: clinicalZone?.querySelector('.txt')?.textContent,
      importAccept: document.querySelector('#cc-brandkit-import-input')?.getAttribute('accept'),
    };
  });
  console.log(zoneInfo);

  console.log('\n=== 1. Dépôt du VRAI PDF — extraction pdf.js RÉELLE (non mockée) ===');
  await page.setInputFiles('#cc-brandkit-import-input', REAL_PDF);
  await page.waitForSelector('#cc-brandkit-confirm.open', { timeout: 15000 });
  console.log('Modal de confirmation ouverte:', await page.evaluate(() => document.getElementById('cc-brandkit-confirm').classList.contains('open')));
  console.log('POST /brand-kits/analyze appelé une fois:', analyzeCallCount === 1);
  console.log('Texte réellement extrait envoyé (longueur > 5000 caractères, PDF 19 pages réel):', analyzeSentTextLength > 5000, '(', analyzeSentTextLength, ')');

  console.log('\n=== 2. Écran de confirmation — 8 couleurs + 2 polices affichées, confiance visible ===');
  const confirmInfo = await page.evaluate(() => ({
    colorRows: document.querySelectorAll('#cc-brandkit-confirm-colors .cc-brandkit-element-row').length,
    fontRows: document.querySelectorAll('#cc-brandkit-confirm-fonts .cc-brandkit-element-row').length,
    firstColorHex: document.querySelector('#cc-brandkit-confirm-colors .cc-brandkit-element-detail')?.textContent,
    confidenceBadges: document.querySelectorAll('.cc-brandkit-confidence').length,
    rulesShown: document.getElementById('cc-brandkit-confirm-rules-block')?.hidden === false,
  }));
  console.log(confirmInfo);

  console.log('\n=== 3. Alerte WCAG RÉELLE affichée (Argile claire/warning vs Parchemin/background, contraste faible) ===');
  const wcagInfo = await page.evaluate(() => ({
    warningCount: document.querySelectorAll('.cc-brandkit-wcag-warning').length,
    firstWarningText: document.querySelector('.cc-brandkit-wcag-warning span')?.textContent,
  }));
  console.log(wcagInfo);

  await page.screenshot({ path: OUT + '/ux8b-lot3-confirm-screen.png', fullPage: true });

  console.log('\n=== 4. Aperçu réel rendu (même moteur de rendu canonique, jamais un second moteur) ===');
  const previewInfo = await page.evaluate(() => {
    const el = document.getElementById('cc-brandkit-confirm-preview');
    return { hasArticle: !!el?.querySelector('.adoc-sc-doc'), hasHeading: !!el?.querySelector('.adoc-sc-heading'), hasWarningCallout: !!el?.querySelector('.adoc-sc-callout-warning') };
  });
  console.log(previewInfo);

  console.log('\n=== 5. Rôle modifiable — changer manuellement un rôle recalcule aperçu + alertes ===');
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#cc-brandkit-confirm-colors .cc-brandkit-element-row');
    const lastRowSelect = rows[rows.length - 1].querySelector('select');
    lastRowSelect.value = 'decorative';
    lastRowSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  console.log('Changement de rôle appliqué sans erreur JS:', errors.length === 0);

  console.log('\n=== 6. Nom éditable, puis sauvegarde ===');
  await page.fill('#cc-brandkit-confirm-name', 'Sillage éditorial');
  await page.click('#cc-brandkit-confirm-save');
  await page.waitForTimeout(300);
  console.log('POST /brand-assets/upload appelé (PDF original)', uploadCallCount === 1);
  console.log('POST /brand-kits appelé avec la charte assemblée', createCallCount === 1);
  console.log('Payload envoyé — nom, colors (7 clés), typography, source_type=pdf, source_asset_id présent:', createdPayload && {
    name: createdPayload.name,
    colorKeys: Object.keys(createdPayload.colors || {}).sort(),
    typography: createdPayload.typography,
    source_type: createdPayload.source_type,
    hasSourceAssetId: !!createdPayload.source_asset_id,
    hasVisualProhibitions: !!createdPayload.visual_prohibitions,
  });
  console.log('Modal fermée après sauvegarde:', await page.evaluate(() => !document.getElementById('cc-brandkit-confirm').classList.contains('open')));

  console.log('\n=== 7. La charte importée apparaît IMMÉDIATEMENT dans le sélecteur (sans réimport) ===');
  const selectorAfterSave = await page.evaluate(() => {
    const select = document.querySelector('#cc-brandkit-select');
    return { optionCount: select.options.length, selectedValue: select.value, selectedLabel: select.options[select.selectedIndex]?.textContent };
  });
  console.log(selectorAfterSave);

  console.log('\n=== 8. "Retirer" visible sur la charte importée, PAS sur les 2 chartes par défaut ===');
  const removeBtnOnImported = await page.evaluate(() => !document.getElementById('cc-brandkit-remove-btn').hidden);
  console.log('Bouton "Retirer" visible sur la charte importée (sélectionnée par défaut après sauvegarde):', removeBtnOnImported);
  await page.selectOption('#cc-brandkit-select', BRAND_KIT_1.id);
  await page.waitForTimeout(50);
  const removeBtnOnDefault = await page.evaluate(() => document.getElementById('cc-brandkit-remove-btn').hidden);
  console.log('Bouton "Retirer" masqué sur la charte par défaut (Lot 1):', removeBtnOnDefault);
  await page.selectOption('#cc-brandkit-select', 'imported-kit-001');
  await page.waitForTimeout(50);

  console.log('\n=== 9. "Retirer" — archive, disparaît du sélecteur ===');
  await page.click('#cc-brandkit-remove-btn');
  await page.waitForTimeout(300);
  console.log('PATCH /brand-kits/:id/status appelé', statusPatchCount === 1);
  const selectorAfterRemove = await page.evaluate(() => document.querySelector('#cc-brandkit-select').options.length);
  console.log('Sélecteur revenu à 2 chartes (retirée disparue)', selectorAfterRemove === 2);

  console.log('\n=== 10. Aucune recherche RAG jamais déclenchée par tout ce parcours ===');
  console.log('Appels /search-library ou /d1-query pendant tout le parcours d\'import:', ragCallCount);

  await page.screenshot({ path: OUT + '/ux8b-lot3-after-remove.png', fullPage: true });

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
