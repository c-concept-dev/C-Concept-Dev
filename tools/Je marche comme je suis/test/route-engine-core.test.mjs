import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const htmlPath = new URL("../je-marche-comme-je-suis-p0.html", import.meta.url);
const html = readFileSync(htmlPath, "utf8");
const coreSource = readFileSync(
  new URL("../src/core/route-engine-core.js", import.meta.url),
  "utf8",
);
assert.ok(coreSource, "Le noyau testable doit exister comme module source.");

const context = { console, Date, globalThis: null };
context.globalThis = context;
vm.runInNewContext(coreSource, context, {
  filename: "jmmjs-route-engine-core.js",
});
const { ConstraintRegistry, ChoiceRegistry, compileConstraints, auditRoute } =
  context.JMMJSRouteEngineCore;

function request(overrides = {}) {
  return {
    start: { returnRadius: "0" },
    time: {
      availableMinutes: 60,
      includes: "walk_breaks",
      returnTime: null,
      safetyMarginMinutes: 10,
    },
    person: { paceKmh: 4.2 },
    dailyState: { fitness: 3, fatigue: 2, balanceConfidence: 4 },
    footwear: "Baskets classiques",
    equipment: [],
    limitations: [],
    effort: {
      maxContinuousAscentMinutes: null,
      maxAscentSlopePercent: null,
      maxDescentSlopePercent: null,
      recovery: "",
    },
    terrain: [],
    preferences: [],
    pausePlan: "Aucune pause programmée",
    requiredServices: [],
    hardConstraints: {
      avoidStairs: false,
      avoidExposure: false,
      noSilentCompromise: true,
    },
    options: { shortcuts: true, compareDirections: true },
    ...overrides,
  };
}

test("every questionnaire control has a non-cosmetic registry effect", () => {
  const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0] || "";
  const controlIds = [
    ...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g),
  ].map((match) => match[1]);
  const missing = controlIds.filter((id) => !ConstraintRegistry[id]);
  assert.deepEqual(missing, []);
  for (const id of controlIds) {
    assert.ok(ConstraintRegistry[id].effect);
    assert.notEqual(ConstraintRegistry[id].effect, "cosmetic");
    assert.ok(ConstraintRegistry[id].unknownPolicy);
  }
});

test("the LLM route mode and silent fallback are absent from the active UI flow", () => {
  assert.doesNotMatch(html, /data-mode="llm"/);
  assert.doesNotMatch(html, /id="promptZone"/);
  const directFlow =
    html.match(
      /async function direct\(req\)([\s\S]*?)async function parseGPX/,
    )?.[1] || "";
  assert.doesNotMatch(directFlow, /directIGN\(/);
  assert.match(directFlow, /aucun repli non vérifié/);
});

test("every selectable chip is registered", () => {
  const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0] || "";
  const missing = [];
  for (const group of form.matchAll(
    /<div class="chips group" data-group="([^"]+)">([\s\S]*?)<\/div>/g,
  )) {
    const groupName = group[1];
    for (const button of group[2].matchAll(
      /<button\b[^>]*>([\s\S]*?)<\/button\s*>/g,
    )) {
      const value = button[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!ChoiceRegistry[groupName]?.[value])
        missing.push(`${groupName}:${value}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("margin and planned pauses are deducted before target distance", () => {
  const compiled = compileConstraints(
    request({ pausePlan: "Toutes les 15 minutes" }),
    new Date("2026-08-02T10:00:00"),
  );
  assert.equal(compiled.time.marginMinutes, 10);
  assert.equal(compiled.time.pauseMinutes, 12);
  assert.equal(compiled.time.walkingBudgetMinutes, 38);
  assert.equal(compiled.targetMeters, 2660);
});

test("physical limitations remain stricter than hiking footwear", () => {
  const compiled = compileConstraints(
    request({
      footwear: "Randonnée montantes",
      limitations: ["Genoux", "Descente difficile"],
    }),
  );
  assert.equal(compiled.hard.maxDown, 4);
  assert.deepEqual([...compiled.footwearForbiddenSurfaceIds], [13]);
});

test("wheelchair selects the dedicated ORS profile and enforceable restrictions", () => {
  const compiled = compileConstraints(
    request({ equipment: ["Fauteuil roulant"] }),
  );
  assert.equal(compiled.routing.profile, "wheelchair");
  assert.deepEqual([...compiled.routing.avoidFeatures], ["steps"]);
  assert.equal(compiled.routing.restrictions.minimum_width, 1.2);
  assert.equal(compiled.hard.requireRegular, true);
});

test("an unknown imperative exposure check blocks the route", () => {
  const compiled = compileConstraints(
    request({
      hardConstraints: {
        avoidStairs: false,
        avoidExposure: true,
        noSilentCompromise: true,
      },
    }),
  );
  const audit = auditRoute(
    {
      walkingMinutes: 40,
      totalMinutes: 40,
      startEndDistanceMeters: 0,
      surfaces: [{ id: 3, type: "Asphalte", percent: 100 }],
      maxUpPercent: 2,
      maxDownPercent: 2,
      directionsCompared: true,
    },
    compiled,
  );
  assert.equal(audit.admissible, false);
  assert.equal(
    audit.checks.find((item) => item.id === "exposure").status,
    "unknown",
  );
});

test("a fully evidenced simple loop is admissible", () => {
  const compiled = compileConstraints(request());
  const audit = auditRoute(
    {
      walkingMinutes: 45,
      totalMinutes: 45,
      startEndDistanceMeters: 0,
      stairsMeters: 0,
      surfaces: [{ id: 3, type: "Asphalte", percent: 100 }],
      maxUpPercent: 2,
      maxDownPercent: 2,
      directionsCompared: true,
    },
    compiled,
  );
  assert.equal(audit.admissible, true);
  assert.equal(audit.blocking.length, 0);
});
