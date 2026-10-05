// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Recette, type CotePage } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { bandesDeMarge, candidatsDePage, type DejaLu } from "../src/index.js";

/** Trouver l'encre que la lecture n'a pas rendue (OUT-08).
 *
 *  Rien ici ne touche au réseau ni à une fixture sous droits : on dessine des pages, on y pose
 *  des taches, et on regarde ce qui est retenu. Ce qui se mesure sur le lot réel est une autre
 *  affaire — c'est la mesure, pas le contrôle. */

const RECETTE = Recette.parse({
  id: "essai",
  version: 1,
  derivee_de: null,
  preparation: { redressement: "aucun", double_page: false },
  lectures: [
    {
      ancre: "element",
      zone: { type: "marges_exterieures", largeur_rel: 0.2 },
      hauteur_rel: { min: 0.012, max: 0.032 },
      alphabet: "chiffres",
    },
  ],
  regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
  validation: { seuil_confiance: 0.6 },
});

const LARGEUR = 800;
const HAUTEUR = 2000;

/** Une page blanche, et de quoi y poser du noir. */
function pageBlanche(): { image: ImageGrise; noircir: (x: number, y: number, l: number, h: number) => void } {
  const pixels = new Uint8Array(LARGEUR * HAUTEUR).fill(250);
  const noircir = (x: number, y: number, l: number, h: number): void => {
    for (let dy = 0; dy < h; dy += 1)
      for (let dx = 0; dx < l; dx += 1) pixels[(y + dy) * LARGEUR + (x + dx)] = 10;
  };
  return { image: { largeur: LARGEUR, hauteur: HAUTEUR, pixels }, noircir };
}

const sonder = (image: ImageGrise, dejaLus: readonly DejaLu[] = [], cote?: CotePage) =>
  candidatsDePage({ index: 0, image, dejaLus, ...(cote === undefined ? {} : { cote }) }, RECETTE);

describe("la bande de marge suit la recette, pas une valeur devinée", () => {
  const image: ImageGrise = { largeur: LARGEUR, hauteur: HAUTEUR, pixels: new Uint8Array(LARGEUR * HAUTEUR) };

  it("sans côté connu, regarde les deux bords : on ne devine pas où était la reliure", () => {
    const bandes = bandesDeMarge(image, 0.2);
    expect(bandes).toHaveLength(2);
    expect(bandes[0]?.x).toBe(0);
    expect(bandes[1]?.x).toBe(LARGEUR - 160);
  });

  it("sur une page coupée, la même part de cliché occupe deux fois la page", () => {
    // La correction consignée après Westwood : « marges_exterieures » vaut pour le cliché
    // entier. L'oublier ici, c'est refaire la moitié du chemin.
    expect(bandesDeMarge(image, 0.2, "gauche")[0]?.l).toBe(320);
    expect(bandesDeMarge(image, 0.2, "droite")[0]?.x).toBe(LARGEUR - 320);
  });

  it("laisse la bande des numéros de page : ses chiffres n'en sont pas", () => {
    expect(bandesDeMarge(image, 0.2)[0]?.y).toBe(Math.round(HAUTEUR * 0.06));
  });
});

describe("ce qui est retenu, et ce qui ne l'est pas", () => {
  it("retient une tache de la taille d'un numéro, dans la marge", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 900, 30, 40); // 40 px de haut : dans les 0,012 à 0,032 de 2000
    const candidats = sonder(image);
    expect(candidats).toHaveLength(1);
    expect(candidats[0]?.encre.y).toBe(900);
  });

  it("ignore ce qui est trop petit ou trop grand pour être un numéro", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 400, 10, 8); // une bavure
    noircir(40, 1200, 30, 300); // une barre
    expect(sonder(image)).toHaveLength(0);
  });

  it("ignore un trait qui traverse la marge : un nombre n'est pas large à ce point", () => {
    const { image, noircir } = pageBlanche();
    noircir(5, 900, 150, 35);
    expect(sonder(image)).toHaveLength(0);
  });

  it("ignore ce qui est hors de la marge : le corps de la page n'est pas sondé", () => {
    const { image, noircir } = pageBlanche();
    noircir(400, 900, 30, 40);
    expect(sonder(image)).toHaveLength(0);
  });

  it("ignore la bande des numéros de page", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 40, 30, 40);
    expect(sonder(image)).toHaveLength(0);
  });
});

describe("les chiffres d'un même nombre font un seul candidat", () => {
  it("réunit trois chiffres côte à côte", () => {
    // « 189 » : trois formes séparées, un seul numéro. Sans réunion, on enverrait trois
    // recadrages d'un chiffre chacun — et un chiffre seul ne se lit pas comme un numéro.
    const { image, noircir } = pageBlanche();
    noircir(30, 900, 16, 40);
    noircir(52, 900, 16, 40);
    noircir(74, 900, 16, 40);

    const candidats = sonder(image);
    expect(candidats).toHaveLength(1);
    expect(candidats[0]?.encre.x).toBe(30);
    expect(candidats[0]?.encre.l, "la boîte couvre les trois").toBe(60);
  });

  it("ne réunit pas deux numéros éloignés en hauteur", () => {
    const { image, noircir } = pageBlanche();
    noircir(30, 500, 30, 40);
    noircir(30, 1400, 30, 40);
    expect(sonder(image)).toHaveLength(2);
  });
});

describe("on ne redemande pas ce qui a déjà été lu", () => {
  it("écarte une encre à la hauteur d'un élément connu", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 900, 30, 40);
    const y = (900 + 20) / HAUTEUR;
    expect(sonder(image, [{ y, numero: 42 }])).toHaveLength(0);
  });

  it("garde une encre qu'aucun élément connu ne couvre", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 900, 30, 40);
    expect(sonder(image, [{ y: 0.2, numero: 41 }])).toHaveLength(1);
  });
});

describe("le recadrage prend la bande, pas le chiffre seul", () => {
  it("couvre toute la largeur de la bande et déborde en hauteur", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, 900, 30, 40);
    const [candidat] = sonder(image);
    expect(candidat).toBeDefined();
    expect(candidat!.recadrage.l, "toute la bande : le numéro est fer à droite dans sa marge").toBe(160);
    expect(candidat!.recadrage.h, "une hauteur d'encre de marge de chaque côté").toBe(120);
    expect(candidat!.recadrage.y).toBe(860);
  });

  it("ne sort jamais de la page", () => {
    const { image, noircir } = pageBlanche();
    noircir(40, HAUTEUR - 45, 30, 40);
    const [candidat] = sonder(image);
    expect(candidat).toBeDefined();
    expect(candidat!.recadrage.y).toBeGreaterThanOrEqual(0);
    expect(candidat!.recadrage.y + candidat!.recadrage.h).toBeLessThanOrEqual(HAUTEUR);
  });
});

describe("le plafond par page borne les dégâts", () => {
  it("garde les encres les plus franches, dans l'ordre de la page", () => {
    const { image, noircir } = pageBlanche();
    for (const [rang, y] of [300, 700, 1100, 1500].entries()) noircir(40, y, 30, 25 + rang * 5);

    const tous = candidatsDePage({ index: 0, image, dejaLus: [] }, RECETTE);
    expect(tous).toHaveLength(4);

    const bornes = candidatsDePage({ index: 0, image, dejaLus: [] }, RECETTE, { maxParPage: 2 });
    expect(bornes).toHaveLength(2);
    // Les deux plus hautes — 1100 et 1500 —, rendues dans l'ordre de la page.
    expect(bornes.map((candidat) => candidat.encre.y)).toEqual([1100, 1500]);
  });

  it("rejoué, rend exactement les mêmes candidats", () => {
    const { image, noircir } = pageBlanche();
    for (const y of [300, 700, 1100]) noircir(40, y, 30, 35);
    const premier = JSON.stringify(candidatsDePage({ index: 0, image, dejaLus: [] }, RECETTE, { maxParPage: 2 }));
    const second = JSON.stringify(candidatsDePage({ index: 0, image, dejaLus: [] }, RECETTE, { maxParPage: 2 }));
    expect(premier).toBe(second);
  });
});
