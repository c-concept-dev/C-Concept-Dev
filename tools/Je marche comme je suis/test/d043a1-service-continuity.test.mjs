import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const context = { globalThis: null, Object };
context.globalThis = context;
vm.runInNewContext(
  readFileSync(new URL("../src/core/service-continuity-core.js", import.meta.url), "utf8"),
  context,
);
const {
  buildBlockingFailure,
  buildSecondaryState,
  summarizeServiceStates,
} = context.JMMJSServiceContinuityCore;

const timeout = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "timeout", retryable: true },
});
assert.equal(timeout.title, "La recherche a pris trop de temps");
assert.equal(timeout.retryable, true);
assert.equal(timeout.actions[0].id, "retry");
assert.equal(timeout.role.level, "A");

const noRoute = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "no-result", retryable: false },
});
assert.equal(noRoute.state, "no-result");
assert.equal(noRoute.actions.some((action) => action.id === "retry"), false);
assert.equal(noRoute.actions.some((action) => action.id === "change-start"), true);

const optionalPoi = buildSecondaryState({
  service: "geo",
  diagnostic: { code: "temporary" },
  imperative: false,
});
assert.equal(optionalPoi.status, "unavailable");
assert.equal(optionalPoi.blocksValidation, false);

const requiredPoi = buildSecondaryState({
  service: "geo",
  diagnostic: { code: "temporary" },
  imperative: true,
});
assert.equal(requiredPoi.status, "unknown");
assert.equal(requiredPoi.blocksValidation, true);

const staleWeather = buildSecondaryState({
  service: "weather",
  imperative: true,
  staleAt: "4 août 2026 à 08 h 15",
});
assert.equal(staleWeather.status, "unknown");
assert.match(staleWeather.message, /Dernière mise à jour/);

const summary = summarizeServiceStates([optionalPoi, requiredPoi]);
assert.equal(summary.blocksValidation, true);
assert.match(summary.conclusion, /mode strict/);

for (const code of ["no-routable-start", "no-route", "preferences-too-restrictive"]) {
  const failure = buildBlockingFailure({
    service: "ors",
    diagnostic: { code, retryable: false },
  });
  assert.equal(
    failure.actions.some((action) => action.id === "change-start"),
    true,
    `${code} devrait proposer de changer de départ`,
  );
  assert.notEqual(failure.title, "La recherche d’itinéraires n’a pas abouti");
}
