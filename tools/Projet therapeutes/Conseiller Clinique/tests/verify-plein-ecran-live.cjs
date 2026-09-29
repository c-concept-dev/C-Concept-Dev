// Plein écran natif, mode live — ce qui EST éprouvable sans vrai plein écran.
//
// Playwright ne reproduit pas fidèlement l'API : Chromium sans interface accepte une demande faite
// APRÈS un await, alors qu'un vrai navigateur la refuserait (l'activation par geste ne survit pas au
// premier point de suspension d'une fonction async). Ce test ne peut donc PAS prouver que la place
// de l'appel est nécessaire — seulement qu'elle est respectée. Ce qui n'est pas éprouvé ici est
// listé dans le rapport, jamais présenté comme acquis.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-plein-ecran-live.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const carte = (i) => ({ id: 'card-' + i, type: 'card', citationIds: [], validation: {},
  content: { title: 'Diapositive ' + i, imageRef: null, imageAlt: null,
    blocks: [{ id: 'p' + i, type: 'paragraph', content: { text: 'Une phrase.' }, citationIds: [], validation: {} }] } });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Plein écran', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [carte(1), carte(2)],
};

// Espionne les VRAIES API, jamais nos fonctions : c'est le seul moyen de prouver que l'appel part
// pour de bon, sans rien exposer sur window pour les besoins du test.
const ESPION = `() => {
  window.__journal = [];
  window.__rejeter = false;
  const vraiDemander = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function () {
    window.__journal.push('requestFullscreen:' + (this.id || this.tagName));
    if (window.__rejeter) return Promise.reject(new Error('refusé par le navigateur'));
    return vraiDemander.call(this);
  };
  const vraiQuitter = Document.prototype.exitFullscreen;
  Document.prototype.exitFullscreen = function () {
    window.__journal.push('exitFullscreen');
    return vraiQuitter.call(this);
  };
  // Trace l'ordre réel : ce qui se passe AVANT la demande de plein écran.
  const vraiGetElementById = Document.prototype.getElementById;
  window.__tracerLectures = false;
  Document.prototype.getElementById = function (id) {
    if (window.__tracerLectures) window.__journal.push('getElementById:' + id);
    return vraiGetElementById.call(this, id);
  };
}`;

async function ouvrir(browser, avecEspion) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
    document.getElementById('cc-workspace')?.classList.add('open');
  });
  if (avecEspion) await page.evaluate(new Function('return (' + ESPION + ')')());
  return { page, erreurs };
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    // ── 1. LA DEMANDE PART, SUR L'OVERLAY, ET AVANT TOUT LE RESTE ────────────────────────────
    const a = await ouvrir(browser, true);
    await a.page.evaluate(d => {
      window._adocWsState = { storeKey: 'k' };
      window._adocArtifacts = { k: { _adocStructuredDoc: d } };
      window.__tracerLectures = true;
      return window.adocPresentOpen();
    }, DOC);
    await a.page.waitForTimeout(500);
    const j1 = await a.page.evaluate(() => window.__journal);
    assert.ok(j1.length, 'aucune trace : la demande de plein écran n\'est jamais partie');
    // La PREMIÈRE lecture du DOM de tout le parcours doit être celle de l'overlay, immédiatement
    // suivie de la demande — c'est ce qui prouve la place « première instruction ».
    assert.equal(j1[0], 'getElementById:cc-ws-present-overlay',
      'première opération : ' + j1[0] + ' — la demande doit précéder tout le reste');
    assert.equal(j1[1], 'requestFullscreen:cc-ws-present-overlay',
      'la cible doit être l\'overlay, pas la racine du document : ' + j1[1]);
    console.log('PASS 1/6  la demande part en premier, sur #cc-ws-present-overlay.');

    // ── 2. UN REFUS NE BLOQUE JAMAIS LA PRÉSENTATION ─────────────────────────────────────────
    const b = await ouvrir(browser, true);
    await b.page.evaluate(d => {
      window.__rejeter = true;
      window._adocWsState = { storeKey: 'k' };
      window._adocArtifacts = { k: { _adocStructuredDoc: d } };
      return window.adocPresentOpen();
    }, DOC);
    await b.page.waitForTimeout(600);
    const ouvert = await b.page.evaluate(() => {
      const o = document.getElementById('cc-ws-present-overlay');
      return { open: o.classList.contains('open'), hidden: o.hidden,
               diapo: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card') };
    });
    assert.equal(ouvert.open, true, 'plein écran refusé : la présentation doit s\'ouvrir quand même');
    assert.equal(ouvert.hidden, false);
    assert.equal(ouvert.diapo, true, 'et afficher sa première diapositive');
    assert.deepEqual(b.erreurs, [], 'un refus ne doit produire AUCUNE erreur de page : ' + b.erreurs.join(' | '));
    console.log('PASS 2/6  refus du navigateur : présentation ouverte normalement, zéro erreur.');

    // ── 3. FERMER QUITTE LE PLEIN ÉCRAN ──────────────────────────────────────────────────────
    await a.page.evaluate(() => { window.__journal = []; window.adocPresentClose(); });
    await a.page.waitForTimeout(300);
    const j3 = await a.page.evaluate(() => window.__journal);
    assert.ok(j3.includes('exitFullscreen'), 'adocPresentClose doit quitter le plein écran : ' + JSON.stringify(j3));
    // Et la fermeture reste complète.
    assert.equal(await a.page.evaluate(() => document.getElementById('cc-ws-present-overlay').hidden), true);
    console.log('PASS 3/6  « Fermer » quitte le plein écran — donc Échap aussi, qui passe par la même fonction.');

    // ── 4. FERMER SANS PLEIN ÉCRAN NE TENTE RIEN ─────────────────────────────────────────────
    // Sinon chaque fermeture produirait une promesse rejetée, et un jour une erreur non gérée.
    await a.page.evaluate(() => { window.__journal = []; window.adocPresentClose(); });
    await a.page.waitForTimeout(200);
    // Le journal porte aussi les lectures du DOM (traceur du point 1) : seule la sortie compte ici.
    const j4 = (await a.page.evaluate(() => window.__journal)).filter(x => /Fullscreen/i.test(x));
    assert.deepEqual(j4, [], 'aucune sortie ne doit être tentée quand aucun plein écran n\'est actif : '
      + JSON.stringify(j4));
    console.log('PASS 4/6  fermeture hors plein écran : aucune sortie tentée.');

    // ── 5. L'ÉCOUTEUR N'EST POSÉ QU'UNE FOIS, ET NE FERME PAS LA PRÉSENTATION ────────────────
    const c = await ouvrir(browser, false);
    const poses = await c.page.evaluate(() => {
      let n = 0;
      const vrai = document.addEventListener.bind(document);
      document.addEventListener = function (t, f, o) { if (/fullscreenchange/i.test(t)) n++; return vrai(t, f, o); };
      // Plusieurs ouvertures/fermetures : aucune ne doit reposer l'écouteur.
      for (let i = 0; i < 3; i++) { window.adocPresentInstallKeydownHandler && window.adocPresentInstallKeydownHandler(); }
      return n;
    });
    assert.equal(poses, 0, 'le gestionnaire clavier ne doit PAS poser l\'écouteur : il part dans l\'export, '
      + 'qui n\'embarque pas adocInstallerEcouteurPleinEcran — ' + poses + ' pose(s) détectée(s)');
    // La DÉCISION, rendue vérifiable : sortir du plein écran ne ferme pas la présentation.
    await c.page.evaluate(d => {
      window._adocWsState = { storeKey: 'k' };
      window._adocArtifacts = { k: { _adocStructuredDoc: d } };
      return window.adocPresentOpen();
    }, DOC);
    await c.page.waitForTimeout(500);
    const avant = await c.page.evaluate(() => document.getElementById('cc-ws-present-overlay').classList.contains('open'));
    await c.page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    await c.page.waitForTimeout(200);
    const apres = await c.page.evaluate(() => ({
      open: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
      etat: !!window._adocPresentState, drapeau: window._adocPleinEcranActif }));
    assert.equal(avant, true);
    assert.equal(apres.open, true, 'sortir du plein écran ne doit PAS fermer la présentation — '
      + 'une présentatrice qui appuie sur F11 ne doit pas perdre sa place');
    assert.equal(apres.etat, true, 'l\'état de présentation doit survivre');
    assert.equal(typeof apres.drapeau, 'boolean', 'le drapeau doit être tenu à jour par l\'écouteur');
    console.log('PASS 5/6  écouteur posé hors du chemin d\'export ; sortir du plein écran ne ferme pas la présentation.');

    // ── 6. L'EXPORT N'EST PAS CASSÉ — le seul contrôle qui compte ici ────────────────────────
    // adocPresentClose part dans l'export et appelle désormais adocQuitterPleinEcran : sans cette
    // fonction dans engineFnRefs, le bouton « Fermer » d'une présentation exportée lèverait une
    // ReferenceError au premier clic. Vérifié sur un export RÉELLEMENT construit, ouvert et CLIQUÉ.
    const atelier = await browser.newPage();
    await atelier.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
    await atelier.close();
    for (const nom of ['adocQuitterPleinEcran', 'adocPleinEcranActif']) {
      assert.ok(html.includes('function ' + nom), nom + ' doit être embarquée : adocPresentClose l\'appelle');
    }
    assert.ok(!html.includes('adocInstallerEcouteurPleinEcran'),
      'l\'écouteur ne doit PAS partir dans l\'export — ce lot ne touche pas au plein écran de l\'export');
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pleinecran-'));
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const exp = await browser.newPage();
    const errExp = [];
    exp.on('pageerror', e => errExp.push(e.message));
    await exp.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'), null, { timeout: 60000 });
    // LE clic qui aurait cassé.
    await exp.evaluate(() => { window.adocPresentClose(); });
    await exp.waitForTimeout(300);
    assert.deepEqual(errExp, [], 'erreur dans l\'export au clic sur Fermer : ' + errExp.join(' | '));
    assert.equal(await exp.evaluate(() => document.getElementById('cc-ws-present-overlay').hidden), true,
      'la présentation exportée doit se fermer normalement');
    await exp.close();
    fs.rmSync(dossier, { recursive: true, force: true });
    console.log('PASS 6/6  export construit, ouvert et « Fermer » CLIQUÉ : aucune ReferenceError.');

    assert.deepEqual(a.erreurs, [], 'erreurs de page : ' + a.erreurs.join(' | '));
    console.log('\nTOUT PASSE — 6/6, aucun appel réseau.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
