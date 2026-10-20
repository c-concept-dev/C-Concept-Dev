// Q7 — LE DRAPEAU « MODIFIÉ » : CHAQUE GESTE QUI ÉCRIT DOIT LE LEVER.
//
// S'il ne se lève pas, l'état continue d'afficher « Enregistré à … » sur un document qui a
// changé, et l'avertissement de fermeture ne prévient pas : le travail se perd en silence.
// C'est donc le drapeau, et non le confort, qui est en jeu.
//
// Chaque geste est joué, puis `_ccEditorDirty` est relu. Rien n'est supposé.
//
//   NODE_PATH=<playwright> node tests/verify-drapeau-modifie.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

const PAGE_SIMULEE = { title: 'Page pour l’essai du drapeau',
  blocks: [{ type: 'paragraph', text: 'Un paragraphe entier et correct.' }] };

(async () => {
  const { serveur } = creerFauxWorker(RACINE, {});
  // Le modèle est simulé par la racine : une page valide à chaque appel.
  const vrai = serveur.listeners('request')[0];
  serveur.removeAllListeners('request');
  serveur.on('request', (q, r) => {
    if (q.method === 'POST' && q.url === '/') {
      let c = ''; q.on('data', (d) => { c += d; });
      return q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' });
        r.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'emit_new_slide', input: PAGE_SIMULEE }] })); });
    }
    return vrai(q, r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port; const base = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);

  const repartirPropre = () => page.evaluate(async (d) => {
    window._adocArtifacts = { e: { name: d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
      _adocClinicalDocumentId: 'doc-propre', _ccEditorDirty: false,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
    await window.adocOpenWorkspace('e');
    window._adocArtifacts.e._ccEditorDirty = false;
    await new Promise((r) => setTimeout(r, 250));
    return !window._adocArtifacts.e._ccEditorDirty;
  }, PRESENTATION);
  const sale = () => page.evaluate(() => !!window._adocArtifacts.e._ccEditorDirty);
  const choisirBloc = (i) => page.evaluate((k) => {
    const d = window._adocArtifacts.e._adocStructuredDoc;
    document.getElementById(d.blocks[k].content.blocks[0].id)?.click();
  }, i);

  // Chaque geste : son nom, et ce qu'il faut faire pour le jouer VRAIMENT.
  const GESTES = [
    { nom: 'style d’un bloc (police)', faire: async () => {
        await choisirBloc(0); await page.waitForTimeout(350);
        await page.evaluate(() => window.adocEditorRefreshControls && window.adocEditorRefreshControls());
        await page.waitForTimeout(200);
        await page.evaluate(() => {
          const s = document.querySelector('select[data-editor-style="fontFamily"]');
          s.value = 'Lora'; s.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(400);
      } },
    { nom: 'insertion d’un bloc', faire: async () => {
        await choisirBloc(1); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer un bloc après$/ }).click();
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.cc-block-edit-result button')]
            .find((x) => !/^Annuler$/.test((x.textContent || '').trim()));
          b.click();
        });
        await page.waitForTimeout(500);
      } },
    { nom: 'narration écrite', faire: async () => {
        await page.evaluate(() => {
          const d = window._adocArtifacts.e._adocStructuredDoc;
          const e = window.adocPresentStepList(d)[0];
          if (window.adocNarrationWrite(d, e.stepId, 'Un commentaire.')) window.adocEditorMarkDirty();
        });
      } },
    { nom: 'insertion d’une page (D2)', faire: async () => {
        await choisirBloc(2); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
        await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
        await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
        await page.waitForTimeout(800);
      } },
    { nom: 'annulation d’une page (D5)', prealable: async () => {
        // Il faut d'abord insérer une page, PUIS remettre le drapeau à faux : on mesure
        // seulement ce que l'ANNULATION fait.
        await choisirBloc(2); await page.waitForTimeout(350);
        await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
        await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
        await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
          .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
        await page.waitForTimeout(800);
        await page.evaluate(() => { window._adocArtifacts.e._ccEditorDirty = false; });
      }, faire: async () => {
        await page.evaluate(() => window.adocAnnulerPageNeuve());
        await page.waitForTimeout(600);
      } },
  ];

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    const resultats = [];
    for (const g of GESTES) {
      assert.ok(await repartirPropre(), g.nom + ' : on repart d\'un document propre');
      if (g.prealable) await g.prealable();
      await g.faire();
      const leve = await sale();
      resultats.push({ nom: g.nom, leve: leve });
      console.log('      ' + (leve ? '✓' : '✗') + '  ' + g.nom + ' → drapeau ' + (leve ? 'levé' : 'PAS LEVÉ'));
    }
    const manquants = resultats.filter((r) => !r.leve);
    assert.deepEqual(manquants.map((r) => r.nom), [],
      'tout geste qui écrit doit lever le drapeau ; ne le lèvent pas : '
      + JSON.stringify(manquants.map((r) => r.nom)));
    pass('les ' + resultats.length + ' gestes mesurés lèvent le drapeau « modifié ».');
    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-drapeau-modifie — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
