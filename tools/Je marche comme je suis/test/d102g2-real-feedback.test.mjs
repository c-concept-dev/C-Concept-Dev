import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadCore() {
  const source = readFileSync(new URL("../src/core/free-text-interpretation-core.js", import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSFreeTextInterpretationCore;
}

const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D102G2 baseline: pas pire que d'habitude est distingué d'une gêne active du jour", () => {
  const core = loadCore();
  const c = core.interpretFreeText("J'ai toujours un peu mal au dos, mais aujourd'hui ce n'est pas pire que d'habitude.");
  const dos = c.areaSides.find((p) => p.area === "Dos");
  assert.equal(dos?.baseline, "usual");
  assert.equal(c.side, null);
});

test("D102G2 baseline: gêne chronique sans lien avec aujourd'hui est marquée usual", () => {
  const core = loadCore();
  const c = core.interpretFreeText("J'ai une gêne chronique au genou, sans lien avec aujourd'hui en particulier.");
  assert.equal(c.areaSides.find((p) => p.area === "Genoux")?.baseline, "usual");
});

test("D102G2 baseline: tout va bien maintenant ne transforme pas le côté en préremplissage actif", () => {
  const core = loadCore();
  const c = core.interpretFreeText("Genou droit opéré l'an dernier, tout va bien maintenant sauf les jours de pluie.");
  const genou = c.areaSides.find((p) => p.area === "Genoux");
  assert.equal(genou?.side, "Droit");
  assert.equal(genou?.baseline, "usual");
  assert.equal(c.side, null, "le côté reste descriptif et ne doit pas alimenter une limitation active");
});

test("D102G2 douleur: 'je n'ai pas vraiment mal' est une absence et ne crée pas de conflit avec pain=0", () => {
  const core = loadCore();
  const c = core.interpretFreeText("Je n'ai pas vraiment mal aujourd'hui.");
  assert.ok(c.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === "absent"));
  assert.equal(c.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === "present"), false);
  const issues = core.detectCoherenceIssues(c, { painIntensity: 0, limits: [] });
  assert.equal(issues.filter((i) => i.field === "painIntensity").length, 0);
});

test("D102G2 douleur: 'Pas mal aujourd'hui, ça va plutôt bien' nie la douleur dans ce contexte et contredit pain=5", () => {
  const core = loadCore();
  const c = core.interpretFreeText("Pas mal aujourd'hui, ça va plutôt bien.");
  assert.ok(c.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === "absent"));
  const issues = core.detectCoherenceIssues(c, { painIntensity: 5, limits: [] });
  assert.ok(issues.some((i) => i.type === "contradiction" && i.field === "painIntensity"));
});

test("D102G2 protège D102G1: 'sur le plat aucun souci' n'est toujours pas une absence globale de douleur", () => {
  const core = loadCore();
  const c = core.interpretFreeText("Sur le plat aucun souci, par contre quand ça descend je commence à avoir mal.");
  const pain = c.triggers.filter((t) => t.trigger === "pain-qualifier");
  assert.equal(pain.some((t) => t.polarity === "absent"), false);
  assert.equal(pain.some((t) => t.polarity === "present"), true);
});

test("D102G2 vocabulaire: cou/cervical et épaule sont reconnus avec côté quand présent", () => {
  const core = loadCore();
  const cou = core.interpretFreeText("Le cou tire aujourd'hui.");
  assert.ok(cou.bodyAreas.includes("Cou"));
  const cervical = core.interpretFreeText("J'ai une gêne cervicale.");
  assert.ok(cervical.bodyAreas.includes("Cou"));
  const epaule = core.interpretFreeText("Mon épaule droite me gêne.");
  assert.ok(epaule.bodyAreas.includes("Épaules"));
  assert.equal(epaule.areaSides.find((p) => p.area === "Épaules")?.side, "Droit");
});

test("D102G2 UX: une zone baseline est affichée explicitement comme habituelle et non aggravée", () => {
  assert.match(APP_SOURCE, /habituel, non aggravé aujourd’hui/);
});
