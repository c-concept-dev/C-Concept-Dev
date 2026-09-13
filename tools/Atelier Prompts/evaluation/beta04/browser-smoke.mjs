import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const htmlName='atelier-prompts-v11.5-lot10g-decision-provider.html';
// Observation only: no handler, listener, DOM element or state setter is replaced.
const html=fs.readFileSync(path.join(root,htmlName),'utf8').replace("function init(){\n  setNormal",`window.__BETA04_OBSERVE__=()=>JSON.parse(JSON.stringify({answers:state.answers,request:oprieOriginalRequest(),history:oprieClarificationHistory(),pending:adpState.pendingQuestion,mode:adpState.requestedMode,seq:oprieState.seq,running:oprieState.running,telemetry:oprieState.telemetry}));\nfunction init(){\n  setNormal`);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
console.error('browser launched');
const results=[];
const scenario=process.env.SCENARIO||'next-question';
try {
 for(const action of ['click','Enter']) {
  const page=await browser.newPage();const calls=[],errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/fast-interaction')){
    const input=route.request().postDataJSON();calls.push({kind:'fast',input});
    await route.fulfill({json:input.clarification_history.length&&scenario==='failure'?{type:'WAIT_FOR_DEEP_VALIDATION',text:'Validation requise.'}:{type:'ASK_CLARIFICATION',text:scenario==='non-atomic'?'Quel est votre budget et combien de jours partez-vous ?':input.clarification_history.length?'Quel résultat principal souhaitez-vous obtenir ?':'Combien de jours dure votre séjour ?'}});
   } else if(url.includes('/operational-request')) {
    calls.push({kind:'deep',input:route.request().postDataJSON()});
    await route.fulfill({status:scenario==='failure'?502:200,json:{state:'clarification_required',next_question:{text:'Quel résultat principal souhaitez-vous obtenir ?'}}});
   } else await route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded',timeout:10000});
  console.error('loaded',action,errors);
  if(await page.locator('#visite-passer').isVisible())await page.locator('#visite-passer').click();
  await page.locator('#v11-demande').fill('je veux préparer un voyage à Malaga fin novembre');
  const start=Date.now();await page.locator('#ui-main-action').click();
  console.error('clicked start',calls,errors);
  await page.locator('#v11-dialogue').waitFor({state:'visible'});
  const first=Date.now()-start,before=await page.evaluate(()=>window.__BETA04_OBSERVE__());
  await page.locator('#v11-answer').fill('Cinq jours.');
  if(action==='click')await page.locator('#v11-answer-continue').click();
  else await page.locator('#v11-answer').press('Enter');
  await page.waitForTimeout(500);
  const after=await page.evaluate(()=>window.__BETA04_OBSERVE__());
  results.push({action,first_interaction_ms:first,before,after,dialogue_visible:await page.locator('#v11-dialogue').isVisible(),question:await page.locator('#v11-question').textContent(),calls,errors});
  await page.close();
 }
 const report=JSON.stringify({source:'full HTML, real listeners, mocked network',scenario,results},null,2);
 if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,report+'\n');
 console.log(report);
} finally {await browser.close();await new Promise(r=>server.close(r));}
