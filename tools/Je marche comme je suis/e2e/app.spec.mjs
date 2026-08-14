import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "/je-marche-comme-je-suis-p0.html";
const WORKER_PATTERN = "**/jmmjs-map-services.11drumboy11.workers.dev/v1/**";

function routeFeature({ lon, lat, index, target, durationMinutes }) {
  const scale = Math.max(0.0035, Math.min(0.012, target / 550000));
  const variants = [
    [[0, 0], [1, 0.35], [0.7, 1], [-0.25, 0.75], [0, 0]],
    [[0, 0], [0.3, 1], [-0.8, 0.85], [-1, -0.2], [0, 0]],
    [[0, 0], [-0.3, -1], [0.8, -0.75], [1, 0.25], [0, 0]]
  ];
  const coords = variants[index % variants.length].map(([x, y], pointIndex) => [
    lon + x * scale,
    lat + y * scale,
    145 + pointIndex * 5 + index * 2
  ]);
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {
      summary: { distance: target * (0.62 + index * 0.12), duration: durationMinutes * 60 },
      extras: {
        surface: { summary: [{ value: 1, amount: 100, distance: target }] },
        steepness: { summary: [{ value: 1, amount: 50, distance: target / 2 }, { value: -1, amount: 50, distance: target / 2 }] },
        waytypes: { summary: [{ value: 1, amount: 100, distance: target }] }
      },
      segments: [{ steps: [{ instruction: "Partir du point de départ", duration: durationMinutes * 30 }, { instruction: "Revenir au point de départ", duration: durationMinutes * 30 }] }]
    }
  };
}

async function mockWorker(page, { fail = false } = {}) {
  let calls = 0;
  await page.route(WORKER_PATTERN, async (route) => {
    calls += 1;
    if (fail) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Service ORS simulé indisponible." } }) });
      return;
    }
    const request = route.request();
    const body = request.postDataJSON?.() || {};
    if (request.url().endsWith("/test")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    const [lon, lat] = body.coordinate || [1.432, 43.596];
    const target = Number(body.targetMeters) || 2500;
    const routes = [18, 29, 41].map((duration, index) => routeFeature({ lon, lat, index, target, durationMinutes: duration }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ routes, requestCount: 3, partialErrors: 0 }) });
  });
  return () => calls;
}

async function openApp(page) {
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Créer ma balade sur mesure" }).filter({ visible: true }).first().click();
  await expect(page.locator("#place")).toBeVisible();
}

async function fillMinimumProfile(page) {
  await page.locator("#place").fill("Départ de test D-023");
  await page.locator("#lat").fill("43.596");
  await page.locator("#lon").fill("1.432");
  await page.locator("#duration").fill("60");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#footwear").selectOption({ label: "Baskets classiques" });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator("#constraintSummary")).toContainText(/Temps utilisable|marge|retour/i);
}

test("@critical crée des boucles réelles auditées sans dépasser trois résultats", async ({ page }) => {
  const callCount = await mockWorker(page);
  await openApp(page);
  await fillMinimumProfile(page);
  await page.getByRole("button", { name: "Confirmer et calculer" }).click();
  await expect(page.locator("#routeGrid .route-card")).toHaveCount(3);
  await expect(page.locator("#resultMode")).toHaveText("Calcul direct");
  await expect(page.locator("#routeGrid")).toContainText(/contrôle.*respecté/i);
  expect(callCount()).toBeLessThanOrEqual(4);
});

test("@critical affiche une erreur actionnable sans route fictive quand ORS échoue", async ({ page }) => {
  await mockWorker(page, { fail: true });
  await openApp(page);
  await fillMinimumProfile(page);
  await page.getByRole("button", { name: "Confirmer et calculer" }).click();
  await expect(page.locator("#toast")).toContainText(/indisponible|aucun repli non vérifié/i);
  await expect(page.locator("#routeGrid .route-card")).toHaveCount(0);
});

test("@critical importe un GPX et conserve les données terrain absentes comme invérifiables", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /Analyser un GPX/i }).click();
  await page.locator("#place").fill("Départ GPX D-023");
  await page.locator("#lat").fill("43.596");
  await page.locator("#lon").fill("1.432");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#footwear").selectOption({ label: "Baskets classiques" });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#gpxFile").setInputFiles(path.join(here, "fixtures", "partial-elevation.gpx"));
  await page.getByRole("button", { name: "Confirmer et analyser le GPX" }).click();
  await expect(page.locator("#routeGrid .route-card")).toHaveCount(1);
  await expect(page.locator("#resultMode")).toHaveText("GPX importé");
  await expect(page.locator("#detail")).toContainText(/invérifiable|à vérifier|profil non disponible/i);
});

test("@critical télécharge les exports GPX et JSON de la route sélectionnée", async ({ page }) => {
  await mockWorker(page);
  await openApp(page);
  await fillMinimumProfile(page);
  await page.getByRole("button", { name: "Confirmer et calculer" }).click();
  await expect(page.locator("#routeGrid .route-card")).toHaveCount(3);

  const gpxDownload = page.waitForEvent("download");
  await page.locator("#gpxBtn").click();
  expect((await gpxDownload).suggestedFilename()).toMatch(/\.gpx$/);

  const jsonDownload = page.waitForEvent("download");
  await page.locator("#jsonBtn").click();
  expect((await jsonDownload).suggestedFilename()).toMatch(/\.json$/);
});

test("@critical la synthèse avant calcul permet de revenir modifier une règle", async ({ page }) => {
  await openApp(page);
  await fillMinimumProfile(page);
  const summary = page.locator("#constraintSummary");
  await expect(summary).toBeVisible();
  const modify = summary.getByRole("button", { name: "Modifier" }).first();
  await modify.click();
  await expect(page.locator("#create")).not.toBeVisible();
});

test("@critical D-024 affiche et audite une limitation fonctionnelle confirmée", async ({ page }) => {
  await mockWorker(page);
  await openApp(page);
  await page.locator("#place").fill("Départ D-024");
  await page.locator("#lat").fill("43.596");
  await page.locator("#lon").fill("1.432");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#footwear").selectOption({ label: "Baskets classiques" });
  await page.locator("#limitationSide").selectOption({ label: "Droit" });
  await page.locator("#limitationTrigger").selectOption({ label: "Descente" });
  await page.locator("#limitationConsequence").selectOption({ label: "Éviter" });
  await page.locator("#limitationConfirmed").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator("#constraintSummary")).toContainText("seuil 4 %");
  await expect(page.locator("#constraintSummary")).toContainText(/aucun seuil explicite/i);
  await page.getByRole("button", { name: "Confirmer et calculer" }).click();
  await expect(page.locator("#detail")).toContainText(/Descente à éviter|pente descendante/i);
});

test("@critical reste utilisable sur iPhone sans débordement horizontal majeur", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone", "Contrôle réservé au projet iPhone");
  await openApp(page);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 4);
  await expect(page.getByRole("button", { name: /Créer ma balade sur mesure/i })).toBeVisible();
});
