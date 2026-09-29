// STUDIO CLINIQUE — "Mes créations" sur la page d'accueil (#cc-landing), preuve réelle de bout en
// bout : même mécanisme déjà construit et vérifié dans le panneau latéral de l'écran de travail
// (GET /clinical-documents, adocOpenSavedClinicalDocument, grille de vignettes réelles) — RÉUTILISÉ
// tel quel depuis l'accueil, jamais une seconde implémentation (les 4 fonctions adocCreations*
// ont été généricisées par un `mountId` pour ce lot, cf. studio-clinique-core.js). Vérifie la
// MÊME fidélité de réouverture que le lot précédent (titre/badge/charte/contenu/capacités), ET la
// non-régression du panneau latéral existant ET du champ de description/génération normal de
// l'accueil (non touché par ce lot, mais son DOM voisin l'a été — preuve qu'il fonctionne encore).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1,
    documentId: 'doc-accueil-001', versionId: 'doc-accueil-001-v1', previousVersionId: null,
    requestId: 'request-accueil-001', sourceSnapshotId: 'snapshot-accueil-001',
    createdAt: '2026-09-25T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Titre Créé Depuis Accueil', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }
function para(id, text) { return { id: id, type: 'paragraph', content: { text: text }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { await d.accept(); });

  let listCalls = 0, getDocCalls = 0, brandKitCalls = 0;
  const DOCUMENT_ID = 'doc-accueil-server-1';
  const VERSION_ID = 'v1-accueil';
  const BRAND_KIT_ID = 'bk-accueil-test';

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'GET') {
      listCalls++;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ documents: [{ document_id: DOCUMENT_ID, title: 'Titre Créé Depuis Accueil', document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z', thumbnail_asset_id: 'thumb-accueil-1' }] }),
      });
    }
    if (url.endsWith('/clinical-documents/' + DOCUMENT_ID) && req.method() === 'GET') {
      getDocCalls++;
      const doc = ficheDoc([heading('blk-a', 'Titre'), para('blk-b', 'Paragraphe créé depuis accueil.')]);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          document_id: DOCUMENT_ID, title: 'Titre Créé Depuis Accueil', document_kind: 'fiche', created_at: '2026-09-25T09:05:00Z',
          current_version_id: VERSION_ID, generation_engine: 'structured',
          version: {
            version_id: VERSION_ID, previous_version_id: null, schema_version: 1, created_at: '2026-09-25T09:05:00Z', change_summary: null, generation_engine: 'structured',
            document: { schemaVersion: 1, clinicalDocument: doc, sourceSnapshot: { sourceSnapshotId: 'snapshot-accueil-001', entries: [] }, renderManifestOverride: { id: 'manifest-brandkit-y', schemaVersion: 1, rendererVersion: '1.0.0', templateRef: { id: 'fiche-editoriale', version: 1 }, brandKitRef: { id: BRAND_KIT_ID, version: 1 }, tokensSnapshotId: 'toksnap-2', assetsSnapshotId: null, createdAt: '2026-09-25T09:00:00Z', manifestChecksum: 'sha256:' + '1'.repeat(64) } },
          },
        }),
      });
    }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_ID) && req.method() === 'GET') {
      brandKitCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: BRAND_KIT_ID, name: 'Charte Test Accueil', version: 1 }) });
    }
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    if (url.includes('/brand-assets/')) {
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('FAKE_JPEG_THUMBNAIL_BYTES') });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ── Test 1 : l'accueil s'affiche normalement, l'écran de travail est fermé ──
  assert.equal(await page.isVisible('#cc-landing'), true, "l'écran d'accueil doit être visible au chargement");
  assert.equal(await page.evaluate(() => document.getElementById('cc-workspace').classList.contains('open')), false, "l'écran de travail ne doit pas être ouvert au chargement");
  console.log('PASS 1/9 — accueil affiché normalement, écran de travail fermé');

  // ── Test 2 : "Mes créations" sur l'accueil se déplie et charge réellement la liste (même
  // route GET /clinical-documents que le panneau latéral, aucune nouvelle logique) ──
  await page.click('#cc-home-creations-toggle');
  await page.waitForSelector('#cc-home-creations-results .cc-media-item');
  assert.equal(listCalls, 1, 'GET /clinical-documents doit être appelé réellement depuis l’accueil');
  const thumbSrc = await page.locator('#cc-home-creations-results .cc-media-thumb').first().getAttribute('src');
  assert.ok(thumbSrc && thumbSrc.includes('thumb-accueil-1'), 'la vraie miniature doit être affichée depuis l’accueil, comme dans le panneau latéral');
  console.log('PASS 2/9 — "Mes créations" sur l’accueil charge et affiche réellement la liste avec sa vraie miniature');

  // ── Test 3 : filtre par titre fonctionnel sur l’accueil (même mécanisme générique) ──
  await page.fill('#cc-home-creations-filter-title', 'zzz-inexistant');
  await page.waitForSelector('#cc-home-creations-results .cc-media-empty');
  await page.fill('#cc-home-creations-filter-title', '');
  await page.waitForSelector('#cc-home-creations-results .cc-media-item');
  console.log('PASS 3/9 — filtre par titre fonctionnel depuis l’accueil');

  // ── Test 4 : clic "Ouvrir" depuis l’ACCUEIL → réouverture réelle dans l’écran de travail,
  // MÊME fidélité que depuis le panneau latéral (titre, badge, charte réelle, contenu, capacités) ──
  await page.click('#cc-home-creations-results [data-creations-open="0"]');
  await page.waitForFunction(() => document.getElementById('cc-ws-title').textContent === 'Titre Créé Depuis Accueil');
  assert.equal(getDocCalls, 1, 'la réouverture depuis l’accueil doit appeler réellement GET /clinical-documents/:id');
  assert.equal(await page.evaluate(() => document.getElementById('cc-workspace').classList.contains('open')), true, 'l’écran de travail doit être réellement ouvert');
  const badgeText = await page.locator('#cc-ws-badge').textContent();
  assert.equal(badgeText, 'FICHE SYNTHÈSE', 'le badge doit refléter le documentKind réel');
  await page.waitForFunction(() => (document.getElementById('cc-ws-brandkit') || {}).textContent === 'Charte Test Accueil');
  assert.equal(brandKitCalls, 1, 'la charte réelle doit être résolue via GET /brand-kits/:id, comme depuis le panneau latéral');
  const bodyText = await page.locator('#cc-ws-doc-card').textContent();
  assert.ok(bodyText.includes('Paragraphe créé depuis accueil.'), 'le contenu réel doit être fidèlement affiché');
  const caps = await page.evaluate(() => {
    const st = window._adocWsState;
    const art = window._adocArtifacts[st.storeKey];
    return { blockEditing: art._adocCapabilities.blockEditing, docId: art._adocClinicalDocumentId };
  });
  assert.equal(caps.blockEditing, true, 'les capacités de bloc doivent être restaurées, exactement comme depuis le panneau latéral');
  assert.equal(caps.docId, DOCUMENT_ID, '_adocClinicalDocumentId doit être restauré (même adaptateur adocOpenSavedClinicalDocument)');
  console.log('PASS 4/9 — ouverture depuis l’ACCUEIL : même fidélité exacte (titre, badge, charte réelle, contenu, capacités) que depuis le panneau latéral');

  // ── Test 5 : non-régression — le panneau "Mes créations" du panneau LATÉRAL (dans l’écran de
  // travail désormais ouvert) fonctionne toujours, avec son PROPRE état indépendant (mountId
  // distinct) — sans jamais interférer avec celui de l’accueil resté ouvert en arrière-plan. ──
  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  assert.equal(listCalls, 2, 'le panneau latéral doit appeler GET /clinical-documents lui-même (état indépendant, jamais partagé avec celui de l’accueil)');
  const sidebarThumbSrc = await page.locator('#cc-ws-creations-results .cc-media-thumb').first().getAttribute('src');
  assert.ok(sidebarThumbSrc && sidebarThumbSrc.includes('thumb-accueil-1'), 'le panneau latéral affiche la même vraie miniature');
  console.log('PASS 5/9 — non-régression : le panneau "Mes créations" du panneau latéral reste pleinement fonctionnel, état indépendant de celui de l’accueil');

  // ── Test 6 : régression du panneau Médias de la barre latérale — DOIT être vérifié PENDANT que
  // l’écran de travail est encore ouvert (ses éléments ne sont visibles/cliquables que dans cet
  // état, cf. #cc-workspace.open) ──
  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');
  await page.waitForFunction(() => document.getElementById('cc-ws-media-history').textContent.includes('Aucune image'));
  console.log('PASS 6/9 — non-régression : le panneau Médias de la barre latérale reste pleinement fonctionnel');

  // ── Test 7 : fermer l’écran de travail → retour réel à l’accueil, dont le panneau "Mes
  // créations" garde son état déjà chargé (jamais un rechargement réseau inutile) ──
  await page.evaluate(() => window.adocCloseWorkspace());
  assert.equal(await page.evaluate(() => document.getElementById('cc-workspace').classList.contains('open')), false, 'l’écran de travail doit se fermer réellement');
  assert.equal(await page.isVisible('#cc-landing'), true, 'l’accueil doit redevenir visible');
  assert.equal(await page.isVisible('#cc-home-creations-results .cc-media-item'), true, 'la grille "Mes créations" de l’accueil reste affichée après fermeture de l’écran de travail');
  console.log('PASS 7/9 — retour réel à l’accueil après fermeture de l’écran de travail, état de "Mes créations" préservé');

  // ── Test 8 : non-régression — le champ de description/génération normal de l’accueil continue
  // de fonctionner (le DOM voisin a changé avec ce lot, jamais le formulaire lui-même) ──
  let capturedStartDetail = null;
  await page.exposeFunction('__reportStartDetail', (detail) => { capturedStartDetail = detail; });
  await page.evaluate(() => {
    window.addEventListener('conseiller-clinique:start', (e) => window.__reportStartDetail(e.detail));
  });
  await page.fill('#clinical-question', 'Question clinique de test de non-régression.');
  await page.click('#format-carousel');
  assert.equal(await page.getAttribute('#format-carousel', 'aria-pressed'), 'true', 'un type de document doit toujours être sélectionnable (aria-pressed)');
  await page.click('#clinical-home-form .submit-button');
  await page.waitForFunction(() => document.getElementById('form-status').textContent === 'Demande envoyée.');
  assert.ok(capturedStartDetail && capturedStartDetail.prompt === 'Question clinique de test de non-régression.', 'le formulaire doit toujours émettre conseiller-clinique:start avec la question saisie');
  assert.equal(capturedStartDetail.format, 'carrousel', 'le type de document choisi doit toujours voyager dans le détail de l’événement');
  console.log('PASS 8/9 — non-régression : le champ de description/génération normal de l’accueil fonctionne toujours (formulaire, type de document, événement de départ)');

  // ── Test 9 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 9/9 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS "MES CRÉATIONS" SUR L’ACCUEIL (9/9) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
