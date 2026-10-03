// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  agrandir,
  border,
  boiteSombre,
  enGris,
  imageIntegrale,
  inverser,
  moyennesParColonne,
  recadrer,
  seuiller,
  tourner,
  versPgm,
  type ImageGrise,
} from "../src/index.js";

const grise = (largeur: number, hauteur: number, ton: (x: number, y: number) => number): ImageGrise => ({
  largeur,
  hauteur,
  pixels: Uint8Array.from({ length: largeur * hauteur }, (_, rang) => ton(rang % largeur, Math.floor(rang / largeur))),
});

describe("passage en gris", () => {
  it("pondère les canaux comme l'œil les voit", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const gris = enGris({ data, width: 3, height: 1, colorSpace: "srgb" });
    expect([...gris.pixels]).toEqual([76, 150, 29]);
  });
});

describe("recadrage", () => {
  const image = grise(4, 3, (x, y) => y * 10 + x);

  it("rend exactement la fenêtre demandée", () => {
    expect([...recadrer(image, { x: 1, y: 1, l: 2, h: 2 }).pixels]).toEqual([11, 12, 21, 22]);
  });

  it("rabote ce qui dépasse plutôt que de se plaindre", () => {
    const coin = recadrer(image, { x: 3, y: 2, l: 10, h: 10 });
    expect(coin.largeur).toBe(1);
    expect(coin.hauteur).toBe(1);
    expect([...coin.pixels]).toEqual([23]);
  });

  it("rend une image vide quand la fenêtre est hors de l'image", () => {
    expect(recadrer(image, { x: 40, y: 40, l: 5, h: 5 }).pixels).toHaveLength(0);
  });
});

describe("seuil et inversion", () => {
  it("noircit ce qui est sous le seuil, blanchit le reste", () => {
    expect([...seuiller(grise(3, 1, (x) => [50, 110, 200][x]!), 110).pixels]).toEqual([0, 255, 255]);
  });

  it("l'inversion appliquée deux fois ne change rien", () => {
    const image = grise(4, 2, (x, y) => (x * 37 + y * 11) % 256);
    expect([...inverser(inverser(image)).pixels]).toEqual([...image.pixels]);
  });
});

describe("boîte de ce qui est sombre", () => {
  it("cadre au plus juste", () => {
    const image = grise(6, 5, (x, y) => (x >= 2 && x <= 4 && y >= 1 && y <= 3 ? 0 : 255));
    expect(boiteSombre(image)).toEqual({ x: 2, y: 1, l: 3, h: 3 });
  });

  it("ne rend rien quand tout est clair", () => {
    expect(boiteSombre(grise(4, 4, () => 255))).toBeUndefined();
  });

  it("cadre un seul pixel sombre", () => {
    expect(boiteSombre(grise(4, 4, (x, y) => (x === 3 && y === 0 ? 0 : 255)))).toEqual({ x: 3, y: 0, l: 1, h: 1 });
  });
});

describe("agrandissement", () => {
  it("répète les pixels, sans en inventer", () => {
    const grand = agrandir(grise(2, 1, (x) => (x === 0 ? 10 : 20)), 3);
    expect(grand.largeur).toBe(6);
    expect(grand.hauteur).toBe(3);
    expect([...grand.pixels.subarray(0, 6)]).toEqual([10, 10, 10, 20, 20, 20]);
  });

  it("rend l'image telle quelle au facteur 1, et refuse le reste", () => {
    const image = grise(2, 2, () => 7);
    expect(agrandir(image, 1)).toBe(image);
    expect(() => agrandir(image, 0)).toThrow(/entier/);
    expect(() => agrandir(image, 1.5)).toThrow(/entier/);
  });
});

describe("marge", () => {
  it("entoure sans déplacer le contenu", () => {
    const borde = border(grise(2, 2, () => 0), 1);
    expect(borde.largeur).toBe(4);
    expect([...borde.pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...borde.pixels.subarray(5, 7)]).toEqual([0, 0]);
  });
});

describe("écriture PGM", () => {
  it("écrit un en-tête P5 puis les pixels bruts", () => {
    const pgm = versPgm(grise(2, 2, () => 42));
    expect(pgm.toString("latin1", 0, 11)).toBe("P5\n2 2\n255\n");
    expect([...pgm.subarray(11)]).toEqual([42, 42, 42, 42]);
  });
});

describe("quart de tour", () => {
  // 1 2
  // 3 4
  const carre: ImageGrise = { largeur: 2, hauteur: 2, pixels: Uint8Array.from([1, 2, 3, 4]) };

  it("tourne dans le sens des aiguilles d'une montre", () => {
    expect([...tourner(carre, 90).pixels]).toEqual([3, 1, 4, 2]);
    expect([...tourner(carre, 180).pixels]).toEqual([4, 3, 2, 1]);
    expect([...tourner(carre, 270).pixels]).toEqual([2, 4, 1, 3]);
  });

  it("échange largeur et hauteur sur un quart de tour, pas sur un demi", () => {
    const bande: ImageGrise = { largeur: 3, hauteur: 1, pixels: Uint8Array.from([7, 8, 9]) };
    expect(tourner(bande, 90)).toMatchObject({ largeur: 1, hauteur: 3 });
    expect(tourner(bande, 180)).toMatchObject({ largeur: 3, hauteur: 1 });
  });

  it("quatre quarts de tour ramènent à l'image de départ", () => {
    const image = grise(5, 3, (x, y) => (x * 17 + y * 31) % 256);
    let tournee = image;
    for (let fois = 0; fois < 4; fois += 1) tournee = tourner(tournee, 90);
    expect([...tournee.pixels]).toEqual([...image.pixels]);
    expect(tournee.largeur).toBe(image.largeur);
  });

  it("ne touche à rien à zéro degré", () => {
    expect(tourner(carre, 0)).toBe(carre);
  });
});

describe("moyennes par colonne", () => {
  it("rend une moyenne par colonne", () => {
    const image = grise(3, 2, (x) => [0, 128, 255][x]!);
    expect([...moyennesParColonne(image)]).toEqual([0, 128, 255]);
  });
});

describe("image intégrale", () => {
  it("rend la somme d'un rectangle en quatre lectures", () => {
    const image = grise(4, 4, () => 10);
    const { sommes } = imageIntegrale(image);
    const pas = 5;
    const rectangle = (x0: number, y0: number, x1: number, y1: number) =>
      sommes[y1 * pas + x1]! - sommes[y0 * pas + x1]! - sommes[y1 * pas + x0]! + sommes[y0 * pas + x0]!;
    expect(rectangle(0, 0, 4, 4)).toBe(160);
    expect(rectangle(1, 1, 3, 3)).toBe(40);
  });

  it("porte aussi les carrés, de quoi tirer un écart-type", () => {
    const image = grise(2, 1, (x) => (x === 0 ? 0 : 10));
    const { sommes, carres } = imageIntegrale(image);
    expect(sommes[1 * 3 + 2]).toBe(10);
    expect(carres[1 * 3 + 2]).toBe(100);
  });
});
