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
    /<form class="panel" id="form" onsubmit="return false">/,
  );
});

test("l'application installe une protection submit précoce", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(
    app,
    /formElement\.addEventListener\("submit", \(event\) => event\.preventDefault\(\)\)/,
  );
});
