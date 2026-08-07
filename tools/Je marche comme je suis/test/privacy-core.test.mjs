import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/privacy-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
const privacy =
  context.JMMJSPrivacyCore.createPrivacyController({ storage });

assert.equal(privacy.persistProfile({ duration: 60 }).persisted, true);
assert.equal(privacy.storageStatus().profilePresent, true);
privacy.setPrivateMode(true);
assert.equal(privacy.storageStatus().profilePresent, false);
assert.equal(
  privacy.persistProfile({ pain: "genou" }).reason,
  "private-mode",
);
privacy.setPrivateMode(false);
assert.equal(privacy.persistProfile({}).persisted, true);

const values2 = new Map();
const storage2 = {
  getItem: (key) => values2.get(key) ?? null,
  setItem: (key, value) => values2.set(key, String(value)),
  removeItem: (key) => values2.delete(key),
};
const privacy2 = context.JMMJSPrivacyCore.createPrivacyController({ storage: storage2 });
assert.equal(privacy2.loadProfile(), null, "no saved profile yet");
privacy2.persistProfile({ footwear: "Trail", equipment: ["Canne"] });
assert.deepEqual(JSON.parse(JSON.stringify(privacy2.loadProfile())), { footwear: "Trail", equipment: ["Canne"] });
values2.set(privacy2.storageStatus().profileKey, "{not valid json");
assert.equal(privacy2.loadProfile(), null, "corrupted JSON must not throw");
