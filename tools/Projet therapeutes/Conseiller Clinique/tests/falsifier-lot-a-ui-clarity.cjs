// Lot A : les mutations sont exécutées sur une copie temporaire complète.
// Une interruption ne peut donc jamais laisser les sources du dépôt modifiées.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-lot-a-falsifier-'));
const product = {
  page: 'studio-clinique.html',
  core: 'studio-clinique-core.js',
};
const mutations = [
  {
    name: 'Le texte Ouvrir hérite de la couleur sombre', part: 'a1', file: 'page',
    from: '#cc-landing .cc-media-insert-btn { color: #fff; }',
    to: '#cc-landing .cc-media-insert-btn { color: inherit; }',
  },
  {
    name: 'Les croix perdent leur nom distinctif', part: 'a2', file: 'core',
    from: "return 'Supprimer ' + kind + ' ' + (index + 1) + (excerpt ? ' : ' + excerpt : '');",
    to: "return 'Supprimer ce bloc';",
  },
  {
    name: 'La zone cliquable rétrécit', part: 'a2', file: 'page',
    from: 'width: 24px; height: 24px; padding: 0; border: 1px solid var(--stone-300);',
    to: 'width: 23px; height: 23px; padding: 0; border: 1px solid var(--stone-300);',
  },
  {
    name: 'Le menu perd son groupe accessible Document', part: 'a3', file: 'page',
    from: '<div class="cc-ws-export-group" role="group" aria-label="Document">',
    to: '<div class="cc-ws-export-group">',
  },
  {
    name: 'Le nom de la sortie ne mentionne plus le fichier', part: 'a3', file: 'core',
    from: "const label = 'Exporter ' + (art && art.name || 'document') + '.' + extension;",
    to: "const label = 'Exporter';",
  },
];

function run(part) {
  return spawnSync(process.execPath, [path.join(scratch, 'tests', 'verify-lot-a-ui-clarity.cjs'), part], {
    cwd: scratch, env: process.env, encoding: 'utf8', timeout: 60000,
  });
}

try {
  fs.cpSync(root, scratch, { recursive: true });
  for (const part of ['a1', 'a2', 'a3']) {
    const baseline = run(part);
    assert.equal(baseline.status, 0, 'Contrôle initial rouge pour ' + part + '\n' + baseline.stderr);
  }
  for (const mutation of mutations) {
    const file = path.join(scratch, product[mutation.file]);
    const original = fs.readFileSync(file, 'utf8');
    assert.equal(original.split(mutation.from).length - 1, 1, 'Ancre unique : ' + mutation.name);
    fs.writeFileSync(file, original.replace(mutation.from, mutation.to));
    const result = run(mutation.part);
    assert.notEqual(result.status, 0, 'Mutation non détectée : ' + mutation.name);
    fs.writeFileSync(file, original);
    console.log('DÉTECTÉ : ' + mutation.name);
  }
  console.log('PASS falsifier-lot-a-ui-clarity — 5 mutations détectées, sources du dépôt intactes');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
