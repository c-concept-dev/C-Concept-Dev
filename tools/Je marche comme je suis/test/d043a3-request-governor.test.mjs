import test from "node:test";
import assert from "node:assert/strict";
import { runInThisContext } from "node:vm";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/core/request-governor-core.js", import.meta.url), "utf8");
runInThisContext(source);
const { createRequestGovernor } = globalThis.JMMJSRequestGovernorCore;

test("D-043A.3 limite ORS à 12 requêtes par recherche", () => {
  const governor = createRequestGovernor({ limits: { ors: 12, session: 80 } });
  governor.beginSearch();
  for (let i = 0; i < 12; i += 1) governor.beforeRequest("ors");
  assert.throws(() => governor.beforeRequest("ors"), (error) => error.code === "search-quota");
});

test("D-043A.3 respecte Retry-After et autorise après le délai", () => {
  let time = 1000;
  const governor = createRequestGovernor({ limits: { ors: 12, session: 80 }, now: () => time });
  governor.beginSearch();
  governor.noteFailure("ors", { retryAfterSeconds: 5 });
  assert.throws(() => governor.beforeRequest("ors"), (error) => error.code === "cooldown" && error.retryAfterSeconds === 5);
  time += 5000;
  assert.equal(governor.beforeRequest("ors").used, 1);
});

test("D-043A.3 remet le budget de recherche à zéro sans effacer le budget de session", () => {
  const governor = createRequestGovernor({ limits: { ors: 2, session: 3 } });
  governor.beginSearch();
  governor.beforeRequest("ors");
  governor.beforeRequest("ors");
  governor.beginSearch();
  governor.beforeRequest("ors");
  assert.throws(() => governor.beforeRequest("ors"), (error) => error.code === "session-quota");
});
