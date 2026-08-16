import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D100C3 l'interface expose une intention explicite Juste prendre l'air", () => {
  assert.match(template, /id="freshAirOnly"/);
  assert.match(template, /Juste prendre l’air/);
  assert.match(template, /Sans détour pour rechercher un lieu particulier/);
});

test("D100C3 le modèle de requête encode l'intention et supprime les envies de destination", () => {
  assert.match(app, /walkIntent:.*fresh_air/s);
  assert.match(app, /preferences:.*freshAirOnly.*\? \[\] : chosen\("wishes"\)/s);
});

test("D100C3 le moteur court-circuite réellement la recherche de cibles POI", () => {
  assert.match(app, /async function fetchPoiTargets[\s\S]*?if \(req\.walkIntent === "fresh_air"\) return \[\];/);
});

test("D100C3 l'audit POI de destination est également neutralisé en mode prendre l'air", () => {
  assert.match(app, /const wishPois = req\.walkIntent === "fresh_air" \? \[\] : \(req\.preferences \|\| \[\]\)\.filter/);
});

test("D100C3 l'activation efface les envies mais ne touche ni terrain ni services", () => {
  const fn = app.match(/function syncFreshAirIntent\(active\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /data-group="wishes"/);
  assert.doesNotMatch(fn, /data-group="terrain"/);
  assert.doesNotMatch(fn, /data-service-choice/);
});

test("D100C3 choisir ensuite une envie désactive Juste prendre l'air", () => {
  assert.match(app, /b\.closest\('\[data-group="wishes"\]'\)\) syncFreshAirIntent\(false\)/);
});
