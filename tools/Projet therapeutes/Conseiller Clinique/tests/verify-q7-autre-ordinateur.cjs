// Q7, 2.6 — LE CONTRÔLE CENTRAL : « sur un AUTRE ordinateur ».
//
// Tout Q7 repose sur une promesse : ce qui est enregistré est RÉELLEMENT chez le serveur, pas
// seulement dans la mémoire du navigateur de Christophe. Un enregistrement qui ne vit que dans
// le stockage local ferait croire au travail sauvegardé jusqu'au jour où il change de machine.
//
// Deux CONTEXTES de navigateur ISOLÉS (stockages séparés, comme deux ordinateurs), le même faux
// Worker, la même clé. A enregistre ; B — qui n'a jamais rien écrit — doit retrouver le document
// par « Mes créations », l'ouvrir, et y lire le contenu de A, y compris la DEUXIÈME version.
//
// Ce qui est mesuré est ce que B LIT, jamais ce que A croit avoir fait.
//
//   NODE_PATH=<playwright> node tests/verify-q7-autre-ordinateur.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Un titre qui n'existe nulle part ailleurs : si B le lit, il ne peut venir que de A, par le
// serveur — jamais d'un reste de rendu ou d'un stockage partagé.
const TITRE_A = 'Document écrit par A seulement — 2.6';
const TITRE_A2 = 'Document écrit par A seulement — 2.6, deuxième version';

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port; const base = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});

  const erreurs = [];
  // Deux contextes, deux stockages : c'est l'isolement qui fait le contrôle.
  const faireProfil = async (nom) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(nom + ' : ' + e.message));
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.route('**/*', (r) => { const u = r.request().url();
      return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
    await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
      localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    return { ctx, page };
  };

  const A = await faireProfil('A');
  const B = await faireProfil('B');

  try {
    // ── A enregistre ─────────────────────────────────────────────────────────
    await A.page.evaluate(async (a) => {
      const doc = JSON.parse(JSON.stringify(a.d));
      doc.title = a.t;
      window._adocArtifacts = { e: { name: doc.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: doc, _adocStructuredSnapshot: null,
        _adocClinicalDocumentId: null, _ccEditorDirty: true,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      await window.adocOpenWorkspace('e');
      await window.adocWsSave();
    }, { d: PRESENTATION, t: TITRE_A });
    await A.page.waitForTimeout(900);
    const idA = await A.page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId);
    assert.ok(idA, 'A a bien obtenu un identifiant de document du serveur');
    assert.equal(await A.page.evaluate(() => window._adocArtifacts.e._ccEditorDirty), false,
      'A n’a plus de modification en attente après son enregistrement');
    pass('A enregistre : le serveur lui rend un identifiant, et rien ne reste en attente chez A.');

    // ── B est bien un AUTRE ordinateur ───────────────────────────────────────
    // Sans cette mesure, tout le reste pourrait n'être qu'un stockage partagé.
    const stockageB = await B.page.evaluate(() => {
      const tout = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); tout[k] = localStorage.getItem(k);
      }
      return tout;
    });
    const fuite = Object.entries(stockageB).filter(([, v]) => String(v).includes('2.6'));
    assert.deepEqual(fuite.map(([k]) => k), [],
      'le stockage de B ne contient RIEN du document de A ; clés fautives : '
      + JSON.stringify(fuite.map(([k]) => k)));
    assert.equal(await B.page.evaluate(() => Object.keys(window._adocArtifacts || {}).length), 0,
      'et B n’a aucun document en mémoire avant d’aller le chercher');
    pass('B est bien un autre ordinateur : ni le document de A dans son stockage, ni rien en mémoire.');

    // ── B retrouve le document par « Mes créations » ─────────────────────────
    const listeB = await B.page.evaluate(async () => {
      const r = await fetch(localStorage.getItem('workerUrl').replace(/\/+$/, '') + '/clinical-documents',
        { headers: { 'X-API-Key': localStorage.getItem('workerApiKey') } });
      const data = await r.json();
      return (data.documents || []).map((d) => ({ id: d.document_id, titre: d.title }));
    });
    const trouve = listeB.find((d) => d.titre === TITRE_A);
    assert.ok(trouve, 'B voit le document de A dans la liste ; titres lus : '
      + JSON.stringify(listeB.map((d) => d.titre)));
    assert.equal(trouve.id, idA, 'et c’est bien le même document');
    pass('B retrouve le document de A dans « Mes créations », par le serveur seul.');

    // ── B l'ouvre et lit le contenu de A ─────────────────────────────────────
    const ouvert = await B.page.evaluate((id) => window.adocOpenSavedClinicalDocument(id), idA);
    await B.page.waitForTimeout(900);
    assert.equal(ouvert, true, 'B ouvre bien le document');
    const chezB = await B.page.evaluate(() => {
      const art = window._adocArtifacts[window._adocWsState.storeKey];
      const d = art._adocStructuredDoc;
      return { titre: d.title, pages: d.blocks.length,
        titresDePages: d.blocks.map((b) => b.content.title),
        narration: (d.narration || []).map((e) => e.stepId + '=' + e.text),
        enAttente: !!art._ccEditorDirty };
    });
    assert.equal(chezB.titre, TITRE_A, 'B lit le titre écrit par A');
    assert.equal(chezB.pages, PRESENTATION.blocks.length,
      'B lit toutes les pages ; lues : ' + chezB.pages);
    assert.deepEqual(chezB.titresDePages, PRESENTATION.blocks.map((b) => b.content.title),
      'B lit les titres de pages de A, dans l’ordre');
    assert.deepEqual(chezB.narration,
      PRESENTATION.narration.map((e) => e.stepId + '=' + e.text),
      'B lit aussi la narration écrite par A — rien ne se perd en route');
    assert.equal(chezB.enAttente, false,
      'et un document tout juste rouvert n’a RIEN en attente chez B');
    pass('B ouvre le document et y lit le contenu de A : titre, pages, narration, rien en attente.');

    // ── A enregistre une DEUXIÈME version ; B doit la voir ───────────────────
    // Une seule version pourrait venir d'une copie figée : c'est la deuxième qui prouve que B
    // lit vraiment le serveur, et qu'il lit la version COURANTE.
    await A.page.evaluate(async (t) => {
      window._adocArtifacts.e._adocStructuredDoc.title = t;
      window.adocEditorMarkDirty();
      await window.adocWsSave();
    }, TITRE_A2);
    await A.page.waitForTimeout(900);
    const d = etat.documents.get(idA);
    assert.equal(d.versions.length, 2,
      'le serveur détient bien DEUX versions ; détenues : ' + d.versions.length);

    const ouvert2 = await B.page.evaluate((id) => window.adocOpenSavedClinicalDocument(id), idA);
    await B.page.waitForTimeout(900);
    assert.equal(ouvert2, true, 'B rouvre le document');
    assert.equal(await B.page.evaluate(() =>
      window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.title), TITRE_A2,
      'B lit la DEUXIÈME version, celle qui est courante');
    pass('A enregistre une deuxième version : B lit la version courante, pas une copie figée.');

    // ── Et l'ancienne version n'a pas été écrasée ────────────────────────────
    // La forme réellement envoyée par le cœur : { document: { schemaVersion, clinicalDocument,
    // sourceSnapshot, renderManifestOverride }, title, documentKind, generationEngine } —
    // lue dans adocBuildClinicalDocumentContent, jamais devinée.
    assert.equal(d.versions[0].charge.document.clinicalDocument.title, TITRE_A,
      'la première version reste intacte chez le serveur : rien n’est écrasé');
    assert.equal(d.versions[1].charge.document.clinicalDocument.title, TITRE_A2,
      'et la deuxième version porte bien le nouveau titre');
    pass('la version précédente reste conservée : un enregistrement ajoute, il n’écrase jamais.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await A.ctx.close(); await B.ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-q7-autre-ordinateur — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
