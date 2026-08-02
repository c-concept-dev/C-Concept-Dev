import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/elevation-profile-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSElevationProfileCore;
const p = (x, ele) => [1 + x / 10000, 43, ele];

test("mesure une montée et une descente continues", () => {
  const r = core.analyzeElevationProfile([p(0,100),p(20,105),p(40,110),p(60,104)], 3);
  assert.ok(r.maxContinuousAscentMinutes > 0);
  assert.ok(r.maxContinuousDescentMinutes > 0);
});

test("une courte portion plate ne coupe pas la montée", () => {
  const r = core.analyzeElevationProfile([p(0,100),p(20,105),p(23,105),p(43,110)], 3);
  assert.equal(r.ascentSequences.length, 1);
});

test("le bruit vertical sous tolérance ne crée pas de pente", () => {
  const r = core.analyzeElevationProfile([p(0,100),p(20,100.5),p(40,99.8)], 3);
  assert.equal(r.maxUpPercent, 0);
  assert.equal(r.maxDownPercent, 0);
});

test("une vraie interruption sépare deux montées", () => {
  const r = core.analyzeElevationProfile([p(0,100),p(20,105),p(100,105),p(120,110)], 3);
  assert.equal(r.ascentSequences.length, 2);
});

test("la durée varie selon l'allure", () => {
  const slow = core.analyzeElevationProfile([p(0,100),p(50,110)], 2);
  const fast = core.analyzeElevationProfile([p(0,100),p(50,110)], 5);
  assert.ok(slow.maxContinuousAscentMinutes > fast.maxContinuousAscentMinutes);
});

test("récupération suffisante et insuffisante", () => {
  const coords = [p(0,100),p(30,110),p(80,110)];
  assert.equal(core.analyzeElevationProfile(coords, 3, 5).recoverySatisfied, true);
  assert.equal(core.analyzeElevationProfile(coords, 3, 15).recoverySatisfied, false);
});

test("altitude absente rend la récupération inconnue", () => {
  const r = core.analyzeElevationProfile([[1,43],[1.01,43]], 3, 5);
  assert.equal(r.quality, "absent");
  assert.equal(r.recoverySatisfied, null);
});

test("le sens inverse inverse les séquences", () => {
  const coords = [p(0,100),p(50,115),p(80,105)];
  const f = core.analyzeElevationProfile(coords, 3);
  const r = core.analyzeElevationProfile([...coords].reverse(), 3);
  assert.equal(f.maxContinuousAscentDistanceMeters, r.maxContinuousDescentDistanceMeters);
});

test("altitude partielle est explicitement insuffisante", () => {
  const r = core.analyzeElevationProfile([p(0,100),[1.001,43],p(20,105)], 3);
  assert.equal(r.completeEnough, false);
});
