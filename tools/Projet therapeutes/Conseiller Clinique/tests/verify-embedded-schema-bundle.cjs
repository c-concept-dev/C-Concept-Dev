'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'studio-clinique.html'), 'utf8');
const match = html.match(/<script[^>]+id=["']adoc-sc-schemas["'][^>]*>([\s\S]*?)<\/script>/);

assert(match, 'bundle de schémas embarqué introuvable');

const embedded = JSON.parse(match[1]);
const schemaDir = path.join(root, 'Schemas');
const expectedNames = fs.readdirSync(schemaDir)
  .filter((name) => name.endsWith('.schema.json'))
  .sort();

assert.deepStrictEqual(
  Object.keys(embedded).sort(),
  expectedNames,
  'le bundle embarqué doit contenir tous les schémas du dossier Schemas'
);

for (const name of expectedNames) {
  const source = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
  assert.deepStrictEqual(embedded[name], source, `${name} embarqué diffère de sa source`);
}

assert(embedded['source-snapshot.schema.json'], 'source-snapshot.schema.json doit être embarqué');

console.log(`PASS bundle schémas : ${expectedNames.length} schémas complets et synchronisés`);
