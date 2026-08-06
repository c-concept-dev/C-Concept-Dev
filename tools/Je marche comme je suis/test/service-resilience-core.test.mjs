import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/service-resilience-core.js", import.meta.url),
  "utf8",
);
const context = {
  globalThis: null,
  Promise,
  Date,
  setTimeout,
  clearTimeout,
  TypeError,
};
context.globalThis = context;
vm.runInNewContext(source, context);

const {
  classifyServiceError,
  createServiceResilience,
} = context.JMMJSServiceResilienceCore;

assert.equal(
  classifyServiceError({ status: 401, message: "401" }, "ORS").code,
  "authentication",
);
assert.equal(
  classifyServiceError({ status: 429, message: "429" }, "Geoapify").code,
  "quota",
);
assert.equal(
  classifyServiceError({ status: 503, message: "503" }, "Météo").retryable,
  true,
);

assert.equal(
  classifyServiceError({ code: "no-routable-start", message: "x" }, "ORS").code,
  "no-routable-start",
);
assert.equal(
  classifyServiceError({ code: "no-routable-start", message: "x" }, "ORS").retryable,
  false,
);
assert.equal(
  classifyServiceError({ code: "preferences-too-restrictive", message: "x" }, "ORS").code,
  "preferences-too-restrictive",
);
assert.equal(
  classifyServiceError({ code: "no-route", message: "x" }, "ORS").code,
  "no-route",
);
assert.equal(
  classifyServiceError({ code: "provider-unavailable", retryable: true, message: "x" }, "ORS").retryable,
  true,
);
assert.equal(
  classifyServiceError({ code: "provider-unavailable", retryable: false, message: "x" }, "ORS").retryable,
  false,
);
assert.equal(
  classifyServiceError({ code: "invalid-request", message: "x" }, "ORS").code,
  "invalid-request",
);
assert.equal(
  classifyServiceError({ code: "invalid-request", message: "x" }, "ORS").retryable,
  false,
);
assert.deepEqual(
  JSON.parse(JSON.stringify(classifyServiceError(
    { status: 502, message: "Cannot find point 0: 0.0,0.0" },
    "ORS",
  ))),
  {
    code: "no-result",
    status: 502,
    retryable: false,
    userMessage:
      "ORS n’a trouvé aucun itinéraire pédestre exploitable depuis ce point.",
    technicalMessage: "Cannot find point 0: 0.0,0.0",
  },
);

let calls = 0;
const resilience = createServiceResilience({
  retryDelays: [0, 0],
  timeoutMs: 1000,
});
const retried = await resilience.execute({
  service: "ORS",
  key: "route",
  operation: async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("503");
      error.status = 503;
      throw error;
    }
    return { routes: 3 };
  },
});
assert.equal(retried.ok, true);
assert.equal(retried.attempts, 3);
assert.equal(calls, 3);

let sharedCalls = 0;
const sharedOperation = () =>
  resilience.execute({
    service: "Geoapify",
    key: "same",
    operation: async () => {
      sharedCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [1, 2, 3];
    },
  });
const [first, second] = await Promise.all([
  sharedOperation(),
  sharedOperation(),
]);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.equal(sharedCalls, 1);

let cachedCalls = 0;
await resilience.execute({
  service: "Mapillary",
  key: "cache",
  allowCache: true,
  operation: async () => {
    cachedCalls += 1;
    return { ok: true };
  },
});
const cached = await resilience.execute({
  service: "Mapillary",
  key: "cache",
  allowCache: true,
  operation: async () => {
    cachedCalls += 1;
    return { ok: true };
  },
});
assert.equal(cached.cache, "hit");
assert.equal(cachedCalls, 1);
