import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/core/export-core.js", import.meta.url),
  "utf8",
);
const context = { globalThis: null, Date };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSExportCore;

const route = {
  name: "Boucle & test",
  proposalStatus: "compatible",
  canNavigate: true,
  coords: [
    [1.0, 43.0, 100],
    [1.01, 43.0, 110],
    [1.01, 43.01, 120],
    [1.0, 43.0, 100],
  ],
  pauseMarkers: [
    { lat: 43.0, lon: 1.005, label: "Pause 1", minute: 15 },
  ],
  shortcuts: [],
  fallbacks: [],
};

const audit = core.auditRouteExport(route);
assert.equal(audit.exactEligible, true);
assert.equal(audit.coordinateCount, route.coords.length);

const gpx = core.buildExactGpx(route);
assert.ok(gpx.includes("<name>Boucle &amp; test</name>"));
assert.ok(gpx.includes('<wpt lat="43" lon="1.005">'));
assert.equal((gpx.match(/<trkpt /g) || []).length, route.coords.length);
assert.ok(
  gpx.indexOf('lat="43" lon="1"') <
    gpx.indexOf('lat="43" lon="1.01"'),
);

assert.throws(
  () =>
    core.buildExactGpx({
      ...route,
      coords: [[1, 43], [1.1, 43]],
    }),
  /revient pas suffisamment près/,
);

const reservedGpx = core.buildExactGpx({
  ...route,
  proposalStatus: "verify",
  canNavigate: false,
});
assert.ok(reservedGpx.includes("<trk>"));

const links = core.buildMapLinks(route);
assert.equal(links.simplified, true);
assert.ok(links.google.includes("travelmode=walking"));
assert.ok(links.apple.includes("dirflg=w"));

const jsonExport = core.buildJsonExport(route);
assert.equal(jsonExport.schema, "jmmjs-route-export-v1");
assert.equal(jsonExport.exportCertification.exactEligible, true);
