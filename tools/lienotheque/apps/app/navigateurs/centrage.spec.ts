import { expect, test, type Page } from "@playwright/test";

/** UX : au premier lancement, le contenu est centré horizontalement dans la fenêtre.
 *  Mesuré ici au pixel près, dans trois moteurs — jsdom en était incapable. */

const LARGEURS = [820, 1024, 1600] as const;

/** Écart entre le centre de l'élément et le centre de la fenêtre, en pixels. */
async function ecartDeCentrage(page: Page, selecteur: string): Promise<number> {
  const boite = await page.locator(selecteur).boundingBox();
  expect(boite, `${selecteur} doit être visible`).not.toBeNull();
  const fenetre = page.viewportSize();
  expect(fenetre).not.toBeNull();
  return boite!.x + boite!.width / 2 - fenetre!.width / 2;
}

async function poser(page: Page, theme: "light" | "hybrid"): Promise<void> {
  await page.addInitScript(
    ([cle, valeur]) => globalThis.localStorage.setItem(cle as string, valeur as string),
    ["lienotheque.theme", theme],
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Liénothèque" })).toBeVisible();
}

for (const theme of ["light", "hybrid"] as const) {
  test.describe(`premier lancement, thème ${theme}`, () => {
    for (const largeur of LARGEURS) {
      test(`contenu centré à ${largeur} px`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 900 });
        await poser(page, theme);

        // Un demi-pixel de tolérance : les moteurs arrondissent, ils ne décentrent pas.
        expect(Math.abs(await ecartDeCentrage(page, ".ln-premier__accroche"))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(await ecartDeCentrage(page, ".ln-depot"))).toBeLessThanOrEqual(0.5);
      });
    }

    test("le panneau et la zone de dépôt partagent le même axe et la même largeur", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 900 });
      await poser(page, theme);

      const accroche = (await page.locator(".ln-premier__accroche").boundingBox())!;
      const depot = (await page.locator(".ln-depot").boundingBox())!;
      expect(Math.abs(accroche.x - depot.x), "mêmes bords gauches").toBeLessThanOrEqual(0.5);
      expect(Math.abs(accroche.width - depot.width), "mêmes largeurs").toBeLessThanOrEqual(0.5);
      expect(depot.y, "la zone de dépôt est dessous").toBeGreaterThan(accroche.y + accroche.height - 1);
    });

    test("le logo porte une largeur et une hauteur dans tous les moteurs", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 900 });
      await poser(page, theme);

      // Firefox rendait une image de 0 pixel : largeur en pourcentage dans un parent de largeur
      // indéfinie. Le logo, donc, invisible.
      const logo = (await page.locator(".ln-premier__logo").boundingBox())!;
      expect(logo.width, "le logo a une largeur").toBeGreaterThan(100);
      expect(logo.height, "le logo a une hauteur").toBeGreaterThan(20);
      expect(Math.abs(await ecartDeCentrage(page, ".ln-premier__logo"))).toBeLessThanOrEqual(0.5);
    });

    test("rien ne déborde : pas de défilement horizontal", async ({ page }) => {
      await page.setViewportSize({ width: 820, height: 900 });
      await poser(page, theme);

      const debordement = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(debordement, "aucune barre de défilement horizontale").toBeLessThanOrEqual(0);
    });
  });
}
