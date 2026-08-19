import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModules() {
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  for (const relative of [
    "../src/core/activity-progression-core.js",
    "../src/core/activity-progression-persistence.js",
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    vm.runInNewContext(source, context);
  }
  return context;
}

function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    _keys() { return [...map.keys()]; },
    _setRaw(key, value) { map.set(String(key), String(value)); },
    _dump() { return Object.fromEntries(map); },
  };
}

function sampleDocument(core) {
  const session = core.createSessionRecord({
    id: "session-1",
    activityIntent: "maintain",
    includedInHistory: true,
    startedAt: "2026-08-19T10:00:00+02:00",
    endedAt: "2026-08-19T11:00:00+02:00",
    actualExposure: core.createActivityExposure({
      duration: { value: 60, unit: "min", source: "measured", quality: "confirmed" },
    }),
  });
  return core.createLongitudinalDocument({
    createdAt: "2026-08-19T09:00:00+02:00",
    updatedAt: "2026-08-19T11:05:00+02:00",
    data: {
      currentActivityIntent: "maintain",
      sessionRecords: [session],
    },
  });
}

test("D103A2 n'utilise que le préfixe jmmjs- pour ses clés", () => {
  const { JMMJSActivityProgressionPersistence: persistence } = loadModules();
  assert.match(persistence.STORAGE_PREFIX, /^jmmjs-/);
  assert.doesNotMatch(persistence.STORAGE_PREFIX, /^jmjs\./);
  assert.ok(persistence.STATE_KEY.startsWith(persistence.STORAGE_PREFIX));
  assert.ok(persistence.SESSION_INDEX_KEY.startsWith(persistence.STORAGE_PREFIX));
  assert.ok(persistence.SESSION_KEY_PREFIX.startsWith(persistence.STORAGE_PREFIX));
});

test("D103A2 persiste puis recharge un document validé sans perdre provenance ni unknown", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const controller = context.JMMJSActivityProgressionPersistence.createPersistenceController({
    storage,
    core: context.JMMJSActivityProgressionCore,
  });
  const document = sampleDocument(context.JMMJSActivityProgressionCore);
  const saved = controller.saveDocument(document);
  assert.equal(saved.persisted, true);
  assert.equal(saved.reason, "saved");
  assert.equal(saved.sessionCount, 1);
  const loaded = controller.loadDocument();
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.document.data.sessionRecords.length, 1);
  assert.equal(loaded.document.data.sessionRecords[0].actualExposure.duration.source, "measured");
  assert.equal(loaded.document.data.sessionRecords[0].actualExposure.distance.source, "unknown");
  assert.equal(loaded.document.data.sessionRecords[0].actualExposure.distance.value, null);
});

test("D103A2 stocke les sessions séparément et non dans un tableau monolithique du state", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  controller.saveDocument(sampleDocument(context.JMMJSActivityProgressionCore));
  const state = JSON.parse(storage.getItem(persistence.STATE_KEY));
  assert.deepEqual(state.data.sessionRecords, []);
  assert.equal(JSON.parse(storage.getItem(persistence.SESSION_INDEX_KEY))[0], "session-1");
  assert.ok(storage.getItem(`${persistence.SESSION_KEY_PREFIX}session-1`));
});

test("D103A2 refuse une version future sans écraser les données", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  const future = sampleDocument(context.JMMJSActivityProgressionCore);
  future.schemaVersion = context.JMMJSActivityProgressionCore.SCHEMA_VERSION + 1;
  const result = controller.saveDocument(future);
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "incompatible-version");
  assert.equal(storage.getItem(persistence.STATE_KEY), null);
});

test("D103A2 gère un JSON corrompu sans exception et sans inventer de document", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  storage._setRaw(persistence.STATE_KEY, "{not-json");
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  const loaded = controller.loadDocument();
  assert.equal(loaded.loaded, false);
  assert.equal(loaded.reason, "corrupt-or-unreadable");
  assert.equal(loaded.document, null);
});

test("D103A2 le mode privé purge les données et interdit toute nouvelle persistance", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  controller.saveDocument(sampleDocument(context.JMMJSActivityProgressionCore));
  assert.equal(controller.storageStatus().hasLongitudinalData, true);
  controller.setPrivateMode(true);
  assert.equal(controller.storageStatus().hasLongitudinalData, false);
  const result = controller.saveDocument(sampleDocument(context.JMMJSActivityProgressionCore));
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "private-mode");
  assert.equal(controller.storageStatus().hasLongitudinalData, false);
});

test("D103A2 Effacer mes données supprime absolument toutes les clés longitudinales, y compris une clé orpheline", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  controller.saveDocument(sampleDocument(context.JMMJSActivityProgressionCore));
  storage.setItem(`${persistence.STORAGE_PREFIX}orphan-test`, "x");
  storage.setItem("unrelated-key", "keep");
  controller.purge();
  assert.deepEqual(storage._keys().filter((key) => key.startsWith(persistence.STORAGE_PREFIX)), []);
  assert.equal(storage.getItem("unrelated-key"), "keep");
});

test("D103A2 supprimer une session du document supprime sa clé physique devenue obsolète", () => {
  const context = loadModules();
  const storage = fakeStorage();
  const persistence = context.JMMJSActivityProgressionPersistence;
  const controller = persistence.createPersistenceController({ storage, core: context.JMMJSActivityProgressionCore });
  const document = sampleDocument(context.JMMJSActivityProgressionCore);
  controller.saveDocument(document);
  assert.ok(storage.getItem(`${persistence.SESSION_KEY_PREFIX}session-1`));
  const empty = context.JMMJSActivityProgressionCore.createLongitudinalDocument({
    ...document,
    data: { ...document.data, sessionRecords: [] },
  });
  controller.saveDocument(empty);
  assert.equal(storage.getItem(`${persistence.SESSION_KEY_PREFIX}session-1`), null);
});
