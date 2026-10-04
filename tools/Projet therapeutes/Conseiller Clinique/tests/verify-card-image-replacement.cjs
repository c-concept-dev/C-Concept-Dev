const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {ROOT,doc,open}=require('./presentation-edit-fixtures.cjs');
const backend=require(path.resolve(__dirname,'../../../../Worker/tests/clinical-documents-sqlite.cjs'))();
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage(),alerts=[],errors=[],requests=[];
 page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('workerApiKey','image-secret-local'));
 await page.route('https://**/*',async r=>{const req=r.request(),u=new URL(req.url());requests.push({path:u.pathname,method:req.method()});
  if(req.resourceType()==='script')return r.fulfill({body:'',contentType:'application/javascript'});
  if(u.pathname.startsWith('/clinical-documents')){const rep=await backend.respond(req.url(),req.method(),req.postData());return r.fulfill({status:rep.status,body:await rep.text(),contentType:'application/json'});}
  if(u.pathname.startsWith('/brand-assets/')&&req.method()==='GET')return r.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')});
  if(u.pathname==='/brand-assets/upload'&&req.method()==='POST')return r.fulfill({json:{asset_id:'asset-upload'}});
  if(u.pathname==='/media-assets')return r.fulfill({json:{media:[{asset_id:'asset-library',attribution:'Photo locale'}]}});
  return r.fulfill({json:{results:[],items:[],total:0}});
 });
 await page.goto('file://'+ROOT+'/studio-clinique.html');
 for(const kind of ['presentation','carrousel']){
  const d=doc(kind);d.blocks[0].content.imageRef='ocean landscape';d.blocks[0].content.imageAlt='Océan';
  assert.equal(await open(page,d),true);
  await page.locator('.adoc-sc-card-img').click();await page.getByRole('button',{name:'Changer l’image',exact:true}).click();
  await page.locator('.cc-block-edit-result input.cc-block-edit-freetext').fill('forest landscape');
  await page.getByRole('button',{name:'Créer',exact:true}).click();
  await page.waitForFunction(()=>window._adocArtifacts['test-doc']._adocClinicalDocumentId);
  assert.equal(await page.evaluate(()=>window._adocArtifacts['test-doc']._adocStructuredDoc.blocks[0].content.imageRef),'forest landscape');
  await page.locator('.adoc-sc-card-img').click();await page.getByRole('button',{name:'Changer l’image',exact:true}).click();
  await page.getByRole('button',{name:'Choisir dans Médias',exact:true}).click();
  await page.locator('#cc-block-media-history button').filter({hasText:'Insérer'}).click();
  await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-library"]');
  await page.locator('.adoc-sc-card-img').click();await page.getByRole('button',{name:'Changer l’image',exact:true}).click();
  await page.locator('.cc-block-insert-image-drop').evaluate((el,png)=>{const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'photo.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));},png);
  await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-upload"]');
  await page.locator('.adoc-sc-card-img').click();await page.getByRole('button',{name:'Retirer l’image',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.adoc-sc-card-img').length===0);
  await page.locator('.adoc-sc-card-title').click();await page.getByRole('button',{name:'Changer l’image',exact:true}).click();
  await page.getByRole('button',{name:'Choisir dans Médias',exact:true}).click();await page.locator('#cc-block-media-history button').filter({hasText:'Insérer'}).click();await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-library"]');
  // Dépôt réel sur la couverture elle-même, pas seulement le sous-panneau.
  await page.locator('.adoc-sc-card-img').evaluate((el,png)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'direct.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));},png);
  await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-upload"]');
  await page.evaluate(()=>adocWsSave());const id=await page.evaluate(()=>window._adocArtifacts['test-doc']._adocClinicalDocumentId);
  await page.reload();await page.evaluate(()=>adocCreationsLoad('cc-home-creations'));const idx=await page.evaluate(id=>window._adocCreationsState['cc-home-creations'].filtered.findIndex(x=>x.document_id===id),id);await page.evaluate(i=>adocCreationsOpen('cc-home-creations',i),idx);await page.waitForSelector('.adoc-sc-card-img[data-asset-id="asset-upload"]');
  console.log('PASS '+kind+' : description, Médias, dépôt panneau/direct, retrait/restauration, sauvegarde/relecture');
 }
 const d=doc();d.blocks[0].content.imageRef=null;d.blocks[0].content.imageAlt='Couverture';d.blocks[0].content.imageAssetId='asset-cover';
 d.blocks[0].content.blocks.push({id:'img-inline',type:'image',content:{query:'Photo',alt:'Photo',assetId:'asset-inline'},citationIds:[],validation:{}});
 await open(page,d);await page.locator('#img-inline img').click();await page.getByRole('button',{name:'Changer l’image',exact:true}).click();await page.getByRole('button',{name:'Choisir dans Médias',exact:true}).click();await page.locator('#cc-block-media-history button').filter({hasText:'Insérer'}).click();await page.waitForSelector('#img-inline img[data-asset-id="asset-library"]');
 const classic=await page.evaluate(()=>{const art=window._adocArtifacts['test-doc'];return adocExportClinicalDocumentHTML(art._adocStructuredDoc,art._adocStructuredSnapshot);});
 assert.equal(classic.blocked,false,JSON.stringify(classic.qc));assert.ok(!classic.html.includes('image-secret-local'));
 const classicContext=await browser.newContext({offline:true});const cp=await classicContext.newPage();await cp.setContent(classic.html);await cp.waitForFunction(()=>[...document.querySelectorAll('img[data-asset-id]')].length===2&&[...document.querySelectorAll('img[data-asset-id]')].every(i=>i.src.startsWith('data:image/')&&i.complete&&i.naturalWidth>0));await classicContext.close();
 const html=await page.evaluate(()=>adocBuildStandalonePresentationHTML(window._adocArtifacts['test-doc']._adocStructuredDoc,{delaiMs:0}));
 assert.ok(!html.includes('image-secret-local'));assert.ok(html.includes('asset:asset-cover'));assert.ok(html.includes('asset:asset-library'));
 const offline=await browser.newContext({offline:true});const ep=await offline.newPage();const offlineErrors=[];ep.on('pageerror',e=>offlineErrors.push(e.message));await ep.setContent(html);await ep.evaluate(()=>adocPresentDemarrerExport());await ep.waitForFunction(()=>[...document.querySelectorAll('img[data-asset-id]')].length===2&&[...document.querySelectorAll('img[data-asset-id]')].every(i=>i.src.startsWith('data:image/')&&i.complete&&i.naturalWidth>0));
 assert.equal(await ep.locator('.adoc-sc-card-zoom-badge').count(),1);assert.deepEqual(offlineErrors,[]);await offline.close();
 assert.deepEqual(alerts,[]);assert.deepEqual(errors,[]);assert.deepEqual(backend.db.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('PASS remplacement image en ligne, export réellement hors ligne couverture + bloc, pastille, aucune clé exportée');
}finally{await browser.close();backend.db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
