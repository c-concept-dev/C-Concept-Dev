// THÈMES, PHASE C — vignettes de choix, dans le modal de re-thème.
//
// EMPLACEMENT : le modal de re-thème (#cc-legacy-retheme-modal), et non le panneau d'édition de bloc.
// Un thème change le DOCUMENT entier ; le proposer dans un panneau qui règle un bloc sélectionné
// laisserait croire qu'il ne touche que lui. Le modal est déjà le lieu des décisions d'ensemble.
//
// Ce test pilote le VRAI modal : rien n'est réimplémenté ici, sans quoi il passerait même si la
// production était cassée.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const hexVersRgb = (h) => 'rgb(' + [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)).join(', ') + ')';

function presentationDoc() {
  return {
    schemaVersion: 1, documentId: 'doc-pc-001', versionId: 'doc-pc-001-v1', previousVersionId: null,
    requestId: 'request-pc-001', sourceSnapshotId: 'snapshot-pc-001',
    createdAt: '2026-09-30T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test vignettes', purpose: 'formation', audience: 'praticien',
    documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
    citations: [], deepDives: [],
    blocks: [{ id: 'slide-01', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      { id: 'p1', type: 'paragraph', content: { text: 'Un paragraphe.' }, citationIds: [], validation: {} },
    ] } }],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-vignettes-'));
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocOpenStructuredReThemePanel === 'function');

    await page.evaluate((doc) => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.pc = { name: 'Vignettes', _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'pc' });
    }, presentationDoc());
    await page.evaluate(() => window.adocOpenWorkspace('pc'));
    await page.waitForTimeout(200);

    // ── 1 — les vignettes sont RÉELLEMENT rendues dans le modal, en tête ──
    await page.evaluate(() => window.adocOpenStructuredReThemePanel('pc'));
    await page.waitForFunction(() => document.querySelectorAll('#cc-legacy-retheme-body [data-theme-id]').length > 0, null, { timeout: 8000 });
    const vignettes = await page.evaluate(() => {
      const corps = document.getElementById('cc-legacy-retheme-body');
      const btns = Array.from(corps.querySelectorAll('[data-theme-id]'));
      // La zone des chartes existe TOUJOURS, chargée ou non : c'est l'invariant d'ordre vérifiable.
      // Le sélecteur de densité, lui, n'apparaît qu'une fois les chartes récupérées — absent hors
      // ligne, il ne peut pas servir de repère.
      const zone = corps.querySelector('#cc-retheme-chartes');
      return {
        n: btns.length,
        ids: btns.map((b) => b.getAttribute('data-theme-id')),
        libelles: btns.map((b) => b.textContent.trim()),
        // Les vignettes doivent précéder le parcours charte, sinon elles ne raccourcissent rien.
        avantLesChartes: !!(btns[0].compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING),
        zonePresente: !!zone,
        pastilles: btns.map((b) => Array.from(b.querySelectorAll('span[style*="background"]'))
          .map((s) => getComputedStyle(s).backgroundColor)),
        classe: btns[0].className,
      };
    });
    const themes = await page.evaluate(() => window.adocThemes());
    assert.equal(vignettes.n, themes.length, 'une vignette par thème, ' + themes.length + ' attendues');
    assert.deepEqual(vignettes.ids, themes.map((t) => t.id),
      'les vignettes viennent de window.adocThemes(), jamais d\'une table recopiée');
    themes.forEach((t, i) => assert.ok(vignettes.libelles[i].includes(t.label),
      'chaque vignette porte le libellé de son thème : ' + t.label));
    assert.equal(vignettes.zonePresente, true, 'la zone des chartes doit exister, chargée ou non');
    assert.equal(vignettes.avantLesChartes, true,
      'les vignettes précèdent le parcours charte : sinon elles ne raccourcissent rien. Et elles sont '
      + 'affichées AVANT toute attente réseau — hors ligne, les chartes manquent mais les thèmes restent '
      + 'utilisables, ce que ce test démontre puisqu\'il tourne sans réseau.');
    assert.ok(/cc-clarity-reply-btn/.test(vignettes.classe),
      'même patron visuel que les choix de charte, aucun composant nouveau : ' + vignettes.classe);
    console.log('PASS ' + (++n) + '/5 — ' + vignettes.n + ' vignettes rendues en tête du modal, patron existant.');

    // ── 2 — chaque vignette montre RÉELLEMENT ses couleurs, l'accent en premier ──
    themes.forEach((t, i) => {
      const p = vignettes.pastilles[i];
      assert.ok(p.length >= 3, 'chaque vignette porte au moins trois pastilles, reçu ' + p.length);
      assert.equal(p[0], hexVersRgb(t.colors.accent),
        'la PREMIÈRE pastille est l\'accent (' + t.colors.accent + ') — la couleur la plus visible dans le rendu');
      assert.equal(p[1], hexVersRgb(t.colors.primary), 'puis la couleur principale');
      assert.equal(p[2], hexVersRgb(t.colors.background), 'puis le fond');
    });
    console.log('PASS ' + (++n) + '/5 — aperçu de couleur mesuré sur les ' + themes.length + ' vignettes, accent en tête.');

    // ── 3 — UN CLIC RÉEL applique le thème et referme le modal ──
    const cible = themes.find((t) => t.id === 'encre');
    await page.locator('#cc-legacy-retheme-body [data-theme-id="encre"]').click();
    await page.waitForFunction(() => !document.getElementById('cc-legacy-retheme-modal').classList.contains('open'), null, { timeout: 8000 });
    const apres = await page.evaluate(() => {
      const art = window._adocArtifacts.pc;
      const o = art._adocRenderManifestOverride;
      return { surcharge: !!o, ref: o && o.brandKitRef, nom: art._adocBrandKitName,
               accent: o ? window.adocTokensSnapshots[o.tokensSnapshotId].colors.terracotta600 : null };
    });
    assert.equal(apres.surcharge, true, 'le clic doit poser la surcharge — le point d\'application unique');
    assert.deepEqual(apres.ref, { id: 'theme-encre', version: 1 }, 'et nommer le thème choisi');
    assert.equal(apres.accent, cible.colors.accent, 'l\'accent du thème doit atteindre les jetons résolus');
    assert.equal(apres.nom, cible.label, 'le nom affiché du document suit le thème');
    console.log('PASS ' + (++n) + '/5 — un clic applique « ' + cible.label +' » et referme le modal.');

    // ── 4 — l'accent atteint le rendu, mesuré sur les pixels ──
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), presentationDoc());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);
    const rendu = await page.evaluate(() => {
      const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      return getComputedStyle(carte).getPropertyValue('--adoc-presentation-accent').trim();
    });
    assert.equal(rendu, cible.colors.accent,
      'après un clic sur la vignette, le rendu doit porter l\'accent du thème (' + cible.colors.accent + ')');
    assert.deepEqual(erreurs, [], 'aucune erreur JS : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/5 — le rendu porte l\'accent du thème choisi (' + rendu + ').');
    await page.close();

    // ── 5 — EXPORT RÉELLEMENT CONSTRUIT ET OUVERT : aucune fonction oubliée du graphe ──
    // Les fonctions de vignettes sont de l'ATELIER : elles n'ont rien à faire dans un export, et
    // aucune n'y est appelée. Ce contrôle le prouve — un oubli se manifesterait par un
    // « ... is not defined » à l'ouverture, jamais à la lecture.
    const atelier = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await atelier.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier.goto(PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate(async ({ doc, accent }) =>
      window.adocBuildStandalonePresentationHTML(doc, { embedImages: false, accentPresentation: accent }),
      { doc: presentationDoc(), accent: cible.colors.accent });
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    assert.ok(!/adocThemesTilesHTML|adocChoisirTheme|adocThemeSwatchHTML/.test(html),
      'les fonctions de vignettes ne doivent PAS partir dans l\'export : ce sont des outils d\'atelier, '
      + 'et un export ne propose aucun choix');

    const exp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errExp = [];
    exp.on('pageerror', (e) => errExp.push(e.message));
    await exp.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(400);
    const accentExport = await exp.evaluate(() => {
      const c = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      return getComputedStyle(c).getPropertyValue('--adoc-presentation-accent').trim();
    });
    assert.equal(accentExport, cible.colors.accent, 'l\'accent du thème doit être résolu dans l\'export');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    console.log('PASS ' + (++n) + '/5 — export ouvert : accent présent, aucune fonction de vignette embarquée, 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS THÈMES PHASE C PASSENT (' + n + '/5)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
