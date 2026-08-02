import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/pause-planner-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSPausePlannerCore;

const flat = [
  [1.0, 43.0, 100],
  [1.005, 43.0, 100],
  [1.01, 43.0, 100],
  [1.015, 43.0, 100],
];

test("positionne une pause à mi-parcours", () => {
  const result = core.planPauses({ coords: flat, walkingMinutes: 30, pausePlan: "À mi-parcours" });
  assert.equal(result.status, "respected");
  assert.equal(result.markers.length, 1);
});

test("positionne les pauses toutes les 15 minutes", () => {
  const result = core.planPauses({ coords: flat, walkingMinutes: 50, pausePlan: "Toutes les 15 minutes" });
  assert.equal(result.markers.length, 3);
});

test("un banc absent viole la demande", () => {
  const result = core.planPauses({ coords: flat, walkingMinutes: 30, pausePlan: "Avec un banc", pois: [] });
  assert.equal(result.status, "violated");
});

test("un banc documenté positionne la pause", () => {
  const result = core.planPauses({
    coords: flat,
    walkingMinutes: 30,
    pausePlan: "Avec un banc",
    pois: [{ id: "b1", type: "Banc", name: "Banc public", lon: 1.008, lat: 43.0001 }],
  });
  assert.equal(result.status, "respected");
  assert.equal(result.markers[0].poiName, "Banc public");
});

test("l'ombre reste invérifiable sans source", () => {
  const result = core.planPauses({ coords: flat, walkingMinutes: 30, pausePlan: "Avec de l’ombre" });
  assert.equal(result.status, "unknown");
});

test("une altitude insuffisante empêche de positionner après montée", () => {
  const coords = flat.map(([lon, lat]) => [lon, lat]);
  const result = core.planPauses({ coords, walkingMinutes: 30, pausePlan: "Après chaque montée" });
  assert.equal(result.status, "unknown");
});

test("une montée significative produit une pause à son terme", () => {
  const coords = [
    [1.0, 43.0, 100],
    [1.002, 43.0, 104],
    [1.004, 43.0, 109],
    [1.006, 43.0, 113],
    [1.008, 43.0, 113],
  ];
  const result = core.planPauses({ coords, walkingMinutes: 30, pausePlan: "Après chaque montée" });
  assert.equal(result.status, "respected");
  assert.equal(result.markers.length, 1);
});

test("une pause invérifiable dégrade compatible en à vérifier", () => {
  const planned = core.planPauses({ coords: flat, walkingMinutes: 30, pausePlan: "Avec un point de vue" });
  const route = core.applyPausePlan(
    { checks: [], proposalStatus: "compatible", canNavigate: true, unknowns: [] },
    "Avec un point de vue",
    planned,
  );
  assert.equal(route.proposalStatus, "verify");
  assert.equal(route.canNavigate, false);
});
