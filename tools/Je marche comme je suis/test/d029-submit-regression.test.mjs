import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("le provider Open-Meteo déclare id et kind", () => {
  const source = readFileSync(
    new URL("../src/peripherals/open-meteo-provider.js", import.meta.url),
    "utf8",
  );
  const context = {
    globalThis: null,
    fetch: async () => ({ ok: true, json: async () => ({ hourly: { time: [] } }) }),
    URLSearchParams,
    Date,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const provider =
    context.JMMJSOpenMeteoProvider.createOpenMeteoProvider({
      fetchImpl: context.fetch,
    });
  assert.equal(provider.id, "open-meteo");
  assert.equal(provider.kind, "weather");
});

test("le formulaire bloque la soumission HTML native", () => {
  const html = readFileSync(
    new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
    "utf8",
  );
  assert.match(
    html,
    /<form class="panel" id="form" novalidate onsubmit="return false">/,
  );
});

test("l'application installe une protection submit précoce", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(
    app,
    /formElement\.addEventListener\("submit", \(event\) => event\.preventDefault\(\)\)/,
  );
});


test("le registre accepte le type weather avec forecast", () => {
  const source = readFileSync(
    new URL("../src/core/peripheral-registry.js", import.meta.url),
    "utf8",
  );
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const registry = context.JMMJSPeripheralRegistry.createPeripheralRegistry();
  assert.doesNotThrow(() =>
    registry.register({
      id: "weather-test",
      kind: "weather",
      forecast() {},
    }),
  );
  assert.equal(registry.has("weather-test"), true);
});

test("le contrat weather exige forecast", () => {
  const source = readFileSync(
    new URL("../src/core/peripheral-registry.js", import.meta.url),
    "utf8",
  );
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const registry = context.JMMJSPeripheralRegistry.createPeripheralRegistry();
  assert.throws(
    () => registry.register({ id: "weather-broken", kind: "weather" }),
    /doit implémenter forecast/,
  );
});
