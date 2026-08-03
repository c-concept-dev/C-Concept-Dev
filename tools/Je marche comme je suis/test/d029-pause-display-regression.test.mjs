import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("les marqueurs sont restaurés avant chaque rendu", () => {
  assert.ok(app.includes("S.routes = S.routes.map(ensurePauseMarkers);"));
  assert.ok(app.includes("pausePlan: requestedPlan"));
});

test("métrique, titre et liste partagent le même tableau", () => {
  assert.ok(app.includes("pauseMarkers = r.pauseMarkers"));
  assert.ok(app.includes("pauseMarkers.length +"));
  assert.ok(app.includes("list(\n        pauseMarkers,"));
});
