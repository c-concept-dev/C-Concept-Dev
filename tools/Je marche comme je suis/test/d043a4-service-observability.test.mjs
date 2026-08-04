import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/core/service-observability-core.js", import.meta.url), "utf8");
const store = new Map();
const storage = { getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k) };
const context = { globalThis: {}, Date, Math, JSON };
vm.runInNewContext(source, context);
const core = context.globalThis.JMMJSServiceObservabilityCore;

test("D-043A.4 conserve un historique technique sans données sensibles", () => {
  const obs = core.createServiceObservability({ storage, now: () => 1000 });
  obs.record({ service:"ORS", operation:"route", ok:false, attempts:3, diagnostic:{ code:"timeout", retryable:true, userMessage:"Délai dépassé", technicalMessage:"coordonnées 1,2 douleur cheville" } });
  const [event] = obs.list();
  assert.equal(event.code, "timeout");
  assert.equal(event.attempts, 3);
  assert.equal(JSON.stringify(event).includes("cheville"), false);
  assert.equal(JSON.stringify(event).includes("1,2"), false);
});

test("D-043A.4 limite, résume et efface l’historique", () => {
  const obs = core.createServiceObservability({ storage:null, now:()=>2000 });
  for (let i=0;i<25;i++) obs.record({ service:"Geoapify", operation:"poi", ok:i%2===0, diagnostic:{code:"temporary", userMessage:"Indisponible"} });
  assert.equal(obs.list().length, 20);
  assert.ok(obs.summary().failureCount > 0);
  obs.clear();
  assert.equal(obs.list().length, 0);
});
