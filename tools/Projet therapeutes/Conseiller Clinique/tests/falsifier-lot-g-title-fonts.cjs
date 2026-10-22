// Chaque mutation agit sur une copie en mémoire du vrai cœur ; les sources restent intactes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = path.join(__dirname, 'verify-lot-g-title-fonts.cjs');
for (const mutation of ['collect','render','wrong-card']) {
  const result = spawnSync(process.execPath,[test],{
    cwd:path.join(__dirname,'..'), env:{...process.env,LOT_G_MUTATION:mutation},
    encoding:'utf8',timeout:600000
  });
  assert.equal(result.error,undefined,mutation + ' : ' + String(result.error));
  assert.notEqual(result.status,0,mutation + ' non détectée');
  assert.match(result.stderr,/AssertionError/,mutation + ' : panne hors assertion');
  console.log('PASS falsification ' + mutation);
}
