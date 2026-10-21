// Chaque ancien point de sauvegarde automatique doit faire échouer le contrôle navigateur.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const source = path.join(root, 'studio-clinique-core.js');
const original = fs.readFileSync(source, 'utf8');
const test = path.join(__dirname, 'verify-lot2-sauvegarde-explicite.cjs');
const roundtrip = path.join(__dirname, 'verify-lot2-version-apres-clic.cjs');
const env = { ...process.env, NODE_PATH: process.env.NODE_PATH || '/Users/christophebonnet/Documents/Codex/2026-09-13/codex-v-rification-crois-e-ind/work/57f/node_modules' };
function run() { return spawnSync(process.execPath, [test], { env, encoding: 'utf8', timeout: 90000 }); }
function restore() { fs.writeFileSync(source, original); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { restore(); process.exit(signal === 'SIGINT' ? 130 : 143); });
const cases = [
  ['thème', 'window.adocApplyTheme = async function', 'window.adocThemes = function', 0],
  ['remplacement image', 'async function adocReplaceSelectedImage(', 'window.adocRemoveCardImage = function', 0],
  ['charte legacy', 'window.adocConfirmLegacyRetheme = async function', '// ═══════════════════════════════════════════════════════════════════════', 0],
  ['charte structurée', 'window.adocConfirmStructuredRetheme = async function', '// Révèle le bouton "Charte"', 0],
  ['dépôt image', 'async function adocHandleImageDrop(', '// Compatibility entry point', 0],
  ['correction titre', 'window.adocConfirmBlockCorrection = async function', '// ── Barre d\'outils', 0],
  ['correction bloc', 'window.adocConfirmBlockCorrection = async function', '// ── Barre d\'outils', 1],
  ['Médias', 'async function adocApplyMediaAssetToSelectedBlock(', 'window.adocMediaInsertFromSearch = async function', 0],
  ['correction legacy', 'window.adocConfirmLegacyBlockCorrection = async function', '// ═══════════════════════════════════════════════════════════════════════', 0],
];
try {
  assert.equal(run().status, 0, 'contrôle de départ non vert');
  for (const [name, begin, end, nth] of cases) {
    const a = original.indexOf(begin), b = original.indexOf(end, a + begin.length);
    assert.ok(a >= 0 && b > a, 'ancre introuvable : ' + name);
    const needle = 'adocEditorMarkDirty();';
    let pos = a;
    for (let i = 0; i <= nth; i++) {
      pos = original.indexOf(needle, pos);
      assert.ok(pos >= a && pos < b, 'appel de marquage introuvable : ' + name);
      if (i < nth) pos += needle.length;
    }
    fs.writeFileSync(source, original.slice(0, pos) + 'await window.adocWsSave();' + original.slice(pos + needle.length));
    const result = run();
    assert.notEqual(result.status, 0, 'mutation non détectée : ' + name);
    assert.match(result.stderr + result.stdout, /a appelé adocWsSave/, 'échec non attribué à la sauvegarde : ' + name);
    restore();
    console.log('PASS mutation ' + name + ' : sauvegarde automatique détectée');
  }
  const themeBranch = "if (savedTheme) {";
  assert.equal(original.split(themeBranch).length - 1, 1, 'branche de réouverture du thème absente ou ambiguë');
  fs.writeFileSync(source, original.replace(themeBranch, 'if (false && savedTheme) {'));
  const reopened = spawnSync(process.execPath, [roundtrip], { env, encoding: 'utf8', timeout: 90000 });
  assert.notEqual(reopened.status, 0, 'la perte du thème après réouverture n’est pas détectée');
  assert.match(reopened.stderr + reopened.stdout, /Encre|strictly equal/, 'échec non attribué au thème rouvert');
  restore();
  console.log('PASS mutation réouverture : perte du thème sauvegardé détectée');
  console.log('PASS falsifier-lot2-sauvegarde-explicite : ' + (cases.length + 1) + '/' + (cases.length + 1));
} finally {
  restore();
}
