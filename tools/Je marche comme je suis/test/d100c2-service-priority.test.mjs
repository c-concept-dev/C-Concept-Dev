import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/services-core.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../je-marche-comme-je-suis.template.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const context = { globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const core = context.JMMJSServicesCore;

test("D100C2 l'interface propose 6 services principaux et la pharmacie repliée, sans réseau téléphonique", () => {
  const main = template.match(/id="serviceChoiceGrid"([\s\S]*?)<details class="service-choice-more">/)?.[1] || "";
  assert.equal((main.match(/data-service-choice=/g) || []).length, 6);
  assert.match(template, /data-service-choice="Pharmacie"/);
  assert.doesNotMatch(template, /data-service-choice="Réseau téléphonique"/);
});

test("D100C2 chaque service possède les trois états neutre, souhaité, nécessaire", () => {
  const cards = [...template.matchAll(/<div class="service-choice-card" data-service-choice="([^"]+)"[\s\S]*?<\/div><\/div>/g)];
  assert.ok(cards.length >= 7);
  for (const card of cards) {
    assert.match(card[0], /data-service-state="none"/);
    assert.match(card[0], /data-service-state="desired"/);
    assert.match(card[0], /data-service-state="required"/);
  }
});

test("D100C2 café/restauration est réellement satisfait par un café OU un restaurant", () => {
  const cafe = core.assessDesiredServices(["Café / restauration"], [{ type: "Café" }], { searched: true });
  const restaurant = core.assessDesiredServices(["Café / restauration"], [{ type: "Restaurant" }], { searched: true });
  assert.equal(cafe.checks[0].status, "respected");
  assert.equal(restaurant.checks[0].status, "respected");
});

test("D100C2 un souhait non documenté reste inconnu et ne devient jamais une fausse absence", () => {
  const result = core.assessDesiredServices(["Parking"], [], { searched: true });
  assert.equal(result.checks[0].status, "unknown");
  assert.equal(result.score, 0);
  assert.match(result.checks[0].evidence, /absence n’est pas prouvée/);
});

test("D100C2 un besoin nécessaire non documenté bloque la qualification compatible sans conclure à l'absence", () => {
  const assessment = core.assessRequiredServices(["Toilettes"], [], { searched: true, absenceIsUnknown: true });
  assert.equal(assessment.status, "unknown");
  const route = core.applyServiceAssessment({ checks: [], proposalStatus: "compatible", canNavigate: true }, assessment);
  assert.equal(route.proposalStatus, "verify");
  assert.equal(route.canNavigate, false);
});

test("D100C2 la fréquence de bancs est mesurée sur la trace et peut être respectée", () => {
  const route = { coords: [[1.0, 43.0], [1.01, 43.0], [1.02, 43.0]], walking: 30 };
  const pois = [
    { type: "Banc", lon: 1.005, lat: 43.0 },
    { type: "Banc", lon: 1.015, lat: 43.0 },
  ];
  const result = core.assessBenchSpacing(route, pois, { intervalMinutes: 15, walkingMinutes: 30, maxOffRouteMeters: 100 });
  assert.equal(result.status, "respected");
  assert.equal(result.documentedBenches, 2);
});

test("D100C2 sans banc documenté, la fréquence reste inconnue plutôt que faussement violée", () => {
  const route = { coords: [[1.0, 43.0], [1.02, 43.0]], walking: 30 };
  const result = core.assessBenchSpacing(route, [], { intervalMinutes: 20, walkingMinutes: 30 });
  assert.equal(result.status, "unknown");
  assert.match(result.evidence, /absence réelle de banc n’est pas prouvée/);
});

test("D100C2 les souhaits ont un poids explicite dans le classement final", () => {
  assert.match(app, /desiredServiceScore\) \* 0\.35/);
  assert.match(app, /assessDesiredServices/);
  assert.match(app, /applyDesiredServiceAssessment/);
});
