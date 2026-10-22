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
        presentation:'2165d6ba087545a734b90d4cdbcb056b84b5f3d28774cc132925d2440ebf653a',
        carrousel:'4b6caa6d98c0b12ae776d2757388c5498498b0b540f0ac2004f2747746cb08c6',
        fiche:'6bb1e5953382c70b5ca9db769e8ba5f3bd3a3ae53ba59395e410b583588b98b1'
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
      assert.equal(digest(outputs.pdfPlain),'4c527594d1f8390c6d2b3b4c296763e3070144717af68eeb37cb366707bc248e',
        'PDF sans police de titre changé');
      assert.equal(digest(outputs.interactivePlain),'b8f6a6c9a65d8386e804d1fbbf1b2b75d74219e29201da6fa9ee3e29ec64ad5b',
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
