// Lot 1 : chaque rupture du titre de la copie doit faire tomber le parcours affiché.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const core = path.join(root, 'studio-clinique-core.js');
const original = fs.readFileSync(core, 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const before = sha(original);
const run = () => spawnSync(process.execPath, [path.join(__dirname, 'verify-enregistrer-sous.cjs')],
  { cwd: root, env: process.env, encoding: 'utf8', timeout: 30000 });
const mutations = [
  ["titre absent du JSON envoyé", "      if (!isLegacy) content.clinicalDocument = { ...content.clinicalDocument, title: trimmedTitle };", /le titre DANS le document structuré envoyé/],
  ["copie active garde l'ancien titre", "        art._adocStructuredDoc.title = trimmedTitle;", /la copie active doit porter le titre structuré demandé/],
  ["barre garde l'ancien titre", "      if (headerTitle) headerTitle.textContent = trimmedTitle;", /le titre affiché dans la barre doit désigner la copie active/],
  ["confirmation de copie absente", "      if (statusEl) statusEl.textContent = 'Copie créée : ' + trimmedTitle + ' · ' + statusEl.textContent;", /la zone de statut doit annoncer la création de la copie/],
];

assert.equal(run().status, 0, 'le contrôle doit passer avant les mutations');
let caught = 0;
try {
  for (const [label, line, expectedFailure] of mutations) {
    assert.equal(original.split(line).length - 1, 1, 'ancre unique : ' + label);
    fs.writeFileSync(core, original.replace(line, '      // mutation : ' + label));
    const result = run();
    assert.equal(result.status, 1, 'mutation non détectée ou test interrompu : ' + label);
    assert.match(result.stdout + result.stderr, expectedFailure,
      'le contrôle a échoué pour une autre raison que la mutation : ' + label);
    caught++;
    fs.writeFileSync(core, original);
    console.log('PASS mutation : ' + label);
  }
} finally {
  fs.writeFileSync(core, original);
  assert.equal(sha(fs.readFileSync(core, 'utf8')), before, 'cœur restauré');
}
console.log('PASS falsifier-lot1-sauvegarder-sous : ' + caught + '/' + mutations.length);
