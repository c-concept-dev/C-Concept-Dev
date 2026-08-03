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
