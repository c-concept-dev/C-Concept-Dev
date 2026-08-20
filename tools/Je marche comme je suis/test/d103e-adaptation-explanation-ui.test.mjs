import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

test("D103E est rendu dans la vérification avant calcul", () => {
  assert.match(app, /renderD103AdaptationExplanation\(S\.d103Adaptation\)/);
  assert.match(app, /Ce que nous avons ajusté pour aujourd’hui|d103eAdaptationTitle/);
  assert.match(html, /\.d103e-adaptation/);
});

test("D103E ne crée aucun nouvel écran ni navigation externe", () => {
  assert.doesNotMatch(app, /d103e.*location\.href/i);
  assert.doesNotMatch(html, /id="d103e[^\"]*Screen"/i);
});

test("le build embarque le presenter D103E", () => {
  assert.match(build, /activity-adaptation-presenter-core\.js/);
});
