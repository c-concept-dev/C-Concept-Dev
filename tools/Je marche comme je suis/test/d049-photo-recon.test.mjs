import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const ctx={globalThis:{}}; vm.createContext(ctx); vm.runInContext(readFileSync(new URL("../src/core/photo-recon-core.js", import.meta.url),"utf8"),ctx);
const core=ctx.globalThis.JMMJSPhotoReconCore;
const nearest=(c)=>c[0]*100;
test("D-049 limite les photos à 120 m et conserve la source",()=>{
 const out=core.chooseReconPhotos({routeCoords:[[0,0]],nearestRouteDistance:nearest,streetView:[{id:"sv",coordinates:[0.5,0]}],mapillary:[{id:"mp",geometry:{coordinates:[2,0]}}]});
 assert.equal(out.length,1); assert.equal(out[0].source,"Google Street View");
});
test("D-049 affiche l’avertissement obligatoire",()=>{assert.match(core.warningText(),/ne garantit pas l’état actuel/);});
