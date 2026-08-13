import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');

test('le calcul solaire reçoit latitude puis longitude depuis une géométrie GeoJSON', () => {
  assert.match(app, /latitude:\s*coords\[1\][\s\S]*longitude:\s*coords\[0\]/);
});

test('la géométrie est présentée comme référence et non comme certification officielle', () => {
  assert.match(app, /Géométrie de référence disponible/);
  assert.doesNotMatch(app, /Géométrie exacte certifiée/);
  assert.match(app, /arrivée à \$\{exportAudit\.closureMeters\} m du départ/);
});

test('la zone de résultats reste lisible et le demi-tour est prioritaire en phase 2', () => {
  assert.match(template, /body\.has-results \.workspace/);
  assert.doesNotMatch(template, /\.return-safety\{/);
  assert.match(template, /#navTurnBack\{flex-basis:100%/);
  assert.match(template, /\.detail summary\{font-size:\.88rem/);
});

test('le formulaire ne se révèle qu’au clic, pas à l’initialisation du script', () => {
  assert.match(template, /<div class="workspace" id="workspace" hidden>/);
  assert.match(app, /function mode\(m, reveal = true\) \{[\s\S]*?if \(reveal\) \$\("#workspace"\)\.hidden = false;/);
  assert.match(app, /mode\("api", false\);\s*\n\s*\$\("#duration"\)\.dispatchEvent/);
});

test('une couverture de surface inférieure à 25 % est très partiellement documentée', () => {
  const context = { globalThis: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../src/core/terrain-proof-core.js', import.meta.url), 'utf8'), context);
  const result = context.globalThis.JMMJSTerrainProofCore.summarizeTerrainProof({
    source: 'OpenStreetMap',
    surfaceCoveragePercent: 2,
  });
  const surface = result.items.find((item) => item.id === 'surface');
  assert.equal(surface.level, 'very-partial');
  assert.equal(surface.levelLabel, 'Très partiellement documenté');
  assert.match(surface.reason, /Moins d’un quart/);
});
