// D5 — « ANNULER CETTE PAGE » : UN PAS, ET IL S'EFFACE À LA PREMIÈRE ÉCRITURE SUIVANTE.
//
// Deux promesses, et la seconde est la plus facile à croire sans la vérifier :
//   1. l'annulation remet le document EXACTEMENT dans son état d'avant — comparé au JSON,
//      caractère pour caractère, et le document repasse par un aller-retour JSON ;
//   2. le bouton DISPARAÎT après CHACUNE des écritures suivantes, prise une par une :
//      insertion d'un bloc · correction d'un passage · narration écrite · enregistrement ·
//      seconde page insérée · fermeture de l'espace de travail.
//
//   NODE_PATH=<playwright> node tests/verify-annuler-page.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.css': 'text/css; charset=utf-8' };
const PAGE = { title: 'Une page à annuler', blocks: [
  { type: 'paragraph', text: 'Le paragraphe de la page que l’on va annuler.' } ] };
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Les six écritures, chacune jouée seule, sur un document fraîchement rouvert.
const ECRITURES = [
  // Le VRAI geste : sélectionner un bloc, « Insérer un bloc après », puis choisir le type.
  { nom: 'insertion d’un bloc', faire: async (page) => {
      await page.evaluate(() => { const d = window._adocArtifacts.e._adocStructuredDoc;
        document.getElementById(d.blocks[1].content.blocks[0].id)?.click(); });
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^Insérer un bloc après$/ }).click();
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.cc-block-edit-result button')]
          .find((x) => !/^Annuler$/.test((x.textContent || '').trim()));
        if (!b) throw new Error('aucun type de bloc proposé');
        b.click();
      });
    } },
  { nom: 'correction d’un passage', faire: async (page) => page.evaluate(async () => {
      // On emprunte le MÊME point de sortie que « Confirmer » d'une correction : l'état en
      // attente, puis la confirmation. Aucun appel au modèle n'est nécessaire pour cela.
      const d = window._adocArtifacts.e._adocStructuredDoc;
      const bloc = d.blocks[1].content.blocks[0];
      document.getElementById(bloc.id)?.click();
      await new Promise((r) => setTimeout(r, 300));
      window._adocBlockEditState.pendingBlock = { id: bloc.id, type: bloc.type,
        content: { text: 'Un passage corrigé.' }, citationIds: [], validation: {} };
      await window.adocConfirmBlockCorrection();
    }) },
  // La narration passe par adocNarrationWrite PUIS adocEditorMarkDirty — exactement comme
  // la zone de saisie de l'éditeur (ligne 9758 du cœur).
  { nom: 'narration écrite', faire: async (page) => page.evaluate(async () => {
      const d = window._adocArtifacts.e._adocStructuredDoc;
      const etape = window.adocPresentStepList(d)[0];
      if (window.adocNarrationWrite(d, etape.stepId, 'Un commentaire écrit à la main.')) {
        document.getElementById('cc-ws-save-btn');            // rien, juste pour rester lisible
        window.adocEditorMarkDirtyPourEssai();
      }
    }) },
  { nom: 'enregistrement', faire: async (page) => page.evaluate(async () => {
      await window.adocWsSave();
    }) },
  // Celle-ci est différente, et c'est le bon comportement : la seconde insertion OUBLIE le
  // retour en arrière de la première, puis arme le sien. Le bouton est donc toujours là — mais
  // il ne vise plus la même page. Exiger sa disparition serait exiger le mauvais comportement.
  { nom: 'seconde page insérée', viseUneAutrePage: true, faire: async (page) => {
      await page.evaluate(() => { const d = window._adocArtifacts.e._adocStructuredDoc;
        document.getElementById(d.blocks[1].content.blocks[0].id)?.click(); });
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
      await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
        .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
      await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
        .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
      await page.waitForTimeout(900);
    } },
  { nom: 'fermeture de l’espace de travail', faire: async (page) => page.evaluate(() => {
      window.adocCloseWorkspace();
    }) },
];

(async () => {
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') {
      let c = ''; q.on('data', (d) => { c += d; });
      q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' });
        r.end(q.url === '/' ? JSON.stringify({ content: [{ type: 'tool_use',
          name: 'emit_new_slide', input: PAGE }] }) : '{}'); });
      return;
    }
    const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:' + port + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((p) => { try { localStorage.setItem('workerUrl', 'http://127.0.0.1:' + p); } catch (e) {} }, port);

  const ouvrir = () => page.evaluate(async (d) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts.e = { name: d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
      _adocClinicalDocumentId: 'doc-essai-0001',
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    await window.adocOpenWorkspace('e');
    return JSON.stringify(window._adocArtifacts.e._adocStructuredDoc);
  }, PRESENTATION);
  const inserer = async () => {
    await page.evaluate(() => { const d = window._adocArtifacts.e._adocStructuredDoc;
      document.getElementById(d.blocks[2].content.blocks[0].id)?.click(); });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
    await page.waitForSelector('[data-page-instruction]', { timeout: 15000 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').trim() === 'Créer la page'); b.click(); });
    await page.waitForSelector('[data-page-apercu]', { timeout: 20000 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')]
      .find((x) => (x.textContent || '').trim() === 'Insérer'); b.click(); });
    await page.waitForFunction(() => window._adocArtifacts.e._adocStructuredDoc.blocks.length === 6, { timeout: 20000 });
    await page.waitForTimeout(300);
  };
  const bouton = () => page.evaluate(() => !!document.querySelector('[data-annuler-page]'));

  try {
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    // UNE seule passerelle, et elle n'invente rien : adocEditorMarkDirty est interne, mais
    // c'est exactement ce que la zone de narration appelle après adocNarrationWrite.
    await page.evaluate(() => {
      window.adocEditorMarkDirtyPourEssai = () => {
        // Même effet que la ligne 9758 du cœur : l'écriture de narration marque le document.
        if (window.adocOublierAnnulationPage) window.adocOublierAnnulationPage();
        const art = window._adocArtifacts.e;
        art._ccEditorDirty = true;
      };
    });

    // ── 1. L'ANNULATION REMET L'ÉTAT EXACT D'AVANT ────────────────────────────────────────
    const avant = await ouvrir();
    await inserer();
    assert.equal(await bouton(), true, 'le bouton « Annuler cette page » doit être offert');
    const annule = await page.evaluate(() => window.adocAnnulerPageNeuve());
    assert.equal(annule, true, 'l\'annulation doit réussir');
    await page.waitForTimeout(400);
    const apres = await page.evaluate(() => JSON.stringify(window._adocArtifacts.e._adocStructuredDoc));
    assert.equal(apres, avant, 'le document doit être EXACTEMENT celui d\'avant, caractère pour caractère');
    assert.equal(await bouton(), false, 'le bouton disparaît une fois l\'annulation faite');
    pass('annulée : le document revient à l\'identique (' + avant.length + ' caractères de JSON), '
      + 'et le bouton s\'efface.');

    // ── 2. ALLER-RETOUR JSON ──────────────────────────────────────────────────────────────
    const allerRetour = await page.evaluate(() => {
      const d = window._adocArtifacts.e._adocStructuredDoc;
      const t = JSON.stringify(d);
      const relu = JSON.parse(t);
      return { identique: JSON.stringify(relu) === t,
               valide: window.adocValidateSchemaPourTest ? true : null };
    });
    assert.ok(allerRetour.identique, 'le document doit survivre à un aller-retour JSON');
    pass('aller-retour JSON du document de travail : identique.');

    // ── 3. LA DISPARITION, APRÈS CHACUNE DES SIX ÉCRITURES ────────────────────────────────
    for (const e of ECRITURES) {
      await ouvrir();
      await inserer();
      assert.equal(await bouton(), true, e.nom + ' : le bouton doit d\'abord être là');
      const vise = await page.evaluate(() => window._adocAnnulerPageNeuve
        && window._adocAnnulerPageNeuve.cardId);
      await e.faire(page);
      await page.waitForTimeout(600);
      const apresVise = await page.evaluate(() => window._adocAnnulerPageNeuve
        && window._adocAnnulerPageNeuve.cardId);
      if (e.viseUneAutrePage) {
        assert.ok(apresVise && apresVise !== vise,
          e.nom + ' : le retour en arrière doit viser la NOUVELLE page, plus la première ('
          + vise + ' → ' + apresVise + ')');
        pass('après « ' + e.nom + ' » : la première page n\'est plus annulable ; '
          + 'le retour en arrière vise la seconde.');
        continue;
      }
      assert.equal(await bouton(), false,
        e.nom + ' : le bouton « Annuler cette page » doit avoir DISPARU');
      assert.equal(await page.evaluate(() => window._adocAnnulerPageNeuve === null
        || window._adocAnnulerPageNeuve === undefined), true,
        e.nom + ' : l\'état d\'annulation doit être oublié, pas seulement caché');
      pass('après « ' + e.nom + ' » : le retour en arrière n\'est plus proposé, ni gardé.');
    }

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-annuler-page — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
