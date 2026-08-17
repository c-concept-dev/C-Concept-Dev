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
const TEMPLATE_SOURCE = readFileSync(
  new URL("../je-marche-comme-je-suis.template.html", import.meta.url),
  "utf8",
);

function confirmedState(confirmedInterpretation) {
  return { status: "confirmed", confirmedInterpretation };
}

test("D102D une descente confirmée par texte remplit trigger/side dans functionalLimitation, comme une saisie manuelle", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const state = confirmedState({
    triggers: [{ trigger: "Descente" }],
    side: "Gauche",
    needs: [],
    temporal: {},
  });
  const result = core.mergeConfirmedInterpretationIntoRequest({}, state);
  assert.equal(result.functionalLimitation.trigger, "Descente");
  assert.equal(result.functionalLimitation.side, "Gauche");
});

test("D102D équivalence : une contrainte saisie manuellement (déjà présente) n'est jamais écrasée par le texte confirmé", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const state = confirmedState({
    triggers: [{ trigger: "Montée" }],
    side: "Droit",
    needs: [],
    temporal: {},
  });
  const request = { functionalLimitation: { trigger: "Descente", side: "Gauche" } };
  const result = core.mergeConfirmedInterpretationIntoRequest(request, state);
  assert.equal(
    result.functionalLimitation.trigger,
    "Descente",
    "la saisie manuelle existante prime sur le texte",
  );
  assert.equal(result.functionalLimitation.side, "Gauche");
});

test("D102D jamais de consequence ni de confirmed ajoutés automatiquement — l'utilisateur doit encore les choisir lui-même", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const state = confirmedState({
    triggers: [{ trigger: "Descente" }],
    side: "Gauche",
    needs: [],
    temporal: {},
  });
  const result = core.mergeConfirmedInterpretationIntoRequest({}, state);
  assert.equal(result.functionalLimitation.consequence, undefined);
  assert.equal(result.functionalLimitation.confirmed, undefined);
});

test("D102D painIntensity n'est jamais réécrit, même quand un qualificatif de douleur est confirmé", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const state = confirmedState({
    triggers: [{ trigger: "Descente", polarity: "present", raw: "ça tire" }],
    side: null,
    needs: [],
    temporal: {},
  });
  const request = { painIntensity: 0 };
  const result = core.mergeConfirmedInterpretationIntoRequest(request, state);
  assert.equal(result.painIntensity, 0);
});

test("D102D la durée sans pause n'est remplie que si le texte confirme À LA FOIS une durée ET un besoin de pause", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const withBoth = core.mergeConfirmedInterpretationIntoRequest(
    {},
    confirmedState({
      triggers: [],
      side: null,
      needs: [{ type: "pause-assise" }],
      temporal: { durations: [{ approxMinutes: 20, precision: "approximate" }] },
    }),
  );
  assert.equal(withBoth.functionalLimitation.maxWithoutPauseMinutes, 20);

  const durationOnly = core.mergeConfirmedInterpretationIntoRequest(
    {},
    confirmedState({
      triggers: [],
      side: null,
      needs: [],
      temporal: { durations: [{ approxMinutes: 20, precision: "approximate" }] },
    }),
  );
  assert.equal(
    durationOnly.functionalLimitation,
    undefined,
    "une durée seule (apparition de la gêne) ne doit jamais devenir une durée max sans pause",
  );

  const pauseOnly = core.mergeConfirmedInterpretationIntoRequest(
    {},
    confirmedState({ triggers: [], side: null, needs: [{ type: "pause-assise" }], temporal: {} }),
  );
  assert.equal(pauseOnly.functionalLimitation, undefined);
});

test("D102D un déclencheur non raccordable (station debout avec ambiguïté, ou pain-qualifier seul) ne produit aucun functionalLimitation", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.mergeConfirmedInterpretationIntoRequest(
    {},
    confirmedState({
      triggers: [{ trigger: "pain-qualifier", polarity: "present" }],
      side: null,
      needs: [],
      temporal: {},
    }),
  );
  assert.equal(result.functionalLimitation, undefined);
});

test("D102D texte non confirmé (status idle/pending) : buildRequest() n'est jamais affecté, requête inchangée à l'identique", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const request = { painIntensity: 5, functionalLimitation: { trigger: "Montée" } };
  const result = core.mergeConfirmedInterpretationIntoRequest(request, {
    status: "pending",
    confirmedInterpretation: { triggers: [{ trigger: "Descente" }] },
  });
  assert.equal(result.functionalLimitation.trigger, "Montée");
});

test("D102D applyFreeTextInterpretation() est chaîné aux trois points d'appel existants de mergeStructuredLimitationIntoRequest(buildRequest())", () => {
  const occurrences = APP_SOURCE.match(
    /mergeStructuredLimitationIntoRequest\(applyFreeTextInterpretation\(/g,
  );
  assert.equal(occurrences?.length, 3);
});

test("D102D buildRequest() lui-même reste un lecteur DOM pur, sans référence au module texte libre (même pattern que le mécanisme D-024 existant)", () => {
  const buildRequestMatch = APP_SOURCE.match(/function buildRequest\(\) \{[\s\S]*?\n  \}/);
  assert.ok(buildRequestMatch);
  assert.doesNotMatch(buildRequestMatch[0], /JMMJSFreeTextInterpretationCore/);
});

test("D102D le pré-remplissage du formulaire structuré ne coche jamais la confirmation ni ne choisit de conséquence à la place de l'utilisateur", () => {
  const fn = APP_SOURCE.match(
    /function prefillLimitationFromInterpretation\(candidate\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(fn, "prefillLimitationFromInterpretation doit exister");
  assert.doesNotMatch(fn, /limitationConfirmed/);
  assert.doesNotMatch(fn, /limitationConsequence/);
});

test("D102D la correspondance déclencheur → puce « limits » utilise des libellés réellement présents dans le template", () => {
  const mapMatch = APP_SOURCE.match(/const TRIGGER_TO_LIMITS_CHIP = Object\.freeze\(\{[\s\S]*?\}\);/);
  assert.ok(mapMatch);
  for (const label of ["Descente difficile", "Montée difficile", "Terrain irrégulier", "Station debout"]) {
    assert.match(mapMatch[0], new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(TEMPLATE_SOURCE, new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
  }
});

test("D102D le clic sur « Prendre en compte » appelle le pré-remplissage", () => {
  const handler = APP_SOURCE.match(
    /\$\("#painInterpretationConfirm"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(handler);
  assert.match(handler, /prefillLimitationFromInterpretation\(lastPainCandidate\)/);
});
