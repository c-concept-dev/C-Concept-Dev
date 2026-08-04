import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");

assert.match(app, /id="googleMapsExportBtn"/);
assert.match(app, /Google Maps approximatif/);
assert.match(app, /Google Maps recalcule l’itinéraire/);
assert.match(app, /const externalMapLinks = mapLinks\(r\)/);
assert.match(app, /Le GPX reste la géométrie de référence/);
assert.match(app, /id="googleMapsExportBtn" target="_blank" rel="noopener"/);
assert.match(template, /\.map-export-warning/);
assert.match(template, /id="navGoogleRoute"/);
assert.match(app, /const navigationMapLinks = mapLinks\(r\)/);
assert.match(app, /Itinéraire pédestre recalculé par Google Maps/);
