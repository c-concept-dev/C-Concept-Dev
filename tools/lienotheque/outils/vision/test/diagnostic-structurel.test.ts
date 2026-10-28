import { ModeleStructurelPropose, ModeleStructurelValide, type ZoneNormalisee } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { describe, expect, it } from "vitest";
import {
  calibrerStructure,
  compilerRecetteStructurelle,
  confronterPagesTemoins,
  detecterLecturesLocales,
  validerStructure,
} from "../src/index.js";

const DOCUMENT = "a".repeat(64);
const image = (boites: readonly { x: number; y: number; l: number; h: number }[]): ImageGrise => {
  const largeur = 1000;
  const hauteur = 1400;
  const pixels = new Uint8Array(largeur * hauteur).fill(255);
  for (const boite of boites) {
    for (let x = boite.x; x < boite.x + boite.l; x += 1) {
      pixels[boite.y * largeur + x] = 0;
      pixels[(boite.y + boite.h - 1) * largeur + x] = 0;
    }
    for (let y = boite.y; y < boite.y + boite.h; y += 1) {
      pixels[y * largeur + boite.x] = 0;
      pixels[y * largeur + boite.x + boite.l - 1] = 0;
    }
  }
  return { largeur, hauteur, pixels };
};

const proposition = () =>
  ModeleStructurelPropose.parse({
    etat: "propose",
    document: DOCUMENT,
    pagesObservees: [7, 19],
    geometrie: { orientation: "portrait", doublePage: false },
    lectures: [
      {
        id: "pagination",
        nature: "page_imprimee",
        zone: { x: 0.7, y: 0.84, l: 0.25, h: 0.12 },
        repetition: "fixe",
        forme: "texte",
        alphabet: "chiffres",
        exemple: "12",
        confiance: 0.9,
        observations: [
          { page: 7, zone: { x: 0.86, y: 0.91, l: 0.05, h: 0.03 }, valeur: "12" },
          { page: 19, zone: { x: 0.86, y: 0.91, l: 0.05, h: 0.03 }, valeur: "24" },
        ],
      },
      {
        id: "numero-compose",
        nature: "element",
        zone: { x: 0.01, y: 0.02, l: 0.18, h: 0.94 },
        repetition: "verticale",
        forme: "rectangle",
        alphabet: "chiffres",
        exemple: "5.19",
        confiance: 0.92,
        observations: [
          { page: 7, zone: { x: 0.035, y: 0.18, l: 0.07, h: 0.025 }, valeur: "5.19" },
          { page: 19, zone: { x: 0.036, y: 0.61, l: 0.07, h: 0.025 }, valeur: "6.4" },
        ],
      },
      {
        id: "marque-repetee",
        nature: "repere",
        zone: { x: 0.09, y: 0.02, l: 0.2, h: 0.94 },
        repetition: "verticale",
        forme: "losange",
        alphabet: "chiffres",
        exemple: "20",
        confiance: 0.88,
        observations: [
          { page: 7, zone: { x: 0.12, y: 0.18, l: 0.035, h: 0.025 }, valeur: "20" },
          { page: 19, zone: { x: 0.121, y: 0.61, l: 0.035, h: 0.025 }, valeur: "78" },
        ],
      },
    ],
    relations: [{ de: "marque-repetee", vers: "numero-compose", position: "droite" }],
    inconnues: [],
  });

const pages = new Map<number, ImageGrise>([
  [
    7,
    image([
      { x: 40, y: 260, l: 62, h: 30 },
      { x: 125, y: 260, l: 32, h: 30 },
      { x: 865, y: 1275, l: 38, h: 25 },
    ]),
  ],
  [
    19,
    image([
      { x: 41, y: 855, l: 62, h: 30 },
      { x: 126, y: 855, l: 32, h: 30 },
      { x: 865, y: 1275, l: 38, h: 25 },
    ]),
  ],
]);

describe("calibrage local du modèle structurel", () => {
  it("remplace les boîtes grossières par les contours mesurés dans les pixels", () => {
    const calibre = calibrerStructure(proposition(), pages);
    const element = calibre.lectures.find((lecture) => lecture.id === "numero-compose")!;
    expect(element.observations[0]!.zone).toEqual({ x: 0.04, y: 260 / 1400, l: 0.062, h: 30 / 1400 });
    expect(element.zone.x).toBeCloseTo(0.025, 3);
    expect(element.zone.l).toBeLessThan(0.1);
  });

  it("rend exactement le même résultat à chaque exécution", () => {
    expect(calibrerStructure(proposition(), pages)).toEqual(calibrerStructure(proposition(), pages));
  });

  it("écarte une lecture secondaire sans deux contours mesurables au lieu de bloquer les autres", () => {
    const sansPagination = new Map<number, ImageGrise>([
      [
        7,
        image([
          { x: 40, y: 260, l: 62, h: 30 },
          { x: 125, y: 260, l: 32, h: 30 },
        ]),
      ],
      [
        19,
        image([
          { x: 41, y: 855, l: 62, h: 30 },
          { x: 126, y: 855, l: 32, h: 30 },
        ]),
      ],
    ]);
    const calibre = calibrerStructure(proposition(), sansPagination);
    expect(calibre.lectures.map((lecture) => lecture.id)).toEqual(["numero-compose", "marque-repetee"]);
    expect(calibre.inconnues.join(" ")).toMatch(/pagination/i);
  });
});

describe("pages témoins et compilation", () => {
  it("retrouve les structures sur une page cachée sans réutiliser les boîtes de Vision", () => {
    const calibre = calibrerStructure(proposition(), pages);
    const cachee = image([
      { x: 42, y: 560, l: 62, h: 30 },
      { x: 127, y: 560, l: 32, h: 30 },
      { x: 865, y: 1275, l: 38, h: 25 },
    ]);
    const detectees = detecterLecturesLocales(calibre, cachee);
    expect(detectees["numero-compose"]?.length).toBeGreaterThan(0);
    expect(detectees["marque-repetee"]?.length).toBeGreaterThan(0);
    expect(detectees.pagination?.length).toBeGreaterThan(0);
  });

  it("arrête la validation dès qu'une structure attendue est absente ou déplacée", () => {
    const calibre = calibrerStructure(proposition(), pages);
    const conforme: Record<string, readonly ZoneNormalisee[]> = {
      pagination: [{ x: 0.865, y: 1275 / 1400, l: 0.038, h: 25 / 1400 }],
      "numero-compose": [{ x: 0.041, y: 0.4, l: 0.062, h: 30 / 1400 }],
      "marque-repetee": [{ x: 0.126, y: 0.4, l: 0.032, h: 30 / 1400 }],
    };
    expect(confronterPagesTemoins(calibre, [{ page: 31, lectures: conforme }]).ecarts).toEqual([]);
    expect(
      confronterPagesTemoins(calibre, [{ page: 31, lectures: { ...conforme, "numero-compose": [{ x: 0.7, y: 0.4, l: 0.06, h: 0.02 }] } }])
        .ecarts,
    ).not.toEqual([]);
  });

  it("refuse de compiler une proposition et compile seulement un modèle validé", () => {
    expect(() => compilerRecetteStructurelle(proposition(), { id: "candidate", version: 1 })).toThrow(/validé/i);

    const calibre = calibrerStructure(proposition(), pages);
    const controle = confronterPagesTemoins(calibre, [
      {
        page: 31,
        lectures: {
          pagination: [{ x: 0.865, y: 1275 / 1400, l: 0.038, h: 25 / 1400 }],
          "numero-compose": [{ x: 0.041, y: 0.4, l: 0.062, h: 30 / 1400 }],
          "marque-repetee": [{ x: 0.126, y: 0.4, l: 0.032, h: 30 / 1400 }],
        },
      },
    ]);
    const valide = validerStructure(calibre, controle, true);
    expect(ModeleStructurelValide.safeParse(valide).success).toBe(true);

    const recette = compilerRecetteStructurelle(valide, { id: "candidate", version: 1 });
    const element = recette.lectures.find((lecture) => lecture.ancre === "element")!;
    expect(element).toMatchObject({
      numero: { exemple: "5.19", encadrement: "rectangle", prefixes: ["5.", "6."] },
      alphabet: "chiffres",
    });
    expect(recette.lectures.find((lecture) => lecture.ancre === "piste")).toMatchObject({
      position: "droite",
      motif: "losange_sombre_chiffres_clairs",
    });
  });

  it("compile un cartouche textuel où deux libellés portent le même numéro sans connaître leur vocabulaire", () => {
    const modele = ModeleStructurelValide.parse({
      etat: "valide",
      document: DOCUMENT,
      pagesObservees: [70, 104],
      geometrie: { orientation: "portrait", doublePage: false },
      lectures: [
        {
          id: "cartouche-repete",
          nature: "repere",
          zone: { x: 0.03, y: 0.02, l: 0.92, h: 0.2 },
          repetition: "fixe",
          forme: "rectangle",
          alphabet: "latin",
          exemple: "Workout 32 - TRACK 32",
          confiance: 0.91,
          observations: [
            { page: 70, zone: { x: 0.05, y: 0.03, l: 0.88, h: 0.18 }, valeur: "Workout 32 - TRACK 32" },
            { page: 104, zone: { x: 0.05, y: 0.03, l: 0.88, h: 0.18 }, valeur: "Workout 49 - TRACK 49" },
          ],
        },
      ],
      relations: [],
      inconnues: [],
      validation: { pagesTemoins: [50], ecarts: [], superpositionsApprouvees: true },
    });

    const recette = compilerRecetteStructurelle(modele, { id: "cartouche-repete", version: 1 });
    expect(recette.lectures).toEqual([
      expect.objectContaining({
        ancre: "element",
        zone: { type: "rectangle_rel", x: 0.03, y: 0.02, l: 0.92, h: 0.2 },
        alphabet: "chiffres",
        libelle: "Workout",
        numero: { exemple: "32" },
      }),
    ]);
    expect(recette.regles.pistes).toMatchObject({ egale_numero_element: true });
    expect(recette.regles.plusieurs_elements_par_piste).toBe(false);
  });
});
