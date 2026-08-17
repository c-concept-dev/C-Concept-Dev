import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context;
}

const CORE_SOURCE = readFileSync(
  new URL("../src/core/free-text-interpretation-core.js", import.meta.url),
  "utf8",
);
const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D102A le module expose les 8 statuts du plan D102 v1.1, sans plus ni moins", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { STATUSES } = ctx.JMMJSFreeTextInterpretationCore;
  assert.deepEqual(
    [...STATUSES].sort(),
    ["ambiguous", "candidate", "confirmed", "conflict", "error", "idle", "pending", "rejected"].sort(),
  );
});

test("D102A painIntensity figure explicitement dans la matrice de cohérence (angle mort corrigé)", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { COHERENCE_FIELDS } = ctx.JMMJSFreeTextInterpretationCore;
  assert.ok(
    COHERENCE_FIELDS.includes("painIntensity"),
    "painIntensity doit être confronté au texte libre, comme demandé en discussion",
  );
});

test("D102A emptyCandidateInterpretation respecte exactement le contrat du plan", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const empty = ctx.JMMJSFreeTextInterpretationCore.emptyCandidateInterpretation();
  assert.deepEqual(Object.keys(empty).sort(), [
    "bodyAreas",
    "coherenceIssues",
    "confidence",
    "negations",
    "needs",
    "side",
    "temporal",
    "triggers",
    "uncertain",
  ].sort());
  assert.equal(empty.bodyAreas.length, 0);
  assert.equal(empty.side, null);
  assert.equal(empty.triggers.length, 0);
  assert.equal(Object.keys(empty.temporal).length, 0);
  assert.equal(empty.needs.length, 0);
  assert.equal(empty.negations.length, 0);
  assert.equal(empty.uncertain.length, 0);
  assert.equal(Object.keys(empty.confidence).length, 0);
  assert.equal(empty.coherenceIssues.length, 0);
});

test("D102A un champ texte vide produit un état idle (comportement D101I inchangé)", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const state = ctx.JMMJSFreeTextInterpretationCore.createInterpretationState("");
  assert.equal(state.status, "idle");
  assert.equal(state.confirmedInterpretation, null);
});

test("D102A un texte présent mais non confirmé ne produit aucun effet sur la requête", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { createInterpretationState, mergeConfirmedInterpretationIntoRequest } =
    ctx.JMMJSFreeTextInterpretationCore;
  const state = createInterpretationState("mon genou gauche tire en descente");
  assert.equal(state.status, "pending");
  const request = { painIntensity: 3, terrain: ["Goudron accepté"] };
  const result = mergeConfirmedInterpretationIntoRequest(request, state);
  assert.deepEqual(result, request);
  assert.notEqual(result, request, "doit renvoyer une copie, jamais l'objet d'origine");
});

test("D102A une interprétation rejetée ne produit aucun effet même si confirmedInterpretation a été renseignée par erreur", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { mergeConfirmedInterpretationIntoRequest } = ctx.JMMJSFreeTextInterpretationCore;
  const state = {
    rawText: "texte quelconque",
    status: "rejected",
    confirmedInterpretation: { triggers: ["descente"] },
    candidateInterpretation: ctx.JMMJSFreeTextInterpretationCore.emptyCandidateInterpretation(),
    coherenceIssues: [],
  };
  const request = { painIntensity: 5 };
  const result = mergeConfirmedInterpretationIntoRequest(request, state);
  assert.deepEqual(result, request);
});

test("D102A même une interprétation confirmée ne mute encore rien en D102A (raccordement réel = D102D)", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { mergeConfirmedInterpretationIntoRequest } = ctx.JMMJSFreeTextInterpretationCore;
  const state = {
    rawText: "mon genou gauche tire en descente",
    status: "confirmed",
    confirmedInterpretation: { triggers: ["descente"], side: "Gauche" },
    candidateInterpretation: ctx.JMMJSFreeTextInterpretationCore.emptyCandidateInterpretation(),
    coherenceIssues: [],
  };
  const request = { painIntensity: 0, terrain: [] };
  const result = mergeConfirmedInterpretationIntoRequest(request, state);
  assert.deepEqual(
    result,
    request,
    "aucune mutation de painIntensity ou de terrain sans que D102D ne l'implémente explicitement",
  );
});

test("D102A detectCoherenceIssues n'invente jamais de problème : toujours vide tant qu'aucune règle n'existe", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const { detectCoherenceIssues, emptyCandidateInterpretation } = ctx.JMMJSFreeTextInterpretationCore;
  const result = detectCoherenceIssues(emptyCandidateInterpretation(), { painIntensity: 0 });
  assert.equal(result.length, 0);
});

test("D102A normalizeCandidateInterpretation ne reproduit jamais une valeur hors du contrat (pas d'invention de forme)", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const normalized = ctx.JMMJSFreeTextInterpretationCore.normalizeCandidateInterpretation({
    side: "Gauche",
    bodyAreas: ["genou"],
    unexpectedField: "ne doit pas apparaître",
  });
  assert.equal(normalized.side, "Gauche");
  assert.deepEqual(normalized.bodyAreas, ["genou"]);
  assert.equal("unexpectedField" in normalized, false);
});

test("D102A la note personnelle (#freeText) n'est jamais référencée par ce module", () => {
  assert.doesNotMatch(CORE_SOURCE, /freeText/);
  assert.doesNotMatch(CORE_SOURCE, /note personnelle/i);
});

test("D102A ce lot ne raccorde encore rien au constructeur de requête (buildRequest) — la limite D102A/D102D est respectée", () => {
  const buildRequestMatch = APP_SOURCE.match(/function buildRequest\(\) \{[\s\S]*?\n  \}/);
  assert.ok(buildRequestMatch, "buildRequest doit exister");
  assert.doesNotMatch(buildRequestMatch[0], /JMMJSFreeTextInterpretationCore/);
});

test("D102A le contrat exporté est gelé (Object.freeze)", () => {
  const ctx = loadModule("../src/core/free-text-interpretation-core.js");
  const core = ctx.JMMJSFreeTextInterpretationCore;
  assert.throws(() => {
    "use strict";
    core.STATUSES = [];
  });
});
