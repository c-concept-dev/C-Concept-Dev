// STUDIO CLINIQUE — Avertissement honnête de seuil de stockage R2 (panneau "Médias"). Preuve
// réelle bout-en-bout du chemin CLIENT (le calcul Worker réel — pagination, cache 1h — est couvert
// séparément par verify-r2-storage-usage-worker.cjs, jamais dupliqué ici) : bouton "Vérifier
// l'espace utilisé", à la demande uniquement, affichage gradué honnête aux trois paliers du CDC
// (rien / neutre / coût estimé), jamais un simple binaire oui/non.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

function ficheDoc(blocks) {
  return {
    schemaVersion: 1, documentId: 'doc-r2-usage-001', versionId: 'v1', previousVersionId: null,
    requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-09-27T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test Seuil Stockage R2', purpose: 'supervision', audience: 'clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks, citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}
function heading(id, text) { return { id, type: 'heading', content: { text, level: 2 }, citationIds: [], validation: {} }; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Le volume simulé est piloté depuis Node (mutable), jamais recréé à chaque test — un seul mock
  // de route, réutilisé aux trois paliers successifs, exactement comme un vrai bucket qui grossit.
  let simulatedTotalGb = 3; // < 8 Go — palier "rien affiché"
  let storageStatsCalls = 0;
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('file:')) return route.continue();
    if (url.endsWith('/storage-stats') && req.method() === 'GET') {
      storageStatsCalls++;
      const totalSizeBytes = Math.round(simulatedTotalGb * 1e9);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          d1: { tables: {} },
          r2: { bucket: 'studio-clinique-brand-assets', available: true, objectCount: 42, totalSizeBytes, totalSizeMb: Math.round(totalSizeBytes / (1024 * 1024)) },
        }),
      });
    }
    return route.continue();
  });

  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test_r2_usage';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = { name: 'Test Seuil Stockage R2', _adocGenerationEngine: 'structured', _adocCapabilities: { workspace: true, blockEditing: true } };
  }, storeKey);
  const doc = ficheDoc([heading('blk-a', 'Titre')]);
  await page.evaluate(({ key, doc }) => { window._adocArtifacts[key]._adocStructuredDoc = doc; }, { key: storeKey, doc });
  await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);

  await page.click('#cc-ws-media-toggle');
  await page.waitForSelector('#cc-ws-media-panel:not([hidden])');

  // ── Test 1 : le bouton n'appelle JAMAIS /storage-stats tout seul à l'ouverture du panneau ──
  assert.equal(storageStatsCalls, 0, '/storage-stats ne doit jamais être appelée automatiquement à l’ouverture du panneau Médias (à la demande uniquement, cf. investigation point 2)');
  console.log('PASS 1/6 — aucun appel automatique à /storage-stats à l’ouverture du panneau (à la demande uniquement)');

  // ── Test 2 : palier < 8 Go — RIEN affiché, mais le bouton confirme brièvement l'action ──
  await page.click('#cc-media-storage-check-btn');
  await page.waitForFunction(() => document.getElementById('cc-media-storage-check-btn').textContent.includes('Vérifié'));
  assert.equal(storageStatsCalls, 1, 'le clic doit appeler réellement /storage-stats');
  assert.equal(await page.locator('#cc-media-storage-check-result').isHidden(), true, 'en dessous de 8 Go, aucun message ne doit être affiché (palier "rien", cf. CDC)');
  console.log('PASS 2/6 — palier < 8 Go : rien affiché, bouton confirme brièvement l’action (interface jamais silencieuse au point de sembler cassée)');

  // ── Test 3 : palier 8-10 Go — message neutre, jamais alarmiste ──
  simulatedTotalGb = 8.7;
  await page.click('#cc-media-storage-check-btn');
  await page.waitForFunction(() => !document.getElementById('cc-media-storage-check-result').hidden);
  const neutralText = await page.locator('#cc-media-storage-check-result').textContent();
  assert.ok(neutralText.includes('8,7'), 'le volume réel doit être affiché : ' + neutralText);
  assert.ok(neutralText.includes('10 Go inclus'), 'le message doit mentionner le seuil gratuit, neutre : ' + neutralText);
  assert.ok(!/\$/.test(neutralText), 'aucun coût ne doit être mentionné sous le seuil gratuit (palier neutre, jamais un chiffre non pertinent) : ' + neutralText);
  console.log('PASS 3/6 — palier 8-10 Go : message neutre affiché ("' + neutralText + '"), aucun coût mentionné');

  // ── Test 4 : palier ≥ 10 Go — mention du dépassement réel et de son coût estimé ──
  simulatedTotalGb = 12;
  await page.click('#cc-media-storage-check-btn');
  await page.waitForFunction(() => document.getElementById('cc-media-storage-check-result').textContent.includes('12'));
  const costText = await page.locator('#cc-media-storage-check-result').textContent();
  assert.ok(costText.includes('12'), 'le volume total réel (12 Go) doit être affiché : ' + costText);
  assert.ok(costText.includes('2 Go'), 'le dépassement réel (12 - 10 = 2 Go) doit être affiché, jamais recalculé approximativement : ' + costText);
  // 2 Go × 0,015 $/Go/mois = 0,03 $/mois — chiffrage réel, pas une estimation vague.
  assert.ok(costText.includes('0,03'), 'le coût estimé réel (0,03 $/mois) doit être affiché : ' + costText);
  console.log('PASS 4/6 — palier ≥ 10 Go : dépassement réel (2 Go) et coût estimé réel (0,03 $/mois) affichés ("' + costText + '")');

  // ── Test 5 : aucun ralentissement notable — le clic répond en un temps raisonnable (mock local,
  // le vrai coût de latence est côté Worker et déjà couvert par le test de cache dédié) ──
  simulatedTotalGb = 12.5; // volume différent du Test 4 — un texte forcément distinct à attendre.
  const t0 = Date.now();
  await page.click('#cc-media-storage-check-btn');
  await page.waitForFunction((prevText) => document.getElementById('cc-media-storage-check-result').textContent !== prevText, costText);
  const elapsedMs = Date.now() - t0;
  assert.ok(elapsedMs < 3000, 'le clic doit répondre en un temps raisonnable, jamais une interface qui semble bloquée (' + elapsedMs + ' ms observés)');
  console.log('PASS 5/6 — réponse en ' + elapsedMs + ' ms, aucun ralentissement notable observé');

  // ── Test 6 : zéro erreur JS sur l’ensemble du scénario ──
  assert.deepEqual(pageErrors, [], 'aucune erreur JS ne doit survenir : ' + JSON.stringify(pageErrors));
  console.log('PASS 6/6 — zéro erreur JS sur l’ensemble du scénario');

  console.log('\n=== TOUS LES TESTS "SEUIL DE STOCKAGE R2" (6/6) PASSENT ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
