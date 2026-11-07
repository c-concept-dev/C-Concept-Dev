import { describe, expect, it, vi } from "vitest";
import type { ImageGrise } from "@lienotheque/images";
import { decouperEtGrossir, relecteurSurPlace, type LecteurDeMorceau } from "../src/index.js";

/** A2 — relire une case sur place, et ne rendre que ce sur quoi deux manières s'accordent.
 *
 *  ## Pourquoi l'accord, et non la meilleure lecture
 *
 *  Mesuré le 6 novembre 2026 sur les cases abîmées d'une vraie table : **une lecture isolée rend
 *  des nombres parfaitement formés et parfaitement faux** — « 171 » pour un 13, « 327 » pour un
 *  32, « 710 » pour un 110. Rien dans le nombre rendu ne dit qu'il est faux.
 *
 *  Deux manières de regarder ne se trompent pas de la même façon. Exiger que deux au moins
 *  lisent le **même** nombre a rendu, sur vingt-deux cases : trois valeurs retenues, **zéro
 *  contradiction**, dix-neuf abstentions. Les trois retenues étaient exactes, vérifiées sur la
 *  page imprimée.
 *
 *  C'est le même seuil que le vote des marques, et pour la même raison : deux, c'est le minimum
 *  qui fasse d'une lecture autre chose qu'une opinion.
 *
 *  ## Le lecteur est un port
 *
 *  La reconnaissance est injectée. Sans cela, rien de ceci ne serait éprouvable là où Tesseract
 *  manque — c'est-à-dire sur l'intégration continue, qui ne l'a pas.
 */

const image = (largeur: number, hauteur: number, valeur = 128): ImageGrise => ({
  largeur,
  hauteur,
  pixels: new Uint8Array(largeur * hauteur).fill(valeur),
});

const zone = { page: 1, x: 10, y: 20, l: 30, h: 40, pourquoi: "cellule non lue" };

describe("A2 — la relecture sur place ne rend que ce sur quoi deux manières s'accordent", () => {
  it("rend le nombre que deux manières lisent pareil", async () => {
    const lectures = ["171", "13", "13", "327"];
    const lire = vi.fn<LecteurDeMorceau>(() => lectures.shift() ?? "");
    const { relire } = relecteurSurPlace(() => image(100, 100), lire);
    expect(await relire(zone)).toBe("13");
  });

  it("ne rend rien quand une seule manière lit un nombre", async () => {
    const lectures = ["171", "13", "327", "710"];
    const lire = vi.fn<LecteurDeMorceau>(() => lectures.shift() ?? "");
    const { relire } = relecteurSurPlace(() => image(100, 100), lire);
    expect(await relire(zone)).toBeUndefined();
  });

  it("ne choisit pas entre deux valeurs également soutenues", async () => {
    // Une contradiction doit faire reculer, jamais choisir : deux manières disent 13, deux
    // disent 17, et rien ne départage.
    const lectures = ["13", "17", "13", "17"];
    const lire = vi.fn<LecteurDeMorceau>(() => lectures.shift() ?? "");
    const { relire } = relecteurSurPlace(() => image(100, 100), lire);
    expect(await relire(zone)).toBeUndefined();
  });

  it("écarte ce qui n'est pas un nombre seul", async () => {
    const lectures = ["1 3", "13 b", "x", "le 13"];
    const lire = vi.fn<LecteurDeMorceau>(() => lectures.shift() ?? "");
    const { relire } = relecteurSurPlace(() => image(100, 100), lire);
    expect(await relire(zone)).toBeUndefined();
  });

  it("ne lit rien du tout quand la page n'a pas d'image", async () => {
    const lire = vi.fn<LecteurDeMorceau>(() => "13");
    const { relire, releve } = relecteurSurPlace(() => undefined, lire);
    expect(await relire(zone)).toBeUndefined();
    expect(lire, "et n'appelle personne").not.toHaveBeenCalled();
    expect(releve().appels).toBe(0);
  });

  it("compte ses appels, son temps, et les cases restées sans accord", async () => {
    const lectures = ["13", "13", "13", "13", "4", "5", "6", "7"];
    const lire = vi.fn<LecteurDeMorceau>(() => lectures.shift() ?? "");
    const { relire, releve } = relecteurSurPlace(() => image(100, 100), lire);
    await relire(zone);
    await relire({ ...zone, y: 90 });
    const bilan = releve();
    expect(bilan.appels, "quatre manières par case").toBe(8);
    expect(bilan.sansAccord, "la seconde n'a rien donné").toBe(1);
    expect(bilan.secondes).toBeGreaterThanOrEqual(0);
  });

  it("agrandit par duplication de pixels, sans en inventer un seul", () => {
    const source: ImageGrise = { largeur: 2, hauteur: 2, pixels: new Uint8Array([10, 20, 30, 40]) };
    const grossie = decouperEtGrossir(source, { x: 0, y: 0, l: 2, h: 2 }, 2);
    expect(grossie.largeur).toBe(4);
    expect(grossie.hauteur).toBe(4);
    expect([...grossie.pixels]).toEqual([
      10, 10, 20, 20,
      10, 10, 20, 20,
      30, 30, 40, 40,
      30, 30, 40, 40,
    ]);
    expect(new Set(grossie.pixels), "aucune valeur neuve").toEqual(new Set([10, 20, 30, 40]));
  });

  it("ne sort jamais de l'image, même quand la zone déborde", () => {
    const source: ImageGrise = { largeur: 2, hauteur: 2, pixels: new Uint8Array([10, 20, 30, 40]) };
    const debordante = decouperEtGrossir(source, { x: 1, y: 1, l: 10, h: 10 }, 1);
    expect(debordante.largeur).toBe(1);
    expect(debordante.hauteur).toBe(1);
    expect([...debordante.pixels]).toEqual([40]);
  });
});
