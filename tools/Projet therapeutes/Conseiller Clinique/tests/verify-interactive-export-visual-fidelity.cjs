const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'studio-clinique-core.js');
const source = fs.readFileSync(CORE, 'utf8');

// Contrat minimal de parité entre l'éditeur et l'export autonome. Ces vérifications
// ciblent les régressions réellement observées sur les présentations de Studio Clinique.
assert.match(
  source,
  /adocExportFontsWithTitles\(doc, null, false\)/,
  'l’export interactif doit collecter les polices de tous les blocs, pas seulement les titres'
);

for (const family of ['Montserrat', 'Pompiere']) {
  assert.match(
    source,
    new RegExp("['\"]" + family + "['\"]\\s*:\\s*['\"]https://fonts\\.googleapis\\.com/"),
    `la police ${family} utilisée par le document réel doit disposer d’une source web exportable`
  );
}

for (const cssClass of [
  'adoc-sc-paragraph',
  'adoc-sc-callout',
  'adoc-sc-callout-info',
  'adoc-sc-callout-warning',
  'adoc-sc-callout-critical',
  'adoc-sc-callout-success',
  'adoc-sc-list',
  'adoc-sc-image',
  'adoc-sc-video'
]) {
  assert.ok(
    source.includes('.' + cssClass),
    `le CSS partagé de l’export doit conserver .${cssClass}`
  );
}

console.log('OK — contrat de fidélité visuelle de l’export interactif');
