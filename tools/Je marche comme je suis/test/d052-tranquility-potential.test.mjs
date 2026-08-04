import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const ctx={globalThis:{}}; vm.createContext(ctx); vm.runInContext(readFileSync(new URL("../src/core/tranquility-potential-core.js", import.meta.url),"utf8"),ctx);
const core=ctx.globalThis.JMMJSTranquilityPotentialCore;

test("D-052 classe un potentiel élevé à partir d'indices convergents",()=>{
  const result=core.assessTranquilityPotential({distanceToMajorRoadMeters:700,buildingDensityPerKm2:40,parkingCount:0,commerceCount:0,touristPoiCount:0,environment:"rural"});
  assert.equal(result.level,"high");
  assert.equal(result.status,"estimated");
});

test("D-052 ne prétend pas connaître la fréquentation réelle",()=>{
  const result=core.assessTranquilityPotential({parkingCount:5,commerceCount:6,touristPoiCount:4});
  assert.equal(result.level,"low");
  assert.match(result.warning,/fréquentation réelle n’est pas connue/i);
});

test("D-052 reste non documenté avec trop peu d'indices",()=>{
  const result=core.assessTranquilityPotential({parkingCount:0});
  assert.equal(result.status,"unknown");
  assert.equal(result.score,null);
});
