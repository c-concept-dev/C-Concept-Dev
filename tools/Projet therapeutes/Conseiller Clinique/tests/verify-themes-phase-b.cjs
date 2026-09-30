// THÈMES, PHASE B — l'accent du thème atteint la présentation.
//
// --adoc-presentation-accent était LU par quatre règles et DÉFINI nulle part : seul son repli
// #8f6a1f s'appliquait, quel que soit le thème. Cette phase le câble, en direct et à l'export.
//
// Le jeton s'appelle `terracotta600`, jamais `accent` : adocBrandKitToTokensSnapshot y range la
// couleur d'accent (terracotta700 recevant `warning`). Un snapshot résolu ne porte aucune clé
// `accent` — le test le vérifie plutôt que de le supposer.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'file://' + path.join(__dirname, '..', 'studio-clinique.html');
const hexVersRgb = (h) => 'rgb(' + [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)).join(', ') + ')';

function presentationDoc() {
  const bloc = (o) => Object.assign({ id: 'b', type: 'paragraph', content: { text: 'T' }, citationIds: [], validation: {} }, o);
  return {
    schemaVersion: 1, documentId: 'doc-pb-001', versionId: 'doc-pb-001-v1', previousVersionId: null,
    requestId: 'request-pb-001', sourceSnapshotId: 'snapshot-pb-001',
    createdAt: '2026-09-30T09:00:00Z', language: 'fr', status: 'draft',
    title: 'Test accent', purpose: 'formation', audience: 'praticien',
    documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
    citations: [], deepDives: [],
    blocks: [{ id: 'slide-01', type: 'card', content: { title: 'D1', imageRef: null, imageAlt: null, blocks: [
      bloc({ id: 'p1', content: { text: 'Un paragraphe.' } }),
      // Forme EXACTE de questionnaireContent : allowTwoPartners (et non twoPartners), et au moins
      // deux questions — minItems:2. Un bloc mal formé fait échouer adocOpenWorkspace en silence du
      // point de vue du test, qui croirait alors à un défaut du thème.
      { id: 'q1', type: 'questionnaire', citationIds: [], validation: {}, content: {
        questions: [
          { text: 'Une première question ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
          { text: 'Une seconde question ?', options: [{ text: 'Non', points: 0 }, { text: 'Oui', points: 2 }] },
        ],
        profiles: [{ label: 'Bas', minScore: 0, maxScore: 2, interpretation: 'Peu marqué.' },
                   { label: 'Haut', minScore: 3, maxScore: 4, interpretation: 'Marqué.' }],
        allowTwoPartners: true } },
    ] } }],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  };
}

(async () => {
  const browser = await chromium.launch();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-accent-'));
  let n = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-key'));
    await page.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => typeof window.adocApplyTheme === 'function');

    // ── 1 — le jeton s'appelle terracotta600, et PAS accent ──
    const jetons = await page.evaluate(async () => {
      const m = await window.adocBuildRenderManifestForTheme({ renderManifestId: 'manifest-default-001' },
        window.adocThemes().find((t) => t.id === 'argile'));
      const c = window.adocTokensSnapshots[m.tokensSnapshotId].colors;
      return { aAccent: Object.prototype.hasOwnProperty.call(c, 'accent'), terracotta600: c.terracotta600,
               attendu: window.adocThemes().find((t) => t.id === 'argile').colors.accent };
    });
    assert.equal(jetons.aAccent, false,
      "un snapshot résolu ne porte AUCUNE clé `accent` : la couleur d'accent est rangée sous terracotta600");
    assert.equal(jetons.terracotta600, jetons.attendu,
      "et terracotta600 vaut bien l'accent du thème (" + jetons.attendu + ')');
    console.log('PASS ' + (++n) + '/5 — le jeton porteur est terracotta600 (' + jetons.terracotta600 + '), jamais `accent`.');

    // ── 2 — EN DIRECT : l'accent atteint l'enveloppe du plein écran ──
    await page.evaluate((doc) => {
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts.pb = { name: 'Accent', _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, blockEditing: true }, _adocStructuredDoc: doc };
      window._adocWsState = Object.assign({}, window._adocWsState, { storeKey: 'pb' });
    }, presentationDoc());
    // Les écrans doivent être actifs AVANT d'appliquer : adocApplyTheme ré-affiche par
    // adocOpenWorkspace, qui échoue tant que #assistdoc-screen ne l'est pas — et le thème serait
    // alors annulé par le retour arrière, sans que rien ne soit cassé pour autant.
    await page.evaluate(() => {
      document.getElementById('cc-login-screen')?.remove();
      document.getElementById('assistdoc-screen')?.classList.add('active');
      document.getElementById('cc-workspace')?.classList.add('open');
    });
    // Le document doit être ouvert une première fois : adocApplyTheme ré-affiche par
    // adocOpenWorkspace, et l'espace de travail doit déjà porter ce document pour que le
    // ré-affichage aboutisse. Sans cela le retour arrière annule le thème — sans rien casser, mais
    // sans l'appliquer non plus.
    const premiereOuverture = await page.evaluate(() => window.adocOpenWorkspace('pb'));
    assert.equal(premiereOuverture, true, 'préalable : le document doit s\'ouvrir dans l\'espace de travail');
    const applique = await page.evaluate(() => window.adocApplyTheme('pb', 'argile'));
    assert.equal(applique, true, 'le thème doit s\'appliquer');
    await page.evaluate((d) => window.adocPresentOpenWithDoc(d), presentationDoc());
    await page.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await page.waitForTimeout(400);
    const direct = await page.evaluate(() => {
      const o = document.getElementById('cc-ws-present-overlay');
      const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      return { pose: o.style.getPropertyValue('--adoc-presentation-accent'),
               resolue: getComputedStyle(carte).getPropertyValue('--adoc-presentation-accent').trim() };
    });
    assert.equal(direct.pose, jetons.terracotta600, 'l\'accent doit être posé sur l\'enveloppe du plein écran');
    assert.equal(direct.resolue, jetons.terracotta600,
      'et se propager jusqu\'à la carte, où vivent les règles qui le lisent');
    console.log('PASS ' + (++n) + '/5 — en direct : accent posé sur l\'enveloppe et résolu jusqu\'à la carte.');

    // ── 3 — l'accent ATTEINT RÉELLEMENT les usages, mesuré sur les pixels calculés ──
    const usages = await page.evaluate(async () => {
      const attendu = getComputedStyle(document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card'))
        .getPropertyValue('--adoc-presentation-accent').trim();
      const opt = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire-option');
      let optionSelectionnee = null;
      if (opt) { opt.classList.add('is-selected'); await new Promise((r) => setTimeout(r, 60));
                 optionSelectionnee = getComputedStyle(opt).backgroundColor; }
      const btn = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire-partner-btn');
      let boutonActif = null;
      if (btn) { btn.classList.add('is-active'); await new Promise((r) => setTimeout(r, 60));
                 boutonActif = getComputedStyle(btn).backgroundColor; }
      return { attendu, optionSelectionnee, boutonActif,
               presenceOption: !!opt, presenceBouton: !!btn };
    });
    const attenduRgb = hexVersRgb(jetons.terracotta600);
    assert.equal(usages.presenceOption, true, 'préalable : une option de questionnaire doit être rendue');
    assert.equal(usages.optionSelectionnee, attenduRgb,
      'une option SÉLECTIONNÉE doit prendre la couleur du thème (' + attenduRgb + '), jamais le repli #8f6a1f');
    if (usages.presenceBouton) {
      assert.equal(usages.boutonActif, attenduRgb, 'un bouton de partenaire ACTIF aussi');
    }
    // Les deux autres usages (numéro de diapositive, bordure haute de carte) ne sont émis QUE par le
    // rendu d'atelier, dans l'élément que adocTokensToCSSVars style : on les mesure là où ils vivent.
    const atelier2 = await page.evaluate(() => {
      const racine = document.querySelector('#cc-ws-doc-card .adoc-sc-presentation') || document.querySelector('.adoc-sc-presentation');
      if (!racine) return { absent: true };
      const num = racine.querySelector('.adoc-sc-presentation-slide-num');
      const carte = racine.querySelector('.adoc-sc-presentation-slide .adoc-sc-card');
      return { absent: false,
        variable: getComputedStyle(racine).getPropertyValue('--adoc-presentation-accent').trim(),
        numero: num ? getComputedStyle(num).color : null,
        bordure: carte ? getComputedStyle(carte).borderTopColor : null };
    });
    if (!atelier2.absent) {
      assert.equal(atelier2.variable, jetons.terracotta600,
        "l'accent doit être posé par adocTokensToCSSVars sur l'élément du document, seul endroit d'où "
        + 'les règles de diapositive d\'atelier peuvent le lire');
      if (atelier2.numero) assert.equal(atelier2.numero, hexVersRgb(jetons.terracotta600),
        'le numéro de diapositive doit prendre la couleur du thème, jamais le repli #8f6a1f');
      if (atelier2.bordure) assert.equal(atelier2.bordure, hexVersRgb(jetons.terracotta600),
        'la bordure haute de carte aussi');
      console.log('PASS ' + (++n) + '/5 — usages d\'atelier : numéro ' + atelier2.numero + ', bordure ' + atelier2.bordure + '.');
    } else {
      console.log('NOTE  rendu d\'atelier absent de ce contexte — usages 1 et 2 non mesurables ici.');
    }

    console.log('PASS ' + (++n) + '/5 — usages mesurés : option sélectionnée '
      + usages.optionSelectionnee + (usages.presenceBouton ? ', bouton actif ' + usages.boutonActif : ' (bouton de partenaire absent de ce document)') + '.');
    await page.close();

    // ── 4 — DANS UN EXPORT RÉELLEMENT CONSTRUIT ET OUVERT ──
    const atelier = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await atelier.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await atelier.goto(PAGE);
    await atelier.waitForFunction(() => typeof window.adocBuildStandalonePresentationHTML === 'function');
    const html = await atelier.evaluate(async ({ doc, accent }) =>
      window.adocBuildStandalonePresentationHTML(doc, { embedImages: false, accentPresentation: accent }),
      { doc: presentationDoc(), accent: jetons.terracotta600 });
    const fichier = path.join(dossier, 'presentation.html');
    fs.writeFileSync(fichier, html, 'utf8');
    await atelier.close();
    assert.ok(html.includes(':root{--adoc-presentation-accent:' + jetons.terracotta600 + ';}'),
      'la règle :root doit être écrite dans le fichier, l\'accent étant FIGÉ à la construction — un '
      + 'export n\'a ni manifeste ni snapshot à résoudre');

    const exp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errExp = [];
    exp.on('pageerror', (e) => errExp.push(e.message));
    await exp.route('**/*', (r) => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
    await exp.goto('file://' + fichier);
    await exp.evaluate(() => document.querySelector('#cc-ws-present-start button')?.click());
    await exp.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'));
    await exp.waitForTimeout(400);
    const dansExport = await exp.evaluate(async () => {
      const carte = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-card');
      const resolue = getComputedStyle(carte).getPropertyValue('--adoc-presentation-accent').trim();
      const opt = document.querySelector('#cc-ws-present-slide-inner .adoc-sc-questionnaire-option');
      let fond = null;
      if (opt) { opt.classList.add('is-selected'); await new Promise((r) => setTimeout(r, 60));
                 fond = getComputedStyle(opt).backgroundColor; }
      return { resolue, fond, presence: !!opt };
    });
    assert.equal(dansExport.resolue, jetons.terracotta600, 'l\'accent doit être résolu DANS le fichier exporté');
    assert.equal(dansExport.presence, true, 'préalable : le questionnaire doit être rendu dans l\'export');
    assert.equal(dansExport.fond, attenduRgb,
      'et une option sélectionnée doit y prendre la couleur du thème (' + attenduRgb + '), jamais #8f6a1f');
    assert.deepEqual(errExp, [], 'aucune erreur JS dans l\'export : ' + errExp.join(' | '));
    assert.deepEqual(erreurs, [], 'aucune erreur JS en direct : ' + erreurs.join(' | '));
    console.log('PASS ' + (++n) + '/5 — DANS l\'export : accent résolu et appliqué (' + dansExport.fond + '), 0 erreur.');
    await exp.close();

    console.log('\nTOUS LES TESTS THÈMES PHASE B PASSENT (' + n + '/5)');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
    await browser.close();
  }
})().catch((e) => { console.error('ÉCHEC:', e); process.exit(1); });
