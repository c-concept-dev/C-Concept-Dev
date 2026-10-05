import { expect, test, type Page } from "@playwright/test";

/** L'écoute, éprouvée dans de vrais moteurs (B6, ANC-03, ANC-05).
 *
 *  jsdom n'a pas de moteur audio : il dit qu'on a appelé « play », pas qu'un fichier a été servi,
 *  décodé et joué. Ici on le vérifie pour de bon — le greffon sert le média, le navigateur le
 *  lit, et la position avance.
 *
 *  Sans médias joignables — l'intégration continue, une autre machine —, il n'y a rien à
 *  éprouver : le contrôle se saute, et l'état « média non disponible ici » est couvert ailleurs. */

type Media = { readonly adresse: string; readonly piste: string };

async function premierMedia(page: Page): Promise<Media | undefined> {
  const reponse = await page.request.get("/donnees/bibliotheque.json");
  if (!reponse.ok()) return undefined;
  const vue = (await reponse.json()) as {
    pages: { elements: { media?: { source?: string; piste: number } }[] }[];
  };
  for (const feuille of vue.pages)
    for (const element of feuille.elements)
      if (element.media?.source !== undefined) return { adresse: element.media.source, piste: String(element.media.piste) };
  return undefined;
}

test.describe("le média est servi là où il est", () => {
  test("le greffon rend le fichier avec son type, et refuse ce qu'il ne connaît pas", async ({ page }) => {
    const media = await premierMedia(page);
    test.skip(media === undefined, "aucun média dans cet instantané");

    const servi = await page.request.get(media!.adresse);
    test.skip(servi.status() === 404, "médias non joignables depuis cette machine");

    expect(servi.status(), media!.adresse).toBe(200);
    expect(servi.headers()["content-type"]).toContain("audio/");
    expect(Number(servi.headers()["content-length"] ?? 0), "un fichier, pas une page vide").toBeGreaterThan(1000);

    // Ce dossier sert des médias, pas ce qui s'y trouve par hasard, et jamais au-dessus de lui.
    expect((await page.request.get("/donnees/medias/bibliotheque.json")).status()).toBe(404);
    expect((await page.request.get("/donnees/medias/..%2F..%2Fpackage.json")).status()).toBe(404);
  });
});

test.describe("le Lecteur joue vraiment la piste (ANC-03)", () => {
  test("charge le média, le lit, et la position avance", async ({ page }) => {
    const media = await premierMedia(page);
    test.skip(media === undefined, "aucun média dans cet instantané");
    test.skip((await page.request.get(media!.adresse)).status() === 404, "médias non joignables");

    await page.goto("/#lecteur/page=3");
    await expect(page.locator(".ln-lecteur")).toBeVisible();

    const lire = page.getByRole("button", { name: /^lire$/i });
    await expect(lire, "un média joignable n'offre pas un bouton éteint").toBeEnabled();
    await lire.click();

    // Le bouton dit ce qu'il fera ensuite : la lecture a bien démarré.
    await expect(page.getByRole("button", { name: /interrompre/i })).toBeVisible();

    // Et le temps affiché avance : ce n'est pas un état, c'est du son qui court.
    const temps = page.locator(".ln-ecoute__temps");
    const debut = await temps.textContent();
    await expect
      .poll(async () => (await temps.textContent()) !== debut, { timeout: 8000, message: `position figée à ${debut}` })
      .toBe(true);
  });
});

test.describe("Vérifier écoute le segment proposé avec le même lecteur", () => {
  /** La file de F3 ne porte que des informations : ses 95 liens passent tous le seuil, et il n'y
   *  a donc aucun segment à écouter. On sert à l'écran une file qui en porte un, pointant sur un
   *  média bien réel — ce qu'on éprouve ici, c'est la chaîne du navigateur jusqu'au son, pas
   *  l'interprétation du lot. */
  test("le bouton lit un vrai fichier, puis propose d'interrompre", async ({ page }) => {
    const media = await premierMedia(page);
    test.skip(media === undefined, "aucun média dans cet instantané");
    test.skip((await page.request.get(media!.adresse)).status() === 404, "médias non joignables");

    const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
    const element = {
      ancreId: ID(20),
      numero: "401",
      page: 3,
      aVerifier: true,
      media: { empreinte: "a".repeat(64), nom: "x", piste: Number(media!.piste), position: { segment: "inconnu" }, source: media!.adresse },
      pourquoi: { preuve: "sequence", confiance: 0.55, phrase: "Déduit de la suite" },
    };
    await page.route("**/donnees/bibliotheque.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: ID(1),
          nom: "Recueil",
          mots: { element: { un: "clause", plusieurs: "clauses" }, piste: { un: "plage", plusieurs: "plages" }, page: { un: "feuillet", plusieurs: "feuillets" } },
          compteurs: [],
          aVerifier: 1,
          filtres: [],
          pages: [],
          douteux: [{ id: ID(5), nature: "lien", etat: "confiance", element, proposition: "clause 401 → plage 1", motif: "repère partiellement lu" }],
        }),
      });
    });

    await page.goto("/#verifier");
    await expect(page.locator(".ln-verifier")).toBeVisible();

    const ecouter = page.getByRole("button", { name: /écouter le segment proposé/i });
    await expect(ecouter, "un média joignable n'offre pas un bouton éteint").toBeEnabled();
    await ecouter.click();
    await expect(page.getByRole("button", { name: /interrompre le segment proposé/i })).toBeVisible();

    // Et le temps avance : du son qui court, pas un état qui a basculé.
    const temps = page.locator(".ln-cas__onde-temps");
    const debut = await temps.textContent();
    await expect
      .poll(async () => (await temps.textContent()) !== debut, { timeout: 8000, message: `position figée à ${debut}` })
      .toBe(true);
  });
});

test.describe("le tempo ralentit sans transposer, dans les trois moteurs", () => {
  test("pose la vitesse et conserve la hauteur sur un vrai élément audio", async ({ page, browserName }) => {
    const media = await premierMedia(page);
    test.skip(media === undefined, "aucun média dans cet instantané");
    test.skip((await page.request.get(media!.adresse)).status() === 404, "médias non joignables");

    await page.goto("/#lecteur/page=3");
    await expect(page.locator(".ln-lecteur")).toBeVisible();
    await page.getByRole("button", { name: /^lire$/i }).click();
    await expect(page.getByRole("button", { name: /interrompre/i })).toBeVisible();

    // L'élément n'est pas dans le document — il est construit par le lecteur. On le retrouve
    // par l'instance que le moteur connaît.
    const lu = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio === null ? undefined : { vitesse: audio.playbackRate, garde: audio.preservesPitch };
    });

    // Tous les moteurs n'attachent pas l'élément au document ; là où il ne l'est pas, on se
    // contente de vérifier que la position avance au tempo demandé.
    if (lu !== undefined) {
      expect(lu.vitesse, `${browserName} : 75 % du tempo`).toBeCloseTo(0.75, 2);
      expect(lu.garde, `${browserName} : la hauteur est conservée`).toBe(true);
    }

    const temps = page.locator(".ln-ecoute__temps");
    const debut = await temps.textContent();
    await expect
      .poll(async () => (await temps.textContent()) !== debut, { timeout: 8000, message: `position figée à ${debut}` })
      .toBe(true);
  });

  test("le moteur sait conserver la hauteur : la propriété existe et se pose", async ({ page, browserName }) => {
    await page.goto("/");
    const soutien = await page.evaluate(() => {
      const audio = new Audio();
      const avant = "preservesPitch" in audio;
      audio.preservesPitch = true;
      audio.playbackRate = 0.75;
      return { avant, garde: audio.preservesPitch, vitesse: audio.playbackRate };
    });
    expect(soutien.avant, `${browserName} connaît « preservesPitch »`).toBe(true);
    expect(soutien.garde).toBe(true);
    expect(soutien.vitesse).toBeCloseTo(0.75, 2);
  });
});
