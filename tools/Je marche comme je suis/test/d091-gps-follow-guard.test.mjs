import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("une nouvelle navigation oublie toute position GPS antérieure", () => {
  assert.match(
    app,
    /S\.nav\.positions = \[\];\s*S\.nav\.lastPosition = null;\s*S\.nav\.startedAt/,
  );
});

test("le bouton de suivi refuse un état actif sans position réelle", () => {
  const handler = app.match(
    /\$\("#navFollow"\)\.onclick = \(\) => \{([\s\S]*?)\n\s*\};/,
  )?.[1];
  assert.ok(handler, "le gestionnaire navFollow doit exister");
  assert.match(handler, /if \(!S\.nav\.lastPosition\)/);
  assert.match(handler, /S\.nav\.follow = false/);
  assert.match(handler, /Position indisponible/);
  assert.ok(
    handler.indexOf("if (!S.nav.lastPosition)") <
      handler.indexOf("S.nav.follow = true"),
    "la garde doit précéder l’activation du suivi",
  );
});

test("la première position réelle rend le suivi actif", () => {
  assert.match(
    app,
    /S\.nav\.lastPosition = \{ \.\.\.pos, time: g\.timestamp \};\s*if \(S\.nav\.follow\)\s*\$\("#navFollow"\)\.textContent = "◎ Suivi actif"/,
  );
});

test("une erreur GPS sans position reflète son indisponibilité", () => {
  assert.match(
    app,
    /if \(!S\.nav\.lastPosition\) \{\s*S\.nav\.follow = false;\s*\$\("#navFollow"\)\.textContent = "◎ Position indisponible"/,
  );
});
