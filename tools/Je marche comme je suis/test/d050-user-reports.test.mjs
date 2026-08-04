import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const ctx={globalThis:{}}; vm.createContext(ctx); vm.runInContext(readFileSync(new URL("../src/core/user-reports-core.js", import.meta.url),"utf8"),ctx);
const core=ctx.globalThis.JMMJSUserReportsCore;
test("D-050 expire automatiquement les signalements",()=>{
 const now=Date.UTC(2026,7,4); const old=now-8*86400000;
 assert.equal(core.normalizeReport({category:"mud",coordinates:[1,43],reportedAt:old},{now}),null);
 assert.ok(core.normalizeReport({category:"fallen_tree",coordinates:[1,43],reportedAt:old},{now}));
});
test("D-050 limite les catégories et les distances",()=>{
 const now=Date.now(); const nearest=()=>350;
 assert.equal(core.normalizeReport({category:"unknown",coordinates:[1,43],reportedAt:now},{now}),null);
 assert.equal(core.normalizeReport({category:"mud",coordinates:[1,43],reportedAt:now},{now,nearestRouteDistance:nearest,routeCoords:[[1,43]]}),null);
});
test("D-050 ne présente pas un signalement comme officiel",()=>{
 const report=core.normalizeReport({category:"closed_gate",coordinates:[1,43],reportedAt:Date.now(),confirmations:2},{now:Date.now()});
 assert.match(core.displayStatus(report).authority,/Non vérifié/);
 assert.match(core.warningText(),/ne constitue pas une confirmation officielle/);
});
