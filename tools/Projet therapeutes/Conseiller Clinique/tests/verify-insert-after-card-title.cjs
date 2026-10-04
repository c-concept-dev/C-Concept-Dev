const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ROOT,doc,open}=require('./presentation-edit-fixtures.cjs');
(async()=>{const b=await chromium.launch();try{const p=await b.newPage();const alerts=[];p.on('dialog',async d=>{alerts.push(d.message());await d.accept();});await p.addInitScript(()=>localStorage.setItem('workerApiKey','local-test'));
 await p.route('https://**/*',r=>{const u=r.request().url();if(r.request().resourceType()==='script')return r.fulfill({body:'',contentType:'application/javascript'});if(u.endsWith('/brand-assets/upload'))return r.fulfill({json:{asset_id:'asset-file'}});if(u.includes('/brand-assets/'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="red"/></svg>'});if(u.endsWith('/brand-assets'))return r.fulfill({json:{asset_id:'asset-file'}});if(u.endsWith('/media-assets'))return r.fulfill({json:{media:[{asset_id:'asset-library',attribution:'Image test'}]}});if(u.endsWith('/video-links'))return r.fulfill({json:{videos:[{video_id:'v1',url:'http://localhost:47823/video.mp4',title:'Vidéo locale'}]}});return r.fulfill({json:{results:[],items:[],total:0}});});
 await p.goto('file://'+ROOT+'/studio-clinique.html');
 for(const kind of ['presentation','carrousel']){
  for(const type of ['paragraph','image','asset','video','file']){
   assert.equal(await open(p,doc(kind)),true);await p.locator('.adoc-sc-card-title').click();
   assert.equal(await p.getByRole('button',{name:'Insérer un bloc avant',exact:true}).count(),0);
   await p.getByRole('button',{name:'Insérer un bloc après',exact:true}).click();
   if(type==='paragraph')await p.evaluate(()=>adocChooseBlockInsertType('after','paragraph'));
   if(type==='image'){await p.evaluate(()=>adocChooseBlockInsertType('after','image'));await p.evaluate(()=>adocConfirmBlockInsert('after','image','ocean landscape'));}
   if(type==='asset'){await p.evaluate(()=>adocChooseBlockInsertType('after','image'));await p.evaluate(()=>adocBlockInsertMediaLoadHistory('after'));await p.evaluate(()=>adocMediaBlockInsertFromHistory('after',0));}
   if(type==='video'){await p.evaluate(()=>adocChooseBlockInsertType('after','video'));await p.evaluate(()=>adocBlockVideoLoadHistory('after'));await p.evaluate(()=>adocVideoInsertFromBlockPicker('after',0));}
   if(type==='file'){await p.evaluate(()=>adocChooseBlockInsertType('after','image'));await p.evaluate(async()=>{const blob=await(await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')).blob();return adocConfirmBlockInsertFromFile('after',new File([blob],'photo.png',{type:'image/png'}));});}
   const blocks=await p.evaluate(()=>window._adocArtifacts['test-doc']._adocStructuredDoc.blocks);
   assert.equal(blocks.length,1);assert.equal(blocks[0].type,'card');assert.equal(blocks[0].content.blocks.length,3,JSON.stringify(alerts));assert.equal(blocks[0].content.blocks[0].type,['asset','file'].includes(type)?'image':type);assert.equal(blocks[0].content.blocks[1].id,'h1');
   const exported=await p.evaluate(async kind=>{const art=window._adocArtifacts['test-doc'];if(kind==='presentation')return adocBuildStandalonePresentationHTML(art._adocStructuredDoc,{delaiMs:0});const result=await adocExportClinicalDocumentHTML(art._adocStructuredDoc,art._adocStructuredSnapshot);if(result.blocked)throw Error(JSON.stringify(result.qc));return result.html;},kind);
   const exportDir=fs.mkdtempSync(path.join(os.tmpdir(),'clinique-insert-'));const exportFile=path.join(exportDir,'presentation.html');fs.writeFileSync(exportFile,exported);const ep=await b.newPage();await ep.route('https://**/*',r=>r.abort());await ep.goto('file://'+exportFile);if(kind==='presentation')await ep.evaluate(()=>adocPresentDemarrerExport());await ep.waitForSelector('.adoc-sc-card');assert.equal(await ep.locator('.adoc-sc-card').count(),1);assert.equal(await ep.locator('.adoc-sc-card > .adoc-sc-block').count(),3);await ep.close();fs.rmSync(exportDir,{recursive:true,force:true});
  }
 }
 // Voisins ordinaires : heading imbriqué et dernier bloc conservent leur conteneur.
 await open(p,doc());await p.locator('#h1').click();await p.evaluate(()=>adocConfirmBlockInsert('before','paragraph',''));await p.locator('#p1').click();await p.evaluate(()=>adocConfirmBlockInsert('after','paragraph',''));
 assert.deepEqual(await p.evaluate(()=>window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.blocks.map(x=>x.type)),['paragraph','heading','paragraph','paragraph']);
 assert.deepEqual(alerts,[]);
 // Refus réels et annulation : aucun retour muet, aucune mutation résiduelle.
 await p.evaluate(()=>{window._adocBlockEditState={storeKey:'test-doc',blockId:'absent'};return adocConfirmBlockInsert('after','paragraph','');});assert.match(alerts.pop(),/introuvable/);
 await p.locator('.adoc-sc-card-title').click();await p.evaluate(()=>adocConfirmBlockInsert('before','paragraph',''));assert.match(alerts.pop(),/précéder/);
 await p.evaluate(()=>{window._adocBlockEditState={storeKey:'test-doc',blockId:'p1'};return adocConfirmBlockInsert('after','invalid','');});assert.match(alerts.pop(),/rendu.*annulée/);
 for(const kind of ['fiche','tableau','script']){await open(p,doc(kind));await p.locator('.adoc-sc-cover-title').click();await p.evaluate(()=>adocConfirmBlockInsert('after','paragraph',''));assert.match(alerts.pop(),/titre du document n’est pas un bloc/);}
 for(const fn of ['adocMediaBlockInsertFromSearch','adocMediaBlockInsertFromHistory','adocVideoInsertFromBlockPicker']){await p.evaluate(fn=>window[fn]('after',999),fn);assert.match(alerts.pop(),/média est introuvable/);}
 console.log('PASS : 10 insertions sous titre et exports, avant masqué, heading/dernier bloc, annulation et titres racine explicites');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
