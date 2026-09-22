const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..');
(async()=>{
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
try {
const page=await browser.newPage();let fullCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(d.message());d.dismiss()});
const original='Original <texte> & « exact ».\nSecond paragraphe.',translated='Traduction <texte> & « exacte ».\nSecond paragraphe.';
const chunk={id:'chunk-1',book_id:'book-1',book_title:'Livre documentaire',author:'Auteur Test',page_number:12,page_end:14,approach:'ifs',language:'en',content:original,translated_content:translated,is_machine_translated:true,sources:['fts5','vector']};
await page.route('**/*',async route=>{
 const url=route.request().url();if(url.startsWith('file:'))return route.continue();
 let data={};if(url.endsWith('/rag-search')){const q=route.request().postDataJSON().query;if(q==='slow')await new Promise(r=>setTimeout(r,150));data={chunks:[chunk]};}
 if(url.endsWith('/d1-query'))data={results:[{...chunk,id:'author-only',book_title:'Autre livre',content:'Auteur seul.',approach:'icv',is_machine_translated:false}]};
 if(url.endsWith('/passage-full')){fullCalls++;data={full_content:original+' Suite originale.',full_translated_content:translated+' Suite traduite.',is_machine_translated:true};}
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await page.goto('file://'+base+'/studio-clinique.html');
await page.evaluate(async()=>{
 adocHomeSearchTogglePanel();
 document.getElementById('cc-home-search-input').value='slow';document.getElementById('cc-ws-search-input').value='fast';
 await Promise.all([adocHomeLibrarySearch(),adocWorkspaceLibrarySearch()]);
});
assert.equal(await page.locator('#cc-home-search-results article').count(),2);assert.equal(await page.locator('#cc-ws-search-results article').count(),2);
assert.equal(await page.locator('#cc-home-search-results button', {hasText:'Insérer'}).count(),0);
assert.deepEqual(await page.locator('#cc-home-search-results h4').allTextContents(),['ifs','icv']);
assert.equal(await page.locator('#cc-ws-search-results h4').count(),0);assert.equal(fullCalls,0);
assert.equal(await page.locator('#cc-home-search-results .cc-lib-page').first().textContent(),'p. 12–14');
await page.locator('#cc-home-search-results button', {hasText:'Voir plus'}).first().click();assert.equal(fullCalls,1);
await page.waitForFunction(()=>document.querySelector('#cc-home-search-results').textContent.includes('Contexte complet'));
assert.equal(await page.locator('#cc-home-search-results .cc-ws-search-excerpt:visible').first().textContent(),translated+' Suite traduite.');
await page.locator('#cc-home-search-results .cc-lib-vo-toggle').first().click();assert.equal(fullCalls,1);
assert.equal(await page.locator('#cc-home-search-results .cc-ws-search-excerpt:visible').first().textContent(),original+' Suite originale.');
await page.evaluate(async()=>{const input=document.getElementById('cc-home-search-input');input.value='slow';const pending=adocHomeLibrarySearch();input.value='';await adocHomeLibrarySearch();await pending;});
assert.equal(await page.locator('#cc-home-search-results').textContent(),'');
console.log('PASS DOM: independent mounts, home grouping including author, no home insertion, page range, lazy full context and VO.');
const fixture=JSON.parse(fs.readFileSync(path.join(base,'Fixtures/fixture-fiche-type.json')));
fixture.blocks=fixture.blocks.filter(b=>b.type==='paragraph').slice(0,1);fixture.blocks[0].citationIds=[];fixture.blocks[0].validation={};fixture.citations=[];
const entry={sourceSnapshotEntryId:'entry-existing',sourceType:'library',sourceId:'old',passageId:'old',exactText:'Source antérieure.',contentChecksum:'sha256:'+crypto.createHash('sha256').update('Source antérieure.').digest('hex'),book:'Ancien livre',author:'Ancien auteur',locator:{page:1,section:null},retrievedAt:new Date().toISOString()};
const snapshot={sourceSnapshotId:fixture.sourceSnapshotId,entries:[entry]};
await page.evaluate(async({fixture,snapshot})=>{
 window._adocArtifacts=window._adocArtifacts||{};
 window._adocArtifacts.test={_adocCapabilities:{workspace:true,persist:true},_adocGenerationEngine:'structured',_adocStructuredDoc:fixture,_adocStructuredSnapshot:snapshot};
 if(!await adocOpenWorkspace('test'))throw Error('fixture did not open');
},{fixture,snapshot});
await page.evaluate(async()=>{document.getElementById('cc-ws-search-input').value='texte';await adocWorkspaceLibrarySearch()});
const card=page.locator('#cc-ws-search-results article').first();
for(const mode of ['translated','original','full']){
 if(mode==='original')await card.locator('.cc-lib-vo-toggle').click();
 if(mode==='full'){await card.getByText('Voir plus de contexte',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('#cc-ws-search-results').textContent.includes('Contexte complet'));await card.locator('.cc-lib-vo-toggle').click();}
 const shown=await card.locator('.cc-ws-search-excerpt:visible').textContent();
 await card.getByText('Insérer cet extrait',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#cc-ws-search-results .cc-lib-status').textContent.includes('Extrait inséré'));
 const result=await page.evaluate(()=>{const a=_adocArtifacts.test;return {doc:a._adocStructuredDoc,snapshot:a._adocStructuredSnapshot,dirty:a._ccEditorDirty}});
 const b=result.doc.blocks.at(-1),e=result.snapshot.entries.at(-1),c=result.doc.citations.at(-1);
 assert.equal(b.content.text,shown);assert.equal(e.exactText,shown);assert.equal(e.contentChecksum,'sha256:'+crypto.createHash('sha256').update(shown).digest('hex'));
 assert.equal(b.citationIds[0],c.citationId);assert.equal(b.validation.citationLinks[0].citationId,c.citationId);assert.equal(c.sourceSnapshotEntryId,e.sourceSnapshotEntryId);
 assert.deepEqual(result.snapshot.entries[0],entry);assert.equal(result.snapshot.sourceSnapshotId,snapshot.sourceSnapshotId);assert.ok(result.dirty);
 assert.equal(await page.locator('#'+b.id+' sup').count()>0,true);
}
console.log('PASS structured DOM: original, translated and full exact insertion, checksum, existing snapshot preserved, citation rendered, dirty state.');
await page.evaluate(async()=>{_adocArtifacts.legacy={_adocGenerationEngine:'legacy-html',_adocCapabilities:{workspace:true,persist:true},html:'<!doctype html><html><body><h1>Document antérieur</h1><p>Texte conservé.</p></body></html>'};if(!await adocOpenWorkspace('legacy', {preserveLibrarySearch:true}))throw Error('legacy did not open')});
for(const toggle of [false,true]){
 if(toggle)await card.locator('.cc-lib-vo-toggle').click();
 const shown=await card.locator('.cc-ws-search-excerpt:visible').textContent();await card.getByText('Insérer cet extrait',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#cc-ws-search-results .cc-lib-status').textContent.includes('Extrait inséré'));
 const result=await page.evaluate(()=>{const a=_adocArtifacts.legacy;const d=new DOMParser().parseFromString(a.html,'text/html');const b=[...d.querySelectorAll('blockquote')].at(-1);return {text:b.querySelector('span').textContent,ref:b.querySelector('footer').textContent,old:d.querySelector('p').textContent,dirty:a._ccEditorDirty}});
 assert.equal(result.text,shown);assert.equal(result.old,'Texte conservé.');assert.equal(result.ref,'Auteur Test — Livre documentaire — p. 12–14');assert.ok(result.dirty);
}
if(process.env.PHASE2_SCREENSHOT)await page.screenshot({path:process.env.PHASE2_SCREENSHOT,fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS legacy DOM: exact full translation and original, visible escaped attribution, preceding content retained.');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
