import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSActivityProgressionCore;
}

const CORE_SOURCE = readFileSync(
  new URL("../src/core/activity-progression-core.js", import.meta.url),
  "utf8",
);
const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

// Petit faux localStorage/sessionStorage pour tester les fonctions de
// stockage sans dépendre d'un environnement navigateur.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map),
  };
}

test("D103A les 4 modes et les 4 états de décision du cahier sont exposés, sans plus ni moins", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.deepEqual([...core.MODES].sort(), ["maintien", "plaisir", "progression", "reprise"].sort());
  assert.deepEqual(
    [...core.DECISION_STATES].sort(),
    ["augmenter", "maintenir", "preciser", "reduire"].sort(),
  );
});

test("D103A emptyBaseline() couvre tous les champs du cahier §7.1", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const empty = core.emptyBaseline();
  const expected = [
    "painOrGeneUsuelle",
    "fatigueHabituelle",
    "dureeHabituelleMinutes",
    "frequenceHabituelle",
    "besoinHabituelDePauses",
    "toleranceMontee",
    "toleranceDescente",
    "toleranceTerrainIrregulier",
    "stationDeboutHabituelle",
    "equilibreHabituel",
    "aideTechnique",
    "niveauHabituelActivite",
    "renseigneeLe",
  ];
  assert.deepEqual(Object.keys(empty).sort(), expected.sort());
  for (const key of expected) assert.equal(empty[key], null);
});

test("D103A isBaselineKnown distingue une baseline vide d'une baseline partiellement renseignée", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.equal(core.isBaselineKnown(core.emptyBaseline()), false);
  assert.equal(core.isBaselineKnown({ dureeHabituelleMinutes: 40 }), true);
});

test("D103A createDecision() refuse tout état hors des 4 prévus par le cahier", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.throws(() => core.createDecision({ state: "accelerer" }));
  assert.throws(() => core.createDecision({ state: "reduire de 10%" }));
  const valid = core.createDecision({ state: "reduire", reason: "descente mal tolérée", dimension: "descente" });
  assert.equal(valid.state, "reduire");
});

test("D103A createDecision() ne contient jamais de champ d'amplitude chiffrée (aucun +10%, aucun coefficient)", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const decision = core.createDecision({ state: "augmenter", reason: "bien toléré" });
  assert.equal("percent" in decision, false);
  assert.equal("amount" in decision, false);
  assert.equal("coefficient" in decision, false);
  assert.equal("factor" in decision, false);
});

test("D103A une balade en mode plaisir ne rejoint l'historique que sur choix explicite (arbitrage du 17/08)", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const notIncluded = core.emptySessionRecord();
  notIncluded.mode = "plaisir";
  notIncluded.includeInHistory = false;
  assert.equal(core.shouldRecordSession(notIncluded), false);

  const included = core.emptySessionRecord();
  included.mode = "plaisir";
  included.includeInHistory = true;
  assert.equal(core.shouldRecordSession(included), true);
});

test("D103A les modes reprise/maintien/progression rejoignent toujours l'historique, sans opt-in requis", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  for (const mode of ["reprise", "maintien", "progression"]) {
    const record = core.emptySessionRecord();
    record.mode = mode;
    assert.equal(core.shouldRecordSession(record), true, `${mode} devrait toujours être enregistré`);
  }
});

test("D103A saveBaseline()/loadBaseline() font un aller-retour fidèle via un stockage simulé", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  core.saveBaseline(storage, { dureeHabituelleMinutes: 35, toleranceDescente: "moyenne" });
  const loaded = core.loadBaseline(storage);
  assert.equal(loaded.dureeHabituelleMinutes, 35);
  assert.equal(loaded.toleranceDescente, "moyenne");
  assert.ok(loaded.renseigneeLe, "la date de dernière saisie doit être renseignée");
});

test("D103A loadBaseline() ne lève jamais d'exception sur un contenu corrompu ou absent", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  storage.setItem(core.STORAGE_KEYS.baseline, "{ceci n'est pas du JSON");
  assert.doesNotThrow(() => core.loadBaseline(storage));
  const result = core.loadBaseline(storage);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(core.emptyBaseline()).sort());

  assert.doesNotThrow(() => core.loadBaseline(undefined));
  assert.doesNotThrow(() => core.loadBaseline(null));
});

test("D103A appendSessionRecord() n'écrit jamais silencieusement une balade plaisir non incluse", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  const plaisirNonInclus = core.emptySessionRecord();
  plaisirNonInclus.mode = "plaisir";
  plaisirNonInclus.id = "s1";
  const result = core.appendSessionRecord(storage, plaisirNonInclus);
  assert.equal(result.length, 0);
  assert.equal(core.loadHistory(storage).length, 0);
});

test("D103A appendSessionRecord() enregistre bien une séance de reprise et la retrouve via loadHistory()", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  const record = core.emptySessionRecord();
  record.mode = "reprise";
  record.id = "s1";
  record.reel.dureeMinutes = 25;
  core.appendSessionRecord(storage, record);
  const history = core.loadHistory(storage);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, "s1");
  assert.equal(history[0].reel.dureeMinutes, 25);
});

test("D103A l'historique reste plafonné (protection contre une croissance illimitée du stockage local)", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  for (let i = 0; i < 210; i += 1) {
    const record = core.emptySessionRecord();
    record.mode = "maintien";
    record.id = `s${i}`;
    core.appendSessionRecord(storage, record);
  }
  const history = core.loadHistory(storage);
  assert.ok(history.length <= 200, "l'historique ne doit jamais dépasser la limite documentée");
  assert.equal(history[history.length - 1].id, "s209", "les entrées les plus récentes doivent être conservées");
});

test("D103A previousToleratedSession() ignore les séances dont la décision était 'réduire'", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  const storage = fakeStorage();
  const s1 = core.emptySessionRecord();
  s1.mode = "progression";
  s1.id = "s1";
  s1.decision = { state: "maintenir" };
  core.appendSessionRecord(storage, s1);

  const s2 = core.emptySessionRecord();
  s2.mode = "progression";
  s2.id = "s2";
  s2.decision = { state: "reduire" };
  core.appendSessionRecord(storage, s2);

  const previous = core.previousToleratedSession(storage);
  assert.equal(previous.id, "s1");
});

test("D103A aucune logique fondée sur l'âge n'existe dans ce module (cahier §6, §16)", () => {
  assert.doesNotMatch(CORE_SOURCE, /\bage\b/i);
});

test("D103A ce module ne référence jamais app.js ni buildRequest — aucun raccordement moteur en D103A", () => {
  assert.doesNotMatch(CORE_SOURCE, /buildRequest/);
});

test("D103A ce lot ne raccorde encore rien dans app.js — la limite D103A/D103 suivants est respectée", () => {
  assert.doesNotMatch(APP_SOURCE, /JMMJSActivityProgressionCore/);
});

test("D103A le contrat exporté est gelé (Object.freeze)", () => {
  const core = loadModule("../src/core/activity-progression-core.js");
  assert.throws(() => {
    "use strict";
    core.MODES = [];
  });
});
