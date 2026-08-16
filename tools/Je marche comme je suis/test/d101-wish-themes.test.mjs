import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

const expected = new Set([
  "Point de vue", "Rivière", "Lac", "Forêt", "Ombre", "Patrimoine", "Curiosité locale",
  "Boulangerie", "Café", "Restaurant", "Pique-nique", "Calme", "Verger ou vignoble",
  "Arbre remarquable", "Cascade", "Grotte", "Œuvre d'art", "Petit patrimoine", "Glacier",
]);

function themeButtons() {
  return [...html.matchAll(/<button(?=[^>]*data-wish-theme="([^"]+)")[^>]*>[\s\S]*?<span class="wish-label">([^<]+)<\/span><\/button>/g)]
    .map((m) => ({ theme: m[1], label: m[2].trim() }));
}

test("D101 présente toutes les envies réelles exactement une fois", () => {
  const buttons = themeButtons();
  assert.equal(buttons.length, expected.size);
  assert.deepEqual(new Set(buttons.map((x) => x.label)), expected);
  assert.equal(new Set(buttons.map((x) => x.label)).size, buttons.length);
});

test("D101 limite chaque thème à huit choix maximum", () => {
  const counts = new Map();
  for (const { theme } of themeButtons()) counts.set(theme, (counts.get(theme) || 0) + 1);
  assert.deepEqual(Object.fromEntries(counts), { nature: 8, discovery: 4, gourmet: 5, ambience: 2 });
  for (const count of counts.values()) assert.ok(count <= 8);
});

test("D101 conserve un seul data-group wishes pour le câblage moteur", () => {
  assert.equal((html.match(/data-group="wishes"/g) || []).length, 1);
  assert.match(html, /data-wish-theme-select/);
  assert.match(html, /id="wishThemeGrid"/);
});

test("D101 le changement de thème ne modifie pas les sélections métier", () => {
  const body = app.match(/function applyWishTheme\(theme\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(body, /chip\.hidden = chip\.dataset\.wishTheme !== normalized/);
  assert.doesNotMatch(body, /classList\.remove\("active"\)/);
  assert.doesNotMatch(body, /classList\.toggle\("active"\)/);
});
