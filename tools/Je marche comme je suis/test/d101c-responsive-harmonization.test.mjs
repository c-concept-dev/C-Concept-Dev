import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../je-marche-comme-je-suis-p0.html", import.meta.url), "utf8");
const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");

function formOf(source) {
  return source.match(/<form\b[\s\S]*?<\/form>/)?.[0] || "";
}

for (const [name, source] of [["build", html], ["template", template]]) {
  test(`${name}: latitude et longitude restent techniques, jamais présentées comme champs visibles`, () => {
    const form = formOf(source);
    assert.doesNotMatch(form, /<label[^>]*>\s*Latitude\s*<\/label>/i);
    assert.doesNotMatch(form, /<label[^>]*>\s*Longitude\s*<\/label>/i);
    assert.match(form, /class="technical-coordinates"[^>]*hidden[^>]*aria-hidden="true"/i);
    assert.match(form, /id="lat"/);
    assert.match(form, /id="lon"/);
  });

  test(`${name}: le retour à heure fixe appartient au bloc Combien de temps et se déplie par case à cocher`, () => {
    const form = formOf(source);
    assert.doesNotMatch(form, /Retour impératif/i);
    const card = form.match(/<div class="card"><h3>Combien de temps \?<\/h3>[\s\S]*?<\/div><div class="nav">/)?.[0] || "";
    assert.match(card, /id="returnDeadlineEnabled"[^>]*type="checkbox"/);
    assert.match(card, /Je dois être rentré à une heure précise/);
    assert.match(card, /id="returnDeadlineTime" hidden/);
    assert.match(card, /id="returnTime" type="time"/);
  });

  test(`${name}: un seul questionnaire commun sert desktop et responsive`, () => {
    assert.equal((source.match(/<form\b/g) || []).length, 1);
    assert.equal((source.match(/<section class="step(?: active)?"/g) || []).length, 4);
    assert.doesNotMatch(source, /mobile-form|desktop-form|responsive-form/i);
  });
}

test("D101C: les fonctions récentes restent présentes après harmonisation", () => {
  assert.match(html, /id="freshAirOnly"/);
  assert.match(html, /data-wish-theme-select/);
  assert.match(html, /data-service-choice/);
  assert.match(html, /id="benchRequiredInterval"/);
  assert.match(html, /Limites à respecter/);
});

test("D101C: le JavaScript lie réellement la case de retour à l'heure transmise au moteur", () => {
  assert.match(html, /function syncReturnDeadline\(\)/);
  assert.match(html, /returnTime:\s*\$\("#returnDeadlineEnabled"\)\?\.checked\s*\?\s*\(val\("#returnTime"\) \|\| null\)\s*:\s*null/);
});
