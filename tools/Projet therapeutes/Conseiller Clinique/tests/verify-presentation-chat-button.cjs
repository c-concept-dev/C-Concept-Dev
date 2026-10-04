const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
 try {
  const page = await browser.newPage();
  let request = null;
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-only-not-a-secret'));
  await page.route('https://**/*', async route => {
   let body; try { body = route.request().postDataJSON(); } catch {}
   if (body?.payload?.tools?.some(t => t.name === 'evaluate_clarity')) {
    request = body.payload;
    return route.fulfill({json:{content:[{type:'tool_use',name:'evaluate_clarity',input:{status:'needs_clarification',question:'Quelle portée ?',quick_replies:['Introduction'],missing:['portée'],understood_so_far:'Test',assumptions_if_proceeding:[]}}]}});
   }
   return route.fulfill({json:{results:[],books:[],chunks:[],total:0}});
  });
  await page.goto('file://' + path.join(__dirname, '../studio-clinique.html'));
  await page.waitForFunction(() => typeof window.adocSend === 'function');
  await page.evaluate(() => {document.getElementById('cc-landing').style.display = 'none'; window.openAssistDoc();});
  const buttons = page.locator('#adoc-quick-btns button');
  assert.equal(await buttons.count(), 6);
  await buttons.filter({hasText:'Présentation'}).click();
  assert.equal(await page.locator('#adoc-input').inputValue(), 'Fais-moi une présentation sur : ');
  await page.locator('#adoc-input').press('End');
  await page.locator('#adoc-input').pressSequentially('l’attachement adulte');
  await page.locator('#adoc-send-btn').click();
  await page.waitForFunction(() => !!document.querySelector('#adoc-messages .cc-clarity-question'));
  assert.match(request.messages[0].content, /TYPE DE DOCUMENT DÉJÀ CHOISI[^\n]*Présentation/i);
  console.log('Bouton Présentation : six formats, saisie réelle, requête clarté explicite OK');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
