const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {ROOT,doc,open}=require('./presentation-edit-fixtures.cjs');
const backend=require(path.resolve(__dirname,'../../../../Worker/tests/clinical-documents-sqlite.cjs'))();
(async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();const alerts=[],errors=[];let refusal=false;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('Copie locale');else{alerts.push(d.message());await d.accept();}});
 await page.addInitScript(()=>localStorage.setItem('workerApiKey','secret-test-local'));
 await page.route('https://**/*',async route=>{const r=route.request(),u=new URL(r.url());if(r.resourceType()==='script')return route.fulfill({contentType:'application/javascript',body:''});if(u.pathname.startsWith('/clinical-documents')){if(refusal&&r.method()==='POST')return route.fulfill({status:400,json:{error:'documentKind invalide — token=secret-test-local'}});const rep=await backend.respond(r.url(),r.method(),r.postData());return route.fulfill({status:rep.status,body:await rep.text(),contentType:'application/json'});}return route.fulfill({json:{results:[],items:[],books:[],total:0}});});
 await page.goto('file://'+ROOT+'/studio-clinique.html');
 for(const assembled of [false,true]){
  let d=doc();
  if(assembled)d=await page.evaluate(d=>{const modules=[1,2].map(n=>({id:'m'+n,doc:{...structuredClone(d),documentId:'m'+n,title:'Module '+n},snapshot:{sourceSnapshotId:d.sourceSnapshotId,entries:[]}}));return window.adocAssembleCourse(modules,{courseId:'cours',titre:'Cours assemblé',modules:[1,2].map(n=>({id:'m'+n,titre:'Module '+n,notionsCles:['Notion'],dureeMinutes:10}))},{ids:{documentId:'cours',versionId:'cours-v1',createdAt:'2026-10-04T10:00:00Z',requestId:'cours-r'}}).doc;},d);
  assert.ok(d,'assemblage réel');assert.equal(await open(page,d),true);
  await page.evaluate(()=>adocWsSave());const id=await page.evaluate(()=>window._adocArtifacts[window._adocWsState.storeKey]._adocClinicalDocumentId);assert.ok(id,JSON.stringify(alerts));
  await page.reload();await page.evaluate(()=>adocCreationsLoad('cc-home-creations'));
  for(const mount of ['cc-home-creations','cc-ws-creations']) {
   await page.evaluate(async mount=>{await adocCreationsLoad(mount);document.getElementById(mount+'-filter-kind').value='presentation';adocCreationsApplyFilters(mount);},mount);
   const filtered=await page.evaluate(mount=>({items:window._adocCreationsState[mount].filtered,text:document.getElementById(mount+'-results').textContent,options:document.querySelectorAll('#'+mount+'-filter-kind option[value="presentation"]').length}),mount);
   assert.equal(filtered.options,1);assert.ok(filtered.items.length);assert.ok(filtered.items.every(x=>x.document_kind==='presentation'));assert.match(filtered.text,/Présentation/);
  }
  const idx=await page.evaluate(id=>window._adocCreationsState['cc-home-creations'].filtered.findIndex(x=>x.document_id===id),id);assert.ok(idx>=0);
  await page.evaluate(idx=>adocCreationsOpen('cc-home-creations',idx),idx);
  await page.waitForSelector('.adoc-sc-card-title');
  const restored=await page.evaluate(()=>window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc);
  assert.equal(restored.documentKind,'presentation');assert.equal(restored.blocks.length,d.blocks.length);
  await page.evaluate(()=>adocPresentOpen());await page.waitForSelector('#cc-ws-present-overlay.open');await page.evaluate(()=>adocPresentClose());
  const html=await page.evaluate(()=>adocBuildStandalonePresentationHTML(window._adocArtifacts[window._adocWsState.storeKey]._adocStructuredDoc));assert.ok(html.includes('Diapositive'));
  const exported=await browser.newPage();await exported.route('https://**/*',r=>r.abort());await exported.setContent(html);await exported.evaluate(()=>adocPresentDemarrerExport());await exported.waitForSelector('.adoc-sc-card');await exported.close();
  await page.evaluate(()=>adocWsSave());assert.equal(backend.db.prepare('SELECT count(*) AS n FROM clinical_document_versions WHERE document_id=?').get(id).n,2);
  await page.evaluate(()=>adocWsSaveAs());const copy=await page.evaluate(()=>window._adocArtifacts[window._adocWsState.storeKey]._adocClinicalDocumentId);assert.notEqual(copy,id);
  console.log('PASS '+(assembled?'cours assemblé':'présentation')+' : sauvegarde, rechargement, Mes créations, Présenter, export, version 2, Enregistrer sous');
 }
 refusal=true;await page.evaluate(()=>adocWsSave());await page.evaluate(()=>adocWsSaveAs());assert.equal(alerts.length,2);for(const a of alerts){assert.match(a,/HTTP 400.*documentKind invalide/);assert.ok(!a.includes('secret-test-local'));}
 assert.deepEqual(backend.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.deepEqual(errors,[]);console.log('PASS erreurs lisibles, secrets masqués, intégrité SQLite');
 }finally{await browser.close();backend.db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
