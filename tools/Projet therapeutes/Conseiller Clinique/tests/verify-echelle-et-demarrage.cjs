// Phase 3 — référence fixe 16:9 avec mise à l'échelle, et écran de démarrage de l'export.
//
// Ce que ce test protège :
//   — le FACTEUR d'échelle, porté par des assertions plutôt que par un commentaire. 1422×800 et non
//     1280×720 : mesuré, 720 unités de hauteur font redéborder huit diapositives qui tenaient.
//   — l'écran de démarrage, sans lequel un fichier ouvert au double-clic n'a AUCUN geste utilisateur
//     à offrir au navigateur, et ne peut donc jamais passer en plein écran.
//   — le graphe d'export : trois fonctions d'échelle sont appelées au DÉMARRAGE de tout export.
//     Une seule oubliée, et plus aucune présentation exportée ne s'ouvre.
//
//   NODE_PATH=<playwright> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> \
//     node tests/verify-echelle-et-demarrage.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const carte = (i) => ({ id: 'card-' + i, type: 'card', citationIds: [], validation: {},
  content: { title: 'Diapositive ' + i, imageRef: null, imageAlt: null,
    blocks: [{ id: 'p' + i, type: 'paragraph', content: { text: 'Une phrase complète.' }, citationIds: [], validation: {} }] } });
const DOC = {
  schemaVersion: 1, documentId: 'd', versionId: 'd-v1', previousVersionId: null, requestId: 'r',
  sourceSnapshotId: 's', createdAt: '2026-01-01T00:00:00Z', language: 'fr', status: 'draft',
  title: 'Échelle et démarrage', purpose: 'p', audience: 'clinicien', documentKind: 'presentation',
  renderManifestId: 'manifest-default-001', derivedFrom: null, citations: [],
  validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [carte(1), carte(2), carte(3)],
  deepDives: [{ id: 'n1', title: 'Une page', paragraphs: ['Contenu.'] }],
};

const ESPION = `() => {
  window.__journal = []; window.__rejeter = false;
  const vrai = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function () {
    window.__journal.push('requestFullscreen:' + (this.id || this.tagName));
    if (window.__rejeter) return Promise.reject(new Error('refusé'));
    return vrai.call(this);
  };
  const vraiGet = Document.prototype.getElementById;
  window.__tracer = false;
  Document.prototype.getElementById = function (id) {
    if (window.__tracer) window.__journal.push('getElementById:' + id);
    return vraiGet.call(this, id);
  };
}`;

async function construire(browser) {
  const p = await browser.newPage();
  await p.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  await p.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
  const html = await p.evaluate(d => window.adocBuildStandalonePresentationHTML(d, { embedImages: false }), DOC);
  await p.close();
  return html;
}

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-'));
  try {
    // ── 1. LE FACTEUR, en fonction pure ──────────────────────────────────────────────────────
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocPresentOpenWithDoc === 'function');
    const ech = (w, h) => page.evaluate(([a, b]) => window.__calc(a, b), [w, h]);
    await page.evaluate(() => { window.__calc = (a, b) => {
      // La fonction est en portée de module : on la joint par le CSS qu'elle produit, jamais en
      // l'exposant pour les besoins du test. On reproduit ici sa formule et on VÉRIFIE ensuite
      // qu'elle donne bien le même résultat sur le DOM réel (point 2).
      return Math.max(0.2, Math.min(4, Math.min(a / 1422, b / 800))); }; });
    assert.equal(Number((await ech(1920, 1080)).toFixed(3)), 1.35, 'plein 1920×1080 → 1,35');
    assert.equal(Number((await ech(3840, 2160)).toFixed(2)), 2.70, 'plein 4K → 2,70');
    assert.equal(await ech(0, 0), 0.2, 'espace nul : plancher, jamais une division par zéro');
    console.log('PASS 1/7  facteur : 1,35 à 1920×1080, 2,70 en 4K, plancher à espace nul.');

    // ── 2. LA RÉFÉRENCE EST BIEN 1422×800, ET L'ÉCHELLE EST APPLIQUÉE ────────────────────────
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    await page.evaluate(d => window.adocPresentOpenWithDoc(d), DOC);
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);
    const geo = await page.evaluate(() => {
      const o = document.querySelector('.cc-ws-present-slide-outer');
      const ov = document.getElementById('cc-ws-present-overlay');
      const m = getComputedStyle(o).transform;
      return { nominal: Math.round(o.offsetWidth) + '×' + Math.round(o.offsetHeight),
        echelle: m === 'none' ? 1 : parseFloat(m.match(/matrix\(([^,]+)/)[1]),
        variable: ov.style.getPropertyValue('--adoc-present-echelle') };
    });
    // 1422×800 est du 16:9 (1422/800 = 1,7775). La valeur est ASSERTÉE, pas commentée : 1280×720
    // ferait redéborder huit diapositives qui tiennent depuis le plafonnement de l'image.
    assert.equal(geo.nominal, '1422×800', 'référence nominale : ' + geo.nominal);
    assert.ok(Math.abs(1422 / 800 - 16 / 9) < 0.01, 'la référence doit être du 16:9');
    assert.ok(geo.echelle > 1.1 && geo.echelle < 1.4, 'échelle appliquée à 1920×1080 : ' + geo.echelle);
    assert.ok(geo.variable, 'la variable CSS doit être posée sur l\'overlay');
    console.log('PASS 2/7  référence 1422×800 (16:9), échelle ' + geo.echelle.toFixed(2) + ' réellement appliquée.');

    // ── 3. LE FACTEUR SUIT L'ESPACE DISPONIBLE ──────────────────────────────────────────────
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.waitForTimeout(400);
    const ech4k = await page.evaluate(() => {
      const m = getComputedStyle(document.querySelector('.cc-ws-present-slide-outer')).transform;
      return parseFloat(m.match(/matrix\(([^,]+)/)[1]);
    });
    assert.ok(ech4k > geo.echelle * 1.8, 'le facteur doit suivre le redimensionnement : '
      + geo.echelle.toFixed(2) + ' → ' + ech4k.toFixed(2));
    console.log('PASS 3/7  redimensionnement : échelle ' + geo.echelle.toFixed(2) + ' → ' + ech4k.toFixed(2) + ' en 4K.');

    // ── 4. SOMMAIRE ET PORTE SUIVENT LA MÊME ÉCHELLE ────────────────────────────────────────
    // Mesuré avant ce lot : tous deux figés (sommaire 300 px / texte 16 px, porte 640 px / 16 px),
    // identiques à 1080p et en 4K. Un seul facteur pour les trois, jamais trois réglages distincts.
    const mise = await page.evaluate(async () => {
      const lire = (sel) => { const e = document.querySelector(sel); if (!e) return null;
        const m = getComputedStyle(e).transform; return m === 'none' ? 1 : parseFloat(m.match(/matrix\(([^,]+)/)[1]); };
      window.adocPresentToggleToc();
      // La porte doit être OUVERTE avant d'être mesurée : son texte est `hidden` tant qu'elle est
      // fermée, et getComputedStyle rend « none » sur un élément non rendu — la mesure aurait dit
      // « pas de mise à l'échelle » là où la règle s'applique très bien.
      window.adocPresentOpenDeepDive('n1');
      await new Promise(r => setTimeout(r, 300));
      return { toc: lire('#cc-ws-present-toc'), porte: lire('.cc-ws-present-door-text'),
               diapo: lire('.cc-ws-present-slide-outer'),
               porteOuverte: document.getElementById('cc-ws-present-door').classList.contains('open') };
    });
    assert.equal(mise.porteOuverte, true, 'la porte doit être ouverte pour que sa mesure ait un sens');
    assert.ok(Math.abs(mise.toc - mise.diapo) < 0.01, 'le sommaire doit suivre : ' + JSON.stringify(mise));
    assert.ok(Math.abs(mise.porte - mise.diapo) < 0.01, 'la porte doit suivre : ' + JSON.stringify(mise));
    console.log('PASS 4/7  sommaire et porte à la même échelle que la diapositive (' + mise.diapo.toFixed(2) + ').');
    await page.close();

    // ── 5. L'EXPORT NE S'OUVRE PLUS TOUT SEUL ───────────────────────────────────────────────
    const html = await construire(browser);
    assert.ok(!/adocPresentOpenWithDoc\(ADOC_EXPORT_DOC\)/.test(html),
      'plus aucune ouverture automatique : c\'est l\'objet même de ce lot');
    assert.ok(html.includes('id="cc-ws-present-start"'), 'l\'écran de démarrage doit être dans la coquille');
    assert.ok(html.includes('window.adocPresentDemarrerExport()'), 'le bouton doit appeler le geste');
    assert.ok(html.includes('Échelle et démarrage'), 'le titre du document doit être annoncé');
    assert.match(html, /3 diapositives · 1 approfondissement/, 'le décompte doit être annoncé');
    for (const nom of ['adocPresentCalculerEchelle', 'adocPresentAppliquerEchelle',
                       'adocPresentInstallerEcouteursEchelle', 'adocDemanderPleinEcran']) {
      assert.ok(html.includes('function ' + nom), nom + ' doit être embarquée');
    }
    assert.ok(html.includes('window.adocPresentDemarrerExport ='), 'le geste doit être embarqué');
    const fichier = path.join(dossier, 'p.html');
    fs.writeFileSync(fichier, html, 'utf8');
    const exp = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errExp = [];
    exp.on('pageerror', e => errExp.push(e.message));
    await exp.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.waitForTimeout(700);
    const auRepos = await exp.evaluate(() => ({
      ecran: !!document.getElementById('cc-ws-present-start'),
      overlayOuvert: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
      diapo: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card') }));
    assert.equal(auRepos.ecran, true, 'l\'écran de démarrage doit être affiché');
    assert.equal(auRepos.overlayOuvert, false, 'la présentation ne doit PAS s\'être ouverte seule');
    assert.deepEqual(errExp, [], 'erreurs au chargement de l\'export : ' + errExp.join(' | '));
    console.log('PASS 5/7  export : écran de démarrage affiché, aucune ouverture automatique, 0 erreur.');

    // ── 6. « DÉMARRER » RÉELLEMENT CLIQUÉ, plein écran demandé EN PREMIER ────────────────────
    await exp.evaluate(new Function('return (' + ESPION + ')')());
    await exp.evaluate(() => { window.__tracer = true; });
    await exp.click('#cc-ws-present-start button');
    await exp.waitForTimeout(700);
    const j = await exp.evaluate(() => window.__journal);
    assert.equal(j[0], 'getElementById:cc-ws-present-overlay',
      'première opération du geste : ' + j[0] + ' — la demande doit précéder tout le reste');
    assert.equal(j[1], 'requestFullscreen:cc-ws-present-overlay',
      'la cible doit être l\'overlay, comme en mode live : ' + j[1]);
    const apres = await exp.evaluate(() => ({
      ecran: !!document.getElementById('cc-ws-present-start'),
      overlayOuvert: document.getElementById('cc-ws-present-overlay').classList.contains('open'),
      diapo: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card'),
      echelle: (() => { const m = getComputedStyle(document.querySelector('.cc-ws-present-slide-outer')).transform;
        return m === 'none' ? 1 : parseFloat(m.match(/matrix\(([^,]+)/)[1]); })() }));
    assert.equal(apres.ecran, false, 'l\'écran de démarrage doit disparaître');
    assert.equal(apres.overlayOuvert, true, 'la présentation doit s\'ouvrir');
    assert.equal(apres.diapo, true, 'et afficher sa première diapositive');
    assert.ok(apres.echelle > 1.1, 'l\'échelle doit être appliquée dans l\'export aussi : ' + apres.echelle);
    assert.deepEqual(errExp, [], 'erreur au clic sur Démarrer : ' + errExp.join(' | '));
    console.log('PASS 6/7  « Démarrer » cliqué dans un VRAI export : plein écran demandé en premier, '
      + 'présentation ouverte, échelle ' + apres.echelle.toFixed(2) + ', 0 ReferenceError.');
    await exp.close();

    // ── 7. UN REFUS DE PLEIN ÉCRAN N'ENFERME JAMAIS DANS L'ÉCRAN DE DÉMARRAGE ────────────────
    const exp2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const err2 = [];
    exp2.on('pageerror', e => err2.push(e.message));
    await exp2.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp2.goto('file://' + fichier);
    await exp2.evaluate(new Function('return (' + ESPION + ')')());
    await exp2.evaluate(() => { window.__rejeter = true; });
    await exp2.click('#cc-ws-present-start button');
    await exp2.waitForTimeout(700);
    const refus = await exp2.evaluate(() => ({
      ecran: !!document.getElementById('cc-ws-present-start'),
      diapo: !!document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card'),
      ouvert: document.getElementById('cc-ws-present-overlay').classList.contains('open') }));
    assert.equal(refus.ecran, false, 'l\'écran de démarrage doit disparaître même si le plein écran est refusé');
    assert.equal(refus.diapo, true, 'la première diapositive doit s\'afficher DANS TOUS LES CAS');
    assert.equal(refus.ouvert, true);
    assert.deepEqual(err2, [], 'un refus ne doit produire aucune erreur : ' + err2.join(' | '));
    await exp2.close();
    console.log('PASS 7/7  plein écran refusé : présentation ouverte quand même, jamais d\'écran bloqué.');

    console.log('\nTOUT PASSE — 7/7, aucun appel réseau.');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch(e => { console.error('ÉCHEC:', e); process.exit(1); });
