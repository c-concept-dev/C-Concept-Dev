import { test, expect } from "@playwright/test";

// D090B — batterie de non-régression issue du stress test D090.
// Réutilise volontairement les mêmes fonctions utilitaires que app.spec.mjs
// (mockWorker, openApp, fillMinimumProfile) plutôt que d'en réinventer,
// pour rester aligné sur les vrais sélecteurs de l'application.
// Import relatif : ce fichier est destiné à vivre dans e2e/ aux côtés de app.spec.mjs.

const APP_URL = "/je-marche-comme-je-suis-p0.html";
const WORKER_PATTERN = "**/jmmjs-map-services.11drumboy11.workers.dev/v1/**";

function routeFeature({ lon, lat, index, target, durationMinutes }) {
  const scale = Math.max(0.0035, Math.min(0.012, target / 550000));
  const variants = [
    [[0, 0], [1, 0.35], [0.7, 1], [-0.25, 0.75], [0, 0]],
    [[0, 0], [0.3, 1], [-0.8, 0.85], [-1, -0.2], [0, 0]],
    [[0, 0], [-0.3, -1], [0.8, -0.75], [1, 0.25], [0, 0]],
  ];
  const coords = variants[index % variants.length].map(([x, y], pointIndex) => [
    lon + x * scale,
    lat + y * scale,
    145 + pointIndex * 5 + index * 2,
  ]);
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {
      summary: { distance: target * (0.62 + index * 0.12), duration: durationMinutes * 60 },
      extras: {
        surface: { summary: [{ value: 1, amount: 100, distance: target }] },
        steepness: {
          summary: [
            { value: 1, amount: 50, distance: target / 2 },
            { value: -1, amount: 50, distance: target / 2 },
          ],
        },
        waytypes: { summary: [{ value: 1, amount: 100, distance: target }] },
      },
      segments: [
        {
          steps: [
            { instruction: "Partir du point de départ", duration: durationMinutes * 30 },
            { instruction: "Revenir au point de départ", duration: durationMinutes * 30 },
          ],
        },
      ],
    },
  };
}

async function mockWorker(page) {
  await page.route(WORKER_PATTERN, async (route) => {
    const request = route.request();
    const body = request.postDataJSON?.() || {};
    if (request.url().endsWith("/test")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    const [lon, lat] = body.coordinate || [1.432, 43.596];
    const target = Number(body.targetMeters) || 2500;
    const routes = [18, 29, 41].map((duration, index) =>
      routeFeature({ lon, lat, index, target, durationMinutes: duration }),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ routes, requestCount: 3, partialErrors: 0 }),
    });
  });
}

async function openApp(page) {
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Créer ma balade sur mesure" }).filter({ visible: true }).first().click();
  await expect(page.locator("#place")).toBeVisible();
}

async function fillMinimumProfile(page) {
  await page.locator("#place").fill("Départ de test D090B");
  await page.locator("#lat").fill("43.596");
  await page.locator("#lon").fill("1.432");
  await page.locator("#duration").fill("60");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#footwear").selectOption({ label: "Baskets classiques" });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function calculateThreeRoutes(page) {
  await mockWorker(page);
  await openApp(page);
  await fillMinimumProfile(page);
  await page.getByRole("button", { name: "Confirmer et calculer" }).click();
  await expect(page.locator("#routeGrid .route-card")).toHaveCount(3);
}

// PW-D090-RES-001 (corrigé) — synchronisation de la sélection sur les quatre vues.
// Le texte réel dans le DOM est en casse mixte ("Trace mise en avant",
// "Parcours sélectionné") ; la majuscule visible dans la maquette d'origine
// vient uniquement d'un text-transform CSS. On capture le libellé réel de la
// carte choisie plutôt que de supposer un nom de parcours fixe, pour ne pas
// dépendre d'une donnée que le mock ne garantit pas.
test("D090B la sélection reste synchronisée sur les quatre vues", async ({ page }) => {
  await calculateThreeRoutes(page);

  const targetCard = page.locator('#routeGrid .route-card[data-route="1"]');
  const targetLabel = (await targetCard.locator(".route-name").textContent())?.trim();
  expect(targetLabel).toBeTruthy();

  await targetCard.click();

  await expect(targetCard).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#routeGrid .route-card[data-route="0"]')).toHaveAttribute("aria-pressed", "false");

  const compareRow = page.locator('.compare-route-pick[data-compare-route="1"]');
  await expect(compareRow).toHaveAttribute("aria-pressed", "true");

  const mapBadge = page.locator("#mapRouteSelection");
  await expect(mapBadge).toBeVisible();
  await expect(mapBadge).toContainText("Trace mise en avant");
  await expect(mapBadge).toContainText(targetLabel);

  const detailContext = page.locator(".selected-route-context");
  await expect(detailContext).toContainText("Parcours sélectionné");
  await expect(detailContext).toContainText(targetLabel);
});

// ST-NAV-001 — rotation et redimensionnement pendant la navigation plein écran.
// Couvre la régression de spécificité CSS déjà rencontrée trois fois
// (D079C, D079D, D090/D091) : body.navigating .results doit rester prioritaire
// quel que soit l'ordre des règles dans le fichier.
test("D090B la carte reste plein écran après rotation pendant le guidage", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (success) => {
      success({
        coords: { latitude: 43.596, longitude: 1.432, accuracy: 8, speed: 1.1, heading: 90 },
        timestamp: Date.now(),
      });
      return 90;
    };
    navigator.geolocation.clearWatch = () => {};
  });
  await calculateThreeRoutes(page);

  await page.locator("#startNavBtnTop").click();
  await expect(page.locator("body")).toHaveClass(/navigating/);
  await expect(page.locator(".result-map-block")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveClass(/navigating/);
  await expect(page.locator(".result-map-block")).toBeVisible();
  await expect(page.locator("#routeGrid")).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("body")).toHaveClass(/navigating/);
  await expect(page.locator(".result-map-block")).toBeVisible();
  await expect(page.locator("#routeGrid")).toBeHidden();

  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.getByRole("button", { name: "Arrêter" }).click();
  await expect(page.locator("body")).not.toHaveClass(/navigating/);
  expect(errors.join(" ")).not.toContain("exitFullscreen");
});
