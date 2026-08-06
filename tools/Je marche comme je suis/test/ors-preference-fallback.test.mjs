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

test("service resilience recognizes the current preferences-too-restrictive contract, not the retired vocabulary", () => {
  const core = load("../src/core/service-resilience-core.js", "JMMJSServiceResilienceCore");
  const current = core.classifyServiceError(
    { code: "preferences-too-restrictive", message: "x" },
    "OpenRouteService",
  );
  assert.equal(current.code, "preferences-too-restrictive");
  assert.equal(current.retryable, false);
  const retired = core.classifyServiceError(
    { code: "ors-preferences-no-result", message: "Aucune boucle avec ces préférences" },
    "OpenRouteService",
  );
  assert.notEqual(retired.code, "preferences-too-restrictive");
  assert.notEqual(retired.code, "preferences-no-result", "le vocabulaire retiré ne doit plus être produit");
});

test("service worker falls back to the shell only for navigations", () => {
  const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(source, /request\.mode === "navigate"/);
  assert.doesNotMatch(source, /catch\(\(\) => caches\.match\("\.\/je-marche-comme-je-suis-p0\.html"\)\)\)\);/);
});
