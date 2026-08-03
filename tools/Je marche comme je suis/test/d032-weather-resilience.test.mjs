import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/peripherals/open-meteo-provider.js", import.meta.url),
  "utf8",
);

const context = {
  globalThis: null,
  URLSearchParams,
  Date,
  setTimeout,
  Promise,
};
context.globalThis = context;
vm.runInNewContext(source, context);

let calls = 0;
const provider =
  context.JMMJSOpenMeteoProvider.createOpenMeteoProvider({
    retryDelays: [0, 0],
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return { ok: false, status: 503 };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          timezone: "Europe/Paris",
          hourly: { time: ["2026-08-03T09:00"] },
        }),
      };
    },
  });

const first = await provider.forecast({
  latitude: 43.65,
  longitude: 1.51,
  hours: 2,
});
assert.equal(calls, 3);
assert.equal(first.cache, "miss");

await provider.forecast({
  latitude: 43.65,
  longitude: 1.51,
  hours: 2,
});
assert.equal(calls, 3);
