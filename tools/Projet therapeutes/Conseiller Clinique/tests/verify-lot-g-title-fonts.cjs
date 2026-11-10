// Lot G: mesure les HTML effectivement produits par les cinq chemins d'export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(process.env.LOT_G_CORE || path.join(root, 'studio-clinique-core.js'), 'utf8');
const anchor = '})(); // fin IIFE Assistant Doc v2';
assert.equal(core.split(anchor).length, 2, 'point d’instrumentation unique');
let mutationCore = core;
if (process.env.LOT_G_MUTATION === 'collect')
  mutationCore = mutationCore.replace('return adocEditorExportFonts({ blocks: blocks }, titleOnly ? null : tokens);',
    'return titleOnly ? "" : adocEditorExportFonts(doc, tokens);');
if (process.env.LOT_G_MUTATION === 'render')
  mutationCore = mutationCore.replace('adocTitleStyleAttr(card.content.titleStyle) + \'>' , 'adocTitleStyleAttr(null) + \'>');
if (process.env.LOT_G_MUTATION === 'wrong-card')
  mutationCore = mutationCore.replace('adocTitleFontStyles(doc).filter(function(style)',
    'adocTitleFontStyles(doc).slice(-1).filter(function(style)');
if (process.env.LOT_G_MUTATION) assert.notEqual(mutationCore,core,
  'mutation non appliquée : ' + process.env.LOT_G_MUTATION);
const instrumented = mutationCore.replace(anchor, `window.__lotG = {
  wrap: adocClinicalDocumentWrapHTML,
  paged: adocBuildCarrouselPdfPagesHTML,
  interactive: adocBuildStandalonePresentationHTML,
  fonts: adocEditorExportFonts,
  resolve: adocPdfResolveCharterFonts
  ,renderFiche: adocRenderFicheHTML,
  renderCarrousel: adocRenderCarrouselHTML,
  renderPresentation: adocRenderPresentationHTML
};\n${anchor}`);
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const card = (id, title, style) => ({id, type:'card', content:{title, imageRef:null, imageAlt:null,
  ...(style ? {titleStyle:style} : {}), blocks:[]}, citationIds:[], validation:{}});
const doc = (kind, style) => ({documentKind:kind, title:'Titre du document', language:'fr', purpose:'Essai', audience:'Cliniciens',
  ...(style && kind === 'fiche' ? {titleStyle:style} : {}),
  blocks: kind === 'fiche' ? [] : [card('carte-a','Titre ciblé',style),card('carte-b','Autre carte',style ? {fontFamily:'Lora'} : null)]});

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('dialog', d => d.dismiss());
    await page.route('**/studio-clinique-core.js*', route => route.fulfill({status:200, contentType:'text/javascript', body:instrumented}));
    await page.goto('file://' + path.join(root, 'studio-clinique.html'));
    const outputs = await page.evaluate(async ({plain, styled}) => {
      const kinds = ['presentation','carrousel','fiche'];
      const result = {};
      for (const kind of kinds) {
        const d0 = plain[kind], d1 = styled[kind];
        const render = kind === 'fiche' ? window.__lotG.renderFiche : kind === 'carrousel'
          ? window.__lotG.renderCarrousel : window.__lotG.renderPresentation;
        result[kind] = {
          plain: window.__lotG.wrap(d0, render(d0, {}), {}),
          styled: window.__lotG.wrap(d1, render(d1, {}), {}),
        };
      }
      const p = styled.presentation;
      result.pdf = await window.__lotG.paged(p, {}, '');
      result.pdfPlain = await window.__lotG.paged(plain.presentation, {}, '');
      result.interactive = await window.__lotG.interactive(p, {embedImages:false});
      result.interactivePlain = await window.__lotG.interactive(plain.presentation, {embedImages:false});
      result.jpeg = window.__lotG.wrap(styled.carrousel,
        window.__lotG.renderCarrousel(styled.carrousel, {}), {});
      result.rootOnly = window.__lotG.wrap({...plain.presentation,
        titleStyle:{fontFamily:'Crimson Pro'}}, '<main>contenu</main>', {});
      result.interactiveRootOnly = await window.__lotG.interactive({...plain.presentation,
        titleStyle:{fontFamily:'Crimson Pro'}}, {embedImages:false});
      result.knownResolution = await window.__lotG.resolve({}, null, p);
      const originalFetch = window.fetch;
      window.fetch = async () => ({ok:false});
      try { result.unknownResolution = await window.__lotG.resolve({}, null,
        {...plain.presentation,titleStyle:{fontFamily:'Police Imaginaire'}}); }
      finally { window.fetch = originalFetch; }
      return result;
    }, {plain:Object.fromEntries(['presentation','carrousel','fiche'].map(k=>[k,doc(k)])),
      styled:Object.fromEntries(['presentation','carrousel','fiche'].map(k=>[k,doc(k,{fontFamily:'Crimson Pro',fontSizePt:25})]))});
    for (const kind of ['presentation','carrousel','fiche']) {
      const plainHash = digest(outputs[kind].plain);
      if (process.env.LOT_G_BASELINE) console.log('BASELINE',kind,plainHash);
      else assert.equal(plainHash, {
        presentation:'af846cf5f63109c1db8b317548ba3c5c61ce7a24641e5543444134d4e895dff8',
        carrousel:'ac04574a5acd6255f1208b7898a4bdbffc98d42f90d48f70fdec958f661806cd',
        fiche:'79d5be5fbf189e0251ab53337ab20730e9c9600c13760d6055d70ff02bf3f088'
      }[kind], kind + ' : HTML sans police de titre changé');
      if (!process.env.LOT_G_BASELINE) {
        assert.ok(/family=Crimson\+Pro/.test(outputs[kind].styled), kind + ' : lien de police absent');
        assert.ok(/style="font-family:\s*&quot;Crimson Pro/.test(outputs[kind].styled), kind + ' : style titre absent');
      }
    }
    if (process.env.LOT_G_BASELINE) {
      console.log('BASELINE pdfPlain',digest(outputs.pdfPlain));
      console.log('BASELINE interactivePlain',digest(outputs.interactivePlain));
    } else {
      assert.equal(digest(outputs.pdfPlain),'5e2515cc7c5e88a237d55c43e8e49bae3813b0f23e1dba437f2ee9fc3fdd55fa',
        'PDF sans police de titre changé');
      assert.equal(digest(outputs.interactivePlain),'5a4d3f412d1cabe27a49587f577b5f0b939e15a1414f4e73a1405f639b96e907',
        'présentation interactive sans police de titre changée');
    }
    if (!process.env.LOT_G_BASELINE) for (const kind of ['pdf','interactive','jpeg'])
      assert.ok(/family=Crimson\+Pro/.test(outputs[kind]), kind + ' : lien de police absent');
    if (!process.env.LOT_G_BASELINE)
      assert.ok(/family=Crimson\+Pro/.test(outputs.rootOnly), 'titre racine : lien absent');
    if (!process.env.LOT_G_BASELINE) {
      assert.ok(/family=Crimson\+Pro/.test(outputs.interactiveRootOnly), 'titre racine interactif : lien absent');
    }
    assert.match(outputs.pdf, /Titre ciblé/, 'PDF : bonne carte');
    assert.match(outputs.pdf, /Autre carte/, 'PDF : carte distincte conservée');
    if (!process.env.LOT_G_BASELINE) {
      assert.deepEqual(outputs.knownResolution.warnings,[], 'Crimson Pro ne doit pas être remplacée');
      assert.match(outputs.unknownResolution.warnings.join(' '),/Police Imaginaire.*remplacée/,
        'police indisponible : avertissement déjà prévu');
    }
    if (!process.env.LOT_G_BASELINE) {
      const pdfPage = await browser.newPage();
      await pdfPage.setContent(outputs.pdf, {waitUntil:'networkidle',timeout:45000});
      await pdfPage.evaluate(() => document.fonts.ready);
      const cards = await pdfPage.locator('.adoc-sc-card-title').evaluateAll(els => els.map(el => ({
        text:el.textContent, font:getComputedStyle(el).fontFamily, inline:el.style.fontFamily,
        loaded:[...document.fonts].some(face => face.family === 'Crimson Pro' && face.status === 'loaded')
      })));
      if (process.env.LOT_G_DEBUG) console.log(cards, await pdfPage.evaluate(() => [...document.fonts].map(f => ({family:f.family,status:f.status}))));
      assert.equal(cards.length,2,'deux cartes rendues');
      assert.match(cards[0].font,/Crimson Pro/,'titre de la bonne carte en Crimson Pro');
      assert.ok(cards[0].loaded,'Crimson Pro réellement chargée');
      assert.match(cards[1].font,/Lora/,'deuxième carte avec sa propre police');
      assert.ok(!/Crimson Pro/.test(cards[1].font),'police non propagée à la mauvaise carte');
      const pdf = await pdfPage.pdf({preferCSSPageSize:true,printBackground:true});
      const pdfPath = process.env.LOT_G_PDF || path.join(os.tmpdir(),'studio-lot-g-local.pdf');
      fs.writeFileSync(pdfPath,pdf);
      const pdffonts = '/Users/christophebonnet/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdffonts';
      const fontList = spawnSync(pdffonts,['-f','1','-l','1',pdfPath],{encoding:'utf8'});
      assert.equal(fontList.status,0,fontList.stderr);
      assert.match(fontList.stdout,/CrimsonPro|Crimson Pro/,'PDF local : police de titre non embarquée');
      const jpegPage = await browser.newPage();
      await jpegPage.setContent(outputs.jpeg,{waitUntil:'networkidle',timeout:45000});
      await jpegPage.evaluate(() => document.fonts.ready);
      assert.match(await jpegPage.locator('.adoc-sc-card-title').first().evaluate(el => getComputedStyle(el).fontFamily),
        /Crimson Pro/,'HTML envoyé au JPEG : titre dans la police attendue');
    }
    console.log('PASS Lot G : trois HTML inchangés sans titre stylé ; polices dans PDF, HTML, interactif, JPEG/impression');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
