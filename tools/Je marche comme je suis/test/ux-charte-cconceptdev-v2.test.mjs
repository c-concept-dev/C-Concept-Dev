import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("la charte collaborative du 06/08/2026 reste la source visuelle active", () => {
  assert.match(template, /CHARTE C-CONCEPT&DEV V2 — identité officielle/);
  assert.match(template, /--teal:#8A9A5B/);
  assert.match(template, /--sand:#C9A15A/);
  assert.match(template, /--border:#C7BFA8/);
  assert.match(template, /--warn:#B5502E/);
  assert.match(template, /--navy:#3A3628/);
  assert.match(template, /--font-script:'Kalam'/);
  assert.match(template, /--font-heading:'IBM Plex Sans'/);
  assert.match(template, /--font-mono:'IBM Plex Mono'/);
});

test("la sauge porte les actions et les alertes conservent la terracotta", () => {
  assert.match(template, /\.primary\{[^}]*background:var\(--teal\)/s);
  assert.match(template, /\.chip\.hard\.active\{[^}]*border-color:#B5502E/s);
  assert.match(template, /border-color:var\(--border\)/);
});

test("le manifeste, les icônes et le cache PWA portent la nouvelle identité", () => {
  assert.equal(manifest.theme_color, "#8A9A5B");
  assert.equal(manifest.background_color, "#F4EFE4");
  assert.equal(manifest.icons.length, 2);
  assert.match(worker, /jmmjs-shell-20260806-routing-fix/);
  assert.match(template, /apple-touch-icon-180\.png/);
});

test("le service worker est enregistré seulement lors de la préparation hors connexion", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal((app.match(/serviceWorker\.register/g) || []).length, 1);
  assert.match(app, /new URL\("service-worker\.js", document\.baseURI\)/);
  assert.match(app, /await navigator\.serviceWorker\.register\(workerUrl\.href/);
});
