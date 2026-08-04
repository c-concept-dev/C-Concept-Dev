import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const load = (path, context) => {
  vm.runInContext(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), context, {
    filename: path,
  });
};

test("le module limitations expose le contrat utilisé par app.js", () => {
  const context = vm.createContext({
    globalThis: {},
    structuredClone: global.structuredClone,
  });
  context.globalThis = context;
  load("src/core/limitations-core.js", context);

  assert.equal(
    typeof context.JMMJSLimitationsCore.mergeStructuredLimitationIntoRequest,
    "function",
  );
  assert.equal(
    context.JMMJSLimitationsCore.mergeStructuredLimitationIntoRequest,
    context.JMMJSLimitationsCore.prepareRequestWithFunctionalLimitations,
  );
});
