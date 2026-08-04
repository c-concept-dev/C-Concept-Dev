import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

function load(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

test("recovery-route utilise le contrat createLink sans bloquer l'initialisation", () => {
  const context = vm.createContext({ console });
  load(new URL("../src/core/peripheral-registry.js", import.meta.url).pathname, context);
  load(new URL("../src/core/recovery-route-core.js", import.meta.url).pathname, context);
  load(new URL("../src/peripherals/recovery-route-provider.js", import.meta.url).pathname, context);

  const registry = context.JMMJSPeripheralRegistry.createPeripheralRegistry();
  const client = { post: async () => ({ geometry: [[1, 2], [1.1, 2.1]] }) };
  const provider = context.JMMJSRecoveryRouteProvider.createRecoveryRouteProvider({ client });

  assert.equal(provider.kind, "recovery");
  assert.equal(typeof provider.createLink, "function");
  assert.doesNotThrow(() => registry.register(provider));
  assert.equal(registry.require("recovery-route"), provider);
});
