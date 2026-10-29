// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type ImageGrise, POINTS_MINIMUM, conduitesDePoints, sansConduitesDePoints } from "../src/index.js";

/** Les conduites de points (FMT-04).
 *
 *  Ce que ces contrôles éprouvent n'est pas « sait-on reconnaître un sommaire » — on ne cherche
 *  pas à le savoir — mais « sait-on distinguer une file de guides d'un contenu ». Les quatre
 *  cas qui comptent sont ceux où l'on effacerait à tort : une ellipse, une suite irrégulière,
 *  des signes trop grands, un filet continu.
 */

/** Une page blanche sur laquelle on pose de l'encre, pour éprouver une règle de forme sans
 *  dépendre d'un fichier. */
function page(largeur: number, hauteur: number): ImageGrise & { encrer: (b: Boite) => void } {
  const pixels = new Uint8Array(largeur * hauteur).fill(255);
  return {
    largeur,
    hauteur,
    pixels,
    encrer({ x, y, l, h }) {
      for (let ligne = y; ligne < y + h; ligne += 1) pixels.fill(0, ligne * largeur + x, ligne * largeur + x + l);
    },
  };
}

type Boite = { x: number; y: number; l: number; h: number };

/** Une file de taches de même taille, posées au pas régulier. */
const file = (
  feuille: { encrer: (b: Boite) => void },
  { combien, depart, pas, taille, y }: { combien: number; depart: number; pas: number; taille: number; y: number },
): void => {
  for (let rang = 0; rang < combien; rang += 1)
    feuille.encrer({ x: depart + rang * pas, y, l: taille, h: taille });
};

describe("une file de points qui guide l'œil n'est pas du contenu (FMT-04)", () => {
  /** Un intitulé, sa conduite, son numéro : la forme exacte d'une ligne de sommaire. */
  const ligneDeTable = (points: number, pas = 10): ImageGrise & { encrer: (b: Boite) => void } => {
    const feuille = page(240, 30);
    feuille.encrer({ x: 5, y: 8, l: 35, h: 15 }); // l'intitulé
    file(feuille, { combien: points, depart: 50, pas, taille: 3, y: 19 });
    feuille.encrer({ x: 200, y: 10, l: 12, h: 13 }); // le numéro
    return feuille;
  };

  it("trouve la conduite, et elle s'arrête aux points", () => {
    const feuille = ligneDeTable(10);
    const conduites = conduitesDePoints(feuille);
    expect(conduites).toHaveLength(1);
    const [conduite] = conduites;
    // Du premier point au dernier, et rien de plus : l'intitulé commence à 5, le numéro à 200.
    expect(conduite!.x).toBe(50);
    expect(conduite!.x + conduite!.l).toBe(50 + 9 * 10 + 3);
  });

  it("efface la conduite et ne touche à rien d'autre", () => {
    const feuille = ligneDeTable(10);
    const propre = sansConduitesDePoints(feuille);
    const encre = (image: ImageGrise, { x, y, l, h }: Boite): number => {
      let compte = 0;
      for (let ligne = y; ligne < y + h; ligne += 1)
        for (let colonne = x; colonne < x + l; colonne += 1)
          if (image.pixels[ligne * image.largeur + colonne]! < 128) compte += 1;
      return compte;
    };
    expect(encre(propre, { x: 50, y: 8, l: 100, h: 15 }), "la conduite n'a pas été effacée").toBe(0);
    expect(encre(propre, { x: 5, y: 8, l: 35, h: 15 })).toBe(encre(feuille, { x: 5, y: 8, l: 35, h: 15 }));
    expect(encre(propre, { x: 200, y: 10, l: 12, h: 13 })).toBe(encre(feuille, { x: 200, y: 10, l: 12, h: 13 }));
  });

  it("laisse une ellipse tranquille : trois points se lisent", () => {
    expect(conduitesDePoints(ligneDeTable(3))).toHaveLength(0);
    expect(conduitesDePoints(ligneDeTable(POINTS_MINIMUM - 1))).toHaveLength(0);
  });

  it("refuse une suite irrégulière : le pas est la signature d'une conduite", () => {
    const feuille = page(240, 30);
    feuille.encrer({ x: 5, y: 8, l: 35, h: 15 });
    // Huit taches, mais le pas saute au milieu : deux suites de quatre, aucune assez longue.
    for (const x of [50, 60, 70, 80, 110, 120, 130, 140]) feuille.encrer({ x, y: 19, l: 3, h: 3 });
    expect(conduitesDePoints(feuille)).toHaveLength(0);
  });

  it("refuse des signes trop grands pour leur ligne, si réguliers soient-ils", () => {
    // Une suite de chiffres également espacés est exactement cela, et elle porte du contenu.
    const feuille = page(240, 30);
    feuille.encrer({ x: 5, y: 8, l: 35, h: 15 });
    file(feuille, { combien: 10, depart: 50, pas: 12, taille: 9, y: 13 });
    expect(conduitesDePoints(feuille)).toHaveLength(0);
  });

  it("refuse un filet continu : une seule tache, si longue soit-elle, n'est pas une file", () => {
    const feuille = page(240, 30);
    feuille.encrer({ x: 5, y: 15, l: 220, h: 2 });
    expect(conduitesDePoints(feuille)).toHaveLength(0);
  });

  it("refuse une file trop courte pour traverser sa ligne", () => {
    // Le critère qui a sauvé vingt pages. Sur une page de musique, trois files de six à sept
    // têtes de notes couvraient 5 à 7 % de la largeur ; les vraies conduites en couvrent 21 à
    // 74 %. Mesuré le 29 octobre 2026.
    const feuille = page(1000, 40);
    feuille.encrer({ x: 5, y: 10, l: 35, h: 20 });
    file(feuille, { combien: 8, depart: 100, pas: 10, taille: 3, y: 25 });
    // Huit points, de même taille, au pas parfaitement régulier : tout y est sauf la traversée.
    expect(conduitesDePoints(feuille)).toHaveLength(0);
  });

  it("refuse des taches inégales entre elles, si petites et régulières soient-elles", () => {
    // L'autre critère. Une conduite est un seul signe répété : ses taches se ressemblent à la
    // numérisation près — un rapport de 1,3 sur les vraies. Des têtes de notes vont de 10 à 22
    // pixels de large sur la même file : un rapport de 2,2.
    const feuille = page(240, 40);
    feuille.encrer({ x: 5, y: 10, l: 30, h: 20 });
    for (const [rang, taille] of [3, 4, 3, 8, 4, 9, 3, 8, 4, 9].entries())
      feuille.encrer({ x: 50 + rang * 12, y: 26, l: taille, h: taille });
    expect(conduitesDePoints(feuille)).toHaveLength(0);
  });

  it("rend la page telle quelle quand elle n'en porte aucune", () => {
    // Pas une copie : sept millions de pixels recopiés pour rien, sur chaque page de chaque
    // document, se paieraient à l'ingestion de toute une bibliothèque.
    const feuille = page(240, 30);
    feuille.encrer({ x: 5, y: 8, l: 35, h: 15 });
    expect(sansConduitesDePoints(feuille)).toBe(feuille);
  });

  it("en trouve une par ligne quand la table en empile plusieurs", () => {
    const feuille = page(240, 60);
    for (const y of [8, 28, 48]) {
      feuille.encrer({ x: 5, y, l: 35, h: 12 });
      file(feuille, { combien: 9, depart: 50, pas: 10, taille: 3, y: y + 8 });
      feuille.encrer({ x: 200, y, l: 12, h: 12 });
    }
    expect(conduitesDePoints(feuille)).toHaveLength(3);
  });
});
