import { expect, test, type Page } from "@playwright/test";

/** Mise en page du Lecteur, mesurée dans de vrais moteurs (B6, PLT-09, UX-07).
 *
 *  Deux défauts relevés sur F3 réel, que jsdom ne peut pas voir : la page débordait sur la ligne
 *  des raccourcis — une colonne calée sur son contenu plutôt que sur la hauteur de sa rangée —,
 *  et le bouton « suivant » montrait une icône que l'hybride ne laissait pas voir.
 *
 *  On mesure des rectangles et des contrastes, pas des captures : une capture dit qu'une chose a
 *  changé, elle ne dit pas laquelle, et elle change à chaque police. */

type Theme = "light" | "hybrid" | "dark";

async function poser(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([clef, valeur]) => globalThis.localStorage.setItem(clef as string, valeur as string),
    ["lienotheque.theme", theme],
  );
  await page.goto("/#lecteur/page=127");
  await expect(page.locator(".ln-lecteur")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((suite) => requestAnimationFrame(() => requestAnimationFrame(suite)));
  });
}

/** Luminance relative WCAG d'une couleur rendue par le moteur. */
function luminance(couleur: string): number {
  const [r, v, b] = (couleur.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number) as [number, number, number];
  const canal = (valeur: number): number => {
    const part = valeur / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(b);
}

const contraste = (a: string, b: string): number => {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (haut + 0.05) / (bas + 0.05);
};

test.describe("la page ne déborde pas sur la ligne des raccourcis", () => {
  for (const theme of ["light", "hybrid"] as const) {
    test(`${theme} : le corps s'arrête avant le pied`, async ({ page }) => {
      await poser(page, theme);

      const mesures = await page.evaluate(() => {
        const corps = document.querySelector(".ln-lecteur__corps");
        const pied = document.querySelector(".ln-lecteur__pied");
        const colonne = document.querySelector(".ln-lecteur__page");
        if (corps === null || pied === null || colonne === null) return undefined;
        return {
          basDuCorps: corps.getBoundingClientRect().bottom,
          basDeLaColonne: colonne.getBoundingClientRect().bottom,
          hautDuPied: pied.getBoundingClientRect().top,
        };
      });

      expect(mesures, "les trois repères sont là").toBeDefined();
      // Un pixel de tolérance : les moteurs arrondissent les sous-pixels différemment.
      expect(mesures!.basDuCorps, "le corps finit au-dessus du pied").toBeLessThanOrEqual(mesures!.hautDuPied + 1);
      expect(mesures!.basDeLaColonne, "et la colonne de la page avec lui").toBeLessThanOrEqual(mesures!.hautDuPied + 1);
    });

    test(`${theme} : la page défile dans sa colonne au lieu de la pousser`, async ({ page }) => {
      await poser(page, theme);

      const colonne = await page.evaluate(() => {
        const element = document.querySelector(".ln-lecteur__page");
        if (element === null) return undefined;
        return { visible: element.clientHeight, total: element.scrollHeight, deborde: getComputedStyle(element).overflowY };
      });

      expect(colonne, "la colonne de la page est là").toBeDefined();
      // Ce qui compte n'est pas qu'elle déborde — cela dépend de la taille de la fenêtre — mais
      // que son débordement se règle par un défilement, et jamais en grandissant.
      expect(["auto", "scroll"], "son débordement défile").toContain(colonne!.deborde);
      expect(colonne!.visible, "elle a une hauteur bornée").toBeGreaterThan(0);
    });
  }
});

test.describe("le bouton « suivant » montre son icône dans les trois variantes (UX-07)", () => {
  for (const theme of ["light", "hybrid", "dark"] as const) {
    test(`${theme} : l'icône tient 3:1 sur son fond`, async ({ page }) => {
      await poser(page, theme);

      const mesure = await page.evaluate(() => {
        const bouton = document.querySelector<HTMLElement>(".ln-lecteur__pas button:last-of-type");
        if (bouton === null) return undefined;
        const trait = bouton.querySelector("svg");
        if (trait === null) return { fond: "", encre: "", traits: 0 };

        // Le fond effectif : le premier ancêtre qui en pose un. Un bouton transparent prend
        // celui du panneau qui le porte, et c'est contre lui que l'icône se lit.
        let fond = "rgba(0, 0, 0, 0)";
        for (let noeud: HTMLElement | null = bouton; noeud !== null; noeud = noeud.parentElement) {
          const pose = getComputedStyle(noeud).backgroundColor;
          if (pose !== "rgba(0, 0, 0, 0)" && pose !== "transparent") {
            fond = pose;
            break;
          }
        }
        return {
          fond,
          encre: getComputedStyle(trait).color,
          traits: trait.querySelectorAll("path, line, polyline, circle, rect").length,
          visible: bouton.getBoundingClientRect().width > 0 && getComputedStyle(trait).visibility !== "hidden",
        };
      });

      expect(mesure, "le bouton « suivant » est là").toBeDefined();
      expect(mesure!.traits, "et il porte une icône dessinée").toBeGreaterThan(0);
      expect(mesure!.visible, "visible à l'écran").toBe(true);
      // Contraste non textuel de WCAG 2.2 : un pictogramme porteur de sens tient 3:1.
      expect(contraste(mesure!.encre, mesure!.fond), `icône ${mesure!.encre} sur ${mesure!.fond}`).toBeGreaterThanOrEqual(3);
    });
  }
});

test.describe("la bande d'un élément contient son repère (B1)", () => {
  for (const theme of ["light", "hybrid"] as const) {
    test(`${theme} : sur F3 réel, aucun repère n'est coupé`, async ({ page, browserName }) => {
      await poser(page, theme);

      const mesure = await page.evaluate(() => {
        const feuille = document.querySelector<HTMLElement>(".ln-page__feuille");
        if (feuille === null) return undefined;
        const cadre = feuille.getBoundingClientRect();
        // L'instantané dit où chaque repère a été trouvé ; la bande, elle, se mesure à l'écran.
        return {
          cadre: { top: cadre.top, height: cadre.height },
          bandes: [...document.querySelectorAll<HTMLElement>(".ln-page__zone")].map((zone) => {
            const boite = zone.getBoundingClientRect();
            return { nom: zone.getAttribute("aria-label"), haut: boite.top, bas: boite.bottom };
          }),
        };
      });
      test.skip(mesure === undefined || mesure.bandes.length === 0, "aucune bande sur cette page");

      const reponse = await page.request.get("/donnees/bibliotheque.json");
      test.skip(!reponse.ok(), "aucun instantané à lire");
      const vue = (await reponse.json()) as {
        mots: { element: { un: string } };
        pages: { numero: number; elements: { numero: string; zoneRepere?: { y: number; h: number } }[] }[];
      };
      const feuille = vue.pages[0];
      test.skip(feuille === undefined, "instantané vide");

      const avecRepere = feuille!.elements.filter((element) => element.zoneRepere !== undefined);
      test.skip(avecRepere.length === 0, "aucun repère trouvé sur cette page");

      const coupes: string[] = [];
      for (const element of avecRepere) {
        const bande = mesure!.bandes.find((entree) => entree.nom?.endsWith(` ${element.numero}`) === true);
        if (bande === undefined) continue;
        const hautRepere = mesure!.cadre.top + element.zoneRepere!.y * mesure!.cadre.height;
        const basRepere = hautRepere + element.zoneRepere!.h * mesure!.cadre.height;
        // Un pixel de tolérance : les moteurs arrondissent les sous-pixels autrement.
        if (hautRepere < bande.haut - 1 || basRepere > bande.bas + 1)
          coupes.push(`${element.numero} : repère ${hautRepere.toFixed(1)}–${basRepere.toFixed(1)}, bande ${bande.haut.toFixed(1)}–${bande.bas.toFixed(1)}`);
      }

      expect(coupes, `${browserName} : ${coupes.length} repère(s) hors de leur bande`).toEqual([]);
      expect(avecRepere.length, "le contrôle a bien vu des repères").toBeGreaterThan(0);
    });
  }
});
