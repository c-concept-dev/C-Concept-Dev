const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { PNG } = require('pngjs');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="100" fill="red"/><rect y="100" width="300" height="100" fill="lime"/><rect y="200" width="300" height="100" fill="blue"/></svg>';
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:1200,height:900}});
   await page.route('https://**/*',route=>{
    if(route.request().url().includes('/brand-assets/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
    if(route.request().resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{results:[],items:[]}});
   });
   await page.goto('file://'+ROOT+'/studio-clinique.html');
   await page.evaluate(()=>{document.getElementById('cc-login-screen')?.remove();document.getElementById('assistdoc-screen')?.classList.add('active')});
   for(const kind of ['presentation','carrousel','fiche','tableau','script','liens']){
    const d=doc(kind),cards=['presentation','carrousel'].includes(kind),key='crop-'+kind;
    if(cards){d.blocks[0].content.imageAssetId='crop-test';d.blocks[0].content.imageAlt='Bands'}
    else d.blocks.push({id:'photo',type:'image',content:{query:'test photo',assetId:'crop-test',alt:'Bands'},citationIds:[],validation:{}});
    assert.equal(await open(page,d,key),true,kind);
    const img=page.locator(cards?'.adoc-sc-card-img':'#photo img').first();
    await img.waitFor({state:'visible'}); await img.click();
    await page.locator('[data-image-crop-open]').click();
    const stage=page.locator('[data-crop-stage]');
    await stage.locator('img').evaluate(el=>el.decode());
    const r=await stage.boundingBox();
    await page.mouse.move(r.x+r.width*.10,r.y+r.height*.36);
    await page.mouse.down();await page.mouse.move(r.x+r.width*.90,r.y+r.height*.64,{steps:8});await page.mouse.up();
    await page.locator('[data-crop-apply]').click();
    const crop=await page.evaluate(k=>window._adocArtifacts[k]._adocStructuredDoc.blocks.find(b=>b.type==='card')?.content.imageDisplay?.crop||window._adocArtifacts[k]._adocStructuredDoc.blocks.find(b=>b.id==='photo')?.content.imageDisplay?.crop,key);
    assert.ok(crop&&crop.y>30&&crop.y<40&&crop.height>20&&crop.height<35,kind+' saved crop '+JSON.stringify(crop));
    const persisted=await page.evaluate(k=>structuredClone(window._adocArtifacts[k]._adocStructuredDoc),key);
    assert.equal(await open(page,persisted,key+'-reopen'),true,kind+' reopens with crop');
    const exportHTML=await page.evaluate(async d=>(await window.adocRenderClinicalDocument(d,{sourceSnapshotId:d.sourceSnapshotId,entries:[]})).html,persisted);
    assert.match(exportHTML,/clip-path:inset/,kind+' export retains crop');
    const rendered=page.locator(cards?'.adoc-sc-card-img':'#photo img').first();
    assert.match(await rendered.getAttribute('style'),/clip-path:inset/,kind+' rendered crop');
    const clip=await rendered.evaluate(el=>{const p=el.offsetParent.getBoundingClientRect();return {x:p.x+el.offsetLeft,y:p.y+el.offsetTop,width:el.offsetWidth,height:el.offsetHeight}});
    const shot=await page.screenshot({clip}); const png=PNG.sync.read(shot);
    if(cards){
      await rendered.click();
      const frame=await rendered.evaluate(el=>{const p=el.offsetParent.getBoundingClientRect();return{x:p.x+el.offsetLeft,y:p.y+el.offsetTop,width:el.offsetWidth,height:el.offsetHeight}});
      const grip=await page.locator('.cc-card-cover-resize-handle.cc-image-resize-se').first().boundingBox();
      assert.ok(grip&&Math.abs(grip.x+grip.width/2-(frame.x+frame.width))<10,kind+' resize handle follows cropped frame');
    }
    for(const fraction of [.1,.5,.9]){
      const i=(Math.floor(png.height*fraction)*png.width+Math.floor(png.width/2))*4;
      assert.ok(png.data[i+1]>150&&png.data[i]<100&&png.data[i+2]<100,kind+' crop shows only green '+fraction+': '+[...png.data.subarray(i,i+3)]);
    }
    if(kind==='presentation'){
      await page.getByLabel('Cadrage').selectOption('contain');
      assert.equal(await page.evaluate(k=>window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.imageDisplay.crop,key+'-reopen'),undefined,'fit replaces crop');
      await page.locator('#cc-ws-undo-btn').click();
      assert.ok(await page.evaluate(k=>window._adocArtifacts[k]._adocStructuredDoc.blocks[0].content.imageDisplay.crop,key+'-reopen'),'undo restores crop');
    }
   }
   const coverDoc=doc('fiche'); coverDoc.blocks.unshift({id:'cover-photo',type:'image',content:{query:'test photo',assetId:'crop-test',alt:'Bands'},citationIds:[],validation:{}});
   assert.equal(await open(page,coverDoc,'crop-doc-cover'),true,'document cover fixture');
   await page.locator('.adoc-sc-cover').first().click({position:{x:10,y:10}});
   await page.locator('[data-image-crop-open]').click();
   const coverStage=page.locator('[data-crop-stage]');await coverStage.locator('img').evaluate(el=>el.decode());
   const cr=await coverStage.boundingBox();await page.mouse.move(cr.x+cr.width*.1,cr.y+cr.height*.36);await page.mouse.down();await page.mouse.move(cr.x+cr.width*.9,cr.y+cr.height*.64,{steps:8});await page.mouse.up();
   await page.locator('[data-crop-apply]').click();
   assert.match(await page.locator('.adoc-sc-cover-image-layer').getAttribute('style'),/clip-path:inset/,'document cover renders crop');
   await page.close();
   console.log('PASS crop '+engine.name()+' 6 kinds + document cover');
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
