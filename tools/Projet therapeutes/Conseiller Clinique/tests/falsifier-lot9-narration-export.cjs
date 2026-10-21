const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot9-mutants-'));
const html = fs.readFileSync(path.join(root, 'studio-clinique.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'studio-clinique-core.js'), 'utf8');
const mutants = [
  ['narration appliquée omise', 'core', 'const narration = adocNarrationRead(doc, e.stepId);', "const narration = '';"],
  ['étape vide muette', 'core', "narration || '(sans narration)'", "narration || ''"],
  ['durée fausse', 'core', 'Math.round(struct.totalMots / ADOC_NARRATION_MOTS_PAR_SECONDE)', 'Math.round(struct.totalMots / 1)'],
  ['narration divulguée dans HTML autonome', 'core', 'delete copie.narration;', 'void copie.narration;'],
  ['entrée Word absente', 'html', 'id="cc-ws-narration-word-btn"', 'id="cc-ws-narration-word-absent"'],
  ['PDF indisponible', 'core', 'window.adocPdfNarration = adocPdfNarration;', 'window.adocPdfNarration = undefined;']
];
try {
  for (const [i, [label, target, from, to]] of mutants.entries()) {
    const dir = path.join(tmp, String(i)); fs.mkdirSync(dir);
    assert.ok((target === 'core' ? core : html).includes(from), label + ' ancre présente');
    fs.writeFileSync(path.join(dir, 'studio-clinique.html'), target === 'html' ? html.replace(from, to) : html);
    fs.writeFileSync(path.join(dir, 'studio-clinique-core.js'), target === 'core' ? core.replace(from, to) : core);
    for (const file of ['vendor', 'atelier-images.js', 'narration-ia.js'])
      fs.symlinkSync(path.join(root, file), path.join(dir, file));
    const result = spawnSync(process.execPath, [path.join(__dirname, 'verify-lot9-narration-export.cjs')], {
      env: { ...process.env, STUDIO_ROOT: dir }, encoding: 'utf8', timeout: 60000
    });
    assert.notEqual(result.status, 0, label + ' doit faire tomber le contrôle');
    console.log('PASS mutation détectée : ' + label);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
