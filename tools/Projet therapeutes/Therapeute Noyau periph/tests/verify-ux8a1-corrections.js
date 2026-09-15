const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/studio-clinique.html';
const FIXTURES = '/home/user/C-Concept-Dev/tools/Projet therapeutes/Therapeute Noyau periph/fixtures';
const OUT = '/tmp/claude-0/-home-user-C-Concept-Dev/5f3425ee-5b94-52ca-aae3-c1f5a0b05cc9/scratchpad';

function load(name) { return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8')); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().includes('library-stats')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_books: 245, total_chunks: 5000, by_approach: [] }) });
      return;
    }
    route.continue();
  });
  await page.goto('file://' + FILE);
  await page.waitForTimeout(300);

  const ficheType = load('fixture-fiche-type.json');
  const ficheTypeSnap = load('fixture-fiche-type.sourcesnapshot.json');
  const brokenSnap = load('fixture-broken-checksum.sourcesnapshot.json');

  console.log('=== NOMINAL — rendu fiche-type (checksums réels, tous valides) ===');
  const nominal = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return {
      qc: result.qc,
      hasCiteOnHeading: /adoc-sc-heading[^>]*>[^<]*<sup class="adoc-sc-cite"/.test(result.html) || result.html.includes('adoc-sc-cite'),
      usesTokens: result.html.includes('--adoc-sc-heading-color:#102f31'),
      renderManifestId: result.renderManifest.id,
      tokensSnapshotId: result.tokens.tokensSnapshotId,
    };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(nominal);

  console.log('\n=== POINT 1 — citationLinks unique vérité : citationIds orphelin (jamais dans citationLinks) doit être détecté et bloquant, jamais juste affiché ===');
  const point1 = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    // Ajoute un citationIds qui n'existe dans AUCUN validation.citationLinks de ce bloc.
    bad.blocks[1].citationIds = (bad.blocks[1].citationIds || []).concat(['citation-orphan-999']);
    const result = await window.adocRenderClinicalDocument(bad, snap);
    return {
      renderedOrphanMarker: result.html.includes('orphan-999') || result.html.includes('citation-orphan-999'),
      blocking: result.qc.blocking,
      exportAllowed: result.qc.exportAllowed,
    };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(point1);
  console.log('=> orphan jamais affiché ET détecté comme bloquant:', point1.renderedOrphanMarker === false && point1.blocking.some(b => b.includes('non vérifiée')));

  console.log('\n=== POINT 2 — export réellement bloqué (html:null) quand qc.exportAllowed===false ===');
  const point2bad = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.blocks[1].validation = { citationLinks: [{ citationId: 'citation-does-not-exist', claimText: 'x', claimSupport: 'pass' }] };
    bad.blocks[1].citationIds = ['citation-does-not-exist'];
    const exportResult = await window.adocExportClinicalDocumentHTML(bad, snap);
    return { html: exportResult.html, blocked: exportResult.blocked, blockingReasons: exportResult.qc.blocking };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(point2bad);
  console.log('=> export bien bloqué (html===null):', point2bad.html === null && point2bad.blocked === true);

  const point2ok = await page.evaluate(async ({ doc, snap }) => {
    const exportResult = await window.adocExportClinicalDocumentHTML(doc, snap);
    return { hasHtml: typeof exportResult.html === 'string' && exportResult.html.length > 0, blocked: exportResult.blocked };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log('nominal export (rien de cassé):', point2ok, '=> autorisé:', point2ok.hasHtml === true && point2ok.blocked === false);

  console.log('\n=== POINT 3 — RenderManifest réellement consommé : changer tokensSnapshotId change visiblement le rendu ===');
  const point3 = await page.evaluate(async ({ doc, snap }) => {
    const defaultResult = await window.adocRenderClinicalDocument(doc, snap);
    const altManifest = {
      id: 'manifest-alt-test', schemaVersion: 1, rendererVersion: '1.0.0',
      templateRef: { id: 'fiche-editoriale', version: 1 },
      brandKitRef: { id: 'studio-clinique-default', version: 1 },
      tokensSnapshotId: 'tokens-alt-test', assetsSnapshotId: null,
      createdAt: '2026-09-04T00:00:00Z',
      manifestChecksum: 'sha256:' + '1'.repeat(64),
    };
    window.adocTokensSnapshots['tokens-alt-test'] = {
      tokensSnapshotId: 'tokens-alt-test',
      colors: { petrol950: '#ff0000', petrol900: '#ff0000', petrol800: '#ff0000', petrol100: '#ffe0e0', terracotta700: '#0000ff', terracotta600: '#0000ff', terracotta100: '#e0e0ff', ink: '#111111', muted: '#888888', stone300: '#cccccc', paper: '#ffffff' },
      typography: { headingFontFamily: 'Comic Sans MS', bodyFontFamily: 'Comic Sans MS' },
    };
    const altResult = await window.adocRenderClinicalDocument(doc, snap, altManifest);
    return {
      defaultHasRed: defaultResult.html.includes('--adoc-sc-heading-color:#ff0000'),
      altHasRed: altResult.html.includes('--adoc-sc-heading-color:#ff0000'),
      altHasComicSans: altResult.html.includes('Comic Sans MS'),
      defaultVsAltDiffer: defaultResult.html !== altResult.html,
    };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(point3);
  console.log('=> tokensSnapshotId change bien le rendu:', point3.defaultHasRed === false && point3.altHasRed === true && point3.altHasComicSans === true);

  console.log('\n=== POINT 4 — validation JSON Schema réelle : document malformé rejeté avant le renderer ===');
  const point4 = await page.evaluate(async ({ doc, snap }) => {
    const bad = JSON.parse(JSON.stringify(doc));
    bad.unknownField = 'ne devrait jamais passer (additionalProperties:false)';
    try {
      await window.adocRenderClinicalDocument(bad, snap);
      return { threw: false };
    } catch (e) {
      return { threw: true, name: e.name, hasSchemaErrors: Array.isArray(e.schemaErrors) && e.schemaErrors.length > 0 };
    }
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(point4);
  console.log('=> document malformé rejeté par le schéma:', point4.threw === true && point4.name === 'AdocSchemaValidationError');

  console.log('\n=== POINT 5 — contentChecksum réellement vérifié (fixture avec checksum corrompu) ===');
  const point5 = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return { blocking: result.qc.blocking, exportAllowed: result.qc.exportAllowed };
  }, { doc: ficheType, snap: brokenSnap });
  console.log(point5);
  console.log('=> checksum divergent détecté et bloquant:', point5.blocking.some(b => b.includes('Intégrité du passage')) && point5.exportAllowed === false);

  const point5nominal = await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    return { exportAllowed: result.qc.exportAllowed, blocking: result.qc.blocking };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log('nominal (checksum réel, non corrompu):', point5nominal, '=> autorisé:', point5nominal.exportAllowed === true);

  console.log('\n=== POINT 6 — citations affichées sur TOUS les blocs porteurs de texte (heading/list/table inclus) ===');
  const point6 = await page.evaluate(async ({ doc, snap }) => {
    const withCites = JSON.parse(JSON.stringify(doc));
    const heading = withCites.blocks.find(b => b.type === 'heading');
    const list = withCites.blocks.find(b => b.type === 'list');
    const table = withCites.blocks.find(b => b.type === 'table');
    const validCitationId = withCites.citations[0].citationId;
    [heading, list, table].forEach(b => {
      if (!b) return;
      b.citationIds = [validCitationId];
      b.validation = { citationLinks: [{ citationId: validCitationId, claimText: 'test', claimSupport: 'pass' }] };
    });
    const result = await window.adocRenderClinicalDocument(withCites, snap);
    return {
      headingFound: !!heading, listFound: !!list, tableFound: !!table,
      headingHasCite: heading ? new RegExp('id="' + heading.id + '"[^>]*>[^<]*<sup class="adoc-sc-cite"').test(result.html) : null,
      listHasCiteNote: list ? result.html.includes('id="' + list.id + '"') && result.html.slice(result.html.indexOf('id="' + list.id + '"')).slice(0, 800).includes('adoc-sc-cite-note') : null,
      tableHasCiteNote: table ? result.html.includes('id="' + table.id + '"') && result.html.slice(result.html.indexOf('id="' + table.id + '"')).slice(0, 1500).includes('adoc-sc-cite-note') : null,
    };
  }, { doc: ficheType, snap: ficheTypeSnap });
  console.log(point6);

  console.log('\n=== errors ===', errors);

  // Screenshot for the report
  await page.evaluate(async ({ doc, snap }) => {
    const result = await window.adocRenderClinicalDocument(doc, snap);
    document.body.innerHTML = '<div style="max-width:700px;margin:40px auto;">' + result.html + '</div>';
  }, { doc: ficheType, snap: ficheTypeSnap });
  await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + '/ux8a1-pilot-fiche-corrected.png', fullPage: true });

  await browser.close();
})();
