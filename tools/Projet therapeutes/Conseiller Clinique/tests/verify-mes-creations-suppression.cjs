// STUDIO CLINIQUE — "Mes créations", CONSTRUCTION : petite croix de suppression directe sur chaque
// vignette, sans avoir à ouvrir le document au préalable — réutilise TELLE QUELLE la route de
// suppression déjà existante et fonctionnelle (DELETE /clinical-documents/:id, cf.
// adocWsDeleteConfirmed du bandeau de travail), jamais une seconde implémentation. Preuve réelle :
// clic sur la croix, confirmation (confirm() natif intercepté), appel DELETE réel, retrait immédiat
// de la vignette (sans réindexation des autres), persistance réelle de la suppression (un second
// chargement de la liste depuis le serveur — simulant un rechargement de page — ne la fait jamais
// réapparaître), sur les DEUX montages (accueil ET panneau latéral). Régression complète sur
// "Mes créations" (recherche/filtre/ouverture, les deux montages) et sur le bouton "Supprimer"
// déjà existant du bandeau de travail (une fois un document ouvert).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(id, title, blocks) {
  return {
    schemaVersion: 1,
    documentId: id, versionId: id + '-v1', previousVersionId: null,
    requestId: 'request-' + id, sourceSnapshotId: 'snapshot-' + id,
    createdAt: '2026-09-26T09:00:00Z', language: 'fr', status: 'draft',
    title: title, purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id: id, type: 'heading', content: { text: text, level: 2 }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ── Serveur factice AVEC ÉTAT RÉEL (un Map, jamais une liste statique) : une suppression réussie
  // retire VRAIMENT le document du "stockage" simulé, pour que le test puisse prouver qu'un second
  // chargement de la liste (= un rechargement de page réel) ne le fait jamais réapparaître. ──
  const DOC_1 = 'doc-supp-1', DOC_2 = 'doc-supp-2', DOC_3 = 'doc-supp-3';
  const store = new Map([
    [DOC_1, { document_id: DOC_1, title: 'Document Alpha', document_kind: 'fiche', created_at: '2026-09-26T09:00:00Z', thumbnail_asset_id: null }],
    [DOC_2, { document_id: DOC_2, title: 'Document Beta', document_kind: 'fiche', created_at: '2026-09-26T09:01:00Z', thumbnail_asset_id: null }],
    [DOC_3, { document_id: DOC_3, title: 'Document Gamma', document_kind: 'fiche', created_at: '2026-09-26T09:02:00Z', thumbnail_asset_id: null }],
  ]);
  let listCalls = 0;
  const deleteCalls = [];

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();

    if (url.endsWith('/clinical-documents') && req.method() === 'GET') {
      listCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: Array.from(store.values()) }) });
    }
    const delMatch = url.match(/\/clinical-documents\/([^\/]+)$/);
    if (delMatch && req.method() === 'DELETE') {
      deleteCalls.push(delMatch[1]);
      // Retire du "stockage" simulé s'il y est (les 3 créations listées) — succès inconditionnel
      // sinon (ex. le document A ouvert directement dans l'écran de travail, jamais listé ici :
      // seul le test 8, non-régression du bouton "Supprimer" existant, l'utilise).
      store.delete(delMatch[1]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    }
    if (url.endsWith('/media-assets') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: [] }) });
    }
    if (url.endsWith('/brand-kits')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [] }) });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  // ═══════════════════════════════ PANNEAU LATÉRAL (cc-ws-creations) ═══════════════════════════════
  // Document A ouvert au préalable dans l'écran de travail, pour pouvoir tester ensuite la
  // non-régression du bouton "Supprimer" déjà existant du bandeau (test 8).
  const storeKeyA = 'adocArt_test_supp_a';
  const docA = ficheDoc('doc-supp-a', 'Document A (ouvert)', [heading('a-h1', 'Titre A')]);
  await page.evaluate(({ key, doc }) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: doc.title, _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      _adocStructuredDoc: doc, _adocStructuredSnapshot: { sourceSnapshotId: 'snapshot-doc-supp-a', entries: [] }, _adocRenderManifestOverride: null,
      _adocClinicalDocumentId: 'doc-supp-a', _adocClinicalVersionId: 'doc-supp-a-v1',
    };
  }, { key: storeKeyA, doc: docA });
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKeyA);
  assert.equal(opened, true, 'le document A doit s’ouvrir normalement dans l’écran de travail');

  await page.click('#cc-ws-creations-toggle');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  assert.equal(listCalls, 1, 'GET /clinical-documents doit être appelé réellement à l’ouverture du panneau');
  assert.equal(await page.locator('#cc-ws-creations-results .cc-media-item').count(), 3, 'les 3 créations du serveur doivent être affichées');
  await page.waitForSelector('[data-creations-delete="0"]');
  console.log('PASS 1/13 — panneau latéral : une petite croix de suppression est présente sur chaque vignette');

  // ── Test 2 : la croix est discrète (jamais aussi visible que "Ouvrir") — vérifie qu’elle n’est PAS
  // dans .cc-media-actions (le conteneur des boutons pleine largeur) mais bien un élément à part,
  // positionné en absolu sur la vignette. ──
  const crossInActions = await page.locator('[data-creations-item="0"] .cc-media-actions [data-creations-delete="0"]').count();
  assert.equal(crossInActions, 0, 'la croix de suppression ne doit jamais être dans .cc-media-actions (réservé à "Ouvrir"/"Aperçu", plus visible)');
  console.log('PASS 2/13 — la croix reste discrète, hors du groupe de boutons pleine largeur');

  // ── Test 3 : annuler la confirmation → AUCUNE suppression réelle, la vignette reste affichée ──
  page.once('dialog', async (d) => {
    assert.ok(d.message().includes('Document Alpha'), 'le message de confirmation doit citer le TITRE du document concerné : ' + d.message());
    await d.dismiss();
  });
  await page.click('[data-creations-delete="0"]');
  await page.waitForTimeout(200);
  assert.equal(deleteCalls.length, 0, 'annuler la confirmation ne doit déclencher AUCUN appel DELETE réel');
  assert.equal(await page.locator('#cc-ws-creations-results .cc-media-item').count(), 3, 'la vignette doit rester affichée après annulation');
  console.log('PASS 3/13 — annuler la confirmation : aucune suppression réelle, la vignette reste affichée, message cite bien le titre');

  // ── Test 4 : confirmer → appel DELETE réel, retrait IMMÉDIAT de la vignette, SANS réindexation
  // (les data-creations-*="1"/"2" des deux autres vignettes restent valides et fonctionnels) ──
  page.once('dialog', async (d) => { await d.accept(); });
  await page.click('[data-creations-delete="0"]');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item[data-creations-item="0"]', { state: 'detached' });
  assert.deepEqual(deleteCalls, [DOC_1], 'un appel DELETE réel doit avoir eu lieu pour exactement le bon document_id');
  assert.equal(await page.locator('#cc-ws-creations-results .cc-media-item').count(), 2, 'exactement 2 vignettes doivent rester affichées (retrait ciblé, jamais un re-rendu complet)');
  // Les DEUX vignettes restantes doivent toujours fonctionner (Ouvrir/Aperçu) SANS avoir été
  // ré-indexées : leurs attributs data-creations-*="1"/"2" pointent toujours vers le bon document.
  assert.ok(await page.locator('[data-creations-open="1"]').isVisible(), 'la vignette d’index 1 doit rester intacte et fonctionnelle après la suppression de l’index 0');
  assert.ok(await page.locator('[data-creations-open="2"]').isVisible(), 'la vignette d’index 2 doit rester intacte et fonctionnelle après la suppression de l’index 0');
  console.log('PASS 4/13 — confirmer : appel DELETE réel, retrait immédiat et ciblé, aucune réindexation ne casse les autres vignettes');

  // ── Test 5 : persistance réelle — un second chargement de la liste (simulant un rechargement de
  // page réel) ne fait JAMAIS réapparaître le document supprimé (il a réellement disparu du
  // "stockage" simulé, pas seulement de l’écran) ──
  const freshList = await page.evaluate(async () => {
    const r = await fetch('https://clone-proxy.11drumboy11.workers.dev/clinical-documents', { headers: { 'X-API-Key': localStorage.getItem('workerApiKey') || '' } });
    return (await r.json()).documents.map((d) => d.document_id);
  });
  assert.ok(!freshList.includes(DOC_1), 'un rechargement complet de la liste ne doit JAMAIS faire réapparaître le document réellement supprimé côté serveur : ' + JSON.stringify(freshList));
  console.log('PASS 5/13 — persistance réelle confirmée : le document supprimé a bien disparu côté serveur, un rechargement ne le ressuscite jamais');

  // ── Test 6 : re-filtrer (titre) après la suppression → le document supprimé ne réapparaît JAMAIS
  // même après une reconstruction complète de la grille filtrée (state.all a bien été purgé, pas
  // seulement l’affichage) ──
  await page.fill('#cc-ws-creations-filter-title', '');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  const titlesAfterRefilter = await page.locator('#cc-ws-creations-results .cc-media-credit').allTextContents();
  assert.ok(!titlesAfterRefilter.some((t) => t.includes('Document Alpha')), 'le document supprimé ne doit JAMAIS réapparaître après un re-filtrage (state.all doit être purgé, pas seulement l’affichage courant) : ' + JSON.stringify(titlesAfterRefilter));
  assert.equal(await page.locator('#cc-ws-creations-results .cc-media-item').count(), 2, 'exactement 2 créations doivent rester après re-filtrage');
  console.log('PASS 6/13 — non-résurrection après re-filtrage : state.all a bien été purgé du document supprimé, jamais seulement l’affichage courant');

  // ── Test 7 : non-régression — recherche/filtre par type toujours opérationnels sur ce panneau ──
  await page.selectOption('#cc-ws-creations-filter-kind', 'carrousel');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-empty');
  await page.selectOption('#cc-ws-creations-filter-kind', 'fiche');
  await page.waitForSelector('#cc-ws-creations-results .cc-media-item');
  console.log('PASS 7/13 — non-régression : le filtre par type reste pleinement fonctionnel après une suppression');

  // ── Test 8 : non-régression — le bouton "Supprimer" déjà existant du bandeau de travail (une fois
  // un document ouvert) continue de fonctionner à l’identique (écran de confirmation dédié, jamais
  // le confirm() natif de "Mes créations" — deux mécanismes distincts, jamais mélangés) ──
  await page.click('#cc-ws-delete-btn');
  await page.waitForSelector('#cc-ws-delete-confirm.open');
  await page.click('.cc-ws-delete-confirm-confirm');
  await page.waitForFunction(() => {
    const st = window._adocWsState;
    const art = window._adocArtifacts[st.storeKey];
    return art._adocClinicalDocumentId === null;
  });
  console.log('PASS 8/13 — non-régression : le bouton "Supprimer" déjà existant du bandeau de travail fonctionne à l’identique (écran de confirmation dédié, mécanisme distinct)');

  // ═══════════════════════════════ ÉCRAN D'ACCUEIL (cc-home-creations) ═══════════════════════════════
  await page.evaluate(() => { if (window.adocCloseWorkspace) window.adocCloseWorkspace(); });
  await page.click('#cc-home-creations-toggle');
  await page.waitForSelector('#cc-home-creations-results .cc-media-item');
  assert.equal(await page.locator('#cc-home-creations-results .cc-media-item').count(), 2, 'les 2 créations restantes doivent être affichées depuis l’accueil');
  const previewOnHome = await page.locator('#cc-home-creations-results [data-creations-preview]').count();
  assert.equal(previewOnHome, 0, 'non-régression : "Aperçu" reste absent depuis l’accueil (réservé au panneau latéral)');
  await page.waitForSelector('#cc-home-creations-results [data-creations-delete="0"]');
  console.log('PASS 9/13 — accueil : la croix de suppression est aussi présente ici (fonctionne identiquement sur les deux montages)');

  page.once('dialog', async (d) => {
    assert.ok(d.message().includes('Document Beta') || d.message().includes('Document Gamma'), 'le message de confirmation (accueil) doit citer le titre du document : ' + d.message());
    await d.accept();
  });
  const deleteCallsBefore = deleteCalls.length;
  await page.click('#cc-home-creations-results [data-creations-delete="0"]');
  await page.waitForFunction(() => document.querySelectorAll('#cc-home-creations-results .cc-media-item').length === 1);
  assert.equal(deleteCalls.length, deleteCallsBefore + 1, 'un appel DELETE réel doit avoir eu lieu depuis l’accueil aussi');
  console.log('PASS 10/13 — accueil : confirmer déclenche un appel DELETE réel et un retrait immédiat, identique au panneau latéral');

  // ── Test 11 : non-régression — "Ouvrir" reste fonctionnel sur la dernière création restante,
  // depuis l’accueil (index 1 — jamais réindexé à 0, cf. retrait ciblé sans réindexation) ──
  await page.click('#cc-home-creations-results [data-creations-open="1"]');
  await page.waitForFunction(() => document.getElementById('cc-ws-title') && document.getElementById('cc-ws-title').textContent.length > 0);
  console.log('PASS 11/13 — non-régression : "Ouvrir" depuis l’accueil reste pleinement fonctionnel après ces suppressions');

  // ── Test 12 : filtre par titre (sans correspondance) toujours opérationnel sur l’accueil ──
  await page.evaluate(() => window.adocCloseWorkspace && window.adocCloseWorkspace());
  await page.fill('#cc-home-creations-filter-title', 'zzz-inexistant');
  await page.waitForSelector('#cc-home-creations-results .cc-media-empty');
  await page.fill('#cc-home-creations-filter-title', '');
  await page.waitForSelector('#cc-home-creations-results .cc-media-item');
  console.log('PASS 12/13 — non-régression : le filtre par titre reste pleinement fonctionnel sur l’accueil');

  // ── Test 13 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir sur l’ensemble du scénario : ' + JSON.stringify(pageErrors));
  console.log('PASS 13/13 — zéro erreur JS sur l’ensemble du scénario');

  console.log('');
  console.log('=== TOUS LES TESTS SUPPRESSION "MES CRÉATIONS" (13/13) PASSENT ===');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
