// Item 68 CONSTRUCTION (Options A + C) — TEST DÉDIÉ.
// Rend directement éditables, en TEXTE SEUL (aucun panneau de style, Option A) :
//   - Fiche  : .adoc-sc-cover-title (doc.title), .adoc-sc-cover-category (doc.purpose),
//              .adoc-sc-cover-audience (doc.audience, partie variable du sous-titre composé).
//   - Carrousel : .adoc-sc-card-title (card.content.title), même mécanisme.
// Couvre les deux documentKind (régression #3), une frappe clavier réelle jamais bloquée même à
// zéro caractère (garde anti-vide décrite dans le rapport), un VRAI rechargement de page complet
// (régression #5 — pas seulement l'état en mémoire de l'onglet d'origine), la non-apparition du
// panneau de style, et la régénération de l'export HTML depuis le doc à jour.
//
// AVERTISSEMENT DE PORTÉE (transparence, cf. rapport) : la génération structurée d'un document
// Carrousel n'est PAS câblée aujourd'hui dans l'application réelle
// (window.adocStructuredGenerationWiredByDocumentKind.carrousel === false, _ADOC_HTML_FORCED_INTENTS
// force 'carrousel' vers l'ancien moteur) — un ClinicalDocument structuré de type carrousel est
// donc injecté à la main ici (même patron que les autres tests de ce fichier pour un artefact
// "déjà généré"), jamais obtenu par un vrai parcours de génération de bout en bout, puisqu'aucun
// parcours de ce type n'existe encore dans l'application pour produire un tel document.
const { chromium } = require('playwright');
const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';

const results = [];
function log(label, ok, extra) { results.push([label, ok, extra]); }

function ficheDoc(overrides) {
  return Object.assign({
    schemaVersion: 1, documentId: 'doc-fiche-1', versionId: 'doc-fiche-1-v1', previousVersionId: null,
    requestId: 'req-1', sourceSnapshotId: 'snap-1', createdAt: new Date().toISOString(),
    language: 'fr', status: 'draft',
    title: 'Titre original', purpose: 'Fiche synthèse', audience: 'Clinicien',
    documentKind: 'fiche', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'Paragraphe original.' }, citationIds: [], validation: {} }],
    citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  }, overrides || {});
}
function carrouselDoc(overrides) {
  return Object.assign({
    schemaVersion: 1, documentId: 'doc-carr-1', versionId: 'doc-carr-1-v1', previousVersionId: null,
    requestId: 'req-2', sourceSnapshotId: 'snap-1', createdAt: new Date().toISOString(),
    language: 'fr', status: 'draft',
    title: 'Carrousel test', purpose: 'Carrousel', audience: 'Patient',
    documentKind: 'carrousel', renderManifestId: 'manifest-default-001', derivedFrom: null,
    blocks: [
      { id: 'card-1', type: 'card', content: { title: 'Titre carte 1', imageRef: null, imageAlt: null, blocks: [{ id: 'c1b1', type: 'paragraph', content: { text: 'Contenu carte 1.' }, citationIds: [], validation: {} }] }, citationIds: [], validation: {} },
      { id: 'card-2', type: 'card', content: { title: 'Titre carte 2', imageRef: null, imageAlt: null, blocks: [] }, citationIds: [], validation: {} },
    ],
    citations: [],
    validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  }, overrides || {});
}

function baseRoutes(page) {
  const captured = { createBody: null, versionBody: null };
  page.route('**/*', route => {
    const url = route.request().url();
    if (url.endsWith('/clinical-documents') && route.request().method() === 'POST') {
      captured.createBody = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document_id: 'doc-1', version_id: 'v1' }) });
      return;
    }
    if (url.includes('/clinical-documents/') && url.endsWith('/versions')) {
      captured.versionBody = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ version_id: 'v2' }) });
      return;
    }
    route.continue();
  });
  return captured;
}

async function injectArtifact(page, key, doc, capabilities) {
  await page.evaluate(({ key, doc, capabilities }) => {
    window.openAssistDoc();
    document.getElementById('cc-landing').style.display = 'none';
    window._adocArtifacts = window._adocArtifacts || {};
    window._adocArtifacts[key] = {
      name: doc.title, fmt: 'html', _adocStructuredDoc: doc,
      _adocStructuredSnapshot: { sourceSnapshotId: doc.sourceSnapshotId, entries: [] },
      _adocRenderManifestOverride: null, _adocGenerationEngine: 'structured',
      _adocCapabilities: capabilities,
    };
  }, { key, doc, capabilities });
}

const CAPS = { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true };

async function selectAllAndType(page, selector, text) {
  await page.click(selector);
  await page.keyboard.press('Control+A');
  if (text) await page.keyboard.type(text); else await page.keyboard.press('Delete');
}

(async () => {
  const browser = await chromium.launch();

  // ═══════════════════════════════ FICHE ═══════════════════════════════
  let savedFicheBody;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const captured = baseRoutes(page);
    await page.goto('file://' + FILE);
    await injectArtifact(page, 'fiche-1', ficheDoc(), CAPS);
    const opened = await page.evaluate((k) => window.adocOpenWorkspace(k), 'fiche-1');
    log('[Fiche] 0. adocOpenWorkspace réussit avec le document injecté', opened === true, opened);
    await page.waitForSelector('.adoc-sc-cover-title');

    const attrs = await page.evaluate(() => ({
      title: document.querySelector('.adoc-sc-cover-title').getAttribute('contenteditable'),
      category: document.querySelector('.adoc-sc-cover-category').getAttribute('contenteditable'),
      audience: document.querySelector('.adoc-sc-cover-audience').getAttribute('contenteditable'),
      subtitleText: document.querySelector('.adoc-sc-cover-meta').textContent,
      hasBlockClass: document.querySelector('.adoc-sc-cover-title').classList.contains('adoc-sc-block'),
    }));
    log('1a. .adoc-sc-cover-title est contentEditable', attrs.title === 'true', attrs);
    log('1b. .adoc-sc-cover-category est contentEditable', attrs.category === 'true', attrs);
    log('1c. .adoc-sc-cover-audience est contentEditable', attrs.audience === 'true', attrs);
    log('1d. Sous-titre composé affiché correctement ("Studio Clinique · Clinicien")', attrs.subtitleText.trim() === 'Studio Clinique · Clinicien', attrs);
    log('1e. Le titre de couverture NE porte PAS .adoc-sc-block (jamais confondu avec un bloc normal)', !attrs.hasBlockClass, attrs);

    // ── Clic dans le titre : AUCUN panneau de style/correction ne doit apparaître (Option A) ──
    await page.click('.adoc-sc-cover-title');
    await page.waitForTimeout(150);
    const panelAfterTitleClick = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('2a. Cliquer dans le titre de couverture n\'ouvre AUCUN panneau de style/correction', !panelAfterTitleClick, null);

    // ── Édition réelle au clavier ──
    await selectAllAndType(page, '.adoc-sc-cover-title', 'Titre édité à la main');
    await selectAllAndType(page, '.adoc-sc-cover-category', 'Catégorie éditée');
    await selectAllAndType(page, '.adoc-sc-cover-audience', 'Grand public');
    const synced = await page.evaluate((k) => {
      const d = window._adocArtifacts[k]._adocStructuredDoc;
      return { title: d.title, purpose: d.purpose, audience: d.audience };
    }, 'fiche-1');
    log('3a. doc.title synchronisé en direct (frappe clavier réelle)', synced.title === 'Titre édité à la main', synced);
    log('3b. doc.purpose synchronisé en direct', synced.purpose === 'Catégorie éditée', synced);
    log('3c. doc.audience synchronisé en direct (seule la partie variable, "Studio Clinique" jamais touché)', synced.audience === 'Grand public', synced);
    const panelAfterEdits = await page.evaluate(() => document.querySelectorAll('.cc-block-edit-panel').length);
    log('3d. Toujours aucun panneau de style après plusieurs éditions', panelAfterEdits === 0, panelAfterEdits);

    // ── Titre vidé pendant la frappe : jamais bloqué, jamais écrit vide dans le doc ──
    await page.click('.adoc-sc-cover-title');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    const midTyping = await page.evaluate((k) => ({
      domText: document.querySelector('.adoc-sc-cover-title').textContent,
      docTitle: window._adocArtifacts[k]._adocStructuredDoc.title,
    }), 'fiche-1');
    log('4a. La frappe n\'est jamais bloquée : le DOM peut afficher un titre vide', midTyping.domText === '', midTyping);
    log('4b. doc.title conserve la DERNIÈRE VALEUR VALIDE pendant que le DOM est vide (jamais de chaîne vide écrite)', midTyping.docTitle === 'Titre édité à la main', midTyping);
    // Quitter le champ (focusout) — restauration visuelle immédiate.
    await page.click('.adoc-sc-cover-meta');
    await page.waitForTimeout(50);
    const afterBlur = await page.evaluate(() => document.querySelector('.adoc-sc-cover-title').textContent);
    log('4c. En quittant le champ vide, le texte affiché est restauré à la dernière valeur valide', afterBlur === 'Titre édité à la main', afterBlur);

    // ── Retape un titre définitif pour la suite du test ──
    await selectAllAndType(page, '.adoc-sc-cover-title', 'Titre final export');
    await page.click('.adoc-sc-cover-meta');

    // ── L'export HTML autonome régénère bien depuis le doc à jour (point 3 de l'investigation) ──
    const exportHtml = await page.evaluate(async (k) => {
      const art = window._adocArtifacts[k];
      const r = await window.adocExportClinicalDocumentHTML(art._adocStructuredDoc, art._adocStructuredSnapshot, art._adocRenderManifestOverride || null);
      return r.html;
    }, 'fiche-1');
    log('5a. L\'export HTML contient le titre ÉDITÉ', exportHtml.includes('Titre final export'), null);
    log('5b. L\'export HTML NE contient PLUS le titre original', !exportHtml.includes('Titre original'), null);
    log('5c. L\'export HTML contient la catégorie éditée', exportHtml.includes('Catégorie éditée'), null);
    // Le sous-titre est composé de texte fixe + <span> (partie éditable) : jamais une chaîne
    // contiguë dans le HTML source (cf. adocRenderFicheHTML) — on vérifie donc les deux morceaux.
    log('5d. L\'export HTML contient le sous-titre édité (partie fixe "Studio Clinique ·" + partie éditée "Grand public")', exportHtml.includes('Studio Clinique') && exportHtml.includes('>Grand public<'), exportHtml.match(/<p class="adoc-sc-cover-meta">.*?<\/p>/));

    // ── Sauvegarde (persistance UX-10A) ──
    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    savedFicheBody = captured.createBody;
    log('6a. La sauvegarde envoie bien le titre édité au Worker', savedFicheBody && savedFicheBody.document.clinicalDocument.title === 'Titre final export', savedFicheBody && savedFicheBody.document.clinicalDocument.title);
    log('6b. La sauvegarde envoie bien la catégorie éditée', savedFicheBody && savedFicheBody.document.clinicalDocument.purpose === 'Catégorie éditée', null);
    log('6c. La sauvegarde envoie bien le sous-titre (audience) édité', savedFicheBody && savedFicheBody.document.clinicalDocument.audience === 'Grand public', null);
    log('6d. Le paragraphe normal (bloc) n\'a subi aucune régression croisée', savedFicheBody && savedFicheBody.document.clinicalDocument.blocks[0].content.text === 'Paragraphe original.', null);
    log('6e. Aucune erreur JS sur tout le scénario Fiche', errors.length === 0, errors);
    await page.close();
  }

  // ── VRAI RECHARGEMENT DE PAGE — reconstruit depuis ce qui a été RÉELLEMENT envoyé au Worker ──
  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    const reopened = await page2.evaluate(async (savedDoc) => {
      window.openAssistDoc();
      document.getElementById('cc-landing').style.display = 'none';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened-fiche'] = {
        name: savedDoc.title, fmt: 'html', _adocStructuredDoc: savedDoc,
        _adocStructuredSnapshot: { sourceSnapshotId: savedDoc.sourceSnapshotId, entries: [] },
        _adocRenderManifestOverride: null, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      };
      const ok = await window.adocOpenWorkspace('reopened-fiche');
      return { ok, cover: document.querySelector('.adoc-sc-cover')?.textContent || '' };
    }, savedFicheBody.document.clinicalDocument);
    log('7a. APRÈS RECHARGEMENT DE PAGE COMPLET — réouverture réussie', reopened.ok === true, reopened);
    log('7b. APRÈS RECHARGEMENT — la bannière affiche le TITRE édité', reopened.cover.includes('Titre final export'), reopened.cover);
    log('7c. APRÈS RECHARGEMENT — la bannière affiche la CATÉGORIE éditée', reopened.cover.includes('Catégorie éditée'), null);
    log('7d. APRÈS RECHARGEMENT — la bannière affiche le SOUS-TITRE édité', reopened.cover.includes('Grand public'), null);
    log('7e. Aucune erreur JS après rechargement (Fiche)', errors2.length === 0, errors2);
    await page2.close();
  }

  // ═══════════════════════════════ CARROUSEL ═══════════════════════════════
  let savedCarrBody;
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const captured = baseRoutes(page);
    await page.goto('file://' + FILE);
    await injectArtifact(page, 'carr-1', carrouselDoc(), CAPS);
    const opened = await page.evaluate((k) => window.adocOpenWorkspace(k), 'carr-1');
    log('[Carrousel] 0. adocOpenWorkspace réussit avec un document Carrousel structuré (injecté à la main — cf. avertissement de portée en tête de fichier)', opened === true, opened);
    await page.waitForSelector('.adoc-sc-card-title');

    const cardAttrs = await page.evaluate(() => Array.from(document.querySelectorAll('.adoc-sc-card-title')).map(el => ({
      editable: el.getAttribute('contenteditable'), hasBlockClass: el.classList.contains('adoc-sc-block'), text: el.textContent,
    })));
    log('8a. Les DEUX titres de carte sont contentEditable', cardAttrs.every(c => c.editable === 'true'), cardAttrs);
    log('8b. Aucun titre de carte ne porte .adoc-sc-block', cardAttrs.every(c => !c.hasBlockClass), cardAttrs);

    await page.click('.adoc-sc-card:nth-child(1) .adoc-sc-card-title');
    await page.waitForTimeout(150);
    const panelAfterCardClick = await page.evaluate(() => !!document.querySelector('.cc-block-edit-panel'));
    log('9a. Cliquer dans un titre de carte n\'ouvre AUCUN panneau de style/correction', !panelAfterCardClick, null);

    await page.keyboard.press('Control+A');
    await page.keyboard.type('Titre de carte édité');
    const cardSynced = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.title, 'carr-1');
    log('9b. card.content.title (carte 1) synchronisé en direct', cardSynced === 'Titre de carte édité', cardSynced);
    const card2Untouched = await page.evaluate((k) => window._adocArtifacts[k]._adocStructuredDoc.blocks[1].content.title, 'carr-1');
    log('9c. La carte 2, non éditée, reste strictement inchangée (aucune fuite entre cartes)', card2Untouched === 'Titre carte 2', card2Untouched);

    // ── Vidé pendant la frappe → jamais bloqué, jamais vide dans le doc, restauré au blur ──
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    const cardMidTyping = await page.evaluate((k) => ({
      dom: document.querySelector('.adoc-sc-card:nth-child(1) .adoc-sc-card-title').textContent,
      model: window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.title,
    }), 'carr-1');
    log('10a. Frappe jamais bloquée : le titre de carte peut s\'afficher vide', cardMidTyping.dom === '', cardMidTyping);
    log('10b. card.content.title conserve la dernière valeur valide pendant que le DOM est vide', cardMidTyping.model === 'Titre de carte édité', cardMidTyping);
    await page.click('.adoc-sc-card:nth-child(2)');
    await page.waitForTimeout(50);
    const cardAfterBlur = await page.evaluate(() => document.querySelector('.adoc-sc-card:nth-child(1) .adoc-sc-card-title').textContent);
    log('10c. Restauration visuelle immédiate au blur', cardAfterBlur === 'Titre de carte édité', cardAfterBlur);

    await page.click('#cc-ws-save-btn');
    await page.waitForTimeout(300);
    savedCarrBody = captured.createBody;
    log('11a. La sauvegarde envoie bien le titre de carte édité', savedCarrBody && savedCarrBody.document.clinicalDocument.blocks[0].content.title === 'Titre de carte édité', savedCarrBody && savedCarrBody.document.clinicalDocument.blocks[0].content.title);
    log('11b. Aucune erreur JS sur tout le scénario Carrousel', errors.length === 0, errors);
    await page.close();
  }

  {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.route('**/*', route => route.continue());
    await page2.goto('file://' + FILE);
    const reopened = await page2.evaluate(async (savedDoc) => {
      window.openAssistDoc();
      document.getElementById('cc-landing').style.display = 'none';
      window._adocArtifacts = window._adocArtifacts || {};
      window._adocArtifacts['reopened-carr'] = {
        name: savedDoc.title, fmt: 'html', _adocStructuredDoc: savedDoc,
        _adocStructuredSnapshot: { sourceSnapshotId: savedDoc.sourceSnapshotId, entries: [] },
        _adocRenderManifestOverride: null, _adocGenerationEngine: 'structured',
        _adocCapabilities: { workspace: true, persist: true, fineCitations: true, blockEditing: true, transform: false, export: true, qualityControlledExport: true },
      };
      const ok = await window.adocOpenWorkspace('reopened-carr');
      return { ok, text: document.getElementById('cc-ws-doc-card').textContent };
    }, savedCarrBody.document.clinicalDocument);
    log('12a. APRÈS RECHARGEMENT DE PAGE COMPLET (Carrousel) — réouverture réussie', reopened.ok === true, reopened);
    log('12b. APRÈS RECHARGEMENT — le titre de carte édité est bien affiché', reopened.text.includes('Titre de carte édité'), reopened.text);
    log('12c. Aucune erreur JS après rechargement (Carrousel)', errors2.length === 0, errors2);
    await page2.close();
  }

  await browser.close();

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== RÉSULTATS ITEM 68 CONSTRUCTION ===');
  results.forEach(([label, ok]) => console.log((ok ? '✅' : '❌') + ' ' + label));
  console.log('\nTotal: ' + results.length + ' | Réussis: ' + (results.length - failed.length) + ' | Échoués: ' + failed.length);
  if (failed.length) {
    console.log('\n--- DÉTAILS DES ÉCHECS ---');
    failed.forEach(([label, , extra]) => console.log(label + ' :: ' + JSON.stringify(extra)));
    process.exit(1);
  }
})();
