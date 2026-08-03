import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/gpx-safety-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSGPXSafetyCore;

const valid = core.auditGPXInput({
  fileName: "boucle.gpx",
  fileSize: 1000,
  mimeType: "application/gpx+xml",
  text: '<gpx><trk><trkseg><trkpt lat="43" lon="1"/><trkpt lat="43.1" lon="1.1"/></trkseg></trk></gpx>',
});
assert.equal(valid.accepted, true);
assert.equal(valid.stats.totalGeometryPoints, 2);

const dangerous = core.auditGPXInput({
  fileName: "danger.gpx",
  fileSize: 1000,
  text: '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx><trkpt lat="43" lon="1"/></gpx>',
});
assert.equal(dangerous.accepted, false);
assert.ok(dangerous.errors.some((value) => value.includes("DOCTYPE")));

const wrongExtension = core.auditGPXInput({
  fileName: "trace.xml",
  fileSize: 100,
  text: '<gpx><trkpt lat="43" lon="1"/></gpx>',
});
assert.equal(wrongExtension.accepted, false);

const parsed = core.auditParsedGPX([
  { points: [[1, 43], [1.1, 43.1]] },
  { points: [["x", 43]] },
]);
assert.equal(parsed.accepted, true);
assert.equal(parsed.stats.validCandidateCount, 1);
assert.ok(parsed.warnings.length >= 1);

const invalidParsed = core.auditParsedGPX([
  { points: [["x", "y"]] },
]);
assert.equal(invalidParsed.accepted, false);
