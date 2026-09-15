// Item 61 — charte persistante après génération pour le moteur STRUCTURÉ (parité avec
// l'ancien moteur, item 61 côté legacy déjà existant : adocOpenLegacyReThemePanel, inchangé).
// Décisions actées de Christophe (non rediscutées) : (A) même bouton "Charte" / même apparence,
// flux interne différent selon le moteur ; (2) restreint aux chartes internes/auditées
// (adocIsDefaultBrandKitId), jamais une charte importée — neutralise le risque de contraste non
// audité identifié par l'investigation (QC hardcodé UX-8B). Contrainte D1 en vigueur au moment de
// ce lot (cf. gouvernance Partie 4 étape 0bis) : toutes les routes Worker sont mockées ici, aucun
// appel réseau réel — ce lot n'est donc PAS définitivement clos tant qu'un vrai passage humain
// (régression #7) n'a pas eu lieu après restauration du quota.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const BRAND_KIT_DEFAULT_1 = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Charte par défaut', version: 1,
  colors: { primary: '#102f31', accent: '#9b4e36', background: '#f6f2ea', text: '#273331', warning: '#9b4e36' },
  typography: { headingFont: '"Source Serif 4", Georgia, serif', bodyFont: '"IBM Plex Sans", sans-serif' },
};
const BRAND_KIT_DEFAULT_2 = {
  id: '00000000-0000-4000-8000-000000000002', name: 'Charte alternative maison', version: 1,
  colors: { primary: '#3a1f5a', accent: '#c97a2b', background: '#eef1f5', text: '#1b1b2e', warning: '#c0392b' },
  typography: { headingFont: '"Merriweather", serif', bodyFont: '"Inter", sans-serif' },
};
const BRAND_KIT_IMPORTED = {
  id: 'bk-imported-001', name: 'Charte importée (PDF client)', version: 1,
  colors: { primary: '#ff00aa', accent: '#00ffaa', background: '#ffffff', text: '#000000', warning: '#ff0000' },
  typography: { headingFont: '"Comic Sans MS"', bodyFont: '"Comic Sans MS"' },
};

async function setupPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  let versionCallCount = 0, createCallCount = 0;
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('library-stats')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) }); return; }
    if (url.endsWith('/brand-kits') && method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_kits: [BRAND_KIT_DEFAULT_1, BRAND_KIT_DEFAULT_2, BRAND_KIT_IMPORTED] }) });
      return;
    }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_DEFAULT_2.id)) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BRAND_KIT_DEFAULT_2) }); return; }
    if (url.endsWith('/brand-kits/' + BRAND_KIT_IMPORTED.id)) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BRAND_KIT_IMPORTED) }); return; }
    if (url.endsWith('/clinical-documents') && method === 'POST') {
      createCallCount++;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1', created_at: new Date().toISOString() }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions') && method === 'POST') {
      versionCallCount++;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v' + (versionCallCount + 1), created_at: new Date().toISOString() }) });
      return;
    }
    // Même mock que verify-legacy-retheme.js (cas 5) — appel direct à adocGenerateStructuredFiche
    // avec workerUrl='https://clone-proxy.11drumboy11.workers.dev', jamais le pipeline complet
    // (inutile ici : ce lot ne teste pas la génération elle-même, déjà couverte ailleurs).
    if (url.includes('clone-proxy') || url.includes('workers.dev')) {
      const inputJson = JSON.stringify({ title: 'Fiche de test item 61', purpose: 'supervision', audience: 'clinicien', blocks: [{ type: 'paragraph', text: 'Contenu de test.', level: 2, visualRole: 'info', items: [], ordered: false, headers: [], rows: [], imageQuery: '', imageAlt: '', citationEntryIds: [] }] });
      const events = [
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'emit_fiche_document', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ];
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n' });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);
  return { page, errors, getVersionCallCount: () => versionCallCount, getCreateCallCount: () => createCallCount };
}

// Génère un VRAI document structuré via le pipeline canonique (mêmes fonctions que
// adocHandleReply, jamais reconstruites à la main) — même patron que verify-legacy-retheme.js
// (cas 5) pour son document structuré de contrôle.
async function generateStructuredDoc(page) {
  const storeKey = await page.evaluate(async () => {
    // #cc-landing masque #adoc-messages tant que l'écran de conversation n'a jamais été ouvert
    // (openAssistDoc ajoute .active à #assistdoc-screen) — sans cet appel, la carte artefact
    // existe bien dans le DOM mais reste invisible (élément non cliquable pour Playwright).
    window.openAssistDoc();
    document.getElementById('cc-landing').style.display = 'none';
    const ragResult = { chunks: [{ content: 'x', book_title: 'Y', author: 'Z', page_number: 1 }], chunkLen: 900 };
    const structured = await window.adocGenerateStructuredFiche('test', { intent: 'fiche' }, ragResult, 'sys', 'https://clone-proxy.11drumboy11.workers.dev');
    const rendered = await window.adocRenderClinicalDocument(structured.doc, structured.sourceSnapshot);
    const storeKey = await window.adocDeliverStructuredFicheArtifact(structured.doc, structured.sourceSnapshot, rendered, null);
    window._adocArtifacts[storeKey]._adocRenderManifestOverride = rendered.renderManifest || null;
    return storeKey;
  });
  // adocRevealRethemeButtonIfEligible est déclenché via setTimeout(0) par adocShowArtifactCard
  // (cf. commentaire du code source) — laisser la pile synchrone se vider avant tout clic.
  await page.waitForTimeout(150);
  return storeKey;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const log = (label, ok) => results.push([label, ok]);

  // ══════════════════════════════════════════════════════════════════════
  // 1. Bouton "Charte" visible pour un document structuré généré directement (sans repli)
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    const engine = await page.evaluate((sk) => window._adocArtifacts[sk]._adocGenerationEngine, storeKey);
    log('0. Pré-condition — vrai document structuré, généré directement (aucun repli)', engine === 'structured');
    await page.waitForTimeout(150);
    const btnVisible = await page.evaluate((sk) => !document.getElementById('retheme-btn-' + sk).hidden, storeKey);
    log('1a. Le bouton "Charte" est désormais VISIBLE pour un document structuré (item 61)', btnVisible);
    log('1b. Aucune erreur JS à la génération', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2-3. Clic → flux STRUCTURÉ (pas legacy) → liste restreinte aux chartes internes/auditées
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    const pickerVisible = await page.evaluate(() => document.getElementById('cc-legacy-retheme-modal').classList.contains('open'));
    log('2a. Le sélecteur de charte s\'ouvre au clic (même conteneur visuel — Option A)', pickerVisible);
    // Preuve que c'est bien le flux STRUCTURÉ (jamais adocOpenLegacyReThemePanel) : le sélecteur
    // de police (LOT 11, exclusivement legacy) est absent de ce panneau.
    const hasLegacyFontSelect = await page.evaluate(() => !!document.getElementById('cc-legacy-retheme-font-select'));
    log('2b. Le sélecteur de police (mécanisme legacy LOT 11) est ABSENT — flux structuré distinct, jamais routé via adocOpenLegacyReThemePanel', !hasLegacyFontSelect);
    const kitLabels = await page.$$eval('#cc-legacy-retheme-body .cc-clarity-reply-btn', els => els.map(e => e.textContent));
    log('3a. Les 2 chartes internes/auditées sont proposées', kitLabels.includes('Charte par défaut') && kitLabels.includes('Charte alternative maison'));
    log('3b. Décision 2 de Christophe — la charte IMPORTÉE est EXCLUE de cette liste', !kitLabels.includes('Charte importée (PDF client)'));
    log('3c. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4-5. Aperçu RÉEL (jamais un blob iframe) — rien ne change avant confirmation
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    const overrideBeforeClick = await page.evaluate((sk) => window._adocArtifacts[sk]._adocRenderManifestOverride, storeKey);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte alternative maison")');
    await page.waitForTimeout(300);
    const hasIframe = await page.evaluate(() => !!document.querySelector('#cc-legacy-retheme-body iframe'));
    log('4a. Aucun iframe blob dans l\'aperçu (le moteur structuré n\'en a pas — cf. investigation)', !hasIframe);
    const previewHeadingColor = await page.evaluate(() => {
      const html = document.getElementById('cc-legacy-retheme-body').innerHTML;
      return /--adoc-sc-heading-color\s*:\s*#3a1f5a/i.test(html);
    });
    log('4b. Un VRAI rendu (adocRenderClinicalDocument) est affiché — jetons de la nouvelle charte présents (--adoc-sc-heading-color:#3a1f5a)', previewHeadingColor);
    const overrideAfterPreview = await page.evaluate((sk) => window._adocArtifacts[sk]._adocRenderManifestOverride, storeKey);
    log('5a. L\'override réel du document N\'EST PAS modifié tant que "Confirmer" n\'a pas été cliqué', JSON.stringify(overrideAfterPreview) === JSON.stringify(overrideBeforeClick));
    log('5b. Boutons Confirmer et Annuler tous deux présents', await page.evaluate(() => !!document.querySelector('#cc-legacy-retheme-body button[onclick*="adocConfirmStructuredRetheme"]') && !!document.querySelector('#cc-legacy-retheme-body button[onclick*="adocCloseStructuredReThemePanel"]')));
    log('5c. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6-7. Confirmation — override appliqué, ré-ouverture réellement re-rendue, 1re sauvegarde = création
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, getCreateCallCount, getVersionCallCount } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte alternative maison")');
    await page.waitForTimeout(300);
    await page.click('#cc-legacy-retheme-body button[onclick*="adocConfirmStructuredRetheme"]');
    await page.waitForTimeout(500);
    const brandKitRef = await page.evaluate((sk) => window._adocArtifacts[sk]._adocRenderManifestOverride?.brandKitRef?.id, storeKey);
    log('6a. art._adocRenderManifestOverride pointe désormais vers la charte confirmée', brandKitRef === BRAND_KIT_DEFAULT_2.id);
    const brandKitName = await page.evaluate((sk) => window._adocArtifacts[sk]._adocBrandKitName, storeKey);
    log('6b. art._adocBrandKitName reflète la charte confirmée', brandKitName === 'Charte alternative maison');
    const wsOpen = await page.evaluate(() => document.getElementById('cc-workspace').classList.contains('open'));
    log('6c. L\'espace de travail s\'ouvre automatiquement (réutilise adocOpenWorkspace, ré-rendu réel)', wsOpen);
    const wsHeadingColor = await page.evaluate(() => /--adoc-sc-heading-color\s*:\s*#3a1f5a/i.test(document.getElementById('cc-ws-doc-card').innerHTML));
    log('6d. Le document affiché dans l\'espace de travail porte bien la nouvelle charte', wsHeadingColor);
    log('7a. Sauvegarde déclenchée automatiquement (adocWsSave réutilisé) — 1re fois = création (POST /clinical-documents)', getCreateCallCount() === 1 && getVersionCallCount() === 0);
    log('7b. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. Deuxième changement de charte sur un document DÉJÀ sauvegardé — nouvelle VERSION, jamais une nouvelle création
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, getCreateCallCount, getVersionCallCount } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte alternative maison")');
    await page.waitForTimeout(300);
    await page.click('#cc-legacy-retheme-body button[onclick*="adocConfirmStructuredRetheme"]');
    await page.waitForTimeout(500);
    log('8a. Pré-condition — 1re sauvegarde bien passée par création', getCreateCallCount() === 1);
    // L'espace de travail s'est ouvert automatiquement après la 1re confirmation (adocOpenWorkspace) —
    // un vrai geste utilisatrice le refermerait avant de rouvrir le sélecteur de charte depuis la carte.
    await page.click('#cc-ws-close-btn');
    await page.waitForTimeout(200);
    // Deuxième aller-retour : rechange de charte pour la charte par défaut (retour en arrière).
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte par défaut")');
    await page.waitForTimeout(300);
    await page.click('#cc-legacy-retheme-body button[onclick*="adocConfirmStructuredRetheme"]');
    await page.waitForTimeout(500);
    log('8b. Le 2e changement de charte crée une NOUVELLE VERSION (POST .../versions), jamais un 2e POST /clinical-documents', getCreateCallCount() === 1 && getVersionCallCount() === 1);
    const clinicalDocId = await page.evaluate((sk) => window._adocArtifacts[sk]._adocClinicalDocumentId, storeKey);
    log('8c. Le même document (même _adocClinicalDocumentId) est conservé entre les deux sauvegardes', clinicalDocId === 'doc-1');
    log('8d. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 9. Annuler avant confirmation — rien ne change, aucune sauvegarde
  // ══════════════════════════════════════════════════════════════════════
  {
    const { page, errors, getCreateCallCount, getVersionCallCount } = await setupPage(browser);
    const storeKey = await generateStructuredDoc(page);
    const overrideBefore = await page.evaluate((sk) => window._adocArtifacts[sk]._adocRenderManifestOverride, storeKey);
    await page.click('#retheme-btn-' + storeKey);
    await page.waitForTimeout(200);
    await page.click('#cc-legacy-retheme-body .cc-clarity-reply-btn:has-text("Charte alternative maison")');
    await page.waitForTimeout(300);
    await page.click('#cc-legacy-retheme-body button[onclick*="adocCloseStructuredReThemePanel"]');
    await page.waitForTimeout(200);
    const overrideAfter = await page.evaluate((sk) => window._adocArtifacts[sk]._adocRenderManifestOverride, storeKey);
    log('9a. Annuler avant confirmation — override strictement inchangé', JSON.stringify(overrideAfter) === JSON.stringify(overrideBefore));
    log('9b. Le sélecteur se ferme après Annuler', await page.evaluate(() => !document.getElementById('cc-legacy-retheme-modal').classList.contains('open')));
    log('9c. Aucune sauvegarde déclenchée par une annulation', getCreateCallCount() === 0 && getVersionCallCount() === 0);
    log('9d. Aucune erreur JS', errors.length === 0);
    await page.close();
  }

  // Parité 0F (côté legacy) — couverte par verify-legacy-retheme.js (cas 5, mis à jour pour ce
  // lot : bouton désormais visible pour un document structuré, flux LEGACY strictement inchangé
  // pour un document legacy testé côté à côté) — jamais réinventée ici (régression #6, ne pas
  // dupliquer un test déjà existant pour ce cas précis ; adocShowArtifactCard n'est d'ailleurs
  // pas exposée sur window, seul le pipeline complet peut produire une carte réelle).

  console.log('=== Résultats — Item 61 : charte persistante post-génération (moteur structuré) ===');
  results.forEach(([label, ok]) => console.log((ok ? 'OK  ' : 'FAIL ') + label));
  const failCount = results.filter(([, ok]) => !ok).length;
  console.log('\nTotal:', results.length, '- failCount:', failCount);
  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
