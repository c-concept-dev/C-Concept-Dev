import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Recette } from "@lienotheque/contrats";
import {
  BROUILLON_NEUF,
  MINIMUM,
  bilanDEssai,
  borner,
  deplacer,
  entre,
  redimensionner,
  depuisRecette,
  enRecette,
  manqueALaManiere,
  versionSuivante,
  type Brouillon,
} from "../src/index.js";

/** Montrer où regarder, plutôt que taper une recette (REC-01, REC-03, REC-06, REC-07). */

const DOSSIER = join(import.meta.dirname, "../../../fixtures/recettes");
const RECETTES = readdirSync(DOSSIER)
  .filter((fichier) => fichier.endsWith(".json"))
  .map((fichier) => ({ fichier, recette: Recette.parse(JSON.parse(readFileSync(join(DOSSIER, fichier), "utf8"))) }));

/** Un brouillon complet : une zone de page, une zone d'éléments, un repère de piste. */
const COMPLET: Brouillon = {
  ...BROUILLON_NEUF,
  id: "une-maniere",
  zones: [
    { cle: "a", role: "page_imprimee", rectangle: { x: 0.8, y: 0.92, l: 0.15, h: 0.05 } },
    { cle: "b", role: "element", rectangle: { x: 0.05, y: 0.1, l: 0.08, h: 0.8 }, libelle: "Numéro" },
  ],
  piste: { position: "droite", motif: "losange_sombre_chiffres_clairs", etiquetteDisque: false },
};

describe("ce qui manque se dit, il ne se devine pas (UX-09)", () => {
  it("rien ne manque à un brouillon complet", () => {
    expect(manqueALaManiere(COMPLET)).toBeUndefined();
  });

  it("sans zone d'éléments, il n'y a rien à lire", () => {
    expect(manqueALaManiere(BROUILLON_NEUF)).toMatch(/numéro d’élément/);
  });

  it("emploie les mots de la bibliothèque quand on les lui donne (CLA-01)", () => {
    expect(manqueALaManiere(BROUILLON_NEUF, { element: "exercice", page: "feuillet" })).toMatch(
      /numéro d’exercice/,
    );
  });

  it("deux zones pour la même chose : les numéros sont tous au même endroit", () => {
    const deux = { ...COMPLET, zones: [...COMPLET.zones, { cle: "c", role: "element" as const, rectangle: { x: 0.5, y: 0.1, l: 0.1, h: 0.5 } }] };
    expect(manqueALaManiere(deux)).toMatch(/une seule zone/i);
  });

  it("une zone sans surface ne cherche nulle part", () => {
    const plate = { ...COMPLET, zones: [{ cle: "b", role: "element" as const, rectangle: { x: 0.1, y: 0.1, l: 0, h: 0.5 } }] };
    expect(manqueALaManiere(plate)).toMatch(/sans surface/);
  });
});

describe("les zones deviennent une recette que le contrat accepte (REC-01)", () => {
  it("une zone tracée devient un rectangle relatif, aux mêmes coordonnées", () => {
    const recette = enRecette(COMPLET);
    const element = recette.lectures.find((lecture) => lecture.ancre === "element")!;
    expect(element.zone).toEqual({ type: "rectangle_rel", x: 0.05, y: 0.1, l: 0.08, h: 0.8 });
  });

  it("le repère de piste ne se trace pas : il se cherche à côté de l'élément", () => {
    const piste = enRecette(COMPLET).lectures.find((lecture) => lecture.ancre === "piste");
    expect(piste).toMatchObject({ relatif_a: "element", position: "droite" });
  });

  it("un document sans repère de piste n'en fait pas chercher : on ne devine pas ce qui n'est pas écrit", () => {
    const { piste: _sans, ...sansPiste } = COMPLET;
    const recette = enRecette(sansPiste);
    expect(recette.lectures.some((lecture) => lecture.ancre === "piste")).toBe(false);
    expect(recette.regles.pistes).toBeUndefined();
  });

  it("refuse d'écrire une recette d'un brouillon incomplet, en disant ce qui manque", () => {
    expect(() => enRecette(BROUILLON_NEUF)).toThrow(/numéro d’élément/);
  });
});

describe("le va-et-vient : rouvrir puis enregistrer n'abîme rien", () => {
  it("un brouillon rend le même brouillon après l'aller-retour", () => {
    expect(depuisRecette(enRecette(COMPLET))).toEqual({ ...COMPLET, zones: COMPLET.zones.map((zone, rang) => ({ ...zone, cle: `zone-${rang}` })) });
  });

  it("chaque recette du dépôt se rouvre et se réécrit sans rien perdre d'essentiel", () => {
    for (const { fichier, recette } of RECETTES) {
      const refaite = enRecette(depuisRecette(recette));
      expect(refaite.id, fichier).toBe(recette.id);
      expect(refaite.validation, fichier).toEqual(recette.validation);
      expect(refaite.preparation.double_page, fichier).toBe(recette.preparation.double_page);
      expect(refaite.lectures.map((l) => l.ancre), fichier).toEqual(recette.lectures.map((l) => l.ancre));
    }
  });

  it("une zone décrite par un bord revient en rectangle qu'on peut déplacer", () => {
    const parBord = Recette.parse({
      ...RECETTES[0]!.recette,
      lectures: [
        { ancre: "page_imprimee", zone: { type: "coins", bord: "bas" }, alphabet: "chiffres" },
        { ancre: "element", zone: { type: "marges_exterieures", largeur_rel: 0.25 }, hauteur_rel: { min: 0.012, max: 0.04 }, alphabet: "chiffres" },
      ],
    });
    const zones = depuisRecette(parBord).zones;
    expect(zones[0]!.rectangle.h).toBeGreaterThan(0);
    expect(zones[1]!.rectangle.l).toBe(0.25);
  });
});

describe("une manière de lire corrigée est une version de plus (REC-03, REC-06)", () => {
  it("monte d'un cran et dit de laquelle elle dérive", () => {
    const suivante = versionSuivante({ ...COMPLET, version: 2 });
    expect(suivante.version).toBe(3);
    expect(suivante.derivee).toEqual({ id: "une-maniere", version: 2 });
    expect(enRecette(suivante).derivee_de).toEqual({ id: "une-maniere", version: 2 });
  });

  it("une première version ne dérive de rien", () => {
    expect(enRecette(COMPLET).derivee_de).toBeNull();
  });
});

describe("la géométrie des zones vit ici, et non dans l'écran", () => {
  const CARRE = { x: 0.4, y: 0.4, l: 0.2, h: 0.2 };

  it("une zone poussée contre le bord s'y arrête, elle ne sort pas", () => {
    expect(deplacer(CARRE, -1, 0)).toEqual({ x: 0, y: 0.4, l: 0.2, h: 0.2 });
    expect(deplacer(CARRE, 1, 1)).toEqual({ x: 0.8, y: 0.8, l: 0.2, h: 0.2 });
  });

  it("buter contre le bord arrête le geste, il ne l'annule pas", () => {
    const pousse = deplacer(CARRE, -1, 0.1);
    expect(pousse.x).toBe(0);
    expect(pousse.y).toBeCloseTo(0.5, 10);
  });

  it("un coin tiré au-delà du coin opposé retourne la zone au lieu de refuser le geste", () => {
    const retourne = redimensionner(CARRE, "se", -0.5, -0.5);
    expect(retourne.l).toBeGreaterThan(0);
    expect(retourne.h).toBeGreaterThan(0);
    expect(retourne.x).toBeLessThan(CARRE.x);
  });

  it("agrandir par le coin haut-gauche garde le coin bas-droit en place", () => {
    const agrandi = redimensionner(CARRE, "no", -0.1, -0.1);
    expect(agrandi.x).toBeCloseTo(0.3, 10);
    expect(agrandi.x + agrandi.l).toBeCloseTo(0.6, 10);
  });

  it("une zone ne descend jamais sous la plus petite taille qui ait un sens", () => {
    expect(redimensionner(CARRE, "se", -1, -1).l).toBeGreaterThanOrEqual(MINIMUM);
    expect(entre({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }).h).toBeGreaterThanOrEqual(MINIMUM);
  });

  it("le rectangle tracé est le même dans les deux sens", () => {
    expect(entre({ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.3 })).toEqual(entre({ x: 0.6, y: 0.3 }, { x: 0.2, y: 0.8 }));
  });

  it("une zone bornée reste une zone que le contrat accepte", () => {
    const extreme = borner({ x: 2, y: -1, l: 5, h: 5 });
    const avec = enRecette({ ...COMPLET, zones: [{ cle: "b", role: "element", rectangle: extreme }] });
    expect(avec.lectures[0]?.ancre).toBe("element");
  });
});

describe("ce qu'un essai a donné se lit page par page (REC-07)", () => {
  const VUE = {
    pages: [
      { numero: 1, elements: [{ numero: "2.1", aVerifier: false }, { numero: "2.2", aVerifier: true }] },
      { numero: 2, elements: [] },
      { numero: 3, elements: [{ numero: "2.3", aVerifier: false }] },
    ],
  };

  it("compte ce qui a été lu, et dit combien de pages n'ont rien rendu", () => {
    const bilan = bilanDEssai(VUE);
    expect(bilan.lus).toBe(3);
    expect(bilan.muettes).toBe(1);
  });

  it("garde les numéros tels qu'ils ont été lus, et dans l'ordre des pages", () => {
    expect(bilanDEssai(VUE).pages.map((page) => page.elements)).toEqual([["2.1", "2.2"], [], ["2.3"]]);
  });

  it("compte les doutes par page : un total cacherait une page muette au milieu de neuf bonnes", () => {
    expect(bilanDEssai(VUE).pages.map((page) => page.aVerifier)).toEqual([1, 0, 0]);
  });
});

describe("la forme d'un numéro se donne par l'exemple (REC-01, REC-07)", () => {
  it("part absente : un numéro est un nombre, et rien ne change pour ce qui était déjà lu", () => {
    expect(enRecette(COMPLET).lectures.find((l) => l.ancre === "element")?.numero).toBeUndefined();
  });

  it("l'exemple voyage jusqu'à la recette, débarrassé de ses espaces", () => {
    const avec = enRecette({ ...COMPLET, exempleDeNumero: "  2.46 " });
    expect(avec.lectures.find((l) => l.ancre === "element")?.numero).toEqual({ exemple: "2.46" });
  });

  it("revient tel quel quand on rouvre la recette", () => {
    const avec = { ...COMPLET, exempleDeNumero: "2.46" };
    expect(depuisRecette(enRecette(avec)).exempleDeNumero).toBe("2.46");
  });

  it("un exemple sans chiffre n'en est pas un, et on le dit", () => {
    expect(manqueALaManiere({ ...COMPLET, exempleDeNumero: "abc" })).toMatch(/aucun chiffre/);
  });

  it("un exemple vide vaut l'absence : on ne force personne à en écrire un", () => {
    expect(manqueALaManiere({ ...COMPLET, exempleDeNumero: "   " })).toBeUndefined();
  });
});

describe("on trace sur la page telle qu'elle est montrée", () => {
  it("une manière de lire neuve ne redresse pas : redresser tournerait la page sous le tracé", () => {
    expect(BROUILLON_NEUF.redressement).toBe("aucun");
    expect(enRecette({ ...COMPLET, redressement: BROUILLON_NEUF.redressement }).preparation.redressement).toBe("aucun");
  });

  it("une recette qui redresse se rouvre telle quelle : on ne la corrige pas dans son dos", () => {
    const avec = enRecette({ ...COMPLET, redressement: "auto" });
    expect(depuisRecette(avec).redressement).toBe("auto");
  });
});
