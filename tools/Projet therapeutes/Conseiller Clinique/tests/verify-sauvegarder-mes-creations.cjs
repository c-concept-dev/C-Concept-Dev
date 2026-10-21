// Q7 — « SAUVEGARDER » MET À JOUR LE DOCUMENT DE « MES CRÉATIONS », IL N'EN CRÉE PAS UN AUTRE.
//
// La demande de Christophe, en une phrase : sauvegarder le document sur lequel il travaille,
// pour le retrouver à la prochaine session, sur n'importe quel ordinateur. Deux façons de la
// trahir, aussi graves l'une que l'autre :
//   — sauvegarder deux fois ferait DEUX entrées dans « Mes créations » : il ne saurait plus
//     laquelle est la bonne ;
//   — la réouverture rendrait une version ANCIENNE : son travail serait perdu sans un mot.
// Les deux sont donc mesurées, et la seconde depuis un contexte de navigateur ISOLÉ ET VIERGE —
// un « autre ordinateur » — car c'est là que la promesse se tient ou se rompt.
//
//   NODE_PATH=<playwright> node tests/verify-sauvegarder-mes-creations.cjs
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

// Une date FIXE, côté serveur : l'état d'un document rouvert doit la rendre mot pour mot.
const QUAND = '2026-10-19T12:32:00.000Z';   // 19 octobre, 14 h 32 à Paris
const TITRE = 'Le document de travail de Christophe';

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, { horloge: () => QUAND });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  const nav = await (process.env.STUDIO_TEST_BROWSER === 'webkit' ? webkit : chromium).launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const erreurs = [];

  // Un contexte = un ordinateur. Rien n'est partagé entre eux que le faux Worker.
  const ordinateur = async (nom, reponse) => {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(nom + ' : ' + e.message));
    page.on('dialog', (d) => (reponse && reponse() !== false ? d.accept() : d.accept()).catch(() => {}));
    await page.route('**/*', (r) => { const u = r.request().url();
      return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort(); });
    await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
      localStorage.setItem('workerApiKey', 'factice'); } catch (e) {} }, base);
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    return { ctx, page };
  };

  const liste = (page) => page.evaluate(async () => {
    const r = await fetch(localStorage.getItem('workerUrl').replace(/\/+$/, '') + '/clinical-documents',
      { headers: { 'X-API-Key': localStorage.getItem('workerApiKey') } });
    return ((await r.json()).documents || []).map((d) => ({ id: d.document_id, titre: d.title }));
  });
  const etatAffiche = (page) => page.evaluate(() =>
    (document.getElementById('cc-ws-save-status') || {}).textContent || '');
  // On modifie par le DOM, jamais le document en mémoire : adocWsSave resynchronise depuis le
  // DOM juste avant d'écrire (adocSyncEditedStructuredBlocksToDoc / ...RootFields), si bien
  // qu'une retouche posée seulement en mémoire serait ÉCRASÉE par ce qui est affiché. Une
  // première version de ce contrôle s'y est trompée et a cru que B lisait une version ancienne.
  const retoucherTitreDeCarte = (page, texte) => page.evaluate((t) => {
    const el = document.querySelector('.adoc-sc-card-title');
    if (!el) throw new Error('aucun titre de carte à l’écran');
    const leaf = el.matches('[data-cc-editor-leaf]') ? el : el.querySelector('[data-cc-editor-leaf]');
    if (!leaf) throw new Error('le titre de carte n’est pas une feuille modifiable');
    leaf.dispatchEvent(new Event('focusin', { bubbles: true }));
    leaf.focus();
    leaf.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: t }));
    leaf.textContent = t;
    leaf.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
  }, texte);
  const bouton = (page) => page.evaluate(() => {
    const b = document.getElementById('cc-ws-save-btn');
    if (!b) return null;
    return { grise: !!b.disabled, cache: !!b.hidden,
      libelle: (b.querySelector('span') || {}).textContent || '',
      infobulle: b.title || '' };
  });

  const A = await ordinateur('A');
  try {
    // ── A. UN DOCUMENT NEUF, SAUVEGARDÉ, APPARAÎT UNE FOIS ────────────────────────────────
    await A.page.evaluate(async (a) => {
      const doc = JSON.parse(JSON.stringify(a.d)); doc.title = a.t;
      window._adocArtifacts = { e: { name: doc.title, _adocGenerationEngine: 'structured',
        _adocStructuredDoc: doc, _adocStructuredSnapshot: null,
        _adocClinicalDocumentId: null, _ccEditorDirty: true,
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
          blockEditing: true, transform: true, export: true, qualityControlledExport: true } } };
      await window.adocOpenWorkspace('e');
    }, { d: PRESENTATION, t: TITRE });
    await A.page.waitForTimeout(500);

    // (2) LE BOUTON N'EST JAMAIS GRISÉ — mesuré AVANT la première sauvegarde (drapeau levé),
    // puis APRÈS (drapeau retombé) : c'est le second cas qui tentait de griser.
    let b = await bouton(A.page);
    assert.equal(b.cache, false, 'le bouton « Sauvegarder » est visible dès l’ouverture');
    assert.equal(b.grise, false, 'il n’est PAS grisé avant la première sauvegarde');
    assert.equal(b.libelle, 'Sauvegarder', 'son libellé est « Sauvegarder » ; lu : ' + JSON.stringify(b.libelle));

    await A.page.evaluate(() => window.adocWsSave());
    await A.page.waitForTimeout(900);
    const id = await A.page.evaluate(() => window._adocArtifacts.e._adocClinicalDocumentId);
    assert.ok(id, 'le serveur rend un identifiant');
    let L = await liste(A.page);
    assert.equal(L.filter((d) => d.titre === TITRE).length, 1,
      'UNE seule entrée dans « Mes créations » ; lues : ' + JSON.stringify(L.map((d) => d.titre)));
    pass('A — un document neuf sauvegardé apparaît UNE fois dans « Mes créations ».');

    b = await bouton(A.page);
    assert.equal(b.grise, false, 'après une sauvegarde réussie (drapeau retombé), le bouton reste NON grisé');
    assert.equal(await A.page.evaluate(() => window._adocArtifacts.e._ccEditorDirty), false,
      'repère : le drapeau est bien retombé — c’est donc bien le cas qui grisait');
    assert.match(b.infobulle, /^Sauvegarde vos modifications/,
      'l’infobulle dit la nuance ; lue : ' + JSON.stringify(b.infobulle));
    pass('(2) « Sauvegarder » n’est JAMAIS grisé, drapeau levé comme retombé ; infobulle juste.');

    // ── B. ROUVERT, MODIFIÉ, SAUVEGARDÉ DEUX FOIS : TOUJOURS UNE SEULE ENTRÉE ─────────────
    await A.page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), id);
    await A.page.waitForTimeout(900);
    assert.equal(await A.page.evaluate(() => window._adocWsState.storeKey), 'adocArt_saved_' + id,
      'A travaille bien sur le document rouvert');

    // (4) L'ÉTAT D'UN DOCUMENT ROUVERT : la date vient du serveur, jamais du navigateur.
    const lu = await etatAffiche(A.page);
    assert.match(lu, /^Sauvegardé le 19 oct\.? à 14 h 32$/,
      'un document rouvert dit QUAND il a été sauvegardé ; lu : ' + JSON.stringify(lu));
    pass('(4) état d’un document rouvert : « ' + lu + ' », date prise sur version.created_at du serveur.');

    for (const k of [1, 2]) {
      await retoucherTitreDeCarte(A.page, 'Première page, retouche ' + k);
      await A.page.waitForTimeout(400);
      assert.equal(await A.page.evaluate(() =>
        !!window._adocArtifacts[window._adocWsState.storeKey]._ccEditorDirty), true,
        'la retouche n°' + k + ' lève bien le drapeau (sinon on mesurerait une sauvegarde à vide)');
      await A.page.evaluate(() => window.adocWsSave());
      await A.page.waitForTimeout(900);
      L = await liste(A.page);
      assert.equal(L.length, 1, 'après la sauvegarde n°' + k
        + ', « Mes créations » ne compte qu’UNE entrée ; lues : ' + JSON.stringify(L));
      assert.equal(L[0].id, id, 'et c’est le MÊME identifiant (' + id + ')');
    }
    assert.equal(etat.documents.get(id).versions.length, 3,
      'le serveur détient 3 versions (la création + les deux sauvegardes) : rien n’est écrasé ; '
      + 'détenues : ' + etat.documents.get(id).versions.length);
    pass('B — rouvert, modifié, sauvegardé DEUX fois : toujours UNE entrée, même identifiant, '
      + '3 versions conservées côté serveur.');

    // ── B (suite). UN AUTRE ORDINATEUR, VIERGE, REND LE DERNIER ÉTAT ──────────────────────
    const Bord = await ordinateur('B');
    try {
      const fuite = await Bord.page.evaluate((t) => {
        const tout = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (String(localStorage.getItem(k)).includes(t)) tout.push(k);
        }
        return tout;
      }, TITRE);
      assert.deepEqual(fuite, [], 'B est vierge : rien du document dans son stockage ; '
        + 'clés fautives : ' + JSON.stringify(fuite));
      const vuB = await Bord.page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), id);
      await Bord.page.waitForTimeout(900);
      assert.equal(vuB, true, 'B ouvre le document');
      assert.equal(await Bord.page.evaluate(() =>
        window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.blocks[0].content.title),
        'Première page, retouche 2',
        'B lit le DERNIER état sauvegardé, pas un état antérieur');
      assert.equal(await Bord.page.evaluate(() =>
        !!window._adocArtifacts[window._adocWsState.storeKey]._ccEditorDirty), false,
        'et rien n’est en attente chez B');
      pass('B (suite) — un ordinateur ISOLÉ et VIERGE rend le DERNIER état, identique au sauvegardé.');
    } finally { await Bord.ctx.close(); }

    // ── C. « SAUVEGARDER SOUS » CRÉE UNE SECONDE ENTRÉE ───────────────────────────────────
    await A.page.evaluate(() => { window.prompt = () => 'Une copie pour essayer autrement'; });
    await A.page.evaluate(() => window.adocWsSaveAs());
    await A.page.waitForTimeout(900);
    L = await liste(A.page);
    assert.equal(L.length, 2, '« Sauvegarder sous » crée une SECONDE entrée ; lues : '
      + JSON.stringify(L.map((d) => d.titre)));
    assert.ok(L.some((d) => d.titre === TITRE), 'l’original reste dans la liste');
    assert.ok(L.some((d) => d.titre === 'Une copie pour essayer autrement'), 'la copie y est aussi');
    assert.notEqual(L[0].id, L[1].id, 'et ce sont deux identifiants différents');
    const copieId = L.find((d) => d.titre === 'Une copie pour essayer autrement').id;
    assert.equal(await A.page.evaluate(() => window._adocArtifacts[window._adocWsState.storeKey]._adocClinicalDocumentId), copieId,
      'la copie devient le document actif');
    assert.equal(etat.documents.get(id).versions.length, 3, 'la version courante de l’original ne change pas');
    const Copie = await ordinateur('Copie');
    try {
      assert.equal(await Copie.page.evaluate((i) => window.adocOpenSavedClinicalDocument(i), copieId), true,
        'la copie s’ouvre sur un autre navigateur vierge');
      const noms = await Copie.page.evaluate(() => ({
        json: window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc.title,
        barre: document.getElementById('cc-ws-title').textContent,
      }));
      assert.deepEqual(noms, { json: 'Une copie pour essayer autrement', barre: 'Une copie pour essayer autrement' },
        'le JSON et l’en-tête rouverts portent le titre de la liste');
    } finally { await Copie.ctx.close(); }
    pass('C — « Sauvegarder sous » crée une SECONDE entrée, sans toucher à la première.');

    // ── D. LE DOCUMENT SUPPRIMÉ ENTRE-TEMPS ───────────────────────────────────────────────
    const vise = await A.page.evaluate(() => window._adocArtifacts[window._adocWsState.storeKey]._adocClinicalDocumentId);
    etat.documents.delete(vise); etat.supprimes.add(vise);
    const avant = [...etat.documents.values()].length;
    let question = null;
    A.page.on('dialog', (d) => { question = d.message(); d.accept().catch(() => {}); });
    await retoucherTitreDeCarte(A.page, 'Après la suppression');
    await A.page.waitForTimeout(400);
    await A.page.evaluate(() => window.adocWsSave());
    await A.page.waitForTimeout(1200);
    assert.ok(question && /supprim/i.test(question),
      'le document supprimé entre-temps pose une question ; lue : ' + JSON.stringify(question));
    assert.match(question, /sauvegarder/i,
      'et elle emploie le vocabulaire de la sauvegarde ; lue : ' + JSON.stringify(question));
    assert.equal([...etat.documents.values()].length, avant + 1,
      'une acceptation crée un NOUVEAU document, elle ne ressuscite pas l’ancien');
    assert.notEqual(await A.page.evaluate(() =>
      window._adocArtifacts[window._adocWsState.storeKey]._adocClinicalDocumentId), vise,
      'et son identifiant n’est plus celui du document supprimé');
    pass('D — document supprimé entre-temps : question posée dans le bon vocabulaire, '
      + 'acceptation = un nouveau document.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await A.ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-sauvegarder-mes-creations — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
