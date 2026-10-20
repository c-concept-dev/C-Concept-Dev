// Q1 (constat du 20 octobre) — LE MESSAGE NE DOIT PAS PROMETTRE CE QUE LE SCHÉMA NE TIENT PAS.
//
// LE GESTE, chez Christophe : il met le titre de la diapositive 1 en 20 pt. Le panneau répond
// « Modification appliquée. », le badge passe à « Sauvegardé », il ferme, il rouvre : le TEXTE
// du titre est là, la TAILLE a disparu. Rien ne l'avait prévenu.
//
// CAUSE ÉTABLIE : un titre (root:doc-title, root:card-title:<id>) n'a AUCUN champ de style au
// schéma. adocFindEditableBlock lui fabrique un objet temporaire ; le style posé dessus vit le
// temps de l'écran et rien ne l'écrit dans le document. Lui donner un champ est le lot Q1 — ce
// contrôle-ci ne corrige pas le modèle, il corrige le MENSONGE.
//
// Ce qui est mesuré, sur la page réelle : le message après un style posé sur un TITRE, et le
// message après le MÊME style posé sur un BLOC — qui, lui, est bel et bien sauvegardé et ne doit
// donc rien changer.
//
//   NODE_PATH=<playwright> node tests/verify-message-style-titre.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
const ATTENDU_TITRE = 'Appliqué à l’écran seulement : le style d’un titre n’est pas encore sauvegardé.';
const ATTENDU_BLOC = 'Modification appliquée.';
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const { serveur } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route('**/*', (r) => { const u = r.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);

  const message = () => page.evaluate(() => {
    const m = document.querySelector('.cc-editor-message');
    return m ? (m.textContent || '').trim() : null;
  });
  // On pose le style par le VRAI champ du panneau, jamais par un appel direct.
  const poser = (champ, valeur, portee) => page.evaluate((a) => {
    const p = document.querySelector('[data-editor-scope]');
    if (!p) throw new Error('le panneau « Texte et mise en forme » n’est pas ouvert');
    p.value = a.p; p.dispatchEvent(new Event('change', { bubbles: true }));
    const el = document.querySelector('[data-editor-style="' + a.c + '"]');
    if (!el) throw new Error('champ absent : ' + a.c);
    el.value = a.v; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { c: champ, v: valeur, p: portee || 'block' });
  const choisir = (selecteur) => page.evaluate(async (s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error('élément absent : ' + s);
    el.click();
    await new Promise((r) => setTimeout(r, 450));
  }, selecteur);
  const outils = async () => { await page.evaluate(() =>
    window.adocEditorRefreshControls && window.adocEditorRefreshControls());
    await page.waitForTimeout(200); };

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    await page.evaluate(async (d) => {
      window._adocArtifacts = { e: { name: d.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
        _adocClinicalDocumentId: null, _ccEditorDirty: false,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'e' });
      await window.adocOpenWorkspace('e');
    }, PRESENTATION);
    await page.waitForTimeout(600);

    // ── 1. LE TITRE D'UNE DIAPOSITIVE ────────────────────────────────────────────────────
    await choisir('.adoc-sc-card-title');
    await outils();
    await poser('fontSizePt', '20');
    await page.waitForTimeout(350);
    assert.equal(await message(), ATTENDU_TITRE,
      'sur un TITRE de diapositive, le message doit dire la vérité ; lu : '
      + JSON.stringify(await message()));
    pass('titre d’une diapositive, taille 20 pt : « ' + ATTENDU_TITRE + ' »');

    // Le même message pour les autres réglages du panneau, et pour la remise à zéro : un seul
    // d'entre eux qui mentirait suffirait à tromper.
    for (const [champ, valeur] of [['fontFamily', 'Lora'], ['color', '#2f4f4f'],
                                   ['textAlign', 'center']]) {
      await choisir('.adoc-sc-card-title'); await outils();
      await poser(champ, valeur);
      await page.waitForTimeout(300);
      assert.equal(await message(), ATTENDU_TITRE,
        'réglage « ' + champ + ' » sur un titre : même message ; lu : ' + JSON.stringify(await message()));
    }
    await choisir('.adoc-sc-card-title'); await outils();
    await page.evaluate(() => {
      const b = document.querySelector('[data-editor-action="reset"]');
      if (!b) throw new Error('champ absent : bouton de remise à zéro');
      b.click();
    });
    await page.waitForTimeout(300);
    assert.equal(await message(), ATTENDU_TITRE,
      'la remise à zéro sur un titre dit la même chose ; lu : ' + JSON.stringify(await message()));
    // « Texte sélectionné » dans un titre : nommé par Christophe, donc mesuré. Le gras passe
    // par adocEditorAction, qui appelle adocEditorApplyStyle — même sortie, même message.
    // Une VRAIE sélection, au triple-clic : le cœur suit la sélection par ses propres
    // écouteurs (_adocEditorRange), qu'une sélection fabriquée en script ne renseigne pas — une
    // première version de ce contrôle s'y est heurtée et a reçu, à juste titre,
    // « Sélectionnez le texte à mettre en forme. »
    await choisir('.adoc-sc-card-title'); await outils();
    await page.locator('.adoc-sc-card-title').first().click({ clickCount: 3 });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const p = document.querySelector('[data-editor-scope]');
      p.value = 'selection'; p.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const b = document.querySelector('[data-editor-action="bold"]');
      if (!b) throw new Error('champ absent : bouton gras');
      b.click();
    });
    await page.waitForTimeout(350);
    assert.equal(await message(), ATTENDU_TITRE,
      '« Texte sélectionné » dans un titre dit la même chose ; lu : ' + JSON.stringify(await message()));
    pass('les quatre autres réglages, la remise à zéro et « Texte sélectionné » disent la même chose.');

    // ── 2. LE TITRE DU DOCUMENT, sur une FICHE (seule forme où il est modifiable) ─────────
    // Une présentation n'a pas de .adoc-sc-cover-title : ce n'est pas un oubli, c'est le rendu.
    await page.evaluate(async (d) => {
      const doc = JSON.parse(JSON.stringify(d));
      doc.documentKind = 'fiche';
      doc.blocks = [{ id: 'f1', type: 'paragraph', content: { text: 'Un paragraphe de fiche.' },
        citationIds: [], validation: {} }];
      doc.narration = [];
      window._adocArtifacts.f = Object.assign({}, window._adocArtifacts.e,
        { _adocStructuredDoc: doc });
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'f' });
      await window.adocOpenWorkspace('f');
    }, PRESENTATION);
    await page.waitForTimeout(600);
    await choisir('.adoc-sc-cover-title');
    await outils();
    await poser('fontSizePt', '22');
    await page.waitForTimeout(350);
    assert.equal(await message(), ATTENDU_TITRE,
      'sur le TITRE DU DOCUMENT aussi ; lu : ' + JSON.stringify(await message()));
    pass('titre du document (fiche), taille 22 pt : même message.');

    // ── 2 bis. LE TITRE D'UNE CARTE DE CARROUSEL ─────────────────────────────────────────
    // Même forme d'identifiant (root:card-title:<id>), donc même absence d'emplacement de style.
    await page.evaluate(async (d) => {
      const doc = JSON.parse(JSON.stringify(d));
      doc.documentKind = 'carrousel';
      doc.narration = [];
      window._adocArtifacts.k = Object.assign({}, window._adocArtifacts.e,
        { _adocStructuredDoc: doc });
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'k' });
      await window.adocOpenWorkspace('k');
    }, PRESENTATION);
    await page.waitForTimeout(600);
    await choisir('.adoc-sc-card-title');
    await outils();
    await poser('fontSizePt', '21');
    await page.waitForTimeout(350);
    assert.equal(await message(), ATTENDU_TITRE,
      'sur le titre d’une carte de CARROUSEL aussi ; lu : ' + JSON.stringify(await message()));
    pass('titre d’une carte de carrousel, taille 21 pt : même message.');

    // ── 2 ter. L'OBJET ET LE PUBLIC : LE PANNEAU NE S'OUVRE PAS ──────────────────────────
    // Christophe demande de le DIRE pour chacun. Mesuré, pas lu : les ancres de sélection du
    // cœur sont « .adoc-sc-block, .adoc-sc-cover-title, .adoc-sc-card-title » — l'objet
    // (.adoc-sc-cover-category) et le public (.adoc-sc-cover-audience) n'y figurent pas. Leur
    // TEXTE est modifiable et bien sauvegardé (adocSyncEditedRootFieldsToDoc) ; leur style ne
    // peut pas être demandé du tout, il n'y a donc aucun message à afficher.
    await page.evaluate(async () => {
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'f' });
      await window.adocOpenWorkspace('f');
    });
    await page.waitForTimeout(600);
    for (const [nom, sel] of [['objet (purpose)', '.adoc-sc-cover-category'],
                              ['public (audience)', '.adoc-sc-cover-audience']]) {
      const present = await page.evaluate((x) => !!document.querySelector(x), sel);
      assert.equal(present, true, nom + ' est bien rendu sur une fiche');
      await page.evaluate(() => {
        const p = document.querySelector('.cc-block-edit-panel');
        if (p) p.remove();
      });
      await page.evaluate((x) => document.querySelector(x).click(), sel);
      await page.waitForTimeout(500);
      const panneau = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
      assert.equal(panneau, false,
        nom + ' : le panneau de mise en forme ne s’ouvre PAS — aucun style ne peut y être '
        + 'demandé, donc aucun message à afficher');
      // Et son TEXTE, lui, est bien un champ du document.
      const dansLeDoc = await page.evaluate((x) => {
        const d = window._adocArtifacts.f._adocStructuredDoc;
        return x.includes('category') ? typeof d.purpose : typeof d.audience;
      }, sel);
      assert.equal(dansLeDoc, 'string', nom + ' : son TEXTE est un champ du document, sauvegardé');
    }
    pass('objet et public : le panneau ne s’ouvre pas (leur style n’est pas demandable) ; '
      + 'leur texte, lui, est un champ du document et il est sauvegardé.');

    // ── 3. UN BLOC NE DOIT RIEN CHANGER ──────────────────────────────────────────────────
    // C'est la moitié du contrôle : un message qui s'afficherait partout n'avertirait de rien.
    await choisir('#f1');
    await outils();
    await poser('fontSizePt', '18');
    await page.waitForTimeout(350);
    assert.equal(await message(), ATTENDU_BLOC,
      'sur un BLOC, le message reste celui d’avant — un bloc est bel et bien sauvegardé ; lu : '
      + JSON.stringify(await message()));
    // Et la preuve que ce bloc, lui, est écrit dans le document.
    assert.equal(await page.evaluate(() =>
      window._adocArtifacts.f._adocStructuredDoc.blocks[0].style.fontSizePt), 18,
      'le style du bloc est RÉELLEMENT dans le document, contrairement à celui d’un titre');
    pass('bloc, taille 18 pt : « ' + ATTENDU_BLOC + " », et le style est bien dans le document.");

    // ── 4. ET LE TITRE, LUI, N'EST TOUJOURS PAS DANS LE DOCUMENT ─────────────────────────
    // Le message dit vrai : on le vérifie, sinon il serait exact par hasard.
    const titreDansLeDoc = await page.evaluate(() => {
      const d = window._adocArtifacts.e._adocStructuredDoc;
      return { carte: d.blocks[0].content.titleStyle === undefined
        && d.blocks[0].style === undefined,
        racine: d.titleStyle === undefined };
    });
    assert.equal(titreDansLeDoc.carte, true,
      'aucun style de titre de carte n’est écrit dans le document — le message dit vrai');
    assert.equal(titreDansLeDoc.racine, true,
      'aucun style de titre de document non plus');
    pass('le message est exact : le document ne porte AUCUN style de titre.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-message-style-titre — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
