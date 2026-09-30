// STUDIO CLINIQUE — Item 63c, construction : preuve réelle de la grille éditable xlsx (Item 76,
// moteur legacy-html) — rendu déterministe depuis art.xlsxData, édition de cellule (frappe clavier
// réelle), ajout/suppression de ligne/colonne via les VRAIS boutons du panneau contextuel (jamais
// réimplémentés), préservation en lecture seule de columnSummaries/legend/notes, et régénération
// réelle du fichier .xlsx à l'export après édition (jamais la dégradation HTML Option A, qui reste
// inchangée pour docx/pptx — cf. verify-item76-workspace-non-html.cjs, scénarios pptx/pdf intacts).
// L'état initial de l'artefact est construit directement (même choix de portée documenté que
// verify-item75-dette-overlap-guard.cjs) : reconstituer un pipeline de génération LLM complet
// dépasserait la portée de ce test ciblé sur la grille elle-même. Tout ce qui suit l'ouverture
// (adocOpenWorkspace, adocWsExport, boutons réels du panneau) est le vrai code du fichier.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const PAGE_PATH = 'file://' + path.join(__dirname, '../studio-clinique.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // ÉCRAN DE CONNEXION (construction ultérieure) — sans clé configurée, l'overlay #cc-login-screen
  // couvrirait toute la page et bloquerait les clics réels de ce test (pointer-events).
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
  await page.goto(PAGE_PATH);

  const storeKey = 'adocArt_test63c';
  await page.evaluate((key) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: 'Test 63c', fmt: 'xlsx',
      _adocGenerationEngine: 'legacy-html',
      _adocCapabilities: { workspace: true, legacyBlockEditing: true },
      _adocDocumentKind: 'tableau',
      html: '<!DOCTYPE html><html><head></head><body></body></html>',
      url: 'https://fake.worker/out/original.xlsx',
      xlsxData: {
        headers: ['Approche', 'Indication'],
        rows: [['R0-A', 'R0-B'], ['R1-A', 'R1-B'], ['R2-A', 'R2-B']],
        sections: [{ title: 'Groupe', startRow: 1 }],
        columnSummaries: [{ header: 'Approche', tagline: 'Accroche', description: 'Description longue.' }],
        legend: [{ symbol: '●', label: 'Indication forte' }],
        notes: [{ title: 'Vigilance', text: 'Texte de la note.' }],
      },
    };
    window._adocWsState = window._adocWsState || {};
  }, storeKey);

  // ── Test 1 : ouverture réelle — grille rendue depuis xlsxData (jamais le corps HTML du modèle) ──
  const opened = await page.evaluate((key) => window.adocOpenWorkspace(key), storeKey);
  assert.equal(opened, true, 'adocOpenWorkspace doit réussir');
  const initial = await page.evaluate(() => {
    const table = document.querySelector('#cc-ws-doc-card table[data-cc-xlsx-grid]');
    const dataRows = table ? Array.from(table.querySelectorAll('tbody tr[data-cc-xlsx-row]')) : [];
    const sectionRows = table ? Array.from(table.querySelectorAll('tbody tr.cc-xlsx-grid-section')) : [];
    return {
      hasTable: !!table,
      headerCount: table ? table.tHead.rows[0].cells.length : 0,
      dataRowCount: dataRows.length,
      sectionRowCount: sectionRows.length,
      sectionText: sectionRows[0] ? sectionRows[0].textContent.trim() : null,
      readonlyText: document.getElementById('cc-ws-doc-card').textContent,
    };
  });
  console.log('État initial de la grille :', initial);
  assert.ok(initial.hasTable, 'la grille doit être un vrai <table data-cc-xlsx-grid>');
  assert.equal(initial.headerCount, 2, '2 colonnes attendues');
  assert.equal(initial.dataRowCount, 3, '3 lignes de données attendues');
  assert.equal(initial.sectionRowCount, 1, '1 ligne de titre de section attendue');
  assert.equal(initial.sectionText, 'Groupe', 'le titre de section doit être affiché tel quel');
  assert.ok(/Accroche/.test(initial.readonlyText) && /Indication forte/.test(initial.readonlyText) && /Vigilance/.test(initial.readonlyText),
    'columnSummaries/legend/notes doivent rester visibles (préservés, décision de Christophe : lecture seule)');
  console.log('PASS 1/6 — grille rendue depuis xlsxData, section affichée, extras préservés en lecture seule\n');

  // ── Test 2 : les extras en lecture seule ne sont JAMAIS des blocs "corrigeables" par le
  // mécanisme générique (div, jamais h1-h6/p/table — sinon ils rejoindraient
  // ADOC_LEGACY_BLOCK_SELECTOR et deviendraient éditables par erreur). ──
  const readonlyTags = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cc-xlsx-readonly, .cc-xlsx-readonly-heading, .cc-xlsx-readonly-text')).map(el => el.tagName));
  assert.ok(readonlyTags.length > 0 && readonlyTags.every(t => t === 'DIV'),
    'les extras en lecture seule doivent être des <div> — jamais capturés par le mécanisme générique de correction IA');
  console.log('PASS 2/6 — extras en lecture seule hors du mécanisme de correction générique (div, aucun kind corrigeable)\n');

  // ── Test 3 : édition d'une cellule par FRAPPE CLAVIER RÉELLE (jamais une écriture directe du
  // DOM) — même patron que le mécanisme d'édition legacy générique déjà éprouvé. ──
  await page.click('#cc-ws-doc-card table[data-cc-xlsx-grid] tbody tr[data-cc-xlsx-row="0"] td:nth-child(2)');
  // ControlOrMeta+A, jamais Control+A : sur macOS, Control+A est la liaison emacs « début de ligne »,
  // pas « tout sélectionner » — la frappe se PRÉFIXE alors au contenu existant et la cellule vaut
  // 'R0-B-modifiéR0-B'. Mesuré : ce seul jeton fait passer la suite de 2/6 à 6/6, la synchronisation
  // de production (adocEditorSyncXlsxGrid) étant correcte depuis le début.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('R0-B-modifié');
  await page.waitForTimeout(50);
  const afterEdit = await page.evaluate((key) => window._adocArtifacts[key].xlsxData.rows[0][1], storeKey);
  const everEdited = await page.evaluate((key) => window._adocArtifacts[key]._adocEverEdited, storeKey);
  console.log('Cellule après frappe réelle :', afterEdit, '| _adocEverEdited :', everEdited);
  assert.equal(afterEdit, 'R0-B-modifié', 'la frappe clavier réelle dans la cellule doit synchroniser art.xlsxData.rows (adocEditorSyncXlsxGrid)');
  assert.equal(everEdited, true, '_adocEverEdited doit passer à true (même mécanisme générique, adocEditorMarkDirty)');
  console.log('PASS 3/6 — édition de cellule réelle synchronisée vers art.xlsxData\n');

  // ── Test 4 : ajout de ligne via le VRAI bouton du panneau contextuel (geste explicite) ──
  await page.click('#cc-ws-doc-card table[data-cc-xlsx-grid] tbody tr[data-cc-xlsx-row="0"] td:nth-child(1)');
  await page.click('.cc-block-edit-panel button:has-text("+ Ligne")');
  await page.waitForTimeout(50);
  const afterAddRow = await page.evaluate((key) => window._adocArtifacts[key].xlsxData, storeKey);
  console.log('Après + Ligne :', afterAddRow.rows.length, 'lignes, section startRow =', afterAddRow.sections[0].startRow);
  assert.equal(afterAddRow.rows.length, 4, 'une ligne doit avoir été ajoutée (3 -> 4)');
  assert.deepEqual(afterAddRow.rows[1], ['', ''], 'la nouvelle ligne (insérée après la ligne 0 focalisée) doit être vide');
  assert.equal(afterAddRow.sections[0].startRow, 2, 'la section (startRow=1) doit être réindexée à 2 : insertion à l’index 1, startRow>=1');
  console.log('PASS 4/6 — + Ligne (vrai bouton) : ligne insérée à la bonne position, section réindexée\n');

  // ── Test 5 : suppression de colonne via le VRAI bouton ──
  await page.click('#cc-ws-doc-card table[data-cc-xlsx-grid] thead th:nth-child(1)');
  await page.click('.cc-block-edit-panel button:has-text("− Colonne")');
  await page.waitForTimeout(50);
  const afterRemoveCol = await page.evaluate((key) => window._adocArtifacts[key].xlsxData, storeKey);
  console.log('Après − Colonne :', afterRemoveCol.headers, afterRemoveCol.rows);
  assert.deepEqual(afterRemoveCol.headers, ['Indication'], 'la colonne « Approche » doit avoir disparu des en-têtes');
  assert.equal(afterRemoveCol.rows[0].length, 1, 'chaque ligne doit avoir une colonne de moins');
  assert.equal(afterRemoveCol.rows[0][0], 'R0-B-modifié', 'la colonne restante doit conserver la valeur éditée au test 3');
  console.log('PASS 5/6 — − Colonne (vrai bouton) : colonne retirée partout, valeurs restantes intactes\n');

  // ── Test 6 : régénération RÉELLE à l'export (jamais la dégradation HTML Option A pour xlsx) —
  // inspection du contenu RÉEL du payload envoyé à /generate-xlsx (jamais supposé). ──
  let regeneratePayload = null;
  await page.route('**/generate-xlsx', async (route) => {
    regeneratePayload = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://fake.worker/out/regenere.xlsx', url_preview: 'https://fake.worker/out/regenere.xlsx' }) });
  });
  const exportDownload = await page.evaluate(() => new Promise((resolve) => {
    const origClick = HTMLAnchorElement.prototype.click;
    let captured = null;
    HTMLAnchorElement.prototype.click = function () { captured = { href: this.href, download: this.download }; };
    Promise.resolve(window.adocWsExport()).then(() => { HTMLAnchorElement.prototype.click = origClick; resolve(captured); });
  }));
  console.log('Export après édition :', exportDownload);
  console.log('Payload régénéré (réel, capturé par page.route) :', JSON.stringify(regeneratePayload));
  assert.ok(exportDownload && exportDownload.download.endsWith('.xlsx'), 'Exporter doit régénérer un vrai .xlsx, jamais du HTML (Option A ne s’applique plus à xlsx)');
  assert.equal(exportDownload.href, 'https://fake.worker/out/regenere.xlsx', 'le lien téléchargé doit être le fichier RÉGÉNÉRÉ (nouveau art.url), pas l’original');
  assert.ok(regeneratePayload && regeneratePayload.content && Array.isArray(regeneratePayload.content.sheets), '/generate-xlsx doit recevoir un vrai payload {content:{sheets}}');
  const mainSheet = regeneratePayload.content.sheets[0];
  assert.equal(mainSheet.headers.length, 1, 'le fichier régénéré doit refléter la colonne supprimée (test 5)');
  assert.equal(mainSheet.rows[0][0], 'R0-B-modifié', 'le fichier régénéré doit refléter la cellule éditée (test 3) — contenu réel inspecté, pas supposé');
  assert.equal(mainSheet.rows.length, 4, 'le fichier régénéré doit refléter la ligne ajoutée (test 4)');
  assert.equal(regeneratePayload.content.sheets.length, 4,
    'les feuilles dérivées (Résumé des approches/Légende/Notes cliniques, jamais éditées dans ce lot) doivent être régénérées aussi, préservées telles quelles');
  console.log('PASS 6/6 — export après édition régénère un vrai xlsx dont le contenu réel reflète fidèlement toutes les modifications\n');

  console.log('\n=== TOUS LES TESTS ITEM 63C — GRILLE ÉDITABLE XLSX PASSENT (6/6) ===');
  await browser.close();
})().catch(async (err) => { console.error('ÉCHEC :', err); process.exit(1); });
