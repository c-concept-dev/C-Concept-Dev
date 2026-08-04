import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const ctx={globalThis:{}}; vm.createContext(ctx); vm.runInContext(readFileSync(new URL("../src/core/official-closures-core.js", import.meta.url),"utf8"),ctx);
const core=ctx.globalThis.JMMJSOfficialClosuresCore;

test("D-051 conserve seulement les avis officiels valides",()=>{
  const now=Date.UTC(2026,7,4);
  const valid=core.normalizeOfficialItem({type:"closure",coordinates:[1,43],source:"Département",publishedAt:now-1000,endsAt:now+86400000},{now});
  assert.ok(valid); assert.equal(valid.official,true);
  assert.equal(core.normalizeOfficialItem({type:"closure",coordinates:[1,43],source:"Département",endsAt:now-1},{now}),null);
  assert.equal(core.normalizeOfficialItem({type:"unknown",coordinates:[1,43],source:"Département"},{now}),null);
});

test("D-051 limite les informations à proximité de la trace",()=>{
  const item={type:"works",coordinates:[1,43],source:"Commune"};
  assert.equal(core.normalizeOfficialItem(item,{nearestRouteDistance:()=>350,routeCoords:[[1,43]]}),null);
  assert.ok(core.normalizeOfficialItem(item,{nearestRouteDistance:()=>80,routeCoords:[[1,43]]}));
});

test("D-051 ne garantit jamais qu'un chemin est ouvert",()=>{
  assert.match(core.absenceText(),/ne garantit pas que le chemin soit ouvert/i);
  assert.match(core.unavailableText(),/reste consultable/i);
});
