const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'atelier-diapos.html'), 'utf8');
const imagesJs = fs.readFileSync(path.join(__dirname, '..', 'atelier-images.js'), 'utf8');
assert.match(page, /<select id="cv-cadrage"><option value="fidele">Studio Clinique · identique<\/option><option value="video">Vidéo · texte agrandi<\/option><\/select>/,
  'le cadrage identique à Studio Clinique doit être le choix par défaut visible');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id, hidden: false, disabled: false, dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} },
    textContent: '', value: '', files: [], append() {}, appendChild() {}, addEventListener() {}, click() {}, remove() {
      if (this.id) elements.delete(this.id);
    },
  });
  return elements.get(id);
}
['cv-message', 'cv-avancement', 'cv-barre', 'cv-avancement-texte', 'cv-vignettes', 'cv-cadrage',
 'cv-zip', 'cv-mp4', 'cv-fichier', 'cv-importer', 'cv-zone'].forEach(element);
element('cv-cadrage').value = 'fidele';

const document = {
  getElementById: (id) => elements.get(id) || null,
  createElement(tag) {
    const el = element('');
    el.tagName = String(tag).toUpperCase();
    Object.defineProperty(el, 'id', {
      get() { return this._id || ''; },
      set(v) { this._id = v; if (v) elements.set(v, this); }, configurable: true,
    });
    el.setAttribute = function (k, v) { this[k] = v; };
    return el;
  },
  head: { appendChild(el) { if (el.id) elements.set(el.id, el); } },
  body: { appendChild() {} },
};

let policesAuRendu = null;
let optionsAuRendu = null;
const window = {
  AtelierImages: {
    async rendreImages(_doc, options) {
      optionsAuRendu = options;
      const style = document.getElementById('atelier-polices-importees');
      policesAuRendu = style ? style.textContent : null;
      return { images: [] };
    },
  },
  ADOC_EXPORT_IMAGES: {},
};
const contexte = {
  window, document, console, URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  setTimeout, clearTimeout, Promise, Array, Object, JSON, String,
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'atelier-diapos-base.js'), 'utf8'), contexte);

const base64 = 'A'.repeat(96);
const exportHTML = `<!doctype html><style>
  @font-face{font-family:'Police Test';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${base64}) format('woff2');}
  @font-face{font-family:'Police Réseau';src:url(https://example.invalid/police.woff2) format('woff2');}
  body{font-family:'Police Réseau'}
</style><script>
window.ADOC_EXPORT_DOC = ${JSON.stringify({ documentKind: 'presentation', blocks: [] })};
window.ADOC_EXPORT_IMAGES = {};
</script>`;

element('cv-fichier').files = [{ name: 'fixture-interactive.html', type: 'text/html', async text() { return exportHTML; } }];
element('cv-fichier').onchange();

(async () => {
  for (let i = 0; i < 20 && policesAuRendu === null; i++) await new Promise((r) => setTimeout(r, 0));
  assert.ok(policesAuRendu, 'la police doit être installée avant le début du rendu');
  assert.equal(optionsAuRendu.mode, 'fidele',
    'le cadrage par défaut de Trame doit être celui du lecteur Studio Clinique');
  assert.match(imagesJs, /adocGetDocumentContentCSS/,
    'la capture doit reprendre la feuille de contenu canonique de Studio Clinique');
  assert.match(imagesJs, /\[data-atelier-capture\]/,
    'la feuille Studio doit rester limitée à la scène de capture');
  assert.match(policesAuRendu, /font-family:'Police Test'/);
  assert.match(policesAuRendu, /data:font\/woff2;base64/);
  assert.doesNotMatch(policesAuRendu, /example\.invalid|Police Réseau/,
    'une police réseau et le CSS général de l’export ne doivent jamais être injectés');
  assert.equal(JSON.stringify(window.__chutier.polices()),
    JSON.stringify({ regles: 1, familles: ['Police Test'] }));
  assert.match(element('cv-message').textContent, /1 variante de police embarquée \(Police Test\)/,
    'le compte rendu doit confirmer les variantes et familles réellement importées');
  console.log('PASS Trame injecte les seules polices embarquées avant le rendu et refuse les fontes réseau.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
