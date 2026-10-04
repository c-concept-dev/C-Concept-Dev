// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  agrandir,
  border,
  boiteSombre,
  enGris,
  fermer,
  formesSombres,
  imageIntegrale,
  inverser,
  moyennesParColonne,
  plusGrandeFormeSombre,
  recadrer,
  remplissage,
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

describe("plus grande forme sombre d'un seul tenant", () => {
  it("sépare deux formes qui ne se touchent pas et garde la plus grosse", () => {
    const image = grise(20, 10, (x, y) => (x >= 2 && x < 5 && y >= 2 && y < 5 ? 0 : x >= 10 && x < 18 && y >= 1 && y < 8 ? 0 : 255));
    expect(plusGrandeFormeSombre(image)).toEqual({ x: 10, y: 1, l: 8, h: 7 });
  });

  it("là où la boîte englobante de tout le sombre couvrirait l'image entière", () => {
    // Une ligne de portée en haut, un repère plus bas : ils ne se touchent pas.
    const image = grise(20, 10, (x, y) => (y === 0 || (x >= 10 && x < 18 && y >= 2 && y < 9) ? 0 : 255));
    expect(boiteSombre(image), "tout le sombre d'un coup").toEqual({ x: 0, y: 0, l: 20, h: 9 });
    expect(plusGrandeFormeSombre(image), "la seule forme qui compte").toEqual({ x: 10, y: 2, l: 8, h: 7 });
  });

  it("relie les pixels en diagonale : une forme imprimée a les bords de guingois", () => {
    const image = grise(6, 4, (x, y) => (x === y ? 0 : 255));
    expect(plusGrandeFormeSombre(image)).toEqual({ x: 0, y: 0, l: 4, h: 4 });
  });

  it("ne rend rien sur une image claire ou vide", () => {
    expect(plusGrandeFormeSombre(grise(5, 5, () => 255))).toBeUndefined();
    expect(plusGrandeFormeSombre({ largeur: 0, hauteur: 0, pixels: new Uint8Array(0) })).toBeUndefined();
  });

  it("cadre un seul pixel sombre", () => {
    expect(plusGrandeFormeSombre(grise(4, 4, (x, y) => (x === 2 && y === 1 ? 0 : 255)))).toEqual({ x: 2, y: 1, l: 1, h: 1 });
  });
});

describe("fermeture morphologique", () => {
  it("recolle deux formes que le seuil a séparées", () => {
    // Deux carrés sombres séparés d'une colonne claire : une fermeture les réunit.
    const image = grise(12, 6, (x, y) => (y >= 1 && y < 5 && (x >= 2 && x < 5) ? 0 : y >= 1 && y < 5 && x >= 6 && x < 9 ? 0 : 255));
    expect(plusGrandeFormeSombre(image)!.l, "séparées, la plus grosse ne fait que trois").toBe(3);
    expect(plusGrandeFormeSombre(fermer(image))!.l, "réunies, elle en fait sept").toBe(7);
  });

  it("rend aux formes leur épaisseur : rien n'est grossi, seulement réuni", () => {
    const image = grise(10, 6, (x, y) => (x >= 3 && x < 6 && y >= 2 && y < 4 ? 0 : 255));
    expect(plusGrandeFormeSombre(fermer(image))).toEqual({ x: 3, y: 2, l: 3, h: 2 });
  });

  it("ne crée rien sur une image claire", () => {
    expect(new Set(fermer(grise(8, 8, () => 255)).pixels)).toEqual(new Set([255]));
  });

  it("plusieurs passes réunissent de plus loin", () => {
    // Deux formes de trois colonnes séparées de trois : une passe ne les joint pas, deux les joignent.
    const image = grise(14, 6, (x, y) => (y >= 1 && y < 5 && (x < 3 || x >= 6) && x < 9 ? 0 : 255));
    expect(plusGrandeFormeSombre(fermer(image, 1))!.l, "encore deux formes").toBe(3);
    expect(plusGrandeFormeSombre(fermer(image, 2))!.l, "n'en font plus qu'une").toBeGreaterThan(5);
  });
});

describe("toutes les formes sombres", () => {
  it("les sépare et dit ce que chacune occupe", () => {
    // Un pavé plein à gauche, un trait fin à droite.
    const image = grise(20, 8, (x, y) => (x >= 1 && x < 6 && y >= 1 && y < 6 ? 0 : x >= 12 && x < 18 && y === 4 ? 0 : 255));
    const formes = formesSombres(image);
    expect(formes).toHaveLength(2);
    const pave = formes.find((f) => f.boite.x === 1)!;
    const trait = formes.find((f) => f.boite.x === 12)!;
    expect(remplissage(pave), "un pavé plein occupe toute sa boîte").toBe(1);
    expect(remplissage(trait), "un trait aussi, mais sa boîte est plate").toBe(1);
    expect(pave.pixels).toBe(25);
    expect(trait.pixels).toBe(6);
  });

  it("une lettre n'occupe qu'une part de sa boîte", () => {
    // Un « O » : un cadre creux.
    const image = grise(10, 10, (x, y) => (x >= 2 && x < 8 && y >= 2 && y < 8 && (x === 2 || x === 7 || y === 2 || y === 7) ? 0 : 255));
    const forme = formesSombres(image)[0]!;
    expect(remplissage(forme)).toBeLessThan(0.7);
  });

  it("ne rend rien sur une image claire", () => {
    expect(formesSombres(grise(5, 5, () => 255))).toEqual([]);
  });
});
