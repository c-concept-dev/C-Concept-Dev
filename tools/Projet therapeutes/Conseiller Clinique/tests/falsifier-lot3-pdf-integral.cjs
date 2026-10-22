// Chaque sabotage doit faire échouer le contrôle PDF réel. Restauration garantie.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sourcePath = path.join(__dirname, '../studio-clinique-core.js');
const testPath = path.join(__dirname, 'verify-lot3-pdf-integral.cjs');
const original = fs.readFileSync(sourcePath, 'utf8');
const mutants = [
  ['A4 paysage retiré', "'@page{size:A4 landscape;margin:0;}'", "'@page{size:1024px 768px;margin:0;}'"],
  ['débordement masqué', 'min-height:768px;margin:0 auto;padding:24px;', 'height:768px;overflow:hidden;margin:0 auto;padding:24px;'],
  ['réduction désactivée', 'card.style.zoom = String(scale);', "card.style.zoom = '1';"],
  // Lot G enveloppe le collecteur historique pour y présenter les titleStyle comme des styles
  // de blocs virtuels ; la mutation retire toujours les jetons de charte au MÊME appel PDF.
  ['polices de charte ignorées', 'adocExportFontsWithTitles(doc, isPresentation ? tokens : null) + (extraFontLinks || \'\')', "adocExportFontsWithTitles(doc) + (extraFontLinks || '')"],
  ['repli de police absent', 'next.typography[role] = replacement;', 'next.typography[role] = stack;'],
  ['image privée non embarquée', 'preparedHtml = await adocEmbedAssetImagesHTML(preparedHtml);', 'preparedHtml = preparedHtml;'],
  ['couverture sans plafond', 'max-height:324px;object-fit:cover;break-inside:avoid;', 'max-height:none;object-fit:cover;break-inside:avoid;'],
  ['ressource de police ignorée',
    'const embedded = await adocPdfBrandFontResource(art, name);\n        if (embedded) { extraLinks.push(embedded); continue; }',
    'const embedded = null;\n        if (embedded) { extraLinks.push(embedded); continue; }'],
  ['avertissement jamais effacé', "fontWarningShown ? 'Exporter en PDF — police remplacée' : baseLabel", "fontWarningShown ? 'Exporter en PDF — police remplacée' : 'Exporter en PDF — police remplacée'"],
];
try {
  for (const [label, before, after] of mutants) {
    assert.equal(original.split(before).length - 1, 1, 'ancre absente ou multiple : ' + label);
    fs.writeFileSync(sourcePath, original.replace(before, after));
    const result = spawnSync(process.execPath, [testPath], { cwd: path.join(__dirname, '..'),
      env: process.env, encoding: 'utf8', timeout: 120000 });
    assert.notEqual(result.status, 0, 'mutation non détectée : ' + label + '\n' + result.stdout + result.stderr);
    console.log('MUTATION DÉTECTÉE — ' + label);
    fs.writeFileSync(sourcePath, original);
  }
} finally { fs.writeFileSync(sourcePath, original); }
