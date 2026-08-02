import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const context = { console, globalThis: null, structuredClone };
context.globalThis = context;
for (const path of [
  "src/core/limitations-core.js",
  "src/core/route-engine-core.js",
])
  vm.runInNewContext(readFileSync(new URL(path, root), "utf8"), context, {
    filename: path,
  });

const core = context.JMMJSLimitationsCore;
const routeCore = context.JMMJSRouteEngineCore;

function baseRequest() {
  return {
    person: { paceKmh: 4.2 },
    terrain: [],
    effort: {
      maxAscentSlopePercent: null,
      maxDescentSlopePercent: null,
    },
    options: { shortcuts: false },
    hardConstraints: {},
    time: {
      availableMinutes: 60,
      safetyMarginMinutes: 10,
      includes: "walk_breaks",
    },
    equipment: [],
    limitations: [],
    pausePlan: "Aucune pause programmée",
    footwear: "Baskets classiques",
  };
}

function confirmed(trigger, consequence, extra = {}) {
  return { trigger, consequence, confirmed: true, ...extra };
}

test("ne déduit aucune conséquence fonctionnelle sans confirmation", () => {
  const request = baseRequest();
  request.functionalLimitation = {
    trigger: "Descente",
    consequence: "Éviter",
    confirmed: false,
  };
  const result = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(result.effort.maxDescentSlopePercent, null);
  assert.equal(result.derivedFunctionalRules.length, 0);
  assert.match(
    core.validateFunctionalLimitation(request.functionalLimitation).join(" "),
    /Confirmez explicitement/,
  );
});

test("terrain irrégulier à éviter exige un terrain régulier et l'inconnu reste bloquant", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed(
    "Terrain irrégulier",
    "Éviter",
  );
  const prepared = core.prepareRequestWithFunctionalLimitations(request);
  assert.ok(prepared.terrain.includes("Terrain régulier"));
  const compiled = routeCore.compileConstraints(prepared);
  const audit = routeCore.auditRoute(
    {
      totalMinutes: 30,
      startEndDistanceMeters: 0,
      surfaces: [{ id: 1, percent: 100 }],
      regularitySafe: undefined,
      directionsCompared: false,
    },
    compiled,
  );
  assert.equal(
    audit.checks.find((item) => item.id === "functional-regularity").status,
    "unknown",
  );
  assert.equal(audit.admissible, false);
});

test("descente à éviter applique 4 % seulement sans seuil explicite", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed("Descente", "Éviter");
  const prudent = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(prudent.effort.maxDescentSlopePercent, 4);
  assert.equal(
    prudent.derivedFunctionalRules[0].thresholdOrigin,
    "prudent-default",
  );

  request.effort.maxDescentSlopePercent = 3;
  const preserved = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(preserved.effort.maxDescentSlopePercent, 3);
  assert.equal(preserved.derivedFunctionalRules[0].thresholdOrigin, "user");
});

test("prévoir une pause n'invente aucun seuil ni aucun banc", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed("Durée", "Prévoir une pause");
  const unresolved = core.prepareRequestWithFunctionalLimitations(request);
  const unresolvedRule = unresolved.derivedFunctionalRules.find(
    (rule) => rule.id === "functional-pause",
  );
  assert.equal(unresolvedRule.thresholdMinutes, null);
  assert.equal(unresolved.functionalPausePlan, undefined);

  request.functionalLimitation.maxWithoutPauseMinutes = 15;
  const planned = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(planned.functionalPausePlan.intervalMinutes, 15);
  assert.doesNotMatch(JSON.stringify(planned), /banc existe/i);
});

test("un maximum sans pause confirmé crée un plan sans modifier son seuil", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed("Descente", "Limiter", {
    maxWithoutPauseMinutes: 12,
  });
  const prepared = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(prepared.functionalPausePlan.intervalMinutes, 12);
  assert.equal(
    prepared.derivedFunctionalRules.find(
      (rule) => rule.id === "functional-max-without-pause",
    ).thresholdMinutes,
    12,
  );
});

test("prévoir un repli demande une preuve géométrique", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed("Durée", "Prévoir un repli");
  const prepared = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(prepared.options.shortcuts, true);
  assert.equal(prepared.hardConstraints.requireShortcuts, true);
  const compiled = routeCore.compileConstraints(prepared);
  const audit = routeCore.auditRoute(
    {
      totalMinutes: 30,
      startEndDistanceMeters: 0,
      surfaces: [{ id: 1, percent: 100 }],
      shortcuts: undefined,
      directionsCompared: false,
    },
    compiled,
  );
  assert.equal(
    audit.checks.find((item) => item.id === "functional-fallback").status,
    "unknown",
  );
});

test("marche rapide à ralentir réduit l'allure de façon expliquée", () => {
  const request = baseRequest();
  request.functionalLimitation = confirmed("Marche rapide", "Ralentir");
  const prepared = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(prepared.person.paceKmh, 3.4);
  assert.match(prepared.derivedFunctionalRules[0].label, /4\.2 à 3\.4 km\/h/);
});

test("accompagnant et équipement ne relèvent jamais une capacité déclarée", () => {
  const request = baseRequest();
  request.equipment = ["Bâtons"];
  request.functionalLimitation = confirmed("Marche rapide", "Ralentir", {
    helperAvailable: true,
  });
  const withHelp = core.prepareRequestWithFunctionalLimitations(request);
  request.functionalLimitation.helperAvailable = false;
  const withoutHelp = core.prepareRequestWithFunctionalLimitations(request);
  assert.equal(withHelp.person.paceKmh, withoutHelp.person.paceKmh);
  assert.equal(withHelp.person.paceKmh, 3.4);
});

test("la description reste factuelle et sans diagnostic", () => {
  const text = core.describeFunctionalLimitation({
    side: "Droit",
    trigger: "Descente",
    consequence: "Limiter",
    temporality: "Seulement aujourd’hui",
    maxWithoutPauseMinutes: 20,
    helperAvailable: false,
    confirmed: true,
  });
  assert.match(text, /descente/);
  assert.match(text, /20 min maximum sans pause/);
  assert.doesNotMatch(text, /diagnostic|pathologie|maladie/i);
});
