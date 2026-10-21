const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const block = JSON.parse(fs.readFileSync(path.join(root, 'Schemas/block.schema.json')));
const clinical = JSON.parse(fs.readFileSync(path.join(root, 'Schemas/clinical-document.schema.json')));
const html = fs.readFileSync(path.join(root, 'studio-clinique.html'), 'utf8');
const embedded = JSON.parse(html.match(/<script type="application\/json" id="adoc-sc-schemas">([^]*?)<\/script>/)[1]);
assert.deepEqual(embedded['block.schema.json'], block);
assert.deepEqual(embedded['clinical-document.schema.json'], clinical);
const sandbox = { window: {}, console }; sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'vendor/ajv2020.min.js'), 'utf8'), sandbox);
const Ajv = sandbox.window.Ajv2020.default || sandbox.window.Ajv2020;
const ajv = new Ajv({ strict: false });
const image = ajv.compile({ $defs: block.$defs, $ref: '#/$defs/imageContent' });
const card = ajv.compile({ $defs: block.$defs, $ref: '#/$defs/cardContent' });
const display = { fit: 'contain', focalX: 73, focalY: 27, brightness: 118, contrast: 105,
  saturation: 87, temperature: -10, grayscale: 5, blur: 2, opacity: 91, rotation: 15,
  borderWidth: 2, borderColor: '#286b7b', shadow: 8, mirrorX: true, mirrorY: false };
assert.equal(image({ query: 'photo', alt: 'Photo', imageDisplay: display }), true, JSON.stringify(image.errors));
assert.equal(card({ title: 'Carte', imageRef: 'photo', imageAlt: 'Photo', blocks: [], imageDisplay: display }), true, JSON.stringify(card.errors));
for (const invalid of [{ fit: 'stretch' }, { focalX: 101 }, { borderColor: 'red' }, { mirrorX: 'yes' }]) {
  assert.equal(image({ query: 'photo', alt: 'Photo', imageDisplay: invalid }), false, JSON.stringify(invalid));
}
assert.equal(image({ query: 'photo', alt: 'Photo' }), true, 'ancien document accepté');
console.log('PASS lot 7 : copies de schéma identiques, champs facultatifs et bornes strictes');

const worker = fs.readFileSync(path.resolve(root, '../../../Worker/index.js'), 'utf8');
const take = (start, end) => { const i = worker.indexOf(start), j = worker.indexOf(end, i); assert.ok(i >= 0 && j > i); return worker.slice(i, j + end.length); };
const consts = ['CLINICAL_DOCUMENT_KINDS', 'CLINICAL_DOCUMENT_BLOCK_TYPES'].map(name => {
  const m = worker.match(new RegExp('(?:var|const|let)\\s+' + name + '\\s*=\\s*\\[[^\\]]*\\];'));
  assert.ok(m); return m[0];
}).join('\n');
const ctx = { console, Array, Object, String, Number, JSON }; ctx.globalThis = ctx;
vm.runInNewContext(consts + '\n' + take('function adocValidateStructuredClinicalDocument(document, documentKind) {', '\n}') + '\n' + take('function adocValidateClinicalDocumentPayload(document, generationEngine, documentKind) {', '\n}') + '\nglobalThis.validate=adocValidateClinicalDocumentPayload;', ctx);
const payload = { clinicalDocument: { title: 'Essai', documentKind: 'presentation', blocks: [{ id: 'c1', type: 'card', content: { title: 'Diapositive', imageRef: 'photo', imageAlt: 'Photo', blocks: [], imageDisplay: display } }] }, sourceSnapshot: { sourceSnapshotId: 's', entries: [] } };
assert.equal(ctx.validate(payload, 'structured', 'presentation'), null, 'Worker accepte imageDisplay');
payload.clinicalDocument.blocks = [];
assert.notEqual(ctx.validate(payload, 'structured', 'presentation'), null, 'Worker non inerte');
console.log('PASS lot 7 : vrai validateur Worker accepte imageDisplay et refuse une charge invalide');
