import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D102C le panneau « Voici ce que j'ai compris » existe avec ses actions", () => {
  assert.match(template, /id="painInterpretation"/);
  assert.match(template, /Voici ce que j.ai compris/);
  assert.match(template, /id="painInterpretationChips"/);
  assert.match(template, /id="painInterpretationConfirm"[^>]*>Prendre en compte/);
  assert.match(template, /id="painInterpretationModify"[^>]*>Modifier/);
});

test("D102C la zone de clarification (\"J'ai besoin de préciser un point\") existe, initialement masquée", () => {
  assert.match(template, /id="painInterpretationUncertain" hidden/);
  assert.match(template, /J.ai besoin de préciser un point/);
  assert.match(template, /id="painInterpretationUncertainList"/);
});

test("D102C la zone de contradiction (\"À vérifier\") existe pour D102E, initialement masquée et vide de logique", () => {
  assert.match(template, /id="painInterpretationConflict" hidden/);
  assert.match(template, /À vérifier/);
  assert.match(template, /id="painInterpretationConflictList"/);
});

test("D102C le message d'absence de contrainte identifiée existe", () => {
  assert.match(template, /id="painInterpretationEmpty" hidden/);
  assert.match(template, /Je n.ai pas identifié de contrainte précise dans ce texte/);
});

test("D102C Responsive = Desktop : un seul panneau dans le DOM, pas de duplication mobile/desktop", () => {
  const occurrences = template.match(/id="painInterpretation"/g) || [];
  assert.equal(occurrences.length, 1);
});

test("D102C syncPainInterpretation() appelle interpretFreeText et respecte l'inertie si le texte est vide", () => {
  const fn = app.match(/function syncPainInterpretation\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /core\.interpretFreeText\(text\)/);
  assert.match(fn, /if \(!text\.trim\(\)\s*\|\|\s*!core\)/);
});

test("D102C les qualificatifs de douleur (pain-qualifier) ne deviennent jamais des chips confirmables", () => {
  const fn = app.match(/function painInterpretationItems\(candidate\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /trigger\.trigger === "pain-qualifier"/);
});

test("D102C chaque chip peut être retirée individuellement sans redemander confirmation", () => {
  const fn = app.match(/function syncPainInterpretation\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /painInterpretationRemoved\.add\(item\.id\)/);
  assert.match(fn, /resetPainInterpretationConfirmation\(\)/);
});

test("D102C un nouveau texte réinitialise les retraits et la confirmation (pas d'état obsolète)", () => {
  assert.match(app, /painInterpretationRemoved\.clear\(\)/);
});

test("D102C ce lot ne raccorde toujours rien au constructeur de requête (buildRequest) — la limite D102C/D102D reste respectée", () => {
  const buildRequestMatch = app.match(/function buildRequest\(\) \{[\s\S]*?\n  \}/);
  assert.ok(buildRequestMatch, "buildRequest doit exister");
  assert.doesNotMatch(buildRequestMatch[0], /JMMJSFreeTextInterpretationCore/);
  assert.doesNotMatch(buildRequestMatch[0], /painInterpretationConfirmed/);
});

test("D102C \"Prendre en compte\" ne modifie ni painIntensity ni terrain ni services (D102D fera le raccordement réel)", () => {
  const handler = app.match(/\$\("#painInterpretationConfirm"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?\n  \}\);/)?.[0] || "";
  assert.doesNotMatch(handler, /painIntensity/);
  assert.doesNotMatch(handler, /data-service-choice/);
  assert.doesNotMatch(handler, /data-group="terrain"/);
});
