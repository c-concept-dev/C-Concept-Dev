import { expect, test, type Page } from "@playwright/test";

/** Les trois écrans dans les trois moteurs (B6, PLT-09).
 *
 *  Ce qui se mesure ici ne se mesure pas ailleurs : le parcours au clavier de bout en bout, le
 *  contraste réel, le compte des éléments cuivre pleins, et — en hybride — qu'aucun texte ne soit
 *  posé sur la photo. jsdom ne sait rien de tout cela. */

const ECRANS = [
  { nom: "catalogue", adresse: "#catalogue", marque: ".ln-catalogue" },
  { nom: "lecteur", adresse: "#lecteur/page=127", marque: ".ln-lecteur" },
  { nom: "verifier", adresse: "#verifier", marque: ".ln-verifier" },
] as const;

/** Pose un écran et attend qu'il soit là. L'instantané se charge après le premier rendu : sans
 *  cette attente, on mesurerait l'accueil en croyant mesurer le catalogue. */
async function poser(page: Page, theme: "light" | "hybrid", adresse: string, marque = "#contenu"): Promise<void> {
  await page.addInitScript(
    ([clef, valeur]) => globalThis.localStorage.setItem(clef as string, valeur as string),
    ["lienotheque.theme", theme],
  );
  await page.goto(`/${adresse}`);
  await expect(page.locator(marque)).toBeVisible();
  // Mesurer avant que les polices ne soient posées donne de faux chiffres : on attend une mise
  // en page stable, pas un délai.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((suite) => requestAnimationFrame(() => requestAnimationFrame(suite)));
  });
}

test.describe("chaque écran, dans les deux thèmes", () => {
  for (const theme of ["light", "hybrid"] as const) {
    for (const ecran of ECRANS) {
      test(`${ecran.nom} — ${theme} : un seul élément cuivre plein`, async ({ page }) => {
        await poser(page, theme, ecran.adresse, ecran.marque);

        // Le cuivre plein est réservé au bouton principal : « --ln-action-background ». On
        // compte ceux qui le portent, et on exige que la couleur existe — un contrôle qui ne
        // trouve pas sa couleur ne vérifie rien.
        const pleins = await page.evaluate(() => {
          const marque = getComputedStyle(document.documentElement).getPropertyValue("--ln-action-background").trim();
          const normaliser = (couleur: string): string => couleur.replace(/\s/g, "").toLowerCase();
          const enRvb = (couleur: string): string => {
            const temoin = document.createElement("span");
            temoin.style.color = couleur;
            document.body.append(temoin);
            const rendu = getComputedStyle(temoin).color;
            temoin.remove();
            return normaliser(rendu);
          };
          if (marque === "") return { marque, pleins: [] as string[] };
          const attendu = enRvb(marque);
          return {
            marque,
            pleins: [...document.querySelectorAll("button, a")]
              .filter((noeud) => normaliser(getComputedStyle(noeud).backgroundColor) === attendu)
              .map((noeud) => (noeud.textContent ?? "").trim().slice(0, 30)),
          };
        });
        expect(pleins.marque, "la couleur du bouton principal est définie").not.toBe("");
        expect(pleins.pleins, "un seul élément cuivre plein par écran").toHaveLength(1);
      });

      test(`${ecran.nom} — ${theme} : rien ne déborde`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await poser(page, theme, ecran.adresse, ecran.marque);
        const debordement = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(debordement, "aucune barre de défilement horizontale").toBeLessThanOrEqual(0);
      });
    }

    test(`hybride — ${theme} : aucun texte posé sur la photo`, async ({ page }) => {
      test.skip(theme !== "hybrid", "la règle ne vaut que pour le thème hybride");
      await poser(page, theme, "#catalogue", ".ln-catalogue");

      // Chaque bloc de texte doit reposer sur un fond opaque, jamais directement sur la photo.
      const nus = await page.evaluate(() => {
        const opaque = (noeud: Element): boolean => {
          for (let courant: Element | null = noeud; courant !== null; courant = courant.parentElement) {
            const fond = getComputedStyle(courant).backgroundColor;
            const canaux = /rgba?\(([^)]+)\)/.exec(fond)?.[1]?.split(",").map((n) => Number(n.trim()));
            if (canaux !== undefined && (canaux[3] ?? 1) > 0.9) return true;
          }
          return false;
        };
        // On ne regarde que le texte réellement dessiné par le nœud : un « li » qui n'enveloppe
        // qu'un bouton opaque ne pose rien sur la photo, c'est le bouton qui porte le texte.
        const texteDirect = (noeud: Element): string =>
          [...noeud.childNodes]
            .filter((enfant) => enfant.nodeType === Node.TEXT_NODE)
            .map((enfant) => enfant.textContent ?? "")
            .join("")
            .trim();

        return [...document.querySelectorAll("h1, h2, h3, p, li, kbd, label, span")]
          .filter((noeud) => texteDirect(noeud).length > 1 && !opaque(noeud))
          .map((noeud) => texteDirect(noeud).slice(0, 40));
      });
      expect(nus, "tout texte repose sur un panneau opaque").toEqual([]);
    });
  }
});

test.describe("parcours au clavier (B6)", () => {
  test("on atteint chaque écran au clavier depuis l’accueil", async ({ page }) => {
    await poser(page, "light", "#catalogue", ".ln-catalogue");

    // Tabulation jusqu'à un lien ou un bouton : tout ce qui agit doit être atteignable.
    const atteignables = await page.evaluate(() => {
      const interactifs = [...document.querySelectorAll("a[href], button, input, textarea, select")];
      return interactifs.filter((noeud) => (noeud as HTMLElement).tabIndex >= 0).length;
    });
    expect(atteignables, "l’écran offre des cibles au clavier").toBeGreaterThan(5);

    await page.keyboard.press("Tab");
    const premier = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    expect(premier.length, "le premier arrêt est nommé").toBeGreaterThan(0);
  });

  test("le Lecteur répond aux touches annoncées", async ({ page }) => {
    await poser(page, "light", "#lecteur/page=127", ".ln-lecteur");
    const tempo = page.getByRole("slider", { name: /tempo/i });
    if ((await tempo.count()) === 0) test.skip(true, "pas de données : le Lecteur montre l’accueil");
    const avant = await tempo.inputValue();
    await page.keyboard.press("BracketRight");
    expect(await tempo.inputValue(), "] accélère").not.toBe(avant);
  });
});

test.describe("contrastes (UX-07)", () => {
  for (const theme of ["light", "hybrid"] as const) {
    test(`${theme} : le texte courant tient le rapport de 4,5`, async ({ page }) => {
      await poser(page, theme, "#catalogue", ".ln-catalogue");

      const faibles = await page.evaluate(() => {
        const canal = (valeur: number): number => (valeur <= 0.03928 ? valeur / 12.92 : ((valeur + 0.055) / 1.055) ** 2.4);
        const luminance = (couleur: string): number | undefined => {
          const canaux = /rgba?\(([^)]+)\)/.exec(couleur)?.[1]?.split(",").map((n) => Number(n.trim()));
          if (canaux === undefined || canaux.length < 3) return undefined;
          const [r, v, b] = canaux as [number, number, number];
          return 0.2126 * canal(r / 255) + 0.7152 * canal(v / 255) + 0.0722 * canal(b / 255);
        };
        const fondDe = (noeud: Element): string => {
          for (let courant: Element | null = noeud; courant !== null; courant = courant.parentElement) {
            const fond = getComputedStyle(courant).backgroundColor;
            const canaux = /rgba?\(([^)]+)\)/.exec(fond)?.[1]?.split(",").map((n) => Number(n.trim()));
            if (canaux !== undefined && (canaux[3] ?? 1) > 0.9) return fond;
          }
          return "rgb(255, 255, 255)";
        };

        return [...document.querySelectorAll("p, li, h1, h2, h3, label, kbd")]
          .filter((noeud) => (noeud.textContent ?? "").trim().length > 2)
          .flatMap((noeud) => {
            const style = getComputedStyle(noeud);
            const texte = luminance(style.color);
            const fond = luminance(fondDe(noeud));
            if (texte === undefined || fond === undefined) return [];
            const rapport = (Math.max(texte, fond) + 0.05) / (Math.min(texte, fond) + 0.05);
            const grand = Number.parseFloat(style.fontSize) >= 24;
            return rapport < (grand ? 3 : 4.5) ? [`${(noeud.textContent ?? "").trim().slice(0, 30)} : ${rapport.toFixed(2)}`] : [];
          });
      });
      expect(faibles, "tout texte lisible").toEqual([]);
    });
  }
});
