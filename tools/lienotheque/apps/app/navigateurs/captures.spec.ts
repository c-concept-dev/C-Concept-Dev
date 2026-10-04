import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** Captures des trois écrans, en clair et en hybride (B6).
 *
 *  Elles ne jugent rien : elles servent à regarder. Le jugement est dans `ecrans.spec.ts`, qui
 *  mesure contrastes, cuivre plein et texte sur la photo. Les images vont au cache de travail,
 *  jamais au dépôt. */

const DOSSIER = process.env["LIENOTHEQUE_CAPTURES"] ?? join(process.cwd(), "test-results", "captures");

const ECRANS = [
  { nom: "catalogue", adresse: "#catalogue", marque: ".ln-catalogue" },
  { nom: "verifier", adresse: "#verifier", marque: ".ln-verifier" },
  { nom: "lecteur", adresse: "#lecteur/page=127", marque: ".ln-lecteur" },
] as const;

test.describe("captures", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "une seule capture par écran suffit à regarder");

  for (const theme of ["light", "hybrid"] as const) {
    for (const ecran of ECRANS) {
      test(`${ecran.nom} — ${theme}`, async ({ page }) => {
        mkdirSync(DOSSIER, { recursive: true });
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.addInitScript(
          ([clef, valeur]) => globalThis.localStorage.setItem(clef as string, valeur as string),
          ["lienotheque.theme", theme],
        );
        await page.goto(`/${ecran.adresse}`);
        await expect(page.locator(ecran.marque)).toBeVisible();
        // Les polices et le fond doivent être posés avant la prise de vue.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(DOSSIER, `${ecran.nom}-${theme}.png`), fullPage: true });
      });
    }
  }
});
