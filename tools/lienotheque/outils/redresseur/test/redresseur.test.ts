// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ReglagesRedressement } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import {
  binariserAdaptatif,
  couperDoublePage,
  effacerVerso,
  gouttiere,
  redresser,
  rotationDeForme,
  rotationDansOsd,
  tonDuPapier,
} from "../src/index.js";

const grise = (largeur: number, hauteur: number, ton: (x: number, y: number) => number): ImageGrise => ({
  largeur,
  hauteur,
  pixels: Uint8Array.from({ length: largeur * hauteur }, (_, rang) => ton(rang % largeur, Math.floor(rang / largeur))),
});

describe("orientation (OUT-03)", () => {
  it("lit la rotation que l'outil annonce", () => {
    expect(rotationDansOsd("Page number: 0\nOrientation in degrees: 90\nRotate: 270\nScript: Latin\n")).toBe(270);
    expect(rotationDansOsd("Rotate: 0\n")).toBe(0);
  });

  it("ne retient que les quarts de tour, et rien quand l'outil se tait", () => {
    expect(rotationDansOsd("Rotate: 45\n")).toBeUndefined();
    expect(rotationDansOsd("Too few characters. Skipping this page")).toBeUndefined();
  });

  it("à défaut, déduit de la forme : une double page est plus large que haute", () => {
    expect(rotationDeForme(grise(100, 200, () => 255))).toBe(90);
    expect(rotationDeForme(grise(200, 100, () => 255))).toBe(0);
  });
});

describe("pliure d'un livre ouvert (OUT-03)", () => {
  /** Deux pages claires séparées d'une bande sombre, comme l'ombre de la reliure. */
  const double = (largeur: number, pliure: number): ImageGrise =>
    grise(largeur, 60, (x) => (Math.abs(x - pliure) <= 2 ? 40 : 250));

  it("trouve la bande sombre proche du centre", () => {
    expect(Math.abs(gouttiere(double(400, 200)) - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(gouttiere(double(400, 215)) - 215)).toBeLessThanOrEqual(3);
  });

  it("ne va pas chercher une marge sombre loin du centre", () => {
    // Bord gauche très sombre, vraie pliure au centre : c'est la pliure qu'il faut.
    const image = grise(400, 60, (x) => (x < 20 ? 10 : Math.abs(x - 200) <= 2 ? 60 : 250));
    expect(Math.abs(gouttiere(image) - 200)).toBeLessThanOrEqual(3);
  });

  it("coupe en deux pages, en retirant la pliure elle-même", () => {
    const image = double(400, 200);
    const { gauche, droite, x } = couperDoublePage(image);
    expect(x).toBeGreaterThan(190);
    expect(gauche.largeur + droite.largeur).toBeLessThan(image.largeur);
    expect(gauche.hauteur).toBe(image.hauteur);
    expect(droite.hauteur).toBe(image.hauteur);
  });
});

describe("effacement du verso (OUT-03)", () => {
  /** Papier à 235, verso qui transparaît à 205, encre à 30. */
  const avecVerso = grise(60, 20, (x) => (x < 20 ? 235 : x < 40 ? 205 : 30));

  it("relève le ton du papier, qui est ce qu'il y a de plus fréquent", () => {
    expect(tonDuPapier(avecVerso)).toBe(235);
  });

  it("blanchit le verso et garde l'encre", () => {
    const efface = effacerVerso(avecVerso);
    const ton = (x: number) => efface.pixels[x]!;
    expect(ton(5), "le papier reste blanc").toBe(255);
    expect(ton(25), "le verso disparaît").toBe(255);
    expect(ton(45), "l'encre reste sombre").toBeLessThan(60);
  });

  it("une force plus faible laisse passer un verso plus pâle", () => {
    const doux = effacerVerso(avecVerso, { force: 0.02 });
    expect(doux.pixels[25]!).toBeLessThan(255);
  });

  it("ne change pas les dimensions", () => {
    expect(effacerVerso(avecVerso)).toMatchObject({ largeur: 60, hauteur: 20 });
  });
});

describe("binarisation adaptative (OUT-03)", () => {
  /** Une page éclairée de biais : le fond passe de 90 à gauche à 250 à droite, et porte des
   *  traits d'encre nettement plus sombres que leur voisinage. */
  const eclairageDeBiais = grise(200, 60, (x, y) => {
    const fond = 90 + Math.round((x / 199) * 160);
    const trait = y % 12 < 2 && x % 7 < 2;
    return trait ? Math.max(0, fond - 70) : fond;
  });

  it("ne rend que du noir et du blanc", () => {
    expect(new Set(binariserAdaptatif(eclairageDeBiais).pixels)).toEqual(new Set([0, 255]));
  });

  it("retrouve l'encre des deux côtés, là où un seuil unique échoue", () => {
    const binaire = binariserAdaptatif(eclairageDeBiais);
    const encreDans = (x0: number, x1: number): number => {
      let compte = 0;
      for (let y = 0; y < 60; y += 1) for (let x = x0; x < x1; x += 1) if (binaire.pixels[y * 200 + x] === 0) compte += 1;
      return compte;
    };
    expect(encreDans(0, 60), "côté sombre").toBeGreaterThan(20);
    expect(encreDans(140, 200), "côté clair").toBeGreaterThan(20);

    // Un seuil unique à 128 noircirait tout le côté sombre, fond compris.
    let sousLeSeuil = 0;
    for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) if (eclairageDeBiais.pixels[y * 200 + x]! < 128) sousLeSeuil += 1;
    expect(sousLeSeuil, "ce que ferait un seuil unique").toBeGreaterThan(encreDans(0, 60) * 3);
  });

  it("laisse blanc ce qui est uniforme, quelle que soit sa clarté", () => {
    expect(new Set(binariserAdaptatif(grise(80, 40, () => 120)).pixels)).toEqual(new Set([255]));
  });
});

describe("redressement complet (OUT-03)", () => {
  const reglages = (sur: Record<string, unknown> = {}) =>
    ReglagesRedressement.parse({ rotation: "aucun", doublePage: true, pageGauche: "paire", ...sur });

  const cliche = grise(400, 60, (x) => (Math.abs(x - 200) <= 2 ? 40 : 250));

  it("rend deux pages, chacune avec son côté et la gouttière", () => {
    const pages = redresser(cliche, 40, reglages());
    expect(pages).toHaveLength(2);
    expect(pages[0]?.descripteur.cote).toBe("gauche");
    expect(pages[1]?.descripteur.cote).toBe("droite");
    expect(pages[0]?.descripteur.gouttiere).toBe(pages[1]?.descripteur.gouttiere);
    expect(pages[0]?.descripteur.source).toBe(40);
  });

  it("rend une seule page quand la recette ne déclare pas de double page", () => {
    const pages = redresser(cliche, 7, ReglagesRedressement.parse({ rotation: "aucun", doublePage: false }));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.descripteur.cote).toBeUndefined();
    expect(pages[0]?.descripteur.gouttiere).toBeUndefined();
  });

  it("dit ce qu'il a fait, et seulement ce qu'il a fait", () => {
    const sobre = redresser(cliche, 0, reglages())[0]!.descripteur;
    expect(sobre.versoEfface).toBe(false);
    expect(sobre.binarisee).toBe(false);

    const complet = redresser(cliche, 0, reglages({ effacerVerso: true, binarisation: "adaptative" }))[0]!.descripteur;
    expect(complet.versoEfface).toBe(true);
    expect(complet.binarisee).toBe(true);
  });

  it("ne modifie jamais l'image d'origine (OPT-04)", () => {
    const copie = Uint8Array.from(cliche.pixels);
    redresser(cliche, 0, reglages({ effacerVerso: true, binarisation: "adaptative" }));
    expect([...cliche.pixels]).toEqual([...copie]);
  });

  it("accepte une rotation imposée, pour rejouer un lot à l'identique", () => {
    const page = redresser(grise(60, 100, () => 200), 0, ReglagesRedressement.parse({ rotation: "auto", doublePage: false }), {
      rotationImposee: 180,
    })[0]!.descripteur;
    expect(page.rotation).toBe(180);
    expect(page.sourceRotation).toBe("imposee");
  });

  it("ne tourne rien quand la recette dit de ne pas redresser", () => {
    const page = redresser(grise(60, 100, () => 200), 0, ReglagesRedressement.parse({ rotation: "aucun", doublePage: false }))[0]!;
    expect(page.descripteur.rotation).toBe(0);
    expect(page.image.largeur).toBe(60);
  });
});

describe("garder la page en gris pour une relecture ciblée (OUT-03, OUT-08)", () => {
  const reglages = ReglagesRedressement.parse({ rotation: "aucun", doublePage: false, effacerVerso: false, binarisation: "adaptative" });

  /** Un dégradé : binarisé il ne reste que deux tons, en gris il en reste beaucoup. */
  const degrade = (): ImageGrise => ({
    largeur: 40,
    hauteur: 40,
    pixels: Uint8Array.from({ length: 1600 }, (_, rang) => (rang % 40) * 6),
  });

  it("rend le gris à la même géométrie que la page lue", () => {
    const [page] = redresser(degrade(), 0, reglages, { garderGris: true });
    expect(page!.grise).toBeDefined();
    expect(page!.grise!.largeur).toBe(page!.image.largeur);
    expect(page!.grise!.hauteur).toBe(page!.image.hauteur);
  });

  it("garde les nuances que la binarisation enlève", () => {
    const [page] = redresser(degrade(), 0, reglages, { garderGris: true });
    const tons = (image: ImageGrise) => new Set(image.pixels).size;
    expect(tons(page!.image)).toBeLessThanOrEqual(2);
    expect(tons(page!.grise!)).toBeGreaterThan(2);
  });

  it("ne garde rien quand personne ne l'a demandé", () => {
    expect(redresser(degrade(), 0, reglages)[0]!.grise).toBeUndefined();
  });

  it("ne garde rien quand il n'y a pas de binarisation : la page lue est déjà ce gris", () => {
    const sansSeuil = ReglagesRedressement.parse({ rotation: "aucun", doublePage: false, effacerVerso: false, binarisation: "aucune" });
    expect(redresser(degrade(), 0, sansSeuil, { garderGris: true })[0]!.grise).toBeUndefined();
  });
});
