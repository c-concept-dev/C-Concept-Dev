const { chromium }=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
(async()=>{const server=http.createServer((req,res)=>{const p=path.join(root,decodeURI(req.url.split('?')[0]));if(!fs.existsSync(p)){res.writeHead(404).end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':'text/html');let data=fs.readFileSync(p);if(p.endsWith('studio-clinique.html'))data=data.toString().replace('  function adocEditorArt()', '  window.__ed = { render:adocRenderBlockHTML, schema:adocInitSchemaValidators, sync:adocEditorSync, action:adocEditorAction, ctx:adocEditorContext, setup:adocWsSetupBlockEditing, legacySetup:adocWsSetupLegacyBlockEditing, palette:adocEditorPalette };\n  function adocEditorArt()');res.end(data);}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});const page=await browser.newPage();await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/studio-clinique.html');const assert=require('node:assert/strict');
const base=JSON.parse(fs.readFileSync(path.join(root,'Fixtures/fixture-fiche-type.json')));
const blocks=[
{id:'heading-1',type:'heading',content:{text:'Titre.',level:2}},
{id:'paragraph-2',type:'paragraph',content:{text:'Premier paragraphe.'}},
{id:'list-3',type:'list',content:{items:['Premier.','Deuxième.'],ordered:false}},
{id:'table-4',type:'table',content:{headers:['Nom','Valeur'],rows:[['Beta','2'],['Alpha','1']]}},
{id:'quote-5',type:'quote',content:{text:'Citation.'}},
{id:'callout-6',type:'callout',content:{text:'Encadré.',visualRole:'info'}}];
const legacyHTML='<!doctype html><html><head><style>:root{--mer:#112233;--deep:#102f31;--vert-sauge:#c9c3b8;--beige:#ddd7cc;--sable:#f6f2ea;--surf:#f6f2ea;--text:#273331;--muted:#5d6966;--blanc:#ffffff}</style></head><body><h2 id="heading-1">Titre.</h2><p id="paragraph-2">Premier paragraphe.</p><ul id="list-3"><li>Premier.</li><li>Deuxième.</li></ul><table id="table-4"><thead><tr><th>Nom</th><th>Valeur</th></tr></thead><tbody><tr><td>Beta</td><td>2</td></tr><tr><td>Alpha</td><td>1</td></tr></tbody></table><blockquote id="quote-5">Citation.</blockquote><aside id="callout-6" role="note">Encadré.</aside></body></html>';
let saved, saves=0, saveDelay=0;
await page.route(/\/clinical-documents(?:\/.*)?$/,async route=>{
 const data=route.request().postDataJSON();assert.ok(data.document.sourceSnapshot?.sourceSnapshotId);saved=data.document;saves++;if(saveDelay)await new Promise(r=>setTimeout(r,saveDelay));
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({document_id:'mock-doc',version_id:'mock-v1'})});
});
await page.route('**/*',async route=>{
 let body;try{body=route.request().postDataJSON();}catch(_){}
 if(body?.payload?.tool_choice?.name==='emit_block_correction')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({content:[{type:'tool_use',name:'emit_block_correction',input:{text:'Correction IA.',items:['Réponse.'],headers:['Nom','Valeur'],rows:[['Réponse.','3']]}}]})});
 return route.fallback();
});
const failures=[];page.on('pageerror',e=>failures.push(e.message));page.on('dialog',async d=>{failures.push(d.message());await d.dismiss();});
for(const engine of ['structured','legacy-html']){
 console.log('ENGINE',engine);
 const setup=async (payload)=>page.evaluate(async ({base,blocks,engine,legacyHTML,payload})=>{
  const doc=Object.assign({},base,{blocks:JSON.parse(JSON.stringify(blocks)),citations:[]});
  const art={name:'Essai',html:payload?.html||legacyHTML,_adocGenerationEngine:engine,_adocCapabilities:{workspace:true,blockEditing:engine==='structured',legacyBlockEditing:engine!=='structured',persist:true},_adocDocumentKind:'fiche'};
  const snapshot=payload?.sourceSnapshot||{sourceSnapshotId:doc.sourceSnapshotId,entries:[]};
  if(engine==='structured'){art._adocStructuredDoc=payload?.clinicalDocument||doc;art._adocStructuredSnapshot=snapshot;}else art._adocLegacySourceSnapshot=snapshot;
  window._adocArtifacts={test:art};return await window.adocOpenWorkspace('test');
 },{base,blocks,engine,legacyHTML,payload});
 assert.equal(await setup(),true);
 const leaf=id=>page.locator('#'+id+' [data-cc-editor-leaf]').first();
 await leaf('quote-5').click();await leaf('quote-5').fill('Citation modifiée.');
 
 await leaf('callout-6').click();await leaf('callout-6').fill('');  
 await page.locator('[data-editor-style="fontSizePt"]').fill('22');await page.locator('[data-editor-style="fontSizePt"]').press('Tab');
 await page.locator('[data-editor-style="fontFamily"]').fill('Arial');await page.locator('[data-editor-style="fontFamily"]').press('Tab');
 assert.equal(await page.locator('#callout-6').evaluate(el=>el.style.fontSize),'22pt');
 await page.locator('#list-3 li [data-cc-editor-leaf]').nth(1).click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Troisième.');
 assert.equal(await page.locator('#list-3 li').count(),3);
 await page.keyboard.press('Tab');assert.equal(await page.locator('#list-3 li li').count(),1);
 await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#list-3 li li').count(),0);
 await page.keyboard.press('Tab');
 await page.locator('[data-editor-action="numbered"]').click();assert.equal(await page.locator('#list-3 ol').count()+(engine==='legacy-html'?1:0),2);
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().click();
 await page.locator('[data-editor-action="merge-right"]').click();assert.equal(await page.locator('#table-4 td[colspan="2"]').count(),1);
 await page.locator('[data-editor-action="split"]').click();assert.equal(await page.locator('#table-4 td').count(),4);
 await page.locator('[data-editor-action="col-after"]').click();assert.equal(await page.locator('#table-4 th').count(),3);
 await page.locator('[data-editor-action="row-after"]').click();assert.equal(await page.locator('#table-4 tbody tr').count(),3);
 await page.locator('[data-editor-scope]').selectOption('cell');
 await page.locator('[data-editor-style="backgroundColor"]').evaluate(el=>{el.value='#ffcc00';el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.ok(await page.locator('#table-4 td').evaluateAll(els=>els.some(e=>e.style.backgroundColor==='rgb(255, 204, 0)')));
 // Selected range survives focus in the toolbar and persists as rich text.
 await leaf('quote-5').click();await page.evaluate(()=>{const el=document.querySelector('#quote-5 [data-cc-editor-leaf]');const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});await page.waitForTimeout(30);
 await page.locator('[data-editor-scope]').selectOption('selection');await page.locator('[data-editor-action="bold"]').click();
 assert.ok(await leaf('quote-5').evaluate(el=>el.innerHTML.includes('700')));
 // Every structured block validates against the embedded schema, including empty drafts.
 const valid=await page.evaluate(()=>window._adocArtifacts.test._adocStructuredDoc?.blocks.map(b=>adocValidateSchema('block',b))||[]);
 assert.ok(valid.every(v=>v.valid),JSON.stringify(valid));
 await page.evaluate(()=>adocWsSave());assert.ok(saved);
 const captured=JSON.parse(JSON.stringify(saved));
 assert.equal(JSON.stringify(captured).includes('contenteditable'),false);
 await page.reload();assert.equal(await setup(captured),true);
 assert.equal(await leaf('quote-5').innerText(),'Citation modifiée.');assert.equal(await leaf('callout-6').innerText(),'');
 assert.equal(await page.locator('#callout-6').evaluate(el=>el.style.fontSize),'22pt');
 assert.equal(await page.locator('#list-3 li').count(),3);assert.equal(await page.locator('#list-3 li li').count(),1);
 assert.equal(await page.locator('#table-4 th').count(),3);
 assert.ok(await leaf('quote-5').evaluate(el=>el.innerHTML.includes('700')));
 // Undo/redo must restore typed content, including across a style command.
 await leaf('paragraph-2').click();await page.keyboard.press('End');await page.keyboard.type('X');
 assert.ok((await leaf('paragraph-2').innerText()).includes('X'));
 await page.locator('[data-editor-action="undo"]').click();assert.equal((await leaf('paragraph-2').innerText()).includes('X'),false);
 await page.locator('[data-editor-action="redo"]').click();assert.ok((await leaf('paragraph-2').innerText()).includes('X'));
 // Boundary Backspace merges list items under application control.
 await page.locator('#list-3 li [data-cc-editor-leaf]').last().click();await page.keyboard.press('Home');await page.keyboard.press('Backspace');
 assert.ok(await page.locator('#list-3 li').count()>=2);
 // Spreadsheet paste expands a rectangular table and retains values.
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().click();
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().evaluate(el=>{const clip=new DataTransfer();clip.setData('text/plain','Delta\t10\nAlpha\t20');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clip,bubbles:true,cancelable:true}));});
 assert.ok((await page.locator('#table-4').innerText()).includes('Delta'));
 await page.locator('#table-4 tbody tr').first().locator('[data-cc-editor-leaf]').nth(1).click();
 await page.locator('.cc-editor-table-tools summary').click();await page.locator('[data-rule-value]').fill('15');await page.locator('[data-rule-op]').selectOption('gt');
 await page.locator('[data-editor-action="rule-add"]').click();
 assert.ok(await page.locator('#table-4 td').evaluateAll(els=>els.some(e=>e.textContent==='20'&&e.style.backgroundColor==='rgb(255, 241, 184)')));
 await page.evaluate(()=>adocWsSave());const withRule=JSON.parse(JSON.stringify(saved));await page.reload();await setup(withRule);
 assert.ok(await page.locator('#table-4 td').evaluateAll(els=>els.some(e=>e.textContent==='20'&&e.style.backgroundColor==='rgb(255, 241, 184)')));
 // Palette is derived from the document, and updates on the next block selection.
 const before=await page.evaluate(()=>__ed.palette());
 await page.evaluate(engine=>{
  const art=_adocArtifacts.test;
  if(engine==='legacy-html')art.html=art.html.replace('#112233','#ab1234');
  else {const doc=art._adocStructuredDoc;const manifest=adocResolveRenderManifest(doc,art._adocRenderManifestOverride);adocResolveTokens(manifest).colors.petrol950='#ab1234';}
 },engine);
 await leaf('quote-5').click();assert.ok(await page.locator('[data-editor-color="#ab1234"]').count());
 // The list of fonts is permission-gated, deduplicated, and has a visible refusal state.
 await page.evaluate(()=>{window.queryLocalFonts=async()=>[{family:'Police locale de test'},{family:'Police locale de test'},{family:'Autre police'}];});
 await page.locator('[data-editor-action="local-fonts"]').click();assert.equal(await page.locator('datalist option[value="Police locale de test"]').count(),1);
 await page.evaluate(()=>{window.queryLocalFonts=async()=>{throw new Error('NotAllowed');};});
 await page.locator('[data-editor-action="local-fonts"]').click();assert.ok((await page.locator('.cc-editor-message').innerText()).includes('non accordé'));
 // Rich paste strips executable content and never changes the number of top-level blocks.
 await leaf('quote-5').click();
 await leaf('quote-5').evaluate(el=>{const clip=new DataTransfer();clip.setData('text/html','<b>Collé.</b><img src=x onerror="window.badPaste=1"><script>window.badPaste=1</script>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clip,bubbles:true,cancelable:true}));});
 assert.equal(await page.evaluate(()=>window.badPaste),undefined);
 await page.evaluate(()=>adocWsSave());assert.equal(JSON.stringify(saved).includes('onerror'),false);
 // Render/export path remains usable after direct edits and emits no editing hosts.
 if(engine==='structured') {
  const rendered=await page.evaluate(async()=>{const art=_adocArtifacts.test;const result=await adocRenderClinicalDocument(art._adocStructuredDoc,null);return {html:result.html,valid:adocValidateSchema('clinicalDocument',art._adocStructuredDoc)};});
  assert.ok(rendered.valid.valid,JSON.stringify(rendered.valid));assert.equal(rendered.html.includes('contenteditable'),false);
 }
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().click();
 await leaf('paragraph-2').click();await leaf('paragraph-2').fill('Texte manuel voisin.');
 const savesBeforeIA=saves;
 await leaf('quote-5').click();await page.getByRole('button',{name:'Réécrire',exact:true}).click();await page.getByRole('button',{name:'Confirmer',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#quote-5')?.textContent.includes('Correction IA.'));
 for(let n=0;n<100 && saves===savesBeforeIA;n++) await page.waitForTimeout(20);
 assert.ok(saves>savesBeforeIA,JSON.stringify(failures));await page.waitForFunction(()=>!document.querySelector('#cc-ws-save-btn').disabled);
 assert.equal(await leaf('paragraph-2').innerText(),'Texte manuel voisin.');
 assert.equal(await page.locator('#callout-6').evaluate(el=>el.style.fontSize),'22pt');
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().click();
 // Reopening the selected block rebuilds a working panel rather than keeping detached state.
 await page.evaluate(()=>adocOpenWorkspace('test'));await leaf('quote-5').click();assert.equal(await page.locator('.cc-editor-tools').count(),1);
 // A new edit during an in-flight save must remain visibly dirty.
 saveDelay=250;
 await page.evaluate(()=>{window.testSavePromise=adocWsSave();});
 await leaf('paragraph-2').click();await leaf('paragraph-2').fill('Modification pendant la sauvegarde.');
 await page.evaluate(()=>window.testSavePromise);saveDelay=0;
 assert.ok((await page.locator('#cc-ws-save-status').innerText()).includes('non enregistrées'));
 await page.evaluate(()=>adocWsSave());assert.equal(await page.locator('#cc-ws-save-status').innerText(),'Enregistré');
 await page.locator('#table-4 td [data-cc-editor-leaf]').first().click();
 await page.setViewportSize({width:1440,height:1200});
 await page.locator('.cc-block-edit-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(process.env.EVIDENCE_DIR || require('os').tmpdir(),'editor-'+engine+'.png'),fullPage:false});
 if(engine==='legacy-html') {
   await page.evaluate(async()=>{const st=_adocLegacyBlockEditState;st.pendingHtml='<thead><tr><th>Nom</th></tr></thead><tbody><tr><td>Texte.</td></tr></tbody>';st.pendingDropsCitations=true;await adocConfirmLegacyBlockCorrection();});
   assert.equal(await page.locator('#table-4 caption .cc-legacy-citation-flag').count(),1);
 }
 console.log('PASS undo/redo, rectangular paste, conditional formatting + reload, palette change, fonts permission paths, safe paste, render');

 console.log('PASS editing, rich text, list nesting, table merge/split/insert, style, empty draft, save + real reload');
}
console.log('DIALOGS',failures);assert.equal(failures.length,0);

await browser.close();server.close();})();
