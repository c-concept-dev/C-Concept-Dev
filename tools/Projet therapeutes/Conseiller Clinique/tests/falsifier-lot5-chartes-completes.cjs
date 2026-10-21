// Mutations du parcours visible. Chaque mutation doit faire échouer le vrai test navigateur.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const core = path.join(__dirname, '..', 'studio-clinique-core.js');
const test = path.join(__dirname, 'verify-lot5-chartes-completes.cjs');
const original = fs.readFileSync(core, 'utf8');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const mutations = [
  ['la charte importée redevient invisible', 'const availableKits = kits || [];', 'const availableKits = (kits || []).filter(function (k) { return adocIsDefaultBrandKitId(k.id); });'],
  ['le diagnostic de contraste disparaît', "    if (!warnings.length) return '';", "    if (!warnings.length || true) return '';"],
  ['la confirmation ne marque plus le document modifié', "    adocEditorMarkDirty();\n    if (candidate.brandKit) adocEnsureBrandKitFontsLoaded(candidate.brandKit);", "    if (candidate.brandKit) adocEnsureBrandKitFontsLoaded(candidate.brandKit);"],
  ['le bandeau de police n’est plus restauré', "    if (candidate.brandKit) adocEnsureBrandKitFontsLoaded(candidate.brandKit);\n  };\n\n  // Révèle le bouton", "  };\n\n  // Révèle le bouton"],
];
let detected = 0;
try {
  for (const [name, from, to] of mutations) {
    if (original.split(from).length !== 2) throw new Error('Ancre non unique : ' + name);
    fs.writeFileSync(core, original.replace(from, to));
    try {
      execFileSync(process.execPath, [test], { stdio: 'pipe', timeout: 60000 });
      throw new Error('Mutation NON détectée : ' + name);
    } catch (error) {
      if (/Mutation NON détectée/.test(error.message)) throw error;
      detected++;
      console.log('Détectée : ' + name);
    } finally { fs.writeFileSync(core, original); }
  }
} finally {
  fs.writeFileSync(core, original);
  if (hash(fs.readFileSync(core, 'utf8')) !== hash(original)) throw new Error('Source non restaurée');
}
console.log('PASS lot 5 : ' + detected + '/' + mutations.length + ' mutations détectées, source restaurée.');
