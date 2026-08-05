import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const template = readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('la charte C-Concept&Dev v2 est la source visuelle active', () => {
  assert.match(template, /CHARTE C-CONCEPT&DEV V2 — identité officielle/);
  assert.match(template, /--teal:#3d8d94/);
  assert.match(template, /--navy:#1b5e70/);
  assert.match(template, /--sand:#E4D8C3/);
  assert.match(template, /--font-heading:'Montserrat'/);
  assert.match(template, /--font-body:'Open Sans'/);
  assert.match(template, /--font-mono:'JetBrains Mono'/);
});

test('les boutons principaux restent carrés et suivent la couleur teal', () => {
  assert.match(template, /--radius-button:0/);
  assert.match(template, /\.primary\{[^}]*border-radius:var\(--radius-button\)[^}]*background:var\(--teal\)/s);
  assert.match(template, /\.primary:hover\{background:var\(--surface\);color:var\(--teal\)\}/);
});

test('le manifeste et le cache PWA portent la nouvelle identité', () => {
  assert.equal(manifest.theme_color, '#3d8d94');
  assert.equal(manifest.background_color, '#fafafa');
  assert.match(worker, /jmmjs-shell-charte-v2/);
});
