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

test("D103B l'accueil première visite possède un DOM unique desktop/mobile et deux portes d’entrée claires", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.equal((html.match(/id="d103Home"/g) || []).length, 1);
  assert.match(html, /De quoi avez-vous besoin aujourd’hui/);
  assert.match(html, /Je viens comme je suis,/);
  assert.match(html, /alt="et l’accompagnement s’adapte à moi\."/);
  assert.match(html, /Ma balade sur mesure/);
  assert.match(html, /Mon élan santé/);
  assert.match(html, /icons\/d103-brand-mark\.png/);
  assert.match(html, /icons\/d103-home-brand-desktop\.png/);
  assert.match(html, /icons\/d103-hero-script-desktop\.png/);
  assert.match(html, /icons\/d103-hero-script-mobile\.png/);
  assert.match(html, /icons\/d103-home-walk-card\.png/);
  assert.match(html, /icons\/d103-home-health-card\.png/);
  assert.match(html, /id="d103MobileMenu"/);
  assert.match(html, /Vos données restent ici/);
  assert.match(html, /Ce service ne remplace pas un avis médical/);
});

test("D103B3 uniformise les logos visibles avec l’identité validée", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.doesNotMatch(html, /icons\/jmmjs-icon\.svg/);
  assert.doesNotMatch(html, /class="brandmark"/);
  assert.doesNotMatch(html, /d103-brand-lines/);
  assert.match(html, /<header class="topbar">[\s\S]{0,700}d103-home-brand-desktop\.png/);
  assert.match(html, /id="d103HealthPendingHome"[\s\S]{0,500}d103-home-brand-desktop\.png/);
  assert.ok((html.match(/d103-brand-mark\.png/g) || []).length >= 3);
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
  assert.match(app, /function openD103WalkPath\(\)/);
  assert.match(app, /mode\("api"\)/);
});

test("D103B ne présélectionne aucune intention Activité au chargement", () => {
  const app = read("src/app.js");
  assert.doesNotMatch(app, /selectedActivityIntent/);
  assert.match(app, /statusNode\.hidden = true/);
  assert.match(app, /statusNode\.textContent = ""/);
});

test("D103B utilise une seule structure responsive et les assets graphiques exacts", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.equal((html.match(/id="d103Home"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="d103-home-responsive-v2"/);
  assert.doesNotMatch(html, /class="script"[^>]*>et l’accompagnement/);
  assert.match(html, /d103-returning-title-desktop\.png/);
  assert.match(html, /d103-exact\/feature-balades\.png/);
});


test("D103B2/P0-00N Mon élan santé ne choisit aucune intention et ouvre un état neutre", () => {
  const app = read("src/app.js");
  assert.match(app, /function openD103HealthPath\(\)[\s\S]{0,500}showD103HealthPending\(\)/);
  assert.doesNotMatch(app, /function deriveD103HealthIntent/);
  assert.doesNotMatch(app, /activityIntentForD103Goal/);
  assert.doesNotMatch(app, /openD103HealthPath\(["'](?:gentle_return|maintain|progress)["']\)/);
});

test("D103P0-00N l’écran transitoire santé ne collecte ni baseline ni état du jour", () => {
  const html = read("je-marche-comme-je-suis.template.html");
  assert.match(html, /id="d103HealthPending" hidden/);
  assert.match(html, /Cette partie de l’accompagnement est en préparation/);
  assert.doesNotMatch(html, /id="d103Baseline"/);
  assert.doesNotMatch(html, /id="d103Today"/);
  assert.doesNotMatch(html, /data-today-group/);
  assert.doesNotMatch(html, /data-baseline-group/);
});

test("D103P0-00N la branche santé transitoire ne lance jamais le moteur Balade", () => {
  const app = read("src/app.js");
  const start = app.indexOf("function openD103HealthPath()");
  const end = app.indexOf('if ($("#d103ChooseWalk"))', start);
  const healthBlock = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(healthBlock, /mode\("api"\)/);
  assert.doesNotMatch(healthBlock, /saveD103ActivityIntent/);
  assert.doesNotMatch(healthBlock, /gentle_return|maintain|progress/);
});
