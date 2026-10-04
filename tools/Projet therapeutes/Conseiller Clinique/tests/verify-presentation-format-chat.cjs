// Détection pure + vrai chemin adocSend dans le navigateur, sans appel API payant.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'studio-clinique-core.js'), 'utf8');
// Les deux outils sont gelés pour ce lot ; seul le prompt de clarté change.
for (const [name, expected] of [
 ['ADOC_STRUCTURED_PRESENTATION_TOOL', 'b1b0155cb8eba26c82589d741369543905c375cb5a23a31c8c93b2db2fc3fca4'],
 ['ADOC_CLARITY_TOOL', 'f16725cdfc91c65e0a2945f4fa50d1e21615c8e5d5a0f79ac3d6d176c8394324'],
]) {
 const start = source.indexOf('  const ' + name + ' = {');
 assert.ok(start >= 0);
 const end = source.indexOf('\n  };', start) + 5;
 const tool = vm.runInNewContext(source.slice(start, end) + ';' + name);
 const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(tool)).digest('hex');
 assert.equal(hash, expected, name + ' inchangé');
}
const detection = source.slice(source.indexOf('  const ADOC_PRESENTATION_KEYWORDS'), source.indexOf('  async function adocPlanQuery'));
const ambiguity = source.slice(source.indexOf('  function _adocDetectFormatAmbiguity'), source.indexOf('  // Item 70 Volet 2 — reprise'));
const context = vm.createContext({});
vm.runInContext(detection + ambiguity, context);
const explicit = context._adocDetectExplicitDocumentKind;
const ambiguous = context._adocDetectFormatAmbiguity;
const capture = "Créer une présentation de sensibilisation générale destinée au grand public sur l’attachement adulte";
let count = 0;
for (const audience of ['grand public', 'patient', 'couple', 'praticiens', 'étudiants']) {
 const text = capture.replace('grand public', audience);
 assert.equal(explicit(text), 'presentation'); assert.equal(ambiguous(text, {format_confidence: 0.2}), null); count++;
}
for (const text of ['diaporama pour des patients', 'Fais-moi une présentation sur : X', 'Une conférence pour les couples', 'Un exposé pour les étudiants', 'Des slides sur X', 'Des diapositives sur X', 'Un deck sur X', 'PRÉSENTATION sur X', 'Une presentation sur X', 'Présentation comparative : comparatif de deux approches', 'Présentation de cours']) {
 assert.equal(explicit(text), 'presentation'); assert.equal(ambiguous(text, {}), null); count++;
}
for (const word of ['carrousel', 'fiche', 'tableau', 'script', 'verbatim', 'liens', 'article']) {
 const text = word + ' de présentation';
 assert.equal(explicit(text), null); assert.ok(ambiguous(text, {}).candidates.some(c => c.kind === 'presentation')); count++;
}
for (const text of ['présentation web', 'presentation web', 'support visuel', 'support visuel : diaporama', 'cours', 'carrousel sur X', 'fiche sur X', 'tableau comparatif sur X', 'script sur X', 'liens sur X', 'article sur X', 'sensibilisation du grand public sur X', 'représentation sur X', 'un slideshow sur X']) {
 assert.equal(explicit(text), null); count++;
}
assert.equal(ambiguous('comparatif de deux approches', {}).candidates[0].kind, 'tableau');
assert.equal(ambiguous('cours', {}).candidates[0].kind, null);
assert.equal(ambiguous('cours', {duree_minutes: 30}), null);
assert.deepEqual(Array.from(ambiguous('présentation web', {}).candidates, c => c.kind), ['carrousel', 'fiche']);
assert.deepEqual(Array.from(ambiguous('présentation sous forme de support visuel', {}).candidates, c => c.kind), ['carrousel', 'fiche']);
for (const text of ['support visuel', 'carrousel', 'fiche', 'tableau comparatif', 'script', 'liens']) assert.equal(ambiguous(text, {}), null);
assert.ok(ambiguous('sensibilisation sur X', {format_confidence: 0.2}).candidates.some(c => c.kind === 'presentation'));
console.log('Détection pure : ' + count + ' cas + ambiguïtés/exclusions OK');

(async () => {
 const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
 try {
  const page = await browser.newPage();
  const requests = [];
  await page.addInitScript(() => localStorage.setItem('workerApiKey', 'test-only-not-a-secret'));
  await page.route('https://**/*', async route => {
   let body; try {body = route.request().postDataJSON();} catch {}
   if (body?.payload?.tools?.some(t => t.name === 'evaluate_clarity')) {
    requests.push(body.payload);
    // Arrêt contrôlé avant le pipeline ; l'objet envoyé est celui du vrai adocSend.
    return route.fulfill({json:{content:[{type:'tool_use',name:'evaluate_clarity',input:{status:'needs_clarification',understood_so_far:'Test',missing:['précision de contenu'],question:'Quelle portée ?',quick_replies:['Introduction','Approfondissement'],assumptions_if_proceeding:[]}}]}});
   }
   return route.fulfill({json:{results:[],books:[],chunks:[],total:0}});
  });
  await page.goto('file://' + path.join(root, 'studio-clinique.html'));
  await page.waitForFunction(() => typeof window.adocSend === 'function');
  // Pas de carte d'accueil et aucun documentKind posé par le test.
  await page.evaluate(() => {document.getElementById('cc-landing').style.display = 'none'; window.openAssistDoc();});
  await page.locator('#adoc-input').fill(capture);
  await page.locator('#adoc-send-btn').click();
  await page.waitForFunction(() => !!document.querySelector('#adoc-messages .cc-clarity-question'));
  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[0].content, /TYPE DE DOCUMENT DÉJÀ CHOISI[^\n]*Présentation/i);
  assert.match(requests[0].system, /Présentation : diaporama structuré/);
  assert.match(requests[0].system, /public visé règle le registre et la densité, JAMAIS le format/);
  await page.reload();
  await page.waitForFunction(() => typeof window.adocSend === 'function');
  await page.evaluate(() => {window.adocPendingDocumentKind = 'fiche';document.querySelector('#adoc-input').value = 'Présentation sur X';return window.adocSend();});
  assert.match(requests.at(-1).messages[0].content, /TYPE DE DOCUMENT DÉJÀ CHOISI[^\n]*Fiche/i);
  console.log('Navigateur : saisie chat, requête clarté, priorité du choix accueil OK');
 } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
