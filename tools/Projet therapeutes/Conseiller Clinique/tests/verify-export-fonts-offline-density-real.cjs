#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OUTPUT = '/tmp/studio-clinique-export-polices-hors-ligne.html';

const paragraph = (id, text, style) => ({ id, type: 'paragraph', content: { text }, style: style || {}, citationIds: [], validation: {} });
const card = (id, title, blocks, titleStyle) => ({ id, type: 'card', citationIds: [], validation: {},
  content: { title, titleStyle: titleStyle || {}, imageRef: null, imageAlt: null, blocks } });
const DOC = {
  schemaVersion: 1, documentId: 'offline-fonts', versionId: 'v1', previousVersionId: null,
  requestId: 'r', sourceSnapshotId: 's', createdAt: '2026-11-10T00:00:00Z', language: 'fr',
  status: 'draft', title: 'Polices et densité', purpose: 'test', audience: 'clinicien',
  documentKind: 'presentation', renderManifestId: 'manifest-default-001', derivedFrom: null,
  citations: [], validation: { sourceIntegrity: 'pending', contentCompleteness: 'pending', layout: 'pending', accessibility: 'pending', humanClinicalReview: 'required' },
  blocks: [
    card('c1', 'Titre Pompiere', [paragraph('p1', 'Corps Montserrat', { fontFamily: 'Montserrat' })], { fontFamily: 'Pompiere' }),
    card('c2', 'Diapositive dense', [paragraph('p2', Array(90).fill('Une ligne de contenu volontairement dense.').join('\n'))])
  ]
};

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (/^(file:|https:\/\/fonts\.(googleapis|gstatic)\.com\/)/.test(url)) route.continue();
      else route.abort();
    });
    await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
    await page.waitForFunction(() => typeof window.adocEmbedExportFonts === 'function'
      && typeof window.adocMesurerDensitePresentation === 'function');
    const result = await page.evaluate(async doc => {
      const html = await window.adocBuildStandalonePresentationHTML(doc, { embedImages: false, embedFonts: true });
      const denses = await window.adocMesurerDensitePresentation(doc);
      const hote = document.createElement('div');
      hote.id = 'cc-ws-doc-card';
      hote.innerHTML = '<div class="adoc-sc-presentation-slide"><div class="adoc-sc-card"></div></div>'.repeat(2);
      document.body.appendChild(hote);
      Array.from(hote.querySelectorAll('.adoc-sc-card')).forEach((card, i) => {
        Object.defineProperty(card, 'clientHeight', { value: 800 });
        Object.defineProperty(card, 'scrollHeight', { value: i === 0 ? 920 : 800 });
      });
      const densesLive = await window.adocMesurerDensitePresentation(doc);
      hote.remove();
      return { html, denses, densesLive, rapport: window._adocLastExportFontReport };
    }, DOC);
    assert.match(result.html, /data-adoc-fonts-offline="true"/, 'feuille de police inline absente');
    assert.match(result.html, /data:font\/woff2;base64,/, 'fichier WOFF2 non embarqué');
    const headFonts = result.html.slice(0, result.html.indexOf('<title>'));
    assert.doesNotMatch(headFonts, /<link[^>]+fonts\.googleapis\.com/, 'lien Google Fonts encore requis dans le head');
    assert.ok(result.rapport.fichiers >= 2 && result.rapport.echecs.length === 0,
      'rapport d’embarquement incomplet : ' + JSON.stringify(result.rapport));
    assert.deepEqual(result.denses.map(d => d.index), [2], 'seule la diapositive dense doit être signalée');
    assert.deepEqual(result.densesLive.map(d => d.index), [1],
      'dans le Studio, la mesure doit privilégier les cartes déjà rendues avec leurs images');
    fs.writeFileSync(OUTPUT, result.html, 'utf8');
    console.log('OK — polices WOFF2 autonomes et densité réelle détectée : ' + OUTPUT);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
