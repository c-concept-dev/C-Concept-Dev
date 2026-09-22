const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('../../../../Worker/tests/verify-library-facets.cjs');
(async()=>{
 const f=fixture(),browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
 try{
 const page=await browser.newPage();const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith('file:'))return route.continue();
  const endpoint=url.split('/').pop();let body={};try{body=route.request().postDataJSON()||{}}catch{}
  if(['library-facets','rag-search','d1-query'].includes(endpoint))calls.push({endpoint,body,time:Date.now()});
  if(endpoint==='library-facets'){
   if(body.query==='slow')await new Promise(r=>setTimeout(r,180));
   const response=await f.request(body);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  const empty=body.query==='inexistant'||body.book_title==='absent';
  const result=endpoint==='rag-search'?{chunks:empty?[]:[{id:'test',book_title:'Livre',content:'trauma et attachement',approach:'ifs',language:'fr',sources:['fts5']}]}:endpoint==='d1-query'?{results:[]}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('file://'+path.join(__dirname,'../studio-clinique.html'));
 await page.locator('#clinical-question').fill('Ne pas modifier cette demande.');
 await page.locator('#cc-home-search-toggle').click();await page.locator('#cc-home-search-filters-toggle').click();
 const facet=(dimension,value)=>page.locator('#cc-home-search-facet-values [data-dimension="'+dimension+'"] button[data-value="'+value+'"]');
 await facet('language','fr').waitFor();assert.equal(await facet('language','fr').textContent(),'français (4)');
 const novel='approche_neuve_'+Date.now();f.add(novel,'eo','Nouveau livre');
 await page.locator('#cc-home-search-filters-toggle').click();await page.locator('#cc-home-search-filters-toggle').click();
 await facet('approach',novel).waitFor();assert.ok((await facet('approach',novel).textContent()).endsWith('(1)'));
 assert.equal(await facet('language','eo').textContent(),'espéranto (1)');
 await facet('approach','ifs').click();await page.waitForFunction(()=>document.querySelector('#cc-home-search-facet-values button[data-value="fr"]')?.textContent==='français (1)');
 assert.equal(await facet('language','en').textContent(),'anglais (2)');assert.equal(await page.locator('#cc-home-search-active-filters button').count(),1);
 await facet('language','en').click();await page.waitForFunction(()=>!document.querySelector('#cc-home-search-facet-values button[data-value="systemic"]'));
 assert.equal(await page.locator('#cc-home-search-active-filters button').count(),2);
 await page.locator('#cc-home-search-filters-toggle').click();assert.equal(await page.locator('#cc-home-search-active-filters button').first().isVisible(),true);
 await page.locator('#cc-home-search-input').fill('inexistant');await page.getByRole('button',{name:'Retirer ce filtre',exact:true}).waitFor();
 await page.getByRole('button',{name:'Retirer ce filtre',exact:true}).click();assert.equal(await page.locator('#cc-home-search-language').inputValue(),'');assert.equal(await page.locator('#cc-home-search-approach').inputValue(),'ifs');
 await page.locator('#cc-home-search-active-filters button').click();
 await page.locator('#cc-home-search-input').fill('');await page.waitForTimeout(550);calls.length=0;
 await page.locator('#cc-home-search-input').pressSequentially('attachement',{delay:45});
 await page.waitForTimeout(750);
 for(const endpoint of ['rag-search','d1-query','library-facets'])assert.equal(calls.filter(c=>c.endpoint===endpoint).length,1,JSON.stringify(calls));
 assert.equal(calls.find(c=>c.endpoint==='rag-search').body.query,'attachement');console.log('PASS measured debounce: 11 characters at 45 ms -> one rag, one author, one facets call.');
 calls.length=0;await page.locator('#cc-home-search-input').fill('trauma');await page.locator('#cc-home-search-input').press('Enter');await page.waitForTimeout(600);
 assert.equal(calls.filter(c=>c.endpoint==='rag-search').length,1);assert.equal(calls.filter(c=>c.endpoint==='library-facets').length,1);
 // Both real mounts have independent generations, including their facet requests.
 await page.evaluate(async()=>{document.getElementById('cc-home-search-input').value='slow';document.getElementById('cc-ws-search-input').value='trauma';await Promise.all([adocHomeLibrarySearch(),adocWorkspaceLibrarySearch()])});
 await page.waitForTimeout(300);assert.ok((await page.locator('#cc-ws-search-facet-values').textContent()).includes('(4)'));
 assert.ok((await page.locator('#cc-home-search-facet-values').textContent()).includes('Aucune valeur'));
 await page.evaluate(async()=>{const input=document.getElementById('cc-home-search-input');input.value='slow';adocHomeLibrarySearch();input.value='trauma';adocLibrarySearchInput('cc-home-search');});
 await page.waitForTimeout(750);assert.ok((await page.locator('#cc-home-search-facet-values').textContent()).includes('(4)'));
 assert.equal(await page.locator('#clinical-question').inputValue(),'Ne pas modifier cette demande.');assert.equal(await page.locator('#cc-home-search-results').getByText('Insérer cet extrait',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS DOM + real handler/SQL: newly inserted book auto-discovered, cross counts, active removable filters, zero recovery, Enter flush, stale requests discarded, independent mounts, home consultation only.');
 if(process.env.FACETS_SCREENSHOT){await page.locator('#cc-home-search-filters-toggle').click();await page.screenshot({path:process.env.FACETS_SCREENSHOT,fullPage:true})}
 }finally{await browser.close();f.db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
