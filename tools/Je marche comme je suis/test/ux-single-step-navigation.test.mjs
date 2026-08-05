import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");

test("une seule barre de navigation peut être visible dans l'étape active", () => {
  assert.match(template, /\.form-body \.nav\{display:none\}/);
  assert.match(template, /\.form-body \.step\.active>\.nav\{display:flex\}/);
});

test("chaque étape conserve au plus une navigation directe", () => {
  const steps = template.split('<section class="step').slice(1);
  assert.equal(steps.length, 4);
  for (const step of steps) {
    const beforeClose = step.split('</section>')[0];
    const navCount = (beforeClose.match(/<div class="nav">/g) || []).length;
    assert.ok(navCount <= 1, `navigation dupliquée dans une étape: ${navCount}`);
  }
});
