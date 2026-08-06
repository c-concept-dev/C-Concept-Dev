import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const worker = readFileSync(new URL("service-worker.js", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));

const expectedAssets = [
  "icons/jmmjs-icon.svg",
  "icons/favicon-32.png",
  "icons/apple-touch-icon-180.png",
  "icons/jmmjs-icon-192.png",
  "icons/jmmjs-icon-512.png",
];

test("chaque ressource locale préchargée par le service worker existe", () => {
  const shellMatch = worker.match(/const SHELL = (\[[^;]+\]);/);
  assert.ok(shellMatch, "liste SHELL introuvable");
  const shell = JSON.parse(shellMatch[1]);
  assert.ok(!shell.includes("./"), "le dossier GitHub Pages ne doit pas être préchargé");
  for (const relativePath of shell) {
    assert.equal(existsSync(new URL(relativePath.replace(/^\.\//, ""), root)), true, `${relativePath} manque`);
  }
});

test("les icônes annoncées sont présentes dans le manifeste et sur disque", () => {
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  for (const relativePath of expectedAssets) {
    assert.equal(existsSync(new URL(relativePath, root)), true, `${relativePath} manque`);
  }
});
