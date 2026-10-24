const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { ROOT, doc, open } = require('./presentation-edit-fixtures.cjs');

const repo = path.resolve(ROOT, '../../..');
const rel = 'tools/Projet therapeutes/Conseiller Clinique/';
const before = 'da1cf547^1'; // main before lot 5, after tolerance lot 1a
const old = file => execFileSync('git', ['show', before + ':' + rel + file], { cwd: repo, maxBuffer: 20 * 1024 * 1024 });
const imageDisplay = {
  fit: 'fill', aspectRatio: 1.5, heightPx: 320, sizePercent: 70,
  focalX: 30, focalY: 60, brightness: 110, contrast: 105,
  saturation: 95, temperature: 10, grayscale: 8, blur: 2,
  opacity: 80, rotation: 15, borderWidth: 2, borderColor: '#286b7b',
  shadow: 5, mirrorX: true, mirrorY: false, coverHeightPx: 360,
  crop: { x: 10, y: 20, width: 70, height: 50, aspectRatio: 1.4 }
};
function enriched() {
  const d = doc('presentation');
  const card = d.blocks[0];
  card.content.imageRef = 'image clinique';
  card.content.imageAlt = 'Image clinique';
  card.content.imageDisplay = structuredClone(imageDisplay);
  card.content.blocks[0].style = { flowWidthPercent: 65, flowMinHeightPx: 180 };
  card.content.blocks.push({ id: 'callout-q11', type: 'callout',
    content: { text: 'Encadré sans fond', visualRole: 'info' },
    style: { backgroundColor: 'transparent', flowWidthPercent: 75, flowMinHeightPx: 120 },
    citationIds: [], validation: {} });
  card.content.blocks.push({ id: 'image-q11', type: 'image',
    content: { query: 'photo', alt: 'Photo', imageDisplay: structuredClone(imageDisplay) },
    citationIds: [], validation: {} });
  card.content.blocks.push({ id: 'video-q11', type: 'video',
    content: { url: 'https://example.com/video', title: 'Vidéo clinique' },
    style: { flowWidthPercent: 62, flowMinHeightPx: 180 }, citationIds: [], validation: {} });
  card.content.blocks.push({ id: 'quiz-q11', type: 'quiz',
    content: { question: 'Question ?', options: ['Oui', 'Non'], correctIndex: 0, explanation: 'Oui.' },
    style: { flowWidthPercent: 63, flowMinHeightPx: 181 }, citationIds: [], validation: {} });
  card.content.blocks.push({ id: 'questionnaire-q11', type: 'questionnaire',
    content: { questions: [
      { text: 'Première question ?', options: [{ text: 'Jamais', points: 0 }, { text: 'Souvent', points: 1 }] },
      { text: 'Deuxième question ?', options: [{ text: 'Jamais', points: 0 }, { text: 'Souvent', points: 1 }] }
    ], profiles: [
      { label: 'Bas', minScore: 0, maxScore: 1, interpretation: 'Peu fréquent.' },
      { label: 'Haut', minScore: 2, maxScore: 2, interpretation: 'Fréquent.' }
    ], allowTwoPartners: false },
    style: { flowWidthPercent: 64, flowMinHeightPx: 182 }, citationIds: [], validation: {} });
  return d;
}

async function browserCompatibility() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-q11-compat-'));
  const browser = await chromium.launch();
  try {
    const versions = [
      ['ancien-client', old('studio-clinique.html'), old('studio-clinique-core.js')],
      ['ancienne-page-nouveau-coeur', old('studio-clinique.html'), fs.readFileSync(path.join(ROOT, 'studio-clinique-core.js'))],
      ['nouvelle-page-ancien-coeur', fs.readFileSync(path.join(ROOT, 'studio-clinique.html')), old('studio-clinique-core.js')],
      ['client-actuel', fs.readFileSync(path.join(ROOT, 'studio-clinique.html')), fs.readFileSync(path.join(ROOT, 'studio-clinique-core.js'))]
    ];
    for (const [label, html, core] of versions) {
      const dir = path.join(tmp, label);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'studio-clinique.html'), html);
      fs.writeFileSync(path.join(dir, 'studio-clinique-core.js'), core);
      for (const file of ['vendor', 'atelier-images.js', 'narration-ia.js'])
        fs.symlinkSync(path.join(ROOT, file), path.join(dir, file));
      const page = await browser.newPage();
      await page.route('https://**/*', route => route.fulfill({ json: { results: [], items: [], total: 0 } }));
      await page.goto('file://' + dir + '/studio-clinique.html');
      const d = enriched();
      assert.equal(await open(page, d), true, label + ' ouvre le document enrichi');
      assert.equal(await page.locator('.adoc-sc-card').count(), 1, label + ' rend la carte');
      const saved = await page.evaluate(() => window._adocArtifacts['test-doc']._adocStructuredDoc);
      assert.deepEqual(saved.blocks[0].content.imageDisplay, imageDisplay, label + ' garde la couverture');
      assert.deepEqual(saved.blocks[0].content.blocks[3].content.imageDisplay, imageDisplay, label + ' garde imageDisplay');
      assert.equal(saved.blocks[0].content.blocks[2].style.backgroundColor, 'transparent', label + ' garde fond encadré');
      assert.equal(saved.blocks[0].content.blocks[0].style.flowWidthPercent, 65, label + ' garde largeur');
      assert.equal(saved.blocks[0].content.blocks[2].style.flowMinHeightPx, 120, label + ' garde hauteur');
      for (const [i, width] of [[4, 62], [5, 63], [6, 64]])
        assert.equal(saved.blocks[0].content.blocks[i].style.flowWidthPercent, width, label + ' garde style du bloc ' + i);
      let posted = null;
      await page.route('**/clinical-documents', route => {
        posted = route.request().postDataJSON();
        return route.fulfill({ json: { document_id: 'saved-doc', version_id: 'saved-v1' } });
      });
      await page.evaluate(() => window.adocWsSave());
      assert.ok(posted, label + ' POST de sauvegarde simulé');
      const persisted = posted.document.clinicalDocument || posted.document;
      assert.deepEqual(persisted.blocks[0].content.imageDisplay, imageDisplay, label + ' sauve couverture');
      assert.deepEqual(persisted.blocks[0].content.blocks[3].content.imageDisplay, imageDisplay, label + ' sauve image');
      assert.equal(persisted.blocks[0].content.blocks[2].style.backgroundColor, 'transparent', label + ' sauve encadré');
      assert.equal(persisted.blocks[0].content.blocks[0].style.flowWidthPercent, 65, label + ' sauve largeur');
      for (const [i, width] of [[4, 62], [5, 63], [6, 64]])
        assert.equal(persisted.blocks[0].content.blocks[i].style.flowWidthPercent, width, label + ' sauve style du bloc ' + i);
      assert.equal(await open(page, persisted, 'reopened-doc'), true, label + ' rouvre la charge sauvegardée');
      const reopened = await page.evaluate(() => window._adocArtifacts['reopened-doc']._adocStructuredDoc);
      assert.deepEqual(reopened.blocks[0].content.imageDisplay, imageDisplay, label + ' conserve le champ après réouverture');
      await page.close();
      console.log('PASS navigateur', label);
    }
  } finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

function schemaAndWorker() {
  const block = JSON.parse(fs.readFileSync(path.join(ROOT, 'Schemas/block.schema.json')));
  const clinical = JSON.parse(fs.readFileSync(path.join(ROOT, 'Schemas/clinical-document.schema.json')));
  const html = fs.readFileSync(path.join(ROOT, 'studio-clinique.html'), 'utf8');
  const embedded = JSON.parse(html.match(/<script type="application\/json" id="adoc-sc-schemas">([^]*?)<\/script>/)[1]);
  assert.deepEqual(embedded['block.schema.json'], block);
  assert.deepEqual(embedded['clinical-document.schema.json'], clinical);
  const sandbox = { window: {}, console }; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'vendor/ajv2020.min.js'), 'utf8'), sandbox);
  const Ajv = sandbox.window.Ajv2020.default || sandbox.window.Ajv2020;
  const validate = new Ajv({ strict: false }).compile({ $defs: block.$defs, $ref: '#/$defs/cardContent' });
  assert.equal(validate(enriched().blocks[0].content), true, JSON.stringify(validate.errors));
  const unsupported = enriched().blocks[0].content;
  unsupported.blocks[3].style = { flowWidthPercent: 55 };
  assert.equal(validate(unsupported), false, 'style sur imageBlock reste refusé par schéma actuel');
  const worker = fs.readFileSync(path.join(repo, 'Worker/index.js'), 'utf8');
  const take = (start, end) => { const i = worker.indexOf(start), j = worker.indexOf(end, i); assert.ok(i >= 0 && j > i); return worker.slice(i, j + end.length); };
  const consts = ['CLINICAL_DOCUMENT_KINDS', 'CLINICAL_DOCUMENT_BLOCK_TYPES'].map(name => {
    const m = worker.match(new RegExp('(?:var|const|let)\\s+' + name + '\\s*=\\s*\\[[^\\]]*\\];'));
    assert.ok(m); return m[0];
  }).join('\n');
  const ctx = { console, Array, Object, String, Number, JSON }; ctx.globalThis = ctx;
  vm.runInNewContext(consts + '\n' + take('function adocValidateStructuredClinicalDocument(document, documentKind) {', '\n}') + '\n' + take('function adocValidateClinicalDocumentPayload(document, generationEngine, documentKind) {', '\n}') + '\nglobalThis.validate=adocValidateClinicalDocumentPayload;', ctx);
  const payload = { clinicalDocument: enriched(), sourceSnapshot: { sourceSnapshotId: 's', entries: [] } };
  assert.equal(ctx.validate(payload, 'structured', 'presentation'), null, 'Worker accepte les champs nouveaux');
  payload.clinicalDocument.blocks = [];
  assert.notEqual(ctx.validate(payload, 'structured', 'presentation'), null, 'Worker refuse une charge invalide');
  console.log('PASS schémas disque/embarqués et validateur Worker réel (lecture seule)');
}

schemaAndWorker();
browserCompatibility().catch(error => { console.error(error); process.exitCode = 1; });
