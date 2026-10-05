import { expect, test, type Page } from "@playwright/test";

/** Le fil entre l'élément actif et son segment (B1, PLT-09).
 *
 *  Il relie deux panneaux : il part de l'endroit où le numéro a été lu, et doit **s'arrêter au
 *  bord** du segment. Le laisser entrer dans la forme d'onde, c'est barrer d'un trait ce qu'il
 *  désigne — et jsdom ne sait pas dire où un tracé tombe. */

type Theme = "light" | "hybrid";

async function poser(page: Page, theme: Theme, element?: string): Promise<void> {
  await page.addInitScript(([c, v]) => globalThis.localStorage.setItem(c as string, v as string), ["lienotheque.theme", theme]);
  await page.goto(element === undefined ? "/#lecteur/page=3" : `/#lecteur/page=3&element=${element}`);
  await expect(page.locator(".ln-lecteur")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((suite) => requestAnimationFrame(() => requestAnimationFrame(suite)));
  });
}


/** Extrémités du tracé, en coordonnées de la page. */
async function mesurer(page: Page) {
  return page.evaluate(() => {
    const fil = document.querySelector<SVGSVGElement>(".ln-fil-segment");
    const trace = fil?.querySelector("path");
    const segment = document.querySelector<HTMLElement>(".ln-ecoute__segment--actif");
    const onde = document.querySelector<HTMLElement>(".ln-ecoute__onde");
    if (fil === null || trace === null || trace === undefined || segment === null || onde === null) return undefined;

    const cadre = fil.getBoundingClientRect();
    const longueur = trace.getTotalLength();
    // Le tracé est dessiné dans le repère du cadre : on ramène ses points à l'écran.
    const enEcran = (point: DOMPoint) => ({ x: cadre.left + point.x, y: cadre.top + point.y });
    const pas = 60;
    const points = Array.from({ length: pas + 1 }, (_, rang) => enEcran(trace.getPointAtLength((longueur * rang) / pas)));

    return {
      fin: points[points.length - 1]!,
      points,
      segment: segment.getBoundingClientRect().toJSON(),
      onde: onde.getBoundingClientRect().toJSON(),
    };
  });
}

for (const theme of ["light", "hybrid"] as const) {
  test.describe(`le fil s'arrête au segment — ${theme}`, () => {
    test("son extrémité tombe sur le bord gauche du segment actif", async ({ page, browserName }) => {
      await poser(page, theme);
      const mesure = await mesurer(page);
      test.skip(mesure === undefined, "aucun fil : pas de segment actif sur cette page");

      // Deux pixels de tolérance : les moteurs arrondissent les sous-pixels autrement.
      expect(Math.abs(mesure!.fin.x - mesure!.segment.left), `${browserName} : extrémité en x`).toBeLessThanOrEqual(2);
      expect(mesure!.fin.y, "dans la hauteur du segment, bords compris").toBeGreaterThanOrEqual(mesure!.segment.top - 2);
      expect(mesure!.fin.y).toBeLessThanOrEqual(mesure!.segment.bottom + 2);
    });

    test("et aucun point du tracé n'entre dans la forme d'onde", async ({ page, browserName }) => {
      await poser(page, theme);
      const mesure = await mesurer(page);
      test.skip(mesure === undefined, "aucun fil");

      const dedans = mesure!.points.filter(
        (point) =>
          point.x > mesure!.onde.left + 2 &&
          point.x < mesure!.onde.right - 2 &&
          point.y > mesure!.onde.top + 2 &&
          point.y < mesure!.onde.bottom - 2,
      );
      expect(dedans, `${browserName} : ${dedans.length} point(s) dans l'onde`).toEqual([]);
    });
  });
}

/** Une page dont trois éléments partagent la même piste.
 *
 *  F3 ne la produit pas : chacun de ses éléments est seul sur sa piste, donc le segment actif
 *  commence toujours au bord de l'onde, et le fil s'y arrête sans avoir rien à éviter. Le cas
 *  qui compte est celui d'un segment au fond de l'onde — et il faut le construire pour
 *  l'éprouver. Le CDC le prévoit : « plusieurs éléments par piste ».
 */
const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;

async function servirTroisSurUnePiste(page: Page): Promise<void> {
  const media = { empreinte: "a".repeat(64), nom: "x.mp3", piste: 1, position: { segment: "inconnu" }, duree: 120 };
  const pourquoi = { preuve: "lu", confiance: 1, phrase: "Repère lu" };
  await page.route("**/donnees/bibliotheque.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: ID(1),
        nom: "Recueil",
        mots: { element: { un: "clause", plusieurs: "clauses" }, piste: { un: "plage", plusieurs: "plages" }, page: { un: "feuillet", plusieurs: "feuillets" } },
        compteurs: [],
        aVerifier: 0,
        filtres: [],
        douteux: [],
        pages: [
          {
            numero: 3,
            texte: [],
            traduction: [],
            elements: [0, 1, 2].map((rang) => ({
              ancreId: ID(20 + rang),
              numero: String(401 + rang),
              page: 3,
              zone: { x: 0.08, y: 0.2 + rang * 0.25, l: 0.05, h: 0.03 },
              media,
              pourquoi,
              aVerifier: false,
            })),
          },
        ],
      }),
    });
  });
}

for (const theme of ["light", "hybrid"] as const) {
  test.describe(`le fil n'entre pas dans l'onde, même pour un segment éloigné — ${theme}`, () => {
    test("trois éléments sur une piste : le dernier segment est au fond de l'onde", async ({ page, browserName }) => {
      await servirTroisSurUnePiste(page);
      await poser(page, theme, ID(22));
      const mesure = await mesurer(page);
      test.skip(mesure === undefined, "aucun fil");

      // Le segment doit bien être éloigné du bord, sans quoi le contrôle ne prouve rien.
      expect(mesure!.segment.left - mesure!.onde.left, "le segment est loin dans l'onde").toBeGreaterThan(20);

      expect(Math.abs(mesure!.fin.x - mesure!.segment.left), `${browserName} : extrémité en x`).toBeLessThanOrEqual(2);
      const dedans = mesure!.points.filter(
        (point) =>
          point.x > mesure!.onde.left + 2 &&
          point.x < mesure!.onde.right - 2 &&
          point.y > mesure!.onde.top + 2 &&
          point.y < mesure!.onde.bottom - 2,
      );
      expect(dedans, `${browserName} : ${dedans.length} point(s) dans l'onde`).toEqual([]);
    });
  });
}
