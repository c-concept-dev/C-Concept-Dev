const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot8-mutants-'));
const html = fs.readFileSync(path.join(root, 'studio-clinique.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'studio-clinique-core.js'), 'utf8');
const mutants = [
  ['image omise', 'core', "case 'image':\n            d.elements.push", "case 'image-masquee':\n            d.elements.push"],
  ['questionnaire omis', 'core', "case 'questionnaire':\n            d.elements.push", "case 'questionnaire-masque':\n            d.elements.push"],
  ['étape vide omise', 'core', "if (d.elements.length === contenuAvant) d.elements.push({ genre: 'empty', texte: '(aucun contenu)' });", 'if (false) d.elements.push({ genre: \'empty\', texte: \'(aucun contenu)\' });'],
  ['libellé encadré perdu', 'core', "out.push('  Encadré : ' + e.texte);", "out.push('  ' + e.texte);"],
  ['PDF indisponible', 'core', 'window.adocPdfTexteDiapositives = adocPdfTexteDiapositives;', 'window.adocPdfTexteDiapositives = undefined;'],
  ['entrée PDF perdue', 'html', 'id="cc-ws-texte-pdf-btn"', 'id="cc-ws-texte-pdf-absent"']
];
try {
  for (const [label, target, from, to] of mutants) {
    const dir = path.join(tmp, String(mutants.findIndex(x => x[0] === label)));
    fs.mkdirSync(dir);
    assert.ok((target === 'core' ? core : html).includes(from), label + ' ancre présente');
    fs.writeFileSync(path.join(dir, 'studio-clinique.html'), target === 'html' ? html.replace(from, to) : html);
    fs.writeFileSync(path.join(dir, 'studio-clinique-core.js'), target === 'core' ? core.replace(from, to) : core);
    for (const file of ['vendor', 'atelier-images.js', 'narration-ia.js'])
      fs.symlinkSync(path.join(root, file), path.join(dir, file));
    const result = spawnSync(process.execPath, [path.join(__dirname, 'verify-lot8-extraction.cjs')], {
      env: { ...process.env, STUDIO_ROOT: dir }, encoding: 'utf8', timeout: 60000
    });
    assert.notEqual(result.status, 0, label + ' doit faire tomber le contrôle');
    console.log('PASS mutation détectée : ' + label);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
