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

function hasArea(result, area) {
  return result.bodyAreas.includes(area);
}
function hasTrigger(result, trigger) {
  return result.triggers.some((t) => t.trigger === trigger);
}
function painPolarity(result, polarity) {
  return result.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === polarity);
}

test("D102G3 négation locale : cheville gauche active, genou droit nié", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Ma cheville gauche me gêne, mais le genou droit ne me fait pas mal.");
  assert.equal(hasArea(r, "Chevilles"), true);
  assert.equal(hasArea(r, "Genoux"), false);
  assert.equal(r.side, "Gauche");
  assert.equal(r.uncertain.some((u) => u.includes("côté ambigu")), false);
});

test("D102G3 négation locale : genou gauche nié, hanche gauche active", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Je n'ai pas mal au genou gauche, c'est la hanche gauche qui me gêne.");
  assert.equal(hasArea(r, "Genoux"), false);
  assert.equal(hasArea(r, "Hanches"), true);
  assert.equal(r.side, "Gauche");
});

test("D102G3 négation temporelle : douleur d'hier ne crée pas de zone active aujourd'hui", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Le dos ne me gêne pas aujourd'hui, mais hier il était très douloureux.");
  assert.equal(hasArea(r, "Dos"), false);
  assert.equal(painPolarity(r, "present"), false);
});

test("D102G3 antécédent + négation actuelle : opération passée ne crée pas une gêne active", () => {
  const core = loadCore();
  const r = core.interpretFreeText("J'ai été opéré du genou droit il y a deux ans, mais aujourd'hui il ne me gêne pas du tout.");
  assert.equal(hasArea(r, "Genoux"), false);
  assert.equal(r.side, null);
});

test("D102G3 terrain contrastif : 'seulement en descente' reste positif malgré 'aucun souci' sur le plat", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Sur le plat aucun souci, c'est seulement en descente que j'ai mal.");
  assert.equal(hasTrigger(r, "Descente"), true);
  assert.equal(painPolarity(r, "present"), true);
  assert.equal(painPolarity(r, "absent"), false);
});

test("D102G3 terrain sujet grammatical : 'les descentes me font mal' est extrait", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Je marche bien sur le plat mais les descentes me font mal au genou droit.");
  assert.equal(hasTrigger(r, "Descente"), true);
  assert.equal(hasArea(r, "Genoux"), true);
  assert.equal(r.side, "Droit");
});

test("D102G3 terrain irrégulier sujet grammatical est extrait sans zone inventée", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Les chemins irréguliers me fatiguent vite, sans douleur particulière.");
  assert.equal(hasTrigger(r, "Terrain irrégulier"), true);
  assert.equal(r.bodyAreas.length, 0);
});

test("D102G3 latéralité locale : épaule droite n'attribue jamais 'droit' au cou", () => {
  const core = loadCore();
  const r = core.interpretFreeText("J'ai une gêne à l'épaule droite et le cou tire quand je marche longtemps.");
  assert.deepEqual([...r.bodyAreas].sort(), ["Cou", "Épaules"].sort());
  assert.equal(r.confidence.areaSides["Épaules"], "Droit");
  assert.equal(Object.prototype.hasOwnProperty.call(r.confidence.areaSides, "Cou"), false);
  assert.equal(r.side, null);
});

test("D102G3 conflit symétrique : texte douloureux + curseur 0", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Mon genou gauche me fait mal en descente.");
  const issues = core.detectCoherenceIssues(r, { painIntensity: 0, limits: [] });
  assert.ok(issues.some((i) => i.type === "contradiction" && i.field === "painIntensity"));
});

test("D102G3 conflit symétrique : texte sans douleur + curseur 5", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Pas mal aujourd'hui, ça va plutôt bien.");
  const issues = core.detectCoherenceIssues(r, { painIntensity: 5, limits: [] });
  assert.ok(issues.some((i) => i.type === "contradiction" && i.field === "painIntensity"));
});

test("D102G3 aucun faux conflit : texte sans douleur + curseur 0", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Je n'ai pas vraiment mal aujourd'hui.");
  const issues = core.detectCoherenceIssues(r, { painIntensity: 0, limits: [] });
  assert.equal(issues.filter((i) => i.field === "painIntensity").length, 0);
});

test("D102G3 tendance : amélioration par rapport à l'habitude", () => {
  const core = loadCore();
  const r = core.interpretFreeText("D'habitude mon genou gauche me gêne un peu, mais aujourd'hui ça va mieux.");
  assert.equal(r.confidence.areaStatus.Genoux, "better");
});

test("D102G3 tendance : aggravation par rapport à l'habitude", () => {
  const core = loadCore();
  const r = core.interpretFreeText("J'ai souvent mal à la hanche droite, mais aujourd'hui c'est nettement plus fort que d'habitude.");
  assert.equal(r.confidence.areaStatus.Hanches, "worse");
});

test("D102G3 durée : trois quarts d'heure devient environ 45 minutes", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Ça va au début, puis après trois quarts d'heure les hanches deviennent douloureuses.");
  assert.equal(r.temporal.durations[0].approxMinutes, 45);
  assert.equal(r.temporal.durations[0].precision, "approximate");
});

test("D102G3 anti-surapprentissage : genou droit explicitement non gênant aujourd'hui", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Mon genou droit ne me gêne absolument pas aujourd'hui.");
  assert.equal(hasArea(r, "Genoux"), false);
});

test("D102G3 anti-surapprentissage : hanche droite bien tolérée, gauche active", () => {
  const core = loadCore();
  const r = core.interpretFreeText("La hanche droite va bien, c'est la gauche qui tire.");
  // La seconde clause n'énonce pas à nouveau la zone : le système doit rester prudent,
  // surtout ne pas fabriquer une hanche droite active.
  assert.equal(r.confidence.areaSides.Hanches === "Droit" && hasArea(r, "Hanches"), false);
});

test("D102G3 anti-surapprentissage : descente en tête de phrase", () => {
  const core = loadCore();
  const r = core.interpretFreeText("En descente seulement, mon genou commence à tirer.");
  assert.equal(hasTrigger(r, "Descente"), true);
});

test("D102G3 anti-surapprentissage : chemin irrégulier en proposition temporelle", () => {
  const core = loadCore();
  const r = core.interpretFreeText("Quand le chemin devient irrégulier je fatigue plus vite.");
  assert.equal(hasTrigger(r, "Terrain irrégulier"), true);
});

test("D102G3 non-régression multi-zones/multi-côtés", () => {
  const core = loadCore();
  const r = core.interpretFreeText("J'ai mal au genou gauche et à la hanche droite.");
  assert.deepEqual([...r.bodyAreas].sort(), ["Genoux", "Hanches"].sort());
  assert.equal(r.confidence.areaSides.Genoux, "Gauche");
  assert.equal(r.confidence.areaSides.Hanches, "Droit");
  assert.equal(r.uncertain.some((u) => u.includes("côté ambigu")), false);
});

test("D102G3 non-régression montée/descente multi-zones", () => {
  const core = loadCore();
  const r = core.interpretFreeText("La cheville droite tire en montée et mon genou gauche en descente.");
  assert.equal(hasTrigger(r, "Montée"), true);
  assert.equal(hasTrigger(r, "Descente"), true);
  assert.equal(r.confidence.areaSides.Chevilles, "Droit");
  assert.equal(r.confidence.areaSides.Genoux, "Gauche");
});

test("D102G3 UI : le texte libre reste visible à douleur 0 et le curseur relance l'analyse de cohérence", () => {
  const visibilityFn = APP_SOURCE.match(/function syncPainDetailVisibility\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(visibilityFn, /wrap\.hidden = false/);
  assert.match(APP_SOURCE, /\$\("#pain"\)\?\.addEventListener\("input", \(\) => \{[\s\S]*?syncPainInterpretation\(\)/);
});
