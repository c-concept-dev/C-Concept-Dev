import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/mobile-safety-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null, encodeURIComponent };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSMobileSafetyCore;

assert.equal(
  core.assessRouteSet(
    [{ total: 42, canNavigate: true }, { total: 47, canNavigate: true }, { total: 50, canNavigate: true }],
    45,
  ).insufficient,
  false,
);

const insufficient = core.assessRouteSet(
  [{ total: 12, canNavigate: false, proposalStatus: "verify" }],
  35,
);
assert.equal(insufficient.insufficient, true);
assert.equal(insufficient.bestMinutes, 12);

const links = core.buildReturnLinks({ coords: [[1.89443, 43.78979]] });
assert.ok(links.google.includes("destination="));
assert.ok(links.apple.includes("daddr="));
assert.equal(links.coordinates, "43.789790,1.894430");
