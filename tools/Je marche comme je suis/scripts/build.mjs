import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  readFileSync(resolve(root, relativePath), "utf8").trim();

const bundles = {
  CORE: [
    "src/core/route-engine-core.js",
    "src/core/gpx-core.js",
    "src/core/elevation-profile-core.js",
    "src/core/terrain-evidence-core.js",
    "src/core/services-core.js",
    "src/core/weather-core.js",
    "src/core/multi-point-weather-core.js",
    "src/core/alert-synthesis-core.js",
    "src/core/export-core.js",
    "src/core/terrain-proof-core.js",
    "src/core/gpx-safety-core.js",
    "src/core/pause-planner-core.js",
    "src/core/fallback-core.js",
    "src/core/privacy-core.js",
    "src/core/limitations-core.js",
    "src/core/peripheral-registry.js",
    "src/peripherals/service-client.js",
    "src/peripherals/ors-provider.js",
    "src/peripherals/geoapify-provider.js",
    "src/peripherals/open-meteo-provider.js",
  ],
  APP: ["src/app.js"],
};

let html = read("je-marche-comme-je-suis.template.html");
for (const [name, files] of Object.entries(bundles)) {
  const marker = `<!-- JMMJS_BUNDLE:${name} -->`;
  const body = files.map(read).join("\n");
  if (!html.includes(marker))
    throw new Error(`Marqueur ${marker} introuvable.`);
  const bundledScript = `<script data-jmmjs-bundle="${name.toLowerCase()}">\n${body}\n</script>`;
  // A replacement callback preserves literal `$`, `$$`, `$&`, etc. in JavaScript.
  html = html.replace(marker, () => bundledScript);
}

writeFileSync(resolve(root, "je-marche-comme-je-suis-p0.html"), `${html}\n`);
console.log("HTML autonome reconstruit depuis les modules source.");
