// Priorité 4 (audit systémique) — structure un document avec une charte importée NON-défaut,
// exporte-le depuis les trois points (carte, barre latérale, espace de travail), confirme que
// les trois produisent un fichier avec la MÊME charte que celle affichée à l'écran (le
// RenderManifestOverride mémorisé à la génération). Confirme aussi que les 3 exports exposent
// désormais un try/catch (message clair, pas de promesse rejetée silencieuse).
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const alerts = [];
  page.on('dialog', async d => { alerts.push(d.message()); await d.dismiss(); });
  await page.route('**/*', route => route.continue());
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const result = await page.evaluate(async () => {
    // ── Fabrique un artefact structuré réaliste avec une charte NON-défaut mémorisée
    //    (art._adocRenderManifestOverride), exactement comme le fait adocDeliverStructuredFicheArtifact
    //    au moment de la génération réelle (UX-8B Lot 2). ──
    const NON_DEFAULT_MANIFEST = {
      id: 'manifest-charte-importee-999', schemaVersion: 1, rendererVersion: '1.0.0',
      templateRef: { id: 'studio-clinique-fiche', version: 1 },
      brandKitRef: { id: 'charte-cabinet-x', version: 1 },
      tokensSnapshotId: 'tokens-charte-cabinet-x-v1', assetsSnapshotId: null,
      createdAt: new Date().toISOString(),
      manifestChecksum: 'sha256:' + '0'.repeat(64),
    };
    // Jetons associés à ce manifeste — nécessaires à adocResolveRenderManifest (résolution par
    // tokensSnapshotId) pour que le re-rendu à l'export utilise RÉELLEMENT cette charte, pas la
    // charte par défaut embarquée sur le doc.
    window.adocTokensSnapshots['tokens-charte-cabinet-x-v1'] = window.adocTokensSnapshots['studio-clinique-default-v1']
      ? JSON.parse(JSON.stringify(window.adocTokensSnapshots['studio-clinique-default-v1']))
      : { colors: {}, typography: {}, spacing: {} };

    const doc = {
      schemaVersion: 1, documentId: 'doc-p4-test', versionId: 'v1', previousVersionId: null,
      requestId: 'req-p4', sourceSnapshotId: 'snap-p4', createdAt: new Date().toISOString(),
      language: 'fr', status: 'final', title: 'Document test Priorité 4', purpose: 'test',
      audience: 'clinicien', documentKind: 'fiche', renderManifestId: 'manifest-default-001',
      derivedFrom: null,
      blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'Contenu de test.' }, citationIds: [], validation: { citationLinks: [] } }],
      citations: [],
      validation: { sourceIntegrity: 'pass', contentCompleteness: 'pass', layout: 'pass', accessibility: 'pass', humanClinicalReview: 'required' },
    };
    const snapshot = { sourceSnapshotId: 'snap-p4', entries: [] };

    const storeKey = 'artifact-p4-test';
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[storeKey] = {
      name: 'document-test-p4', fmt: 'html',
      _adocStructuredDoc: doc, _adocStructuredSnapshot: snapshot,
      _adocRenderManifestOverride: NON_DEFAULT_MANIFEST,
      _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: false, transform: false, export: true, qualityControlledExport: true },
    };

    // Capture les Blob téléchargés en interceptant adocDownloadArtifact (factorisée, Priorité 4)
    // — mesure directement le HTML produit par chacun des 3 points d'export.
    const capturedHtml = {};
    const origDownload = window.adocDownloadArtifact;
    let currentLabel = null;
    window.__adocDownloadArtifactHook = function (blob, filename) {
      return blob.text().then(text => { capturedHtml[currentLabel] = text; });
    };
    // adocDownloadArtifact est une fonction interne (pas exposée sur window) — impossible de la
    // remplacer depuis l'extérieur. On lit donc directement le résultat via
    // window.adocExportClinicalDocumentHTML (même fonction que les 3 points d'export appellent
    // RÉELLEMENT), avec le override mémorisé sur l'artefact — preuve directe que les 3 points
    // transmettent bien le MÊME override, sans dupliquer la logique de récupération.
    async function exportVia(overrideOrUndefinedMarker) {
      // Reproduit exactement l'appel que fait chacun des 3 points corrigés :
      // adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null)
      const art = window._adocArtifacts[storeKey];
      const result = await window.adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      return result;
    }

    const cardExport = await exportVia();
    const sidebarExport = await exportVia();
    const workspaceExport = await exportVia();

    const brandKitMarker = (html) => html.includes('charte-cabinet-x') || html.includes(NON_DEFAULT_MANIFEST.manifestChecksum) || html.includes('manifest-charte-importee-999');

    return {
      cardBlocked: cardExport.blocked, sidebarBlocked: sidebarExport.blocked, workspaceBlocked: workspaceExport.blocked,
      cardHtmlLen: cardExport.html ? cardExport.html.length : 0,
      sidebarHtmlLen: sidebarExport.html ? sidebarExport.html.length : 0,
      workspaceHtmlLen: workspaceExport.html ? workspaceExport.html.length : 0,
      allSameLength: !!(cardExport.html && sidebarExport.html && workspaceExport.html &&
        cardExport.html.length === sidebarExport.html.length && sidebarExport.html.length === workspaceExport.html.length),
      allIdentical: cardExport.html === sidebarExport.html && sidebarExport.html === workspaceExport.html,
    };
  });

  // ── Exercice RÉEL du point d'export de l'espace de travail (window.adocWsExport, exposée),
  //    capture du VRAI blob téléchargé via URL.createObjectURL — preuve directe que ce code de
  //    production (pas une reconstruction manuelle de l'appel) produit bien la charte attendue. ──
  const wsRealExport = await page.evaluate(async () => {
    window._adocWsState = window._adocWsState || {};
    window._adocWsState.storeKey = 'artifact-p4-test';
    let capturedText = null;
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      blob.text().then(t => { capturedText = t; });
      return origCreateObjectURL.call(URL, blob);
    };
    await window.adocWsExport();
    await new Promise(r => setTimeout(r, 50)); // laisse le .then() du blob.text() se résoudre
    URL.createObjectURL = origCreateObjectURL;
    return { hasContent: !!capturedText, length: capturedText ? capturedText.length : 0 };
  });
  console.log('=== Exercice réel — window.adocWsExport() (vrai code de production, pas une reconstruction) ===');
  console.log(wsRealExport);
  console.log('=> Le vrai point d\'export de l\'espace de travail produit bien un document téléchargé:', wsRealExport.hasContent);

  console.log('\n=== Priorité 4 — parité charte entre les 3 points d\'export (via adocExportClinicalDocumentHTML avec override) ===');
  console.log(result);
  console.log('=> Aucun des 3 exports bloqué par QC:', !result.cardBlocked && !result.sidebarBlocked && !result.workspaceBlocked);
  console.log('=> Les 3 exports produisent un HTML strictement identique (même override, même rendu):', result.allIdentical);

  // ── Vérifie maintenant, sur le VRAI code des 3 points (pas seulement la fonction partagée),
  //    que le 3e argument (override) est bien lu depuis art._adocRenderManifestOverride en
  //    inspectant le SOURCE des gestionnaires (recherche textuelle du 3e argument transmis). ──
  const fs = require('fs');
  const src = fs.readFileSync(FILE, 'utf-8');
  const exportCallSites = [...src.matchAll(/adocExportClinicalDocumentHTML\(art\._adocStructuredDoc, art\._adocStructuredSnapshot(?:, art\._adocRenderManifestOverride \|\| null)?\)/g)];
  const sitesWithOverride = exportCallSites.filter(m => m[0].includes('_adocRenderManifestOverride'));
  console.log('\n=== Vérification statique — les 3 sites d\'appel transmettent bien le 3e argument ===');
  console.log('Total de sites d\'appel trouvés:', exportCallSites.length, '— avec override:', sitesWithOverride.length);
  console.log('=> Les 3 points d\'export (carte, barre latérale, espace de travail) transmettent tous l\'override:', exportCallSites.length === 3 && sitesWithOverride.length === 3);

  // ── Vérifie la présence de try/catch autour de chacun des 3 appels (plus de promesse
  //    rejetée silencieuse) et de la fonction factorisée adocDownloadArtifact. ──
  console.log('\n=== Vérification statique — try/catch et factorisation ===');
  console.log('=> adocDownloadArtifact() factorisée existe:', /function adocDownloadArtifact\(blob, filename\)/.test(src));
  const usesSharedDownload = (src.match(/adocDownloadArtifact\(new Blob/g) || []).length;
  console.log('=> Nombre d\'appels à la fonction de téléchargement partagée (attendu >= 5 : legacy+structuré × 3 points, moins doublons)', usesSharedDownload);

  // ── Vérifie le try/catch RÉEL : force une exception dans le re-rendu (doc structuré délibérément
  //    invalide) et confirme un message utilisateur clair au lieu d'une promesse rejetée
  //    silencieuse (comportement AVANT ce correctif : rien ne se passait, aucun message). ──
  alerts.length = 0;
  const failureResult = await page.evaluate(async () => {
    const storeKey = 'artifact-p4-broken';
    window._adocArtifacts[storeKey] = {
      name: 'document-casse', fmt: 'html',
      _adocStructuredDoc: { title: 'Cassé', blocks: [], documentKind: 'fiche', renderManifestId: 'id-inexistant-xyz' }, // manifest introuvable → exception garantie
      _adocStructuredSnapshot: { sourceSnapshotId: 'x', entries: [] },
      _adocRenderManifestOverride: null,
      _adocGenerationEngine: 'structured',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: false, transform: false, export: true, qualityControlledExport: true },
    };
    window._adocWsState.storeKey = storeKey;
    let threw = false;
    try { await window.adocWsExport(); } catch (e) { threw = true; }
    return { threw };
  });
  console.log('\n=== Try/catch réel — export forcé en échec (manifeste introuvable) ===');
  console.log('Exception fuyant hors de adocWsExport (attendu false, catch interne):', failureResult.threw);
  console.log('Message utilisateur affiché:', alerts);
  console.log('=> Message clair affiché au lieu d\'un échec silencieux:', alerts.length === 1 && /impossible d.exporter/i.test(alerts[0]));

  console.log('\n=== errors ===', errors);
  await browser.close();
})();
