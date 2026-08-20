import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/core/activity-today-core.js", import.meta.url), "utf8");
function loadCore() { const context={globalThis:{}}; vm.createContext(context); vm.runInContext(source,context); return context.globalThis.JMMJSActivityTodayCore; }
function storage(){ const m=new Map(); return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))}; }

test("D103C2 normalise et exige les quatre repères du jour",()=>{
  const c=loadCore();
  assert.equal(c.isComplete({energy:"same",walkingEase:"easy",discomfort:"light",availableTime:"1_to_2h"}),true);
  assert.equal(c.isComplete({energy:"same"}),false);
  assert.equal(c.normalizeToday({energy:"invented"}).energy,null);
});

test("D103C2 relie le functionalGoal à l'intention sans l'imposer",()=>{
  const c=loadCore();
  assert.equal(c.suggestedGoal("gentle_return"),"recover");
  assert.equal(c.suggestedGoal("maintain"),"preserve");
  assert.equal(c.suggestedGoal("progress"),"evolve");
  assert.equal(c.suggestedGoal("leisure"),null);
});

test("D103C2 persiste localement un état complet",()=>{
  const c=loadCore(); const s=storage();
  assert.equal(c.saveToday(s,{energy:"same",walkingEase:"easy",discomfort:"moderate",availableTime:"1_to_2h",functionalGoal:"preserve"}),true);
  const loaded=c.loadToday(s);
  assert.equal(loaded.energy,"same"); assert.equal(loaded.functionalGoal,"preserve");
});
