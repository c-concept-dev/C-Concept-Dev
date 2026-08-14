import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("l’arrêt du guidage absorbe le rejet asynchrone de exitFullscreen", () => {
  const stopNavigation = app.match(
    /function stopNavigation\(\) \{([\s\S]*?)\n\s*\}\n\s*\$\("#navFollow"\)/,
  )?.[1];
  assert.ok(stopNavigation, "stopNavigation doit exister");
  assert.match(
    stopNavigation,
    /document\.exitFullscreen\?\.\(\)\.catch\(\(\) => \{\}\)/,
  );
