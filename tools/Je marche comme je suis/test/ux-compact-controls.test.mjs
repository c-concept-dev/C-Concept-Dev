import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');

test('les contraintes impératives utilisent des choix compacts', () => {
  assert.match(template, /class="imperative-choice"[^>]*><input id="noStairs"/);
  assert.match(template, /class="imperative-choice"[^>]*><input id="noExposure"/);
  assert.doesNotMatch(template, /class="option-tile"[^>]*><input id="noStairs"/);
});

test('les champs numériques restent courts avec leur unité', () => {
  assert.match(template, /\.number-with-unit\{[^}]*grid-template-columns:minmax\(92px,128px\) auto/);
});

test('les services cartographiques sont repliables par défaut', () => {
  assert.match(template, /<details class="card api-compact" id="apiBox">/);
  assert.match(template, /<summary>Services cartographiques sécurisés<\/summary>/);
  assert.doesNotMatch(template, /<details class="card api-compact" id="apiBox" open>/);
});

test('les enrichissements restent compacts tant qu’aucun contenu n’est chargé', () => {
  assert.match(template, /\.enrichment \.empty-data\{display:none\}/);
  assert.match(template, /\.enrichment \.photo-warning\{display:none\}/);
});
