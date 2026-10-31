import { describe, expect, it } from "vitest";
import { Observation } from "@lienotheque/contrats";
import {
  NUMEROTATION_PROBABLE,
  allureDeLaSuite,
  borneDeNumerotation,
  partDeNumerotation,
  observationsDesMarques,
  zonesAExaminer,
  zonesRecurrentes,
  type FormeObservee,
} from "../src/index.js";

/** Trouver où sont les marques, sans manière de lire (OUT-10).
 *
 *  Les deux régularités que le socle doit savoir reconnaître, les quatre pièges où il ne doit pas
 *  tomber — grain de numérisation, bloc de texte, forme qui ne revient pas, tailles inégales — et
 *  le piège qui l'a réellement fait échouer : une marque posée juste à côté de son libellé.
 */

const forme = (page: number, x: number, y: number, taille = 0.012): FormeObservee => ({
  page,
  x,
  y,
  l: taille,
  h: taille,
});

describe("une marque qui revient au même endroit (OUT-10)", () => {
  it("la trouve, et dit sur combien de pages", () => {
    const formes = [1, 2, 3, 4, 5, 6].map((page) => forme(page, 0.9, 0.95));
    const [zone] = zonesRecurrentes(formes, 6);
    expect(zone?.repetition).toBe("fixe");
    expect(zone?.pages).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ne la retient pas si elle ne revient que sur une page sur quatre", () => {
    const formes = [forme(1, 0.9, 0.95), forme(2, 0.9, 0.95)];
    expect(zonesRecurrentes(formes, 8), "deux pages sur huit n’est pas une régularité").toEqual([]);
  });
});

describe("une marque qui descend la page, une fois par élément (OUT-10)", () => {
  /** Le cas réel : une marque dans la marge, répétée à chaque élément. */
  const enColonne: FormeObservee[] = [];
  for (const page of [1, 2, 3, 4]) for (const y of [0.2, 0.4, 0.6, 0.8]) enColonne.push(forme(page, 0.07, y));

  it("la reconnaît comme verticale, et ne la coupe pas en quatre endroits", () => {
    const zones = zonesRecurrentes(enColonne, 4);
    expect(zones).toHaveLength(1);
    expect(zones[0]?.repetition).toBe("verticale");
    expect(zones[0]?.apparitions).toHaveLength(16);
  });

  it("rend une boîte qui couvre toute la bande où la marque apparaît", () => {
    const [zone] = zonesRecurrentes(enColonne, 4);
    expect(zone!.y).toBeCloseTo(0.2, 2);
    expect(zone!.y + zone!.h, "du premier au dernier").toBeCloseTo(0.812, 2);
  });
});

describe("une marque collée à son libellé (OUT-10)", () => {
  /** Le piège qui a réellement fait échouer la première version, mesuré sur les vraies pages de
   *  F3 : par élément, une marque de 4,3 % × 3,2 % à 18 % de la largeur, et dix lettres de 0,6 %
   *  à 1 % de 8 % à 17 %. Groupées par abscisse voisine, les onze formes se soudent en une bande
   *  de 10 % de large dont les tailles vont du simple au septuple — et la marque disparaît. */
  const commeF3: FormeObservee[] = [];
  for (const page of [1, 2, 3, 4]) {
    for (const y of [0.05, 0.28, 0.52, 0.76]) {
      commeF3.push({ page, x: 0.18, y, l: 0.043, h: 0.032 });
      for (let lettre = 0; lettre < 10; lettre += 1)
        commeF3.push({ page, x: 0.08 + lettre * 0.009, y: y + 0.01, l: 0.008, h: 0.009 });
    }
  }

  it("rend la marque à sa propre taille, pas une bande qui l’englobe avec le libellé", () => {
    const zones = zonesRecurrentes(commeF3, 4);
    const marque = zones.find((zone) => zone.taille.l > 0.02);
    expect(marque, "la marque est trouvée, distincte des lettres").toBeDefined();
    expect(marque!.taille.l, "à sa propre taille").toBeCloseTo(0.043, 3);
    expect(marque!.l, "sa boîte ne traverse pas la marge").toBeLessThan(0.06);
    expect(marque!.repetition).toBe("verticale");
    expect(marque!.apparitions, "une fois par élément, sur quatre pages").toHaveLength(16);
  });

  it("ne confond pas la marque avec les lettres de son libellé", () => {
    for (const zone of zonesRecurrentes(commeF3, 4))
      expect(zone.taille.l, "aucune zone ne mélange deux tailles").not.toBeCloseTo(0.025, 2);
  });

  /** Le second défaut, trouvé par la même mesure : la marque passe **après** les lettres au tri,
   *  parce qu'elle apparaît moins souvent qu'elles. Un plafond sur le nombre de zones proposées
   *  l'écarte donc exactement elle. Mesuré sur 29 pages réelles : la marque est cinquième sur six. */
  it("ne laisse pas un plafond écarter la marque parce qu’elle apparaît moins que les lettres", () => {
    const zones = zonesRecurrentes(commeF3, 4);
    const marque = zones.findIndex((zone) => zone.taille.l > 0.02);
    expect(marque, "elle n’est pas première au tri").toBeGreaterThan(0);
    expect(
      zonesAExaminer(zones).some((zone) => zone.taille.l > 0.02),
      "et elle est tout de même proposée à la lecture",
    ).toBe(true);
    expect(zonesAExaminer(zones), "sans plafond, toutes les zones passent").toHaveLength(zones.length);
  });
});

describe("ce qu’il doit ignorer (OUT-10)", () => {
  it("le grain de numérisation : trop petit pour désigner quoi que ce soit", () => {
    const grain = [1, 2, 3, 4].map((page) => ({ ...forme(page, 0.5, 0.5), l: 0.002, h: 0.002 }));
    expect(zonesRecurrentes(grain, 4)).toEqual([]);
  });

  it("un bloc de texte : trop grand pour être un repère", () => {
    const bloc = [1, 2, 3, 4].map((page) => ({ ...forme(page, 0.1, 0.1), l: 0.8, h: 0.4 }));
    expect(zonesRecurrentes(bloc, 4)).toEqual([]);
  });

  it("une forme qui ne revient pas, si grosse soit-elle", () => {
    const unique = [forme(1, 0.3, 0.3), forme(2, 0.7, 0.7), forme(3, 0.5, 0.1)];
    expect(zonesRecurrentes(unique, 3)).toEqual([]);
  });

  it("des tailles qui vont du simple au quadruple font deux signes, pas un seul instable", () => {
    const inegales = [
      forme(1, 0.5, 0.2, 0.01),
      forme(2, 0.5, 0.2, 0.01),
      forme(3, 0.5, 0.2, 0.038),
      forme(4, 0.5, 0.2, 0.04),
    ];
    const zones = zonesRecurrentes(inegales, 4);
    expect(zones, "deux signes distincts").toHaveLength(2);
    for (const zone of zones)
      expect(zone.pages.length, "et aucun ne prétend couvrir les quatre pages").toBe(2);
  });
});

describe("il compte les pages regardées, pas celles où il a trouvé (OUT-10)", () => {
  it("quatre pages sur six est une régularité, quatre sur deux cents n’en est pas une", () => {
    const quatre = [1, 2, 3, 4].map((page) => forme(page, 0.9, 0.95));
    expect(zonesRecurrentes(quatre, 6).length).toBeGreaterThan(0);
    expect(zonesRecurrentes(quatre, 200), "compter les trouvailles fausserait dans le sens rassurant").toEqual([]);
  });

  it("ne rend rien quand on n’a regardé aucune page", () => {
    expect(zonesRecurrentes([forme(1, 0.5, 0.5)], 0)).toEqual([]);
  });
});

describe("ce qu’il en dit (OUT-10)", () => {
  it("chaque observation suit le contrat, dit où regarder et à quelle taille", () => {
    const formes = [1, 2, 3, 4].map((page) => forme(page, 0.07, 0.3));
    const observations = observationsDesMarques(zonesAExaminer(zonesRecurrentes(formes, 4)), 4);
    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      expect(() => Observation.parse(observation)).not.toThrow();
      expect(observation.ou).toMatch(/% de la largeur/);
      expect(observation.constat, "la taille du signe est dite").toMatch(/% de la page revient/);
    }
  });

  it("dit aussi quand il n’a rien vu, au lieu de se taire", () => {
    const [observation] = observationsDesMarques([], 12);
    expect(observation?.constat).toMatch(/Aucune forme sombre ne revient/);
    expect(observation?.constat).toMatch(/12 pages/);
  });
});

describe("l'allure d'une suite de lectures (REC-02, OUT-10)", () => {
  it("tient une numérotation qui monte pour une numérotation", () => {
    // La suite relevée sur le témoin, à l'endroit qui porte vraiment la marque.
    const allure = allureDeLaSuite([5, 3, 15, 23, 29, 43, 52, 58, 64, 72, 78, 85]);
    expect(allure.variete).toBe(1);
    expect(allure.avance).toBeCloseTo(10 / 12, 2);
  });

  it("ne tient pas pour une numérotation un même chiffre lu partout", () => {
    // Ce que la reconnaissance rend dans une forme de notation : toujours la même valeur.
    const allure = allureDeLaSuite([1, 7, 7, 7, undefined, 7, undefined, 7, 7, 7, 7, undefined]);
    // Comparée à une suite qui monte vraiment, aux mêmes endroits lus : même avance, donc
    // l'avance ne les sépare pas. C'est la variété qui le fait, et elle seule.
    const quiMonte = allureDeLaSuite([1, 2, 3, 4, undefined, 5, undefined, 6, 7, 8, 9, undefined]);
    expect(allure.avance, "elle ne recule jamais, et pourtant elle ne numérote rien").toBe(
      quiMonte.avance,
    );
    expect(allure.variete).toBeLessThan(0.3);
  });

  it("ne tient pas pour une numérotation des valeurs variées mais en désordre", () => {
    const allure = allureDeLaSuite([14, 4, 2, 4, undefined, 4, 6, 4, 7]);
    expect(allure.variete, "cinq valeurs sur huit lectures").toBeGreaterThan(0.5);
    expect(allure.avance, "mais elle recule une fois sur deux").toBeLessThan(0.75);
  });

  it("compte un numéro qui court sur deux pages comme une avance, non un recul", () => {
    expect(allureDeLaSuite([4, 5, 5, 6, 7]).avance).toBe(allureDeLaSuite([4, 5, 6, 7, 8]).avance);
  });

  it("ne conclut rien d'une seule lecture", () => {
    expect(allureDeLaSuite([undefined, 12, undefined])).toEqual({
      lues: 1,
      distinctes: 1,
      variete: 1,
      avance: 0,
    });
  });

  it("ne conclut rien d'aucune lecture", () => {
    expect(allureDeLaSuite([undefined, undefined])).toEqual({ lues: 0, distinctes: 0, variete: 0, avance: 0 });
  });
});

describe("reconnaître une numérotation plutôt qu'une forme (REC-02, OUT-10)", () => {
  /** Les suites relevées sur l'éventail d'essai le 30 octobre 2026. */
  const relevees = {
    marque: [5, 3, 15, 23, 29, 43, 52, 58, 64, 72, 78, 85],
    noteEnSept: [7, 7, 7, 7, undefined, 7, undefined, 7, 7, 7, 7, undefined],
    noteBruyante: [4, 1, 7, 1, undefined, 7, 7, 7, 7, 1, 4, 7],
    quiLitAPeine: [undefined, 7, undefined, undefined, undefined, undefined, 6, 4, undefined, undefined, undefined, undefined],
  } as const;

  it("tient la marque pour une numérotation", () => {
    expect(partDeNumerotation(allureDeLaSuite(relevees.marque), 12)).toBeGreaterThan(NUMEROTATION_PROBABLE);
  });

  it("ne tient pas pour une numérotation une forme que la reconnaissance lit toujours pareil", () => {
    expect(partDeNumerotation(allureDeLaSuite(relevees.noteEnSept), 12)).toBeLessThan(NUMEROTATION_PROBABLE);
    expect(partDeNumerotation(allureDeLaSuite(relevees.noteBruyante), 12)).toBeLessThan(NUMEROTATION_PROBABLE);
  });

  it("ne tient pas pour une numérotation un endroit qui ne se lit presque pas, même varié", () => {
    const allure = allureDeLaSuite(relevees.quiLitAPeine);
    expect(allure.variete, "trois lectures, trois valeurs").toBe(1);
    expect(partDeNumerotation(allure, 12), "et pourtant il ne désigne rien").toBeLessThan(NUMEROTATION_PROBABLE);
  });

  it("classe la marque loin devant tous les autres endroits du même document", () => {
    const marque = partDeNumerotation(allureDeLaSuite(relevees.marque), 12);
    const autres = [relevees.noteEnSept, relevees.noteBruyante, relevees.quiLitAPeine].map((suite) =>
      partDeNumerotation(allureDeLaSuite(suite), 12),
    );
    expect(marque, "plus du double du meilleur imposteur").toBeGreaterThan(Math.max(...autres) * 2);
  });

  it("ne rend rien quand rien n'a été regardé", () => {
    expect(partDeNumerotation(allureDeLaSuite([]), 0)).toBe(0);
  });
});

describe("l'avance est comptée sur ses occasions de reculer (REC-02, OUT-10)", () => {
  it("ne laisse pas un unique couple valoir une régularité entière (REC-02)", () => {
    // Deux lectures, un seul couple : « ne recule pas » est un tirage à pile ou face.
    expect(allureDeLaSuite([3, 8]).avance).toBe(0.5);
    // Onze couples sans recul : la même affirmation, mais onze fois éprouvée.
    expect(allureDeLaSuite([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).avance).toBeCloseTo(11 / 12, 3);
  });

  it("tient une lecture unique pour une conséquence, non pour un cas à part (REC-02)", () => {
    // Zéro couple donne 0 / 1 : rien à écrire pour l'obtenir.
    expect(allureDeLaSuite([7]).avance).toBe(0);
    expect(allureDeLaSuite([7, undefined, undefined]).avance).toBe(0);
  });

  it("met hors de portée du plancher un endroit lu trois fois sur six (REC-02)", () => {
    // La ligne plate du bord de la page, relevée le 30 octobre 2026 : trois lectures distinctes
    // qui ne reculent pas, sur six apparitions regardées. Elle atteignait exactement 0,50.
    const allure = allureDeLaSuite([2, undefined, 5, undefined, 9, undefined]);
    expect(allure.avance).toBeCloseTo(2 / 3, 3);
    expect(partDeNumerotation(allure, 6)).toBeLessThan(NUMEROTATION_PROBABLE);
  });
});

describe("la borne qui permet d'abandonner un endroit sans rien parier (REC-02, OUT-10)", () => {
  /** Les suites sur lesquelles la garantie est éprouvée. Les deux dernières sont les lectures
   *  réellement obtenues sur deux documents du corpus, dont l'une porte quatre apparitions
   *  muettes avant la première lisible : c'est le cas qui disqualifie tout jugement sur un
   *  échantillon réduit, et celui que cette borne doit traverser sans broncher. */
  const suites: readonly (number | undefined)[][] = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
    [undefined, undefined, 7, 7, undefined, 7, undefined, undefined, undefined, 5, undefined, 1],
    [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    [5, 3, 15, 23, 29, 43, 52, 58, 64, 72, 78, 85],
    [undefined, undefined, undefined, undefined, 9, 10, 38, 39, 41, 42, 43, 77],
  ];

  it("ne sous-estime jamais la note finale, à aucun moment de la lecture (REC-02)", () => {
    // La seule propriété qui compte : si la borne passait un instant sous la note finale, on
    // abandonnerait un endroit qui aurait qualifié — et ce serait une lecture juste perdue sans
    // que rien ne le dise. Éprouvé sur chaque préfixe de chaque suite, et non sur un cas choisi.
    for (const suite of suites) {
      const finale = partDeNumerotation(allureDeLaSuite(suite), suite.length);
      for (let lues = 1; lues <= suite.length; lues += 1)
        expect(
          borneDeNumerotation(suite.slice(0, lues), suite.length),
          `après ${lues} lecture(s) de ${JSON.stringify(suite)}`,
        ).toBeGreaterThanOrEqual(finale - 1e-9);
    }
  });

  it("vaut exactement la note quand plus rien n'est inconnu (REC-02)", () => {
    // Trop lâche à la fin, elle n'arrêterait jamais rien : la borne doit se refermer sur la note.
    for (const suite of suites)
      expect(borneDeNumerotation(suite, suite.length)).toBeCloseTo(
        partDeNumerotation(allureDeLaSuite(suite), suite.length),
        9,
      );
  });

  it("tombe assez tôt pour que l'abandon serve à quelque chose (REC-02)", () => {
    // Une forme de notation lue du même chiffre partout : la borne la condamne à la septième
    // lecture, cinq avant le terme. C'est là qu'est l'économie, et elle est prouvée, pas parieuse.
    const notation = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    expect(borneDeNumerotation(notation.slice(0, 6), 12)).toBeGreaterThanOrEqual(NUMEROTATION_PROBABLE);
    expect(borneDeNumerotation(notation.slice(0, 7), 12)).toBeLessThan(NUMEROTATION_PROBABLE);
    // Un endroit dont les six premières apparitions sont muettes ne peut plus atteindre le seuil,
    // même si les six dernières étaient parfaites : six lectures suffisent à le prouver.
    expect(borneDeNumerotation(Array.from({ length: 6 }, () => undefined), 12)).toBeLessThan(NUMEROTATION_PROBABLE);
  });

  it("garde sa chance à l'endroit dont les premières apparitions sont muettes (REC-02)", () => {
    // Le gagnant mesuré sur un document réel : quatre apparitions muettes, puis une numérotation
    // franche. Aucun abandon ne doit survenir avant la fin, puisqu'il finit par qualifier.
    const tardif = [undefined, undefined, undefined, undefined, 9, 10, 38, 39, 41, 42, 43, 77];
    for (let lues = 1; lues <= tardif.length; lues += 1)
      expect(borneDeNumerotation(tardif.slice(0, lues), 12), `après ${lues} lecture(s)`).toBeGreaterThanOrEqual(
        NUMEROTATION_PROBABLE,
      );
  });
});
