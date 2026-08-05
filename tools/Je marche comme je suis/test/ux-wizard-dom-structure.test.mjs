import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../je-marche-comme-je-suis.template.html', import.meta.url), 'utf8');

function openingTagClass(tag) {
  const match = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i);
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function inspectWizardStructure(source) {
  const tokens = source.match(/<\/?(?:form|div|section)\b[^>]*>/gi) || [];
  const stack = [];
  let insideFormBody = false;
  let formBodyDepth = -1;
  let directSteps = 0;
  const directNavCounts = [];
  let currentDirectStep = -1;

  for (const token of tokens) {
    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?([a-z]+)/i)?.[1]?.toLowerCase();
    if (!name) continue;

    if (!closing) {
      const classes = openingTagClass(token);
      const parent = stack.at(-1);
      const node = { name, classes };
      stack.push(node);

      if (name === 'div' && classes.includes('form-body')) {
        insideFormBody = true;
        formBodyDepth = stack.length;
        continue;
      }

      if (insideFormBody && name === 'section' && classes.includes('step') && stack.length === formBodyDepth + 1) {
        currentDirectStep = directSteps;
        directSteps += 1;
        directNavCounts.push(0);
        continue;
      }

      if (
        insideFormBody &&
        currentDirectStep >= 0 &&
        name === 'div' &&
        classes.includes('nav') &&
        parent?.name === 'section' &&
        parent?.classes?.includes('step')
      ) {
        directNavCounts[currentDirectStep] += 1;
      }
    } else {
      const popped = stack.pop();
      if (!popped || popped.name !== name) {
        throw new Error(`Structure HTML déséquilibrée près de ${token}`);
      }
      if (insideFormBody && popped.name === 'section' && popped.classes.includes('step')) {
        currentDirectStep = -1;
      }
      if (insideFormBody && popped.name === 'div' && popped.classes.includes('form-body')) {
        insideFormBody = false;
      }
    }
  }

  return { directSteps, directNavCounts };
}

test('les quatre étapes restent des enfants directs de form-body', () => {
  const structure = inspectWizardStructure(html);
  assert.equal(structure.directSteps, 4);
});

test('chaque étape possède exactement une navigation directe', () => {
  const structure = inspectWizardStructure(html);
  assert.deepEqual(structure.directNavCounts, [1, 1, 1, 1]);
});

test('la fermeture excédentaire introduite par le lot épuration est absente', () => {
  assert.doesNotMatch(
    html,
    /<\/details>\s*<\/div><\/div><\/div><div class="nav"><button class="secondary prev"/,
  );
});
