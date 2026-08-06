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
  assert.equal(
    failure.actions.some((action) => action.id === "fallback-5km"),
    true,
    `${code} devrait proposer une recherche à 5 km`,
  );
  assert.equal(
    failure.actions.some((action) => action.id === "fallback-10km"),
    true,
    `${code} devrait proposer une recherche à 10 km`,
  );
}

const genericNoResult = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "no-result", retryable: false },
});
assert.equal(
  genericNoResult.actions.some((action) => action.id === "fallback-5km"),
  false,
  "no-result générique ne devrait pas proposer de départs alternatifs sans distinction plus précise",
);

const providerDown = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "provider-unavailable", retryable: true },
});
assert.equal(
  providerDown.actions.some((action) => action.id === "fallback-5km"),
  false,
  "une vraie panne fournisseur ne devrait jamais proposer de départs alternatifs",
);

const relaxedBoth = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "no-route", retryable: false },
  relaxable: { wide: true, regular: true },
});
assert.equal(relaxedBoth.actions.some((a) => a.id === "relax-wide"), true);
assert.equal(relaxedBoth.actions.some((a) => a.id === "relax-regular"), true);

const relaxedNone = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "no-route", retryable: false },
});
assert.equal(relaxedNone.actions.some((a) => a.id === "relax-wide"), false);
assert.equal(relaxedNone.actions.some((a) => a.id === "relax-regular"), false);

const providerDownWithRelaxable = buildBlockingFailure({
  service: "ors",
  diagnostic: { code: "provider-unavailable", retryable: true },
  relaxable: { wide: true, regular: true },
});
assert.equal(
  providerDownWithRelaxable.actions.some((a) => a.id === "relax-wide" || a.id === "relax-regular"),
  false,
  "aucun assouplissement ne doit être proposé sur une vraie panne, même si relaxable est fourni par erreur",
);
