// Q7 — ENREGISTRER : UN BOUTON, UN RACCOURCI, UN ÉTAT QUI DIT LA VÉRITÉ.
//
// Lu sur la page réelle, contre un FAUX Worker qui garde les versions en mémoire et les traite
// comme immuables. Jamais le vrai Worker, jamais la clé de Christophe.
//
//   NODE_PATH=<playwright> node tests/verify-enregistrement-clair.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const { creerFauxWorker } = require('./faux-worker-documents.cjs');
const { PRESENTATION } = require('./fixtures-page-generee.cjs');

const RACINE = path.join(__dirname, '..');
let n = 0;
const pass = (m) => { n++; console.log('PASS ' + n + '  ' + m); };

(async () => {
  const { serveur, etat } = creerFauxWorker(RACINE, {});
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;
  const base = 'http://127.0.0.1:' + port;
  const nav = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith(base + '/') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.addInitScript((b) => { try { localStorage.setItem('workerUrl', b);
    localStorage.setItem('workerApiKey', 'cle-factice-de-controle'); } catch (e) {} }, base);

  const ouvrir = (doc) => page.evaluate(async (d) => {
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts.e = { name: d.title, _adocGenerationEngine: 'structured',
      _adocStructuredDoc: JSON.parse(JSON.stringify(d)), _adocStructuredSnapshot: null,
      _adocCapabilities: { workspace: true, persist: true, fineCitations: true,
        blockEditing: true, transform: true, export: true, qualityControlledExport: true } };
    return !!(await window.adocOpenWorkspace('e'));
  }, doc);
  const lire = () => page.evaluate(() => {
    const b = document.getElementById('cc-ws-save-btn');
    const s = document.getElementById('cc-ws-save-status');
    return { libelle: ((b && b.querySelector('span')) || {}).textContent || '',
             infobulle: b ? b.getAttribute('title') : null,
             nomAccessible: b ? b.getAttribute('aria-label') : null,
             actif: b ? !b.disabled : null,
             etat: s ? s.textContent : null,
             docId: (window._adocArtifacts.e || {})._adocClinicalDocumentId || null };
  });
  const modifier = (texte) => page.evaluate((t) => {
    const d = window._adocArtifacts.e._adocStructuredDoc;
    d.blocks[0].content.blocks[0].content.text = t;
    // La VRAIE fonction de l'éditeur : elle pose le drapeau ET rafraîchit l'état affiché.
    window.adocEditorMarkDirty();
    return true;
  }, texte);

  try {
    await page.goto(base + '/studio-clinique.html?atelier-local=1');
    await page.waitForFunction(() => typeof window.adocOpenWorkspace === 'function', { timeout: 30000 });
    assert.ok(await ouvrir(PRESENTATION), 'la présentation doit s\'ouvrir');

    // ── 2.1 — UN SEUL LIBELLÉ, DANS TOUS LES CAS ──────────────────────────────────────────
    const neuf = await lire();
    assert.equal(neuf.libelle, 'Enregistrer', 'document neuf : le libellé est « Enregistrer »');
    assert.equal(neuf.infobulle, 'Enregistrer le document',
      'document neuf : l\'infobulle le dit ; vue : ' + JSON.stringify(neuf.infobulle));
    assert.equal(neuf.etat, 'Non enregistré', 'document jamais enregistré : « Non enregistré »');
    pass('document neuf : « Enregistrer », infobulle « Enregistrer le document », état « Non enregistré ».');

    // ── 2.3 — APRÈS UN ENREGISTREMENT RÉUSSI ──────────────────────────────────────────────
    await page.evaluate(() => window.adocWsSave());
    await page.waitForFunction(() => /Enregistré à/.test(
      (document.getElementById('cc-ws-save-status') || {}).textContent || ''), { timeout: 20000 });
    const apres = await lire();
    assert.ok(/^Enregistré à \d{1,2} h \d{2}$/.test(apres.etat),
      'l\'état doit dire l\'heure en français : ' + JSON.stringify(apres.etat));
    assert.equal(apres.libelle, 'Enregistrer', 'le libellé reste « Enregistrer » — plus de « Nouvelle version »');
    assert.equal(apres.infobulle, 'Enregistre vos modifications (la version précédente reste conservée)',
      'l\'infobulle change, pas le libellé ; vue : ' + JSON.stringify(apres.infobulle));
    assert.ok(apres.docId, 'le document a reçu un identifiant');
    assert.equal(etat.documents.size, 1, 'un document créé côté Worker');
    pass('enregistré : « ' + apres.etat + ' », libellé inchangé, infobulle « la version précédente reste conservée ».');

    // ── 2.3 — UNE MODIFICATION REMET L'ÉTAT ───────────────────────────────────────────────
    await modifier('Un texte modifié pour l’essai.');
    const sale = await lire();
    assert.equal(sale.etat, 'Modifications non enregistrées', 'une modification le dit : ' + sale.etat);
    assert.equal(sale.actif, true, '« Enregistrer » est actif dès qu\'il y a une modification');
    pass('après une modification : « Modifications non enregistrées », bouton actif.');

    // ── 2.5 — LE DEUXIÈME ENREGISTREMENT AJOUTE UNE VERSION ───────────────────────────────
    await page.evaluate(() => window.adocWsSave());
    await page.waitForFunction(() => /Enregistré à/.test(
      (document.getElementById('cc-ws-save-status') || {}).textContent || ''), { timeout: 20000 });
    const doc1 = [...etat.documents.values()][0];
    assert.equal(doc1.versions.length, 2, 'deux versions, la première conservée : ' + doc1.versions.length);
    assert.equal(etat.documents.size, 1, 'et toujours UN seul document');
    pass('deuxième enregistrement : 2 versions du même document, la première intacte.');

    // ── 2.2 — ⌘S ET Ctrl+S ────────────────────────────────────────────────────────────────
    for (const touche of ['Meta+s', 'Control+s']) {
      await modifier('Modifié avant ' + touche);
      const avant = doc1.versions.length;
      await page.keyboard.press(touche);
      await page.waitForFunction((n) => true, {}, 0).catch(() => {});
      await page.waitForTimeout(900);
      assert.ok(doc1.versions.length > avant, touche + ' doit enregistrer : ' + doc1.versions.length);
    }
    pass('⌘S et Ctrl+S enregistrent : ' + doc1.versions.length + ' versions au total.');

    // ── 2.3 — UN ÉCHEC NE DIT JAMAIS « ENREGISTRÉ » ───────────────────────────────────────
    etat.panne = true;
    await modifier('Modifié avant la panne');
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(1200);
    const echec = await lire();
    etat.panne = false;
    assert.equal(echec.etat, 'Modifications non enregistrées',
      'après un échec, l\'état reste « Modifications non enregistrées » : ' + echec.etat);
    pass('un enregistrement qui échoue laisse « Modifications non enregistrées ».');

    // ── (2) « ENREGISTRER » N'EST JAMAIS GRISÉ PAR LE DRAPEAU ─────────────────────────────
    // Décision : on réenregistre TOUJOURS, même sans changement. Une version de plus ne coûte
    // qu'une ligne, et les versions ne sont ni affichées ni écrasées ; une comparaison de
    // contenu qui se tromperait, elle, ferait croire à l'utilisatrice que son travail est
    // enregistré alors qu'il ne l'est pas. Les deux risques ne pèsent pas le même poids.
    // Le pas précédent a simulé une panne : on remet le document au propre avant de mesurer.
    await page.evaluate(() => window.adocWsSave());
    await page.waitForFunction(() => /Enregistré/.test(
      (document.getElementById('cc-ws-save-status') || {}).textContent || ''), { timeout: 20000 });
    const proprePuisClic = await page.evaluate(async () => {
      const b = document.getElementById('cc-ws-save-btn');
      const art = window._adocArtifacts.e;
      return { dirty: !!art._ccEditorDirty, actif: !b.disabled };
    });
    assert.equal(proprePuisClic.dirty, false, 'le document est propre après enregistrement');
    assert.equal(proprePuisClic.actif, true,
      '« Enregistrer » reste ACTIF même sans modification : le drapeau ne grise jamais');
    const avantRedondant = doc1.versions.length;
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(900);
    assert.equal(doc1.versions.length, avantRedondant + 1,
      'un enregistrement sans changement ajoute quand même une version : ' + doc1.versions.length);
    pass('« Enregistrer » n\'est jamais grisé, et un clic sans changement enregistre quand même ('
      + doc1.versions.length + ' versions).');

    // ── (4) et 2.5 — UN DOCUMENT ROUVERT DEPUIS « MES CRÉATIONS » ─────────────────────────
    const idDoc = [...etat.documents.keys()][0];
    const rouvert = await page.evaluate(async (id) => {
      window._adocArtifacts = {};
      const ok = await window.adocOpenSavedClinicalDocument(id);
      await new Promise((r) => setTimeout(r, 500));
      const s = document.getElementById('cc-ws-save-status');
      const b = document.getElementById('cc-ws-save-btn');
      const cle = Object.keys(window._adocArtifacts)[0];
      return { ok: !!ok, etat: s ? s.textContent : null,
               libelle: ((b && b.querySelector('span')) || {}).textContent || '',
               actif: b ? !b.disabled : null,
               docId: (window._adocArtifacts[cle] || {})._adocClinicalDocumentId || null };
    }, idDoc);
    assert.ok(rouvert.ok, 'le document doit se rouvrir depuis la liste');
    assert.ok(/^Enregistré le \d{1,2} [^ ]+ à \d{1,2} h \d{2}$/.test(rouvert.etat),
      'un document rouvert dit le JOUR et l\'heure : ' + JSON.stringify(rouvert.etat));
    assert.equal(rouvert.libelle, 'Enregistrer', 'le libellé reste « Enregistrer »');
    assert.equal(rouvert.actif, true, 'et le bouton est actif');
    assert.equal(rouvert.docId, idDoc, 'c\'est bien le MÊME document');
    pass('document rouvert : « ' + rouvert.etat + ' », bouton actif, même identifiant.');

    // 2.5 — modifié puis enregistré : une version du MÊME document, jamais un nouveau.
    const avantRouvert = etat.documents.get(idDoc).versions.length;
    await page.evaluate(() => {
      const cle = Object.keys(window._adocArtifacts)[0];
      const d = window._adocArtifacts[cle]._adocStructuredDoc;
      d.blocks[0].content.blocks[0].content.text = 'Modifié après réouverture.';
      window.adocEditorMarkDirty();
    });
    await page.evaluate(() => window.adocWsSave());
    await page.waitForTimeout(900);
    assert.equal(etat.documents.size, 1, 'toujours UN document, jamais un second');
    assert.equal(etat.documents.get(idDoc).versions.length, avantRouvert + 1,
      'une version de plus sur le MÊME document');
    pass('rouvert puis modifié puis enregistré : version de plus du même document, pas un nouveau.');

    assert.deepEqual(erreurs, [], 'aucune erreur de page : ' + JSON.stringify(erreurs.slice(0, 2)));
  } finally {
    await ctx.close(); await nav.close(); serveur.close();
  }
  console.log('\nPASS verify-enregistrement-clair — ' + n + ' contrôles.');
})().catch((e) => { console.error('\nÉCHEC  ' + (e && e.message)); process.exit(1); });
