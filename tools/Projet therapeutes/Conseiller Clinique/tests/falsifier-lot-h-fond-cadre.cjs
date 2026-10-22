// Mutations en mémoire du cœur servi à Chromium ; aucun fichier source n'est écrit.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = path.join(__dirname, 'verify-lot-h-fond-cadre.cjs');
for (const mutation of ['controls', 'persist', 'render', 'photo', 'card', 'export', 'restore', 'remove']) {
  const result = spawnSync(process.execPath, [test], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, LOT_H_MUTATION: mutation },
    encoding: 'utf8', timeout: 600000
  });
  assert.equal(result.error, undefined, mutation + ' : ' + String(result.error));
  assert.notEqual(result.status, 0, mutation + ' non détectée');
  assert.match(result.stderr, /AssertionError/, mutation + ' : panne hors assertion\n' + result.stderr.slice(0, 500));
  console.log('PASS falsification ' + mutation);
}
