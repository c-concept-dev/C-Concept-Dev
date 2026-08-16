import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('les limitations avancées sont repliées par défaut', () => {
  assert.match(template, /<details class="limitation-advanced">/);
  assert.match(template, /Ajouter des contraintes précises/);
  assert.doesNotMatch(template, /<details class="limitation-advanced" open>/);
});

test('la vérification présente un résumé puis les réglages à la demande', () => {
  assert.match(app, /Un dernier coup d’œil suffit/);
  assert.match(app, /Voir tous les détails/);
  assert.match(app, /review-grid-compact/);
  assert.match(app, /Terrain & envies/);
  assert.match(app, /Besoins/);
});

test('le changement d’étape replace le mobile au début du formulaire', () => {
  assert.match(app, /function scrollToActiveStep\(\)/);
  assert.match(app, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(app, /requestAnimationFrame/);
});

test('l’attente avant calcul ne montre que trois bénéfices essentiels', () => {
  assert.match(template, /feature-list feature-list-simple/);
  assert.match(template, /Adaptée à votre état du jour/);
  assert.match(template, /Une vraie boucle revenant au départ/);
  assert.match(template, /GPX de référence et suivi intégré/);
  assert.doesNotMatch(template, /Trois parcours différents/);
});
