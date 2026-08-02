import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/services-core.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSServicesCore;

test("un service trouvé est respecté", () => {
  const result = core.assessRequiredServices(["Toilettes"], [{ type: "Toilettes" }], {
    searched: true,
  });
  assert.equal(result.status, "respected");
  assert.equal(result.admissible, true);
});

test("un service recherché mais absent est violé", () => {
  const result = core.assessRequiredServices(["Banc"], [], { searched: true });
  assert.equal(result.status, "violated");
  assert.equal(result.violated[0].service, "Banc");
});

test("une recherche indisponible reste inconnue", () => {
  const result = core.assessRequiredServices(["Eau potable"], [], {
    searched: false,
    providerAvailable: false,
  });
  assert.equal(result.status, "unknown");
});

test("la couverture mobile n'est jamais inventée", () => {
  const result = core.assessRequiredServices(
    ["Réseau téléphonique"],
    [{ type: "Réseau téléphonique" }],
    { searched: true },
  );
  assert.equal(result.status, "unknown");
});

test("une inconnue impérative transforme compatible en à vérifier", () => {
  const assessment = core.assessRequiredServices(["Réseau téléphonique"], [], {
    searched: true,
  });
  const route = core.applyServiceAssessment(
    { checks: [], proposalStatus: "compatible", canNavigate: true },
    assessment,
  );
  assert.equal(route.proposalStatus, "verify");
  assert.equal(route.canNavigate, false);
});

test("un service absent bloque la recommandation", () => {
  const assessment = core.assessRequiredServices(["Pharmacie"], [], {
    searched: true,
  });
  const route = core.applyServiceAssessment(
    { checks: [], proposalStatus: "compatible", canNavigate: true, violations: [] },
    assessment,
  );
  assert.equal(route.proposalStatus, "adaptation");
  assert.equal(route.canNavigate, false);
});
