import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const template = readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('la charte graphique JMMJS v1 du 06/08/2026 est la source visuelle active', () => {
  assert.match(template, /CHARTE GRAPHIQUE JMMJS V1 — identité officielle du 06\/08\/2026/);
  assert.match(template, /--cream:#E8E2D4/);
  assert.match(template, /--sage:#8A9A5B/);
  assert.match(template, /--ochre:#C9A15A/);
  assert.match(template, /--terracotta:#B5502E/);
  assert.match(template, /--ink:#3A3628/);
  assert.match(template, /--font-brand:'Kalam'/);
  assert.match(template, /--font-ui:'IBM Plex Sans'/);
  assert.match(template, /--font-mono:'IBM Plex Mono'/);
});

test('la sauge porte les actions et les niveaux de balade gardent leurs accents réservés', () => {
  assert.match(template, /\.primary\{[^}]*background:var\(--sage\)/s);
  assert.match(template, /\.primary:hover\{background:var\(--sage-hover\)/);
  assert.match(template, /\.route-card\.route-comfortable\{border-top:4px solid var\(--ochre\)\}/);
  assert.match(template, /\.route-card\.route-agreable\{border-top:4px solid var\(--sage\)\}/);
  assert.match(template, /\.route-card\.route-tonique\{border-top:4px solid var\(--terracotta\)\}/);
});

test('le manifeste et le cache PWA portent la nouvelle identité', () => {
  assert.equal(manifest.theme_color, '#8A9A5B');
  assert.equal(manifest.background_color, '#E8E2D4');
  assert.equal(manifest.icons.length, 0);
  assert.match(worker, /jmmjs-shell-charte-v1-20260806/);
});
