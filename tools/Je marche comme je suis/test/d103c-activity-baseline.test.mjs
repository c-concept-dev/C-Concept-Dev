import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve } from "node:path";

function loadCore() {
  const code = readFileSync(resolve("src/core/activity-baseline-core.js"), "utf8");
  const context = { structuredClone, Date };
  context.globalThis = context;
  vm.runInNewContext(code, context);
  return context.JMMJSActivityBaselineCore;
}

function storage() {
  const map = new Map();
  return { getItem:k=>map.has(k)?map.get(k):null, setItem:(k,v)=>map.set(k,String(v)) };
}

test("seules les intentions longitudinales demandent une baseline", () => {
  const c = loadCore();
  assert.equal(c.intentNeedsBaseline("leisure"), false);
  assert.equal(c.intentNeedsBaseline("gentle_return"), true);
  assert.equal(c.intentNeedsBaseline("maintain"), true);
  assert.equal(c.intentNeedsBaseline("progress"), true);
});

test("la baseline courte exige les quatre repères", () => {
  const c = loadCore();
  assert.equal(c.isComplete({energy:"medium"}), false);
  assert.equal(c.isComplete({energy:"medium",walkingEase:"rather_easy",duration:"1_to_2h",pauses:"sometimes"}), true);
});

test("la baseline est persistée localement et normalisée", () => {
  const c = loadCore(); const s = storage();
  assert.equal(c.saveBaseline(s,{energy:"medium",walkingEase:"rather_easy",duration:"1_to_2h",pauses:"sometimes"}), true);
  assert.equal(c.loadBaseline(s).energy,"medium");
  assert.equal(c.loadBaseline(s).walkingEase,"rather_easy");
});
