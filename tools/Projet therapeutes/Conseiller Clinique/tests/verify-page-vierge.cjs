// Une page vierge s'insère sans appel au modèle, puis ouvre le menu d'insertion de blocs.
//
//   NODE_PATH=<playwright> node tests/verify-page-vierge.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

(async () => {
  let posts = 0;
  const serveur = http.createServer((q, r) => {
    if (q.method === 'POST') { posts++; r.writeHead(500); return r.end(); }
    const fichier = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      r.writeHead(404); return r.end();
    }
    r.writeHead(200, { 'content-type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(r);
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const navigateur = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:' + port + '/')
      ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:' + port + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function');
    await page.evaluate(async (doc) => {
      // Reproduit les champs futurs vus dans le journal de l'utilisatrice : ils sont conservés
      // par la compatibilité ascendante et ne doivent pas condamner une nouvelle page valide.
      doc.blocks[0].content.blocks[0].futureField = { preserved: true };
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.vierge = { name: doc.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: doc, _adocCapabilities: { workspace: true, persist: true,
          fineCitations: true, blockEditing: true, transform: true, export: true,
          qualityControlledExport: true } };
      await window.adocOpenWorkspace('vierge');
    }, JSON.parse(JSON.stringify(PRESENTATION)));

    for (const kind of ['presentation', 'carrousel']) {
      await page.evaluate(async (documentKind) => {
        const art = window._adocArtifacts.vierge;
        art._adocStructuredDoc.documentKind = documentKind;
        art._adocStructuredDoc.blocks = art._adocStructuredDoc.blocks.filter((b) => b.content.title !== 'Nouvelle page');
        await window.adocOpenWorkspace('vierge');
      }, kind);
      const avant = await page.evaluate(() => window._adocArtifacts.vierge._adocStructuredDoc.blocks.map((b) => b.id));
      await page.evaluate(() => document.getElementById(
        window._adocArtifacts.vierge._adocStructuredDoc.blocks[1].content.blocks[0].id)?.click());
      // Le geste lui-même insère la page vierge : aucun formulaire intermédiaire.
      await page.getByRole('button', { name: /^Insérer une page après$/ }).click();
      await page.waitForFunction((longueur) =>
        window._adocArtifacts.vierge._adocStructuredDoc.blocks.length === longueur + 1, avant.length);

      const resultat = await page.evaluate(() => {
        const doc = window._adocArtifacts.vierge._adocStructuredDoc;
        const carte = doc.blocks[2];
        const panneau = window._adocBlockEditState && window._adocBlockEditState.panelEl;
        return { titre: carte.content.title, blocs: carte.content.blocks.length,
          ordre: doc.blocks.map((b) => b.id), champFutur: doc.blocks[0].content.blocks[0].futureField,
          selection: window._adocBlockEditState && window._adocBlockEditState.blockId,
          menuBloc: panneau && [...panneau.querySelectorAll('label')]
            .some((el) => /Insérer un bloc/.test(el.textContent || '')) };
      });
      assert.equal(resultat.titre, 'Nouvelle page', kind);
      assert.equal(resultat.blocs, 0, kind + ' : la page doit vraiment ne contenir aucun bloc');
      assert.deepEqual(resultat.ordre.filter((id) => !avant.includes(id)).length, 1,
        kind + ' : exactement une carte doit être ajoutée');
      assert.deepEqual(resultat.champFutur, { preserved: true }, kind + ' : le champ futur doit survivre');
      assert.match(resultat.selection || '', /^root:card-title:/, kind + ' : le titre neuf doit être sélectionné');
      assert.equal(resultat.menuBloc, true, kind + ' : le menu « Insérer un bloc » doit être ouvert');
    }
    // Les formats continus gardent l'insertion de blocs, sans faux geste de page.
    await page.evaluate(async () => {
      const source = window._adocArtifacts.vierge._adocStructuredDoc;
      const fiche = structuredClone(source);
      fiche.documentKind = 'fiche';
      fiche.blocks = structuredClone(source.blocks[0].content.blocks);
      delete fiche.narration;
      window._adocArtifacts.continu = { name: 'Document continu', _adocGenerationEngine: 'structured',
        _adocStructuredDoc: fiche, _adocCapabilities: window._adocArtifacts.vierge._adocCapabilities };
      await window.adocOpenWorkspace('continu');
      document.getElementById(fiche.blocks[0].id)?.click();
    });
    assert.equal(await page.getByRole('button', { name: /^Insérer une page/ }).count(), 0,
      'Fiche : aucun faux geste de page');
    assert.equal(await page.getByLabel('Position du nouveau bloc').count(), 1,
      'Fiche : l\'insertion de blocs reste disponible');
    assert.equal(posts, 0, 'une page vierge ne doit appeler ni modèle ni Worker');
    assert.deepEqual(erreurs, [], 'aucune erreur navigateur');
    console.log('PASS verify-page-vierge — Présentation + Carrousel, page vide, ordre préservé, champs futurs conservés, 0 appel réseau.');
  } finally {
    await navigateur.close();
    serveur.close();
  }
})().catch((e) => { console.error('ECHEC verify-page-vierge : ' + e.stack); process.exit(1); });
