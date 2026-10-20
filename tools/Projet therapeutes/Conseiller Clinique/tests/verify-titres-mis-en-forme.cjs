// Q1 — LE STYLE D'UN TITRE EST ÉCRIT DANS LE DOCUMENT, ET IL SURVIT.
//
// Défaut constaté en production par Christophe : titre de la diapositive 1 mis en 20 pt,
// « Nouvelle version », réouverture — le TEXTE est là, la TAILLE a disparu. Cause :
// adocFindEditableBlock fabriquait un objet JETABLE pour root:card-title:<id> et root:doc-title,
// et le style posé dessus mourait avec lui.
//
// Ce contrôle mesure la chaîne entière, sur la PAGE RÉELLE : poser le style par le vrai panneau,
// le retrouver dans le document, le voir dans le HTML rendu, le sauvegarder, et le relire depuis
// un SECOND navigateur vierge — « un autre ordinateur ». Et il mesure l'inverse : un document
// sans titleStyle ne doit émettre AUCUN attribut style.
//
//   NODE_PATH=<playwright> node tests/verify-titres-mis-en-forme.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

let _i = 0;
const par = (t) => ({ id: 'p' + (++_i), type: 'paragraph', content: { text: t },
  citationIds: [], validation: {} });
const carte = (ti, bs) => ({ id: 'c' + (++_i), type: 'card',
  content: { title: ti, imageRef: null, imageAlt: null, blocks: bs },
  citationIds: [], validation: {} });
const doc = (titre, kind, blocks) => ({
  schemaVersion: 1, documentId: 'q1-' + kind, versionId: 'q1-' + kind + '-v1',
  previousVersionId: null, requestId: 'r', sourceSnapshotId: 's',
  createdAt: '2026-10-20T09:00:00Z', language: 'fr', status: 'draft',
  title: titre, purpose: 'Essai de Q1', audience: 'clinicien', documentKind: kind,
  renderManifestId: 'manifest-default-001', derivedFrom: null, blocks: blocks, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending',
                accessibility: 'pending', humanClinicalReview: 'required' }, narration: [] });

const CARTES = () => [carte('Première page', [par('Un premier paragraphe.'), par('Un second.')]),
                      carte('Deuxième page', [par('Encore un paragraphe.')])];
const DOCS = {
  presentation: () => doc('Une présentation d’essai', 'presentation', CARTES()),
  carrousel: () => doc('Un carrousel d’essai', 'carrousel', CARTES()),
  fiche: () => doc('Une fiche d’essai', 'fiche', [par('Un paragraphe de fiche.')]),
};

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const erreurs = [];
  const ordinateur = async (nom) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
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

  const A = await ordinateur('A');
  const ouvrir = (d, cle) => A.page.evaluate(async (a) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[a.k] = { name: a.d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(a.d)),
      _adocStructuredSnapshot: { sourceSnapshotId: a.d.sourceSnapshotId, entries: [] },
      _adocClinicalDocumentId: null, _ccEditorDirty: false,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: a.k });
    const ok = await window.adocOpenWorkspace(a.k);
    if (!ok) throw new Error('le rendu a refusé : ' + a.d.title);
    window._adocArtifacts[a.k]._ccEditorDirty = false;
  }, { d: d, k: cle });

  const choisir = (sel) => A.page.evaluate(async (s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error('élément absent : ' + s);
    el.click();
    await new Promise((r) => setTimeout(r, 450));
    window.adocEditorRefreshControls && window.adocEditorRefreshControls();
    await new Promise((r) => setTimeout(r, 200));
  }, sel);
  const poser = (champ, valeur) => A.page.evaluate((a) => {
    const p = document.querySelector('[data-editor-scope]');
    if (!p) throw new Error('panneau absent');
    p.value = 'block'; p.dispatchEvent(new Event('change', { bubbles: true }));
    const el = document.querySelector('[data-editor-style="' + a.c + '"]');
    if (!el) throw new Error('champ absent : ' + a.c);
    el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { c: champ, v: valeur });
  const agir = (action) => A.page.evaluate((a) => {
    const b = document.querySelector('[data-editor-action="' + a + '"]');
    if (!b) throw new Error('action absente : ' + a);
    b.click();
  }, action);
  const styleDuDoc = (cle, chemin) => A.page.evaluate((a) => {
    const d = window._adocArtifacts[a.k]._adocStructuredDoc;
    return a.c === 'racine' ? d.titleStyle : d.blocks[0].content.titleStyle;
  }, { k: cle, c: chemin });
  const sale = (cle) => A.page.evaluate((k) => !!window._adocArtifacts[k]._ccEditorDirty, cle);
  const message = () => A.page.evaluate(() => {
    const m = document.querySelector('.cc-editor-message');
    return m ? (m.textContent || '').trim() : null;
  });

  try {
    // ── 1. LES SIX CHEMINS DU PANNEAU ÉCRIVENT DANS titleStyle ET LÈVENT LE DRAPEAU ─────────
    await ouvrir(DOCS.presentation(), 'p');
    const CHEMINS = [
      ['police', () => poser('fontFamily', 'Lora'), 'fontFamily', 'Lora'],
      ['taille', () => poser('fontSizePt', '20'), 'fontSizePt', 20],
      ['couleur', () => poser('color', '#2f4f4f'), 'color', '#2f4f4f'],
      ['alignement', () => poser('textAlign', 'center'), 'textAlign', 'center'],
      ['gras', () => agir('bold'), 'fontWeight', null],
      ['italique', () => agir('italic'), 'fontStyle', null],
    ];
    for (const [nom, geste, champ, attendu] of CHEMINS) {
      await choisir('.adoc-sc-card-title');
      await A.page.evaluate((k) => { window._adocArtifacts[k]._ccEditorDirty = false; }, 'p');
      await geste();
      await A.page.waitForTimeout(350);
      const st = await styleDuDoc('p', 'carte') || {};
      assert.ok(st[champ] !== undefined,
        nom + ' : le document doit porter titleStyle.' + champ + ' ; lu : ' + JSON.stringify(st));
      if (attendu !== null) assert.equal(String(st[champ]), String(attendu),
        nom + ' : valeur attendue ' + attendu + ', lue ' + st[champ]);
      assert.equal(await sale('p'), true, nom + ' : le drapeau « modifié » doit être levé');
      assert.equal(await message(), 'Modification appliquée.',
        nom + ' : le message honnête a disparu pour un titre entier ; lu : ' + JSON.stringify(await message()));
    }
    pass('les 6 chemins du panneau écrivent dans titleStyle, lèvent le drapeau, '
      + 'et disent « Modification appliquée. ».');

    // ── 2. « Réinitialiser le style » SUPPRIME titleStyle ────────────────────────────────────
    // Supprimer, et non écrire {} : un titre jamais mis en forme ne doit rien laisser dans le
    // document, sous peine de figer son apparence face à un changement de charte.
    await choisir('.adoc-sc-card-title');
    await agir('reset');
    await A.page.waitForTimeout(350);
    const apresReset = await A.page.evaluate(() => {
      const c = window._adocArtifacts.p._adocStructuredDoc.blocks[0].content;
      return { present: 'titleStyle' in c, valeur: c.titleStyle };
    });
    assert.equal(apresReset.present, false,
      'la remise à zéro doit SUPPRIMER titleStyle, pas le laisser vide ; lu : '
      + JSON.stringify(apresReset));
    pass('« Réinitialiser le style » supprime titleStyle du document.');

    // ── 3. ANNULER ET RÉTABLIR COUVRENT titleStyle ──────────────────────────────────────────
    await choisir('.adoc-sc-card-title');
    await poser('fontSizePt', '22');
    await A.page.waitForTimeout(350);
    assert.equal((await styleDuDoc('p', 'carte') || {}).fontSizePt, 22, 'repère : 22 pt est posé');
    await agir('undo');
    await A.page.waitForTimeout(450);
    const apresUndo = await styleDuDoc('p', 'carte');
    assert.notEqual(apresUndo && apresUndo.fontSizePt, 22,
      'annuler doit défaire le style du titre ; lu : ' + JSON.stringify(apresUndo));
    await agir('redo');
    await A.page.waitForTimeout(450);
    assert.equal((await styleDuDoc('p', 'carte') || {}).fontSizePt, 22,
      'rétablir doit le refaire ; lu : ' + JSON.stringify(await styleDuDoc('p', 'carte')));
    pass('annuler et rétablir couvrent titleStyle.');

    // ── 4. LE RENDU PORTE LE STYLE ──────────────────────────────────────────────────────────
    const rendu = await A.page.evaluate(() =>
      document.querySelector('.adoc-sc-card-title').getAttribute('style') || '');
    assert.match(rendu, /font-size/, 'le titre rendu porte le style ; lu : ' + JSON.stringify(rendu));
    pass('le titre rendu dans la page porte l’attribut style (« ' + rendu.slice(0, 40) + '… »).');

    // ── 5. LE CONTRÔLE CENTRAL : SAUVEGARDE, PUIS UN AUTRE ORDINATEUR ────────────────────────
    const CAS = [
      ['titre d’une diapositive', 'presentation', '.adoc-sc-card-title', 'carte'],
      ['titre du document (fiche)', 'fiche', '.adoc-sc-cover-title', 'racine'],
      ['titre d’une carte de carrousel', 'carrousel', '.adoc-sc-card-title', 'carte'],
    ];
    for (const [nom, kind, selecteur, ou] of CAS) {
      const cle = 'k' + kind;
      await ouvrir(DOCS[kind](), cle);
      await choisir(selecteur);
      await poser('fontSizePt', '20');
      await A.page.waitForTimeout(300);
      await choisir(selecteur);
      await poser('color', '#8a3f29');
      await A.page.waitForTimeout(300);
      await choisir(selecteur);
      await agir('bold');
      await A.page.waitForTimeout(350);
      const avant = await styleDuDoc(cle, ou);
      assert.ok(avant && avant.fontSizePt == 20 && avant.color === '#8a3f29' && avant.fontWeight,
        nom + ' : les trois réglages sont dans le document ; lu : ' + JSON.stringify(avant));

      await A.page.evaluate((k) => { window._adocWsState.storeKey = k; return window.adocWsSave(); }, cle);
      await A.page.waitForTimeout(1000);
      const id = await A.page.evaluate((k) => window._adocArtifacts[k]._adocClinicalDocumentId, cle);
      assert.ok(id, nom + ' : le document est sauvegardé');

      // Un SECOND navigateur, vierge : c'est là que la promesse se tient ou se rompt.
      const B = await ordinateur('B');
      try {
        const fuite = await B.page.evaluate(() => {
          const t = []; for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (String(localStorage.getItem(k)).includes('titleStyle')) t.push(k); }
          return t;
        });
        assert.deepEqual(fuite, [], nom + ' : B est vierge, rien du style dans son stockage');
        assert.equal(await B.page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), id), true,
          nom + ' : B rouvre le document');
        await B.page.waitForTimeout(900);
        const chezB = await B.page.evaluate((o) => {
          const d = window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc;
          const st = o === 'racine' ? d.titleStyle : d.blocks[0].content.titleStyle;
          const el = document.querySelector(o === 'racine' ? '.adoc-sc-cover-title' : '.adoc-sc-card-title');
          return { style: st, attribut: el ? (el.getAttribute('style') || '') : null };
        }, ou);
        assert.deepEqual(chezB.style, avant,
          nom + ' : B lit un style IDENTIQUE ; attendu ' + JSON.stringify(avant)
          + ', lu ' + JSON.stringify(chezB.style));
        assert.match(String(chezB.attribut), /font-size/,
          nom + ' : et le titre est RENDU avec ce style chez B ; lu : ' + JSON.stringify(chezB.attribut));
        pass(nom + ' : style posé, sauvegardé, et IDENTIQUE depuis un navigateur vierge.');
      } finally { await B.ctx.close(); }
    }

    // ── 5 bis. TOUS LES CHEMINS DE RENDU PORTENT LE STYLE ───────────────────────────────────
    // adocRenderCardHTML est une fonction UNIQUE, appelée par le carrousel, la présentation, le
    // mode plein écran, les pages PDF et l'export JPEG ; la vignette du chutier passe par
    // adocRenderClinicalDocument, donc par les mêmes renderers. On ne le croit pas sur parole :
    // on construit chaque sortie hors ligne et on lit la chaîne produite. Aucun appel au Worker.
    await ouvrir(DOCS.presentation(), 'r');
    await choisir('.adoc-sc-card-title');
    await poser('fontSizePt', '20');
    await A.page.waitForTimeout(300);
    await choisir('.adoc-sc-card-title');
    await poser('color', '#8a3f29');
    await A.page.waitForTimeout(350);
    const sorties = await A.page.evaluate(async () => {
      const art = window._adocArtifacts.r;
      const d = art._adocStructuredDoc;
      const snap = { sourceSnapshotId: d.sourceSnapshotId, entries: [] };
      const rendu = await window.adocRenderClinicalDocument(d, snap, null);
      const carte = d.blocks[0];
      return {
        'rendu du document (éditeur, export HTML, chutier)': rendu.html,
        'écran, tel qu’affiché': document.querySelector('.adoc-sc-card-title').outerHTML,
        'export autonome (présentation interactive)':
          typeof window.adocExportClinicalDocumentHTML === 'function'
            ? (await window.adocExportClinicalDocumentHTML(d, snap, null)).html || '' : 'NON TESTÉ',
      };
    });
    for (const [nom, html] of Object.entries(sorties)) {
      if (html === 'NON TESTÉ') { console.log('      – ' + nom + ' : non mesuré'); continue; }
      // La classe peut porter un suffixe à l'écran (« is-selected ») : on ne l'ancre donc pas
      // sur le guillemet fermant. Une première version de ce contrôle s'y est trompée et a
      // accusé le rendu alors que le style y était bel et bien.
      assert.match(String(html), /class="adoc-sc-card-title[^"]*"[^>]*style="[^"]*font-size/,
        nom + ' : le titre doit porter son style ; extrait : '
        + String(html).slice(0, 160));
      console.log('      ✓ ' + nom);
    }
    pass('chaque sortie construite hors ligne porte le style du titre (' 
      + Object.keys(sorties).filter((k) => sorties[k] !== 'NON TESTÉ').length + ' chemins).');

    // ── 6. MIGRATION : SANS titleStyle, AUCUN ATTRIBUT style ────────────────────────────────
    // L'invariant qui garantit « absent = affichage actuel exact », sans dépendre d'un fichier
    // de référence stocké.
    await ouvrir(DOCS.presentation(), 'migr');
    const sansStyle = await A.page.evaluate(() => ({
      carte: document.querySelector('.adoc-sc-card-title').hasAttribute('style'),
      champ: 'titleStyle' in window._adocArtifacts.migr._adocStructuredDoc.blocks[0].content,
    }));
    assert.equal(sansStyle.champ, false, 'repère : le document d’essai ne porte pas titleStyle');
    assert.equal(sansStyle.carte, false,
      'un titre sans titleStyle ne doit porter AUCUN attribut style — c’est la migration');
    pass('migration : sans titleStyle, le titre rendu ne porte aucun attribut style.');

    // ── 7. LE MESSAGE HONNÊTE RESTE POUR UNE PORTION, ET LÀ SEULEMENT ───────────────────────
    await choisir('.adoc-sc-card-title');
    await A.page.locator('.adoc-sc-card-title').first().click({ clickCount: 3 });
    await A.page.waitForTimeout(350);
    await A.page.evaluate(() => {
      const p = document.querySelector('[data-editor-scope]');
      p.value = 'selection'; p.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await A.page.waitForTimeout(200);
    await agir('bold');
    await A.page.waitForTimeout(350);
    assert.equal(await message(), 'La mise en forme d’une partie du titre n’est pas conservée.',
      'pour une PORTION de titre, le message honnête reste ; lu : ' + JSON.stringify(await message()));
    pass('la mise en forme d’une PORTION de titre le dit — c’est le seul cas qui reste.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await A.ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-titres-mis-en-forme — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
