import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("les champs de limitation reprennent le langage visuel du formulaire", () => {
  assert.match(template, /class="limitation-grid"/);
  assert.match(template, /Où êtes-vous gêné \?/);
  assert.match(template, /Qu’est-ce qui déclenche la gêne \?/);
  assert.match(template, /number-with-unit/);
  assert.match(template, /Contraintes impératives/);
});

test("Prudence et repli disparaît de la préparation", () => {
  assert.doesNotMatch(template, /<h3>Prudence et repli<\/h3>/);
  assert.match(template, /<summary>Réglages avancés du calcul<\/summary>/);
  assert.match(template, /privacy-options-compact/);
  assert.match(template, /id="strict"[^>]+hidden/);
  assert.doesNotMatch(app, /summaryItem\("Compromis silencieux"/);
});

test("les détails sont regroupés en quatre sections lisibles", () => {
  for (const title of ["Parcours", "Contraintes et réserves", "Autour du parcours", "Sources et exports"])
    assert.match(app, new RegExp(`<summary>${title}<\\/summary>`));
  assert.doesNotMatch(app, /<details><summary>Détail des contrôles/);
});

test("la décision de départ est rapprochée de la synthèse des réserves", () => {
  assert.match(app, /result-reserve-summary/);
  assert.match(app, /Balade non recommandée telle quelle/);
  assert.match(app, /r\.daylightReturn\.label/);
  assert.match(app, /id="startNavBtn"/);
});
