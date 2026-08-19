import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

function loadD103B() {
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  for (const path of [
    "src/core/activity-progression-core.js",
    "src/core/activity-intent-home-core.js",
  ]) {
    vm.runInNewContext(read(path), context);
  }
  return context;
}

test("D103B reprend exactement les quatre activityIntent canoniques sans cinquième catégorie", () => {
  const { JMMJSActivityProgressionCore: domain, JMMJSActivityIntentHomeCore: home } = loadD103B();
  assert.deepEqual([...domain.ACTIVITY_INTENTS], ["leisure", "gentle_return", "maintain", "progress"]);
  assert.deepEqual(Object.keys(home.INTENT_COPY), [...domain.ACTIVITY_INTENTS]);
});

test("D103B une simple intention persistée ne fabrique jamais un utilisateur revenant", () => {
  const { JMMJSActivityProgressionCore: domain, JMMJSActivityIntentHomeCore: home } = loadD103B();
  const document = domain.createLongitudinalDocument({
    createdAt: "2026-08-19T10:00:00Z",
    updatedAt: "2026-08-19T10:00:00Z",
    data: { currentActivityIntent: "maintain" },
  });
  const state = home.deriveHomeState(document);
  assert.equal(state.state, "first_visit");
  assert.equal(state.historyAvailable, false);
  assert.equal(state.lastSession, null);
});

test("D103B l'état revenant exige une vraie session incluse dans l'historique", () => {
  const { JMMJSActivityProgressionCore: domain, JMMJSActivityIntentHomeCore: home } = loadD103B();
  const leisureNotIncluded = domain.createSessionRecord({ id: "l0", activityIntent: "leisure", includedInHistory: false });
  const doc1 = domain.createLongitudinalDocument({
    createdAt: "2026-08-19T10:00:00Z",
    updatedAt: "2026-08-19T10:00:00Z",
    data: { sessionRecords: [leisureNotIncluded] },
  });
  assert.equal(home.deriveHomeState(doc1).state, "first_visit");

  const maintain = domain.createSessionRecord({ id: "m1", activityIntent: "maintain", includedInHistory: true });
  const doc2 = domain.createLongitudinalDocument({
    ...doc1,
    data: { ...doc1.data, sessionRecords: [leisureNotIncluded, maintain] },
  });
  const state = home.deriveHomeState(doc2);
  assert.equal(state.state, "returning");
  assert.equal(state.historyAvailable, true);
  assert.equal(state.lastSession.id, "m1");
});

test("D103B choisir une intention est pur, réversible et ne modifie aucune autre donnée", () => {
  const { JMMJSActivityProgressionCore: domain, JMMJSActivityIntentHomeCore: home } = loadD103B();
  const original = domain.createLongitudinalDocument({
    createdAt: "2026-08-19T09:00:00Z",
    updatedAt: "2026-08-19T09:00:00Z",
    data: { functionalGoal: { text: "Faire le tour du lac" }, currentActivityIntent: "maintain" },
  });
  const snapshot = structuredClone(original);
  const next = home.chooseActivityIntent(original, "gentle_return", {
    now: "2026-08-19T11:00:00Z",
    core: domain,
  });
  assert.equal(JSON.stringify(original), JSON.stringify(snapshot));
  assert.equal(next.data.currentActivityIntent, "gentle_return");
  assert.equal(next.data.functionalGoal.text, "Faire le tour du lac");
  assert.equal(next.createdAt, original.createdAt);
  assert.equal(next.updatedAt, "2026-08-19T11:00:00Z");

  const changedAgain = home.chooseActivityIntent(next, "progress", {
    now: "2026-08-19T12:00:00Z",
    core: domain,
  });
  assert.equal(changedAgain.data.currentActivityIntent, "progress");
});

test("D103B n'invente ni intention invalide ni horodatage", () => {
  const { JMMJSActivityProgressionCore: domain, JMMJSActivityIntentHomeCore: home } = loadD103B();
  assert.throws(() => home.chooseActivityIntent(null, "senior", { now: "2026-08-19T10:00:00Z", core: domain }), /Invalid activityIntent/);
  assert.throws(() => home.chooseActivityIntent(null, "leisure", { core: domain }), /now is required/);
});

test("D103B l'accueil première visite possède un DOM unique desktop/mobile et quatre cartes parallèles", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  const cards = [...html.matchAll(/class="d103-intent-card"[^>]*data-activity-intent="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(cards, ["leisure", "gentle_return", "maintain", "progress"]);
  assert.equal((html.match(/id="d103Home"/g) || []).length, 1);
  assert.match(html, /Qu’avez-vous envie de faire aujourd’hui \?/);
  assert.match(html, /Je viens comme je suis,<br>je marche comme j’en ai envie\./);
  assert.match(html, /Vos données restent ici/);
  assert.match(html, /Ce service ne remplace pas un avis médical/);
});

test("D103B aucun faux historique n'est visible par défaut", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.match(html, /id="d103Returning" hidden/);
  assert.doesNotMatch(html, /12 mai 2025/);
  assert.doesNotMatch(html, /6,2 km/);
  assert.doesNotMatch(html, /Bonne énergie, parcours agréable/);
});

test("D103B conserve un accès explicite au GPX et au parcours leisure stable", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  const app = read("src/app.js");
  assert.match(html, /id="d103Gpx"[^>]*>J’ai déjà une trace GPX/);
  assert.match(app, /#d103Gpx[\s\S]{0,120}mode\("gpx"\)/);
  assert.match(app, /if \(intent === "leisure"\)[\s\S]{0,180}mode\("api"\)/);
});

test("D103B ne présélectionne pas la dernière intention au chargement", () => {
  const app = read("src/app.js");
  assert.match(app, /Une intention passée n'est jamais présélectionnée automatiquement/);
  assert.match(app, /selectedActivityIntent = null/);
  assert.match(app, /setAttribute\("aria-pressed", "false"\)/);
});

test("D103B affiche Votre prochaine balade sur le même DOM responsive et desktop", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.equal((html.match(/Votre prochaine balade/g) || []).length, 2); // aria-label + titre visible, un seul bloc
  assert.equal((html.match(/class="d103-next-walk"/g) || []).length, 1);
});
