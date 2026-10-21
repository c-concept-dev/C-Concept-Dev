// Chaque sabotage principal doit échouer dans le navigateur ; sources restaurées même sur erreur.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = path.join(__dirname, '../studio-clinique-core.js');
const html = path.join(__dirname, '../studio-clinique.html');
const originals = new Map([[core, fs.readFileSync(core, 'utf8')], [html, fs.readFileSync(html, 'utf8')]]);
const test = path.join(__dirname, 'verify-lot4-impression-presentation.cjs');
const mutants = [
  ['bouton absent', html, 'id="cc-ws-print-presentation-btn"', 'id="cc-ws-print-presentation-btn-deleted"'],
  ['visibilité inversée', core, "printPresentationBtn.hidden = !(!isLegacy && docKind === 'presentation');", "printPresentationBtn.hidden = true;"],
  ['impression jamais appelée', core, 'printWindow.print();', 'printWindow.focus();'],
  ['format de papier différent', core, 'printWindow.document.write(prepared.html);', "printWindow.document.write(prepared.html.replace('size:A4 landscape', 'size:1024px 768px'));"],
  ['image privée perdue', core, 'preparedHtml = await adocEmbedAssetImagesHTML(preparedHtml);', 'preparedHtml = preparedHtml;'],
  ['calcul de score imprimé', core, '.adoc-sc-questionnaire-submit,.adoc-sc-questionnaire-partners', '.adoc-sc-questionnaire-partners'],
  ['boutons interactifs conservés', core, "inner.querySelectorAll('.adoc-sc-questionnaire-option,.adoc-sc-quiz-option').forEach(function(button) {", "inner.querySelectorAll('.adoc-sc-quiz-option').forEach(function(button) {"],
  ['arrière-plan non imprimé', core, "'print-color-adjust:exact;-webkit-print-color-adjust:exact;'", "''"],
];
try {
  for (const [label, file, before, after] of mutants) {
    const original = originals.get(file);
    assert.equal(original.split(before).length - 1, 1, 'ancre absente ou multiple : ' + label);
    fs.writeFileSync(file, original.replace(before, after));
    const result = spawnSync(process.execPath, [test], { cwd: path.join(__dirname, '..'), env: process.env,
      encoding: 'utf8', timeout: 120000 });
    assert.notEqual(result.status, 0, 'mutation non détectée : ' + label + '\n' + result.stdout + result.stderr);
    console.log('MUTATION DÉTECTÉE — ' + label);
    fs.writeFileSync(file, original);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
