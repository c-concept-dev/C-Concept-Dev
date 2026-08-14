import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("ANOM-001 conserve les résultats et applique un délai d’inactivité", () => {
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*?applyResultsFreshness\(resultsAreStale\(\)\)[\s\S]*?\}, 800\)/);
  assert.doesNotMatch(app, /E\.results\.classList\.remove\("show"\)/);
  assert.doesNotMatch(app, /E\.map\.classList\.remove\("show"\)/);
});

test("ANOM-001 neutralise le signal pendant le GPS", () => {
  assert.match(app, /function setResultsFreshness[\s\S]*?if \(S\.nav\.active\) return;/);
  const stopNavigation = app.slice(
    app.indexOf("function stopNavigation()"),
    app.indexOf("async function requestRecoveryLink("),
  );
  assert.doesNotMatch(stopNavigation, /setResultsFreshness\(/);
});

test("ANOM-001 protège les quatre actions engageantes", () => {
  assert.match(app, /allowRouteAction\("suivre cette promenade"\)/);
  assert.match(app, /allowRouteAction\("télécharger le fichier GPX"\)/);
  assert.match(app, /allowRouteAction\("télécharger le fichier JSON"\)/);
  assert.match(app, /allowRouteAction\("ouvrir ce parcours dans Google Maps"\)/);
  assert.match(app, /Garder ce parcours/);
  assert.match(app, /Recalculer d’abord/);
});
