import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('D101I restaure le libellé validé D’où partez-vous', () => {
  assert.match(template, /<h3>D’où partez-vous \?<\/h3>/);
  assert.doesNotMatch(template, /<h3>Où partez-vous \?<\/h3>/);
});

test('D101I conserve un questionnaire unique desktop et responsive', () => {
  assert.equal((template.match(/<form\b/g) || []).length, 1);
  assert.equal((template.match(/<section class="step(?: active)?"/g) || []).length, 4);
  assert.match(template, /id="d101i-stable-responsive-base"/);
});

test('D101I compacte les services mobile sans modifier le composant métier', () => {
  assert.match(template, /grid-template-columns:minmax\(104px,.9fr\) minmax\(0,1.55fr\)!important/);
  assert.match(template, /\.service-state-switch button\{[\s\S]*?min-height:36px!important/);
  assert.match(template, /-webkit-text-size-adjust:100%/);
  assert.equal((template.match(/data-service-choice="Banc"/g) || []).length, 1);
});

test('D101I garde les détails complets dans Voir tous les détails mais compacte les points à contrôler', () => {
  assert.match(app, /function renderSummaryGroup\(title, items, className, compact = false\)/);
  assert.match(app, /renderSummaryGroup\("Limites à respecter", model\.imperative, "imperative", true\)/);
  assert.match(app, /renderSummaryGroup\("Préférences et envies", model\.preferences, "preference"\)/);
  assert.match(app, /Origine :/);
});
