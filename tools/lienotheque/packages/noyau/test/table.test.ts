import { describe, expect, it } from "vitest";
import { Observation, type MotLu } from "@lienotheque/contrats";
import {
  cellulesSuspectes,
  colonnesDeNombres,
  lignesDeMots,
  lireLaTable,
  observationsDeLaTable,
  panneauxDeColonnes,
  rangeesDeTable,
} from "../src/index.js";

/** Ce qu'un document de douze enregistrements offre : assez pour que la colonne de gauche,
 *  qui va de 1 à 10, puisse en désigner un. */
const DOUZE = { enregistrements: 12 };

/** Lire une table à colonnes (OUT-10).
 *
 *  La géométrie employée ici n'est pas inventée : ce sont les abscisses et les hauteurs relevées
 *  le 29 octobre 2026 sur une table réelle de 52 rangées — intitulé vers x = 253, première
 *  colonne vers x = 793, seconde vers x = 955, un pas vertical d'environ 83.
 *
 *  Les quatre erreurs injectées plus bas sont, elles aussi, les quatre vraies erreurs de la
 *  meilleure lecture de cette table : 382 et 248 pour la largeur, 20 et 21 pour la montée rompue.
 *  Un détecteur qui ne les attrape pas rendrait « 39 rangées sur 52 » dont quatre fausses, sans
 *  que rien ne les distingue.
 */

const mot = (texte: string, x: number, y: number): MotLu => ({ texte, x, y, l: texte.length * 18, h: 34 });

/** Une table à deux colonnes, bâtie sur la géométrie réelle. */
function table(valeurs: readonly (readonly [number, number])[], intitule = "repère"): MotLu[] {
  const mots: MotLu[] = [];
  valeurs.forEach(([gauche, droite], rang) => {
    const y = 568 + rang * 83;
    mots.push(mot(intitule, 253, y), mot(String(rang + 1), 400, y), mot(String(gauche), 793, y), mot(String(droite), 955, y));
  });
  return mots;
}

const dix = Array.from({ length: 10 }, (_, rang) => [rang + 1, 6 + rang * 2] as const);

describe("des mots épars aux lignes (OUT-10)", () => {
  it("groupe par recouvrement vertical, pas par distance entre centres", () => {
    // Une majuscule et un chiffre n'ont pas le même centre et sont pourtant sur la même ligne.
    const mots = [mot("A", 10, 100), { ...mot("7", 200, 104), h: 26 }, mot("B", 10, 200)];
    const lignes = lignesDeMots(mots);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]?.mots).toHaveLength(2);
  });

  it("rend les lignes de haut en bas, et leurs mots de gauche à droite", () => {
    const lignes = lignesDeMots([mot("b", 900, 200), mot("a", 100, 200), mot("haut", 100, 100)]);
    expect(lignes.map((ligne) => ligne.mots.map((un) => un.texte))).toEqual([["haut"], ["a", "b"]]);
  });
});

describe("des lignes aux colonnes (OUT-10)", () => {
  it("trouve deux colonnes de nombres là où il y en a deux", () => {
    const colonnes = colonnesDeNombres(lignesDeMots(table(dix)));
    // Le rang (x = 400) en est une aussi : trois colonnes de nombres au total.
    expect(colonnes.map((colonne) => colonne.x)).toEqual([400, 793, 955]);
  });

  it("ne voit pas de colonne dans quelques nombres épars", () => {
    const epars = [mot("3", 100, 100), mot("41", 600, 200), mot("7", 250, 300)];
    expect(colonnesDeNombres(lignesDeMots(epars))).toEqual([]);
  });

  it("ne coupe pas en deux une colonne dont les nombres tremblent un peu", () => {
    // Le cas réel : une reconnaissance ne place pas deux nombres d'une même colonne exactement
    // à la même abscisse. Vingt-six pixels de jeu sur une colonne de trente valeurs suffisaient
    // à la scinder, et toutes les rangées devenaient incomplètes.
    const tremblante: MotLu[] = [];
    for (let rang = 0; rang < 10; rang += 1) {
      const y = 568 + rang * 83;
      tremblante.push(mot("repère", 253, y));
      tremblante.push(mot(String(rang + 1), rang % 3 === 0 ? 795 : 821, y));
      tremblante.push(mot(String(6 + rang * 2), 956, y));
    }
    const colonnes = colonnesDeNombres(lignesDeMots(tremblante));
    expect(colonnes, "une colonne qui tremble a été coupée en deux").toHaveLength(2);
  });

  it("ne prend pas un mot contenant des chiffres pour un nombre", () => {
    const mots = [...table(dix), mot("B7#9", 500, 568), mot("12_8", 500, 651)];
    const colonnes = colonnesDeNombres(lignesDeMots(mots));
    expect(colonnes.map((colonne) => colonne.x), "une colonne fantôme à x = 500 aurait été créée").toEqual([400, 793, 955]);
  });
});

describe("des colonnes aux rangées (OUT-10)", () => {
  it("rend l’intitulé et une cellule par colonne", () => {
    const lignes = lignesDeMots(table(dix));
    const rangees = rangeesDeTable(lignes, colonnesDeNombres(lignes));
    expect(rangees).toHaveLength(10);
    expect(rangees[0]?.intitule).toBe("repère");
    expect(rangees[0]?.cellules).toEqual([1, 1, 6]);
    expect(rangees[9]?.cellules).toEqual([10, 10, 24]);
  });

  it("laisse une cellule vide quand rien ne s’y trouve, sans la combler", () => {
    const mots = table(dix).filter((un) => !(un.x === 793 && un.y === 568 + 2 * 83));
    const lignes = lignesDeMots(mots);
    const rangees = rangeesDeTable(lignes, colonnesDeNombres(lignes));
    expect(rangees[2]?.cellules[1], "la cellule manquante a été comblée").toBeUndefined();
    expect(rangees[2]?.cellules[2], "la voisine reste lue").toBe(10);
  });
});

describe("les quatre vraies erreurs d’une lecture de table (OUT-10)", () => {
  /** Les rangs 11 à 20 de la table réelle, avec ses erreurs telles qu’elles sont sorties. */
  const avecErreurs = [
    [11, 26],
    [382, 28], // trois chiffres dans une colonne de dizaines
    [13, 30],
    [14, 32],
    [15, 34],
    [16, 36],
    [248, 38], // trois chiffres, encore
    [18, 40],
    [19, 42],
    [20, 44],
  ] as const;

  it("attrape une valeur très loin du reste de sa colonne", () => {
    const lignes = lignesDeMots(table(avecErreurs));
    const colonnes = colonnesDeNombres(lignes);
    const suspectes = cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes);
    const valeurs = suspectes.map((suspecte) => suspecte.valeur);
    expect(valeurs).toContain(382);
    expect(valeurs).toContain(248);
    expect(suspectes.find((un) => un.valeur === 382)?.pourquoi).toMatch(/loin du reste/);
  });

  it("attrape une valeur qui rompt la montée de sa colonne", () => {
    const quiRedescend = [
      [23, 50],
      [24, 52],
      [20, 54], // lu 20 au lieu de 25
      [26, 56],
      [21, 58], // lu 21 au lieu de 27
      [28, 60],
      [29, 62],
      [30, 64],
    ] as const;
    const lignes = lignesDeMots(table(quiRedescend));
    const colonnes = colonnesDeNombres(lignes);
    const suspectes = cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes);
    const valeurs = suspectes.map((suspecte) => suspecte.valeur);
    expect(valeurs).toContain(20);
    expect(valeurs).toContain(21);
    expect(suspectes.find((un) => un.valeur === 20)?.pourquoi).toMatch(/montée/);
  });

  it("attrape une valeur lue trop haut, qui rompt la montée par le dessus", () => {
    // La faute relevée le 1er novembre 2026 sur la vraie table « CD Track Listing » : la colonne
    // des pistes du panneau droit lit 31, **82**, 33, 34… — un 3 pris pour un 8. Elle n'était
    // attrapée par aucun des deux signes : ce n'est pas un creux, c'est une bosse, et la colonne
    // allant de 31 à 52, sa dispersion médiane d'environ 6 laissait passer un écart de 41 sous
    // une limite de 48. La rangée était donc rendue **utilisable**, donc digne de confiance.
    //
    // Une reconnaissance qui lit trop haut — un chiffre de plus, 3 pour 8, 1 pour 7 — est aussi
    // fréquente qu'une qui lit trop bas. L'asymétrie n'avait aucune raison d'être.
    // La colonne **entière** du panneau droit, vingt-deux rangées : c'est sa longueur qui fait le
    // défaut. Sur huit rangées la dispersion est si serrée que le premier signe attrape la bosse ;
    // sur vingt-deux, la colonne allant de 31 à 52, elle passe dessous. Un cas d'essai plus court
    // aurait verrouillé une fausse réussite.
    const bosse = Array.from({ length: 22 }, (_, rang) =>
      rang === 1 ? ([82, 68] as const) : ([31 + rang, 66 + rang * 2] as const),
    );
    const lignes = lignesDeMots(table(bosse));
    const colonnes = colonnesDeNombres(lignes);
    const suspectes = cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes);
    const valeurs = suspectes.map((suspecte) => suspecte.valeur);
    expect(valeurs, "la bosse doit être nommée comme le creux l'est").toContain(82);
    expect(suspectes.find((un) => un.valeur === 82)?.pourquoi).toMatch(/montée/);
  });

  it("n’accuse pas une colonne qui franchit naturellement une dizaine ou une centaine", () => {
    const franchit = Array.from({ length: 10 }, (_, rang) => [95 + rang, 6 + rang * 2] as const);
    const lignes = lignesDeMots(table(franchit));
    const colonnes = colonnesDeNombres(lignes);
    const suspectes = cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes);
    expect(suspectes.filter((un) => un.colonne === 1), "99 puis 100 n’est pas une faute").toEqual([]);
  });

  it("n’accuse pas le « 10 » d’une colonne qui va de 1 à 10", () => {
    // La faute de la première version : juger sur le nombre de chiffres. Toute colonne ordonnée
    // franchit une dizaine, et neuf valeurs sur dix y ont une largeur, la dixième une autre.
    const lignes = lignesDeMots(table(dix));
    const colonnes = colonnesDeNombres(lignes);
    const suspectes = cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes);
    expect(suspectes.map((un) => un.valeur), "des valeurs parfaitement normales ont été accusées").toEqual([]);
  });

  it("n’accuse rien sur une table propre", () => {
    const lignes = lignesDeMots(table(dix));
    const colonnes = colonnesDeNombres(lignes);
    expect(cellulesSuspectes(rangeesDeTable(lignes, colonnes), colonnes)).toEqual([]);
  });
});

describe("le verdict de la table (OUT-10)", () => {
  it("compte comme utilisables les rangées complètes et nettes, pas les autres", () => {
    const lue = lireLaTable(table(dix), DOUZE);
    expect(lue.estUneTable).toBe(true);
    expect(lue.utilisables).toHaveLength(10);
    expect(lue.incompletes).toEqual([]);
  });

  it("écarte des utilisables une rangée dont une cellule est suspecte", () => {
    const lue = lireLaTable(table([...dix.slice(0, 5), [382, 18], ...dix.slice(6)] as const), DOUZE);
    expect(lue.suspectes.length).toBeGreaterThan(0);
    expect(lue.utilisables, "une rangée suspecte est restée utilisable").not.toContain(5);
    expect(lue.rangees[5]?.cellules[1], "mais ce qui a été lu reste écrit tel quel").toBe(382);
  });

  it("ne tient pas pour une table ce qui n’en est pas une", () => {
    const deuxLignes = lireLaTable(table(dix.slice(0, 2)), DOUZE);
    expect(deuxLignes.estUneTable).toBe(false);
  });

  it("dit en clair ce qu’il a vu, et où le revérifier", () => {
    const observations = observationsDeLaTable(lireLaTable(table(dix), DOUZE), "rang 5");
    for (const observation of observations) {
      expect(() => Observation.parse(observation)).not.toThrow();
      expect(observation.source).toBe("contenu");
    }
    expect(observations[0]?.constat).toMatch(/Table de 3 colonnes/);
  });

  it("dit aussi quand il n’y a pas de table, au lieu de se taire", () => {
    const observations = observationsDeLaTable(lireLaTable([mot("rien", 10, 10)], DOUZE), "rang 2");
    expect(observations[0]?.constat).toMatch(/Pas de table/);
  });
});

/** Une table imprimée en deux panneaux côte à côte (OUT-10).
 *
 *  Les abscisses sont celles relevées le 1er novembre 2026 sur la table réelle « CD Track
 *  Listing » : colonnes vers 307, 705, 817 pour le panneau gauche, 1132, 1525, 1639 pour le
 *  droit, et une ligne d'en-tête qui répète ses trois libellés.
 */
describe("une table imprimée en deux panneaux (OUT-10)", () => {
  const enTete = [
    mot("Description", 127, 268),
    mot("Track", 678, 268),
    mot("Page", 790, 268),
    mot("Description", 953, 268),
    mot("Track", 1504, 268),
    mot("Page", 1616, 268),
  ];

  /** Une rangée réelle : à gauche l'enregistrement `gauche`, à droite `droite`. */
  const rangee = (y: number, gauche: readonly [number, number, number], droite: readonly [number, number, number]) => [
    mot("Workout", 170, y),
    mot(String(gauche[0]), 307, y),
    mot(String(gauche[1]), 718, y),
    mot(String(gauche[2]), 835, y),
    mot("Workout", 996, y),
    mot(String(droite[0]), 1132, y),
    mot(String(droite[1]), 1525, y),
    mot(String(droite[2]), 1643, y),
  ];

  const deuxPanneaux = [
    ...enTete,
    ...Array.from({ length: 10 }, (_, rang) =>
      rangee(
        407 + rang * 61,
        [1 + rang, 1 + rang, 6 + rang * 2] as const,
        [31 + rang, 31 + rang, 66 + rang * 2] as const,
      ),
    ).flat(),
  ];

  it("trouve deux panneaux de trois colonnes, et non six colonnes", () => {
    const lignes = lignesDeMots(deuxPanneaux);
    const panneaux = panneauxDeColonnes(lignes, colonnesDeNombres(lignes));
    expect(panneaux.length, "deux panneaux").toBe(2);
    expect(panneaux.map((panneau) => panneau.length), "trois colonnes chacun").toEqual([3, 3]);
  });

  it("rend une rangée par enregistrement, et non une rangée pour deux", () => {
    const table = lireLaTable(deuxPanneaux, DOUZE);
    expect(table.panneaux).toBe(2);
    expect(table.colonnes.length, "une rangée porte trois cellules, pas six").toBe(3);
    // Dix rangées à gauche, dix à droite : vingt enregistrements, pas dix rangées de six cellules.
    expect(table.utilisables.length).toBe(20);
    const valeurs = table.utilisables.map((place) => table.rangees[place]!.cellules);
    expect(valeurs, "le premier enregistrement du panneau gauche").toContainEqual([1, 1, 6]);
    expect(valeurs, "et le premier du panneau droit, intact").toContainEqual([31, 31, 66]);
  });

  it("ne prête à un panneau que l'intitulé qui est le sien", () => {
    const table = lireLaTable(deuxPanneaux, DOUZE);
    // Sans borne à gauche, l'intitulé du panneau droit ramassait tout le panneau gauche.
    for (const place of table.utilisables)
      expect(table.rangees[place]!.intitule, "un seul intitulé par rangée").toBe("Workout");
  });

  it("refuse de découper une géométrie périodique que le document ne déclare pas", () => {
    // Même géométrie, même périodicité des écarts — mais aucune ligne ne répète ses libellés.
    // Une périodicité peut arriver par hasard ; couper alors inventerait des enregistrements.
    const sansEnTete = deuxPanneaux.filter((mot) => mot.y !== 268);
    const lignes = lignesDeMots(sansEnTete);
    const panneaux = panneauxDeColonnes(lignes, colonnesDeNombres(lignes));
    expect(panneaux.length, "un seul panneau : le document ne dit pas qu'il y en a deux").toBe(1);
    expect(lireLaTable(sansEnTete, DOUZE).panneaux).toBe(1);
  });

  it("ne voit qu'un panneau dans une table ordinaire à deux colonnes", () => {
    const ordinaire = table(Array.from({ length: 8 }, (_, rang) => [rang + 1, 6 + rang * 2] as const));
    const lignes = lignesDeMots(ordinaire);
    expect(panneauxDeColonnes(lignes, colonnesDeNombres(lignes)).length).toBe(1);
    expect(lireLaTable(ordinaire, DOUZE).panneaux).toBe(1);
  });
});
