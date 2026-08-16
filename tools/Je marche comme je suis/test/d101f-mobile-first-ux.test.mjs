import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('D101F durée utilise un contrôle segmenté tout en conservant timeIncludes', () => {
  assert.match(html, /data-time-includes="walk_breaks"/);
  assert.match(html, /data-time-includes="walk_only"/);
  assert.match(html, /data-time-includes="all_stops"/);
  assert.match(html, /id="timeIncludes"[^>]*hidden/);
  assert.match(app, /syncTimeIncludesSwitch/);
});

test('D101F heure de retour reste une contrainte réelle et conditionnelle', () => {
  assert.match(html, /data-deadline-state="none"/);
  assert.match(html, /data-deadline-state="required"/);
  assert.match(html, /id="returnDeadlineEnabled"[^>]*type="checkbox"[^>]*hidden/);
  assert.match(html, /id="returnDeadlineTime"[^>]*hidden/);
  assert.match(app, /toggle\.checked = button\.dataset\.deadlineState === "required"/);
  assert.match(app, /returnTime:\s*\$\("#returnDeadlineEnabled"\)\?\.checked/);
});

test('D101F envies sélectionnées restent visibles hors du thème courant', () => {
  assert.match(html, /id="wishSelectedStrip"/);
  assert.match(html, /id="wishSelectedList"/);
  assert.match(app, /wish-selected-pill/);
});

test('D101F applique la divulgation progressive sur équipement et limitations', () => {
  assert.match(html, /id="gearDisclosure"/);
  assert.match(html, /id="limitationsDisclosure"/);
  assert.match(html, /id="painDetailWrap" hidden/);
  assert.match(app, /syncPainDetailVisibility/);
  assert.match(app, /updateDisclosureSummaries/);
});

test('D101F place le calcul avant les options secondaires', () => {
  const step = html.slice(html.indexOf('id="constraintSummary"'), html.indexOf('</section>', html.indexOf('id="constraintSummary"')));
  assert.ok(step.indexOf('id="create"') >= 0);
  assert.ok(step.indexOf('id="reviewSecondary"') >= 0);
  assert.ok(step.indexOf('id="create"') < step.indexOf('id="reviewSecondary"'));
});
