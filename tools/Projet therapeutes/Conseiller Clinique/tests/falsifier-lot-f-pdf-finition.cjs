// Les trois protections doivent être réellement couvertes par le PDF Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.join(__dirname, '../studio-clinique-core.js');
const test = path.join(__dirname, 'verify-lot-f-pdf-finition.cjs');
const original = fs.readFileSync(source, 'utf8');
const mutants = [
  ['question coupée', 'adoc-sc-questionnaire-question{break-inside:avoid;page-break-inside:avoid;}', 'adoc-sc-questionnaire-question{break-inside:auto;page-break-inside:auto;}', 'questionnaire'],
  ['page de suite maigre', 'const minimumTail = pdfPageHeight * 0.15;\n        // Les marges', 'const minimumTail = 0;\n        // Les marges', 'tail'],
  ['fin d’annexe maigre', 'appendixBottom - lastPageStart < minimumTail', 'appendixBottom - lastPageStart < 0', 'annexe'],
  ['veuves et orphelines', 'orphans:4;widows:7;', 'orphans:1;widows:1;', 'widow'],
];
try {
  for (const [label, before, after, kind] of mutants) {
    assert.equal(original.split(before).length - 1, 1, 'ancre absente ou multiple : ' + label);
    fs.writeFileSync(source, original.replace(before, after));
    const run = spawnSync(process.execPath, [test], { cwd: path.dirname(test), encoding: 'utf8', timeout: 120000,
      env: { ...process.env, ADOC_LOTF_CASE: kind } });
    assert.notEqual(run.status, 0, 'mutation non détectée : ' + label + '\n' + run.stdout + run.stderr);
    console.log('MUTATION DÉTECTÉE — ' + label);
    fs.writeFileSync(source, original);
  }
} finally { fs.writeFileSync(source, original); }
