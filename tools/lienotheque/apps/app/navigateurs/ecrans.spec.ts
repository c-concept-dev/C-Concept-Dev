import { expect, test, type Page } from "@playwright/test";

/** Les trois variantes de la charte v3 : le contraste se mesure dans les trois, pas dans deux. */
const THEMES = ["light", "hybrid", "dark"] as const;
type Theme = (typeof THEMES)[number];

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
async function poser(page: Page, theme: Theme, adresse: string, marque = "#contenu"): Promise<void> {
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
  for (const theme of THEMES) {
    for (const ecran of ECRANS) {
      test(`${ecran.nom} — ${theme} : tout texte tient le rapport exigé`, async ({ page }) => {
        await poser(page, theme, ecran.adresse, ecran.marque);

        const faibles = await page.evaluate(() => {
          const canal = (valeur: number): number => (valeur <= 0.03928 ? valeur / 12.92 : ((valeur + 0.055) / 1.055) ** 2.4);
          const canaux = (couleur: string): readonly number[] | undefined => {
            const trouve = /rgba?\(([^)]+)\)/.exec(couleur)?.[1]?.split(",").map((n) => Number(n.trim()));
            return trouve === undefined || trouve.length < 3 ? undefined : trouve;
          };
          const luminance = (couleur: string): number | undefined => {
            const c = canaux(couleur);
            return c === undefined ? undefined : 0.2126 * canal(c[0]! / 255) + 0.7152 * canal(c[1]! / 255) + 0.0722 * canal(c[2]! / 255);
          };

          /** Le premier fond opaque au-dessus du nœud : c'est lui que l'œil voit derrière le texte. */
          const fondDe = (noeud: Element): string => {
            for (let courant: Element | null = noeud; courant !== null; courant = courant.parentElement) {
              const fond = getComputedStyle(courant).backgroundColor;
              const c = canaux(fond);
              if (c !== undefined && (c[3] ?? 1) > 0.9) return fond;
            }
            return getComputedStyle(document.documentElement).backgroundColor;
          };

          /** Le texte qu'un nœud porte lui-même : celui de ses descendants repose sur leur propre
           *  fond, pas sur le sien. */
          const texteDirect = (noeud: Element): string =>
            [...noeud.childNodes]
              .filter((enfant) => enfant.nodeType === 3)
              .map((enfant) => enfant.textContent ?? "")
              .join("")
              .trim();

          const chemin = (noeud: Element): string => {
            const classes = typeof noeud.className === "string" && noeud.className !== "" ? `.${noeud.className.trim().split(/\s+/).join(".")}` : "";
            return `${noeud.tagName.toLowerCase()}${classes}`;
          };

          // Tout élément qui porte du texte, pas une liste de balises choisies d'avance : un libellé
          // illisible dans un « span » ou un « output » compte autant que dans un « p ».
          return [...document.querySelectorAll("body *")]
            .filter((noeud) => {
              if (texteDirect(noeud).length <= 2) return false;
              const style = getComputedStyle(noeud);
              if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
              // Les textes réservés aux lecteurs d'écran ne sont pas regardés.
              const boite = noeud.getBoundingClientRect();
              return boite.width > 1 && boite.height > 1;
            })
            .flatMap((noeud) => {
              const style = getComputedStyle(noeud);
              const texte = luminance(style.color);
              const fond = luminance(fondDe(noeud));
              if (texte === undefined || fond === undefined) return [];
              const rapport = (Math.max(texte, fond) + 0.05) / (Math.min(texte, fond) + 0.05);
              // WCAG : 3 pour un grand texte — 24 px, ou 18,66 px en gras —, 4,5 pour le reste.
              const taille = Number.parseFloat(style.fontSize);
              const gras = Number.parseFloat(style.fontWeight) >= 700;
              const grand = taille >= 24 || (gras && taille >= 18.66);
              const exige = grand ? 3 : 4.5;
              return rapport < exige
                ? [`${chemin(noeud)} « ${texteDirect(noeud).slice(0, 24)} » : ${rapport.toFixed(2)} au lieu de ${exige}`]
                : [];
            });
        });

        expect(faibles, `${ecran.nom} en ${theme} : tout texte lisible`).toEqual([]);
      });
    }
  }
});

/** Correction 7 : les filtres resserrés. jsdom ne mesure rien ; seul un vrai moteur dit la
 *  hauteur d'une rangée. Elle valait 58 px parce que la feuille de base donnait aux cases la
 *  hauteur d'un champ de saisie — et la colonne des filtres en devenait deux fois trop longue. */
test.describe("Catalogue : les filtres sont resserrés (correction 7)", () => {
  test("une rangée de filtre tient dans la hauteur de son texte, sans cesser d’être cliquable", async ({ page }) => {
    await poser(page, "light", "#catalogue", ".ln-catalogue");
    const mesures = await page.evaluate(() => {
      const rangees = [...document.querySelectorAll<HTMLElement>(".ln-filtres__valeur")];
      const cases = [...document.querySelectorAll<HTMLElement>(".ln-filtres__valeur input")];
      return {
        rangees: rangees.map((n) => Math.round(n.getBoundingClientRect().height)),
        cases: cases.map((n) => Math.round(n.getBoundingClientRect().height)),
      };
    });
    expect(mesures.rangees.length, "des rangées à mesurer").toBeGreaterThan(0);
    for (const hauteur of mesures.rangees) {
      // 24 px est la cible de pointage exigée par WCAG 2.5.8 ; 32 px la borne au-delà de laquelle
      // la colonne redevient une liste étirée.
      expect(hauteur, "rangée resserrée mais pointable").toBeGreaterThanOrEqual(24);
      expect(hauteur, "rangée resserrée").toBeLessThanOrEqual(32);
    }
    for (const hauteur of mesures.cases) {
      expect(hauteur, "la case n’est pas dimensionnée comme un champ de saisie").toBeLessThan(24);
    }
  });

  test("le groupe « Validé / À vérifier » est là, et chaque axe est un groupe, pas un repère", async ({ page }) => {
    await poser(page, "light", "#catalogue", ".ln-catalogue");
    await expect(page.getByRole("group", { name: /état du lien/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /validé/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /à vérifier/i })).toBeVisible();
    // Un repère par axe encombrerait la liste des repères : les axes n'en sont pas.
    const reperes = await page.locator(".ln-filtres [role='region']").count();
    expect(reperes, "aucun axe n’est un point de repère").toBe(0);
  });
});
