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

test("la couverture mobile n'est plus proposée tant qu'aucune source réelle n'est câblée", () => {
  const result = core.normalizeServices(["Réseau téléphonique"]);
  assert.deepEqual([...result], []);
});

test("une inconnue impérative transforme compatible en à vérifier", () => {
  const assessment = core.assessRequiredServices(["Eau potable"], [], {
    searched: false,
    providerAvailable: false,
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

test("D092C une envie POI trouvée est respectée", () => {
  const result = core.assessWishPois(["Boulangerie"], [{ type: "Boulangerie" }], {
    searched: true,
  });
  assert.equal(result.checks[0].status, "respected");
  assert.match(result.checks[0].evidence, /Boulangerie documenté/);
});

test("D092C une envie POI recherchée mais absente reste à vérifier, jamais violée", () => {
  const result = core.assessWishPois(["Restaurant"], [], { searched: true });
  assert.equal(result.checks[0].status, "unknown");
  assert.match(result.checks[0].evidence, /couverture cartographique reste incomplète/);
});

test("D092C une recherche indisponible pour une envie POI reste inconnue", () => {
  const result = core.assessWishPois(["Point de vue"], [], {
    searched: false,
    providerAvailable: false,
  });
  assert.equal(result.checks[0].status, "unknown");
});

test("D092C une envie non reconnue est ignorée sans erreur", () => {
  const result = core.assessWishPois(["Photo"], [], { searched: true });
  assert.equal(result.checks.length, 0);
});

test("D092C applyWishPoiAssessment ajoute des contrôles de sévérité conseil, jamais impérative", () => {
  const assessment = core.assessWishPois(["Pique-nique"], [{ type: "Pique-nique" }], {
    searched: true,
  });
  const route = core.applyWishPoiAssessment(
    { checks: [], proposalStatus: "compatible", canNavigate: true },
    assessment,
  );
  const check = route.checks.find((item) => item.constraint === "Envie : Pique-nique");
  assert.ok(check, "expected an Envie : Pique-nique check");
  assert.equal(check.severity, "advisory");
  assert.equal(check.status, "respected");
  assert.equal(route.proposalStatus, "compatible");
  assert.equal(route.canNavigate, true);
});

test("D092C applyWishPoiAssessment remplace les anciens contrôles d'envie sans dupliquer", () => {
  const first = core.applyWishPoiAssessment(
    { checks: [{ constraint: "Envie : Café", status: "unknown", evidence: "ancien" }] },
    core.assessWishPois(["Café"], [{ type: "Café" }], { searched: true }),
  );
  const matches = first.checks.filter((item) => item.constraint === "Envie : Café");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, "respected");
});


test("D099A Rivière, Lac et Forêt deviennent des envies POI auditables", () => {
  const result = core.assessWishPois(
    ["Rivière", "Lac", "Forêt"],
    [{ type: "Rivière" }, { type: "Lac" }, { type: "Forêt" }],
    { searched: true },
  );
  assert.equal(result.checks.length, 3);
  assert.ok(result.checks.every((check) => check.status === "respected"));
});

test("D099A les envies nature n'augmentent pas encore le routage ORS ciblé", () => {
  assert.ok(core.WISH_POI_LABELS.includes("Rivière"));
  assert.ok(core.WISH_POI_LABELS.includes("Lac"));
  assert.ok(core.WISH_POI_LABELS.includes("Forêt"));
  assert.ok(!core.ROUTING_POI_LABELS.includes("Rivière"));
  assert.ok(!core.ROUTING_POI_LABELS.includes("Lac"));
  assert.ok(!core.ROUTING_POI_LABELS.includes("Forêt"));
});
