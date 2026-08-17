import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSFreeTextInterpretationCore;
}

const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D102E painIntensity=0 + texte indiquant une douleur présente => contradiction explicite (exemple A du plan)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("J’ai vraiment mal aujourd’hui.");
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 0, limits: [] });
  assert.ok(
    issues.some((i) => i.type === "contradiction" && i.field === "painIntensity"),
    "doit signaler la contradiction douleur présente vs curseur à 0",
  );
});

test("D102E painIntensity=6 + texte indiquant une absence de douleur => contradiction explicite (exemple B du plan)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Aujourd’hui presque aucune douleur.");
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 6, limits: [] });
  assert.ok(
    issues.some((i) => i.type === "contradiction" && i.field === "painIntensity"),
  );
});

test("D102E jamais de valeur numérique inventée : la contradiction ne fait que signaler, jamais ne propose un chiffre de remplacement", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("J’ai vraiment mal aujourd’hui.");
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 0, limits: [] });
  for (const issue of issues) {
    assert.doesNotMatch(issue.message, /\d+\/10 recommandé|devrait être|corrigé en/i);
  }
});

test("D102E la polarité 'reduced' (douleur atténuée) n'est jamais confrontée à painIntensity — trop de faux positifs potentiels", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("J’ai un peu mal aujourd’hui.");
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 0, limits: [] });
  assert.equal(issues.filter((i) => i.field === "painIntensity").length, 0);
});

test("D102E négation du texte contre une limite déjà déclarée manuellement => contradiction (exemple C du plan)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Je n’ai pas mal en descente.");
  const issues = core.detectCoherenceIssues(candidate, {
    painIntensity: 0,
    limits: ["Descente difficile"],
  });
  assert.ok(issues.some((i) => i.type === "contradiction" && i.field === "limits"));
});

test("D102E un déclencheur positif confirmé dont la puce est déjà active est un doublon, jamais une contradiction (déjà pris en compte)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Ça tire en descente.");
  const issues = core.detectCoherenceIssues(candidate, {
    painIntensity: 0,
    limits: ["Descente difficile"],
  });
  const limitsIssues = issues.filter((i) => i.field === "limits");
  assert.equal(limitsIssues.length, 1);
  assert.equal(limitsIssues[0].type, "duplicate");
});

test("D102E un déclencheur positif confirmé dont la puce n'est PAS active n'est jamais signalé comme incohérence (information nouvelle, gérée par D102D)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Ça tire en descente.");
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 0, limits: [] });
  assert.equal(issues.filter((i) => i.field === "limits").length, 0);
});

test("D102E aucune incohérence pour un texte totalement neutre, même avec des champs structurés déjà remplis", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Merci pour cette application.");
  const issues = core.detectCoherenceIssues(candidate, {
    painIntensity: 4,
    limits: ["Descente difficile", "Station debout"],
  });
  assert.equal(issues.length, 0);
});

test("D102E detectCoherenceIssues ne mute jamais ses arguments (fonction pure)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText("Je n’ai pas mal en descente.");
  const structuredFields = { painIntensity: 0, limits: ["Descente difficile"] };
  const before = JSON.stringify(structuredFields);
  core.detectCoherenceIssues(candidate, structuredFields);
  assert.equal(JSON.stringify(structuredFields), before);
});

test("D102E syncPainInterpretation() confronte painIntensity (#pain) et les limites déclarées (chosen(\"limits\")), jamais d'autres champs devinés", () => {
  const fn = APP_SOURCE.match(/function syncPainInterpretation\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /const structuredFields = \{ painIntensity: num\("#pain"\), limits: chosen\("limits"\) \}/);
  assert.match(fn, /core\.detectCoherenceIssues\(candidate, structuredFields\)/);
});

test("D102E la zone « À vérifier » (#painInterpretationConflict) est bien alimentée par les contradictions et doublons détectés", () => {
  const fn = APP_SOURCE.match(/function syncPainInterpretation\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /conflictWrap\.hidden = !hasConflict/);
  assert.match(fn, /\[\.\.\.contradictions, \.\.\.duplicates\]/);
});

test("D102E la détection de cohérence ne mute jamais #pain, ni ne coche #limitationConfirmed, ni ne choisit #limitationConsequence", () => {
  const fn = APP_SOURCE.match(/function syncPainInterpretation\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(fn, /\$\("#pain"\)\.value\s*=/);
  assert.doesNotMatch(fn, /limitationConfirmed/);
  assert.doesNotMatch(fn, /limitationConsequence/);
});

test("D102G1 une formule générale comme « sur le plat aucun souci » ne devient jamais une absence globale de douleur", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const candidate = core.interpretFreeText(
    "Sur le plat aucun souci, par contre quand ça descend je commence à avoir mal.",
  );
  const painSignals = candidate.triggers.filter((t) => t.trigger === "pain-qualifier");
  assert.equal(painSignals.some((t) => t.polarity === "absent"), false);
  assert.equal(painSignals.some((t) => t.polarity === "present"), true);
  const issues = core.detectCoherenceIssues(candidate, { painIntensity: 4, limits: [] });
  assert.equal(issues.filter((i) => i.field === "painIntensity").length, 0);
});
