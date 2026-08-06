import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

function load(path, globalName) {
  const context = { globalThis: {} };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL(path, import.meta.url), "utf8"), context);
  return context[globalName];
}

test("service resilience distinguishes an ORS preference no-result from an outage", () => {
  const core = load("../src/core/service-resilience-core.js", "JMMJSServiceResilienceCore");
  const error = new Error("Aucune boucle avec ces préférences");
  error.code = "ors-preferences-no-result";
  const result = core.classifyServiceError(error, "OpenRouteService");
  assert.equal(result.code, "preferences-no-result");
  assert.equal(result.retryable, false);
});

test("service worker falls back to the shell only for navigations", () => {
  const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(source, /request\.mode === "navigate"/);
  assert.doesNotMatch(source, /catch\(\(\) => caches\.match\("\.\/je-marche-comme-je-suis-p0\.html"\)\)\)\);/);
});
